import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearChatMessages,
  deleteMessage,
  listenToChat,
  listenToMessages,
  markChatRead,
  MessageDoc,
  sendMessage,
  setTyping,
  toggleReaction,
  uploadMedia,
} from "@/lib/chatService";
import { AppUser, listenToUser, getUser } from "@/lib/userService";
import { useAuth } from "@/hooks/useAuth";
import Avatar from "@/components/Avatar";
import UserProfilePage from "@/components/UserProfilePage";
import GroupProfilePage from "@/components/GroupProfilePage";
import { sendBrowserNotification, playNotificationSound } from "@/components/SettingsSheet";
import { useLang } from "@/hooks/useLang";
import type { CallKind } from "@/lib/callService";
import { useChatBg } from "@/hooks/useChatBg";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Copy,
  CornerUpLeft,
  Download,
  FileText,
  ImageIcon,
  ChevronLeft,
  Lock,
  Mic,
  MoreHorizontal,
  Paperclip,
  Pause,
  Phone,
  PhoneOff,
  Play,
  Send,
  Trash2,
  Users,
  Video,
  Video as VideoIcon,
  X,
  Search,
  ChevronUp,
  ChevronDown,
  RefreshCw,
} from "lucide-react";

// Real emoji reactions — like WhatsApp
const REACTIONS: { key: string; emoji: string; label: string }[] = [
  { key: "like",    emoji: "👍", label: "Like"    },
  { key: "love",    emoji: "❤️", label: "Love"    },
  { key: "haha",    emoji: "😂", label: "Haha"    },
  { key: "wow",     emoji: "😮", label: "Wow"     },
  { key: "sad",     emoji: "😢", label: "Sad"     },
  { key: "pray",    emoji: "🙏", label: "Thanks"  },
];

function ReactionIcon({ value }: { value: string }) {
  const r = REACTIONS.find((x) => x.key === value);
  return <span className="text-sm leading-none">{r ? r.emoji : value}</span>;
}

interface Props {
  chatId: string;
  peer: AppUser;
  onBack: () => void;
  onCall?: (peer: AppUser, kind: CallKind) => void;
}

