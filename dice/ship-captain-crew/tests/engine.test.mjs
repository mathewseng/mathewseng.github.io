import test from 'node:test';
import assert from 'node:assert/strict';
import { game, setAside, roundWinners, cargoOf, advise, sameAction, solveTurn, roundGame, matchGame, matchTractable, qualified } from '../engine.mjs';
import { seededRng } from '../../table-core.mjs';

// An rng that throws the given faces in order.
const fixed = (...faces) => {
  let i = 0;
  return () => (faces[i++ % faces.length] - 1) / 6 + 0.01;
};

const start = (players = 2, first = 0, target = 3) =>
  game.setup({ names: Array.from({ length: players }, (_, i) => `P${i}`), options: { target }, first });

// Plays one seat's whole turn: each entry is a roll's faces, or 'stand'.
function turn(state, seat, steps) {
  let next = state;
  for (const step of steps) {
    if (step === 'stand') next = game.apply(next, seat, { type: 'stand' }, fixed(1));
    else next = game.apply(next, seat, { type: 'roll', reroll: step.reroll || [] }, fixed(...(step.faces || step)));
  }
  return next;
}

const miss = [[1, 1, 1, 1, 1], [1, 1, 1, 1, 1], [1, 1, 1, 1, 1]];
const load = (a, b) => [[6, 5, 4, a, b], 'stand'];

test('a 5 or 4 only stays once the roles before it are in', () => {
  assert.deepEqual(setAside(0, [5, 4, 3, 2, 1]), { stage: 0, dice: [5, 4, 3, 2, 1], took: [] });
  assert.deepEqual(setAside(0, [4, 6, 2, 5, 1]), { stage: 3, dice: [2, 1], took: [0, 1, 2] });
  assert.deepEqual(setAside(1, [4, 4, 2, 3]), { stage: 1, dice: [4, 4, 2, 3], took: [] });

  let state = start();
  state = game.apply(state, 0, { type: 'roll' }, fixed(5, 4, 2, 2, 1));
  assert.equal(state.stage, 0);
  assert.equal(state.dice.length, 5);
  state = game.apply(state, 0, { type: 'roll' }, fixed(6, 6, 3, 2, 1));
  assert.equal(state.stage, 1);
  assert.deepEqual(state.dice, [6, 3, 2, 1], 'the second 6 stays in play');
  state = game.apply(state, 0, { type: 'roll' }, fixed(4, 5, 6, 6));
  assert.equal(game.actor(state), 1, 'the third roll ends the turn');
  assert.equal(state.cargos[0], 12, 'the extra 6s are the cargo');
});

test('ship, captain and crew in one roll are all set aside', () => {
  const state = game.apply(start(), 0, { type: 'roll' }, fixed(3, 4, 5, 6, 2));
  assert.equal(state.stage, 3);
  assert.deepEqual(state.dice, [3, 2]);
  assert.equal(cargoOf(state), 5);
  assert.deepEqual(state.freshSlots, [0, 1, 2]);
  assert.equal(game.actor(state), 0, 'with rolls left the player chooses');
});

test('cargo scores its sum and missing the crew scores 0', () => {
  let state = turn(start(), 0, load(6, 3));
  assert.equal(state.cargos[0], 9);
  assert.match(state.log.at(-1).text, /loaded 9 cargo/);
  state = turn(state, 1, [[6, 5, 1, 1, 1], [3, 3, 3], [2, 2, 2]]);
  assert.equal(state.rounds[0].cargos[1], 0);
  assert.match(state.log.find((entry) => entry.seat === 1).text, /missed the crew/);
});

