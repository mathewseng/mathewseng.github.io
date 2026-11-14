// Ship, Captain & Crew: three rolls of five dice to set aside a 6, then a 5,
// then a 4. The two dice left over are the cargo; the best cargo takes the round.
import { clone, log, rollDie, rollDice, nextSeat, diceOutcomes, plural, sum } from '../table-core.mjs';

export const ROLLS = 3;
export const ROLES = [
  { face: 6, name: 'ship', label: 'Ship' },
  { face: 5, name: 'captain', label: 'Captain' },
  { face: 4, name: 'crew', label: 'Crew' },
];

// Sets aside one die per role, in order, from freshly rolled dice: a 5 only
// counts once the ship is in, a 4 once the captain is. Extra 6s stay in play.
export function setAside(stage, rolled) {
  const dice = rolled.slice();
  const took = [];
  let next = stage;
  while (next < ROLES.length) {
    const at = dice.indexOf(ROLES[next].face);
    if (at < 0) break;
    dice.splice(at, 1);
    took.push(next);
    next += 1;
  }
  return { stage: next, dice, took };
}

export const qualified = (state) => state.stage === ROLES.length;
export const cargoOf = (state) => (qualified(state) ? sum(state.dice) : 0);
export const rollsLeft = (state) => ROLLS - state.rolls;

export function joinNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function freshTurn(state) {
  state.stage = 0;
  state.dice = [];
  state.rolls = 0;
  state.fresh = [];
  state.freshSlots = [];
}

export function setup({ names, options = {}, first = 0 }) {
  const state = {
    names: names.slice(),
    target: options.target ?? 3,
    wins: names.map(() => 0),
    round: 1,
    first,
    starter: first,
    turn: first,
    cargos: names.map(() => null), // this round: null until the seat has played
    stage: 0, // 0–3: how many of ship, captain and crew are set aside
    dice: [], // the dice still in play; the two cargo dice once qualified
    rolls: 0,
    fresh: [], // indices of `dice` thrown by the last roll
    freshSlots: [], // roles set aside by the last roll
    rollId: 0,
    last: null, // the turn that just ended, kept for the board
    rounds: [],
    winners: [],
    log: [],
  };
  return log(state, -1, `First to ${plural(state.target, 'round win')}. ${names[first]} to start.`);
}

export const actor = (state) => (state.winners.length ? -1 : state.turn);

function readPicks(state, reroll) {
  if (reroll != null && !Array.isArray(reroll)) throw new Error('Choose cargo dice to reroll.');
  const picks = [...new Set(reroll || [])].sort((a, b) => a - b);
  for (const i of picks) {
    if (!Number.isInteger(i) || i < 0) throw new Error('Choose cargo dice to reroll.');
    if (i >= state.dice.length) throw new Error('Ship, captain and crew stay set aside.');
  }
  if (!picks.length) throw new Error('Choose cargo dice to reroll.');
  return picks;
}

export function apply(previous, seat, action, rng) {
  if (!action || typeof action !== 'object') throw new Error('Unknown move.');
  if (seat !== actor(previous)) throw new Error('It is not your turn.');
  if (action.type === 'roll') {
    if (previous.rolls >= ROLLS) throw new Error('No rolls left this turn.');
    const state = clone(previous);
    if (!qualified(state)) {
      const thrown = rollDice(ROLES.length + 2 - state.stage, rng);
      const result = setAside(state.stage, thrown);
      state.freshSlots = result.took;
      state.stage = result.stage;
      state.dice = result.dice;
      state.fresh = result.dice.map((_, i) => i);
    } else {
      const picks = readPicks(state, action.reroll);
      for (const i of picks) state.dice[i] = rollDie(rng);
      state.fresh = picks;
      state.freshSlots = [];
    }
    state.rolls += 1;
    state.rollId += 1;
    if (state.rolls >= ROLLS) endTurn(state, seat);
    return state;
  }
  if (action.type === 'stand') {
    if (!qualified(previous)) throw new Error('Set aside a ship, captain and crew before you stand.');
    const state = clone(previous);
    state.fresh = [];
    state.freshSlots = [];
    endTurn(state, seat);
    return state;
  }
  throw new Error('Unknown move.');
}

