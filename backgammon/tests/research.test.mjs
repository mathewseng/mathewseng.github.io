import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  pool,
  batchSeed,
  runRollout,
  rolloutUnsupported,
} from "../engine/rollout.mjs";
import { initialState, legalTurns, boardKey } from "../core/rules.mjs";
import {
  decodeBenchmarkKey,
  parseBenchmarkMove,
} from "../scripts/benchmark-reference.mjs";
import { localConfig } from "../core/play-session.mjs";
import { comparisonSummary, moveFeatures } from "../core/analysis-insight.mjs";
test("pool independent rollout batch moments, not average confidence margins", () => {
  const batch = (a) => ({
    samples: a.length,
    equity: a.reduce((s, n) => s + n) / a.length,
    standardError: Math.sqrt(
      a.reduce(
        (s, n) => s + (n - a.reduce((x, y) => x + y) / a.length) ** 2,
        0,
      ) /
        (a.length * (a.length - 1)),
    ),
    cubeless: 0,
    probabilities: [0.5, 0, 0, 0, 0],
    mwc: null,
  });
  const a = [1, 2, 4],
    b = [-2, 4, 9, 3];
  const p = pool(batch(a), batch(b)),
    full = batch([...a, ...b]);
  assert.ok(Math.abs(p.equity - full.equity) < 1e-12);
  assert.ok(Math.abs(p.standardError - full.standardError) < 1e-12);
  assert.equal(batchSeed(2, 1) - batchSeed(2, 0), 65536);
});
test("rollout scope rejects unsupported immediate redoubles rather than changing rules", () => {
  assert.match(
    rolloutUnsupported(
      initialState({
        phase: "roll",
        matchLength: 0,
        rules: { immediateRedoubles: 1 },
      }),
    ),
    /beavers/,
  );
  assert.match(rolloutUnsupported(initialState()), /rolled/);
});
test("historical external reference decoder and all 300 sampled moves are legal", () => {
  assert.deepEqual(
    decodeBenchmarkKey("OAHDPAABDAOAHDPAABDA").points,
    initialState().points,
  );
  const file = JSON.parse(
    fs.readFileSync(
      new URL("../data/accuracy-reference.json", import.meta.url),
    ),
  );
  assert.equal(file.items.length, 300);
  for (const row of file.items) {
    const r = parseBenchmarkMove(row.record),
      keys = new Set(legalTurns(r.state).map((t) => t.key));
    assert.ok(
      r.reference.every((c) => keys.has(c.key)),
      `${row.topic}:${row.line}`,
    );
  }
});
test("review strength is independent, defaults Deep, and survives normalization", () => {
  assert.equal(localConfig({ strength: "quick" }).reviewStrength, "deep");
  assert.equal(
    localConfig({ strength: "quick", reviewStrength: "research" }).strength,
    "quick",
  );
  assert.equal(localConfig({ reviewStrength: "bad" }).reviewStrength, "deep");
});
test("comparison highlights ranking reversals and conservative rollout overlap", () => {
  const previous = { settings: { name: "Quick" }, candidates: [{ key: "a" }] };
  const result = {
    method: "rollout",
    candidates: [
      { key: "b", equity: 0.2, standardError: 0.01 },
      { key: "a", equity: 0.19, standardError: 0.01 },
    ],
  };
  assert.equal(comparisonSummary(result, previous).changed, true);
  assert.equal(comparisonSummary(result, previous).close, true);
  const s = initialState({ phase: "move", dice: [3, 1] });
  const original = boardKey(s);
  const features = moveFeatures(s, legalTurns(s)[0].steps);
  assert.equal(boardKey(s), original);
  assert.ok(features.pips > 0);
  assert.ok(Number.isInteger(features.blots));
});
