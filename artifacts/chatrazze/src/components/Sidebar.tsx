import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { listenToUserChats, ChatDoc, createChat, createGroupChat } from "@/lib/chatService";
import { AppUser, getUser, searchUsers } from "@/lib/userService";
import Avatar from "@/components/Avatar";
import { useLang, LANG_LIST } from "@/hooks/useLang";
import { useToast } from "@/components/Toast";
import {
  Check,
  Globe,
  Hand,
  ImageIcon,
  MessageSquarePlus,
  Mic,
  Search,
  Star,
  Users,
  Video,
  X,
} from "lucide-react";

type Filter = "all" | "unread" | "favorites" | "groups";

interface Props {
  selectedChatId: string | null;
  onSelectChat: (chatId: string, peer: AppUser) => void;
  onUnreadChange?: (total: number) => void;
}

export default function Sidebar({
  selectedChatId,
  onSelectChat,
  onUnreadChange,
}: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const [chats, setChats] = useState<ChatDoc[]>([]);
  const [peers, setPeers] = useState<Record<string, AppUser>>({});
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const { lang, setLang, t } = useLang();
  const [showLang, setShowLang] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("chatrazze:favorites");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    if (!user) return;
    const unsub = listenToUserChats(user.uid, setChats);
    return () => { unsub(); };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const missing = chats
      .filter((c) => c.type !== "group" && c.members.length <= 2)
      .map((c) => c.members.find((m) => m !== user.uid))
      .filter((m): m is string => !!m && !peers[m]);
    if (missing.length === 0) return;
    Promise.all(missing.map((m) => getUser(m))).then((results) => {
      setPeers((prev) => {
        const next = { ...prev };
        for (const u of results) if (u) next[u.uid] = u;
        return next;
      });
    });
  }, [chats, peers, user]);

  // Immediately zero out unread for selected chat — fixes badge not clearing bug
  useEffect(() => {
    if (!selectedChatId || !user) return;
    setChats((prev) =>
      prev.map((c) =>
        c.id === selectedChatId
          ? { ...c, unread: { ...(c.unread ?? {}), [user.uid]: 0 } }
          : c,
      ),
    );
  }, [selectedChatId, user]);

  useEffect(() => {
    if (!user || !onUnreadChange) return;
    const total = chats.reduce(
      (acc, c) => acc + (c.unread?.[user.uid] ?? 0),
      0,
    );
    onUnreadChange(total);
  }, [chats, user, onUnreadChange]);

  const filtered = useMemo(() => {
    if (!user) return [];
    return chats.filter((c) => {
      const isGroup = c.type === "group" || c.members.length > 2;
      const peerId = !isGroup ? c.members.find((m) => m !== user.uid) : undefined;
      const peer = peerId ? peers[peerId] : undefined;
      const unread = c.unread?.[user.uid] ?? 0;
      const isFav = peerId ? favorites.has(peerId) : false;

      if (filter === "unread" && unread === 0) return false;
      if (filter === "favorites" && !isFav) return false;
      if (filter === "groups" && !isGroup) return false;

      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const name = isGroup ? (c.name || "").toLowerCase() : (peer?.displayName || "").toLowerCase();
        const last = (c.lastMessage || "").toLowerCase();
        if (!name.includes(q) && !last.includes(q)) return false;
      }
      return true;
    });
  }, [chats, peers, user, search, filter, favorites]);

  function toggleFavorite(uid: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      try {
        localStorage.setItem(
          "chatrazze:favorites",
          JSON.stringify(Array.from(next)),
        );
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }

  function buildGroupPeer(c: ChatDoc): AppUser {
    return {
      uid: `group_${c.id}`,
      displayName: c.name || "Group",
      email: null,
      phone: null,
      photoURL: null,
      online: false,
      isGroup: true,
      memberCount: c.members.length,
      members: c.members,
    };
  }

  if (!user) return null;

  return (
    <aside className="w-full md:w-[360px] flex flex-col glass border-r border-border h-full">
      <header className="px-5 pt-6 pb-3 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold tracking-tight">{t("chats")}</h1>
          <div className="flex items-center gap-2">
            {/* Language picker */}
            <div className="relative">
              <button
                onClick={() => setShowLang((v) => !v)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-foreground flex items-center justify-center transition active:scale-95"
                title="Language"
              >
                <Globe className="w-5 h-5" />
              </button>
              {showLang && (
                <div className="absolute right-0 top-11 z-50 bg-popover border border-border rounded-2xl shadow-2xl p-3 w-52 grid grid-cols-2 gap-1.5">
                  {LANG_LIST.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => { setLang(l.code); setShowLang(false); }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition ${
                        lang === l.code
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "hover:bg-white/10"
                      }`}
                    >
                      <span className="text-[11px] font-mono font-bold opacity-60">{l.iso}</span>
                      <span>{l.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* New Chat/Group button */}
            <div className="relative">
              <button
                onClick={() => setShowNewMenu((v) => !v)}
                className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF7A1A] to-[#FF4E00] text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition"
                title="New chat or group"
              >
                <MessageSquarePlus className="w-5 h-5" />
              </button>

              {showNewMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNewMenu(false)} />
                  <div className="absolute right-0 top-12 z-50 bg-popover border border-border rounded-2xl shadow-2xl p-2 min-w-[180px] flex flex-col gap-1">
                    <button
                      onClick={() => { setShowNewMenu(false); setShowNewChat(true); }}
                      className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm hover:bg-white/5 transition text-left"
                    >
                      <MessageSquarePlus className="w-4 h-4 text-primary shrink-0" />
                      {t("newChat")}
                    </button>
                    <button
                      onClick={() => { setShowNewMenu(false); setShowNewGroup(true); }}
                      className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm hover:bg-white/5 transition text-left"
                    >
                      <Users className="w-4 h-4 text-accent shrink-0" />
                      {t("newGroup")}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-input border border-border rounded-2xl px-3 py-2 focus-within:ring-2 focus-within:ring-primary/40 transition">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchChatsMessages")}
            className="bg-transparent outline-none flex-1 text-sm placeholder:text-muted-foreground"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-3 overflow-x-auto scrollbar-thin">
          {(["all", "unread", "favorites", "groups"] as Filter[]).map((f) => {
            const label =
              f === "all"       ? t("filterAll")
              : f === "unread"  ? t("filterUnread")
              : f === "favorites" ? t("filterFavorites")
              : t("filterGroups");
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition ${
                  filter === f
                    ? "bg-primary text-primary-foreground shadow"
                    : "bg-white/5 text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {filtered.length === 0 && (
          <div className="p-8 text-sm text-muted-foreground text-center">
            {search || filter !== "all"
              ? t("noChatsFilter")
              : t("noChatsYet")}
          </div>
        )}
        {filtered.map((c) => {
          const isGroup = c.type === "group" || c.members.length > 2;
          const peerId = !isGroup ? c.members.find((m) => m !== user.uid) : undefined;
          const peer = peerId ? peers[peerId] : undefined;
          const displayName = isGroup ? (c.name || t("group")) : (peer?.displayName || t("loadingDots"));
          const photoURL = isGroup ? null : (peer?.photoURL ?? null);
          const isOnline = !isGroup && !!peer?.online;
          const unread = c.unread?.[user.uid] ?? 0;
          const active = c.id === selectedChatId;
          const lastTime = c.lastMessageAt ? new Date(c.lastMessageAt) : undefined;
          const isFav = peerId ? favorites.has(peerId) : false;

          function handleSelect() {
            if (isGroup) {
              onSelectChat(c.id, buildGroupPeer(c));
            } else if (peer) {
              onSelectChat(c.id, peer);
            }
          }

          return (
            <div
              key={c.id}
              className={`group relative w-full flex items-stretch border-l-2 border-b border-b-white/10 transition ${
                active
                  ? "bg-white/5 border-l-primary"
                  : "border-l-transparent hover:bg-white/5"
              }`}
            >
              <button
                onClick={handleSelect}
                className="flex-1 text-left px-4 py-3 flex items-center gap-3 min-w-0"
              >
                <div className="relative shrink-0">
                  <Avatar name={displayName} photoURL={photoURL} size={48} />
                  {isOnline && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-secondary border-2 border-background" />
                  )}
                  {isGroup && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-4.5 h-4.5 rounded-full bg-accent border-2 border-background flex items-center justify-center">
                      <Users className="w-2.5 h-2.5 text-white" />
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-[15px] truncate">
                      {displayName}
                    </p>
                    <span
                      className={`text-[11px] shrink-0 ${
                        unread > 0 ? "text-secondary" : "text-muted-foreground"
                      }`}
                    >
                      {lastTime ? formatTime(lastTime) : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      {iconForType(c.lastMessageType)}
                      {c.lastMessage ? (
                        <span className="truncate">{c.lastMessage}</span>
                      ) : isGroup ? (
                        <span className="truncate">{c.members.length} {t("members")}</span>
                      ) : (
                        <span className="truncate inline-flex items-center gap-1">
                          {t("sayHi")}
                          <Hand className="w-3 h-3 inline-block" />
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isFav && (
                        <Star
                          className="w-3 h-3 text-amber-400 fill-amber-400"
                          aria-label="Favorite"
                        />
                      )}
                      {unread > 0 && (
                        <span className="bg-secondary text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
              {peerId && !isGroup && (
                <button
                  onClick={() => toggleFavorite(peerId)}
                  className="opacity-0 group-hover:opacity-100 transition px-2"
                  title={isFav ? t("removeFavorite") : t("markFavorite")}
                >
                  {isFav ? (
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  ) : (
                    <Star className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {showNewChat && (
        <NewChatDialog
          currentUid={user.uid}
          onClose={() => setShowNewChat(false)}
          onPicked={async (u) => {
            try {
              const id = await createChat(user.uid, u.uid);
              setPeers((p) => ({ ...p, [u.uid]: u }));
              onSelectChat(id, u);
              setShowNewChat(false);
            } catch (err) {
              const msg = (err as { message?: string })?.message ?? "Unknown error";
              console.error("[Sidebar] createChat failed:", err);
              toast.show(`Chat creation failed: ${msg}`);
            }
          }}
        />
      )}

      {showNewGroup && (
        <NewGroupDialog
          currentUid={user.uid}
          onClose={() => setShowNewGroup(false)}
          onCreated={(chatId, groupPeer) => {
            onSelectChat(chatId, groupPeer);
            setShowNewGroup(false);
          }}
        />
      )}
    </aside>
  );
}

function iconForType(t?: string) {
  if (t === "image") return <ImageIcon className="w-3 h-3" />;
  if (t === "video") return <Video className="w-3 h-3" />;
  if (t === "audio") return <Mic className="w-3 h-3" />;
  return null;
}

function formatTime(d: Date) {
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function useDebounced<T>(value: T, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/* ─── NewChatDialog ──────────────────────────────────────────────────────── */
function NewChatDialog({
  currentUid,
  onClose,
  onPicked,
}: {
  currentUid: string;
  onClose: () => void;
  onPicked: (u: AppUser) => void;
}) {
  const { t } = useLang();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);

  const debounced = useDebounced(q, 250);

  useEffect(() => {
    let cancelled = false;
    if (!debounced.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    searchUsers(debounced)
      .then((r) => {
        if (cancelled) return;
        setResults(r.filter((u) => u.uid !== currentUid));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced, currentUid]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold">{t("newChat")}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2 bg-input border border-border rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchByNameOrId")}
              className="bg-transparent outline-none flex-1 text-sm"
            />
          </div>
          <div className="mt-4 max-h-[320px] overflow-y-auto scrollbar-thin">
            {loading && <p className="text-sm text-muted-foreground p-3">{t("searching")}</p>}
            {!loading && q && results.length === 0 && (
              <p className="text-sm text-muted-foreground p-3">{t("noUsersFound")}</p>
            )}
            {results.map((u) => (
              <button
                key={u.uid}
                onClick={() => onPicked(u)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition text-left"
              >
                <Avatar name={u.displayName} photoURL={u.photoURL} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{u.displayName}</p>
                  <p className="text-xs text-muted-foreground truncate font-mono">
                    {u.uid.slice(0, 16)}…
                  </p>
                </div>
                {u.online && <span className="w-2 h-2 rounded-full bg-secondary shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── NewGroupDialog ─────────────────────────────────────────────────────── */
function NewGroupDialog({
  currentUid,
  onClose,
  onCreated,
}: {
  currentUid: string;
  onClose: () => void;
  onCreated: (chatId: string, groupPeer: AppUser) => void;
}) {
  const toast = useToast();
  const { t } = useLang();
  const [step, setStep] = useState<"name" | "members">("name");
  const [groupName, setGroupName] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AppUser[]>([]);
  const [selected, setSelected] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const debounced = useDebounced(q, 250);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!debounced.trim()) { setResults([]); return; }
    setLoading(true);
    searchUsers(debounced)
      .then((r) => {
        if (cancelled) return;
        setResults(r.filter((u) => u.uid !== currentUid));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [debounced, currentUid]);

  function toggleSelect(u: AppUser) {
    setSelected((prev) =>
      prev.find((x) => x.uid === u.uid)
        ? prev.filter((x) => x.uid !== u.uid)
        : [...prev, u],
    );
  }

  async function handleCreate() {
    if (!groupName.trim() || selected.length === 0) return;
    setCreating(true);
    try {
      const chatId = await createGroupChat(
        currentUid,
        groupName.trim(),
        selected.map((u) => u.uid),
      );
      const groupPeer: AppUser = {
        uid: `group_${chatId}`,
        displayName: groupName.trim(),
        email: null,
        phone: null,
        photoURL: null,
        online: false,
        isGroup: true,
        memberCount: selected.length + 1,
        members: [currentUid, ...selected.map((u) => u.uid)],
      };
      onCreated(chatId, groupPeer);
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      console.error("[NewGroupDialog] createGroupChat failed:", err);
      toast.show(`Group creation failed: ${msg}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-accent" />
            <h3 className="font-semibold">{t("newGroup")}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Group name */}
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1.5 block">{t("groupNameLabel")}</label>
            <input
              ref={inputRef}
              autoFocus
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={t("enterGroupName")}
              maxLength={60}
              className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Member search */}
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
              {t("addMembersLabel")}{selected.length > 0 && ` (${selected.length})`}
            </label>
            <div className="flex items-center gap-2 bg-input border border-border rounded-xl px-3 py-2">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("searchUsersPlaceholder")}
                className="bg-transparent outline-none flex-1 text-sm"
              />
            </div>
          </div>

          {/* Selected chips */}
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selected.map((u) => (
                <button
                  key={u.uid}
                  onClick={() => toggleSelect(u)}
                  className="flex items-center gap-1.5 bg-primary/20 text-primary border border-primary/30 rounded-full px-3 py-1 text-xs hover:bg-primary/30 transition"
                >
                  {u.displayName}
                  <X className="w-3 h-3" />
                </button>
              ))}
            </div>
          )}

          {/* Results */}
          <div className="max-h-[220px] overflow-y-auto scrollbar-thin -mx-1 px-1">
            {loading && <p className="text-sm text-muted-foreground p-3">{t("searching")}</p>}
            {!loading && q && results.length === 0 && (
              <p className="text-sm text-muted-foreground p-3">{t("noUsersFound")}</p>
            )}
            {results.map((u) => {
              const isSelected = !!selected.find((x) => x.uid === u.uid);
              return (
                <button
                  key={u.uid}
                  onClick={() => toggleSelect(u)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition text-left"
                >
                  <Avatar name={u.displayName} photoURL={u.photoURL} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{u.displayName}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Create button */}
          <button
            onClick={handleCreate}
            disabled={!groupName.trim() || selected.length === 0 || creating}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#FF7A1A] to-[#FF4E00] text-white font-semibold text-sm shadow disabled:opacity-40 hover:opacity-90 active:scale-[0.98] transition"
          >
            {creating ? t("creating") : `${t("createGroupBtn")} (${selected.length + 1} ${t("membersCount")})`}
          </button>
        </div>
      </div>
    </div>
  );
}

