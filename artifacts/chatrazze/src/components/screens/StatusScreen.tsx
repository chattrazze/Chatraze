import { useEffect, useRef, useState } from "react";
import {
  CircleDot,
  Image as ImageIcon,
  Plus,
  X,
  FileText,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/Toast";
import { useLang } from "@/hooks/useLang";
import { supabase } from "@/lib/supabase";
import {
  type UserStatus,
  deleteStatus,
  loadActiveStatuses,
  loadMyViews,
  subscribeToStatusChanges,
  upsertStatus,
  viewStatus,
} from "@/lib/statusService";

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

// Re-use the existing public "chat-media" bucket so we don't depend on a
// separate bucket that the project may not have provisioned yet.
const STATUS_BUCKET = "chat-media";

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
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => { if (b) resolve(b); else reject(new Error("Canvas toBlob failed")); },
      "image/jpeg",
      quality,
    );
  });
}

async function uploadStatusImage(file: File, uid: string): Promise<string> {
  const compressed = file.type.startsWith("image/")
    ? await compressImage(file, 1600, 0.85)
    : file;

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
  const path = `status/${uid}/${Date.now()}_${safe}`;

  const { data, error } = await supabase.storage
    .from(STATUS_BUCKET)
    .upload(path, compressed, {
      cacheControl: "31536000",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });

  if (error) {
    // Bubble up a friendlier error so the toast text is meaningful.
    throw new Error(error.message || "Upload failed");
  }

  const { data: urlData } = supabase.storage
    .from(STATUS_BUCKET)
    .getPublicUrl(data.path);
  return urlData.publicUrl;
}

