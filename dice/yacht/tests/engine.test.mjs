import test from 'node:test';
import assert from 'node:assert/strict';
import { game, scoreBox, rawScore, legalBoxes, emptyCard, totals, bestBox, planKeep, BOX_IDS, UPPER, loadSolver, solverReady, expectedFromStart, advise, sameAction } from '../engine.mjs';
import { STATE_COUNT } from '../solver.mjs';
import { seededRng } from '../../table-core.mjs';

// The solver table loads once; after that advise and the hard bot answer synchronously.
const values = await loadSolver();

// An rng that rolls the given faces in order.
const fixed = (...faces) => {
  let i = 0;
  return () => (faces[i++ % faces.length] - 1) / 6 + 0.01;
};
const card = (filled = {}) => ({ ...emptyCard(), ...filled });
const fill = (ids, value = 0) => Object.fromEntries(ids.map((id) => [id, value]));

function playGame(levels, rng) {
  let state = game.setup({ names: levels.map((_, i) => `P${i}`), options: {}, first: 0 });
  let moves = 0;
  while (!game.outcome(state)) {
    const seat = game.actor(state);
    state = game.apply(state, seat, game.bot(game.view(state, seat), seat, levels[seat], rng), rng);
    moves += 1;
    assert.ok(moves < 1000, 'the game should end');
  }
  return state;
}

test('upper boxes count the matching faces', () => {
  const dice = [1, 1, 2, 6, 1];
  assert.equal(scoreBox(dice, 'ones'), 3);
  assert.equal(scoreBox(dice, 'twos'), 2);
  assert.equal(scoreBox(dice, 'threes'), 0);
  assert.equal(scoreBox(dice, 'sixes'), 6);
  assert.equal(scoreBox([5, 5, 5, 5, 2], 'fives'), 20);
});

test('three and four of a kind score the sum of all dice', () => {
  assert.equal(scoreBox([3, 3, 3, 4, 5], 'threeKind'), 18);
  assert.equal(scoreBox([3, 3, 4, 4, 5], 'threeKind'), 0);
  assert.equal(scoreBox([2, 2, 2, 2, 5], 'threeKind'), 13);
  assert.equal(scoreBox([2, 2, 2, 2, 5], 'fourKind'), 13);
  assert.equal(scoreBox([2, 2, 2, 5, 5], 'fourKind'), 0);
  assert.equal(scoreBox([6, 6, 6, 6, 6], 'threeKind'), 30);
  assert.equal(scoreBox([6, 6, 6, 6, 6], 'fourKind'), 30);
});

test('a full house needs three of one face and two of another', () => {
  assert.equal(scoreBox([2, 3, 2, 3, 3], 'fullHouse'), 25);
  assert.equal(scoreBox([2, 2, 3, 3, 4], 'fullHouse'), 0);
  assert.equal(scoreBox([2, 2, 2, 2, 3], 'fullHouse'), 0);
  // Five alike is not a plain full house: only the joker rule makes it one.
  assert.equal(scoreBox([4, 4, 4, 4, 4], 'fullHouse'), 0);
  assert.equal(scoreBox([4, 4, 4, 4, 4], 'fullHouse', card({ yacht: 0 })), 0);
});

test('straights need four or five consecutive faces, duplicates allowed', () => {
  assert.equal(scoreBox([1, 2, 3, 4, 4], 'smallStraight'), 30);
  assert.equal(scoreBox([6, 1, 4, 3, 5], 'smallStraight'), 30);
  assert.equal(scoreBox([2, 3, 4, 5, 5], 'smallStraight'), 30);
  assert.equal(scoreBox([1, 2, 3, 5, 6], 'smallStraight'), 0);
  assert.equal(scoreBox([1, 2, 3, 4, 5], 'smallStraight'), 30);
  assert.equal(scoreBox([5, 3, 4, 2, 1], 'largeStraight'), 40);
  assert.equal(scoreBox([2, 3, 4, 5, 6], 'largeStraight'), 40);
  assert.equal(scoreBox([1, 2, 3, 4, 4], 'largeStraight'), 0);
  assert.equal(scoreBox([1, 2, 3, 4, 6], 'largeStraight'), 0);
});

