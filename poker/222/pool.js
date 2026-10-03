// Worker pool for runout statistics. Exact enumerations are split across
// workers by the first drawn card; sampled runs split the sample budget.
import { completions, finishStats, mergeStats, runoutStats, rangeStats, mergeRange, finishRangeStats, makeRng } from "./engine.mjs";
import { solve as solveSync } from "./solver.mjs";

export const PRECISION = {
  fast: { label: "Fast", exactMax: 40000, samples: 12000, rangeSamples: 8000, solver: "fast" },
  standard: { label: "Standard", exactMax: 400000, samples: 60000, rangeSamples: 24000, solver: "standard" },
  exact: { label: "Exact", exactMax: Infinity, samples: 0, rangeSamples: 60000, solver: "deep" },
};

export class Pool {
  constructor(size = Math.min(8, Math.max(1, navigator.hardwareConcurrency || 2))) {
    this.workers = [];
    this.pending = new Map();
    this.nextId = 1;
    try {
      for (let i = 0; i < size; i++) {
        const w = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
        w.onmessage = (e) => {
          const { id, result, error } = e.data;
          const p = this.pending.get(id);
          if (!p) return;
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
  run(worker, payload) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
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
        jobs.push(
          this.run(this.workers[i], {
            type: "stats",
            hands,
            board,
            exact,
            samples: Math.ceil(p.samples / parts),
            seed: (base + i * 7919) >>> 0,
            partIndex: i,
            partCount: parts,
          }),
        );
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
      merged = k
        ? await this.run(this.workers[0], { type: "range", hero, board, opponents, samples: p.rangeSamples, seed: base })
        : rangeStats(hero, board, { opponents, samples: p.rangeSamples, rng: makeRng(base) });
    } else {
      const jobs = [];
      for (let i = 0; i < k; i++)
        jobs.push(this.run(this.workers[i], { type: "range", hero, board, opponents, samples: Math.ceil(p.rangeSamples / k), seed: (base + i * 7919) >>> 0 }));
      merged = mergeRange(await Promise.all(jobs));
    }
    const out = finishRangeStats(merged);
    out.ms = performance.now() - t0;
    return out;
  }
  // Hidden-information cube solve (one worker).
  solve(spec) {
    const k = this.workers.length;
    if (!k) return Promise.resolve(solveSync(spec));
    const w = this.workers[this.solveCursor = ((this.solveCursor ?? 0) + 1) % k];
    return this.run(w, { type: "solve", spec });
  }
}
