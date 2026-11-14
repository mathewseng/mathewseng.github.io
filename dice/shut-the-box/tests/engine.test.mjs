import test from 'node:test';
import assert from 'node:assert/strict';
import {
  game, waysToShut, wayMasks, canRollOne, maskOf, tilesOf, openSum, tileText, FULL,
  expectedScore, winChance, solve, decisiveNeed, totals, advise, sameAction, turnGoal, scoreDistribution,
} from '../engine.mjs';
import { seededRng, clone } from '../../table-core.mjs';

// An rng that rolls the given faces in order.
const fixed = (...faces) => {
  let i = 0;
  return () => (faces[i++ % faces.length] - 1) / 6 + 0.01;
};

const start = (names = ['A', 'B'], rounds = 3, first = 0) => game.setup({ names, options: { rounds }, first });

// A state where `seat` is about to roll with only `tiles` open.
function withOpen(state, tiles) {
  const next = clone(state);
  next.open = maskOf(tiles);
  next.roll = 0;
  return next;
}

function playOut(state, levels, rng, onRoll = () => {}) {
  let guard = 0;
  while (!game.outcome(state)) {
    const seat = game.actor(state);
    const action = game.bot(game.view(state, seat), seat, levels[seat], rng);
    if (action.type === 'roll') onRoll(state, seat);
    state = game.apply(state, seat, action, rng);
    if ((guard += 1) > 10000) throw new Error('The game did not end.');
  }
  return state;
}

test('waysToShut lists every set of open tiles making the total', () => {
  assert.deepEqual(waysToShut(FULL, 9).map(tileText).sort(), ['8 and 1', '7 and 2', '6 and 3', '5 and 4', '4, 3 and 2', '5, 3 and 1', '6, 2 and 1', '9'].sort());
  assert.deepEqual(waysToShut(maskOf([1, 2, 4]), 3), [[1, 2]]);
  assert.deepEqual(waysToShut(maskOf([5, 6]), 4), []);
  assert.deepEqual(waysToShut(FULL, 13), []);
  assert.deepEqual(waysToShut(FULL, 0), []);
  // Brute force over every open mask and total.
  for (let mask = 0; mask < 512; mask += 1) {
    for (let total = 1; total <= 12; total += 1) {
      let count = 0;
      for (let set = 1; set < 512; set += 1) if ((set & mask) === set && openSum(set) === total) count += 1;
      const ways = waysToShut(mask, total);
      assert.equal(ways.length, count, `mask ${mask} total ${total}`);
      for (const tiles of ways) {
        assert.equal(tiles.reduce((a, b) => a + b, 0), total);
        assert.ok(tiles.every((n) => mask & (1 << (n - 1))));
      }
    }
  }
});

test('one die is allowed only once 7, 8 and 9 are shut', () => {
  assert.equal(canRollOne(FULL), false);
  assert.equal(canRollOne(maskOf([1, 2, 3, 4, 5, 6])), true);
  assert.equal(canRollOne(maskOf([1, 9])), false);
  assert.equal(canRollOne(maskOf([8])), false);
  assert.equal(canRollOne(0), false);

  const state = start();
  assert.throws(() => game.apply(state, 0, { type: 'roll', dice: 1 }, fixed(3)), /one die/);
  const late = withOpen(state, [1, 2, 6]);
  const next = game.apply(late, 0, { type: 'roll', dice: 1 }, fixed(3));
  assert.deepEqual(next.dice, [3]);
  assert.equal(next.roll, 3);
  assert.equal(next.rollId, late.rollId + 1);
  assert.match(game.status(late, 0, { canAct: true }), /one die or two/);
});

test('shutting tiles keeps the turn; a dead roll ends it with the open sum', () => {
  let state = start(['You', 'Pascal']);
  state = game.apply(state, 0, { type: 'roll' }, fixed(6, 3));
  assert.equal(state.roll, 9);
  assert.equal(state.rollId, 1);
  state = game.apply(state, 0, { type: 'shut', tiles: [6, 3] }, fixed(1));
  assert.equal(state.open, FULL & ~maskOf([6, 3]));
  assert.equal(state.roll, 0);
  assert.equal(game.actor(state), 0);
  assert.equal(state.log.at(-1).text, 'rolled 9 and shut 6 and 3.');

  // Only 5 and 6 open: a roll of 2 cannot be made.
  state = withOpen(state, [5, 6]);
  state = game.apply(state, 0, { type: 'roll' }, fixed(1, 1));
  assert.equal(state.rollId, 2);
  assert.equal(state.scores[0][0], 11);
  assert.deepEqual(state.last, { seat: 0, score: 11, shut: false, open: maskOf([5, 6]), round: 1 });
  assert.equal(state.log.at(-1).text, 'could not make 2 and scored 11.');
  assert.equal(game.actor(state), 1);
  assert.equal(state.open, FULL);
  assert.equal(state.roll, 0);
  assert.equal(state.turnRolls, 0);
  assert.equal(game.summary(state, 0), '11');
});

