import test from 'node:test';
import assert from 'node:assert/strict';
import { candidates } from '../engine.mjs';
import { keyPitch } from '../key-rules.mjs';
import { rankedFingerings } from '../ranking.mjs';

test('the ranked chart includes each eligible pattern exactly once for each supported note and register', () => {
  const expected = new Map();
  for (let mask = 0; mask < 8192; mask++) {
    const bits = mask.toString(2).padStart(13, '0');
    if (bits.startsWith('01')) continue;
    const { midi: base } = keyPitch(bits);
    for (let shift = -2; shift <= 4; shift++) {
      const midi = base + shift * 12;
      if (midi < 34 || midi > 111) continue;
      if (!expected.has(midi)) expected.set(midi, new Set());
      expected.get(midi).add(`${shift}:${bits}`);
    }
  }
  for (let midi = 34; midi <= 111; midi++) {
    const actual = rankedFingerings(midi);
    assert.equal(actual.length, expected.get(midi).size);
    assert.deepEqual(new Set(actual.map(f => `${f.shift}:${f.bits}`)), expected.get(midi));
    assert.ok(candidates(midi).every(f => !f.bits.startsWith('01')), 'the planner also follows the bis rule');
  }
});

test('E preserves circle binary order and a more comfortable single side key outranks a higher binary value', () => {
  const options = rankedFingerings(64);
  assert.deepEqual(options.filter(f => f.sideCount === 0).map(f => f.mainValue.toString(2)), ['111110', '111011', '101111']);
  const pinky = options.find(f => f.bits === '1011100101000');
  const bis = options.find(f => f.bits === '1111000110000');
  assert.equal(pinky.sideCount, bis.sideCount);
  assert.deepEqual([pinky.comfortCost, bis.comfortCost], [0, 1]);
  assert.ok(pinky.rank < bis.rank);
});

test('fewest keys down reorders G and retains the circle-only priority', () => {
  assert.deepEqual(rankedFingerings(67).slice(0, 3).map(f => f.heldCount), [3, 4, 3]);
  const held = rankedFingerings(67, 'held');
  assert.deepEqual(held.slice(0, 3).map(f => f.heldCount), [3, 3, 3]);
  const firstSide = held.findIndex(f => f.sideCount > 0);
  assert.equal(firstSide, 9);
  assert.ok(held.slice(firstSide).every(f => f.sideCount > 0));
});
