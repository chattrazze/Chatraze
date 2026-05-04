import { useEffect, useRef, useState, useCallback } from "react";
import {
  Camera,
  CircleDot,
  Eye,
  Heart,
  LayoutGrid,
  MoreVertical,
  Music2,
  Pencil,
  Plus,
  Send,
  Type,
  X,
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

/* ── Helpers ─────────────────────────────────────────────────────────────── */

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

/* ── StatusViewer ─────────────────────────────────────────────────────────── */

interface ViewerProps {
  statuses: UserStatus[];
  startIndex: number;
  myUid: string;
  myName: string;
  onClose: () => void;
  onOpenChat: (chatId: string, peer: AppUser) => void;
}

function StatusViewer({ statuses, startIndex, myUid, myName: _myName, onClose, onOpenChat }: ViewerProps) {
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
    setLiked(false); setReply("");
    if (idx < statuses.length - 1) {
      setIdx((i) => i + 1); setProgress(0); startRef.current = Date.now();
    } else { onClose(); }
  }, [idx, statuses.length, onClose]);

  const goPrev = useCallback(() => {
    setLiked(false); setReply("");
    if (idx > 0) { setIdx((i) => i - 1); setProgress(0); startRef.current = Date.now(); }
  }, [idx]);

  useEffect(() => {
    if (!isOwn || !current) return;
    setSeenLoading(true);
    loadStatusViews(current.id).then(async (views) => {
      const withProfiles = await Promise.all(
        views.filter((v) => v.viewer_id !== myUid).map(async (v) => {
          const profile = await getUser(v.viewer_id).catch(() => undefined);
          return { ...v, profile: profile ?? undefined };
        }),
      );
      setSeenByList(withProfiles);
      setSeenLoading(false);
    });
  }, [isOwn, current?.id, myUid]);

  useEffect(() => {
    setProgress(0); setLiked(false); setReply("");
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

  async function handleLike() {
    if (!current || isOwn || liked) return;
    setLiked(true);
    try {
      const chatId = await createChat(myUid, current.user_id);
      await sendMessage(chatId, myUid, { type: "text", text: "❤️" });
      await addStatusInteraction({ statusId: current.id, senderId: myUid, recipientId: current.user_id, chatId, kind: "reaction", content: "❤️" });
    } catch { /* ignore */ }
  }

  async function handleSendReply() {
    if (!current || isOwn || !reply.trim() || sending) return;
    const text = reply.trim();
    setSending(true);
    try {
      const chatId = await createChat(myUid, current.user_id);
      await sendMessage(chatId, myUid, { type: "text", text });
      await addStatusInteraction({ statusId: current.id, senderId: myUid, recipientId: current.user_id, chatId, kind: "reply", content: text });
      setReply(""); setPaused(false);
      startRef.current = Date.now() - progress * STORY_DURATION_MS;
      const peerProfile = await getUser(current.user_id).catch(() => null);
      if (peerProfile) { onClose(); onOpenChat(chatId, peerProfile); }
    } catch { /* ignore */ }
    finally { setSending(false); }
  }

  function handleTap(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, input, textarea, .no-tap")) return;
    const x = e.clientX;
    const w = window.innerWidth;
    if (x < w * 0.35) goPrev(); else goNext();
  }

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black flex flex-col select-none"
      onClick={handleTap}
      onMouseDown={() => setPaused(true)}
      onMouseUp={() => { setPaused(false); startRef.current = Date.now() - progress * STORY_DURATION_MS; }}
      onTouchStart={() => setPaused(true)}
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
            style={{ background: current.background_color || "#FF7A1A" }}
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
            <button onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); setShowSeenBy(false); }}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10">
              <MoreVertical className="w-5 h-5 text-white" />
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10">
            <X className="w-6 h-6 text-white" />
          </button>
        </div>
      </div>

      {showMenu && (
        <div className="absolute top-16 right-4 z-30 glass rounded-xl overflow-hidden shadow-xl border border-border no-tap"
          onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { setShowMenu(false); onClose(); }}
            className="w-full px-5 py-3 text-sm text-destructive hover:bg-white/5 text-left">
            حذف الستاتي
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex items-center justify-center">
        {current.media_url ? (
          <img src={current.media_url} className="w-full h-full object-cover" alt="status" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center px-10"
            style={{ background: current.background_color || "#1a1a2e" }}>
            <p className="text-white text-2xl font-semibold text-center leading-relaxed">{current.content}</p>
          </div>
        )}
      </div>

      {current.media_url && current.content && (
        <div className="absolute bottom-24 left-0 right-0 px-6 pointer-events-none">
          <p className="text-white text-base font-medium text-center drop-shadow-[0_1px_6px_rgba(0,0,0,0.8)]">{current.content}</p>
        </div>
      )}

      {/* Bottom bar */}
      <div
        className="absolute bottom-0 left-0 right-0 flex flex-col no-tap"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {!isOwn ? (
          <div className="flex items-center gap-3 px-4 pb-8 pt-3">
            <input
              type="text" value={reply}
              onChange={(e) => setReply(e.target.value)}
              onFocus={() => setPaused(true)}
              onBlur={() => { if (!reply.trim()) { setPaused(false); startRef.current = Date.now() - progress * STORY_DURATION_MS; } }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSendReply(); }}
              placeholder={`رد على ${current.user_name}…`}
              className="flex-1 bg-white/15 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2.5 text-white text-sm placeholder:text-white/50 outline-none focus:border-white/40"
            />
            {reply.trim() ? (
              <button onClick={handleSendReply} disabled={sending}
                className="w-11 h-11 rounded-full bg-primary flex items-center justify-center shrink-0 active:scale-90 transition disabled:opacity-60">
                {sending
                  ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Send className="w-5 h-5 text-white" />}
              </button>
            ) : (
              <button onClick={handleLike} className="w-11 h-11 flex items-center justify-center shrink-0 active:scale-90 transition">
                <Heart className="w-7 h-7 transition-all duration-200"
                  fill={liked ? "#FF4E00" : "none"}
                  stroke={liked ? "#FF4E00" : "white"}
                  strokeWidth={liked ? 0 : 2} />
              </button>
            )}
          </div>
        ) : (
          <div className="px-4 pb-8 pt-3">
            <button onClick={() => { setShowSeenBy((v) => !v); setPaused((v) => !v); }}
              className="flex items-center gap-2 text-white/80 text-sm">
              <Eye className="w-4 h-4" />
              <span>{seenLoading ? "…" : seenByList.length === 0
                ? "لا أحد شاهد بعد"
                : `${seenByList.length} ${seenByList.length === 1 ? "شخص" : "أشخاص"} شاهدوا`}</span>
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
                      <p className="text-white text-sm font-medium truncate">{v.profile?.displayName || v.viewer_id.slice(0, 8)}</p>
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

/* ── Story Circle ─────────────────────────────────────────────────────────── */

function StoryCircle({
  label, avatar, bgColor, preview, hasStory, viewed, isMe, hasPlus, size = "lg",
  onClick,
}: {
  label: string; avatar?: string | null; bgColor?: string; preview?: string | null;
  hasStory?: boolean; viewed?: boolean; isMe?: boolean; hasPlus?: boolean;
  size?: "lg" | "sm"; onClick: () => void;
}) {
  const dim = size === "lg" ? "w-16 h-16" : "w-14 h-14";
  const ringCls = hasStory
    ? viewed
      ? "ring-[2.5px] ring-white/30"
      : "ring-[2.5px] ring-[#FF7A1A]"
    : isMe
      ? "ring-[2.5px] ring-white/15"
      : "ring-[2.5px] ring-white/15";

  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 shrink-0 w-[72px]">
      <div className={`relative ${dim} rounded-full ${ringCls} ring-offset-[3px] ring-offset-background overflow-visible`}>
        {/* Inner circle */}
        <div className="w-full h-full rounded-full overflow-hidden">
          {preview ? (
            <img src={preview} className="w-full h-full object-cover" alt={label} />
          ) : avatar ? (
            <img src={avatar} className="w-full h-full object-cover" alt={label} />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-bold text-white text-lg"
              style={{ background: bgColor || "linear-gradient(135deg,#FF7A1A,#FF4E00)" }}>
              {label.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        {/* + badge */}
        {hasPlus && (
          <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#FF7A1A] border-2 border-background flex items-center justify-center z-10">
            <Plus className="w-3 h-3 text-white" />
          </span>
        )}
      </div>
      <span className="text-[11px] text-center leading-tight truncate w-full text-muted-foreground">
        {label}
      </span>
    </button>
  );
}

/* ── Text Composer (fullscreen) ──────────────────────────────────────────── */

const BG_GRADIENTS = [
  { id: "dark",    style: { background: "#1a1a2e" } },
  { id: "navy",    style: { background: "linear-gradient(135deg,#0f3460,#16213e)" } },
  { id: "orange",  style: { background: "linear-gradient(135deg,#FF7A1A,#FF4E00)" } },
  { id: "purple",  style: { background: "linear-gradient(135deg,#533483,#2d1b69)" } },
  { id: "teal",    style: { background: "linear-gradient(135deg,#2d6a4f,#1b4332)" } },
  { id: "rose",    style: { background: "linear-gradient(135deg,#e94560,#9b2226)" } },
  { id: "slate",   style: { background: "linear-gradient(135deg,#334155,#1e293b)" } },
  { id: "amber",   style: { background: "linear-gradient(135deg,#d97706,#92400e)" } },
];

function TextComposer({
  initialText,
  onSave,
  onClose,
  saving,
}: {
  initialText?: string;
  onSave: (text: string, bgColor: string) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [text, setText] = useState(initialText ?? "");
  const [bgIdx, setBgIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const currentBg = BG_GRADIENTS[bgIdx];

  return (
    <div className="fixed inset-0 z-[55] flex flex-col" style={currentBg.style}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-safe pt-4 pb-3">
        <button onClick={onClose}
          className="w-10 h-10 rounded-full bg-black/30 flex items-center justify-center active:scale-90 transition">
          <X className="w-5 h-5 text-white" />
        </button>
        <div className="flex items-center gap-1">
          {BG_GRADIENTS.map((bg, i) => (
            <button
              key={bg.id}
              onClick={() => setBgIdx(i)}
              className={`w-7 h-7 rounded-full border-2 transition active:scale-90 ${i === bgIdx ? "border-white scale-110" : "border-transparent"}`}
              style={bg.style}
            />
          ))}
        </div>
        <button
          onClick={() => { if (text.trim()) onSave(text.trim(), `bg-${bgIdx}`); }}
          disabled={!text.trim() || saving}
          className="px-4 py-2 rounded-full bg-white text-sm font-bold disabled:opacity-40 active:scale-95 transition"
          style={{ color: "#FF7A1A" }}
        >
          {saving ? "…" : "مشاركة"}
        </button>
      </div>

      {/* Text area — centered */}
      <div className="flex-1 flex items-center justify-center px-8">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 200))}
          placeholder="اكتب ستاتس…"
          rows={4}
          className="w-full bg-transparent text-white text-2xl font-semibold text-center resize-none outline-none placeholder:text-white/40"
          style={{ caretColor: "white" }}
        />
      </div>

      {/* Character count */}
      <div className="pb-8 text-center">
        <span className="text-white/50 text-xs">{text.length}/200</span>
      </div>
    </div>
  );
}

/* ── Photo Composer ───────────────────────────────────────────────────────── */

function PhotoComposer({
  file,
  onSave,
  onClose,
  saving,
}: {
  file: File;
  onSave: (caption: string) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [preview] = useState(() => URL.createObjectURL(file));
  const [caption, setCaption] = useState("");

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-black">
      {/* Image fill */}
      <div className="flex-1 relative">
        <img src={preview} className="w-full h-full object-contain" alt="preview" />
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-4 pb-3"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)" }}>
          <button onClick={onClose}
            className="w-10 h-10 rounded-full bg-black/30 flex items-center justify-center active:scale-90 transition">
            <X className="w-5 h-5 text-white" />
          </button>
          <button
            onClick={() => onSave(caption)}
            disabled={saving}
            className="px-5 py-2 rounded-full bg-[#FF7A1A] text-white text-sm font-bold disabled:opacity-50 active:scale-95 transition flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            {saving ? "…" : "مشاركة"}
          </button>
        </div>
      </div>
      {/* Caption bar */}
      <div className="px-4 py-3 bg-[#111] flex items-center gap-3">
        <input
          type="text"
          value={caption}
          onChange={(e) => setCaption(e.target.value.slice(0, 200))}
          placeholder="أضف وصفاً…"
          className="flex-1 bg-white/10 rounded-full px-4 py-2.5 text-white text-sm outline-none placeholder:text-white/40"
        />
      </div>
    </div>
  );
}

/* ── Drawing Composer ────────────────────────────────────────────────────── */

const DRAW_COLORS = [
  "#FFFFFF","#FF7A1A","#FF4E00","#FBBF24",
  "#34D399","#60A5FA","#A78BFA","#F472B6",
  "#000000","#374151","#DC2626","#065F46",
];
const BRUSH_SIZES = [3, 6, 12, 20];

function DrawingComposer({
  onSave,
  onClose,
  saving,
}: {
  onSave: (file: File) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState("#FFFFFF");
  const [brushIdx, setBrushIdx] = useState(1);
  const [eraser, setEraser] = useState(false);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  function getPos(e: React.TouchEvent | React.MouseEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: ((e as React.MouseEvent).clientX - rect.left) * scaleX,
      y: ((e as React.MouseEvent).clientY - rect.top) * scaleY,
    };
  }

  function startDraw(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault();
    isDrawing.current = true;
    lastPos.current = getPos(e);
  }

  function doDraw(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault();
    if (!isDrawing.current || !lastPos.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = eraser ? "#1a1a2e" : color;
    ctx.lineWidth = BRUSH_SIZES[brushIdx];
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
  }

  function endDraw(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault();
    isDrawing.current = false;
    lastPos.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function share() {
    const canvas = canvasRef.current!;
    canvas.toBlob((blob) => {
      if (!blob) return;
      onSave(new File([blob], `drawing_${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  }

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-[#1a1a2e] select-none">
      {/* Top toolbar */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 shrink-0"
        style={{ background: "rgba(0,0,0,0.5)" }}>
        <button onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition">
          <X className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1 flex gap-1.5 overflow-x-auto scrollbar-none">
          {DRAW_COLORS.map((c) => (
            <button key={c} onClick={() => { setColor(c); setEraser(false); }}
              className="shrink-0 rounded-full transition active:scale-90"
              style={{
                width: 28, height: 28, background: c,
                border: c === color && !eraser ? "2.5px solid white" : "2px solid rgba(255,255,255,0.2)",
                transform: c === color && !eraser ? "scale(1.15)" : "scale(1)",
              }} />
          ))}
        </div>
        <button
          onClick={share}
          disabled={saving}
          className="px-4 py-2 rounded-full bg-[#FF7A1A] text-white text-sm font-bold active:scale-95 transition disabled:opacity-50">
          {saving ? "…" : "مشاركة"}
        </button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="flex-1 w-full cursor-crosshair touch-none"
        onMouseDown={startDraw}
        onMouseMove={doDraw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={doDraw}
        onTouchEnd={endDraw}
      />

      {/* Bottom toolbar */}
      <div className="flex items-center justify-between px-6 py-3 shrink-0"
        style={{ background: "rgba(0,0,0,0.5)" }}>
        {/* Brush sizes */}
        <div className="flex items-center gap-3">
          {BRUSH_SIZES.map((s, i) => (
            <button key={s} onClick={() => { setBrushIdx(i); setEraser(false); }}
              className="flex items-center justify-center active:scale-90 transition"
              style={{ width: 32, height: 32 }}>
              <div className="rounded-full transition-all"
                style={{
                  width: Math.max(s, 6), height: Math.max(s, 6),
                  background: i === brushIdx && !eraser ? color : "rgba(255,255,255,0.4)",
                  boxShadow: i === brushIdx && !eraser ? `0 0 6px ${color}` : "none",
                }} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {/* Eraser */}
          <button onClick={() => setEraser((v) => !v)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition active:scale-90 ${eraser ? "bg-white text-black" : "bg-white/10 text-white"}`}>
            ممحاة
          </button>
          {/* Clear */}
          <button onClick={clearCanvas}
            className="px-3 py-1.5 rounded-full bg-white/10 text-white text-xs font-semibold transition active:scale-90">
            مسح
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Music Composer ───────────────────────────────────────────────────────── */

function MusicComposer({
  file,
  onSave,
  onClose,
  saving,
}: {
  file: File;
  onSave: (songName: string) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const songName = file.name.replace(/\.[^/.]+$/, "");
  const [editName, setEditName] = useState(songName);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl] = useState(() => URL.createObjectURL(file));

  useEffect(() => {
    audioRef.current = new Audio(audioUrl);
    audioRef.current.loop = true;
    return () => {
      audioRef.current?.pause();
      URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  function togglePlay() {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex flex-col select-none"
      style={{ background: "linear-gradient(135deg, #4c1d95, #1e1b4b, #312e81)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <button onClick={() => { audioRef.current?.pause(); onClose(); }}
          className="w-10 h-10 rounded-full bg-black/30 flex items-center justify-center active:scale-90 transition">
          <X className="w-5 h-5 text-white" />
        </button>
        <button
          onClick={() => { audioRef.current?.pause(); onSave(editName.trim() || songName); }}
          disabled={saving}
          className="px-5 py-2 rounded-full bg-white text-sm font-bold disabled:opacity-50 active:scale-95 transition"
          style={{ color: "#4c1d95" }}>
          {saving ? "…" : "مشاركة"}
        </button>
      </div>

      {/* Center content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-8">
        {/* Animated music icon */}
        <div className="relative">
          <div className="w-32 h-32 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.1)", boxShadow: playing ? "0 0 40px rgba(167,139,250,0.5)" : "none" }}>
            <Music2 className="w-16 h-16 text-white" />
          </div>
          {/* Pulse rings when playing */}
          {playing && (
            <>
              <div className="absolute inset-0 rounded-full animate-ping"
                style={{ background: "rgba(167,139,250,0.2)" }} />
              <div className="absolute -inset-4 rounded-full animate-pulse"
                style={{ background: "rgba(167,139,250,0.1)" }} />
            </>
          )}
        </div>

        {/* Equalizer bars */}
        <div className="flex items-end gap-1 h-10">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i}
              className="w-1.5 rounded-full"
              style={{
                background: "rgba(167,139,250,0.8)",
                height: playing ? `${20 + Math.sin(i * 0.8) * 16}px` : "4px",
                transition: "height 0.3s ease",
                animationDelay: `${i * 0.07}s`,
              }} />
          ))}
        </div>

        {/* Song name (editable) */}
        <div className="w-full">
          <p className="text-white/50 text-xs text-center mb-2">اسم الأغنية</p>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value.slice(0, 60))}
            className="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white text-center text-base font-semibold outline-none focus:border-purple-400"
            placeholder="اسم الأغنية…"
          />
        </div>

        {/* Play/Pause */}
        <button onClick={togglePlay}
          className="w-16 h-16 rounded-full flex items-center justify-center active:scale-90 transition"
          style={{ background: "rgba(255,255,255,0.15)" }}>
          {playing
            ? <div className="flex gap-1"><div className="w-1.5 h-6 bg-white rounded-full" /><div className="w-1.5 h-6 bg-white rounded-full" /></div>
            : <div className="w-0 h-0 border-t-[10px] border-t-transparent border-b-[10px] border-b-transparent border-l-[18px] border-l-white ml-1" />}
        </button>
      </div>

      <div className="pb-8 text-center">
        <p className="text-white/30 text-xs">سيظهر اسم الأغنية في الستاتس</p>
      </div>
    </div>
  );
}

/* ── Creation Menu Sheet ─────────────────────────────────────────────────── */

function CreationSheet({
  onText,
  onPhoto,
  onDraw,
  onMusic,
  onClose,
  fileRef,
  musicRef,
}: {
  onText: () => void;
  onPhoto: (file: File) => void;
  onDraw: () => void;
  onMusic: (file: File) => void;
  onClose: () => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  musicRef: React.RefObject<HTMLInputElement | null>;
}) {
  const options = [
    {
      icon: <Type className="w-6 h-6" />,
      label: "نص",
      color: "#FF7A1A",
      bg: "rgba(255,122,26,0.15)",
      action: onText,
    },
    {
      icon: <Music2 className="w-6 h-6" />,
      label: "موسيقى",
      color: "#a78bfa",
      bg: "rgba(167,139,250,0.15)",
      action: () => musicRef.current?.click(),
    },
    {
      icon: <LayoutGrid className="w-6 h-6" />,
      label: "رسم",
      color: "#f472b6",
      bg: "rgba(244,114,182,0.15)",
      action: onDraw,
    },
    {
      icon: <Pencil className="w-6 h-6" />,
      label: "تخطيط",
      color: "#34d399",
      bg: "rgba(52,211,153,0.15)",
      action: onDraw,
    },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-[#111] pb-safe pb-8 overflow-hidden">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-4">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Photo options row */}
        <div className="px-5 mb-5 flex items-center gap-3">
          <div className="flex-1 text-center">
            <p className="text-xs text-white/40 mb-1">الصور</p>
          </div>
          <div className="flex-1 text-center">
            <p className="text-xs text-white/40 mb-1">الألبومات</p>
          </div>
        </div>

        {/* 2×2 grid + camera circle */}
        <div className="px-5">
          {/* Options grid */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {options.map((opt) => (
              <button
                key={opt.label}
                onClick={opt.action}
                className="flex flex-col items-center gap-2 active:scale-90 transition"
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: opt.bg, color: opt.color }}
                >
                  {opt.icon}
                </div>
                <span className="text-xs text-white/70">{opt.label}</span>
              </button>
            ))}
          </div>

          {/* Camera button — big */}
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full py-4 rounded-2xl flex flex-col items-center gap-2 active:scale-95 transition"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.08)" }}>
              <Camera className="w-8 h-8 text-white/80" />
            </div>
            <span className="text-sm text-white/70">كاميرا</span>
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPhoto(file);
        }}
      />
      <input
        ref={musicRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) { onMusic(file); }
        }}
      />
    </>
  );
}