test('shutting the box scores 0 and is celebrated', () => {
  let state = withOpen(start(['Pascal', 'You']), [1, 3]);
  state = game.apply(state, 0, { type: 'roll' }, fixed(2, 2));
  state = game.apply(state, 0, { type: 'shut', tiles: [1, 3] }, fixed(1));
  assert.equal(state.scores[0][0], 0);
  assert.equal(state.last.shut, true);
  assert.deepEqual(state.log.slice(-2).map((entry) => entry.text), ['rolled 4 and shut 3 and 1.', 'shut the box!']);
  assert.equal(game.actor(state), 1);
  assert.equal(game.status(state, 1, { canAct: true }), 'Pascal shut the box! Your turn: roll the dice.');
});

test('rounds rotate the starting player and every player takes one turn a round', () => {
  const rng = seededRng(3);
  const openers = [];
  let lastRound = 0;
  const state = playOut(start(['A', 'B', 'C'], 3, 1), ['hard', 'normal', 'easy'], rng, (s, seat) => {
    if (s.round !== lastRound) { openers.push(seat); lastRound = s.round; }
  });
  assert.deepEqual(openers, [1, 2, 0]);
  assert.ok(state.scores.every((rounds) => rounds.length === 3 && rounds.every((score) => Number.isInteger(score))));
  assert.ok(state.log.some((entry) => entry.text.startsWith('After round 1: ')));
  assert.ok(state.log.some((entry) => entry.text.startsWith('Final totals: ')));
});

test('the lowest total wins and ties share the win', () => {
  // B to play the last turn of a one-round game after A scored 5.
  const base = start(['You', 'Pascal'], 1, 0);
  base.scores[0][0] = 5;
  base.played = 1;
  base.turn = 1;

  let tie = withOpen(base, [2, 3]);
  tie = game.apply(tie, 1, { type: 'roll' }, fixed(2, 2)); // 4 from {2, 3}: stuck on 5
  assert.deepEqual(game.outcome(tie).winners, [0, 1]);
  assert.equal(game.outcome(tie).text, 'You and Pascal tied on 5.');
  assert.equal(game.actor(tie), -1);

  let win = withOpen(base, [4]);
  win = game.apply(win, 1, { type: 'roll' }, fixed(1, 1));
  assert.deepEqual(game.outcome(win), { winners: [1], text: 'Pascal won with 4.' });

  let lose = withOpen(base, [1, 9]);
  lose = game.apply(lose, 1, { type: 'roll' }, fixed(2, 3));
  assert.deepEqual(game.outcome(lose), { winners: [0], text: 'You won with 5.' });
  assert.equal(lose.log.at(-1).text, 'You won with 5.');

  // A solo game has no winner, only a total.
  let solo = withOpen(start(['You'], 1), [6]);
  solo = game.apply(solo, 0, { type: 'roll' }, fixed(1, 1));
  assert.deepEqual(game.outcome(solo), { winners: [], text: 'You finished with 6.' });

  // Totals add up across rounds like golf.
  const golf = start(['A', 'B', 'C'], 3);
  golf.scores = [[3, 0, 9], [4, 4, 4], [12, 0, 0]];
  assert.deepEqual(totals(golf), [12, 12, 12]);
});

