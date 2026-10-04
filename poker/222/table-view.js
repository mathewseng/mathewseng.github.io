// Information model for a two-player table: which cube action is pending,
// whether hands are tabled, each seat's numbers (perfect information once
// tabled, against the opponent's range while hidden) and the solver output
// for the pending decision. Earlier cube streets condition the ranges: the
// solve for each earlier street supplies the reach of every hand to the cube
// state that was actually reached.
import { variantOf, actorOn, STREETS, MAX_CUBE, DROP_UNIT } from "./engine.mjs";
import { PRECISION } from "./pool.js";
import { levelAfter, optionLabel } from "./cube-rules.mjs";

export const STREET_CARDS = { preflop: 0, flop: 3, turn: 4, river: 5 };
export const STREET_INDEX = { preflop: 0, flop: 1, turn: 2, river: 3 };
export const streetAt = (i) => STREETS[i];
// Cube state key in solver terms (owner as a side: 0 = button side, 1 = other).
export const sideOf = (seat, btn) => (seat == null ? null : seat === btn ? 0 : 1);
export const seatOf = (side, btn) => (side == null ? null : side === 0 ? btn : 1 - btn);
export const stateKey = (level, ownerSide) => `${level}:${ownerSide == null ? "c" : ownerSide}`;
export const cubeKey = (cube, btn) => stateKey(cube.level, sideOf(cube.owner, btn));

// history: { preflop?: key, flop?: key, river?: key, ended?: bool } — the cube
// state key reached after each cube street's action.
// The seat holding the cube option now: the last recorded cube state, else the
// cube's own holder, else the button.
export function holderNow({ variant, street, btn, cube, history = {} }) {
  const v = variantOf(variant);
  const streetName = typeof street === "number" ? STREETS[street] : street;
  let holder = cube.owner ?? null;
  for (const s of v.streets) {
    if (STREET_INDEX[s] >= STREET_INDEX[streetName]) break;
    const key = history[s];
    if (key == null) continue;
    const own = key.split(":")[1];
    holder = own === "c" ? null : seatOf(Number(own), btn);
  }
  return holder ?? btn;
}
export function actionState({ variant, street, btn, cube, cubeEnabled, n, history = {} }) {
  const v = variantOf(variant);
  const streetName = typeof street === "number" ? STREETS[street] : street;
  if (!cubeEnabled || n !== 2 || history.ended) return { pending: false, remaining: false, tabled: true, variant: v, actor: null };
  const idx = STREET_INDEX[streetName];
  const holder = holderNow({ variant: v, street: streetName, btn, cube, history });
  const actor = v.streets.includes(streetName) && history[streetName] == null ? actorOn(v, streetName, btn, { level: cube.level, owner: holder }) : null;
  const pending = actor != null;
  const remaining = v.streets.some((s) => STREET_INDEX[s] >= idx && history[s] == null && cube.level < MAX_CUBE && (s !== streetName || pending));
  return { pending, remaining, tabled: !remaining, variant: v, actor, holder };
}
// Derive a history from a cube state for pages without an action log. `takenOn`
// names the cube street on which an owned cube was taken (default: the latest
// cube street before `street`).
// Every earlier cube street was passed up (the option alternates) except the
// one the cube was taken on, after which the taker holds it; later passes hand
// the option back and forth.
export function historyFromCube(cube, variant, street, btn, takenOn = null) {
  const v = variantOf(variant);
  const streetName = typeof street === "number" ? STREETS[street] : street;
  const idx = STREET_INDEX[streetName];
  const earlier = v.streets.filter((s) => STREET_INDEX[s] < idx);
  const history = {};
  if (!earlier.length) return history;
  const taken = cube.owner != null ? (earlier.includes(takenOn) ? takenOn : earlier[earlier.length - 1]) : null;
  let holder = btn;
  let level = 1;
  for (const s of earlier) {
    if (s === taken) {
      holder = cube.owner;
      level = cube.level;
    } else holder = 1 - holder;
    history[s] = stateKey(level, sideOf(holder, btn));
  }
  return history;
}
export function takenOnOptions(variant, street) {
  const v = variantOf(variant);
  const streetName = typeof street === "number" ? STREETS[street] : street;
  return v.streets.filter((s) => STREET_INDEX[s] < STREET_INDEX[streetName]);
}

