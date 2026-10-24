import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  transition,
  positionKey,
  clone,
  legalTurns,
} from "../core/rules.mjs";
import {
  decisionHistory,
  decisionTotals,
  compactEvaluation,
  mergeEvaluations,
  sameDecisionPrefix,
  groupDecisionTurns,
} from "../core/decision-history.mjs";
import { gradeCube } from "../engine/cube-grade.mjs";
function fixture() {
  const initial = initialState({ phase: "roll", matchLength: 0 });
  let state = initial;
  const events = [];
  for (const [actor, action] of [
    [0, { type: "double" }],
    [1, { type: "pass" }],
    [0, { type: "next" }],
    [0, { type: "opening", dice: [6, 1] }],
  ]) {
    const before = state;
    state = transition(state, action, actor);
    const event = { actor, action };
    if (action.type === "double")
      event.evaluation = compactEvaluation(
        before,
        gradeCube(
          before,
          {
            type: "cube",
            status: "complete",
            units: "current-cube-points",
            positionKey: positionKey(before),
            outcomes: [0.2, 0.1, 1],
            settings: { name: "Quick", plies: 0 },
          },
          "double",
        ),
      );
    events.push(event);
  }
  const steps = legalTurns(state)[0].steps;
  events.push({ actor: 0, action: { type: "move", steps } });
  return { initial, events };
}
test("session decisions span games, count missing grades separately and preserve original cube units", () => {
  const m = fixture(),
    rows = decisionHistory(m);
  assert.deepEqual(
    rows.map((r) => r.game),
    [1, 1, 2],
  );
  assert.deepEqual(
    rows.map((r) => r.status),
    ["evaluated", "pending", "pending"],
  );
  const t = decisionTotals(rows, 0);
  assert.equal(t.evaluated, 1);
  assert.equal(t.pending, 1);
  assert.equal(t.loss, 0.1);
  assert.equal(decisionTotals(rows, 1).evaluated, 0);
  m.events[0].evaluation.result.positionKey = "stale";
  assert.equal(decisionHistory(m)[0].status, "pending");
});
test("saved analysis follows only an identical replay prefix, preserving fresh grades and annotations", () => {
  const saved = fixture(),
    current = clone(saved);
  delete current.events[0].evaluation;
  mergeEvaluations(current, saved);
  assert.deepEqual(current.events[0].evaluation, saved.events[0].evaluation);
  current.events[0].evaluation.result.requestId = "new";
  mergeEvaluations(current, saved);
  assert.equal(current.events[0].evaluation.result.requestId, "new");
  assert.ok(sameDecisionPrefix(saved, current, 3));
  current.events[0].action = { type: "roll", dice: [6, 2] };
  delete current.events[0].evaluation;
  assert.equal(sameDecisionPrefix(saved, current, 3), false);
  mergeEvaluations(current, saved);
  assert.equal(current.events[0].evaluation, undefined);
});

test("saved checker reviews retain ten ranked candidates and the actual submitted move", () => {
  const candidates = Array.from({ length: 18 }, (_, i) => ({
    equity: 1 - i / 100,
    steps: [{ from: 5, to: 4, die: 1 }],
  }));
  const original = { type: "checker", candidates, actual: candidates[17] };
  const saved = compactEvaluation(null, original).result;
  assert.equal(saved.candidates.length, 10);
  assert.equal(saved.evaluatedCount, 18);
  assert.deepEqual(saved.actual, candidates[17]);
  assert.equal(original.candidates.length, 18);
  saved.candidates[0].steps[0].to = 3;
  assert.equal(original.candidates[0].steps[0].to, 4);
});

test("saved reviews drop discarded search paths but retain screening facts and the submitted move", () => {
  const original = {type:'checker', candidates:[{key:'best',equity:.4}],
    actual:{key:'submitted',equity:.2}, error:.2,
    screening:{plies:2,finalists:8,total:1200,retainedLeader:true,
      excluded:Array.from({length:1192},(_,i)=>({key:String(i),steps:[{from:23,to:22,die:1}]})),
      initial:{plies:0,finalists:32,total:1200,excluded:[{key:'discarded'}]}}};
  const saved=compactEvaluation(null,original).result;
  assert.deepEqual(saved.screening,{plies:2,finalists:8,total:1200,retainedLeader:true,
    initial:{plies:0,finalists:32,total:1200}});
  assert.deepEqual(saved.actual,original.actual);
  assert.equal(saved.error,.2);
  assert.equal(original.screening.excluded.length,1192);
  assert.ok(JSON.stringify(saved).length<500);
  saved.screening.initial.finalists=1;
  assert.equal(original.screening.initial.finalists,32);
});