test('illegal moves throw and never mutate the state', () => {
  const state = start();
  const before = clone(state);
  assert.throws(() => game.apply(state, 1, { type: 'roll' }, fixed(4)), /not your turn/);
  assert.throws(() => game.apply(state, 0, { type: 'shut', tiles: [4] }, fixed(4)), /Roll before/);
  assert.throws(() => game.apply(state, 0, { type: 'roll', dice: 3 }, fixed(4)), /one die or two/);
  assert.throws(() => game.apply(state, 0, { type: 'roll', dice: 1 }, fixed(4)), /one die/);
  assert.throws(() => game.apply(state, 0, { type: 'hold' }, fixed(4)), /Unknown/);
  assert.throws(() => game.apply(state, 0, null, fixed(4)), /Unknown/);
  assert.deepEqual(state, before);

  const rolled = game.apply(state, 0, { type: 'roll' }, fixed(4, 3)); // 7
  const snapshot = clone(rolled);
  assert.throws(() => game.apply(rolled, 0, { type: 'roll' }, fixed(4)), /Shut tiles/);
  assert.throws(() => game.apply(rolled, 0, { type: 'shut', tiles: [6] }, fixed(4)), /add up to 7/);
  assert.throws(() => game.apply(rolled, 0, { type: 'shut', tiles: [3, 3, 1] }, fixed(4)), /once/);
  assert.throws(() => game.apply(rolled, 0, { type: 'shut', tiles: [] }, fixed(4)), /Choose tiles/);
  assert.throws(() => game.apply(rolled, 0, { type: 'shut', tiles: [10, -3] }, fixed(4)), /1 to 9/);
  assert.throws(() => game.apply(rolled, 0, { type: 'shut', tiles: ['7'] }, fixed(4)), /1 to 9/);
  assert.throws(() => game.apply(rolled, 1, { type: 'shut', tiles: [7] }, fixed(4)), /not your turn/);
  const shut = game.apply(rolled, 0, { type: 'shut', tiles: [7] }, fixed(4));
  assert.deepEqual(rolled, snapshot);
  const again = game.apply(shut, 0, { type: 'roll' }, fixed(5, 2)); // 7 again; tile 7 is shut
  assert.throws(() => game.apply(again, 0, { type: 'shut', tiles: [7] }, fixed(4)), /already shut/);

  const over = playOut(start(['A', 'B'], 1), ['hard', 'hard'], seededRng(2));
  assert.throws(() => game.apply(over, game.actor(over), { type: 'roll' }, fixed(4)), /over/);
});

test('exact play: expected score from the opening box', () => {
  const opening = expectedScore(FULL);
  // Checked independently with exact rational arithmetic: 11.0092 with the
  // one-die rule, 11.1575 with two dice only.
  console.log(`  expected final score with exact play: ${opening.toFixed(4)}`);
  assert.ok(Math.abs(opening - 11.009208593217634) < 1e-9);
  assert.equal(expectedScore(0), 0);
  // Tile 1 alone: one die shuts it 1 time in 6; two dice never can.
  assert.ok(Math.abs(expectedScore(maskOf([1])) - 5 / 6) < 1e-12);
  // Tile 2 alone: one die (5/3) beats two dice (70/36).
  assert.ok(Math.abs(expectedScore(maskOf([2])) - 5 / 3) < 1e-12);
  const state = withOpen(start(), [2]);
  assert.deepEqual(game.bot(state, 0, 'hard', fixed(1)), { type: 'roll', dice: 1 });
  // Open 7, 8 and 9 alone: two dice are forced.
  assert.deepEqual(game.bot(withOpen(start(), [1, 9]), 0, 'hard', fixed(1)), { type: 'roll', dice: 2 });
});

test('exact play for the win in the decisive last turn', () => {
  const two = Array.from({ length: 11 }, (_, i) => [i + 2, (6 - Math.abs(i + 2 - 7)) / 36]);
  const one = [1, 2, 3, 4, 5, 6].map((total) => [total, 1 / 6]);
  const expected = solve((score) => -score);
  // Win chance of the expected-score policy, evaluated exactly.
  const policyValue = (need) => {
    const utility = (score) => (score < need ? 1 : score === need ? 0.5 : 0);
    const value = new Float64Array(512);
    value[0] = utility(0);
    for (let mask = 1; mask < 512; mask += 1) {
      const useOne = canRollOne(mask) && expected.one[mask] > expected.two[mask] + 1e-12;
      value[mask] = (useOne ? one : two).reduce((total, [sum, p]) => {
        const ways = wayMasks(mask, sum);
        if (!ways.length) return total + p * utility(openSum(mask));
        const best = ways.reduce((a, b) => (expected.value[mask & ~b] > expected.value[mask & ~a] + 1e-12 ? b : a));
        return total + p * value[mask & ~best];
      }, 0);
    }
    return value[FULL];
  };
  for (let need = 0; need <= 45; need += 1) assert.ok(winChance(FULL, need) >= policyValue(need) - 1e-12, `need ${need}`);
  assert.ok(winChance(FULL, 8) - policyValue(8) > 0.005);

  // The last player of the last round knows the target exactly.
  const base = start(['You', 'Pascal'], 1, 0);
  base.scores[0][0] = 8;
  base.played = 1;
  base.turn = 1;
  assert.equal(decisiveNeed(base, 1), 8);
  assert.equal(decisiveNeed(start(['A', 'B'], 1, 0), 0), null); // A plays first: B is still to come
  assert.equal(decisiveNeed(start(['A'], 1, 0), 0), null);

  // Simulating the engine's hard bot from there matches the exact win chance.
  const rng = seededRng(21);
  let wins = 0;
  const games = 20000;
  for (let i = 0; i < games; i += 1) {
    const end = playOut(base, ['hard', 'hard'], rng);
    const winners = game.outcome(end).winners;
    if (winners.includes(1)) wins += winners.length === 1 ? 1 : 0.5;
  }
  const rate = wins / games;
  console.log(`  decisive turn needing under 8: won ${rate.toFixed(4)} (exact ${winChance(FULL, 8).toFixed(4)}, expected-score play ${policyValue(8).toFixed(4)})`);
  assert.ok(Math.abs(rate - winChance(FULL, 8)) < 0.015);
});

