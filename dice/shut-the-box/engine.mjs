// Shut the Box: roll, shut open tiles that add up to the roll, roll again.
// The turn ends when no open tiles make the roll; the open tiles are the score.
// Lowest total over the rounds wins.
import { clone, log, rollDie, nextSeat, pick } from '../table-core.mjs';

export const TILES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const FULL = 511; // every tile open: bit (n - 1) is tile n
const HIGH = (1 << 6) | (1 << 7) | (1 << 8); // tiles 7, 8 and 9

// ---------- Tile masks ----------

const SUMS = new Int8Array(512);
for (let mask = 1; mask < 512; mask += 1) {
  for (let i = 0; i < 9; i += 1) if (mask & (1 << i)) SUMS[mask] += i + 1;
}

// Every tile set worth 2–12 (the most two dice can show), grouped by its sum.
const BY_SUM = Array.from({ length: 13 }, () => []);
for (let mask = 1; mask < 512; mask += 1) if (SUMS[mask] <= 12) BY_SUM[SUMS[mask]].push(mask);

export const openSum = (mask) => SUMS[mask & FULL];
export const tilesOf = (mask) => TILES.filter((n) => mask & (1 << (n - 1)));
export const maskOf = (tiles) => tiles.reduce((mask, n) => mask | (1 << (n - 1)), 0);
export const isOpen = (mask, n) => Boolean(mask & (1 << (n - 1)));
export const canRollOne = (mask) => mask > 0 && (mask & HIGH) === 0;

// Every set of open tiles adding up to `total`, as masks.
export function wayMasks(openMask, total) {
  if (!Number.isInteger(total) || total < 1 || total > 12) return [];
  return BY_SUM[total].filter((set) => (set & openMask) === set);
}

// Every set of open tiles adding up to `total`, as ascending tile lists.
export const waysToShut = (openMask, total) => wayMasks(openMask, total).map(tilesOf);

