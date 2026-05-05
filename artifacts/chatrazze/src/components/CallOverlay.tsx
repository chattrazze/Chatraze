import { useEffect, useRef, useState, useCallback } from "react";
import {
  Mic, MicOff,
  PhoneOff, Phone,
  Video, VideoOff,
  Volume2, VolumeX,
  EyeOff, Eye,
} from "lucide-react";
import type { WebRTCState } from "@/hooks/useWebRTC";
import { formatCallDuration } from "@/hooks/useWebRTC";
import Avatar from "@/components/Avatar";
import { useLang } from "@/hooks/useLang";

const PIP_W = 112;
const PIP_H = 144;

interface Props {
  state: WebRTCState;
  peerPhotoURL?: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onHangup: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleSpeaker: () => void;
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
  localVideoRef,
  remoteVideoRef,
  remoteAudioRef,
  remoteEarpieceRef,
}: Props) {
  const { t } = useLang();
  const { phase, peerName, kind, localStream, remoteStream, muted, cameraOff, speakerOn, elapsedSec } = state;
  const prevRemoteStream = useRef<MediaStream | null>(null);

  // PIP position & visibility
  const [pipPos, setPipPos] = useState({ x: window.innerWidth - PIP_W - 16, y: window.innerHeight - PIP_H - 100 });
  const [pipHidden, setPipHidden] = useState(false);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const moved = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    moved.current = false;
    dragOffset.current = {
      x: e.clientX - pipPos.x,
      y: e.clientY - pipPos.y,
    };
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
  }, []);

  // Audio & remote video are managed entirely by useWebRTC (routeAudio + attachRemoteStream).
  // We only ensure the remote video element plays when remoteStream arrives (video calls).
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

  // Reset PIP position & visibility when a new call starts
  useEffect(() => {
    if (phase !== "idle") {
      setPipPos({ x: window.innerWidth - PIP_W - 16, y: window.innerHeight - PIP_H - 100 });
      setPipHidden(false);
    }
  }, [phase]);

  if (phase === "idle") return null;

  const isVideo = kind === "video";
  const isConnected = phase === "connected";
  const isIncoming = phase === "incoming";
  const showPip = isVideo && isConnected;

  const statusLabel =
    phase === "calling"      ? t("callingLabel")
    : phase === "incoming"   ? (isVideo ? t("incomingVideoCall") : t("incomingVoiceCall"))
    : phase === "connecting" ? t("connectingLabel")
    : phase === "connected"  ? formatCallDuration(elapsedSec)
    : "";

  return (
    <div className="fixed inset-0 z-[999] flex flex-col overflow-hidden select-none" style={{ background: "#111" }}>
      {/* Earpiece: hidden <video playsInline> → routes to earpiece on iOS (default) */}
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

      {isVideo && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: isConnected ? 1 : 0.2 }}
        />
      )}

      {!isVideo && (
        <div className="absolute inset-0" style={{ background: "#1a1a1a" }}>
          <DoodlePattern />
        </div>
      )}

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(180deg, rgba(0,0,0,0.65) 0%, transparent 30%, transparent 55%, rgba(0,0,0,0.85) 100%)",
        }}
      />

      {/* ── Local video (always in DOM for ref) ── */}
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
      />

      {/* ── Draggable PIP ── */}
      {showPip && !pipHidden && (
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{
            position: "absolute",
            left: pipPos.x,
            top: pipPos.y,
            width: PIP_W,
            height: PIP_H,
            zIndex: 30,
            cursor: "grab",
            touchAction: "none",
          }}
        >
          <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", border: "1.5px solid rgba(255,255,255,0.2)" }}>
            {cameraOff ? (
              <div style={{ width: "100%", height: "100%", background: "#27272a", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <VideoOff size={32} color="rgba(255,255,255,0.4)" />
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
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            )}
            {/* Hide button */}
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setPipHidden(true); }}
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.55)",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "white",
              }}
            >
              <EyeOff size={13} />
            </button>
          </div>
        </div>
      )}

      {/* ── Show-PIP button when hidden ── */}
      {showPip && pipHidden && (
        <button
          onClick={() => setPipHidden(false)}
          style={{
            position: "absolute",
            left: pipPos.x,
            top: pipPos.y,
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "rgba(40,40,40,0.88)",
            border: "1.5px solid rgba(255,255,255,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "white",
            zIndex: 30,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          <Eye size={20} />
        </button>
      )}

      <div className="relative z-10 flex items-start justify-between px-5 pt-14 pb-4">
        <div className="flex flex-col items-center gap-3" />
        <div className="text-center flex-1">
          <h2 className="text-white text-xl font-semibold tracking-wide">{peerName ?? "?"}</h2>
          <p className={`mt-1 text-sm font-medium ${isConnected ? "text-green-400" : "text-white/60"}`}>
            {statusLabel}
            {isConnected && (
              <span className="inline-block w-2 h-2 ml-2 rounded-full bg-green-400 align-middle" style={{ animation: "callPulse 1.5s infinite" }} />
            )}
          </p>
        </div>
        <div className="w-10" />
      </div>

      <div className="relative z-10 flex-1 flex items-center justify-center">
        {!(isVideo && isConnected) && (
          <div className="flex flex-col items-center gap-5">
            <div
              style={{
                width: 176,
                height: 176,
                borderRadius: "50%",
                padding: 6,
                background: isIncoming
                  ? "linear-gradient(135deg, #FF7A1A, #FF4E00)"
                  : "linear-gradient(135deg, rgba(255,122,26,0.5), rgba(255,78,0,0.5))",
                animation: isIncoming ? "callPulseRing 1.8s infinite" : "none",
                boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: "3px solid rgba(0,0,0,0.3)",
                }}
              >
                <Avatar name={peerName ?? "?"} photoURL={peerPhotoURL ?? null} size={164} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="relative z-10 pb-16 px-6">
        <div
          className="flex items-center justify-around px-4 py-4 rounded-[32px]"
          style={{ background: "rgba(40,40,40,0.92)", backdropFilter: "blur(20px)" }}
        >
          {isIncoming ? (
            <>
              <RoundBtn onClick={onDecline} icon={<PhoneOff size={28} />} label={t("declineBtn")} bg="#ef4444" size={64} />
              <RoundBtn onClick={onAccept}  icon={<Phone size={28} />}    label={t("acceptBtn")}  bg="#22c55e" size={64} />
            </>
          ) : (
            <>
              {isVideo && (
                <RoundBtn
                  onClick={onToggleCamera}
                  icon={cameraOff ? <VideoOff size={22} /> : <Video size={22} />}
                  label={t("cameraBtn")}
                  bg={cameraOff ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.12)"}
                  size={56}
                />
              )}
              <RoundBtn
                onClick={onToggleSpeaker}
                icon={speakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
                label={t("speakerBtn")}
                bg={speakerOn ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.12)"}
                size={56}
              />
              <RoundBtn
                onClick={onToggleMute}
                icon={muted ? <MicOff size={22} /> : <Mic size={22} />}
                label={muted ? t("unmuteBtn") : t("muteBtn")}
                bg={muted ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.12)"}
                size={56}
              />
              <RoundBtn onClick={onHangup} icon={<PhoneOff size={26} />} label={t("endBtn")} bg="#ef4444" size={64} />
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes callPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes callPulseRing {
          0%   { box-shadow: 0 0 0 0 rgba(107,58,42,0.7); }
          70%  { box-shadow: 0 0 0 24px rgba(107,58,42,0); }
          100% { box-shadow: 0 0 0 0 rgba(107,58,42,0); }
        }
      `}</style>
    </div>
  );
}

function RoundBtn({
  onClick, icon, label, bg, size = 56,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  bg: string;
  size?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        onClick={onClick}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: bg,
          border: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: "white",
          boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
          transition: "transform 0.1s, opacity 0.1s",
        }}
        onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.93)")}
        onMouseUp={(e)   => (e.currentTarget.style.transform = "scale(1)")}
        onTouchStart={(e) => (e.currentTarget.style.transform = "scale(0.93)")}
        onTouchEnd={(e)   => (e.currentTarget.style.transform = "scale(1)")}
      >
        {icon}
      </button>
      <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>{label}</span>
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
