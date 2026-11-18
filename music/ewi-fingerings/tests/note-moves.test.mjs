import test from 'node:test';
import assert from 'node:assert/strict';
import { changes, parseMelody } from '../engine.mjs';
import { bestNoteMoves, noteMoveCounts } from '../note-moves.mjs';
import { SCALE_GROUPS, scalePhrase } from '../scales.mjs';

test('the move grid covers all directed pairs and every displayed route keeps the thumb fixed', () => {
  const matrix = noteMoveCounts();
  assert.equal(matrix.flat().filter(Number.isInteger).length, 132);
  assert.equal(matrix[0][11], 5, 'C to B requires five toggles when the thumb stays fixed');
  for (let from = 0; from < 12; from++) {
    for (let to = 0; to < 12; to++) {
      assert.equal(matrix[from][to], matrix[to][from]);
      if (from === to) continue;
      const result = bestNoteMoves(from, to);
      assert.ok(result.options.length > 0);
      for (const option of result.options) {
        assert.equal(changes(option.from, option.to).keys, matrix[from][to]);
        assert.equal(option.from.shift, option.to.shift);
      }
    }
  }
});

test('when a move ties on toggles, the simplest pair comes first', () => {
  const { toggles, options } = bestNoteMoves(10, 11);
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
