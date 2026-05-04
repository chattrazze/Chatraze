import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { logOut } from "@/lib/auth";
import { getUser, updateUserProfile, uploadAvatar } from "@/lib/userService";
import { useToast } from "@/components/Toast";
import { useTheme } from "@/hooks/useTheme";
import { useLang } from "@/hooks/useLang";
import { useChatBg, CHAT_BACKGROUNDS } from "@/hooks/useChatBg";
import SettingsSheet, { SettingPanel } from "@/components/SettingsSheet";
import Avatar from "@/components/Avatar";
import {
  ArrowLeft,
  Bell,
  Camera,
  ChevronRight,
  Database,
  HelpCircle,
  KeyRound,
  Laptop,
  Link,
  LogOut,
  Megaphone,
  MessageCircle,
  Moon,
  Palette,
  Pencil,
  Shield,
  Star,
  Sun,
  UserPlus,
  X,
} from "lucide-react";

/* ── Row component ─────────────────────────────────────────────────────────── */
function Row({
  icon,
  label,
  sub,
  onClick,
  noChevron,
  preview,
  labelColor,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onClick?: () => void;
  noChevron?: boolean;
  preview?: React.ReactNode;
  labelColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-white/5 active:scale-[0.99] transition text-left"
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "rgba(255,255,255,0.07)" }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: labelColor }}>{label}</p>
        {sub && <p className="text-xs text-muted-foreground truncate mt-0.5">{sub}</p>}
      </div>
      {preview}
      {!noChevron && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
    </button>
  );
}

/* ── Card wrapper ──────────────────────────────────────────────────────────── */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-4 rounded-2xl overflow-hidden divide-y divide-white/5"
      style={{ background: "rgba(255,255,255,0.05)" }}>
      {children}
    </div>
  );
}

/* ── Section label ─────────────────────────────────────────────────────────── */
function SectionLabel({ label }: { label: string }) {
  return (
    <p className="px-6 pt-5 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
      {label}
    </p>
  );
}

