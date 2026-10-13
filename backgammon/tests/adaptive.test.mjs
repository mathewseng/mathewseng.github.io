import test from "node:test";
import assert from "node:assert/strict";
import { runAdaptive } from "../engine/adaptive.mjs";
import { EngineClient } from "../engine/client.mjs";
import { createEvaluator } from "../engine/evaluate.mjs";
import { initialState, legalTurns, legalPaths, boardKey } from "../core/rules.mjs";
import { PRESETS } from "../engine/metadata.mjs";

test("Auto cube completes three plies but does not extrapolate warm-cache timings into four", () => {
  let clock = 0;
  const seen = [];
  const result = runAdaptive({ analyze(state, preset, kind, submitted) {
    assert.equal(submitted, "actual");
    clock += [20, 80, 300, 800, 1400][PRESETS[preset].plies];
    return { type:"cube", settings: PRESETS[preset], actual: { equity: 1 }, status: "complete" };
  } }, initialState({phase:"roll"}), "cube", "actual", r => seen.push(r), () => clock);
  assert.deepEqual(seen.map(r => r.settings.plies), [0, 1, 2, 3]);
  assert.deepEqual(seen.map(r => r.budget.levels.length), [1, 2, 3, 4]);
  assert.equal(result.budget.reason, "cube-depth-limit");
  assert.equal(result.elapsedMs, 1200);
  assert.equal(result.status, "complete");
});

test("even slow 0/1-ply searches must finish 2 ply before a cost stop", () => {
  let clock = 0; const depths=[];
  const r = runAdaptive({ analyze(s, preset) {
    depths.push(PRESETS[preset].plies);
    clock += [6000, 7000, 8000][PRESETS[preset].plies];
    return {type:"cube", settings:PRESETS[preset],status:"complete"};
  } }, initialState({phase:"roll"}), "cube", null, () => {}, () => clock);
  assert.deepEqual(depths,[0,1,2]);
  assert.equal(r.settings.plies,2);
  assert.equal(r.elapsedMs,21000);
  assert.equal(r.budget.reason,"predicted-cost");
  assert.equal(r.budget.minimumPlies,2);
  assert.equal(r.budget.maxNextStageMs,5000);
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
  budget: { minimumPlies: 2, maxNextStageMs: 5000, levels: [{ plies }], reason: "searching" },
});

test("Auto never resolves with a shallow update, even after five seconds", async () => {
  const w=new WorkerMock(),client=new EngineClient({workerFactory:()=>w});
  try {
    let settled=false;
    const pending=client.analyze(initialState({phase:"roll"}),{preset:"auto"}).then(r=>{settled=true;return r;});
    w.reply({id:0,type:"ready",elapsedMs:3000});await tick();
    const job=client.active;job.started=performance.now()-10000;
    assert.equal(client.budgetTimeout,undefined);
    for(const depth of [0,1,2]) {
      w.reply({id:job.id,type:"evaluation",result:completed(depth)});await tick();
      assert.equal(settled,false);assert.equal(w.terminated,undefined);
    }
    w.reply({id:job.id,type:"result",result:completed(3)});
    assert.equal((await pending).settings.plies,3);
    assert((await client.analyze(initialState({phase:"roll"}),{preset:"auto"})).cached);
  } finally {client.destroy();}
});

test("an erroneous shallow final result fails instead of being cached as completed Auto", async () => {
  for(const depth of [0,1]) {
    const w=new WorkerMock(),client=new EngineClient({workerFactory:()=>w});
    try {
      const pending=client.analyze(initialState({phase:"roll"}),{preset:"auto"});
      const rejected=assert.rejects(pending,/required 2 ply/);
      w.reply({id:0,type:"ready",elapsedMs:1});await tick();
      w.reply({id:client.active.id,type:"result",result:completed(depth)});
      await rejected;assert.equal(client.cache.size,0);
    } finally {client.destroy();}
  }
});

test("explicit cancellation terminates Auto and a replacement ignores stale results/errors", async () => {
  const workers=[],client=new EngineClient({workerFactory:()=>{const w=new WorkerMock();workers.push(w);return w;}});
  try {
    const state=initialState({phase:"roll"});
    const first=client.analyze(state,{preset:"auto"});const rejected=assert.rejects(first,{name:"AbortError"});
    workers[0].reply({id:0,type:"ready",elapsedMs:1});await tick();const id=client.active.id;
    workers[0].reply({id,type:"evaluation",result:completed(1)});
    client.cancel();await rejected;assert.equal(workers[0].terminated,true);
    const next=client.analyze(state,{preset:"auto"});workers[1].reply({id:0,type:"ready",elapsedMs:1});await tick();
    workers[0].reply({id,type:"result",result:completed(4)});workers[0].onerror({message:"stale failure"});
    workers[1].reply({id:client.active.id,type:"result",result:completed(3)});
    assert.equal((await next).settings.plies,3);
  } finally {client.destroy();}
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
    w.reply({id:job.id,type:"result",result});
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

test('Auto checker still reaches an affordable four-ply search after a slow initial stage',()=>{
  let clock=0;const levels=[];
  const result=runAdaptive({analyze(s,preset){
    const plies=PRESETS[preset].plies;clock += [1200,10,10,10,20][plies];
    return{type:'checker',status:'complete',settings:PRESETS[preset],
      candidates:[{key:'a',equity:.2},{key:'b',equity:.199}]};
  }},initialState({phase:'move',dice:[3,1]}),'checker',null,r=>levels.push(r.settings.plies),()=>clock);
  assert.deepEqual(levels,[0,1,2,3,4]);
  assert.equal(result.budget.reason,'maximum-depth');assert.equal(result.elapsedMs,1250);
});
