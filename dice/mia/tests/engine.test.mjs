import test from 'node:test';
import assert from 'node:assert/strict';
import { game, RANKING, MIA, rank, valueOf, legalValues, atLeast, chance, truthChance } from '../engine.mjs';
import { seededRng } from '../../table-core.mjs';

// An rng that rolls the given faces in order.
const fixed = (...faces) => {
  let i = 0;
  return () => (faces[i++ % faces.length] - 1) / 6 + 0.01;
};
const NAMES = ['Ann', 'Ben', 'Cat', 'Dan', 'Eve', 'Fay'];
const start = ({ players = 3, lives = 6, first = 0 } = {}) => game.setup({ names: NAMES.slice(0, players), options: { lives }, first });
const act = (state, action, rng = fixed(1)) => game.apply(state, game.actor(state), action, rng);
const rollAndAnnounce = (state, dice, value) => act(act(state, { type: 'roll' }, fixed(...dice)), { type: 'announce', value });
const believeAndAnnounce = (state, dice, value) => rollAndAnnounce(state, dice, value);

test('values read high die first and rank 31 up to Mia', () => {
  assert.deepEqual(RANKING, [31, 32, 41, 42, 43, 51, 52, 53, 54, 61, 62, 63, 64, 65, 11, 22, 33, 44, 55, 66, 21]);
  assert.equal(valueOf([1, 3]), 31);
  assert.equal(valueOf([3, 1]), 31);
  assert.equal(valueOf([2, 1]), 21);
  assert.equal(valueOf([1, 2]), MIA);
  assert.equal(valueOf([4, 4]), 44);
  assert.equal(valueOf([4, 6]), 64);
  assert.equal(rank(31), 0);
  assert.equal(rank(MIA), 20);
  assert.ok(rank(65) < rank(11) && rank(66) < rank(MIA) && rank(43) < rank(51));
  assert.equal(rank(12), -1);
  assert.ok(Math.abs(RANKING.reduce((sum, value) => sum + chance(value), 0) - 1) < 1e-12);
  assert.ok(Math.abs(atLeast(31) - 1) < 1e-12);
  assert.ok(Math.abs(atLeast(MIA) - 2 / 36) < 1e-12);
  assert.deepEqual(legalValues(66), [MIA]);
  assert.equal(legalValues(null).length, 21);
  // Every one of the 36 rolls lands on a ranked value.
  for (let a = 1; a <= 6; a += 1) for (let b = 1; b <= 6; b += 1) assert.ok(rank(valueOf([a, b])) >= 0);
});

test('each announcement must beat the last one', () => {
  let state = start();
  state = act(state, { type: 'roll' }, fixed(3, 1));
  assert.equal(game.actor(state), 0);
  assert.throws(() => act(state, { type: 'announce', value: 12 }), /not a Mia value/);
  assert.throws(() => act(state, { type: 'announce', value: 77 }));
  state = act(state, { type: 'announce', value: 54 }); // any value opens, truth or not
  assert.equal(state.phase, 'decide');
  assert.equal(game.actor(state), 1);
  state = act(state, { type: 'roll' }, fixed(6, 6));
  assert.equal(state.phase, 'announce');
  assert.throws(() => act(state, { type: 'announce', value: 54 }), /more than 54/);
  assert.throws(() => act(state, { type: 'announce', value: 43 }));
  state = act(state, { type: 'announce', value: 61 });
  assert.deepEqual(state.history.map((entry) => entry.value), [54, 61]);
  assert.equal(game.actor(state), 2);
});

