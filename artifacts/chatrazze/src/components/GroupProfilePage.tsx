import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/hooks/useAuth";
import { AppUser, getUser, searchUsers } from "@/lib/userService";
import {
  addMemberToGroup,
  clearGroupMessages,
  getChatStats,
  getGroupInfo,
  getMessages,
  getGroupSelfDestruct,
  getOrCreateInviteToken,
  getSharedMedia,
  isStarredChat,
  leaveGroup,
  MessageDoc,
  toggleStarredChat,
  updateGroupInfo,
  updateGroupSelfDestruct,
} from "@/lib/chatService";
import { supabase } from "@/lib/supabase";
import Avatar from "@/components/Avatar";
import { useToast } from "@/components/Toast";
import { useLang } from "@/hooks/useLang";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Camera,
  Check,
  ChevronRight,
  Crown,
  Download,
  Edit2,
  FileText,
  Image as ImageIcon,
  Info,
  Link as LinkIcon,
  Lock,
  LockOpen,
  LogOut,
  MessageCircle,
  Mic,
  Phone,
  Plus,
  QrCode,
  Search,
  Shield,
  Star,
  Trash2,
  TriangleAlert,
  Video,
  X,
} from "lucide-react";

/* ─── localStorage helpers ──────────────────────────────────────────────── */