function endTurn(state, seat) {
  const cargo = cargoOf(state);
  state.cargos[seat] = cargo;
  state.last = { seat, round: state.round, stage: state.stage, dice: state.dice.slice(), cargo, rolls: state.rolls, fresh: state.fresh.slice(), freshSlots: state.freshSlots.slice() };
  log(state, seat, cargo ? `loaded ${cargo} cargo.` : `missed the ${ROLES[state.stage].name}.`);
  freshTurn(state);
  if (state.cargos.every((value) => value !== null)) endRound(state);
  else state.turn = nextSeat(state, seat);
}

// The best cargo takes the round; tied leaders all take it; all-zero rounds go to nobody.
export function roundWinners(cargos) {
  const best = Math.max(0, ...cargos.map((value) => value ?? 0));
  return best > 0 ? cargos.map((value, i) => (value === best ? i : -1)).filter((i) => i >= 0) : [];
}

function endRound(state) {
  const winners = roundWinners(state.cargos);
  const best = winners.length ? state.cargos[winners[0]] : 0;
  winners.forEach((seat) => { state.wins[seat] += 1; });
  state.rounds.push({ round: state.round, starter: state.starter, cargos: state.cargos.slice(), winners, best });
  if (!winners.length) log(state, -1, `Round ${state.round}: nobody loaded cargo.`);
  else if (winners.length === 1) log(state, winners[0], `won round ${state.round} with ${best}.`);
  else log(state, -1, `${joinNames(winners.map((seat) => state.names[seat]))} shared round ${state.round} with ${best}.`);

  const reached = state.wins.map((wins, seat) => (wins >= state.target ? seat : -1)).filter((seat) => seat >= 0);
  if (reached.length) {
    const top = Math.max(...reached.map((seat) => state.wins[seat]));
    state.winners = reached.filter((seat) => state.wins[seat] === top);
    log(state, state.winners.length === 1 ? state.winners[0] : -1, matchText(state, true));
    return;
  }
  state.round += 1;
  state.starter = (state.first + state.round - 1) % state.names.length;
  state.turn = state.starter;
  state.cargos = state.names.map(() => null);
}

function matchText(state, forLog = false) {
  const [first] = state.winners;
  if (state.winners.length === 1) {
    const rest = Math.max(0, ...state.wins.filter((_, seat) => seat !== first));
    return `${forLog ? '' : `${state.names[first]} `}took the match ${state.wins[first]}–${rest}.`;
  }
  return `${joinNames(state.winners.map((seat) => state.names[seat]))} shared the match with ${plural(state.wins[first], 'round win')} each.`;
}

// ---------- Exact solver ----------
//
// One turn is a small decision problem. Before the crew is in, the state is the
// stage (0–2) and the rolls left; once loaded, it is the two cargo dice (as a
// sorted pair) and the rolls left. A whole round is solved by backward induction
// over the seats in playing order: every player, when their turn comes, plays
// to maximise their own value given the cargos already posted, knowing exactly
// how each later player will answer. Ties are broken the same way everywhere:
// stand, then reroll the lower die, the higher die, both.

const EPS = 1e-12;
export const SHARE_NOTE = 'A win shared by k players counts as 1/k.';

const PAIRS = [];
const PAIR = Array.from({ length: 7 }, () => []);
for (let a = 1; a <= 6; a += 1) for (let b = a; b <= 6; b += 1) { PAIR[a][b] = PAIRS.length; PAIRS.push([a, b]); }
const pairOf = (a, b) => (a <= b ? PAIR[a][b] : PAIR[b][a]);

// Flat transition tables: for move m (0 the lower die, 1 the higher, 2 both) of
// pair i, targets MOVE_TO[m][i] with probabilities MOVE_P[m][i] (the higher die
// of a double has none: rerolling either die of a double is one move).
const SUMS = Uint8Array.from(PAIRS, ([a, b]) => a + b);
function flatten(lists) {
  const start = new Uint16Array(lists.length + 1);
  lists.forEach((list, i) => { start[i + 1] = start[i] + list.length; });
  const to = new Uint8Array(start[lists.length]);
  const p = new Float64Array(start[lists.length]);
  lists.forEach((list, i) => list.forEach(([target, chance], at) => { to[start[i] + at] = target; p[start[i] + at] = chance; }));
  return { start, to, p };
}
function merged(entries) {
  const map = new Map();
  for (const [to, p] of entries) map.set(to, (map.get(to) || 0) + p);
  return [...map.entries()];
}
const FACES = [1, 2, 3, 4, 5, 6];
const MOVES = [
  flatten(PAIRS.map(([, b]) => merged(FACES.map((f) => [pairOf(f, b), 1 / 6])))),
  flatten(PAIRS.map(([a, b]) => (a === b ? [] : merged(FACES.map((f) => [pairOf(a, f), 1 / 6]))))),
  flatten(PAIRS.map(() => merged(FACES.flatMap((f) => FACES.map((g) => [pairOf(f, g), 1 / 36]))))),
];

