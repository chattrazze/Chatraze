import { useState, useEffect } from "react";
import { Delete, Lock } from "lucide-react";
import { useLang } from "@/hooks/useLang";
import type { AppLockHook } from "@/hooks/useAppLock";

type Mode = "unlock" | "setup-new" | "setup-confirm";

interface Props {
  lockHook: AppLockHook;
  userName?: string;
  onDone: () => void;
  initialMode?: "unlock" | "setup";
  onCancel?: () => void;
}

export default function AppLockScreen({
  lockHook,
  userName,
  onDone,
  initialMode = "unlock",
  onCancel,
}: Props) {
  const { t, dir } = useLang();
  const { verifyPIN, setupPIN, setupBiometric, authenticateWithBiometric, hasBio, bioEnabled } = lockHook;

  const [mode, setMode]       = useState<Mode>(initialMode === "setup" ? "setup-new" : "unlock");
  const [pin, setPin]         = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [firstPin, setFirstPin]     = useState("");
  const [error, setError]     = useState("");
  const [bioLoading, setBioLoading] = useState(false);
  const [shake, setShake]     = useState(false);

  const isUnlock = mode === "unlock";
  const currentPin    = mode === "setup-confirm" ? confirmPin : pin;
  const setCurrentPin = mode === "setup-confirm"
    ? (v: string) => setConfirmPin(v)
    : (v: string) => setPin(v);

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }

  useEffect(() => {
    if (isUnlock && bioEnabled && hasBio) {
      setTimeout(() => handleBiometric(), 300);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleBiometric() {
    setBioLoading(true);
    setError("");
    const ok = await authenticateWithBiometric();
    setBioLoading(false);
    if (ok) {
      onDone();
    } else {
      setError(t("biometricFailed"));
    }
  }

  async function handleDigit(d: string) {
    if (currentPin.length >= 6) return;
    const next = currentPin + d;
    setCurrentPin(next);
    setError("");

    if (next.length < 6) return;

    if (mode === "unlock") {
      const ok = await verifyPIN(next);
      if (ok) {
        onDone();
      } else {
        setError(t("wrongPasscode"));
        triggerShake();
        setTimeout(() => setCurrentPin(""), 500);
      }
    } else if (mode === "setup-new") {
      setFirstPin(next);
      setPin("");
      setTimeout(() => setMode("setup-confirm"), 300);
    } else if (mode === "setup-confirm") {
      if (next === firstPin) {
        await setupPIN(next);
        if (hasBio) await setupBiometric(userName || "user");
        onDone();
      } else {
        setError(t("passcodeMismatch"));
        triggerShake();
        setConfirmPin("");
        setTimeout(() => {
          setMode("setup-new");
          setPin("");
          setFirstPin("");
          setError("");
        }, 900);
      }
    }
  }

  function handleDelete() {
    setCurrentPin(currentPin.slice(0, -1));
    setError("");
  }

  const dots  = Array.from({ length: 6 }, (_, i) => i < currentPin.length);
  const title = mode === "unlock"
    ? t("enterPasscode")
    : mode === "setup-new"
    ? t("setPasscode")
    : t("confirmPasscode");

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center"
      style={{
        background: "linear-gradient(160deg, #0c0c18 0%, #1c0900 60%, #0c0c18 100%)",
        direction: dir,
      }}
    >
      {/* Branding */}
      <div className="flex flex-col items-center pt-16 pb-4">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg"
          style={{ background: "linear-gradient(135deg, #FF7A1A, #FF4E00)" }}
        >
          <Lock className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-white text-xl font-bold tracking-tight">Chatrazze</h1>
      </div>

      {/* PIN area — centred vertically in remaining space */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-4">
        <p className="text-white/75 text-base font-medium text-center">{title}</p>

        {/* Dots */}
        <div className={`flex gap-5 ${shake ? "animate-shake" : ""}`}>
          {dots.map((filled, i) => (
            <div
              key={i}
              className="w-3.5 h-3.5 rounded-full transition-all duration-150"
              style={{
                background: filled ? "#FF7A1A" : "rgba(255,255,255,0.18)",
                transform: filled ? "scale(1.2)" : "scale(1)",
                boxShadow: filled ? "0 0 8px rgba(255,122,26,0.6)" : "none",
              }}
            />
          ))}
        </div>

        {/* Error */}
        <p
          className="text-red-400 text-sm font-medium text-center min-h-[20px] transition-opacity"
          style={{ opacity: error ? 1 : 0 }}
        >
          {error || " "}
        </p>
      </div>

      {/* Number pad */}
      <div className="pb-14 flex flex-col items-center gap-4 w-full max-w-xs px-6">
        <div className="grid grid-cols-3 gap-3 w-full">
          {["1","2","3","4","5","6","7","8","9"].map(d => (
            <NumBtn key={d} label={d} onPress={() => handleDigit(d)} />
          ))}

          {/* Bottom row */}
          <div className="flex items-center justify-center h-18">
            {isUnlock && bioEnabled && hasBio ? (
              <button
                onClick={handleBiometric}
                disabled={bioLoading}
                className="w-16 h-16 rounded-full flex flex-col items-center justify-center gap-1 text-white/60 hover:text-white active:scale-90 transition"
              >
                {bioLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="text-2xl leading-none">🪪</span>
                    <span className="text-[9px] text-white/40">{t("useFaceId")}</span>
                  </>
                )}
              </button>
            ) : onCancel ? (
              <button
                onClick={onCancel}
                className="w-16 h-16 rounded-full flex items-center justify-center text-white/40 hover:text-white/70 active:scale-90 transition text-sm"
              >
                {t("goBack")}
              </button>
            ) : <div />}
          </div>

          <NumBtn label="0" onPress={() => handleDigit("0")} />

          <div className="flex items-center justify-center">
            <button
              onClick={handleDelete}
              className="w-16 h-16 rounded-full flex items-center justify-center text-white/60 hover:text-white active:scale-90 transition"
            >
              <Delete className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-8px); }
          40%      { transform: translateX(8px); }
          60%      { transform: translateX(-5px); }
          80%      { transform: translateX(5px); }
        }
        .animate-shake { animation: shake 0.45s ease; }
      `}</style>
    </div>
  );
}

function NumBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button
      onClick={onPress}
      className="h-16 w-full rounded-full text-white text-xl font-semibold flex items-center justify-center active:scale-90 transition-all"
      style={{
        background: "rgba(255,255,255,0.07)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {label}
    </button>
  );
}
