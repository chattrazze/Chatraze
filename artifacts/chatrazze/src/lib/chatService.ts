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
  readBy: string[];
  reactions?: Record<string, string>;
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
    readBy: (row.read_by as string[]) ?? [],
    reactions: (row.reactions as Record<string, string>) ?? {},
  };
}

// ─── Chat Creation ─────────────────────────────────────────────────────────
// Uses a proper UUID for the chat ID so it satisfies Supabase uuid columns.
// Falls back to a text-based deterministic ID if the column is text type.

export async function createChat(userA: string, userB: string): Promise<string> {
  // 1. Look for an existing 1-on-1 chat between these two users
  const { data: existing, error: fetchErr } = await supabase
    .from("chats")
    .select("id, members")
    .contains("members", [userA, userB]);

  if (fetchErr) {
    console.error("[chatService] createChat fetch error:", fetchErr);
    throw fetchErr;
  }

  // Find a chat that has exactly 2 members (both of them)
  const directChat = (existing ?? []).find(
    (c) => Array.isArray(c.members) && c.members.length === 2,
  );
  if (directChat) return directChat.id as string;

  // 2. Create new chat with a proper UUID
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

  if (insertErr) {
    console.error("[chatService] createChat insert error:", insertErr);
    throw insertErr;
  }

  return id;
}