// Each throw from an open stage (0–2), merged by where it leads: a loaded pair
// (targets 0–20) or a later open stage (targets 21–23).
const OPEN = flatten([0, 1, 2].map((stage) => merged(diceOutcomes(ROLES.length + 2 - stage).map(({ dice, p }) => {
  const result = setAside(stage, dice);
  return [result.stage === ROLES.length ? pairOf(...result.dice) : PAIRS.length + result.stage, p];
}))));

const moveValue = (m, pair, next) => {
  const { start, to, p } = MOVES[m];
  let total = 0;
  for (let at = start[pair]; at < start[pair + 1]; at += 1) total += p[at] * next[to[at]];
  return total;
};

function buffers() {
  return {
    loaded: Array.from({ length: ROLLS }, () => new Float64Array(PAIRS.length)),
    choice: Array.from({ length: ROLLS }, () => new Uint8Array(PAIRS.length)),
    open: Array.from({ length: ROLLS + 1 }, () => new Float64Array(3)),
    openMass: Array.from({ length: ROLLS + 1 }, () => new Float64Array(3)),
    loadMass: Array.from({ length: ROLLS }, () => new Float64Array(PAIRS.length)),
  };
}
const SCRATCH = buffers();

// Solves a turn for cargo utilities u[0..12] (cargo 0: the crew was missed).
// loaded[k][pair]: value once loaded with k rolls left; open[k][stage]: before.
// dist[c]: the chance a fresh turn played this way ends with cargo c.
// With keep false the tables live in shared scratch space and only dist is safe to keep.
export function solveTurn(u, keep = true) {
  const P = PAIRS.length;
  const { loaded, choice, open, openMass, loadMass } = keep ? buffers() : SCRATCH;
  for (let k = 0; k < ROLLS; k += 1) {
    const values = loaded[k];
    const picks = choice[k];
    for (let pair = 0; pair < P; pair += 1) {
      let best = u[SUMS[pair]];
      let pick = 0;
      if (k > 0) {
        for (let m = 0; m < 3; m += 1) {
          if (m === 1 && MOVES[1].start[pair] === MOVES[1].start[pair + 1]) continue;
          const v = moveValue(m, pair, loaded[k - 1]);
          if (v > best + EPS) { best = v; pick = m + 1; }
        }
      }
      values[pair] = best;
      picks[pair] = pick;
    }
  }
  open[0].fill(u[0]);
  for (let k = 1; k <= ROLLS; k += 1) {
    for (let stage = 0; stage < 3; stage += 1) {
      let total = 0;
      for (let at = OPEN.start[stage]; at < OPEN.start[stage + 1]; at += 1) {
        const target = OPEN.to[at];
        total += OPEN.p[at] * (target < P ? loaded[k - 1][target] : open[k - 1][target - P]);
      }
      open[k][stage] = total;
    }
  }
  // Forward pass from a fresh turn under the chosen moves.
  const dist = new Float64Array(13);
  for (const row of openMass) row.fill(0);
  for (const row of loadMass) row.fill(0);
  openMass[ROLLS][0] = 1;
  for (let k = ROLLS; k >= 0; k -= 1) {
    for (let stage = 0; stage < 3; stage += 1) {
      const mass = openMass[k][stage];
      if (!mass) continue;
      if (k === 0) { dist[0] += mass; continue; }
      for (let at = OPEN.start[stage]; at < OPEN.start[stage + 1]; at += 1) {
        const target = OPEN.to[at];
        if (target < P) loadMass[k - 1][target] += mass * OPEN.p[at];
        else openMass[k - 1][target - P] += mass * OPEN.p[at];
      }
    }
    if (k === ROLLS) continue;
    for (let pair = 0; pair < P; pair += 1) {
      const mass = loadMass[k][pair];
      if (!mass) continue;
      const pick = choice[k][pair];
      if (!pick) { dist[SUMS[pair]] += mass; continue; }
      const { start, to, p } = MOVES[pick - 1];
      for (let at = start[pair]; at < start[pair + 1]; at += 1) loadMass[k - 1][to[at]] += mass * p[at];
    }
  }
  // [stand, reroll the lower die, the higher die (null on a double), both] with k rolls left.
  const moveValues = (pair, k) => [
    u[SUMS[pair]],
    ...[0, 1, 2].map((m) => (k > 0 && MOVES[m].start[pair] < MOVES[m].start[pair + 1] ? moveValue(m, pair, loaded[k - 1]) : null)),
  ];
  return { value: open[ROLLS][0], open, loaded, dist, moveValues };
}

