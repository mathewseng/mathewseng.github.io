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
export const MAX_SCORE = 45;

// Successor masks for every (mask, roll total), flattened so a solve is a tight loop.
// Totals 1–12 use slots 0–11: slot t - 1 of mask m spans NEXT[START[m*12+t-1] .. START[m*12+t]).
const START = new Int32Array(512 * 12 + 1);
const NEXT = [];
for (let mask = 0; mask < 512; mask += 1) {
  for (let total = 1; total <= 12; total += 1) {
    START[mask * 12 + total - 1] = NEXT.length;
    for (const set of wayMasks(mask, total)) NEXT.push(mask & ~set);
  }
}
START[512 * 12] = NEXT.length;
const NEXT_MASKS = Int16Array.from(NEXT);
const ONE_TOTALS = Int8Array.from(ONE_DIE.map(([t]) => t));
const ONE_P = Float64Array.from(ONE_DIE.map(([, p]) => p));
const TWO_TOTALS = Int8Array.from(TWO_DICE.map(([t]) => t));
const TWO_P = Float64Array.from(TWO_DICE.map(([, p]) => p));

// Dynamic programming over the 512 tile states for an end-of-turn utility
// u[score] (score 0–45, higher is better). value[mask] is the best expected
// utility about to roll with `mask` open; one[mask] and two[mask] are the
// values of each dice choice (one is -Infinity where one die is not allowed).
function solveScores(u) {
  const value = new Float64Array(512);
  const one = new Float64Array(512).fill(-Infinity);
  const two = new Float64Array(512);
  value[0] = u[0];
  const rollValue = (mask, totals, chances) => {
    const stuck = u[SUMS[mask]];
    let sum = 0;
    for (let i = 0; i < totals.length; i += 1) {
      const slot = mask * 12 + totals[i] - 1;
      const end = START[slot + 1];
      let best = -Infinity;
      for (let j = START[slot]; j < end; j += 1) if (value[NEXT_MASKS[j]] > best) best = value[NEXT_MASKS[j]];
      sum += chances[i] * (best === -Infinity ? stuck : best);
    }
    return sum;
  };
  // Shutting tiles only clears bits, so every successor is a smaller number.
  for (let mask = 1; mask < 512; mask += 1) {
    two[mask] = rollValue(mask, TWO_TOTALS, TWO_P);
    if (canRollOne(mask)) one[mask] = rollValue(mask, ONE_TOTALS, ONE_P);
    value[mask] = Math.max(two[mask], one[mask]);
  }
  return { value, one, two, u };
}

