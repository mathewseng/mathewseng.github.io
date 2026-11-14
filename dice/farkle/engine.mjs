// Farkle: roll six dice, set aside scoring dice after every roll, then bank the
// turn total or roll what is left. A roll with nothing that scores loses the turn.
import { clone, log, rollDice, faceCounts, nextSeat, diceOutcomes } from '../table-core.mjs';

export const fmt = (value) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// ---------- Scoring ----------

const KIND = (face, count) => (count === 3 ? (face === 1 ? 1000 : face * 100) : count === 4 ? 1000 : count === 5 ? 2000 : 3000);
const partitions = new Map();
const countsKey = (c) => c[1] + c[2] * 7 + c[3] * 49 + c[4] * 343 + c[5] * 2401 + c[6] * 16807;

// The best score that uses every die in `c` (face counts), or -1 when some die
// cannot score. The first face present must sit in some group, so the search
// only branches on the groups that contain it.
function partition(c) {
  const key = countsKey(c);
  const known = partitions.get(key);
  if (known !== undefined) return known;
  let total = 0;
  for (let face = 1; face <= 6; face += 1) total += c[face];
  let best = total === 0 ? 0 : -1;
  if (total === 6) {
    let singles = 0;
    let pairs = 0;
    let triples = 0;
    let fours = 0;
    for (let face = 1; face <= 6; face += 1) {
      if (c[face] === 1) singles += 1;
      if (c[face] === 2) pairs += 1;
      if (c[face] === 3) triples += 1;
      if (c[face] === 4) fours += 1;
    }
    if (singles === 6) best = Math.max(best, 1500);
    if (pairs === 3 || (fours === 1 && pairs === 1)) best = Math.max(best, 1500);
    if (triples === 2) best = Math.max(best, 2500);
  }
  if (total > 0) {
    let face = 1;
    while (!c[face]) face += 1;
    for (let count = 3; count <= c[face]; count += 1) {
      c[face] -= count;
      const rest = partition(c);
      c[face] += count;
      if (rest >= 0) best = Math.max(best, KIND(face, count) + rest);
    }
    if (face === 1 || face === 5) {
      c[face] -= 1;
      const rest = partition(c);
      c[face] += 1;
      if (rest >= 0) best = Math.max(best, (face === 1 ? 100 : 50) + rest);
    }
  }
  partitions.set(key, best);
  return best;
}

// Points for a set of face counts when every die scores; 0 when it is not a valid set-aside.
export function scoreCounts(counts) {
  const score = partition(counts.slice());
  return score > 0 ? score : 0;
}

// Points for setting aside `dice` (faces) from one roll, by the best partition; 0 when invalid.
export function scoreSelection(dice) {
  if (!Array.isArray(dice) || dice.length < 1 || dice.length > 6) return 0;
  if (dice.some((face) => !Number.isInteger(face) || face < 1 || face > 6)) return 0;
  return scoreCounts(faceCounts(dice));
}

// Calls visit(sub, used) for every non-empty sub-multiset of the counts `c`.
function eachSubset(c, visit) {
  const sub = [0, 0, 0, 0, 0, 0, 0];
  const walk = (face, used) => {
    if (face > 6) {
      if (used) visit(sub, used);
      return;
    }
    for (let n = 0; n <= c[face]; n += 1) {
      sub[face] = n;
      walk(face + 1, used + n);
    }
    sub[face] = 0;
  };
  walk(1, 0);
}

// The valid set-asides of a multiset of dice as face counts, best first. At most 923 multisets.
const subsetCache = new Map();
function scoringSubsets(counts) {
  const key = countsKey(counts);
  let subsets = subsetCache.get(key);
  if (!subsets) {
    subsets = [];
    eachSubset(counts, (sub, used) => {
      const points = scoreCounts(sub);
      if (points) subsets.push({ sub: sub.slice(), points, used });
    });
    subsets.sort((a, b) => b.points - a.points || a.used - b.used);
    subsetCache.set(key, subsets);
  }
  return subsets;
}

// Every distinct valid set-aside from a roll: { dice: indices, faces, points, used },
// best first (most points, then fewest dice).
export function scoringOptions(dice) {
  return scoringSubsets(faceCounts(dice)).map(({ sub, points, used }) => {
    const need = sub.slice();
    const indices = [];
    dice.forEach((face, i) => {
      if (need[face] > 0) {
        need[face] -= 1;
        indices.push(i);
      }
    });
    return { dice: indices, faces: indices.map((i) => dice[i]).sort((a, b) => a - b), points, used };
  });
}