test('normal and easy bots follow their rules', () => {
  const state = start();
  const rolled = (tiles, total) => ({ ...withOpen(state, tiles), roll: total });
  assert.deepEqual(game.bot(rolled([1, 2, 3, 4, 5, 6, 7, 8, 9], 9), 0, 'normal', fixed(1)), { type: 'shut', tiles: [9] });
  assert.deepEqual(game.bot(rolled([1, 2, 3, 4, 5, 6, 7, 8], 9), 0, 'normal', fixed(1)), { type: 'shut', tiles: [1, 8] });
  assert.deepEqual(game.bot(rolled([1, 2, 3, 4, 6], 10), 0, 'normal', fixed(1)), { type: 'shut', tiles: [4, 6] });
  assert.deepEqual(game.bot(withOpen(state, [1, 2, 3]), 0, 'normal', fixed(1)), { type: 'roll', dice: 1 });
  assert.deepEqual(game.bot(withOpen(state, [1, 2, 4]), 0, 'normal', fixed(1)), { type: 'roll', dice: 2 });
  assert.deepEqual(game.bot(withOpen(state, [1, 2]), 0, 'easy', fixed(1)), { type: 'roll', dice: 2 });
  const rng = seededRng(4);
  const picks = new Set();
  for (let i = 0; i < 200; i += 1) {
    const action = game.bot(rolled([1, 2, 3, 4, 5, 6, 7, 8, 9], 9), 0, 'easy', rng);
    assert.ok(waysToShut(FULL, 9).some((tiles) => tiles.join() === action.tiles.join()));
    picks.add(action.tiles.join());
  }
  assert.equal(picks.size, 8);
  assert.equal(game.pace(state, { type: 'roll', dice: 2 }), 850);
  assert.equal(game.pace(state, { type: 'shut', tiles: [9] }), 1000);
});

test('full bot games terminate for every size and level', () => {
  const rng = seededRng(9);
  const levels = ['easy', 'normal', 'hard'];
  for (let players = 1; players <= 4; players += 1) {
    for (const rounds of [1, 3, 5]) {
      for (let i = 0; i < 6; i += 1) {
        const names = Array.from({ length: players }, (_, seat) => `P${seat}`);
        const seats = names.map((_, seat) => levels[(seat + i) % 3]);
        let rolls = 0;
        const end = playOut(start(names, rounds, i % players), seats, rng, () => { rolls += 1; });
        const outcome = game.outcome(end);
        assert.ok(outcome);
        assert.equal(end.rollId, rolls);
        assert.ok(end.scores.every((list) => list.length === rounds && list.every((score) => score >= 0 && score <= 45)));
        const sums = totals(end);
        if (players === 1) assert.deepEqual(outcome.winners, []);
        else assert.deepEqual(outcome.winners, sums.map((total, seat) => (total === Math.min(...sums) ? seat : -1)).filter((seat) => seat >= 0));
        assert.ok(!/\bwins\b/.test(outcome.text));
      }
    }
  }
});

