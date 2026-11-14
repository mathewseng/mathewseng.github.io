// The exact Yacht solitaire solver shared by the engine and scripts/solve.mjs.
//
// A turn starts in a state (open boxes, upper subtotal capped at 63, what the Yacht box holds).
// data/values.f32 stores every reachable state's expected future score under optimal play;
// within a turn the "widget" (252 sorted rolls, 462 kept multisets, two rerolls) is solved
// exactly on demand from those end-of-turn values.

export const BOXES = 13;
export const YACHT_BOX = 11;
export const UPPER_TARGET = 63;
export const UPPER_BONUS = 35;
export const YACHT_BONUS = 100;
const FIXED = [0, 0, 0, 0, 0, 0, 0, 0, 25, 30, 40, 0, 0]; // joker full house and straights
const LOWER_BIT = [-1, -1, -1, -1, -1, -1, 0, 1, 2, 3, 4, -1, 5]; // bit in lm6 (Yacht is separate)

// ---------- Multisets ----------
// Keeps are every multiset of 0–5 dice, ordered by size so smaller keeps come first;
// the 252 of size 5 are the rolls.
const countsKey = (c) => c[1] + 6 * c[2] + 36 * c[3] + 216 * c[4] + 1296 * c[5] + 7776 * c[6];
export const KEEPS = [];
const keyToKeep = new Map();
(function build() {
  const walk = (size, face, counts, left) => {
    if (face > 6) {
      if (left) return;
      keyToKeep.set(countsKey(counts), KEEPS.length);
      KEEPS.push({ counts: counts.slice(), size });
      return;
    }
    for (let n = 0; n <= left; n += 1) { counts[face] = n; walk(size, face + 1, counts, left - n); }
    counts[face] = 0;
  };
  for (let size = 0; size <= 5; size += 1) walk(size, 1, [0, 0, 0, 0, 0, 0, 0], size);
})();
export const N_KEEPS = KEEPS.length; // 462
export const ADD = new Int16Array(N_KEEPS * 6).fill(-1); // keep + one die of face f+1
export const REMOVE = new Int16Array(N_KEEPS * 6).fill(-1); // keep − one die of face f+1
KEEPS.forEach(({ counts, size }, k) => {
  for (let f = 1; f <= 6; f += 1) {
    const c = counts.slice();
    if (size < 5) { c[f] += 1; ADD[k * 6 + f - 1] = keyToKeep.get(countsKey(c)); c[f] -= 1; }
    if (counts[f]) { c[f] -= 1; REMOVE[k * 6 + f - 1] = keyToKeep.get(countsKey(c)); }
  }
});
export const FIRST_ROLL = KEEPS.findIndex((k) => k.size === 5);
export const ROLLS = N_KEEPS - FIRST_ROLL; // 252

export function keepOf(faces) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const face of faces) counts[face] += 1;
  return keyToKeep.get(countsKey(counts));
}

// Raw scores of every roll in every box, and which rolls are five alike.
export const RAW = new Int16Array(ROLLS * BOXES);
export const YACHT_ROLL = new Int8Array(ROLLS); // face of a five-alike roll, else 0
for (let r = 0; r < ROLLS; r += 1) {
  const c = KEEPS[FIRST_ROLL + r].counts;
  let total = 0;
  let most = 0;
  let run = 0;
  let longest = 0;
  for (let f = 1; f <= 6; f += 1) {
    total += c[f] * f;
    most = Math.max(most, c[f]);
    run = c[f] ? run + 1 : 0;
    longest = Math.max(longest, run);
    RAW[r * BOXES + f - 1] = c[f] * f;
    if (c[f] === 5) YACHT_ROLL[r] = f;
  }
  const row = r * BOXES;
  RAW[row + 6] = most >= 3 ? total : 0;
  RAW[row + 7] = most >= 4 ? total : 0;
  RAW[row + 8] = c.includes(3) && c.includes(2) ? 25 : 0;
  RAW[row + 9] = longest >= 4 ? 30 : 0;
  RAW[row + 10] = longest >= 5 ? 40 : 0;
  RAW[row + 11] = most === 5 ? 50 : 0;
  RAW[row + 12] = total;
}

// ---------- State index ----------
// um: filled upper boxes (bit f−1 for face f); sub: upper subtotal capped at 63;
// lm6: filled lower boxes other than Yacht; y: Yacht box 0 open, 1 holds 0, 2 holds 50.
// index = (UPPER_OFFSET[um] + rank of sub) · 192 + lm6 · 3 + y, over reachable subtotals only.
export const LOWER_STATES = 192;
export const UPPER_RANK = new Int16Array(64 * 64).fill(-1);
export const UPPER_SUBS = [];
export let UPPER_ROWS = 0;
for (let um = 0; um < 64; um += 1) {
  let subs = new Set([0]);
  for (let f = 1; f <= 6; f += 1) {
    if (!(um & (1 << (f - 1)))) continue;
    const next = new Set();
    for (const s of subs) for (let n = 0; n <= 5; n += 1) next.add(Math.min(UPPER_TARGET, s + n * f));
    subs = next;
  }
  const sorted = [...subs].sort((a, b) => a - b);
  UPPER_SUBS.push(sorted);
  sorted.forEach((sub, i) => { UPPER_RANK[um * 64 + sub] = UPPER_ROWS + i; });
  UPPER_ROWS += sorted.length;
}
export const STATE_COUNT = UPPER_ROWS * LOWER_STATES; // 536,448

