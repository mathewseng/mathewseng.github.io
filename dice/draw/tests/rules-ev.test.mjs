import test from 'node:test';
import assert from 'node:assert/strict';
import { settings, PAYTABLE, drawOutcomes, scoreHand, settlement, solveHand } from '../engine.mjs';
import { rulesEV, rulesEVKey } from '../rules-ev.mjs';
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

// Ordered openings and ordered replacement rolls: no shared partial-state DP.
function bruteRules(config) {
  function finish(kept, count) {
    if (!count) return settlement(scoreHand(kept, config, false).points, config).net;
    let total = 0;
    for (let face = 1; face <= 6; face++) total += finish([...kept, face], count - 1);
    return total / 6;
  }
  function opening(dice) {
    if (dice.length < config.n) {
      let total = 0;
      for (let face = 1; face <= 6; face++) total += opening([...dice, face]);
      return total / 6;
    }
    let best = -Infinity;
    for (let mask = 0; mask < 2 ** config.n; mask++) {
      const kept = dice.filter((_, i) => mask & (1 << i)), ev = finish(kept, config.n - kept.length);
      best = Math.max(best, ev, config.doubling && kept.length < config.n ? 2 * ev : -Infinity);
    }
    return best;
  }
  return opening([]);
}
test('full-game EV matches independent ordered brute force for each scoring and payout rule', () => {
  for (const scoring of ['cribbage', 'poker', 'yahtzee']) {
    const input = { n: 3, scoring, fee: 4, payouts: { pair: 3, 'run-3': 7 } };
    for (const profile of rulesEV(input).profiles) {
      for (const doubling of [false, true]) {
        const config = settings({ ...input, settlement: profile.mode === 'paytable' ? 'capped' : profile.mode, doubling });
        near(doubling ? profile.doubleEV : profile.singleEV, bruteRules(config));
      }
    }
  }
});
test('weighted opening-hand averages match the existing hold solver through seven dice', () => {
  for (const input of [
    { n: 4, runs: 'all', fee: 7 },
    { n: 5, scoring: 'poker', payouts: { pair: 2, 'run-3': 11, 'run-5': 2 } },
    { n: 5, scoring: 'yahtzee', fee: 28 },
    { n: 7, scoring: 'cribbage', fee: 19 },
  ]) {
    for (const profile of rulesEV(input).profiles) {
      const config = settings({ ...input, settlement: profile.mode === 'paytable' ? 'capped' : profile.mode, doubling: true });
      let single = 0, doubled = 0, noDraw = 0;
      for (const { dice, weight } of drawOutcomes(config.n)) {
        const result = solveHand(dice, config);
        single += weight * result.decisions.find(d => d.multiplier === 1).ev;
        doubled += weight * result.best.ev;
        noDraw += weight * settlement(scoreHand(dice, config, false).points, config).net;
      }
      near(profile.singleEV, single / 6 ** config.n);
      near(profile.doubleEV, doubled / 6 ** config.n);
      near(profile.oneRollEV, noDraw / 6 ** config.n);
    }
  }
});
test('every dice count uses safe integer numerators and optional decisions never reduce EV', () => {
  for (let n = 2; n <= 7; n++) for (const scoring of ['cribbage', 'yahtzee', 'poker']) {
    const payouts = Object.fromEntries(PAYTABLE.map(row => [row.key, 1000]));
    const result = rulesEV({ n, scoring, fee: 0, payouts });
    assert.equal(result.openings, 6 ** n);
    for (const profile of result.profiles) {
      assert.ok(Number.isSafeInteger(profile.singleNumerator));
      assert.ok(Number.isSafeInteger(profile.doubleNumerator));
      assert.equal(profile.denominator, 6 ** (2 * n));
      assert.ok(profile.doubleEV >= profile.singleEV);
      assert.ok(profile.singleEV >= profile.oneRollEV);
    }
  }
});
test('constant payouts never double a loss and net fees translate single-stake EV exactly', () => {
  const payouts = Object.fromEntries(PAYTABLE.map(row => [row.key, 0]));
  const empty = rulesEV({ n: 7, scoring: 'poker', payouts }).profiles[0];
  assert.equal(empty.singleEV, -1); assert.equal(empty.doubleEV, -1);
  const fee0 = rulesEV({ n: 5, fee: 0 }).profiles.find(p => p.mode === 'net');
  const fee200 = rulesEV({ n: 5, fee: 200 }).profiles.find(p => p.mode === 'net');
  near(fee200.singleEV, fee0.singleEV - 200);
  assert.equal(fee200.doubleEV, fee200.singleEV, 'a losing redraw is never doubled');
});
test('cache identity includes all effective rules and ignores fields the scoring does not use', () => {
  const a = rulesEVKey({ n: 5 });
  assert.equal(a, rulesEVKey({ n: 5, settlement: 'net', doubling: true, payouts: { pair: 7 } }));
  for (const input of [{ n: 6 }, { fee: 11 }, { runs: 'all' }, { scoring: 'poker' }]) assert.notEqual(a, rulesEVKey(input));
  const b = rulesEVKey({ n: 2, scoring: 'poker' });
  assert.equal(b, rulesEVKey({ n: 2, scoring: 'poker', fee: 200, runs: 'all', payouts: { 'run-3': 99 } }));
  assert.notEqual(b, rulesEVKey({ n: 2, scoring: 'poker', payouts: { pair: 99 } }));
});
