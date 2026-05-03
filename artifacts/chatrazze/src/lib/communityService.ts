import { supabase } from "./supabase";

export interface Community {
  id: string;
  name: string;
  description: string;
  iconColor: string;
  createdBy: string | null;
  createdAt: string;
  role: "admin" | "member";
  memberCount: number;
}

export interface CommunityChannel {
  chatId: string;
  communityId: string;
  name: string;
  description: string;
  kind: "announcements" | "general" | "group";
  unread: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
  memberCount: number;
}

function rowToCommunity(row: Record<string, unknown>, role: "admin" | "member", memberCount = 0): Community {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? "",
    iconColor: (row.icon_color as string) ?? "#25D366",
    createdBy: (row.created_by as string) ?? null,
    createdAt: row.created_at as string,
    role,
    memberCount,
  };
}

export async function getMyCommunities(uid: string): Promise<Community[]> {
  const { data: memberships, error: memErr } = await supabase
    .from("community_members")
    .select("community_id, role")
    .eq("user_id", uid);

  if (memErr || !memberships || memberships.length === 0) return [];

  const communityIds = memberships.map((m) => (m as Record<string, unknown>).community_id as string);

  const { data: communities, error: comErr } = await supabase
    .from("communities")
    .select("*")
    .in("id", communityIds)
    .order("created_at", { ascending: true });

  if (comErr || !communities) return [];

  const membershipMap: Record<string, "admin" | "member"> = {};
  for (const m of memberships) {
    const row = m as Record<string, unknown>;
    membershipMap[row.community_id as string] = row.role as "admin" | "member";
  }

  const { data: counts } = await supabase
    .from("community_members")
    .select("community_id")
    .in("community_id", communityIds);

  const countMap: Record<string, number> = {};
  for (const c of counts ?? []) {
    const row = c as Record<string, unknown>;
    const cid = row.community_id as string;
    countMap[cid] = (countMap[cid] ?? 0) + 1;
  }

  return communities.map((c) => {
    const row = c as Record<string, unknown>;
    return rowToCommunity(row, membershipMap[row.id as string] ?? "member", countMap[row.id as string] ?? 0);
  });
}

export async function createCommunity(
  uid: string,
  name: string,
  description: string,
  iconColor: string,
): Promise<Community> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: comErr } = await supabase.from("communities").insert({
    id,
    name,
    description,
    icon_color: iconColor,
    created_by: uid,
    created_at: now,
  });

  if (comErr) throw comErr;

  const { error: memErr } = await supabase.from("community_members").insert({
    community_id: id,
    user_id: uid,
    role: "admin",
    joined_at: now,
  });

  if (memErr) throw memErr;

  return { id, name, description, iconColor, createdBy: uid, createdAt: now, role: "admin", memberCount: 1 };
}

export async function deleteCommunity(communityId: string): Promise<void> {
  const { error } = await supabase.from("communities").delete().eq("id", communityId);
  if (error) throw error;
}

export async function getCommunityChannels(communityId: string, uid: string): Promise<CommunityChannel[]> {
  const { data: chats, error } = await supabase
    .from("chats")
    .select("*")
    .eq("community_id", communityId)
    .order("created_at", { ascending: true });

  if (error || !chats) return [];

  return chats.map((c) => {
    const row = c as Record<string, unknown>;
    const members = (row.members as string[]) ?? [];
    const unreadMap = (row.unread as Record<string, number>) ?? {};
    const name = (row.name as string) ?? "Channel";
    const desc = (row.description as string) ?? "";
    let kind: CommunityChannel["kind"] = "group";
    if (name.toLowerCase().includes("announcement")) kind = "announcements";
    else if (name.toLowerCase().includes("general")) kind = "general";
    return {
      chatId: row.id as string,
      communityId,
      name,
      description: desc,
      kind,
      unread: unreadMap[uid] ?? 0,
      lastMessage: (row.last_message as string) ?? null,
      lastMessageAt: (row.last_message_at as string) ?? null,
      memberCount: members.length,
    };
  });
}

export async function createChannel(
  communityId: string,
  adminId: string,
  name: string,
  description: string,
  communityMemberIds: string[],
): Promise<string> {
  const allMembers = Array.from(new Set([adminId, ...communityMemberIds]));
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const unread: Record<string, number> = {};
  for (const m of allMembers) unread[m] = 0;

  const { error } = await supabase.from("chats").insert({
    id,
    name,
    description,
    type: "group",
    community_id: communityId,
    members: allMembers,
    created_by: adminId,
    unread,
    typing: {},
    created_at: now,
    last_message_at: now,
  });

  if (error) throw error;
  return id;
}

export async function joinCommunity(communityId: string, uid: string): Promise<void> {
  const { error } = await supabase.from("community_members").insert({
    community_id: communityId,
    user_id: uid,
    role: "member",
    joined_at: new Date().toISOString(),
  });
  if (error && !error.message.includes("duplicate")) throw error;
}

export async function leaveCommunity(communityId: string, uid: string): Promise<void> {
  const { error } = await supabase
    .from("community_members")
    .delete()
    .eq("community_id", communityId)
    .eq("user_id", uid);
  if (error) throw error;
}

export async function getCommunityMemberIds(communityId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("community_members")
    .select("user_id")
    .eq("community_id", communityId);
  if (error) return [];
  return (data ?? []).map((r) => (r as Record<string, unknown>).user_id as string);
}

export function listenToCommunities(uid: string, cb: () => void): () => void {
  const ch = supabase
    .channel(`communities:${uid}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "communities" }, cb)
    .on("postgres_changes", { event: "*", schema: "public", table: "community_members" }, cb)
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}
