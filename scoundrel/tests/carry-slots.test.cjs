const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../engine.js"), S = require("../solver.js"), Native = require("../scripts/native-solver.cjs");

test("every carry slot stays fixed while empty slots refill left to right, including partial final rooms", () => {
  for (let slot = 0; slot < 4; slot++) for (let count = 1; count <= 4; count++) {
    let state = E.createGame({ deck: ["2d", "3d", "4d", "5d", ...["6h", "7h", "8h", "9h"].slice(0, count)] });
    const carry = state.room[slot];
    for (const card of state.room.filter(card => card.id !== carry.id)) state = E.transition(state, { type: "equip", id: card.id });
    const deck = state.deck.slice(), original = JSON.stringify(state);
    const next = E.transition(state, { type: "descend" });
    assert.equal(JSON.stringify(state), original, "pure transition");
    assert.equal(next.room[slot].id, carry.id);
    assert.deepEqual(next.room.filter((card, index) => card && index !== slot).map(card => card.id), deck.slice(0, 3).map(card => card.id));
    assert.equal(next.room.length, 4);
    for (const direction of ["left", "right"]) {
      const order = next.room.filter(Boolean).map(card => card.id);
      assert.deepEqual(E.fleeOrder(next, direction).map(card => card.id), direction === "right" ? order.reverse() : order);
    }
  }
});

test("legacy study layout remains reproducible when explicitly selected", () => {
  let state = E.createGame({ deck: ["2d", "3d", "4d", "5d", "6h", "7h", "8h"], keepSlots: false });
  for (const id of ["2d", "3d", "4d"]) state = E.transition(state, { type: "equip", id });
  state = E.transition(state, { type: "descend" });
  assert.deepEqual(state.room.map(card => card.id), ["5d", "6h", "7h", "8h"]);
});

test("equal-rank monsters in different slots stay distinct when a future return order can differ", () => {
  const state = E.createGame({ deck: ["2s", "3d", "4h", "2c", "5s", "6h", "7d", "8s"] });
  const observation = E.observe(state), packed = S.pack(observation);
  const a = S.actionMove(observation, { type: "fight", id: "2s", mode: "bare" });
  const b = S.actionMove(observation, { type: "fight", id: "2c", mode: "bare" });
  assert.notEqual(a, b); assert.notEqual(S.outcomeKey(packed, a), S.outcomeKey(packed, b));
});

test("native and browser continuation estimates agree with carried cards in every slot", async () => {
  const native = Native.createSolver();
  try {
    for (let slot = 0; slot < 4; slot++) {
      let state = E.createGame({ deck: ["2d", "3d", "4d", "5d", "6h", "7h", "8h", "9s", "Ts"] });
      const carry = state.room[slot];
      for (const card of state.room.filter(card => card.id !== carry.id)) state = E.transition(state, { type: "equip", id: card.id });
      state = E.transition(state, { type: "descend" });
      const observation = E.observe(state), options = { iterations: 512, timeMs: Infinity };
      const a = S.analyze(observation, options), b = await native.analyze(observation, options);
      for (let i = 0; i < a.results.length; i++) {
        assert.equal(a.results[i].samples, b.results[i].samples);
        assert.ok(Math.abs(a.results[i].score - b.results[i].score) < 1e-9);
      }
    }
  } finally { native.close(); }
});

test("extending search retains the tree and random stream rather than restarting", () => {
  const observation = E.observe(E.createGame({ deck: ["2s", "2c", "3h", "4h", "5d"] }));
  const initial = S.analyze(observation, { iterations: 100000, timeMs: Infinity });
  const updates = [], extended = initial.extend({ iterations: 1000000, timeMs: Infinity, progressInterval: 10000, onProgress: row => updates.push(row.simulations) });
  const direct = S.analyze(observation, { iterations: 1000000, timeMs: Infinity });
  assert.equal(extended.simulations, 1000000); assert.deepEqual(extended.results, direct.results);
  assert.deepEqual(updates, Array.from({ length: 90 }, (_, i) => 110000 + i * 10000));
});
