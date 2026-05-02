import { supabase } from "./supabase";

// ─── أنواع البيانات ─────────────────────────────────────────────────────
export type StatusType = "text" | "image" | "video";

export interface UserStatus {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar?: string;
  type: StatusType;
  content?: string;
  media_url?: string;
  background_color: string;
  created_at: string;
  expires_at: string;
}

export interface StatusView {
  id: string;
  status_id: string;
  viewer_id: string;
  viewed_at: string;
}

export interface StatusInteraction {
  id: string;
  status_id: string;
  sender_id: string;
  recipient_id: string;
  chat_id?: string;
  kind: "reply" | "reaction";
  content: string;
  created_at: string;
}

// ─── تحميل الحالات النشطة ──────────────────────────────────────────────
export async function loadActiveStatuses(): Promise<UserStatus[]> {
  const { data, error } = await supabase
    .from("user_status")
    .select("*")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading statuses:", error);
    return [];
  }

  return data || [];
}

// ─── إضافة أو تحديث حالة ────────────────────────────────────────────────
export async function upsertStatus(status: {
  user_id: string;
  user_name: string;
  user_avatar?: string;
  type: StatusType;
  content?: string;
  media_url?: string;
  background_color?: string;
}): Promise<UserStatus | null> {
  // حذف الحالة القديمة أولاً
  await supabase
    .from("user_status")
    .delete()
    .eq("user_id", status.user_id);

  // إضافة الحالة الجديدة
  const { data, error } = await supabase
    .from("user_status")
    .insert({
      user_id: status.user_id,
      user_name: status.user_name,
      user_avatar: status.user_avatar,
      type: status.type,
      content: status.content || null,
      media_url: status.media_url || null,
      background_color: status.background_color || "#1a1a2e",
    })
    .select()
    .single();

  if (error) {
    console.error("Error upserting status:", error);
    return null;
  }

  return data;
}

// ─── حذف حالة ───────────────────────────────────────────────────────────
export async function deleteStatus(userId: string): Promise<boolean> {
  const { error } = await supabase
    .from("user_status")
    .delete()
    .eq("user_id", userId);

  return !error;
}

// ─── تسجيل مشاهدة حالة ──────────────────────────────────────────────────
export async function viewStatus(statusId: string, viewerId: string): Promise<void> {
  await supabase
    .from("status_views")
    .upsert(
      {
        status_id: statusId,
        viewer_id: viewerId,
      },
      { onConflict: "status_id,viewer_id" }
    );
}

// ─── تحميل مشاهدات حالة ─────────────────────────────────────────────────
export async function loadStatusViews(statusId: string): Promise<StatusView[]> {
  const { data } = await supabase
    .from("status_views")
    .select("*")
    .eq("status_id", statusId)
    .order("viewed_at", { ascending: false });

  return data || [];
}

// ─── تحميل الحالات التي شاهدتها ─────────────────────────────────────────
export async function loadMyViews(viewerId: string): Promise<string[]> {
  const { data } = await supabase
    .from("status_views")
    .select("status_id")
    .eq("viewer_id", viewerId);

  return data ? data.map(v => v.status_id) : [];
}

export async function addStatusInteraction(input: {
  statusId: string;
  senderId: string;
  recipientId: string;
  chatId?: string;
  kind: "reply" | "reaction";
  content: string;
}): Promise<void> {
  const { error } = await supabase.from("status_interactions").insert({
    status_id: input.statusId,
    sender_id: input.senderId,
    recipient_id: input.recipientId,
    chat_id: input.chatId ?? null,
    kind: input.kind,
    content: input.content,
  });

  if (error) throw error;
}

export async function loadStatusInteractions(statusId: string): Promise<StatusInteraction[]> {
  const { data } = await supabase
    .from("status_interactions")
    .select("*")
    .eq("status_id", statusId)
    .order("created_at", { ascending: false });

  return (data ?? []) as StatusInteraction[];
}

// ─── الاشتراك في تغييرات الحالات (Realtime) ─────────────────────────────
export function subscribeToStatusChanges(
  onInsert: (status: UserStatus) => void,
  onDelete: (statusId: string) => void
) {
  const channel = supabase
    .channel("status-changes")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "user_status",
      },
      (payload) => onInsert(payload.new as UserStatus)
    )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "user_status",
      },
      (payload) => onDelete(payload.old.id)
    )
    .subscribe();

  return () => {
    channel.unsubscribe();
  };
}
