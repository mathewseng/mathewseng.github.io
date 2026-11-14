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

// ---------- Turn values for the hard bot ----------
// V(t, k): the expected points a turn banks when it holds t and is about to
// choose between banking and rolling k dice, playing perfectly after that.
// Every roll's outcomes are dice multisets with multinomial weights; a keep is
// any valid set-aside (only the best score for each number of dice used
// matters, since V grows with t); a Farkle banks 0; hot dice roll six again.

export const STEP = 50;
export const CAP = 10000;
const SLOTS = CAP / STEP;

let rollTables = null;
function outcomeTables() {
  if (rollTables) return rollTables;
  rollTables = [null];
  for (let k = 1; k <= 6; k += 1) {
    const outcomes = diceOutcomes(k);
    const p = new Float64Array(outcomes.length);
    const best = new Int32Array(outcomes.length * 7); // best[o * 7 + used]: top score using `used` dice
    outcomes.forEach((outcome, o) => {
      p[o] = outcome.p;
      eachSubset(faceCounts(outcome.dice), (sub, used) => {
        const points = scoreCounts(sub);
        if (points > best[o * 7 + used]) best[o * 7 + used] = points;
      });
    });
    rollTables.push({ n: outcomes.length, p, best });
  }
  return rollTables;
}

function roller(tables, k, ti, value) {
  const { n, p, best } = tables[k];
  let total = 0;
  for (let o = 0; o < n; o += 1) {
    let q = 0; // a Farkle banks nothing
    for (let used = 1; used <= k; used += 1) {
      const points = best[o * 7 + used];
      if (!points) continue;
      const v = value(ti + points / STEP, used === k ? 6 : k - used);
      if (v > q) q = v;
    }
    total += p[o] * q;
  }
  return total;
}

// `floor`: the smallest turn total that may bank (the opening minimum, or a push when behind).
const valueTables = new Map();
export function valueTable(floor = 0) {
  if (valueTables.has(floor)) return valueTables.get(floor);
  const tables = outcomeTables();
  const V = new Float64Array((SLOTS + 1) * 7);
  const R = new Float64Array((SLOTS + 1) * 7);
  const value = (ti, k) => (ti >= SLOTS ? ti * STEP : V[ti * 7 + k]);
  for (let ti = SLOTS; ti >= 0; ti -= 1) {
    const t = ti * STEP;
    for (let k = 1; k <= 6; k += 1) {
      const r = ti === SLOTS ? t : roller(tables, k, ti, value);
      R[ti * 7 + k] = r;
      V[ti * 7 + k] = t > 0 && t >= floor ? Math.max(t, r) : r;
    }
  }
  const table = {
    floor,
    // Expected banked points from rolling k dice while holding t.
    roll: (t, k) => (t >= CAP ? t : R[(t / STEP) * 7 + k]),
    value: (t, k) => (t >= CAP ? t : V[(t / STEP) * 7 + k]),
  };
  valueTables.set(floor, table);
  if (valueTables.size > 24) valueTables.delete(valueTables.keys().next().value);
  return table;
}

// reach(d, k): the chance a turn gains at least d more points before a Farkle
// when about to roll k dice, choosing every keep for that chance. It depends
// only on the gap, so one table serves every final-round target.
const REACH_SLOTS = 400; // gaps up to 20,000
let reachSlots = null;
export function reachTable() {
  if (reachSlots) return reachSlots;
  const tables = outcomeTables();
  const P = new Float64Array((REACH_SLOTS + 1) * 7);
  const value = (di, k) => (di <= 0 ? 1 : P[di * 7 + k]);
  for (let di = 1; di <= REACH_SLOTS; di += 1) {
    for (let k = 1; k <= 6; k += 1) {
      const { n, p, best } = tables[k];
      let total = 0;
      for (let o = 0; o < n; o += 1) {
        let q = 0;
        for (let used = 1; used <= k; used += 1) {
          const points = best[o * 7 + used];
          if (!points) continue;
          const v = value(di - points / STEP, used === k ? 6 : k - used);
          if (v > q) q = v;
        }
        total += p[o] * q;
      }
      P[di * 7 + k] = total;
    }
  }
  reachSlots = { reach: (gap, k) => (gap <= 0 ? 1 : gap > REACH_SLOTS * STEP ? 0 : P[Math.ceil(gap / STEP) * 7 + k]) };
  return reachSlots;
}