test('levels are ordered: hard beats easy and edges normal', () => {
  const turnMean = (level) => {
    const rng = seededRng(5);
    let total = 0;
    for (let i = 0; i < 5000; i += 1) total += totals(playOut(start(['A'], 1), [level], rng))[0];
    return total / 5000;
  };
  const means = { easy: turnMean('easy'), normal: turnMean('normal'), hard: turnMean('hard') };
  console.log(`  mean turn score: easy ${means.easy.toFixed(2)}, normal ${means.normal.toFixed(2)}, hard ${means.hard.toFixed(2)}`);
  assert.ok(means.easy > means.normal && means.normal > means.hard);

  const duel = (levels, games, seed) => {
    const rng = seededRng(seed);
    const wins = [0, 0];
    let ties = 0;
    for (let i = 0; i < games; i += 1) {
      const winners = game.outcome(playOut(start(['A', 'B'], 3, i % 2), levels, rng)).winners;
      if (winners.length > 1) ties += 1; else wins[winners[0]] += 1;
    }
    return { wins, ties };
  };
  const easy = duel(['easy', 'hard'], 1000, 7);
  console.log(`  hard v easy over 1000 three-round games: hard ${easy.wins[1]}, easy ${easy.wins[0]}, ties ${easy.ties}`);
  assert.ok(easy.wins[1] / 1000 > 0.8);
  const normal = duel(['normal', 'hard'], 2000, 7);
  console.log(`  hard v normal over 2000 three-round games: hard ${normal.wins[1]}, normal ${normal.wins[0]}, ties ${normal.ties}`);
  assert.ok(normal.wins[1] > normal.wins[0]);
});

test('text reads correctly for a player called You', () => {
  let state = start(['You', 'Pascal'], 1, 0);
  assert.equal(state.log[0].text, '1 round; the lowest total wins. You to start.');
  assert.equal(game.status(state, 0, { canAct: true }), 'Your turn: roll the dice.');
  assert.equal(game.status(state, 1, { canAct: false }), 'You to roll.');
  state = game.apply(state, 0, { type: 'roll' }, fixed(5, 4));
  assert.equal(game.status(state, 0, { canAct: true }), 'Your turn: shut tiles adding up to 9.');
  assert.equal(game.status(state, 1, { canAct: false }), 'You to shut tiles for 9.');
  assert.deepEqual(tilesOf(maskOf([9, 1, 5])), [1, 5, 9]);
  assert.equal(start(['You'], 3).log[0].text, '3 rounds: aim for the lowest total.');
});

// ---------- Best move ----------

const EPS = 1e-12;
const TWO = Array.from({ length: 11 }, (_, i) => [i + 2, (6 - Math.abs(i + 2 - 7)) / 36]);
const ONE = [1, 2, 3, 4, 5, 6].map((total) => [total, 1 / 6]);
const expTable = solve((score) => -score);

// Tidy order as the engine breaks ties: fewest tiles, then the highest.
function tidy(a, b) {
  const ta = tilesOf(a).reverse();
  const tb = tilesOf(b).reverse();
  if (ta.length !== tb.length) return ta.length - tb.length;
  for (let i = 0; i < ta.length; i += 1) if (ta[i] !== tb[i]) return tb[i] - ta[i];
  return 0;
}

// A policy ranked by (win table, expected score, tidy), as the engine's hard bot ranks.
function rankedPolicy(win) {
  return {
    set(mask, total) {
      const ways = wayMasks(mask, total);
      if (!ways.length) return -1;
      return ways.reduce((best, set) => {
        const a = [win ? win.value[mask & ~set] : 0, expTable.value[mask & ~set]];
        const b = [win ? win.value[mask & ~best] : 0, expTable.value[mask & ~best]];
        if (Math.abs(a[0] - b[0]) > EPS) return a[0] > b[0] ? set : best;
        if (Math.abs(a[1] - b[1]) > EPS) return a[1] > b[1] ? set : best;
        return tidy(set, best) < 0 ? set : best;
      });
    },
    dice(mask) {
      if (!canRollOne(mask)) return 2;
      if (win && Math.abs(win.one[mask] - win.two[mask]) > EPS) return win.one[mask] > win.two[mask] ? 1 : 2;
      return expTable.one[mask] > expTable.two[mask] + EPS ? 1 : 2;
    },
  };
}

