import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nearThirdBranches, stateForBoard, nextBoard, rowSteps } from '../scripts/book-branches.mjs';
import { boardKey } from '../core/rules.mjs';
const dir = new URL('../engine/opening-book-data/', import.meta.url);
const read = file => JSON.parse(readFileSync(new URL(file, dir)));
const index = read('index.json');
test('near-best planner covers all qualifying reply results, deduplicates transpositions, and excludes the rest', () => {
  const expected = new Map(); let excluded = 0;
  for (const [board, ref] of Object.entries(index.replies)) for (const [roll, entry] of Object.entries(read(ref.file).rolls)) {
    const state = stateForBoard(board, [...roll].map(Number));
    for (const row of entry.rows) {
      if (entry.rows[0][1] - row[1] > .040 + 1e-8) { excluded++; continue; }
      const next = boardKey(nextBoard(state, rowSteps(row)));
      expected.set(next, (expected.get(next) || 0) + 1);
    }
  }
  const planned = nearThirdBranches(index, read);
  assert.equal(planned.length, 1298); assert.ok(excluded > 0);
  assert.deepEqual(new Map(planned.map(b => [b.board, b.paths])), new Map([...expected].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
  assert.ok(planned.some(b => b.paths > 1));
  // Enumeration order cannot change membership or silently impose a cap.
  const reversed = { ...index, replies: Object.fromEntries(Object.entries(index.replies).reverse()) };
  assert.deepEqual(nearThirdBranches(reversed, read).map(b => b.board), planned.map(b => b.board));
  assert.ok(planned.every(b => boardKey(b.state) === b.board));
});
test('a clean base-book rebuild can restore the same fourth-turn coverage without an old index', () => {
  const retained = JSON.parse(readFileSync(new URL('../scripts/retained-fourth-boards.json', import.meta.url)));
  assert.equal(retained.sourceBook, 'jacoby-3ply-v2');
  assert.equal(retained.boards.length, 32);
  assert.equal(new Set(retained.boards.map(b => b.board)).size, 32);
  for (const b of retained.boards) {
    const parent = stateForBoard(b.parent.board, [...b.parent.roll].map(Number));
    assert.equal(boardKey(nextBoard(parent, b.parent.steps)), b.board);
    assert.ok(Number.isFinite(b.weight) && b.weight > 0);
    assert.equal(index.continuations[b.board].turn, 4);
    assert.deepEqual(index.continuations[b.board].parent, b.parent);
  }
});
