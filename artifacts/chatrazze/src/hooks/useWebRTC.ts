import { useCallback, useEffect, useRef, useState } from "react";
import {
  ICE_CONFIG,
  broadcastSignal,
  startRinging,
  stopRinging,
  type CallKind,
  type CallSignal,
} from "@/lib/callService";

export type CallPhase =
  | "idle"
  | "calling"
  | "incoming"
  | "connecting"
  | "connected"
  | "ended";

export interface WebRTCState {
  phase: CallPhase;
  callId: string | null;
  peerUid: string | null;
  peerName: string | null;
  kind: CallKind;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  speakerOn: boolean;
  elapsedSec: number;
  /** Peer muted their mic / turned their camera off (received via "media" signal). */
  remoteMuted: boolean;
  remoteCameraOff: boolean;
  /** Network dropped temporarily; WebRTC is trying to recover. */
  reconnecting: boolean;
  facingMode: "user" | "environment";
}

// WhatsApp-style timings
const NO_ANSWER_TIMEOUT_MS = 45_000;   // caller gives up if nobody answers
const INCOMING_STALE_MS = 12_000;      // callee stops ringing if caller vanished
const RECONNECT_GIVEUP_MS = 30_000;    // end call if connection can't recover

const INITIAL: WebRTCState = {
  phase: "idle",
  callId: null,
  peerUid: null,
  peerName: null,
  kind: "voice",
  localStream: null,
  remoteStream: null,
  muted: false,
  cameraOff: false,
  speakerOn: true, // speaker on by default — avoids iOS autoplay block on earpiece
  elapsedSec: 0,
  remoteMuted: false,
  remoteCameraOff: false,
  reconnecting: false,
  facingMode: "user",
};

function log(...args: unknown[]) {
  console.log("[WebRTC]", ...args);
}