export function stateIndex(um, sub, lm6, y) {
  const row = UPPER_RANK[um * 64 + Math.min(sub, UPPER_TARGET)];
  if (row < 0) throw new Error(`Unreachable upper subtotal ${sub} for mask ${um}.`);
  return row * LOWER_STATES + lm6 * 3 + y;
}

// A scorecard (box id → score or null, in engine order) as a solver state.
export function cardState(card, boxIds) {
  let um = 0;
  let sub = 0;
  let lm6 = 0;
  let y = 0;
  boxIds.forEach((id, b) => {
    const value = card[id];
    if (value == null) return;
    if (b < 6) { um |= 1 << b; sub += value; } else if (b === YACHT_BOX) y = value === 50 ? 2 : 1;
    else lm6 |= 1 << LOWER_BIT[b];
  });
  return { um, sub: Math.min(sub, UPPER_TARGET), lm6, y };
}

const isOpen = (s, b) => (b < 6 ? !(s.um & (1 << b)) : b === YACHT_BOX ? s.y === 0 : !(s.lm6 & (1 << LOWER_BIT[b])));

// ---------- One turn ----------

// Per state: the value of each box choice for each roll, as immediate points plus the
// expected future, given `V` (the table) — { stop[r], choice(r, b) }.
export function turnState(s, V) {
  const next = (b, score) => {
    let { um, sub, lm6, y } = s;
    let bonus = 0;
    if (b < 6) {
      um |= 1 << b;
      if (sub < UPPER_TARGET && sub + score >= UPPER_TARGET) bonus = UPPER_BONUS;
      sub = Math.min(UPPER_TARGET, sub + score);
    } else if (b === YACHT_BOX) y = score === 50 ? 2 : 1;
    else lm6 |= 1 << LOWER_BIT[b];
    const full = um === 63 && lm6 === 63 && y > 0;
    return bonus + (full ? 0 : V[stateIndex(um, sub, lm6, y)]);
  };
  // Future value after filling box b with each possible score.
  const open = [];
  const after = new Array(BOXES);
  for (let b = 0; b < BOXES; b += 1) {
    if (!isOpen(s, b)) continue;
    open.push(b);
    if (b < 6) after[b] = Float64Array.from({ length: 6 }, (_, n) => next(b, n * (b + 1)));
    else if (b === YACHT_BOX) after[b] = [next(b, 0), next(b, 50)];
    else after[b] = next(b, 0);
  }
  const upperOpen = open.filter((b) => b < 6);
  const lowerOpen = open.filter((b) => b >= 6);
  const legal = (r) => {
    const face = YACHT_ROLL[r];
    if (!face || s.y !== 2) return open;
    if (isOpen(s, face - 1)) return [face - 1];
    return lowerOpen.length ? lowerOpen : upperOpen;
  };
  // Points now (incl. any 100 Yacht bonus) plus the expected future for box b.
  const value = (r, b, joker) => {
    const score = joker && FIXED[b] ? FIXED[b] : RAW[r * BOXES + b];
    const future = b < 6 ? after[b][score / (b + 1)] : b === YACHT_BOX ? after[b][score ? 1 : 0] : after[b];
    return score + (joker ? YACHT_BONUS : 0) + future;
  };
  const choice = (r, b) => {
    const joker = Boolean(YACHT_ROLL[r]) && s.y === 2;
    return { score: joker && FIXED[b] ? FIXED[b] : RAW[r * BOXES + b], bonus: joker ? YACHT_BONUS : 0, value: value(r, b, joker) };
  };
  const stop = new Float64Array(ROLLS);
  for (let r = 0; r < ROLLS; r += 1) {
    const joker = Boolean(YACHT_ROLL[r]) && s.y === 2;
    const boxes = joker ? legal(r) : open;
    let best = -Infinity;
    for (let i = 0; i < boxes.length; i += 1) {
      const v = value(r, boxes[i], joker);
      if (v > best) best = v;
    }
    stop[r] = best;
  }
  return { stop, legal, choice };
}

// Expected value of each keep when the rest are rerolled into roll values `rollValue`
// (a full keep is just that roll's value).
export function keepValues(rollValue) {
  const ev = new Float64Array(N_KEEPS);
  for (let r = 0; r < ROLLS; r += 1) ev[FIRST_ROLL + r] = rollValue[r];
  for (let k = FIRST_ROLL - 1; k >= 0; k -= 1) {
    let total = 0;
    for (let f = 0; f < 6; f += 1) total += ev[ADD[k * 6 + f]];
    ev[k] = total / 6;
  }
  return ev;
}

// The value of each roll when its best sub-keep (all five = stop) is chosen.
export function bestRollValues(ev) {
  const best = new Float64Array(N_KEEPS);
  for (let k = 0; k < N_KEEPS; k += 1) {
    let m = ev[k];
    for (let f = 0; f < 6; f += 1) {
      const sub = REMOVE[k * 6 + f];
      if (sub >= 0 && best[sub] > m) m = best[sub];
    }
    best[k] = m;
  }
  return best.subarray(FIRST_ROLL);
}

// The whole turn: keep values with one reroll left (ev2) and two left (ev1), and the
// expected future at the turn's start.
export function solveTurn(s, V) {
  const turn = turnState(s, V);
  const ev2 = keepValues(turn.stop);
  const ev1 = keepValues(bestRollValues(ev2));
  const ev0 = keepValues(bestRollValues(ev1));
  return { ...turn, ev1, ev2, start: ev0[0] };
}
