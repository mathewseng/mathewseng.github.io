/** Check automatic game endings and excluded roll proposals against reviewed footage. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const [referenceDir, candidateDir, comparisonPath, output, timelineDir] = process.argv.slice(2);
assert(referenceDir && candidateDir && comparisonPath && output,
  'Supply the reviewed replay, candidate plans, comparison JSON and report output.');

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const dice = values => (values ?? []).filter(Number.isInteger).sort((a, b) => b - a);
const reviewable = roll => ['unknown', 'unmatched', 'wrong'].includes(roll.agreement) ||
  (roll.automaticPlayer !== null && roll.automaticPlayer !== roll.player);

function summarize({ counts, rolls, unmatched }) {
  return { ...counts, extraProposals: unmatched.length,
    closeStarts: rolls.filter(roll => roll.automaticFrame !== null &&
      Math.abs(roll.automaticFrame - roll.frame) <= 5).length };
}

function verifyTimeline(prefix, boundary, expectedFrames) {
  const game = read(path.join(timelineDir, prefix + '-game.json'));
  const rows = gunzipSync(fs.readFileSync(path.join(timelineDir, prefix + '-state.jsonl.gz')))
    .toString('utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(rows.length, expectedFrames, prefix);
  assert.deepEqual(game.boundary, boundary, prefix);
  assert(rows.every((row, frame) => row.frame === frame), prefix);
  assert(rows.slice(0, boundary.frame).every(row => row.phase !== 'game-closed'), prefix);
  const closed = rows.slice(boundary.frame);
  for (const row of closed) {
    assert(row.phase === 'game-closed' && row.turn === null && row.roll === null &&
      row.position === null && row.decision === null && row.cube === null && row.player === null, prefix);
    assert.deepEqual(row.result, game.result, prefix);
    assert.deepEqual(row.loss, closed[0].loss, prefix);
  }
  if (boundary.offerFrame != null) {
    assert(rows.slice(boundary.offerFrame, boundary.frame).every(row => row.phase === 'cube-response' &&
      row.roll === null && row.cube?.offered === 2 * boundary.points), prefix);
  }
}

const games = read(comparisonPath).map(({ game, current, candidate }) => {
  const prefix = `game-${String(game).padStart(2, '0')}`;
  const reference = read(path.join(referenceDir, prefix + '-game.json'));
  const plan = read(path.join(candidateDir, prefix + '-plan.json'));
  const { boundary, closingRoll, suppressed } = read(path.join(candidateDir, prefix + '-boundary.json'));
  const label = `Game ${game}`;
  assert(boundary && reference.ending, `${label}: missing end`);
  assert(Math.abs(boundary.frame - reference.ending.frame) <= 50, `${label}: end moved by more than two seconds`);
  assert(boundary.confirmedFrame >= boundary.frame && boundary.confirmedFrame < reference.frames, label);
  if (boundary.winner) {
    assert.equal(reference.result?.reason, 'pass', label);
    assert.equal(boundary.winner, reference.result.winner, label);
    assert.equal(boundary.points, reference.result.points, label);
    assert(Math.abs(boundary.offerFrame - reference.decisions.cube.startFrame) <= 5, label);
  } else assert.notEqual(reference.result?.reason, 'pass', label);
  const stop = boundary.offerFrame ?? boundary.frame;
  assert(plan.every(turn => turn.start < stop && turn.end < stop &&
    (turn.resultFrame == null || turn.resultFrame < stop)), `${label}: live turn after closure`);
  if (timelineDir) verifyTimeline(prefix, boundary, reference.frames);
  assert(candidate.unmatched.length <= current.unmatched.length, `${label}: added extra roll`);
  for (const [index, previous] of current.rolls.entries()) {
    const next = candidate.rolls[index];
    assert.equal(next.frame, previous.frame, label);
    assert(previous.automaticFrame === null || next.automaticFrame !== null, `${label}: lost an indexed roll`);
    assert(previous.agreement !== 'correct' || next.agreement === 'correct', `${label}: lost a correct pair`);
    assert(previous.agreement === 'wrong' || next.agreement !== 'wrong', `${label}: new dice error`);
    assert(previous.automaticPlayer !== previous.player || next.automaticPlayer === next.player, `${label}: changed roller`);
    assert((!previous.beforeMatches || next.beforeMatches) && (!previous.afterMatches || next.afterMatches),
      `${label}: lost a verified board`);
  }
  for (const roll of suppressed) {
    assert(!reference.presentation.rolls.some(expected => roll.frame < expected.end && roll.end >= expected.start),
      `${label}: excluded a reviewed throw`);
    assert(roll.frame >= (roll.reason === 'post-game' ? reference.ending.frame : reference.decisions.cube.startFrame), label);
  }
  if (closingRoll) {
    const recovered = candidate.rolls.find(roll => roll.automaticFrame === closingRoll.frame);
    assert(recovered && recovered.player === closingRoll.player && recovered.beforeMatches, label);
    assert(recovered.agreement === 'unknown' || recovered.agreement === 'correct', label);
  }
  const review = candidate.rolls.filter(reviewable).map(roll => ({
    frame: roll.frame, player: roll.player, dice: roll.expected, verdict: roll.agreement,
    seen: roll.claimed, automaticPlayer: roll.automaticPlayer,
  }));
  const extra = candidate.unmatched.map(roll => ({ frame: roll.start, player: roll.player, dice: dice(roll.dice) }));
  return { game, current: summarize(current), updated: summarize(candidate), review, extra,
    boundary: { ...boundary, reviewedFrame: reference.ending.frame },
    closingRoll: closingRoll && { ...closingRoll, dice: dice(closingRoll.dice) },
    suppressed: suppressed.map(roll => ({ ...roll, dice: dice(roll.dice) })) };
});

fs.writeFileSync(output, JSON.stringify(games) + '\n');