// Banking a total at or past the target starts the final round, so its worth is
// the chance that no one else beats it in one turn. When rivals sit close, a
// bigger total is worth the risk: cross(t, k) compares banking with rolling on,
// from turn total t0 upward. `afterFarkle` is a rough chance to win anyway.
const CROSS_SLOTS = 60;
function crossTable(state, seat, t0, afterFarkle) {
  const { reach } = reachTable();
  const mine = state.scores[seat];
  const others = state.scores.filter((_, i) => i !== seat);
  const bankWins = (t) => others.reduce((chance, score) => chance * (1 - reach(mine + t - score + STEP, 6)), 1);
  const tables = outcomeTables();
  const V = new Float64Array((CROSS_SLOTS + 1) * 7);
  const R = new Float64Array((CROSS_SLOTS + 1) * 7);
  const value = (si, k) => (si >= CROSS_SLOTS ? bankWins(t0 + si * STEP) : V[si * 7 + k]);
  for (let si = CROSS_SLOTS; si >= 0; si -= 1) {
    const bank = bankWins(t0 + si * STEP);
    for (let k = 1; k <= 6; k += 1) {
      let r = bank;
      if (si < CROSS_SLOTS) {
        const { n, p, best } = tables[k];
        r = 0;
        for (let o = 0; o < n; o += 1) {
          let q = -1; // stays -1 on a Farkle
          for (let used = 1; used <= k; used += 1) {
            const points = best[o * 7 + used];
            if (points) q = Math.max(q, value(si + points / STEP, used === k ? 6 : k - used));
          }
          r += p[o] * (q < 0 ? afterFarkle : q);
        }
      }
      R[si * 7 + k] = r;
      V[si * 7 + k] = Math.max(bank, r);
    }
  }
  return {
    bank: bankWins,
    roll: (t, k) => {
      const si = (t - t0) / STEP;
      return si >= CROSS_SLOTS ? bankWins(t) : R[si * 7 + k];
    },
  };
}

// ---------- Bots ----------

const keep = (option, then) => ({ type: 'keep', dice: option.dice.slice(), then });
const round250 = (value) => Math.round(value / 250) * 250;

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

// Keeps the best (option, then) seen; a later choice must be strictly better, so banking wins ties.
function chooser() {
  let best = null;
  return {
    consider(option, then, v) {
      if (!best || v > best.v + 1e-9) best = { option, then, v };
    },
    move: () => keep(best.option, best.then),
  };
}

function hardMove(state, options, ctx) {
  const { t, k, mine, rival } = ctx;
  const left = (option) => (k - option.used) || 6;

  if (ctx.final) {
    const need = rival - mine + STEP; // turn points that beat the leader
    const winning = options.filter((option) => t + option.points >= need);
    if (winning.length) {
      if (ctx.lastToAct) return keep(winning[0], 'bank');
      // Others still play after this turn: a bigger lead is harder to beat.
      const table = valueTable(0);
      const pick = chooser();
      for (const option of winning) {
        const t2 = t + option.points;
        pick.consider(option, 'bank', t2);
        pick.consider(option, 'roll', table.roll(t2, left(option)));
      }
      return pick.move();
    }
    const { reach } = reachTable();
    let best = options[0];
    let bestP = -1;
    for (const option of options) {
      const p = reach(need - t - option.points, left(option));
      if (p > bestP + 1e-12) { best = option; bestP = p; }
    }
    return keep(best, 'roll');
  }

  // Far behind while a rival nears the target: only a bigger turn keeps the game alive.
  const scale = ctx.target / 10000;
  let floor = ctx.opening;
  if (rival >= ctx.target - 2000 * scale && rival - mine >= 1500 * scale) {
    floor = Math.max(floor, round250(Math.min((rival - mine) / 2, 2500 * scale)));
  }
  const table = valueTable(floor);
  const pick = chooser();
  for (const option of options) {
    const t2 = t + option.points;
    if (t2 >= floor) pick.consider(option, 'bank', t2);
    pick.consider(option, 'roll', table.roll(t2, left(option)));
  }
  return pick.move();
}

// Hard, once a bank would reach the target: bank unless the others are likely to
// beat that total on their final turns and rolling on wins more often.
function crossMove(state, seat, options, ctx) {
  const afterFarkle = 0.5 + 0.5 * Math.tanh((ctx.mine - ctx.rival) / 3000);
  const table = crossTable(state, seat, ctx.t, afterFarkle);
  const pick = chooser();
  for (const option of options) {
    const t2 = ctx.t + option.points;
    if (ctx.mine + t2 < ctx.target) continue;
    pick.consider(option, 'bank', table.bank(t2));
    pick.consider(option, 'roll', table.roll(t2, (ctx.k - option.used) || 6));
  }
  return pick.move();
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
  const bankAt = 300 + STEP * Math.floor(rng() * 3);
  return keep(top, t2 >= bankAt && t2 >= ctx.opening ? 'bank' : 'roll');
}

export function bot(state, seat, level, rng = Math.random) {
  if (state.phase !== 'choose') return { type: 'roll' };
  const options = scoringOptions(state.roll);
  const ctx = botContext(state, seat);
  const top = options[0];
  const crosses = !ctx.final && ctx.mine + ctx.t + top.points >= ctx.target && ctx.t + top.points >= ctx.opening;
  if (crosses && level === 'hard') return crossMove(state, seat, options, ctx);
  // Every other level banks a turn that reaches the target; all of them bank a final-round win.
  if (crosses) return keep(top, 'bank');
  if (ctx.final && ctx.lastToAct && ctx.mine + ctx.t + top.points > ctx.rival) return keep(top, 'bank');
  if (level === 'hard') return hardMove(state, options, ctx);
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
  pace: (state, action) => (action.type === 'roll' ? (state.last?.kind === 'farkle' ? 1500 : 800) : 1100),
  summary: (state, seat) => `${fmt(state.scores[seat])}${seat === state.turn && state.turnTotal && !state.winners ? ` +${fmt(state.turnTotal)}` : ''}`,
  status,
  outcome,
};
