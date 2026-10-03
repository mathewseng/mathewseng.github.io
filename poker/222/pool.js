// Worker pool for runout statistics. Exact enumerations are split across
// workers by the first drawn card; sampled runs split the sample budget.
import { completions, finishStats, mergeStats, runoutStats, makeRng } from "./engine.mjs";

export const PRECISION = {
  fast: { label: "Fast", exactMax: 40000, samples: 12000 },
  standard: { label: "Standard", exactMax: 400000, samples: 60000 },
  exact: { label: "Exact", exactMax: Infinity, samples: 0 },
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
          const { id, stats, error } = e.data;
          const p = this.pending.get(id);
          if (!p) return;
          this.pending.delete(id);
          if (error) p.reject(new Error(error));
          else p.resolve(stats);
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
      const parts = Math.min(k, exact ? Math.max(1, Math.min(k, 52 - 6 * n - board.length)) : k);
      const base = (seed ?? (Math.random() * 2 ** 31) >>> 0) >>> 0;
      const jobs = [];
      for (let i = 0; i < parts; i++)
        jobs.push(
          this.run(this.workers[i], {
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
}
