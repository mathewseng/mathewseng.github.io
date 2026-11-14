import test from 'node:test';
import assert from 'node:assert/strict';
import { game, bidProblem, minimumBid, legalBids, bidText, countText, bidChance } from '../engine.mjs';
import { seededRng } from '../../table-core.mjs';

const NAMES = ['You', 'Pascal', 'Fermat', 'Cardano'];

const start = ({ names = NAMES, wild = true, dice = 5, first = 0, seed = 1 } = {}) =>
  game.setup({ names, options: { wild, dice }, rng: seededRng(seed), first });

// A bidding state with chosen dice.
function table(hands, { wild = true, first = 0 } = {}) {
  const state = start({ names: NAMES.slice(0, hands.length), wild, first });
  state.dice = hands.map((hand) => hand.slice());
  state.counts = hands.map((hand) => hand.length);
  return state;
}

const bid = (state, seat, quantity, face) => game.apply(state, seat, { type: 'bid', quantity, face }, seededRng(9));
const liar = (state, seat) => game.apply(state, seat, { type: 'liar' }, seededRng(9));
const lastLog = (state, n = 1) => state.log.slice(-n).map((entry) => (entry.seat >= 0 ? `${state.names[entry.seat]} ${entry.text}` : entry.text));

test('setup rolls every hand and the opener acts', () => {
  const state = start({ first: 2, dice: 3 });
  assert.equal(state.phase, 'bid');
  assert.equal(game.actor(state), 2);
  assert.deepEqual(state.counts, [3, 3, 3, 3]);
  assert.ok(state.dice.every((hand) => hand.length === 3 && hand.every((die) => die >= 1 && die <= 6)));
  assert.equal(state.rollId, 1);
  assert.equal(state.bid, null);
});

test('a raise needs more dice, or the same number of a higher face', () => {
  let state = table([[2, 3, 4, 5, 6], [2, 3, 4, 5, 6], [2, 3, 4, 5, 6], [2, 3, 4, 5, 6]]);
  assert.equal(bidProblem(state, 1, 2), '');
  assert.match(bidProblem(state, 2, 1), /wild/);
  assert.match(bidProblem(state, 21, 4), /only 20/);
  assert.match(bidProblem(state, 0, 4), /at least one/);
  state = bid(state, 0, 3, 4);
  assert.equal(game.actor(state), 1);
  assert.equal(bidProblem(state, 3, 5), '');
  assert.equal(bidProblem(state, 4, 2), '');
  assert.equal(bidProblem(state, 20, 6), '');
  assert.notEqual(bidProblem(state, 3, 4), '');
  assert.notEqual(bidProblem(state, 3, 3), '');
  assert.notEqual(bidProblem(state, 2, 6), '');
  assert.deepEqual(minimumBid(state), { quantity: 3, face: 5 });
  assert.deepEqual(minimumBid(state, 2), { quantity: 4, face: 2 });
  assert.deepEqual(minimumBid(state, 6), { quantity: 3, face: 6 });
  state = bid(state, 1, 3, 6);
  assert.deepEqual(minimumBid(state), { quantity: 4, face: 2 });
  assert.ok(legalBids(state).every((next) => bidProblem(state, next.quantity, next.face) === ''));
  // The top bid leaves only Liar.
  state = bid(state, 2, 20, 6);
  assert.equal(minimumBid(state), null);
  assert.equal(legalBids(state).length, 0);
});

test('without wild ones, ones can be bid and rank lowest', () => {
  let state = table([[1, 1, 2], [3, 4, 5]], { wild: false });
  assert.equal(bidProblem(state, 1, 1), '');
  state = bid(state, 0, 2, 1);
  assert.equal(bidProblem(state, 2, 2), '');
  assert.notEqual(bidProblem(state, 2, 1), '');
  assert.deepEqual(minimumBid(state), { quantity: 2, face: 2 });
});

test('wild ones count toward the bid face', () => {
  const hands = [[1, 5, 5, 2, 3], [1, 1, 4, 6, 6]];
  // Five 5s: two 5s plus three wild ones, so the bid holds and the caller loses.
  let state = bid(table(hands), 0, 5, 5);
  state = liar(state, 1);
  assert.equal(state.result.actual, 5);
  assert.equal(state.result.loser, 1);
  assert.deepEqual(state.counts, [5, 4]);
  assert.deepEqual(lastLog(state, 2), ['Pascal called Liar on you.', 'There were five 5s. Pascal lost a die.']);
  // Without wild ones only the two 5s count, so the bidder loses.
  state = bid(table(hands, { wild: false }), 0, 5, 5);
  state = liar(state, 1);
  assert.equal(state.result.actual, 2);
  assert.equal(state.result.loser, 0);
  assert.deepEqual(lastLog(state, 2), ['Pascal called Liar on you.', 'There were two 5s. You lost a die.']);
  // Bidding ones themselves (wild off) counts only ones.
  state = bid(table(hands, { wild: false }), 0, 3, 1);
  assert.equal(liar(state, 1).result.actual, 3);
});

