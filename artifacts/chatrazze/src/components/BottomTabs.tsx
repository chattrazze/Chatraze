import { CircleDot, Flame, MessageCircle, Phone, User2, Users } from "lucide-react";
import { useLang } from "@/hooks/useLang";

export type TabKey = "status" | "calls" | "communities" | "discover" | "chats" | "profile";

interface Props {
  active: TabKey;
  onChange: (t: TabKey) => void;
  unreadTotal: number;
  statusUnread?: number;
  matchesCount?: number;
}

export default function BottomTabs({
  active,
  onChange,
  unreadTotal,
  statusUnread = 0,
  matchesCount = 0,
}: Props) {
  const { t } = useLang();

  const TABS: { key: TabKey; label: string; Icon: typeof MessageCircle }[] = [
    { key: "status",      label: t("status"),      Icon: CircleDot },
    { key: "calls",       label: t("calls"),        Icon: Phone },
    { key: "communities", label: t("communities"),  Icon: Users },
    { key: "discover",    label: t("discover"),     Icon: Flame },
    { key: "chats",       label: t("chats"),        Icon: MessageCircle },
    { key: "profile",     label: t("profile"),      Icon: User2 },
  ];

  return (
    <nav className="glass border-t border-border w-full md:w-20 md:h-full md:flex-col md:border-t-0 md:border-r flex md:py-3 md:gap-1 md:items-stretch shrink-0">
      <div className="flex md:flex-col w-full md:gap-1 md:px-2">
        {TABS.map(({ key, label, Icon }) => {
          const isActive = active === key;
          const badgeCount =
            key === "chats"   ? unreadTotal
            : key === "status"  ? statusUnread
            : key === "discover" ? matchesCount
            : 0;
          const showBadge = badgeCount > 0;
          const isDiscover = key === "discover";

          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={`flex-1 md:flex-none flex flex-col items-center justify-center gap-0.5 py-2 md:py-3 md:rounded-xl transition relative ${
                isActive
                  ? isDiscover
                    ? "text-[#FF7A1A] md:bg-white/5"
                    : "text-primary md:bg-white/5"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="relative">
                {isDiscover && isActive ? (
                  <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-[#FF7A1A] to-[#FF4E00] flex items-center justify-center shadow-md shadow-primary/30">
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                ) : (
                  <Icon
                    className={`w-5 h-5 ${isActive ? "drop-shadow-[0_0_6px_hsl(25_100%_50%/0.6)]" : ""}`}
                  />
                )}
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2 bg-secondary text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] px-0.5 flex items-center justify-center">
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
              </div>
              <span className="text-[9px] md:text-[10px] font-medium leading-none">{label}</span>
              {isActive && (
                <span className="md:hidden absolute -top-0.5 left-1/2 -translate-x-1/2 w-6 h-1 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
