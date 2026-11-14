// Mia (Mäxchen): roll two dice under a cup, announce a value higher than the
// last one (truth or bluff), and the next player calls the bluff or believes it
// and rolls. Lose a life when a call goes against you; the last player standing wins.
import { clone, log, rollDie, nextSeat, plural } from '../table-core.mjs';

// Lowest to highest. Two dice read high die first; doubles beat every mixed
// roll and Mia (2 and 1) beats everything.
export const RANKING = [31, 32, 41, 42, 43, 51, 52, 53, 54, 61, 62, 63, 64, 65, 11, 22, 33, 44, 55, 66, 21];
export const MIA = 21;
const TOP = RANKING.length - 1;

export const rank = (value) => RANKING.indexOf(Number(value));
export const label = (value) => (Number(value) === MIA ? 'Mia' : String(value));

export function valueOf(dice) {
  const [a, b] = dice;
  return Math.max(a, b) * 10 + Math.min(a, b);
}

// Chance of rolling exactly `value`: doubles 1 in 36, everything else 2 in 36.
export const chance = (value) => (value % 11 === 0 ? 1 : 2) / 36;

// Chance a random roll is `value` or better.
export function atLeast(value) {
  let total = 0;
  for (let r = Math.max(0, rank(value)); r <= TOP; r += 1) total += chance(RANKING[r]);
  return total;
}

// Every value a player may announce over `claim` (null at the start of a round).
export const legalValues = (claim) => RANKING.slice(claim == null ? 0 : rank(claim) + 1);

const alive = (state) => (seat) => state.lives[seat] > 0;

export function setup({ names, options = {}, first = 0 }) {
  const lives = Number(options.lives) || 6;
  const state = {
    names: names.slice(),
    maxLives: lives,
    lives: names.map(() => lives),
    phase: 'roll',
    turn: first,
    starter: first,
    round: 1,
    claim: null,
    history: [],
    dice: null,
    diceSeat: -1,
    rollId: 0,
    result: null,
    winner: -1,
    log: [],
  };
  return log(state, -1, `${plural(lives, 'life', 'lives')} each. ${names[first]} to start.`);
}

export const actor = (state) => (state.winner >= 0 ? -1 : state.turn);

export function apply(previous, seat, action, rng) {
  if (previous.winner >= 0) throw new Error('The game is over.');
  if (seat !== actor(previous)) throw new Error('It is not your turn.');
  const type = action?.type;
  const state = clone(previous);

  if (type === 'roll') {
    if (state.phase === 'decide') {
      if (state.claim.value === MIA) throw new Error('Nothing beats Mia: call or concede.');
      log(state, seat, 'believed it and rolled.');
    } else if (state.phase !== 'roll') {
      throw new Error('You cannot roll now.');
    }
    state.dice = [rollDie(rng), rollDie(rng)].sort((a, b) => b - a);
    state.diceSeat = seat;
    state.rollId += 1;
    state.phase = 'announce';
    return state;
  }

  if (type === 'announce') {
    if (state.phase !== 'announce') throw new Error(state.phase === 'reveal' ? 'The round is over.' : 'Roll before you announce.');
    const value = Number(action.value);
    if (rank(value) < 0) throw new Error('That is not a Mia value.');
    if (state.claim && rank(value) <= rank(state.claim.value)) throw new Error(`Announce more than ${label(state.claim.value)}.`);
    state.claim = { seat, value };
    state.history.push({ seat, value });
    log(state, seat, `announced ${label(value)}.`);
    state.phase = 'decide';
    state.turn = nextSeat(state, seat, alive(state));
    return state;
  }

  if (type === 'call') {
    if (state.phase !== 'decide' || !state.claim) throw new Error('There is no announcement to call.');
    const { seat: announcer, value: claimed } = state.claim;
    const dice = state.dice;
    const actual = valueOf(dice);
    const truth = rank(actual) >= rank(claimed);
    log(state, seat, claimed === MIA ? 'called Mia.' : 'called the bluff.');
    return finishRound(state, {
      kind: 'call', by: seat, announcer, claimed, actual, dice, truth,
      loser: truth ? seat : announcer,
      lost: truth && claimed === MIA ? 2 : 1,
    });
  }

  if (type === 'concede') {
    if (state.phase !== 'decide' || state.claim?.value !== MIA) throw new Error('You can only concede to Mia.');
    return finishRound(state, {
      kind: 'concede', by: seat, announcer: state.claim.seat, claimed: MIA, actual: null, dice: null, truth: null,
      loser: seat, lost: 1,
    });
  }

  if (type === 'next') {
    if (state.phase !== 'reveal') throw new Error('The round is still going.');
    state.phase = 'roll';
    state.starter = state.turn;
    state.round += 1;
    state.claim = null;
    state.history = [];
    state.result = null;
    log(state, -1, `Round ${state.round}. ${state.names[state.turn]} to start.`);
    return state;
  }

  throw new Error('Unknown move.');
}