export default function StatusScreen({
  onGoToChats: _onGoToChats,
}: {
  onGoToChats: () => void;
}) {
  const { user } = useAuth();
  const { show } = useToast();
  const { t } = useLang();
  const [myStatus, setMyStatus] = useState<UserStatus | null>(null);
  const [others, setOthers] = useState<UserStatus[]>([]);
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  const [composerOpen, setComposerOpen] = useState(false);
  const [viewingStatus, setViewingStatus] = useState<UserStatus | null>(null);
  const [draft, setDraft] = useState("");
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [bgColor, setBgColor] = useState("#1a1a2e");
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const COLORS = [
    "#1a1a2e",
    "#16213e",
    "#0f3460",
    "#533483",
    "#e94560",
    "#2d6a4f",
    "#6b705c",
    "#9b2226",
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
    const t = setInterval(refresh, 60_000);
    const unsub = subscribeToStatusChanges(
      () => refresh(),
      () => refresh(),
    );
    return () => {
      clearInterval(t);
      unsub();
    };
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
      if (pendingFile) {
        mediaUrl = await uploadStatusImage(pendingFile, user.uid);
      }
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
      setDraft("");
      setPreviewImg(null);
      setPendingFile(null);
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
    if (ok) {
      setMyStatus(null);
      show(t("statusRemoved"));
      refresh();
    }
  }

  function openComposer() {
    setDraft(myStatus?.content ?? "");
    setPreviewImg(myStatus?.media_url ?? null);
    setBgColor(myStatus?.background_color ?? "#1a1a2e");
    setPendingFile(null);
    setComposerOpen(true);
  }

  async function openViewer(status: UserStatus) {
    setViewingStatus(status);
    if (user && status.user_id !== user.uid) {
      try {
        await viewStatus(status.id, user.uid);
        setViewedIds((s) => new Set(s).add(status.id));
      } catch {
        /* ignore */
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
              <img
                src={myStatus.media_url}
                className="w-14 h-14 rounded-full object-cover ring-2 ring-primary"
                alt="status"
              />
            ) : myStatus ? (
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center ring-2 ring-primary"
                style={{ background: myStatus.background_color }}
              >
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
              {myStatus
                ? myStatus.content || t("addText")
                : t("tapToAdd")}
            </p>
          </div>
          {myStatus && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              {timeLeft(myStatus.created_at)}
            </span>
          )}
        </button>

        {myStatus && (
          <div className="flex gap-2 px-1">
            <button
              onClick={() => setViewingStatus(myStatus)}
              className="text-xs text-primary hover:underline"
            >
              {t("preview")}
            </button>
            <span className="text-muted-foreground text-xs">·</span>
            <button
              onClick={clearStatus}
              className="text-xs text-destructive hover:underline"
            >
              {t("removeStatus")}
            </button>
          </div>
        )}

        {/* Others' statuses */}
        <p className="text-xs uppercase tracking-wide text-muted-foreground px-2 pt-4">
          {t("recentUpdates")}
        </p>

        {others.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/5 flex items-center justify-center">
              <CircleDot className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="font-semibold">{t("noUpdates")}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("noUpdatesDesc")}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {others.map((s) => {
              const unviewed = !viewedIds.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => openViewer(s)}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-white/5 active:scale-[0.99] transition text-start"
                >
                  <div
                    className={`w-12 h-12 rounded-full p-[2px] shrink-0 ${
                      unviewed
                        ? "bg-gradient-to-br from-[#FF7A1A] to-[#FF4E00]"
                        : "bg-white/15"
                    }`}
                  >
                    <div className="w-full h-full rounded-full bg-background overflow-hidden flex items-center justify-center">
                      {s.user_avatar ? (
                        <img
                          src={s.user_avatar}
                          className="w-full h-full object-cover"
                          alt={s.user_name}
                        />
                      ) : s.media_url ? (
                        <img
                          src={s.media_url}
                          className="w-full h-full object-cover"
                          alt={s.user_name}
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-white font-semibold"
                          style={{ background: s.background_color }}
                        >
                          {(s.user_name || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {s.user_name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {s.content || (s.type === "image" ? "Photo" : "Status")}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {timeLeft(s.created_at)}
                  </span>
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
                onClick={() => {
                  setComposerOpen(false);
                  setPreviewImg(null);
                  setPendingFile(null);
                }}
                className="w-9 h-9 rounded-full hover:bg-white/5 active:scale-95 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </header>
            <div className="p-4 space-y-3">
              {previewImg ? (
                <div className="relative rounded-xl overflow-hidden">
                  <img
                    src={previewImg}
                    className="w-full max-h-48 object-cover rounded-xl"
                    alt="preview"
                  />
                  <button
                    onClick={() => {
                      setPreviewImg(null);
                      setPendingFile(null);
                    }}
                    className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              ) : (
                <div
                  className="w-full h-32 rounded-xl flex items-center justify-center text-white text-sm font-semibold"
                  style={{ background: bgColor }}
                >
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
                      className={`w-7 h-7 rounded-full transition ${
                        bgColor === color
                          ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                          : ""
                      }`}
                      style={{ background: color }}
                      aria-label={`color ${color}`}
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
                  <span className="text-xs text-muted-foreground">
                    {draft.length}/200
                  </span>
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
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />
        </div>
      )}

      {/* Fullscreen Status Viewer */}
      {viewingStatus && (
        <div
          className="fixed inset-0 z-50 bg-black flex flex-col"
          onClick={() => setViewingStatus(null)}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-white/20 rounded-full mx-4 mt-3">
            <div
              className="h-full bg-white rounded-full animate-[shrink_5s_linear_forwards]"
              style={{ width: "100%" }}
            />
          </div>
          <div className="absolute top-5 left-4 right-14 flex items-center gap-2 z-10">
            {viewingStatus.user_avatar ? (
              <img
                src={viewingStatus.user_avatar}
                className="w-9 h-9 rounded-full object-cover"
                alt={viewingStatus.user_name}
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white font-semibold">
                {viewingStatus.user_name?.charAt(0).toUpperCase() || "?"}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate">
                {viewingStatus.user_name}
              </p>
              <p className="text-white/70 text-[11px]">
                {timeLeft(viewingStatus.created_at)}
              </p>
            </div>
          </div>
          <button
            className="absolute top-5 right-4 z-10 w-9 h-9 flex items-center justify-center"
            onClick={() => setViewingStatus(null)}
          >
            <X className="w-6 h-6 text-white" />
          </button>
          {viewingStatus.media_url ? (
            <img
              src={viewingStatus.media_url}
              className="flex-1 object-contain"
              alt="status"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              className="flex-1 flex items-center justify-center p-8"
              style={{ background: viewingStatus.background_color }}
            >
              <p className="text-white text-2xl font-semibold text-center leading-relaxed">
                {viewingStatus.content}
              </p>
            </div>
          )}
          {viewingStatus.media_url && viewingStatus.content && (
            <div className="absolute bottom-10 left-0 right-0 px-6">
              <p className="text-white text-lg font-medium text-center drop-shadow-lg">
                {viewingStatus.content}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
