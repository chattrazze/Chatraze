import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AppUser, getUser, searchUsers } from "@/lib/userService";
import { addMemberToGroup, getChatStats, getGroupInfo, getSharedMedia, leaveGroup, MessageDoc, updateGroupInfo } from "@/lib/chatService";
import { supabase } from "@/lib/supabase";
import Avatar from "@/components/Avatar";
import { useToast } from "@/components/Toast";
import { useLang } from "@/hooks/useLang";
import {
  ArrowLeft,
  Camera,
  Check,
  Crown,
  Edit2,
  FileText,
  Image as ImageIcon,
  LogOut,
  MessageCircle,
  Mic,
  Plus,
  Search,
  Video,
  X,
} from "lucide-react";

interface Props {
  chatId: string;
  group: AppUser;
  onBack: () => void;
  onLeft: () => void;
  onMemberAdded?: (newMemberIds: string[]) => void;
}

function useDebounced<T>(val: T, ms: number): T {
  const [d, setD] = useState(val);
  useEffect(() => {
    const timer = setTimeout(() => setD(val), ms);
    return () => clearTimeout(timer);
  }, [val, ms]);
  return d;
}

export default function GroupProfilePage({ chatId, group, onBack, onLeft, onMemberAdded }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const { t } = useLang();
  const [stats, setStats] = useState({ messageCount: 0, imageCount: 0, videoCount: 0, fileCount: 0, audioCount: 0 });
  const [media, setMedia] = useState<MessageDoc[]>([]);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>(group.members ?? []);
  const [tab, setTab] = useState<"members" | "media" | "files">("members");
  const [leaving, setLeaving] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [createdBy, setCreatedBy] = useState<string>("");
  const [groupAvatarUrl, setGroupAvatarUrl] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState(group.displayName);
  const [savingGroup, setSavingGroup] = useState(false);
  const groupPhotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getChatStats(chatId).then(setStats).catch(() => {});
    getSharedMedia(chatId).then(setMedia).catch(() => {});
    getGroupInfo(chatId).then((info) => {
      if (info.createdBy) setCreatedBy(info.createdBy);
      if (info.avatarUrl) setGroupAvatarUrl(info.avatarUrl);
      if (info.name) setEditName(info.name);
    }).catch(() => {});
  }, [chatId]);

  const isAdmin = !!user && user.uid === createdBy;

  async function handleGroupPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    setSavingGroup(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
      const path = `groups/${chatId}/${Date.now()}_${safe}`;
      const { data, error } = await supabase.storage
        .from("chat-media")
        .upload(path, file, { cacheControl: "31536000", upsert: false });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(data.path);
      await updateGroupInfo(chatId, { avatar_url: urlData.publicUrl });
      setGroupAvatarUrl(urlData.publicUrl);
      toast.show(t("groupPhotoUpdated"));
    } catch {
      toast.show(t("couldNotUploadPhoto"));
    } finally {
      setSavingGroup(false);
    }
  }

  async function saveGroupName() {
    if (!editName.trim()) return;
    setSavingGroup(true);
    try {
      await updateGroupInfo(chatId, { name: editName.trim() });
      toast.show(t("groupNameEdited"));
      setEditMode(false);
    } catch {
      toast.show(t("couldNotSaveProfile"));
    } finally {
      setSavingGroup(false);
    }
  }

  useEffect(() => {
    if (memberIds.length === 0) return;
    Promise.all(memberIds.map((id) => getUser(id))).then((results) => {
      setMembers(results.filter((u): u is AppUser => !!u));
    }).catch(() => {});
  }, [memberIds.join(",")]);

  const images = useMemo(() => media.filter((m) => m.type === "image"), [media]);
  const videos = useMemo(() => media.filter((m) => m.type === "video"), [media]);
  const files  = useMemo(() => media.filter((m) => m.type === "file"), [media]);

  async function handleLeave() {
    if (!user) return;
    setLeaving(true);
    try {
      await leaveGroup(chatId, user.uid);
      toast.show(t("leftGroup"));
      onLeft();
    } catch (err) {
      toast.show(`Error: ${(err as { message?: string }).message ?? "Unknown"}`);
    } finally {
      setLeaving(false);
    }
  }

  function handleMemberAdded(newUid: string, newUser: AppUser) {
    const next = [...memberIds, newUid];
    setMemberIds(next);
    setMembers((prev) => [...prev, newUser]);
    onMemberAdded?.(next);
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-3 glass border-b border-border shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-white/5 transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-semibold text-base flex-1">{t("groupInfo")}</h1>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="relative">
          <div className="h-36 bg-gradient-to-br from-accent/80 to-accent" />
          <div className="flex justify-center -mt-12">
            <div className="relative ring-4 ring-background rounded-full shadow-2xl group/avatar">
              <Avatar name={editName || group.displayName} photoURL={groupAvatarUrl} size={96} />
              {isAdmin && (
                <button
                  onClick={() => groupPhotoRef.current?.click()}
                  disabled={savingGroup}
                  className="absolute inset-0 rounded-full bg-black/55 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition disabled:opacity-50"
                >
                  <Camera className="w-6 h-6 text-white" />
                </button>
              )}
            </div>
          </div>
          <input ref={groupPhotoRef} type="file" accept="image/*" className="hidden" onChange={handleGroupPhotoChange} />
        </div>

        <div className="text-center px-6 pt-3 pb-5">
          {editMode ? (
            <div className="flex items-center gap-2 justify-center flex-wrap">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={50}
                className="bg-input border border-border rounded-xl px-3 py-1.5 text-sm text-center outline-none focus:ring-2 focus:ring-primary/50 min-w-0 w-40"
              />
              <button
                onClick={saveGroupName}
                disabled={savingGroup}
                className="px-3 py-1.5 rounded-xl bg-secondary text-white text-xs font-semibold disabled:opacity-50"
              >
                {savingGroup ? t("saving") : t("save")}
              </button>
              <button
                onClick={() => setEditMode(false)}
                className="px-2 py-1.5 rounded-xl bg-white/5 text-xs text-muted-foreground hover:bg-white/10"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-xl font-bold">{editName || group.displayName}</h2>
              {isAdmin && (
                <button onClick={() => setEditMode(true)} className="text-muted-foreground hover:text-foreground transition">
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
          <p className="text-sm text-muted-foreground mt-1">{memberIds.length} {t("membersCount")}</p>
        </div>

        <div className="grid grid-cols-4 gap-3 px-5 mb-5">
          {[
            { label: t("messagesLabel"), value: stats.messageCount, Icon: MessageCircle, color: "text-primary"   },
            { label: t("photosLabel"),   value: stats.imageCount,   Icon: ImageIcon,     color: "text-accent"    },
            { label: t("videosLabel"),   value: stats.videoCount,   Icon: Video,         color: "text-secondary" },
            { label: t("voiceLabel"),    value: stats.audioCount,   Icon: Mic,           color: "text-yellow-400"},
          ].map(({ label, value, Icon, color }) => (
            <div key={label} className="glass rounded-2xl p-3 text-center">
              <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
              <p className="text-lg font-bold leading-none">{value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <div className="px-5 mb-4">
          <div className="flex gap-1 glass rounded-2xl p-1">
            {(["members", "media", "files"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex-1 py-2 rounded-xl text-xs font-medium capitalize transition ${
                  tab === k ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {k === "members"
                  ? `${t("membersCount")} (${memberIds.length})`
                  : k === "media"
                  ? `${t("mediaTab")} (${images.length + videos.length})`
                  : `${t("filesTab")} (${files.length})`}
              </button>
            ))}
          </div>
        </div>

        {tab === "members" && (
          <div className="px-5 mb-5 space-y-2">
            <button
              onClick={() => setShowAddMember(true)}
              className="w-full flex items-center gap-3 glass rounded-2xl px-4 py-3 hover:bg-white/5 transition group"
            >
              <div className="w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center shrink-0 group-hover:bg-primary/30 transition">
                <Plus className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm font-semibold text-primary">{t("addMember")}</p>
            </button>

            {members.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">{t("loadingMembers")}</p>
            )}
            {members.map((m) => {
              const isMe = m.uid === user?.uid;
              const isMemberAdmin = m.uid === createdBy;
              return (
                <div key={m.uid} className="flex items-center gap-3 glass rounded-2xl px-4 py-3">
                  <div className="relative shrink-0">
                    <Avatar name={m.displayName} photoURL={m.photoURL} size={44} />
                    {m.online && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-secondary border-2 border-background" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold truncate">
                        {m.displayName}{isMe && <span className="text-muted-foreground font-normal"> {t("youSuffix")}</span>}
                      </p>
                      {isMemberAdmin && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-yellow-400 bg-yellow-400/15 rounded-full px-1.5 py-0.5 shrink-0 border border-yellow-400/20">
                          <Crown className="w-2.5 h-2.5" />
                          {t("adminLabel")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {m.online ? t("onlineCapital") : t("offlineCapital")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "media" && (
          <div className="px-5 mb-5">
            {[...images, ...videos].length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t("noMediaShared")}</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {[...images, ...videos].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => m.type === "image" && m.mediaUrl && setLightbox(m.mediaUrl)}
                    className="aspect-square rounded-xl overflow-hidden bg-white/5 hover:opacity-80 transition"
                  >
                    {m.type === "image" ? (
                      <img src={m.mediaUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                        <Video className="w-6 h-6 text-muted-foreground" />
                        <span className="text-[9px] text-muted-foreground">{t("video")}</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "files" && (
          <div className="px-5 mb-5 space-y-2">
            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t("noFilesShared")}</p>
            ) : files.map((m) => (
              <a
                key={m.id}
                href={m.mediaUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 glass rounded-xl px-4 py-3 hover:bg-white/5 transition"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.mediaName || t("file")}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.createdAt ? new Date(m.createdAt).toLocaleDateString() : ""}
                  </p>
                </div>
              </a>
            ))}
          </div>
        )}

        <div className="px-5 pb-8">
          <button
            onClick={handleLeave}
            disabled={leaving}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-sm font-semibold text-red-400 border border-red-500/30 hover:bg-red-500/10 transition disabled:opacity-40"
          >
            <LogOut className="w-5 h-5" />
            {leaving ? t("leavingGroup") : t("leaveGroup")}
          </button>
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt={t("preview")}
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {showAddMember && (
        <AddMemberSheet
          chatId={chatId}
          currentMemberIds={memberIds}
          currentUid={user?.uid ?? ""}
          onClose={() => setShowAddMember(false)}
          onAdded={handleMemberAdded}
        />
      )}
    </div>
  );
}

/* ─── AddMemberSheet ─────────────────────────────────────────────────────── */
function AddMemberSheet({
  chatId,
  currentMemberIds,
  currentUid,
  onClose,
  onAdded,
}: {
  chatId: string;
  currentMemberIds: string[];
  currentUid: string;
  onClose: () => void;
  onAdded: (uid: string, user: AppUser) => void;
}) {
  const toast = useToast();
  const { t } = useLang();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const debounced = useDebounced(q, 250);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!debounced.trim()) { setResults([]); return; }
    setLoading(true);
    searchUsers(debounced)
      .then((r) => {
        if (cancelled) return;
        setResults(r.filter((u) => u.uid !== currentUid && !currentMemberIds.includes(u.uid)));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debounced, currentUid, currentMemberIds.join(",")]);

  async function handleAdd(u: AppUser) {
    setAdding(u.uid);
    try {
      await addMemberToGroup(chatId, u.uid);
      toast.show(`${u.displayName} ${t("addedToGroup")}`);
      onAdded(u.uid, u);
      onClose();
    } catch (err) {
      toast.show(`Failed: ${(err as { message?: string }).message ?? "Unknown error"}`);
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative glass w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden z-10">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-base">{t("addMember")}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 bg-input border border-border rounded-xl px-3 py-2.5">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchByName")}
              className="bg-transparent outline-none flex-1 text-sm"
            />
            {q && (
              <button onClick={() => setQ("")} className="text-muted-foreground hover:text-foreground transition">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="max-h-[50vh] overflow-y-auto scrollbar-thin space-y-1">
            {loading && (
              <p className="text-sm text-muted-foreground text-center py-6">{t("searching")}</p>
            )}
            {!loading && !q && (
              <p className="text-sm text-muted-foreground text-center py-6">
                {t("typeNameToFind")}
              </p>
            )}
            {!loading && q && results.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                {t("notInGroup")}
              </p>
            )}
            {results.map((u) => {
              const isAdding = adding === u.uid;
              return (
                <div
                  key={u.uid}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition"
                >
                  <div className="relative shrink-0">
                    <Avatar name={u.displayName} photoURL={u.photoURL} size={44} />
                    {u.online && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-secondary border-2 border-background" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{u.displayName}</p>
                    <p className="text-xs text-muted-foreground">{u.online ? t("onlineCapital") : t("offlineCapital")}</p>
                  </div>
                  <button
                    onClick={() => handleAdd(u)}
                    disabled={isAdding}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary/20 text-primary text-xs font-semibold hover:bg-primary/30 active:scale-95 transition disabled:opacity-40 shrink-0"
                  >
                    {isAdding ? (
                      <span>{t("adding")}</span>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        {t("add")}
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
