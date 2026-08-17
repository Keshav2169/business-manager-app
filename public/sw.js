// ─── KE BUSINESS SUITE — SERVICE WORKER ────────────────────────────────────────
// Job: make the APP SHELL (HTML/JS/CSS/manifest/icons) open with zero
// connectivity. Actual DATA offline support (reading/writing Sheets rows) is
// handled entirely in JS via IndexedDB — see src/shared/offlineDB.js and
// sheetsAPI in src/shared/utils.js. This file must never intercept requests
// to the Apps Script API, or that JS-level offline queue would never see a
// real network failure to react to.
//
// Bump CACHE_VERSION on every deploy that changes shell assets so old
// clients pick up the new build instead of serving a stale cached shell
// forever. (No build-time manifest injection here on purpose — that needs
// Workbox/vite-plugin-pwa, which is more than this zero-cost app needs;
// runtime caching below is self-healing without it.)
const CACHE_VERSION = "v1";
const SHELL_CACHE   = `ke-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE  = `ke-runtime-${CACHE_VERSION}`;

// Minimum set needed to paint something offline on first load after install.
const SHELL_URLS = ["/", "/index.html", "/manifest.json", "/favicon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_URLS))
      .catch(() => {}) // best-effort — a slow/offline install shouldn't hard-fail registration
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

function isApiRequest(url) {
  // Never intercept the Apps Script backend (script.google.com) or any
  // cross-origin API call — those must hit the real network (or fail
  // naturally) so sheetsAPI's own offline-queue logic in utils.js is the one
  // handling failures, not this service worker.
  return url.origin !== self.location.origin;
}

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return; // never cache/intercept writes
  const url = new URL(request.url);
  if (isApiRequest(url)) return; // let Apps Script / any other origin pass straight through

  // Navigations (opening/refreshing the app): network-first so a person
  // online always gets the latest shell, falling back to the cached shell
  // the moment the network is unavailable — this is what turns "offline =
  // blank screen" into "offline = the app actually opens".
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(res => { caches.open(SHELL_CACHE).then(c => c.put("/index.html", res.clone())); return res; })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Everything else same-origin (hashed JS/CSS bundles, icons, manifest):
  // cache-first, filling the runtime cache the first time each is seen, so
  // a person who has opened the app once online has the assets available
  // offline from then on, and stays fast online since repeat visits skip
  // the network entirely for unchanged files.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(request, copy));
        }
        return res;
      }).catch(() => cached); // offline and never cached — nothing we can do for this one asset
    })
  );
});