export const isFarkle = (dice) => scoringSubsets(faceCounts(dice)).length === 0;

// Which dice of a roll could be part of some scoring set-aside.
export function scorableDice(dice) {
  const faces = new Set();
  for (const option of scoringOptions(dice)) for (const face of option.faces) faces.add(face);
  return dice.map((face) => faces.has(face));
}

// ---------- Rules ----------

export function setup({ names, options = {}, first = 0 }) {
  const state = {
    names: names.slice(),
    target: options.target ?? 10000,
    opening: options.opening ?? 0,
    scores: names.map(() => 0),
    turn: first,
    phase: 'start', // 'start': roll six dice · 'choose': set aside from `roll` · 'over'
    roll: null,
    hot: false,
    turnTotal: 0,
    kept: [], // this turn's set-aside groups: { faces, points }
    last: null, // how the previous turn ended, shown until the next roll
    rollId: 0,
    finalLeft: null, // turns left in the final round
    finalBy: -1,
    winners: null,
    log: [],
  };
  const opening = state.opening ? `; a first bank needs ${fmt(state.opening)}` : '';
  return log(state, -1, `First to ${fmt(state.target)}${opening}. ${names[first]} to start.`);
}

export const actor = (state) => (state.winners ? -1 : state.turn);

const diceText = (faces) => faces.join(' ');

function finish(state) {
  const top = Math.max(...state.scores);
  state.winners = state.scores.map((score, i) => (score === top ? i : -1)).filter((i) => i >= 0);
  state.phase = 'over';
  if (state.winners.length === 1) log(state, state.winners[0], `won with ${fmt(top)}.`);
  else log(state, -1, `${joinNames(state.winners.map((i) => state.names[i]))} tied at ${fmt(top)}.`);
}

function endTurn(state, seat) {
  state.phase = 'start';
  state.roll = null;
  state.hot = false;
  state.turnTotal = 0;
  state.kept = [];
  if (state.finalLeft !== null && state.finalBy !== seat) {
    state.finalLeft -= 1;
    if (state.finalLeft <= 0) {
      finish(state);
      return;
    }
  }
  state.turn = nextSeat(state, seat);
}

function rollFor(state, seat, count, rng) {
  const dice = rollDice(count, rng);
  state.rollId += 1;
  if (isFarkle(dice)) {
    const lost = state.turnTotal;
    log(state, seat, `farkled with ${diceText(dice)}${lost ? ` and lost ${fmt(lost)}` : ''}.`);
    state.last = { seat, kind: 'farkle', dice, lost };
    endTurn(state, seat);
    return;
  }
  state.roll = dice;
  state.phase = 'choose';
}

export function apply(previous, seat, action, rng) {
  if (seat !== actor(previous)) throw new Error('It is not your turn.');
  if (!action || typeof action !== 'object') throw new Error('Unknown move.');
  const state = clone(previous);

  if (action.type === 'roll') {
    if (state.phase !== 'start') throw new Error('Set aside scoring dice before you roll again.');
    state.last = null;
    state.kept = [];
    state.turnTotal = 0;
    rollFor(state, seat, 6, rng);
    return state;
  }

  if (action.type === 'keep') {
    if (state.phase !== 'choose') throw new Error('Roll the dice first.');
    const picks = action.dice;
    if (!Array.isArray(picks) || !picks.length) throw new Error('Set aside at least one scoring die.');
    if (picks.some((i) => !Number.isInteger(i) || i < 0 || i >= state.roll.length) || new Set(picks).size !== picks.length) throw new Error('Those dice are not in this roll.');
    if (action.then !== 'roll' && action.then !== 'bank') throw new Error('Choose to roll on or bank.');
    const faces = picks.map((i) => state.roll[i]).sort((a, b) => a - b);
    const points = scoreSelection(faces);
    if (!points) throw new Error('Every die you set aside must score.');
    const total = state.turnTotal + points;
    if (action.then === 'bank' && state.scores[seat] === 0 && total < state.opening) {
      throw new Error(`Bank at least ${fmt(state.opening)} to get on the board.`);
    }
    state.turnTotal = total;
    state.kept = state.kept.concat({ faces, points });
    const kept = `kept ${diceText(faces)} for ${fmt(points)}`;
    const left = state.roll.length - picks.length;
    state.roll = null;

    if (action.then === 'bank') {
      state.scores[seat] += total;
      log(state, seat, `${kept} and banked ${fmt(total)} for ${fmt(state.scores[seat])}.`);
      state.last = { seat, kind: 'bank', amount: total };
      if (state.finalLeft === null && state.scores[seat] >= state.target) {
        state.finalLeft = state.names.length - 1;
        state.finalBy = seat;
        log(state, -1, `Final round: everyone else has one more turn to beat ${fmt(state.scores[seat])}.`);
      }
      endTurn(state, seat);
      return state;
    }

    state.hot = left === 0;
    log(state, seat, left ? `${kept} and rolled ${left === 1 ? '1 die' : `${left} dice`}.` : `${kept}: hot dice, rolled all six.`);
    rollFor(state, seat, left || 6, rng);
    return state;
  }

  throw new Error('Unknown move.');
}