/* ── Main Screen ─────────────────────────────────────────────────────────── */

type ComposerState =
  | { kind: "none" }
  | { kind: "menu" }
  | { kind: "text"; initialText?: string; bgColor?: string }
  | { kind: "photo"; file: File }
  | { kind: "draw" }
  | { kind: "music"; file: File };

export default function StatusScreen({
  onGoToChats,
}: {
  onGoToChats: (chatId?: string, peer?: AppUser) => void;
}) {
  const { user } = useAuth();
  const { show } = useToast();
  const { t } = useLang();

  const [myStatus, setMyStatus]   = useState<UserStatus | null>(null);
  const [others, setOthers]       = useState<UserStatus[]>([]);
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  const [composer, setComposer]   = useState<ComposerState>({ kind: "none" });
  const [posting, setPosting]     = useState(false);

  const [viewerStatuses, setViewerStatuses] = useState<UserStatus[] | null>(null);
  const [viewerStart, setViewerStart]       = useState(0);

  const fileRef  = useRef<HTMLInputElement>(null);
  const musicRef = useRef<HTMLInputElement>(null);

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

  async function saveTextStatus(text: string, bgKey: string) {
    if (!user || !text.trim()) return;
    setPosting(true);
    try {
      const bgIdx = parseInt(bgKey.replace("bg-", "")) || 0;
      const bgGrad = BG_GRADIENTS[bgIdx] ?? BG_GRADIENTS[0];
      const bgColor = typeof bgGrad.style.background === "string" ? bgGrad.style.background : "#1a1a2e";
      const result = await upsertStatus({
        user_id: user.uid,
        user_name: user.displayName || user.email || "Anonymous",
        user_avatar: user.photoURL || undefined,
        type: "text",
        content: text,
        background_color: bgColor,
      });
      if (!result) throw new Error("Failed to save status");
      setMyStatus(result);
      setComposer({ kind: "none" });
      show(t("statusPosted"));
      refresh();
    } catch (err) {
      show(`${t("uploadFailed")}: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setPosting(false);
    }
  }

  async function savePhotoStatus(file: File, caption: string) {
    if (!user) return;
    setPosting(true);
    try {
      const mediaUrl = await uploadStatusImage(file, user.uid);
      const result = await upsertStatus({
        user_id: user.uid,
        user_name: user.displayName || user.email || "Anonymous",
        user_avatar: user.photoURL || undefined,
        type: "image",
        content: caption.trim() || undefined,
        media_url: mediaUrl,
        background_color: "#000000",
      });
      if (!result) throw new Error("Failed to save status");
      setMyStatus(result);
      setComposer({ kind: "none" });
      show(t("statusPosted"));
      refresh();
    } catch (err) {
      show(`${t("uploadFailed")}: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setPosting(false);
    }
  }

  async function saveMusicStatus(songName: string) {
    if (!user || !songName.trim()) return;
    setPosting(true);
    try {
      const result = await upsertStatus({
        user_id: user.uid,
        user_name: user.displayName || user.email || "Anonymous",
        user_avatar: user.photoURL || undefined,
        type: "text",
        content: `🎵 ${songName.trim()}`,
        background_color: "linear-gradient(135deg, #4c1d95, #1e1b4b)",
      });
      if (!result) throw new Error("Failed to save status");
      setMyStatus(result);
      setComposer({ kind: "none" });
      show(t("statusPosted"));
      refresh();
    } catch (err) {
      show(`${t("uploadFailed")}: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setPosting(false);
    }
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

  async function clearStatus() {
    if (!user) return;
    const ok = await deleteStatus(user.uid);
    if (ok) { setMyStatus(null); show(t("statusRemoved")); refresh(); }
  }

  /* ── Unviewed first ── */
  const sortedOthers = [...others].sort((a, b) => {
    const aViewed = viewedIds.has(a.id) ? 1 : 0;
    const bViewed = viewedIds.has(b.id) ? 1 : 0;
    return aViewed - bViewed;
  });

  const myLabel = user?.displayName?.split(" ")[0] || "حالتي";

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-5 pt-6 pb-4 glass border-b border-border shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("statusTitle")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t("statusSub")}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setComposer({ kind: "menu" })}
            className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center transition active:scale-90"
            title="إضافة ستاتس"
          >
            <Camera className="w-5 h-5 text-muted-foreground" />
          </button>
          {myStatus && (
            <button
              onClick={() => setComposer({ kind: "text", initialText: myStatus.content, bgColor: myStatus.background_color })}
              className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center transition active:scale-90"
              title="تعديل الستاتس"
            >
              <Pencil className="w-4.5 h-4.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </header>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">

        {/* ── STATUS section label ── */}
        <div className="px-5 pt-5 pb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {t("statusTitle")}
          </span>
        </div>

        {/* ── Horizontal story circles ── */}
        <div className="overflow-x-auto scrollbar-thin">
          <div className="flex gap-3 px-4 pb-4" style={{ minWidth: "max-content" }}>
            {/* My status bubble */}
            <StoryCircle
              label={myStatus ? myLabel : "إضافة"}
              avatar={user?.photoURL}
              bgColor="linear-gradient(135deg,#FF7A1A,#FF4E00)"
              preview={myStatus?.media_url}
              hasStory={!!myStatus}
              viewed={false}
              isMe
              hasPlus={!myStatus}
              onClick={() => {
                if (myStatus) openViewer([myStatus], 0);
                else setComposer({ kind: "menu" });
              }}
            />

            {/* Others' stories */}
            {sortedOthers.map((s, i) => (
              <StoryCircle
                key={s.id}
                label={s.user_name.split(" ")[0]}
                avatar={s.user_avatar}
                bgColor={s.background_color}
                preview={s.media_url}
                hasStory
                viewed={viewedIds.has(s.id)}
                onClick={() => openViewer(sortedOthers, i)}
              />
            ))}

            {/* Placeholder if only my status */}
            {others.length === 0 && !myStatus && (
              <div className="flex items-center justify-center px-4">
                <p className="text-xs text-muted-foreground">{t("noUpdatesDesc")}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="mx-4 border-t border-border/50" />

        {/* ── Recent updates list ── */}
        <div className="px-4 pt-4 pb-6 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-1 pb-3">
            {t("recentUpdates")}
          </p>

          {/* My status row */}
          {myStatus && (
            <div className="flex items-center gap-3 p-3 rounded-2xl glass">
              <div
                className="w-12 h-12 rounded-full p-[2.5px] shrink-0"
                style={{ background: "linear-gradient(135deg,#FF7A1A,#FF4E00)" }}
              >
                <div className="w-full h-full rounded-full bg-background overflow-hidden flex items-center justify-center">
                  {myStatus.media_url ? (
                    <img src={myStatus.media_url} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white font-semibold"
                      style={{ background: myStatus.background_color }}>
                      {(user?.displayName || "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{t("myStatus")}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {myStatus.content || (myStatus.type === "image" ? "صورة" : "ستاتس")}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-muted-foreground">{timeLeft(myStatus.created_at)}</span>
                <button onClick={clearStatus}
                  className="w-7 h-7 rounded-full hover:bg-destructive/10 flex items-center justify-center transition active:scale-90">
                  <X className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
            </div>
          )}

          {/* Others */}
          {sortedOthers.length === 0 && !myStatus ? (
            <div className="glass rounded-2xl p-10 text-center mt-2">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/5 flex items-center justify-center">
                <CircleDot className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="font-semibold text-sm">{t("noUpdates")}</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[220px] mx-auto">{t("noUpdatesDesc")}</p>
            </div>
          ) : (
            sortedOthers.map((s, i) => {
              const unviewed = !viewedIds.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => openViewer(sortedOthers, i)}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-white/5 active:scale-[0.99] transition text-start"
                >
                  <div className={`w-12 h-12 rounded-full p-[2.5px] shrink-0 ${unviewed ? "bg-gradient-to-br from-[#FF7A1A] to-[#FF4E00]" : "bg-white/15"}`}>
                    <div className="w-full h-full rounded-full bg-background overflow-hidden flex items-center justify-center">
                      {s.user_avatar ? (
                        <img src={s.user_avatar} className="w-full h-full object-cover" alt={s.user_name} />
                      ) : s.media_url ? (
                        <img src={s.media_url} className="w-full h-full object-cover" alt={s.user_name} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white font-semibold"
                          style={{ background: s.background_color }}>
                          {(s.user_name || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{s.user_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {s.content || (s.type === "image" ? "صورة" : "ستاتس")}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeLeft(s.created_at)}</span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── FAB: Add status ── */}
      <button
        onClick={() => setComposer({ kind: "menu" })}
        className="fixed bottom-24 right-4 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-30 active:scale-90 transition"
        style={{ background: "linear-gradient(135deg,#FF7A1A,#FF4E00)" }}
      >
        <Plus className="w-7 h-7 text-white" />
      </button>

      {/* ── Creation Menu ── */}
      {composer.kind === "menu" && (
        <CreationSheet
          onText={() => setComposer({ kind: "text" })}
          onPhoto={(file) => setComposer({ kind: "photo", file })}
          onDraw={() => setComposer({ kind: "draw" })}
          onMusic={(file) => setComposer({ kind: "music", file })}
          onClose={() => setComposer({ kind: "none" })}
          fileRef={fileRef}
          musicRef={musicRef}
        />
      )}

      {/* ── Text Composer ── */}
      {composer.kind === "text" && (
        <TextComposer
          initialText={composer.initialText}
          onSave={saveTextStatus}
          onClose={() => setComposer({ kind: "none" })}
          saving={posting}
        />
      )}

      {/* ── Photo Composer ── */}
      {composer.kind === "photo" && (
        <PhotoComposer
          file={composer.file}
          onSave={(caption) => savePhotoStatus(composer.file, caption)}
          onClose={() => setComposer({ kind: "none" })}
          saving={posting}
        />
      )}

      {/* ── Drawing Composer ── */}
      {composer.kind === "draw" && (
        <DrawingComposer
          onSave={(file) => { setComposer({ kind: "photo", file }); }}
          onClose={() => setComposer({ kind: "none" })}
          saving={posting}
        />
      )}

      {/* ── Music Composer ── */}
      {composer.kind === "music" && (
        <MusicComposer
          file={composer.file}
          onSave={saveMusicStatus}
          onClose={() => setComposer({ kind: "none" })}
          saving={posting}
        />
      )}

      {/* ── StatusViewer ── */}
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