test('Yacht scores 50 for five alike and Chance scores the sum', () => {
  assert.equal(scoreBox([5, 5, 5, 5, 5], 'yacht'), 50);
  assert.equal(scoreBox([5, 5, 5, 5, 4], 'yacht'), 0);
  assert.equal(scoreBox([6, 5, 4, 1, 1], 'chance'), 17);
  assert.throws(() => rawScore([1, 2, 3, 4, 5], 'bogus'));
});

test('the upper bonus starts at exactly 63', () => {
  const state = game.setup({ names: ['A'], options: {}, first: 0 });
  state.cards[0] = card({ ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 });
  assert.deepEqual(totals(state, 0), { upper: 63, bonus: 35, lower: 0, yachtBonus: 0, total: 98 });
  state.cards[0].ones = 2;
  assert.equal(totals(state, 0).bonus, 0);
  assert.equal(totals(state, 0).total, 62);
});

test('scoring the box that reaches 63 adds the bonus and logs it', () => {
  let state = game.setup({ names: ['A'], options: {}, first: 0 });
  Object.assign(state.cards[0], { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15 });
  state = game.apply(state, 0, { type: 'roll' }, fixed(6, 6, 6, 2, 1));
  state = game.apply(state, 0, { type: 'score', box: 'sixes' }, fixed(1));
  assert.equal(totals(state, 0).bonus, 35);
  assert.equal(totals(state, 0).total, 98);
  assert.match(state.log.at(-1).text, /scored 18 in Sixes and the 35 upper bonus/);
});

test('an extra Yacht earns 100 and must take its upper box first', () => {
  const yacht = [4, 4, 4, 4, 4];
  const scored = card({ yacht: 50 });
  assert.deepEqual(legalBoxes(yacht, scored), ['fours']);
  let state = game.setup({ names: ['A', 'B'], options: {}, first: 0 });
  state.cards[0].yacht = 50;
  state = game.apply(state, 0, { type: 'roll' }, fixed(4));
  assert.throws(() => game.apply(state, 0, { type: 'score', box: 'fullHouse' }, fixed(1)), /Fours/);
  state = game.apply(state, 0, { type: 'score', box: 'fours' }, fixed(1));
  assert.equal(state.cards[0].fours, 20);
  assert.equal(state.yachtBonus[0], 100);
  assert.equal(totals(state, 0).total, 170);
  assert.match(state.log.at(-1).text, /scored 20 in Fours and a 100 Yacht bonus/);
});

test('with its upper box filled a joker scores any lower box in full', () => {
  const yacht = [4, 4, 4, 4, 4];
  const filled = card({ yacht: 50, fours: 12 });
  assert.deepEqual(legalBoxes(yacht, filled), ['threeKind', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'chance']);
  assert.equal(scoreBox(yacht, 'fullHouse', filled), 25);
  assert.equal(scoreBox(yacht, 'smallStraight', filled), 30);
  assert.equal(scoreBox(yacht, 'largeStraight', filled), 40);
  assert.equal(scoreBox(yacht, 'threeKind', filled), 20);
  assert.equal(scoreBox(yacht, 'chance', filled), 20);
  let state = game.setup({ names: ['A'], options: {}, first: 0 });
  Object.assign(state.cards[0], { yacht: 50, fours: 12 });
  state = game.apply(state, 0, { type: 'roll' }, fixed(4));
  assert.throws(() => game.apply(state, 0, { type: 'score', box: 'ones' }, fixed(1)), /lower box/);
  state = game.apply(state, 0, { type: 'score', box: 'largeStraight' }, fixed(1));
  assert.equal(state.cards[0].largeStraight, 40);
  assert.equal(state.yachtBonus[0], 100);
});

test('with every lower box filled a joker puts 0 in an upper box', () => {
  const yacht = [2, 2, 2, 2, 2];
  const full = card({ ...fill(['threeKind', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'chance'], 10), yacht: 50, twos: 6 });
  assert.deepEqual(legalBoxes(yacht, full), ['ones', 'threes', 'fours', 'fives', 'sixes']);
  let state = game.setup({ names: ['A'], options: {}, first: 0 });
  Object.assign(state.cards[0], full);
  state = game.apply(state, 0, { type: 'roll' }, fixed(2));
  state = game.apply(state, 0, { type: 'score', box: 'sixes' }, fixed(1));
  assert.equal(state.cards[0].sixes, 0);
  assert.equal(state.yachtBonus[0], 100);
});

