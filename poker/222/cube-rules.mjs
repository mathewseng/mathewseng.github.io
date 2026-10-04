// Cube rules shared by the engine, the solver, the trainer and online play.
//
// A raise chain: the player to act may double (raise 1). The player raised
// may drop, take, or re-raise: the first re-raise is a beaver, the next a
// raccoon, then rebeaver, reraccoon, and so on, while the cube stays within
// MAX_CUBE. Dropping the k-th raise costs DROP_UNIT times the cube level
// before that raise. When a raise is taken the cube goes to the player who
// was first doubled in the chain (as in backgammon, a beaver keeps the cube).
export const DROP_UNIT = 6; // default drop cost per unit of the cube
export const DROP_UNITS = [5, 6, 7, 8, 9, 10]; // drop costs the pages and reports support
export const MAX_CUBE = 64;
const RERAISE_NAMES = ["Beaver", "Raccoon", "Rebeaver", "Reraccoon", "Rebeaver", "Reraccoon", "Rebeaver"];

// Number of raises available from `base` (raise k offers base * 2^k).
export function chainDepth(base, maxLevel = MAX_CUBE) {
  let d = 0;
  while (base * 2 ** (d + 1) <= maxLevel) d++;
  return d;
}
export const levelAfter = (base, k) => base * 2 ** k;
// Cost of dropping the k-th raise (k >= 1) in a chain from `base`.
export const dropCost = (base, k, dropUnit = DROP_UNIT) => dropUnit * levelAfter(base, k - 1);
// Name of the re-raise available to the responder of raise k (k >= 1).
export const reraiseName = (k) => RERAISE_NAMES[Math.min(k - 1, RERAISE_NAMES.length - 1)];
// Label of the raise made at node k: node 0 makes the double, node k >= 1 the re-raise.
export const raiseLabel = (k, base) => (k === 0 ? (base > 1 ? "Redouble" : "Double") : reraiseName(k));

// Pending raise bookkeeping for a live hand.
// pending = { k, base, raiser, responder } means raise k (to levelAfter(base, k)) awaits a reply.
export function offerRaise(base, raiser, responder, dropUnit = DROP_UNIT) {
  return { k: 1, base, raiser, responder, level: levelAfter(base, 1), drop: dropCost(base, 1, dropUnit), dropUnit };
}
export function canReraise(pending, maxLevel = MAX_CUBE) {
  return levelAfter(pending.base, pending.k + 1) <= maxLevel;
}
export function reraise(pending) {
  const k = pending.k + 1;
  const dropUnit = pending.dropUnit ?? DROP_UNIT;
  return { k, base: pending.base, raiser: pending.responder, responder: pending.raiser, level: levelAfter(pending.base, k), drop: dropCost(pending.base, k, dropUnit), dropUnit };
}
// Action ids used by the UI and the solver.
export const ACTIONS = { noDouble: "noDouble", double: "double", drop: "drop", take: "take", reraise: "reraise" };
export function optionLabel(id, k, base, cube = base, dropUnit = DROP_UNIT) {
  if (id === "noDouble") return cube > 1 ? "No redouble" : "No double";
  if (id === "double") return `${raiseLabel(0, cube)} to ${levelAfter(base, 1)}`;
  if (id === "drop") return `Drop (−${dropCost(base, k, dropUnit)})`;
  if (id === "take") return `Take at ${levelAfter(base, k)}`;
  return `${reraiseName(k)} to ${levelAfter(base, k + 1)}`;
}
