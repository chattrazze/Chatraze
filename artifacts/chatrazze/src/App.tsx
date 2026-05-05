import { useCallback, useEffect, useRef, useState } from "react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ToastProvider } from "@/components/Toast";
import { ThemeProvider } from "@/hooks/useTheme";
import { LangProvider, useLang } from "@/hooks/useLang";
import SplashScreen from "@/components/SplashScreen";
import AuthScreen from "@/components/AuthScreen";
import Sidebar from "@/components/Sidebar";
import ChatView from "@/components/ChatView";
import BottomTabs, { TabKey } from "@/components/BottomTabs";
import StatusScreen from "@/components/screens/StatusScreen";
import CallsScreen from "@/components/screens/CallsScreen";
import CommunitiesScreen from "@/components/screens/CommunitiesScreen";
import ProfileScreen from "@/components/screens/ProfileScreen";
import CallOverlay from "@/components/CallOverlay";
import { AppUser, setPresence, getUser } from "@/lib/userService";
import type { Lang } from "@/hooks/useLang";
import { MessageCircle } from "lucide-react";
import { useWebRTC, formatCallDuration } from "@/hooks/useWebRTC";
import {
  subscribeToCallPresence,
  addCallRecord,
  type CallSignal,
  type CallKind,
} from "@/lib/callService";
import { createChat, sendMessage, joinGroupByInvite } from "@/lib/chatService";
import { useGlobalNotifications } from "@/hooks/useGlobalNotifications";

