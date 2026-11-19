/** Check automatic game endings and excluded roll proposals against reviewed footage. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { boardKey, commitTurn, initialState, legalTurns } from '../../../core/rules.mjs';

const [referenceDir, candidateDir, comparisonPath, output, timelineDir] = process.argv.slice(2);
assert(referenceDir && candidateDir && comparisonPath && output,
  'Supply the reviewed replay, candidate plans, comparison JSON and report output.');

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const dice = values => (values ?? []).filter(Number.isInteger).sort((a, b) => b - a);
const reviewable = roll => ['unknown', 'unmatched', 'wrong'].includes(roll.agreement) ||
  (roll.automaticPlayer !== null && roll.automaticPlayer !== roll.player);
const stateFor = (board, turn, dice = turn.dice) => initialState({
  points: board.points.map(([white, dark]) => white - dark), bar: board.bar, off: board.borneOff,
  turn: Number(turn.player === 'dark'), dice, phase: 'move',
});

function summarize({ counts, rolls, unmatched }) {
  return { ...counts, extraProposals: unmatched.length,
    closeStarts: rolls.filter(roll => roll.automaticFrame !== null &&
      Math.abs(roll.automaticFrame - roll.frame) <= 5).length };
}

function verifyCheckerDice(plan, rolls, label) {
  return plan.filter(turn => turn.checkerDice).map(turn => {
    const roll = rolls.find(roll => roll.automaticFrame === turn.start);
    assert(roll?.agreement === 'correct' && roll.beforeMatches && roll.afterMatches &&
      roll.player === turn.player, `${label}: checker-inferred roll does not match review`);
    const witness = turn.checkerDice;
    assert(witness.firstPose >= turn.start && witness.lastPose - witness.firstPose >= 8 &&
      witness.samples >= 6 && witness.after === turn.resultFrame, `${label}: missing temporal evidence`);
    const start = stateFor(turn.before, turn, turn.dice);
    const end = boardKey(stateFor(turn.after, turn, turn.dice));
    assert.equal(boardKey(commitTurn(start, turn.steps)), end, label);
    const compatible = [];
    for (let low = 1; low <= 6; low++) {
      for (let high = low; high <= 6; high++) {
        const pair = [low, high];
        const state = stateFor(turn.before, turn, pair);
        if (legalTurns(state).some(move => move.key === end)) compatible.push(pair);
      }
    }
    assert.deepEqual(compatible, [turn.dice], `${label}: roll was not uniquely determined`);
    return { frame: roll.frame, player: turn.player, dice: dice(turn.dice), positions: witness.samples,
      beforeFrame: witness.before, resultFrame: turn.resultFrame };
  });
}

function verifyPhysicalTiming(plan, rolls, reference, label) {
  function verifyMove(turn) {
    const roll = rolls.find(roll => roll.automaticFrame === turn.start);
    assert(roll?.agreement === 'correct' && roll.player === turn.player && roll.beforeMatches && roll.afterMatches, label);
    assert(Math.abs(roll.frame - turn.start) <= 5, `${label}: reconstructed throw is displaced`);
    assert.equal(boardKey(commitTurn(stateFor(turn.before, turn), turn.steps)),
      boardKey(stateFor(turn.after, turn)), label);
    return { frame: roll.frame, player: turn.player, dice: dice(turn.dice) };
  }
  const handoffs = plan.flatMap((outgoing, index) => {
    const proof = outgoing.physicalHandoff;
    if (!proof || proof.outgoingStart !== outgoing.start) return [];
    const incoming = plan[index + 1];
    assert(incoming?.start === proof.incomingStart && incoming.player !== outgoing.player &&
      incoming.start === outgoing.end + 1 && proof.outgoingSeen < incoming.start, label);
    assert.deepEqual(incoming.physicalHandoff, proof, label);
    assert.equal(boardKey(stateFor(outgoing.after, outgoing)), boardKey(stateFor(incoming.before, incoming)), label);
    return [{ outgoing: verifyMove(outgoing), incoming: verifyMove(incoming), sharedBoard: proof.sharedBoard,
      previousGradeStart: proof.previousGradeStart }];
  });
  assert.equal(plan.filter(turn => turn.physicalHandoff).length, 2 * handoffs.length, label);
  const relocatedDice = plan.filter(turn => turn.movedDie).map(turn => {
    const move = verifyMove(turn);
    const reviewed = reference.find(roll => roll.start === move.frame);
    assert(Number.isInteger(reviewed?.pickup) && Math.abs(reviewed.pickup - turn.pickupFrame) <= 5, label);
    assert(turn.start < turn.relocatedAt && turn.relocatedAt < turn.poseLastSeen &&
      turn.poseLastSeen < turn.pickupFrame && turn.pickupFrame < turn.resultFrame, label);
    return { ...move, relocatedAt: turn.relocatedAt, pickupFrame: turn.pickupFrame,
      resultFrame: turn.resultFrame, fixedFace: turn.movedDie.fixedFace };
  });
  return { handoffs, relocatedDice };
}

function verifyTimeline(prefix, boundary, expectedFrames) {
  const game = read(path.join(timelineDir, prefix + '-game.json'));
  const rows = gunzipSync(fs.readFileSync(path.join(timelineDir, prefix + '-state.jsonl.gz')))
    .toString('utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(rows.length, expectedFrames, prefix);
  assert.deepEqual(game.boundary, boundary, prefix);
  assert(rows.every((row, frame) => row.frame === frame), prefix);
  for (const [index, turn] of game.turns.entries()) {
    if (!turn.checkerDice && !turn.physicalHandoff && !turn.movedDie) continue;
    const id = index + 1;
    const label = `${prefix}, roll ${turn.start}`;
    const decision = game.decisions[id];
    assert(decision?.countedInGameLoss && Number.isFinite(decision.evLoss), `${label}: no scored move`);
    assert.deepEqual(decision.played.steps, turn.steps, label);
    const showUntil = Math.min(turn.resultFrame, turn.pickupFrame ?? turn.end + 1);
    assert(rows.slice(turn.start, showUntil).every(row =>
      row.turn === id && row.roll?.id === id && row.roll.player === turn.player &&
      JSON.stringify(row.roll.dice) === JSON.stringify(turn.dice)), `${label}: dice changed during play`);
    if (turn.physicalHandoff || turn.movedDie) {
      for (const [frame, expected] of [[turn.start, turn.before], [turn.resultFrame, turn.after]]) {
        const board = game.positions[rows[frame].position];
        assert(board && boardKey(stateFor(board, turn)) === boardKey(stateFor(expected, turn)),
          `${label}: displayed checker state disagrees at frame ${frame}`);
      }
    }
    if (turn.movedDie) {
      assert(rows.slice(turn.pickupFrame, turn.resultFrame).every(row => row.phase === 'checker-result-pending' &&
        row.roll === null && row.player === turn.player), `${label}: new turn before the result`);
    }
    assert.deepEqual(game.losses.filter(event => event.frame === turn.resultFrame && event.player === turn.player),
      [{ frame: turn.resultFrame, player: turn.player, loss: decision.evLoss, kind: 'checker' }], label);
    const previous = rows[turn.resultFrame - 1].loss[turn.player];
    const settled = rows[turn.resultFrame].loss[turn.player];
    assert(settled.count === previous.count + 1 &&
      Math.abs(settled.loss - previous.loss - decision.evLoss) < 1e-10, `${label}: loss was not applied`);
  }
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
    checkerRecoveries: verifyCheckerDice(plan, candidate.rolls, label),
    ...verifyPhysicalTiming(plan, candidate.rolls, reference.presentation.rolls, label),
    boundary: { ...boundary, reviewedFrame: reference.ending.frame },
    closingRoll: closingRoll && { ...closingRoll, dice: dice(closingRoll.dice) },
    suppressed: suppressed.map(roll => ({ ...roll, dice: dice(roll.dice) })) };
});

fs.writeFileSync(output, JSON.stringify(games) + '\n');