test('a call costs the announcer a life for a bluff and the caller otherwise', () => {
  // Bluff: 43 announced as 54.
  let state = act(rollAndAnnounce(start(), [4, 3], 54), { type: 'call' });
  assert.deepEqual(state.lives, [5, 6, 6]);
  assert.equal(state.phase, 'reveal');
  assert.equal(state.result.actual, 43);
  assert.equal(state.result.truth, false);
  assert.deepEqual(state.result.dice, [4, 3]);
  assert.match(state.log.at(-1).text, /It was 43\. Ann lost a life\./);

  // Exactly as announced: the caller pays.
  state = act(rollAndAnnounce(start(), [5, 4], 54), { type: 'call' });
  assert.deepEqual(state.lives, [6, 5, 6]);
  assert.equal(state.result.truth, true);

  // Better than announced: still the caller.
  state = act(rollAndAnnounce(start(), [1, 6], 54), { type: 'call' });
  assert.deepEqual(state.lives, [6, 5, 6]);
  assert.equal(state.result.actual, 61);

  // Later in a round only the latest roll counts.
  state = rollAndAnnounce(start(), [5, 4], 54);
  state = believeAndAnnounce(state, [3, 2], 61);
  assert.equal(game.actor(state), 2);
  state = act(state, { type: 'call' });
  assert.deepEqual(state.lives, [6, 5, 6]);
  assert.equal(state.result.announcer, 1);
});

test('Mia costs 2 lives when called true, 1 when it was a bluff or conceded', () => {
  let state = act(rollAndAnnounce(start(), [1, 2], MIA), { type: 'call' });
  assert.deepEqual(state.lives, [6, 4, 6]);
  assert.match(state.log.at(-1).text, /It was Mia\. Ben lost 2 lives\./);

  state = act(rollAndAnnounce(start(), [3, 1], MIA), { type: 'call' });
  assert.deepEqual(state.lives, [5, 6, 6]);

  const mia = rollAndAnnounce(start(), [3, 1], MIA);
  assert.throws(() => act(mia, { type: 'roll' }), /Nothing beats Mia/);
  state = act(mia, { type: 'concede' });
  assert.deepEqual(state.lives, [6, 5, 6]);
  assert.equal(state.result.kind, 'concede');
  assert.equal(state.result.dice, null);
  assert.equal(state.result.actual, null);
  assert.equal(state.dice, null);
  assert.match(state.log.at(-1).text, /conceded Mia and lost a life/);
  for (let seat = -1; seat < 3; seat += 1) {
    const shown = game.view(state, seat);
    assert.equal(shown.dice, null);
    assert.equal(shown.result.dice, null);
  }

  // A true Mia can only take the lives a caller has left.
  const last = clone(rollAndAnnounce(start(), [2, 1], MIA));
  last.lives[1] = 1;
  state = act(last, { type: 'call' });
  assert.deepEqual(state.lives, [6, 0, 6]);
  assert.equal(state.result.taken, 1);
  assert.equal(state.result.out, true);
});

test('the loser starts the next round, or the next player still in', () => {
  let state = act(rollAndAnnounce(start(), [4, 3], 54), { type: 'call' });
  assert.equal(game.actor(state), 0);
  assert.throws(() => game.apply(state, 1, { type: 'next' }, fixed(1)));
  state = act(state, { type: 'next' });
  assert.equal(state.phase, 'roll');
  assert.equal(state.round, 2);
  assert.equal(state.claim, null);
  assert.deepEqual(state.history, []);
  assert.equal(game.actor(state), 0);

  state = act(rollAndAnnounce(start(), [5, 4], 54), { type: 'call' });
  assert.equal(game.actor(state), 1);

  // Ann bluffs on her last life: she is out, Ben starts and turns skip her.
  const fragile = start();
  fragile.lives = [1, 3, 3];
  state = act(rollAndAnnounce(fragile, [4, 3], 54), { type: 'call' });
  assert.deepEqual(state.lives, [0, 3, 3]);
  assert.ok(state.log.some((entry) => entry.seat === 0 && entry.text === 'ran out of lives.'));
  assert.equal(game.outcome(state), null);
  assert.equal(game.actor(state), 1);
  state = act(state, { type: 'next' });
  state = rollAndAnnounce(state, [3, 1], 31);
  assert.equal(game.actor(state), 2);
  state = believeAndAnnounce(state, [3, 2], 32);
  assert.equal(game.actor(state), 1);
  assert.equal(game.summary(state, 0), 'Out');
  assert.equal(game.summary(state, 1), '3 lives');
});