/* ── Syncs user's saved language from Supabase after login ── */
function UserLangSync() {
  const { user } = useAuth();
  const { setLang, lang } = useLang();

  useEffect(() => {
    if (!user) return;
    getUser(user.uid).then((u) => {
      if (!u?.lang) return;
      const VALID_LANGS = ["en","ar","fr","es","de","pt","it","tr"];
      if (VALID_LANGS.includes(u.lang) && u.lang !== lang) {
        setLang(u.lang as Lang);
      }
    }).catch(() => {});
  // Only run on user change (login/logout), not on every lang change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  return null;
}

function Shell() {
  const { user, loading } = useAuth();
  const { t } = useLang();
  const [showSplash, setShowSplash] = useState(true);
  const [chatId, setChatId]   = useState<string | null>(null);
  const [peer, setPeer]       = useState<AppUser | null>(null);
  const [tab, setTab]         = useState<TabKey>("chats");
  const [unreadTotal, setUnreadTotal] = useState(0);

  const [peerPhotoURL, setPeerPhotoURL] = useState<string | null>(null);

  const incomingSignalRef = useRef<CallSignal | null>(null);
  const callStartTimeRef  = useRef<number | null>(null);
  const callPeerRef       = useRef<{ uid: string; name: string; direction: "incoming" | "outgoing" } | null>(null);

  const webrtc = useWebRTC(user?.uid ?? "", user?.displayName ?? user?.email ?? "Me");
  const { state, initiateCall, acceptCall, declineCall, hangup, handleSignal, toggleMute, toggleCamera, toggleSpeaker, localVideoRef, remoteVideoRef, remoteAudioRef, remoteEarpieceRef } = webrtc;

  const onUnreadChange = useCallback((n: number) => setUnreadTotal(n), []);

  // ── Global notifications: cross-chat msgs, new statuses, missed summary ──
  const jumpToChats = useCallback(() => setTab("chats"), []);
  const jumpToStatus = useCallback(() => setTab("status"), []);
  const { unviewedStatusCount } = useGlobalNotifications({
    uid: user?.uid ?? null,
    enabled: !!user,
    onJumpToChat: jumpToChats,
    onJumpToStatus: jumpToStatus,
  });

  // ── Invite link handler (#invite:GROUP_ID) ────────────────────────────
  useEffect(() => {
    if (!user) return;
    const hash = window.location.hash;
    if (!hash.startsWith("#invite:")) return;
    const groupId = hash.slice("#invite:".length).trim();
    if (!groupId) return;
    window.history.replaceState(null, "", window.location.pathname);
    joinGroupByInvite(groupId, user.uid)
      .then((chat) => {
        const groupPeer: AppUser = {
          uid: chat.id,
          email: null,
          phone: null,
          displayName: chat.name ?? t("group"),
          photoURL: null,
          isGroup: true,
          memberCount: chat.members.length,
        };
        setChatId(chat.id);
        setPeer(groupPeer);
        setTab("chats");
      })
      .catch(() => {});
  }, [user?.uid]);

  // ── Presence ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || typeof document === "undefined") return;
    setPresence(user.uid, true).catch(() => {});
    const onVis    = () => setPresence(user.uid, !document.hidden).catch(() => {});
    const onUnload = () => setPresence(user.uid, false).catch(() => {});
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeunload", onUnload);
    const iv = window.setInterval(() => setPresence(user.uid, !document.hidden).catch(() => {}), 30000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeunload", onUnload);
      window.clearInterval(iv);
      setPresence(user.uid, false).catch(() => {});
    };
  }, [user]);

  // ── Signal subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToCallPresence((sig) => {
      handleSignal(sig);
      if (sig.type === "notify" && sig.to === user.uid) {
        incomingSignalRef.current = sig;
      }
    });
    return () => unsub();
  }, [user, handleSignal]);

  // ── Track call lifecycle for history + chat messages ─────────────────
  const prevPhaseRef     = useRef(state.phase);
  const callKindRef      = useRef(state.kind);
  useEffect(() => { callKindRef.current = state.kind; }, [state.kind]);

  useEffect(() => {
    if (!user) return;
    const prev = prevPhaseRef.current;
    const cur  = state.phase;
    prevPhaseRef.current = cur;

    // Capture peer info as soon as call begins
    if (prev === "idle" && cur === "calling") {
      callPeerRef.current = { uid: state.peerUid!, name: state.peerName!, direction: "outgoing" };
    }
    if (prev === "idle" && cur === "incoming") {
      callPeerRef.current = { uid: state.peerUid!, name: state.peerName!, direction: "incoming" };
    }

    // Track connection start time
    if (cur === "connected" && prev !== "connected") {
      callStartTimeRef.current = Date.now();
    }

    // Call ended — write history + chat message
    if (prev !== "idle" && cur === "idle") {
      const info = callPeerRef.current;
      if (!info) return;

      const wasConnected = callStartTimeRef.current !== null;
      const durationSec  = wasConnected
        ? Math.floor((Date.now() - callStartTimeRef.current!) / 1000)
        : 0;

      const direction: "outgoing" | "incoming" | "missed" =
        wasConnected ? info.direction
        : info.direction === "outgoing" ? "outgoing"
        : "missed";

      const kind = callKindRef.current;

      addCallRecord(user.uid, {
        id: `${user.uid}_${Date.now()}`,
        peerId:    info.uid,
        peerName:  info.name,
        kind,
        direction,
        at: Date.now(),
        durationSec,
      });

      createChat(user.uid, info.uid).then((cid) => {
        if (wasConnected) {
          sendMessage(cid, user.uid, {
            type: "call_ended",
            text: `${t("callEnded")} · ${formatCallDuration(durationSec)}`,
          }).catch(() => {});
        } else if (direction === "missed") {
          // Incoming call we (the user) didn't pick up.
          sendMessage(cid, info.uid, {
            type: "call_missed",
            text: `${t("missedCallFrom")} ${info.name}`,
          }).catch(() => {});
        } else if (direction === "outgoing") {
          // We called someone but they didn't answer.
          sendMessage(cid, user.uid, {
            type: "call_missed",
            text: t("callNotAnswered"),
          }).catch(() => {});
        }
      }).catch(() => {});

      callPeerRef.current      = null;
      callStartTimeRef.current = null;
    }
  }, [state.phase, user]);

  // ── Fetch peer photo when call phase changes ───────────────────────────
  useEffect(() => {
    if (state.phase === "idle") {
      setPeerPhotoURL(null);
      return;
    }
    if (state.peerUid && !peerPhotoURL) {
      getUser(state.peerUid)
        .then((u) => { if (u?.photoURL) setPeerPhotoURL(u.photoURL); })
        .catch(() => {});
    }
  }, [state.phase, state.peerUid]);

  // ── Start a call from ChatView ─────────────────────────────────────────
  const onStartCall = useCallback(
    (targetPeer: AppUser, kind: CallKind) => {
      if (!user) return;
      // Set photo immediately from peer object so it shows before the fetch
      setPeerPhotoURL(targetPeer.photoURL ?? null);
      const callId = [user.uid, targetPeer.uid].sort().join("_") + "_" + Date.now();
      initiateCall(callId, targetPeer.uid, targetPeer.displayName || targetPeer.email || "User", kind);
    },
    [user, initiateCall],
  );

  // ── Call back from Calls history ───────────────────────────────────────
  const onCallBack = useCallback(
    (peerId: string, peerName: string, kind: CallKind) => {
      if (!user) return;
      const minimalPeer: AppUser = {
        uid: peerId,
        displayName: peerName,
        email: null,
        phone: null,
        photoURL: null,
      };
      onStartCall(minimalPeer, kind);
    },
    [user, onStartCall],
  );

  if (showSplash) {
    return <SplashScreen onDone={() => setShowSplash(false)} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  function changeTab(t: TabKey) {
    setTab(t);
    if (t !== "chats") { setChatId(null); setPeer(null); }
  }

  return (
    <div className="h-screen w-screen flex flex-col md:flex-row overflow-hidden">
      <UserLangSync />
      {/* Global call overlay */}
      {state.phase !== "idle" && (
        <CallOverlay
          state={state}
          peerPhotoURL={peerPhotoURL}
          onAccept={() => { if (incomingSignalRef.current) acceptCall(incomingSignalRef.current); }}
          onDecline={() => { if (incomingSignalRef.current) declineCall(incomingSignalRef.current); }}
          onHangup={hangup}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
          onToggleSpeaker={toggleSpeaker}
          localVideoRef={localVideoRef}
          remoteVideoRef={remoteVideoRef}
          remoteAudioRef={remoteAudioRef}
          remoteEarpieceRef={remoteEarpieceRef}
        />
      )}

      {/* Desktop tabs */}
      <div className="hidden md:flex order-1">
        <BottomTabs
          active={tab}
          onChange={changeTab}
          unreadTotal={unreadTotal}
          statusUnread={unviewedStatusCount}
        />
      </div>

      {/* Main content */}
      <main className="flex-1 flex min-h-0 order-2">
        {tab === "chats" && (
          <>
            <div className={`${chatId ? "hidden md:flex" : "flex"} w-full md:w-auto`}>
              <Sidebar
                selectedChatId={chatId}
                onSelectChat={(id, p) => { setChatId(id); setPeer(p); }}
                onUnreadChange={onUnreadChange}
              />
            </div>
            <div className={`${chatId ? "flex" : "hidden md:flex"} flex-1`}>
              {chatId && peer ? (
                <ChatView chatId={chatId} peer={peer} onBack={() => { setChatId(null); setPeer(null); }} onCall={onStartCall} />
              ) : (
                <EmptyState />
              )}
            </div>
          </>
        )}
        {tab === "status"      && <StatusScreen onGoToChats={(cid, p) => { setTab("chats"); if (cid && p) { setChatId(cid); setPeer(p); } }} />}
        {tab === "calls"       && <CallsScreen  onGoToChats={() => setTab("chats")} onCall={onCallBack} />}
        {tab === "communities" && (
          <CommunitiesScreen
            onOpenChannel={(chatId, name, memberCount) => {
              const groupPeer = {
                uid: chatId,
                email: null,
                phone: null,
                displayName: name,
                photoURL: null,
                isGroup: true,
                memberCount,
              };
              setChatId(chatId);
              setPeer(groupPeer);
              setTab("chats");
            }}
          />
        )}
        {tab === "profile"     && <ProfileScreen onGoToChat={(cid, p) => { setChatId(cid); setPeer(p); setTab("chats"); }} />}
      </main>

      {/* Mobile tabs */}
      <div className="md:hidden order-3">
        <BottomTabs
          active={tab}
          onChange={changeTab}
          unreadTotal={unreadTotal}
          statusUnread={unviewedStatusCount}
        />
      </div>
    </div>
  );
}

function EmptyState() {
  const { t } = useLang();
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#FF7A1A] to-[#FF4E00] flex items-center justify-center shadow-2xl mb-6">
        <MessageCircle className="w-10 h-10 text-white" />
      </div>
      <h2 className="text-2xl font-bold mb-2">{t("welcome")}</h2>
      <p className="text-muted-foreground max-w-sm">{t("welcomeSub")}</p>
    </div>
  );
}

export default function App() {
  return (
    <LangProvider>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <Shell />
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </LangProvider>
  );
}
