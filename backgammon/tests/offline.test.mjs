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
  let fetches = 0,
    online = true;
  const cache = {
    match: async (key) => saved.get(key)?.clone(),
    put: async (key, response) => saved.set(key, response.clone()),
  };
  const self = {
    BG_CACHE_VERSION: "test",
    BG_ENGINE: paths,
    BG_ENGINE_DIGESTS: Object.fromEntries(
      paths.map((path) => [
        path,
        createHash("sha256").update(path).digest("hex"),
      ]),
    ),
    addEventListener: (name, listener) => (handlers[name] = listener),
  };
  runInNewContext(readFileSync(new URL("../sw.js", import.meta.url), "utf8"), {
    self,
    importScripts() {},
    URL,
    Response,
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
      return new Response(path);
    },
  });
  return {
    self,
    paths,
    saved,
    deleted,
    handlers,
    fetches: () => fetches,
    offline: () => (online = false),
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
  assert.equal((await h.request()).status, 200);
  assert.equal(h.saved.size, 3);
  assert.equal(h.fetches(), 3);
  h.offline();
  for (const path of h.paths)
    assert.equal(await (await h.request(path)).text(), path);
  assert.equal(h.fetches(), 3);
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
