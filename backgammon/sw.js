/* SPDX-License-Identifier: GPL-3.0-or-later. Scope is /backgammon/ only. */
// Release URL is generated with the manifest; keep the registration URL stable.
importScripts("./offline-manifest.js?v=fa628c0c980455c9");
const PREFIX = "backgammon-assets-",
  CACHE = PREFIX + self.BG_CACHE_VERSION;
async function cacheShell() {
  const cache = await caches.open(CACHE),
    responses = new Map();
  let next = 0,
    completed = 0;
  async function progress() {
    const data = {type:"BACKGAMMON_DOWNLOAD", completed, total:self.BG_SHELL.length};
    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    for (const client of clients)
      if (
        new URL(client.url).origin === location.origin &&
        new URL(client.url).pathname.startsWith("/backgammon/")
      )
        client.postMessage(data);
  }
  // WebKit can defer client enumeration during navigation. Progress delivery
  // must never block the installation it describes.
  progress().catch(() => {});
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (next < self.BG_SHELL.length) {
        const path = self.BG_SHELL[next++];
        const response = await fetch(
          new Request(new URL(path, location.origin), { cache: "reload" }),
          {signal: AbortSignal.timeout(30000)},
        );
        if (!response.ok) throw new Error(`App file unavailable: ${path}`);
        // Buffer the body before counting a file; headers alone are not progress.
        responses.set(
          path,
          new Response(await response.arrayBuffer(), {
            status: response.status,
            headers: response.headers,
          }),
        );
        completed++;
        progress().catch(() => {});
      }
    }),
  );
  // Publish only after every download succeeds. A failed install never replaces
  // the active release; no game storage or other-family caches are touched.
  await Promise.all(
    [...responses].map(([path, response]) => cache.put(path, response)),
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
// A downloaded release waits until the page-load gate asks to apply
// it, or the standalone recovery page explicitly refreshes it. Never claim
// running clients: the requesting page reloads after activation completes.
self.addEventListener("activate", (event) => {
  event.waitUntil(removeOldCaches());
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "BACKGAMMON_VERSION" && event.ports?.[0]) {
    const sourceURL = event.source?.url && new URL(event.source.url);
    if (sourceURL?.origin === location.origin && sourceURL.pathname.startsWith("/backgammon/"))
      event.ports[0].postMessage({type:"BACKGAMMON_VERSION", version:self.BG_CACHE_VERSION});
    return;
  }
  const automatic = event.data?.type === "BACKGAMMON_UPDATE";
  if (
    (!automatic && event.data?.type !== "BACKGAMMON_REFRESH") ||
    !event.ports?.[0]
  )
    return;
  const reply = (value) => event.ports[0].postMessage(value);
  event.waitUntil(
    (async () => {
      const source = event.source;
      const url = source?.url && new URL(source.url);
      if (
        !source?.id ||
        url.origin !== location.origin ||
        !(
          automatic
            ? /^\/backgammon\/(?:(?:play|trainer|solver|library|reports|controls)\/)?(?:index\.html)?$/
            : /^\/backgammon\/refresh\/(?:index\.html)?$/
        ).test(url.pathname)
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
          message: automatic
            ? "Close your other Backgammon tabs or Home Screen windows, then retry. Their saved progress will be kept."
            : "Close the other Backgammon tabs or Home Screen windows, then try again. Keep this refresh page open.",
        });
        return;
      }
      if (automatic) {
        const client = clients.find((c) => c.id === source.id);
        const deadline = event.data.deadline;
        // The short-lived request is sent with modal input protection. Refuse
        // late delivery, a navigated/hidden caller, and first-time installs.
        if (
          !self.registration.active ||
          !self.registration.waiting ||
          !client ||
          client.url !== source.url ||
          client.visibilityState !== "visible" ||
          !Number.isFinite(deadline) ||
          deadline <= Date.now() ||
          deadline > Date.now() + 10000
        ) {
          reply({
            status: "deferred",
            message: "Update ready. Return to the hub to apply it safely.",
          });
          return;
        }
      } else {
        // addAll is atomic: a failed download leaves the working shell intact.
        // No IndexedDB, localStorage or other-family caches are touched.
        await cacheShell();
        await removeOldCaches();
      }
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
const bookDownloads = new Map();
async function bookFile(key) {
  const cache = await caches.open(CACHE), saved = await cache.match(key);
  if (saved) return saved;
  if (!bookDownloads.has(key)) bookDownloads.set(key, (async () => {
    try {
      const response = await fetch(key, { cache: "no-store" });
      if (!response.ok) throw new Error("Opening book unavailable.");
      const digest = await crypto.subtle.digest("SHA-256", await response.clone().arrayBuffer());
      const hex = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, "0")).join("");
      if (hex !== self.BG_BOOK_DIGESTS[key]) throw new Error("Opening book update pending.");
      await cache.put(key, response.clone());
      return response;
    } finally { bookDownloads.delete(key); }
  })());
  return (await bookDownloads.get(key)).clone();
}
function fromRelease(response) {
  // CacheStorage owns offline reuse. A second, browser-managed response cache
  // can otherwise bypass this worker and mix old module imports with a new
  // entry script (notably WebKit when moving between tools after an update).
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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
  if (self.BG_BOOK_DIGESTS?.[key]) {
    // Cache only the requested shard; never pull the whole book onto the hub.
    // A deployed update cannot mix new book values with an old active release.
    event.respondWith(bookFile(key).then(fromRelease).catch(error => new Response(error.message, { status: 503 })));
    return;
  }
  if (self.BG_ENGINE.includes(key)) {
    event.respondWith(
      warmEngine()
        .then((cache) => cache.match(key))
        .then(fromRelease)
        .catch((error) => new Response(error.message, { status: 503 })),
    );
    return;
  }
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const saved = await cache.match(key);
      return fromRelease(saved || (await fetch(event.request)));
    }),
  );
});
