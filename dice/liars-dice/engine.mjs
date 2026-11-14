// Liar’s Dice: everyone rolls in secret, then bids on how many dice around the
// table show a face. Raise the bid or call Liar; the wrong side loses a die.
import { clone, log, rollDice, nextSeat, sum, pick, plural, binomialAtLeast } from '../table-core.mjs';

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one',
  'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five', 'twenty-six', 'twenty-seven', 'twenty-eight',
  'twenty-nine', 'thirty'];

export const numberWord = (count) => WORDS[count] ?? String(count);
export const faceText = (face, count) => `${face}${count === 1 ? '' : 's'}`;
// "four 5s", "one 6"
export const bidText = (quantity, face) => `${numberWord(quantity)} ${faceText(face, quantity)}`;
// "There were three 5s." / "There was one 5." / "There were no 5s."
export const countText = (count, face) => `There ${count === 1 ? 'was' : 'were'} ${numberWord(count)} ${faceText(face, count)}.`;

// A name inside a sentence: the default single player is called "You".
const named = (state, seat) => (state.names[seat] === 'You' ? 'you' : state.names[seat]);
const isAlive = (state) => (seat) => state.counts[seat] > 0;

export const minFace = (state) => (state.wild ? 2 : 1);
export const diceInPlay = (state) => sum(state.dice.map((dice) => dice.length));

// Dice that count toward `face`: the face itself, plus ones when they are wild.
export const isMatch = (face, die, wild) => die === face || (wild && face !== 1 && die === 1);
export const matchCount = (dice, face, wild) => dice.filter((die) => isMatch(face, die, wild)).length;

export function isRaise(previous, quantity, face) {
  if (!previous) return true;
  return quantity > previous.quantity || (quantity === previous.quantity && face > previous.face);
}

// Why a bid is illegal, or '' when it may be made.
export function bidProblem(state, quantity, face) {
  const total = diceInPlay(state);
  if (!Number.isInteger(quantity) || quantity < 1) return 'Bid at least one die.';
  if (quantity > total) return `There are only ${total} dice in play.`;
  if (!Number.isInteger(face) || face < 1 || face > 6) return 'Pick a face from 1 to 6.';
  if (face < minFace(state)) return 'Ones are wild, so bid a face from 2 to 6.';
  if (!isRaise(state.bid, quantity, face)) return `Raise ${bidText(state.bid.quantity, state.bid.face)}: more dice, or the same number of a higher face.`;
  return '';
}

// The smallest legal bid, optionally of one face. null when nothing is left to bid.
export function minimumBid(state, face = null) {
  const total = diceInPlay(state);
  const low = minFace(state);
  const previous = state.bid;
  if (face != null) {
    const quantity = !previous ? 1 : face > previous.face ? previous.quantity : previous.quantity + 1;
    return quantity <= total ? { quantity, face } : null;
  }
  if (!previous) return { quantity: 1, face: low };
  if (previous.face < 6) return { quantity: previous.quantity, face: previous.face + 1 };
  return previous.quantity + 1 <= total ? { quantity: previous.quantity + 1, face: low } : null;
}

// Every legal bid up to `maxQuantity`, lowest first.
export function legalBids(state, maxQuantity = Infinity) {
  const bids = [];
  const top = Math.min(diceInPlay(state), maxQuantity);
  for (let quantity = 1; quantity <= top; quantity += 1) {
    for (let face = minFace(state); face <= 6; face += 1) {
      if (isRaise(state.bid, quantity, face)) bids.push({ quantity, face });
    }
  }
  return bids;
}

function startRound(state, starter, rng) {
  state.round += 1;
  state.dice = state.counts.map((count) => rollDice(count, rng).sort((a, b) => a - b));
  state.rollId += 1;
  state.phase = 'bid';
  state.turn = starter;
  state.starter = starter;
  state.bid = null;
  state.bids = [];
  state.result = null;
  log(state, -1, `Round ${state.round}: ${diceInPlay(state)} dice in play. ${state.names[starter]} to open.`);
  return state;
}

