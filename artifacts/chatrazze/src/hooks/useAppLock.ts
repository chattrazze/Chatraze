import { useState, useEffect, useCallback } from "react";

const PIN_KEY     = "chatrazze:applock:pinhash";
const CRED_KEY    = "chatrazze:applock:credid";
const ENABLED_KEY = "chatrazze:applock:enabled";
const BIO_KEY     = "chatrazze:applock:bioenabled";

async function hashPIN(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export function useAppLock(uid: string) {
  const [enabled, setEnabled]     = useState(() => localStorage.getItem(ENABLED_KEY) === "true");
  const [bioEnabled, setBioEnabled] = useState(() => localStorage.getItem(BIO_KEY) === "true");
  const [isLocked, setIsLocked]   = useState(() => localStorage.getItem(ENABLED_KEY) === "true");
  const [hasBio, setHasBio]       = useState(false);

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
    const hash = await hashPIN(pin);
    localStorage.setItem(PIN_KEY, hash);
    localStorage.setItem(ENABLED_KEY, "true");
    setEnabled(true);
    setIsLocked(false);
  }

  async function verifyPIN(pin: string): Promise<boolean> {
    const stored = localStorage.getItem(PIN_KEY);
    if (!stored) return false;
    const hash = await hashPIN(pin);
    return hash === stored;
  }

  function disableAppLock(): void {
    localStorage.removeItem(PIN_KEY);
    localStorage.removeItem(ENABLED_KEY);
    localStorage.removeItem(CRED_KEY);
    localStorage.removeItem(BIO_KEY);
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

      const credId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
      localStorage.setItem(CRED_KEY, credId);
      localStorage.setItem(BIO_KEY, "true");
      setBioEnabled(true);
      return true;
    } catch {
      return false;
    }
  }

  async function authenticateWithBiometric(): Promise<boolean> {
    const credIdStr = localStorage.getItem(CRED_KEY);
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