// ─── Listeners ─────────────────────────────────────────────────────────────

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
    const fresh = (data ?? []).map((r) => rowToMessage(r as Record<string, unknown>, chatId));
    // Merge: keep any temp_ messages from optimistic updates, add/update real ones
    const tempMsgs = cache.filter((x) => x.id.startsWith("temp_"));
    const freshIds = new Set(fresh.map((m) => m.id));
    const onlyTemps = tempMsgs.filter((t) => !fresh.some(
      (f) => f.senderId === t.senderId && f.type === t.type && f.text === t.text
    ));
    cache = [...fresh, ...onlyTemps].sort((a, b) =>
      (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
    );
    lastFetchAt = Date.now();
    void freshIds;
    cb(cache);
  };

  fetchAll();

  // Polling fallback — every 4 s in case Realtime is not enabled on the table
  const pollInterval = window.setInterval(() => {
    // Only poll if the last realtime event was > 8 s ago (realtime might be broken)
    if (Date.now() - lastFetchAt > 8000) fetchAll();
  }, 4000);

  const ch = supabase
    .channel(`messages:${chatId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` }, (payload) => {
      lastFetchAt = Date.now();
      const m = rowToMessage(payload.new as Record<string, unknown>, chatId);
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
      cache = cache.map((x) => (x.id === m.id ? m : x));
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
    if (error && error.code !== "PGRST116") {
      console.error("[chatService] listenToChat fetch error:", error);
    }
    cb(data ? rowToChat(data as Record<string, unknown>) : null);
  };
  fetch();
  const ch = supabase
    .channel(`chat:${chatId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "chats",
      filter: `id=eq.${chatId}`,
    }, () => fetch())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

// ─── Message Sending ───────────────────────────────────────────────────────

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
  },
): Promise<string> {
  const { data: msgData, error: msgErr } = await supabase.from("messages").insert({
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
  }).select("id").single();
  if (msgErr) {
    console.error("[chatService] sendMessage insert error:", msgErr);
    throw msgErr;
  }
  const newId = (msgData as { id: string }).id;

  const { data: chatData, error: chatFetchErr } = await supabase
    .from("chats")
    .select("members, unread")
    .eq("id", chatId)
    .single();

  if (chatFetchErr) {
    console.error("[chatService] sendMessage chat fetch error:", chatFetchErr);
  }

  const members: string[] = (chatData?.members as string[]) ?? [];
  const unread: Record<string, number> = { ...((chatData?.unread as Record<string, number>) ?? {}) };
  for (const m of members) {
    if (m !== senderId) unread[m] = (unread[m] ?? 0) + 1;
    else unread[m] = 0;
  }

  const previewText =
    payload.type === "text"          ? payload.text ?? ""
    : payload.type === "image"       ? "Photo"
    : payload.type === "video"       ? "Video"
    : payload.type === "audio"       ? "Voice message"
    : payload.type === "call_ended"  ? payload.text ?? "Call ended"
    : payload.type === "call_missed" ? payload.text ?? "Missed call"
    : payload.mediaName || "File";

  const { error: updateErr } = await supabase.from("chats").update({
    last_message: previewText,
    last_message_type: payload.type,
    last_message_by: senderId,
    last_message_at: new Date().toISOString(),
    unread,
  }).eq("id", chatId);

  if (updateErr) {
    console.error("[chatService] sendMessage chat update error:", updateErr);
  }

  return newId;
}

// ─── Group Chat Creation ────────────────────────────────────────────────────

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
  });

  if (error) {
    console.error("[chatService] createGroupChat error:", error);
    throw error;
  }

  return id;
}

// ─── Typing / Read / Reactions ─────────────────────────────────────────────

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

// ─── Query helpers ──────────────────────────────────────────────────────────

export async function getSharedMedia(
  chatId: string,
  type: MessageType | "all" = "all",
): Promise<MessageDoc[]> {
  let query = supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false });

  if (type !== "all") {
    query = query.eq("type", type);
  } else {
    query = query.in("type", ["image", "video", "file", "audio"]);
  }

  const { data, error } = await query.limit(200);
  if (error) console.error("[chatService] getSharedMedia error:", error);
  return (data ?? []).map((r) => rowToMessage(r as Record<string, unknown>, chatId));
}

export async function getChatStats(chatId: string): Promise<{
  messageCount: number;
  imageCount: number;
  videoCount: number;
  fileCount: number;
  audioCount: number;
}> {
  const { data, error } = await supabase
    .from("messages")
    .select("type")
    .eq("chat_id", chatId);

  if (error) console.error("[chatService] getChatStats error:", error);
  const rows = (data ?? []) as { type: string }[];
  return {
    messageCount: rows.filter((r) => r.type === "text").length,
    imageCount: rows.filter((r) => r.type === "image").length,
    videoCount: rows.filter((r) => r.type === "video").length,
    fileCount: rows.filter((r) => r.type === "file").length,
    audioCount: rows.filter((r) => r.type === "audio").length,
  };
}

export async function addMemberToGroup(chatId: string, newUid: string): Promise<void> {
  const { data, error } = await supabase
    .from("chats")
    .select("members")
    .eq("id", chatId)
    .single();
  if (error) throw error;

  const members: string[] = (data?.members as string[]) ?? [];
  if (members.includes(newUid)) return; // already a member
  const updated = [...members, newUid];

  const { error: upErr } = await supabase
    .from("chats")
    .update({ members: updated })
    .eq("id", chatId);
  if (upErr) throw upErr;
}

export async function leaveGroup(chatId: string, uid: string): Promise<void> {
  const { data, error } = await supabase
    .from("chats")
    .select("members, unread")
    .eq("id", chatId)
    .single();
  if (error) throw error;

  const members: string[] = ((data?.members as string[]) ?? []).filter(
    (m) => m !== uid,
  );
  const unread: Record<string, number> = { ...((data?.unread as Record<string, number>) ?? {}) };
  delete unread[uid];

  const { error: upErr } = await supabase
    .from("chats")
    .update({ members, unread })
    .eq("id", chatId);
  if (upErr) throw upErr;
}

// Block/unblock helpers — stored in localStorage (no extra DB column needed)
export function getBlockedUsers(myUid: string): Set<string> {
  try {
    const raw = localStorage.getItem(`chatrazze:blocked:${myUid}`);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function toggleBlock(myUid: string, targetUid: string): boolean {
  const blocked = getBlockedUsers(myUid);
  if (blocked.has(targetUid)) {
    blocked.delete(targetUid);
  } else {
    blocked.add(targetUid);
  }
  try {
    localStorage.setItem(
      `chatrazze:blocked:${myUid}`,
      JSON.stringify(Array.from(blocked)),
    );
  } catch {
    // ignore
  }
  return blocked.has(targetUid);
}

// ─── Media Upload (Supabase Storage) ──────────────────────────────────────

const STORAGE_BUCKET = "chat-media";
const MAX_FILE_SIZE  = 50 * 1024 * 1024; // 50 MB

export interface UploadedMedia {
  url: string;
  name: string;
  mime: string;
  size: number;
}

async function ensureStorageBucket() {
  try {
    await supabase.storage.createBucket(STORAGE_BUCKET, { public: true, fileSizeLimit: MAX_FILE_SIZE });
  } catch {
    // Bucket likely already exists — ignore
  }
}

async function compressImage(blob: Blob, maxDim = 1920, quality = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload  = () => { URL.revokeObjectURL(url); resolve(i); };
    i.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image decode failed")); };
    i.src = url;
  });
  const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
  const w = Math.round(img.width  * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => { if (b) resolve(b); else reject(new Error("Canvas toBlob failed")); },
      "image/jpeg",
      quality,
    );
  });
}

export async function uploadMedia(
  chatId: string,
  file: Blob,
  filename: string,
): Promise<UploadedMedia> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large. Max size is 50 MB (current: ${(file.size / 1024 / 1024).toFixed(1)} MB).`);
  }

  await ensureStorageBucket();

  let uploadBlob = file;
  if (file.type.startsWith("image/")) {
    uploadBlob = await compressImage(file, 1920, 0.85);
  }

  const ext      = filename.split(".").pop()?.toLowerCase() || "bin";
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
  const path     = `${chatId}/${Date.now()}_${safeName}`;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, uploadBlob, {
      cacheControl: "31536000",
      upsert: false,
      contentType: file.type || `application/${ext}`,
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}. Please enable Supabase Storage and create a public bucket named "chat-media".`);
  }

  const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);

  return {
    url:  urlData.publicUrl,
    name: filename,
    mime: file.type || "application/octet-stream",
    size: file.size,
  };
}
