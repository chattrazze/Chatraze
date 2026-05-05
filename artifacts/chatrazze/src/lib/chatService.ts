import { supabase } from "./supabase";

export type MessageType = "text" | "image" | "video" | "audio" | "file" | "call_ended" | "call_missed";

export interface ChatDoc {
  id: string;
  members: string[];
  name?: string;
  type?: "direct" | "group";
  lastMessage?: string;
  lastMessageType?: MessageType;
  lastMessageAt?: string | null;
  lastMessageBy?: string;
  unread?: Record<string, number>;
  typing?: Record<string, number>;
  createdAt?: string | null;
}

export interface MessageDoc {
  id: string;
  chatId: string;
  senderId: string;
  type: MessageType;
  text?: string;
  mediaUrl?: string;
  mediaName?: string;
  mediaMime?: string;
  mediaSize?: number;
  duration?: number;
  createdAt?: string | null;
  expiresAt?: string | null;
  readBy: string[];
  reactions?: Record<string, string>;
  replyToId?: string;
  replyToText?: string;
  replyToSender?: string;
}

function rowToChat(row: Record<string, unknown>): ChatDoc {
  return {
    id: row.id as string,
    members: (row.members as string[]) ?? [],
    name: (row.name as string) ?? undefined,
    type: (row.type as "direct" | "group") ?? "direct",
    lastMessage: (row.last_message as string) ?? undefined,
    lastMessageType: (row.last_message_type as MessageType) ?? undefined,
    lastMessageAt: (row.last_message_at as string) ?? null,
    lastMessageBy: (row.last_message_by as string) ?? undefined,
    unread: (row.unread as Record<string, number>) ?? {},
    typing: (row.typing as Record<string, number>) ?? {},
    createdAt: (row.created_at as string) ?? null,
  };
}

function rowToMessage(row: Record<string, unknown>, chatId: string): MessageDoc {
  return {
    id: row.id as string,
    chatId,
    senderId: row.sender_id as string,
    type: row.type as MessageType,
    text: (row.text as string) ?? "",
    mediaUrl: (row.media_url as string) ?? "",
    mediaName: (row.media_name as string) ?? "",
    mediaMime: (row.media_mime as string) ?? "",
    mediaSize: (row.media_size as number) ?? 0,
    duration: (row.duration as number) ?? 0,
    createdAt: (row.created_at as string) ?? null,
    expiresAt: (row.expires_at as string) ?? null,
    readBy: (row.read_by as string[]) ?? [],
    reactions: (row.reactions as Record<string, string>) ?? {},
    replyToId: (row.reply_to_id as string) || undefined,
    replyToText: (row.reply_to_text as string) || undefined,
    replyToSender: (row.reply_to_sender as string) || undefined,
  };
}

function isExpired(m: MessageDoc): boolean {
  return !!m.expiresAt && new Date(m.expiresAt).getTime() <= Date.now();
}

export async function createChat(userA: string, userB: string): Promise<string> {
  const { data: existing, error: fetchErr } = await supabase
    .from("chats")
    .select("id, members")
    .contains("members", [userA, userB]);

  if (fetchErr) throw fetchErr;

  const directChat = (existing ?? []).find(
    (c) => Array.isArray(c.members) && c.members.length === 2,
  );
  if (directChat) return directChat.id as string;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const { error: insertErr } = await supabase.from("chats").insert({
    id,
    members: [userA, userB],
    unread: { [userA]: 0, [userB]: 0 },
    typing: {},
    created_at: now,
    last_message_at: now,
  });

  if (insertErr) throw insertErr;
  return id;
}

export async function createGroupChat(
  adminId: string,
  name: string,
  memberIds: string[],
): Promise<string> {
  const allMembers = Array.from(new Set([adminId, ...memberIds]));
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const unread: Record<string, number> = {};
  for (const m of allMembers) unread[m] = 0;

  const { error } = await supabase.from("chats").insert({
    id,
    members: allMembers,
    name,
    type: "group",
    unread,
    typing: {},
    created_at: now,
    last_message_at: now,
    created_by: adminId,
    invite_token: crypto.randomUUID(),
  });

  if (error) throw error;
  return id;
}

