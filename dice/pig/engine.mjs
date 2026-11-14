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

// Hold-at thresholds for a 100-point race, scaled to the chosen target.
export function botHoldAt(state, seat, level) {
  const scale = state.target / 100;
  const mine = state.scores[seat];
  const rival = Math.max(...state.scores.filter((_, i) => i !== seat));
  if (level === 'easy') return Math.round(15 * scale);
  if (level === 'normal') return Math.round(20 * scale);
  // Neller and Presser's "keep pace and end race": near the finish, roll for it.
  if (mine >= 71 * scale || rival >= 71 * scale) return state.target - mine;
  return Math.max(1, Math.round((21 + Math.round((rival - mine) / 8)) * scale));
}

export function bot(state, seat, level, rng) {
  const mine = state.scores[seat];
  if (state.turnTotal === 0) return { type: 'roll' };
  if (mine + state.turnTotal >= state.target) return { type: 'hold' };
  let holdAt = botHoldAt(state, seat, level);
  if (level === 'easy') holdAt += Math.round((rng() - 0.5) * 10);
  return state.turnTotal >= holdAt ? { type: 'hold' } : { type: 'roll' };
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
  pace: (state, action) => (action.type === 'hold' ? 1000 : state.turnTotal === 0 ? 1100 : 750),
  summary: (state, seat) => `${state.scores[seat]}${seat === state.turn && state.turnTotal && state.winner < 0 ? ` +${state.turnTotal}` : ''}`,
  status(state, seat, { canAct } = {}) {
    if (canAct) return state.turnTotal ? `Your turn: ${state.turnTotal} at risk. Roll again or hold.` : 'Your turn. Roll the die.';
    return `${state.names[state.turn]} to roll${state.turnTotal ? ` · ${state.turnTotal} at risk` : ''}.`;
  },
  outcome: (state) => (state.winner >= 0 ? { winners: [state.winner], text: `${state.names[state.winner]} won with ${state.scores[state.winner]}.` } : null),
};
