import test from "node:test";
import assert from "node:assert/strict";
import { EngineClient } from "../engine/client.mjs";
import { initialState } from "../core/rules.mjs";
test("progress is not a completed answer and cancellation drops late batches", async () => {
  let worker,
    progress = 0,
    finished = false;
  const client = new EngineClient({
    workerFactory: () =>
      (worker = {
        postMessage(m) {
          this.message = m;
          if (m.type === "init")
            queueMicrotask(() =>
              this.onmessage({ data: { id: 0, type: "ready" } }),
            );
        },
        terminate() {
          this.terminated = true;
        },
      }),
  });
  const promise = client.analyze(
    initialState({ phase: "move", dice: [3, 1] }),
    { rollout: { trials: 64, seed: 1 }, onProgress: () => progress++ },
  );
  promise.then(
    () => (finished = true),
    () => {},
  );
  await new Promise((r) => setTimeout(r, 0));
  const id = worker.message.id;
  worker.onmessage({
    data: { id, type: "progress", checkpoint: { completed: 32 } },
  });
  assert.equal(finished, false);
  assert.equal(progress, 1);
  assert.equal(client.cache.size, 0);
  const rejected = assert.rejects(promise, { name: "AbortError" });
  client.cancel();
  await rejected;
  worker.onmessage({
    data: { id, type: "progress", checkpoint: { completed: 64 } },
  });
  assert.equal(progress, 1);
  assert.ok(worker.terminated);
});
