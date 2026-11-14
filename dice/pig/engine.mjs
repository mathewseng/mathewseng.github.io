// Pig: roll one die as often as you like; a 1 wipes the turn. Hold to bank.
import { clone, log, rollDie, nextSeat } from '../table-core.mjs';

export function setup({ names, options, first = 0 }) {
  const state = {
    names: names.slice(),
    target: options.target ?? 100,
    scores: names.map(() => 0),
    turn: first,
    turnTotal: 0,
    rolls: [],
    lastRoll: null,
    lastSeat: -1,
    rollId: 0,
    winner: -1,
    log: [],
  };
  return log(state, -1, `First to ${state.target}. ${names[first]} to start.`);
}

export const actor = (state) => (state.winner >= 0 ? -1 : state.turn);

export function apply(previous, seat, action, rng) {
  if (seat !== actor(previous)) throw new Error('It is not your turn.');
  const state = clone(previous);
  if (action.type === 'roll') {
    const face = rollDie(rng);
    state.rollId += 1;
    state.lastRoll = face;
    state.lastSeat = seat;
    if (face === 1) {
      log(state, seat, state.turnTotal ? `rolled a 1 and lost ${state.turnTotal}.` : 'rolled a 1.');
      state.rolls = [];
      state.turnTotal = 0;
      state.turn = nextSeat(state, seat);
    } else {
      state.rolls.push(face);
      state.turnTotal += face;
    }
    return state;
  }
  if (action.type === 'hold') {
    if (state.turnTotal <= 0) throw new Error('Roll at least once before you hold.');
    state.scores[seat] += state.turnTotal;
    log(state, seat, `held ${state.turnTotal} for ${state.scores[seat]}.`);
    state.turnTotal = 0;
    state.rolls = [];
    if (state.scores[seat] >= state.target) {
      state.winner = seat;
      log(state, seat, `reached ${state.target} and won.`);
    } else {
      state.turn = nextSeat(state, seat);
    }
    return state;
  }
  throw new Error('Unknown move.');
}

// Hold-at thresholds for a 100-point race, scaled to the chosen target. `pace` is Neller and
// Presser's "keep pace and end race" rule, the hard bot before the solver.
export function botHoldAt(state, seat, level) {
  const scale = state.target / 100;
  const mine = state.scores[seat];
  const rival = Math.max(...state.scores.filter((_, i) => i !== seat));
  if (level === 'easy') return Math.round(15 * scale);
  if (level === 'normal') return Math.round(20 * scale);
  if (mine >= 71 * scale || rival >= 71 * scale) return state.target - mine;
  return Math.max(1, Math.round((21 + Math.round((rival - mine) / 8)) * scale));
}

function heuristic(state, seat, level, rng) {
  const mine = state.scores[seat];
  if (state.turnTotal === 0) return { type: 'roll' };
  if (mine + state.turnTotal >= state.target) return { type: 'hold' };
  let holdAt = botHoldAt(state, seat, level);
  if (level === 'easy') holdAt += Math.round((rng() - 0.5) * 10);
  return state.turnTotal >= holdAt ? { type: 'hold' } : { type: 'roll' };
}

// ---------- Solver ----------
// data/pig-<target>.bin (built by scripts/solve.mjs) holds P(i, j, 0), the two-player chance that
// the player to move wins at the start of a turn with score i against j, as little-endian Float64
// (index i·target + j). Mid-turn values follow exactly by running the Bellman equation backwards
// over the turn total for this (i, j).
const tables = new Map();
const loaded = new Map();

