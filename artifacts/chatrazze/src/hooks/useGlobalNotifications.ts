import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import { useLang } from "@/hooks/useLang";
import {
  playNotificationSound,
  requestNotificationPermission,
  sendBrowserNotification,
} from "@/lib/notifications";

interface MissedSummary {
  totalUnread: number;
  byChat: { chatId: string; peerName: string; count: number }[];
}

interface Options {
  uid: string | null;
  enabled: boolean;
  /** Callback to switch the UI to the chats tab and open a chat. */
  onJumpToChat?: (chatId: string) => void;
  /** Callback to switch to the status tab. */
  onJumpToStatus?: () => void;
}

interface State {
  unviewedStatusCount: number;
}

/**
 * Cross-app notification engine. Should be mounted once at the top of the app.
 *
 * Features:
 *  - Requests notification permission on first interaction.
 *  - Plays a sound + shows a browser notification for any incoming chat
 *    message in any chat (not just the one currently open).
 *  - Plays a sound + browser notification when a contact posts a new status.
 *  - On app open / sign-in, fetches the user's pending unread totals and
 *    shows a "missed messages" summary toast (and a browser notification).
 *  - Tracks unviewed-status count for badging the Status tab.
 */
export function useGlobalNotifications({
  uid,
  enabled,
  onJumpToChat,
  onJumpToStatus,
}: Options): State {
  const toast = useToast();
  const { t } = useLang();
  const [unviewedStatusCount, setUnviewedStatusCount] = useState(0);
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);

  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const initialMessageScanDoneRef = useRef(false);
  const initialStatusScanDoneRef = useRef(false);
  const peerNameCacheRef = useRef<Map<string, string>>(new Map());
  const summaryShownRef = useRef(false);
  const onJumpToChatRef = useRef(onJumpToChat);
  const onJumpToStatusRef = useRef(onJumpToStatus);

  useEffect(() => {
    onJumpToChatRef.current = onJumpToChat;
  }, [onJumpToChat]);
  useEffect(() => {
    onJumpToStatusRef.current = onJumpToStatus;
  }, [onJumpToStatus]);

  useEffect(() => {
    if (!enabled || !uid) return;

    let cancelled = false;

    async function getPeerName(senderId: string): Promise<string> {
      const cached = peerNameCacheRef.current.get(senderId);
      if (cached) return cached;
      try {
        const { data } = await supabase
          .from("users")
          .select("display_name, email")
          .eq("uid", senderId)
          .maybeSingle();
        const name =
          (data?.display_name as string) ||
          (data?.email as string) ||
          "Someone";
        peerNameCacheRef.current.set(senderId, name);
        return name;
      } catch {
        return "Someone";
      }
    }

    async function showMissedSummary() {
      if (summaryShownRef.current || !uid) return;
      summaryShownRef.current = true;

      try {
        const { data: chats } = await supabase
          .from("chats")
          .select("id, members, unread, last_message_by")
          .contains("members", [uid]);

        if (cancelled) return;

        const items: MissedSummary["byChat"] = [];
        let total = 0;
        for (const c of chats ?? []) {
          const unread = (c.unread as Record<string, number> | null) ?? {};
          const count = unread[uid] ?? 0;
          if (count <= 0) continue;
          const members = (c.members as string[]) ?? [];
          const peerId = members.find((m) => m !== uid);
          if (!peerId) continue;
          const peerName = await getPeerName(peerId);
          items.push({ chatId: c.id as string, peerName, count });
          total += count;
        }

        if (total === 0 || cancelled) return;

        items.sort((a, b) => b.count - a.count);
        const summary: MissedSummary = { totalUnread: total, byChat: items };

        const top = summary.byChat.slice(0, 3);
        const namesPart = top.map((i) => `${i.peerName} (${i.count})`).join(", ");
        const more =
          summary.byChat.length > 3
            ? ` +${summary.byChat.length - 3}`
            : "";
        const body = `${namesPart}${more}`;
        const title =
          total === 1
            ? `1 ${tRef.current("unreadMessage")}`
            : `${total} ${tRef.current("unreadMessages")}`;

        toast.show(`${title}: ${body}`);
        sendBrowserNotification(title, body, {
          tag: "missed-summary",
          onClick: () => {
            if (top.length === 1) onJumpToChatRef.current?.(top[0].chatId);
          },
        });
      } catch (err) {
        console.warn("Missed summary failed:", err);
      }
    }

    // Ask for permission once the user is signed in.
    requestNotificationPermission().then(() => {
      // Show summary slightly after sign-in so React has settled.
      setTimeout(showMissedSummary, 800);
    });

    // ── Subscribe to ALL inserted messages ────────────────────────────
    // We can't filter by "chats I'm a member of" in postgres_changes, so we
    // fetch all and filter client-side. The check is cheap.

    const messagesChannel = supabase
      .channel(`global-messages:${uid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const m = payload.new as {
            id: string;
            chat_id: string;
            sender_id: string;
            type: string;
            text?: string;
            media_name?: string;
          };
          if (!m || m.sender_id === uid) return;

          // First pass after subscribing might re-deliver; skip duplicates.
          if (seenMessageIdsRef.current.has(m.id)) return;
          seenMessageIdsRef.current.add(m.id);

          // Skip very-recent messages on initial connect — they're loaded by
          // the chat list and would spam the user.
          if (!initialMessageScanDoneRef.current) return;

          // Verify this message is for one of my chats.
          const { data: chat } = await supabase
            .from("chats")
            .select("members")
            .eq("id", m.chat_id)
            .maybeSingle();
          if (!chat) return;
          const members = (chat.members as string[]) ?? [];
          if (!members.includes(uid)) return;

          const senderName = await getPeerName(m.sender_id);
          const tt = tRef.current;
          const preview =
            m.type === "text"
              ? m.text || tt("newMessage")
              : m.type === "image"
                ? tt("sentPhoto")
                : m.type === "video"
                  ? tt("sentVideo")
                  : m.type === "audio"
                    ? tt("sentVoice")
                    : m.type === "call_missed"
                      ? tt("missedCall")
                      : m.type === "call_ended"
                        ? tt("callEnded")
                        : m.media_name || tt("sentFile");

          // Only notify if the user isn't actively viewing that chat OR the tab
          // is hidden. We can't easily know the active chat here, so we simply
          // always play sound + show browser notif when document is hidden,
          // and ALWAYS play a soft sound otherwise (UI badges convey the rest).
          playNotificationSound();
          if (typeof document !== "undefined" && document.hidden) {
            sendBrowserNotification(senderName, preview, {
              tag: `chat-${m.chat_id}`,
              onClick: () => onJumpToChatRef.current?.(m.chat_id),
            });
          }
        },
      )
      .subscribe();

    // Mark initial scan complete shortly after subscribe so we ignore
    // backfill events.
    const initTimer = window.setTimeout(() => {
      initialMessageScanDoneRef.current = true;
    }, 1500);

    // ── Subscribe to NEW statuses ─────────────────────────────────────
    const statusChannel = supabase
      .channel(`global-status:${uid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_status" },
        async (payload) => {
          const s = payload.new as {
            id: string;
            user_id: string;
            user_name?: string;
          };
          if (!s || s.user_id === uid) return;
          if (!initialStatusScanDoneRef.current) return;

          setUnviewedStatusCount((n) => n + 1);
          playNotificationSound();
          const tt = tRef.current;
          if (typeof document !== "undefined" && document.hidden) {
            sendBrowserNotification(
              s.user_name || tt("newStatus"),
              tt("postedNewStatus"),
              {
                tag: `status-${s.user_id}`,
                onClick: () => onJumpToStatusRef.current?.(),
              },
            );
          }
        },
      )
      .subscribe();

    const statusInitTimer = window.setTimeout(() => {
      initialStatusScanDoneRef.current = true;
    }, 1500);

    // Initial fetch of unviewed status count.
    (async () => {
      try {
        const nowIso = new Date().toISOString();
        const { data: statuses } = await supabase
          .from("user_status")
          .select("id, user_id")
          .gt("expires_at", nowIso);
        if (cancelled) return;
        const others = (statuses ?? []).filter(
          (s) => (s.user_id as string) !== uid,
        );
        if (others.length === 0) {
          setUnviewedStatusCount(0);
          return;
        }
        const { data: views } = await supabase
          .from("status_views")
          .select("status_id")
          .eq("viewer_id", uid);
        if (cancelled) return;
        const viewedIds = new Set(
          (views ?? []).map((v) => v.status_id as string),
        );
        const unviewed = others.filter((s) => !viewedIds.has(s.id as string));
        setUnviewedStatusCount(unviewed.length);
      } catch {
        // Table likely missing — silently ignore so app still works.
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(initTimer);
      window.clearTimeout(statusInitTimer);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(statusChannel);
    };
  }, [uid, enabled, toast]);

  return { unviewedStatusCount };
}
