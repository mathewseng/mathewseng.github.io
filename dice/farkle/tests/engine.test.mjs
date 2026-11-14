import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { game, scoreSelection, scoringOptions, isFarkle, scorableDice, bot, advise, sameAction, loadWinTable, UNIT } from '../engine.mjs';
import { seededRng } from '../../table-core.mjs';

// An rng that rolls the given faces in order.
const fixed = (...faces) => {
  let i = 0;
  return () => (faces[i++ % faces.length] - 1) / 6 + 0.01;
};

const start = (options = {}, names = ['A', 'B'], first = 0) => game.setup({ names, options: { target: 10000, opening: 0, ...options }, first });

test('every scoring combination scores by its best partition', () => {
  const cases = [
    [[1], 100], [[5], 50], [[1, 5], 150], [[1, 1], 200],
    [[1, 1, 1], 1000], [[2, 2, 2], 200], [[3, 3, 3], 300], [[4, 4, 4], 400], [[5, 5, 5], 500], [[6, 6, 6], 600],
    [[2, 2, 2, 5], 250], [[6, 6, 6, 1, 5], 750],
    [[4, 4, 4, 4], 1000], [[5, 5, 5, 5], 1000], [[1, 1, 1, 1], 1100], // three 1s and a single beat 1,000
    [[3, 3, 3, 3, 3], 2000], [[1, 1, 1, 1, 1], 2000], [[6, 6, 6, 6, 6, 6], 3000], [[1, 1, 1, 1, 1, 1], 3000],
    [[1, 2, 3, 4, 5, 6], 1500], [[6, 4, 2, 5, 3, 1], 1500],
    [[2, 2, 3, 3, 4, 4], 1500], [[1, 1, 5, 5, 6, 6], 1500],
    [[2, 2, 2, 2, 3, 3], 1500], [[1, 1, 1, 1, 5, 5], 1500], [[5, 5, 5, 5, 1, 1], 1500], // four of a kind and a pair
    [[2, 2, 2, 3, 3, 3], 2500], [[1, 1, 1, 5, 5, 5], 2500], // two triplets
    [[1, 1, 1, 1, 1, 5], 2050], [[4, 4, 4, 4, 1, 5], 1150],
  ];
  for (const [dice, points] of cases) assert.equal(scoreSelection(dice), points, dice.join(' '));
});

test('a set-aside is invalid unless every die scores', () => {
  for (const dice of [[2], [6], [1, 2], [5, 5, 3], [2, 2], [2, 2, 2, 2, 3], [2, 3, 4, 5, 6], [1, 2, 3, 4, 5], [2, 2, 3, 3], [], [0], [7], [1, 1, 1, 1, 1, 1, 1]]) {
    assert.equal(scoreSelection(dice), 0, `[${dice.join(' ')}] should not score`);
  }
});

test('scoring options list every distinct valid set-aside, best first', () => {
  const options = scoringOptions([1, 5, 2, 2, 3, 4]);
  assert.deepEqual(options.map((option) => [option.faces, option.points]), [[[1, 5], 150], [[1], 100], [[5], 50]]);
  assert.deepEqual(options[0].dice, [0, 1]);
  const triple = scoringOptions([3, 1, 3, 6, 3, 2]);
  assert.equal(triple[0].points, 400);
  assert.deepEqual(triple[0].dice.slice().sort(), [0, 1, 2, 4]);
  assert.deepEqual(scorableDice([3, 1, 3, 6, 3, 2]), [true, true, true, false, true, false]);
  assert.deepEqual(scorableDice([2, 2, 3, 3, 4, 4]), [true, true, true, true, true, true]);
});

test('farkle detection', () => {
  assert.equal(isFarkle([2, 2, 3, 3, 4, 6]), true);
  assert.equal(isFarkle([6, 4, 3, 2, 2, 6]), true);
  assert.equal(isFarkle([2, 3]), true);
  assert.equal(isFarkle([6]), true);
  assert.equal(isFarkle([2, 2, 3, 3, 4, 4]), false); // three pairs
  assert.equal(isFarkle([2, 2, 2, 2, 3, 3]), false);
  assert.equal(isFarkle([4, 4, 4]), false);
  assert.equal(isFarkle([5]), false);
});

