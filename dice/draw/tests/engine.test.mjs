import test from 'node:test';
import assert from 'node:assert/strict';
import { settings, cribbageScore, scoreHand, settlement, randomFace, newRound, finishRound, drawOutcomes, solveHand } from '../engine.mjs';

const group = (dice, label, rule) => cribbageScore(dice, rule).groups.find(g => g.label === label).points;
test('physical pairs and sums of six match the requested examples', () => {
  assert.equal(cribbageScore([6, 5]).points, 1);
  assert.equal(cribbageScore([3, 3]).points, 2);
  for (let n = 2; n <= 7; n++) {
    assert.equal(group(Array(n).fill(4), 'Pairs'), n * (n - 1) / 2);
    assert.equal(group(Array(n).fill(3), 'Sums of six'), n * (n - 1) / 2);
    assert.equal(group(Array(n).fill(6), 'Sums of six'), n);
  }
  assert.equal(group([1, 1, 1, 1, 1, 1, 1], 'Sums of six'), 7);
  assert.equal(group([2, 2, 2, 2, 2, 2, 2], 'Sums of six'), 35);
});
test('only longest runs count by default, with all duplicate combinations', () => {
  assert.equal(group([1, 2, 3, 4], 'Longest runs'), 4);
  assert.equal(group([1, 2, 2, 3], 'Longest runs'), 6);
  assert.equal(cribbageScore([1, 2, 2, 3]).points, 9);
  assert.equal(group([1, 1, 2, 2, 3, 3], 'Longest runs'), 24);
  assert.equal(group([1, 2, 3, 4, 5, 6, 6], 'Longest runs'), 12);
  assert.equal(group([1, 5, 6], 'Longest runs'), 0, 'no wraparound');
  assert.equal(group([1, 2, 3, 4], 'All runs', 'all'), 10);
});

