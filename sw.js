/* Manawa Honey — service worker. Caches the app shell so it loads with no connection. */
const CACHE = "manawa-v6";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js",
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap"
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Cache each item individually so one failure doesn't abort the whole install.
    await Promise.allSettled(SHELL.map(u => c.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;                         // never cache writes
  const url = req.url;

  // Supabase data calls: always go to the network (the app's own queue handles offline writes).
  if (url.includes(".supabase.co")) return;

  // Libraries + fonts: serve from cache, fall back to network and cache the result.
  if (/cdn\.jsdelivr\.net|cdn\.sheetjs\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return resp;
      }).catch(() => hit))
    );
    return;
  }

  // App shell: cache-first; for page navigations fall back to the cached index when offline.
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(resp => {
      if (resp && resp.ok) { const copy = resp.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return resp;
    }).catch(() => req.mode === "navigate" ? caches.match("./index.html") : undefined))
  );
});
