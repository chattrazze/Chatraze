import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { logOut } from "@/lib/auth";
import { getUser, updateUserProfile, uploadAvatar, searchUsers } from "@/lib/userService";
import type { AppUser } from "@/lib/userService";
import { useToast } from "@/components/Toast";
import { useTheme } from "@/hooks/useTheme";
import { useLang } from "@/hooks/useLang";
import { useChatBg, CHAT_BACKGROUNDS } from "@/hooks/useChatBg";
import SettingsSheet, { SettingPanel } from "@/components/SettingsSheet";
import Avatar from "@/components/Avatar";
import { getStarredChats, createChat, sendMessage } from "@/lib/chatService";
import type { ChatDoc } from "@/lib/chatService";
import {
  ArrowLeft, Bell, Camera, Check, ChevronRight, Copy, Database,
  HelpCircle, KeyRound, Laptop, Link, LogOut, Megaphone,
  MessageCircle, Moon, Palette, Pencil, Search, Send,
  Share2, Shield, Smartphone, Star, Sun, UserPlus, X,
} from "lucide-react";

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function parseUA(ua: string, unknownBrowser: string, unknownOS: string) {
  let browser = unknownBrowser;
  if (/Chrome\//.test(ua) && !/Edge\/|Edg\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = "Safari";
  else if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\//.test(ua)) browser = "Opera";

  let os = unknownOS;
  if (/Windows NT/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua) && !/Android/.test(ua)) os = "Linux";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad/.test(ua)) os = "iOS";

  return { browser, os };
}

function timeAgo(iso: string | undefined, t: (k: string) => string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("justNow");
  if (mins < 60) return `${mins} ${t("minAgo")}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ${t("hAgo")}`;
  return `${Math.floor(hrs / 24)}d`;
}

/* ─── Layout primitives ────────────────────────────────────────────────────── */

function Row({ icon, label, sub, onClick, noChevron, preview, labelColor }: {
  icon: React.ReactNode; label: string; sub?: string;
  onClick?: () => void; noChevron?: boolean;
  preview?: React.ReactNode; labelColor?: string;
}) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-foreground/5 active:scale-[0.99] transition text-left">
      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-foreground/[0.07]">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: labelColor }}>{label}</p>
        {sub && <p className="text-xs text-muted-foreground truncate mt-0.5">{sub}</p>}
      </div>
      {preview}
      {!noChevron && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-4 rounded-2xl overflow-hidden divide-y divide-border bg-card border border-border">{children}</div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <p className="px-6 pt-5 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>;
}

function BottomSheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[60] rounded-t-3xl overflow-hidden flex flex-col bg-card border-t border-border"
        style={{ maxHeight: "85vh" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="font-semibold text-base">{title}</h2>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-foreground/8 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </>
  );
}

/* ── Invite Sheet ─────────────────────────────────────────────────────────── */
function InviteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const link = window.location.origin;

  function copyLink() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function shareLink() {
    if (navigator.share) {
      await navigator.share({ title: "Chatrazze", text: t("inviteShareDesc"), url: link });
    } else {
      copyLink();
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t("inviteFriends")}>
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-muted/50">
          <Link className="w-4 h-4 text-[#FF7A1A] shrink-0" />
          <p className="flex-1 text-sm text-muted-foreground truncate">{link}</p>
        </div>
        <p className="text-sm text-muted-foreground text-center">{t("inviteShareDesc")}</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={copyLink}
            className={`flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold transition active:scale-95 bg-foreground/8 ${copied ? "text-green-500" : "text-foreground"}`}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? t("linkCopied") : t("copyLink")}
          </button>
          <button onClick={shareLink}
            className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold transition active:scale-95 text-white"
            style={{ background: "linear-gradient(135deg,#FF7A1A,#FF4E00)" }}>
            <Share2 className="w-4 h-4" />
            {t("shareBtn")}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