test('a turn sets aside, rolls the rest and banks', () => {
  let state = start();
  state = game.apply(state, 0, { type: 'roll' }, fixed(1, 5, 2, 3, 4, 6, 6));
  assert.deepEqual(state.roll, [1, 5, 2, 3, 4, 6]); // a straight, but let A keep only the 1
  assert.equal(state.rollId, 1);
  state = game.apply(state, 0, { type: 'keep', dice: [0], then: 'roll' }, fixed(5, 2, 3, 4, 6));
  assert.equal(state.turnTotal, 100);
  assert.deepEqual(state.roll, [5, 2, 3, 4, 6]);
  assert.equal(state.rollId, 2);
  assert.deepEqual(state.kept, [{ faces: [1], points: 100 }]);
  state = game.apply(state, 0, { type: 'keep', dice: [0], then: 'bank' }, fixed(1));
  assert.equal(state.scores[0], 150);
  assert.equal(state.turnTotal, 0);
  assert.equal(game.actor(state), 1);
  assert.equal(state.phase, 'start');
  assert.match(state.log.at(-1).text, /banked 150 for 150/);
});

test('combinations only count within one roll', () => {
  let state = start();
  state = game.apply(state, 0, { type: 'roll' }, fixed(1, 1, 2, 3, 4, 6));
  state = game.apply(state, 0, { type: 'keep', dice: [0, 1], then: 'roll' }, fixed(1, 2, 3, 6));
  // A third 1 on the next roll is a single 1, not three 1s.
  state = game.apply(state, 0, { type: 'keep', dice: [0], then: 'bank' }, fixed(1));
  assert.equal(state.scores[0], 300);
});

test('a roll with nothing that scores is a Farkle and loses the turn', () => {
  let state = start();
  state = game.apply(state, 0, { type: 'roll' }, fixed(1, 2, 3, 4, 6, 6));
  state = game.apply(state, 0, { type: 'keep', dice: [0], then: 'roll' }, fixed(2, 2, 3, 4, 6));
  assert.equal(state.turnTotal, 0);
  assert.equal(state.scores[0], 0);
  assert.equal(game.actor(state), 1);
  assert.equal(state.last.kind, 'farkle');
  assert.deepEqual(state.last.dice, [2, 2, 3, 4, 6]);
  assert.equal(state.last.lost, 100);
  assert.match(state.log.at(-1).text, /farkled with 2 2 3 4 6 and lost 100/);
  // A Farkle on the opening roll passes the dice straight away.
  state = game.apply(state, 1, { type: 'roll' }, fixed(2, 2, 3, 4, 6, 6));
  assert.equal(game.actor(state), 0);
  assert.equal(state.rollId, 3);
});

test('hot dice roll all six again and keep building the turn', () => {
  let state = start();
  state = game.apply(state, 0, { type: 'roll' }, fixed(1, 1, 1, 5, 5, 5));
  state = game.apply(state, 0, { type: 'keep', dice: [0, 1, 2, 3, 4, 5], then: 'roll' }, fixed(5, 2, 3, 4, 6, 6));
  assert.equal(state.turnTotal, 2500);
  assert.equal(state.hot, true);
  assert.equal(state.roll.length, 6);
  assert.match(state.log.at(-1).text, /hot dice/);
  // Two rolls: four dice left, then hot dice after setting aside all four.
  state = start();
  state = game.apply(state, 0, { type: 'roll' }, fixed(2, 2, 2, 3, 4, 6));
  state = game.apply(state, 0, { type: 'keep', dice: [0, 1, 2], then: 'roll' }, fixed(1, 5, 1));
  state = game.apply(state, 0, { type: 'keep', dice: [0, 1, 2], then: 'roll' }, fixed(4, 4, 4, 2, 3, 6));
  assert.equal(state.turnTotal, 450);
  assert.equal(state.roll.length, 6);
  assert.equal(state.kept.length, 2);
  state = game.apply(state, 0, { type: 'keep', dice: [0, 1, 2], then: 'bank' }, fixed(1));
  assert.equal(state.scores[0], 850);
});

