import test from 'node:test';
import assert from 'node:assert/strict';
import { game, botHoldAt, loadTable, adviseWith, chances } from '../engine.mjs';
import { seededRng } from '../../table-core.mjs';

const fixed = (...faces) => {
  let i = 0;
  return () => (faces[i++ % faces.length] - 1) / 6 + 0.01;
};

test('rolling adds to the turn total and a 1 wipes it', () => {
  let state = game.setup({ names: ['A', 'B'], options: { target: 100 }, first: 0 });
  state = game.apply(state, 0, { type: 'roll' }, fixed(5));
  state = game.apply(state, 0, { type: 'roll' }, fixed(3));
  assert.equal(state.turnTotal, 8);
  assert.equal(game.actor(state), 0);
  state = game.apply(state, 0, { type: 'roll' }, fixed(1));
  assert.equal(state.turnTotal, 0);
  assert.equal(state.scores[0], 0);
  assert.equal(game.actor(state), 1);
});

test('holding banks the turn and reaching the target wins', () => {
  let state = game.setup({ names: ['A', 'B'], options: { target: 50 }, first: 1 });
  state.scores[1] = 45;
  state = game.apply(state, 1, { type: 'roll' }, fixed(6));
  state = game.apply(state, 1, { type: 'hold' }, fixed(1));
  assert.equal(state.scores[1], 51);
  assert.deepEqual(game.outcome(state).winners, [1]);
  assert.equal(game.actor(state), -1);
});

test('illegal moves throw without changing state', () => {
  const state = game.setup({ names: ['A', 'B'], options: { target: 100 }, first: 0 });
  assert.throws(() => game.apply(state, 1, { type: 'roll' }, fixed(4)));
  assert.throws(() => game.apply(state, 0, { type: 'hold' }, fixed(4)));
  assert.equal(state.turnTotal, 0);
});

test('the keep-pace rule rolls for the win near the end', () => {
  const state = game.setup({ names: ['A', 'B'], options: { target: 100 }, first: 0 });
  assert.equal(botHoldAt(state, 0, 'pace'), 21);
  state.scores = [40, 80];
  assert.equal(botHoldAt(state, 0, 'pace'), 60);
  state.scores = [30, 70];
  assert.equal(botHoldAt(state, 0, 'pace'), 26);
});

const at = (scores, turnTotal, { target = 100, seat = 0 } = {}) => {
  const state = game.setup({ names: scores.map((_, i) => `P${i}`), options: { target }, first: seat });
  state.scores = scores.slice();
  state.turnTotal = turnTotal;
  return state;
};

// Plays one game between bot levels (the hard bot is synchronous once its table has loaded).
function playGame(levels, first, rng, target = 100) {
  let state = game.setup({ names: levels.map((_, i) => `P${i}`), options: { target }, first });
  while (!game.outcome(state)) {
    const seat = game.actor(state);
    state = game.apply(state, seat, game.bot(game.view(state, seat), seat, levels[seat], rng), rng);
  }
  return game.outcome(state).winners[0];
}

test('solver tables load in Node and match the published optimum', async () => {
  const t100 = await loadTable(100);
  const t50 = await loadTable(50);
  assert.equal(t100.slice.length, 100 * 100);
  assert.equal(t50.slice.length, 50 * 50);
  assert.equal(await loadTable(100), t100, 'the table is cached');
  // Neller and Presser: the first player wins 53.06% of 100-point games under optimal play.
  assert.equal(chances(t100, 0, 0, 0).roll.toFixed(3), '0.531');
  assert.ok(Math.abs(chances(t100, 0, 0, 0).roll - 0.5306) < 1e-4);
  // Two-player values are consistent: one of the two players wins.
  for (const [i, j] of [[0, 0], [37, 82], [99, 99], [10, 60]]) {
    const pass = 1 - t100.slice[j * 100 + i];
    assert.ok(pass > 0 && pass < 1);
  }
  const advice = await game.advise(at([0, 0], 0), 0);
  assert.equal(advice.options[0].display, '53.1% to win');
  assert.equal(advice.metric, 'Chance to win');
  assert.equal(advice.exact, true);
});

