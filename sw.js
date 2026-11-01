// Quadratic Solver service worker
// Strategy: network first (always the newest version when online),
// saved copy as a backup (when offline).
var CACHE = "quadratic-solver-v1";
var FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(FILES); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
                               .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET" || req.url.indexOf("http") !== 0) return;

  event.respondWith(
    fetch(req)
      .then(function (res) {
        // keep a fresh copy (also saves the Google font for offline use)
        if (res && (res.ok || res.type === "opaque")) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          if (hit) return hit;
          if (req.mode === "navigate") return caches.match("./index.html");
          return Response.error();
        });
      })
  );
});