// The same for any utility function of the final score.
export function solve(utility) {
  return solveScores(Float64Array.from({ length: MAX_SCORE + 1 }, (_, score) => utility(score)));
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

// The distribution of a turn's final score (index = score) from `mask` when
// every choice follows `table` (ties go to two dice and the tidy set, as the hard bot plays).
export function scoreDistribution(table, mask = FULL) {
  const size = MAX_SCORE + 1;
  const dist = new Float64Array(512 * size);
  dist[0] = 1;
  const add = (to, from, p) => { for (let s = 0; s < size; s += 1) dist[to * size + s] += p * dist[from * size + s]; };
  for (let m = 1; m <= (mask & FULL); m += 1) {
    const useOne = table.one[m] > table.two[m] + EPS;
    const totals = useOne ? ONE_TOTALS : TWO_TOTALS;
    const chances = useOne ? ONE_P : TWO_P;
    for (let i = 0; i < totals.length; i += 1) {
      const slot = m * 12 + totals[i] - 1;
      let best = -1;
      for (let j = START[slot]; j < START[slot + 1]; j += 1) {
        const rest = NEXT_MASKS[j];
        const gap = best < 0 ? Infinity : table.value[rest] - table.value[best];
        if (gap > EPS || (Math.abs(gap) <= EPS && tidyOrder(m & ~rest, m & ~best) < 0)) best = rest;
      }
      if (best < 0) dist[m * size + SUMS[m]] += chances[i];
      else add(m, best, chances[i]);
    }
  }
  return dist.slice((mask & FULL) * size, ((mask & FULL) + 1) * size);
}

// One full turn played for the lowest expected score, and sums of k such turns.
let turnDist = null;
const turnSums = [Float64Array.of(1)];
function turnsDistribution(k) {
  if (!turnDist) turnDist = scoreDistribution(expectedTable());
  while (turnSums.length <= k) {
    const prev = turnSums[turnSums.length - 1];
    const next = new Float64Array(prev.length + MAX_SCORE);
    for (let a = 0; a < prev.length; a += 1) if (prev[a]) for (let s = 0; s <= MAX_SCORE; s += 1) next[a + s] += prev[a] * turnDist[s];
    turnSums.push(next);
  }
  return turnSums[k];
}

// ---------- Playing for the match ----------

// Every turn of the match in order, as seats: round r opens with seat (first + r - 1) mod n.
function turnOrder(state) {
  const n = state.names.length;
  const order = [];
  for (let r = 0; r < state.rounds; r += 1) for (let i = 0; i < n; i += 1) order.push((state.first + r + i) % n);
  return order;
}

// Two players: W(k, D) is seat 0's exact chance to win (a tie is half a win)
// from the start of turn k with D = seat 0's total minus seat 1's, when both
// players play every later turn to win. Shared by every game with the same order.
const duelMemo = new Map();
function duelWin(order, k, d) {
  let left0 = 0;
  let left1 = 0;
  for (let i = k; i < order.length; i += 1) if (order[i] === 0) left0 += 1; else left1 += 1;
  if (d + MAX_SCORE * left0 < 0) return 1;
  if (d - MAX_SCORE * left1 > 0) return 0;
  if (k === order.length) return d < 0 ? 1 : d === 0 ? 0.5 : 0;
  const key = `${order.join('')}|${k}|${d}`;
  if (duelMemo.has(key)) return duelMemo.get(key);
  const best = solveScores(duelUtility(order, k, d)).value[FULL]; // the mover's chance
  const value = order[k] === 0 ? best : 1 - best;
  duelMemo.set(key, value);
  return value;
}

// The mover's utility for each final score of turn k (their own chance to win).
function duelUtility(order, k, d) {
  const mover = order[k];
  const u = new Float64Array(MAX_SCORE + 1);
  for (let s = 0; s <= MAX_SCORE; s += 1) {
    const w = duelWin(order, k + 1, mover === 0 ? d + s : d - s);
    u[s] = mover === 0 ? w : 1 - w;
  }
  return u;
}

// Share of the win for a final total `mine` against independent opponents, each
// given as { at, above } (chance to finish exactly on, or above, each total):
// ties split the win equally.
function winShare(mine, others) {
  let poly = [1]; // poly[t]: chance every opponent is at or above `mine` with t of them tied
  for (const { at, above } of others) {
    const tie = at[mine] || 0;
    const over = mine < above.length ? above[mine] : 0;
    const next = new Array(poly.length + 1).fill(0);
    for (let t = 0; t < poly.length; t += 1) { next[t] += poly[t] * over; next[t + 1] += poly[t] * tie; }
    poly = next;
  }
  return poly.reduce((total, p, t) => total + p / (t + 1), 0);
}

// Three or four players: the mover's chance to win if every later turn (theirs
// and everyone else's) is played for the lowest expected score. Exact on the
// last turn of the match, an estimate before it. Cached per turn.
const crowdMemo = new Map();
function crowdUtility(state, order, k, seat) {
  const sums = totals(state);
  const key = `${order.join('')}|${k}|${seat}|${sums.join()}`;
  if (crowdMemo.has(key)) return crowdMemo.get(key);
  const left = state.names.map((_, i) => order.slice(k + 1).filter((s) => s === i).length);
  const others = [];
  sums.forEach((total, i) => {
    if (i === seat) return;
    const dist = turnsDistribution(left[i]);
    const at = new Float64Array(total + dist.length);
    at.set(dist, total);
    const above = new Float64Array(at.length);
    for (let v = at.length - 2; v >= 0; v -= 1) above[v] = above[v + 1] + at[v + 1];
    others.push({ at, above });
  });
  const mineLater = turnsDistribution(left[seat]);
  const top = sums[seat] + MAX_SCORE + mineLater.length;
  const share = new Float64Array(top);
  for (let m = sums[seat]; m < top; m += 1) share[m] = winShare(m, others);
  const u = new Float64Array(MAX_SCORE + 1);
  for (let s = 0; s <= MAX_SCORE; s += 1) {
    let total = 0;
    for (let x = 0; x < mineLater.length; x += 1) if (mineLater[x]) total += mineLater[x] * share[sums[seat] + s + x];
    u[s] = total;
  }
  const result = { u, exact: left.every((count) => count === 0) };
  crowdMemo.set(key, result);
  if (crowdMemo.size > 64) crowdMemo.delete(crowdMemo.keys().next().value);
  return result;
}

// What this turn is played for: { kind: 'expected' } or { kind: 'win', u, exact }.
export function turnGoal(state, seat) {
  const n = state.names.length;
  if (n < 2) return { kind: 'expected', exact: true };
  const order = turnOrder(state);
  const k = (state.round - 1) * n + state.played;
  let goal;
  if (n === 2) {
    const sums = totals(state);
    goal = { kind: 'win', u: duelUtility(order, k, sums[0] - sums[1]), exact: true };
  } else {
    goal = { kind: 'win', ...crowdUtility(state, order, k, seat) };
  }
  // When no score this turn changes the win chance, play for the lowest score.
  const spread = Math.max(...goal.u) - Math.min(...goal.u);
  return spread < EPS ? { kind: 'expected', exact: true, settled: goal.u[0], settledExact: goal.exact } : goal;
}

// The last player of the last round with every other total known: the score
// to beat (a tie shares), or null when no policy changes the result.
export function decisiveNeed(state, seat) {
  const n = state.names.length;
  if (n < 2 || state.round !== state.rounds || state.played !== n - 1) return null;
  const sums = totals(state);
  const need = Math.min(...sums.filter((_, i) => i !== seat)) - sums[seat];
  if (need < 0 || need > MAX_SCORE) return null;
  return need;
}

// ---------- Best move ----------

const tableCache = new Map();
function tableFor(u) {
  const key = Array.from(u, (x) => x.toPrecision(15)).join(',');
  if (!tableCache.has(key)) {
    tableCache.set(key, solveScores(u));
    if (tableCache.size > 64) tableCache.delete(tableCache.keys().next().value);
  }
  return tableCache.get(key);
}

const percent = (p) => `${(100 * p).toFixed(1)}%`;
const shutLabel = (tiles) => `Shut ${tileText(tiles)}`;

// Fewest tiles first, then the highest tiles: the tidy human choice.
function tidyOrder(a, b) {
  const ta = tilesOf(a).reverse();
  const tb = tilesOf(b).reverse();
  if (ta.length !== tb.length) return ta.length - tb.length;
  for (let i = 0; i < ta.length; i += 1) if (ta[i] !== tb[i]) return tb[i] - ta[i];
  return 0;
}

// The solver's ranked moves for the seat about to act. Win chance first (when
// the match is two or more players and the result can still change), then the
// lowest expected score, then the tidy choice.
export function advise(state, seat) {
  if (!state || state.over || seat !== state.turn) return null;
  const goal = turnGoal(state, seat);
  const exp = expectedTable();
  const win = goal.kind === 'win' ? tableFor(goal.u) : null;
  const left = (v) => `Expected ${(-v).toFixed(2)} left`;
  let options;
  if (state.roll > 0) {
    options = wayMasks(state.open, state.roll).map((set) => {
      const rest = state.open & ~set;
      return { set, action: { type: 'shut', tiles: tilesOf(set) }, label: shutLabel(tilesOf(set)), win: win ? win.value[rest] : 0, exp: exp.value[rest] };
    });
  } else {
    const roll = (dice) => ({ action: { type: 'roll', dice }, label: dice === 1 ? 'Roll one die' : 'Roll two dice', win: win ? win[dice === 1 ? 'one' : 'two'][state.open] : 0, exp: exp[dice === 1 ? 'one' : 'two'][state.open], dice });
    options = canRollOne(state.open) ? [roll(2), roll(1)] : [roll(2)];
  }
  options.sort((a, b) => {
    if (Math.abs(a.win - b.win) > EPS) return b.win - a.win;
    if (Math.abs(a.exp - b.exp) > EPS) return b.exp - a.exp;
    if (a.set !== undefined) return tidyOrder(a.set, b.set);
    return b.dice - a.dice; // two dice on a tie
  });
  let metric;
  let note;
  if (win) {
    metric = 'Chance to win the match';
    note = goal.exact
      ? (state.names.length === 2 && !(state.round === state.rounds && state.played === 1)
        ? 'Exact over every later turn, with both players playing to win. A tie counts as half a win.'
        : 'Exact: every other total is known. A shared win counts as a share.')
      : 'Estimate: assumes every later turn is played for the lowest expected score. A shared win counts as a share. The expected scores behind it are exact.';
  } else {
    metric = 'Expected total left open';
    note = goal.settled === undefined
      ? 'Exact: the lowest expected open total, solved over all 512 ways the box can stand.'
      : `Every choice gives the same chance to win (${percent(goal.settled)}${goal.settledExact ? '' : ', estimated'}), so moves are ranked by the lowest expected open total (exact).`;
  }
  return {
    best: options[0].action,
    options: options.map((o) => ({ action: o.action, label: o.label, display: win ? `${percent(o.win)} to win` : left(o.exp), win: win ? o.win : null, expected: -o.exp })),
    metric,
    exact: goal.exact !== false,
    note,
  };
}

// Same move: roll counts default to two dice; tile lists compare sorted.
export function sameAction(a, b) {
  if (!a || !b || a.type !== b.type) return false;
  if (a.type === 'roll') return (a.dice ?? 2) === (b.dice ?? 2);
  if (a.type === 'shut') {
    const ta = Array.isArray(a.tiles) ? a.tiles.slice().sort((x, y) => x - y).join() : '';
    const tb = Array.isArray(b.tiles) ? b.tiles.slice().sort((x, y) => x - y).join() : '';
    return ta === tb;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

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

export function bot(state, seat, level, rng) {
  if (level === 'hard') return advise(state, seat).best;
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
  advise,
  sameAction,
  pace: (state, action) => (action.type === 'shut' ? 1000 : 850),
  summary: (state, seat) => String(totals(state)[seat]),
  status,
  outcome: (state) => (state.over ? { winners: state.winners.slice(), text: resultText(state) } : null),
};
