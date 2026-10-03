// Information model for a two-player table: which cube action is pending,
// whether hands are tabled, each seat's numbers (perfect information once
// tabled, against the opponent's range while hidden) and the solver output
// for the pending decision.
import { VARIANTS, flopActor, riverActor, DROP_UNIT } from "./engine.mjs";
import { PRECISION } from "./pool.js";

export const STATE_OF_FLOP = { N: "c1", T: "o2", BT: "o4" };
// history: { flop: null | "N" | "T" | "BT", river: null | "done", ended: bool }
export function actionState({ variant, street, btn, cube, cubeEnabled, n, history = {} }) {
  const v = typeof variant === "string" ? VARIANTS[variant] : variant;
  if (!cubeEnabled || n !== 2 || history.ended) return { flopPending: false, riverPending: false, remaining: false, tabled: true, variant: v };
  const flopPending = street === 1 && flopActor(v, btn, cube) != null && history.flop == null;
  const riverPending = street === 3 && riverActor(v, btn, cube) != null && history.river == null;
  const flopAhead = street <= 1 && v.flopActor && history.flop == null;
  const riverAhead = street <= 3 && v.riverActor && history.river == null;
  const remaining = Boolean(flopAhead || riverAhead);
  return { flopPending, riverPending, remaining, tabled: !remaining, variant: v };
}
// Derive the flop history from a cube state (for the simulator, which has no action log).
export function historyFromCube(cube, variant, street) {
  const v = typeof variant === "string" ? VARIANTS[variant] : variant;
  if (!v.flopActor || street < 2) return { flop: null, river: null };
  if (cube.owner == null) return { flop: "N", river: null };
  return { flop: cube.level >= 4 ? "BT" : "T", river: null };
}
const cache = new Map();
function remember(key, value) {
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  cache.set(key, value);
  return value;
}
function cached(key, make) {
  if (cache.has(key)) return cache.get(key);
  const p = make().catch((e) => {
    cache.delete(key);
    throw e;
  });
  return remember(key, p);
}
// spec: { hands (null for unknown), board, street, variant, btn, cube, cubeEnabled,
//         history, forceTabled, precision }
export async function computeView(pool, spec) {
  const n = spec.hands.length;
  const a = actionState({ ...spec, n });
  const allKnown = spec.hands.every(Boolean);
  const tabled = a.tabled || (spec.forceTabled && allKnown);
  const precision = spec.precision ?? "standard";
  const solverPrecision = PRECISION[precision]?.solver ?? "standard";
  if (tabled) {
    if (!allKnown) return { mode: "hidden", tabled: false, stats: { mode: "range", players: spec.hands.map(() => null) }, action: a, decision: null };
    const key = JSON.stringify(["stats", spec.hands, spec.board, precision]);
    const stats = await cached(key, () => pool.stats(spec.hands, spec.board, { precision }));
    return { mode: "perfect", tabled: true, stats: { ...stats, mode: "perfect" }, action: a, decision: null };
  }
  const v = a.variant;
  const btn = spec.btn,
    opp = 1 - btn;
  const btnHand = spec.hands[btn],
    oppHand = spec.hands[opp];
  const flop = spec.board.slice(0, 3);
  // Flop solve: needed for the flop decision and, in the flop-and-river variant, to condition later streets.
  let flopSolve = null;
  const needFlopSolve = (a.flopPending || (v.riverActor === "opp" && spec.street >= 2 && spec.history?.flop)) && spec.street >= 1;
  if (needFlopSolve) {
    const key = JSON.stringify(["solve-flop", btnHand, oppHand, flop, v.id, solverPrecision]);
    flopSolve = await cached(key, () => pool.solve({ board: flop, variant: v.id, stage: "flop", btnHand, oppHand, precision: solverPrecision, seed: hashSeed(key) }));
  }
  const stateId = spec.history?.flop ? STATE_OF_FLOP[spec.history.flop] : null;
  const conditioned = Boolean(flopSolve && stateId && spec.street >= 2);
  const opponentsFor = (seat) => {
    if (!conditioned) return null;
    const r = flopSolve.reach[stateId];
    return seat === btn ? { hands: flopSolve.hands.opp, weights: r.opp } : { hands: flopSolve.hands.btn, weights: r.btn };
  };
  const players = await Promise.all(
    spec.hands.map((hand, seat) => {
      if (!hand) return null;
      const opponents = opponentsFor(seat);
      const key = JSON.stringify(["range", hand, spec.board, precision, opponents ? [stateId, v.id, btnHand, oppHand] : null]);
      return cached(key, () => pool.range(hand, spec.board, { precision, opponents, seed: hashSeed(key) }));
    }),
  );
  let decision = null;
  if (a.flopPending && flopSolve) {
    decision = { kind: "flop", actor: btn, responder: opp, level: 1, data: flopSolve.flop, solve: flopSolve };
  } else if (a.riverPending) {
    const actorSeat = riverActor(v, btn, spec.cube);
    const actorSide = actorSeat === btn ? 0 : 1;
    const weights = conditioned ? { btnHands: flopSolve.hands.btn, oppHands: flopSolve.hands.opp, btn: flopSolve.reach[stateId].btn, opp: flopSolve.reach[stateId].opp } : null;
    const key = JSON.stringify(["solve-river", btnHand, oppHand, spec.board, v.id, spec.cube, stateId, solverPrecision]);
    const riverSolve = await cached(key, () =>
      pool.solve({ board: spec.board, variant: v.id, stage: "river", level: spec.cube.level, actorSide, btnHand, oppHand, weights, precision: solverPrecision, seed: hashSeed(key) }),
    );
    decision = { kind: "river", actor: actorSeat, responder: 1 - actorSeat, level: spec.cube.level, data: riverSolve.river.now, solve: riverSolve };
  }
  return { mode: "hidden", tabled: false, stats: { mode: "range", conditioned, stateId, players }, action: a, decision, flopSolve };
}
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
// Option list for a hidden-information decision from the chooser's view.
export function hiddenOptions(data, kind, level) {
  let options;
  if (kind === "double") {
    const verb = level > 1 ? "Redouble" : "Double";
    options = [
      { id: "noDouble", label: `No ${verb.toLowerCase()}`, eq: data.actor.noDouble, prob: 1 - data.actor.pDouble },
      { id: "double", label: verb, eq: data.actor.double, prob: data.actor.pDouble },
    ];
  } else if (kind === "response")
    options = [
      { id: "drop", label: "Drop", eq: data.responder.drop, prob: data.responder.pDrop },
      { id: "take", label: "Take", eq: data.responder.take, prob: data.responder.pTake },
      { id: "beaver", label: "Beaver", eq: data.responder.beaver, prob: data.responder.pBeaver },
    ];
  else
    options = [
      { id: "take", label: "Take the beaver", eq: data.beaverReply.take, prob: data.beaverReply.pTake },
      { id: "drop", label: "Drop the beaver", eq: data.beaverReply.drop, prob: 1 - data.beaverReply.pTake },
    ];
  const best = options.reduce((m, o) => (o.eq > m.eq + 1e-9 ? o : m), options[0]);
  return { options, best: best.id };
}
export function gradeHidden(data, kind, level, chosen) {
  const g = hiddenOptions(data, kind, level);
  const bestEq = g.options.find((o) => o.id === g.best).eq;
  const pick = g.options.find((o) => o.id === chosen) ?? g.options[0];
  return { ...g, chosen: pick.id, error: Math.max(0, bestEq - pick.eq) };
}
// Sample an action from the equilibrium mix (used by the trainer bot).
export function sampleAction(data, kind, rng = Math.random) {
  const g = hiddenOptions(data, kind, 1);
  const u = rng();
  let acc = 0;
  for (const o of g.options) {
    acc += Math.max(0, o.prob);
    if (u < acc) return o.id;
  }
  return g.options[g.options.length - 1].id;
}
export { DROP_UNIT };