test('the opening minimum blocks small first banks only', () => {
  let state = start({ opening: 500 });
  state = game.apply(state, 0, { type: 'roll' }, fixed(1, 5, 2, 3, 4, 6, 6));
  state = game.apply(state, 0, { type: 'keep', dice: [0], then: 'roll' }, fixed(5, 2, 3, 3, 6));
  assert.throws(() => game.apply(state, 0, { type: 'keep', dice: [0], then: 'bank' }, fixed(1)), /at least 500/);
  // Once on the board, any bank is fine.
  const onBoard = { ...state, scores: [700, 0] };
  const banked = game.apply(onBoard, 0, { type: 'keep', dice: [0], then: 'bank' }, fixed(1));
  assert.equal(banked.scores[0], 850);
  // Exactly 500 opens.
  let open = start({ opening: 500 });
  open = game.apply(open, 0, { type: 'roll' }, fixed(5, 5, 5, 2, 3, 4));
  open = game.apply(open, 0, { type: 'keep', dice: [0, 1, 2], then: 'bank' }, fixed(1));
  assert.equal(open.scores[0], 500);
});

test('reaching the target gives everyone else one final turn; the highest score wins', () => {
  // A reaches the target; B beats it on the final turn.
  let state = start({ target: 5000 });
  state.scores = [4900, 4800];
  state = game.apply(state, 0, { type: 'roll' }, fixed(1, 2, 3, 4, 6, 6));
  state = game.apply(state, 0, { type: 'keep', dice: [0], then: 'bank' }, fixed(1));
  assert.equal(state.scores[0], 5000);
  assert.equal(game.outcome(state), null);
  assert.equal(game.actor(state), 1);
  assert.equal(state.finalLeft, 1);
  assert.match(state.log.at(-1).text, /Final round/);
  assert.match(game.status(state, 1, { canAct: true }), /Final round: beat 5,000/);
  const beaten = game.apply(game.apply(state, 1, { type: 'roll' }, fixed(1, 1, 1, 2, 3, 4)), 1, { type: 'keep', dice: [0, 1, 2], then: 'bank' }, fixed(1));
  assert.deepEqual(game.outcome(beaten).winners, [1]);
  assert.equal(game.outcome(beaten).text, 'B won with 5,800.');
  assert.equal(game.actor(beaten), -1);
  // B farkles instead: A wins.
  const farkled = game.apply(state, 1, { type: 'roll' }, fixed(2, 2, 3, 4, 6, 6));
  assert.deepEqual(game.outcome(farkled).winners, [0]);
  // B ties: both share the win.
  const tied = game.apply(game.apply(state, 1, { type: 'roll' }, fixed(1, 1, 2, 3, 4, 6)), 1, { type: 'keep', dice: [0, 1], then: 'bank' }, fixed(1));
  assert.deepEqual(game.outcome(tied).winners, [0, 1]);
  assert.equal(game.outcome(tied).text, 'A and B tied at 5,000.');
});

test('the final round lasts exactly one turn for each other player', () => {
  let state = start({ target: 5000 }, ['A', 'B', 'C'], 1);
  state.scores = [100, 4950, 200];
  state = game.apply(state, 1, { type: 'roll' }, fixed(5, 2, 3, 4, 6, 6));
  state = game.apply(state, 1, { type: 'keep', dice: [0], then: 'bank' }, fixed(1));
  assert.equal(state.finalLeft, 2);
  assert.equal(game.actor(state), 2);
  state = game.apply(state, 2, { type: 'roll' }, fixed(2, 2, 3, 4, 6, 6));
  assert.equal(game.actor(state), 0);
  assert.equal(game.outcome(state), null);
  state = game.apply(state, 0, { type: 'roll' }, fixed(1, 2, 3, 4, 6, 6));
  state = game.apply(state, 0, { type: 'keep', dice: [0], then: 'bank' }, fixed(1));
  assert.deepEqual(game.outcome(state).winners, [1]);
  assert.equal(state.phase, 'over');
});

