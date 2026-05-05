import { useEffect, useState } from "react";
import { ArrowLeft, Bell, Database, Eye, Globe, Info, Music, Play, Trash2, Volume2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useTheme } from "@/hooks/useTheme";
import { useLang, LANG_LIST } from "@/hooks/useLang";
import { useAuth } from "@/hooks/useAuth";
import { setUserLang } from "@/lib/userService";
import type { Lang } from "@/hooks/useLang";

export type SettingPanel = "privacy" | "chats" | "notifications" | "storage" | null;

interface Props {
  panel: SettingPanel;
  onClose: () => void;
}

export default function SettingsSheet({ panel, onClose }: Props) {
  const { t } = useLang();
  if (!panel) return null;

  const titles: Record<Exclude<SettingPanel, null>, string> = {
    privacy: t("privacyPanelTitle"),
    chats: t("chatsSetting"),
    notifications: t("browserNotif"),
    storage: t("storagePanelTitle"),
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center">
      <div className="glass w-full md:max-w-md md:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-white/5 active:scale-95 flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="font-semibold text-base">{titles[panel]}</h2>
        </header>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
          {panel === "privacy"       && <PrivacyPanel />}
          {panel === "chats"         && <ChatsPanel />}
          {panel === "notifications" && <NotificationsPanel />}
          {panel === "storage"       && <StoragePanel />}
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label, description, value, onChange, icon,
}: {
  label: string; description?: string; value: boolean;
  onChange: (v: boolean) => void; icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="w-full glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:bg-white/5 active:scale-[0.99] transition text-start"
    >
      {icon && (
        <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center">{icon}</div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <span className={`w-10 h-6 rounded-full p-0.5 flex transition shrink-0 ${value ? "bg-primary" : "bg-white/10"}`}>
        <span className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : "translate-x-0"}`} />
      </span>
    </button>
  );
}

function useLocalToggle(key: string, defaultValue = true) {
  const [v, setV] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? defaultValue : raw === "1";
    } catch { return defaultValue; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, v ? "1" : "0"); } catch {}
  }, [key, v]);
  return [v, setV] as const;
}

function PrivacyPanel() {
  const { t } = useLang();
  const [online, setOnline]         = useLocalToggle("chatrazze:privacy:online", true);
  const [lastSeen, setLastSeen]     = useLocalToggle("chatrazze:privacy:lastSeen", true);
  const [readReceipts, setRead]     = useLocalToggle("chatrazze:privacy:readReceipts", true);
  return (
    <>
      <ToggleRow icon={<Eye className="w-5 h-5 text-secondary" />} label={t("showOnline")} description={t("showOnlineDesc")} value={online} onChange={setOnline} />
      <ToggleRow icon={<Eye className="w-5 h-5 text-accent" />}    label={t("showLastSeen")} description={t("showLastSeenDesc")} value={lastSeen} onChange={setLastSeen} />
      <ToggleRow icon={<Eye className="w-5 h-5 text-primary" />}   label={t("readReceipts")} description={t("readReceiptsDesc")} value={readReceipts} onChange={setRead} />
      <p className="text-xs text-muted-foreground px-2 pt-2 flex items-start gap-2">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />{t("privacyNote")}
      </p>
    </>
  );
}

function ChatsPanel() {
  const { t, lang, setLang } = useLang();
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const [enterToSend, setEnterToSend] = useLocalToggle("chatrazze:chats:enterToSend", true);
  const [autoplay, setAutoplay]       = useLocalToggle("chatrazze:chats:autoplayMedia", false);

  function handleSetLang(code: Lang) {
    setLang(code);
    if (user) setUserLang(user.uid, code).catch(() => {});
  }

  return (
    <>
      <ToggleRow label={t("darkTheme")} description={`${t("currently")} ${theme}`} value={theme === "dark"} onChange={() => toggle()} />
      <ToggleRow label={t("enterSend")} description={t("enterSendDesc")} value={enterToSend} onChange={setEnterToSend} />
      <ToggleRow label={t("autoplay")} value={autoplay} onChange={setAutoplay} />

      <div className="glass rounded-2xl px-4 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center">
            <Globe className="w-5 h-5 text-primary" />
          </div>
          <p className="text-sm font-medium">{t("language")}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {LANG_LIST.map((l) => (
            <button
              key={l.code}
              onClick={() => handleSetLang(l.code)}
              className={`py-2 px-3 rounded-xl text-sm font-medium transition flex items-center gap-2 ${
                lang === l.code ? "bg-primary text-white" : "bg-white/5 hover:bg-white/10"
              }`}
            >
              <span className="text-[11px] font-mono font-bold opacity-60">{l.iso}</span>
              <span className="truncate">{l.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/* ─── Ringtones ───────────────────────────────────────────────────────────── */
export const RINGTONE_KEY = "chatrazze:notifications:ringtone";

type RingtoneDef = { id: string; label: string; play: (ctx: AudioContext) => void };

function tone(
  ctx: AudioContext,
  freq: number, t: number, dur: number, vol: number,
  type: OscillatorType = "sine",
) {
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  osc.type = type; osc.frequency.value = freq;
  g.gain.setValueAtTime(0, ctx.currentTime + t);
  g.gain.linearRampToValueAtTime(vol, ctx.currentTime + t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + dur);
  osc.start(ctx.currentTime + t);
  osc.stop(ctx.currentTime + t + dur + 0.05);
}

export const RINGTONES: RingtoneDef[] = [
  {
    id: "ding",
    label: "Ding",
    play: (ctx) => {
      tone(ctx, 880, 0,    0.13, 0.35);
      tone(ctx, 1100, 0.11, 0.11, 0.25);
    },
  },
  {
    id: "chime",
    label: "Chime",
    play: (ctx) => {
      [523.25, 659.25, 783.99].forEach((f, i) => tone(ctx, f, i * 0.13, 0.38, 0.28));
    },
  },
  {
    id: "tritone",
    label: "Tri-tone",
    play: (ctx) => {
      [1046.5, 880, 698.46].forEach((f, i) => tone(ctx, f, i * 0.11, 0.20, 0.30));
    },
  },
  {
    id: "pulse",
    label: "Pulse",
    play: (ctx) => {
      [0, 0.09, 0.18].forEach((t) => tone(ctx, 1200, t, 0.06, 0.22, "square"));
    },
  },
  {
    id: "crystal",
    label: "Crystal",
    play: (ctx) => {
      [[1318.5, 0], [1567.98, 0.08], [2093, 0.16], [1567.98, 0.32]].forEach(
        ([f, t]) => tone(ctx, f, t, 0.45, 0.18),
      );
    },
  },
  {
    id: "bamboo",
    label: "Bamboo",
    play: (ctx) => {
      tone(ctx, 220, 0,    0.08, 0.40, "triangle");
      tone(ctx, 880, 0.05, 0.25, 0.20);
      tone(ctx, 220, 0.18, 0.08, 0.30, "triangle");
      tone(ctx, 1100, 0.22, 0.18, 0.15);
    },
  },
  {
    id: "cosmic",
    label: "Cosmic",
    play: (ctx) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.25);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.45);
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.30, ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.50);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.55);
      tone(ctx, 1800, 0.28, 0.15, 0.15);
    },
  },
  {
    id: "bell",
    label: "Bell",
    play: (ctx) => {
      const freqs = [440, 880, 1320, 1760];
      freqs.forEach((f, i) => {
        tone(ctx, f, 0, 0.6 - i * 0.08, 0.28 / (i + 1));
      });
    },
  },
];

function getAudioCtx() {
  const AudioCtx = window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new AudioCtx();
}

export function playRingtoneById(id: string) {
  try {
    const ctx = getAudioCtx();
    const r = RINGTONES.find((x) => x.id === id) ?? RINGTONES[0];
    r.play(ctx);
    setTimeout(() => ctx.close(), 1500);
  } catch {}
}

export function playNotificationSound() {
  const soundEnabled = localStorage.getItem("chatrazze:notifications:sound") !== "0";
  if (!soundEnabled) return;
  const id = localStorage.getItem(RINGTONE_KEY) ?? "ding";
  playRingtoneById(id);
}

export function sendBrowserNotification(title: string, body: string) {
  const allowed = localStorage.getItem("chatrazze:notifications:enabled") !== "0";
  if (!allowed) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, {
          body,
          icon: "/icons/icon-192.png",
          tag: "chatrazze-msg",
        } as NotificationOptions);
      });
    } else {
      new Notification(title, { body, icon: "/icons/icon-192.png" });
    }
  } catch {}
}

function NotificationsPanel() {
  const { t } = useLang();
  const { show } = useToast();
  const [supported] = useState(() => typeof Notification !== "undefined");
  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : "denied",
  );
  const [enabled, setEnabled] = useLocalToggle("chatrazze:notifications:enabled", true);
  const [sound, setSound]     = useLocalToggle("chatrazze:notifications:sound", true);
  const [preview, setPreview] = useLocalToggle("chatrazze:notifications:preview", true);

  async function requestOrTest() {
    if (!supported) { show(t("notifNotSupported")); return; }
    if (permission === "granted") {
      playNotificationSound();
      sendBrowserNotification("Chatrazze", t("newMessage") + " — test 🔔");
      return;
    }
    const r = await Notification.requestPermission();
    setPermission(r);
    if (r === "granted") {
      playNotificationSound();
      show(t("notifEnabled"));
    } else {
      show(t("notifBlocked"));
    }
  }

  return (
    <>
      <button
        onClick={requestOrTest}
        className="w-full glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:bg-white/5 active:scale-[0.99] transition text-start"
      >
        <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center">
          <Bell className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{t("browserNotif")}</p>
          <p className="text-xs text-muted-foreground">
            {!supported        ? t("notifNotSupported")
              : permission === "granted" ? t("notifActive")
              : permission === "denied"  ? t("notifDenied")
              : t("notifPrompt")}
          </p>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
          permission === "granted" ? "bg-secondary/20 text-secondary"
            : permission === "denied" ? "bg-destructive/20 text-destructive"
            : "bg-white/10 text-foreground"
        }`}>
          {permission}
        </span>
      </button>

      <ToggleRow
        icon={<Volume2 className="w-5 h-5 text-primary" />}
        label={t("notifSound")}
        value={sound}
        onChange={(v) => { setSound(v); if (v) playNotificationSound(); }}
      />
      {sound && <RingtonePicker />}
      <ToggleRow label={t("notifPreview")} description={t("notifPreviewDesc")} value={enabled} onChange={setEnabled} />
      <ToggleRow label={t("notifPreview")} value={preview} onChange={setPreview} />
    </>
  );
}