function finishRound(state, result) {
  const { loser } = result;
  // A true Mia costs the caller 2 lives, but nobody loses more than they have.
  result.taken = Math.min(result.lost, state.lives[loser]);
  state.lives[loser] -= result.taken;
  result.out = state.lives[loser] === 0;
  const lost = result.taken === 1 ? 'a life' : plural(result.taken, 'life', 'lives');
  if (result.kind === 'call') log(state, -1, `It was ${label(result.actual)}. ${state.names[loser]} lost ${lost}.`);
  else log(state, loser, `conceded Mia and lost ${lost}.`);
  if (result.out) log(state, loser, 'ran out of lives.');
  state.result = result;
  // The cup is lifted (or, on a concession, never shown): the roll is spent.
  state.dice = null;
  state.diceSeat = -1;
  state.phase = 'reveal';
  const standing = state.lives.map((lives, i) => (lives > 0 ? i : -1)).filter((i) => i >= 0);
  if (standing.length === 1) {
    state.winner = standing[0];
    state.turn = standing[0];
    log(state, state.winner, `won with ${plural(state.lives[state.winner], 'life', 'lives')} left.`);
  } else {
    state.turn = result.out ? nextSeat(state, loser, alive(state)) : loser;
  }
  return state;
}

// The roll under the cup is seen only by the player who rolled it, while it is
// in play. Everyone else (and seat -1) sees nothing until a call lifts the cup,
// and then the dice live in `result`.
// Views are read-only, so they share everything public with the state.
export function view(state, seat) {
  const own = state.dice && seat >= 0 && seat === state.diceSeat && (state.phase === 'announce' || state.phase === 'decide');
  return { ...state, dice: own ? state.dice.slice() : null, cup: Boolean(state.dice) };
}

// After an online host leaves, the next host holds only the spectator view. A
// roll waiting to be announced is rolled again for the same player; a claim
// waiting for a call can no longer be checked, so that round starts over.
export function recover(state, rng) {
  const next = clone(state);
  delete next.cup;
  if (next.phase === 'announce') {
    next.dice = [rollDie(rng), rollDie(rng)].sort((a, b) => b - a);
    next.diceSeat = next.turn;
    next.rollId += 1;
    log(next, -1, 'The table changed hosts, so the roll was rerolled.');
  } else if (next.phase === 'decide') {
    Object.assign(next, { phase: 'roll', starter: next.turn, claim: null, history: [], dice: null, diceSeat: -1 });
    log(next, -1, `The table changed hosts, so the round restarted. ${next.names[next.turn]} to start.`);
  } else {
    next.dice = null;
    next.diceSeat = -1;
  }
  return next;
}

// On a shared device every decision that leads straight to a private roll
// (rolling, believing and rolling, announcing) gets the hand-over curtain.
export const needsPrivacy = (state) => state.phase !== 'reveal';

// ---------- Bots ----------

// Hard reasons about a model table. An announcer tells the truth when the roll
// beats the claim (TRUTH of the time); otherwise it bluffs a few steps above the
// claim, mostly the smallest raise (LIE_STEPS), now and then straight to Mia.
const TRUTH = 0.88;
const LIE_STEPS = [0.5, 0.25, 0.12, 0.07];
const MIA_JUMP = 0.06;
const TEMPER = 0.06; // how sharply a modelled player picks the cheaper option
const KEEP_HONEST = 0.12; // how often hard calls a Mia it believes
const SECOND_STEP = 0.12; // how often hard bluffs one step above the smallest raise

// P(a bluff over the value at `fromRank` is the value at `toRank`).
function lieWeight(fromRank, toRank) {
  const room = TOP - fromRank;
  if (toRank <= fromRank || room < 1) return 0;
  const steps = LIE_STEPS.slice(0, Math.min(LIE_STEPS.length, room));
  const jump = room > steps.length ? MIA_JUMP : 0;
  const total = steps.reduce((sum, weight) => sum + weight, 0) + jump;
  const step = toRank - fromRank;
  if (step <= steps.length) return steps[step - 1] / total;
  return toRank === TOP ? jump / total : 0;
}

