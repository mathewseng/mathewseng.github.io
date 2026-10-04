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
      .then(async (cache) => {
        const saved = await Promise.all(
          self.BG_ENGINE.map((path) => cache.match(path)),
        );
        if (saved.every(Boolean)) return cache;
        const responses = await Promise.all(
          self.BG_ENGINE.map(async (path) => {
            const response = await fetch(path, { cache: "no-store" });
            if (!response.ok)
              throw new Error(`Engine asset unavailable: ${path}`);
            const digest = await crypto.subtle.digest(
              "SHA-256",
              await response.clone().arrayBuffer(),
            );
            const hex = [...new Uint8Array(digest)]
              .map((n) => n.toString(16).padStart(2, "0"))
              .join("");
            if (hex !== self.BG_ENGINE_DIGESTS[path])
              throw new Error(
                "Engine update detected. Close Backgammon tabs and reopen to update safely.",
              );
            return response;
          }),
        );
        // Validate every asset before publishing any of the new engine triplet.
        await Promise.all(
          responses.map((response, i) =>
            cache.put(self.BG_ENGINE[i], response),
          ),
        );
        return cache;
      })
      .catch((error) => {
        warming = null;
        throw error;
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
  if (self.BG_ENGINE.includes(key)) {
    event.respondWith(
      warmEngine()
        .then((cache) => cache.match(key))
        .catch((error) => new Response(error.message, { status: 503 })),
    );
    return;
  }
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const saved = await cache.match(key);
      if (saved) return saved;
      return fetch(event.request);
    }),
  );
});