export function listenToUserChats(uid: string, cb: (chats: ChatDoc[]) => void) {
  const fetch = async () => {
    const { data, error } = await supabase
      .from("chats")
      .select("*")
      .contains("members", [uid])
      .order("last_message_at", { ascending: false });
    if (error) console.error("[chatService] listenToUserChats fetch error:", error);
    cb((data ?? []).map((r) => rowToChat(r as Record<string, unknown>)));
  };
  fetch();
  const ch = supabase
    .channel(`chats:${uid}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "chats" }, () => fetch())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

export function listenToMessages(chatId: string, cb: (messages: MessageDoc[]) => void) {
  let cache: MessageDoc[] = [];
  let lastFetchAt = 0;

  const fetchAll = async () => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });
    if (error) { console.error("[chatService] listenToMessages fetch error:", error); return; }
    const fresh = (data ?? [])
      .map((r) => rowToMessage(r as Record<string, unknown>, chatId))
      .filter((m) => !isExpired(m));
    const tempMsgs = cache.filter((x) => x.id.startsWith("temp_"));
    const onlyTemps = tempMsgs.filter((t) => !fresh.some(
      (f) => f.senderId === t.senderId && f.type === t.type && f.text === t.text
    ));
    cache = [...fresh, ...onlyTemps].sort((a, b) =>
      (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
    );
    lastFetchAt = Date.now();
    cb(cache);
  };

  fetchAll();

  const pollInterval = window.setInterval(() => {
    if (Date.now() - lastFetchAt > 8000) fetchAll();
  }, 4000);

  const expiryInterval = window.setInterval(() => {
    const before = cache.length;
    cache = cache.filter((m) => !isExpired(m));
    if (cache.length !== before) cb(cache);
  }, 10000);

  const ch = supabase
    .channel(`messages:${chatId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` }, (payload) => {
      lastFetchAt = Date.now();
      const m = rowToMessage(payload.new as Record<string, unknown>, chatId);
      if (isExpired(m)) return;
      if (cache.find((x) => x.id === m.id)) return;
      const tempIdx = cache.findIndex(
        (x) =>
          x.id.startsWith("temp_") &&
          x.senderId === m.senderId &&
          x.text === m.text &&
          x.type === m.type,
      );
      if (tempIdx !== -1) {
        cache = [...cache.slice(0, tempIdx), m, ...cache.slice(tempIdx + 1)];
      } else {
        cache = [...cache, m];
      }
      cb(cache);
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` }, (payload) => {
      lastFetchAt = Date.now();
      const m = rowToMessage(payload.new as Record<string, unknown>, chatId);
      if (isExpired(m)) {
        cache = cache.filter((x) => x.id !== m.id);
      } else {
        cache = cache.map((x) => (x.id === m.id ? m : x));
      }
      cb(cache);
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` }, (payload) => {
      lastFetchAt = Date.now();
      const old = payload.old as { id: string };
      cache = cache.filter((x) => x.id !== old.id);
      cb(cache);
    })
    .subscribe();

  return () => {
    window.clearInterval(pollInterval);
    window.clearInterval(expiryInterval);
    supabase.removeChannel(ch);
  };
}

export function listenToChat(chatId: string, cb: (c: ChatDoc | null) => void) {
  const fetch = async () => {
    const { data, error } = await supabase
      .from("chats")
      .select("*")
      .eq("id", chatId)
      .single();
    if (error && error.code !== "PGRST116") console.error("[chatService] listenToChat fetch error:", error);
    cb(data ? rowToChat(data as Record<string, unknown>) : null);
  };
  fetch();
  const ch = supabase
    .channel(`chat:${chatId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "chats", filter: `id=eq.${chatId}` }, () => fetch())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

export async function sendMessage(
  chatId: string,
  senderId: string,
  payload: {
    type: MessageType;
    text?: string;
    mediaUrl?: string;
    mediaName?: string;
    mediaMime?: string;
    mediaSize?: number;
    duration?: number;
    replyToId?: string;
    replyToText?: string;
    replyToSender?: string;
  },
): Promise<string> {
  const { data: chatData, error: chatFetchErr } = await supabase
    .from("chats")
    .select("members, unread, self_destruct_timer")
    .eq("id", chatId)
    .single();

  if (chatFetchErr) console.error("[chatService] sendMessage chat fetch error:", chatFetchErr);

  const timerSecs = (chatData?.self_destruct_timer as number) ?? 0;
  const expiresAt = timerSecs > 0
    ? new Date(Date.now() + timerSecs * 1000).toISOString()
    : null;

  const baseRow = {
    chat_id: chatId,
    sender_id: senderId,
    type: payload.type,
    text: payload.text ?? "",
    media_url: payload.mediaUrl ?? "",
    media_name: payload.mediaName ?? "",
    media_mime: payload.mediaMime ?? "",
    media_size: payload.mediaSize ?? 0,
    duration: payload.duration ?? 0,
    created_at: new Date().toISOString(),
    read_by: [senderId],
    reactions: {},
  };

  const fullRow = {
    ...baseRow,
    expires_at: expiresAt,
    reply_to_id: payload.replyToId ?? null,
    reply_to_text: payload.replyToText ?? null,
    reply_to_sender: payload.replyToSender ?? null,
  };

  // Try full row first; fall back progressively for unset columns
  let msgData: { id: string } | null = null;
  let msgErr: { message?: string } | null = null;

  ({ data: msgData, error: msgErr } = await supabase.from("messages")
    .insert(fullRow)
    .select("id").single());

  if (msgErr && msgErr.message?.includes("reply_to")) {
    ({ data: msgData, error: msgErr } = await supabase.from("messages")
      .insert({ ...baseRow, expires_at: expiresAt })
      .select("id").single());
  }

  if (msgErr && msgErr.message?.includes("expires_at")) {
    ({ data: msgData, error: msgErr } = await supabase.from("messages")
      .insert(baseRow)
      .select("id").single());
  }

  if (msgErr) throw msgErr;
  const newId = (msgData as { id: string }).id;

  const members: string[] = (chatData?.members as string[]) ?? [];
  const unread: Record<string, number> = { ...((chatData?.unread as Record<string, number>) ?? {}) };
  for (const m of members) {
    if (m !== senderId) unread[m] = (unread[m] ?? 0) + 1;
    else unread[m] = 0;
  }

  const previewText =
    payload.type === "text" ? payload.text ?? ""
    : payload.type === "image" ? "Photo"
    : payload.type === "video" ? "Video"
    : payload.type === "audio" ? "Voice message"
    : payload.type === "call_ended" ? payload.text ?? "Call ended"
    : payload.type === "call_missed" ? payload.text ?? "Missed call"
    : payload.mediaName || "File";

  const { error: updateErr } = await supabase.from("chats").update({
    last_message: previewText,
    last_message_type: payload.type,
    last_message_by: senderId,
    last_message_at: new Date().toISOString(),
    unread,
  }).eq("id", chatId);

  if (updateErr) console.error("[chatService] sendMessage chat update error:", updateErr);
  return newId;
}

export async function markChatRead(chatId: string, uid: string) {
  const { data: chatData } = await supabase
    .from("chats")
    .select("unread")
    .eq("id", chatId)
    .single();
  const unread: Record<string, number> = { ...((chatData?.unread as Record<string, number>) ?? {}) };
  unread[uid] = 0;
  await supabase.from("chats").update({ unread }).eq("id", chatId);

  const { data: msgs } = await supabase
    .from("messages")
    .select("id, read_by")
    .eq("chat_id", chatId)
    .neq("sender_id", uid);
  for (const msg of msgs ?? []) {
    const readBy: string[] = (msg.read_by as string[]) ?? [];
    if (!readBy.includes(uid)) {
      await supabase
        .from("messages")
        .update({ read_by: [...readBy, uid] })
        .eq("id", msg.id);
    }
  }
}

export async function toggleReaction(
  chatId: string,
  messageId: string,
  uid: string,
  emoji: string,
) {
  const { data } = await supabase
    .from("messages")
    .select("reactions")
    .eq("id", messageId)
    .single();
  if (!data) return;
  const reactions: Record<string, string> = { ...((data.reactions as Record<string, string>) ?? {}) };
  if (reactions[uid] === emoji) delete reactions[uid];
  else reactions[uid] = emoji;
  await supabase.from("messages").update({ reactions }).eq("id", messageId);
}

export async function setTyping(chatId: string, uid: string, typing: boolean) {
  const { data: chatData } = await supabase
    .from("chats")
    .select("typing")
    .eq("id", chatId)
    .single();
  const typingMap: Record<string, number> = { ...((chatData?.typing as Record<string, number>) ?? {}) };
  typingMap[uid] = typing ? Date.now() : 0;
  await supabase.from("chats").update({ typing: typingMap }).eq("id", chatId);
}

const MEDIA_BUCKET = "chatrazze-media";

export async function uploadMedia(
  source: File | Blob | string,
  userId: string,
  chatId: string,
): Promise<{ url: string; type: MessageType; name: string; mime: string; size: number }> {
  if (typeof source === "string") {
    return {
      url: source,
      type: "file",
      name: `media_${Date.now()}`,
      mime: "application/octet-stream",
      size: 0,
    };
  }

  const mime = source.type || "application/octet-stream";
  const size = source.size;
  const origName = "name" in source ? (source as File).name : `media_${Date.now()}`;
  const ext = origName.includes(".") ? origName.split(".").pop() : "bin";
  const storagePath = `${chatId}/${userId}_${Date.now()}.${ext}`;

  const type: MessageType =
    mime.startsWith("image/") ? "image" :
    mime.startsWith("video/") ? "video" :
    mime.startsWith("audio/") ? "audio" :
    "file";

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(storagePath, source, { contentType: mime, upsert: false });

  if (error) throw new Error(error.message);

  const { data: publicData } = supabase.storage
    .from(MEDIA_BUCKET)
    .getPublicUrl(storagePath);

  return { url: publicData.publicUrl, type, name: origName, mime, size };
}

export async function addMemberToGroup(chatId: string, memberId: string) {
  const { data: chatData } = await supabase
    .from("chats")
    .select("members, unread")
    .eq("id", chatId)
    .single();
  const members: string[] = Array.from(new Set([...(chatData?.members as string[] ?? []), memberId]));
  const unread: Record<string, number> = { ...((chatData?.unread as Record<string, number>) ?? {}) };
  unread[memberId] = unread[memberId] ?? 0;
  await supabase.from("chats").update({ members, unread }).eq("id", chatId);
}

export async function leaveGroup(chatId: string, uid: string) {
  const { data: chatData } = await supabase
    .from("chats")
    .select("members, unread")
    .eq("id", chatId)
    .single();
  const members: string[] = ((chatData?.members as string[]) ?? []).filter((m) => m !== uid);
  const unread: Record<string, number> = { ...((chatData?.unread as Record<string, number>) ?? {}) };
  delete unread[uid];
  await supabase.from("chats").update({ members, unread }).eq("id", chatId);
}

export function getBlockedUsers(uid: string): Set<string> {
  try {
    const raw = localStorage.getItem(`chatrazze:blocked:${uid}`);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function toggleBlock(uid: string, peerId: string): boolean {
  const blocked = getBlockedUsers(uid);
  if (blocked.has(peerId)) blocked.delete(peerId);
  else blocked.add(peerId);
  localStorage.setItem(`chatrazze:blocked:${uid}`, JSON.stringify([...blocked]));
  return blocked.has(peerId);
}

export async function getChatStats(chatId: string) {
  const { data } = await supabase
    .from("messages")
    .select("type")
    .eq("chat_id", chatId);
  const stats = { messageCount: 0, imageCount: 0, videoCount: 0, fileCount: 0, audioCount: 0 };
  for (const msg of data ?? []) {
    stats.messageCount += 1;
    const type = (msg.type as MessageType) ?? "text";
    if (type === "image") stats.imageCount += 1;
    if (type === "video") stats.videoCount += 1;
    if (type === "file") stats.fileCount += 1;
    if (type === "audio") stats.audioCount += 1;
  }
  return stats;
}

export async function getSharedMedia(chatId: string): Promise<MessageDoc[]> {
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false });
  return (data ?? [])
    .map((r) => rowToMessage(r as Record<string, unknown>, chatId))
    .filter((m) => ["image", "video", "file", "audio"].includes(m.type));
}

export async function getGroupInfo(chatId: string): Promise<{ name: string | null; avatarUrl: string | null; createdBy: string | null; description: string | null }> {
  const { data } = await supabase
    .from("chats")
    .select("name, avatar_url, created_by, description")
    .eq("id", chatId)
    .single();
  if (!data) return { name: null, avatarUrl: null, createdBy: null, description: null };
  return {
    name: (data.name as string) ?? null,
    avatarUrl: (data.avatar_url as string) ?? null,
    createdBy: (data.created_by as string) ?? null,
    description: (data.description as string) ?? null,
  };
}

export async function updateGroupInfo(
  chatId: string,
  _adminUid: string,
  updates: { name?: string; avatar_url?: string; description?: string },
): Promise<void> {
  const { error } = await supabase.rpc("update_group_settings", {
    p_chat_id:    chatId,
    p_name:       updates.name        ?? null,
    p_description: updates.description ?? null,
    p_avatar_url: updates.avatar_url  ?? null,
    p_self_destruct_timer: null,
    p_invite_token: null,
  });
  if (error) throw error;
}

export async function getMessages(chatId: string): Promise<MessageDoc[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const now = Date.now();
  return (data ?? [])
    .map((r) => rowToMessage(r as Record<string, unknown>, chatId))
    .filter((m) => !m.expiresAt || new Date(m.expiresAt).getTime() > now);
}

export async function clearGroupMessages(chatId: string, adminUid: string): Promise<void> {
  const { data: chatData } = await supabase
    .from("chats")
    .select("created_by")
    .eq("id", chatId)
    .single();
  const createdBy = (chatData as Record<string, unknown> | null)?.created_by as string | null;
  if (!createdBy || createdBy !== adminUid) {
    throw new Error("Only the group admin can clear all messages.");
  }
  const { error } = await supabase.from("messages").delete().eq("chat_id", chatId);
  if (error) throw error;
}

export async function getOrCreateInviteToken(chatId: string): Promise<string> {
  const { data, error: fetchErr } = await supabase
    .from("chats")
    .select("invite_token")
    .eq("id", chatId)
    .single();
  if (fetchErr) {
    console.error("[chatService] getOrCreateInviteToken fetch error:", fetchErr);
    throw fetchErr;
  }
  const existing = (data as Record<string, unknown> | null)?.invite_token as string | null;
  if (existing) return existing;
  const token = crypto.randomUUID();
  const { error: updateErr } = await supabase.rpc("update_group_settings", {
    p_chat_id:            chatId,
    p_name:               null,
    p_description:        null,
    p_avatar_url:         null,
    p_self_destruct_timer: null,
    p_invite_token:       token,
  });
  if (updateErr) {
    console.error("[chatService] getOrCreateInviteToken update error:", updateErr);
    throw updateErr;
  }
  return token;
}

export async function getGroupSelfDestruct(chatId: string): Promise<number> {
  const { data, error } = await supabase
    .from("chats")
    .select("self_destruct_timer")
    .eq("id", chatId)
    .single();
  if (error) {
    console.error("[chatService] getGroupSelfDestruct error:", error);
    return 0;
  }
  return (data as Record<string, unknown>)?.self_destruct_timer as number ?? 0;
}

export async function updateGroupSelfDestruct(chatId: string, _adminUid: string, secs: number): Promise<void> {
  const { error } = await supabase.rpc("update_group_settings", {
    p_chat_id:            chatId,
    p_name:               null,
    p_description:        null,
    p_avatar_url:         null,
    p_self_destruct_timer: secs,
    p_invite_token:       null,
  });
  if (error) throw error;
}

export async function getStarredChats(uid: string): Promise<ChatDoc[]> {
  const { data: members, error: membersErr } = await supabase
    .from("chat_members")
    .select("chat_id")
    .eq("user_id", uid)
    .eq("starred_chats", true);
  if (membersErr || !members?.length) return [];
  const ids = members.map((m) => (m as Record<string, unknown>).chat_id as string);
  const { data, error } = await supabase
    .from("chats")
    .select("*")
    .in("id", ids)
    .order("last_message_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map((r) => rowToChat(r as Record<string, unknown>));
}

export async function isStarredChat(chatId: string, uid: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("chat_members")
    .select("starred_chats")
    .eq("chat_id", chatId)
    .eq("user_id", uid)
    .maybeSingle();
  if (error) {
    console.error("[chatService] isStarredChat error:", error);
    return false;
  }
  return (data as Record<string, unknown> | null)?.starred_chats === true;
}

export async function toggleStarredChat(chatId: string, uid: string): Promise<boolean> {
  const current = await isStarredChat(chatId, uid);
  const next = !current;
  const { error } = await supabase.from("chat_members").upsert(
    { chat_id: chatId, user_id: uid, starred_chats: next },
    { onConflict: "chat_id,user_id" },
  );
  if (error) throw error;
  return next;
}

export async function joinGroupByInvite(chatId: string, userId: string): Promise<ChatDoc> {
  const { data, error } = await supabase
    .from("chats")
    .select("*")
    .eq("id", chatId)
    .eq("type", "group")
    .single();

  if (error || !data) throw new Error("Group not found");

  const chat = rowToChat(data as Record<string, unknown>);

  if (chat.members.includes(userId)) return chat;

  const newMembers = [...chat.members, userId];
  const newUnread  = { ...((data as Record<string, unknown>).unread as Record<string, number> ?? {}), [userId]: 0 };

  const { error: updateErr } = await supabase
    .from("chats")
    .update({ members: newMembers, unread: newUnread })
    .eq("id", chatId);

  if (updateErr) throw updateErr;

  return { ...chat, members: newMembers };
}

export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await supabase.from("messages").delete().eq("id", messageId);
  if (error) throw error;
}

export async function getGroupById(chatId: string): Promise<ChatDoc | null> {
  const { data, error } = await supabase
    .from("chats")
    .select("*")
    .eq("id", chatId)
    .single();
  if (error) return null;
  return rowToChat(data as Record<string, unknown>);
}
