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

// ---------- Exact turn values ----------

const pair = (a, b) => (a <= b ? [a, b] : [b, a]);

// The best chance of ending a turn with `utility(cargo)` from any position,
// by exhaustive expectation over the dice (cargo 0 means the crew was missed).
export function turnSolver(utility) {
  const memo = new Map();
  const value = new Array(13);
  for (let cargo = 0; cargo <= 12; cargo += 1) value[cargo] = utility(cargo);
  const loaded = (a, b, k) => {
    const key = `l${a}${b}${k}`;
    if (memo.has(key)) return memo.get(key);
    let best = value[a + b];
    if (k > 0) {
      let low = 0;
      let high = 0;
      let both = 0;
      for (let f = 1; f <= 6; f += 1) {
        low += loaded(...pair(f, b), k - 1) / 6;
        high += loaded(...pair(a, f), k - 1) / 6;
        for (let g = 1; g <= 6; g += 1) both += loaded(...pair(f, g), k - 1) / 36;
      }
      best = Math.max(best, low, high, both);
    }
    memo.set(key, best);
    return best;
  };
  const open = (stage, k) => {
    if (k === 0) return value[0];
    const key = `o${stage}${k}`;
    if (memo.has(key)) return memo.get(key);
    let total = 0;
    for (const { dice, p } of diceOutcomes(ROLES.length + 2 - stage)) {
      const result = setAside(stage, dice);
      total += p * (result.stage === ROLES.length ? loaded(...pair(...result.dice), k - 1) : open(result.stage, k - 1));
    }
    memo.set(key, total);
    return total;
  };
  return { loaded: (dice, k) => loaded(...pair(dice[0], dice[1]), k), open };
}

// beatChance(c): how often a player who comes later and plays only to beat a
// posted cargo of c ends the turn above it. That is the later player's
// well-played turn as the hard bot meets it; computed once and cached.
const beatCache = [];
export function beatChance(cargo) {
  if (cargo >= 12) return 0;
  const c = Math.max(0, cargo);
  if (beatCache[c] === undefined) beatCache[c] = turnSolver((x) => (x > c ? 1 : 0)).open(0, ROLLS);
  return beatCache[c];
}

// P(this seat takes the round) if it ends its turn with `cargo` now.
export function winChance(view, seat, cargo) {
  if (cargo <= 0) return 0;
  let posted = 0;
  let later = 0;
  view.cargos.forEach((value, i) => {
    if (i === seat) return;
    if (value === null) later += 1;
    else posted = Math.max(posted, value);
  });
  if (cargo < posted) return 0;
  return (1 - beatChance(cargo)) ** later;
}

// The hard bot's options once loaded: stand, reroll one die, or reroll both.
export function cargoOptions(view, seat) {
  const solver = turnSolver((x) => winChance(view, seat, x));
  const k = rollsLeft(view) - 1;
  const [a, b] = view.dice;
  const options = [{ action: { type: 'stand' }, p: winChance(view, seat, a + b) }];
  if (k < 0) return options;
  let first = 0;
  let second = 0;
  let both = 0;
  for (let f = 1; f <= 6; f += 1) {
    first += solver.loaded([f, b], k) / 6;
    second += solver.loaded([a, f], k) / 6;
    for (let g = 1; g <= 6; g += 1) both += solver.loaded([f, g], k) / 36;
  }
  options.push({ action: { type: 'roll', reroll: [0] }, p: first });
  if (a !== b) options.push({ action: { type: 'roll', reroll: [1] }, p: second });
  options.push({ action: { type: 'roll', reroll: [0, 1] }, p: both });
  return options;
}

const bestPosted = (view, seat) => Math.max(0, ...view.cargos.map((value, i) => (i === seat ? 0 : value ?? 0)));

export function bot(view, seat, level, rng) {
  if (!qualified(view)) return { type: 'roll', reroll: [] };
  const [a, b] = view.dice;
  const cargo = a + b;
  if (rollsLeft(view) <= 0) return { type: 'stand' };
  if (level === 'hard') {
    // Stand on ties between options; prefer fewer dice rerolled.
    return cargoOptions(view, seat).reduce((best, option) => (option.p > best.p + 1e-12 ? option : best)).action;
  }
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
  pace: (state, action) => (action.type === 'stand' ? 1000 : state.rolls === 0 ? 1300 : 850),
  summary: (state, seat) => `${state.wins[seat]} of ${state.target}`,
  status,
  outcome,
};