// What the model announces over `previous`: P(value at rank i, and true/false).
const announceMemo = new Map();
function announcements(previous) {
  const floor = previous == null ? -1 : rank(previous);
  if (announceMemo.has(floor)) return announceMemo.get(floor);
  const truth = RANKING.map(() => 0);
  const lie = RANKING.map(() => 0);
  for (let r = 0; r <= TOP; r += 1) {
    const p = chance(RANKING[r]);
    if (r === TOP) {
      truth[r] += p;
    } else if (r > floor) {
      truth[r] += p * TRUTH;
      for (let t = r + 1; t <= TOP; t += 1) lie[t] += p * (1 - TRUTH) * lieWeight(r, t);
    } else {
      for (let t = floor + 1; t <= TOP; t += 1) lie[t] += p * lieWeight(floor, t);
    }
  }
  const result = { truth, lie };
  announceMemo.set(floor, result);
  return result;
}

// P(an announcement of `value` is true | the claim before it was `previous`).
export function truthChance(value, previous = null) {
  const { truth, lie } = announcements(previous);
  const r = rank(value);
  return truth[r] + lie[r] > 0 ? truth[r] / (truth[r] + lie[r]) : 0.5;
}

const soft = (edge) => 1 / (1 + Math.exp(-edge / TEMPER));

// Expected life loss through the rest of a round when every player follows
// the model. `back` is the chance the round comes round to you again: 1 with
// two players left, less with more.
const plans = new Map();
export function plan(back) {
  if (plans.has(back)) return plans.get(back);
  const believeMemo = new Map();
  const returnMemo = new Map();
  // Loss for whoever believes `claim` and must beat it.
  const believe = (claim) => {
    if (believeMemo.has(claim)) return believeMemo.get(claim);
    let loss = 0;
    for (const value of legalValues(claim)) loss += chance(value) * next(value, true, claim);
    loss += (1 - atLeast(claim) + chance(claim)) * Math.min(...legalValues(claim).map((value) => next(value, false, claim)));
    believeMemo.set(claim, loss);
    return loss;
  };
  // Loss for whoever faces `claim` over `previous`, choosing the cheaper option.
  const face = (claim, previous) => {
    const truth = truthChance(claim, previous);
    return claim === MIA ? Math.min(2 * truth, 1) : Math.min(truth, believe(claim));
  };
  // Chance the next player calls `claim` over `previous`.
  const call = (claim, previous) => {
    const truth = truthChance(claim, previous);
    return claim === MIA ? soft(1 - 2 * truth) : soft(believe(claim) - truth);
  };
  // Loss when the round comes back after the next player believed `claim`.
  const comeback = (claim) => {
    if (claim === MIA || !back) return 0;
    if (returnMemo.has(claim)) return returnMemo.get(claim);
    const { truth, lie } = announcements(claim);
    let loss = 0;
    for (const value of legalValues(claim)) loss += (truth[rank(value)] + lie[rank(value)]) * face(value, claim);
    returnMemo.set(claim, loss);
    return loss;
  };
  // Loss for announcing `value` over `claim`, true or not.
  const next = (value, truthful, claim) => {
    const called = call(value, claim);
    return called * (truthful ? 0 : 1) + (1 - called) * back * comeback(value);
  };
  const model = { believe, call, next };
  plans.set(back, model);
  return model;
}

const comesBack = (state) => {
  const standing = state.lives.filter((lives) => lives > 0).length;
  return standing <= 2 ? 1 : standing === 3 ? 0.4 : 0.2;
};

const previousClaim = (state) => (state.history.length >= 2 ? state.history[state.history.length - 2].value : null);

function decide(state, seat, level, rng) {
  const claimed = state.claim.value;
  const lives = state.lives[seat];
  if (level === 'easy') {
    if (claimed === MIA) return { type: rng() < 0.5 ? 'call' : 'concede' };
    return { type: rng() < 0.15 + 0.6 * (1 - atLeast(claimed)) ? 'call' : 'roll' };
  }
  if (level === 'normal') {
    if (claimed === MIA) return { type: 'call' };
    return { type: atLeast(claimed) < 0.42 + (rng() - 0.5) * 0.12 ? 'call' : 'roll' };
  }
  // Hard: expected lives lost by calling against believing (or conceding Mia).
  const truth = truthChance(claimed, previousClaim(state));
  if (claimed === MIA) {
    // Call when a true Mia costs less than conceding. Otherwise concede, but
    // with lives to spare still call now and then, so a Mia bluff is never free.
    if (truth * Math.min(2, lives) < 1) return { type: 'call' };
    return { type: lives > 2 && rng() < KEEP_HONEST ? 'call' : 'concede' };
  }
  const callLoss = truth;
  const rollLoss = plan(comesBack(state)).believe(claimed);
  if (Math.abs(callLoss - rollLoss) < 0.015) return { type: rng() < 0.5 ? 'call' : 'roll' };
  return { type: callLoss < rollLoss ? 'call' : 'roll' };
}

