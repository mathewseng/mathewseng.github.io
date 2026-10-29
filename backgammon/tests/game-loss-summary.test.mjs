import test from "node:test";
import assert from "node:assert/strict";
import { initialState, legalTurns, positionKey, clone } from "../core/rules.mjs";
import { playAction, undoTurn } from "../core/table.mjs";
import { beginDecisionAttempt, recordInitialEvaluation, currentAttempt, decisionAttempts, markHintSeen, decisionHintSeen } from "../core/decision-attempt.mjs";
import { decisionHistory, compactEvaluation, mergeEvaluations } from "../core/decision-history.mjs";
import { gameLossSummary } from "../core/game-loss-summary.mjs";
import { returnToDecision } from "../core/practice.mjs";

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} ≈ ${b}`);
const fixture = (phase = "move") => {
  const state = initialState({ phase, dice: phase === "move" ? [4, 1] : [], matchLength: 0 });
  return { id: "summary", started: true, initial: state, state, events: [], config: { mode: "computer" } };
};
const grade = (state, steps, loss) => compactEvaluation(state, {
  type: "checker", positionKey: positionKey(state), status: "complete", units: "current-cube-points",
  candidates: [{ equity: .2, steps: legalTurns(state)[1].steps }], actual: { equity: .2 - loss, steps },
});

test("first submission survives revision, reload, commit and committed takeback", () => {
  let game = fixture();
  const original = { type: "move", steps: legalTurns(game.state)[0].steps };
  const accepted = { type: "move", steps: legalTurns(game.state)[1].steps };
  beginDecisionAttempt(game, original);
  recordInitialEvaluation(game, original, grade(game.state, original.steps, .08));
  game = JSON.parse(JSON.stringify(game));
  beginDecisionAttempt(game, accepted);
  recordInitialEvaluation(game, accepted, grade(game.state, accepted.steps, .01));
  assert.deepEqual(currentAttempt(game).action, original);
  game = playAction(game, accepted);
  game.events[0].evaluation = grade(game.initial, accepted.steps, .01);
  assert.equal(game.initialDecision, undefined);
  let row = decisionHistory(game)[0];
  near(row.initialFeedback.loss, .08);
  near(row.feedback.loss, .01);
  game = undoTurn(game, 0, 0);
  assert.deepEqual(currentAttempt(game).action, original);
  game = playAction(game, original);
  game.events[0].evaluation = grade(game.initial, original.steps, .08);
  row = decisionHistory(game)[0];
  near(row.initialFeedback.loss, .08);
  assert.equal(gameLossSummary(decisionHistory(game), 1).players[0].checker.initial.count, 1,
    "abandoned history branches never double count");
});

test("initial cube choice is independent of rolled dice and reuses all-option cube analysis", () => {
  let game = fixture("roll");
  beginDecisionAttempt(game, { type: "double" });
  game = playAction(game, { type: "roll", dice: [4, 1] });
  game.events[0].evaluation = { result: { type: "cube", positionKey: positionKey(game.initial),
    status: "complete", units: "current-cube-points", outcomes: [.2, .1, 1] } };
  const row = decisionHistory(game)[0];
  near(row.initialFeedback.loss, .1);
  near(row.feedback.loss, 0);
  const stats = gameLossSummary([row], 1).players[0].cube;
  assert.equal(stats.initial.mistakes, 1);
  assert.equal(stats.accepted.mistakes, 0);
  const fresh = fixture("roll");
  beginDecisionAttempt(fresh, { type: "roll" });
  const rolled = playAction(fresh, { type: "roll", dice: [6, 1] });
  rolled.events[0].evaluation = game.events[0].evaluation;
  assert.equal(decisionHistory(rolled)[0].initialFeedback.loss, 0);
});

test("viewed hints survive reload only for their decision and remain known after a takeback", () => {
  let game = fixture();
  assert.equal(decisionHintSeen(game),false);
  markHintSeen(game);
  assert.equal(game.initialDecision,undefined,'viewing a hint is not a submitted attempt');
  game = JSON.parse(JSON.stringify(game));
  assert.equal(decisionHintSeen(game),true);
  const different = clone(game); different.state.dice=[6,1];
  assert.equal(decisionHintSeen(different),false,'a replaced roll never inherits a hint');
  game=playAction(game,{type:'move',steps:legalTurns(game.state)[1].steps});
  game.events[0].choiceMethod='hint';
  assert.equal(game.hintDecision,undefined,'a committed decision releases its live hint marker');
  assert.equal(decisionHintSeen(game),false);
  const restored=undoTurn(game,0,0);
  assert.equal(decisionHintSeen(restored),true,'returning to the hinted decision cannot claim Found');
});

test("multiple submitted choices retain ordered grades across reload, acceptance and takeback without changing initial totals", () => {
  let game = fixture();
  const actions = legalTurns(game.state).slice(0, 3).map(turn => ({type:'move',steps:turn.steps}));
  for (const [index, action] of actions.entries()) {
    beginDecisionAttempt(game, action);
    beginDecisionAttempt(game, action); // Reconfirming an unchanged draft is not another attempt.
    recordInitialEvaluation(game, action, grade(game.state, action.steps, [.08,.04,0][index]));
    game = JSON.parse(JSON.stringify(game));
  }
  assert.equal(decisionAttempts(currentAttempt(game)).length, 3);
  game = playAction(game, actions[2]);
  game.events[0].evaluation = grade(game.initial, actions[2].steps, 0);
  const row = decisionHistory(game)[0];
  assert.deepEqual(row.attempts.map(attempt => attempt.action), actions);
  row.attempts.forEach((attempt,index) => near(attempt.feedback.loss,[.08,.04,0][index]));
  near(gameLossSummary([row],1).players[0].checker.initial.total,.08);
  const saved = clone(game), ungraded = clone(game);
  delete ungraded.events[0].initialDecision.revisions[0].evaluation;
  mergeEvaluations(ungraded, saved);
  near(decisionHistory(ungraded)[0].attempts[1].feedback.loss,.04);
  ungraded.events[0].initialDecision.revisions[0].action = actions[0];
  delete ungraded.events[0].initialDecision.revisions[0].evaluation;
  mergeEvaluations(ungraded, saved);
  assert.equal(ungraded.events[0].initialDecision.revisions[0].evaluation,undefined,'grades never cross a different draft revision');
  game = undoTurn(game,0,0);
  assert.deepEqual(decisionAttempts(currentAttempt(game)).map(attempt => attempt.action), actions);
});

test("new uncorrected choices reuse accepted grades; older first attempts are explicitly unknown", () => {
  const before = fixture();
  const action = { type: "move", steps: legalTurns(before.state)[0].steps };
  const game = playAction(before, action);
  game.events[0].evaluation = grade(before.state, action.steps, .03);
  const rows = decisionHistory(game);
  near(rows[0].initialFeedback.loss, .03);
  delete game.events[0].initialDecision;
  const legacy = gameLossSummary(decisionHistory(game), 1).players[0].checker;
  assert.equal(legacy.initial.unavailable, 1);
  assert.equal(legacy.initial.average, null);
  near(legacy.accepted.total, .03);
});

test("pending first attempts and their grades cannot leak to another position or history branch", () => {
  const game = fixture();
  const action = { type: "move", steps: legalTurns(game.state)[0].steps };
  beginDecisionAttempt(game, action);
  game.initialDecision.positionKey = "stale";
  assert.equal(currentAttempt(game), null);
  const accepted = { type: "move", steps: legalTurns(game.state)[1].steps };
  const next = playAction(game, accepted);
  assert.deepEqual(next.events[0].initialDecision.action, accepted);
  next.initialDecision = { index: 0, positionKey: positionKey(game.initial), action };
  const restored = returnToDecision(next, 0, game.initial);
  assert.equal(restored.initialDecision, undefined);
  const saved = clone(next), current = clone(next);
  delete current.events[0].initialDecision;
  mergeEvaluations(current, saved);
  assert.deepEqual(current.events[0].initialDecision, saved.events[0].initialDecision);
});

test("totals separate games/players, ignore cube multipliers, use evaluated turns for averages and exclude passes", () => {
  const row = (player, kind, initial, accepted, cube = 1, extra = {}) => ({
    player, game: 2, forced: false, action: { type: kind, steps: [{}] },
    source: { cube: { value: cube } }, initialAction: { type: kind },
    initialFeedback: initial === null ? null : { loss: initial },
    feedback: accepted === null ? null : { loss: accepted }, ...extra,
  });
  const rows = [row(0, "move", .04, .01, 2), row(0, "move", .06, .02, 4),
    row(0, "move", null, null, 1, { forced: true }),
    row(0, "move", null, null),
    row(0, "move", 0, 0, 1, { forced: true, action: { type: "move", steps: [] } }),
    row(0, "roll", .002, 0, 64), row(0, "double", .1, .003, 2),
    row(1, "take", .3, .2, 2), row(1, "move", .2, .1),
    row(0, "move", 99, 99, 1, { game: 1 })];
  const money = gameLossSummary(rows, 2), own = money.players[0];
  near(own.checker.initial.total, .1);
  near(own.checker.accepted.total, .03);
  near(own.checker.initial.average, .1 / 3);
  assert.equal(own.checker.initial.pending, 1);
  assert.equal(own.checker.initial.count, 4);
  near(own.cube.initial.total, .102);
  assert.equal(own.cube.initial.mistakes, 1, "mistake threshold applies independent of cube value");
  assert.equal(own.cube.accepted.mistakes, 1);
  near(money.players[1].cube.accepted.total, .2);
  const match = gameLossSummary(rows, 2, 7);
  near(match.players[0].checker.initial.total, .1);
  near(match.players[0].cube.initial.total, .102);
  const empty = gameLossSummary([], 2).players[0];
  assert.equal(empty.checker.accepted.total, 0);
  assert.equal(empty.checker.accepted.average, null);
});