export function setup({ names, options = {}, rng = Math.random, first = 0 }) {
  const startDice = options.dice === 3 ? 3 : 5;
  const state = {
    names: names.slice(),
    wild: options.wild !== false,
    startDice,
    counts: names.map(() => startDice),
    dice: names.map(() => []),
    phase: 'bid',
    turn: first,
    starter: first,
    round: 0,
    bid: null,
    bids: [],
    result: null,
    rollId: 0,
    winner: -1,
    log: [],
  };
  log(state, -1, `Everyone starts with ${startDice} dice.${state.wild ? ' Ones are wild.' : ''}`);
  return startRound(state, first, rng);
}

export const actor = (state) => (state.phase === 'over' ? -1 : state.turn);

export function apply(previous, seat, action, rng = Math.random) {
  if (previous.phase === 'over') throw new Error('The game is over.');
  if (!(previous.counts[seat] > 0)) throw new Error('You are out of this game.');
  if (seat !== actor(previous)) throw new Error('It is not your turn.');
  const type = action?.type;
  const state = clone(previous);

  if (type === 'bid') {
    if (state.phase !== 'bid') throw new Error('Start the next round first.');
    const quantity = Number(action.quantity);
    const face = Number(action.face);
    const problem = bidProblem(state, quantity, face);
    if (problem) throw new Error(problem);
    state.bid = { seat, quantity, face };
    state.bids.push(state.bid);
    log(state, seat, `bid ${bidText(quantity, face)}.`);
    state.turn = nextSeat(state, seat, isAlive(state));
    return state;
  }

  if (type === 'liar') {
    if (state.phase !== 'bid') throw new Error('Start the next round first.');
    const bid = state.bid;
    if (!bid) throw new Error('Someone has to bid before anyone can call Liar.');
    const actual = sum(state.dice.map((dice) => matchCount(dice, bid.face, state.wild)));
    const loser = actual >= bid.quantity ? seat : bid.seat;
    state.counts[loser] -= 1;
    const out = state.counts[loser] === 0;
    state.result = { caller: seat, bidder: bid.seat, quantity: bid.quantity, face: bid.face, actual, loser, out, held: actual >= bid.quantity };
    log(state, seat, `called Liar on ${named(state, bid.seat)}.`);
    log(state, -1, `${countText(actual, bid.face)} ${state.names[loser]} lost a die.`);
    if (out) log(state, loser, 'dropped out with no dice left.');
    const alive = state.counts.map((count, i) => (count > 0 ? i : -1)).filter((i) => i >= 0);
    if (alive.length === 1) {
      state.phase = 'over';
      state.winner = alive[0];
      state.turn = -1;
      log(state, state.winner, `won with ${plural(state.counts[state.winner], 'die', 'dice')} left.`);
    } else {
      state.phase = 'reveal';
      state.turn = out ? nextSeat(state, loser, isAlive(state)) : loser;
    }
    return state;
  }

  if (type === 'next') {
    if (state.phase !== 'reveal') throw new Error('The round is still being bid.');
    return startRound(state, seat, rng);
  }

  throw new Error('Unknown move.');
}

// After an online host leaves, the next host holds only the spectator view, so
// a round still being bid is rerolled from scratch with the same opener.
export function recover(state, rng = Math.random) {
  const next = clone(state);
  if (next.phase !== 'bid') return next;
  log(next, -1, 'The table changed hosts, so everyone rerolled.');
  next.round -= 1;
  return startRound(next, next.turn, rng);
}

// What `seat` may see: its own dice while bidding; every die once they are revealed.
export function view(state, seat) {
  const shown = clone(state);
  if (state.phase === 'bid') shown.dice = state.dice.map((dice, i) => (i === seat ? dice.slice() : dice.map(() => 0)));
  return shown;
}

