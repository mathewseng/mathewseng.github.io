import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initialState,
  replay,
  positionKey,
  legalTurns,
  assertState,
  boardKey,
  commitTurn,
} from "../core/rules.mjs";
import { ENGINE_VERSION } from "../engine/metadata.mjs";
test("all study fixtures are valid, genuinely scored, and seeded provenance replays", () => {
  const { items } = JSON.parse(
    readFileSync(new URL("../data/exercises.json", import.meta.url)),
  );
  assert.equal(items.length, 34);
  for (const item of items) {
    assertState(item.state);
    if (item.provenance.kind === "legal seeded replay") {
      const state = replay(
        initialState({ matchLength: 0 }),
        item.provenance.events,
      ).at(-1);
      assert.equal(positionKey(state), positionKey(item.state));
    }
    assert.equal(item.analysis.engine, ENGINE_VERSION);
    assert.equal(item.analysis.status, "complete");
    assert.equal(item.analysis.positionKey, positionKey(item.state));
    if (item.state.phase === "move") {
      const keys = new Set(legalTurns(item.state).map((t) => t.key));
      assert.equal(item.analysis.candidates.length, keys.size);
      for (const c of item.analysis.candidates) {
        assert.ok(keys.has(c.key));
        assert.equal(c.key, boardKey(commitTurn(item.state, c.steps)));
        assert.ok(Number.isFinite(c.equity));
      }
    }
  }
});
