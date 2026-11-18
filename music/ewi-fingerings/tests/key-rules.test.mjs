import test from 'node:test';
import assert from 'node:assert/strict';
import { FINGERINGS } from '../engine.mjs';
import { KEY_RULES, keyPitch, keyEffect, toggleKey } from '../key-rules.mjs';
import { staffLayout, staffSvg } from '../notation.mjs';

const bits = (...keys) => Array.from({ length: 13 }, (_, i) => keys.includes(i + 1) ? '1' : '0').join('');

test('pitch arithmetic agrees with every library entry, including repaired low C', () => {
  for (const f of FINGERINGS) {
    for (let register = -2; register <= 4; register++) assert.equal(keyPitch(f.bits, register).midi, f.base + register * 12, f.id);
  }
});

test('conditional key effects are total audible changes, not just fixed contributions', () => {
  assert.equal(keyPitch(bits()).midi, 73);
  assert.equal(keyEffect(bits(3), 0).delta, -3, 'adding K1 to K3 also changes K3');
  assert.equal(keyEffect(bits(2, 3), 0).delta, -2, 'bis offset changes the K1 total');
  assert.equal(keyEffect(bits(), 1).delta, -1, 'K2 alone lowers one semitone');
  assert.equal(keyEffect(bits(3), 1).delta, -1, 'K2 still lowers with K3 when K1 is up');
  assert.equal(keyEffect(bits(1, 3), 1).delta, 0, 'K2 ignored when K1 and K3 held');
  assert.equal(keyEffect(bits(1), 2).delta, -2);
  assert.equal(keyEffect(bits(1, 2), 2).delta, -1);
  assert.equal(keyEffect(bits(8), 3).delta, -3, 'K4 changes a held K8');
  assert.equal(keyEffect(bits(4), 7).delta, -2);
  assert.equal(keyEffect(bits(), 7).delta, -1);
  const { midi, contributions } = keyPitch(bits(4, 8));
  assert.deepEqual([contributions[3], contributions[7]], [-2, -2]);
  assert.equal(midi - keyPitch(bits()).midi, -4);
});

test('K5 and K7 are one shared raise, while K11 can add another semitone', () => {
  assert.equal(keyPitch(bits(5)).midi, 74);
  assert.equal(keyPitch(bits(7)).midi, 74);
  const { midi, contributions } = keyPitch(bits(5, 7));
  assert.equal(midi, 74);
  assert.deepEqual([contributions[4], contributions[6]], [1, 0]);
  assert.equal(keyPitch(bits(5, 7, 11)).midi, 75);
  assert.equal(keyEffect(bits(5), 6).delta, 0);
});

test('every possible input stays within the documented net changes and fixed contributions', () => {
  const actual = Array.from({ length: 13 }, () => new Set());
  const expected = [[-3, -2], [-1, 0], [-2, -1], [-3, -2], [0, 1], [-1], [0, 1], [-2, -1], [-1], [-2], [1], [-1], [-2]];
  for (let mask = 0; mask < 8192; mask++) {
    const pattern = mask.toString(2).padStart(13, '0');
    const { midi, contributions } = keyPitch(pattern);
    assert.ok(midi >= 58 && midi <= 75);
    for (const [i, rule] of KEY_RULES.entries()) {
      actual[i].add(keyEffect(pattern, i).delta);
      if (rule.kind === 'Fixed' && pattern[i] === '1') assert.equal(contributions[i], rule.usual, `K${i + 1}`);
    }
  }
  actual.forEach((set, i) => {
    assert.deepEqual([...set].sort((a, b) => a - b), expected[i], `K${i + 1}`);
  });
});

test('latching toggles preserve the other keys and register steps add exactly 12', () => {
  const before = bits(1, 3), after = toggleKey(before, 9);
  assert.equal(after, bits(1, 3, 10));
  assert.equal(toggleKey(after, 9), before);
  assert.equal(keyPitch(before, 1).midi - keyPitch(before, 0).midi, 12);
  for (const pattern of ['', '101', '2'.repeat(13)]) assert.throws(() => keyPitch(pattern));
  assert.throws(() => keyPitch(bits(), 5));
  assert.throws(() => toggleKey(bits(), 13));
});

test('staff notation places chromatic pitches diatonically with the correct clef and ledger lines', () => {
  assert.deepEqual(staffLayout(60).ledgers, [112]); // C4, treble ledger below staff
  assert.equal(staffLayout(67).y, 88); // G4, second line from bottom
  assert.equal(staffLayout(69).y, 82); // A4, space
  assert.equal(staffLayout(72).y, 70); // C5, space
  assert.equal(staffLayout(55).clef, 'bass');
  assert.equal(staffLayout(55).y, 58); // G3, upper bass space
  assert.equal(staffLayout(61).accidental, '♯');
  assert.equal(staffLayout(61, true).accidental, '♭');
  assert.equal(staffLayout(61).y - staffLayout(61, true).y, 6);
  assert.equal(staffLayout(103).octavesUp, 2);
  assert.match(staffSvg(61), /C♯4 on treble clef/);
  assert.match(staffSvg(103), /15ma/);
});
