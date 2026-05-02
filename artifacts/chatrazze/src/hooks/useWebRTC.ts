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
}

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
  speakerOn: true,
  elapsedSec: 0,
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

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

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

  function resetState() {
    stopRinging();
    stopTimer();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    localStreamRef.current = null;
    pendingIceRef.current = [];
    remoteDescSetRef.current = false;
    activeCallIdRef.current = null;

    if (remoteAudioRef.current) {
      try { remoteAudioRef.current.pause(); } catch {}
      remoteAudioRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;

    setState(INITIAL);
    stateRef.current = INITIAL;
  }

  function attachRemoteStream(stream: MediaStream) {
    log("Attaching remote stream, tracks:", stream.getTracks().map((t) => `${t.kind}:${t.enabled}`));

    stream.getAudioTracks().forEach((track) => { track.enabled = true; });

    const audio = remoteAudioRef.current;
    if (audio) {
      if (audio.srcObject !== stream) audio.srcObject = stream;
      audio.muted = false;
      audio.volume = 1.0;
      audio.autoplay = true;
      audio.setAttribute("playsinline", "");

      const tryPlay = () => audio.play().catch(() => {});
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          log("Audio autoplay blocked, retrying on user interaction:", err);
          const onInteract = () => {
            tryPlay();
            document.removeEventListener("click", onInteract);
            document.removeEventListener("touchstart", onInteract);
          };
          document.addEventListener("click", onInteract, { once: true });
          document.addEventListener("touchstart", onInteract, { once: true });
        });
      }
    }

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

    // NOTE: Do NOT call addTransceiver here — let addTrack() create transceivers
    // implicitly. Pre-creating transceivers with no local track causes sender.track
    // to be null when the remote side attaches tracks, resulting in one-way audio.

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
        if (stateRef.current.phase !== "connected") {
          startTimer();
          set({ phase: "connected" });
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
        resetState();
      }
    };

    return pc;
  }

  async function getMedia(kind: CallKind): Promise<MediaStream> {
    log("Requesting media, kind:", kind);

    // High-quality voice constraints — aggressive noise/echo cancellation
    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,          // Mono is better for voice calls
      sampleRate: 48000,        // Opus prefers 48 kHz
      sampleSize: 16,
      // Chrome legacy hints (ignored on other browsers, no harm done)
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

  // Simply add all local tracks — addTrack creates sendrecv transceivers automatically.
  // This is the most reliable approach across browsers and avoids sender.track===null bugs.
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

  const initiateCall = useCallback(
    async (callId: string, peerUid: string, peerName: string, kind: CallKind) => {
      log("Initiating call to:", peerName, "kind:", kind);
      activeCallIdRef.current = callId;
      set({ phase: "calling", callId, peerUid, peerName, kind });
      startRinging("outgoing");

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

        log("Sending offer to:", peerUid);
        broadcastSignal({ type: "notify", callId, from: myUid, fromName: myName, to: peerUid, kind, sdp: offer });
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
      activeCallIdRef.current = sig.callId;
      set({ phase: "connecting", callId: sig.callId, peerUid: sig.from, peerName: sig.fromName, kind: sig.kind });

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

        // For answerer: attach local tracks BEFORE setRemoteDescription so the
        // answer SDP includes our send directions — fixes one-way audio.
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
        if (activeCallIdRef.current === sig.callId) return;

        log("Incoming call from:", sig.fromName);
        activeCallIdRef.current = sig.callId;
        pendingIceRef.current = [];
        remoteDescSetRef.current = false;
        set({ phase: "incoming", callId: sig.callId, peerUid: sig.from, peerName: sig.fromName, kind: sig.kind });
        startRinging("incoming");
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
    const { callId, peerUid, kind } = stateRef.current;
    log("Hanging up");
    if (callId && peerUid) {
      broadcastSignal({ type: "hangup", callId, from: myUid, fromName: myName, to: peerUid, kind });
    }
    resetState();
  }, [myUid, myName]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const muted = !stateRef.current.muted;
    stream.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    set({ muted });
  }, []);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const cameraOff = !stateRef.current.cameraOff;
    stream.getVideoTracks().forEach((t) => { t.enabled = !cameraOff; });
    set({ cameraOff });
  }, []);

  const toggleSpeaker = useCallback(() => {
    const speakerOn = !stateRef.current.speakerOn;
    const audio = remoteAudioRef.current;
    if (audio) {
      // Use setSinkId where available (Chrome desktop, some Android browsers)
      // On iOS Safari this will silently fail — the speaker button is UI-only there
      const el = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (el.setSinkId) {
        el.setSinkId(speakerOn ? "speaker" : "").catch(() => {});
      }
      // Mute/unmute as a visual fallback indicator
      audio.volume = speakerOn ? 1.0 : 0.5;
    }
    set({ speakerOn });
  }, []);

  useEffect(() => {
    log("useWebRTC initialized for:", myName);
    return () => {
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
    localVideoRef,
    remoteVideoRef,
    remoteAudioRef,
  };
}