// Backward induction over one round of n seats, indexed by playing position.
// A state is (j: position to play, best: best cargo posted, mask: positions
// tied at it). cont(mask) is the value vector (one slot per position, plus a
// spare slot the match solver uses) once every position has played.
export function roundSolver(n, cont) {
  const memo = new Map();
  const stakes = new Map();
  const value = (j, best, mask) => {
    if (j === n) return cont(best > 0 ? mask : 0);
    const key = (j * 13 + best) * 64 + mask;
    if (memo.has(key)) return memo.get(key);
    const { next, dist } = stake(j, best, mask);
    const out = new Float64Array(next[0].length);
    for (let c = 0; c <= 12; c += 1) {
      const p = dist[c];
      if (p) for (let i = 0; i < out.length; i += 1) out[i] += p * next[c][i];
    }
    memo.set(key, out);
    return out;
  };
  // What each final cargo is worth to position j, and j's best play.
  const stake = (j, best, mask) => {
    const key = (j * 13 + best) * 64 + mask;
    if (stakes.has(key)) return stakes.get(key);
    const next = [];
    for (let c = 0; c <= 12; c += 1) {
      if (c === 0 || c < best) next[c] = value(j + 1, best, mask);
      else if (c === best) next[c] = value(j + 1, best, mask | (1 << j));
      else next[c] = value(j + 1, c, 1 << j);
    }
    const u = next.map((v) => v[j]);
    const result = { next, u, dist: solveTurn(u, false).dist };
    stakes.set(key, result);
    return result;
  };
  // States where nobody has loaded yet are the only ones that reach cont(0):
  // forget them when that continuation changes.
  const forgetUnloaded = () => {
    for (const map of [memo, stakes]) for (const key of map.keys()) if (Math.floor(key / 64) % 13 === 0) map.delete(key);
  };
  return { n, value, stake, forgetUnloaded };
}

const popcount = (mask) => { let c = 0; for (let m = mask; m; m &= m - 1) c += 1; return c; };

// Round level: a k-way shared round is worth 1/k to each winner.
const roundCache = new Map();
export function roundGame(n) {
  if (!roundCache.has(n)) {
    const shares = new Map();
    roundCache.set(n, roundSolver(n, (mask) => {
      if (!shares.has(mask)) {
        const out = new Float64Array(n + 1);
        const k = popcount(mask);
        for (let j = 0; j < n; j += 1) if (mask & (1 << j)) out[j] = 1 / k;
        shares.set(mask, out);
      }
      return shares.get(mask);
    }));
  }
  return roundCache.get(n);
}

// Match level: the chance to take the match (a k-way shared match is worth 1/k)
// from every count of round wins and round starter, with every seat playing to
// maximise its own match chance. A round nobody loads leaves the wins as they
// were and moves the starter on; those cycles are solved exactly as a linear
// system for the current moves, repeated until the moves stop changing.
const MATCH_BUDGET = 70000;
export const matchTractable = (n, target) => target ** n * n * 13 * 2 ** n <= MATCH_BUDGET;

