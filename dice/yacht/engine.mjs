// Yacht: thirteen rounds of five dice. Each turn rolls up to three times, holding
// any dice between rolls, then fills one box on the scorecard.
import { clone, log, rollDie, nextSeat, faceCounts, diceOutcomes } from '../table-core.mjs';

export const UPPER = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
export const LOWER = ['threeKind', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yacht', 'chance'];
export const BOX_IDS = UPPER.concat(LOWER);
export const LABELS = {
  ones: 'Ones', twos: 'Twos', threes: 'Threes', fours: 'Fours', fives: 'Fives', sixes: 'Sixes',
  threeKind: 'Three of a kind', fourKind: 'Four of a kind', fullHouse: 'Full house',
  smallStraight: 'Small straight', largeStraight: 'Large straight', yacht: 'Yacht', chance: 'Chance',
};
export const ROUNDS = BOX_IDS.length;
export const UPPER_TARGET = 63;
export const UPPER_BONUS = 35;
export const YACHT_BONUS = 100;
const FIXED = { fullHouse: 25, smallStraight: 30, largeStraight: 40 };
const FACE = Object.fromEntries(UPPER.map((id, i) => [id, i + 1]));
const NO_KEEP = [false, false, false, false, false];

// ---------- Scoring ----------

export const emptyCard = () => Object.fromEntries(BOX_IDS.map((id) => [id, null]));
export const isYacht = (dice) => dice.length === 5 && dice.every((face) => face === dice[0]);
// A further Yacht after 50 in the Yacht box: +100 and the joker rules.
export const jokerActive = (dice, card) => isYacht(dice) && card.yacht === 50;

function longestRun(counts) {
  let best = 0;
  let run = 0;
  for (let face = 1; face <= 6; face += 1) {
    run = counts[face] ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

// The box's score by the dice alone, without the joker rules.
export function rawScore(dice, box) {
  const counts = faceCounts(dice);
  const total = dice.reduce((sum, face) => sum + face, 0);
  if (FACE[box]) return counts[FACE[box]] * FACE[box];
  const most = Math.max(...counts);
  switch (box) {
    case 'threeKind': return most >= 3 ? total : 0;
    case 'fourKind': return most >= 4 ? total : 0;
    case 'fullHouse': return counts.includes(3) && counts.includes(2) ? 25 : 0;
    case 'smallStraight': return longestRun(counts) >= 4 ? 30 : 0;
    case 'largeStraight': return longestRun(counts) >= 5 ? 40 : 0;
    case 'yacht': return most === 5 ? 50 : 0;
    case 'chance': return total;
    default: throw new Error('Unknown box.');
  }
}

// What filling `box` with `dice` scores on `card`, joker rules included.
export function scoreBox(dice, box, card = emptyCard()) {
  if (jokerActive(dice, card) && FIXED[box]) return FIXED[box];
  return rawScore(dice, box);
}

// The open boxes these dice may fill. A joker must take its upper box, then any
// lower box, and only then a zero in another upper box.
export function legalBoxes(dice, card) {
  const open = BOX_IDS.filter((id) => card[id] == null);
  if (!jokerActive(dice, card)) return open;
  const upper = UPPER[dice[0] - 1];
  if (card[upper] == null) return [upper];
  const lower = LOWER.filter((id) => card[id] == null);
  return lower.length ? lower : open;
}

const sumOf = (card, ids) => ids.reduce((total, id) => total + (card[id] ?? 0), 0);
export const upperTotal = (card) => sumOf(card, UPPER);
export const filledCount = (card) => BOX_IDS.filter((id) => card[id] != null).length;

export function totals(state, seat) {
  const card = state.cards[seat];
  const upper = upperTotal(card);
  const bonus = upper >= UPPER_TARGET ? UPPER_BONUS : 0;
  const lower = sumOf(card, LOWER);
  const yachtBonus = state.yachtBonus[seat];
  return { upper, bonus, lower, yachtBonus, total: upper + bonus + lower + yachtBonus };
}

// ---------- Rules ----------

export function setup({ names, first = 0 }) {
  const state = {
    names: names.slice(),
    cards: names.map(() => emptyCard()),
    yachtBonus: names.map(() => 0),
    turn: first,
    dice: [],
    kept: NO_KEEP.slice(),
    rollsUsed: 0,
    rollId: 0,
    last: null,
    done: false,
    log: [],
  };
  return log(state, -1, `${ROUNDS} rounds. ${names[first]} to start.`);
}

export const actor = (state) => (state.done ? -1 : state.turn);

function joinNames(names) {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function outcome(state) {
  if (!state.done) return null;
  const scores = state.names.map((_, i) => totals(state, i).total);
  const best = Math.max(...scores);
  const winners = scores.map((score, i) => (score === best ? i : -1)).filter((i) => i >= 0);
  const text = state.names.length === 1 ? `${state.names[0]} finished with ${best}.`
    : winners.length === 1 ? `${state.names[winners[0]]} won with ${best}.`
      : `${joinNames(winners.map((i) => state.names[i]))} tied on ${best}.`;
  return { winners, text };
}

export function apply(previous, seat, action, rng) {
  if (seat !== actor(previous)) throw new Error('It is not your turn.');
  const state = clone(previous);
  if (action?.type === 'roll') {
    if (state.rollsUsed >= 3) throw new Error('No rolls left. Pick a box to score.');
    let keep = [];
    if (state.rollsUsed > 0) {
      keep = action.keep ?? [];
      if (!Array.isArray(keep) || keep.some((i) => !Number.isInteger(i) || i < 0 || i > 4) || new Set(keep).size !== keep.length) {
        throw new Error('Choose the dice to keep by position.');
      }
      if (keep.length === 5) throw new Error('Release at least one die to roll.');
    }
    state.kept = NO_KEEP.map((_, i) => keep.includes(i));
    state.dice = state.kept.map((kept, i) => (kept ? previous.dice[i] : rollDie(rng)));
    state.rollsUsed += 1;
    state.rollId += 1;
    return state;
  }
  if (action?.type === 'score') {
    if (state.rollsUsed === 0) throw new Error('Roll before you score.');
    const { box } = action;
    if (!BOX_IDS.includes(box)) throw new Error('Unknown box.');
    const card = state.cards[seat];
    if (card[box] != null) throw new Error(`${LABELS[box]} is already filled.`);
    const legal = legalBoxes(state.dice, card);
    if (!legal.includes(box)) {
      throw new Error(legal.length === 1 ? `A joker Yacht must go in ${LABELS[legal[0]]}.` : 'A joker Yacht must go in an open lower box.');
    }
    const bonus = jokerActive(state.dice, card) ? YACHT_BONUS : 0;
    const before = upperTotal(card);
    const score = scoreBox(state.dice, box, card);
    card[box] = score;
    state.yachtBonus[seat] += bonus;
    const reached = before < UPPER_TARGET && upperTotal(card) >= UPPER_TARGET;
    const extras = [bonus ? `a ${YACHT_BONUS} Yacht bonus` : '', reached ? `the ${UPPER_BONUS} upper bonus` : ''].filter(Boolean);
    log(state, seat, `scored ${score} in ${LABELS[box]}${extras.length ? ` and ${extras.join(' and ')}` : ''}.`);
    state.last = { seat, box, score, bonus };
    state.dice = [];
    state.kept = NO_KEEP.slice();
    state.rollsUsed = 0;
    if (state.cards.every((entry) => filledCount(entry) === ROUNDS)) {
      state.done = true;
      log(state, -1, outcome(state).text);
    } else {
      state.turn = nextSeat(state, seat);
    }
    return state;
  }
  throw new Error('Unknown move.');
}

// ---------- Bots ----------

// Each box's expected score in good play: filling a box gives up its par.
export const PAR = {
  ones: 2.1, twos: 5.3, threes: 8.6, fours: 12.2, fives: 15.7, sixes: 19.2,
  threeKind: 21.7, fourKind: 13.1, fullHouse: 22.6, smallStraight: 29.5, largeStraight: 32.7, yacht: 16.9, chance: 22.0,
};

// Every final roll (the 252 sorted outcomes), every kept multiset (462 of 0–5
// dice) with the distribution its reroll lands on, and each roll's sub-keeps.
let TABLES = null;
const countsKey = (counts) => counts[1] + 6 * counts[2] + 36 * counts[3] + 216 * counts[4] + 1296 * counts[5] + 7776 * counts[6];

export function tables() {
  if (TABLES) return TABLES;
  const outcomes = diceOutcomes(5).map(({ dice, p }) => ({ dice, p, counts: faceCounts(dice) }));
  const outcomeIndex = new Map(outcomes.map((outcome, i) => [countsKey(outcome.counts), i]));
  const keeps = [];
  const keepIndex = new Map();
  for (let size = 0; size <= 5; size += 1) {
    for (const { dice } of diceOutcomes(size)) {
      const counts = faceCounts(dice);
      const land = new Map();
      for (const reroll of diceOutcomes(5 - size)) {
        const final = counts.slice();
        for (const face of reroll.dice) final[face] += 1;
        const i = outcomeIndex.get(countsKey(final));
        land.set(i, (land.get(i) || 0) + reroll.p);
      }
      keepIndex.set(countsKey(counts), keeps.length);
      keeps.push({ counts, size, to: Int16Array.from(land.keys()), p: Float64Array.from(land.values()) });
    }
  }
  const subKeeps = outcomes.map(({ counts }) => {
    const found = [];
    const walk = (face, sub) => {
      if (face > 6) { found.push(keepIndex.get(countsKey(sub))); return; }
      for (let n = 0; n <= counts[face]; n += 1) { sub[face] = n; walk(face + 1, sub); }
      sub[face] = 0;
    };
    walk(1, [0, 0, 0, 0, 0, 0, 0]);
    return found;
  });
  TABLES = { outcomes, outcomeIndex, keeps, subKeeps, indexOf: (dice) => outcomeIndex.get(countsKey(faceCounts(dice))) };
  return TABLES;
}

// P(the upper boxes reach 63) from subtotal `upper` with the faces in `mask`
// still open, modelling each open face's count as Binomial(5, par / 5·face).
const PMF = [null];
for (let face = 1; face <= 6; face += 1) {
  const q = PAR[UPPER[face - 1]] / (5 * face);
  const binom = [1, 5, 10, 10, 5, 1];
  PMF.push(binom.map((ways, n) => ways * q ** n * (1 - q) ** (5 - n)));
}
const bonusCache = new Map();
export function bonusChance(upper, mask) {
  if (upper >= UPPER_TARGET) return 1;
  if (!mask) return 0;
  const key = upper * 128 + mask;
  if (bonusCache.has(key)) return bonusCache.get(key);
  const need = UPPER_TARGET - upper;
  let dist = new Float64Array(need + 1);
  dist[0] = 1;
  for (let face = 1; face <= 6; face += 1) {
    if (!(mask & (1 << face))) continue;
    const next = new Float64Array(need + 1);
    for (let s = 0; s <= need; s += 1) {
      if (!dist[s]) continue;
      for (let n = 0; n <= 5; n += 1) next[Math.min(need, s + n * face)] += dist[s] * PMF[face][n];
    }
    dist = next;
  }
  bonusCache.set(key, dist[need]);
  return dist[need];
}

const upperMask = (card) => UPPER.reduce((mask, id, i) => (card[id] == null ? mask | (1 << (i + 1)) : mask), 0);

// How good filling `box` with these dice is: its score against the box's par,
// plus the upper bonus (hard: its estimated chance; normal: pace of 3 a face).
function boxValue(dice, box, card, upper, mask, level) {
  const score = scoreBox(dice, box, card);
  let value = score - PAR[box];
  const face = FACE[box];
  if (level === 'hard') {
    value += UPPER_BONUS * (face ? bonusChance(upper + score, mask & ~(1 << face)) : bonusChance(upper, mask));
  } else if (face && upper < UPPER_TARGET) {
    value += 0.5 * (score - 3 * face);
  }
  return value;
}

export function bestBox(dice, card, level = 'hard') {
  const legal = legalBoxes(dice, card);
  if (level === 'easy') {
    return legal.reduce((best, box) => (scoreBox(dice, box, card) > scoreBox(dice, best, card) ? box : best), legal[0]);
  }
  const upper = upperTotal(card);
  const mask = upperMask(card);
  let best = legal[0];
  let bestValue = -Infinity;
  for (const box of legal) {
    const value = boxValue(dice, box, card, upper, mask, level);
    if (value > bestValue) { bestValue = value; best = box; }
  }
  return best;
}

// The value of stopping on each of the 252 final rolls.
function finalValues(card, level) {
  const { outcomes } = tables();
  const upper = upperTotal(card);
  const mask = upperMask(card);
  const values = new Float64Array(outcomes.length);
  outcomes.forEach(({ dice }, o) => {
    let best = -Infinity;
    for (const box of legalBoxes(dice, card)) best = Math.max(best, boxValue(dice, box, card, upper, mask, level));
    values[o] = best + (jokerActive(dice, card) ? YACHT_BONUS : 0);
  });
  return values;
}

// Expected value of each keep when the rest are rerolled into `values`.
function keepValues(values) {
  const { keeps } = tables();
  const out = new Float64Array(keeps.length);
  keeps.forEach(({ to, p }, k) => {
    let total = 0;
    for (let j = 0; j < to.length; j += 1) total += p[j] * values[to[j]];
    out[k] = total;
  });
  return out;
}

// The value of holding each final roll with one reroll still to come.
function oneLeftValues(keepValue) {
  const { subKeeps } = tables();
  return Float64Array.from(subKeeps, (subs) => Math.max(...subs.map((k) => keepValue[k])));
}

function keepIndices(dice, counts) {
  const need = counts.slice();
  const keep = [];
  dice.forEach((face, i) => { if (need[face] > 0) { need[face] -= 1; keep.push(i); } });
  return keep;
}

// The best keep for these dice: { keep, value, stop } where stop is the value of scoring now.
export function planKeep(dice, card, rollsLeft, level = 'hard') {
  const t = tables();
  const finals = finalValues(card, level);
  let values = keepValues(finals);
  if (rollsLeft >= 2 && level === 'hard') values = keepValues(oneLeftValues(values));
  const o = t.indexOf(dice);
  const options = t.subKeeps[o].filter((k) => t.keeps[k].size < 5).map((k) => ({ k, value: values[k] }));
  options.sort((a, b) => b.value - a.value);
  return { options, stop: finals[o], keep: (k) => keepIndices(dice, t.keeps[k].counts) };
}

function easyKeep(dice, card) {
  const counts = faceCounts(dice);
  const straightOpen = card.smallStraight == null || card.largeStraight == null;
  if (straightOpen) {
    for (const start of [3, 2, 1]) {
      const run = [start, start + 1, start + 2, start + 3];
      if (run.every((face) => counts[face])) return keepIndices(dice, [0, 1, 2, 3, 4, 5, 6].map((face) => (run.includes(face) ? 1 : 0)));
    }
  }
  let face = 6;
  for (let f = 6; f >= 1; f -= 1) if (counts[f] > counts[face]) face = f;
  return dice.map((value, i) => (value === face ? i : -1)).filter((i) => i >= 0);
}

export function bot(state, seat, level, rng) {
  if (state.rollsUsed === 0) return { type: 'roll', keep: [] };
  const card = state.cards[seat];
  const { dice } = state;
  if (state.rollsUsed < 3) {
    if (level === 'easy') {
      const made = ['yacht', 'largeStraight', 'fullHouse'].some((box) => card[box] == null && rawScore(dice, box) > 0);
      const keep = easyKeep(dice, card);
      if (!made && keep.length < 5) return { type: 'roll', keep };
    } else {
      const plan = planKeep(dice, card, 3 - state.rollsUsed, level);
      let choice = plan.options[0];
      if (level === 'normal' && rng() < 0.1) choice = plan.options[Math.floor(rng() * Math.min(4, plan.options.length))];
      if (choice && choice.value > plan.stop + 1e-9) return { type: 'roll', keep: plan.keep(choice.k) };
    }
  }
  return { type: 'score', box: bestBox(dice, card, level) };
}

// ---------- Game ----------

export const game = {
  id: 'yacht',
  name: 'Yacht',
  players: { min: 1, max: 4, default: 2 },
  hidden: false,
  options: [],
  setup,
  actor,
  apply,
  view: (state) => state,
  bot,
  pace: (state, action) => (action.type === 'score' ? 1100 : 700),
  summary: (state, seat) => String(totals(state, seat).total),
  status(state, seat, { canAct } = {}) {
    if (state.done) return outcome(state).text;
    if (canAct) {
      if (state.rollsUsed === 0) return 'Your turn. Roll the dice.';
      if (state.rollsUsed < 3) return 'Your turn: hold dice and roll again, or pick a box.';
      return 'Your turn: pick a box to score.';
    }
    return `${state.names[state.turn]} to ${state.rollsUsed >= 3 ? 'score' : 'roll'}.`;
  },
  outcome,
};
