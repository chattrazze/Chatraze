import { useEffect, useRef, useState, useCallback } from "react";
import {
  Mic, MicOff,
  PhoneOff, Phone,
  Video, VideoOff,
  Volume2, Smartphone,
  SwitchCamera,
  ChevronDown,
} from "lucide-react";
import type { WebRTCState } from "@/hooks/useWebRTC";
import { formatCallDuration } from "@/hooks/useWebRTC";
import Avatar from "@/components/Avatar";
import { useLang } from "@/hooks/useLang";

const PIP_W = 112;
const PIP_H = 144;
const CONTROLS_HIDE_MS = 4000;

interface Props {
  state: WebRTCState;
  peerPhotoURL?: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onHangup: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleSpeaker: () => void;
  onFlipCamera: () => void;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteAudioRef: React.RefObject<HTMLAudioElement | null>;
  remoteEarpieceRef: React.RefObject<HTMLVideoElement | null>;
}

export default function CallOverlay({
  state,
  peerPhotoURL,
  onAccept,
  onDecline,
  onHangup,
  onToggleMute,
  onToggleCamera,
  onToggleSpeaker,
  onFlipCamera,
  localVideoRef,
  remoteVideoRef,
  remoteAudioRef,
  remoteEarpieceRef,
}: Props) {
  const { t } = useLang();
  const {
    phase, peerName, kind, localStream, remoteStream,
    muted, cameraOff, speakerOn, elapsedSec,
    remoteMuted, remoteCameraOff, reconnecting, facingMode,
  } = state;
  const prevRemoteStream = useRef<MediaStream | null>(null);

  // WhatsApp-like UI state
  const [minimized, setMinimized] = useState(false);       // collapse to a bar so the app can be used
  const [controlsVisible, setControlsVisible] = useState(true);
  const [bump, setBump] = useState(0);                      // restarts the auto-hide timer
  const [swapped, setSwapped] = useState(false);           // tap the small preview to swap big/small

  // PIP position
  const [pipPos, setPipPos] = useState({ x: window.innerWidth - PIP_W - 16, y: 96 });
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const moved = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    moved.current = false;
    dragOffset.current = { x: e.clientX - pipPos.x, y: e.clientY - pipPos.y };
  }, [pipPos]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    moved.current = true;
    const nx = Math.max(0, Math.min(window.innerWidth - PIP_W, e.clientX - dragOffset.current.x));
    const ny = Math.max(0, Math.min(window.innerHeight - PIP_H, e.clientY - dragOffset.current.y));
    setPipPos({ x: nx, y: ny });
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
    // A tap (no drag) on the small preview swaps the two videos
    if (!moved.current) setSwapped((s) => !s);
  }, []);

  // Audio & remote video are managed entirely by useWebRTC (routeAudio + attachRemoteStream).
  useEffect(() => {
    if (!remoteStream || remoteStream === prevRemoteStream.current) return;
    prevRemoteStream.current = remoteStream;

    const video = remoteVideoRef.current;
    if (video && video.srcObject !== remoteStream) {
      video.srcObject = remoteStream;
      video.play().catch(() => {});
    }
  }, [remoteStream, remoteVideoRef]);

  useEffect(() => {
    const vid = localVideoRef.current;
    if (!vid) return;
    if (localStream) {
      if (vid.srcObject !== localStream) {
        vid.srcObject = localStream;
        vid.muted = true;
        vid.play().catch(() => {});
      }
    } else {
      vid.srcObject = null;
    }
  }, [localStream, localVideoRef]);

  const isVideo = kind === "video";
  const isConnected = phase === "connected";
  const isIncoming = phase === "incoming";
  const showPip = isVideo && isConnected;
  const autoHide = isVideo && isConnected && !minimized;

  // Reset UI when the phase changes (e.g. incoming → connecting → connected)
  useEffect(() => {
    setControlsVisible(true);
    setSwapped(false);
    if (phase === "incoming") setMinimized(false);
  }, [phase]);

  // Auto-hide controls on video calls after a few seconds
  useEffect(() => {
    if (!autoHide || !controlsVisible) return;
    const id = window.setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
    return () => window.clearTimeout(id);
  }, [autoHide, controlsVisible, bump]);

  const touchControls = () => { setControlsVisible(true); setBump((b) => b + 1); };
  const onBackgroundTap = () => {
    if (!autoHide) return;
    setControlsVisible((v) => !v);
    setBump((b) => b + 1);
  };

  const statusLabel =
    reconnecting             ? t("reconnectingLabel")
    : phase === "calling"    ? t("callingLabel")
    : phase === "incoming"   ? (isVideo ? t("incomingVideoCall") : t("incomingVoiceCall"))
    : phase === "connecting" ? t("connectingLabel")
    : phase === "connected"  ? formatCallDuration(elapsedSec)
    : "";

  const controlsShown = !autoHide || controlsVisible;

  // Style of the two video "tiles": one fills the screen, the other is the draggable preview
  const fullStyle: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0 };
  const pipStyle: React.CSSProperties = {
    position: "absolute", left: pipPos.x, top: pipPos.y, width: PIP_W, height: PIP_H,
    zIndex: 30, cursor: "grab", touchAction: "none",
    borderRadius: 16, overflow: "hidden",
    boxShadow: "0 8px 32px rgba(0,0,0,0.6)", border: "1.5px solid rgba(255,255,255,0.25)",
  };
  const remoteIsPip = showPip && swapped;
  const localIsPip = showPip && !swapped;
  const mirrorLocal = facingMode === "user";

  const pipHandlers = {
    onPointerDown, onPointerMove, onPointerUp,
  };

  return (
    <div
      className="fixed z-[999] flex flex-col overflow-hidden select-none"
      style={
        minimized
          ? { top: 0, left: 0, right: 0, height: "calc(48px + env(safe-area-inset-top))", background: "#16a34a" }
          : { inset: 0, background: "#111" }
      }
    >
      {/* Earpiece: hidden <video playsInline> → routes to earpiece on iOS */}
      <video
        ref={remoteEarpieceRef}
        autoPlay
        playsInline
        style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
      />
      {/* Speaker: hidden <audio> → routes to loudspeaker */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        style={{ position: "absolute", width: 0, height: 0, opacity: 0 }}
      />
      {/* Local video (always in DOM for ref) */}
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
      />

      {/* ── Minimized: green "tap to return to call" bar (like WhatsApp) ── */}
      {minimized && (
        <button
          onClick={() => setMinimized(false)}
          className="flex items-center justify-center gap-2 w-full h-full text-white text-sm font-medium"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          {isVideo ? <Video size={16} /> : <Phone size={16} />}
          <span>{t("tapToReturnCall")}</span>
          <span className="opacity-90">· {reconnecting ? t("reconnectingLabel") : statusLabel}</span>
        </button>
      )}

      {/* ── Full call UI (kept mounted but hidden when minimized so video refs stay valid) ── */}
      <div className="absolute inset-0 flex flex-col" style={{ display: minimized ? "none" : "flex" }}>
        {/* Remote video tile */}
        {isVideo && (
          <div
            style={remoteIsPip ? pipStyle : fullStyle}
            {...(remoteIsPip ? pipHandlers : { onClick: onBackgroundTap })}
          >
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
              style={{ opacity: isConnected && !remoteCameraOff ? 1 : 0.2, background: "#000" }}
            />
            {/* Peer turned their camera off */}
            {isConnected && remoteCameraOff && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ background: "#1f1f22" }}>
                <Avatar name={peerName ?? "?"} photoURL={peerPhotoURL ?? null} size={remoteIsPip ? 48 : 120} />
                {!remoteIsPip && (
                  <span className="flex items-center gap-1.5 text-white/70 text-sm">
                    <VideoOff size={14} /> {t("peerCameraOff")}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Voice call background */}
        {!isVideo && (
          <div className="absolute inset-0" style={{ background: "#1a1a1a" }}>
            <DoodlePattern />
          </div>
        )}

        {/* Dark gradients for readability */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 1,
            background: "linear-gradient(180deg, rgba(0,0,0,0.65) 0%, transparent 30%, transparent 55%, rgba(0,0,0,0.85) 100%)",
            opacity: controlsShown ? 1 : 0.35,
            transition: "opacity 0.25s",
          }}
        />

        {/* Local preview tile (video calls, once connected) */}
        {showPip && (
          <div
            style={localIsPip ? pipStyle : fullStyle}
            {...(localIsPip ? pipHandlers : { onClick: onBackgroundTap })}
          >
            {cameraOff ? (
              <div className="w-full h-full flex items-center justify-center" style={{ background: "#27272a" }}>
                <VideoOff size={localIsPip ? 32 : 56} color="rgba(255,255,255,0.4)" />
              </div>
            ) : (
              <video
                autoPlay
                playsInline
                muted
                ref={(el) => {
                  if (el && localStream && el.srcObject !== localStream) {
                    el.srcObject = localStream;
                    el.play().catch(() => {});
                  }
                }}
                style={{
                  width: "100%", height: "100%", objectFit: "cover", display: "block",
                  transform: mirrorLocal ? "scaleX(-1)" : "none",
                }}
              />
            )}
          </div>
        )}

        {/* ── Header ── */}
        <div
          className="relative flex items-start justify-between px-4 pt-12 pb-4 pointer-events-none"
          style={{
            zIndex: 10,
            opacity: controlsShown ? 1 : 0,
            transition: "opacity 0.25s",
          }}
        >
          <div className="w-10 pointer-events-auto">
            {!isIncoming && (
              <button
                onClick={() => setMinimized(true)}
                aria-label={t("minimizeCall")}
                className="w-10 h-10 rounded-full flex items-center justify-center text-white"
                style={{ background: "rgba(0,0,0,0.35)" }}
                disabled={!controlsShown}
              >
                <ChevronDown size={22} />
              </button>
            )}
          </div>
          <div className="text-center flex-1 px-2">
            <h2 className="text-white text-xl font-semibold tracking-wide flex items-center justify-center gap-2">
              {peerName ?? "?"}
              {isConnected && remoteMuted && <MicOff size={16} className="text-white/80" aria-label={t("peerMuted")} />}
            </h2>
            <p className={`mt-1 text-sm font-medium ${reconnecting ? "text-amber-300" : isConnected ? "text-green-400" : "text-white/60"}`}>
              {statusLabel}
              {isConnected && !reconnecting && (
                <span className="inline-block w-2 h-2 ml-2 rounded-full bg-green-400 align-middle" style={{ animation: "callPulse 1.5s infinite" }} />
              )}
            </p>
            {isConnected && remoteMuted && (
              <p className="mt-0.5 text-xs text-white/60">{t("peerMuted")}</p>
            )}
          </div>
          <div className="w-10" />
        </div>

        {/* ── Avatar (voice calls / before video connects) ── */}
        <div className="relative flex-1 flex items-center justify-center pointer-events-none" style={{ zIndex: 5 }}>
          {!(isVideo && isConnected) && (
            <div
              style={{
                width: 176,
                height: 176,
                borderRadius: "50%",
                padding: 6,
                background: isIncoming
                  ? "linear-gradient(135deg, #FF7A1A, #FF4E00)"
                  : "linear-gradient(135deg, rgba(255,122,26,0.5), rgba(255,78,0,0.5))",
                animation: isIncoming || phase === "calling" ? "callPulseRing 1.8s infinite" : "none",
                boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
              }}
            >
              <div style={{ width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden", border: "3px solid rgba(0,0,0,0.3)" }}>
                <Avatar name={peerName ?? "?"} photoURL={peerPhotoURL ?? null} size={164} />
              </div>
            </div>
          )}
        </div>

        {/* ── Controls ── */}
        <div
          className="relative px-6"
          onClick={touchControls}
          style={{
            zIndex: 10,
            paddingBottom: "calc(env(safe-area-inset-bottom) + 40px)",
            opacity: controlsShown ? 1 : 0,
            transform: controlsShown ? "translateY(0)" : "translateY(16px)",
            pointerEvents: controlsShown ? "auto" : "none",
            transition: "opacity 0.25s, transform 0.25s",
          }}
        >
          <div
            className="flex items-center justify-around px-3 py-4 rounded-[32px]"
            style={{ background: "rgba(40,40,40,0.92)", backdropFilter: "blur(20px)" }}
          >
            {isIncoming ? (
              <>
                <RoundBtn onClick={onDecline} icon={<PhoneOff size={28} />} label={t("declineBtn")} bg="#ef4444" size={64} />
                <RoundBtn onClick={onAccept}  icon={<Phone size={28} />}    label={t("acceptBtn")}  bg="#22c55e" size={64} />
              </>
            ) : (
              <>
                <RoundBtn
                  onClick={onToggleSpeaker}
                  icon={speakerOn ? <Volume2 size={22} /> : <Smartphone size={22} />}
                  label={speakerOn ? t("speakerBtn") : t("earpieceBtn")}
                  active={speakerOn}
                />
                {isVideo && (
                  <RoundBtn
                    onClick={onToggleCamera}
                    icon={cameraOff ? <VideoOff size={22} /> : <Video size={22} />}
                    label={t("cameraBtn")}
                    active={cameraOff}
                  />
                )}
                {isVideo && (
                  <RoundBtn
                    onClick={onFlipCamera}
                    icon={<SwitchCamera size={22} />}
                    label={t("flipCameraBtn")}
                    disabled={cameraOff}
                  />
                )}
                <RoundBtn
                  onClick={onToggleMute}
                  icon={muted ? <MicOff size={22} /> : <Mic size={22} />}
                  label={muted ? t("unmuteBtn") : t("muteBtn")}
                  active={muted}
                />
                <RoundBtn onClick={onHangup} icon={<PhoneOff size={26} />} label={t("endBtn")} bg="#ef4444" solid size={60} />
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes callPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes callPulseRing {
          0%   { box-shadow: 0 0 0 0 rgba(255,122,26,0.55); }
          70%  { box-shadow: 0 0 0 24px rgba(255,122,26,0); }
          100% { box-shadow: 0 0 0 0 rgba(255,122,26,0); }
        }
      `}</style>
    </div>
  );
}

/**
 * Round call button. Toggle buttons use the WhatsApp look: translucent when off,
 * solid white with a dark icon when active. `solid` buttons (accept/decline/end) use `bg`.
 */
function RoundBtn({
  onClick, icon, label, bg, size = 52, active = false, solid = false, disabled = false,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  bg?: string;
  size?: number;
  active?: boolean;
  solid?: boolean;
  disabled?: boolean;
}) {
  const useSolid = solid || (!!bg && !active);
  const background = useSolid && bg ? bg : active ? "#ffffff" : "rgba(255,255,255,0.14)";
  const color = active && !useSolid ? "#111" : "white";
  return (
    <div className="flex flex-col items-center gap-1.5" style={{ opacity: disabled ? 0.4 : 1 }}>
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={active || undefined}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background,
          border: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: disabled ? "default" : "pointer",
          color,
          boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
          transition: "transform 0.1s, background 0.15s, color 0.15s",
        }}
        onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.92)")}
        onMouseUp={(e)   => (e.currentTarget.style.transform = "scale(1)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        onTouchStart={(e) => (e.currentTarget.style.transform = "scale(0.92)")}
        onTouchEnd={(e)   => (e.currentTarget.style.transform = "scale(1)")}
      >
        {icon}
      </button>
      <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 11 }}>{label}</span>
    </div>
  );
}

function DoodlePattern() {
  return (
    <svg
      className="absolute inset-0 w-full h-full opacity-[0.07]"
      xmlns="http://www.w3.org/2000/svg"
      style={{ pointerEvents: "none" }}
    >
      <defs>
        <pattern id="doodle" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
          <path d="M12 6 C10 6 8 8 8 10 L8 22 C8 24 10 26 12 26 L20 26 C22 26 24 24 24 22 L24 10 C24 8 22 6 20 6 Z M16 23 C15 23 14 22 14 21 C14 20 15 19 16 19 C17 19 18 20 18 21 C18 22 17 23 16 23 Z" fill="white" />
          <path d="M50 12 C48 8 42 8 42 13 C42 16 50 22 50 22 C50 22 58 16 58 13 C58 8 52 8 50 12 Z" fill="white" />
          <path d="M10 40 C10 38 12 36 14 36 L28 36 C30 36 32 38 32 40 L32 48 C32 50 30 52 28 52 L16 52 L12 56 L12 52 L14 52 C12 52 10 50 10 48 Z" fill="white" />
          <path d="M55 35 L55 48 C55 50 53 52 51 52 C49 52 47 50 47 48 C47 46 49 44 51 44 C52 44 53 44 55 43 L55 38 L62 36 L62 38 L55 40 Z" fill="white" />
          <path d="M16 60 L18 66 L24 66 L19 70 L21 76 L16 72 L11 76 L13 70 L8 66 L14 66 Z" fill="white" />
          <path d="M42 60 L42 72 L56 72 L56 60 Z M56 63 L62 60 L62 72 L56 69 Z" fill="white" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#doodle)" />
    </svg>
  );
}