const matchCache = new Map();
export function matchGame(n, target) {
  const id = `${n}:${target}`;
  if (matchCache.has(id)) return matchCache.get(id);
  const groups = new Map();
  const toSeats = (vec, s) => { const out = new Float64Array(n); for (let j = 0; j < n; j += 1) out[(s + j) % n] = vec[j]; return out; };
  const toPositions = (seats, s, spare) => { const out = new Float64Array(n + 1); for (let j = 0; j < n; j += 1) out[j] = seats[(s + j) % n]; out[n] = spare; return out; };
  const finals = new Map();
  function after(wins, mask, s) {
    const next = wins.slice();
    for (let j = 0; j < n; j += 1) if (mask & (1 << j)) next[(s + j) % n] += 1;
    const top = Math.max(...next);
    if (top >= target) {
      const key = next.join(',');
      if (!finals.has(key)) {
        const winners = next.map((w, i) => (w === top ? i : -1)).filter((i) => i >= 0);
        const out = new Float64Array(n);
        for (const i of winners) out[i] = 1 / winners.length;
        finals.set(key, out);
      }
      return finals.get(key);
    }
    return group(next).seats[(s + 1) % n];
  }
  // Every starter for one count of wins: seat-indexed values and the round solvers.
  function group(wins) {
    const key = wins.join(',');
    if (groups.has(key)) return groups.get(key);
    // Rounds that someone loads lead to other counts of wins; only a round
    // nobody loads comes back here, with the next starter.
    let guess = Array.from({ length: n }, () => new Float64Array(n).fill(1 / n));
    const rounds = [];
    for (let s = 0; s < n; s += 1) {
      const conts = new Map();
      rounds.push(roundSolver(n, (mask) => {
        if (!mask) return toPositions(guess[(s + 1) % n], s, 1);
        if (!conts.has(mask)) conts.set(mask, toPositions(after(wins, mask, s), s, 0));
        return conts.get(mask);
      }));
    }
    for (let iteration = 0; iteration < 60; iteration += 1) {
      const current = guess;
      const base = [];
      const zero = [];
      for (let s = 0; s < n; s += 1) {
        if (iteration) rounds[s].forgetUnloaded();
        const root = rounds[s].value(0, 0, 0);
        zero[s] = root[n];
        const seats = toSeats(root, s);
        base[s] = seats.map((v, i) => v - zero[s] * current[(s + 1) % n][i]);
      }
      // values[s] = base[s] + zero[s] * values[s + 1], around the cycle of starters.
      const solved = [];
      for (let s = 0; s < n; s += 1) {
        const out = new Float64Array(n);
        let carry = 1;
        for (let step = 0; step < n; step += 1) {
          const t = (s + step) % n;
          for (let i = 0; i < n; i += 1) out[i] += carry * base[t][i];
          carry *= zero[t];
        }
        for (let i = 0; i < n; i += 1) out[i] /= 1 - carry;
        solved.push(out);
      }
      let change = 0;
      for (let s = 0; s < n; s += 1) for (let i = 0; i < n; i += 1) change = Math.max(change, Math.abs(solved[s][i] - current[s][i]));
      guess = solved;
      if (change < 1e-13) break;
    }
    // The last pass may have moved the values by rounding error; settle the unloaded states on them.
    for (let s = 0; s < n; s += 1) rounds[s].forgetUnloaded();
    const result = { seats: guess, rounds };
    groups.set(key, result);
    return result;
  }
  const api = { round: (wins, s) => group(wins).rounds[s], value: (wins, s) => group(wins).seats[s] };
  matchCache.set(id, api);
  return api;
}

// Where the acting seat stands in its round: position, best posted cargo and
// the positions tied at it.
export function roundPosition(view, seat) {
  const n = view.names.length;
  const j = (seat - view.starter + n) % n;
  let best = 0;
  let mask = 0;
  for (let i = 0; i < j; i += 1) {
    const cargo = view.cargos[(view.starter + i) % n] ?? 0;
    if (cargo > best) { best = cargo; mask = 1 << i; } else if (cargo === best && cargo > 0) mask |= 1 << i;
  }
  return { n, j, best, mask };
}

const percent = (p) => `${(Math.max(0, Math.min(1, p)) * 100).toFixed(1)}%`;

