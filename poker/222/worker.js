// Module worker: enumerates or samples board runouts off the main thread.
import { runoutStats, makeRng } from "./engine.mjs";

self.onmessage = (event) => {
  const { id, hands, board, exact, samples, seed, partIndex, partCount } = event.data;
  try {
    const stats = runoutStats(hands, board, {
      exact,
      samples,
      rng: makeRng(seed),
      partIndex,
      partCount,
    });
    self.postMessage({ id, stats });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
};
