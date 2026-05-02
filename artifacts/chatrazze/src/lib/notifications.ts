// Centralized notification helpers (browser notifications, sound, permission).
// Re-exports for backward compatibility with the older SettingsSheet helpers.

let audioContext: AudioContext | null = null;

export function playNotificationSound() {
  if (typeof window === "undefined") return;
  try {
    if (!audioContext) {
      const Ctx =
        (window.AudioContext as typeof AudioContext) ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return;
      audioContext = new Ctx();
    }
    const ctx = audioContext;
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(660, now + 0.15);
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc1.connect(gain1).connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);
  } catch {
    /* ignore */
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export function sendBrowserNotification(
  title: string,
  body: string,
  options: { tag?: string; icon?: string; onClick?: () => void } = {},
) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  try {
    const n = new Notification(title, {
      body,
      tag: options.tag,
      icon: options.icon ?? "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      silent: false,
    });
    if (options.onClick) {
      n.onclick = (ev) => {
        ev.preventDefault();
        try {
          window.focus();
        } catch {
          /* ignore */
        }
        options.onClick?.();
        n.close();
      };
    }
  } catch {
    // Service-worker based notifications fallback
    try {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready
          .then((reg) =>
            reg.showNotification(title, {
              body,
              tag: options.tag,
              icon: options.icon ?? "/icons/icon-192.png",
              badge: "/icons/icon-192.png",
            }),
          )
          .catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }
}
