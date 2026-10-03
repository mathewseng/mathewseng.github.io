// Module worker: runout statistics, range statistics and the hidden-information
// cube solver, off the main thread.
import { runoutStats, rangeStats, makeRng } from "./engine.mjs";
import { solve } from "./solver.mjs";

self.onmessage = (event) => {
  const { id, type = "stats" } = event.data;
  try {
    let result;
    if (type === "stats") {
      const { hands, board, exact, samples, seed, partIndex, partCount } = event.data;
      result = runoutStats(hands, board, { exact, samples, rng: makeRng(seed), partIndex, partCount });
    } else if (type === "range") {
      const { hero, board, opponents, samples, seed } = event.data;
      result = rangeStats(hero, board, { opponents, samples, rng: makeRng(seed) });
    } else if (type === "solve") {
      result = solve(event.data.spec);
    } else throw new Error(`Unknown request ${type}`);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
};
