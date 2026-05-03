import { useEffect, useRef, useState, useCallback } from "react";
import {
  CircleDot,
  Image as ImageIcon,
  Plus,
  X,
  FileText,
  Heart,
  MoreVertical,
  Send,
  Eye,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/Toast";
import { useLang } from "@/hooks/useLang";
import { supabase } from "@/lib/supabase";
import {
  type UserStatus,
  type StatusView,
  deleteStatus,
  loadActiveStatuses,
  loadMyViews,
  loadStatusViews,
  addStatusInteraction,
  subscribeToStatusChanges,
  upsertStatus,
  viewStatus,
} from "@/lib/statusService";
import { createChat, sendMessage } from "@/lib/chatService";
import { getUser } from "@/lib/userService";
import type { AppUser } from "@/lib/userService";

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeLeft(createdIso: string): string {
  const created = new Date(createdIso).getTime();
  const TTL_MS = 24 * 60 * 60 * 1000;
  const remaining = TTL_MS - (Date.now() - created);
  if (remaining <= 0) return "expired";
  const h = Math.floor(remaining / (60 * 60 * 1000));
  if (h >= 1) return `${h}h`;
  const m = Math.max(1, Math.floor(remaining / (60 * 1000)));
  return `${m}m`;
}

function formatViewerTime(createdIso: string): string {
  const d = new Date(createdIso);
  const now = new Date();
  const hhmm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();
  if (isToday) return `اليوم، ${hhmm}`;
  if (isYesterday) return `أمس، ${hhmm}`;
  return `${d.toLocaleDateString([], { day: "2-digit", month: "2-digit" })}، ${hhmm}`;
}

const STATUS_BUCKET = "chat-media";
const STORY_DURATION_MS = 6000;

async function compressImage(blob: Blob, maxDim = 1600, quality = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => { URL.revokeObjectURL(url); resolve(i); };
    i.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image decode failed")); };
    i.src = url;
  });
  const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => { if (b) resolve(b); else reject(new Error("Canvas toBlob failed")); },
      "image/jpeg", quality,
    );
  });
}

async function uploadStatusImage(file: File, uid: string): Promise<string> {
  const compressed = file.type.startsWith("image/")
    ? await compressImage(file, 1600, 0.85) : file;
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
  const path = `status/${uid}/${Date.now()}_${safe}`;
  const { data, error } = await supabase.storage
    .from(STATUS_BUCKET)
    .upload(path, compressed, { cacheControl: "31536000", upsert: false, contentType: file.type || "image/jpeg" });
  if (error) throw new Error(error.message || "Upload failed");
  const { data: urlData } = supabase.storage.from(STATUS_BUCKET).getPublicUrl(data.path);
  return urlData.publicUrl;
}

// ── WhatsApp-style Status Viewer ─────────────────────────────────────────────

interface ViewerProps {
  statuses: UserStatus[];
  startIndex: number;
  myUid: string;
  myName: string;
  onClose: () => void;
  onOpenChat: (chatId: string, peer: AppUser) => void;
}