// ---------- Solver ----------
// Every score is a multiple of 50, so the solver counts in units of 50 and is exact on that grid.
export const UNIT = 50;

// Each roll of k dice, grouped by what it offers: every distinct (points, dice left) pair a valid
// set-aside gives. All of them stay, not just the most points: near the target a smaller turn
// total can be worth more (banking 4,950 of 5,000 makes the rival cross first and gives you the
// last turn). Rolls that offer the same choices merge (462 six-dice rolls become 124 groups).
let profileSets = null;
export function rollProfiles() {
  if (profileSets) return profileSets;
  const packs = [null];
  const pF = new Float64Array(7);
  for (let k = 1; k <= 6; k += 1) {
    const groups = new Map();
    for (const outcome of diceOutcomes(k)) {
      const seen = new Set();
      const choices = [];
      eachSubset(faceCounts(outcome.dice), (sub, used) => {
        const points = scoreCounts(sub);
        const left = used === k ? 6 : k - used;
        if (!points || seen.has(points * 8 + left)) return;
        seen.add(points * 8 + left);
        choices.push([points / UNIT, left]);
      });
      choices.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      if (!choices.length) {
        pF[k] += outcome.p;
        continue;
      }
      const key = choices.join(';');
      const group = groups.get(key);
      if (group) group.p += outcome.p;
      else groups.set(key, { p: outcome.p, choices });
    }
    const list = [...groups.values()];
    const prob = new Float64Array(list.length);
    const off = new Int32Array(list.length + 1);
    const count = list.reduce((total, group) => total + group.choices.length, 0);
    const pts = new Int32Array(count);
    const next = new Int32Array(count);
    let j = 0;
    list.forEach((group, i) => {
      prob[i] = group.p;
      off[i] = j;
      for (const [points, left] of group.choices) {
        pts[j] = points;
        next[j] = left;
        j += 1;
      }
    });
    off[list.length] = j;
    packs.push({ n: list.length, prob, off, pts, next });
  }
  profileSets = { packs, pF };
  return profileSets;
}