test('partial rerolls change only the chosen cargo dice', () => {
  let state = game.apply(start(), 0, { type: 'roll' }, fixed(6, 5, 4, 2, 6));
  assert.deepEqual(state.dice, [2, 6]);
  const before = state.rollId;
  state = game.apply(state, 0, { type: 'roll', reroll: [0] }, fixed(5));
  assert.deepEqual(state.dice, [5, 6]);
  assert.deepEqual(state.fresh, [0]);
  assert.equal(state.rollId, before + 1);
  assert.equal(game.actor(state), 0);
  state = game.apply(state, 0, { type: 'roll', reroll: [1] }, fixed(1));
  assert.equal(game.actor(state), 1, 'the third roll ends the turn');
  assert.equal(state.cargos[0], 6);
  assert.deepEqual(state.last.dice, [5, 1]);
});

test('the turn ends by itself after the third roll', () => {
  let state = turn(start(3), 0, miss);
  assert.equal(state.cargos[0], 0);
  assert.equal(game.actor(state), 1);
  assert.equal(state.rolls, 0);
  assert.equal(state.stage, 0);
  assert.equal(state.rollId, 3);
  state = turn(state, 1, [[1, 1, 1, 1, 1], [1, 1, 1, 1, 1], [6, 5, 4, 3, 3]]);
  assert.equal(state.cargos[1], 6, 'loading on the last roll scores at once');
  assert.equal(game.actor(state), 2);
});

test('the best cargo takes the round; ties share it and all-zero rounds go to nobody', () => {
  assert.deepEqual(roundWinners([9, 7, 9]), [0, 2]);
  assert.deepEqual(roundWinners([0, 0, 0]), []);
  assert.deepEqual(roundWinners([0, 4, 0]), [1]);

  let state = start(3);
  state = turn(state, 0, load(5, 4));
  state = turn(state, 1, load(3, 3));
  state = turn(state, 2, load(6, 3));
  assert.deepEqual(state.rounds[0].winners, [0, 2]);
  assert.deepEqual(state.wins, [1, 0, 1]);
  assert.match(state.log.at(-1).text, /P0 and P2 shared round 1 with 9/);

  state = turn(state, 1, miss);
  state = turn(state, 2, miss);
  state = turn(state, 0, miss);
  assert.deepEqual(state.rounds[1].winners, []);
  assert.deepEqual(state.wins, [1, 0, 1]);
  assert.match(state.log.at(-1).text, /nobody loaded cargo/);
});

test('the round starter rotates and every seat plays once a round', () => {
  let state = start(3, 1);
  assert.equal(game.actor(state), 1);
  state = turn(state, 1, miss);
  state = turn(state, 2, miss);
  state = turn(state, 0, miss);
  assert.equal(state.round, 2);
  assert.equal(state.starter, 2);
  assert.equal(game.actor(state), 2);
  assert.deepEqual(state.cargos, [null, null, null]);
  state = turn(state, 2, miss);
  state = turn(state, 0, miss);
  state = turn(state, 1, miss);
  assert.equal(state.starter, 0);
  assert.equal(game.actor(state), 0);
});

test('the first to the target takes the match; a shared finish is shared', () => {
  let state = start(2, 0, 3);
  for (let round = 0; round < 3; round += 1) {
    for (const seat of round % 2 ? [1, 0] : [0, 1]) state = turn(state, seat, seat === 0 ? load(6, 6) : load(1, 1));
  }
  assert.deepEqual(game.outcome(state).winners, [0]);
  assert.equal(game.outcome(state).text, 'P0 took the match 3–0.');
  assert.equal(game.actor(state), -1);
  assert.throws(() => game.apply(state, 0, { type: 'roll' }, fixed(1)));

  state = start(2, 0, 3);
  state.wins = [2, 2];
  state = turn(state, 0, load(4, 4));
  state = turn(state, 1, load(5, 3));
  assert.deepEqual(game.outcome(state).winners, [0, 1]);
  assert.match(game.outcome(state).text, /P0 and P1 shared the match with 3 round wins each/);
});

