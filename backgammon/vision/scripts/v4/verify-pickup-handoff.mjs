/** Verify that all automatic replay stages preserve an independently confirmed pickup. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { rowsFrom } from '../v2/solve_games.mjs';

const [comparisonFile, generated] = process.argv.slice(2);
assert(comparisonFile && generated, 'Supply the five-game comparison and generated stage directory.');
const comparison = JSON.parse(fs.readFileSync(comparisonFile, 'utf8'));
assert.deepEqual(comparison.map(game => game.game), [1, 2, 3, 4, 5]);
for (const { current, candidate } of comparison) {
  for (const key of ['matched', 'correctDice', 'correctBefore', 'correctAfter']) {
    assert(candidate.counts[key] >= current.counts[key], `${key} regressed`);
  }
  for (const key of ['wrongDice', 'actorMismatches']) {
    assert(candidate.counts[key] <= current.counts[key], `${key} regressed`);
  }
  assert(candidate.unmatched.length <= current.unmatched.length);
}
const game3 = comparison.find(item => item.game === 3);
assert.equal(game3.candidate.unmatched.length, game3.current.unmatched.length - 3);
assert.equal(game3.candidate.counts.correctAfter, game3.current.counts.correctAfter + 1);

for (const stage of ['reconstructed', 'refined/context', 'presentation']) {
  const base = path.join(generated, stage, 'game-03');
  const game = JSON.parse(fs.readFileSync(base + '-game.json', 'utf8'));
  const rows = rowsFrom(base + '-state.jsonl.gz');
  const index = game.turns.findIndex(turn => turn.start === 208);
  const turn = game.turns[index];
  const id = index + 1;
  assert.deepEqual([turn.pickupFrame, turn.resultFrame, turn.end], [1016, 1017, 1017], stage);
  assert.equal(turn.player, 'dark', stage);
  assert.deepEqual(turn.dice, [3, 4], stage);
  assert.equal(rows[625].turn, id, stage);
  assert.equal(rows[1015].roll.status, 'current', stage);
  assert.deepEqual([rows[1016].phase, rows[1016].player, rows[1016].turn, rows[1016].roll],
    ['checker-result-pending', 'dark', id, null], stage);
  assert.equal(rows[1017].phase, 'played', stage);
  assert.equal(rows[1017].roll.status, 'last', stage);
  assert.equal(game.decisions[id].played.notation, '13/10 24/20', stage);
  assert(game.decisions[id].countedInGameLoss, stage);
  assert(rows[1017].loss.dark.loss > rows[1016].loss.dark.loss, stage);
  if (stage === 'presentation') {
    const interval = game.presentation.rolls.find(roll => roll.start === 208);
    assert.deepEqual([interval.pickup, interval.end], [1016, 1016]);
    assert.deepEqual(interval.dice, [4, 3]);
  }
}
console.log('Five games compared. Game 3 preserved the pickup, pending board and later score through all stages.');
