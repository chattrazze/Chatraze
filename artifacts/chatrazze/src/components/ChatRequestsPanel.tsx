import { useEffect, useState } from "react";
import { X, Check, UserCircle2, Clock } from "lucide-react";
import { useLang } from "@/hooks/useLang";
import { useToast } from "@/components/Toast";
import Avatar from "@/components/Avatar";
import {
  ChatRequest,
  listenToPendingRequests,
  respondToChatRequest,
} from "@/lib/requestService";
import { createChat } from "@/lib/chatService";
import { AppUser } from "@/lib/userService";

interface Props {
  myUid: string;
  onClose: () => void;
  onOpenChat: (chatId: string, peer: AppUser) => void;
}

export default function ChatRequestsPanel({ myUid, onClose, onOpenChat }: Props) {
  const { t } = useLang();
  const toast = useToast();
  const [requests, setRequests] = useState<ChatRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsub = listenToPendingRequests(myUid, (reqs) => {
      setRequests(reqs);
      setLoading(false);
    });
    return () => unsub();
  }, [myUid]);

  async function handleAccept(req: ChatRequest) {
    if (!req.fromUser) return;
    setProcessing(req.id);
    try {
      await respondToChatRequest(req.id, "accepted");
      const chatId = await createChat(myUid, req.fromUid);
      toast.show(t("requestAccepted"));
      onOpenChat(chatId, req.fromUser);
      onClose();
    } catch {
      toast.show(t("couldNotSend"));
    } finally {
      setProcessing(null);
    }
  }

  async function handleReject(req: ChatRequest) {
    setProcessing(req.id);
    try {
      await respondToChatRequest(req.id, "rejected");
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
      toast.show(t("requestRejected"));
    } catch {
      toast.show(t("couldNotSend"));
    } finally {
      setProcessing(null);
    }
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return t("justNow");
    if (diffMin < 60) return `${diffMin}${t("minAgo")}`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}${t("hAgo")}`;
    return `${Math.floor(diffH / 24)}${t("dAgo")}`;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="glass w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FF7A1A] to-[#FF4E00] flex items-center justify-center">
              <UserCircle2 className="w-4 h-4 text-white" />
            </div>
            <h3 className="font-semibold">{t("requestsTitle")}</h3>
            {requests.length > 0 && (
              <span className="text-xs font-bold bg-primary text-primary-foreground rounded-full px-2 py-0.5 min-w-[20px] text-center">
                {requests.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-foreground/5 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {loading && (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          )}

          {!loading && requests.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
              <div className="w-16 h-16 rounded-full bg-foreground/5 flex items-center justify-center">
                <UserCircle2 className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">{t("noPendingRequests")}</p>
            </div>
          )}

          {!loading && requests.map((req) => {
            const u = req.fromUser;
            const busy = processing === req.id;
            return (
              <div key={req.id} className="px-4 py-3 border-b border-border/50 last:border-0">
                {/* Requester profile */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="relative shrink-0">
                    <Avatar name={u?.displayName ?? "?"} photoURL={u?.photoURL ?? null} size={52} />
                    {u?.online && (
                      <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-secondary border-2 border-background" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{u?.displayName ?? t("loadingDots")}</p>
                    {u?.bio && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{u.bio}</p>
                    )}
                    <div className="flex items-center gap-1 mt-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground">{formatTime(req.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Info line */}
                <p className="text-xs text-muted-foreground mb-3 px-1">
                  <span className="font-medium text-foreground">{u?.displayName}</span>{" "}
                  {t("wantsToChat")}
                </p>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    disabled={busy}
                    onClick={() => handleAccept(req)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-br from-[#FF7A1A] to-[#FF4E00] text-white text-sm font-semibold shadow hover:opacity-90 active:scale-95 transition disabled:opacity-50"
                  >
                    {busy ? (
                      <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    {t("acceptRequest")}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => handleReject(req)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-foreground/5 active:scale-95 transition disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                    {t("rejectRequest")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
