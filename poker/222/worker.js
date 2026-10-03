// Module worker: runout statistics, range statistics and the hidden-information
// cube solver, off the main thread. For large solves the main thread acts as
// coordinator and this worker hosts a share of the sampled subgames.
import { runoutStats, rangeStats, makeRng } from "./engine.mjs";
import { solve, SubgameHost } from "./solver.mjs";

const hosts = new Map();
self.onmessage = async (event) => {
  const { id, type = "stats" } = event.data;
  try {
    let result;
    let transfer = [];
    if (type === "stats") {
      const { hands, board, exact, samples, seed, partIndex, partCount } = event.data;
      result = runoutStats(hands, board, { exact, samples, rng: makeRng(seed), partIndex, partCount });
    } else if (type === "range") {
      const { hero, board, opponents, samples, seed } = event.data;
      result = rangeStats(hero, board, { opponents, samples, rng: makeRng(seed) });
    } else if (type === "solve") {
      result = await solve({ ...event.data.spec, onProgress: (t, total) => self.postMessage({ id, progress: t / total }) });
    } else if (type === "solve-init") {
      hosts.set(event.data.hostId, new SubgameHost(event.data.modelSpec, event.data.subgameSpecs));
      result = true;
    } else if (type === "solve-pass") {
      const host = hosts.get(event.data.hostId);
      const { U, Ucnt } = host.pass(event.data.mode, event.data.t, event.data.entryReach, event.data.modeSpec);
      result = { U: U.slice(), Ucnt: Ucnt.slice() };
      transfer = [result.U.buffer, result.Ucnt.buffer];
    } else if (type === "solve-op") {
      const host = hosts.get(event.data.hostId);
      const op = event.data.op;
      if (op === "free") {
        hosts.delete(event.data.hostId);
        result = true;
      } else result = host[op](event.data.arg) ?? true;
    } else throw new Error(`Unknown request ${type}`);
    self.postMessage({ id, result }, transfer);
  } catch (error) {
    self.postMessage({ id, error: String(error?.stack ?? error?.message ?? error) });
  }
};