test('the last player standing wins', () => {
  const duel = start({ players: 2, lives: 3 });
  duel.lives = [1, 2];
  const state = act(rollAndAnnounce(duel, [4, 3], 54), { type: 'call' });
  assert.equal(game.actor(state), -1);
  assert.deepEqual(game.outcome(state), { winners: [1], text: 'Ben won with 2 lives left.' });
  assert.throws(() => game.apply(state, 1, { type: 'next' }, fixed(1)), /over/);
});

const clone = (value) => JSON.parse(JSON.stringify(value));

// Collects every value stored under a `dice` key anywhere in an object.
function diceFields(value, found = []) {
  if (Array.isArray(value)) value.forEach((item) => diceFields(item, found));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'dice' && item != null) found.push(item);
      diceFields(item, found);
    }
  }
  return found;
}

test('views never show a hidden roll to anyone but its roller', () => {
  let state = act(start(), { type: 'roll' }, fixed(6, 2));
  assert.deepEqual(game.view(state, 0).dice, [6, 2]);
  for (const seat of [-1, 1, 2]) {
    assert.equal(game.view(state, seat).dice, null);
    assert.deepEqual(diceFields(game.view(state, seat)), []);
    assert.equal(game.view(state, seat).cup, true);
  }
  state = act(state, { type: 'announce', value: 64 });
  assert.equal(game.view(state, 1).dice, null);
  state = act(state, { type: 'call' });
  for (let seat = -1; seat < 3; seat += 1) assert.deepEqual(game.view(state, seat).result.dice, [6, 2]);

  // Across whole bot games, what any other seat sees never depends on the
  // dice under the cup, and no `dice` field reaches it before a call.
  const rng = seededRng(5);
  const swaps = [[1, 1], [2, 1], [6, 5], [4, 3], [6, 6]];
  for (let g = 0; g < 12; g += 1) {
    const players = 2 + (g % 5);
    let s = game.setup({ names: NAMES.slice(0, players), options: { lives: 3 }, first: g % players });
    while (!game.outcome(s)) {
      for (let seat = -1; seat < players; seat += 1) {
        const owner = seat >= 0 && seat === s.diceSeat;
        if (owner) continue;
        const seen = JSON.stringify(game.view(s, seat));
        if (s.phase !== 'reveal') assert.deepEqual(diceFields(game.view(s, seat)), []);
        for (const dice of swaps) {
          if (!s.dice) break;
          assert.equal(JSON.stringify(game.view({ ...s, dice }, seat)), seen);
        }
      }
      const seat = game.actor(s);
      s = game.apply(s, seat, game.bot(game.view(s, seat), seat, ['easy', 'normal', 'hard'][seat % 3], rng), rng);
    }
  }
});

test('the hand-over curtain guards every decision except the reveal', () => {
  let state = start();
  assert.equal(game.needsPrivacy(state, 0), true);
  state = act(state, { type: 'roll' }, fixed(5, 2));
  assert.equal(game.needsPrivacy(state, 0), true);
  state = act(state, { type: 'announce', value: 52 });
  assert.equal(game.needsPrivacy(state, 1), true);
  state = act(state, { type: 'call' });
  assert.equal(game.needsPrivacy(state, 1), false);
});

test('illegal moves throw and leave the state alone', () => {
  const opening = start();
  const before = JSON.stringify(opening);
  assert.throws(() => game.apply(opening, 1, { type: 'roll' }, fixed(1)), /not your turn/);
  assert.throws(() => act(opening, { type: 'announce', value: 31 }), /Roll before/);
  assert.throws(() => act(opening, { type: 'call' }), /no announcement/);
  assert.throws(() => act(opening, { type: 'concede' }));
  assert.throws(() => act(opening, { type: 'next' }));
  assert.throws(() => act(opening, { type: 'hold' }), /Unknown/);
  assert.equal(JSON.stringify(opening), before);

  const rolled = act(opening, { type: 'roll' }, fixed(4, 2));
  assert.throws(() => act(rolled, { type: 'roll' }));
  assert.throws(() => act(rolled, { type: 'call' }));

  const claimed = act(rolled, { type: 'announce', value: 42 });
  const frozen = JSON.stringify(claimed);
  assert.throws(() => act(claimed, { type: 'concede' }), /only concede to Mia/);
  assert.throws(() => act(claimed, { type: 'announce', value: 43 }), /Roll before/);
  assert.throws(() => game.apply(claimed, 0, { type: 'call' }, fixed(1)), /not your turn/);
  assert.equal(JSON.stringify(claimed), frozen);
  const believed = act(claimed, { type: 'roll' }, fixed(1, 1));
  assert.throws(() => act(believed, { type: 'announce', value: 41 }));
  assert.throws(() => act(believed, { type: 'announce', value: 42 }));
  assert.equal(JSON.stringify(claimed), frozen);
});