test('illegal moves throw without changing state', () => {
  let state = start();
  const before = JSON.stringify(state);
  assert.throws(() => game.apply(state, 1, { type: 'roll' }, fixed(4)), /not your turn/);
  assert.throws(() => game.apply(state, 0, { type: 'keep', dice: [0], then: 'bank' }, fixed(4)), /Roll the dice first/);
  assert.throws(() => game.apply(state, 0, { type: 'hold' }, fixed(4)), /Unknown move/);
  assert.equal(JSON.stringify(state), before);
  state = game.apply(state, 0, { type: 'roll' }, fixed(1, 2, 3, 4, 6, 6));
  const rolled = JSON.stringify(state);
  assert.throws(() => game.apply(state, 0, { type: 'roll' }, fixed(4)), /Set aside/);
  assert.throws(() => game.apply(state, 0, { type: 'keep', dice: [1], then: 'roll' }, fixed(4)), /must score/); // a lone 2
  assert.throws(() => game.apply(state, 0, { type: 'keep', dice: [0, 1], then: 'roll' }, fixed(4)), /must score/);
  assert.throws(() => game.apply(state, 0, { type: 'keep', dice: [], then: 'roll' }, fixed(4)));
  assert.throws(() => game.apply(state, 0, { type: 'keep', dice: [0, 0], then: 'roll' }, fixed(4)));
  assert.throws(() => game.apply(state, 0, { type: 'keep', dice: [6], then: 'roll' }, fixed(4)));
  assert.throws(() => game.apply(state, 0, { type: 'keep', dice: ['0'], then: 'roll' }, fixed(4)));
  assert.throws(() => game.apply(state, 0, { type: 'keep', dice: [0] }, fixed(4)));
  assert.equal(JSON.stringify(state), rolled);
  const over = { ...state, winners: [0], phase: 'over' };
  assert.throws(() => game.apply(over, 0, { type: 'roll' }, fixed(4)));
});

test('text reads correctly for a player called You', () => {
  let state = start({}, ['You', 'Pascal']);
  assert.equal(game.status(state, 0, { canAct: true }), 'Your turn. Roll six dice.');
  state = game.apply(state, 0, { type: 'roll' }, fixed(1, 2, 3, 4, 6, 6));
  state = game.apply(state, 0, { type: 'keep', dice: [0], then: 'bank' }, fixed(1));
  assert.equal(state.log.at(-1).text, 'kept 1 for 100 and banked 100 for 100.');
  assert.equal(game.status(state, 0, { canAct: false }), 'Pascal to roll.');
  assert.equal(game.summary(state, 0), '100');
});

// Hard bots return a Promise only while a two-player table loads; await covers both.
async function playGame(levels, rng, options, first = 0) {
  const names = levels.map((_, i) => `P${i}`);
  let state = game.setup({ names, options, first });
  let moves = 0;
  while (!game.outcome(state)) {
    const seat = game.actor(state);
    const action = await game.bot(game.view(state, seat), seat, levels[seat], rng);
    state = game.apply(state, seat, action, rng);
    moves += 1;
    if (moves > 20000) throw new Error('game did not end');
  }
  return { state, outcome: game.outcome(state), moves };
}

test('bot games end for every level, table size and option', async () => {
  const rng = seededRng(5);
  const levels = ['easy', 'normal', 'hard'];
  for (let players = 2; players <= 6; players += 1) {
    for (const target of [5000, 10000]) {
      for (const opening of [0, 500]) {
        const seats = Array.from({ length: players }, (_, i) => levels[(i + players + target / 5000) % 3]);
        const { state, outcome } = await playGame(seats, rng, { target, opening }, players % 2);
        assert.ok(outcome.winners.length >= 1);
        const top = Math.max(...state.scores);
        assert.ok(top >= target);
        assert.ok(outcome.winners.every((seat) => state.scores[seat] === top));
      }
    }
  }
});

