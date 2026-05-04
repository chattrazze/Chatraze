import { useEffect, useMemo, useRef, useState } from "react";
import {
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
  Download,
  FileText,
  ImageIcon,
  Lock,
  Mic,
  MoreHorizontal,
  Paperclip,
  Pause,
  Phone,
  PhoneOff,
  Play,
  Send,
  Square,
  Users,
  Video,
  Video as VideoIcon,
  X,
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
  const [sendError, setSendError] = useState<string | null>(null);
  const [peerOnline, setPeerOnline] = useState<boolean>(!!peer.online);
  const [peerLastSeen, setPeerLastSeen] = useState<Date | null>(null);
  const [peerTyping, setPeerTyping] = useState<boolean>(false);
  const typingTimerRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  // "user" | "group" | null
  const [profilePage, setProfilePage] = useState<"user" | "group" | null>(null);
  const [chatUnlocked, setChatUnlocked] = useState<boolean>(() => {
    const pin = localStorage.getItem(`chatrazze:lock:${chatId}`);
    if (!pin) return true;
    return sessionStorage.getItem(`chatrazze:unlocked:${chatId}`) === "1";
  });
  const [lockPinInput, setLockPinInput] = useState("");
  const [lockPinError, setLockPinError] = useState("");

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
  }, [chatId, user, peer, t]);

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

  const grouped = useMemo(() => groupByDay(messages, t), [messages, t]);
  const chatBg  = useChatBg(user?.uid ?? "");

  if (!user) return null;

  async function handleSend() {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    setSendError(null);
    setText("");

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
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const realId = await sendMessage(chatId, user!.uid, { type: "text", text: msg });
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
    setUploadHint(`${t("uploading")} ${kind}...`);
    try {
      const uploaded = await uploadMedia(f, user!.uid, chatId);
      const realId = await sendMessage(chatId, user!.uid, {
        type: kind,
        mediaUrl: uploaded.url,
        mediaName: uploaded.name,
        mediaMime: uploaded.mime,
        mediaSize: uploaded.size,
      });
      setUploadHint(null);
      // Immediately add to messages without waiting for realtime
      setMessages((prev) => {
        if (prev.find((m) => m.id === realId)) return prev;
        return [
          ...prev,
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
    <section className="flex-1 flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 glass border-b border-border">
        <button onClick={onBack} className="md:hidden p-1.5 rounded-lg hover:bg-white/5">
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
              className="w-9 h-9 rounded-full hover:bg-white/5 active:scale-95 flex items-center justify-center transition text-muted-foreground hover:text-primary"
            >
              <Phone className="w-4.5 h-4.5" />
            </button>
            <button
              onClick={() => onCall(peer, "video")}
              title="Video call"
              className="w-9 h-9 rounded-full hover:bg-white/5 active:scale-95 flex items-center justify-center transition text-muted-foreground hover:text-primary"
            >
              <VideoIcon className="w-4.5 h-4.5" />
            </button>
          </div>
        )}
      </header>

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
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 py-6 transition-all duration-500" style={chatBg.current.style}>
        <div className="max-w-2xl mx-auto space-y-4">
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

      {/* Footer */}
      <footer className="glass border-t border-border p-3">
        <div className="max-w-2xl mx-auto flex items-end gap-2">

          {/* Attach button + dropdown */}
          <div className="relative">
            <button
              title="Attach"
              onClick={() => setShowAttachMenu((v) => !v)}
              className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center transition"
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
          </div>

          {/* Voice recorder */}
          <AudioRecorder
            t={t}
            onRecorded={async (blob) => {
              setUploadHint(`${t("uploading")} ${t("voiceMessage")}...`);
              try {
                const ext = blob.type.includes("mp4") || blob.type.includes("aac") ? "mp4"
                  : blob.type.includes("ogg") ? "ogg" : "webm";
                const uploaded = await uploadMedia(blob, user.uid, chatId);
                const realId = await sendMessage(chatId, user.uid, {
                  type: "audio",
                  mediaUrl: uploaded.url,
                  mediaName: uploaded.name,
                  mediaMime: uploaded.mime,
                  mediaSize: uploaded.size,
                });
                setUploadHint(null);
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
                setUploadHint(`${t("uploadFailed")}: ${(err as { message?: string }).message ?? "unknown"}`);
                setTimeout(() => setUploadHint(null), 4500);
              }
            }}
          />

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
          </button>
        </div>
      </footer>
    </section>
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
  m, mine, peerUid, myUid, peer, isGroup, senderName, onReact, onCall,
}: {
  m: MessageDoc; mine: boolean; peerUid: string; myUid: string;
  peer: AppUser;
  isGroup?: boolean;
  senderName?: string;
  onReact: (emoji: string) => void;
  onCall?: (peer: AppUser, kind: CallKind) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const lastTapRef = useRef<number>(0);

  const grouped = useMemo(() => {
    const counts: Record<string, number> = {};
    const mineEmoji = m.reactions?.[myUid];
    Object.values(m.reactions ?? {}).forEach((e) => { counts[e] = (counts[e] ?? 0) + 1; });
    return { counts, mineEmoji };
  }, [m.reactions, myUid]);

  // Double-tap for mobile, double-click for desktop
  function handleDoubleTap() {
    setPickerOpen((v) => !v);
  }

  function handleTouchEnd() {
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      handleDoubleTap();
    }
    lastTapRef.current = now;
  }

  return (
    <div className={`group/msg flex ${mine ? "justify-end" : "justify-start"} relative`}>
      <div className="relative max-w-[78%]">
        {/* Group sender name — shown above bubble for others' messages */}
        {isGroup && senderName && !mine && (
          <p
            className="text-[11px] font-semibold mb-0.5 px-1 leading-tight"
            style={{ color: senderColor(m.senderId) }}
          >
            {senderName}
          </p>
        )}
        <div
          className={`rounded-2xl px-3 py-2 ${mine ? "bubble-out" : "bubble-in"} select-none`}
          style={{ borderTopRightRadius: mine ? 6 : undefined, borderTopLeftRadius: mine ? undefined : 6 }}
          onDoubleClick={handleDoubleTap}
          onTouchEnd={handleTouchEnd}
        >
          <MessageBody m={m} isMine={mine} peer={peer} onCall={onCall} />
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

        {pickerOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setPickerOpen(false)} />
            <div className={`absolute z-40 -top-16 ${mine ? "right-0" : "left-0"} glass rounded-2xl px-3 py-2 shadow-2xl flex items-center gap-1 border border-border`}>
              {REACTIONS.map(({ key, emoji, label }) => (
                <button
                  key={key}
                  onClick={() => { onReact(key); setPickerOpen(false); }}
                  title={label}
                  className={`w-10 h-10 rounded-xl hover:bg-white/10 active:scale-90 transition flex items-center justify-center text-2xl leading-none ${grouped.mineEmoji === key ? "bg-white/15 ring-2 ring-primary/50" : ""}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── MessageBody ─────────────────────────────────────────────────────────── */
function formatBytes(n?: number) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function MessageBody({
  m, isMine, peer, onCall,
}: {
  m: MessageDoc;
  isMine: boolean;
  peer?: AppUser;
  onCall?: (peer: AppUser, kind: CallKind) => void;
}) {
  const { t } = useLang();
  if (m.type === "image" && m.mediaUrl) {
    return (
      <a href={m.mediaUrl} target="_blank" rel="noreferrer">
        <img src={m.mediaUrl} alt={m.mediaName || "image"} className="rounded-lg max-h-80 object-cover" />
      </a>
    );
  }
  if (m.type === "video" && m.mediaUrl) {
    return <video src={m.mediaUrl} controls className="rounded-lg max-h-80 w-full" />;
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
          isMine ? "bg-white/15 hover:bg-white/25" : "bg-black/10 hover:bg-black/15 dark:bg-white/5 dark:hover:bg-white/10"
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
  return <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>;
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
function AudioRecorder({
  onRecorded, t,
}: {
  onRecorded: (blob: Blob) => void | Promise<void>;
  t: (key: string) => string;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds,   setSeconds]   = useState(0);
  const [bars, setBars] = useState<number[]>(Array(12).fill(3));
  const recRef      = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const timerRef    = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animRef     = useRef<number | null>(null);

  function animateBars() {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    const count = 12;
    const step = Math.max(1, Math.floor(data.length / count));
    const newBars = Array.from({ length: count }, (_, i) => {
      const val = data[Math.min(i * step, data.length - 1)] / 255;
      return Math.max(3, Math.round(val * 28));
    });
    setBars(newBars);
    animRef.current = requestAnimationFrame(animateBars);
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      try {
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        ctx.createMediaStreamSource(stream).connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        animRef.current = requestAnimationFrame(animateBars);
      } catch { /* waveform optional */ }

      const candidates = ["audio/mp4","audio/aac","audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus"];
      const mimeType = candidates.find(
        (c) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c),
      );
      const rec = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 })
        : new MediaRecorder(stream);
      recRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
      rec.onstop = () => {
        const type = mimeType || rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        stream.getTracks().forEach((tr) => tr.stop());
        onRecorded(blob);
        setSeconds(0);
        if (animRef.current) cancelAnimationFrame(animRef.current);
        audioCtxRef.current?.close().catch(() => {});
        setBars(Array(12).fill(3));
      };
      rec.start(250);
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch { alert(t("micDenied")); }
  }

  function stop() {
    recRef.current?.stop();
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (animRef.current)  { cancelAnimationFrame(animRef.current); animRef.current = null; }
  }

  function fmt(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  if (recording) {
    return (
      <button
        onClick={stop}
        title={t("stopRecording")}
        className="flex items-center gap-1.5 px-3 h-10 rounded-full bg-destructive text-white min-w-[130px] shrink-0"
      >
        <Square className="w-3 h-3 shrink-0" />
        <div className="flex items-end gap-[2px] h-6">
          {bars.map((h, i) => (
            <div
              key={i}
              className="w-[3px] rounded-full bg-white/90 transition-all duration-75"
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
        <span className="text-xs font-mono tabular-nums ml-0.5">{fmt(seconds)}</span>
      </button>
    );
  }

  return (
    <button
      onClick={start}
      title={t("voiceMessage")}
      className="hover:bg-white/5 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition"
    >
      <Mic className="w-5 h-5 text-primary" />
    </button>
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
