// Quadratic Solver service worker
// Strategy: cache first (fast, works offline). New versions arrive through the
// "Update" popup in the app.
//
// IMPORTANT: change CACHE_NAME (v3 -> v4 -> v5 ...) every time you update the app.
// If this file doesn't change, phones won't notice that a new version exists.
const CACHE_NAME = 'quad-solver-v10';

// The app can't work without these
const CORE = ['./', './index.html', './style.css', './script.js', './manifest.json'];
// Nice to have (icons). A missing one will not break the install.
const OPTIONAL = [
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png',
  './apple-touch-icon.png'
];

// Install: save the files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // cache: 'reload' skips the browser's own cache, so we never save an old copy
      const fresh = (url) => fetch(new Request(url, { cache: 'reload' }));

      await Promise.all(CORE.map(async (url) => {
        const res = await fresh(url);
        if (!res.ok) throw new Error('Could not cache ' + url);
        await cache.put(url, res);
      }));

      await Promise.all(OPTIONAL.map((url) =>
        fresh(url).then((res) => (res.ok ? cache.put(url, res) : null)).catch(() => null)
      ));
    })
  );
  // No skipWaiting() here on purpose: the new version waits until the user taps "Update".
});

// Activate: delete old caches, then take control of open pages
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: saved copy first, internet as backup
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          // also save things like the Google font, so it works offline later
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    })
  );
});

// The page sends this message when the user taps "Update"
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