// One turn for fixed banked scores, solved backwards over the turn total t (units) from `top`
// down to `from`. bank(t) is what banking t is worth; it may bank once t >= minBank; a Farkle is
// worth f. Values carry a linear part in f (value = a + c·f, the choices made at the given f) so
// the generator can solve a pair of score states exactly; at run time only a + c·f is used.
// The caller picks `top` so that banking is optimal from there on (V = bank for t >= top).
export function solveTurn({ from = 0, top, bank, minBank, f }) {
  const { packs, pF } = rollProfiles();
  const span = Math.max(0, top - from);
  const RA = new Float64Array(span * 7);
  const RC = new Float64Array(span * 7);
  const VA = new Float64Array(span * 7);
  const VC = new Float64Array(span * 7);
  const banks = new Float64Array(span + 61);
  for (let i = 0; i < banks.length; i += 1) banks[i] = bank(from + i);
  for (let t = top - 1; t >= from; t -= 1) {
    const base = (t - from) * 7;
    for (let k = 1; k <= 6; k += 1) {
      const { n, prob, off, pts, next } = packs[k];
      let ra = 0;
      let rc = pF[k];
      for (let i = 0; i < n; i += 1) {
        let best = -Infinity;
        let ba = 0;
        let bc = 0;
        for (let j = off[i]; j < off[i + 1]; j += 1) {
          const tt = t + pts[j];
          let a;
          let c;
          if (tt >= top) {
            a = banks[tt - from];
            c = 0;
          } else {
            const at = (tt - from) * 7 + next[j];
            a = VA[at];
            c = VC[at];
          }
          const v = a + c * f;
          if (v > best) {
            best = v;
            ba = a;
            bc = c;
          }
        }
        ra += prob[i] * ba;
        rc += prob[i] * bc;
      }
      RA[base + k] = ra;
      RC[base + k] = rc;
      const b = banks[t - from];
      if (t >= minBank && b >= ra + rc * f) {
        VA[base + k] = b;
        VC[base + k] = 0;
      } else {
        VA[base + k] = ra;
        VC[base + k] = rc;
      }
    }
  }
  // Rolling k dice with turn total t; past `top` every next state banks.
  const roll = (t, k) => {
    if (t >= from && t < top) return RA[(t - from) * 7 + k] + RC[(t - from) * 7 + k] * f;
    const { n, prob, off, pts } = packs[k];
    let total = pF[k] * f;
    for (let i = 0; i < n; i += 1) {
      let best = -Infinity;
      for (let j = off[i]; j < off[i + 1]; j += 1) best = Math.max(best, bank(t + pts[j]));
      total += prob[i] * best;
    }
    return total;
  };
  return { from, top, f, bank, minBank, RA, RC, VA, VC, roll, start: from === 0 ? { a: RA[6], c: RC[6] } : null };
}

// The last player of a final round: G(n, k) is the chance to finish ahead of a score n units
// above their banked score plus turn total, rolling k dice, with a tie counting as half.
// Banking ahead wins; banking level ties; a Farkle loses. G(n, 6) below 1e-15 counts as 0.
let finalSlots = null;
export function finalTable() {
  if (finalSlots) return finalSlots;
  const { packs, pF } = rollProfiles();
  const rows = [];
  const tie = new Float64Array(7);
  for (let k = 1; k <= 6; k += 1) tie[k] = Math.max(0.5, 1 - pF[k]);
  const value = (n, k) => (n < 0 ? 1 : n === 0 ? tie[k] : rows[n][k]);
  for (let n = 1; ; n += 1) {
    const row = new Float64Array(7);
    rows[n] = row;
    for (let k = 1; k <= 6; k += 1) {
      const { n: groups, prob, off, pts, next } = packs[k];
      let total = 0;
      for (let i = 0; i < groups; i += 1) {
        let best = 0;
        for (let j = off[i]; j < off[i + 1]; j += 1) best = Math.max(best, value(n - pts[j], next[j]));
        total += prob[i] * best;
      }
      row[k] = total;
    }
    if (row[6] < 1e-15) break;
  }
  const limit = rows.length - 1;
  finalSlots = { limit, value: (n, k = 6) => (n > limit ? 0 : value(n, k)) };
  return finalSlots;
}

// ---------- Two-player win tables ----------
// data/farkle-<target>-<opening>.bin (built by scripts/solve.mjs) holds W(b, d): the chance that
// the player about to start a turn with b banked wins against d (units of 50, b and d below the
// target), as little-endian Float64 at index b·T + d. Mid-turn values follow exactly by solving
// that one turn backwards over the turn total (winTurn).
const winTables = new Map();
const winLoaded = new Map();
const tableKey = (target, opening) => `${target}-${opening}`;