export function formatCallDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function useWebRTC(myUid: string, myName: string) {
  const [state, setState] = useState<WebRTCState>(INITIAL);
  const stateRef = useRef<WebRTCState>(INITIAL);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef<boolean>(false);
  const activeCallIdRef = useRef<string | null>(null);

  // Always-fresh identity for callbacks created with empty deps
  const idRef = useRef({ myUid, myName });
  idRef.current = { myUid, myName };

  const noAnswerTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const incomingWatchRef = useRef<number | null>(null);
  const lastNotifyRef = useRef<number>(0);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Two audio elements for routing:
  // - remoteEarpieceRef: hidden <video playsInline> → routes to earpiece on iOS
  // - remoteAudioRef:    hidden <audio>              → routes to loudspeaker
  const remoteEarpieceRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef    = useRef<HTMLAudioElement>(null);

  function set(patch: Partial<WebRTCState>) {
    setState((prev) => {
      const next = { ...prev, ...patch };
      stateRef.current = next;
      return next;
    });
  }

  function startTimer() {
    if (timerRef.current) return;
    timerRef.current = window.setInterval(() => {
      set({ elapsedSec: stateRef.current.elapsedSec + 1 });
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function clearTimer(ref: { current: number | null }, kind: "timeout" | "interval") {
    if (ref.current) {
      if (kind === "timeout") window.clearTimeout(ref.current);
      else window.clearInterval(ref.current);
      ref.current = null;
    }
  }

  // Keep the screen awake during a call (like WhatsApp)
  async function acquireWakeLock() {
    try {
      const wl = (navigator as unknown as {
        wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
      }).wakeLock;
      if (!wl || wakeLockRef.current) return;
      wakeLockRef.current = await wl.request("screen");
    } catch { /* not supported / denied */ }
  }
  function releaseWakeLock() {
    try { wakeLockRef.current?.release().catch(() => {}); } catch { /* ignore */ }
    wakeLockRef.current = null;
  }

  // Tell the peer our mic / camera state so they can show indicators
  function sendMedia() {
    const { callId, peerUid, kind, muted, cameraOff } = stateRef.current;
    if (!callId || !peerUid) return;
    broadcastSignal({
      type: "media", callId, from: idRef.current.myUid, fromName: idRef.current.myName,
      to: peerUid, kind, muted, cameraOff,
    });
  }

  // End the call and notify the peer
  function endCallAndNotify() {
    const { callId, peerUid, kind } = stateRef.current;
    if (callId && peerUid) {
      broadcastSignal({
        type: "hangup", callId, from: idRef.current.myUid, fromName: idRef.current.myName,
        to: peerUid, kind,
      });
    }
    resetState();
  }

  function resetState() {
    stopRinging();
    stopTimer();
    stopNotifyRetransmit();
    clearTimer(noAnswerTimerRef, "timeout");
    clearTimer(reconnectTimerRef, "timeout");
    clearTimer(incomingWatchRef, "interval");
    releaseWakeLock();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    localStreamRef.current = null;
    pendingIceRef.current = [];
    remoteDescSetRef.current = false;
    activeCallIdRef.current = null;

    if (remoteEarpieceRef.current) {
      try { remoteEarpieceRef.current.pause(); } catch {}
      remoteEarpieceRef.current.srcObject = null;
    }
    if (remoteAudioRef.current) {
      try { remoteAudioRef.current.pause(); } catch {}
      remoteAudioRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;

    setState(INITIAL);
    stateRef.current = INITIAL;
  }

  // Route the remote stream to earpiece or speaker element based on current state
  function routeAudio(stream: MediaStream, speakerOn: boolean) {
    const earpiece = remoteEarpieceRef.current;
    const speaker  = remoteAudioRef.current;

    if (speakerOn) {
      // Speaker: use <audio> element — goes to loudspeaker
      if (speaker) {
        if (speaker.srcObject !== stream) speaker.srcObject = stream;
        speaker.muted  = false;
        speaker.volume = 1.0;
        speaker.play().catch(() => {});
      }
      // Mute earpiece element
      if (earpiece) {
        earpiece.muted = true;
        earpiece.srcObject = null;
      }
    } else {
      // Earpiece: use hidden <video playsInline> — routes to earpiece on iOS
      if (earpiece) {
        if (earpiece.srcObject !== stream) earpiece.srcObject = stream;
        earpiece.muted  = false;
        earpiece.volume = 1.0;
        earpiece.play().catch((err) => {
          log("Earpiece autoplay blocked, retrying on interaction:", err);
          const retry = () => {
            earpiece.play().catch(() => {});
            document.removeEventListener("click", retry);
            document.removeEventListener("touchstart", retry);
          };
          document.addEventListener("click", retry, { once: true });
          document.addEventListener("touchstart", retry, { once: true });
        });
      }
      // Mute speaker element
      if (speaker) {
        speaker.muted = true;
        speaker.srcObject = null;
      }
    }
  }

  function attachRemoteStream(stream: MediaStream) {
    log("Attaching remote stream, tracks:", stream.getTracks().map((t) => `${t.kind}:${t.enabled}`));
    stream.getAudioTracks().forEach((track) => { track.enabled = true; });

    // Route audio through earpiece or speaker
    routeAudio(stream, stateRef.current.speakerOn);

    // Attach video track to remote video element
    const video = remoteVideoRef.current;
    if (video) {
      if (video.srcObject !== stream) video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.play().catch(() => {});
    }

    set({ remoteStream: stream });
  }

  async function flushPendingIce() {
    if (!pcRef.current || !remoteDescSetRef.current) return;
    const queue = pendingIceRef.current.splice(0);
    for (const ice of queue) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(ice));
      } catch (e) {
        log("Failed to flush queued ICE:", e);
      }
    }
  }

  function createPeer(callId: string, peerUid: string, kind: CallKind) {
    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcRef.current = pc;
    remoteDescSetRef.current = false;

    pc.ontrack = (ev) => {
      log("ontrack fired. streams:", ev.streams.length, "track:", ev.track.kind);

      let stream: MediaStream;
      if (ev.streams && ev.streams.length > 0) {
        stream = ev.streams[0];
      } else {
        stream = stateRef.current.remoteStream ?? new MediaStream();
        stream.addTrack(ev.track);
      }
      attachRemoteStream(stream);
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        broadcastSignal({
          type: "ice",
          callId,
          from: myUid,
          fromName: myName,
          to: peerUid,
          kind,
          ice: ev.candidate.toJSON(),
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      log("ICE state:", pc.iceConnectionState);
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        stopRinging();
        clearTimer(noAnswerTimerRef, "timeout");
        clearTimer(reconnectTimerRef, "timeout");
        if (stateRef.current.phase !== "connected") {
          startTimer();
          set({ phase: "connected", reconnecting: false });
          // Share our mic/camera state (twice — broadcast delivery isn't guaranteed)
          sendMedia();
          window.setTimeout(() => { if (stateRef.current.phase === "connected") sendMedia(); }, 1500);
        } else if (stateRef.current.reconnecting) {
          set({ reconnecting: false });
        }
      }
      if (pc.iceConnectionState === "disconnected" && stateRef.current.phase === "connected") {
        // Temporary network drop → show "Reconnecting…", give up after a while
        set({ reconnecting: true });
        if (!reconnectTimerRef.current) {
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = null;
            if (stateRef.current.reconnecting) endCallAndNotify();
          }, RECONNECT_GIVEUP_MS);
        }
      }
      if (pc.iceConnectionState === "failed") {
        log("ICE failed, attempting restart…");
        try { pc.restartIce(); } catch (e) { log("ICE restart unavailable:", e); }
      }
    };

    pc.onconnectionstatechange = () => {
      log("Connection state:", pc.connectionState);
      if (pc.connectionState === "failed") {
        log("Connection failed completely");
        endCallAndNotify();
      }
    };

    return pc;
  }

  async function getMedia(kind: CallKind): Promise<MediaStream> {
    log("Requesting media, kind:", kind);

    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 48000,
      sampleSize: 16,
      // @ts-expect-error non-standard Chrome hints
      googEchoCancellation: true,
      googAutoGainControl: true,
      googNoiseSuppression: true,
      googHighpassFilter: true,
      googNoiseSuppression2: true,
      googEchoCancellation2: true,
      googAutoGainControl2: true,
    };

    const constraints: MediaStreamConstraints = {
      audio: audioConstraints,
      video: kind === "video"
        ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
        : false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    log("Got media. audio:", stream.getAudioTracks().length, "video:", stream.getVideoTracks().length);
    stream.getAudioTracks().forEach((t) => (t.enabled = true));
    return stream;
  }

  function attachLocalStreamToPc(pc: RTCPeerConnection, stream: MediaStream) {
    stream.getTracks().forEach((track) => {
      try {
        pc.addTrack(track, stream);
        log("addTrack:", track.kind, track.id);
      } catch (e) {
        log("addTrack error (may be duplicate):", e);
      }
    });
  }

  // Retransmit interval ref — resends notify until callee responds
  const notifyIntervalRef = useRef<number | null>(null);

  function stopNotifyRetransmit() {
    if (notifyIntervalRef.current) {
      window.clearInterval(notifyIntervalRef.current);
      notifyIntervalRef.current = null;
    }
  }

  const initiateCall = useCallback(
    async (callId: string, peerUid: string, peerName: string, kind: CallKind) => {
      log("Initiating call to:", peerName, "kind:", kind);
      activeCallIdRef.current = callId;
      set({ phase: "calling", callId, peerUid, peerName, kind });
      startRinging("outgoing");
      acquireWakeLock();

      // Nobody answered → hang up (the app logs it as an unanswered call)
      clearTimer(noAnswerTimerRef, "timeout");
      noAnswerTimerRef.current = window.setTimeout(() => {
        noAnswerTimerRef.current = null;
        if (stateRef.current.phase === "calling" && activeCallIdRef.current === callId) {
          log("No answer — ending call");
          endCallAndNotify();
        }
      }, NO_ANSWER_TIMEOUT_MS);

      try {
        const stream = await getMedia(kind);
        localStreamRef.current = stream;
        set({ localStream: stream });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.muted = true;
          await localVideoRef.current.play().catch(() => {});
        }

        const pc = createPeer(callId, peerUid, kind);
        attachLocalStreamToPc(pc, stream);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const notifySignal: CallSignal = {
          type: "notify", callId, from: myUid, fromName: myName,
          to: peerUid, kind, sdp: offer,
        };

        log("Sending offer to:", peerUid);
        broadcastSignal(notifySignal);

        // Retransmit every 2.5s until answered/declined (max 60s)
        stopNotifyRetransmit();
        let retries = 0;
        notifyIntervalRef.current = window.setInterval(() => {
          if (stateRef.current.phase !== "calling") {
            stopNotifyRetransmit();
            return;
          }
          if (retries++ >= 24) { // ~60s timeout
            stopNotifyRetransmit();
            return;
          }
          log("Retransmitting notify #", retries);
          broadcastSignal(notifySignal);
        }, 2500);
      } catch (err) {
        log("Failed to initiate call:", err);
        resetState();
      }
    },
    [myUid, myName],
  );

  const acceptCall = useCallback(
    async (sig: CallSignal) => {
      log("Accepting call from:", sig.fromName);
      stopRinging();
      clearTimer(incomingWatchRef, "interval");
      activeCallIdRef.current = sig.callId;
      set({ phase: "connecting", callId: sig.callId, peerUid: sig.from, peerName: sig.fromName, kind: sig.kind });
      acquireWakeLock();

      try {
        const stream = await getMedia(sig.kind);
        localStreamRef.current = stream;
        set({ localStream: stream });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.muted = true;
          await localVideoRef.current.play().catch(() => {});
        }

        const pc = createPeer(sig.callId, sig.from, sig.kind);
        attachLocalStreamToPc(pc, stream);

        log("Setting remote description (offer)");
        await pc.setRemoteDescription(new RTCSessionDescription(sig.sdp!));
        remoteDescSetRef.current = true;

        log("Creating answer");
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        log("Sending answer");
        broadcastSignal({ type: "answer", callId: sig.callId, from: myUid, fromName: myName, to: sig.from, kind: sig.kind, sdp: answer });

        await flushPendingIce();
      } catch (err) {
        log("Failed to accept call:", err);
        broadcastSignal({ type: "decline", callId: sig.callId, from: myUid, fromName: myName, to: sig.from, kind: sig.kind });
        resetState();
      }
    },
    [myUid, myName],
  );

  const declineCall = useCallback(
    (sig: CallSignal) => {
      log("Declining call from:", sig.fromName);
      broadcastSignal({ type: "decline", callId: sig.callId, from: myUid, fromName: myName, to: sig.from, kind: sig.kind });
      resetState();
    },
    [myUid, myName],
  );

  const handleSignal = useCallback(
    async (sig: CallSignal) => {
      if (sig.from === myUid) return;
      if (sig.to !== myUid) return;

      if (sig.type !== "notify" && activeCallIdRef.current && sig.callId !== activeCallIdRef.current) return;

      log("Signal:", sig.type, "from:", sig.fromName);

      if (sig.type === "notify") {
        if (activeCallIdRef.current && activeCallIdRef.current !== sig.callId) {
          broadcastSignal({ type: "decline", callId: sig.callId, from: myUid, fromName: myName, to: sig.from, kind: sig.kind });
          return;
        }
        if (activeCallIdRef.current === sig.callId) {
          lastNotifyRef.current = Date.now(); // caller is still ringing us
          return;
        }

        log("Incoming call from:", sig.fromName);
        activeCallIdRef.current = sig.callId;
        pendingIceRef.current = [];
        remoteDescSetRef.current = false;
        lastNotifyRef.current = Date.now();
        set({ phase: "incoming", callId: sig.callId, peerUid: sig.from, peerName: sig.fromName, kind: sig.kind });
        startRinging("incoming");
        acquireWakeLock();

        // Caller vanished (closed tab / lost network) → stop ringing, log as missed
        clearTimer(incomingWatchRef, "interval");
        incomingWatchRef.current = window.setInterval(() => {
          if (stateRef.current.phase !== "incoming") {
            clearTimer(incomingWatchRef, "interval");
            return;
          }
          if (Date.now() - lastNotifyRef.current > INCOMING_STALE_MS) {
            log("Caller stopped ringing — dismissing incoming call");
            resetState();
          }
        }, 3000);
        return;
      }

      if (sig.type === "media") {
        set({ remoteMuted: !!sig.muted, remoteCameraOff: !!sig.cameraOff });
        return;
      }

      if (sig.type === "decline" || sig.type === "hangup") {
        log("Call ended by remote:", sig.type);
        resetState();
        return;
      }

      if (sig.type === "answer") {
        log("Received answer");
        if (!pcRef.current) { log("No peer connection for answer"); return; }
        stopRinging();
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(sig.sdp!));
          remoteDescSetRef.current = true;
          if (stateRef.current.phase !== "connected") set({ phase: "connecting" });
          await flushPendingIce();
        } catch (err) {
          log("Failed to set remote description:", err);
        }
        return;
      }

      if (sig.type === "ice") {
        if (!sig.ice) return;
        if (!pcRef.current || !remoteDescSetRef.current) {
          pendingIceRef.current.push(sig.ice);
          return;
        }
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(sig.ice));
        } catch (e) {
          log("ICE candidate error:", e);
        }
        return;
      }
    },
    [myUid, myName],
  );

  const hangup = useCallback(() => {
    log("Hanging up");
    endCallAndNotify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const muted = !stateRef.current.muted;
    stream.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    set({ muted });
    sendMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const cameraOff = !stateRef.current.cameraOff;
    stream.getVideoTracks().forEach((t) => { t.enabled = !cameraOff; });
    set({ cameraOff });
    sendMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch between front and back camera without dropping the call
  const flipCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream || stateRef.current.kind !== "video") return;
    const prevFacing = stateRef.current.facingMode;
    const nextFacing: "user" | "environment" = prevFacing === "user" ? "environment" : "user";
    const old = stream.getVideoTracks()[0];

    const open = async (facing: "user" | "environment") => {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      return s.getVideoTracks()[0];
    };

    try {
      // Release the current camera first — many phones can't open two at once
      if (old) { old.stop(); stream.removeTrack(old); }
      let track: MediaStreamTrack;
      let facing = nextFacing;
      try {
        track = await open(nextFacing);
      } catch (e) {
        log("Flip failed, restoring previous camera:", e);
        track = await open(prevFacing);
        facing = prevFacing;
      }
      track.enabled = !stateRef.current.cameraOff;
      const sender = pcRef.current?.getSenders().find((s) => s.track === null || s.track?.kind === "video");
      await sender?.replaceTrack(track);
      stream.addTrack(track);
      set({ facingMode: facing, localStream: stream });
      // Re-bind so <video> elements pick up the new track
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    } catch (e) {
      log("flipCamera error:", e);
    }
  }, []);

  const toggleSpeaker = useCallback(() => {
    const speakerOn = !stateRef.current.speakerOn;
    const stream = stateRef.current.remoteStream;
    log("toggleSpeaker →", speakerOn ? "speaker" : "earpiece");

    if (stream) {
      routeAudio(stream, speakerOn);
    }
    set({ speakerOn });
  }, []);

  useEffect(() => {
    log("useWebRTC initialized for:", myName);
    // Wake locks are released when the tab is hidden — take it again on return
    const onVisible = () => {
      if (document.visibilityState === "visible" && activeCallIdRef.current) acquireWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      log("useWebRTC cleanup for:", myName);
      resetState();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    state,
    initiateCall,
    acceptCall,
    declineCall,
    handleSignal,
    hangup,
    toggleMute,
    toggleCamera,
    toggleSpeaker,
    flipCamera,
    localVideoRef,
    remoteVideoRef,
    remoteAudioRef,
    remoteEarpieceRef,
  };
}