function announce(state, seat, level, rng) {
  const mine = valueOf(state.dice);
  const claimed = state.claim?.value ?? null;
  const legal = legalValues(claimed);
  const honest = claimed == null || rank(mine) > rank(claimed);
  const steps = (from, count) => legalValues(from).slice(0, count);
  if (mine === MIA && level !== 'easy') return { type: 'announce', value: MIA };
  if (level === 'easy') {
    if (honest && rng() < 0.75) return { type: 'announce', value: mine };
    const options = honest ? steps(mine, 3) : steps(claimed, 4);
    return { type: 'announce', value: options.length ? options[Math.floor(rng() * options.length)] : legal[0] };
  }
  if (honest) return { type: 'announce', value: mine };
  if (level === 'normal') {
    const options = steps(claimed, 2);
    return { type: 'announce', value: options[options.length > 1 && rng() < 0.15 ? 1 : 0] };
  }
  // Hard bluffs with the smallest raise, which a threshold caller is least
  // likely to call, and now and then one step higher so a bigger raise is not
  // a sure sign of the truth. (Announcing above a roll that already beats the
  // claim only turns a safe truth into a bluff, so hard never does.)
  const [low, high] = steps(claimed, 2);
  return { type: 'announce', value: high && high !== MIA && rng() < SECOND_STEP ? high : low };
}

// The hard bot before the solver, kept as the fallback while the table cannot load (and as the
// yardstick in the tests).
export function classicBot(state, seat, rng) {
  if (state.phase === 'roll') return { type: 'roll' };
  if (state.phase === 'reveal') return { type: 'next' };
  if (state.phase === 'announce') return announce(state, seat, 'hard', rng);
  return decide(state, seat, 'hard', rng);
}

// ---------- Solver ----------
// Heads-up (two players left) is solved exactly by scripts/solve.mjs: a Nash equilibrium of the
// whole match for the chance of winning it. data/mia-equilibrium.json holds, for lives "a,b" (the
// announcer's, then the decider's) and every claim p being raised (index p + 1, 0 = the opening):
//   g[p + 1]  the announcer's chance to win the match from that point,
//   nodes[p + 1].y  the decider's calling chance for each value above p, in ladder order,
//   nodes[p + 1].x  for each announcer roll (a "bust" roll at or below p first, when p ≥ 0, then
//                   each value above p) the announcements it makes as [rank, chance] pairs.
// Three or more players have no exact solution: advise falls back to the table model above.
const TREMBLE = 1e-6; // as in solve.mjs: off-path claims are read as if any roll could make them
let table = null;
let loading = null;

async function readTable() {
  const url = new URL('./data/mia-equilibrium.json', import.meta.url);
  let text;
  if (typeof window === 'undefined') {
    const { readFile } = await import('node:fs/promises');
    text = await readFile(url, 'utf8');
  } else {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`The Mia table did not load (${response.status}).`);
    text = await response.text();
  }
  const data = JSON.parse(text);
  if (data.version !== 1 || data.ranking.join() !== RANKING.join()) throw new Error('The Mia table does not match the rules.');
  table = data;
  return data;
}

export function loadTable() {
  if (!loading) {
    loading = readTable();
    loading.catch(() => { loading = null; });
  }
  return loading;
}

const winChance = (data, a, b) => data.lives[`${a},${b}`].g[0];
function duelStakes(data, mine, theirs) {
  return {
    meLose: (k) => (mine - k <= 0 ? 0 : winChance(data, mine - k, theirs)),
    themLose: (k) => (theirs - k <= 0 ? 1 : 1 - winChance(data, theirs - k, mine)),
  };
}

// The announcer types of G(p) (see solve.mjs): their chances and the rank they stand for.
function typesAt(p) {
  const types = [];
  if (p >= 0) {
    let bust = 0;
    for (let r = 0; r <= p; r += 1) bust += chance(RANKING[r]);
    types.push({ rank: p, prob: bust });
  }
  for (let r = p + 1; r <= TOP; r += 1) types.push({ rank: r, prob: chance(RANKING[r]) });
  return types;
}

