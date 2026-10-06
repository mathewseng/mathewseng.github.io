import test from "node:test";
import assert from "node:assert/strict";
import { EngineClient } from "../engine/client.mjs";
import { initialState } from "../core/rules.mjs";
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
