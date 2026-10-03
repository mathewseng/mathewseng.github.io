// Module worker: runs table simulations and cube analysis off the main thread.
import {
  Hand,
  makeRng,
  simulateTable,
  bustDistribution,
  analyzeCube,
  CATEGORIES,
} from "./engine.mjs";

self.onmessage = (event) => {
  const { id, type, payload } = event.data;
  try {
    const rng = makeRng(payload.seed ?? undefined);
    if (type === "table") {
      const { hands, turn, deck, games, rollouts, exactDepth } = payload;
      const alive = hands.map((h) => !new Hand(h).busted);
      const result = simulateTable({ hands, alive, turn, deck }, { games, rng });
      const players = hands.map((cards, i) => {
        const hand = new Hand(cards);
        const category = hand.category();
        if (category >= 0)
          return { busted: true, category, label: CATEGORIES[category] };
        const d = bustDistribution(hand, deck, { rollouts, exactDepth, rng });
        return {
          busted: false,
          category: -1,
          hist: d.hist,
          beyond: d.beyond,
          bust1: d.bustWithin(1),
          bust2: d.bustWithin(2),
          bust3: d.bustWithin(3),
          median: d.median,
          mean: d.mean,
          maxDraws: d.hist.length,
        };
      });
      self.postMessage({ id, result: { ...result, alive, players } });
    } else if (type === "cube") {
      const { onTurn, other, deck, cube, rollouts, exactDepth, ply, children } = payload;
      const result = analyzeCube(
        { onTurn, other, deck, cube },
        { rollouts, exactDepth, rng, ply, children: Boolean(children) },
      );
      self.postMessage({ id, result });
    } else throw new Error(`Unknown request ${type}`);
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
};