// A position mid-turn: `seat` (0) to choose from `roll`.
const at = ({ scores = [0, 0], roll, turnTotal = 0, target = 10000, opening = 0, names = ['A', 'B'] }) => {
  const state = start({ target, opening }, names);
  Object.assign(state, { scores: scores.slice(), roll: roll.slice(), turnTotal, phase: 'choose' });
  return state;
};
const brief = (action) => ({ faces: action.faces, then: action.then });

test('the two-player win tables load, are the right size and make sense', async () => {
  for (const target of [5000, 10000]) {
    for (const opening of [0, 500]) {
      const { T, W } = await loadWinTable(target, opening);
      assert.equal(T, target / UNIT);
      assert.equal(W.length, T * T);
      assert.ok(W.every((p) => p >= 0 && p <= 1));
      // Moving first is an edge; the opening minimum trims it a little.
      assert.ok(W[0] > 0.52 && W[0] < 0.57, `first player ${W[0]}`);
      // Far ahead or far behind.
      assert.ok(W[(T - 1) * T] > 0.95 && W[T - 1] < 0.1);
    }
  }
});

test('advice lists only legal moves, each once, ranked best first', async () => {
  const rng = seededRng(41);
  const cases = [
    at({ roll: [1, 5, 2, 2, 3, 4] }),
    at({ roll: [1, 1, 1, 5, 5, 5], turnTotal: 300, scores: [2000, 4500] }),
    at({ roll: [2, 2, 3, 3, 4, 4], scores: [0, 900], opening: 500 }),
    at({ roll: [5, 1], turnTotal: 350, scores: [0, 0], opening: 500 }),
    at({ roll: [1, 3, 3, 3, 5, 6], turnTotal: 900, names: ['A', 'B', 'C'], scores: [3000, 6000, 8000] }),
  ];
  for (let i = 0; i < 30; i += 1) {
    const roll = Array.from({ length: 1 + Math.floor(rng() * 6) }, () => 1 + Math.floor(rng() * 6));
    if (!isFarkle(roll)) cases.push(at({ roll, turnTotal: 50 * Math.floor(rng() * 40), scores: [50 * Math.floor(rng() * 200), 50 * Math.floor(rng() * 200)], opening: rng() < 0.5 ? 500 : 0 }));
  }
  for (const state of cases) {
    const advice = await advise(state, 0);
    assert.ok(advice.options.length >= 1);
    assert.equal(advice.best, advice.options[0].action);
    const seen = new Set();
    for (let i = 0; i < advice.options.length; i += 1) {
      const { action, label, display } = advice.options[i];
      assert.doesNotThrow(() => game.apply(state, 0, action, seededRng(1)), label);
      assert.equal(scoreSelection(action.dice.map((d) => state.roll[d])), scoreSelection(action.faces));
      assert.deepEqual(action.dice.map((d) => state.roll[d]).sort(), action.faces);
      const key = `${action.faces}:${action.then}`;
      assert.ok(!seen.has(key), `duplicate ${key}`);
      seen.add(key);
      assert.ok(display && label);
      if (i) assert.ok(advice.options[i - 1].value >= advice.options[i].value);
    }
    // Every valid set-aside appears with rolling on, and with banking when a bank is allowed.
    const banks = state.scores[0] > 0 || state.opening === 0;
    for (const option of scoringOptions(state.roll)) {
      assert.ok(seen.has(`${option.faces}:roll`));
      if (banks || state.turnTotal + option.points >= state.opening) assert.ok(seen.has(`${option.faces}:bank`));
      else assert.ok(!seen.has(`${option.faces}:bank`));
    }
  }
  // At the start of a turn the only move is to roll.
  const fresh = start();
  const opening = await advise(fresh, 0);
  assert.deepEqual(opening.options.map((option) => option.action), [{ type: 'roll' }]);
  assert.match(opening.options[0].display, /^5\d\.\d% to win$/);
  assert.equal(opening.metric, 'Chance to win');
  assert.equal(opening.exact, true);
  assert.equal(await advise(fresh, 1), null); // not B's turn
});

