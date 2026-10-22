const test = require("node:test"), assert = require("node:assert/strict");
const Native = require("../scripts/native-solver.cjs"), E = require("../engine.js"), S = require("../solver.js");
const { exhaustive, fixtures } = require("./exhaustive-reference.cjs");

test("native and browser solvers solve fully revealed small endgames exactly", async () => {
  const native = Native.createSolver();
  try {
    for (const state of fixtures()) {
      state.knownBottom = state.deck.map(c => c.id);
      const expected = exhaustive(state), observation = E.observe(state);
      const result = await native.analyze(observation, { iterations: 512 });
      const browser = S.analyze(observation, { iterations: 512, timeMs: 60000 });
      assert.equal(result.score, expected, state.seed); assert.equal(browser.score, expected, state.seed);
      assert.ok(result.results.every(r => r.exact)); assert.ok(browser.results.every(r => r.exact));
    }
  } finally { native.close(); }
});

test("native estimates are invariant to hidden deck order and all actions receive samples", async () => {
  const native = Native.createSolver();
  try {
    const state = E.createGame({ seed: "privacy-native" }), a = E.observe(state);
    state.deck.reverse(); state.seed = "unavailable"; const b = E.observe(state);
    const first = await native.analyze(a, { iterations: 512 }), second = await native.analyze(b, { iterations: 512 });
    assert.deepEqual(first.results, second.results);
    assert.equal(first.results.length, E.actions(state).length);
    for (const row of first.results) assert.ok(row.samples >= 48 || row.exact);
    await assert.rejects(async () => native.analyze(state), /public observation/);
  } finally { native.close(); }
});

test("native and browser sampling agree at a fixed simulation budget", async () => {
  const native = Native.createSolver();
  try {
    for (const seed of ["test1", "scoundrel-study-v1-0000"]) {
      const observation = E.observe(E.createGame({ seed }));
      const a = S.analyze(observation, { iterations: 512, timeMs: 60000 });
      const b = await native.analyze(observation, { iterations: 512 });
      for (let i = 0; i < a.results.length; i++) {
        assert.deepEqual(a.results[i].action, b.results[i].action);
        assert.equal(a.results[i].samples, b.results[i].samples);
        assert.ok(Math.abs(a.results[i].score - b.results[i].score) < 1e-9);
      }
    }
  } finally { native.close(); }
});