// ---------- Bots ----------

// P(at least `need` successes) for independent dice with their own chances.
function atLeast(chances, need) {
  if (need <= 0) return 1;
  if (need > chances.length) return 0;
  let dist = [1];
  for (const q of chances) {
    const next = new Array(dist.length + 1).fill(0);
    for (let k = 0; k < dist.length; k += 1) {
      next[k] += dist[k] * (1 - q);
      next[k + 1] += dist[k] * q;
    }
    dist = next;
  }
  return Math.min(1, Math.max(0, sum(dist.slice(need))));
}

// P(the bid is true) from `seat`’s own dice. With `read`, a player who bid that
// face this round is taken to hold `read` more of it per bid (two bids at most).
export function bidChance(state, seat, quantity, face, read = 0) {
  const mine = state.dice[seat] || [];
  const need = quantity - matchCount(mine, face, state.wild);
  const p = state.wild && face !== 1 ? 1 / 3 : 1 / 6;
  if (!read) {
    const unknown = sum(state.counts.filter((_, i) => i !== seat));
    return binomialAtLeast(unknown, p, need);
  }
  const chances = [];
  state.counts.forEach((count, i) => {
    if (i === seat || count <= 0) return;
    const reads = state.bids.filter((bid) => bid.seat === i && bid.face === face).length;
    const q = reads ? Math.min(0.8, p + (read * Math.min(2, reads)) / count) : p;
    for (let k = 0; k < count; k += 1) chances.push(q);
  });
  return atLeast(chances, need);
}

// call: the lowest P(previous bid true) a bot lets stand. weigh: hard also calls
// when P(true) < weigh × P(its best raise is false), since a raise only risks a
// die if it is false. open: how likely an opening bid must be. Tuned by
// self-play (tests/engine.test.mjs reports the rates).
export const STYLE = {
  normal: { read: 0, call: 0.4, weigh: 0, open: 0.55, bluff: 0.05 },
  hard: { read: 0.6, call: 0.3, weigh: 0.7, open: 0.7, bluff: 0.12 },
};

function easyBot(state, seat, rng) {
  const total = diceInPlay(state);
  const previous = state.bid;
  if (previous) {
    const expected = total * (state.wild && previous.face !== 1 ? 1 / 3 : 1 / 6);
    const tooHigh = previous.quantity - expected >= 2;
    // Easy sometimes calls a modest bid, and sometimes lets a wild one go.
    const call = tooHigh ? rng() > 0.1 : previous.quantity >= expected - 1 && rng() < 0.12;
    if (call || !minimumBid(state)) return { type: 'liar' };
  }
  const faces = [];
  for (let face = minFace(state); face <= 6; face += 1) faces.push(face);
  let bid = null;
  for (let tries = 0; tries < 6 && !bid; tries += 1) bid = minimumBid(state, pick(rng, faces));
  bid ||= minimumBid(state);
  if (!previous) bid.quantity = Math.max(1, Math.round(total * (state.wild ? 1 / 3 : 1 / 6) * (0.4 + rng() * 0.4)));
  else if (rng() < 0.15 && bid.quantity + 1 <= total) bid.quantity += 1;
  return { type: 'bid', ...bid };
}