test('advice on known positions', async () => {
  // Six 1s: keep them all (3,000 and hot dice).
  const six = await advise(at({ roll: [1, 1, 1, 1, 1, 1] }), 0);
  assert.deepEqual(six.best.faces, [1, 1, 1, 1, 1, 1]);
  assert.equal(six.best.then, 'roll');
  // One die left and 400 in hand, on the board: bank (one die scores only a third of the time).
  // With just 50 in hand rolling is right: a 1 or a 5 gives hot dice (worth about +225 on average).
  const four = await advise(at({ roll: [5, 2], turnTotal: 350, scores: [3000, 3000] }), 0);
  assert.deepEqual(brief(four.best), { faces: [5], then: 'bank' });
  const low = await advise(at({ roll: [5, 2], turnTotal: 0, scores: [3000, 3000] }), 0);
  assert.deepEqual(brief(low.best), { faces: [5], then: 'roll' });
  // A single 1 rather than 1 and 5 keeps more dice to roll: 1 5 2 2 3 4 at the start of a turn.
  const single = await advise(at({ roll: [1, 5, 2, 2, 3, 4] }), 0);
  assert.deepEqual(brief(single.best), { faces: [1], then: 'roll' });
  // A straight is worth 1,500 and hot dice: keep it all and roll again.
  assert.deepEqual(brief((await advise(at({ roll: [1, 5, 2, 3, 4, 6] }), 0)).best), { faces: [1, 2, 3, 4, 5, 6], then: 'roll' });
  // Expected points with three players: the exact turn optimum and its thresholds.
  const three = await advise(at({ roll: [1, 2, 3, 4, 6, 6], turnTotal: 250, names: ['A', 'B', 'C'], scores: [1000, 1000, 1000] }), 0);
  assert.equal(three.metric, 'Expected turn points');
  assert.deepEqual(brief(three.best), { faces: [1], then: 'roll' }); // 350 with five dice: roll
  assert.match(three.options[0].display, /^\+\d[\d,]*(\.\d)? expected$/);
});

test('the hard bot plays to beat the leader in the final round', async () => {
  const state = start({ target: 5000 });
  state.scores = [6200, 4000];
  state.finalLeft = 1;
  state.finalBy = 0;
  state.turn = 1;
  state.phase = 'choose';
  state.turnTotal = 1500;
  state.roll = [1, 5, 2, 3, 6, 6]; // banking 1,650 leaves 5,650: not enough
  assert.equal((await bot(state, 1, 'hard', seededRng(1))).then, 'roll');
  const advice = await advise(state, 1);
  assert.ok(advice.options.filter((option) => option.action.then === 'bank').every((option) => option.value === 0));
  state.turnTotal = 2100; // 2,250 beats the leader by keeping the 1 and 5
  assert.deepEqual(brief(await bot(state, 1, 'hard', seededRng(1))), { faces: [1, 5], then: 'bank' });
  // A tie is worth half: tying with one die left beats rolling it (a third to score).
  state.turnTotal = 2150;
  state.roll = [5, 2];
  assert.deepEqual(brief(await bot(state, 1, 'hard', seededRng(1))), { faces: [5], then: 'bank' });
  assert.equal((await advise(state, 1)).options[0].display, '50.0% to win');
});

test('the hard bot rolls past the target only when a rival is close', async () => {
  // Hot dice worth 2,500 reach 11,500. A rival at 9,950 needs only 1,600 to beat that: roll on.
  assert.deepEqual(brief(await bot(at({ scores: [9000, 9950], roll: [1, 1, 1, 5, 5, 5] }), 0, 'hard', seededRng(1))), { faces: [1, 1, 1, 5, 5, 5], then: 'roll' });
  // A rival at 3,000 cannot catch 11,500 in one turn: bank. Normal always banks at the target.
  assert.equal((await bot(at({ scores: [9000, 3000], roll: [1, 1, 1, 5, 5, 5] }), 0, 'hard', seededRng(1))).then, 'bank');
  assert.equal(bot(at({ scores: [9000, 9950], roll: [1, 1, 1, 5, 5, 5] }), 0, 'normal', seededRng(1)).then, 'bank');
});