async function readWinTable(target, opening) {
  const url = new URL(`./data/farkle-${tableKey(target, opening)}.bin`, import.meta.url);
  let bytes;
  if (typeof window === 'undefined') {
    const { readFile } = await import('node:fs/promises');
    const file = await readFile(url);
    bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  } else {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Farkle table ${tableKey(target, opening)} did not load (${response.status}).`);
    bytes = await response.arrayBuffer();
  }
  const T = target / UNIT;
  if (bytes.byteLength !== T * T * 8) throw new Error(`Farkle table ${tableKey(target, opening)} has the wrong size.`);
  const view = new DataView(bytes);
  const W = new Float64Array(T * T);
  for (let i = 0; i < W.length; i += 1) W[i] = view.getFloat64(i * 8, true);
  const table = { target, opening, T, W };
  winLoaded.set(tableKey(target, opening), table);
  return table;
}

export function loadWinTable(target, opening) {
  const key = tableKey(target, opening);
  if (!winTables.has(key)) {
    const pending = readWinTable(target, opening);
    pending.catch(() => winTables.delete(key));
    winTables.set(key, pending);
  }
  return winTables.get(key);
}

// How the turn of the player with b against d (units) is scored, given W (filled for every
// state the turn can bank into) and f, the chance to win after a Farkle (1 − W(d, b)).
export function winSetup({ T, W, b, d, f, openingUnits }) {
  const { value } = finalTable();
  const { pF } = rollProfiles();
  const bank = (t) => (b + t < T ? 1 - W[d * T + b + t] : 1 - value(b + t - d, 6));
  const bound = 1 - pF[6] * (1 - f); // no roll is worth more than this
  let top = Math.max(1, T - b);
  while (bank(top) < bound && b + top - d <= finalTable().limit) top += 1;
  return { bank, top, minBank: b > 0 ? 1 : Math.max(1, openingUnits), f };
}

export function winTurn(table, b, d, from = 0) {
  const { T, W, opening } = table;
  const f = 1 - W[d * T + b];
  return solveTurn({ from, ...winSetup({ T, W, b, d, f, openingUnits: opening / UNIT }) });
}

// ---------- Expected points per turn ----------
// The exact turn that maximises expected banked points, for tables of three or more. `floor` is
// the smallest total that may bank (the opening minimum). Past 50,000 banking is always best.
export const EV_TOP = 1000;
const evTables = new Map();
export function valueTable(floor = 0) {
  if (!evTables.has(floor)) {
    const turn = solveTurn({ top: EV_TOP, bank: (t) => t * UNIT, minBank: Math.max(1, Math.ceil(floor / UNIT)), f: 0 });
    evTables.set(floor, {
      floor,
      turn,
      roll: (t, k) => turn.roll(t / UNIT, k),
      value: (t, k) => (t >= EV_TOP * UNIT ? t : turn.VA[(t / UNIT) * 7 + k]),
    });
  }
  return evTables.get(floor);
}

// ---------- Best move ----------

const canonical = (action) => (Array.isArray(action.faces) ? action.faces : (action.dice || [])).slice().sort((a, b) => a - b).join(' ');

export function sameAction(a, b) {
  if (!a || !b || a.type !== b.type) return false;
  if (a.type !== 'keep') return true;
  if (a.then !== b.then) return false;
  if (Array.isArray(a.faces) !== Array.isArray(b.faces)) return JSON.stringify(a) === JSON.stringify(b);
  return canonical(a) === canonical(b);
}

const pct = (p) => `${(Math.min(1, Math.max(0, p)) * 100).toFixed(1)}% to win`;
const points = (v) => {
  const rounded = Math.round(v * 10) / 10;
  const [whole, tenth] = rounded.toFixed(1).split('.');
  return `+${fmt(Number(whole))}${tenth === '0' ? '' : `.${tenth}`} expected`;
};
const diceCount = (n) => (n === 1 ? '1 die' : `${n} dice`);

// The players who still get a final-round turn after `seat`.
function finalRest(state, seat) {
  const rest = [];
  let s = seat;
  for (let i = 1; i < state.finalLeft; i += 1) {
    s = nextSeat(state, s);
    rest.push(s);
  }
  return rest;
}

const turnCache = new Map();
function cached(key, build) {
  if (!turnCache.has(key)) {
    turnCache.set(key, build());
    if (turnCache.size > 16) turnCache.delete(turnCache.keys().next().value);
  }
  return turnCache.get(key);
}

// How this decision is scored: the solved turn and how to read and label its values.
function evaluator(state, seat) {
  const mine = state.scores[seat];
  const openingUnits = mine === 0 ? Math.ceil(state.opening / UNIT) : 0;
  const minBank = Math.max(1, openingUnits);
  const b = mine / UNIT;
  const key = `${state.target}:${state.opening}:${state.scores.join(',')}:${seat}:${state.finalLeft}`;
  if (state.finalLeft !== null) {
    const { value, limit } = finalTable();
    const { pF } = rollProfiles();
    const leader = Math.max(...state.scores.filter((_, i) => i !== seat)) / UNIT;
    const rest = finalRest(state, seat).map((i) => state.scores[i] / UNIT);
    const bank = (t) => {
      const total = b + t;
      if (total < leader) return 0;
      let p = total === leader ? 0.5 : 1;
      for (const s of rest) p *= 1 - (total - s > limit ? 0 : value(total - s, 6));
      return p;
    };
    const turn = cached(`final:${key}`, () => {
      let top = Math.max(1, leader - b);
      while (bank(top) < 1 - pF[6] && b + top - leader <= limit) top += 1;
      return solveTurn({ top: top + 1, bank, minBank, f: 0 });
    });
    const two = state.names.length === 2;
    return {
      turn,
      metric: 'Chance to win',
      exact: two,
      note: two
        ? 'Exact: your chance to finish ahead of the leader on this last turn, with a tie counting as half.'
        : 'Your chance to finish on top if everyone still to play tries to beat you, with a tie counting as half.',
      display: pct,
    };
  }
  if (state.names.length === 2) {
    const table = winLoaded.get(tableKey(state.target, state.opening));
    if (!table) return { load: loadWinTable(state.target, state.opening) };
    const d = state.scores[1 - seat] / UNIT;
    return {
      turn: cached(`win:${key}`, () => winTurn(table, b, d)),
      metric: 'Chance to win',
      exact: true,
      note: 'Exact two-player solution: your chance to win if both players play this way from here, worked out for every score.',
      display: pct,
    };
  }
  const table = valueTable(openingUnits * UNIT);
  return {
    turn: table.turn,
    metric: 'Expected turn points',
    exact: true,
    note: 'With three or more players this maximises the points the turn is expected to bank; it does not weigh the race to the target. Win chances are solved for two players and the final round.',
    display: points,
  };
}

function adviseNow(state, seat) {
  const solver = evaluator(state, seat);
  if (solver.load) return solver.load.then(() => adviseNow(state, seat));
  const { turn, metric, exact, note, display } = solver;
  const base = { metric, exact, note };
  if (state.phase !== 'choose') {
    const roll = { action: { type: 'roll' }, label: 'Roll six dice', display: display(turn.roll(0, 6)), value: turn.roll(0, 6) };
    return { ...base, best: roll.action, options: [roll] };
  }
  const t = state.turnTotal / UNIT;
  const k = state.roll.length;
  const options = [];
  for (const option of scoringOptions(state.roll)) {
    const t2 = t + option.points / UNIT;
    const left = k - option.used || 6;
    const faces = option.faces.join(' ');
    const make = (then, value, label) => options.push({
      action: { type: 'keep', dice: option.dice.slice(), then, faces: option.faces.slice() },
      label,
      value,
      display: display(value),
    });
    if (t2 >= turn.minBank) make('bank', turn.bank(t2), `Keep ${faces} and bank ${fmt(t2 * UNIT)}`);
    make('roll', turn.roll(t2, left), `Keep ${faces} and roll ${left === 6 && option.used === k ? `all six again` : diceCount(left)}`);
  }
  // Stable: ties keep the order above (most points first, banking before rolling).
  options.sort((x, y) => y.value - x.value);
  return { ...base, best: options[0].action, options };
}

// The solver's ranked moves. A Promise only while a two-player table loads.
export function advise(state, seat) {
  if (state.winners || actor(state) !== seat) return null;
  return adviseNow(state, seat);
}

// ---------- Bots ----------

const keep = (option, then) => ({ type: 'keep', dice: option.dice.slice(), then });

function botContext(state, seat) {
  const mine = state.scores[seat];
  return {
    mine,
    rival: Math.max(...state.scores.filter((_, i) => i !== seat)),
    final: state.finalLeft !== null,
    lastToAct: state.finalLeft === 1,
    t: state.turnTotal,
    k: state.roll.length,
    opening: mine === 0 ? state.opening : 0,
    target: state.target,
  };
}

// Normal's keep before rolling on: every set (three or more of a kind), else a single 1 or 5.
function setKeep(options, roll) {
  const counts = faceCounts(roll);
  const sets = [1, 2, 3, 4, 5, 6].filter((face) => counts[face] >= 3);
  if (sets.length) {
    const want = [0, 1, 2, 3, 4, 5, 6].map((face) => (sets.includes(face) ? counts[face] : 0));
    const match = options.find((option) => {
      const have = faceCounts(option.faces);
      return want.every((n, face) => face === 0 || have[face] === n);
    });
    if (match) return match;
  }
  return options.find((option) => option.used === 1 && option.faces[0] === 1)
    || options.find((option) => option.used === 1 && option.faces[0] === 5)
    || options[0];
}

function normalMove(state, options, ctx) {
  const top = options[0];
  const t2 = ctx.t + top.points;
  const hot = top.used === ctx.k;
  if (ctx.final) return ctx.mine + t2 > ctx.rival ? keep(top, 'bank') : keep(hot ? top : setKeep(options, state.roll), 'roll');
  if (hot) return keep(top, 'roll');
  const left = ctx.k - top.used;
  const bankAt = left <= 2 ? 300 : left === 3 ? 450 : 1000;
  if (t2 >= bankAt && t2 >= ctx.opening) return keep(top, 'bank');
  return keep(setKeep(options, state.roll), 'roll');
}

function easyMove(state, options, ctx, rng) {
  const top = options[0];
  const t2 = ctx.t + top.points;
  if (ctx.final) return keep(top, ctx.mine + t2 > ctx.rival ? 'bank' : 'roll');
  const bankAt = 300 + UNIT * Math.floor(rng() * 3);
  return keep(top, t2 >= bankAt && t2 >= ctx.opening ? 'bank' : 'roll');
}

// Hard plays the solver's best move (a Promise while the two-player table loads).
export function bot(state, seat, level, rng = Math.random) {
  if (level === 'hard') {
    const advice = advise(state, seat);
    return typeof advice?.then === 'function' ? advice.then((result) => result.best) : advice.best;
  }
  if (state.phase !== 'choose') return { type: 'roll' };
  const options = scoringOptions(state.roll);
  const ctx = botContext(state, seat);
  const top = options[0];
  // Easy and normal bank a turn that reaches the target, and a final-round win.
  if (!ctx.final && ctx.mine + ctx.t + top.points >= ctx.target && ctx.t + top.points >= ctx.opening) return keep(top, 'bank');
  if (ctx.final && ctx.lastToAct && ctx.mine + ctx.t + top.points > ctx.rival) return keep(top, 'bank');
  if (level === 'easy') return easyMove(state, options, ctx, rng);
  return normalMove(state, options, ctx);
}

// ---------- Text ----------

function joinNames(names) {
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const leaderFor = (state, seat) => Math.max(...state.scores.filter((_, i) => i !== seat));

export function status(state, seat, { canAct } = {}) {
  const name = state.names[state.turn];
  const final = state.finalLeft !== null;
  const risk = state.turnTotal ? ` · ${fmt(state.turnTotal)} at risk` : '';
  const opening = state.opening && state.scores[state.turn] === 0 ? ` A first bank needs ${fmt(state.opening)}.` : '';
  if (canAct) {
    const head = final ? `Final round: beat ${fmt(leaderFor(state, state.turn))}.` : 'Your turn.';
    if (state.phase === 'start') return `${head} Roll six dice.${final ? '' : opening}`;
    return `${head} ${state.turnTotal ? `${fmt(state.turnTotal)} at risk. ` : ''}Set aside scoring dice.`;
  }
  const verb = state.phase === 'start' ? 'roll' : 'choose';
  if (final) return `Final round: ${name} to ${verb}, needs more than ${fmt(leaderFor(state, state.turn))}${risk}.`;
  return `${name} to ${verb}${risk}.`;
}

export function outcome(state) {
  if (!state.winners) return null;
  const top = state.scores[state.winners[0]];
  const names = state.winners.map((i) => state.names[i]);
  return { winners: state.winners.slice(), text: names.length === 1 ? `${names[0]} won with ${fmt(top)}.` : `${joinNames(names)} tied at ${fmt(top)}.` };
}

export const game = {
  id: 'farkle',
  name: 'Farkle',
  players: { min: 2, max: 6, default: 2 },
  hidden: false,
  options: [
    { id: 'target', label: 'Points to win', choices: [{ value: 5000, label: '5,000' }, { value: 10000, label: '10,000' }], default: 10000 },
    { id: 'opening', label: 'Opening minimum', choices: [{ value: 0, label: 'None' }, { value: 500, label: '500' }], default: 0, hint: 'A player’s first bank must reach this score.' },
  ],
  setup,
  actor,
  apply,
  view: (state) => state,
  bot,
  advise,
  sameAction,
  pace: (state, action) => (action.type === 'roll' ? (state.last?.kind === 'farkle' ? 1500 : 800) : 1100),
  summary: (state, seat) => `${fmt(state.scores[seat])}${seat === state.turn && state.turnTotal && !state.winners ? ` +${fmt(state.turnTotal)}` : ''}`,
  status,
  outcome,
};