const percent = (p) => `${(Math.round(p * 1000) / 10).toFixed(1)}%`;
const share = (q) => `${Math.max(1, Math.round(q * 100))}%`;
const MIXED = 0.0005; // a move the equilibrium plays less often than this counts as not played

// Moves the equilibrium plays come first (most often first); the rest follow by value.
function rankOptions(options) {
  return options.sort((x, y) => {
    const px = x.mix > MIXED ? x.mix : 0;
    const py = y.mix > MIXED ? y.mix : 0;
    if ((px > 0) !== (py > 0)) return py > 0 ? 1 : -1;
    if (px > 0 && Math.abs(px - py) > 1e-9) return py - px;
    return y.value - x.value;
  });
}

const DUEL_METRIC = 'Chance to win the match, heads-up equilibrium';
const DUEL_NOTE = 'An exact Nash equilibrium of two-player Mia. Where it mixes, each move is worth the same and is played at random with the chance shown; the chances assume your opponent plays the equilibrium too.';

function claimRanks(state) {
  const history = state.history || [];
  const last = history.length ? rank(history[history.length - 1].value) : -1;
  const before = history.length >= 2 ? rank(history[history.length - 2].value) : -1;
  return { last, before };
}

export function adviseDuel(data, state, seat) {
  const other = state.lives.findIndex((lives, i) => i !== seat && lives > 0);
  const mine = Math.min(state.lives[seat], data.maxLives);
  const theirs = Math.min(state.lives[other], data.maxLives);
  const S = duelStakes(data, mine, theirs);
  const result = (options, note = DUEL_NOTE) => {
    rankOptions(options);
    // The moves an equilibrium mixes are worth exactly the same; the table's rounding leaves
    // hundredths of a point between them, which would only mislead.
    const mixed = options.filter((option) => option.mix > MIXED);
    if (mixed.length > 1) {
      const common = Math.max(...mixed.map((option) => option.value));
      for (const option of mixed) option.value = common;
    }
    for (const option of options) option.display = `${percent(option.value)} to win the match`;
    return { best: options[0].action, options, metric: DUEL_METRIC, exact: true, note };
  };

  if (state.phase === 'roll') {
    return result([{ action: { type: 'roll' }, label: 'Roll', value: winChance(data, mine, theirs), mix: 1 }]);
  }
  if (state.phase === 'reveal') {
    const value = state.turn === seat ? winChance(data, mine, theirs) : 1 - winChance(data, theirs, mine);
    return result([{ action: { type: 'next' }, label: 'Next round', value, mix: 1 }]);
  }
  if (state.phase === 'announce') {
    if (!state.dice || state.diceSeat !== seat) return null;
    const { last: p } = claimRanks(state);
    const node = data.lives[`${mine},${theirs}`].nodes[p + 1];
    const later = data.lives[`${theirs},${mine}`].g;
    const roll = rank(valueOf(state.dice));
    const type = roll > p ? (p >= 0 ? 1 : 0) + roll - p - 1 : 0;
    const mix = new Map(node.x[type]);
    const options = legalValues(p >= 0 ? RANKING[p] : null).map((value, i) => {
      const v = rank(value);
      const called = roll >= v ? S.themLose(v === TOP ? 2 : 1) : S.meLose(1);
      const believed = v === TOP ? S.themLose(1) : 1 - later[v + 1];
      const y = node.y[i];
      const q = mix.get(v) || 0;
      const kind = roll >= v ? 'truth' : 'bluff';
      const text = `Announce ${label(value)} (${kind}${q > MIXED && q < 1 - MIXED ? `, play ${share(q)} of the time` : ''})`;
      return { action: { type: 'announce', value }, label: text, value: y * called + (1 - y) * believed, mix: q };
    });
    return result(options);
  }
  if (state.phase === 'decide' && state.claim) {
    const { last: v, before: p } = claimRanks(state);
    // The announcer had `theirs` lives against `mine` and raised p.
    const node = data.lives[`${theirs},${mine}`].nodes[p + 1];
    const i = v - p - 1;
    const { mass: played, truth: honest } = readClaim(node.x, p, v);
    const y = node.y[i];
    const call = honest * S.meLose(v === TOP ? 2 : 1) + (1 - honest) * S.themLose(1);
    const options = [
      { action: { type: 'call' }, label: v === TOP ? 'Call' : 'Call bluff', value: call, mix: y },
      v === TOP
        ? { action: { type: 'concede' }, label: 'Concede', value: S.meLose(1), mix: 1 - y }
        : { action: { type: 'roll' }, label: 'Believe and roll', value: data.lives[`${mine},${theirs}`].g[v + 1], mix: 1 - y },
    ];
    const mixed = y > MIXED && y < 1 - MIXED;
    for (const option of options) if (mixed) option.label += ` (play ${share(option.mix)} of the time)`;
    const off = played < 1e-4;
    return result(options, off
      ? `${DUEL_NOTE} The equilibrium never makes this claim here, so it is read as if any roll could have made it (${percent(honest)} true).`
      : `${DUEL_NOTE} At equilibrium this claim is true ${percent(honest)} of the time.`);
  }
  return null;
}

