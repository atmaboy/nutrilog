const CACHE = "nutrilog-v2-vercel";
const SHELL = ["/", "/index.html", "/admin.html", "/manifest.json"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  if (e.request.url.includes("/api/")) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match("/index.html"))));
});