test('a zero in the Yacht box gives no bonus and no joker', () => {
  const yacht = [3, 3, 3, 3, 3];
  const zeroed = card({ yacht: 0 });
  assert.equal(legalBoxes(yacht, zeroed).length, 12);
  assert.equal(scoreBox(yacht, 'largeStraight', zeroed), 0);
  let state = game.setup({ names: ['A'], options: {}, first: 0 });
  state.cards[0].yacht = 0;
  state = game.apply(state, 0, { type: 'roll' }, fixed(3));
  state = game.apply(state, 0, { type: 'score', box: 'chance' }, fixed(1));
  assert.equal(state.cards[0].chance, 15);
  assert.equal(state.yachtBonus[0], 0);
});

test('rolling keeps the chosen dice, records the mask and counts rolls', () => {
  let state = game.setup({ names: ['A', 'B'], options: {}, first: 1 });
  assert.equal(game.actor(state), 1);
  state = game.apply(state, 1, { type: 'roll', keep: [0, 1] }, fixed(1, 2, 3, 4, 5));
  assert.deepEqual(state.dice, [1, 2, 3, 4, 5]);
  assert.deepEqual(state.kept, [false, false, false, false, false]);
  assert.equal(state.rollId, 1);
  state = game.apply(state, 1, { type: 'roll', keep: [4, 1] }, fixed(6, 6, 6));
  assert.deepEqual(state.dice, [6, 2, 6, 6, 5]);
  assert.deepEqual(state.kept, [false, true, false, false, true]);
  assert.equal(state.rollId, 2);
  assert.equal(state.rollsUsed, 2);
  state = game.apply(state, 1, { type: 'score', box: 'sixes' }, fixed(1));
  assert.equal(state.cards[1].sixes, 18);
  assert.deepEqual(state.dice, []);
  assert.equal(state.rollsUsed, 0);
  assert.deepEqual(state.last, { seat: 1, box: 'sixes', score: 18, bonus: 0 });
  assert.equal(game.actor(state), 0);
  assert.equal(state.log.at(-1).text, 'scored 18 in Sixes.');
});

test('illegal moves throw and never change the state', () => {
  const start = game.setup({ names: ['A', 'B'], options: {}, first: 0 });
  const before = JSON.stringify(start);
  assert.throws(() => game.apply(start, 1, { type: 'roll' }, fixed(1)), /not your turn/);
  assert.throws(() => game.apply(start, 0, { type: 'score', box: 'chance' }, fixed(1)), /Roll before/);
  assert.throws(() => game.apply(start, 0, { type: 'hold' }, fixed(1)), /Unknown move/);
  let state = game.apply(start, 0, { type: 'roll' }, fixed(1, 2, 3, 4, 6));
  assert.throws(() => game.apply(state, 0, { type: 'score', box: 'bogus' }, fixed(1)), /Unknown box/);
  assert.throws(() => game.apply(state, 0, { type: 'roll', keep: [0, 1, 2, 3, 4] }, fixed(1)), /Release/);
  assert.throws(() => game.apply(state, 0, { type: 'roll', keep: [5] }, fixed(1)));
  assert.throws(() => game.apply(state, 0, { type: 'roll', keep: [1, 1] }, fixed(1)));
  assert.throws(() => game.apply(state, 0, { type: 'roll', keep: '0' }, fixed(1)));
  state = game.apply(state, 0, { type: 'roll', keep: [0] }, fixed(5));
  const third = game.apply(state, 0, { type: 'roll', keep: [] }, fixed(5));
  const frozen = JSON.stringify(third);
  assert.throws(() => game.apply(third, 0, { type: 'roll', keep: [] }, fixed(5)), /No rolls left/);
  assert.equal(JSON.stringify(third), frozen);
  let next = game.apply(third, 0, { type: 'score', box: 'chance' }, fixed(1));
  next = game.apply(next, 1, { type: 'roll' }, fixed(2));
  next = game.apply(next, 1, { type: 'score', box: 'twos' }, fixed(1));
  next = game.apply(next, 0, { type: 'roll' }, fixed(3));
  assert.throws(() => game.apply(next, 0, { type: 'score', box: 'chance' }, fixed(1)), /already filled/);
  assert.equal(JSON.stringify(start), before);
});

