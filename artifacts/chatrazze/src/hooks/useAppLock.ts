import { useState, useEffect, useCallback } from "react";

async function hashPIN(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function keys(uid: string) {
  const id = uid || "anon";
  return {
    pin:     `chatrazze:applock:${id}:pinhash`,
    cred:    `chatrazze:applock:${id}:credid`,
    enabled: `chatrazze:applock:${id}:enabled`,
    bio:     `chatrazze:applock:${id}:bioenabled`,
  };
}

export function useAppLock(uid: string) {
  const k = keys(uid);

  const [enabled, setEnabled]       = useState(() => localStorage.getItem(k.enabled) === "true");
  const [bioEnabled, setBioEnabled] = useState(() => localStorage.getItem(k.bio) === "true");
  const [isLocked, setIsLocked]     = useState(() => localStorage.getItem(k.enabled) === "true");
  const [hasBio, setHasBio]         = useState(false);

  // Re-read keys when uid changes (account switch)
  useEffect(() => {
    const kk = keys(uid);
    const isEn = localStorage.getItem(kk.enabled) === "true";
    setEnabled(isEn);
    setBioEnabled(localStorage.getItem(kk.bio) === "true");
    setIsLocked(isEn);
  }, [uid]);

  useEffect(() => {
    if (typeof PublicKeyCredential !== "undefined") {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.()
        .then(setHasBio)
        .catch(() => setHasBio(false));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    function onVisibility() {
      if (document.visibilityState === "hidden") setIsLocked(true);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enabled]);

  async function setupPIN(pin: string): Promise<void> {
    const kk = keys(uid);
    const hash = await hashPIN(pin);
    localStorage.setItem(kk.pin, hash);
    localStorage.setItem(kk.enabled, "true");
    setEnabled(true);
    setIsLocked(false);
  }

  async function verifyPIN(pin: string): Promise<boolean> {
    const stored = localStorage.getItem(keys(uid).pin);
    if (!stored) return false;
    const hash = await hashPIN(pin);
    return hash === stored;
  }

  function disableAppLock(): void {
    const kk = keys(uid);
    localStorage.removeItem(kk.pin);
    localStorage.removeItem(kk.enabled);
    localStorage.removeItem(kk.cred);
    localStorage.removeItem(kk.bio);
    setEnabled(false);
    setBioEnabled(false);
    setIsLocked(false);
  }

  async function setupBiometric(userName: string): Promise<boolean> {
    try {
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: "Chatrazze" },
          user: {
            id: new TextEncoder().encode(uid || "user"),
            name: userName || "user",
            displayName: userName || "user",
          },
          pubKeyCredParams: [
            { alg: -7,   type: "public-key" },
            { alg: -257, type: "public-key" },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
          },
          timeout: 60000,
          attestation: "none",
        },
      }) as PublicKeyCredential | null;

      if (!credential) return false;

      const kk = keys(uid);
      const credId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
      localStorage.setItem(kk.cred, credId);
      localStorage.setItem(kk.bio, "true");
      setBioEnabled(true);
      return true;
    } catch {
      return false;
    }
  }

  async function authenticateWithBiometric(): Promise<boolean> {
    const credIdStr = localStorage.getItem(keys(uid).cred);
    if (!credIdStr) return false;
    try {
      const credIdBytes = Uint8Array.from(atob(credIdStr), c => c.charCodeAt(0));
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ id: credIdBytes, type: "public-key" }],
          userVerification: "required",
          timeout: 60000,
        },
      });
      if (assertion) { setIsLocked(false); return true; }
      return false;
    } catch {
      return false;
    }
  }

  const unlock = useCallback(() => setIsLocked(false), []);

  return {
    enabled,
    bioEnabled,
    hasBio,
    isLocked,
    setupPIN,
    verifyPIN,
    disableAppLock,
    setupBiometric,
    authenticateWithBiometric,
    unlock,
  };
}

export type AppLockHook = ReturnType<typeof useAppLock>;
