import test from 'node:test';
import assert from 'node:assert/strict';
import { FINGERINGS, KEYS, candidates, changes, optimize, parseMelody, routeCost, noteName } from '../engine.mjs';

test('85 unique chart patterns, 13 keys, and no conflicting pitch assignments', () => {
  assert.equal(KEYS.length, 13);
  assert.equal(FINGERINGS.length, 85);
  const seen = new Map();
  for (const f of FINGERINGS) {
    assert.match(f.bits, /^[01]{13}$/);
    assert.ok(!seen.has(f.bits), `duplicate pattern ${f.bits}`);
    seen.set(f.bits, f.base);
  }
  for (let pc = 0; pc < 12; pc++) assert.equal(candidates(60 + pc).filter(f => f.main).length, 1);
});

test('corrected low C and D patterns and recovered A alternate retain source pitches', () => {
  assert.equal(FINGERINGS.find(f => f.bits === '1011010110010').base, 60);
  assert.equal(FINGERINGS.find(f => f.bits === '1001000111001').base, 62);
  assert.equal(FINGERINGS.find(f => f.bits === '0010000011000').base, 69);
  assert.equal(FINGERINGS.find(f => f.bits === '1011000111001').base, 60);
});

test('register candidates encode absolute octave, including overlapping low and high extensions', () => {
  for (let midi = 34; midi <= 111; midi++) {
    const set = candidates(midi);
    assert.ok(set.length > 0, `no candidates for MIDI ${midi}`);
    for (const f of set) {
      assert.equal(f.base + f.shift * 12, midi);
      assert.ok(f.shift >= -2 && f.shift <= 4);
    }
  }
  assert.deepEqual([...new Set(candidates(60).map(f => f.shift))].sort(), [-1, 0]);
  assert.deepEqual([...new Set(candidates(74).map(f => f.shift))].sort(), [0, 1]);
  assert.equal(candidates(33).length, 0);
  assert.equal(candidates(112).length, 0);
  assert.equal(candidates(NaN).length, 0);
});

test('a pure octave leap changes the thumb but not the note keys', () => {
  const a = candidates(67).find(f => f.main), b = candidates(79).find(f => f.id === a.id);
  assert.deepEqual(changes(a, b), { touch: [], release: [], keep: ['K1', 'K3', 'K4'], keys: 0, rollers: 1, direction: 1 });
});

test('different C fingerings require different roller positions for the same sounding note', () => {
  const all = candidates(72);
  const upper = all.find(f => f.bits === '0010000000000');
  const lower = all.find(f => f.bits === '1011000111001');
  assert.equal(upper.shift, 0); assert.equal(lower.shift, 1);
});

test('dynamic programming matches exhaustive full-phrase search', () => {
  const melody = [71, 72, 74, 75];
  const weights = { roller: 7, pinky: 3, unfamiliar: .25 };
  let minimum = Infinity;
  const visit = path => {
    if (path.length === melody.length) { minimum = Math.min(minimum, routeCost(path, weights)); return; }
    for (const f of candidates(melody[path.length])) visit([...path, f]);
  };
  visit([]);
  const result = optimize(melody, weights);
  assert.equal(result.cost, minimum);
  assert.equal(routeCost(result.path, weights), minimum);
  assert.ok(result.cost <= routeCost(melody.map(n => candidates(n)[0]), weights));
});

test('thumb preference can avoid a C# to D register break', () => {
  const result = optimize([73, 74, 73], { roller: 20, pinky: 1, unfamiliar: 0 });
  assert.equal(result.path[0].shift, result.path[1].shift);
  assert.equal(result.path[1].shift, result.path[2].shift);
});

test('locked choices remain fixed while the rest of the phrase optimizes', () => {
  const melody = [71, 72, 74];
  const chosen = candidates(72).find(f => f.base === 60);
  const result = optimize(melody, undefined, { 1: chosen.id });
  assert.equal(result.path[1].id, chosen.id);
  assert.equal(result.path[1].shift, 1);
  assert.equal(optimize(melody, undefined, { 1: 'invalid' }), null);
  assert.deepEqual(optimize([]), { path: [], cost: 0 });
});

test('parser handles enharmonics, unicode, commas, and octave crossings', () => {
  assert.deepEqual(parseMelody('B4, C5 | D♭5; C#5 Bb3'), [71, 72, 73, 73, 58]);
  assert.deepEqual(parseMelody('B#3 Cb4'), [60, 59]);
  assert.equal(noteName(60), 'C4'); assert.equal(noteName(61, true), 'D♭4');
  for (const text of ['', 'C', 'C4oops', '<script>', 'G9', 'A1', Array(65).fill('C4').join(' ')]) assert.throws(() => parseMelody(text));
});