export function bot(state, seat, level = 'normal', rng = Math.random) {
  if (state.phase === 'reveal') return { type: 'next' };
  if (level === 'easy') return easyBot(state, seat, rng);
  const style = STYLE[level] || STYLE.normal;
  const mine = state.dice[seat] || [];
  const held = (face) => mine.filter((die) => die === face).length;
  const chance = (bid) => bidChance(state, seat, bid.quantity, bid.face, style.read);
  const previous = state.bid;

  if (!previous) {
    // Open with the strongest face at the highest count that is still likely.
    const options = [];
    for (let face = minFace(state); face <= 6; face += 1) {
      let quantity = 1;
      while (quantity + 1 <= diceInPlay(state) && chance({ quantity: quantity + 1, face }) >= style.open) quantity += 1;
      options.push({ quantity, face, score: quantity + held(face) * 0.1 + face * 0.01 });
    }
    options.sort((a, b) => b.score - a.score);
    if (rng() < style.bluff) {
      // A believable opening on a face this bot does not hold.
      const bluffs = options.filter((option) => !held(option.face) && option.quantity > 1);
      if (bluffs.length) {
        const bluff = pick(rng, bluffs);
        return { type: 'bid', quantity: bluff.quantity - 1, face: bluff.face };
      }
    }
    return { type: 'bid', quantity: options[0].quantity, face: options[0].face };
  }

  const truth = chance(previous);
  const raises = legalBids(state, previous.quantity + 2).map((bid) => ({ ...bid, p: chance(bid) }));
  if (!raises.length) return { type: 'liar' };
  for (const raise of raises) raise.score = raise.p + held(raise.face) * 0.02 - (raise.quantity - previous.quantity) * 0.01;
  raises.sort((a, b) => b.score - a.score);
  const best = raises[0];
  // With one or two dice a bot sees little of the table, so it calls a touch sooner.
  const line = Math.max(style.call, style.weigh * (1 - best.p)) + (state.counts[seat] <= 2 ? 0.03 : 0);
  if (truth < line || (best.p < 0.3 && truth < best.p + 0.15)) return { type: 'liar' };
  if (rng() < style.bluff) {
    const quantity = raises.reduce((low, raise) => Math.min(low, raise.quantity), Infinity);
    const bluffs = raises.filter((raise) => raise.quantity <= quantity + 1 && raise.p >= 0.35 && !held(raise.face));
    if (bluffs.length) {
      const bluff = pick(rng, bluffs);
      return { type: 'bid', quantity: bluff.quantity, face: bluff.face };
    }
  }
  return { type: 'bid', quantity: best.quantity, face: best.face };
}

// ---------- Text ----------

function resultText(state) {
  const result = state.result;
  if (!result) return '';
  return `${countText(result.actual, result.face)} ${state.names[result.loser]} lost a die.`;
}

export const game = {
  id: 'liars-dice',
  name: 'Liar’s Dice',
  players: { min: 2, max: 6, default: 4 },
  hidden: true,
  options: [
    {
      id: 'wild',
      label: 'Ones wild',
      choices: [{ value: true, label: 'On' }, { value: false, label: 'Off' }],
      default: true,
      hint: (wild) => (wild ? 'Ones count toward every face, so bids name 2 to 6.' : 'Ones are a face like any other.'),
    },
    { id: 'dice', label: 'Starting dice', choices: [{ value: 5, label: '5' }, { value: 3, label: '3' }], default: 5 },
  ],
  setup,
  actor,
  apply,
  view,
  recover,
  bot,
  pace: (state, action) => (action.type === 'next' ? 3000 : action.type === 'liar' ? 1100 : 1300),
  needsPrivacy: (state) => state.phase === 'bid',
  summary: (state, seat) => (state.counts[seat] > 0 ? plural(state.counts[seat], 'die', 'dice') : 'Out'),
  status(state, seat, { canAct } = {}) {
    if (state.phase === 'over') return `${state.names[state.winner]} won.`;
    if (state.phase === 'reveal') return resultText(state);
    const bid = state.bid;
    if (canAct) return bid ? `Your turn. Raise ${bidText(bid.quantity, bid.face)} or call Liar.` : 'Your turn. Open the bidding.';
    return `${state.names[state.turn]} to ${bid ? 'bid' : 'open'}.`;
  },
  outcome: (state) => (state.phase === 'over'
    ? { winners: [state.winner], text: `${state.names[state.winner]} won with ${plural(state.counts[state.winner], 'die', 'dice')} left.` }
    : null),
};