test('illegal moves throw and never change the state', () => {
  const state = start();
  const snapshot = JSON.stringify(state);
  assert.throws(() => game.apply(state, 1, { type: 'roll' }, fixed(1)), /not your turn/);
  assert.throws(() => game.apply(state, 0, { type: 'stand' }, fixed(1)), /before you stand/);
  assert.throws(() => game.apply(state, 0, { type: 'fly' }, fixed(1)));
  assert.equal(JSON.stringify(state), snapshot);

  const loaded = game.apply(state, 0, { type: 'roll' }, fixed(6, 5, 4, 2, 3));
  const loadedSnapshot = JSON.stringify(loaded);
  assert.throws(() => game.apply(loaded, 0, { type: 'roll', reroll: [2] }, fixed(1)), /stay set aside/);
  assert.throws(() => game.apply(loaded, 0, { type: 'roll', reroll: [] }, fixed(1)), /Choose cargo/);
  assert.throws(() => game.apply(loaded, 0, { type: 'roll', reroll: [-1] }, fixed(1)));
  assert.equal(JSON.stringify(loaded), loadedSnapshot);

  const spent = { ...loaded, rolls: 3 };
  assert.throws(() => game.apply(spent, 0, { type: 'roll', reroll: [0] }, fixed(1)), /No rolls left/);
  const third = turn(state, 0, miss);
  assert.throws(() => game.apply(third, 0, { type: 'roll' }, fixed(1)), /not your turn/, 'no fourth roll');
});

// Independent brute force for one turn: plain expectimax over every throw, no shared tables.
function bruteTurn(u) {
  const memo = new Map();
  const loaded = (a, b, k) => {
    const key = `l${Math.min(a, b)}${Math.max(a, b)}${k}`;
    if (memo.has(key)) return memo.get(key);
    let best = u[a + b];
    if (k > 0) {
      let one = 0;
      let other = 0;
      let both = 0;
      for (let f = 1; f <= 6; f += 1) {
        one += loaded(f, b, k - 1) / 6;
        other += loaded(a, f, k - 1) / 6;
        for (let g = 1; g <= 6; g += 1) both += loaded(f, g, k - 1) / 36;
      }
      best = Math.max(best, one, other, both);
    }
    memo.set(key, best);
    return best;
  };
  const open = (stage, k) => {
    if (k === 0) return u[0];
    const key = `o${stage}${k}`;
    if (memo.has(key)) return memo.get(key);
    const count = 5 - stage;
    let total = 0;
    for (let code = 0; code < 6 ** count; code += 1) {
      const dice = [];
      for (let i = 0, c = code; i < count; i += 1, c = Math.floor(c / 6)) dice.push((c % 6) + 1);
      const result = setAside(stage, dice);
      total += (result.stage === 3 ? loaded(result.dice[0], result.dice[1], k - 1) : open(result.stage, k - 1)) / 6 ** count;
    }
    memo.set(key, total);
    return total;
  };
  return { loaded, open };
}

// A state with the given cargos posted and `seat` to act with ship, captain and crew aboard.
function loadedAt(players, cargos, seat, dice, rollsLeft, target = 3) {
  const state = start(players, 0, target);
  state.cargos = cargos.slice();
  state.turn = seat;
  state.stage = 3;
  state.dice = dice.slice();
  state.rolls = 3 - rollsLeft;
  return state;
}

const valueOf = (advice, action) => advice.options.find((option) => sameAction(option.action, action)).p;

test('the turn solver matches a brute-force expectimax', () => {
  const utilities = [
    Array.from({ length: 13 }, (_, c) => (c > 8 ? 1 : c === 8 ? 0.5 : 0)),
    Array.from({ length: 13 }, (_, c) => c / 12),
    Array.from({ length: 13 }, (_, c) => (c ? Math.sin(c) ** 2 : 0.3)),
  ];
  for (const u of utilities) {
    const fast = solveTurn(u);
    const slow = bruteTurn(u);
    assert.ok(Math.abs(fast.value - slow.open(0, 3)) < 1e-12);
    for (const stage of [0, 1, 2]) for (let k = 1; k <= 3; k += 1) assert.ok(Math.abs(fast.open[k][stage] - slow.open(stage, k)) < 1e-12);
    // The forward distribution reproduces the value.
    const dist = [...fast.dist];
    assert.ok(Math.abs(dist.reduce((a, b) => a + b, 0) - 1) < 1e-12);
    assert.ok(Math.abs(dist.reduce((a, p, c) => a + p * u[c], 0) - fast.value) < 1e-12);
  }
});

