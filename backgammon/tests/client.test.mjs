import test from "node:test";
import assert from "node:assert/strict";
import { EngineClient } from "../engine/client.mjs";
import { initialState, legalTurns, legalPaths, boardKey } from "../core/rules.mjs";
class WorkerMock {
  constructor() {
    this.messages = [];
    this.terminated = false;
  }
  postMessage(m) {
    this.messages.push(m);
    if (m.type === "init")
      queueMicrotask(() =>
        this.onmessage({ data: { id: 0, type: "ready", elapsedMs: 2 } }),
      );
  }
  terminate() {
    this.terminated = true;
  }
  reply(data) {
    this.onmessage({ data });
  }
}
const wait = () => new Promise((r) => setTimeout(r, 0));
test("worker deduplicates requests, rejects cancellation and ignores terminated worker results", async () => {
  const workers = [],
    client = new EngineClient({
      workerFactory: () => {
        const w = new WorkerMock();
        workers.push(w);
        return w;
      },
    }),
    state = initialState({ phase: "move", dice: [3, 1] });
  const a = client.analyze(state),
    b = client.analyze(state);
  assert.equal(a, b);
  await wait();
  const id = workers[0].messages.at(-1).id;
  const rejected = assert.rejects(a, { name: "AbortError" });
  client.cancel();
  await rejected;
  assert.equal(workers[0].terminated, true);
  const c = client.analyze(state);
  await wait();
  workers[0].reply({ id, type: "result", result: { wrong: true } });
  workers[0].onerror({ message: "late error from terminated worker" });
  workers[1].reply({
    id: workers[1].messages.at(-1).id,
    type: "result",
    result: { valid: true },
  });
  assert.equal((await c).valid, true);
  assert.equal((await client.analyze(state)).cached, true);
  client.destroy();
});
test("worker failure rejects work and permits retry", async () => {
  const workers = [],
    client = new EngineClient({
      workerFactory: () => {
        const w = new WorkerMock();
        workers.push(w);
        return w;
      },
    }),
    s = initialState({ phase: "roll" });
  const promise = client.analyze(s);
  await wait();
  const rejected = assert.rejects(promise, /failed/);
  workers[0].onerror({ message: "worker failed" });
  await rejected;
  const next = client.analyze(s);
  await wait();
  workers[1].reply({
    id: workers[1].messages.at(-1).id,
    type: "result",
    result: { valid: true },
  });
  assert.ok((await next).valid);
  client.destroy();
});
test("cancel during initialization then immediately queue a new position", async () => {
  const workers = [];
  const client = new EngineClient({
    workerFactory: () => {
      const w = new WorkerMock();
      workers.push(w);
      return w;
    },
  });
  try {
    const first = client.analyze(initialState({ phase: "roll" }));
    const rejected = assert.rejects(first, { name: "AbortError" });
    client.cancel();
    const next = client.analyze(initialState({ phase: "move", dice: [3, 1] }));
    await rejected;
    await wait();
    assert.equal(workers.length, 2);
    assert.equal(workers[0].terminated, true);
    assert.equal(workers[1].messages.at(-1).type, "analyze");
    workers[1].reply({
      id: workers[1].messages.at(-1).id,
      type: "result",
      result: { valid: true },
    });
    assert.equal((await next).valid, true);
  } finally {
    client.destroy();
  }
});
test("priority current request terminates background work", async () => {
  const workers = [],
    client = new EngineClient({
      workerFactory: () => {
        const w = new WorkerMock();
        workers.push(w);
        return w;
      },
    });
  const s = initialState({ phase: "roll" }),
    a = client.analyze(s, { priority: 0 });
  await wait();
  const rejected = assert.rejects(a, { name: "AbortError" });
  const b = client.analyze({ ...s, turn: 1 }, { priority: 10 });
  await rejected;
  await wait();
  assert.ok(workers[0].terminated);
  workers[1].reply({
    id: workers[1].messages.at(-1).id,
    type: "result",
    result: { valid: true },
  });
  await b;
  client.destroy();
});

