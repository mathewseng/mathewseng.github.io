import test from "node:test";
import assert from "node:assert/strict";
import { AutoReview } from "../core/auto-review.mjs";
import { initialState, legalTurns, positionKey, clone, transition } from "../core/rules.mjs";
import { decisionHistory } from "../core/decision-history.mjs";

function fixture() {
  const initial = initialState({ phase: "move", dice: [3, 1], matchLength: 0 });
  const steps = legalTurns(initial)[0].steps;
  return { id: "auto", started: true, config: { mode: "computer", tutor: false, reviewStrength: "quick" }, initial,
    events: [{ actor: 0, action: { type: "move", steps } }], state: transition(initial, { type: "move", steps }, 0) };
}
const result = (state, options) => ({ type: "checker", positionKey: positionKey(state),
  settings: { name: "Quick", plies: 0 }, units: "current-cube-points", status: "complete",
  candidates: [{ steps: options.submitted, equity: .1 }], actual: { steps: options.submitted, equity: .1 }, error: 0 });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
test("committed human decisions are analyzed even with feedback off; exact submitted move is graded and saved", async () => {
  const model = fixture(), before = clone(model.state);
  let calls = 0, saves = 0;
  const reviewer = new AutoReview({ model: () => model, idle: () => true, save: async () => saves++,
    engine: { analyze: async (state, options) => { calls++; assert.equal(options.priority, -10); assert.deepEqual(options.submitted, model.events[0].action.steps); return result(state, options); } } });
  reviewer.update(); reviewer.update();
  await tick(); reviewer.pause();
  assert.equal(calls, 1); assert.equal(saves, 1);
  assert.equal(decisionHistory(model)[0].status, "evaluated");
  assert.deepEqual(model.state, before);
  reviewer.update(); assert.equal(calls, 1);
});
test("background review pauses for gameplay, excludes online play, rejects stale branches and supports retry", async () => {
  let model = fixture(), idle = false, resolve, saves = 0;
  const reviewer = new AutoReview({ model: () => model, idle: () => idle, save: async () => saves++,
    engine: { analyze: (s, o) => new Promise(r => { resolve = () => r(result(s, o)); }) } });
  reviewer.update(); assert.equal(reviewer.job, null);
  idle = true; model.config.mode = "online"; reviewer.update(); assert.equal(reviewer.job, null);
  model.config.mode = "computer"; reviewer.update();
  model.events[0].action.steps = legalTurns(model.initial).at(-1).steps;
  resolve(); await tick(); reviewer.pause(); assert.equal(saves, 0);
  reviewer.engine.analyze = async () => { throw new Error("Offline asset missing"); };
  reviewer.update(); await tick(); reviewer.pause(); assert.equal(reviewer.error, "Offline asset missing");
  reviewer.engine.analyze = async (s, o) => result(s, o);
  reviewer.retry(); await tick(); reviewer.pause(); assert.equal(saves, 1); assert.equal(reviewer.error, null);
});
test("forced checker turns get equity too and normal foreground cancellation is retryable", async () => {
  const model = fixture();
  model.initial.points.fill(0); model.initial.points[0] = 1; model.initial.points[23] = -15;
  model.initial.off = [14, 0]; model.initial.dice = [6, 1];
  model.events[0].action.steps = legalTurns(model.initial)[0].steps;
  let calls = 0;
  const reviewer = new AutoReview({ model: () => model, idle: () => true, save: async () => {},
    engine: { analyze: async (s, o) => { if (!calls++) throw new DOMException("Preempted", "AbortError"); return result(s, o); } } });
  reviewer.update(); await tick(); reviewer.pause(); assert.equal(reviewer.error, null);
  reviewer.update(); await tick(); reviewer.pause();
  assert.equal(decisionHistory(model)[0].status, "evaluated");
});

test("unfinished first attempts are backfilled separately from the accepted move, including cancellation and retry", async () => {
  const model = fixture(), original = legalTurns(model.initial)[1].steps;
  model.events[0].evaluation = { result: result(model.initial, { submitted: model.events[0].action.steps }) };
  model.events[0].initialDecision = { action: { type: "move", steps: original } };
  let calls = 0, saves = 0;
  const reviewer = new AutoReview({ model: () => model, idle: () => true, save: async () => saves++,
    engine: { analyze: async (s, o) => {
      assert.deepEqual(o.submitted, original);
      if (!calls++) throw new DOMException("Preempted", "AbortError");
      const grade = result(s, o); grade.actual.equity = -.05; return grade;
    } } });
  reviewer.update(); await tick(); reviewer.pause();
  assert.equal(reviewer.error, null);
  reviewer.update(); await tick(); reviewer.pause();
  const row = decisionHistory(model)[0];
  assert.ok(Math.abs(row.initialFeedback.loss - .15) < 1e-10);
  assert.equal(row.feedback.loss, 0);
  assert.equal(saves, 1);
  reviewer.update(); assert.equal(calls, 2);
});

test('background jobs snapshot only their immutable action prefix, not the match archive', async()=>{
  const model=fixture();model.undoLog=[{large:'unrelated archive'}];
  let finish;
  const reviewer=new AutoReview({model:()=>model,idle:()=>true,save:async()=>{},
    engine:{analyze:(s,o)=>new Promise(resolve=>{finish=()=>resolve(result(s,o));})}});
  reviewer.update();
  assert.equal(reviewer.job.snapshot.undoLog,undefined);
  assert.deepEqual(reviewer.job.snapshot.events,[{actor:0,action:model.events[0].action}]);
  assert.notEqual(reviewer.job.snapshot.events[0].action,model.events[0].action);
  finish();await tick();reviewer.pause();
});