test('advice lists every legal move once, ranked, with exact round chances', () => {
  // Last to act, needing to beat 10 with one roll left: only rerolling both can get there.
  const need = loadedAt(3, [10, 5, null], 2, [1, 2], 1);
  const advice = advise(need, 2, 'round');
  assert.equal(advice.exact, true);
  assert.equal(advice.metric, 'Chance to win the round');
  assert.deepEqual(advice.best, { type: 'roll', reroll: [0, 1] });
  // 11 or 12 wins outright; 10 ties two ways and counts as half a win.
  assert.ok(Math.abs(advice.options[0].p - (3 / 36 + 0.5 * 3 / 36)) < 1e-12);
  assert.equal(advice.options[0].display, '12.5% to win the round');
  assert.equal(valueOf(advice, { type: 'stand' }), 0);
  assert.equal(advice.options.length, 4);
  for (const option of advice.options) game.apply(need, 2, option.action, fixed(3)); // all legal
  for (let i = 1; i < advice.options.length; i += 1) assert.ok(advice.options[i - 1].p >= advice.options[i].p);

  // Standing on 12 as the last player is a sure round.
  const top = loadedAt(3, [9, 11, null], 2, [6, 6], 2);
  const topAdvice = advise(top, 2, 'round');
  assert.deepEqual(topAdvice.best, { type: 'stand' });
  assert.equal(topAdvice.options[0].p, 1);
  assert.equal(topAdvice.options[0].display, '100.0% to win the round');
  assert.equal(topAdvice.options.length, 3, 'two equal dice give one single-die reroll');
  assert.ok(topAdvice.options.some((option) => option.label === 'Reroll one 6'));

  // Last player one short of a tie with two rolls left: keep the 6, reroll the 2.
  const short = loadedAt(3, [9, 4, null], 2, [6, 2], 2);
  assert.deepEqual(advise(short, 2, 'round').best, { type: 'roll', reroll: [1] });

  // Before the crew is in there is one move, and its value is the turn's.
  const fresh = start(2);
  const opening = advise(fresh, 0, 'round');
  assert.equal(opening.options.length, 1);
  assert.deepEqual(opening.best, { type: 'roll', reroll: [] });
  assert.equal(opening.options[0].label, 'Roll 5 dice');
  // After the first seat misses, any cargo wins: the chance is just loading at all.
  const second = start(2);
  second.cargos = [0, null];
  second.turn = 1;
  const load = advise(second, 1, 'round').options[0].p;
  assert.ok(Math.abs(load - bruteTurn([0, ...Array(12).fill(1)]).open(0, 3)) < 1e-12);
  assert.ok(Math.abs(load - 0.54) < 0.001, `loads ${load}`);

  assert.equal(advise(game.apply(fresh, 0, { type: 'roll' }, fixed(1)), 1), null, 'not your turn');
});

test('the first player meets later players who answer at their best', () => {
  // Heads-up round, first seat standing on c: the second seat plays to beat c
  // and takes half a win on a tie, so the stand is worth 1 − P(beat) − ½·P(tie).
  for (const c of [5, 8, 10, 12]) {
    const u = Array.from({ length: 13 }, (_, x) => (x > c ? 1 : x === c ? 0.5 : 0));
    const answer = solveTurn(u);
    const expected = 1 - answer.dist.slice(c + 1).reduce((a, b) => a + b, 0) - 0.5 * answer.dist[c];
    const [a, b] = c === 5 ? [1, 4] : c === 8 ? [4, 4] : c === 10 ? [4, 6] : [6, 6];
    const advice = advise(loadedAt(2, [null, null], 0, [a, b], 1), 0, 'round');
    assert.ok(Math.abs(valueOf(advice, { type: 'stand' }) - expected) < 1e-12, `stand on ${c}`);
  }
});