const cache = new Map();
function remember(key, value) {
  if (cache.size > 60) cache.delete(cache.keys().next().value);
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
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
function weightsFrom(solveResult, key) {
  const r = solveResult.reach[key];
  if (!r) return null;
  return { btnHands: solveResult.hands.btn, oppHands: solveResult.hands.opp, btn: r.btn, opp: r.opp };
}
// spec: { hands (null for unknown), board, street (index), variant, btn, cube {level, owner seat},
//         cubeEnabled, history, forceTabled, precision, onProgress }
export async function computeView(pool, spec) {
  const n = spec.hands.length;
  const a = actionState({ ...spec, n });
  const allKnown = spec.hands.every(Boolean);
  const tabled = a.tabled || (spec.forceTabled && allKnown);
  const precision = spec.precision ?? "standard";
  const solverPrecision = PRECISION[precision]?.solver ?? "standard";
  const dropUnit = spec.dropUnit ?? DROP_UNIT;
  if (tabled) {
    if (!allKnown) return { mode: "hidden", tabled: false, stats: { mode: "range", players: spec.hands.map(() => null) }, action: a, decision: null };
    const key = JSON.stringify(["stats", spec.hands, spec.board, precision]);
    const stats = await cached(key, () => pool.stats(spec.hands, spec.board, { precision }));
    return { mode: "perfect", tabled: true, stats: { ...stats, mode: "perfect" }, action: a, decision: null };
  }
  const v = a.variant;
  const btn = spec.btn;
  const btnHand = spec.hands[btn],
    oppHand = spec.hands[1 - btn];
  const streetName = STREETS[spec.street];
  const history = spec.history ?? {};
  // Upstream solves: every earlier cube street with a resolved action.
  let upstream = null; // { solve, key }
  let entry = { level: 1, owner: null };
  const upstreamKeys = [];
  for (const s of v.streets) {
    if (STREET_INDEX[s] >= STREET_INDEX[streetName]) break;
    const key = history[s];
    if (key == null) break;
    const boardAt = spec.board.slice(0, STREET_CARDS[s]);
    const weights = upstream ? weightsFrom(upstream.solve, upstream.key) : null;
    const ck = JSON.stringify(["solve", v.id, s, boardAt, btnHand, oppHand, entry, upstreamKeys, solverPrecision, dropUnit]);
    const sol = await cached(ck, () =>
      pool.solve({ board: boardAt, variant: v.id, entry, btnHand, oppHand, weights, precision: solverPrecision, dropUnit, seed: hashSeed(ck) }, { onProgress: spec.onProgress }),
    );
    upstream = { solve: sol, key, street: s };
    upstreamKeys.push(key);
    const [lvl, own] = key.split(":");
    entry = { level: Number(lvl), owner: own === "c" ? null : Number(own) };
  }
  const weights = upstream ? weightsFrom(upstream.solve, upstream.key) : null;
  const conditioned = Boolean(weights);
  const opponentsFor = (seat) => {
    if (!weights) return null;
    return seat === btn ? { hands: weights.oppHands, weights: weights.opp } : { hands: weights.btnHands, weights: weights.btn };
  };
  const players = await Promise.all(
    spec.hands.map((hand, seat) => {
      if (!hand) return null;
      const opponents = opponentsFor(seat);
      const key = JSON.stringify(["range", hand, spec.board, precision, opponents ? [v.id, btnHand, oppHand, upstreamKeys, dropUnit] : null]);
      return cached(key, () => pool.range(hand, spec.board, { precision, opponents, seed: hashSeed(key) }));
    }),
  );
  let decision = null;
  if (a.pending) {
    const entryNow = { level: spec.cube.level, owner: sideOf(a.holder, btn) };
    const ck = JSON.stringify(["solve", v.id, streetName, spec.board, btnHand, oppHand, entryNow, upstreamKeys, solverPrecision, dropUnit]);
    const sol = await cached(ck, () =>
      pool.solve({ board: spec.board, variant: v.id, entry: entryNow, btnHand, oppHand, weights, precision: solverPrecision, dropUnit, seed: hashSeed(ck) }, { onProgress: spec.onProgress }),
    );
    decision = { street: streetName, actor: a.actor, responder: 1 - a.actor, level: spec.cube.level, solve: sol, stage: sol.stage, dropUnit };
  }
  return { mode: "hidden", tabled: false, stats: { mode: "range", conditioned, players }, action: a, decision, upstream };
}
// Options at chain node k for the hand that acts there (index 0 of its side).
export function nodeOptions(stage, k) {
  const node = stage?.nodes?.[k];
  if (!node?.options) return null;
  return { options: node.options.map((o) => ({ ...o })), best: node.options.reduce((m, o) => (o.ev > m.ev + 1e-9 ? o : m), node.options[0]).id, node };
}
export function gradeHidden(stage, k, chosen) {
  const g = nodeOptions(stage, k);
  if (!g) return null;
  const bestEq = g.options.find((o) => o.id === g.best).ev;
  const pick = g.options.find((o) => o.id === chosen) ?? g.options[0];
  return { ...g, chosen: pick.id, error: Math.max(0, bestEq - pick.ev) };
}
// Sample an action from the equilibrium mix (used by the trainer bot).
export function sampleAction(stage, k, rng = Math.random) {
  const g = nodeOptions(stage, k);
  if (!g) return null;
  const u = rng();
  let acc = 0;
  for (const o of g.options) {
    acc += Math.max(0, o.prob);
    if (u < acc) return o.id;
  }
  return g.options.reduce((m, o) => (o.prob > m.prob ? o : m), g.options[0]).id;
}
export { levelAfter, optionLabel };
