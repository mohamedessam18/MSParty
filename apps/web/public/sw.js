/* MSParty service worker — push delivery only. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("push", event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "MSParty";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon.png",
    badge: "/icon.png",
    // Same tag replaces an earlier notice of the same kind instead of stacking
    // three "your friend went live" banners on top of each other.
    tag: payload.tag || "msparty",
    renotify: !!payload.tag,
    data: { url: payload.url || "/dashboard" },
    dir: "rtl",
    lang: "ar"
  };

  event.waitUntil(
    (async () => {
      // If a tab is already open and focused, the in-app bell has this covered.
      // Showing a system banner as well would say everything twice.
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const visible = clients.some(client => client.visibilityState === "visible");
      if (visible) return;
      await self.registration.showNotification(title, options);
    })()
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Reuse a tab that is already on the site rather than opening a third one.
      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});
