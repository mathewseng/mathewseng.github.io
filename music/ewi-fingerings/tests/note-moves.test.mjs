import test from 'node:test';
import assert from 'node:assert/strict';
import { changes, parseMelody } from '../engine.mjs';
import { bestNoteMoves, noteMoveCounts, MOVE_PITCHES } from '../note-moves.mjs';
import { keyPitch } from '../key-rules.mjs';
import { SCALE_GROUPS, scalePhrase } from '../scales.mjs';

test('the move grid covers all directed pairs and every displayed route keeps the thumb fixed', () => {
  const matrix = noteMoveCounts();
  assert.deepEqual(MOVE_PITCHES, Array.from({ length: 18 }, (_, index) => 75 - index));
  assert.equal(matrix.flat().filter(Number.isInteger).length, 306);
  assert.equal(bestNoteMoves(60, 71).toggles, 5);
  assert.equal(bestNoteMoves(58, 75).toggles, 11);
  for (const [from, fromMidi] of MOVE_PITCHES.entries()) {
    for (const [to, toMidi] of MOVE_PITCHES.entries()) {
      assert.equal(matrix[from][to], matrix[to][from]);
      if (from === to) continue;
      const result = bestNoteMoves(fromMidi, toMidi);
      assert.ok(result.options.length > 0);
      for (const option of result.options) {
        assert.equal(changes(option.from, option.to).keys, matrix[from][to]);
        assert.equal(option.from.shift, 0);
        assert.equal(option.to.shift, 0);
        assert.equal(keyPitch(option.from.bits).midi, fromMidi);
        assert.equal(keyPitch(option.to.bits).midi, toMidi);
      }
    }
  }
});

test('when a move ties on toggles, the simplest pair comes first', () => {
  const { toggles, options } = bestNoteMoves(70, 71);
  assert.equal(toggles, 1);
  assert.equal(options[0].from.bits, '1100000000000');
  assert.equal(options[0].to.bits, '1000000000000');
});

test('each scale loads a playable octave in every root', () => {
  assert.equal(scalePhrase(0, SCALE_GROUPS[0][1][0][1]), 'C4 D4 E4 F4 G4 A4 B4 C5');
  for (const [, scales] of SCALE_GROUPS) {
    for (const [, offsets] of scales) {
      for (let root = 0; root < 12; root++) {
        const expected = [...offsets, 12].map(offset => 60 + root + offset);
        assert.deepEqual(parseMelody(scalePhrase(root, offsets)), expected);
      }
    }
  }
});
