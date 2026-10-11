import test from "node:test";
import assert from "node:assert/strict";
import { ADAPTIVE_SEARCH, runAdaptive } from "../engine/adaptive.mjs";
import { EngineClient } from "../engine/client.mjs";
import { createEvaluator } from "../engine/evaluate.mjs";
import { initialState, legalTurns, legalPaths, boardKey } from "../core/rules.mjs";
import { PRESETS } from "../engine/metadata.mjs";

test("adaptive search publishes complete, comparable depths and stops at its budget", () => {
  let clock = 0;
  const seen = [];
  const result = runAdaptive({ analyze(state, preset, kind, submitted) {
    assert.equal(submitted, "actual");
    clock += [20, 80, 300, 800][PRESETS[preset].plies];
    return { settings: PRESETS[preset], elapsedMs: 20, actual: { equity: 1 }, status: "complete" };
  } }, {}, "checker", "actual", r => seen.push(r), () => clock);
  assert.deepEqual(seen.map(r => r.settings.plies), [0, 1, 2, 3]);
  assert.deepEqual(seen.map(r => r.budget.levels.length), [1, 2, 3, 4]);
  assert.equal(result.budget.reason, "time-budget");
  assert.equal(result.elapsedMs, 1200);
  assert.equal(result.status, "complete");
});

test("easy positions reach maximum depth; even slow first evaluations complete", () => {
  for (const delay of [2, 1500]) {
    let clock = 0;
    const r = runAdaptive({ analyze(s, preset) {
      clock += delay;
      return { settings: PRESETS[preset], elapsedMs: delay };
    } }, {}, "checker", null, () => {}, () => clock);
    assert.equal(r.settings.plies, delay === 2 ? 4 : 0);
    assert.equal(r.budget.reason, delay === 2 ? "maximum-depth" : "time-budget");
  }
});

