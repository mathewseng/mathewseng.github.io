const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const E = require("../engine.js"), S = require("../solver.js"), Native = require("../scripts/native-solver.cjs");
const { exhaustive, fixtures } = require("./exhaustive-reference.cjs");

test("canonical successor groups preserve exact values against independent exhaustive play", () => {
  for (const state of fixtures()) {
    state.knownBottom = state.deck.map(c => c.id);
    const observation = E.observe(state), groups = S.actionGroups(S.pack(observation));
    for (const group of groups.filter(group => group.moves.length > 1)) {
      const scores = E.actions(state).filter(action => group.moves.includes(S.actionMove(observation, action))).map(action => exhaustive(E.transition(state, action)));
      assert.ok(scores.every(score => score === scores[0]), state.seed);
    }
  }
});

test("equal capped healing preserves the carried potion and final-potion bonus", () => {
  for (const deck of [["8h", "9h", "As", "2d"], ["8h", "9h"]]) {
    const state = E.createGame({ deck });
    state.health = 12; state.room = deck.slice(0, 2).map(E.card); state.deck = deck.slice(2).map(E.card); state.resolved = 2;
    const compact = S.pack(E.observe(state));
    assert.notEqual(S.outcomeKey(compact, S.encode(E.card("8h"))), S.outcomeKey(compact, S.encode(E.card("9h"))));
    const a = E.transition(state, { type: "drink", id: "8h" }), b = E.transition(state, { type: "drink", id: "9h" });
    assert.equal(a.health, 20); assert.equal(b.health, 20);
    if (!state.deck.length) { assert.equal(exhaustive(a), 29); assert.equal(exhaustive(b), 28); }
  }
});

test("inert potions share statistics in both solvers without losing selectable actions", async () => {
  const state = E.createGame({ deck: ["2h", "8h", "9h", "6d"] });
  state.health = 12; state.potionUsed = true;
  const observation = E.observe(state), native = Native.createSolver();
  try {
    for (const result of [S.analyze(observation), await native.analyze(observation)]) {
      const potions = result.results.filter(row => row.action.type === "drink");
      assert.equal(potions.length, 3);
      assert.equal(new Set(potions.map(row => row.equivalence)).size, 1);
      assert.equal(new Set(potions.map(row => row.score)).size, 1);
      assert.equal(new Set(potions.map(row => row.samples)).size, 1);
    }
  } finally { native.close(); }
});

test("ordered returns remain distinct and pending draws never consume random samples during grouping", () => {
  const state = E.createGame({ deck: ["2s", "3s", "4d", "5h", "6s", "7h"] });
  const compact = S.pack(E.observe(state)), snapshot = JSON.stringify(compact);
  assert.notEqual(S.outcomeKey(compact, 128), S.outcomeKey(compact, 129));
  S.actionGroups(compact);
  assert.equal(JSON.stringify(compact), snapshot);
  const next = S.step(compact, 128, () => { throw Error("Grouping must not sample a hidden draw"); }, true);
  assert.equal(next.state.drawPending, 1);
  assert.deepEqual(next.state.u, compact.u);
});

test("100k search completes its full simulation budget", () => {
  const state = E.createGame({ deck: ["2s", "2c", "3h", "4h", "5d"] });
  const checkpoints = [];
  const result = S.analyze(E.observe(state), { iterations: 100000, timeMs: Infinity, progressInterval: 1000, onProgress: progress => checkpoints.push(progress.simulations) });
  assert.deepEqual(checkpoints, Array.from({ length: 100 }, (_, i) => (i + 1) * 1000));
  assert.equal(result.simulations, 100000);
  assert.ok(result.results.every(row => Number.isFinite(row.score)));
});

test("automatic worker searches 100k and emits precisely the requested checkpoints", () => {
  let options; const messages = [];
  const sandbox = { importScripts() {}, self: { postMessage(message) { messages.push(message); } }, ScoundrelSolver: { analyze(observation, opts) { options = opts; for (let simulations = opts.progressInterval; simulations <= opts.iterations; simulations += opts.progressInterval) opts.onProgress({ results: [], simulations }); return { results: [], simulations: opts.iterations }; } } };
  vm.runInNewContext(fs.readFileSync(require.resolve("../solver-worker.js"), "utf8"), sandbox);
  sandbox.self.onmessage({ data: { requestId: 1, observation: {} } });
  assert.equal(options.iterations, 100000); assert.equal(options.timeMs, Infinity);
  assert.equal(messages.at(-1).target, 100000); assert.equal(messages.at(-1).pending, false);
  assert.deepEqual(messages.map(message => message.simulations), [...Array.from({ length: 10 }, (_, i) => (i + 1) * 1000), ...Array.from({ length: 9 }, (_, i) => (i + 2) * 10000)]);
  assert.ok(messages.slice(0, -1).every(message => message.pending));
});