test('bot games end, and the log never names a roll before the cup is lifted', () => {
  const rng = seededRng(21);
  const levels = ['easy', 'normal', 'hard'];
  for (let g = 0; g < 90; g += 1) {
    const players = 2 + (g % 5);
    const seats = NAMES.slice(0, players).map(() => levels[Math.floor(rng() * 3)]);
    let state = game.setup({ names: NAMES.slice(0, players), options: { lives: g % 2 ? 3 : 6 }, first: g % players });
    let steps = 0;
    while (!game.outcome(state)) {
      const seat = game.actor(state);
      const action = game.bot(game.view(state, seat), seat, seats[seat], rng);
      const next = game.apply(state, seat, action, rng);
      if (state.log.length < 110) {
        for (const entry of next.log.slice(state.log.length)) {
          if (/It was/.test(entry.text)) assert.equal(action.type, 'call');
          if (/announced/.test(entry.text)) assert.equal(action.type, 'announce');
        }
      }
      state = next;
      steps += 1;
      assert.ok(steps < 4000, 'game did not finish');
    }
    assert.equal(state.lives.filter((lives) => lives > 0).length, 1);
  }
});

test('hard reads bluffs: the smallest raise is the least believable', () => {
  assert.ok(truthChance(61, 54) < truthChance(63, 54));
  assert.ok(truthChance(MIA, 66) < 0.2);
  assert.ok(truthChance(MIA, null) > 0.5);
});

test('hard beats normal and easy, and normal beats easy', (t) => {
  const rng = seededRng(2026);
  const rate = (a, b, games = 400) => {
    let wins = 0;
    for (let g = 0; g < games; g += 1) {
      const levels = [a, b];
      let state = game.setup({ names: ['A', 'B'], options: { lives: 6 }, first: g % 2 });
      while (!game.outcome(state)) {
        const seat = game.actor(state);
        state = game.apply(state, seat, game.bot(game.view(state, seat), seat, levels[seat], rng), rng);
      }
      if (game.outcome(state).winners[0] === 0) wins += 1;
    }
    return wins / games;
  };
  const hardEasy = rate('hard', 'easy');
  const hardNormal = rate('hard', 'normal');
  const normalEasy = rate('normal', 'easy');
  t.diagnostic(`hard beat easy in ${(hardEasy * 100).toFixed(1)}%, hard beat normal in ${(hardNormal * 100).toFixed(1)}%, normal beat easy in ${(normalEasy * 100).toFixed(1)}% of 400 two-player games`);
  assert.ok(hardEasy > 0.75, `hard beat easy in ${hardEasy}`);
  assert.ok(hardNormal > 0.56, `hard beat normal in ${hardNormal}`);
  assert.ok(normalEasy > 0.65, `normal beat easy in ${normalEasy}`);
});

test('a new host recovers a playable round from the spectator view', () => {
  const rng = seededRng(9);
  let state = game.setup({ names: ['A', 'B', 'C'], options: { lives: 6 }, first: 0 });
  state = game.apply(state, 0, { type: 'roll' }, rng);
  const pending = game.recover(game.view(state, -1), rng);
  assert.equal(pending.phase, 'announce');
  assert.equal(pending.diceSeat, 0);
  assert.equal(pending.dice.length, 2);
  state = game.apply(state, 0, { type: 'announce', value: 43 }, rng);
  const restarted = game.recover(game.view(state, -1), rng);
  assert.equal(restarted.phase, 'roll');
  assert.equal(restarted.turn, 1);
  assert.equal(restarted.claim, null);
  assert.equal(restarted.dice, null);
  assert.equal('cup' in restarted, false);
});