// Independently choose index subsets to check counts and suppress nested runs.
function reference(dice, all = false) {
  let pairs = 0, sixes = 0;
  const lengths = [];
  for (let mask = 1; mask < 2 ** dice.length; mask++) {
    const subset = dice.filter((_, i) => mask & (1 << i)).sort((a, b) => a - b);
    if (subset.length === 2 && subset[0] === subset[1]) pairs++;
    if (subset.reduce((a, b) => a + b, 0) === 6) sixes++;
    if (subset.length >= 3 && subset.every((face, i) => !i || face === subset[i - 1] + 1)) lengths.push(subset.length);
  }
  const longest = Math.max(0, ...lengths);
  return pairs + sixes + lengths.filter(n => all || n === longest).reduce((a, b) => a + b, 0);
}
test('both run rules match independent subset scoring for every unordered 2–7 die hand', () => {
  for (let n = 2; n <= 7; n++) for (const { dice } of drawOutcomes(n)) {
    for (const rule of ['longest', 'all']) assert.equal(cribbageScore(dice, rule).points, reference(dice, rule === 'all'), `${dice} ${rule}`);
    const detailed = cribbageScore(dice);
    assert.equal(detailed.groups.reduce((total, g) => total + g.items.reduce((a, item) => a + item.points, 0), 0), detailed.points);
  }
});
test('all draw distributions conserve ordered probability through seven dice', () => {
  for (let n = 0; n <= 7; n++) {
    const outcomes = drawOutcomes(n);
    assert.equal(outcomes.reduce((total, row) => total + row.weight, 0), 6 ** n);
    assert.equal(new Set(outcomes.map(row => row.dice.join(''))).size, outcomes.length);
    assert.ok(outcomes.every(row => Number.isInteger(row.weight) && row.dice.length === n));
  }
});
test('category paytable pays the best eligible subset once; straight limits follow d6 faces', () => {
  const c = settings({ n: 7, scoring: 'poker' });
  assert.equal(scoreHand([1, 2, 3, 4, 5, 6, 6], c).points, 16);
  assert.equal(scoreHand([1, 1, 1, 2, 2, 3, 3], c).points, 5);
  assert.equal(scoreHand([1, 1, 1, 1, 1, 1, 1], c).points, 100);
  const custom = settings({ n: 5, scoring: 'poker', payouts: { 'run-3': 19, 'run-4': 0, 'run-5': 0 } });
  assert.equal(scoreHand([1, 2, 3, 4, 5], custom).points, 19);
  const house = settings({ n: 5, scoring: 'poker', payouts: { house: 90 } });
  assert.equal(scoreHand([3, 3, 3, 3, 3], house).points, 20, 'full house needs two different faces');
});
test('Yahtzee-style uses only the highest scoring category, with chance for all counts', () => {
  assert.equal(scoreHand([5, 6], settings({ n: 2, scoring: 'yahtzee' })).points, 11);
  assert.equal(scoreHand([1, 2, 3, 4, 5], settings({ scoring: 'yahtzee' })).points, 40);
  assert.equal(scoreHand([6, 6, 6, 5, 5], settings({ scoring: 'yahtzee' })).points, 28, 'chance/trips can beat full house');
  assert.equal(scoreHand([1, 1, 1, 1, 1, 1, 1], settings({ n: 7, scoring: 'yahtzee' })).points, 100);
});
test('capped and points-minus-fee modes settle with the video poker formulas', () => {
  for (const multiplier of [1, 2]) {
    const capped = settings({ doubling: true, fee: 10 });
    assert.equal(settlement(0, capped, multiplier).net, -multiplier);
    assert.equal(settlement(10, capped, multiplier).net, -multiplier);
    assert.equal(settlement(11, capped, multiplier).net, 0);
    assert.equal(settlement(14, capped, multiplier).net, 3 * multiplier);
    const net = settings({ ...capped, settlement: 'net' });
    assert.equal(settlement(0, net, multiplier).net, -10 * multiplier);
    assert.equal(settlement(10, net, multiplier).net, 0);
    assert.equal(settlement(14, net, multiplier).net, 4 * multiplier);
    assert.equal(settlement(5, settings({ scoring: 'poker', doubling: true }), multiplier).net, 4 * multiplier);
  }
});
test('unbiased sampling rejects the incomplete tail; all seven dice are supported', () => {
  const entropy = [4294967295, 4294967292, 4294967291];
  assert.equal(randomFace(() => entropy.shift()), 6);
  assert.throws(() => randomFace(() => -1));
  assert.equal(newRound({ n: 7 }, () => 0).dice.length, 7);
});
test('held dice survive, one draw settles once, and standing cannot double', () => {
  const values = [0, 1, 2, 3, 4];
  const round = newRound({ doubling: true }, () => values.shift());
  round.held = [true, false, true, false, true];
  const result = finishRound(round, { double: true, randomUint32: () => 5 });
  assert.deepEqual(result.dice, [1, 6, 3, 6, 5]);
  assert.equal(result.result.multiplier, 2);
  assert.deepEqual(result.decision, { dice: [1, 2, 3, 4, 5], mask: 21, multiplier: 2 }, 'the opening roll and actual doubled hold survive settlement');
  assert.notEqual(result.decision.dice, round.dice, 'the saved opening roll is an independent snapshot');
  assert.throws(() => finishRound(result));
  assert.throws(() => finishRound(round, { stand: true, double: true }));
  round.held.fill(true);
  assert.throws(() => finishRound(round, { double: true }));
  assert.deepEqual(finishRound(round, { randomUint32: () => assert.fail('Standing must not sample') }).dice, round.dice);
  round.held.fill(false);
  assert.deepEqual(finishRound(round, { stand: true }).decision, { dice: [1, 2, 3, 4, 5], mask: 31, multiplier: 1 }, 'Keep all records the actual stand, regardless of marked holds');
});
function bruteDraw(kept, count, config) {
  if (!count) return settlement(scoreHand(kept, config).points, config).net;
  let total = 0;
  for (let face = 1; face <= 6; face++) total += bruteDraw([...kept, face], count - 1, config);
  return total / 6;
}
test('every solver decision matches ordered brute-force draws for all scoring/payout modes', () => {
  for (const scoring of ['cribbage', 'poker', 'yahtzee']) for (const mode of ['capped', 'net']) {
    const config = settings({ n: 3, scoring, settlement: mode, fee: 3, doubling: true });
    const dice = [2, 3, 3], solved = solveHand(dice, config);
    assert.equal(solved.decisions.length, 15);
    for (const decision of solved.decisions) {
      const kept = dice.filter((_, i) => decision.mask & (1 << i));
      assert.ok(Math.abs(decision.ev - bruteDraw(kept, 3 - kept.length, config) * decision.multiplier) < 1e-10);
    }
    assert.equal(solved.best.ev, Math.max(...solved.decisions.map(d => d.ev)));
  }
});
test('seven dice solve exactly, with no doubled stand and single stake preferred on ties', () => {
  const result = solveHand([1, 2, 2, 3, 4, 5, 6], settings({ n: 7, doubling: true }));
  assert.equal(result.decisions.length, 255);
  assert.ok(!result.decisions.some(d => d.mask === 127 && d.multiplier === 2));
  const flat = solveHand([1, 1], settings({ n: 2, scoring: 'poker', doubling: true, payouts: { pair: 1 } }));
  assert.equal(flat.best.multiplier, 1);
});
test('invalid rules and faces fail before play', () => {
  for (const invalid of [{ n: 1 }, { n: 8 }, { fee: -1 }, { fee: 2.5 }, { scoring: 'x' }, { runs: 'x' }, { payouts: { pair: 0.5 } }]) assert.throws(() => settings(invalid));
  assert.throws(() => scoreHand([0, 3], settings({ n: 2 })));
  assert.throws(() => settlement(3, settings(), 2));
});
