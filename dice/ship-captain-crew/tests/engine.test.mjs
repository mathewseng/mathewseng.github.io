import test from 'node:test';
import assert from 'node:assert/strict';
import { game, setAside, roundWinners, beatChance, cargoOptions, cargoOf } from '../engine.mjs';
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

test('hard weighs exact chances against posted cargos', () => {
  assert.ok(Math.abs(beatChance(0) - 0.54) < 0.01, `qualifying chance ${beatChance(0)}`);
  assert.equal(beatChance(12), 0);
  for (let c = 1; c <= 12; c += 1) assert.ok(beatChance(c) <= beatChance(c - 1));

  // Last to play: a tie with the best posted cargo is enough, anything less is not.
  let state = start(3, 0);
  state = turn(state, 0, load(5, 4));
  state = turn(state, 1, load(2, 2));
  const tied = game.apply(state, 2, { type: 'roll' }, fixed(6, 5, 4, 6, 3));
  assert.deepEqual(game.bot(tied, 2, 'hard', fixed(1)), { type: 'stand' });
  const short = game.apply(state, 2, { type: 'roll' }, fixed(6, 5, 4, 6, 2));
  assert.deepEqual(game.bot(short, 2, 'hard', fixed(1)), { type: 'roll', reroll: [1] }, 'keeps the 6, rerolls the 2');
  const low = game.apply(state, 2, { type: 'roll' }, fixed(6, 5, 4, 1, 2));
  assert.deepEqual(game.bot(low, 2, 'hard', fixed(1)), { type: 'roll', reroll: [0, 1] });

  // First to play with 12: nothing beats it.
  const top = game.apply(start(4), 0, { type: 'roll' }, fixed(6, 5, 4, 6, 6));
  assert.deepEqual(game.bot(top, 0, 'hard', fixed(1)), { type: 'stand' });
  const options = cargoOptions(top, 0);
  assert.equal(options[0].p, 1);
  assert.ok(options.every((option) => option.p <= 1 + 1e-9));
  assert.deepEqual(game.bot(game.apply(start(), 0, { type: 'roll' }, fixed(1)), 0, 'hard', fixed(1)), { type: 'roll', reroll: [] });
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
