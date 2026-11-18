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
  assert.deepEqual(options.slice(0, 3).map(f => f.bits), ['1011000110000', '1011000011000', '1001000111000']);
  const oneFingerPerKey = options.find(f => f.bits === '1011010100000');
  const sharedFinger = options.find(f => f.bits === '1111100101000');
  assert.equal(oneFingerPerKey.sideCount, sharedFinger.sideCount);
  assert.deepEqual([oneFingerPerKey.comfortCost, sharedFinger.comfortCost], [0, 1]);
  assert.ok(oneFingerPerKey.mainValue < sharedFinger.mainValue);
  assert.ok(oneFingerPerKey.rank < sharedFinger.rank);
});

test('bis counts toward total keys down and comfort and ranks ahead of other side touches', () => {
  const options = rankedFingerings(64);
  const bis = options.find(f => f.bits === '1111000110000');
  assert.equal(bis.sideCount, 0);
  assert.equal(bis.sideValue, 0);
  assert.equal(bis.mainValue, 0b1111110);
  assert.equal(bis.heldCount, 6);
  assert.equal(bis.comfortCost, 1);
  assert.ok(bis.rank < options.find(f => f.sideCount > 0).rank);
});

test('the standalone bis roll ranks first for B♭ at every available register', () => {
  for (let shift = -2; shift <= 3; shift++) {
    const [first] = rankedFingerings(70 + shift * 12);
    assert.equal(first.bits, '1100000000000');
    assert.equal(first.shift, shift);
    assert.equal(first.heldCount, 2);
    assert.equal(first.sideCount, 0);
    assert.equal(first.comfortCost, 0);
  }
});
