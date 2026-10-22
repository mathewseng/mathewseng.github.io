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

test("shared room cache, private cache, and browser give identical sampled continuations", async () => {
  const binary = Native.compile(), shared = Native.createSolver(binary), privateCache = Native.createSolver(binary, { sharedCache: false });
  try {
    for (let i = 0; i < 8; i++) {
      let state = E.createGame({ seed: "cache-regression-" + i });
      for (let j = 0; j < i * 3 && E.actions(state).length; j++) {
        const actions = E.actions(state);state = E.transition(state, actions[(j + i) % actions.length]);
      }
      if (!E.actions(state).length) continue;
      const observation = E.observe(state), options = { iterations: 512, timeMs: 60000 };
      const [a, b] = await Promise.all([shared.analyze(observation, options), privateCache.analyze(observation, options)]);
      const c = S.analyze(observation, options);
      assert.deepEqual(a.results, b.results);
      for (let j = 0; j < a.results.length; j++) {
        assert.equal(a.results[j].samples, c.results[j].samples);
        assert.ok(Math.abs(a.results[j].score - c.results[j].score) < 1e-9);
      }
    }
  } finally { shared.close(); privateCache.close(); }
});
