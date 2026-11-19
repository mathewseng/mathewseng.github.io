/** Qualify the reconstructed stationary-roll change against the reviewed session. */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const [comparisonPath] = process.argv.slice(2);
assert(comparisonPath, 'Supply the full-session plan comparison.');
const comparison = JSON.parse(fs.readFileSync(comparisonPath, 'utf8'));
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
const game = comparison.find(entry => entry.game === 4);
const long = game.candidate.rolls.find(roll => roll.frame === 27162);
assert.equal(long.player, 'dark');
assert.equal(long.agreement, 'correct');
assert.deepEqual(long.claimed, [3, 2]);
assert.equal(long.footprint.clear, 32242);
assert.equal(long.footprint.resultFrame, 32202);
assert(long.footprint.coverage >= .90);
assert.equal(game.candidate.unmatched.length, game.current.unmatched.length - 7);
console.log('Five games checked. Game 4 reconstructed the single 3–2 and removed seven extra proposals.');