// The exact value of every move for the acting seat. scope: 'match' when the
// whole match is small enough to solve exactly, else 'round'.
export function advise(view, seat, scope = matchTractable(view.names.length, view.target) ? 'match' : 'round') {
  if (!view || view.winners.length || seat !== view.turn) return null;
  const { n, j, best, mask } = roundPosition(view, seat);
  const solver = scope === 'match' ? matchGame(n, view.target).round(view.wins, view.starter) : roundGame(n);
  const turn = solveTurn(solver.stake(j, best, mask).u);
  const k = rollsLeft(view);
  const goal = scope === 'match' ? 'to win the match' : 'to win the round';
  const options = [];
  if (!qualified(view)) {
    options.push({ action: { type: 'roll', reroll: [] }, label: `Roll ${ROLES.length + 2 - view.stage} dice`, p: turn.open[k][view.stage] });
  } else {
    const [a, b] = view.dice;
    const values = turn.moveValues(pairOf(a, b), Math.max(0, k));
    const low = a <= b ? 0 : 1;
    options.push({ action: { type: 'stand' }, label: `Stand on ${a + b}`, p: values[0] });
    if (k > 0) {
      if (a === b) options.push({ action: { type: 'roll', reroll: [0], either: true }, label: `Reroll one ${a}`, p: values[1] });
      else {
        options.push({ action: { type: 'roll', reroll: [low] }, label: `Reroll the ${view.dice[low]}`, p: values[1] });
        options.push({ action: { type: 'roll', reroll: [1 - low] }, label: `Reroll the ${view.dice[1 - low]}`, p: values[2] });
      }
      options.push({ action: { type: 'roll', reroll: [0, 1] }, label: 'Reroll both', p: values[3] });
    }
  }
  // Best first; equal values keep the tie-break order (stand, fewer dice, the lower die).
  const ranked = options.map((option, i) => ({ option, i })).sort((x, y) => (Math.abs(x.option.p - y.option.p) > EPS ? y.option.p - x.option.p : x.i - y.i)).map(({ option }) => ({ ...option, display: `${percent(option.p)} ${goal}` }));
  return {
    best: ranked[0].action,
    options: ranked,
    metric: scope === 'match' ? 'Chance to win the match' : 'Chance to win the round',
    exact: true,
    scope,
    note: `Exact, with every later player playing their best. ${SHARE_NOTE}${scope === 'round' ? ' This table is too big to solve the whole match, so it plays for the round.' : ''}`,
  };
}

const normal = (action) => (action?.type === 'roll'
  ? { type: 'roll', reroll: [...new Set(action.reroll || [])].sort((a, b) => a - b), either: !!action.either }
  : { type: action?.type });

// Rerolls compare as sets of dice; with two equal cargo dice, rerolling either is one move.
export function sameAction(a, b) {
  const x = normal(a);
  const y = normal(b);
  if (x.type !== y.type) return false;
  if (x.type !== 'roll') return true;
  if ((x.either || y.either) && x.reroll.length === 1 && y.reroll.length === 1) return true;
  return x.reroll.join() === y.reroll.join();
}

const bestPosted = (view, seat) => Math.max(0, ...view.cargos.map((value, i) => (i === seat ? 0 : value ?? 0)));

export function bot(view, seat, level, rng) {
  if (level === 'hard') return advise(view, seat).best;
  if (!qualified(view)) return { type: 'roll', reroll: [] };
  const [a, b] = view.dice;
  const cargo = a + b;
  if (rollsLeft(view) <= 0) return { type: 'stand' };
  if (level === 'normal') {
    if (cargo >= 8 && cargo >= bestPosted(view, seat)) return { type: 'stand' };
    const low = a <= b ? 0 : 1;
    if (view.dice[low] <= 3 && view.dice[1 - low] >= 5) return { type: 'roll', reroll: [low] };
    return { type: 'roll', reroll: [0, 1] };
  }
  if (cargo >= 6 || rng() < 0.25) return { type: 'stand' };
  return { type: 'roll', reroll: [0, 1] };
}

function status(state, seat, { canAct } = {}) {
  if (state.winners.length) return matchText(state);
  const left = rollsLeft(state);
  if (canAct) {
    if (!state.rolls) return `Round ${state.round}: your turn. Roll for a ship.`;
    if (!qualified(state)) return `Your turn: ${plural(left, 'roll')} left to find the ${ROLES[state.stage].name}.`;
    return `Your turn: ${cargoOf(state)} cargo with ${plural(left, 'roll')} left. Stand or reroll.`;
  }
  return `Round ${state.round}: ${state.names[state.turn]} to roll.`;
}

function outcome(state) {
  if (!state.winners.length) return null;
  return { winners: state.winners.slice(), text: matchText(state) };
}

export const game = {
  id: 'ship-captain-crew',
  name: 'Ship, Captain & Crew',
  players: { min: 2, max: 6, default: 3 },
  hidden: false,
  options: [
    { id: 'target', label: 'Round wins to take the match', choices: [{ value: 3, label: '3' }, { value: 5, label: '5' }], default: 3 },
  ],
  setup,
  actor,
  apply,
  view: (state) => state,
  bot,
  advise,
  sameAction,
  pace: (state, action) => (action.type === 'stand' ? 1000 : state.rolls === 0 ? 1300 : 850),
  summary: (state, seat) => `${state.wins[seat]} of ${state.target}`,
  status,
  outcome,
};