test('a call that fails costs the caller, and the loser opens the next round', () => {
  let state = table([[4, 4, 1], [4, 2, 3], [5, 5, 6]]);
  state = bid(state, 0, 2, 4);
  state = bid(state, 1, 3, 4);
  assert.deepEqual(lastLog(state), ['Pascal bid three 4s.']);
  state = liar(state, 2);
  assert.equal(state.phase, 'reveal');
  assert.equal(state.result.actual, 4);
  assert.equal(state.result.loser, 2);
  assert.deepEqual(state.counts, [3, 3, 2]);
  assert.equal(game.actor(state), 2);
  assert.deepEqual(lastLog(state, 2), ['Fermat called Liar on Pascal.', 'There were four 4s. Fermat lost a die.']);
  // The reveal keeps the round’s dice on the table until the next round.
  assert.deepEqual(state.dice[2], [5, 5, 6]);
  const rollId = state.rollId;
  state = game.apply(state, 2, { type: 'next' }, seededRng(4));
  assert.equal(state.phase, 'bid');
  assert.equal(state.round, 2);
  assert.equal(state.rollId, rollId + 1);
  assert.equal(game.actor(state), 2);
  assert.equal(state.bid, null);
  assert.deepEqual(state.bids, []);
  assert.deepEqual(state.dice.map((hand) => hand.length), [3, 3, 2]);
  assert.equal(state.result, null);
});

test('a bluff that is called costs the bidder', () => {
  let state = table([[2, 2], [3, 3], [6, 6]]);
  state = bid(state, 0, 3, 2);
  state = liar(state, 1);
  assert.equal(state.result.actual, 2);
  assert.equal(state.result.loser, 0);
  assert.equal(game.actor(state), 0);
  assert.equal(game.status(state, 0, { canAct: true }), 'There were two 2s. You lost a die.');
});

test('a player with no dice drops out and the next live player opens', () => {
  let state = table([[2, 2], [3], [], [6, 6]]);
  state.counts = [2, 1, 0, 2];
  state.turn = 1;
  state = bid(state, 1, 2, 3); // Pascal holds one 3: a bluff.
  assert.equal(game.actor(state), 3, 'seat 2 is out and skipped');
  state = liar(state, 3);
  assert.equal(state.result.loser, 1);
  assert.equal(state.result.out, true);
  assert.deepEqual(state.counts, [2, 0, 0, 2]);
  assert.equal(game.actor(state), 3, 'next live seat clockwise from Pascal');
  assert.deepEqual(lastLog(state), ['Pascal dropped out with no dice left.']);
  assert.throws(() => game.apply(state, 1, { type: 'next' }, seededRng(1)), /out/);
  state = game.apply(state, 3, { type: 'next' }, seededRng(2));
  assert.deepEqual(state.dice.map((hand) => hand.length), [2, 0, 0, 2]);
  assert.equal(game.summary(state, 1), 'Out');
  assert.equal(game.summary(state, 0), '2 dice');
});

test('the last player with dice wins', () => {
  let state = table([[5], [2, 2]]);
  state = bid(state, 0, 2, 5);
  state = liar(state, 1);
  assert.equal(state.phase, 'over');
  assert.equal(game.actor(state), -1);
  assert.deepEqual(game.outcome(state), { winners: [1], text: 'Pascal won with 2 dice left.' });
  assert.deepEqual(lastLog(state), ['Pascal won with 2 dice left.']);
  assert.throws(() => game.apply(state, 1, { type: 'next' }, seededRng(1)));
  // The final reveal stays visible to everyone.
  assert.deepEqual(game.view(state, -1).dice, [[5], [2, 2]]);
});

test('illegal moves throw and never change the state', () => {
  const state = table([[2, 3, 4], [5, 6, 6], [1, 1, 2]]);
  const before = JSON.stringify(state);
  assert.throws(() => liar(state, 0), /bid before/);
  assert.throws(() => bid(state, 1, 1, 2), /not your turn/);
  assert.throws(() => bid(state, 0, 1, 1), /wild/);
  assert.throws(() => game.apply(state, 0, { type: 'next' }, seededRng(1)), /still being bid/);
  assert.throws(() => game.apply(state, 0, { type: 'fold' }, seededRng(1)), /Unknown/);
  assert.throws(() => bid(state, 0, 1.5, 3));
  const after = bid(state, 0, 2, 4);
  assert.throws(() => bid(after, 1, 2, 4), /Raise two 4s/);
  assert.throws(() => bid(after, 1, 2, 3));
  assert.throws(() => bid(after, 1, 1, 6));
  assert.equal(JSON.stringify(state), before);
  const reveal = liar(after, 1);
  assert.throws(() => bid(reveal, game.actor(reveal), 3, 4), /next round/);
  assert.throws(() => liar(reveal, game.actor(reveal)), /next round/);
  const out = table([[2], [3], [4]]);
  out.counts = [1, 0, 1];
  out.dice[1] = [];
  assert.throws(() => bid(out, 1, 1, 2), /out of this game/);
});

