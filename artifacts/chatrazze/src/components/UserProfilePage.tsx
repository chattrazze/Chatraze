import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AppUser } from "@/lib/userService";
import { getChatStats, getSharedMedia, getBlockedUsers, toggleBlock, MessageDoc } from "@/lib/chatService";
import Avatar from "@/components/Avatar";
import { useLang } from "@/hooks/useLang";
import type { CallKind } from "@/lib/callService";
import {
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  Mail,
  MessageCircle,
  Mic,
  Phone,
  ShieldBan,
  ShieldCheck,
  Video,
} from "lucide-react";

interface Props {
  peer: AppUser;
  chatId: string;
  peerOnline: boolean;
  peerLastSeen: Date | null;
  onBack: () => void;
  onCall?: (peer: AppUser, kind: CallKind) => void;
}

export default function UserProfilePage({
  peer, chatId, peerOnline, peerLastSeen, onBack, onCall,
}: Props) {
  const { user } = useAuth();
  const { t } = useLang();
  const [stats, setStats] = useState({ messageCount: 0, imageCount: 0, videoCount: 0, fileCount: 0, audioCount: 0 });
  const [media, setMedia] = useState<MessageDoc[]>([]);
  const [tab, setTab] = useState<"media" | "files">("media");
  const [blocked, setBlocked] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setBlocked(getBlockedUsers(user.uid).has(peer.uid));
    getChatStats(chatId).then(setStats).catch(() => {});
    getSharedMedia(chatId).then(setMedia).catch(() => {});
  }, [chatId, peer.uid, user]);

  const images = useMemo(() => media.filter((m) => m.type === "image"), [media]);
  const videos = useMemo(() => media.filter((m) => m.type === "video"), [media]);
  const files  = useMemo(() => media.filter((m) => m.type === "file"), [media]);
  const voices = useMemo(() => media.filter((m) => m.type === "audio"), [media]);

  const tabMedia = tab === "media" ? [...images, ...videos] : files;

  function handleBlock() {
    if (!user) return;
    const now = toggleBlock(user.uid, peer.uid);
    setBlocked(now);
  }

  function fmtLastSeen(d: Date) {
    const diff = Date.now() - d.getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return t("justNow");
    if (min < 60) return `${min}${t("minAgo")}`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}${t("hAgo")}`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-3 glass border-b border-border shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-white/5 transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-semibold text-base flex-1">{t("contactInfo")}</h1>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="relative">
          <div className="h-36 bg-gradient-to-br from-[#FF7A1A] to-[#FF4E00]" />
          <div className="flex justify-center -mt-12">
            <div className="ring-4 ring-background rounded-full shadow-2xl">
              <Avatar name={peer.displayName} photoURL={peer.photoURL} size={96} />
            </div>
          </div>
        </div>

        <div className="text-center px-6 pt-3 pb-5">
          <h2 className="text-xl font-bold">{peer.displayName}</h2>
          <div className="flex items-center justify-center gap-1.5 mt-1.5">
            <span className={`w-2 h-2 rounded-full ${peerOnline ? "bg-secondary" : "bg-muted-foreground/40"}`} />
            <p className="text-sm text-muted-foreground">
              {peerOnline
                ? t("onlineCapital")
                : peerLastSeen
                  ? `${t("lastSeen")} ${fmtLastSeen(peerLastSeen)}`
                  : t("offlineCapital")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 px-5 mb-5">
          {[
            { label: t("messagesLabel"), value: stats.messageCount, Icon: MessageCircle, color: "text-primary" },
            { label: t("photosLabel"),   value: stats.imageCount,   Icon: ImageIcon,     color: "text-accent"   },
            { label: t("videosLabel"),   value: stats.videoCount,   Icon: Video,         color: "text-secondary"},
            { label: t("filesLabel"),    value: stats.fileCount,    Icon: FileText,      color: "text-yellow-400"},
          ].map(({ label, value, Icon, color }) => (
            <div key={label} className="glass rounded-2xl p-3 text-center">
              <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
              <p className="text-lg font-bold leading-none">{value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <div className="px-5 space-y-2 mb-5">
          {peer.email && (
            <div className="flex items-center gap-3 glass rounded-2xl px-4 py-3">
              <Mail className="w-4 h-4 text-primary shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{t("emailLabel")}</p>
                <p className="text-sm font-medium">{peer.email}</p>
              </div>
            </div>
          )}
          {peer.phone && (
            <div className="flex items-center gap-3 glass rounded-2xl px-4 py-3">
              <Phone className="w-4 h-4 text-primary shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{t("phoneLabel")}</p>
                <p className="text-sm font-medium">{peer.phone}</p>
              </div>
            </div>
          )}
          {voices.length > 0 && (
            <div className="flex items-center gap-3 glass rounded-2xl px-4 py-3">
              <Mic className="w-4 h-4 text-primary shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{t("voiceMessagesLabel")}</p>
                <p className="text-sm font-medium">{voices.length} {t("voiceMessagesCount")}</p>
              </div>
            </div>
          )}
        </div>

        {onCall && (
          <div className="flex gap-3 px-5 mb-5">
            <button
              onClick={() => onCall(peer, "voice")}
              className="flex-1 flex flex-col items-center gap-1.5 glass rounded-2xl py-3.5 hover:bg-white/5 transition"
            >
              <Phone className="w-5 h-5 text-secondary" />
              <span className="text-xs text-muted-foreground">{t("voiceCallBtn")}</span>
            </button>
            <button
              onClick={() => onCall(peer, "video")}
              className="flex-1 flex flex-col items-center gap-1.5 glass rounded-2xl py-3.5 hover:bg-white/5 transition"
            >
              <Video className="w-5 h-5 text-accent" />
              <span className="text-xs text-muted-foreground">{t("videoCallBtn")}</span>
            </button>
          </div>
        )}

        {(images.length > 0 || videos.length > 0 || files.length > 0) && (
          <div className="px-5 mb-5">
            <div className="flex gap-1 glass rounded-2xl p-1 mb-3">
              {(["media", "files"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium capitalize transition ${
                    tab === k ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {k === "media"
                    ? `${t("mediaTab")} (${images.length + videos.length})`
                    : `${t("filesTab")} (${files.length})`}
                </button>
              ))}
            </div>

            {tab === "media" && tabMedia.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5">
                {tabMedia.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => m.mediaUrl && setLightbox(m.mediaUrl)}
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

            {tab === "files" && files.length > 0 && (
              <div className="space-y-2">
                {files.map((m) => (
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
          </div>
        )}

        <div className="px-5 pb-8">
          <button
            onClick={handleBlock}
            className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-sm font-semibold transition border ${
              blocked
                ? "border-secondary/30 text-secondary hover:bg-secondary/10"
                : "border-red-500/30 text-red-400 hover:bg-red-500/10"
            }`}
          >
            {blocked ? (
              <><ShieldCheck className="w-5 h-5" /> {t("unblockUser")} {peer.displayName}</>
            ) : (
              <><ShieldBan className="w-5 h-5" /> {t("blockUser")} {peer.displayName}</>
            )}
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
    </div>
  );
}