function StatusViewer({ statuses, startIndex, myUid, myName, onClose, onOpenChat }: ViewerProps) {
  const [idx, setIdx] = useState(startIndex);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [liked, setLiked] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSeenBy, setShowSeenBy] = useState(false);
  const [seenByList, setSeenByList] = useState<(StatusView & { profile?: AppUser })[]>([]);
  const [seenLoading, setSeenLoading] = useState(false);
  const progressRef = useRef<number | null>(null);
  const startRef = useRef<number>(Date.now());

  const current = statuses[idx];
  const isOwn = current?.user_id === myUid;

  const goNext = useCallback(() => {
    setLiked(false);
    setReply("");
    if (idx < statuses.length - 1) {
      setIdx((i) => i + 1);
      setProgress(0);
      startRef.current = Date.now();
    } else {
      onClose();
    }
  }, [idx, statuses.length, onClose]);

  const goPrev = useCallback(() => {
    setLiked(false);
    setReply("");
    if (idx > 0) {
      setIdx((i) => i - 1);
      setProgress(0);
      startRef.current = Date.now();
    }
  }, [idx]);

  // Load seen-by when switching to own status
  useEffect(() => {
    if (!isOwn || !current) return;
    setSeenLoading(true);
    loadStatusViews(current.id).then(async (views) => {
      const withProfiles = await Promise.all(
        views
          .filter((v) => v.viewer_id !== myUid)
          .map(async (v) => {
            const profile = await getUser(v.viewer_id).catch(() => undefined);
            return { ...v, profile: profile ?? undefined };
          }),
      );
      setSeenByList(withProfiles);
      setSeenLoading(false);
    });
  }, [isOwn, current?.id, myUid]);

  // Animate progress bar
  useEffect(() => {
    setProgress(0);
    setLiked(false);
    setReply("");
    startRef.current = Date.now();

    const tick = () => {
      if (!paused) {
        const elapsed = Date.now() - startRef.current;
        const p = Math.min(elapsed / STORY_DURATION_MS, 1);
        setProgress(p);
        if (p >= 1) { goNext(); return; }
      }
      progressRef.current = requestAnimationFrame(tick);
    };
    progressRef.current = requestAnimationFrame(tick);
    return () => { if (progressRef.current) cancelAnimationFrame(progressRef.current); };
  }, [idx, paused, goNext]);

  // Send like as actual message + save interaction
  async function handleLike() {
    if (!current || isOwn || liked) return;
    const newLiked = !liked;
    setLiked(newLiked);
    if (!newLiked) return;
    try {
      const chatId = await createChat(myUid, current.user_id);
      await sendMessage(chatId, myUid, { type: "text", text: "❤️" });
      await addStatusInteraction({
        statusId: current.id,
        senderId: myUid,
        recipientId: current.user_id,
        chatId,
        kind: "reaction",
        content: "❤️",
      });
    } catch (err) {
      console.error("Failed to send like:", err);
    }
  }

  // Send reply as actual message + save interaction
  async function handleSendReply() {
    if (!current || isOwn || !reply.trim() || sending) return;
    const text = reply.trim();
    setSending(true);
    try {
      const chatId = await createChat(myUid, current.user_id);
      await sendMessage(chatId, myUid, { type: "text", text });
      await addStatusInteraction({
        statusId: current.id,
        senderId: myUid,
        recipientId: current.user_id,
        chatId,
        kind: "reply",
        content: text,
      });
      setReply("");
      setPaused(false);
      startRef.current = Date.now() - progress * STORY_DURATION_MS;
      // Navigate to chat
      const peerProfile = await getUser(current.user_id).catch(() => null);
      if (peerProfile) {
        onClose();
        onOpenChat(chatId, peerProfile);
      }
    } catch (err) {
      console.error("Failed to send reply:", err);
    } finally {
      setSending(false);
    }
  }

  function handleTap(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, input, textarea, .no-tap")) return;
    const x = e.clientX;
    const w = window.innerWidth;
    if (x < w * 0.35) goPrev();
    else goNext();
  }

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black flex flex-col select-none"
      onClick={handleTap}
      onMouseDown={() => { setPaused(true); }}
      onMouseUp={() => { setPaused(false); startRef.current = Date.now() - progress * STORY_DURATION_MS; }}
      onTouchStart={() => { setPaused(true); }}
      onTouchEnd={() => { setPaused(false); startRef.current = Date.now() - progress * STORY_DURATION_MS; }}
    >
      {/* Progress bars */}
      <div className="absolute top-0 left-0 right-0 flex gap-1 px-3 pt-2 z-20">
        {statuses.map((_, i) => (
          <div key={i} className="flex-1 h-[2.5px] rounded-full bg-white/30 overflow-hidden">
            <div
              className="h-full rounded-full bg-white transition-none"
              style={{ width: i < idx ? "100%" : i === idx ? `${progress * 100}%` : "0%" }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-5 left-0 right-0 flex items-center gap-3 px-4 z-20">
        {current.user_avatar ? (
          <img src={current.user_avatar} className="w-10 h-10 rounded-full object-cover shrink-0" alt="" />
        ) : (
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0"
            style={{ background: current.background_color || "#333" }}
          >
            {(current.user_name || "?").charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm leading-tight truncate">{current.user_name}</p>
          <p className="text-white/60 text-[11px] leading-tight">{formatViewerTime(current.created_at)}</p>
        </div>
        <div className="flex items-center gap-1">
          {isOwn && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); setShowSeenBy(false); }}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10"
            >
              <MoreVertical className="w-5 h-5 text-white" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10"
          >
            <X className="w-6 h-6 text-white" />
          </button>
        </div>
      </div>

      {/* Owner menu */}
      {showMenu && (
        <div
          className="absolute top-16 right-4 z-30 glass rounded-xl overflow-hidden shadow-xl border border-border no-tap"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { setShowMenu(false); onClose(); }}
            className="w-full px-5 py-3 text-sm text-destructive hover:bg-white/5 text-left"
          >
            حذف الستاتي
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex items-center justify-center">
        {current.media_url ? (
          <img src={current.media_url} className="w-full h-full object-cover" alt="status" draggable={false} />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center px-10"
            style={{ background: current.background_color || "#1a1a2e" }}
          >
            <p className="text-white text-2xl font-semibold text-center leading-relaxed">
              {current.content}
            </p>
          </div>
        )}
      </div>

      {/* Caption on image */}
      {current.media_url && current.content && (
        <div className="absolute bottom-24 left-0 right-0 px-6 pointer-events-none">
          <p className="text-white text-base font-medium text-center drop-shadow-[0_1px_6px_rgba(0,0,0,0.8)]">
            {current.content}
          </p>
        </div>
      )}

      {/* Bottom bar */}
      <div
        className="absolute bottom-0 left-0 right-0 flex flex-col no-tap"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {!isOwn ? (
          // ── Viewer: reply + like ──
          <div className="flex items-center gap-3 px-4 pb-8 pt-3">
            <input
              type="text"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onFocus={() => setPaused(true)}
              onBlur={() => { if (!reply.trim()) { setPaused(false); startRef.current = Date.now() - progress * STORY_DURATION_MS; } }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSendReply(); }}
              placeholder={`رد على ${current.user_name}…`}
              className="flex-1 bg-white/15 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2.5 text-white text-sm placeholder:text-white/50 outline-none focus:border-white/40"
            />
            {reply.trim() ? (
              <button
                onClick={handleSendReply}
                disabled={sending}
                className="w-11 h-11 rounded-full bg-primary flex items-center justify-center shrink-0 active:scale-90 transition disabled:opacity-60"
              >
                {sending
                  ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Send className="w-5 h-5 text-white" />}
              </button>
            ) : (
              <button
                onClick={handleLike}
                className="w-11 h-11 flex items-center justify-center shrink-0 active:scale-90 transition"
              >
                <Heart
                  className="w-7 h-7 transition-all duration-200"
                  fill={liked ? "#FF4E00" : "none"}
                  stroke={liked ? "#FF4E00" : "white"}
                  strokeWidth={liked ? 0 : 2}
                />
              </button>
            )}
          </div>
        ) : (
          // ── Owner: seen-by list ──
          <div className="px-4 pb-8 pt-3">
            <button
              onClick={() => { setShowSeenBy((v) => !v); setPaused((v) => !v); }}
              className="flex items-center gap-2 text-white/80 text-sm"
            >
              <Eye className="w-4 h-4" />
              <span>
                {seenLoading ? "…" : seenByList.length === 0
                  ? "لا أحد شاهد بعد"
                  : `${seenByList.length} ${seenByList.length === 1 ? "شخص" : "أشخاص"} شاهدوا`}
              </span>
            </button>

            {showSeenBy && seenByList.length > 0 && (
              <div className="mt-3 space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
                {seenByList.map((v) => (
                  <div key={v.viewer_id} className="flex items-center gap-3">
                    {v.profile?.photoURL ? (
                      <img src={v.profile.photoURL} className="w-9 h-9 rounded-full object-cover shrink-0" alt="" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-white font-semibold shrink-0 text-sm">
                        {(v.profile?.displayName || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">
                        {v.profile?.displayName || v.viewer_id.slice(0, 8)}
                      </p>
                      <p className="text-white/50 text-[11px]">{formatViewerTime(v.viewed_at)}</p>
                    </div>
                    <Heart className="w-4 h-4 text-white/30 shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function StatusScreen({
  onGoToChats,
}: {
  onGoToChats: (chatId?: string, peer?: AppUser) => void;
}) {
  const { user } = useAuth();
  const { show } = useToast();
  const { t } = useLang();
  const [myStatus, setMyStatus]       = useState<UserStatus | null>(null);
  const [others, setOthers]           = useState<UserStatus[]>([]);
  const [viewedIds, setViewedIds]     = useState<Set<string>>(new Set());
  const [composerOpen, setComposerOpen] = useState(false);

  const [viewerStatuses, setViewerStatuses] = useState<UserStatus[] | null>(null);
  const [viewerStart, setViewerStart]       = useState(0);

  const [draft, setDraft]           = useState("");
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [bgColor, setBgColor]       = useState("#1a1a2e");
  const [posting, setPosting]       = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const COLORS = [
    "#1a1a2e","#16213e","#0f3460","#533483",
    "#e94560","#2d6a4f","#6b705c","#9b2226",
  ];

  async function refresh() {
    if (!user) return;
    const all = await loadActiveStatuses();
    setMyStatus(all.find((s) => s.user_id === user.uid) ?? null);
    setOthers(all.filter((s) => s.user_id !== user.uid));
    const viewed = await loadMyViews(user.uid);
    setViewedIds(new Set(viewed));
  }

  useEffect(() => {
    if (!user) return;
    refresh();
    const interval = setInterval(refresh, 60_000);
    const unsub = subscribeToStatusChanges(() => refresh(), () => refresh());
    return () => { clearInterval(interval); unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPreviewImg(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function save() {
    if (!user) return;
    if (!draft.trim() && !pendingFile) return;
    setPosting(true);
    try {
      let mediaUrl: string | undefined;
      if (pendingFile) mediaUrl = await uploadStatusImage(pendingFile, user.uid);
      const result = await upsertStatus({
        user_id: user.uid,
        user_name: user.displayName || user.email || "Anonymous",
        user_avatar: user.photoURL || undefined,
        type: pendingFile ? "image" : "text",
        content: draft.trim() || undefined,
        media_url: mediaUrl,
        background_color: bgColor,
      });
      if (!result) throw new Error("Failed to save status");
      setMyStatus(result);
      setDraft(""); setPreviewImg(null); setPendingFile(null);
      setComposerOpen(false);
      show(t("statusPosted"));
      refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      show(`${t("uploadFailed")}: ${msg}`);
    } finally {
      setPosting(false);
    }
  }

  async function clearStatus() {
    if (!user) return;
    const ok = await deleteStatus(user.uid);
    if (ok) { setMyStatus(null); show(t("statusRemoved")); refresh(); }
  }

  function openComposer() {
    setDraft(myStatus?.content ?? "");
    setPreviewImg(myStatus?.media_url ?? null);
    setBgColor(myStatus?.background_color ?? "#1a1a2e");
    setPendingFile(null);
    setComposerOpen(true);
  }

  async function openViewer(statuses: UserStatus[], startIdx: number) {
    setViewerStatuses(statuses);
    setViewerStart(startIdx);
    if (user) {
      const s = statuses[startIdx];
      if (s && s.user_id !== user.uid) {
        try {
          await viewStatus(s.id, user.uid);
          setViewedIds((prev) => new Set(prev).add(s.id));
        } catch { /* ignore */ }
      }
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <header className="px-5 pt-6 pb-4 glass border-b border-border">
        <h1 className="text-2xl font-bold tracking-tight">{t("statusTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("statusSub")}</p>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-2">
        {/* My status */}
        <button
          onClick={openComposer}
          className="w-full flex items-center gap-3 p-3 rounded-2xl glass hover:bg-white/5 active:scale-[0.99] transition text-start"
        >
          <div className="relative shrink-0">
            {myStatus?.media_url ? (
              <img src={myStatus.media_url} className="w-14 h-14 rounded-full object-cover ring-2 ring-primary" alt="status" />
            ) : myStatus ? (
              <div className="w-14 h-14 rounded-full flex items-center justify-center ring-2 ring-primary" style={{ background: myStatus.background_color }}>
                <FileText className="w-6 h-6 text-white/90" />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#FF7A1A] to-[#FF4E00] flex items-center justify-center font-semibold text-white text-lg">
                {(user?.displayName || user?.email || "U").charAt(0).toUpperCase()}
              </div>
            )}
            <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-secondary border-2 border-background flex items-center justify-center">
              <Plus className="w-3.5 h-3.5 text-white" />
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{t("myStatus")}</p>
            <p className="text-xs text-muted-foreground truncate">
              {myStatus ? myStatus.content || t("addText") : t("tapToAdd")}
            </p>
          </div>
          {myStatus && <span className="text-[10px] text-muted-foreground shrink-0">{timeLeft(myStatus.created_at)}</span>}
        </button>

        {myStatus && (
          <div className="flex gap-2 px-1">
            <button onClick={() => openViewer([myStatus], 0)} className="text-xs text-primary hover:underline">{t("preview")}</button>
            <span className="text-muted-foreground text-xs">·</span>
            <button onClick={clearStatus} className="text-xs text-destructive hover:underline">{t("removeStatus")}</button>
          </div>
        )}

        {/* Others */}
        <p className="text-xs uppercase tracking-wide text-muted-foreground px-2 pt-4">{t("recentUpdates")}</p>

        {others.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/5 flex items-center justify-center">
              <CircleDot className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="font-semibold">{t("noUpdates")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("noUpdatesDesc")}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {others.map((s, i) => {
              const unviewed = !viewedIds.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => openViewer(others, i)}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-white/5 active:scale-[0.99] transition text-start"
                >
                  <div className={`w-12 h-12 rounded-full p-[2.5px] shrink-0 ${unviewed ? "bg-gradient-to-br from-[#FF7A1A] to-[#FF4E00]" : "bg-white/15"}`}>
                    <div className="w-full h-full rounded-full bg-background overflow-hidden flex items-center justify-center">
                      {s.user_avatar ? (
                        <img src={s.user_avatar} className="w-full h-full object-cover" alt={s.user_name} />
                      ) : s.media_url ? (
                        <img src={s.media_url} className="w-full h-full object-cover" alt={s.user_name} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white font-semibold" style={{ background: s.background_color }}>
                          {(s.user_name || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{s.user_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {s.content || (s.type === "image" ? "Photo" : "Status")}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeLeft(s.created_at)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer Modal */}
      {composerOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center">
          <div className="glass w-full md:max-w-md md:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden">
            <header className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="font-semibold">{t("newStatus")}</h2>
              <button
                onClick={() => { setComposerOpen(false); setPreviewImg(null); setPendingFile(null); }}
                className="w-9 h-9 rounded-full hover:bg-white/5 active:scale-95 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </header>
            <div className="p-4 space-y-3">
              {previewImg ? (
                <div className="relative rounded-xl overflow-hidden">
                  <img src={previewImg} className="w-full max-h-48 object-cover rounded-xl" alt="preview" />
                  <button
                    onClick={() => { setPreviewImg(null); setPendingFile(null); }}
                    className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              ) : (
                <div className="w-full h-32 rounded-xl flex items-center justify-center text-white text-sm font-semibold" style={{ background: bgColor }}>
                  {draft.trim() || t("whatsOnMind")}
                </div>
              )}
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 200))}
                placeholder={t("whatsOnMind")}
                rows={3}
                autoFocus
                className="w-full bg-input rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
              {!previewImg && (
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setBgColor(color)}
                      className={`w-7 h-7 rounded-full transition ${bgColor === color ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
                      style={{ background: color }}
                    />
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition"
                  >
                    <ImageIcon className="w-4 h-4" />
                    {t("addImage")}
                  </button>
                  <span className="text-xs text-muted-foreground">{draft.length}/200</span>
                </div>
                <button
                  onClick={save}
                  disabled={posting || (!draft.trim() && !pendingFile)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF7A1A] to-[#FF4E00] text-white text-sm font-semibold disabled:opacity-50 active:scale-95 transition"
                >
                  {posting ? "…" : t("share")}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">{t("disappears")}</p>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
        </div>
      )}

      {/* Viewer */}
      {viewerStatuses && (
        <StatusViewer
          statuses={viewerStatuses}
          startIndex={viewerStart}
          myUid={user?.uid ?? ""}
          myName={user?.displayName || user?.email || "Me"}
          onClose={() => { setViewerStatuses(null); refresh(); }}
          onOpenChat={(chatId, peer) => {
            setViewerStatuses(null);
            onGoToChats(chatId, peer);
          }}
        />
      )}
    </div>
  );
}
