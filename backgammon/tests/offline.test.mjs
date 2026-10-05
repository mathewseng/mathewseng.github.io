import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";

function harness() {
  const paths = ["loader.js", "engine.wasm", "engine.data"].map(
    (name) => `/backgammon/engine/vendor/${name}`,
  );
  const handlers = {},
    saved = new Map(),
    deleted = [];
  const shellRequests = [],
    clients = [];
  let activated = 0;
  let fetches = 0,
    online = true;
  const cache = {
    match: async (key) => saved.get(key)?.clone(),
    put: async (key, response) => saved.set(key, response.clone()),
    addAll: async (requests) => {
      if (!online) throw new Error("Offline");
      shellRequests.push(...requests);
    },
  };
  const self = {
    BG_CACHE_VERSION: "test",
    BG_SHELL: ["/backgammon/play/index.html", "/backgammon/styles.css"],
    BG_ENGINE: paths,
    BG_ENGINE_DIGESTS: Object.fromEntries(
      paths.map((path) => [
        path,
        createHash("sha256").update(path).digest("hex"),
      ]),
    ),
    addEventListener: (name, listener) => (handlers[name] = listener),
    clients: { matchAll: async () => clients },
    registration: { active: {}, waiting: {} },
    skipWaiting: async () => activated++,
  };
  runInNewContext(readFileSync(new URL("../sw.js", import.meta.url), "utf8"), {
    self,
    importScripts() {},
    URL,
    Response,
    Request,
    Headers,
    Uint8Array,
    crypto: webcrypto,
    location: { origin: "https://site.example" },
    caches: {
      open: async () => cache,
      keys: async () => [
        "backgammon-assets-old",
        "backgammon-assets-test",
        "other-family-cache",
      ],
      delete: async (key) => deleted.push(key),
    },
    fetch: async (path) => {
      fetches++;
      if (!online) throw new Error("Offline");
      return new Response(
        typeof path === "string" ? path : new URL(path.url).pathname,
      );
    },
  });
  return {
    self,
    paths,
    saved,
    deleted,
    shellRequests,
    clients,
    activated: () => activated,
    handlers,
    fetches: () => fetches,
    offline: () => (online = false),
    async refresh(url = "https://site.example/backgammon/refresh/") {
      let result, pending;
      handlers.message({
        data: { type: "BACKGAMMON_REFRESH" },
        source: { id: "refresh", url },
        ports: [{ postMessage: (value) => (result = value) }],
        waitUntil: (promise) => (pending = promise),
      });
      await pending;
      return result;
    },
    async update(
      source = {
        id: "hub",
        url: "https://site.example/backgammon/",
      },
      deadline = Date.now() + 5000,
    ) {
      let result, pending;
      handlers.message({
        data: { type: "BACKGAMMON_UPDATE", deadline },
        source,
        ports: [{ postMessage: (value) => (result = value) }],
        waitUntil: (promise) => (pending = promise),
      });
      await pending;
      return result;
    },
    request(path = paths[0]) {
      let result;
      handlers.fetch({
        request: { url: `https://site.example${path}`, method: "GET" },
        respondWith: (response) => (result = response),
      });
      return result;
    },
  };
}

test("offline engine caching verifies and stores one complete matching triplet", async () => {
  const h = harness();
  const response = await h.request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(h.saved.size, 3);
  assert.equal(h.fetches(), 3);
  h.offline();
  for (const path of h.paths)
    assert.equal(await (await h.request(path)).text(), path);
  assert.equal(h.fetches(), 3);
});

test("app responses prevent a second HTTP cache bypassing the active offline release", async () => {
  const h = harness();
  h.saved.set(
    "/backgammon/styles.css",
    new Response("current-style", {
      headers: { "Cache-Control": "public, max-age=86400" },
    }),
  );
  const cached = await h.request("/backgammon/styles.css");
  assert.equal(cached.headers.get("Cache-Control"), "no-store");
  assert.equal(await cached.text(), "current-style");
  const network = await h.request("/backgammon/uncached.mjs");
  assert.equal(network.headers.get("Cache-Control"), "no-store");
  assert.equal(await network.text(), "/backgammon/uncached.mjs");
});

test("install bypasses the HTTP cache for every shell file without forcing activation", async () => {
  const h = harness();
  let pending;
  h.handlers.install({ waitUntil: (promise) => (pending = promise) });
  await pending;
  assert.equal(h.shellRequests.length, 2);
  for (const request of h.shellRequests) assert.equal(request.cache, "reload");
  assert.equal(h.activated(), 0);
});