class WorkerMock {
  messages = [];
  postMessage(data) { this.messages.push(data); }
  reply(data) { this.onmessage({ data }); }
  terminate() { this.terminated = true; }
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const completed = (plies = 2) => ({
  status: "complete", settings: { plies }, candidates: [{ key: "best", equity: .25 }],
  actual: { key: "actual", equity: .2 }, error: .05,
  budget: { targetMs: 1000, levels: [{ plies }], reason: "searching" },
});

test("deadline keeps the last complete depth, interrupts WASM and rejects late messages", async () => {
  const workers = [], client = new EngineClient({ workerFactory: () => {
    const w = new WorkerMock(); workers.push(w); return w;
  } });
  try {
    const s = initialState({ phase: "move", dice: [3, 1] }), updates = [];
    const pending = client.analyze(s, { preset: "auto", onEvaluation: r => updates.push(r) });
    // Initialization time is not deducted from the search budget.
    assert.equal(client.budgetTimeout, undefined);
    workers[0].reply({ id: 0, type: "ready", elapsedMs: 3000 });
    await tick();
    const id = client.active.id, job = client.active;
    workers[0].reply({ id, type: "evaluation", result: completed(1) });
    assert.equal(updates.length, 1);
    workers[0].reply({ id, type: "evaluation", result: completed(2) });
    job.started = performance.now() - ADAPTIVE_SEARCH.targetMs;
    client.finishBudget(job);
    const answer = await pending;
    assert.equal(answer.settings.plies, 2);
    assert.equal(answer.error, .05);
    assert.equal(answer.status, "complete");
    assert.equal(answer.budget.reason, "time-budget");
    assert.equal(workers[0].terminated, true);
    assert.ok((await client.analyze(s, { preset: "auto" })).cached);
    const next = client.analyze({ ...s, dice: [2, 1] }, { preset: "auto" });
    workers[1].reply({ id: 0, type: "ready", elapsedMs: 30 });
    await tick();
    workers[0].reply({ id, type: "result", result: completed(4) });
    workers[0].onerror({ message: "stale failure" });
    workers[1].reply({ id: client.active.id, type: "result", result: completed(3) });
    assert.equal((await next).settings.plies, 3);
  } finally { client.destroy(); }
});

test("no completed evaluation at deadline waits for Quick; explicit cancellation still rejects", async () => {
  for (const cancel of [false, true]) {
    const w = new WorkerMock(), client = new EngineClient({ workerFactory: () => w });
    try {
      const pending = client.analyze(initialState({ phase: "roll" }), { preset: "auto" });
      w.reply({ id: 0, type: "ready", elapsedMs: 1 });
      await tick();
      const job = client.active;
      job.started = performance.now() - 1500;
      client.finishBudget(job);
      assert.equal(w.terminated, undefined);
      if (cancel) {
        const rejected = assert.rejects(pending, { name: "AbortError" });
        client.cancel();
        await rejected;
      } else {
        w.reply({ id: job.id, type: "evaluation", result: completed(0) });
        assert.equal((await pending).settings.plies, 0);
        assert.equal(w.terminated, true);
      }
    } finally { client.destroy(); }
  }
});

test("deeper evaluation reuses full 2-ply screening only for the identical context", () => {
  const calls = [];
  const engine = createEvaluator({
    cwrap(name) {
      if (name === "init") return () => 0;
      return (...args) => {
        calls.push({ name, args });
        return JSON.stringify({ equity: .2, cubeless: .1, mwc: null, probabilities: [.5, .1, .01, .1, .01] });
      };
    },
    UTF8ToString: p => p, _free() {},
  });
  const state = initialState({ phase: "move", dice: [3, 1] }), n = legalTurns(state).length;
  const deep = engine.analyze(state, "deep");
  deep.candidates[0].equity = 999; // A displayed/saved result cannot mutate screening.
  const expert = engine.analyze(state, "expert");
  assert.equal(calls.filter(c => c.args[2] === 2).length, n);
  assert.ok(expert.candidates.every(c => c.equity === .2));
  engine.analyze(state, "research", "checker", legalTurns(state).at(-1).steps);
  assert.equal(calls.filter(c => c.args[2] === 2).length, n);
  engine.analyze({ ...state, matchLength: 7, scores: [2, 4] }, "expert");
  assert.equal(calls.filter(c => c.args[2] === 2).length, n * 2);
});

test("automatic screening always includes arbitrary played moves and never pollutes exhaustive presets", () => {
  const keys = new Map();
  const engine = createEvaluator({
    cwrap(name) {
      if (name === "init") return () => 0;
      return (original, after, depth) => {
        if (!keys.has(after)) keys.set(after, keys.size);
        return JSON.stringify({equity:-keys.get(after)/1000, cubeless:0,mwc:null,probabilities:[.5,0,0,0,0]});
      };
    }, UTF8ToString:p=>p,_free() {},
  });
  const state = initialState({phase:"move",dice:[3,3]}), turns = legalTurns(state);
  const quick = engine.analyze(state,"quick");
  const actual = turns.find(t=>t.key===quick.candidates.at(-1).key).steps;
  const auto = engine.analyze(state,"deep","checker",actual,{automatic:true});
  assert.equal(auto.candidates.length,25);
  assert.equal(auto.actual.key,quick.candidates.at(-1).key);
  assert.equal(auto.screening.plies,0);
  assert.equal(auto.screening.total,turns.length);
  const deeper = engine.analyze(state,"research","checker",actual,{automatic:true});
  assert.equal(deeper.actual.key,auto.actual.key);
  assert.equal(deeper.screening.initial.plies,0);
  assert.equal(deeper.settings.rootFilter.maximum,24);
  const exhaustive = engine.analyze(state,"deep");
  assert.equal(exhaustive.candidates.length,turns.length);
  assert.equal(exhaustive.screening,null);
  assert.equal(exhaustive.settings.rootFilter,undefined);
});

test("equivalent submitted paths share automatic analysis; callbacks cannot alter retained equity", async () => {
  const w = new WorkerMock(), client = new EngineClient({workerFactory:()=>w});
  try {
    const state=initialState({phase:"move",dice:[3,1]}), paths=legalPaths(state);
    const first=paths.find(a=>paths.some(b=>a!==b&&boardKey(a.state)===boardKey(b.state)));
    const second=paths.find(b=>b!==first&&boardKey(b.state)===boardKey(first.state));
    const a=client.analyze(state,{preset:"auto",submitted:first.steps,onEvaluation:r=>r.candidates[0].equity=100});
    const b=client.analyze(state,{preset:"auto",submitted:second.steps});
    w.reply({id:0,type:"ready",elapsedMs:1});await tick();
    assert.equal(w.messages.filter(m=>m.type==="analyze").length,1);
    const job=client.active,key=boardKey(first.state),result=completed(2);
    result.candidates=[{key,equity:.25}];result.actual=result.candidates[0];result.error=0;
    w.reply({id:job.id,type:"evaluation",result});
    client.finishBudget(job);
    assert.equal((await a).actual.equity,.25);
    assert.equal((await b).actual.equity,.25);
    assert.equal((await b).error,0);
    await assert.rejects(client.analyze(state,{preset:"auto",submitted:[first.steps[0]]}),/legal|dice|complete/i);
  } finally {client.destroy();}
});

test("an analysis-send failure rejects the active job and permits retry", async () => {
  const workers=[],client=new EngineClient({workerFactory:()=>{
    const w=new WorkerMock();workers.push(w);
    if(workers.length===1)w.postMessage=function(data){if(data.type==="analyze")throw Error("send failed");this.messages.push(data);};
    return w;
  }});
  try {
    const state=initialState({phase:"roll"}),first=client.analyze(state,{preset:"auto"});
    const rejection=assert.rejects(first,/send failed/);
    workers[0].reply({id:0,type:"ready",elapsedMs:1});await rejection;
    assert.equal(workers[0].terminated,true);
    const retry=client.analyze(state,{preset:"auto"});
    workers[1].reply({id:0,type:"ready",elapsedMs:1});await tick();
    workers[1].reply({id:client.active.id,type:"result",result:completed(4)});
    assert.equal((await retry).settings.plies,4);
  } finally {client.destroy();}
});