test("cube grading reverses response perspective and honors the opponent’s optimal response", async () => {
  const { gradeCube } = await import("../engine/cube-grade.mjs");
  const r = { type: "cube", outcomes: [0.8, 1.2, 1] };
  assert.ok(
    Math.abs(gradeCube({ phase: "roll", turn: 0 }, r, "roll").error - 0.2) <
      1e-8,
  );
  assert.equal(gradeCube({ phase: "roll", turn: 0 }, r, "double").error, 0);
  assert.ok(
    Math.abs(
      gradeCube({ phase: "double", turn: 0, pending: { by: 0 } }, r, "take")
        .error - 0.2,
    ) < 1e-8,
  );
  assert.equal(
    gradeCube({ phase: "double", turn: 0, pending: { by: 0 } }, r, "pass")
      .error,
    0,
  );
  const tooGood = { type: "cube", outcomes: [1.4, 1.8, 1] };
  assert.ok(
    Math.abs(
      gradeCube({ phase: "roll", turn: 0 }, tooGood, "double").error - 0.4,
    ) < 1e-8,
  );
});

test("hint and arbitrary-move grades reuse one full search, including equivalent dice orders", async () => {
  const worker = new WorkerMock(), client = new EngineClient({workerFactory: () => worker});
  const state = initialState({phase:"move",dice:[3,1]}), turns = legalTurns(state);
  const candidates = turns.map((t,i) => ({...t,equity:1-i/100}));
  const result = {type:"checker",candidates,actual:null,error:null};
  try {
    const hint = client.analyze(state, {preset:"deep"});
    const grade = client.analyze(state, {preset:"deep",submitted:turns.at(-1).steps});
    await wait();
    assert.equal(worker.messages.filter(m=>m.type==="analyze").length,1);
    assert.equal(worker.messages.at(-1).submitted,null);
    worker.reply({id:worker.messages.at(-1).id,type:"result",result});
    assert.equal((await hint).actual,null);
    assert.equal((await grade).actual.key,turns.at(-1).key);
    assert.ok(Math.abs((await grade).error-(turns.length-1)/100)<1e-12);
    const equivalent = legalPaths(state).filter(p=>boardKey(p.state)===turns.at(-1).key);
    for(const path of equivalent) {
      const r=await client.analyze(state,{preset:"deep",submitted:path.steps});
      assert.equal(r.cached,true); assert.equal(r.actual.key,turns.at(-1).key);
    }
    assert.equal(result.actual,null,"caller-specific grading does not contaminate cached hint");
    await assert.rejects(client.analyze(state,{preset:"deep",submitted:turns[0].steps.slice(0,1)}),/Complete/);
    assert.equal(worker.messages.filter(m=>m.type==="analyze").length,1);
  } finally {client.destroy();}
});

test("screened search keeps submitted move in its job identity", async () => {
  const worker = new WorkerMock(), client = new EngineClient({workerFactory:()=>worker});
  const state=initialState({phase:"move",dice:[3,1]}), steps=legalTurns(state).at(-1).steps;
  try {
    const hint=client.analyze(state,{preset:"expert"}); await wait();
    worker.reply({id:worker.messages.at(-1).id,type:"result",result:{candidates:[]}}); await hint;
    const grade=client.analyze(state,{preset:"expert",submitted:steps}); await wait();
    assert.equal(worker.messages.filter(m=>m.type==="analyze").length,2);
    assert.deepEqual(worker.messages.at(-1).submitted,steps);
    worker.reply({id:worker.messages.at(-1).id,type:"result",result:{actual:{key:"scored"}}});
    assert.equal((await grade).actual.key,"scored");
  } finally {client.destroy();}
});

test("a foreground request promotes an already queued background search", async () => {
  const workers=[],client=new EngineClient({workerFactory:()=>{const w=new WorkerMock();workers.push(w);return w;}});
  const state=initialState({phase:"roll"});
  try {
    const busy=client.analyze(state,{priority:0}); await wait();
    const queued=client.analyze({...state,turn:1},{priority:-10});
    const rejected=assert.rejects(busy,{name:"AbortError"});
    assert.equal(client.analyze({...state,turn:1},{priority:10}),queued);
    await rejected; await wait();
    assert.equal(workers.length,2); assert.ok(workers[0].terminated);
    workers[1].reply({id:workers[1].messages.at(-1).id,type:"result",result:{valid:true}});
    assert.equal((await queued).valid,true);
  } finally {client.destroy();}
});

