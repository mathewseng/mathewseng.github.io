import test from "node:test";
import assert from "node:assert/strict";
import { readPageProgress, keepPageProgress } from "../ui/page-progress.mjs";

test("reload checkpoints are synchronous, per tab/route, preserve drafts and reject different shared links", () => {
  const records = new Map(),
    events = {};
  const saved = Object.fromEntries(
    ["sessionStorage", "location", "document", "addEventListener"].map((k) => [
      k,
      globalThis[k],
    ]),
  );
  try {
    globalThis.sessionStorage = {
      getItem: (k) => records.get(k),
      setItem: (k, v) => records.set(k, v),
      removeItem: (k) => records.delete(k),
    };
    globalThis.location = {
      pathname: "/backgammon/play/",
      href: "https://example.test/backgammon/play/#resume=one",
    };
    globalThis.document = {
      hidden: false,
      addEventListener: (k, fn) => (events[k] = fn),
    };
    globalThis.addEventListener = (k, fn) => (events[k] = fn);
    let value = {
      game: { id: "one", dice: [4, 1], sequence: 12 },
      draft: [{ from: "bar", to: 20, die: 4 }],
      result: { equity: 0.125 },
    };
    keepPageProgress(() => value);
    events.pagehide();
    assert.deepEqual(readPageProgress(), value);
    const original = readPageProgress();
    value.draft.push({ from: 20, to: 19, die: 1 });
    assert.equal(
      original.draft.length,
      1,
      "serialization snapshots do not share mutable arrays",
    );
    document.hidden = true;
    events.visibilitychange();
    assert.equal(readPageProgress().draft.length, 2);
    location.href = "https://example.test/backgammon/play/#resume=two";
    assert.equal(readPageProgress(), null);
    location.href = "https://example.test/backgammon/play/#resume=one";
    location.pathname = "/backgammon/solver/";
    assert.equal(readPageProgress(), null);
    location.pathname = "/backgammon/play/";
    value = null;
    events.pagehide();
    assert.equal(readPageProgress(), null);
    records.set("backgammon.page-progress./backgammon/play/", "{broken");
    assert.equal(readPageProgress(), null);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  }
});