async function readTable(target) {
  const url = new URL(`./data/pig-${target}.bin`, import.meta.url);
  let bytes;
  if (typeof window === 'undefined') {
    const { readFile } = await import('node:fs/promises');
    const file = await readFile(url);
    bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  } else {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Pig table ${target} did not load (${response.status}).`);
    bytes = await response.arrayBuffer();
  }
  if (bytes.byteLength !== target * target * 8) throw new Error(`Pig table ${target} has the wrong size.`);
  const view = new DataView(bytes);
  const slice = new Float64Array(target * target);
  for (let i = 0; i < slice.length; i += 1) slice[i] = view.getFloat64(i * 8, true);
  const table = { target, slice };
  loaded.set(target, table);
  return table;
}

export function loadTable(target) {
  if (!tables.has(target)) {
    const pending = readTable(target);
    pending.catch(() => tables.delete(target));
    tables.set(target, pending);
  }
  return tables.get(target);
}

// Win chances for rolling and holding with score i, turn total k, against score j.
export function chances({ target: T, slice }, i, j, k) {
  if (i + k >= T) return { roll: (1 - slice[j * T + i]) / 6 + 5 / 6, hold: 1 };
  const row = new Float64Array(T - i + 6).fill(1);
  const pass = (1 - slice[j * T + i]) / 6;
  let roll = 0;
  for (let t = T - i - 1; t >= k; t -= 1) {
    roll = pass + (row[t + 2] + row[t + 3] + row[t + 4] + row[t + 5] + row[t + 6]) / 6;
    row[t] = t > 0 ? Math.max(roll, 1 - slice[j * T + i + t]) : roll;
  }
  return { roll, hold: k > 0 ? 1 - slice[j * T + i + k] : null };
}

// Enough decimals that two different chances never print the same.
function percents(values) {
  for (let digits = 1; digits <= 3; digits += 1) {
    const shown = values.map((value) => (value * 100).toFixed(digits));
    if (values.length < 2 || shown[0] !== shown[1] || Math.abs(values[0] - values[1]) < 1e-9) return shown;
  }
  return values.map((value) => (value * 100).toFixed(3));
}

export function adviseWith(table, state, seat) {
  if (state.winner >= 0 || state.turn !== seat || table.target !== state.target) return null;
  const mine = state.scores[seat];
  const rivals = state.scores.filter((_, i) => i !== seat);
  const rival = Math.max(...rivals);
  const k = state.turnTotal;
  const { roll, hold } = chances(table, mine, rival, k);
  const options = [{ action: { type: 'roll' }, label: 'Roll', value: roll }];
  if (k > 0) options.push({ action: { type: 'hold' }, label: `Hold ${k}`, value: hold });
  options.sort((a, b) => b.value - a.value);
  const shown = percents(options.map((option) => option.value));
  options.forEach((option, i) => { option.display = `${option.value === 1 ? '100' : shown[i]}% to win`; });
  const exact = rivals.length === 1;
  return {
    best: options[0].action,
    options,
    metric: 'Chance to win',
    exact,
    note: exact ? '' : `No exact solution for ${state.names.length} players: these are two-player odds against the leader (${rival}).`,
  };
}

export async function advise(state, seat) {
  if (state.target !== 50 && state.target !== 100) return null;
  return adviseWith(await loadTable(state.target), state, seat);
}

export function bot(state, seat, level, rng) {
  if (level !== 'hard') return heuristic(state, seat, level, rng);
  const ready = loaded.get(state.target);
  if (ready) return adviseWith(ready, state, seat)?.best || heuristic(state, seat, 'pace', rng);
  return advise(state, seat).then(
    (advice) => advice?.best || heuristic(state, seat, 'pace', rng),
    () => heuristic(state, seat, 'pace', rng),
  );
}

export const game = {
  id: 'pig',
  name: 'Pig',
  players: { min: 2, max: 6, default: 2 },
  hidden: false,
  options: [
    { id: 'target', label: 'Points to win', choices: [{ value: 50, label: '50' }, { value: 100, label: '100' }], default: 100 },
  ],
  setup,
  actor,
  apply,
  view: (state) => state,
  bot,
  advise,
  sameAction: (a, b) => a?.type === b?.type,
  pace: (state, action) => (action.type === 'hold' ? 1000 : state.turnTotal === 0 ? 1100 : 750),
  summary: (state, seat) => `${state.scores[seat]}${seat === state.turn && state.turnTotal && state.winner < 0 ? ` +${state.turnTotal}` : ''}`,
  status(state, seat, { canAct } = {}) {
    if (canAct) return state.turnTotal ? `Your turn: ${state.turnTotal} at risk. Roll again or hold.` : 'Your turn. Roll the die.';
    return `${state.names[state.turn]} to roll${state.turnTotal ? ` · ${state.turnTotal} at risk` : ''}.`;
  },
  outcome: (state) => (state.winner >= 0 ? { winners: [state.winner], text: `${state.names[state.winner]} won with ${state.scores[state.winner]}.` } : null),
};
