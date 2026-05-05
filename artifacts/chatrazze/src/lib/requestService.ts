import { supabase } from "./supabase";
import { AppUser } from "./userService";

export type RequestStatus = "pending" | "accepted" | "rejected";

export interface ChatRequest {
  id: string;
  fromUid: string;
  toUid: string;
  status: RequestStatus;
  createdAt: string;
  fromUser?: AppUser;
}

function rowToRequest(row: Record<string, unknown>): ChatRequest {
  return {
    id: row.id as string,
    fromUid: row.from_uid as string,
    toUid: row.to_uid as string,
    status: row.status as RequestStatus,
    createdAt: row.created_at as string,
  };
}

/* Send a chat request from → to.
   Returns: 'sent' | 'already_pending' | 'already_connected' */
export async function sendChatRequest(
  fromUid: string,
  toUid: string,
): Promise<"sent" | "already_pending" | "already_connected"> {
  // Check existing request in either direction
  const { data: existing } = await supabase
    .from("chat_requests")
    .select("id, status")
    .or(
      `and(from_uid.eq.${fromUid},to_uid.eq.${toUid}),and(from_uid.eq.${toUid},to_uid.eq.${fromUid})`,
    )
    .limit(1);

  if (existing && existing.length > 0) {
    const req = existing[0] as { status: RequestStatus };
    if (req.status === "accepted") return "already_connected";
    if (req.status === "pending") return "already_pending";
  }

  const { error } = await supabase.from("chat_requests").insert({
    from_uid: fromUid,
    to_uid: toUid,
    status: "pending",
  });

  if (error) throw error;
  return "sent";
}

/* Accept or reject a request. On accept, also create the chat and return its id. */
export async function respondToChatRequest(
  requestId: string,
  status: "accepted" | "rejected",
): Promise<void> {
  const { error } = await supabase
    .from("chat_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", requestId);

  if (error) throw error;
}

/* Get all pending requests where the user is the recipient */
export async function getPendingRequests(toUid: string): Promise<ChatRequest[]> {
  const { data, error } = await supabase
    .from("chat_requests")
    .select("*, from_profile:profiles!chat_requests_from_uid_fkey(*)")
    .eq("to_uid", toUid)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    // Table may not exist yet
    if (error.code === "42P01") return [];
    throw error;
  }

  return (data ?? []).map((row) => {
    const req = rowToRequest(row as Record<string, unknown>);
    const fp = (row as Record<string, unknown>).from_profile as Record<string, unknown> | null;
    if (fp) {
      req.fromUser = {
        uid: fp.uid as string,
        email: (fp.email as string) ?? null,
        phone: (fp.phone as string) ?? null,
        displayName: (fp.display_name as string) ?? "User",
        photoURL: (fp.photo_url as string) ?? null,
        bio: (fp.bio as string) ?? null,
        online: (fp.online as boolean) ?? false,
        lastSeen: (fp.last_seen as string) ?? undefined,
      };
    }
    return req;
  });
}

/* Real-time listener for new pending requests targeting `toUid` */
export function listenToPendingRequests(
  toUid: string,
  cb: (requests: ChatRequest[]) => void,
): () => void {
  // Initial load — always safe
  getPendingRequests(toUid).then(cb).catch(() => cb([]));

  let channel: ReturnType<typeof supabase.channel> | null = null;
  try {
    channel = supabase
      .channel(`chat_requests:to:${toUid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_requests",
          filter: `to_uid=eq.${toUid}`,
        },
        () => {
          getPendingRequests(toUid).then(cb).catch(() => {});
        },
      )
      .subscribe((status, err) => {
        if (err) {
          // Realtime error — silently ignore, polling is not needed
          console.warn("[requestService] realtime subscribe error:", err);
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[requestService] realtime status:", status);
        }
      });
  } catch (err) {
    console.warn("[requestService] failed to set up realtime:", err);
  }

  return () => {
    if (channel) {
      supabase.removeChannel(channel).catch(() => {});
    }
  };
}

/* Check status of request between two users (in any direction) */
export async function getRequestBetween(
  uidA: string,
  uidB: string,
): Promise<ChatRequest | null> {
  const { data } = await supabase
    .from("chat_requests")
    .select("*")
    .or(
      `and(from_uid.eq.${uidA},to_uid.eq.${uidB}),and(from_uid.eq.${uidB},to_uid.eq.${uidA})`,
    )
    .limit(1);

  if (!data || data.length === 0) return null;
  return rowToRequest(data[0] as Record<string, unknown>);
}
