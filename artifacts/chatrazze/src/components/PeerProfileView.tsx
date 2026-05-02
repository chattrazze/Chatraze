import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Ban, FileText, Image as ImageIcon, Trash2 } from "lucide-react";
import { AppUser } from "@/lib/userService";
import { listenToMessages, MessageDoc } from "@/lib/chatService";
import { useLang } from "@/hooks/useLang";
import Avatar from "@/components/Avatar";

interface Props {
  peer: AppUser;
  chatId: string;
  onBack: () => void;
  onClearChat: () => void;
}

export default function PeerProfileView({ peer, chatId, onBack, onClearChat }: Props) {
  const { t } = useLang();
  const [messages, setMessages] = useState<MessageDoc[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [confirm, setConfirm] = useState<"block" | "clear" | null>(null);

  useEffect(() => {
    const key = `blocked:${peer.uid}`;
    setBlocked(localStorage.getItem(key) === "1");
  }, [peer.uid]);

  useEffect(() => {
    return listenToMessages(chatId, setMessages);
  }, [chatId]);

  const mediaMessages = messages.filter((m) => m.type === "image" || m.type === "video");
  const fileMessages = messages.filter((m) => m.type === "file");
  const mediaGrid = mediaMessages.slice(-9).reverse();

  function toggleBlock() {
    if (blocked) {
      localStorage.removeItem(`blocked:${peer.uid}`);
      setBlocked(false);
    } else {
      setConfirm("block");
    }
  }

  function doBlock() {
    localStorage.setItem(`blocked:${peer.uid}`, "1");
    setBlocked(true);
    setConfirm(null);
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-3 py-2.5 glass border-b border-border shrink-0">
        <button
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-accent/15 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-semibold text-sm">{t("viewProfile")}</h1>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Profile hero */}
        <div className="glass border-b border-border p-6 flex flex-col items-center text-center gap-3">
          <div className="w-24 h-24 rounded-full overflow-hidden ring-4 ring-primary/30 shrink-0">
            {peer.photoURL ? (
              <img
                src={peer.photoURL}
                alt={peer.displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              <Avatar name={peer.displayName} photoURL={null} size={96} />
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold">{peer.displayName}</h2>
            {peer.email && (
              <p className="text-sm text-muted-foreground mt-0.5">{peer.email}</p>
            )}
            {peer.phone && (
              <p className="text-sm text-muted-foreground">{peer.phone}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={`w-2 h-2 rounded-full ${peer.online ? "bg-green-400" : "bg-muted-foreground/40"}`}
            />
            <span>
              {peer.online
                ? t("online")
                : peer.lastSeen
                ? `${t("lastSeen")} ${new Date(peer.lastSeen).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : ""}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 p-4">
          <div className="glass rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-primary">{mediaMessages.length}</p>
            <div className="flex items-center justify-center gap-1 mt-1">
              <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{t("sharedMedia")}</p>
            </div>
          </div>
          <div className="glass rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-accent">{fileMessages.length}</p>
            <div className="flex items-center justify-center gap-1 mt-1">
              <FileText className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{t("sharedFiles")}</p>
            </div>
          </div>
        </div>

        {/* Media grid */}
        {mediaGrid.length > 0 && (
          <div className="px-4 mb-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 px-1">
              {t("sharedMedia")}
            </p>
            <div className="grid grid-cols-3 gap-0.5 rounded-2xl overflow-hidden">
              {mediaGrid.map((m) => (
                <a key={m.id} href={m.mediaUrl} target="_blank" rel="noreferrer" className="block">
                  {m.type === "image" ? (
                    <img
                      src={m.mediaUrl}
                      className="w-full aspect-square object-cover"
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <video
                      src={m.mediaUrl}
                      className="w-full aspect-square object-cover"
                    />
                  )}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-4 pb-8 space-y-2">
          <button
            onClick={toggleBlock}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl glass transition-colors ${
              blocked
                ? "text-green-400 hover:bg-green-400/10"
                : "text-destructive hover:bg-destructive/10"
            }`}
          >
            <Ban className="w-5 h-5 shrink-0" />
            <span className="font-medium text-sm">
              {blocked ? t("unblockUser") : t("blockUser")}
            </span>
          </button>

          <button
            onClick={() => setConfirm("clear")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl glass text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="w-5 h-5 shrink-0" />
            <span className="font-medium text-sm">{t("clearChat")}</span>
          </button>
        </div>
      </div>

      {/* Confirm dialog */}
      {confirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="glass rounded-3xl p-6 w-full max-w-sm text-center space-y-4 shadow-2xl">
            <p className="font-semibold text-base">
              {confirm === "block" ? t("confirmBlock") : t("confirmClear")}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-white/5 transition"
              >
                {t("cancel")}
              </button>
              <button
                onClick={() => {
                  if (confirm === "block") doBlock();
                  else {
                    onClearChat();
                    setConfirm(null);
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-white text-sm font-medium hover:opacity-90 transition"
              >
                {t("confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
