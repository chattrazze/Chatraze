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
  Bell,
  Camera,
  ChevronRight,
  Database,
  KeyRound,
  LogOut,
  MessageCircle,
  Moon,
  Palette,
  Pencil,
  Shield,
  Sun,
  UserCircle2,
  X,
} from "lucide-react";

export default function ProfileScreen() {
  const { user } = useAuth();
  const { show } = useToast();
  const { theme, toggle } = useTheme();
  const { t } = useLang();
  const [name, setName] = useState(user?.displayName ?? "");
  const [status, setStatus] = useState(t("defaultBio"));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [panel, setPanel] = useState<SettingPanel>(null);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const chatBg = useChatBg(user?.uid ?? "");
  const [photoURL, setPhotoURL] = useState<string | null>(
    user?.photoURL ?? null,
  );
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    getUser(user.uid)
      .then((u) => {
        if (!u) return;
        if (u.displayName) setName(u.displayName);
        if (u.photoURL) setPhotoURL(u.photoURL);
        if (u.bio) setStatus(u.bio);
      })
      .catch(() => {});
  }, [user]);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      show(t("pleasePickImage"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      show(t("imageTooLarge"));
      return;
    }
    setUploading(true);
    try {
      const url = await uploadAvatar(user.uid, file);
      setPhotoURL(url);
      show(t("profilePhotoUpdated"));
    } catch {
      show(t("couldNotUploadPhoto"));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      await updateUserProfile(user.uid, { displayName: name, bio: status });
      setEditing(false);
      show(t("profileSaved"));
    } catch {
      show(t("couldNotSaveProfile"));
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div className="flex-1 flex flex-col h-full">
      <header className="px-5 pt-6 pb-4 glass border-b border-border">
        <h1 className="text-2xl font-bold tracking-tight">{t("profileTitle")}</h1>
      </header>
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-6 space-y-4">
        <div className="glass rounded-3xl p-6 flex flex-col items-center text-center">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPickFile}
          />
          <div className="relative">
            {photoURL ? (
              <Avatar
                name={name || user.email || "U"}
                photoURL={photoURL}
                size={112}
                className="shadow-2xl ring-primary-glow"
              />
            ) : (
              <div className="w-28 h-28 rounded-full bg-gradient-to-br from-[#FF7A1A] to-[#FF4E00] flex items-center justify-center text-4xl font-bold text-white shadow-2xl ring-primary-glow">
                {(name || user.email || "U").charAt(0).toUpperCase()
              }</div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -left-1 w-9 h-9 rounded-full bg-secondary text-white flex items-center justify-center shadow-lg hover:scale-105 transition disabled:opacity-50"
              title={t("profilePhotoUpdated")}
            >
              <Camera className="w-4 h-4" />
            </button>
            <button
              onClick={() => setEditing((v) => !v)}
              className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-accent text-white flex items-center justify-center shadow-lg hover:scale-105 transition"
            >
              <Pencil className="w-4 h-4" />
            </button>
            {uploading && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center text-xs text-white">
                {t("uploading")}…
              </div>
            )}
          </div>

          {editing ? (
            <div className="mt-4 w-full max-w-xs space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-input border border-border rounded-xl px-3 py-2 text-sm text-center outline-none focus:ring-2 focus:ring-primary/50"
              />
              <textarea
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                placeholder={t("defaultBio")}
                className="w-full bg-input border border-border rounded-xl px-3 py-2 text-xs text-center outline-none focus:ring-2 focus:ring-primary/50 text-muted-foreground min-h-20 resize-none"
              />
              <button
                onClick={save}
                disabled={saving}
                className="w-full py-2 rounded-xl bg-secondary text-white font-medium text-sm disabled:opacity-50"
              >
                {saving ? t("saving") : t("save")}
              </button>
            </div>
          ) : (
            <>
              <h2 className="mt-4 text-xl font-bold">{name || t("loadingDots")}</h2>
              <p className="text-xs text-muted-foreground">{user.email}</p>
              <p className="mt-3 text-sm text-foreground/80 italic whitespace-pre-wrap">{status}</p>
            </>
          )}
        </div>

        <button
          onClick={() => {
            toggle();
            show(theme === "dark" ? t("lightThemeOn") : t("darkThemeOn"));
          }}
          className="w-full glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:bg-white/5 active:scale-[0.99] transition text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
            {theme === "dark" ? (
              <Sun className="w-5 h-5 text-primary" />
            ) : (
              <Moon className="w-5 h-5 text-accent" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">
              {theme === "dark" ? t("switchToLight") : t("switchToDark")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("currently")} {theme === "dark" ? t("darkTheme") : t("lightTheme")}
            </p>
          </div>
          <span
            className={`w-10 h-6 rounded-full p-0.5 flex transition ${
              theme === "dark" ? "bg-white/10" : "bg-primary"
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                theme === "dark" ? "translate-x-0" : "translate-x-4"
              }`}
            />
          </span>
        </button>

        <div className="glass rounded-2xl overflow-hidden">
          <SettingRow icon={<UserCircle2 className="w-5 h-5 text-accent" />} label={t("accountSetting")} sub={user.email || user.uid} onClick={() => setEditing(true)} />
          <SettingRow icon={<Shield className="w-5 h-5 text-secondary" />} label={t("privacySetting")} sub={t("privacySettingSub")} onClick={() => setPanel("privacy")} />
          <SettingRow icon={<MessageCircle className="w-5 h-5 text-primary" />} label={t("chatsSetting")} sub={t("chatsSettingSub")} onClick={() => setPanel("chats")} />
          <SettingRow icon={<Bell className="w-5 h-5 text-accent" />} label={t("notificationsSetting")} sub={t("notificationsSettingSub")} onClick={() => setPanel("notifications")} />
          <SettingRow icon={<Database className="w-5 h-5 text-secondary" />} label={t("storageDataSetting")} sub={t("storageDataSub")} onClick={() => setPanel("storage")} />
          <SettingRow
            icon={<Palette className="w-5 h-5 text-yellow-400" />}
            label={t("chatBgTitle")}
            sub={t("chatBgDesc")}
            onClick={() => setShowBgPicker(true)}
            preview={
              <span className="w-6 h-6 rounded-full border border-white/20 shrink-0" style={chatBg.current.previewStyle} />
            }
          />
          <SettingRow icon={<KeyRound className="w-5 h-5 text-muted-foreground" />} label={`User ID: ${user.uid.slice(0, 10)}…`} sub={t("tapToCopyId")} onClick={() => { navigator.clipboard.writeText(user.uid); show(t("userIdCopied")); }} noChevron />
        </div>

        <button
          onClick={() => logOut()}
          className="w-full glass rounded-2xl py-3 flex items-center justify-center gap-2 text-destructive font-medium hover:bg-destructive/10 transition"
        >
          <LogOut className="w-4 h-4" />
          {t("logOut")}
        </button>

        <p className="text-center text-[11px] text-muted-foreground pt-2">
          Chatrazze • {t("poweredBy")}
        </p>
      </div>
      <SettingsSheet panel={panel} onClose={() => setPanel(null)} />

      {/* Chat Background Picker */}
      {showBgPicker && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center">
          <div className="glass w-full md:max-w-sm md:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden">
            <header className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="font-semibold text-sm">{t("chatBgTitle")}</h2>
              <button
                onClick={() => setShowBgPicker(false)}
                className="w-8 h-8 rounded-full hover:bg-white/5 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </header>
            <div className="p-4 grid grid-cols-3 gap-3">
              {CHAT_BACKGROUNDS.map((bg) => {
                const isActive = chatBg.bgId === bg.id;
                return (
                  <button
                    key={bg.id}
                    onClick={() => { chatBg.setChatBg(bg.id); setShowBgPicker(false); }}
                    className={`relative rounded-2xl overflow-hidden aspect-square border-2 transition ${
                      isActive ? "border-primary shadow-lg scale-105" : "border-transparent hover:border-white/20"
                    }`}
                  >
                    <div className="w-full h-full" style={bg.previewStyle} />
                    <div className="absolute inset-x-0 bottom-0 bg-black/50 py-1 px-1">
                      <p className="text-[10px] text-white font-medium text-center truncate">{bg.labelAr}</p>
                    </div>
                    {isActive && (
                      <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
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

function SettingRow({ icon, label, sub, onClick, noChevron, preview }: { icon: React.ReactNode; label: string; sub: string; onClick?: () => void; noChevron?: boolean; preview?: React.ReactNode; }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 active:scale-[0.99] transition text-left border-b border-border last:border-b-0">
      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{sub}</p>
      </div>
      {preview}
      {!noChevron && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
    </button>
  );
}