test('ties share the win and the finished game takes no moves', () => {
  let state = game.setup({ names: ['You', 'Pascal'], options: {}, first: 0 });
  const nearly = fill(BOX_IDS.filter((id) => id !== 'chance'), 0);
  state.cards = [card(nearly), card(nearly)];
  state = game.apply(state, 0, { type: 'roll' }, fixed(1, 2, 3, 4, 5));
  state = game.apply(state, 0, { type: 'score', box: 'chance' }, fixed(1));
  assert.equal(game.outcome(state), null);
  state = game.apply(state, 1, { type: 'roll' }, fixed(5, 4, 3, 2, 1));
  state = game.apply(state, 1, { type: 'score', box: 'chance' }, fixed(1));
  assert.deepEqual(game.outcome(state), { winners: [0, 1], text: 'You and Pascal tied on 15.' });
  assert.equal(game.actor(state), -1);
  assert.throws(() => game.apply(state, 0, { type: 'roll' }, fixed(1)));
});

test('hard keeps the obvious dice and fills boxes sensibly', () => {
  const empty = emptyCard();
  const plan = planKeep([6, 2, 6, 6, 6], empty, 2, 'hard');
  assert.deepEqual(plan.keep(plan.options[0].k), [0, 2, 3, 4]);
  assert.equal(bestBox([2, 3, 4, 5, 6], empty, 'hard'), 'largeStraight');
  assert.equal(bestBox([3, 3, 5, 5, 5], empty, 'hard'), 'fullHouse');
  assert.equal(bestBox([1, 1, 1, 1, 1], empty, 'hard'), 'yacht');
  assert.equal(bestBox([5, 5, 5, 5, 5], card({ yacht: 50 }), 'hard'), 'fives');
  assert.deepEqual(game.bot({ ...game.setup({ names: ['A'], options: {}, first: 0 }) }, 0, 'normal', seededRng(1)), { type: 'roll', keep: [] });
});

// ---------- Exact solver ----------

// A position on seat 0's turn: `filled` boxes on the card, `dice` after `rollsUsed` rolls.
function position(dice, rollsUsed, filled = {}) {
  const state = game.setup({ names: ['A', 'B'], options: {}, first: 0 });
  Object.assign(state.cards[0], filled);
  state.dice = dice;
  state.rollsUsed = rollsUsed;
  return state;
}

test('the solver table loads with every reachable state', () => {
  assert.ok(solverReady());
  assert.equal(values.length, STATE_COUNT);
  assert.ok(values.every((v) => Number.isFinite(v) && v >= 0 && v < 400));
});

test('optimal play from the empty card expects 254.48 under these rules', () => {
  // Verhoeff's 254.5896 lets a Yacht in a 0 Yacht box still joker and never forces its upper
  // box; with Yacht's forced joker that needs 50 in the Yacht box, the optimum is 254.4848.
  const start = expectedFromStart(emptyCard());
  assert.ok(Math.abs(start - 254.4848) < 0.001, `got ${start}`);
  const first = advise(game.setup({ names: ['A'], options: {}, first: 0 }), 0);
  assert.equal(first.options.length, 1);
  assert.equal(first.best.type, 'roll');
  assert.equal(first.options[0].display, '254.5 expected');
  assert.equal(first.exact, true);
  assert.equal(first.metric, 'Expected final score');
});

test('advice takes a rolled Yacht and the obvious keeps', () => {
  let advice = advise(position([4, 4, 4, 4, 4], 1), 0);
  assert.deepEqual(advice.best, { type: 'score', box: 'yacht' });
  assert.equal(advice.options[0].label, 'Score Yacht (50)');
  // Every legal box and every distinct keep of 0–4 dice (5 here: none to four Fours).
  assert.equal(advice.options.length, 13 + 5);
  assert.ok(advice.options.some((o) => o.label === 'Reroll all'));
  assert.ok(advice.options.every((o, i) => i === 0 || o.value <= advice.options[i - 1].value));

  advice = advise(position([6, 2, 6, 6, 1], 1), 0);
  assert.equal(advice.options[0].label, 'Keep 6 6 6');
  assert.deepEqual(advice.best, { type: 'roll', keep: [0, 2, 3], faces: [6, 6, 6] });

  advice = advise(position([2, 3, 4, 5, 6], 1), 0);
  assert.deepEqual(advice.best, { type: 'score', box: 'largeStraight' });

  advice = advise(position([1, 2, 3, 4, 6], 2), 0);
  assert.equal(advice.options[0].label, 'Keep 1 2 3 4');

  // After the third roll only the boxes remain.
  advice = advise(position([3, 3, 5, 5, 5], 3), 0);
  assert.ok(advice.options.every((o) => o.action.type === 'score'));
  assert.deepEqual(advice.best, { type: 'score', box: 'fullHouse' });

  // A joker Yacht must take Fives, with the 100 bonus.
  advice = advise(position([5, 5, 5, 5, 5], 3, { yacht: 50 }), 0);
  assert.equal(advice.options.length, 1);
  assert.equal(advice.options[0].label, 'Score Fives (25 + 100 bonus)');

  // Expected totals count the points already on the card.
  const later = position([1, 1, 2, 3, 3], 3, { sixes: 24, chance: 20 });
  assert.ok(advise(later, 0).options[0].value > 44);
  assert.equal(advise(later, 1), null);
});