// Three or more players: no exact solution (the round is no longer a two-sided zero-sum game, so
// there is no minimax to compute). Advice comes from a model of a typical table instead:
// - announcers follow the Bayesian model above: the truth when they can (TRUTH of the time),
//   otherwise a small raise, so every claim has a posterior chance of being true, and
// - deciders call a claim when fewer than about CALL_AT of rolls would reach it, and always call
//   Mia (the normal bot's rule, and a common human one).
// Against that table your own chance of losing a life is exact: every option is followed through
// the rest of the round, with your later choices made the same way, including your own chance to
// beat a claim you believe. Options are ranked by expected lives lost (a true Mia costs a caller
// 2) and show the chance of losing a life. (An approximate symmetric equilibrium for three or more
// players, found by fictitious play, was tried as the model instead: it read honest players'
// claims as bluffs too often and lost to the normal and old hard bots.)
const MODEL_METRIC = 'Chance to lose a life this round'; // the table adds "estimate" (exact: false)
const MODEL_NOTE = 'No exact solution with three or more players. The others are modelled as telling the truth when they can, bluffing a small raise when they cannot, and calling claims that fewer than about 40% of rolls reach (and every Mia); each option counts the whole rest of the round, including your own chance to beat a claim you believe.';
const CALL_AT = 0.42;
const CALL_SPREAD = 0.03;
const NONE = { e: 0, p: 0 };
const LOSE = { e: 1, p: 1 };
const cheaper = (x, y) => (x.e < y.e - 1e-12 || (Math.abs(x.e - y.e) <= 1e-12 && x.p <= y.p) ? x : y);
const typicalCall = (v) => (v === TOP ? 1 : 1 / (1 + Math.exp((atLeast(RANKING[v]) - CALL_AT) / CALL_SPREAD)));

export function roundModel(state, seat) {
  const n = state.lives.length;
  const after = (s) => {
    for (let k = 1; k <= n; k += 1) if (state.lives[(s + k) % n] > 0) return (s + k) % n;
    return s;
  };
  const mixAt = modelMix;
  const callAt = (p, v) => typicalCall(v);
  const stake = (v) => (v === TOP ? Math.min(2, state.lives[seat]) : 1);
  const callCost = (truth, v) => ({ e: truth * stake(v), p: truth });
  const announced = new Map();
  const rolled = new Map();

  // What `s` (not you) announcing over p costs you.
  function others(p, s) {
    const key = `${p}:${s}`;
    if (announced.has(key)) return announced.get(key);
    const d = after(s);
    const x = mixAt(p);
    const total = { e: 0, p: 0 };
    if (d === seat) {
      for (let v = p + 1; v <= TOP; v += 1) {
        const read = readClaim(x, p, v);
        if (read.mass <= 0) continue;
        const choice = cheaper(callCost(read.truth, v), v === TOP ? LOSE : mine(v));
        total.e += read.mass * choice.e;
        total.p += read.mass * choice.p;
      }
    } else {
      typesAt(p).forEach((type, t) => {
        for (const [v, q] of x[t]) {
          if (v === TOP) continue; // called or conceded: between two other players
          const next = others(v, d);
          const w = type.prob * q * (1 - callAt(p, v));
          total.e += w * next.e;
          total.p += w * next.p;
        }
      });
    }
    announced.set(key, total);
    return total;
  }

  // Announcing v over p with roll rank r.
  function option(p, r, v) {
    const y = callAt(p, v);
    const later = v === TOP ? NONE : others(v, after(seat));
    const caught = r < v ? 1 : 0;
    return { e: y * caught + (1 - y) * later.e, p: y * caught + (1 - y) * later.p };
  }

  // Rolling and announcing over p, the roll still unknown.
  function mine(p) {
    if (rolled.has(p)) return rolled.get(p);
    const total = { e: 0, p: 0 };
    for (let r = 0; r <= TOP; r += 1) {
      let best = option(p, r, p + 1);
      for (let v = p + 2; v <= TOP; v += 1) best = cheaper(option(p, r, v), best);
      total.e += chance(RANKING[r]) * best.e;
      total.p += chance(RANKING[r]) * best.p;
    }
    rolled.set(p, total);
    return total;
  }

  return { option, mine, callCost, truthOf: (p, v) => readClaim(mixAt(p), p, v).truth, mixAt, callAt };
}

