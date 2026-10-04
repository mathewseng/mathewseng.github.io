// SPDX-License-Identifier: GPL-3.0-or-later
import { positionKey } from "../core/rules.mjs";
import { ENGINE_VERSION } from "./metadata.mjs";
// One worker, bounded LRU, priority queue. Termination is intentional: WASM calls are synchronous.
export class EngineClient {
  constructor({
    workerFactory = () =>
      new Worker(new URL("./worker.mjs", import.meta.url), { type: "module" }),
    onStatus = () => {},
  } = {}) {
    this.factory = workerFactory;
    this.onStatus = onStatus;
    this.queue = [];
    this.cache = new Map();
    this.serial = 0;
    this.active = null;
    this.worker = null;
    this.ready = false;
    this.generation = 0;
  }
  start() {
    if (this.initializing) return this.initializing;
    if (this.ready) return Promise.resolve();
    const generation = ++this.generation;
    this.onStatus("loading", "Loading GNUbg and its local databases…");
    this.initializing = new Promise((resolve, reject) => {
      this.initReject = reject;
      this.worker = this.factory();
      this.worker.onerror = (e) =>
        this.fail(
          new Error(
            e.message || "The analysis worker stopped. Retry to load it again.",
          ),
        );
      this.worker.onmessage = ({ data }) => {
        if (generation !== this.generation) return;
        if (data.type === "ready") {
          this.startup = data;
          clearTimeout(this.initTimeout);
          this.ready = true;
          this.initializing = null;
          this.initReject = null;
          this.onStatus(
            "ready",
            `GNUbg ready · ${(data.elapsedMs / 1000).toFixed(2)} s startup`,
          );
          resolve();
        } else if (data.id === 0 && data.type === "error")
          this.fail(new Error(data.message));
        else if (this.active && data.id === this.active.id) {
          const job = this.active;
          this.active = null;
          clearTimeout(this.jobTimeout);
          if (data.type === "error") job.reject(new Error(data.message));
          else {
            this.cache.set(job.key, data.result);
            while (this.cache.size > 64)
              this.cache.delete(this.cache.keys().next().value);
            job.resolve(data.result);
          }
          this.onStatus(
            "ready",
            data.type === "error" ? data.message : "Analysis complete",
          );
          this.pump();
        }
      };
      this.initTimeout = setTimeout(
        () =>
          this.fail(
            new Error(
              "Engine loading timed out. Check your connection and retry.",
            ),
          ),
        45000,
      );
      this.worker.postMessage({ id: 0, type: "init" });
    });
    return this.initializing;
  }
  analyze(
    state,
    {
      preset = "quick",
      kind = state.phase === "move" ? "checker" : "cube",
      submitted = null,
      priority = 10,
    } = {},
  ) {
    const key = JSON.stringify([
      ENGINE_VERSION,
      positionKey(state),
      preset,
      kind,
      submitted,
    ]);
    if (this.cache.has(key)) {
      const result = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, result);
      return Promise.resolve({ ...result, cached: true });
    }
    const existing = [this.active, ...this.queue].find((j) => j?.key === key);
    if (existing) return existing.promise;
    const job = {
      id: ++this.serial,
      key,
      state: structuredClone(state),
      preset,
      kind,
      submitted,
      priority,
    };
    job.promise = new Promise((resolve, reject) =>
      Object.assign(job, { resolve, reject }),
    );
    if (this.queue.length >= 32) {
      job.reject(
        new Error("Analysis queue is full. Cancel queued work first."),
      );
      return job.promise;
    }
    this.queue.push(job);
    this.queue.sort((a, b) => b.priority - a.priority || a.id - b.id);
    if (this.active && priority > this.active.priority)
      this.cancelActive("Superseded by the current request.");
    this.pump();
    return job.promise;
  }
  async pump() {
    if (this.active || !this.queue.length || this.pumping) return;
    this.pumping = true;
    try {
      await this.start();
      if (!this.queue.length) return;
      const job = this.queue.shift();
      this.active = job;
      this.onStatus("busy", `Evaluating ${job.preset}…`);
      this.worker.postMessage({
        id: job.id,
        type: "analyze",
        state: job.state,
        preset: job.preset,
        kind: job.kind,
        submitted: job.submitted,
      });
      this.jobTimeout = setTimeout(
        () =>
          this.fail(
            new Error(
              "Analysis exceeded five minutes. Try a shallower setting.",
            ),
          ),
        300000,
      );
    } catch (e) {
      for (const job of this.queue.splice(0)) job.reject(e);
    } finally {
      this.pumping = false;
    }
  }
  cancelActive(message = "Analysis cancelled.") {
    clearTimeout(this.jobTimeout);
    clearTimeout(this.initTimeout);
    this.generation++;
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    const error = new DOMException(message, "AbortError");
    this.active?.reject(error);
    this.active = null;
    this.initReject?.(error);
    this.initReject = null;
    this.initializing = null;
    this.onStatus("idle", message);
  }
  cancel() {
    for (const j of this.queue.splice(0))
      j.reject(new DOMException("Analysis cancelled.", "AbortError"));
    this.cancelActive();
  }
  fail(error) {
    for (const j of this.queue.splice(0)) j.reject(error);
    this.active?.reject(error);
    this.active = null;
    this.initReject?.(error);
    this.initReject = null;
    clearTimeout(this.initTimeout);
    clearTimeout(this.jobTimeout);
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.initializing = null;
    this.generation++;
    this.onStatus("error", error.message);
  }
  destroy() {
    this.cancel();
    this.cache.clear();
  }
}
