import test from 'node:test';
import assert from 'node:assert/strict';
import { game, botHoldAt } from '../engine.mjs';
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

test('hard keeps pace and rolls for the win near the end', () => {
  const state = game.setup({ names: ['A', 'B'], options: { target: 100 }, first: 0 });
  assert.equal(botHoldAt(state, 0, 'hard'), 21);
  state.scores = [40, 80];
  assert.equal(botHoldAt(state, 0, 'hard'), 60);
  state.scores = [30, 70];
  assert.equal(botHoldAt(state, 0, 'hard'), 26);
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
