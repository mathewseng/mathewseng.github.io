/* SPDX-License-Identifier: GPL-3.0-or-later. Scope is /backgammon/ only. */
importScripts("./offline-manifest.js");
const PREFIX = "backgammon-assets-",
  CACHE = PREFIX + self.BG_CACHE_VERSION;
function cacheShell() {
  // Refresh the HTTP cache too: a new manifest must not install old JS/CSS.
  return caches
    .open(CACHE)
    .then((cache) =>
      cache.addAll(
        self.BG_SHELL.map(
          (path) =>
            new Request(new URL(path, location.origin), { cache: "reload" }),
        ),
      ),
    );
}
function removeOldCaches() {
  return caches
    .keys()
    .then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith(PREFIX) && k !== CACHE)
          .map((k) => caches.delete(k)),
      ),
    );
}
self.addEventListener("install", (event) => {
  event.waitUntil(cacheShell());
});
// Normal updates wait. Only an explicit refresh from the recovery page may
// activate early, after verifying no other Backgammon windows are open.
self.addEventListener("activate", (event) => {
  event.waitUntil(removeOldCaches());
});
self.addEventListener("message", (event) => {
  if (event.data?.type !== "BACKGAMMON_REFRESH" || !event.ports?.[0]) return;
  const reply = (value) => event.ports[0].postMessage(value);
  event.waitUntil(
    (async () => {
      const source = event.source;
      const url = source?.url && new URL(source.url);
      if (
        !source?.id ||
        url.origin !== location.origin ||
        !/^\/backgammon\/refresh\/(?:index\.html)?$/.test(url.pathname)
      ) {
        reply({
          status: "error",
          message: "Open the Backgammon refresh page to update.",
        });
        return;
      }
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const others = clients.filter(
        (c) =>
          c.id !== source.id &&
          new URL(c.url).origin === location.origin &&
          new URL(c.url).pathname.startsWith("/backgammon/"),
      );
      if (others.length) {
        reply({
          status: "busy",
          message:
            "Close the other Backgammon tabs or Home Screen windows, then try again. Keep this refresh page open.",
        });
        return;
      }
      // addAll is atomic: a failed download leaves the working shell intact.
      // This never opens or deletes IndexedDB, localStorage or other-family caches.
      await cacheShell();
      await removeOldCaches();
      await self.skipWaiting();
      reply({ status: "ready", version: self.BG_CACHE_VERSION });
    })().catch(() =>
      reply({
        status: "error",
        message:
          "The update could not be downloaded. Check your connection and try again. Your saved data is unchanged.",
      }),
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
  // A standalone escape hatch must always be reachable through the network.
  if (u.pathname.startsWith("/backgammon/refresh/")) return;
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