// Plays the rest of a match (or just the round) with every seat on hard.
function finish(state, rng, roundOnly) {
  const round = state.round;
  let next = state;
  while (!game.outcome(next) && !(roundOnly && next.round !== round)) {
    const seat = game.actor(next);
    next = game.apply(next, seat, game.bot(game.view(next, seat), seat, 'hard', rng), rng);
  }
  return next;
}

test('backward induction agrees with simulation', (t) => {
  const rng = seededRng(23);
  const runs = 20000;
  // Round level on a table too big for the match solver.
  const big = loadedAt(5, [null, null, 7, null, null], 3, [3, 4], 2);
  big.starter = 2;
  assert.equal(matchTractable(5, 3), false);
  const roundAdvice = advise(big, 3);
  assert.equal(roundAdvice.scope, 'round');
  let share = 0;
  for (let i = 0; i < runs; i += 1) {
    const done = finish(big, rng, true);
    const { winners } = done.rounds.at(-1);
    if (winners.includes(3)) share += 1 / winners.length;
  }
  t.diagnostic(`round: simulated ${(share / runs).toFixed(4)}, solved ${roundAdvice.options[0].p.toFixed(4)}`);
  assert.ok(Math.abs(share / runs - roundAdvice.options[0].p) < 0.012, `round: simulated ${share / runs}, solved ${roundAdvice.options[0].p}`);

  // Match level, heads-up to 3 from 1–2 down.
  const behind = loadedAt(2, [null, null], 0, [2, 5], 2);
  behind.wins = [1, 2];
  const matchAdvice = advise(behind, 0);
  assert.equal(matchAdvice.scope, 'match');
  assert.match(matchAdvice.options[0].display, /to win the match$/);
  share = 0;
  for (let i = 0; i < runs; i += 1) {
    const { winners } = game.outcome(finish(behind, rng, false));
    if (winners.includes(0)) share += 1 / winners.length;
  }
  t.diagnostic(`match: simulated ${(share / runs).toFixed(4)}, solved ${matchAdvice.options[0].p.toFixed(4)}`);
  assert.ok(Math.abs(share / runs - matchAdvice.options[0].p) < 0.012, `match: simulated ${share / runs}, solved ${matchAdvice.options[0].p}`);

  // Match values from the start add up to one (every match ends with someone).
  for (const [n, target] of [[2, 3], [3, 3], [2, 5]]) {
    const values = matchGame(n, target).value(Array(n).fill(0), 0);
    assert.ok(Math.abs(values.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  }
  const round = roundGame(3).value(0, 0, 0);
  assert.ok(round[0] < round[1] && round[1] < round[2], 'later seats see more and win more rounds');
});

test('hard plays the best move and the same moves compare equal', () => {
  const rng = seededRng(7);
  for (let i = 0; i < 300; i += 1) {
    const players = 2 + (i % 5);
    let state = game.setup({ names: Array.from({ length: players }, (_, s) => `P${s}`), options: { target: 3 }, first: i % players });
    for (let moves = rng() * 12; moves > 0 && !game.outcome(state); moves -= 1) {
      const seat = game.actor(state);
      state = game.apply(state, seat, game.bot(state, seat, 'normal', rng), rng);
    }
    if (game.outcome(state)) continue;
    const seat = game.actor(state);
    const advice = advise(state, seat);
    assert.deepEqual(game.bot(state, seat, 'hard', rng), advice.best);
    assert.ok(advice.options.length === (qualified(state) ? (state.dice[0] === state.dice[1] ? 3 : 4) : 1));
    for (const option of advice.options) {
      assert.match(option.display, /^\d+\.\d% to win the (round|match)$/);
      assert.doesNotThrow(() => game.apply(state, seat, option.action, rng));
    }
  }
  assert.ok(sameAction({ type: 'roll', reroll: [1, 0] }, { type: 'roll', reroll: [0, 1, 1] }));
  assert.ok(!sameAction({ type: 'roll', reroll: [0] }, { type: 'roll', reroll: [1] }));
  assert.ok(sameAction({ type: 'roll', reroll: [0], either: true }, { type: 'roll', reroll: [1] }), 'either of two equal dice');
  assert.ok(!sameAction({ type: 'roll', reroll: [0], either: true }, { type: 'roll', reroll: [0, 1] }));
  assert.ok(!sameAction({ type: 'stand' }, { type: 'roll', reroll: [0] }));
  assert.ok(sameAction({ type: 'roll' }, { type: 'roll', reroll: [] }));
});

test('normal and easy follow their thresholds', () => {
  const at = (a, b) => game.apply(start(2), 0, { type: 'roll' }, fixed(6, 5, 4, a, b));
  assert.deepEqual(game.bot(at(4, 4), 0, 'normal', fixed(1)), { type: 'stand' });
  assert.deepEqual(game.bot(at(6, 1), 0, 'normal', fixed(1)), { type: 'roll', reroll: [1] });
  assert.deepEqual(game.bot(at(3, 4), 0, 'normal', fixed(1)), { type: 'roll', reroll: [0, 1] });
  assert.deepEqual(game.bot(at(3, 3), 0, 'easy', fixed(6)), { type: 'stand' });
  assert.deepEqual(game.bot(at(2, 3), 0, 'easy', fixed(6)), { type: 'roll', reroll: [0, 1] });
});

function playMatch(levels, rng, target = 3) {
  let state = game.setup({ names: levels.map((_, i) => `P${i}`), options: { target }, first: Math.floor(rng() * levels.length) });
  for (let moves = 0; !game.outcome(state); moves += 1) {
    assert.ok(moves < 5000, 'the match ends');
    const seat = game.actor(state);
    const view = game.view(state, seat);
    state = game.apply(state, seat, game.bot(view, seat, levels[seat], rng), rng);
  }
  return state;
}

test('full bot games end for every table size and level', () => {
  const rng = seededRng(5);
  const levels = ['easy', 'normal', 'hard'];
  for (let players = 2; players <= 6; players += 1) {
    for (const target of [3, 5]) {
      const seats = Array.from({ length: players }, (_, i) => levels[(i + players) % 3]);
      const state = playMatch(seats, rng, target);
      const { winners, text } = game.outcome(state);
      assert.ok(winners.length >= 1);
      for (const winner of winners) assert.ok(state.wins[winner] >= target);
      assert.ok(text.length > 0);
      assert.ok(state.log.every((entry) => !/\bYou wins\b/.test(entry.text)));
    }
  }
});

test('hard beats easy over many seeded matches', (t) => {
  const rng = seededRng(11);
  const games = 1500;
  let hard = 0;
  let easy = 0;
  for (let i = 0; i < games; i += 1) {
    const { winners } = game.outcome(playMatch(['easy', 'hard'], rng));
    if (winners.includes(1)) hard += 1;
    if (winners.includes(0)) easy += 1;
  }
  t.diagnostic(`hard ${(hard / games).toFixed(3)}, easy ${(easy / games).toFixed(3)} of ${games} heads-up matches to 3`);
  // Under an even split, 1500 matches give a standard error near 0.013.
  assert.ok(hard / games > 0.54, `hard won ${hard} of ${games}`);
  assert.ok(hard > easy + 150, `hard ${hard}, easy ${easy}`);
});

test('hard beats normal over seeded matches', (t) => {
  const rng = seededRng(17);
  const games = 3000;
  let hard = 0;
  for (let i = 0; i < games; i += 1) {
    const { winners } = game.outcome(playMatch(['normal', 'hard'], rng, 5));
    if (winners.includes(1)) hard += 1 / winners.length;
  }
  t.diagnostic(`hard took ${(hard / games).toFixed(3)} of ${games} heads-up matches to 5 against normal`);
  // A luck-heavy game: the edge is a few points (standard error near 0.009).
  assert.ok(hard / games > 0.5, `hard took ${hard} of ${games}`);
});
