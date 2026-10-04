/* SPDX-License-Identifier: GPL-3.0-or-later. Scope is /backgammon/ only. */
importScripts("./offline-manifest.js");
const PREFIX = "backgammon-assets-",
  CACHE = PREFIX + self.BG_CACHE_VERSION;
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(self.BG_SHELL)),
  );
});
// No skipWaiting or clients.claim: an update never takes over an open match.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith(PREFIX) && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      ),
  );
});
let warming;
async function warmEngine() {
  if (!warming)
    warming = caches
      .open(CACHE)
      .then((cache) => cache.addAll(self.BG_ENGINE))
      .catch(() => {
        warming = null;
      });
  return warming;
}
self.addEventListener("fetch", (event) => {
  const u = new URL(event.request.url);
  if (event.request.method !== "GET" || u.origin !== location.origin) return;
  if (
    !u.pathname.startsWith("/backgammon/") &&
    !["/shared/hub.css", "/shared/hub.js", "/shared/peer-room.js"].includes(
      u.pathname,
    )
  )
    return;
  const key = u.pathname.endsWith("/") ? u.pathname + "index.html" : u.pathname;
  if (self.BG_ENGINE.includes(key)) event.waitUntil(warmEngine());
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const saved = await cache.match(key);
      if (saved) return saved;
      return fetch(event.request);
    }),
  );
});
