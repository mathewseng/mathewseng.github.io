const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../engine.js"), S = require("../solver.js"), Stats = require("../reports/statistics.js");

test("analysis cannot receive a private deck or seed, and hidden permutations produce identical EVs", () => {
  const first = E.createGame({ seed: "privacy-fixture" }), second = JSON.parse(JSON.stringify(first));
  second.deck.reverse(); second.initialDeck.reverse(); second.seed = "different-hidden-shuffle";
  const a = E.observe(first), b = E.observe(second);
  assert.deepEqual(a, b); assert.equal(a.unknownCards.length, 40);
  for (const key of ["deck", "initialDeck", "seed", "history"]) assert.equal(key in a, false);
  assert.throws(() => S.pack(first), /public observation/);
  const options = { iterations: 384, timeMs: 60000 };
  assert.deepEqual(S.analyze(a, options).results, S.analyze(b, options).results);
});

test("every legal action receives an EV; terminal losses are exact without knowing the order", () => {
  const state = E.createGame({ deck: ["As", "2h", "5d", "4s", "3s", "8h"], seed: "fatal" }); state.health = 1;
  const result = S.analyze(E.observe(state), { iterations: 512, timeMs: 60000 });
  assert.equal(result.results.length, E.actions(state).length);
  for (const row of result.results) { assert.ok(Number.isFinite(row.score)); assert.ok(row.samples > 0); if (!row.exact) assert.ok(row.samples >= 48); }
  const fatal = result.results.find(r => r.action.id === "As");
  assert.equal(fatal.score, -20); assert.equal(fatal.exact, true);
});

test("equivalent encounters and return queues share estimates while every action stays available", () => {
  const state = E.createGame({ deck: ["2s", "3s", "3c", "2c"], seed: "equivalent" });
  const { results } = S.analyze(E.observe(state), { iterations: 512, timeMs: 60000 });
  assert.equal(results.length, E.actions(state).length);
  for (const [first, second] of [["2s", "2c"], ["3s", "3c"]]) {
    const a = results.find(r => r.action.id === first), b = results.find(r => r.action.id === second);
    assert.equal(a.score, b.score); assert.equal(a.samples, b.samples);
  }
  const avoidance = results.filter(r => r.action.type === "flee");
  assert.deepEqual(avoidance.map(r => r.action.direction), ["left", "right"]);
  assert.equal(avoidance[0].score, avoidance[1].score);
  assert.equal(avoidance[0].samples, avoidance[1].samples);
});

test("sampled transitions match the real engine when draws reveal the same cards", () => {
  for (let seed = 0; seed < 12; seed++) {
    let state = E.createGame({ seed: "transitions-" + seed });
    for (let turn = 0; E.actions(state).length && turn < 80; turn++) {
      const legal = E.actions(state);
      for (const action of legal) {
        const observed = E.observe(state), compact = S.pack(observed);
        let actual = E.transition(state, action);
        if (actual.phase === "ready") actual = E.transition(actual, { type: "descend" });
        const nextCards = actual.room.filter(Boolean);
        const carried = new Set(action.type === "flee" ? [] : state.room.filter(c => c && c.id !== action.id).map(c => c.id));
        const draws = nextCards.filter(c => !carried.has(c.id));
        const unknown = compact.u.slice(); let cursor = 0;
        const rng = () => { const target = S.encode(draws[cursor++]), index = unknown.indexOf(target), length = unknown.length; assert.ok(index >= 0); unknown.splice(index, 1); return (index + .5) / length; };
        const next = S.step(compact, S.actionMove(observed, action), rng);
        if (next.score != null) assert.equal(next.score, E.score(actual));
        else assert.deepEqual(next.state, S.pack(E.observe(actual)));
      }
      state = E.transition(state, legal[(turn * 7 + seed) % legal.length]);
    }
  }
});

test("all published hidden-deck policy runs replay to their recorded outcomes", () => {
  const data = require("../reports/outcomes.json"); Stats.validate(data);
  assert.equal(data.policy.revision, "a09ccb03f12ea7614c61a1e8d79537c0285f3167a295bc0a97865784413f6b8b", "published study retains its frozen policy revision; later solver changes do not rewrite historical results");
  for (const row of require("../scripts/study-data.cjs").iterateRows(data, require.resolve("../reports/outcomes.json"))) {
    let state = E.createGame({ seed: row.seed, keepSlots: data.policy.keepSlots === true });
    for (const action of row.line) state = E.transition(state, action);
    assert.ok(["won", "lost"].includes(state.phase)); assert.equal(E.score(state), row.score);
    assert.equal(row.survived, state.phase === "won"); assert.equal(row.verified, true);
  }
});

test("statistics preserve whole-number medians and half points only when needed", () => {
  const s = Stats.summarize([{ score: -10 }, { score: 20 }, { score: 30 }, { score: 10 }]);
  assert.equal(s.sum, 50); assert.equal(s.mean, 12.5); assert.equal(s.median, 15); assert.equal(s.wins, 3);
  assert.equal(s.q1, 5); assert.equal(s.q3, 22.5);
  assert.equal(Stats.median([29, 30]), 29.5); assert.equal(Stats.median([30, 30]), 30); assert.equal(Stats.median([]), null);
});

test("quartiles interpolate order statistics and handle empty, singleton, and tied samples", () => {
  const scores = [40, 0, 30, 10, 20];
  assert.equal(Stats.quantile(scores, .25), 10); assert.equal(Stats.quantile(scores, .75), 30);
  assert.deepEqual(scores, [40, 0, 30, 10, 20]);
  const percentiles = Stats.summarize(scores.map(score => ({ score }))).percentiles;
  assert.deepEqual(percentiles, Array.from({ length: 19 }, (_, i) => ({ percentile: (i + 1) * 5, value: (i + 1) * 2 })));
  assert.ok(Stats.summarize([]).percentiles.every(p => p.value === null));
  assert.ok(Stats.summarize([{ score: 7 }]).percentiles.every(p => p.value === 7));
  assert.equal(Stats.quantile([], .25), null); assert.equal(Stats.quantile([7], .75), 7);
  assert.equal(Stats.quantile([2, 2, 2, 2], .25), 2);
});

test("report rejects hindsight studies, incomplete cohorts, and invalid outcomes", () => {
  const source = require("../reports/outcomes.json"); assert.equal(Stats.validate(source), source);
  const rows = require("../scripts/study-data.cjs").readRows(source, require.resolve("../reports/outcomes.json"), 10);
  const data = { ...source, version: 3, requestedDeals: rows.length, rows }; Stats.validate(data);
  assert.throws(() => Stats.validate({ ...data, version: 2 }));
  assert.throws(() => Stats.validate({ ...data, rows: data.rows.slice(1) }));
  assert.throws(() => Stats.validate({ ...data, policy: { ...data.policy, exact: true } }));
  for (const patch of [{ verified: false }, { score: 31 }, { seed: "wrong" }, { index: 1 }]) assert.throws(() => Stats.validate({ ...data, rows: [{ ...data.rows[0], ...patch }, ...data.rows.slice(1)] }));
});
