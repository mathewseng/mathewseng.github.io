/** Verify the stationary face recovery against the reviewed replay. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { boardKey, commitTurn, initialState } from '../../../core/rules.mjs';

const [candidateDir, comparisonPath, output] = process.argv.slice(2);
assert(candidateDir && comparisonPath && output,
  'Supply the reconstructed plan directory, comparison JSON, and output path.');

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const stateFor = (board, roll) => initialState({
  points: board.points.map(([white, dark]) => white - dark),
  bar: board.bar,
  off: board.borneOff,
  turn: Number(roll.player === 'dark'),
  dice: roll.dice,
  phase: 'move',
});

function summarize({ counts, rolls, unmatched }) {
  return { ...counts, extraProposals: unmatched.length,
    closeStarts: rolls.filter(roll => roll.automaticFrame !== null &&
      Math.abs(roll.automaticFrame - roll.frame) <= 5).length };
}

const games = read(comparisonPath).map(({ game, current, candidate }) => {
  const plan = read(path.join(candidateDir, `game-${String(game).padStart(2, '0')}-plan.json`));
  const recoveries = [];
  const review = [];
  for (const [index, roll] of candidate.rolls.entries()) {
    const baseline = current.rolls[index];
    const label = `Game ${game}, frame ${roll.frame}`;
    assert.equal(roll.frame, baseline.frame);
    assert(baseline.automaticFrame === null || roll.automaticFrame !== null, `${label}: lost an indexed roll`);
    assert(baseline.automaticPlayer !== baseline.player || roll.automaticPlayer === roll.player,
      `${label}: changed a correct roller`);
    assert(baseline.agreement !== 'correct' || roll.agreement === 'correct', `${label}: lost a correct pair`);
    assert(baseline.agreement === 'wrong' || roll.agreement !== 'wrong', `${label}: new face error`);
    assert(!baseline.beforeMatches || roll.beforeMatches, `${label}: lost the verified starting board`);
    assert(!baseline.afterMatches || roll.afterMatches, `${label}: lost the verified ending board`);
    if (['unknown', 'unmatched', 'wrong'].includes(roll.agreement) ||
        (roll.automaticPlayer !== null && roll.automaticPlayer !== roll.player)) {
      review.push({ frame: roll.frame, player: roll.player, dice: roll.expected, verdict: roll.agreement,
        seen: roll.claimed, automaticPlayer: roll.automaticPlayer });
    }
    const turn = plan.find(turn => turn.start === roll.automaticFrame);
    if (!turn?.stationaryFaces) continue;
    assert.equal(roll.agreement, 'correct', label);
    assert.equal(roll.automaticPlayer, roll.player, label);
    const { samples, first, last, corroboratingSamples } = turn.stationaryFaces;
    assert(samples >= 5 && last - first >= 8 && first >= turn.start && last <= turn.poseLastSeen, label);
    assert(corroboratingSamples >= 5, label);
    const checkerResult = turn.after ? (turn.steps.length ? 'move' : 'fan') : null;
    if (checkerResult) {
      assert(roll.beforeMatches && roll.afterMatches, `${label}: checker board mismatch`);
      const played = commitTurn(stateFor(turn.before, turn), turn.steps);
      assert.equal(boardKey(played), boardKey(stateFor(turn.after, turn)), label);
      assert(turn.resultFrame >= turn.start && turn.resultFrame <= turn.end, label);
    } else {
      assert(turn.steps == null && turn.resultFrame === null, label);
    }
    recoveries.push({ frame: roll.frame, player: roll.player, dice: roll.expected, samples, corroboratingSamples,
      automaticFrame: turn.start, firstRead: first, lastRead: last, lastSeen: turn.poseLastSeen,
      checkerResult, resultFrame: turn.resultFrame });
  }
  for (const turn of plan) {
    if (turn.stationaryFaces) assert(recoveries.some(item => item.automaticFrame === turn.start),
      `Game ${game}, frame ${turn.start}: unsupported face recovery`);
    if (turn.steps) assert.equal(turn.dice?.filter(Number.isInteger).length, 2,
      `Game ${game}, frame ${turn.start}: steps with an unread roll`);
  }
  assert(candidate.unmatched.length <= current.unmatched.length, `Game ${game}: added unmatched throws`);
  const extra = candidate.unmatched.map(({ start, player, dice }) => ({
    frame: start, player, dice: (dice ?? []).filter(Number.isInteger).sort((a, b) => b - a),
  }));
  return { game, current: summarize(current), updated: summarize(candidate), recoveries, review, extra };
});

assert(games.some(game => game.recoveries.length), 'No stationary face recoveries in the comparison');
fs.writeFileSync(output, JSON.stringify(games) + '\n');
