const SHELL_CACHE = "open-chat-shell-v2";
const SHELL_ASSETS = [
  "/", "/mobile.html",
  "/styles.css?v=20261016-1", "/mobile.css?v=20261012-9",
  "/offline-cache.js?v=20261017-1", "/app.js?v=20261017-3",
  "/dm.js?v=20261017-1", "/socket.io/socket.io.js",
  "/vendor/emoji-picker/index.js", "/vendor/emoji-picker/picker.js", "/vendor/emoji-picker/database.js",
  "/vendor/emoji-picker-data/en/emojibase/data.json"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL_ASSETS.map(url => cache.add(url).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("open-chat-shell-") && key !== SHELL_CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const navigation = request.mode === "navigate";
  const staticAsset = url.pathname === "/socket.io/socket.io.js" || /^\.(?:css|js|json|woff2?|svg)$/.test(url.pathname.slice(url.pathname.lastIndexOf(".")));
  if (!navigation && !staticAsset) return;
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(request, { signal: controller.signal });
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      return await cache.match(request) || (navigation ? await cache.match(url.pathname === "/" ? "/" : "/mobile.html") : Response.error());
    } finally {
      clearTimeout(timeout);
    }
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(event.notification.data?.url || "/");
  })());
});
