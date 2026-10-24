const CACHE_NAME = "vegas-vault-v6";
const APP_SHELL = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "time.js",
  "merge.js",
  "settle.js",
  "affiliates.js",
  "resorts.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Only the app's own files. Cross-origin map tiles and marker images must be
  // loaded by the browser itself; fetching them from this worker is blocked and
  // would blank the pins.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })()
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "vault-sync") return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: "flush-sync" }));
    })
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "Vegas Vault", body: "Your daily Vegas update is here." };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Vegas Vault", {
      body: data.body || "",
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      data: { url: "./" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientsArr) => {
      const url = (event.notification.data && event.notification.data.url) || "./";
      const existing = clientsArr.find((client) => client.url.includes(url.replace("./", "")));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