// The Bayesian table model's announcements over p in the solver's format: per announcer type
// (typesAt), the values it announces as [rank, chance] pairs.
const modelMixes = new Map();
function modelMix(p) {
  if (modelMixes.has(p)) return modelMixes.get(p);
  const x = typesAt(p).map((type, t) => {
    const bust = p >= 0 && t === 0;
    if (!bust && type.rank === TOP) return [[TOP, 1]];
    const from = bust ? p : type.rank;
    const keep = bust ? 0 : TRUTH;
    const out = keep ? [[from, keep]] : [];
    for (let v = from + 1; v <= TOP; v += 1) {
      const w = (1 - keep) * lieWeight(from, v);
      if (w > 0) out.push([v, w]);
    }
    return out;
  });
  modelMixes.set(p, x);
  return x;
}

// The posterior on a claim of v over p, from the announcer's equilibrium mix plus the trembles.
function readClaim(x, p, v) {
  let mass = 0;
  let weight = 0;
  let truth = 0;
  typesAt(p).forEach((type, t) => {
    const q = x[t].find(([value]) => value === v)?.[1] || 0;
    mass += type.prob * q;
    weight += type.prob * (q + TREMBLE);
    if (type.rank >= v) truth += type.prob * (q + TREMBLE);
  });
  return { mass, truth: truth / weight };
}

export function adviseModel(state, seat) {
  const result = (options, note = MODEL_NOTE) => {
    options.sort((x, y) => x.cost.e - y.cost.e || x.cost.p - y.cost.p);
    for (const option of options) {
      if (option.display == null) option.display = `${percent(option.cost.p)} to lose a life`;
      option.value = option.cost.e;
    }
    return { best: options[0].action, options, metric: MODEL_METRIC, exact: false, note };
  };
  if (state.phase === 'roll') return result([{ action: { type: 'roll' }, label: 'Roll', cost: NONE, display: '' }]);
  if (state.phase === 'reveal') return result([{ action: { type: 'next' }, label: 'Next round', cost: NONE, display: '' }]);
  const model = roundModel(state, seat);
  const { last, before } = claimRanks(state);
  if (state.phase === 'announce') {
    if (!state.dice || state.diceSeat !== seat) return null;
    const r = rank(valueOf(state.dice));
    return result(legalValues(last >= 0 ? RANKING[last] : null).map((value) => ({
      action: { type: 'announce', value },
      label: `Announce ${label(value)} (${rank(value) <= r ? 'truth' : 'bluff'})`,
      cost: model.option(last, r, rank(value)),
    })));
  }
  if (state.phase === 'decide' && state.claim) {
    const read = { truth: model.truthOf(before, last) };
    const call = model.callCost(read.truth, last);
    if (last === TOP) {
      const two = Math.min(2, state.lives[seat]) === 2;
      return result([
        { action: { type: 'call' }, label: 'Call', cost: call, display: `${percent(read.truth)} to lose ${two ? '2 lives' : 'your last life'}` },
        { action: { type: 'concede' }, label: 'Concede', cost: LOSE, display: 'Certain to lose a life' },
      ], `${MODEL_NOTE} Ranked by expected lives lost.`);
    }
    return result([
      { action: { type: 'call' }, label: 'Call bluff', cost: call },
      { action: { type: 'roll' }, label: 'Believe and roll', cost: model.mine(last) },
    ], `${MODEL_NOTE} The model reads this claim as ${percent(read.truth)} true.`);
  }
  return null;
}

const standing = (state) => state.lives.filter((lives) => lives > 0).length;

export function adviseWith(data, state, seat) {
  if (state.winner >= 0 || state.turn !== seat || !(state.lives[seat] > 0)) return null;
  if (standing(state) > 2) return adviseModel(state, seat);
  return data ? adviseDuel(data, state, seat) : null;
}

export async function advise(state, seat) {
  return adviseWith(standing(state) > 2 ? null : await loadTable(), state, seat);
}