// Every value anywhere in a view, with its path.
function walk(value, path = 'view', found = []) {
  found.push({ path, value });
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`, found);
  return found;
}

test('a view hides every other hand in every field while bidding', () => {
  const rng = seededRng(21);
  for (let trial = 0; trial < 60; trial += 1) {
    let state = start({ names: NAMES.slice(0, 2 + (trial % 5)), seed: 100 + trial, first: trial % 2 });
    // Play into the game: a few rounds of bot moves, stopping mid-round.
    const moves = 3 + Math.floor(rng() * 30);
    for (let i = 0; i < moves && !game.outcome(state); i += 1) {
      const seat = game.actor(state);
      state = game.apply(state, seat, game.bot(game.view(state, seat), seat, 'normal', rng), rng);
    }
    if (state.phase === 'over') continue;
    if (state.phase === 'reveal') state = game.apply(state, game.actor(state), { type: 'next' }, rng);
    for (let seat = -1; seat < state.names.length; seat += 1) {
      const view = game.view(state, seat);
      assert.equal(game.needsPrivacy(state, seat), true);
      view.dice.forEach((hand, i) => {
        assert.equal(hand.length, state.dice[i].length, 'counts stay visible');
        if (i === seat) assert.deepEqual(hand, state.dice[i]);
        else assert.ok(hand.every((die) => die === 0), `seat ${seat} sees seat ${i}`);
      });
      // Re-roll everyone else’s dice: nothing in the view may change.
      const other = JSON.parse(JSON.stringify(state));
      other.dice = other.dice.map((hand, i) => (i === seat ? hand : hand.map((die) => (die % 6) + 1)));
      assert.deepEqual(game.view(other, seat), view, `the view for seat ${seat} depends on hidden dice`);
      // And no array anywhere holds another player’s hand.
      for (const { path, value } of walk(view)) {
        if (!Array.isArray(value) || !value.length || path === `view.dice.${seat}`) continue;
        state.dice.forEach((hand, i) => {
          if (i !== seat && hand.length && JSON.stringify(hand) !== JSON.stringify(state.dice[seat])) {
            assert.notDeepEqual(value, hand, `${path} leaks seat ${i}`);
          }
        });
      }
      // Bots decide from the view alone.
      if (seat >= 0) {
        assert.deepEqual(game.bot(game.view(other, seat), seat, 'hard', seededRng(5)), game.bot(view, seat, 'hard', seededRng(5)));
      }
    }
  }
});

test('the reveal shows every die, and needs no privacy', () => {
  let state = table([[1, 5, 5], [2, 3, 4], [6, 6, 1]]);
  state = bid(state, 0, 4, 5);
  assert.deepEqual(game.view(state, 1).dice, [[0, 0, 0], [2, 3, 4], [0, 0, 0]]);
  assert.deepEqual(game.view(state, -1).dice, [[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
  state = liar(state, 1);
  assert.equal(game.needsPrivacy(state, game.actor(state)), false);
  for (const seat of [-1, 0, 1, 2]) assert.deepEqual(game.view(state, seat).dice, [[1, 5, 5], [2, 3, 4], [6, 6, 1]]);
  // Applying never mutates: the view is a copy.
  const view = game.view(state, 0);
  view.dice[0][0] = 6;
  assert.equal(state.dice[0][0], 1);
});

test('log and status read correctly when a player is called You', () => {
  let state = table([[5, 5, 2], [3, 3, 3]], { first: 0 });
  assert.equal(game.status(state, 0, { canAct: true }), 'Your turn. Open the bidding.');
  assert.equal(game.status(state, 1, { canAct: false }), 'You to open.');
  state = bid(state, 0, 4, 5);
  assert.deepEqual(lastLog(state), ['You bid four 5s.']);
  assert.equal(game.status(state, 1, { canAct: true }), 'Your turn. Raise four 5s or call Liar.');
  assert.equal(game.status(state, 0, { canAct: false }), 'Pascal to bid.');
  assert.equal(bidText(1, 6), 'one 6');
  assert.equal(countText(0, 3), 'There were no 3s.');
  assert.equal(countText(1, 3), 'There was one 3.');
  const text = state.log.map((entry) => entry.text).join(' ');
  assert.doesNotMatch(text, /\b(wins|loses|is out|calls)\b/);
});

test('bid chances use own dice and, for hard, the bidding', () => {
  const state = table([[5, 5, 1, 2, 3], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]]);
  // Three 5s with three matches in hand is certain; one more needs one of ten dice at 1/3.
  assert.equal(bidChance(state, 0, 3, 5), 1);
  assert.ok(Math.abs(bidChance(state, 0, 4, 5) - (1 - (2 / 3) ** 10)) < 1e-9);
  const read = bid(table([[5, 5, 1, 2, 3], [4, 4, 4, 2, 2], [6, 6, 6, 6, 6]], { first: 1 }), 1, 3, 4);
  assert.ok(bidChance(read, 0, 6, 4, 0.6) > bidChance(read, 0, 6, 4));
});

function play(levels, rng, options = { wild: true, dice: 5 }) {
  let state = game.setup({ names: levels.map((_, i) => `P${i}`), options, rng, first: Math.floor(rng() * levels.length) });
  let steps = 0;
  while (!game.outcome(state)) {
    const seat = game.actor(state);
    const action = game.bot(game.view(state, seat), seat, levels[seat], rng);
    state = game.apply(state, seat, action, rng);
    steps += 1;
    assert.ok(steps < 2000, 'the game ends');
  }
  return { winner: game.outcome(state).winners[0], state };
}

test('bot games at every level and size finish', () => {
  const rng = seededRng(5);
  const levels = ['easy', 'normal', 'hard'];
  for (let i = 0; i < 90; i += 1) {
    const players = 2 + (i % 5);
    const seats = Array.from({ length: players }, (_, k) => levels[(i + k) % 3]);
    const { state } = play(seats, rng, { wild: i % 2 === 0, dice: i % 3 === 0 ? 3 : 5 });
    assert.equal(state.counts.filter((count) => count > 0).length, 1);
    assert.equal(game.actor(state), -1);
  }
});

// Seats rotate so no level always sits in the same place; returns level 0’s win rate.
function rate(levels, games, seed, options) {
  const rng = seededRng(seed);
  let wins = 0;
  for (let i = 0; i < games; i += 1) {
    const shift = i % levels.length;
    const seats = levels.map((_, k) => levels[(k + shift) % levels.length]);
    const { winner } = play(seats, rng, options);
    if ((winner + shift) % levels.length === 0) wins += 1;
  }
  return wins / games;
}

test('hard beats easy and normal over many seeded games', (t) => {
  const games = 400;
  const oneVsThree = rate(['hard', 'easy', 'easy', 'easy'], games, 31);
  const headsUp = rate(['hard', 'easy'], games, 32);
  const overNormal = rate(['hard', 'normal'], games, 33);
  const normalOverEasy = rate(['normal', 'easy'], games, 34);
  const noWild = rate(['hard', 'easy', 'easy', 'easy'], games, 35, { wild: false, dice: 5 });
  t.diagnostic(`hard 1v3 easy ${oneVsThree}, hard v easy ${headsUp}, hard v normal ${overNormal}, normal v easy ${normalOverEasy}, hard 1v3 easy (wild off) ${noWild}`);
  assert.ok(oneVsThree > 0.6, `hard won ${oneVsThree} against three easy bots`);
  assert.ok(noWild > 0.6, `hard won ${noWild} against three easy bots with wild ones off`);
  assert.ok(headsUp > 0.85, `hard won ${headsUp} heads-up against easy`);
  assert.ok(overNormal > 0.6, `hard won ${overNormal} heads-up against normal`);
  assert.ok(normalOverEasy > 0.85, `normal won ${normalOverEasy} heads-up against easy`);
});

test('a new host recovers a playable round from the spectator view', () => {
  const rng = seededRng(5);
  let state = game.setup({ names: ['A', 'B', 'C'], options: { wild: true, dice: 5 }, rng, first: 1 });
  state = game.apply(state, 1, { type: 'bid', quantity: 2, face: 4 }, rng);
  const copy = game.view(state, -1);
  assert.ok(copy.dice.every((dice) => dice.every((face) => face === 0)));
  const recovered = game.recover(copy, rng);
  assert.equal(recovered.phase, 'bid');
  assert.equal(recovered.turn, 2);
  assert.equal(recovered.bid, null);
  assert.equal(recovered.round, state.round);
  assert.deepEqual(recovered.dice.map((dice) => dice.length), state.counts);
  assert.ok(recovered.dice.flat().every((face) => face >= 1 && face <= 6));
});