test("explicit refresh updates only Backgammon files and leaves other families alone", async () => {
  const h = harness();
  h.clients.push(
    { id: "refresh", url: "https://site.example/backgammon/refresh/" },
    { id: "poker", url: "https://site.example/poker/play/" },
  );
  assert.equal((await h.refresh()).status, "ready");
  assert.equal(h.activated(), 1);
  assert.deepEqual(h.deleted, ["backgammon-assets-old"]);
  assert.equal(h.shellRequests.length, 2);
  assert.equal(h.request("/backgammon/refresh/"), undefined);
});

test("refresh cannot interrupt another open Backgammon page or accept an unrelated caller", async () => {
  const h = harness();
  h.clients.push({ id: "game", url: "https://site.example/backgammon/play/" });
  assert.equal((await h.refresh()).status, "busy");
  assert.equal(
    (await h.refresh("https://site.example/backgammon/play/")).status,
    "error",
  );
  assert.equal(
    (await h.refresh("https://other.example/backgammon/refresh/")).status,
    "error",
  );
  assert.equal(h.activated(), 0);
  assert.deepEqual(h.deleted, []);
  assert.equal(h.shellRequests.length, 0);
});

test("a failed manual download keeps the working cache and does not activate the update", async () => {
  const h = harness();
  h.offline();
  assert.equal((await h.refresh()).status, "error");
  assert.equal(h.activated(), 0);
  assert.deepEqual(h.deleted, []);
});

test("automatic activation uses the installed shell without downloading again or deleting data", async () => {
  const h = harness();
  h.clients.push({
    id: "hub",
    url: "https://site.example/backgammon/",
    visibilityState: "visible",
  });
  h.offline(); // The full new shell was already installed.
  assert.equal((await h.update()).status, "ready");
  assert.equal(h.activated(), 1);
  assert.deepEqual(h.deleted, []);
  assert.equal(h.shellRequests.length, 0);
});

test("automatic activation refuses other windows, navigated/hidden clients and expired requests", async () => {
  const h = harness();
  const hub = {
    id: "hub",
    url: "https://site.example/backgammon/",
    visibilityState: "visible",
  };
  h.clients.push(hub, {
    id: "game",
    url: "https://site.example/backgammon/play/",
  });
  assert.equal((await h.update()).status, "busy");
  h.clients.pop();
  assert.equal((await h.update(undefined, Date.now() - 1)).status, "deferred");
  assert.equal((await h.update(undefined, Infinity)).status, "deferred");
  assert.equal(
    (await h.update(undefined, Date.now() + 60000)).status,
    "deferred",
  );
  hub.visibilityState = "hidden";
  assert.equal((await h.update()).status, "deferred");
  hub.visibilityState = "visible";
  hub.url += "play/";
  assert.equal((await h.update()).status, "deferred");
  assert.equal(
    (await h.update({ id: "hub", url: "https://other.example/backgammon/" }))
      .status,
    "error",
  );
  assert.equal(
    (await h.update({ id: "hub", url: "https://site.example/poker/" })).status,
    "error",
  );
  assert.equal(h.activated(), 0);
  assert.deepEqual(h.deleted, []);
});

test("first-time installations do not force activation through the update protocol", async () => {
  const h = harness();
  h.clients.push({
    id: "hub",
    url: "https://site.example/backgammon/",
    visibilityState: "visible",
  });
  h.self.registration.active = null;
  assert.equal((await h.update()).status, "deferred");
  assert.equal(h.activated(), 0);
});

test("an incompatible engine update is rejected without caching partial assets and can retry", async () => {
  const h = harness(),
    path = h.paths[2],
    expected = h.self.BG_ENGINE_DIGESTS[path];
  h.self.BG_ENGINE_DIGESTS[path] = "wrong-version";
  const response = await h.request();
  assert.equal(response.status, 503);
  assert.match(await response.text(), /update detected/);
  assert.equal(h.saved.size, 0);
  h.self.BG_ENGINE_DIGESTS[path] = expected;
  assert.equal((await h.request()).status, 200);
  assert.equal(h.saved.size, 3);
});

test("service-worker activation leaves other families and the current cache intact", async () => {
  const h = harness();
  let completed;
  h.handlers.activate({ waitUntil: (promise) => (completed = promise) });
  await completed;
  assert.deepEqual(h.deleted, ["backgammon-assets-old"]);
});