function getMutedUntil(chatId: string): number | null {
  try {
    const raw = localStorage.getItem(`chatrazze:mute:${chatId}`);
    if (!raw) return null;
    const until = parseInt(raw, 10);
    if (Date.now() > until) { localStorage.removeItem(`chatrazze:mute:${chatId}`); return null; }
    return until;
  } catch { return null; }
}
function saveMutedUntil(chatId: string, until: number | null) {
  if (until === null) localStorage.removeItem(`chatrazze:mute:${chatId}`);
  else localStorage.setItem(`chatrazze:mute:${chatId}`, String(until));
}
function getDisappearTimer(chatId: string): number {
  try { return parseInt(localStorage.getItem(`chatrazze:disappear:${chatId}`) ?? "0", 10) || 0; }
  catch { return 0; }
}
function saveDisappearTimer(chatId: string, secs: number) {
  if (secs === 0) localStorage.removeItem(`chatrazze:disappear:${chatId}`);
  else localStorage.setItem(`chatrazze:disappear:${chatId}`, String(secs));
}
function getChatLockPIN(chatId: string): string | null {
  return localStorage.getItem(`chatrazze:lock:${chatId}`);
}
function saveChatLockPIN(chatId: string, pin: string | null) {
  if (pin === null) localStorage.removeItem(`chatrazze:lock:${chatId}`);
  else localStorage.setItem(`chatrazze:lock:${chatId}`, pin);
}
function exportAsText(msgs: MessageDoc[], members: AppUser[], groupName: string): void {
  const nameMap = Object.fromEntries(members.map((m) => [m.uid, m.displayName]));
  const lines = msgs.map((m) => {
    const sender = nameMap[m.senderId] ?? m.senderId.slice(0, 8);
    const date = m.createdAt ? new Date(m.createdAt).toLocaleString() : "";
    const body = m.type === "text" ? (m.text ?? "") : `[${m.type}]${m.mediaName ? ` ${m.mediaName}` : ""}`;
    return `[${date}] ${sender}: ${body}`;
  });
  const blob = new Blob([`${groupName}\n${"─".repeat(40)}\n\n${lines.join("\n")}`], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${groupName.replace(/[^a-z0-9]/gi, "_")}_chat.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function useDebounced<T>(val: T, ms: number): T {
  const [d, setD] = useState(val);
  useEffect(() => { const t = setTimeout(() => setD(val), ms); return () => clearTimeout(t); }, [val, ms]);
  return d;
}

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface Props {
  chatId: string;
  group: AppUser;
  onBack: () => void;
  onLeft: () => void;
  onMemberAdded?: (newMemberIds: string[]) => void;
  onInitiateCall?: (peerUid: string, peerName: string, kind: "voice" | "video") => void;
}

/* ═══════════════════════════════════════════════════════════════════════════
   GroupProfilePage
═══════════════════════════════════════════════════════════════════════════ */
export default function GroupProfilePage({ chatId, group, onBack, onLeft, onMemberAdded, onInitiateCall }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const { t } = useLang();

  /* stats & media */
  const [stats, setStats] = useState({ messageCount: 0, imageCount: 0, videoCount: 0, fileCount: 0, audioCount: 0 });
  const [media, setMedia] = useState<MessageDoc[]>([]);

  /* members */
  const [members, setMembers] = useState<AppUser[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>(group.members ?? []);
  const [createdBy, setCreatedBy] = useState<string>("");

  /* group info */
  const [groupAvatarUrl, setGroupAvatarUrl] = useState<string | null>(null);
  const [editName, setEditName] = useState(group.displayName);
  const [editMode, setEditMode] = useState(false);
  const [groupDescription, setGroupDescription] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editDescMode, setEditDescMode] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const groupPhotoRef = useRef<HTMLInputElement>(null);

  /* tabs & lightbox */
  const [tab, setTab] = useState<"members" | "media" | "files">("members");
  const [lightbox, setLightbox] = useState<string | null>(null);

  /* add member / leave */
  const [showAddMember, setShowAddMember] = useState(false);
  const [leaving, setLeaving] = useState(false);

  /* notifications mute */
  const [mutedUntil, setMutedUntil] = useState<number | null>(() => getMutedUntil(chatId));
  const isMuted = mutedUntil !== null && Date.now() < mutedUntil;

  /* disappearing messages — loaded from DB on mount */
  const [disappearSecs, setDisappearSecs] = useState<number>(0);

  /* members expandable section */
  const [showAllMembers, setShowAllMembers] = useState(false);

  /* bottom action sheet */
  const [showActionSheet, setShowActionSheet] = useState(false);

  /* lock chat */
  const [lockPIN, setLockPIN] = useState<string | null>(() => getChatLockPIN(chatId));
  const [showPINModal, setShowPINModal] = useState<"setup" | "remove" | null>(null);
  const [pinA, setPinA] = useState("");
  const [pinB, setPinB] = useState("");
  const [pinStep, setPinStep] = useState<1 | 2>(1);
  const [pinError, setPinError] = useState("");

  /* favorite — loaded from DB on mount */
  const [isFav, setIsFav] = useState(false);

  /* search in chat */
  const [showSearch, setShowSearch] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<MessageDoc[]>([]);
  const [allMessages, setAllMessages] = useState<MessageDoc[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  /* invite link / QR */
  const [showInvite, setShowInvite] = useState(false);
  const [inviteUrl, setInviteUrl] = useState(`${window.location.origin}${window.location.pathname}#invite:${chatId}`);

  /* encryption info */
  const [showEncrypt, setShowEncrypt] = useState(false);

  /* confirm modal */
  const [confirm, setConfirm] = useState<{ msg: string; onOk: () => void } | null>(null);

  /* call member picker */
  const [showCallPicker, setShowCallPicker] = useState<"voice" | "video" | null>(null);

  /* member search */
  const [memberSearchQ, setMemberSearchQ] = useState("");

  /* ── init ─────────────────────────────────────────────── */
  useEffect(() => {
    getChatStats(chatId).then(setStats).catch((e) => console.error("[GroupProfile] stats:", e));
    getSharedMedia(chatId).then(setMedia).catch((e) => console.error("[GroupProfile] media:", e));
    getGroupInfo(chatId).then((info) => {
      if (info.createdBy) setCreatedBy(info.createdBy);
      if (info.avatarUrl) setGroupAvatarUrl(info.avatarUrl);
      if (info.name) setEditName(info.name);
      if (info.description) { setGroupDescription(info.description); setEditDesc(info.description); }
    }).catch((e) => console.error("[GroupProfile] groupInfo:", e));
    getGroupSelfDestruct(chatId).then(setDisappearSecs).catch((e) => console.error("[GroupProfile] selfDestruct:", e));
  }, [chatId]);

  useEffect(() => {
    if (!memberIds.length) return;
    Promise.all(memberIds.map((id) => getUser(id)))
      .then((r) => setMembers(r.filter((u): u is AppUser => !!u)))
      .catch(() => {});
  }, [memberIds.join(",")]);

  useEffect(() => {
    if (!user) return;
    isStarredChat(chatId, user.uid).then(setIsFav).catch(() => {});
  }, [chatId, user?.uid]);

  const isAdmin = !!user && user.uid === createdBy;
  const images  = useMemo(() => media.filter((m) => m.type === "image"), [media]);
  const videos  = useMemo(() => media.filter((m) => m.type === "video"), [media]);
  const files   = useMemo(() => media.filter((m) => m.type === "file"),  [media]);

  const filteredMembers = useMemo(() =>
    memberSearchQ.trim()
      ? members.filter((m) => m.displayName.toLowerCase().includes(memberSearchQ.toLowerCase()))
      : members,
    [members, memberSearchQ]
  );

  /* ── group photo ──────────────────────────────────────── */
  async function handleGroupPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    setSavingGroup(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
      const path = `groups/${chatId}/${Date.now()}_${safe}`;
      const { data, error } = await supabase.storage.from("chat-media").upload(path, file, { cacheControl: "31536000", upsert: false });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(data.path);
      await updateGroupInfo(chatId, { avatar_url: urlData.publicUrl });
      setGroupAvatarUrl(urlData.publicUrl);
      toast.show(t("groupPhotoUpdated"));
    } catch { toast.show(t("couldNotUploadPhoto")); }
    finally { setSavingGroup(false); }
  }

  /* ── group name ───────────────────────────────────────── */
  async function saveGroupName() {
    if (!editName.trim()) return;
    setSavingGroup(true);
    try {
      await updateGroupInfo(chatId, { name: editName.trim() });
      toast.show(t("groupNameEdited"));
      setEditMode(false);
    } catch { toast.show(t("couldNotSaveProfile")); }
    finally { setSavingGroup(false); }
  }

  /* ── group description ────────────────────────────────── */
  async function saveGroupDesc() {
    setSavingGroup(true);
    try {
      await updateGroupInfo(chatId, { description: editDesc.trim() });
      setGroupDescription(editDesc.trim());
      setEditDescMode(false);
    } catch { toast.show(t("couldNotSaveProfile")); }
    finally { setSavingGroup(false); }
  }

  /* ── leave group ──────────────────────────────────────── */
  async function handleLeave() {
    if (!user) return;
    setLeaving(true);
    try {
      await leaveGroup(chatId, user.uid);
      toast.show(t("leftGroup"));
      onLeft();
    } catch (err) { toast.show(`Error: ${(err as { message?: string }).message ?? "Unknown"}`); }
    finally { setLeaving(false); }
  }

  /* ── clear chat (admin only, verified server-side) ───────*/
  async function handleClearChat() {
    if (!user) return;
    try {
      await clearGroupMessages(chatId, user.uid);
      setAllMessages([]);
      toast.show(t("chatCleared"));
    } catch { toast.show(t("couldNotSaveProfile")); }
  }

  /* ── export chat ──────────────────────────────────────── */
  async function handleExport() {
    setLoadingSearch(true);
    try {
      const msgs = await getMessages(chatId);
      exportAsText(msgs, members, editName || group.displayName);
      toast.show(t("chatExported"));
    } catch { toast.show(t("couldNotSaveProfile")); }
    finally { setLoadingSearch(false); }
  }

  /* ── mute ─────────────────────────────────────────────── */
  function handleMute(hours: number | "always") {
    const until = hours === "always" ? Date.now() + 1e12 : Date.now() + hours * 3600 * 1000;
    saveMutedUntil(chatId, until);
    setMutedUntil(until);
    toast.show(t("muteNotifs"));
  }
  function handleUnmute() {
    saveMutedUntil(chatId, null);
    setMutedUntil(null);
    toast.show(t("unmute"));
  }

  /* ── disappearing messages (localStorage + DB) ────────── */
  async function handleDisappear(secs: number) {
    saveDisappearTimer(chatId, secs);
    setDisappearSecs(secs);
    toast.show(secs === 0 ? t("disappearOff") : secs === 86400 ? t("disappear24h") : secs === 604800 ? t("disappear7d") : t("disappear90d"));
    await updateGroupSelfDestruct(chatId, secs).catch(() => {});
  }

  /* ── lock chat PIN ────────────────────────────────────── */
  function handlePINDone() {
    if (showPINModal === "setup") {
      if (pinStep === 1) {
        if (pinA.length < 4) { setPinError("Min 4 digits"); return; }
        setPinStep(2);
        setPinError("");
      } else {
        if (pinA !== pinB) { setPinError(t("wrongPIN")); return; }
        saveChatLockPIN(chatId, pinA);
        setLockPIN(pinA);
        toast.show(t("pinSet"));
        closePINModal();
      }
    } else {
      if (pinA === lockPIN) {
        saveChatLockPIN(chatId, null);
        setLockPIN(null);
        toast.show(t("pinRemoved"));
        closePINModal();
      } else {
        setPinError(t("wrongPIN"));
      }
    }
  }
  function closePINModal() {
    setShowPINModal(null);
    setPinA(""); setPinB(""); setPinStep(1); setPinError("");
  }

  /* ── search in chat ───────────────────────────────────── */
  useEffect(() => {
    if (!showSearch) return;
    setLoadingSearch(true);
    getMessages(chatId)
      .then((m) => { setAllMessages(m); setLoadingSearch(false); })
      .catch(() => setLoadingSearch(false));
  }, [showSearch, chatId]);

  useEffect(() => {
    if (!searchQ.trim()) { setSearchResults([]); return; }
    const q = searchQ.toLowerCase();
    setSearchResults(allMessages.filter((m) => m.type === "text" && (m.text ?? "").toLowerCase().includes(q)));
  }, [searchQ, allMessages]);

  useEffect(() => {
    if (showSearch) setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [showSearch]);

  useEffect(() => {
    if (!showInvite) return;
    getOrCreateInviteToken(chatId)
      .then((token) => setInviteUrl(`${window.location.origin}/join/${token}`))
      .catch(() => {});
  }, [showInvite, chatId]);

  /* ── add member ───────────────────────────────────────── */
  function handleMemberAdded(newUid: string, newUser: AppUser) {
    const next = [...memberIds, newUid];
    setMemberIds(next);
    setMembers((prev) => [...prev, newUser]);
    onMemberAdded?.(next);
  }

  /* ── favorite (DB-backed via starred_chats) ───────────── */
  async function handleFavorite() {
    if (!user) return;
    try {
      const now = await toggleStarredChat(chatId, user.uid);
      setIsFav(now);
      toast.show(now ? t("markFavorite") : t("removeFavorite"));
    } catch {
      toast.show(t("couldNotSaveProfile"));
    }
  }

  /* ── copy invite link ─────────────────────────────────── */
  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.show(t("linkCopied"));
    } catch {
      toast.show(inviteUrl);
    }
  }

  /* ─────────────────────────────────────────────────────── */

  const disappearLabel =
    disappearSecs === 0 ? t("disappearOff") :
    disappearSecs === 86400 ? t("disappear24h") :
    disappearSecs === 604800 ? t("disappear7d") : t("disappear90d");

  function HighlightText({ text, query }: { text: string; query: string }) {
    if (!query.trim()) return <>{text}</>;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = text.split(new RegExp(`(${escaped})`, "gi"));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="bg-yellow-400/40 text-foreground rounded px-0.5">{part}</mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-4 py-3 glass border-b border-border shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-white/5 transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-semibold text-base flex-1">{t("groupInfo")}</h1>
        <button onClick={() => setShowSearch(true)} className="p-1.5 rounded-lg hover:bg-white/5 transition" title={t("searchInChat")}>
          <Search className="w-5 h-5 text-muted-foreground" />
        </button>
        {onInitiateCall && (
          <>
            <button onClick={() => setShowCallPicker("voice")} className="p-1.5 rounded-lg hover:bg-white/5 transition" title={t("voiceCallBtn")}>
              <Phone className="w-5 h-5 text-muted-foreground" />
            </button>
            <button onClick={() => setShowCallPicker("video")} className="p-1.5 rounded-lg hover:bg-white/5 transition" title={t("videoCallBtn")}>
              <Video className="w-5 h-5 text-muted-foreground" />
            </button>
          </>
        )}
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* ── Hero / Avatar ── */}
        <div className="relative">
          <div className="h-32 bg-gradient-to-br from-accent/80 to-primary/60" />
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

        {/* ── Name & Description ── */}
        <div className="text-center px-6 pt-3 pb-2">
          {editMode ? (
            <div className="flex items-center gap-2 justify-center flex-wrap">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={50}
                className="bg-input border border-border rounded-xl px-3 py-1.5 text-sm text-center outline-none focus:ring-2 focus:ring-primary/50 min-w-0 w-44"
              />
              <button onClick={saveGroupName} disabled={savingGroup} className="px-3 py-1.5 rounded-xl bg-secondary text-white text-xs font-semibold disabled:opacity-50">
                {savingGroup ? t("saving") : t("save")}
              </button>
              <button onClick={() => setEditMode(false)} className="px-2 py-1.5 rounded-xl bg-white/5 text-xs text-muted-foreground">
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
          <p className="text-xs text-muted-foreground mt-1">{t("group")} · {memberIds.length} {t("membersCount")}</p>

          {/* description */}
          <div className="mt-3 text-left">
            {editDescMode ? (
              <div className="space-y-2">
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  maxLength={200}
                  rows={3}
                  placeholder={t("descriptionHint")}
                  className="w-full bg-input border border-border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
                <div className="flex gap-2">
                  <button onClick={saveGroupDesc} disabled={savingGroup} className="flex-1 py-1.5 rounded-xl bg-secondary text-white text-xs font-semibold disabled:opacity-50">
                    {savingGroup ? t("saving") : t("save")}
                  </button>
                  <button onClick={() => { setEditDescMode(false); setEditDesc(groupDescription); }} className="px-3 py-1.5 rounded-xl bg-white/5 text-xs text-muted-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => isAdmin ? setEditDescMode(true) : undefined}
                className={`w-full text-left px-3 py-2 rounded-xl transition ${isAdmin ? "hover:bg-white/5 cursor-pointer" : "cursor-default"}`}
              >
                {groupDescription ? (
                  <div className="flex items-start gap-2">
                    <p className="text-sm flex-1">{groupDescription}</p>
                    {isAdmin && <Edit2 className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />}
                  </div>
                ) : isAdmin ? (
                  <p className="text-sm text-muted-foreground italic">{t("addGroupDesc")}</p>
                ) : null}
              </button>
            )}
          </div>
        </div>

        {/* ── Stats grid ── */}
        <div className="grid grid-cols-4 gap-3 px-5 mb-5 mt-2">
          {[
            { label: t("messagesLabel"), value: stats.messageCount, Icon: MessageCircle, color: "text-primary"    },
            { label: t("photosLabel"),   value: stats.imageCount,   Icon: ImageIcon,     color: "text-accent"     },
            { label: t("videosLabel"),   value: stats.videoCount,   Icon: Video,         color: "text-secondary"  },
            { label: t("voiceLabel"),    value: stats.audioCount,   Icon: Mic,           color: "text-yellow-400" },
          ].map(({ label, value, Icon, color }) => (
            <div key={label} className="glass rounded-2xl p-3 text-center">
              <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
              <p className="text-lg font-bold leading-none">{value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Settings rows ── */}
        <div className="px-5 mb-5 space-y-2">
          {/* Mute */}
          <SettingRow
            Icon={isMuted ? BellOff : Bell}
            label={isMuted ? t("mutedLabel") : t("muteNotifs")}
            value={isMuted ? "✓" : ""}
            color={isMuted ? "text-yellow-400" : "text-muted-foreground"}
          >
            <div className="flex flex-col gap-1 py-1">
              {isMuted ? (
                <ActionBtn label={t("unmute")} onClick={handleUnmute} />
              ) : (
                <>
                  <ActionBtn label={t("mute8h")} onClick={() => handleMute(8)} />
                  <ActionBtn label={t("mute1w")} onClick={() => handleMute(168)} />
                  <ActionBtn label={t("muteAlways")} onClick={() => handleMute("always")} />
                </>
              )}
            </div>
          </SettingRow>

          {/* Disappearing messages — admin sets timer; others see current value */}
          {isAdmin ? (
            <SettingRow Icon={Trash2} label={t("disappearingMsgs")} value={disappearLabel} color="text-muted-foreground">
              <div className="flex flex-col gap-1 py-1">
                <ActionBtn label={t("disappearOff")} active={disappearSecs === 0} onClick={() => handleDisappear(0)} />
                <ActionBtn label={t("disappear24h")} active={disappearSecs === 86400} onClick={() => handleDisappear(86400)} />
                <ActionBtn label={t("disappear7d")} active={disappearSecs === 604800} onClick={() => handleDisappear(604800)} />
                <ActionBtn label={t("disappear90d")} active={disappearSecs === 7776000} onClick={() => handleDisappear(7776000)} />
              </div>
            </SettingRow>
          ) : (
            <SettingRow Icon={Trash2} label={t("disappearingMsgs")} value={disappearLabel} color="text-muted-foreground/50" />
          )}

          {/* Lock chat */}
          <SettingRow
            Icon={lockPIN ? Lock : LockOpen}
            label={t("lockChat")}
            value={lockPIN ? "✓ " + t("pinSet") : t("lockChatDesc")}
            color={lockPIN ? "text-green-400" : "text-muted-foreground"}
            onClick={() => { setShowPINModal(lockPIN ? "remove" : "setup"); setPinStep(1); }}
          />

          {/* Encryption info */}
          <SettingRow Icon={Shield} label={t("encryptionInfo")} color="text-muted-foreground" onClick={() => setShowEncrypt(true)} arrow />

          {/* Invite via link */}
          <SettingRow Icon={LinkIcon} label={t("inviteViaLink")} color="text-muted-foreground" onClick={() => setShowInvite(true)} arrow />
        </div>

        {/* ── Tab bar ── */}
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

        {/* ── Members tab ── */}
        {tab === "members" && (
          <div className="px-5 mb-5 space-y-2">
            {/* Member search */}
            {members.length > 5 && (
              <div className="flex items-center gap-2 bg-input border border-border rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  value={memberSearchQ}
                  onChange={(e) => setMemberSearchQ(e.target.value)}
                  placeholder={t("searchByName")}
                  className="bg-transparent outline-none flex-1 text-sm"
                />
                {memberSearchQ && <button onClick={() => setMemberSearchQ("")}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>}
              </div>
            )}

            {/* Invite via link */}
            <button
              onClick={() => setShowInvite(true)}
              className="w-full flex items-center gap-3 glass rounded-2xl px-4 py-3 hover:bg-white/5 transition group"
            >
              <div className="w-11 h-11 rounded-full bg-accent/20 flex items-center justify-center shrink-0 group-hover:bg-accent/30 transition">
                <LinkIcon className="w-5 h-5 text-accent" />
              </div>
              <p className="text-sm font-semibold text-accent">{t("inviteViaLink")}</p>
            </button>

            {/* Add member */}
            {isAdmin && (
              <button
                onClick={() => setShowAddMember(true)}
                className="w-full flex items-center gap-3 glass rounded-2xl px-4 py-3 hover:bg-white/5 transition group"
              >
                <div className="w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center shrink-0 group-hover:bg-primary/30 transition">
                  <Plus className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm font-semibold text-primary">{t("addMember")}</p>
              </button>
            )}

            {members.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">{t("loadingMembers")}</p>
            )}

            {(memberSearchQ ? filteredMembers : (showAllMembers ? filteredMembers : filteredMembers.slice(0, 5))).map((m) => {
              const isMe = m.uid === user?.uid;
              const isMemberAdmin = m.uid === createdBy;
              return (
                <div key={m.uid} className="flex items-center gap-3 glass rounded-2xl px-4 py-3">
                  <div className="relative shrink-0">
                    <Avatar name={m.displayName} photoURL={m.photoURL} size={44} />
                    {m.online && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-secondary border-2 border-background" />}
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
                    <p className="text-xs text-muted-foreground">{m.online ? t("onlineCapital") : t("offlineCapital")}</p>
                  </div>
                  {!isMe && onInitiateCall && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => onInitiateCall(m.uid, m.displayName, "voice")}
                        className="p-1.5 rounded-lg hover:bg-white/5 transition text-muted-foreground hover:text-foreground"
                      >
                        <Phone className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onInitiateCall(m.uid, m.displayName, "video")}
                        className="p-1.5 rounded-lg hover:bg-white/5 transition text-muted-foreground hover:text-foreground"
                      >
                        <Video className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Expand / collapse all members */}
            {!memberSearchQ && filteredMembers.length > 5 && (
              <button
                onClick={() => setShowAllMembers((v) => !v)}
                className="w-full flex items-center justify-between glass rounded-2xl px-4 py-3 hover:bg-white/5 transition text-primary"
              >
                <span className="text-sm font-semibold">
                  {showAllMembers
                    ? t("showLessMembers")
                    : `${t("viewAllMembers")} (${filteredMembers.length})`}
                </span>
                <ChevronRight className={`w-4 h-4 transition-transform ${showAllMembers ? "rotate-90" : ""}`} />
              </button>
            )}
          </div>
        )}

        {/* ── Media tab ── */}
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

        {/* ── Files tab ── */}
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
                  <p className="text-xs text-muted-foreground">{m.createdAt ? new Date(m.createdAt).toLocaleDateString() : ""}</p>
                </div>
              </a>
            ))}
          </div>
        )}

        {/* ── Open action sheet trigger ── */}
        <div className="px-5 pb-8">
          <button
            onClick={() => setShowActionSheet(true)}
            className="w-full flex items-center justify-center gap-2 glass rounded-2xl px-4 py-3.5 hover:bg-white/5 transition text-foreground border border-border"
          >
            <TriangleAlert className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold">{t("moreActions")}</span>
          </button>
        </div>
      </div>

      {/* ════════════════ MODALS & OVERLAYS ════════════════ */}

      {/* ── Bottom Action Sheet ── */}
      {showActionSheet && (
        <div
          className="fixed inset-0 z-[60] flex flex-col justify-end"
          onClick={() => setShowActionSheet(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative bg-card rounded-t-3xl border-t border-border pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="px-5 pt-2 pb-6 space-y-1">
              {/* Favorite */}
              <button
                onClick={() => { setShowActionSheet(false); handleFavorite(); }}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-white/5 transition"
              >
                <Star className={`w-5 h-5 ${isFav ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground"}`} />
                <span className="text-sm font-medium">{isFav ? t("removeFavorite") : t("markFavorite")}</span>
              </button>
              {/* Export */}
              <button
                onClick={() => { setShowActionSheet(false); handleExport(); }}
                disabled={loadingSearch}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-white/5 transition disabled:opacity-50"
              >
                <Download className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm font-medium">{t("exportChat")}</span>
              </button>
              {/* Clear (admin) */}
              {isAdmin && (
                <button
                  onClick={() => { setShowActionSheet(false); setConfirm({ msg: t("clearAllMsgs"), onOk: handleClearChat }); }}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-orange-500/10 transition text-orange-400"
                >
                  <Trash2 className="w-5 h-5" />
                  <span className="text-sm font-medium">{t("clearAllMsgs")}</span>
                </button>
              )}
              {/* Divider */}
              <div className="h-px bg-border mx-4 my-1" />
              {/* Leave */}
              <button
                onClick={() => { setShowActionSheet(false); setConfirm({ msg: t("leaveGroup") + "?", onOk: handleLeave }); }}
                disabled={leaving}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-red-500/10 transition text-red-400 disabled:opacity-40"
              >
                <LogOut className="w-5 h-5" />
                <span className="text-sm font-medium">{leaving ? t("leavingGroup") : t("leaveGroup")}</span>
              </button>
              {/* Report */}
              <button
                onClick={() => { setShowActionSheet(false); toast.show(t("reportSent")); }}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-red-500/10 transition text-red-400"
              >
                <TriangleAlert className="w-5 h-5" />
                <span className="text-sm font-medium">{t("reportGroup")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt={t("preview")} className="max-w-full max-h-full object-contain rounded-xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* ── Search in chat ── */}
      {showSearch && (
        <div className="fixed inset-0 z-[60] bg-background flex flex-col">
          <div className="flex items-center gap-3 px-4 py-3 glass border-b border-border">
            <button onClick={() => { setShowSearch(false); setSearchQ(""); setSearchResults([]); }} className="p-1.5 rounded-lg hover:bg-white/5 transition">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 flex items-center gap-2 bg-input border border-border rounded-xl px-3 py-2">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                ref={searchInputRef}
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder={t("searchInChat")}
                className="bg-transparent outline-none flex-1 text-sm"
              />
              {searchQ && <button onClick={() => setSearchQ("")}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-2">
            {loadingSearch && <p className="text-sm text-muted-foreground text-center py-8">{t("loadingDots")}</p>}
            {!loadingSearch && searchQ && searchResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">{t("noResults")}</p>
            )}
            {!loadingSearch && !searchQ && (
              <p className="text-sm text-muted-foreground text-center py-8">{t("searchInChat")}...</p>
            )}
            {searchResults.map((m) => {
              const sender = members.find((u) => u.uid === m.senderId);
              return (
                <div key={m.id} className="glass rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Avatar name={sender?.displayName ?? "?"} photoURL={sender?.photoURL} size={24} />
                    <p className="text-xs font-semibold">{sender?.displayName ?? m.senderId.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground ml-auto">{m.createdAt ? new Date(m.createdAt).toLocaleString() : ""}</p>
                  </div>
                  <p className="text-sm"><HighlightText text={m.text ?? ""} query={searchQ} /></p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Invite link / QR ── */}
      {showInvite && (
        <Modal onClose={() => setShowInvite(false)}>
          <div className="flex items-center gap-2 mb-4">
            <QrCode className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-base">{t("inviteViaLink")}</h3>
          </div>
          <div className="flex justify-center mb-4">
            <div className="bg-white p-3 rounded-2xl shadow">
              <QRCodeSVG value={inviteUrl} size={180} />
            </div>
          </div>
          <div className="flex items-center gap-2 bg-input border border-border rounded-xl px-3 py-2 mb-3">
            <p className="text-xs text-muted-foreground flex-1 truncate">{inviteUrl}</p>
          </div>
          <button
            onClick={copyInviteLink}
            className="w-full py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition flex items-center justify-center gap-2"
          >
            <LinkIcon className="w-4 h-4" />
            {t("copyLink")}
          </button>
        </Modal>
      )}

      {/* ── PIN modal ── */}
      {showPINModal && (
        <Modal onClose={closePINModal}>
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-base">
              {showPINModal === "setup"
                ? (pinStep === 1 ? t("setPIN") : t("confirmPIN"))
                : t("enterPIN")}
            </h3>
          </div>
          {pinError && <p className="text-xs text-red-400 mb-2 text-center">{pinError}</p>}
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={pinStep === 1 ? pinA : pinB}
            onChange={(e) => pinStep === 1 ? setPinA(e.target.value.replace(/\D/g, "")) : setPinB(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
            className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-center text-lg tracking-widest outline-none focus:ring-2 focus:ring-primary/50 mb-4"
            autoFocus
          />
          <button
            onClick={handlePINDone}
            className="w-full py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition"
          >
            {t("confirm")}
          </button>
          {showPINModal === "remove" && (
            <button onClick={() => { saveChatLockPIN(chatId, null); setLockPIN(null); toast.show(t("pinRemoved")); closePINModal(); }} className="w-full py-2 mt-2 text-sm text-red-400 hover:text-red-300">
              {t("pinRemoved")}
            </button>
          )}
        </Modal>
      )}

      {/* ── Encryption info ── */}
      {showEncrypt && (
        <Modal onClose={() => setShowEncrypt(false)}>
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
              <Shield className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="font-semibold text-base">{t("encryptTitle")}</h3>
            <p className="text-sm text-muted-foreground text-center leading-relaxed">{t("encryptDesc")}</p>
          </div>
        </Modal>
      )}

      {/* ── Confirm modal ── */}
      {confirm && (
        <Modal onClose={() => setConfirm(null)}>
          <p className="text-sm text-center mb-5">{confirm.msg}</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirm(null)} className="flex-1 py-2.5 rounded-xl bg-white/5 text-sm font-medium">{t("cancel")}</button>
            <button onClick={() => { confirm.onOk(); setConfirm(null); }} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold">{t("confirm")}</button>
          </div>
        </Modal>
      )}

      {/* ── Call member picker ── */}
      {showCallPicker && (
        <Modal onClose={() => setShowCallPicker(null)}>
          <div className="flex items-center gap-2 mb-4">
            {showCallPicker === "voice" ? <Phone className="w-5 h-5 text-primary" /> : <Video className="w-5 h-5 text-primary" />}
            <h3 className="font-semibold text-base">{t("callMember")}</h3>
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto scrollbar-thin">
            {members.filter((m) => m.uid !== user?.uid).map((m) => (
              <button
                key={m.uid}
                onClick={() => { onInitiateCall?.(m.uid, m.displayName, showCallPicker); setShowCallPicker(null); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition"
              >
                <Avatar name={m.displayName} photoURL={m.photoURL} size={40} />
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold truncate">{m.displayName}</p>
                  <p className="text-xs text-muted-foreground">{m.online ? t("onlineCapital") : t("offlineCapital")}</p>
                </div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* ── Add member sheet ── */}
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

/* ─── Helper UI components ───────────────────────────────────────────────── */

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative glass w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 z-10">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/5 transition">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
        {children}
      </div>
    </div>
  );
}

function ActionBtn({ label, onClick, active }: { label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-xl text-sm transition ${
        active ? "bg-primary/20 text-primary font-semibold" : "hover:bg-white/5 text-foreground"
      }`}
    >
      {active && <Check className="w-3.5 h-3.5 inline mr-1.5" />}
      {label}
    </button>
  );
}

function SettingRow({
  Icon, label, value, color, onClick, arrow, children,
}: {
  Icon: React.ElementType;
  label: string;
  value?: string;
  color?: string;
  onClick?: () => void;
  arrow?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const isExpandable = !!children;

  function handleClick() {
    if (onClick) { onClick(); return; }
    if (isExpandable) setOpen((p) => !p);
  }

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <button
        onClick={handleClick}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition"
      >
        <Icon className={`w-5 h-5 shrink-0 ${color ?? "text-muted-foreground"}`} />
        <span className="flex-1 text-sm font-medium text-left">{label}</span>
        {value && <span className="text-xs text-muted-foreground">{value}</span>}
        {(arrow || isExpandable) && (
          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
        )}
      </button>
      {isExpandable && open && (
        <div className="border-t border-border/50 px-4">{children}</div>
      )}
    </div>
  );
}

/* ─── AddMemberSheet ─────────────────────────────────────────────────────── */
function AddMemberSheet({
  chatId, currentMemberIds, currentUid, onClose, onAdded,
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

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    let cancelled = false;
    if (!debounced.trim()) { setResults([]); return; }
    setLoading(true);
    searchUsers(debounced)
      .then((r) => { if (cancelled) return; setResults(r.filter((u) => u.uid !== currentUid && !currentMemberIds.includes(u.uid))); })
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
    } catch (err) { toast.show(`Failed: ${(err as { message?: string }).message ?? "Unknown"}`); }
    finally { setAdding(null); }
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
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 bg-input border border-border rounded-xl px-3 py-2.5">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchByName")} className="bg-transparent outline-none flex-1 text-sm" />
            {q && <button onClick={() => setQ("")} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
          </div>
          <div className="max-h-[50vh] overflow-y-auto scrollbar-thin space-y-1">
            {loading && <p className="text-sm text-muted-foreground text-center py-6">{t("searching")}</p>}
            {!loading && !q && <p className="text-sm text-muted-foreground text-center py-6">{t("typeNameToFind")}</p>}
            {!loading && q && results.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">{t("notInGroup")}</p>}
            {results.map((u) => {
              const isAdding = adding === u.uid;
              return (
                <div key={u.uid} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition">
                  <div className="relative shrink-0">
                    <Avatar name={u.displayName} photoURL={u.photoURL} size={44} />
                    {u.online && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-secondary border-2 border-background" />}
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
                    {isAdding ? <span>{t("adding")}</span> : <><Check className="w-3.5 h-3.5" />{t("add")}</>}
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
