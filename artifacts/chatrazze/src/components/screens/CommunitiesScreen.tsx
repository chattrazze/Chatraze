import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/Toast";
import {
  Community,
  CommunityChannel,
  getMyCommunities,
  createCommunity,
  deleteCommunity,
  getCommunityChannels,
  createChannel,
  listenToCommunities,
  getCommunityMemberIds,
  leaveCommunity,
} from "@/lib/communityService";
import {
  Megaphone,
  Plus,
  Users,
  Hash,
  ChevronRight,
  Trash2,
  LogOut,
  X,
  Check,
} from "lucide-react";

const ICON_COLORS = [
  "#25D366", "#128C7E", "#FF7A1A", "#3B82F6", "#8B5CF6",
  "#EC4899", "#F59E0B", "#10B981", "#EF4444", "#6366F1",
];

interface Props {
  onOpenChannel: (chatId: string, name: string, memberCount: number, members: string[]) => void;
}

export default function CommunitiesScreen({ onOpenChannel }: Props) {
  const { user } = useAuth();
  const toast = useToast();

  const [communities, setCommunities] = useState<Community[]>([]);
  const [channels, setChannels] = useState<Record<string, CommunityChannel[]>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [showCreate, setShowCreate] = useState(false);
  const [showAddChannel, setShowAddChannel] = useState<string | null>(null);
  const [newCommunityName, setNewCommunityName] = useState("");
  const [newCommunityDesc, setNewCommunityDesc] = useState("");
  const [newCommunityColor, setNewCommunityColor] = useState(ICON_COLORS[0]);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const loadAll = useCallback(async () => {
    if (!user) return;
    const coms = await getMyCommunities(user.uid);
    setCommunities(coms);
    setLoading(false);

    // Expand all by default
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const c of coms) next.add(c.id);
      return next;
    });

    // Load channels for each community
    const channelMap: Record<string, CommunityChannel[]> = {};
    await Promise.all(
      coms.map(async (c) => {
        channelMap[c.id] = await getCommunityChannels(c.id, user.uid);
      }),
    );
    setChannels(channelMap);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadAll();
    const unsub = listenToCommunities(user.uid, loadAll);
    return () => unsub();
  }, [user, loadAll]);

  async function handleCreateCommunity() {
    if (!user || !newCommunityName.trim()) return;
    setCreating(true);
    try {
      const com = await createCommunity(user.uid, newCommunityName.trim(), newCommunityDesc.trim(), newCommunityColor);
      setCommunities((prev) => [...prev, com]);
      setExpanded((prev) => new Set([...prev, com.id]));
      setChannels((prev) => ({ ...prev, [com.id]: [] }));
      setShowCreate(false);
      setNewCommunityName("");
      setNewCommunityDesc("");
      setNewCommunityColor(ICON_COLORS[0]);
      toast.show("Community created!");
    } catch (e) {
      toast.show("Failed to create community. Make sure the community tables exist in Supabase.");
      console.error(e);
    } finally {
      setCreating(false);
    }
  }

  async function handleAddChannel() {
    if (!user || !showAddChannel || !newChannelName.trim()) return;
    setCreating(true);
    try {
      const memberIds = await getCommunityMemberIds(showAddChannel);
      const chatId = await createChannel(showAddChannel, user.uid, newChannelName.trim(), newChannelDesc.trim(), memberIds);
      const ch: CommunityChannel = {
        chatId,
        communityId: showAddChannel,
        name: newChannelName.trim(),
        description: newChannelDesc.trim(),
        kind: newChannelName.toLowerCase().includes("announcement") ? "announcements" : newChannelName.toLowerCase().includes("general") ? "general" : "group",
        unread: 0,
        lastMessage: null,
        lastMessageAt: null,
        memberCount: memberIds.length,
      };
      setChannels((prev) => ({ ...prev, [showAddChannel]: [...(prev[showAddChannel] ?? []), ch] }));
      setShowAddChannel(null);
      setNewChannelName("");
      setNewChannelDesc("");
      toast.show("Channel created!");
    } catch (e) {
      toast.show("Failed to create channel.");
      console.error(e);
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteCommunity(communityId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this community and all its channels?")) return;
    try {
      await deleteCommunity(communityId);
      setCommunities((prev) => prev.filter((c) => c.id !== communityId));
      toast.show("Community deleted.");
    } catch {
      toast.show("Failed to delete community.");
    }
  }

  async function handleLeaveCommunity(communityId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!user) return;
    if (!confirm("Leave this community?")) return;
    try {
      await leaveCommunity(communityId, user.uid);
      setCommunities((prev) => prev.filter((c) => c.id !== communityId));
      toast.show("Left community.");
    } catch {
      toast.show("Could not leave community.");
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <header className="px-5 pt-6 pb-4 glass border-b border-border flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Communities</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {communities.length === 0
              ? "Group your chats into communities."
              : `${communities.length} communit${communities.length === 1 ? "y" : "ies"}`}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition"
          title="New community"
        >
          <Plus className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-3">
        {communities.length === 0 && (
          <button
            onClick={() => setShowCreate(true)}
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
        )}

        {communities.map((com) => {
          const isExpanded = expanded.has(com.id);
          const comChannels = channels[com.id] ?? [];
          const totalUnread = comChannels.reduce((s, c) => s + c.unread, 0);

          return (
            <div key={com.id} className="glass rounded-2xl overflow-hidden">
              {/* Community header */}
              <button
                onClick={() => toggleExpand(com.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 active:scale-[0.99] transition"
              >
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: com.iconColor }}
                >
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{com.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {com.description || `${com.memberCount} member${com.memberCount !== 1 ? "s" : ""} · ${comChannels.length} channel${comChannels.length !== 1 ? "s" : ""}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {totalUnread > 0 && (
                    <span className="bg-primary text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
                      {totalUnread > 99 ? "99+" : totalUnread}
                    </span>
                  )}
                  {com.role === "admin" ? (
                    <button
                      onClick={(e) => handleDeleteCommunity(com.id, e)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition"
                      title="Delete community"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => handleLeaveCommunity(com.id, e)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10 transition"
                      title="Leave community"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <ChevronRight
                    className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  />
                </div>
              </button>

              {/* Channels */}
              {isExpanded && (
                <div className="border-t border-border">
                  {comChannels.length === 0 && (
                    <p className="px-4 py-3 text-xs text-muted-foreground">
                      No channels yet.{com.role === "admin" ? " Add one below." : ""}
                    </p>
                  )}
                  {comChannels.map((ch) => (
                    <button
                      key={ch.chatId}
                      onClick={() => onOpenChannel(ch.chatId, ch.name, ch.memberCount, [])}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 active:scale-[0.99] transition"
                    >
                      <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                        {ch.kind === "announcements"
                          ? <Megaphone className="w-4 h-4 text-primary" />
                          : ch.kind === "general"
                          ? <Users className="w-4 h-4 text-secondary" />
                          : <Hash className="w-4 h-4 text-accent" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{ch.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {ch.lastMessage ?? ch.description ?? `${ch.memberCount} members`}
                        </p>
                      </div>
                      {ch.unread > 0 && (
                        <span className="bg-primary text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
                          {ch.unread > 99 ? "99+" : ch.unread}
                        </span>
                      )}
                    </button>
                  ))}

                  {/* Add channel button (admin only) */}
                  {com.role === "admin" && (
                    <button
                      onClick={() => setShowAddChannel(com.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition border-t border-border/50"
                    >
                      <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center">
                        <Plus className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">Add channel</p>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* New community button at bottom */}
        {communities.length > 0 && (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full glass rounded-2xl p-5 text-center hover:bg-white/5 active:scale-[0.99] transition flex items-center justify-center gap-3"
          >
            <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center">
              <Plus className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="font-semibold text-sm">Start a new community</p>
          </button>
        )}
      </div>

      {/* Create community modal */}
      {showCreate && (
        <Modal title="New Community" onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name *</label>
              <input
                autoFocus
                className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary transition"
                placeholder="My Community"
                value={newCommunityName}
                onChange={(e) => setNewCommunityName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description</label>
              <input
                className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary transition"
                placeholder="What is this community about?"
                value={newCommunityDesc}
                onChange={(e) => setNewCommunityDesc(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Icon color</label>
              <div className="flex flex-wrap gap-2">
                {ICON_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewCommunityColor(c)}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition hover:scale-110"
                    style={{ background: c }}
                  >
                    {newCommunityColor === c && <Check className="w-4 h-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleCreateCommunity}
              disabled={creating || !newCommunityName.trim()}
              className="w-full py-2.5 rounded-xl bg-primary text-white font-semibold text-sm disabled:opacity-50 hover:opacity-90 active:scale-95 transition"
            >
              {creating ? "Creating…" : "Create Community"}
            </button>
          </div>
        </Modal>
      )}

      {/* Add channel modal */}
      {showAddChannel && (
        <Modal title="New Channel" onClose={() => setShowAddChannel(null)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Channel name *</label>
              <input
                autoFocus
                className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary transition"
                placeholder="general"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description</label>
              <input
                className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary transition"
                placeholder="What is this channel for?"
                value={newChannelDesc}
                onChange={(e) => setNewChannelDesc(e.target.value)}
              />
            </div>
            <button
              onClick={handleAddChannel}
              disabled={creating || !newChannelName.trim()}
              className="w-full py-2.5 rounded-xl bg-primary text-white font-semibold text-sm disabled:opacity-50 hover:opacity-90 active:scale-95 transition"
            >
              {creating ? "Creating…" : "Create Channel"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full md:w-[420px] glass rounded-t-2xl md:rounded-2xl p-5 pb-8 md:pb-5 space-y-4 border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