// The previous hard bot played for the lowest expected score, and on the decisive
// last turn exactly for the win against the score to beat.
const winNeed = new Map();
const needTable = (need) => {
  if (!winNeed.has(need)) winNeed.set(need, solve((score) => (score < need ? 1 : score === need ? 0.5 : 0)));
  return winNeed.get(need);
};
// Normal as a policy (it never looks past the box).
const normalPolicy = {
  set(mask, total) {
    const ways = wayMasks(mask, total);
    return ways.length ? mask & ~ways.slice().sort(tidy)[0] : -1;
  },
  dice: (mask) => (canRollOne(mask) && openSum(mask) <= 6 ? 1 : 2),
};
// The exact distribution of a turn's score from the full box under a policy.
function turnDist(policy) {
  const dist = Array.from({ length: 512 }, () => new Float64Array(46));
  dist[0][0] = 1;
  for (let mask = 1; mask < 512; mask += 1) {
    for (const [total, p] of policy.dice(mask) === 1 ? ONE : TWO) {
      const ways = wayMasks(mask, total);
      if (!ways.length) { dist[mask][openSum(mask)] += p; continue; }
      const rest = policy.set(mask, total);
      for (let s = 0; s < 46; s += 1) dist[mask][s] += p * dist[rest][s];
    }
  }
  return dist[FULL];
}

// rankedPolicy.set returns the remaining mask for the chosen set.
const remainingPolicy = (win) => {
  const ranked = rankedPolicy(win);
  return { dice: ranked.dice, set: (mask, total) => { const set = ranked.set(mask, total); return set < 0 ? -1 : mask & ~set; } };
};

// A synthetic two-player state at turn k with seat 0's total minus seat 1's equal to d.
function duelState(rounds, first, k, d) {
  const state = start(['A', 'B'], rounds, first);
  state.round = Math.floor(k / 2) + 1;
  state.played = k % 2;
  state.turn = (first + state.round - 1 + state.played) % 2;
  state.scores[0][0] = Math.max(d, 0);
  state.scores[1][0] = Math.max(-d, 0);
  return state;
}

// Exact chance that seat 0 wins a two-player match (ties half) when each seat
// follows a turn policy chosen from (state, seat).
function exactDuel(rounds, first, policies) {
  const memo = new Map();
  const distMemo = new Map();
  const order = [];
  for (let r = 0; r < rounds; r += 1) for (let i = 0; i < 2; i += 1) order.push((first + r + i) % 2);
  const value = (k, d) => {
    if (k === order.length) return d < 0 ? 1 : d === 0 ? 0.5 : 0;
    const key = `${k}|${d}`;
    if (memo.has(key)) return memo.get(key);
    const mover = order[k];
    const policyKey = policies[mover].key(rounds, first, k, d);
    const dk = `${mover}|${policyKey}`;
    if (!distMemo.has(dk)) distMemo.set(dk, turnDist(policies[mover].policy(rounds, first, k, d)));
    const dist = distMemo.get(dk);
    let total = 0;
    for (let s = 0; s < 46; s += 1) if (dist[s]) total += dist[s] * value(k + 1, mover === 0 ? d + s : d - s);
    memo.set(key, total);
    return total;
  };
  return value(0, 0);
}

const policies = {
  normal: { key: () => 'n', policy: () => normalPolicy },
  old: {
    key: (rounds, first, k, d) => { const st = duelState(rounds, first, k, d); return String(decisiveNeed(st, st.turn)); },
    policy: (rounds, first, k, d) => { const st = duelState(rounds, first, k, d); const need = decisiveNeed(st, st.turn); return remainingPolicy(need === null ? null : needTable(need)); },
  },
  hard: {
    key: (rounds, first, k, d) => { const goal = turnGoal(duelState(rounds, first, k, d), duelState(rounds, first, k, d).turn); return goal.kind === 'win' ? Array.from(goal.u, (x) => x.toPrecision(12)).join() : 'e'; },
    policy: (rounds, first, k, d) => { const st = duelState(rounds, first, k, d); const goal = turnGoal(st, st.turn); return remainingPolicy(goal.kind === 'win' ? solve((score) => goal.u[score]) : null); },
  },
};

// Seat-averaged exact win share of `a` against `b` (each opens half the matches).
const matchShare = (a, b, rounds) => (exactDuel(rounds, 0, [policies[a], policies[b]]) + 1 - exactDuel(rounds, 0, [policies[b], policies[a]])) / 2;