test('just short of the target can beat reaching it', async () => {
  // A at 0 holds 4,900 against 4,800 (target 5,000) with 1 5 2 3: banking 5,000 hands B a last
  // turn needing 250; banking 4,950 makes B cross first and gives A the last word.
  const state = at({ target: 5000, scores: [0, 4800], roll: [1, 5, 2, 3], turnTotal: 4900 });
  const advice = await advise(state, 0);
  const value = (faces, then) => advice.options.find((option) => option.action.faces.join(' ') === faces && option.action.then === then).value;
  assert.ok(value('5', 'bank') > value('1', 'bank'));
  assert.ok(value('5', 'bank') > value('1 5', 'bank'));
});

test('the hard bot respects the opening minimum and banks at the target', async () => {
  const state = start({ opening: 500 });
  state.phase = 'choose';
  state.turnTotal = 350;
  state.roll = [1, 2]; // 450 would bank with no minimum; here it has to press on
  assert.equal((await bot(state, 0, 'hard', seededRng(1))).then, 'roll');
  state.scores = [9700, 3000];
  state.roll = [5, 2, 3, 4, 6, 6];
  assert.equal((await bot(state, 0, 'hard', seededRng(1))).then, 'bank');
});

test('hard plays exactly the best move, and equivalent keeps match', async () => {
  const rng = seededRng(77);
  for (const names of [['A', 'B'], ['A', 'B', 'C']]) {
    let state = game.setup({ names, options: { target: 5000, opening: 500 }, first: 0 });
    for (let moves = 0; moves < 300 && !game.outcome(state); moves += 1) {
      const seat = game.actor(state);
      const advice = await game.advise(game.view(state, seat), seat);
      const action = await game.bot(game.view(state, seat), seat, 'hard', rng);
      assert.deepEqual(action, advice.best);
      assert.ok(game.sameAction(action, advice.options[0].action));
      state = game.apply({ ...state, log: [] }, seat, action, rng);
    }
  }
  const a = { type: 'keep', dice: [0, 2], then: 'roll', faces: [1, 5] };
  assert.equal(sameAction(a, { type: 'keep', dice: [3, 4], then: 'roll', faces: [1, 5] }), true);
  assert.equal(sameAction(a, { type: 'keep', dice: [4, 3], then: 'roll', faces: [5, 1] }), true);
  assert.equal(sameAction(a, { type: 'keep', dice: [0, 2], then: 'bank', faces: [1, 5] }), false);
  assert.equal(sameAction(a, { type: 'keep', dice: [0], then: 'roll', faces: [1] }), false);
  assert.equal(sameAction(a, { type: 'roll' }), false);
  assert.equal(sameAction({ type: 'roll' }, { type: 'roll' }), true);
  // The board's own actions match the advice for an equivalent pick (the second 1 instead of the first).
  const state = at({ roll: [1, 2, 1, 3, 4, 6] });
  const advice = await advise(state, 0);
  const picked = { type: 'keep', dice: [2], then: 'roll', faces: [1] };
  const option = advice.options.find((o) => sameAction(o.action, picked));
  assert.ok(option);
  assert.deepEqual(option.action.dice, [0]);
});

