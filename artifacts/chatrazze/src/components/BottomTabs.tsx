import { CircleDot, MessageCircle, Phone, User2, Users } from "lucide-react";
import { useLang } from "@/hooks/useLang";

export type TabKey = "status" | "calls" | "communities" | "chats" | "profile";

interface Props {
  active: TabKey;
  onChange: (t: TabKey) => void;
  unreadTotal: number;
  statusUnread?: number;
}

export default function BottomTabs({
  active,
  onChange,
  unreadTotal,
  statusUnread = 0,
}: Props) {
  const { t } = useLang();

  const TABS: { key: TabKey; labelKey: Parameters<typeof t>[0]; Icon: typeof MessageCircle }[] = [
    { key: "status", labelKey: "status", Icon: CircleDot },
    { key: "calls", labelKey: "calls", Icon: Phone },
    { key: "communities", labelKey: "communities", Icon: Users },
    { key: "chats", labelKey: "chats", Icon: MessageCircle },
    { key: "profile", labelKey: "profile", Icon: User2 },
  ];

  return (
    <nav className="glass border-t border-border w-full md:w-20 md:h-full md:flex-col md:border-t-0 md:border-r flex md:py-3 md:gap-1 md:items-stretch shrink-0">
      <div className="flex md:flex-col w-full md:gap-1 md:px-2">
        {TABS.map(({ key, labelKey, Icon }) => {
          const isActive = active === key;
          const badgeCount =
            key === "chats" ? unreadTotal : key === "status" ? statusUnread : 0;
          const showBadge = badgeCount > 0;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={`flex-1 md:flex-none flex flex-col items-center justify-center gap-1 py-2 md:py-3 md:rounded-xl transition relative ${
                isActive
                  ? "text-primary md:bg-white/5"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-6 h-6 ${isActive ? "drop-shadow-[0_0_6px_hsl(25_100%_50%/0.6)]" : ""}`}
                />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2 bg-secondary text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] md:text-[11px] font-medium">{t(labelKey)}</span>
              {isActive && (
                <span className="md:hidden absolute -top-0.5 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