function RingtonePicker() {
  const { t } = useLang();
  const [selected, setSelected] = useState(
    () => localStorage.getItem(RINGTONE_KEY) ?? "ding",
  );
  const [playing, setPlaying] = useState<string | null>(null);

  function pick(id: string) {
    setSelected(id);
    localStorage.setItem(RINGTONE_KEY, id);
    setPlaying(id);
    playRingtoneById(id);
    setTimeout(() => setPlaying(null), 900);
  }

  return (
    <div className="glass rounded-2xl px-4 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Music className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{t("ringtoneLabel")}</p>
          <p className="text-xs text-muted-foreground">{t("ringtoneTap")}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {RINGTONES.map((r) => {
          const isActive  = selected === r.id;
          const isPlaying = playing  === r.id;
          return (
            <button
              key={r.id}
              onClick={() => pick(r.id)}
              className={`py-2.5 px-3 rounded-xl text-sm font-medium transition-all flex items-center gap-2 text-start active:scale-95 ${
                isActive
                  ? "bg-primary text-white shadow-md shadow-primary/30"
                  : "bg-foreground/5 hover:bg-foreground/10"
              }`}
            >
              <span className={`shrink-0 transition-transform ${isPlaying ? "scale-125" : ""}`}>
                {isPlaying
                  ? <Play className="w-3.5 h-3.5 fill-current" />
                  : <Music className="w-3.5 h-3.5 opacity-60" />
                }
              </span>
              <span className="truncate">{r.label}</span>
              {isActive && !isPlaying && (
                <span className="ml-auto w-2 h-2 rounded-full bg-white shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StoragePanel() {
  const { t } = useLang();
  const { show } = useToast();
  const [storageInfo, setInfo] = useState<{ used: number; quota: number } | null>(null);

  useEffect(() => {
    navigator.storage?.estimate?.().then((est) => {
      setInfo({ used: est.usage ?? 0, quota: est.quota ?? 0 });
    });
  }, []);

  function clearCache() {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith("chatrazze:"));
      keys.forEach((k) => localStorage.removeItem(k));
      show(`${keys.length} ${t("clearedCacheMsg")}`);
    } catch { show(t("couldNotClearCache")); }
  }

  const usedMb  = storageInfo ? (storageInfo.used  / 1024 / 1024).toFixed(2) : "—";
  const quotaMb = storageInfo ? (storageInfo.quota / 1024 / 1024).toFixed(0)  : "—";

  return (
    <>
      <div className="glass rounded-2xl px-4 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center">
          <Database className="w-5 h-5 text-secondary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">{t("browserStorage")}</p>
          <p className="text-xs text-muted-foreground">{usedMb} MB {t("used")} {quotaMb} MB {t("available")}</p>
        </div>
      </div>
      <button
        onClick={clearCache}
        className="w-full glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:bg-destructive/10 active:scale-[0.99] transition text-start"
      >
        <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
          <Trash2 className="w-5 h-5 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-destructive">{t("clearCache")}</p>
          <p className="text-xs text-muted-foreground">{t("clearCacheDesc")}</p>
        </div>
      </button>
      <p className="text-xs text-muted-foreground px-2 pt-2 flex items-start gap-2">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />{t("storageNote")}
      </p>
    </>
  );
}