test('best move: options are every legal move, ranked, and hard plays the best', () => {
  const rng = seededRng(31);
  let checked = 0;
  for (const names of [['You'], ['You', 'B'], ['You', 'B', 'C'], ['You', 'B', 'C', 'D']]) {
    for (let g = 0; g < 4; g += 1) {
      let state = start(names, 3, g % names.length);
      while (!game.outcome(state)) {
        const seat = game.actor(state);
        const advice = game.advise(game.view(state, seat), seat);
        assert.equal(advice.exact, names.length < 3 || (state.round === state.rounds && state.played === names.length - 1) || advice.metric === 'Expected total left open');
        if (state.roll > 0) {
          const ways = waysToShut(state.open, state.roll);
          assert.equal(advice.options.length, ways.length);
          assert.deepEqual(advice.options.map((o) => o.action.tiles.join()).sort(), ways.map((t) => t.join()).sort());
          for (const o of advice.options) {
            assert.equal(o.label, `Shut ${tileText(o.action.tiles)}`);
            game.apply(state, seat, o.action, rng); // legal
          }
        } else {
          assert.deepEqual(advice.options.map((o) => o.label).sort(), (canRollOne(state.open) ? ['Roll one die', 'Roll two dice'] : ['Roll two dice']).sort());
        }
        // Ranked best first by the metric, and the display matches it.
        const key = advice.metric === 'Expected total left open' ? (o) => -o.expected : (o) => o.win;
        for (let i = 1; i < advice.options.length; i += 1) assert.ok(key(advice.options[i - 1]) >= key(advice.options[i]) - EPS);
        for (const o of advice.options) assert.match(o.display, advice.metric === 'Expected total left open' ? /^Expected \d+\.\d\d left$/ : /^\d+\.\d% to win$/);
        assert.deepEqual(advice.best, advice.options[0].action);
        const action = game.bot(state, seat, 'hard', rng);
        assert.ok(sameAction(action, advice.best));
        state = game.apply(state, seat, action, rng);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 200);
  assert.equal(game.advise, advise);
  assert.equal(game.sameAction, sameAction);
  assert.ok(sameAction({ type: 'shut', tiles: [6, 3] }, { type: 'shut', tiles: [3, 6] }));
  assert.ok(!sameAction({ type: 'shut', tiles: [9] }, { type: 'shut', tiles: [5, 4] }));
  assert.ok(sameAction({ type: 'roll' }, { type: 'roll', dice: 2 }));
  assert.ok(!sameAction({ type: 'roll', dice: 1 }, { type: 'roll', dice: 2 }));
  assert.equal(advise({ ...start(), over: true }, 0), null);
  assert.equal(advise(start(), 1), null); // not seat 1's turn
});

test('best move: hand-checked positions', () => {
  // Solo, full box: expected 11.0092 left.
  const solo = start(['You'], 1);
  let advice = advise(solo, 0);
  assert.equal(advice.metric, 'Expected total left open');
  assert.equal(advice.exact, true);
  assert.deepEqual(advice.options.map((o) => [o.label, o.display]), [['Roll two dice', 'Expected 11.01 left']]);
  assert.ok(Math.abs(advice.options[0].expected - 11.009208593217634) < 1e-9);

  // Solo, tile 2 alone: one die leaves 5/3, two dice 70/36.
  advice = advise(withOpen(solo, [2]), 0);
  assert.deepEqual(advice.options.map((o) => [o.label, o.display]), [['Roll one die', 'Expected 1.67 left'], ['Roll two dice', 'Expected 1.94 left']]);

  // Solo, full box, rolled 9: shutting the 9 is best, and every option is listed.
  advice = advise({ ...solo, roll: 9 }, 0);
  assert.equal(advice.options[0].label, 'Shut 9');
  assert.equal(advice.options.length, 8);
  assert.ok(Math.abs(advice.options[0].expected - expectedScore(FULL & ~maskOf([9]))) < 1e-12);

  // Last turn of a duel, tiles 1 and 2 open, tied at 3 if stuck.
  // One die: a 1, 2 or 3 wins (1/2), otherwise a tie: 3/4. Two dice: 2 or 3 wins (3/36), else a tie: 13/24.
  const last = start(['A', 'You'], 1, 0);
  last.scores[0][0] = 3;
  last.played = 1;
  last.turn = 1;
  advice = advise(withOpen(last, [1, 2]), 1);
  assert.equal(advice.metric, 'Chance to win the match');
  assert.equal(advice.exact, true);
  assert.deepEqual(advice.options.map((o) => [o.label, o.display]), [['Roll one die', '75.0% to win'], ['Roll two dice', '54.2% to win']]);
  assert.ok(Math.abs(advice.options[1].win - 13 / 24) < 1e-12);

  // The last turn matches the decisive-turn table for every target.
  for (let need = 0; need <= 45; need += 1) {
    const st = start(['A', 'You'], 1, 0);
    st.scores[0][0] = need;
    st.played = 1;
    st.turn = 1;
    const a = advise(st, 1);
    if (a.metric === 'Chance to win the match') assert.ok(Math.abs(a.options[0].win - winChance(FULL, need)) < 1e-12, `need ${need}`);
  }

  // A one-round duel's opener faces the reply's exact chances: max E[1 - winChance(FULL, s)].
  const opener = advise(start(['You', 'B'], 1, 0), 0);
  const direct = solve((score) => 1 - winChance(FULL, score)).value[FULL];
  assert.ok(Math.abs(opener.options[0].win - direct) < 1e-12);
  assert.ok(opener.options[0].win < 0.5); // moving first is a disadvantage

  // A match already decided falls back to the lowest expected score.
  const far = start(['A', 'You'], 3, 0);
  far.scores = [[0, 0, null], [45, 45, null]];
  far.round = 3;
  far.played = 0;
  far.turn = 0;
  advice = advise(far, 0); // A has already won
  assert.equal(advice.metric, 'Expected total left open');
  assert.match(advice.note, /same chance to win \(100\.0%\)/);

  // The turn-score distribution of expected-score play has mean 11.0092.
  const dist = scoreDistribution(expTable);
  assert.ok(Math.abs(dist.reduce((t, p, score) => t + p * score, 0) - 11.009208593217634) < 1e-9);
  assert.ok(dist.every((p, score) => Math.abs(p - turnDist(remainingPolicy(null))[score]) < 1e-12));

  // Three players before the last turn: an estimate.
  advice = advise(start(['You', 'B', 'C'], 3, 0), 0);
  assert.equal(advice.exact, false);
  assert.match(advice.note, /^Estimate/);
});

test('best move: the duel solver checks out by simulation', () => {
  // One-round duel, both seats hard: seat 0 should win at the solver's value.
  const value = advise(start(['A', 'B'], 1, 0), 0).options[0].win;
  const rng = seededRng(41);
  let wins = 0;
  const games = 20000;
  for (let i = 0; i < games; i += 1) {
    const winners = game.outcome(playOut(start(['A', 'B'], 1, 0), ['hard', 'hard'], rng)).winners;
    if (winners.includes(0)) wins += 1 / winners.length;
  }
  console.log(`  one-round duel opener: simulated ${(wins / games).toFixed(4)}, solver ${value.toFixed(4)}`);
  assert.ok(Math.abs(wins / games - value) < 0.012);
  // Exact evaluation of hard against itself reproduces the solver's value.
  assert.ok(Math.abs(exactDuel(1, 0, [policies.hard, policies.hard]) - value) < 1e-9);
  assert.ok(Math.abs(exactDuel(3, 0, [policies.hard, policies.hard]) - advise(start(['A', 'B'], 3, 0), 0).options[0].win) < 1e-9);
});

test('best move: hard is at least as strong as the previous hard (exact duels)', () => {
  // The previous hard as a bot agrees with its policy form.
  const rng = seededRng(51);
  let state = start(['A', 'B'], 1, 0);
  while (!game.outcome(state)) {
    const seat = game.actor(state);
    const need = decisiveNeed(state, seat);
    const policy = remainingPolicy(need === null ? null : needTable(need));
    const action = state.roll > 0
      ? { type: 'shut', tiles: tilesOf(state.open & ~policy.set(state.open, state.roll)) }
      : { type: 'roll', dice: policy.dice(state.open) };
    state = game.apply(state, seat, action, rng);
  }
  for (const rounds of [1, 3, 5]) {
    const newOld = matchShare('hard', 'old', rounds);
    const newNormal = matchShare('hard', 'normal', rounds);
    const oldNormal = matchShare('old', 'normal', rounds);
    console.log(`  ${rounds} round${rounds > 1 ? 's' : ''}, exact match share: hard v previous hard ${(100 * newOld).toFixed(3)}%, hard v normal ${(100 * newNormal).toFixed(3)}%, previous hard v normal ${(100 * oldNormal).toFixed(3)}%`);
    assert.ok(newOld >= 0.5 - 1e-12);
    assert.ok(newNormal > 0.5);
    assert.ok(newNormal >= oldNormal - 1e-12);
  }
});
