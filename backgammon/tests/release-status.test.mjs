import test from "node:test";
import assert from "node:assert/strict";
import {
  releaseHeaders,
  releaseComparison,
  readReleaseStatus,
} from "../ui/release-status.mjs";
const response = (etag = '"old"', date = "Mon, 05 Oct 2026 20:00:00 GMT") =>
  new Response(null, { headers: { etag, "last-modified": date } });
test("release status distinguishes installed dates from later published files", () => {
  const installed = releaseHeaders(response());
  assert.equal(installed.date, "2026-10-05T20:00:00.000Z");
  assert.equal(
    releaseComparison(installed, releaseHeaders(response())),
    "current",
  );
  assert.equal(
    releaseComparison(installed, releaseHeaders(response('"new"'))),
    "available",
  );
  assert.equal(releaseComparison(null, installed), "unknown");
  assert.equal(releaseComparison(installed, null), "offline");
  assert.equal(releaseHeaders(response('"new"', "not a date")).date, null);
  assert.equal(releaseHeaders(new Response(null, { status: 404 })), null);
  assert.equal(
    releaseComparison({ date: installed.date }, { date: installed.date }),
    "unknown",
  );
});
test("comparison uses the loaded release cache and an uncached HEAD request", async () => {
  const cacheStorage = {
    keys: async () => ["backgammon-assets-0123456789abcdef"],
    open: async (name) => {
      assert.equal(name, "backgammon-assets-0123456789abcdef");
      return {
        match: async (url) => {
          assert.equal(url, "https://example.com/backgammon/play/index.html");
          return response();
        },
      };
    },
  };
  const result = await readReleaseStatus({
    version: "0123456789abcdef",
    pageURL: "https://example.com/backgammon/play/?resume=abc#draft",
    cacheStorage,
    fetcher: async (url, opts) => {
      assert.equal(opts.method, "HEAD");
      assert.equal(opts.cache, "no-store");
      assert.equal(url.pathname, "/backgammon/play/index.html");
      assert.ok(url.searchParams.has("bg-update-check"));
      assert.equal(url.hash, "");
      return response('"new"', "Mon, 05 Oct 2026 21:00:00 GMT");
    },
  });
  assert.equal(result.state, "available");
  assert.notEqual(result.installed.date, result.published.date);
});
test("offline checks retain the installed date; missing caches are never created", async () => {
  let opens = 0;
  const cacheStorage = {
    keys: async () => [],
    open: async () => {
      opens++;
      throw Error("must not open");
    },
  };
  const result = await readReleaseStatus({
    version: "0123456789abcdef",
    pageURL: "https://example.com/backgammon/play/",
    cacheStorage,
    fetcher: async () => {
      throw Error("offline");
    },
  });
  assert.equal(opens, 0);
  assert.equal(result.state, "offline");
  assert.equal(result.installed, null);
  cacheStorage.keys = async () => ["backgammon-assets-0123456789abcdef"];
  cacheStorage.open = async () => ({ match: async () => response() });
  const offline = await readReleaseStatus({
    version: "0123456789abcdef",
    pageURL: "https://example.com/backgammon/play/",
    cacheStorage,
    fetcher: async () => {
      throw Error("offline");
    },
  });
  assert.equal(offline.installed.date, "2026-10-05T20:00:00.000Z");
  assert.equal(offline.state, "offline");
});