test('the solver is quick and exact on its own terms', async () => {
  // A fresh module instance, so the tables are built from scratch here.
  const fresh = await import(`../engine.mjs?cold=${Date.now()}`);
  let started = performance.now();
  const table = fresh.valueTable(0);
  const evMs = performance.now() - started;
  started = performance.now();
  const final = fresh.finalTable();
  const finalMs = performance.now() - started;
  await fresh.loadWinTable(10000, 0);
  const timings = [];
  const rng = seededRng(9);
  for (let i = 0; i < 40; i += 1) {
    const state = at({ roll: [1, 5, 5, 2, 3, 6], turnTotal: 50 * Math.floor(rng() * 40), scores: [50 * Math.floor(rng() * 200), 50 * Math.floor(rng() * 200)] });
    started = performance.now();
    fresh.advise(state, 0);
    timings.push(performance.now() - started);
  }
  timings.sort((a, b) => a - b);
  console.log(`  expected points table ${evMs.toFixed(1)} ms, final-turn table ${finalMs.toFixed(1)} ms; a new two-player turn ${timings[20].toFixed(1)} ms median, ${timings[39].toFixed(1)} ms worst; expected turn ${table.roll(0, 6).toFixed(1)}`);
  assert.ok(evMs < 500 && finalMs < 200 && timings[39] < 150);
  // Expected points: bank with 1 die at 350+, 2 dice at 300+, 3 dice at 450+; with 6 dice, keep rolling.
  assert.ok(table.roll(300, 1) > 300 && table.roll(350, 1) <= 350);
  assert.ok(table.roll(250, 2) > 250 && table.roll(300, 2) <= 300);
  assert.ok(table.roll(400, 3) > 400 && table.roll(450, 3) <= 450);
  assert.ok(table.roll(5000, 6) > 5000);
  assert.ok(table.roll(0, 6) > 590 && table.roll(0, 6) < 610);
  // Past the table's top banking really is best: rolling there is worth less than the total.
  for (let k = 1; k <= 6; k += 1) assert.ok(table.roll((fresh.EV_TOP - 1) * UNIT, k) < (fresh.EV_TOP - 1) * UNIT);
  // The last turn, level with the leader: six dice win unless they Farkle.
  assert.ok(Math.abs(final.value(0, 6) - (1 - 0.0231)) < 0.001);
  assert.ok(final.value(1, 6) < final.value(0, 6));
  assert.ok(final.value(20, 6) > 0.3 && final.value(20, 6) < 0.6);
  assert.ok(final.value(60, 6) < final.value(20, 6));
});

test('hard beats easy and normal head to head', async () => {
  // Bots read only their view; the log is trimmed between moves so thousands of games stay quick.
  const match = async (a, b, games, seed, target = 10000) => {
    const rng = seededRng(seed);
    let wins = 0;
    for (let i = 0; i < games; i += 1) {
      let state = game.setup({ names: ['A', 'B'], options: { target, opening: 0 }, first: i % 2 });
      while (!game.outcome(state)) {
        const seat = game.actor(state);
        state = game.apply({ ...state, log: [] }, seat, await game.bot(game.view(state, seat), seat, [a, b][seat], rng), rng);
      }
      const { winners } = game.outcome(state);
      wins += winners.length > 1 ? 0.5 : winners[0] === 0 ? 1 : 0;
    }
    const rate = wins / games;
    return { rate, z: (rate - 0.5) / (0.5 / Math.sqrt(games)), games };
  };
  const show = ({ rate, z, games }) => `${(rate * 100).toFixed(1)}% of ${games} (z ${z.toFixed(1)})`;
  const easy = await match('hard', 'easy', 400, 21);
  const normal = await match('hard', 'normal', 3000, 22);
  const normal5k = await match('hard', 'normal', 2000, 24, 5000);
  const normalVsEasy = await match('normal', 'easy', 400, 23);
  console.log(`  hard vs easy ${show(easy)}; hard vs normal ${show(normal)} at 10,000, ${show(normal5k)} at 5,000; normal vs easy ${show(normalVsEasy)}`);
  // Each player starts half the games. z > 3 is a one-sided p under 0.0014.
  assert.ok(easy.z > 3 && easy.rate > 0.65, `hard against easy: ${show(easy)}`);
  assert.ok(normal.z > 3, `hard against normal: ${show(normal)}`);
  assert.ok(normal5k.z > 3, `hard against normal at 5,000: ${show(normal5k)}`);
  assert.ok(normalVsEasy.z > 3, `normal against easy: ${show(normalVsEasy)}`);
});