// Hard plays the solver's choice. Where the heads-up equilibrium mixes, it draws the move at random
// with the equilibrium's chances (a fixed choice there could be exploited); elsewhere it plays the
// best move.
function pickMove(advice, rng) {
  if (!advice) return null;
  const mixed = advice.exact && advice.options.filter((option) => option.mix > MIXED);
  if (mixed && mixed.length > 1) {
    const total = mixed.reduce((sum, option) => sum + option.mix, 0);
    let draw = rng() * total;
    for (const option of mixed) {
      draw -= option.mix;
      if (draw < 0) return option.action;
    }
    return mixed[mixed.length - 1].action;
  }
  return advice.best;
}

export function bot(state, seat, level, rng) {
  if (level !== 'hard') {
    if (state.phase === 'roll') return { type: 'roll' };
    if (state.phase === 'reveal') return { type: 'next' };
    if (state.phase === 'announce') return announce(state, seat, level, rng);
    return decide(state, seat, level, rng);
  }
  if (state.phase === 'roll') return { type: 'roll' };
  if (state.phase === 'reveal') return { type: 'next' };
  if (table || standing(state) > 2) return pickMove(adviseWith(table, state, seat), rng) || classicBot(state, seat, rng);
  return loadTable().then(
    (data) => pickMove(adviseWith(data, state, seat), rng) || classicBot(state, seat, rng),
    () => classicBot(state, seat, rng),
  );
}

// ---------- Text ----------

export function resultText(state) {
  const result = state.result;
  if (!result) return '';
  const name = (seat) => state.names[seat];
  const lost = result.out
    ? (result.taken === 1 ? 'the last life' : `the last ${result.taken} lives`)
    : (result.taken === 1 ? 'a life' : plural(result.taken, 'life', 'lives'));
  if (result.kind === 'concede') return `${name(result.by)} conceded Mia and lost ${lost}.`;
  return `It was ${label(result.actual)}${result.truth ? '' : `, not ${label(result.claimed)}`}. ${name(result.loser)} lost ${lost}.`;
}

function status(state, seat, { canAct } = {}) {
  const name = (i) => state.names[i];
  const claim = state.claim;
  if (state.phase === 'roll') return canAct ? 'Your turn to open the round. Roll the dice.' : `${name(state.turn)} to open round ${state.round}.`;
  if (state.phase === 'decide') {
    if (canAct) return claim.value === MIA ? `${name(claim.seat)} announced Mia. Call or concede.` : `${name(claim.seat)} announced ${claim.value}. Call the bluff, or believe it and roll.`;
    return `${name(state.turn)} to decide on ${label(claim.value)}.`;
  }
  if (state.phase === 'announce') {
    if (canAct && state.dice) {
      const mine = valueOf(state.dice);
      if (!claim) return `You rolled ${label(mine)}. Announce any value.`;
      return rank(mine) > rank(claim.value)
        ? `You rolled ${label(mine)}. Announce more than ${label(claim.value)}.`
        : `You rolled ${label(mine)}, short of ${label(claim.value)}. Announce more anyway.`;
    }
    return `${name(state.turn)} to announce${claim ? ` more than ${label(claim.value)}` : ''}.`;
  }
  const text = resultText(state);
  if (state.winner >= 0) return text;
  return `${text} ${canAct ? 'Start the next round.' : `${name(state.turn)} to start the next round.`}`;
}

export const game = {
  id: 'mia',
  name: 'Mia',
  players: { min: 2, max: 6, default: 3 },
  hidden: true,
  options: [
    { id: 'lives', label: 'Lives', choices: [{ value: 3, label: '3' }, { value: 6, label: '6' }], default: 6 },
  ],
  setup,
  actor,
  apply,
  view,
  recover,
  bot,
  advise,
  sameAction: (a, b) => a?.type === b?.type && Number(a?.value ?? 0) === Number(b?.value ?? 0),
  needsPrivacy,
  revealLabel: 'Start my turn',
  pace: (state, action) => (action.type === 'next' ? 2800 : action.type === 'roll' && state.phase === 'roll' ? 900 : 1300),
  summary: (state, seat) => (state.lives[seat] > 0 ? plural(state.lives[seat], 'life', 'lives') : 'Out'),
  status,
  outcome: (state) => (state.winner >= 0
    ? { winners: [state.winner], text: `${state.names[state.winner]} won with ${plural(state.lives[state.winner], 'life', 'lives')} left.` }
    : null),
};