/* ── Starred Chats Sheet ──────────────────────────────────────────────────── */
function StarredSheet({ open, onClose, uid, onGoToChat }: {
  open: boolean; onClose: () => void; uid: string;
  onGoToChat: (chatId: string, peer: AppUser) => void;
}) {
  const { t } = useLang();
  const [chats, setChats] = useState<ChatDoc[]>([]);
  const [peers, setPeers] = useState<Record<string, AppUser>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getStarredChats(uid).then(async (cs) => {
      setChats(cs);
      const peerMap: Record<string, AppUser> = {};
      for (const c of cs) {
        const otherId = c.members.find((m) => m !== uid);
        if (otherId) {
          const u = await getUser(otherId);
          if (u) peerMap[c.id] = u;
        }
      }
      setPeers(peerMap);
    }).finally(() => setLoading(false));
  }, [open, uid]);

  return (
    <BottomSheet open={open} onClose={onClose} title={t("starredMessages")}>
      <div className="p-4">
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-[#FF7A1A]/30 border-t-[#FF7A1A] rounded-full animate-spin" />
          </div>
        )}
        {!loading && chats.length === 0 && (
          <div className="flex flex-col items-center py-10 gap-3">
            <Star className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t("noStarredChats")}</p>
            <p className="text-xs text-muted-foreground/60 text-center">{t("noStarredChatsSub")}</p>
          </div>
        )}
        {!loading && chats.map((c) => {
          const peer = peers[c.id];
          const chatName = c.name ?? peer?.displayName ?? t("loadingDots");
          return (
            <button key={c.id}
              onClick={() => { if (peer) { onGoToChat(c.id, peer); onClose(); } }}
              className="w-full flex items-center gap-3 px-2 py-3 rounded-2xl hover:bg-white/5 transition text-left">
              {peer?.photoURL ? (
                <img src={peer.photoURL} alt={chatName} className="w-12 h-12 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0"
                  style={{ background: "linear-gradient(135deg,#FF7A1A,#FF4E00)" }}>
                  {chatName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{chatName}</p>
                <p className="text-xs text-muted-foreground truncate">{c.lastMessage || t("noMessages")}</p>
              </div>
              <Star className="w-4 h-4 text-[#FF7A1A] shrink-0" />
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}

/* ── Broadcast Sheet ──────────────────────────────────────────────────────── */
function BroadcastSheet({ open, onClose, uid }: { open: boolean; onClose: () => void; uid: string }) {
  const { t } = useLang();
  const { show } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AppUser[]>([]);
  const [selected, setSelected] = useState<AppUser[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState<"pick" | "compose">("pick");

  useEffect(() => {
    if (!open) { setQuery(""); setResults([]); setSelected([]); setMessage(""); setStep("pick"); }
  }, [open]);

  useEffect(() => {
    if (query.length < 1) { setResults([]); return; }
    const timer = setTimeout(() => {
      searchUsers(query).then((r) => setResults(r.filter((u) => u.uid !== uid)));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, uid]);

  function toggle(u: AppUser) {
    setSelected((prev) =>
      prev.find((x) => x.uid === u.uid) ? prev.filter((x) => x.uid !== u.uid) : [...prev, u],
    );
  }

  async function send() {
    if (!message.trim() || selected.length === 0) return;
    setSending(true);
    try {
      for (const peer of selected) {
        const chatId = await createChat(uid, peer.uid);
        await sendMessage(chatId, uid, { type: "text", text: message.trim() });
      }
      show(`${t("sentToPrefix")} ${selected.length} ${t("personCount")}`);
      onClose();
    } catch { show(t("couldNotSend")); }
    finally { setSending(false); }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t("broadcastMsg")}>
      {step === "pick" ? (
        <div className="flex flex-col" style={{ minHeight: 300 }}>
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl border border-white/10"
              style={{ background: "rgba(255,255,255,0.05)" }}>
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchUserPlaceholder")} autoFocus
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            </div>
          </div>
          {selected.length > 0 && (
            <div className="px-4 pb-3 flex gap-2 flex-wrap">
              {selected.map((u) => (
                <button key={u.uid} onClick={() => toggle(u)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                  style={{ background: "rgba(255,122,26,0.18)", color: "#FF7A1A" }}>
                  {u.displayName}<X className="w-3 h-3" />
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 px-2 pb-4">
            {results.map((u) => {
              const isSel = !!selected.find((x) => x.uid === u.uid);
              return (
                <button key={u.uid} onClick={() => toggle(u)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-white/5 transition">
                  {u.photoURL ? (
                    <img src={u.photoURL} alt={u.displayName} className="w-10 h-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0"
                      style={{ background: "linear-gradient(135deg,#FF7A1A,#FF4E00)" }}>
                      {u.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold truncate">{u.displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${isSel ? "border-[#FF7A1A] bg-[#FF7A1A]" : "border-white/30"}`}>
                    {isSel && <Check className="w-3 h-3 text-white" />}
                  </div>
                </button>
              );
            })}
            {query.length > 0 && results.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">{t("noResults")}</p>
            )}
          </div>
          {selected.length > 0 && (
            <div className="px-4 pb-5 shrink-0">
              <button onClick={() => setStep("compose")}
                className="w-full py-3.5 rounded-2xl text-sm font-bold text-white active:scale-95 transition"
                style={{ background: "linear-gradient(135deg,#FF7A1A,#FF4E00)" }}>
                {t("nextBtn")} · {selected.length} {t("selectedCount")}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {selected.map((u) => (
              <span key={u.uid} className="px-3 py-1 rounded-full text-xs font-medium"
                style={{ background: "rgba(255,122,26,0.18)", color: "#FF7A1A" }}>
                {u.displayName}
              </span>
            ))}
          </div>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)}
            placeholder={t("typeYourMessage")} rows={4} autoFocus
            className="w-full rounded-2xl px-4 py-3 text-sm outline-none resize-none border border-white/10"
            style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="flex gap-3">
            <button onClick={() => setStep("pick")}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold active:scale-95 transition"
              style={{ background: "rgba(255,255,255,0.08)" }}>
              {t("goBack")}
            </button>
            <button onClick={send} disabled={!message.trim() || sending}
              className="flex-1 py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#FF7A1A,#FF4E00)" }}>
              {sending
                ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <><Send className="w-4 h-4" />{t("share")}</>}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

/* ── Linked Devices Sheet ─────────────────────────────────────────────────── */
function LinkedDevicesSheet({ open, onClose, lastSeen }: {
  open: boolean; onClose: () => void; lastSeen?: string;
}) {
  const { t } = useLang();
  const { browser, os } = parseUA(navigator.userAgent, t("unknownBrowser"), t("unknownOS"));
  const isMobile = /Android|iPhone|iPad/.test(navigator.userAgent);

  return (
    <BottomSheet open={open} onClose={onClose} title={t("linkedDevicesLabel")}>
      <div className="p-4 space-y-3">
        <p className="text-xs text-muted-foreground px-1">{t("activeSession")}</p>
        <div className="rounded-2xl border border-[#FF7A1A]/30 overflow-hidden"
          style={{ background: "rgba(255,122,26,0.06)" }}>
          <div className="flex items-center gap-4 px-4 py-4">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(255,122,26,0.15)" }}>
              {isMobile ? <Smartphone className="w-5 h-5 text-[#FF7A1A]" /> : <Laptop className="w-5 h-5 text-[#FF7A1A]" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">{browser} · {os}</p>
              <p className="text-xs text-[#FF7A1A]">{t("thisDeviceActive")}</p>
              {lastSeen && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("lastActivity")} {timeAgo(lastSeen, t as (k: string) => string)}
                </p>
              )}
            </div>
            <div className="w-2.5 h-2.5 rounded-full bg-green-400 shadow shadow-green-400/50 shrink-0" />
          </div>
        </div>
        <div className="rounded-2xl p-4 border border-white/8" style={{ background: "rgba(255,255,255,0.04)" }}>
          <p className="text-xs text-muted-foreground leading-relaxed">{t("devicesNote")}</p>
        </div>
      </div>
    </BottomSheet>
  );
}

/* ── Edit Profile Row ─────────────────────────────────────────────────────── */
function EditRow({ label, value, placeholder, editable, onChange, onSave, saving, multiline }: {
  label: string; value: string; placeholder?: string; editable: boolean;
  onChange: (v: string) => void; onSave: () => void; saving?: boolean; multiline?: boolean;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);

  function commit() { onChange(draft); onSave(); setOpen(false); }

  return (
    <div>
      <p className="px-5 pt-4 pb-1 text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <button onClick={() => editable && setOpen(true)}
        className="w-full flex items-center gap-4 px-5 py-3 hover:bg-white/5 transition text-left">
        <p className={`flex-1 text-sm ${value ? "text-foreground" : "text-[#FF7A1A]"}`}>
          {value || placeholder}
        </p>
        {editable && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      <div className="mx-5 border-b border-white/8" />
      {open && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 z-[60] rounded-t-3xl bg-[#111] px-5 pb-10 pt-5">
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />
            <p className="text-sm font-semibold mb-3">{label}</p>
            {multiline ? (
              <textarea value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 200))}
                rows={3} autoFocus
                className="w-full bg-white/8 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#FF7A1A] resize-none border border-white/10" />
            ) : (
              <input value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus
                className="w-full bg-white/8 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#FF7A1A] border border-white/10" />
            )}
            <div className="flex gap-3 mt-4">
              <button onClick={() => setOpen(false)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-white/8 text-muted-foreground active:scale-95 transition">
                {t("cancel")}
              </button>
              <button onClick={commit} disabled={saving}
                className="flex-1 py-3 rounded-xl text-sm font-bold active:scale-95 transition disabled:opacity-50 text-white"
                style={{ background: "linear-gradient(135deg,#FF7A1A,#FF4E00)" }}>
                {saving ? t("saving") : t("save")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                             */
/* ═══════════════════════════════════════════════════════════════════════════ */

export default function ProfileScreen({ onGoToChat }: {
  onGoToChat?: (chatId: string, peer: AppUser) => void;
}) {
  const { user } = useAuth();
  const { show } = useToast();
  const { theme, toggle } = useTheme();
  const { t } = useLang();
  const [name, setName] = useState(user?.displayName ?? "");
  const [bio, setBio] = useState(t("defaultBio"));
  const [saving, setSaving] = useState(false);
  const [panel, setPanel] = useState<SettingPanel>(null);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [view, setView] = useState<"settings" | "edit">("settings");
  const [sheet, setSheet] = useState<"invite" | "starred" | "broadcast" | "devices" | null>(null);
  const chatBg = useChatBg(user?.uid ?? "");
  const [photoURL, setPhotoURL] = useState<string | null>(user?.photoURL ?? null);
  const [uploading, setUploading] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    getUser(user.uid).then((u) => {
      if (!u) return;
      if (u.displayName) setName(u.displayName);
      if (u.photoURL) setPhotoURL(u.photoURL);
      if (u.bio) setBio(u.bio);
      if (u.lastSeen) setLastSeen(u.lastSeen);
    }).catch(() => {});
  }, [user]);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) { show(t("pleasePickImage")); return; }
    if (file.size > 5 * 1024 * 1024) { show(t("imageTooLarge")); return; }
    setUploading(true);
    try {
      const url = await uploadAvatar(user.uid, file);
      setPhotoURL(url);
      show(t("profilePhotoUpdated"));
    } catch { show(t("couldNotUploadPhoto")); }
    finally { setUploading(false); }
  }

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      await updateUserProfile(user.uid, { displayName: name, bio });
      show(t("profileSaved"));
    } catch { show(t("couldNotSaveProfile")); }
    finally { setSaving(false); }
  }

  if (!user) return null;

  /* ──────────────────── EDIT PROFILE VIEW ──────────────────── */
  if (view === "edit") {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        <div className="flex items-center gap-3 px-4 pt-5 pb-4 shrink-0">
          <button onClick={() => setView("settings")}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-foreground/8 transition active:scale-90">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="flex-1 text-center text-base font-semibold">{t("profileTitle")}</h1>
          <div className="w-9" />
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="flex flex-col items-center pt-4 pb-6">
            <div className="relative">
              {photoURL ? (
                <Avatar name={name || user.email || "U"} photoURL={photoURL} size={100} />
              ) : (
                <div className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold text-white"
                  style={{ background: "linear-gradient(135deg,#FF7A1A,#FF4E00)" }}>
                  {(name || user.email || "U").charAt(0).toUpperCase()}
                </div>
              )}
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 active:opacity-100 transition">
                {uploading
                  ? <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Camera className="w-7 h-7 text-white" />}
              </button>
            </div>
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="mt-3 text-sm font-semibold active:opacity-70 transition"
              style={{ color: "#FF7A1A" }}>
              {uploading ? t("uploading") : t("editBtn")}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
          </div>
          <div className="mx-4 rounded-2xl overflow-hidden bg-card border border-border divide-y divide-border">
            <EditRow label={t("bioLabel")} value={bio} placeholder={t("defaultBio")}
              editable onChange={setBio} onSave={save} saving={saving} multiline />
            <EditRow label={t("nameLabel")} value={name} placeholder={t("nameLabel")}
              editable onChange={setName} onSave={save} saving={saving} />
            <div>
              <p className="px-5 pt-4 pb-1 text-xs text-muted-foreground uppercase tracking-wider">{t("emailLabel")}</p>
              <div className="flex items-center gap-4 px-5 py-3">
                <p className="flex-1 text-sm text-muted-foreground">{user.email || "—"}</p>
              </div>
            </div>
            <div>
              <p className="px-5 pt-4 pb-1 text-xs text-muted-foreground uppercase tracking-wider">{t("linksLabel")}</p>
              <button className="w-full flex items-center gap-4 px-5 py-3 hover:bg-foreground/5 transition text-left">
                <p className="flex-1 text-sm font-medium" style={{ color: "#FF7A1A" }}>{t("addLinkBtn")}</p>
                <Link className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            </div>
          </div>
          <p className="text-center text-[11px] text-muted-foreground py-6">Chatrazze • {t("poweredBy")}</p>
        </div>
      </div>
    );
  }

  /* ──────────────────── SETTINGS VIEW ──────────────────── */
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto scrollbar-thin pb-8">

        {/* Avatar + Name hero */}
        <div className="flex flex-col items-center pt-10 pb-6 px-4">
          <button onClick={() => setView("edit")}
            className="mb-4 px-5 py-2 rounded-full text-sm text-muted-foreground border border-border hover:bg-foreground/5 active:scale-95 transition bg-foreground/[0.06]">
            {bio.length > 36 ? bio.slice(0, 36) + "…" : bio}
          </button>
          <button onClick={() => setView("edit")} className="relative active:opacity-80 transition">
            {photoURL ? (
              <Avatar name={name || user.email || "U"} photoURL={photoURL} size={96} className="shadow-2xl" />
            ) : (
              <div className="w-24 h-24 rounded-full flex items-center justify-center text-4xl font-bold text-white shadow-2xl"
                style={{ background: "linear-gradient(135deg,#FF7A1A,#FF4E00)" }}>
                {(name || user.email || "U").charAt(0).toUpperCase()}
              </div>
            )}
          </button>
          <button onClick={() => setView("edit")} className="mt-4 active:opacity-70 transition">
            <h1 className="text-2xl font-bold">{name || user.email || "—"}</h1>
          </button>
        </div>

        <SectionLabel label={t("settingsSection")} />
        <Card>
          <Row icon={<UserPlus className="w-4 h-4 text-[#FF7A1A]" />}
            label={t("inviteFriends")} onClick={() => setSheet("invite")} />
          <Row icon={<Star className="w-4 h-4 text-[#FF7A1A]" />}
            label={t("starredMessages")} sub={t("starredMessagesSub")} onClick={() => setSheet("starred")} />
          <Row icon={<Megaphone className="w-4 h-4 text-[#FF7A1A]" />}
            label={t("broadcastMsg")} sub={t("broadcastMsgSub")} onClick={() => setSheet("broadcast")} />
          <Row icon={<Laptop className="w-4 h-4 text-[#FF7A1A]" />}
            label={t("linkedDevicesLabel")} sub={t("linkedDevicesSub")} onClick={() => setSheet("devices")} />
        </Card>

        <SectionLabel label={t("accountSection")} />
        <Card>
          <Row icon={<KeyRound className="w-4 h-4 text-[#FF7A1A]" />}
            label={t("accountSetting")} sub={user.email || undefined} onClick={() => setView("edit")} />
          <Row icon={<Shield className="w-4 h-4 text-[#FF7A1A]" />}
            label={t("privacySetting")} sub={t("privacySettingSub")} onClick={() => setPanel("privacy")} />
          <Row icon={<MessageCircle className="w-4 h-4 text-[#FF7A1A]" />}
            label={t("chatsSetting")} sub={t("chatsSettingSub")} onClick={() => setPanel("chats")} />
          <Row icon={<Bell className="w-4 h-4 text-[#FF7A1A]" />}
            label={t("notificationsSetting")} sub={t("notificationsSettingSub")} onClick={() => setPanel("notifications")} />
          <Row icon={<Database className="w-4 h-4 text-[#FF7A1A]" />}
            label={t("storageDataSetting")} sub={t("storageDataSub")} onClick={() => setPanel("storage")} />
        </Card>

        <SectionLabel label={t("appearanceSection")} />
        <Card>
          <button onClick={() => { toggle(); show(theme === "dark" ? t("lightThemeOn") : t("darkThemeOn")); }}
            className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-foreground/5 active:scale-[0.99] transition text-left">
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-foreground/[0.07]">
              {theme === "dark" ? <Sun className="w-4 h-4 text-[#FF7A1A]" /> : <Moon className="w-4 h-4 text-[#FF7A1A]" />}
            </div>
            <p className="flex-1 text-sm font-medium">
              {theme === "dark" ? t("switchToLight") : t("switchToDark")}
            </p>
            <span className={`w-11 h-6 rounded-full p-0.5 flex transition-all ${theme === "light" ? "bg-[#FF7A1A]" : "bg-foreground/15"}`}>
              <span className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${theme === "light" ? "translate-x-5" : "translate-x-0"}`} />
            </span>
          </button>
          <Row icon={<Palette className="w-4 h-4 text-[#FF7A1A]" />}
            label={t("chatBgTitle")} sub={t("chatBgDesc")} onClick={() => setShowBgPicker(true)}
            preview={<span className="w-6 h-6 rounded-full border border-white/20 shrink-0" style={chatBg.current.previewStyle} />} />
          <Row icon={<Pencil className="w-4 h-4 text-muted-foreground" />}
            label={`ID: ${user.uid.slice(0, 12)}…`}
            onClick={() => { navigator.clipboard.writeText(user.uid); show(t("userIdCopied")); }}
            noChevron />
        </Card>

        <SectionLabel label={t("helpSection")} />
        <Card>
          <Row icon={<HelpCircle className="w-4 h-4 text-[#FF7A1A]" />}
            label={t("helpFeedback")} sub={t("helpFeedbackSub")}
            onClick={() => window.open("mailto:support@chatrazze.com", "_blank")} />
        </Card>

        <div className="mx-4 mt-5">
          <button onClick={() => logOut()}
            className="w-full rounded-2xl py-3.5 flex items-center justify-center gap-2 font-semibold text-sm hover:opacity-80 active:scale-95 transition"
            style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}>
            <LogOut className="w-4 h-4" />
            {t("logOut")}
          </button>
        </div>

        <p className="text-center text-[11px] text-muted-foreground pt-5 pb-2">
          Chatrazze • {t("poweredBy")}
        </p>
      </div>

      {/* ── Sheets ── */}
      <InviteSheet open={sheet === "invite"} onClose={() => setSheet(null)} />
      <StarredSheet open={sheet === "starred"} onClose={() => setSheet(null)}
        uid={user.uid} onGoToChat={onGoToChat ?? (() => {})} />
      <BroadcastSheet open={sheet === "broadcast"} onClose={() => setSheet(null)} uid={user.uid} />
      <LinkedDevicesSheet open={sheet === "devices"} onClose={() => setSheet(null)} lastSeen={lastSeen} />
      <SettingsSheet panel={panel} onClose={() => setPanel(null)} />

      {/* Chat Background Picker */}
      {showBgPicker && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center">
          <div className="w-full rounded-t-3xl shadow-2xl overflow-hidden bg-card border-t border-border">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-sm">{t("chatBgTitle")}</h2>
              <button onClick={() => setShowBgPicker(false)}
                className="w-8 h-8 rounded-full hover:bg-foreground/5 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 grid grid-cols-3 gap-3">
              {CHAT_BACKGROUNDS.map((bg) => {
                const isActive = chatBg.bgId === bg.id;
                return (
                  <button key={bg.id}
                    onClick={() => { chatBg.setChatBg(bg.id); setShowBgPicker(false); }}
                    className={`relative rounded-2xl overflow-hidden aspect-square border-2 transition ${isActive ? "border-[#FF7A1A] scale-105" : "border-transparent hover:border-white/20"}`}>
                    <div className="w-full h-full" style={bg.previewStyle} />
                    <div className="absolute inset-x-0 bottom-0 bg-black/50 py-1">
                      <p className="text-[10px] text-white font-medium text-center truncate">{bg.labelAr}</p>
                    </div>
                    {isActive && (
                      <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ background: "#FF7A1A" }}>
                        <span className="text-white text-[8px] font-bold">✓</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
