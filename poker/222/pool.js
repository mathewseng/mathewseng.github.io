// Worker pool for runout statistics, range statistics and cube solves. Exact
// enumerations and sampled range stats are split across workers; large solves
// (preflop entries, and flop entries with a river stage) run the entry chain on
// the main thread and spread the sampled subgames across the workers.
import { completions, finishStats, mergeStats, runoutStats, rangeStats, mergeRange, finishRangeStats, makeRng, variantOf } from "./engine.mjs";
import { solve as solveLocal } from "./solver.mjs";

export const PRECISION = {
  fast: { label: "Fast", exactMax: 40000, samples: 12000, rangeSamples: 8000, solver: "fast" },
  standard: { label: "Standard", exactMax: 400000, samples: 60000, rangeSamples: 24000, solver: "standard" },
  exact: { label: "Exact / deep", exactMax: Infinity, samples: 0, rangeSamples: 60000, solver: "deep" },
};

export class Pool {
  constructor(size = Math.min(8, Math.max(1, navigator.hardwareConcurrency || 2))) {
    this.workers = [];
    this.pending = new Map();
    this.nextId = 1;
    this.hostSeq = 1;
    try {
      for (let i = 0; i < size; i++) {
        const w = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
        w.onmessage = (e) => {
          const { id, result, error, progress } = e.data;
          const p = this.pending.get(id);
          if (!p) return;
          if (progress != null) {
            p.onProgress?.(progress);
            return;
          }
          this.pending.delete(id);
          if (error) p.reject(new Error(error));
          else p.resolve(result);
        };
        w.onerror = () => {
          this.broken = true;
        };
        this.workers.push(w);
      }
    } catch {
      this.workers = [];
    }
  }
  get size() {
    return this.workers.length || 1;
  }
  run(worker, payload, onProgress) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      worker.postMessage({ id, ...payload });
    });
  }
  // Resolves to { count, exact, players, hist, ms }.
  async stats(hands, board, { precision = "standard", seed } = {}) {
    const n = hands.length;
    const p = PRECISION[precision] ?? PRECISION.standard;
    const total = completions(n, board.length);
    const exact = total <= p.exactMax;
    const t0 = performance.now();
    const k = this.workers.length;
    let merged;
    if (!k) {
      merged = runoutStats(hands, board, { exact, samples: p.samples, rng: makeRng(seed) });
    } else {
      const parts = board.length >= 5 ? 1 : Math.min(k, exact ? Math.max(1, Math.min(k, 52 - 6 * n - board.length)) : k);
      const base = (seed ?? (Math.random() * 2 ** 31) >>> 0) >>> 0;
      const jobs = [];
      for (let i = 0; i < parts; i++)
        jobs.push(this.run(this.workers[i], { type: "stats", hands, board, exact, samples: Math.ceil(p.samples / parts), seed: (base + i * 7919) >>> 0, partIndex: i, partCount: parts }));
      merged = mergeStats(await Promise.all(jobs));
    }
    const out = finishStats(merged, n);
    out.exact = exact;
    out.total = total;
    out.ms = performance.now() - t0;
    return out;
  }
  // One hand against a range: { opponents: {hands, weights} | null }.
  async range(hero, board, { precision = "standard", opponents = null, seed } = {}) {
    const p = PRECISION[precision] ?? PRECISION.standard;
    const t0 = performance.now();
    const k = this.workers.length;
    const exactCase = opponents && board.length >= 4;
    const base = (seed ?? (Math.random() * 2 ** 31) >>> 0) >>> 0;
    let merged;
    if (!k || exactCase) {
      merged = k ? await this.run(this.workers[0], { type: "range", hero, board, opponents, samples: p.rangeSamples, seed: base }) : rangeStats(hero, board, { opponents, samples: p.rangeSamples, rng: makeRng(base) });
    } else {
      const jobs = [];
      for (let i = 0; i < k; i++) jobs.push(this.run(this.workers[i], { type: "range", hero, board, opponents, samples: Math.ceil(p.rangeSamples / k), seed: (base + i * 7919) >>> 0 }));
      merged = mergeRange(await Promise.all(jobs));
    }
    const out = finishRangeStats(merged);
    out.ms = performance.now() - t0;
    return out;
  }
  // Executor backed by one worker (see solver.mjs localExecutor for the interface).
  executor(worker) {
    const hostId = `h${this.hostSeq++}`;
    const timing = (this.timing = this.timing ?? {});
    const timed = (name, fn) => async (...args) => {
      const t0 = performance.now();
      const r = await fn(...args);
      timing[name] = (timing[name] ?? 0) + (performance.now() - t0);
      timing[name + "N"] = (timing[name + "N"] ?? 0) + 1;
      return r;
    };
    const op = (name) => this.run(worker, { type: "solve-op", hostId, op: name });
    return {
      init: timed("init", (modelSpec, subgameSpecs) => this.run(worker, { type: "solve-init", hostId, modelSpec, subgameSpecs })),
      pass: timed("pass", (mode, t, entryReach, modeSpec) => this.run(worker, { type: "solve-pass", hostId, mode, t, entryReach, modeSpec })),
      clip: timed("clip", () => op("clip")),
      resetEval: timed("resetEval", () => op("resetEval")),
      regret: timed("regret", () => op("regret")),
      clean: timed("clean", (deficit) => this.run(worker, { type: "solve-op", hostId, op: "clean", arg: deficit })),
      aggregates: timed("aggregates", () => op("aggregates")),
      free: timed("free", () => op("free")),
    };
  }
  // Hidden-information cube solve. Heavy solves are coordinated from here across the workers.
  async solve(spec, { onProgress } = {}) {
    const k = this.workers.length;
    const v = variantOf(spec.variant);
    const board = spec.board ?? [];
    const heavy = !spec.inWorker && (board.length === 0 || (board.length === 3 && v.streets.includes("river")));
    if (!k) return solveLocal({ ...spec, onProgress: onProgress ? (t, total) => onProgress(t / total) : undefined });
    if (heavy && k >= 2) {
      const executors = this.workers.map((w) => this.executor(w));
      return solveLocal({ ...spec, onProgress: onProgress ? (t, total) => onProgress(t / total) : undefined }, executors);
    }
    const w = this.workers[(this.solveCursor = ((this.solveCursor ?? 0) + 1) % k)];
    return this.run(w, { type: "solve", spec }, onProgress);
  }
}