test("worker creation and initialization-send failures permit a clean retry", async () => {
  for (const phase of ["create", "send"]) {
    let attempts = 0, worker;
    const client = new EngineClient({ workerFactory: () => {
      if (attempts++ === 0) {
        if (phase === "create") throw new Error("worker unavailable");
        return { terminate() {}, postMessage() { throw new Error("worker unavailable"); } };
      }
      return worker = new WorkerMock();
    } });
    try {
      await assert.rejects(client.analyze(initialState({phase:"roll"})), /unavailable/);
      const retry = client.analyze(initialState({phase:"roll"}));
      await wait();
      worker.reply({id:worker.messages.at(-1).id,type:"result",result:{valid:true}});
      assert.equal((await retry).valid,true);
    } finally { client.destroy(); }
  }
});

test("shared search grades every caller separately even when a grade arrives before the hint", async () => {
  const worker = new WorkerMock(), client = new EngineClient({workerFactory: () => worker});
  const state = initialState({phase:"move",dice:[2,2]}), turns = legalTurns(state);
  const candidates = turns.map((t,i) => ({...t,equity:1-i/100}));
  try {
    const worst = client.analyze(state,{submitted:turns.at(-1).steps});
    const best = client.analyze(state,{submitted:turns[0].steps});
    const hint = client.analyze(state);
    await wait();
    worker.reply({id:worker.messages.at(-1).id,type:"result",result:{candidates,actual:null,error:null}});
    assert.equal((await worst).actual.key,turns.at(-1).key);
    assert.equal((await best).error,0);
    assert.equal((await hint).actual,null);
    assert.equal(worker.messages.filter(m=>m.type==="analyze").length,1);
    assert.equal((await client.analyze(state)).actual,null);
  } finally { client.destroy(); }
});

test("reuse never crosses dice, player, cube, match or rule context", async () => {
  const worker = new WorkerMock(), client = new EngineClient({workerFactory: () => worker});
  const original = initialState({phase:"move",dice:[3,1]});
  const contexts = [
    original,
    {...original, dice:[4,2]},
    {...original, turn:1},
    {...original, cube:{value:2,owner:0}},
    {...original, cube:{value:2,owner:1}},
    {...original, rules:{...original.rules,jacoby:!original.rules.jacoby}},
    initialState({phase:"move",dice:[3,1],matchLength:5,scores:[1,2]}),
    initialState({phase:"move",dice:[3,1],matchLength:5,scores:[2,1]}),
  ];
  try {
    for (const state of contexts) {
      const pending = client.analyze(state);
      await wait();
      worker.reply({id:worker.messages.at(-1).id,type:"result",result:{valid:true}});
      await pending;
    }
    assert.equal(worker.messages.filter(m=>m.type==="analyze").length,contexts.length);
    assert.equal((await client.analyze(original)).cached,true);
  } finally { client.destroy(); }
});

test("deduplicated rollouts deliver completed progress to every subscriber", async () => {
  const worker = new WorkerMock(), client = new EngineClient({workerFactory: () => worker});
  const state = initialState({phase:"move",dice:[3,1]}), seen = [[],[]];
  try {
    const a = client.analyze(state,{rollout:{trials:64,seed:1},onProgress:c=>seen[0].push(c)});
    const b = client.analyze(state,{rollout:{trials:64,seed:1},onProgress:c=>seen[1].push(c)});
    assert.equal(a,b);
    await wait();
    const id=worker.messages.at(-1).id;
    worker.reply({id,type:"progress",checkpoint:{trials:32}});
    assert.deepEqual(seen,[[{trials:32}],[{trials:32}]]);
    worker.reply({id,type:"result",result:{valid:true}});
    await a;
  } finally { client.destroy(); }
});

test("rollout grades keep the submitted move in their search identity", async () => {
  const worker = new WorkerMock(), client = new EngineClient({workerFactory:()=>worker});
  const state=initialState({phase:"move",dice:[3,1]}), steps=legalTurns(state).at(-1).steps;
  try {
    const hint=client.analyze(state,{rollout:{trials:64,seed:1}}); await wait();
    worker.reply({id:worker.messages.at(-1).id,type:"result",result:{candidates:[]}}); await hint;
    const grade=client.analyze(state,{submitted:steps,rollout:{trials:64,seed:1}}); await wait();
    assert.equal(worker.messages.filter(m=>m.type==="analyze").length,2);
    assert.deepEqual(worker.messages.at(-1).submitted,steps);
    worker.reply({id:worker.messages.at(-1).id,type:"result",result:{valid:true}}); await grade;
  } finally {client.destroy();}
});
