import { useEffect, useState } from "react";
import {
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Trash2,
  Video,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/Toast";
import { useLang } from "@/hooks/useLang";
import { loadCallHistory, clearCallHistory, type CallRecord } from "@/lib/callService";

export default function CallsScreen({
  onGoToChats: _onGoToChats,
}: {
  onGoToChats: () => void;
}) {
  const { user } = useAuth();
  const { show } = useToast();
  const { t } = useLang();
  const [calls, setCalls] = useState<CallRecord[]>([]);

  useEffect(() => {
    if (!user) return;
    setCalls(loadCallHistory(user.uid));
  }, [user]);

  function doClear() {
    if (!user) return;
    clearCallHistory(user.uid);
    setCalls([]);
    show(t("callHistoryCleared"));
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <header className="px-5 pt-6 pb-4 glass border-b border-border flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("calls")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("recentCallHistory")}</p>
        </div>
        {calls.length > 0 && (
          <button
            onClick={doClear}
            title={t("callHistoryCleared")}
            className="w-10 h-10 rounded-full hover:bg-white/5 active:scale-95 flex items-center justify-center text-muted-foreground hover:text-destructive transition"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-2">
        {calls.length === 0 ? (
          <>
            <div className="glass rounded-2xl p-8 text-center">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/5 flex items-center justify-center">
                <Phone className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="font-semibold">{t("noCallsYet")}</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                {t("noCallsDesc")}
              </p>
            </div>
            <div className="px-2 pt-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{t("callTypesLabel")}</p>
              <div className="grid grid-cols-3 gap-2">
                <Tag color="text-secondary" Icon={PhoneIncoming} label={t("incoming")} />
                <Tag color="text-accent"    Icon={PhoneOutgoing} label={t("outgoing")} />
                <Tag color="text-destructive" Icon={PhoneMissed} label={t("missed")} />
              </div>
            </div>
          </>
        ) : (
          calls.map((c) => <CallRow key={c.id} call={c} />)
        )}
      </div>
    </div>
  );
}

function CallRow({ call }: { call: CallRecord }) {
  const { t } = useLang();
  const dirIcon =
    call.direction === "incoming" ? PhoneIncoming
    : call.direction === "outgoing" ? PhoneOutgoing
    : PhoneMissed;
  const DirIcon = dirIcon;
  const color =
    call.direction === "incoming" ? "text-secondary"
    : call.direction === "outgoing" ? "text-accent"
    : "text-destructive";

  function timeAgo(ms: number): string {
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return t("justNow");
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}${t("minAgo")}`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}${t("hAgo")}`;
    const d = Math.floor(h / 24);
    return `${d}${t("dAgo")}`;
  }

  const dirLabel =
    call.direction === "incoming" ? t("incoming")
    : call.direction === "outgoing" ? t("outgoing")
    : t("missed");

  return (
    <div className="w-full flex items-center gap-3 p-3 rounded-2xl glass">
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF7A1A]/30 to-[#FF4E00]/30 flex items-center justify-center font-semibold text-sm">
        {call.peerName.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{call.peerName}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <DirIcon className={`w-3 h-3 ${color}`} />
          {dirLabel}
          {call.kind === "video" && <Video className="w-3 h-3 ml-0.5" />}
          <span className="text-muted-foreground/60">•</span>
          {timeAgo(call.at)}
        </p>
      </div>
    </div>
  );
}

function Tag({
  color, Icon, label,
}: {
  color: string; Icon: typeof Phone; label: string;
}) {
  return (
    <div className="glass rounded-xl p-3 flex flex-col items-center gap-1.5">
      <Icon className={`w-4 h-4 ${color}`} />
      <span className="text-xs">{label}</span>
    </div>
  );
}