/* ── Profile Edit Row ──────────────────────────────────────────────────────── */
function EditRow({
  label,
  value,
  placeholder,
  editable,
  onChange,
  onSave,
  saving,
  multiline,
}: {
  label: string;
  value: string;
  placeholder?: string;
  editable: boolean;
  onChange: (v: string) => void;
  onSave: () => void;
  saving?: boolean;
  multiline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    onChange(draft);
    onSave();
    setOpen(false);
  }

  return (
    <div>
      <p className="px-5 pt-4 pb-1 text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <button
        onClick={() => editable && setOpen(true)}
        className="w-full flex items-center gap-4 px-5 py-3 hover:bg-white/5 transition text-left"
      >
        <p className={`flex-1 text-sm ${value ? "text-foreground" : "text-[#FF7A1A]"}`}>
          {value || placeholder}
        </p>
        {editable && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      <div className="mx-5 border-b border-white/8" />

      {/* Inline edit sheet */}
      {open && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 z-[60] rounded-t-3xl bg-[#111] px-5 pb-10 pt-5">
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />
            <p className="text-sm font-semibold mb-3">{label}</p>
            {multiline ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 200))}
                rows={3}
                autoFocus
                className="w-full bg-white/8 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#FF7A1A] resize-none border border-white/10"
              />
            ) : (
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                className="w-full bg-white/8 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#FF7A1A] border border-white/10"
              />
            )}
            <div className="flex gap-3 mt-4">
              <button onClick={() => setOpen(false)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-white/8 text-muted-foreground active:scale-95 transition">
                إلغاء
              </button>
              <button onClick={commit} disabled={saving}
                className="flex-1 py-3 rounded-xl text-sm font-bold active:scale-95 transition disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#FF7A1A,#FF4E00)", color: "white" }}>
                {saving ? "…" : "حفظ"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Main Component ────────────────────────────────────────────────────────── */

export default function ProfileScreen() {
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
  const chatBg = useChatBg(user?.uid ?? "");
  const [photoURL, setPhotoURL] = useState<string | null>(user?.photoURL ?? null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    getUser(user.uid).then((u) => {
      if (!u) return;
      if (u.displayName) setName(u.displayName);
      if (u.photoURL) setPhotoURL(u.photoURL);
      if (u.bio) setBio(u.bio);
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
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-black">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-5 pb-4 shrink-0">
          <button onClick={() => setView("settings")}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition active:scale-90">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="flex-1 text-center text-base font-semibold text-white">{t("profileTitle")}</h1>
          <div className="w-9" />
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {/* Avatar */}
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
              {uploading ? "جارٍ الرفع…" : "تعديل"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
          </div>

          {/* Info section */}
          <div className="mx-4 rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
            <EditRow
              label="السيرة الذاتية"
              value={bio}
              placeholder="أضف سيرة ذاتية…"
              editable
              onChange={setBio}
              onSave={save}
              saving={saving}
              multiline
            />
            <EditRow
              label="الاسم"
              value={name}
              placeholder="اكتب اسمك…"
              editable
              onChange={setName}
              onSave={save}
              saving={saving}
            />
            <div>
              <p className="px-5 pt-4 pb-1 text-xs text-muted-foreground uppercase tracking-wider">البريد الإلكتروني</p>
              <div className="flex items-center gap-4 px-5 py-3">
                <p className="flex-1 text-sm text-muted-foreground">{user.email || "—"}</p>
              </div>
              <div className="mx-5 border-b border-white/8" />
            </div>
            <div>
              <p className="px-5 pt-4 pb-1 text-xs text-muted-foreground uppercase tracking-wider">الروابط</p>
              <button className="w-full flex items-center gap-4 px-5 py-3 hover:bg-white/5 transition text-left">
                <p className="flex-1 text-sm font-medium" style={{ color: "#FF7A1A" }}>إضافة رابط</p>
                <Link className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
              <div className="mx-5 border-b border-white/8" />
            </div>
          </div>

          <p className="text-center text-[11px] text-muted-foreground py-6">
            Chatrazze • {t("poweredBy")}
          </p>
        </div>
      </div>
    );
  }

  /* ──────────────────── SETTINGS VIEW ──────────────────── */
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-black">
      <div className="flex-1 overflow-y-auto scrollbar-thin pb-8">

        {/* ── Avatar + Name hero ── */}
        <div className="flex flex-col items-center pt-10 pb-6 px-4">
          {/* Status bubble */}
          <button
            onClick={() => setView("edit")}
            className="mb-4 px-5 py-2 rounded-full text-sm text-white/70 border border-white/15 hover:bg-white/5 active:scale-95 transition"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            {bio.length > 36 ? bio.slice(0, 36) + "…" : bio}
          </button>

          {/* Avatar */}
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

          {/* Name */}
          <button onClick={() => setView("edit")} className="mt-4 active:opacity-70 transition">
            <h1 className="text-2xl font-bold text-white">{name || user.email || "—"}</h1>
          </button>
        </div>

        {/* ── Settings label ── */}
        <SectionLabel label="الإعدادات" />

        {/* ── Card 1: Social ── */}
        <Card>
          <Row icon={<UserPlus className="w-4.5 h-4.5 text-[#FF7A1A]" />} label="دعوة أصدقاء" onClick={() => show("قريباً")} />
          <Row icon={<Star className="w-4.5 h-4.5 text-[#FF7A1A]" />} label="الرسائل المميزة" onClick={() => show("قريباً")} />
          <Row icon={<Megaphone className="w-4.5 h-4.5 text-[#FF7A1A]" />} label="الرسائل الجماعية" onClick={() => show("قريباً")} />
          <Row icon={<Laptop className="w-4.5 h-4.5 text-[#FF7A1A]" />} label="الأجهزة المرتبطة" onClick={() => show("قريباً")} />
        </Card>

        {/* ── Card 2: Account settings ── */}
        <SectionLabel label="الحساب" />
        <Card>
          <Row icon={<KeyRound className="w-4.5 h-4.5 text-[#FF7A1A]" />} label={t("accountSetting")} sub={user.email || undefined} onClick={() => setView("edit")} />
          <Row icon={<Shield className="w-4.5 h-4.5 text-[#FF7A1A]" />} label={t("privacySetting")} sub={t("privacySettingSub")} onClick={() => setPanel("privacy")} />
          <Row icon={<MessageCircle className="w-4.5 h-4.5 text-[#FF7A1A]" />} label={t("chatsSetting")} sub={t("chatsSettingSub")} onClick={() => setPanel("chats")} />
          <Row icon={<Bell className="w-4.5 h-4.5 text-[#FF7A1A]" />} label={t("notificationsSetting")} sub={t("notificationsSettingSub")} onClick={() => setPanel("notifications")} />
          <Row icon={<Database className="w-4.5 h-4.5 text-[#FF7A1A]" />} label={t("storageDataSetting")} sub={t("storageDataSub")} onClick={() => setPanel("storage")} />
        </Card>

        {/* ── Card 3: Appearance ── */}
        <SectionLabel label="المظهر" />
        <Card>
          <button
            onClick={() => { toggle(); show(theme === "dark" ? t("lightThemeOn") : t("darkThemeOn")); }}
            className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-white/5 active:scale-[0.99] transition text-left"
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.07)" }}>
              {theme === "dark"
                ? <Sun className="w-4.5 h-4.5 text-[#FF7A1A]" />
                : <Moon className="w-4.5 h-4.5 text-[#FF7A1A]" />}
            </div>
            <p className="flex-1 text-sm font-medium">
              {theme === "dark" ? t("switchToLight") : t("switchToDark")}
            </p>
            <span className={`w-11 h-6 rounded-full p-0.5 flex transition-all ${theme === "light" ? "bg-[#FF7A1A]" : "bg-white/15"}`}>
              <span className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${theme === "light" ? "translate-x-5" : "translate-x-0"}`} />
            </span>
          </button>

          <Row
            icon={<Palette className="w-4.5 h-4.5 text-[#FF7A1A]" />}
            label={t("chatBgTitle")}
            sub={t("chatBgDesc")}
            onClick={() => setShowBgPicker(true)}
            preview={<span className="w-6 h-6 rounded-full border border-white/20 shrink-0" style={chatBg.current.previewStyle} />}
          />

          <Row
            icon={<Pencil className="w-4.5 h-4.5 text-muted-foreground" />}
            label={`ID: ${user.uid.slice(0, 12)}…`}
            onClick={() => { navigator.clipboard.writeText(user.uid); show(t("userIdCopied")); }}
            noChevron
          />
        </Card>

        {/* ── Card 4: Help ── */}
        <SectionLabel label="المساعدة" />
        <Card>
          <Row icon={<HelpCircle className="w-4.5 h-4.5 text-[#FF7A1A]" />} label="المساعدة والملاحظات" onClick={() => show("قريباً")} />
        </Card>

        {/* ── Logout ── */}
        <div className="mx-4 mt-5">
          <button
            onClick={() => logOut()}
            className="w-full rounded-2xl py-3.5 flex items-center justify-center gap-2 font-semibold text-sm hover:opacity-80 active:scale-95 transition"
            style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}
          >
            <LogOut className="w-4 h-4" />
            {t("logOut")}
          </button>
        </div>

        <p className="text-center text-[11px] text-muted-foreground pt-5 pb-2">
          Chatrazze • {t("poweredBy")}
        </p>
      </div>

      <SettingsSheet panel={panel} onClose={() => setPanel(null)} />

      {/* Chat Background Picker */}
      {showBgPicker && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center">
          <div className="w-full rounded-t-3xl shadow-2xl overflow-hidden" style={{ background: "#111" }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
              <h2 className="font-semibold text-sm">{t("chatBgTitle")}</h2>
              <button onClick={() => setShowBgPicker(false)}
                className="w-8 h-8 rounded-full hover:bg-white/5 flex items-center justify-center">
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
                      <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: "#FF7A1A" }}>
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
