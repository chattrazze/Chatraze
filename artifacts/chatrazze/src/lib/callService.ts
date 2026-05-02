import { supabase } from "./supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type CallKind = "voice" | "video";

export interface CallSignal {
  type: "offer" | "answer" | "ice" | "hangup" | "decline" | "notify";
  callId: string;
  from: string;
  fromName: string;
  to: string;
  kind: CallKind;
  sdp?: RTCSessionDescriptionInit;
  ice?: RTCIceCandidateInit;
}

export const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    // Google STUN
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    // Cloudflare STUN
    { urls: "stun:stun.cloudflare.com:3478" },
    // Twilio STUN
    { urls: "stun:global.stun.twilio.com:3478" },
    // Open Relay TURN — multiple transports for NAT traversal
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
        "turns:openrelay.metered.ca:443",
        "turns:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    // Metered TURN (free tier backup)
    {
      urls: [
        "turn:a.relay.metered.ca:80",
        "turn:a.relay.metered.ca:80?transport=tcp",
        "turn:a.relay.metered.ca:443",
        "turns:a.relay.metered.ca:443",
      ],
      username: "e49d2fa27b0dd37ddb6a0b15",
      credential: "OD0HHqcCpfxkS0k3",
    },
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: "all",
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

// ─── Singleton channel ─────────────────────────────────────────────────────
let channel: RealtimeChannel | null = null;
let channelReady = false;
const pendingQueue: CallSignal[] = [];
const signalHandlers: Array<(sig: CallSignal) => void> = [];

function ensureChannel() {
  if (channel) return;
  channel = supabase.channel("chatrazze:calls:v3", {
    config: { broadcast: { self: false, ack: false } },
  });

  channel
    .on("broadcast", { event: "signal" }, ({ payload }) => {
      const sig = payload as CallSignal;
      // تأكد من وجود الحقول الأساسية
      if (!sig.type || !sig.callId || !sig.from || !sig.to) return;
      signalHandlers.forEach((h) => h(sig));
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channelReady = true;
        while (pendingQueue.length > 0) {
          const sig = pendingQueue.shift()!;
          channel?.send({ type: "broadcast", event: "signal", payload: sig }).catch(() => {});
        }
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
        channelReady = false;
        channel = null;
        setTimeout(() => ensureChannel(), 2000);
      }
    });
}

export function subscribeToCallPresence(onSignal: (sig: CallSignal) => void): () => void {
  ensureChannel();
  signalHandlers.push(onSignal);
  return () => {
    const idx = signalHandlers.indexOf(onSignal);
    if (idx >= 0) signalHandlers.splice(idx, 1);
  };
}

export async function broadcastSignal(signal: CallSignal): Promise<void> {
  ensureChannel();
  if (!channelReady || !channel) {
    pendingQueue.push(signal);
    return;
  }
  try {
    await channel.send({ type: "broadcast", event: "signal", payload: signal });
  } catch {
    pendingQueue.push(signal);
  }
}

// ─── Call history helpers ─────────────────────────────────────────────────
export interface CallRecord {
  id: string;
  peerId: string;
  peerName: string;
  kind: CallKind;
  direction: "outgoing" | "incoming" | "missed";
  at: number;
  durationSec?: number;
}

export function loadCallHistory(uid: string): CallRecord[] {
  try {
    const raw = localStorage.getItem(`chatrazze:callhistory:${uid}`);
    return raw ? (JSON.parse(raw) as CallRecord[]) : [];
  } catch { return []; }
}

export function addCallRecord(uid: string, rec: CallRecord): void {
  const history = loadCallHistory(uid);
  if (history.some((r) => r.id === rec.id)) return;
  history.unshift(rec);
  try { localStorage.setItem(`chatrazze:callhistory:${uid}`, JSON.stringify(history.slice(0, 100))); } catch {}
}

export function clearCallHistory(uid: string): void {
  localStorage.removeItem(`chatrazze:callhistory:${uid}`);
}

// ─── Ring tone generator ──────────────────────────────────────────────────
let ringCtx: AudioContext | null = null;
let ringInterval: number | null = null;

export function startRinging(kind: "incoming" | "outgoing") {
  stopRinging();
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ringCtx = new AC();
    function ring() {
      if (!ringCtx) return;
      const now = ringCtx.currentTime;
      if (kind === "incoming") {
        [0, 0.35].forEach((offset) => {
          const osc = ringCtx!.createOscillator();
          const g = ringCtx!.createGain();
          osc.connect(g); g.connect(ringCtx!.destination);
          osc.type = "sine"; osc.frequency.value = 440;
          g.gain.setValueAtTime(0, now + offset);
          g.gain.linearRampToValueAtTime(0.5, now + offset + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.3);
          osc.start(now + offset); osc.stop(now + offset + 0.35);
        });
      } else {
        const osc = ringCtx.createOscillator();
        const g   = ringCtx.createGain();
        osc.connect(g); g.connect(ringCtx.destination);
        osc.type = "sine"; osc.frequency.value = 480;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.3, now + 0.05);
        g.gain.setValueAtTime(0.3, now + 0.8);
        g.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
        osc.start(now); osc.stop(now + 1.1);
      }
    }
    ring();
    ringInterval = window.setInterval(ring, kind === "incoming" ? 2500 : 3000);
  } catch {}
}

export function stopRinging() {
  if (ringInterval) { window.clearInterval(ringInterval); ringInterval = null; }
  try { ringCtx?.close(); } catch {}
  ringCtx = null;
}