test('keeps compare as multisets of faces', () => {
  assert.ok(sameAction({ type: 'roll', keep: [0, 1], faces: [5, 5] }, { type: 'roll', keep: [3, 4], faces: [5, 5] }));
  assert.ok(!sameAction({ type: 'roll', keep: [0, 1], faces: [5, 5] }, { type: 'roll', keep: [0, 2], faces: [5, 6] }));
  assert.ok(sameAction({ type: 'roll', keep: [2, 0] }, { type: 'roll', keep: [0, 2] }));
  assert.ok(sameAction({ type: 'score', box: 'chance' }, { type: 'score', box: 'chance' }));
  assert.ok(!sameAction({ type: 'score', box: 'chance' }, { type: 'roll', keep: [] }));
});

test('hard plays the best move and loads the table if it has to', async () => {
  const state = position([2, 2, 5, 6, 2], 2);
  assert.deepEqual(game.bot(state, 0, 'hard', seededRng(1)), advise(state, 0).best);
  const rng = seededRng(9);
  let s = game.setup({ names: ['A'], options: {}, first: 0 });
  while (!game.outcome(s)) {
    const action = game.bot(s, 0, 'hard', rng);
    assert.deepEqual(action, advise(s, 0).best);
    s = game.apply(s, 0, action, rng);
  }
  assert.deepEqual(await game.advise(position([4, 4, 4, 4, 4], 1), 0).best, { type: 'score', box: 'yacht' });
});

test('full bot games end with all 13 boxes filled for every player', () => {
  const rng = seededRng(5);
  for (const levels of [['hard'], ['easy', 'normal', 'hard', 'easy']]) {
    const state = playGame(levels, rng);
    for (const entry of state.cards) assert.ok(BOX_IDS.every((id) => Number.isInteger(entry[id])));
    assert.equal(state.cards.length, levels.length);
    const outcome = game.outcome(state);
    const scores = levels.map((_, i) => totals(state, i).total);
    assert.deepEqual(outcome.winners, scores.map((s, i) => (s === Math.max(...scores) ? i : -1)).filter((i) => i >= 0));
    assert.ok(UPPER.every((id) => state.cards[0][id] % (UPPER.indexOf(id) + 1) === 0));
  }
});

test('the same seed replays the same game', () => {
  const a = playGame(['normal', 'hard'], seededRng(42));
  const b = playGame(['normal', 'hard'], seededRng(42));
  assert.deepEqual(a.cards, b.cards);
});

test('hard averages over 250 alone and beats normal head to head', () => {
  const rng = seededRng(2026);
  const solo = 600;
  let total = 0;
  for (let i = 0; i < solo; i += 1) total += totals(playGame(['hard'], rng), 0).total;
  // The optimum is 254.5 with a standard deviation near 60, so 600 games err by about 2.5.
  assert.ok(total / solo >= 250, `hard averaged ${total / solo}`);
  let hardWins = 0;
  let normalWins = 0;
  const games = 600;
  for (let i = 0; i < games; i += 1) {
    const levels = i % 2 ? ['hard', 'normal'] : ['normal', 'hard'];
    const winners = game.outcome(playGame(levels, rng)).winners;
    if (winners.length !== 1) continue;
    if (levels[winners[0]] === 'hard') hardWins += 1; else normalWins += 1;
  }
  console.log(`hard averaged ${(total / solo).toFixed(1)} alone; against normal hard won ${hardWins}, normal ${normalWins} of ${games}`);
  assert.ok(hardWins > normalWins, `hard won ${hardWins}, normal ${normalWins}`);
});