// "A", "A and B", "A, B and C".
export function listText(items) {
  const list = items.map(String);
  return list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

// "9", "6 and 3", "6, 2 and 1": highest first.
export const tileText = (tiles) => listText(tiles.slice().sort((a, b) => b - a));

// ---------- Exact play ----------

// Roll totals with their chances for one die and for two.
const ONE_DIE = [1, 2, 3, 4, 5, 6].map((total) => [total, 1 / 6]);
const TWO_DICE = Array.from({ length: 11 }, (_, i) => [i + 2, (6 - Math.abs(i + 2 - 7)) / 36]);
const EPS = 1e-12;

// Dynamic programming over the 512 tile states for any end-of-turn utility
// (higher is better). value[mask] is the best expected utility about to roll
// with `mask` open; one[mask] and two[mask] are the values of each dice choice.
export function solve(utility) {
  const value = new Float64Array(512);
  const one = new Float64Array(512).fill(-Infinity);
  const two = new Float64Array(512);
  value[0] = utility(0);
  const rollValue = (mask, outcomes) => {
    const stuck = utility(SUMS[mask]);
    let total = 0;
    for (const [sum, p] of outcomes) {
      let best = -Infinity;
      for (const set of wayMasks(mask, sum)) best = Math.max(best, value[mask & ~set]);
      total += p * (best === -Infinity ? stuck : best);
    }
    return total;
  };
  // Shutting tiles only clears bits, so every successor is a smaller number.
  for (let mask = 1; mask < 512; mask += 1) {
    two[mask] = rollValue(mask, TWO_DICE);
    if (canRollOne(mask)) one[mask] = rollValue(mask, ONE_DIE);
    value[mask] = Math.max(two[mask], one[mask]);
  }
  return { value, one, two };
}

// Golf scoring: minimise the expected open-tile sum. Computed once.
let expected = null;
function expectedTable() {
  if (!expected) expected = solve((score) => -score);
  return expected;
}

// Expected final score with exact play from `mask`, about to roll.
export const expectedScore = (mask = FULL) => -expectedTable().value[mask & FULL];

// Win probability in the decisive last turn: a score under `need` wins outright,
// equal to `need` shares the win (worth half).
const winTables = new Map();
function winTable(need) {
  if (!winTables.has(need)) winTables.set(need, solve((score) => (score < need ? 1 : score === need ? 0.5 : 0)));
  return winTables.get(need);
}
export const winChance = (mask, need) => winTable(need).value[mask & FULL];

// ---------- Rules ----------

const scoreTotal = (rounds) => rounds.reduce((total, score) => total + (score ?? 0), 0);
export const totals = (state) => state.scores.map(scoreTotal);
const scoreList = (state, values) => state.names.map((name, i) => `${name} ${values[i]}`).join(', ');

export function setup({ names, options = {}, first = 0 }) {
  const rounds = [1, 3, 5].includes(options.rounds) ? options.rounds : 3;
  const start = ((first % names.length) + names.length) % names.length;
  const state = {
    names: names.slice(),
    rounds,
    round: 1,
    first: start,
    turn: start,
    played: 0, // turns finished this round
    open: FULL,
    roll: 0, // the total waiting to be shut; 0 while the actor must roll
    dice: [],
    lastSeat: -1,
    lastShut: [], // the tiles shut since the last roll, highest first
    turnRolls: 0,
    rollId: 0,
    scores: names.map(() => Array.from({ length: rounds }, () => null)),
    last: null, // the most recent finished turn
    over: false,
    winners: [],
    log: [],
  };
  const plan = names.length === 1 ? `${rounds === 1 ? '1 round' : `${rounds} rounds`}: aim for the lowest total.` : `${rounds === 1 ? '1 round' : `${rounds} rounds`}; the lowest total wins.`;
  return log(state, -1, names.length === 1 ? plan : `${plan} ${names[start]} to start.`);
}

export const actor = (state) => (state.over ? -1 : state.turn);

function endTurn(state, seat, score, shut) {
  state.scores[seat][state.round - 1] = score;
  state.last = { seat, score, shut, open: state.open, round: state.round };
  state.played += 1;
  state.open = FULL;
  state.roll = 0;
  state.turnRolls = 0;
  const n = state.names.length;
  if (state.played < n) {
    state.turn = nextSeat(state, seat);
    return;
  }
  const sums = totals(state);
  if (state.round < state.rounds) {
    if (n > 1) log(state, -1, `After round ${state.round}: ${scoreList(state, sums)}.`);
    state.round += 1;
    state.played = 0;
    state.turn = (state.first + state.round - 1) % n;
    return;
  }
  state.over = true;
  const best = Math.min(...sums);
  state.winners = n > 1 ? sums.map((total, i) => (total === best ? i : -1)).filter((i) => i >= 0) : [];
  if (n > 1 && state.rounds > 1) log(state, -1, `Final totals: ${scoreList(state, sums)}.`);
  log(state, -1, resultText(state));
}

function resultText(state) {
  const sums = totals(state);
  if (state.names.length === 1) return `${state.names[0]} finished with ${sums[0]}${state.rounds > 1 ? ` over ${state.rounds} rounds` : ''}.`;
  const names = state.winners.map((i) => state.names[i]);
  if (names.length === 1) return `${names[0]} won with ${sums[state.winners[0]]}.`;
  return `${listText(names)} tied on ${sums[state.winners[0]]}.`;
}

export function apply(previous, seat, action, rng) {
  if (previous.over) throw new Error('The game is over.');
  if (seat !== actor(previous)) throw new Error('It is not your turn.');
  if (!action || typeof action !== 'object') throw new Error('Unknown move.');
  const state = clone(previous);

  if (action.type === 'roll') {
    if (state.roll > 0) throw new Error('Shut tiles for this roll first.');
    const count = action.dice ?? 2;
    if (count !== 1 && count !== 2) throw new Error('Roll one die or two.');
    if (count === 1 && !canRollOne(state.open)) throw new Error('You can roll one die only once 7, 8 and 9 are shut.');
    state.dice = Array.from({ length: count }, () => rollDie(rng));
    state.lastSeat = seat;
    state.lastShut = [];
    state.rollId += 1;
    state.turnRolls += 1;
    const total = state.dice.reduce((a, b) => a + b, 0);
    if (wayMasks(state.open, total).length === 0) {
      const score = openSum(state.open);
      log(state, seat, `could not make ${total} and scored ${score}.`);
      endTurn(state, seat, score, false);
    } else {
      state.roll = total;
    }
    return state;
  }

  if (action.type === 'shut') {
    if (state.roll <= 0) throw new Error('Roll before you shut tiles.');
    const tiles = action.tiles;
    if (!Array.isArray(tiles) || tiles.length === 0) throw new Error('Choose tiles to shut.');
    if (!tiles.every((n) => Number.isInteger(n) && n >= 1 && n <= 9)) throw new Error('Tiles run from 1 to 9.');
    if (new Set(tiles).size !== tiles.length) throw new Error('Choose each tile once.');
    if (!tiles.every((n) => isOpen(state.open, n))) throw new Error('That tile is already shut.');
    const sum = tiles.reduce((a, b) => a + b, 0);
    if (sum !== state.roll) throw new Error(`The tiles must add up to ${state.roll}.`);
    state.open &= ~maskOf(tiles);
    state.lastShut = tiles.slice().sort((a, b) => b - a);
    log(state, seat, `rolled ${state.roll}${state.dice.length === 1 ? ' on one die' : ''} and shut ${tileText(tiles)}.`);
    state.roll = 0;
    if (state.open === 0) {
      log(state, seat, 'shut the box!');
      endTurn(state, seat, 0, true);
    }
    return state;
  }

  throw new Error('Unknown move.');
}

// ---------- Bots ----------

// Fewest tiles first, then the highest tiles: the tidy human choice.
function tidyOrder(a, b) {
  const ta = tilesOf(a).reverse();
  const tb = tilesOf(b).reverse();
  if (ta.length !== tb.length) return ta.length - tb.length;
  for (let i = 0; i < ta.length; i += 1) if (ta[i] !== tb[i]) return tb[i] - ta[i];
  return 0;
}

// The utility the hard bot plays for. In the last turn of the last round every
// other total is final, so it plays exactly for the win; otherwise it plays
// for the lowest expected score.
export function decisiveNeed(state, seat) {
  const n = state.names.length;
  if (n < 2 || state.round !== state.rounds || state.played !== n - 1) return null;
  const sums = totals(state);
  const need = Math.min(...sums.filter((_, i) => i !== seat)) - sums[seat];
  // Out of reach or already safe: every policy has the same win chance.
  if (need < 0 || need > 45) return null;
  return need;
}

function hardChoice(state, seat) {
  const need = decisiveNeed(state, seat);
  const exp = expectedTable();
  const win = need === null ? null : winTable(need);
  if (state.roll > 0) {
    const options = wayMasks(state.open, state.roll);
    const score = (set) => {
      const rest = state.open & ~set;
      return [win ? win.value[rest] : 0, exp.value[rest]];
    };
    let best = options[0];
    let bestScore = score(best);
    for (const set of options.slice(1)) {
      const s = score(set);
      const better = s[0] > bestScore[0] + EPS || (Math.abs(s[0] - bestScore[0]) <= EPS && (s[1] > bestScore[1] + EPS || (Math.abs(s[1] - bestScore[1]) <= EPS && tidyOrder(set, best) < 0)));
      if (better) { best = set; bestScore = s; }
    }
    return { type: 'shut', tiles: tilesOf(best) };
  }
  if (!canRollOne(state.open)) return { type: 'roll', dice: 2 };
  const table = win || exp;
  const one = table.one[state.open];
  const two = table.two[state.open];
  if (one > two + EPS) return { type: 'roll', dice: 1 };
  if (two > one + EPS || !win) return { type: 'roll', dice: 2 };
  return { type: 'roll', dice: exp.one[state.open] > exp.two[state.open] + EPS ? 1 : 2 };
}

export function bot(state, seat, level, rng) {
  if (level === 'hard') return hardChoice(state, seat);
  if (state.roll > 0) {
    const options = wayMasks(state.open, state.roll);
    if (level === 'easy') return { type: 'shut', tiles: tilesOf(pick(rng, options)) };
    return { type: 'shut', tiles: tilesOf(options.slice().sort(tidyOrder)[0]) };
  }
  if (level === 'easy') return { type: 'roll', dice: 2 };
  return { type: 'roll', dice: canRollOne(state.open) && openSum(state.open) <= 6 ? 1 : 2 };
}

// ---------- Text ----------

const turnText = (state) => {
  const who = state.names[state.turn];
  if (state.roll > 0) return `${who} to shut tiles for ${state.roll}.`;
  return `${who} to roll.`;
};

export function status(state, seat, { canAct } = {}) {
  if (state.over) return resultText(state);
  const cheer = state.turnRolls === 0 && state.last?.shut ? `${state.names[state.last.seat]} shut the box! ` : '';
  if (canAct) {
    if (state.roll > 0) return `${cheer}Your turn: shut tiles adding up to ${state.roll}.`;
    return `${cheer}Your turn: ${canRollOne(state.open) ? 'roll one die or two' : 'roll the dice'}.`;
  }
  return `${cheer}${turnText(state)}`;
}

export const game = {
  id: 'shut-the-box',
  name: 'Shut the Box',
  players: { min: 1, max: 4, default: 2 },
  hidden: false,
  options: [
    { id: 'rounds', label: 'Rounds', choices: [{ value: 1, label: '1' }, { value: 3, label: '3' }, { value: 5, label: '5' }], default: 3 },
  ],
  setup,
  actor,
  apply,
  view: (state) => state,
  bot,
  pace: (state, action) => (action.type === 'shut' ? 1000 : 850),
  summary: (state, seat) => String(totals(state)[seat]),
  status,
  outcome: (state) => (state.over ? { winners: state.winners.slice(), text: resultText(state) } : null),
};
