import { useState } from "react";
import { Megaphone, Plus, Users } from "lucide-react";

interface CommunityGroup {
  id: string;
  title: string;
  subtitle: string;
  kind: "announcements" | "general" | "group";
  unread: number;
}

const INITIAL_GROUPS: CommunityGroup[] = [
  { id: "announcements", title: "Announcements", subtitle: "Broadcast updates to all members", kind: "announcements", unread: 2 },
  { id: "general", title: "General", subtitle: "Open chat for everyone", kind: "general", unread: 4 },
  { id: "off-topic", title: "Off-topic", subtitle: "Casual chats and memes", kind: "group", unread: 0 },
];

export default function CommunitiesScreen({
  onGoToChats,
}: {
  onGoToChats: () => void;
}) {
  const [groups, setGroups] = useState(INITIAL_GROUPS);

  function openGroup(id: string) {
    setGroups((current) => current.map((g) => g.id === id ? { ...g, unread: 0 } : g));
    onGoToChats();
  }

  function addCommunity() {
    setGroups((current) => [
      ...current,
      {
        id: `group-${Date.now()}`,
        title: `New group ${current.length - 1}`,
        subtitle: "New community group",
        kind: "group",
        unread: 0,
      },
    ]);
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <header className="px-5 pt-6 pb-4 glass border-b border-border flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Communities</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bring together groups under one roof.
          </p>
        </div>
        <button
          onClick={addCommunity}
          className="w-10 h-10 rounded-full bg-secondary text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition"
          title="New community"
        >
          <Plus className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-3">
        <div className="glass rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent to-secondary flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm">My Community</p>
              <p className="text-xs text-muted-foreground">
                Your groups, organized.
              </p>
            </div>
          </div>
          <div className="border-t border-border">
            {groups.map((group) => (
              <Row
                key={group.id}
                icon={
                  group.kind === "announcements"
                    ? <Megaphone className="w-4 h-4 text-primary" />
                    : <Users className={`w-4 h-4 ${group.kind === "general" ? "text-secondary" : "text-accent"}`} />
                }
                title={group.title}
                subtitle={group.subtitle}
                unread={group.unread}
                onClick={() => openGroup(group.id)}
              />
            ))}
          </div>
        </div>

        <button
          onClick={addCommunity}
          className="w-full glass rounded-2xl p-6 text-center hover:bg-white/5 active:scale-[0.99] transition"
        >
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-white/5 flex items-center justify-center">
            <Plus className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="font-semibold text-sm">Start a new community</p>
          <p className="text-xs text-muted-foreground mt-1">
            Group multiple chats into one space.
          </p>
        </button>
      </div>
    </div>
  );
}

function Row({
  icon,
  title,
  subtitle,
  unread,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  unread: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 active:scale-[0.99] transition"
    >
      <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
      </div>
      {unread > 0 && (
        <span className="bg-secondary text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
