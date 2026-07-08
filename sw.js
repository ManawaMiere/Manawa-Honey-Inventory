/* Manawa Honey — service worker.
   Strategy: NETWORK-FIRST for the app itself (index.html and same-origin files) so the
   newest version always shows when online; falls back to cache only when offline.
   CACHE-FIRST for the big third-party libraries (they rarely change). */
const CACHE = "manawa-v7";
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
    await Promise.allSettled(SHELL.map(u => c.add(u)));
    self.skipWaiting();                 // take over as soon as installed
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();         // control open pages immediately
  })());
});

const isLib = url => /cdn\.jsdelivr\.net|cdn\.sheetjs\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url);

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = req.url;

  // Supabase data calls: always network (the app's queue handles offline writes).
  if (url.includes(".supabase.co")) return;

  // Third-party libraries + fonts: cache-first (fast, and they rarely change).
  if (isLib(url)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(resp => {
        const copy = resp.clone(); caches.open(CACHE).then(c => c.put(req, copy));
        return resp;
      }).catch(() => hit))
    );
    return;
  }

  // The app itself (index.html, sw, icons, same-origin): NETWORK-FIRST.
  // Get the freshest copy when online; update the cache; fall back to cache offline.
  e.respondWith((async () => {
    try {
      const resp = await fetch(req, { cache: "no-store" });
      if (resp && resp.ok) { const copy = resp.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return resp;
    } catch (err) {
      const hit = await caches.match(req);
      if (hit) return hit;
      if (req.mode === "navigate") return caches.match("./index.html");
      throw err;
    }
  })());
});