test('advise ranks rolling and holding correctly', async () => {
  const table = await loadTable(100);
  // No turn total: rolling is the only move.
  let advice = adviseWith(table, at([30, 40], 0), 0);
  assert.deepEqual(advice.options.map((o) => o.action.type), ['roll']);
  assert.deepEqual(advice.best, { type: 'roll' });
  // Holding reaches the target: hold for a certain win.
  advice = adviseWith(table, at([90, 95], 12), 0);
  assert.deepEqual(advice.best, { type: 'hold' });
  assert.equal(advice.options[0].display, '100% to win');
  assert.equal(advice.options[0].label, 'Hold 12');
  assert.equal(advice.options.length, 2);
  // A big turn total early: bank it.
  assert.equal(adviseWith(table, at([0, 0], 30), 0).best.type, 'hold');
  // A small turn total: keep rolling.
  assert.equal(adviseWith(table, at([0, 0], 4), 0).best.type, 'roll');
  // Far behind an opponent about to win: keep rolling with a decent total.
  assert.equal(adviseWith(table, at([40, 98], 25), 0).best.type, 'roll');
  // Options are sorted best first with distinct displays.
  advice = adviseWith(table, at([50, 50], 20), 1);
  assert.equal(advice, null, 'only the seat to move gets advice');
  advice = adviseWith(table, at([50, 50], 20), 0);
  assert.ok(advice.options[0].value >= advice.options[1].value);
  assert.notEqual(advice.options[0].display, advice.options[1].display);
  // Target 50 has its own table.
  assert.equal(adviseWith(await loadTable(50), at([0, 0], 0, { target: 50 }), 0).options[0].display, '54.6% to win');
});

test('three or more players get a two-player estimate against the leader', async () => {
  const table = await loadTable(100);
  const advice = adviseWith(table, at([20, 70, 40], 10), 0);
  assert.equal(advice.exact, false);
  assert.match(advice.note, /leader/);
  const twoPlayer = adviseWith(table, at([20, 70], 10), 0);
  assert.deepEqual(advice.options.map((o) => o.display), twoPlayer.options.map((o) => o.display));
});

test('the hard bot plays the best move', async () => {
  const rng = seededRng(5);
  for (const [scores, total] of [[[0, 0], 0], [[0, 0], 30], [[0, 0], 4], [[90, 95], 12], [[40, 98], 25], [[55, 61], 19], [[10, 20, 30], 14]]) {
    const state = at(scores, total);
    const best = (await game.advise(state, 0)).best;
    assert.deepEqual(await game.bot(state, 0, 'hard', rng), best);
  }
  assert.ok(game.sameAction({ type: 'hold' }, { type: 'hold' }));
  assert.ok(!game.sameAction({ type: 'hold' }, { type: 'roll' }));
});

test('optimal play beats hold-at-20 clearly and is no worse than keep-pace', async () => {
  await loadTable(100);
  const rng = seededRng(2026);
  const games = 4000;
  const rate = (rival) => {
    let wins = 0;
    // Alternate seats and openers so the first-move edge cancels.
    for (let g = 0; g < games; g += 1) {
      const hardSeat = g % 2;
      const levels = hardSeat === 0 ? ['hard', rival] : [rival, 'hard'];
      wins += playGame(levels, Math.floor(g / 2) % 2, rng) === hardSeat ? 1 : 0;
    }
    return wins / games;
  };
  const sd = Math.sqrt(0.25 / games);
  const normal = rate('normal');
  assert.ok((normal - 0.5) / sd > 3, `hard won ${(normal * 100).toFixed(1)}% against normal`);
  // Keep-pace is within about a point of optimal, so only check it is not ahead.
  const pace = rate('pace');
  assert.ok((pace - 0.5) / sd > -2, `hard won ${(pace * 100).toFixed(1)}% against keep-pace`);
});

test('bot levels are ordered over many games', () => {
  const rng = seededRng(11);
  const play = (levels) => {
    let state = game.setup({ names: ['A', 'B'], options: { target: 100 }, first: Math.floor(rng() * 2) });
    while (!game.outcome(state)) {
      const seat = game.actor(state);
      state = game.apply(state, seat, game.bot(game.view(state, seat), seat, levels[seat], rng), rng);
    }
    return game.outcome(state).winners[0];
  };
  let hardWins = 0;
  for (let i = 0; i < 1500; i += 1) hardWins += play(['easy', 'hard']);
  assert.ok(hardWins / 1500 > 0.53, `hard won ${hardWins} of 1500`);
});