function turnFixture(initial = initialState({phase: "roll", matchLength: 0})) {
  const model = {initial, events: [], state: initial};
  return {
    model,
    add(type, actor = model.state.turn, extra = {}) {
      const action = {type, ...extra};
      model.state = transition(model.state, action, actor);
      model.events.push({actor, action});
    },
    move() { this.add("move", model.state.turn, {steps: legalTurns(model.state)[0].steps}); },
  };
}

test("turn rows combine pre-roll and checker play without combining successive turns", () => {
  const f = turnFixture();
  for (let n = 0; n < 3; n++) { f.add("roll", f.model.state.turn, {dice: [3, 1]}); f.move(); }
  const rows = decisionHistory(f.model), before = clone(rows), groups = groupDecisionTurns(rows);
  assert.deepEqual(groups.map(g => [g.turn, g.player, g.decisions.map(r => r.action.type)]),
    [[1, 0, ["roll", "move"]], [2, 1, ["roll", "move"]], [3, 0, ["roll", "move"]]]);
  assert.deepEqual(rows, before, "display grouping never mutates decision records");
  assert.deepEqual(groupDecisionTurns([...rows].reverse()), groups, "independent of display sorting");
  assert.deepEqual(groups.flatMap(g => g.decisions).map(r => r.index), rows.map(r => r.index));
});

test("cube exchange preserves responder identity, original cube and return targets", () => {
  const f = turnFixture();
  f.add("double"); f.add("take", 1); f.add("roll", 0, {dice: [4, 2]}); f.move();
  const groups = groupDecisionTurns(decisionHistory(f.model));
  const own = groups.find(g => g.player === 0), response = groups.find(g => g.player === 1);
  assert.deepEqual(own.decisions.map(r => [r.index, r.action.type, r.source.cube.value]), [[0, "double", 1], [3, "move", 2]]);
  assert.equal(own.response, false);
  assert.equal(response.response, true);
  assert.deepEqual(response.decisions.map(r => [r.index, r.action.type]), [[1, "take"]]);
  assert.equal(own.turn, response.turn);
});

test("beaver/raccoon responses retain all decisions without crossing a game boundary", () => {
  const f = turnFixture(initialState({phase:"roll", matchLength:0, rules:{immediateRedoubles:2}}));
  f.add("double", 0); f.add("beaver", 1); f.add("raccoon", 0); f.add("take", 1);
  f.add("roll", 0, {dice:[5,2]}); f.move();
  const groups = groupDecisionTurns(decisionHistory(f.model));
  assert.deepEqual(groups.find(g => g.player === 0).decisions.map(r => r.action.type), ["double", "raccoon", "move"]);
  assert.deepEqual(groups.find(g => g.player === 1).decisions.map(r => r.action.type), ["beaver", "take"]);
  const games = groupDecisionTurns(decisionHistory(fixture()));
  assert.deepEqual(games.map(g => [g.game, g.turn, g.player]), [[1,1,0], [1,1,1], [2,1,0]]);
});

test("opening ties, pending rolls, and forced passes do not blur turn boundaries", () => {
  const f = turnFixture(initialState({matchLength:0}));
  f.add("opening", 0, {dice:[3,3]}); f.add("opening", 0, {dice:[6,1]}); f.move();
  f.add("roll", 1, {dice:[4,2]});
  const groups = groupDecisionTurns(decisionHistory(f.model));
  assert.deepEqual(groups.map(g => [g.turn, g.decisions.map(r => r.action.type)]), [[1,["move"]], [2,["roll"]]]);
  const blocked = initialState({phase:"move", dice:[1,2], matchLength:0});
  blocked.points = Array(24).fill(0); blocked.bar=[1,0]; blocked.off=[14,0];
  blocked.points[23]=-7; blocked.points[22]=-8;
  const pass = turnFixture(blocked); pass.move(); pass.add("roll", 1, {dice:[6,3]}); pass.move();
  const passed = groupDecisionTurns(decisionHistory(pass.model));
  assert.equal(passed[0].decisions[0].label, "Pass — no legal move");
  assert.equal(passed[0].decisions[0].forced, true);
  assert.equal(passed[1].turn, 2);
});

test('session totals are cube-independent for each player and mixed cube values',()=>{
  const rows=[1,2,16,64].flatMap(value=>[0,1].map(player=>({player,source:{matchLength:0,cube:{value}},feedback:{loss:.01},status:'complete'})));
  for(const player of [0,1]) {
    const totals=decisionTotals(rows,player);
    assert.equal(totals.loss,.04);
    assert.equal(totals.evaluated,4);
    assert.equal(totals.lossUnits,'normalized-equity');
  }
});