export default function ChatView({ chatId, peer, onBack, onCall }: Props) {
  const { user } = useAuth();
  const { t } = useLang();
  const [messages, setMessages] = useState<MessageDoc[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadHint, setUploadHint] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [peerOnline, setPeerOnline] = useState<boolean>(!!peer.online);
  const [peerLastSeen, setPeerLastSeen] = useState<Date | null>(null);
  const [peerTyping, setPeerTyping] = useState<boolean>(false);
  const typingTimerRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  // "user" | "group" | null
  const [profilePage, setProfilePage] = useState<"user" | "group" | null>(null);
  const [chatUnlocked, setChatUnlocked] = useState<boolean>(() => {
    const pin = localStorage.getItem(`chatrazze:lock:${chatId}`);
    if (!pin) return true;
    return sessionStorage.getItem(`chatrazze:unlocked:${chatId}`) === "1";
  });
  const [lockPinInput, setLockPinInput] = useState("");
  const [lockPinError, setLockPinError] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [contextMsg, setContextMsg]   = useState<MessageDoc | null>(null);
  const [replyTo, setReplyTo]         = useState<MessageDoc | null>(null);
  const [toast, setToast]             = useState<string | null>(null);
  const [searchOpen, setSearchOpen]   = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatchIdx, setSearchMatchIdx] = useState(0);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const headerMenuRef  = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const msgRefs        = useRef<Map<string, HTMLDivElement>>(new Map());
  const [pullY, setPullY]           = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const pullStartY   = useRef(0);
  const isPulling    = useRef(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  // Reset lock state whenever the active chat changes
  useEffect(() => {
    const pin = localStorage.getItem(`chatrazze:lock:${chatId}`);
    const unlocked = !pin || sessionStorage.getItem(`chatrazze:unlocked:${chatId}`) === "1";
    setChatUnlocked(unlocked);
    setLockPinInput("");
    setLockPinError("");
  }, [chatId]);
  const lastMsgIdRef = useRef<string | null>(null);
  // Map uid → displayName for group members
  const [membersMap, setMembersMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    const unsub = listenToMessages(chatId, (msgs) => {
      setMessages(msgs);
      if (msgs.length > 0) {
        const latest = msgs[msgs.length - 1];
        if (latest.senderId !== user.uid && latest.id !== lastMsgIdRef.current) {
          playNotificationSound();
          if (document.hidden) {
            const body = latest.type === "text"
              ? (latest.text ?? t("newMessage"))
              : `📎 ${latest.type}`;
            sendBrowserNotification(peer.displayName || peer.email || "Chatrazze", body);
          }
        }
        lastMsgIdRef.current = latest.id;
      }
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, user, peer, t, refreshKey]);

  useEffect(() => {
    const unsub = listenToUser(peer.uid, (u) => {
      if (!u) return;
      setPeerOnline(!!u.online);
      setPeerLastSeen(u.lastSeen ? new Date(u.lastSeen) : null);
    });
    return () => unsub();
  }, [peer.uid]);

  useEffect(() => {
    if (!user) return;
    const unsub = listenToChat(chatId, (c) => {
      const ts = c?.typing?.[peer.uid] ?? 0;
      setPeerTyping(ts > 0 && Date.now() - ts < 5000);
    });
    return () => unsub();
  }, [chatId, peer.uid, user]);

  useEffect(() => {
    if (!user) return;
    return () => { setTyping(chatId, user.uid, false).catch(() => {}); };
  }, [chatId, user]);

  useEffect(() => {
    if (user) markChatRead(chatId, user.uid).catch(() => {});
  }, [chatId, user, messages.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  // Load group member names
  useEffect(() => {
    if (!peer.isGroup || !peer.members?.length) return;
    const missing = peer.members.filter((uid) => uid !== user?.uid && !membersMap[uid]);
    if (!missing.length) return;
    Promise.all(missing.map((uid) => getUser(uid))).then((results) => {
      setMembersMap((prev) => {
        const next = { ...prev };
        for (const u of results) if (u) next[u.uid] = u.displayName || u.email || u.uid.slice(0, 8);
        return next;
      });
    });
  }, [peer.isGroup, peer.members, user?.uid, membersMap]);

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as typeof messages;
    return messages.filter((m) => m.type === "text" && m.text?.toLowerCase().includes(q));
  }, [messages, searchQuery]);

  useEffect(() => { setSearchMatchIdx(0); }, [searchQuery]);

  // Auto-focus search input when opened (works on iOS too)
  useEffect(() => {
    if (!searchOpen) return;
    const timer = setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen || searchMatches.length === 0) return;
    const msg = searchMatches[searchMatchIdx];
    if (!msg) return;
    const el = msgRefs.current.get(msg.id);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [searchMatchIdx, searchMatches, searchOpen]);

  useEffect(() => {
    if (!showHeaderMenu) return;
    function onClickOutside(e: MouseEvent) {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setShowHeaderMenu(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showHeaderMenu]);

  const grouped = useMemo(() => groupByDay(messages, t), [messages, t]);
  const chatBg  = useChatBg(user?.uid ?? "");

  if (!user) return null;

  async function handleSend() {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    setSendError(null);
    setText("");

    // Capture reply context then clear it
    const pendingReply = replyTo;
    setReplyTo(null);

    // Optimistic update — show message instantly
    const tempId = `temp_${Date.now()}`;
    const optimistic: MessageDoc = {
      id: tempId,
      chatId,
      senderId: user!.uid,
      type: "text",
      text: msg,
      createdAt: new Date().toISOString(),
      readBy: [user!.uid],
      reactions: {},
      replyToId:     pendingReply?.id,
      replyToText:   pendingReply?.text ?? (pendingReply ? `📎 ${pendingReply.type}` : undefined),
      replyToSender: pendingReply ? (pendingReply.senderId === user!.uid ? t("you") : peer.displayName ?? "") : undefined,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const realId = await sendMessage(chatId, user!.uid, {
        type: "text",
        text: msg,
        replyToId:     pendingReply?.id,
        replyToText:   pendingReply?.text ?? (pendingReply ? `📎 ${pendingReply.type}` : undefined),
        replyToSender: pendingReply ? (pendingReply.senderId === user!.uid ? t("you") : peer.displayName ?? "") : undefined,
      });
      setTyping(chatId, user!.uid, false).catch(() => {});
      // Immediately confirm temp message with real DB id — no waiting for realtime
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, id: realId } : m)));
    } catch (err) {
      // Roll back optimistic update on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setText(msg);
      const errMsg = (err as { message?: string })?.message ?? "Unknown error";
      console.error("[ChatView] sendMessage failed:", err);
      setSendError(errMsg);
      setTimeout(() => setSendError(null), 6000);
    } finally {
      setSending(false);
    }
  }

  function handleTyping(value: string) {
    setText(value);
    if (!user) return;
    setTyping(chatId, user.uid, true).catch(() => {});
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      setTyping(chatId, user.uid, false).catch(() => {});
    }, 2500);
  }

  async function handleFile(
    e: React.ChangeEvent<HTMLInputElement>,
    kind: "image" | "video" | "audio" | "file",
  ) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setShowAttachMenu(false);
    setUploadProgress(0);
    setUploadHint(null);

    // Optimistic uploading bubble
    const tempId = `uploading_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        chatId,
        senderId: user!.uid,
        type: kind,
        text: `⏳ ${t("uploading")} ${kind}...`,
        createdAt: new Date().toISOString(),
        readBy: [user!.uid],
        reactions: {},
      } as MessageDoc,
    ]);

    try {
      const uploaded = await uploadMedia(f, user!.uid, chatId, (pct) => {
        setUploadProgress(pct);
      });
      const realId = await sendMessage(chatId, user!.uid, {
        type: kind,
        mediaUrl: uploaded.url,
        mediaName: uploaded.name,
        mediaMime: uploaded.mime,
        mediaSize: uploaded.size,
      });
      setUploadProgress(null);
      // Replace optimistic bubble with real message
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== tempId);
        if (filtered.find((m) => m.id === realId)) return filtered;
        return [
          ...filtered,
          {
            id: realId,
            chatId,
            senderId: user!.uid,
            type: kind,
            mediaUrl: uploaded.url,
            mediaName: uploaded.name,
            mediaMime: uploaded.mime,
            mediaSize: uploaded.size,
            createdAt: new Date().toISOString(),
            readBy: [user!.uid],
            reactions: {},
          },
        ];
      });
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setUploadProgress(null);
      setUploadHint(`${t("uploadFailed")}: ${(err as { message?: string }).message ?? "unknown"}`);
      setTimeout(() => setUploadHint(null), 4500);
    }
  }

  const handleGroupMemberCall = (peerUid: string, peerName: string, kind: "voice" | "video") => {
    if (!onCall) return;
    onCall(
      { uid: peerUid, displayName: peerName, email: null, phone: null, photoURL: null, isGroup: false, online: false },
      kind as CallKind,
    );
  };

  function handleUnlockChat() {
    const pin = localStorage.getItem(`chatrazze:lock:${chatId}`);
    if (!pin || lockPinInput === pin) {
      sessionStorage.setItem(`chatrazze:unlocked:${chatId}`, "1");
      setChatUnlocked(true);
      setLockPinError("");
    } else {
      setLockPinError(t("wrongPIN"));
    }
  }

  /* ── Pull-to-refresh handlers ─────────────────────────────────── */
  function handlePullStart(e: React.TouchEvent<HTMLDivElement>) {
    const el = scrollRef.current;
    if (!el || el.scrollTop > 2) return;
    pullStartY.current = e.touches[0].clientY;
    isPulling.current  = true;
  }
  function handlePullMove(e: React.TouchEvent<HTMLDivElement>) {
    if (!isPulling.current) return;
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop > 2) { isPulling.current = false; setPullY(0); return; }
    const delta = e.touches[0].clientY - pullStartY.current;
    if (delta <= 0) { setPullY(0); return; }
    setPullY(Math.min(delta * 0.42, 76));
  }
  function handlePullEnd() {
    if (pullY >= 56 && !isRefreshing) {
      setIsRefreshing(true);
      setRefreshKey((k) => k + 1);
      setTimeout(() => { setIsRefreshing(false); }, 1500);
    }
    setPullY(0);
    isPulling.current  = false;
    pullStartY.current = 0;
  }

  if (!chatUnlocked) {
    return (
      <section className="flex-1 flex flex-col h-full items-center justify-center p-8 gap-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Lock className="w-8 h-8 text-primary" />
        </div>
        <h2 className="font-bold text-lg">{t("lockChat")}</h2>
        <p className="text-sm text-muted-foreground text-center">{t("enterPIN")}</p>
        <input
          type="password"
          inputMode="numeric"
          maxLength={8}
          value={lockPinInput}
          onChange={(e) => setLockPinInput(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && handleUnlockChat()}
          placeholder="••••"
          className="w-40 text-center text-lg font-mono tracking-widest bg-input border border-border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/50"
          autoFocus
        />
        {lockPinError && <p className="text-xs text-destructive">{lockPinError}</p>}
        <button
          onClick={handleUnlockChat}
          className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 active:scale-95 transition"
        >
          {t("confirm")}
        </button>
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground transition">
          {t("cancel")}
        </button>
      </section>
    );
  }

  return (
    <section className="relative flex-1 flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 glass border-b border-border">
        <button onClick={onBack} className="md:hidden p-1.5 rounded-lg hover:bg-foreground/5">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => peer.isGroup ? setProfilePage("group") : setProfilePage("user")}
          className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer hover:opacity-80 active:opacity-60 transition"
        >
          <Avatar name={peer.displayName} photoURL={peer.photoURL} size={40} />
          <div className="leading-tight min-w-0 flex-1">
            <p className="font-semibold text-sm truncate flex items-center gap-2">
              {peer.displayName}
              {!peer.isGroup && (
                <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${peerOnline ? "bg-secondary" : "bg-muted-foreground/40"}`} />
              )}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {peer.isGroup
                ? `${peer.memberCount ?? peer.members?.length ?? 0} members`
                : peerTyping
                  ? t("typing")
                  : peerOnline
                    ? t("online")
                    : peerLastSeen
                      ? `${t("lastSeen")} ${formatLastSeen(peerLastSeen, t)}`
                      : peer.email || peer.phone || peer.uid}
            </p>
          </div>
        </button>
        {/* Call buttons — only for direct chats */}
        {onCall && !peer.isGroup && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onCall(peer, "voice")}
              title="Voice call"
              className="w-9 h-9 rounded-full hover:bg-foreground/5 active:scale-95 flex items-center justify-center transition text-muted-foreground hover:text-primary"
            >
              <Phone className="w-4.5 h-4.5" />
            </button>
            <button
              onClick={() => onCall(peer, "video")}
              title="Video call"
              className="w-9 h-9 rounded-full hover:bg-foreground/5 active:scale-95 flex items-center justify-center transition text-muted-foreground hover:text-primary"
            >
              <VideoIcon className="w-4.5 h-4.5" />
            </button>
          </div>
        )}
        {/* ⋮ Three-dot menu */}
        <div ref={headerMenuRef} className="relative">
          <button
            onClick={() => setShowHeaderMenu((v) => !v)}
            className={`w-9 h-9 rounded-full hover:bg-foreground/5 active:scale-95 flex items-center justify-center transition ${showHeaderMenu ? "bg-foreground/8 text-primary" : "text-muted-foreground hover:text-primary"}`}
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
          {showHeaderMenu && (
            <div className="absolute right-0 top-11 z-50 w-44 bg-card border border-border rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
              <button
                onClick={() => {
                  setShowHeaderMenu(false);
                  setSearchQuery("");
                  setSearchMatchIdx(0);
                  setSearchOpen(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-foreground/5 active:bg-foreground/10 transition text-start"
              >
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{t("searchInChat")}</span>
              </button>
              <div className="h-px bg-border" />
              <button
                onClick={() => { setShowHeaderMenu(false); setShowBgPicker(true); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-foreground/5 active:bg-foreground/10 transition text-start"
              >
                <ImageIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{t("chatBg")}</span>
              </button>
              <div className="h-px bg-border" />
              <button
                onClick={() => { setShowHeaderMenu(false); setShowConfirmClear(true); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-destructive/10 active:bg-destructive/15 transition text-start text-destructive"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>{t("clearChat")}</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Search bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-3 py-2 bg-card border-b border-border animate-in slide-in-from-top-2 duration-200">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const dir = e.shiftKey ? -1 : 1;
                setSearchMatchIdx((i) => (i + dir + searchMatches.length) % Math.max(searchMatches.length, 1));
              }
              if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); }
            }}
            placeholder={t("searchInChat")}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground min-w-0"
          />
          {searchQuery.trim() && (
            searchMatches.length > 0 ? (
              <span className="text-xs text-muted-foreground shrink-0 tabular-nums font-mono">
                {searchMatchIdx + 1} / {searchMatches.length}
              </span>
            ) : (
              <span className="text-xs text-red-400 shrink-0">{t("noResults")}</span>
            )
          )}
          {searchMatches.length > 1 && (
            <button
              onClick={() => setSearchMatchIdx((i) => (i - 1 + searchMatches.length) % searchMatches.length)}
              className="p-1 rounded hover:bg-foreground/8 text-muted-foreground transition shrink-0"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          )}
          {searchMatches.length > 1 && (
            <button
              onClick={() => setSearchMatchIdx((i) => (i + 1) % searchMatches.length)}
              className="p-1 rounded hover:bg-foreground/8 text-muted-foreground transition shrink-0"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
            className="p-1 rounded hover:bg-foreground/8 text-muted-foreground transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Background Picker Overlay */}
      {showBgPicker && (
        <div className="absolute inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md">
          <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
            <button
              onClick={() => setShowBgPicker(false)}
              className="w-9 h-9 rounded-full hover:bg-foreground/5 flex items-center justify-center transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="font-semibold text-base flex-1">Chat Wallpaper</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-3 gap-3">
              {chatBg.backgrounds.map((bg) => {
                const isActive = chatBg.bgId === bg.id;
                return (
                  <button
                    key={bg.id}
                    onClick={() => { chatBg.setChatBg(bg.id); setShowBgPicker(false); }}
                    className={`relative aspect-[9/16] rounded-2xl overflow-hidden border-2 transition-all active:scale-95 ${isActive ? "border-primary shadow-lg shadow-primary/30" : "border-transparent"}`}
                  >
                    <div className="absolute inset-0" style={bg.previewStyle} />
                    {isActive && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-4 h-4 text-primary-foreground" />
                        </span>
                      </div>
                    )}
                    <span className="absolute bottom-0 inset-x-0 px-2 py-1.5 text-[10px] font-medium text-white/80 bg-black/40 backdrop-blur-sm truncate text-center">
                      {chatBg.current.id === bg.id ? (chatBg.current.labelAr && chatBg.current.labelEn ? bg.labelEn : bg.labelEn) : bg.labelEn}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Clear Chat Confirmation Dialog */}
      {showConfirmClear && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="glass rounded-3xl p-6 w-full max-w-sm text-center space-y-4 shadow-2xl">
            <p className="font-semibold text-base">{t("confirmClear")}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmClear(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-white/5 transition"
              >
                {t("cancel")}
              </button>
              <button
                onClick={async () => {
                  setShowConfirmClear(false);
                  try {
                    await clearChatMessages(chatId);
                    showToast(t("clearChat"));
                  } catch { showToast("Error clearing chat"); }
                }}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-white text-sm font-medium hover:bg-destructive/90 transition"
              >
                {t("confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Pages — full-screen overlays */}
      {profilePage === "user" && !peer.isGroup && (
        <UserProfilePage
          peer={peer}
          chatId={chatId}
          peerOnline={peerOnline}
          peerLastSeen={peerLastSeen}
          onBack={() => setProfilePage(null)}
          onCall={onCall}
        />
      )}
      {profilePage === "group" && peer.isGroup && (
        <GroupProfilePage
          chatId={chatId}
          group={peer}
          onBack={() => setProfilePage(null)}
          onLeft={() => { setProfilePage(null); onBack(); }}
          onInitiateCall={onCall ? handleGroupMemberCall : undefined}
        />
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin px-4 pb-6 transition-all duration-500"
        style={{ ...chatBg.current.style, overscrollBehaviorY: "contain" }}
        onTouchStart={handlePullStart}
        onTouchMove={handlePullMove}
        onTouchEnd={handlePullEnd}
      >
        {/* Pull-to-refresh indicator */}
        <div
          className="flex justify-center items-end pointer-events-none overflow-hidden transition-all duration-200"
          style={{ height: isRefreshing ? 60 : pullY > 0 ? pullY : 0 }}
        >
          <div
            className="mb-2 w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
            style={{ background: "linear-gradient(135deg,#FF7A1A,#FF4E00)", boxShadow: "0 4px 16px #FF7A1A55" }}
          >
            <RefreshCw
              className={`w-5 h-5 text-white transition-transform duration-300 ${isRefreshing ? "animate-spin" : ""}`}
              style={{ transform: !isRefreshing ? `rotate(${Math.min((pullY / 56) * 180, 180)}deg)` : undefined }}
            />
          </div>
        </div>
        <div className="max-w-2xl mx-auto space-y-4 pt-2">
          {grouped.map((g) => (
            <div key={g.label} className="space-y-2">
              <div className="flex justify-center">
                <span className="text-[11px] uppercase tracking-wide bg-card/80 border border-border rounded-full px-3 py-1 text-muted-foreground">
                  {g.label}
                </span>
              </div>
              {g.items.map((m) => (
                <MessageRow
                  key={m.id}
                  m={m}
                  mine={m.senderId === user.uid}
                  peerUid={peer.uid}
                  myUid={user.uid}
                  peer={peer}
                  isGroup={!!peer.isGroup}
                  senderName={peer.isGroup && m.senderId !== user.uid ? (membersMap[m.senderId] ?? m.senderId.slice(0, 8)) : undefined}
                  onReact={(emoji) => toggleReaction(chatId, m.id, user.uid, emoji).catch(() => {})}
                  onCall={onCall}
                  onLongPress={(msg) => setContextMsg(msg)}
                  highlight={searchOpen && searchQuery.trim() ? searchQuery.trim() : undefined}
                  isCurrentMatch={searchOpen && searchMatches[searchMatchIdx]?.id === m.id}
                  onMountRef={(el) => { if (el) msgRefs.current.set(m.id, el); else msgRefs.current.delete(m.id); }}
                />
              ))}
            </div>
          ))}
          {messages.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-12">
              {t("noMessages")}
            </div>
          )}
        </div>
      </div>

      {/* Upload progress bar */}
      {uploadProgress !== null && (
        <div className="px-4 py-2 border-t border-border bg-card">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-muted-foreground flex-1">{t("uploading")}...</span>
            <span className="text-xs font-mono font-semibold" style={{ color: "#FF7A1A" }}>{uploadProgress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-border overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%`, background: "linear-gradient(90deg,#FF7A1A,#FF4E00)" }}
            />
          </div>
        </div>
      )}

      {uploadHint && (
        <div className="px-4 py-1.5 text-xs text-center text-secondary bg-secondary/10 border-t border-secondary/20">
          {uploadHint}
        </div>
      )}

      {sendError && (
        <div className="px-4 py-1.5 text-xs text-center text-red-400 bg-red-500/10 border-t border-red-500/20">
          ⚠️ {sendError}
        </div>
      )}

      {/* Reply preview bar */}
      {replyTo && (
        <div className="flex items-center gap-3 px-4 py-2 border-t border-border bg-card">
          <div className="w-0.5 self-stretch rounded-full" style={{ background: "#FF7A1A" }} />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold truncate" style={{ color: "#FF7A1A" }}>
              {t("replyingTo")} {replyTo.senderId === user.uid ? t("you") : (peer.displayName ?? "")}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {replyTo.text || `📎 ${replyTo.type}`}
            </p>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="p-1.5 rounded-full hover:bg-foreground/8 transition shrink-0"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Footer */}
      <footer className="glass border-t border-border p-3">
        <div className="max-w-2xl mx-auto flex items-end gap-2">

          {/* Attach button + dropdown */}
          {!isRecording && <div className="relative">
            <button
              title="Attach"
              onClick={() => setShowAttachMenu((v) => !v)}
              className="w-10 h-10 rounded-full hover:bg-foreground/5 flex items-center justify-center transition"
            >
              <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
            </button>

            {showAttachMenu && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowAttachMenu(false)}
                />
                {/* Menu — inputs are EMBEDDED inside each item with opacity:0 overlay */}
                <div className="absolute bottom-12 left-0 z-50 bg-card border border-border rounded-2xl shadow-xl p-2 flex flex-col gap-1 min-w-[170px]">

                  {/* IMAGE — input overlays the entire row */}
                  <div className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent/10 active:bg-accent/20 cursor-pointer overflow-hidden">
                    <ImageIcon className="w-5 h-5 text-accent shrink-0" />
                    <span className="text-sm font-medium pointer-events-none">{t("image")}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={(e) => handleFile(e, "image")}
                    />
                  </div>

                  {/* VIDEO */}
                  <div className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary/10 active:bg-secondary/20 cursor-pointer overflow-hidden">
                    <VideoIcon className="w-5 h-5 text-secondary shrink-0" />
                    <span className="text-sm font-medium pointer-events-none">{t("video")}</span>
                    <input
                      type="file"
                      accept="video/*"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={(e) => handleFile(e, "video")}
                    />
                  </div>

                  {/* FILE */}
                  <div className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/50 active:bg-muted/80 cursor-pointer overflow-hidden">
                    <Paperclip className="w-5 h-5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium pointer-events-none">{t("file")}</span>
                    <input
                      type="file"
                      accept="*/*"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const kind: "image" | "video" | "audio" | "file" =
                          f.type.startsWith("image/") ? "image"
                          : f.type.startsWith("video/") ? "video"
                          : f.type.startsWith("audio/") ? "audio"
                          : "file";
                        handleFile(e, kind);
                      }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>}

          {/* Voice recorder */}
          <AudioRecorder
            t={t}
            onActiveChange={setIsRecording}
            onRecorded={async (blob) => {
              setUploadProgress(0);
              try {
                const uploaded = await uploadMedia(blob, user.uid, chatId, (pct) => setUploadProgress(pct));
                const realId = await sendMessage(chatId, user.uid, {
                  type: "audio",
                  mediaUrl: uploaded.url,
                  mediaName: uploaded.name,
                  mediaMime: uploaded.mime,
                  mediaSize: uploaded.size,
                });
                setUploadProgress(null);
                setMessages((prev) => {
                  if (prev.find((m) => m.id === realId)) return prev;
                  return [
                    ...prev,
                    {
                      id: realId, chatId, senderId: user.uid,
                      type: "audio" as const,
                      mediaUrl: uploaded.url, mediaName: uploaded.name,
                      mediaMime: uploaded.mime, mediaSize: uploaded.size,
                      createdAt: new Date().toISOString(),
                      readBy: [user.uid], reactions: {},
                    },
                  ];
                });
              } catch (err) {
                setUploadProgress(null);
                setUploadHint(`${t("uploadFailed")}: ${(err as { message?: string }).message ?? "unknown"}`);
                setTimeout(() => setUploadHint(null), 4500);
              }
            }}
          />

          {!isRecording && <>
          <textarea
            value={text}
            onChange={(e) => handleTyping(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder={t("typeMessage")}
            rows={1}
            className="flex-1 resize-none max-h-32 bg-input border border-border rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />

          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="w-11 h-11 rounded-full bg-gradient-to-br from-[#FF7A1A] to-[#FF4E00] flex items-center justify-center text-white shadow-lg disabled:opacity-40 hover:scale-105 active:scale-95 transition"
          >
            <Send className="w-5 h-5" />
          </button></>}
        </div>
      </footer>

      {/* WhatsApp-style context menu */}
      {contextMsg && (
        <MessageContextMenu
          msg={contextMsg}
          mine={contextMsg.senderId === user.uid}
          onClose={() => setContextMsg(null)}
          onReact={(emoji) => {
            toggleReaction(chatId, contextMsg.id, user.uid, emoji).catch(() => {});
          }}
          onReply={() => {
            setReplyTo(contextMsg);
            setContextMsg(null);
          }}
          onCopy={() => {
            navigator.clipboard.writeText(contextMsg.text ?? "").catch(() => {});
            showToast(t("msgCopied"));
          }}
          onDelete={() => {
            deleteMessage(contextMsg.id)
              .then(() => setMessages((prev) => prev.filter((m) => m.id !== contextMsg.id)))
              .catch(() => {});
          }}
        />
      )}

      {/* Copied toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] px-5 py-2.5 rounded-2xl text-sm font-medium text-white shadow-xl pointer-events-none"
          style={{ background: "rgba(30,30,32,0.92)", backdropFilter: "blur(12px)" }}>
          {toast}
        </div>
      )}
    </section>
  );
}

/* ─── HighlightText — wraps all query matches with an orange mark ─────────── */
function HighlightText({ text, query }: { text: string; query: string }): React.ReactElement {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[#FF7A1A]/40 text-inherit rounded px-[1px] not-italic">
        {text.slice(idx, idx + query.length)}
      </mark>
      <HighlightText text={text.slice(idx + query.length)} query={query} />
    </>
  );
}

/* ─── MessageRow ──────────────────────────────────────────────────────────── */
// Deterministic color per sender uid — like WhatsApp group names
const GROUP_COLORS = [
  "#FF6B6B","#FF9E4F","#FFCA3A","#6BCB77","#4D96FF",
  "#C77DFF","#FF85A1","#00C9A7","#FFC6FF","#FDFFB6",
];
function senderColor(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length];
}

function MessageRow({
  m, mine, peerUid, myUid, peer, isGroup, senderName, onReact, onCall, onLongPress,
  highlight, isCurrentMatch, onMountRef,
}: {
  m: MessageDoc; mine: boolean; peerUid: string; myUid: string;
  peer: AppUser;
  isGroup?: boolean;
  senderName?: string;
  onReact: (emoji: string) => void;
  onCall?: (peer: AppUser, kind: CallKind) => void;
  onLongPress: (m: MessageDoc) => void;
  highlight?: string;
  isCurrentMatch?: boolean;
  onMountRef?: (el: HTMLDivElement | null) => void;
}) {
  const longPressTimer = useRef<number | null>(null);
  const lastTapRef = useRef<number>(0);

  const grouped = useMemo(() => {
    const counts: Record<string, number> = {};
    const mineEmoji = m.reactions?.[myUid];
    Object.values(m.reactions ?? {}).forEach((e) => { counts[e] = (counts[e] ?? 0) + 1; });
    return { counts, mineEmoji };
  }, [m.reactions, myUid]);

  function trigger() { onLongPress(m); }

  function handleTouchStart() {
    longPressTimer.current = window.setTimeout(trigger, 480);
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (longPressTimer.current) { window.clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    const now = Date.now();
    if (now - lastTapRef.current < 340) { e.preventDefault(); trigger(); }
    lastTapRef.current = now;
  }
  function handleTouchMove() {
    if (longPressTimer.current) { window.clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }

  return (
    <div ref={onMountRef} className={`group/msg flex ${mine ? "justify-end" : "justify-start"} relative`}>
      <div className={`relative max-w-[78%] transition-all duration-300 ${isCurrentMatch ? "scale-[1.02]" : ""}`}>
        {/* Group sender name */}
        {isGroup && senderName && !mine && (
          <p className="text-[11px] font-semibold mb-0.5 px-1 leading-tight" style={{ color: senderColor(m.senderId) }}>
            {senderName}
          </p>
        )}
        <div
          className={`rounded-2xl px-3 py-2 ${mine ? "bubble-out" : "bubble-in"} select-none cursor-pointer ${isCurrentMatch ? "ring-2 ring-[#FF7A1A]/70 ring-offset-1" : ""}`}
          style={{ borderTopRightRadius: mine ? 6 : undefined, borderTopLeftRadius: mine ? undefined : 6 }}
          onDoubleClick={trigger}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchMove}
          onContextMenu={(e) => { e.preventDefault(); trigger(); }}
        >
          {/* Quoted reply preview */}
          {m.replyToText && (
            <div className="rounded-xl px-2.5 py-1.5 mb-2 border-l-2 border-[#FF7A1A] bg-foreground/10 max-w-full overflow-hidden">
              <p className="text-[11px] font-semibold mb-0.5 truncate" style={{ color: "#FF7A1A" }}>{m.replyToSender}</p>
              <p className="text-[11px] text-foreground/70 line-clamp-2 leading-snug">{m.replyToText}</p>
            </div>
          )}
          <MessageBody m={m} isMine={mine} peer={peer} onCall={onCall} highlight={highlight} />
          <div className={`flex items-center gap-1 mt-1 text-[10px] ${mine ? "text-white/80 justify-end" : "text-muted-foreground"}`}>
            <span>
              {m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
            </span>
            {mine && (m.readBy?.includes(peerUid)
              ? <CheckCheck className="w-3.5 h-3.5" />
              : <Check className="w-3.5 h-3.5" />
            )}
          </div>
        </div>

        {/* Reaction pill badges */}
        {Object.keys(grouped.counts).length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${mine ? "justify-end" : "justify-start"}`}>
            {Object.entries(grouped.counts).map(([key, count]) => (
              <button
                key={key}
                onClick={() => onReact(key)}
                className={`text-xs px-2 py-0.5 rounded-full glass border flex items-center gap-1 hover:scale-105 active:scale-95 transition ${grouped.mineEmoji === key ? "border-primary" : "border-transparent"}`}
              >
                <ReactionIcon value={key} />
                <span className="text-[10px] text-muted-foreground">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── MessageContextMenu — WhatsApp-style bottom sheet ───────────────────── */
function MessageContextMenu({
  msg, mine, onClose, onReact, onReply, onCopy, onDelete,
}: {
  msg: MessageDoc;
  mine: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const { t } = useLang();

  type Action = { icon: React.ElementType; label: string; fn: () => void; danger?: boolean };
  const actions: Action[] = [
    { icon: CornerUpLeft, label: t("reply"),    fn: onReply },
    ...(msg.type === "text" ? [{ icon: Copy,    label: t("copyText"), fn: onCopy }] : []),
    ...(mine               ? [{ icon: Trash2,   label: t("deleteMsg"), fn: onDelete, danger: true }] : []),
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-[60] rounded-t-3xl overflow-hidden shadow-2xl bg-card border-t border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Message preview strip */}
        <div className={`flex ${mine ? "justify-end" : "justify-start"} px-4 pt-4 pb-3 border-b border-border`}>
          <div
            className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? "bubble-out" : "bubble-in"} opacity-90`}
            style={{ borderTopRightRadius: mine ? 6 : undefined, borderTopLeftRadius: mine ? undefined : 6 }}
          >
            {msg.replyToText && (
              <div className="rounded-xl px-2.5 py-1.5 mb-2 border-l-2 border-[#FF7A1A] bg-foreground/10 overflow-hidden">
                <p className="text-[10px] font-semibold truncate" style={{ color: "#FF7A1A" }}>{msg.replyToSender}</p>
                <p className="text-[10px] text-foreground/70 line-clamp-1">{msg.replyToText}</p>
              </div>
            )}
            <p className="whitespace-pre-wrap break-words line-clamp-3">
              {msg.type === "text" ? msg.text : `📎 ${msg.type}`}
            </p>
          </div>
        </div>

        {/* Emoji reaction row */}
        <div className="flex items-center justify-around px-6 py-3 border-b border-border">
          {REACTIONS.map(({ key, emoji }) => (
            <button
              key={key}
              onClick={() => { onReact(key); onClose(); }}
              className="w-12 h-12 flex items-center justify-center text-[26px] hover:bg-foreground/8 active:scale-90 transition-all rounded-full"
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Action items */}
        <div className="py-1">
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={() => { a.fn(); onClose(); }}
              className="w-full flex items-center gap-4 px-6 py-4 hover:bg-foreground/[0.06] active:bg-foreground/10 transition text-left"
            >
              <a.icon className={`w-5 h-5 shrink-0 ${a.danger ? "text-red-400" : "text-[#FF7A1A]"}`} />
              <span className={`text-sm font-medium ${a.danger ? "text-red-400" : "text-foreground"}`}>{a.label}</span>
            </button>
          ))}
        </div>

        {/* Cancel */}
        <button
          onClick={onClose}
          className="w-full py-4 text-sm font-semibold text-muted-foreground border-t border-border hover:bg-foreground/[0.04] transition"
        >
          {t("cancel")}
        </button>
      </div>
    </>
  );
}

/* ─── MessageBody ─────────────────────────────────────────────────────────── */
function formatBytes(n?: number) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function downloadMedia(url: string, name: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch {
    window.open(url, "_blank");
  }
}

function MessageBody({
  m, isMine, peer, onCall, highlight,
}: {
  m: MessageDoc;
  isMine: boolean;
  peer?: AppUser;
  onCall?: (peer: AppUser, kind: CallKind) => void;
  highlight?: string;
}) {
  const { t } = useLang();
  if (m.type === "image" && m.mediaUrl) {
    return (
      <div className="relative group">
        <a href={m.mediaUrl} target="_blank" rel="noreferrer">
          <img src={m.mediaUrl} alt={m.mediaName || "image"} className="rounded-lg max-h-80 object-cover" />
        </a>
        <button
          title="Download"
          onClick={() => downloadMedia(m.mediaUrl!, m.mediaName || "image")}
          className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 active:opacity-100 transition"
        >
          <Download className="w-4 h-4 text-white" />
        </button>
      </div>
    );
  }
  if (m.type === "video" && m.mediaUrl) {
    return (
      <div className="relative group">
        <video
          src={m.mediaUrl}
          controls
          playsInline
          preload="metadata"
          className="rounded-lg max-h-80 w-full"
          style={{ WebkitPlaysinline: true } as React.CSSProperties}
        />
        <button
          title="Download"
          onClick={() => downloadMedia(m.mediaUrl!, m.mediaName || "video")}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 active:opacity-100 transition z-10"
        >
          <Download className="w-4 h-4 text-white" />
        </button>
      </div>
    );
  }
  if (m.type === "audio" && m.mediaUrl) {
    return <AudioPlayer src={m.mediaUrl} name={m.mediaName} isMine={isMine} />;
  }
  if (m.type === "file" && m.mediaUrl) {
    return (
      <a
        href={m.mediaUrl}
        download={m.mediaName || "file"}
        target="_blank"
        rel="noreferrer"
        className={`flex items-center gap-3 rounded-lg p-2.5 max-w-xs transition ${
          isMine ? "bg-white/15 hover:bg-white/25" : "bg-foreground/[0.07] hover:bg-foreground/[0.11]"
        }`}
      >
        <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${isMine ? "bg-white/20" : "bg-primary/20"}`}>
          <FileText className={`w-5 h-5 ${isMine ? "text-white" : "text-primary"}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{m.mediaName || "file"}</p>
          <p className="text-[11px] opacity-70">{formatBytes(m.mediaSize)}</p>
        </div>
        <Download className="w-4 h-4 opacity-70 shrink-0" />
      </a>
    );
  }
  if (m.type === "call_ended" || m.type === "call_missed") {
    const isMissed = m.type === "call_missed";
    const canCallback = isMissed && !!peer && !!onCall;
    return (
      <div className="flex flex-col gap-2 py-0.5 min-w-[160px]">
        <div className={`flex items-center gap-2 text-sm ${isMissed ? (isMine ? "text-white/80" : "text-red-400") : "opacity-80"}`}>
          {isMissed
            ? <PhoneOff className="w-4 h-4 shrink-0" />
            : <Phone className="w-4 h-4 shrink-0" />
          }
          <span>{m.text || (isMissed ? "Missed call" : "Call ended")}</span>
        </div>
        {canCallback && (
          <div className="flex gap-2 pt-0.5">
            <button
              onClick={() => onCall!(peer!, "voice")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition active:scale-95 ${
                isMine
                  ? "bg-white/20 text-white hover:bg-white/30"
                  : "bg-secondary/20 text-secondary hover:bg-secondary/30"
              }`}
            >
              <Phone className="w-3.5 h-3.5" />
              {t("callBack")}
            </button>
            <button
              onClick={() => onCall!(peer!, "video")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition active:scale-95 ${
                isMine
                  ? "bg-white/20 text-white hover:bg-white/30"
                  : "bg-accent/20 text-accent hover:bg-accent/30"
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              {t("videoCallBtn")}
            </button>
          </div>
        )}
      </div>
    );
  }
  return (
    <p className="text-sm whitespace-pre-wrap break-words">
      {highlight && m.text
        ? <HighlightText text={m.text} query={highlight} />
        : m.text}
    </p>
  );
}

/* ─── AudioPlayer ─────────────────────────────────────────────────────────── */
const PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2] as const;

function AudioPlayer({ src, name, isMine }: { src: string; name?: string; isMine: boolean }) {
  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [errored,  setErrored]  = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const a = new Audio(src);
    audioRef.current = a;
    a.playbackRate = PLAYBACK_SPEEDS[1];
    a.onloadedmetadata = () => setDuration(a.duration);
    a.ontimeupdate = () => setProgress(a.currentTime);
    a.onended = () => { setPlaying(false); setProgress(0); };
    a.onerror = () => setErrored(true);
    return () => { a.pause(); audioRef.current = null; };
  }, [src]);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().then(() => setPlaying(true)).catch(() => setErrored(true)); }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const t = parseFloat(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = t;
    setProgress(t);
  }

  function cycleSpeed() {
    const next = (speedIdx + 1) % PLAYBACK_SPEEDS.length;
    setSpeedIdx(next);
    if (audioRef.current) audioRef.current.playbackRate = PLAYBACK_SPEEDS[next];
  }

  function fmt(s: number) {
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  }

  const btnBg  = isMine ? "bg-white/25 hover:bg-white/40 active:bg-white/50" : "bg-primary/20 hover:bg-primary/30 active:bg-primary/40";
  const iconCls = isMine ? "text-white"    : "text-primary";
  const timeCls = isMine ? "text-white/70" : "text-muted-foreground";
  const speedCls = isMine
    ? "border-white/30 text-white/80 hover:bg-white/10"
    : "border-primary/30 text-primary hover:bg-primary/10";

  if (errored) {
    return (
      <a href={src} download={name || "voice.mp3"} target="_blank" rel="noreferrer"
        className={`flex items-center gap-2 text-xs underline py-1 ${isMine ? "text-white/90" : "text-primary"}`}>
        <Download className="w-4 h-4" />
        {name || "Download audio"}
      </a>
    );
  }

  return (
    <div className="flex flex-col gap-1 w-60 max-w-full">
      <div className="flex items-center gap-2">
        <button
          onClick={toggle}
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition ${btnBg}`}
        >
          {playing
            ? <Pause className={`w-4 h-4 ${iconCls}`} />
            : <Play  className={`w-4 h-4 ${iconCls}`} />}
        </button>
        <div className="flex-1 min-w-0">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.01}
            value={progress}
            onChange={handleSeek}
            className="w-full h-1.5 rounded-full cursor-pointer"
            style={{ accentColor: isMine ? "white" : "var(--primary)" }}
          />
          <div className="flex items-center justify-between mt-0.5">
            <p className={`text-[10px] ${timeCls}`}>
              {fmt(progress)} / {duration > 0 ? fmt(duration) : "--:--"}
            </p>
            <button
              onClick={cycleSpeed}
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border transition ${speedCls}`}
            >
              {PLAYBACK_SPEEDS[speedIdx]}×
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── AudioRecorder ───────────────────────────────────────────────────────── */
type RecMode = "idle" | "hold" | "locked" | "paused";

function AudioRecorder({
  onRecorded, t, onActiveChange,
}: {
  onRecorded: (blob: Blob) => void | Promise<void>;
  t: (key: string) => string;
  onActiveChange?: (active: boolean) => void;
}) {
  const BAR_COUNT = 28;
  const [mode, setMode]         = useState<RecMode>("idle");
  const [seconds, setSeconds]   = useState(0);
  const [bars, setBars]         = useState<number[]>(Array(BAR_COUNT).fill(4));
  const [dragOffset, setDragOffset] = useState(0);

  const recRef         = useRef<MediaRecorder | null>(null);
  const chunksRef      = useRef<Blob[]>([]);
  const streamRef      = useRef<MediaStream | null>(null);
  const mimeTypeRef    = useRef<string>("audio/webm");
  const shouldSendRef  = useRef(false);
  const timerRef       = useRef<number | null>(null);
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const animRef        = useRef<number | null>(null);
  const hasAnalyserRef = useRef(false);
  const phaseRef       = useRef(0);
  const dragStartXRef  = useRef<number | null>(null);

  function changeMode(m: RecMode) {
    setMode(m);
    onActiveChange?.(m !== "idle");
  }

  function animateBars() {
    if (hasAnalyserRef.current && analyserRef.current) {
      const data = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(data);
      const step = Math.max(1, Math.floor(data.length / BAR_COUNT));
      setBars(Array.from({ length: BAR_COUNT }, (_, i) => {
        const raw = data[Math.min(i * step, data.length - 1)] / 255;
        return Math.max(3, Math.round(raw * 32));
      }));
    } else {
      phaseRef.current += 0.18;
      const p = phaseRef.current;
      setBars(Array.from({ length: BAR_COUNT }, (_, i) => {
        const wave =
          Math.sin(p + i * 0.45) * 0.4 +
          Math.sin(p * 1.3 + i * 0.7) * 0.35 +
          Math.sin(p * 0.7 + i * 0.25) * 0.25;
        return Math.max(3, Math.round(((wave + 1) / 2) * 28 + 4));
      }));
    }
    animRef.current = requestAnimationFrame(animateBars);
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      hasAnalyserRef.current = false;
      try {
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        ctx.createMediaStreamSource(stream).connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        hasAnalyserRef.current = true;
      } catch { /* fallback wave */ }
      animRef.current = requestAnimationFrame(animateBars);

      const candidates = ["audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
      const mimeType = candidates.find(
        (c) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c),
      );
      mimeTypeRef.current = mimeType ?? "audio/webm";

      const rec = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 })
        : new MediaRecorder(stream);
      recRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
      rec.onstop = () => {
        streamRef.current?.getTracks().forEach((tr) => tr.stop());
        if (shouldSendRef.current && chunksRef.current.length > 0) {
          onRecorded(new Blob(chunksRef.current, { type: mimeTypeRef.current }));
        }
      };
      rec.start(250);
      shouldSendRef.current = false;
      changeMode("hold");
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch { alert(t("micDenied")); }
  }

  function stopCleanup() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (animRef.current)  { cancelAnimationFrame(animRef.current); animRef.current = null; }
    audioCtxRef.current?.close().catch(() => {});
    hasAnalyserRef.current = false;
    setBars(Array(BAR_COUNT).fill(4));
    setDragOffset(0);
  }

  function stopAndSend() {
    shouldSendRef.current = true;
    const rec = recRef.current;
    stopCleanup();
    if (rec && rec.state !== "inactive") rec.stop();
    else streamRef.current?.getTracks().forEach((tr) => tr.stop());
    changeMode("idle");
    setSeconds(0);
  }

  function cancelRecording() {
    shouldSendRef.current = false;
    const rec = recRef.current;
    stopCleanup();
    if (rec && rec.state !== "inactive") rec.stop();
    else streamRef.current?.getTracks().forEach((tr) => tr.stop());
    changeMode("idle");
    setSeconds(0);
  }

  function togglePause() {
    const rec = recRef.current;
    if (!rec) return;
    if (mode === "locked") {
      if (rec.state === "recording") rec.pause();
      changeMode("paused");
    } else if (mode === "paused") {
      if (rec.state === "paused") rec.resume();
      changeMode("locked");
    }
  }

  function fmt(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function onDragStart(e: React.PointerEvent) {
    dragStartXRef.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onDragMove(e: React.PointerEvent) {
    if (dragStartXRef.current === null) return;
    const dx = e.clientX - dragStartXRef.current;
    if (dx < 0) setDragOffset(dx);
    if (dx < -90) cancelRecording();
  }

  function onDragEnd() {
    dragStartXRef.current = null;
    setDragOffset(0);
  }

  /* ── Idle ── */
  if (mode === "idle") {
    return (
      <button
        onClick={start}
        title={t("voiceMessage")}
        className="hover:bg-foreground/5 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition"
      >
        <Mic className="w-5 h-5 text-primary" />
      </button>
    );
  }

  /* ── Hold (slide-to-cancel) ── */
  if (mode === "hold") {
    return (
      <div className="flex-1 flex items-center gap-2 min-w-0 select-none">
        {/* Pulse dot + timer */}
        <span className="w-2.5 h-2.5 rounded-full bg-destructive shrink-0 animate-pulse" />
        <span className="text-xs font-mono tabular-nums text-destructive font-semibold shrink-0 w-10">
          {fmt(seconds)}
        </span>

        {/* Swipe-to-cancel — draggable */}
        <div
          className="flex-1 flex items-center gap-0.5 cursor-grab active:cursor-grabbing touch-none overflow-hidden"
          style={{
            transform: `translateX(${dragOffset}px)`,
            transition: dragOffset === 0 ? "transform 0.2s ease" : "none",
            opacity: Math.max(0.25, 1 + dragOffset / 160),
          }}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <ChevronLeft className="w-4 h-4 text-muted-foreground shrink-0" />
          <ChevronLeft className="w-4 h-4 text-muted-foreground/40 shrink-0 -ml-2.5" />
          <span className="text-sm text-muted-foreground truncate ml-0.5">
            {t("slideToCancel")}
          </span>
        </div>

        {/* Lock button */}
        <button
          onClick={() => changeMode("locked")}
          className="w-9 h-9 rounded-full border border-border bg-card/80 flex items-center justify-center shrink-0 hover:bg-foreground/8 active:scale-90 transition"
        >
          <Lock className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  /* ── Locked / Paused ── */
  return (
    <div className="flex-1 flex flex-col gap-1 min-w-0 py-0.5">
      {/* Waveform row */}
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-destructive shrink-0 animate-pulse" />
        <span className="text-xs font-mono tabular-nums text-destructive font-semibold shrink-0 w-10">
          {fmt(seconds)}
        </span>
        <div className="flex items-center gap-[2px] h-7 flex-1 overflow-hidden">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-full transition-none"
              style={{
                height: `${h}px`,
                maxHeight: "24px",
                minHeight: "2px",
                background: mode === "paused"
                  ? "rgba(255,255,255,0.35)"
                  : i % 3 === 0
                    ? `rgba(255,122,26,${0.6 + (h / 36) * 0.4})`
                    : i % 3 === 1
                      ? `rgba(255,255,255,${0.5 + (h / 36) * 0.5})`
                      : `rgba(255,78,0,${0.55 + (h / 36) * 0.45})`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Action row: trash | pause/resume | send */}
      <div className="flex items-center justify-between px-1">
        <button
          onClick={cancelRecording}
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-destructive/10 active:scale-90 transition"
        >
          <Trash2 className="w-5 h-5 text-destructive" />
        </button>

        <button
          onClick={togglePause}
          className="w-11 h-11 rounded-full border-2 border-destructive flex items-center justify-center hover:bg-destructive/10 active:scale-90 transition"
        >
          {mode === "paused"
            ? <Play  className="w-5 h-5 text-destructive ml-0.5" />
            : <Pause className="w-5 h-5 text-destructive" />}
        </button>

        <button
          onClick={stopAndSend}
          className="w-11 h-11 rounded-full bg-gradient-to-br from-[#25D366] to-[#128C7E] flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition"
        >
          <Send className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function groupByDay(messages: MessageDoc[], t: (k: string) => string) {
  const groups: { label: string; items: MessageDoc[] }[] = [];
  for (const m of messages) {
    const d = m.createdAt ? new Date(m.createdAt) : null;
    const label = d ? dayLabel(d, t) : "Pending";
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(m);
    else groups.push({ label, items: [m] });
  }
  return groups;
}

function formatLastSeen(d: Date, t: (k: string) => string) {
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return t("justNow");
  if (min < 60) return `${min}${t("minAgo")}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}${t("hAgo")}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function dayLabel(d: Date, t: (k: string) => string) {
  const today = new Date();
  const yest  = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t("today");
  if (d.toDateString() === yest.toDateString())  return t("yesterday");
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}
