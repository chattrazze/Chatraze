const CACHE_NAME = "chatrazze-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));

self.addEventListener("push", (e) => {
  const data = e.data?.json?.() ?? {};
  e.waitUntil(
    self.registration.showNotification(data.title ?? "Chatrazze", {
      body: data.body ?? "New message",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag ?? "chatrazze-msg",
      renotify: true,
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      const focused = cs.find((c) => c.url.includes(self.location.origin));
      if (focused) return focused.focus();
      return clients.openWindow("/");
    })
  );
});

// Minimal network-first fetch strategy for HTML, cache-first for assets
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/" || url.pathname.endsWith(".html")) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  }
});
