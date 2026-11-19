/** Check automatic game endings and excluded roll proposals against reviewed footage. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { boardKey, commitTurn, initialState, legalTurns, stepsForDie } from '../../../core/rules.mjs';

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
  function verifyPickup(turn, frame) {
    const reviewed = reference.find(roll => roll.start === frame);
    assert(Number.isInteger(reviewed?.pickup) && Math.abs(reviewed.pickup - turn.pickupFrame) <= 5, label);
  }
  function verifyCompanionFace(turn, face) {
    const end = boardKey(stateFor(turn.after, turn));
    const possible = Array.from({ length: 6 }, (_, index) => index + 1)
      .map(other => [face, other].sort((a, b) => a - b))
      .filter(pair => legalTurns(stateFor(turn.before, turn, pair)).some(path => path.key === end));
    assert.deepEqual(possible, [turn.dice], `${label}: indistinguishable companion face`);
  }
  const handoffs = plan.flatMap((outgoing, index) => {
    const proof = outgoing.physicalHandoff;
    if (!proof || proof.outgoingStart !== outgoing.start) return [];
    const incoming = plan[index + 1];
    assert(incoming?.start === proof.incomingStart && incoming.player !== outgoing.player &&
      outgoing.end < incoming.start && proof.outgoingSeen < incoming.start, label);
    assert.deepEqual(incoming.physicalHandoff, proof, label);
    assert.equal(boardKey(stateFor(outgoing.after, outgoing)), boardKey(stateFor(incoming.before, incoming)), label);
    const previous = verifyMove(outgoing), next = verifyMove(incoming);
    if (proof.observedFace) {
      verifyPickup(outgoing, previous.frame);
      verifyPickup(incoming, next.frame);
      verifyCompanionFace(incoming, proof.observedFace);
      assert(outgoing.pickupFrame === outgoing.end + 1 && outgoing.pickupFrame <= incoming.start, label);
      next.observedFace = proof.observedFace;
    } else assert(incoming.start === outgoing.end + 1, label);
    return [{ outgoing: previous, incoming: next, sharedBoard: proof.sharedBoard, previousGradeStart: proof.previousGradeStart }];
  });
  assert.equal(plan.filter(turn => turn.physicalHandoff).length, 2 * handoffs.length, label);
  const relocatedDice = plan.filter(turn => turn.movedDie).map(turn => {
    const move = verifyMove(turn);
    verifyPickup(turn, move.frame);
    assert(turn.start < turn.relocatedAt && turn.relocatedAt < turn.poseLastSeen &&
      turn.poseLastSeen < turn.pickupFrame && turn.pickupFrame < turn.resultFrame, label);
    return { ...move, relocatedAt: turn.relocatedAt, pickupFrame: turn.pickupFrame,
      resultFrame: turn.resultFrame, fixedFace: turn.movedDie.fixedFace };
  });
  const poseHistories = plan.filter(turn => turn.poseHistory).map(turn => {
    const move = verifyMove(turn);
    verifyPickup(turn, move.frame);
    const { history, face, seedStart } = turn.poseHistory;
    assert(history.length >= 2 && history[0].first <= turn.start && history[0].last > turn.start &&
      history.at(-1).last < turn.pickupFrame && turn.pickupFrame < turn.resultFrame, label);
    verifyCompanionFace(turn, face);
    assert(history.every((stage, index) => stage.last >= stage.first &&
      (!index || stage.first > history[index - 1].last)), label);
    return { ...move, observedFace: face, previousStart: seedStart, shifts: history.slice(1).map(stage => stage.first),
      pickupFrame: turn.pickupFrame, resultFrame: turn.resultFrame };
  });
  return { handoffs, relocatedDice, poseHistories };
}

function verifyFans(plan, rolls, game, label) {
  return plan.filter(turn => turn.fanEvidence).map(turn => {
    const match = rolls.find(roll => roll.automaticFrame === turn.start);
    const reviewed = game.presentation.rolls.find(roll => roll.start === match?.frame);
    assert(reviewed?.fan && reviewed.player === turn.player, `${label}: unverified fan at ${turn.start}`);
    assert(Math.abs(reviewed.start - turn.start) <= 15 && Math.abs(reviewed.pickup - turn.pickupFrame) <= 15, label);
    assert(!dice(turn.dice).length || match.agreement === 'correct', `${label}: unsupported die face`);
    const { blocked, lastVisibleDie, before, after, outgoingPickup, pipFrames } = turn.fanEvidence;
    assert(before < lastVisibleDie && lastVisibleDie < turn.pickupFrame && after >= turn.pickupFrame, label);
    const recorded = game.turns[(reviewed.decision ?? reviewed.sourceTurns[0]) - 1];
    if (blocked.length) {
      const state = stateFor(recorded.before, turn);
      assert(state.bar[state.turn] > 0 && blocked.every(face => stepsForDie(state, face).length === 0), label);
      assert.deepEqual(turn.steps, [], label);
    } else assert(turn.steps === null && turn.resultFrame === null, label);
    if (outgoingPickup) {
      const prior = plan.find(entry => entry.start === outgoingPickup.roll);
      const priorReview = game.presentation.rolls.find(entry => entry.start === prior?.start);
      assert(prior?.player !== turn.player && prior.pickupFrame === outgoingPickup.frame &&
        outgoingPickup.lastSeen < outgoingPickup.frame && outgoingPickup.frame < turn.start, label);
      assert(Math.abs(priorReview.pickup - outgoingPickup.frame) <= 5, label);
    }
    if (pipFrames) {
      assert(match.agreement === 'correct' && match.beforeMatches && match.afterMatches &&
        pipFrames.length >= 8 && pipFrames.every(frame => frame >= turn.start && frame <= lastVisibleDie), label);
    }
    return { frame: reviewed.start, player: turn.player, dice: dice(turn.dice), blocked,
      lastVisibleDie, clearBy: turn.pickupFrame, boardFrame: after,
      ...(outgoingPickup && { outgoingPickup }), ...(pipFrames && { pipFrames }) };
  });
}

function verifyForegroundDice(plan, candidates, referenced, label) {
  return plan.filter(turn => turn.foregroundDice).map(turn => {
    const match = candidates.find(entry => entry.automaticFrame === turn.start);
    assert(match?.agreement === 'correct' && match.player === turn.player &&
      match.beforeMatches && match.afterMatches, `${label}: foreground roll does not match review`);
    const { samples, faces, previous, previousPickup } = turn.foregroundDice;
    const review = referenced.presentation.rolls.find(entry => entry.start === match.frame);
    const prior = plan.find(entry => entry.start === previous);
    const priorMatch = candidates.find(entry => entry.automaticFrame === previous);
    const reviewedPrior = referenced.presentation.rolls.find(entry => entry.start === priorMatch?.frame);
    assert(Math.abs(review.start - turn.start) <= 10 && Math.abs(review.pickup - turn.pickupFrame) <= 5, label);
    assert(prior.player !== turn.player && Math.abs(reviewedPrior?.pickup - previousPickup) <= 5 &&
      prior.pickupFrame === previousPickup && previousPickup < turn.start && samples >= 10, label);
    assert.equal(boardKey(stateFor(prior.after, turn)), boardKey(stateFor(turn.before, turn)), label);
    assert.equal(boardKey(commitTurn(stateFor(turn.before, turn), turn.steps)), boardKey(stateFor(turn.after, turn)), label);
    return { frame: review.start, player: turn.player, dice: dice(turn.dice), samples,
      faceReads: faces.map(face => face.face), previousPickup, clear: turn.pickupFrame, resultFrame: turn.resultFrame };
  });
}

function verifyCubeTakes(transfers, reference, label) {
  for (const item of transfers) {
    const expected = reference.decisions.cube;
    assert(expected?.reply === 'take' && expected.offerer === item.offerer && expected.responder === item.responder &&
      expected.offeredFace === item.offered && expected.preOfferStake === item.stake &&
      Math.abs(expected.startFrame - item.start) <= 5 && expected.endFrame === item.take, label);
    assert.deepEqual(item.position, expected.position, `${label}: cube starting board`);
    assert(item.start <= item.lastSeen && item.lastSeen < item.take && item.views >= 4, label);
  }
  return transfers.map(({ position, ...witness }) => witness);
}

function verifyTimeline(prefix, boundary, expectedFrames, transfers, expectedCube) {
  const game = read(path.join(timelineDir, prefix + '-game.json'));
  const rows = gunzipSync(fs.readFileSync(path.join(timelineDir, prefix + '-state.jsonl.gz')))
    .toString('utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(rows.length, expectedFrames, prefix);
  assert.deepEqual(game.boundary, boundary, prefix);
  assert(rows.every((row, frame) => row.frame === frame), prefix);
  for (const transfer of transfers) {
    const cube = Object.values(game.decisions).find(decision => decision.kind === 'cube' && decision.startFrame === transfer.start);
    assert(cube?.reply === 'take' && cube.endFrame === transfer.take, prefix);
    assert.deepEqual(cube.options, expectedCube.options, `${prefix}: cube equity differs on the same board`);
    assert(rows.slice(transfer.start, transfer.take).every(row => row.phase === 'cube-response' && row.roll === null &&
      row.player === transfer.responder && row.cube?.offered === transfer.offered && row.decision), prefix);
    assert.equal(rows[transfer.take].cube?.stake, transfer.offered, prefix);
    assert.equal(rows[transfer.take].cube?.side, transfer.side, prefix);
    assert.deepEqual(game.losses.filter(event => event.kind === 'cube' &&
      (event.frame === transfer.start || event.frame === transfer.take)), [
      { frame: transfer.start, player: transfer.offerer, loss: cube.offerEvLoss, kind: 'cube' },
      { frame: transfer.take, player: transfer.responder, loss: cube.replyEvLoss, kind: 'cube', action: 'take' },
    ], prefix);
  }

  for (const [index, turn] of game.turns.entries()) {
    if (turn.fanEvidence) {
      const id = index + 1;
      assert(rows.slice(turn.start, turn.end + 1).every(row => row.turn === id && row.roll?.id === id &&
        row.roll.player === turn.player && row.roll.status === 'current' &&
        Boolean(row.roll.fan) === Boolean(turn.fanEvidence.blocked.length)), `${prefix}: lost a short roll`);
      assert(!game.decisions[id]?.countedInGameLoss, `${prefix}: a forced pass accrued checker loss`);
      const pickup = turn.fanEvidence.outgoingPickup;
      if (pickup) {
        assert(rows.slice(pickup.frame, turn.start).every(row => row.roll?.status !== 'current'),
          `${prefix}: the earlier roll stayed active after pickup`);
      }
    }
    if (!turn.checkerDice && !turn.physicalHandoff && !turn.movedDie && !turn.poseHistory && !turn.foregroundDice) continue;
    const id = index + 1;
    const label = `${prefix}, roll ${turn.start}`;
    const decision = game.decisions[id];
    assert(decision?.countedInGameLoss && Number.isFinite(decision.evLoss), `${label}: no scored move`);
    assert.deepEqual(decision.played.steps, turn.steps, label);
    const showUntil = Math.min(turn.resultFrame, turn.pickupFrame ?? turn.end + 1);
    assert(rows.slice(turn.start, showUntil).every(row =>
      row.turn === id && row.roll?.id === id && row.roll.player === turn.player &&
      JSON.stringify(row.roll.dice) === JSON.stringify(turn.dice)), `${label}: dice changed during play`);
    if (turn.physicalHandoff || turn.movedDie || turn.poseHistory || turn.foregroundDice) {
      for (const [frame, expected] of [[turn.start, turn.before], [turn.resultFrame, turn.after]]) {
        const board = game.positions[rows[frame].position];
        assert(board && boardKey(stateFor(board, turn)) === boardKey(stateFor(expected, turn)),
          `${label}: displayed checker state disagrees at frame ${frame}`);
      }
    }
    if (turn.movedDie || turn.poseHistory || turn.foregroundDice) {
      assert(rows.slice(turn.pickupFrame, turn.resultFrame).every(row => row.phase === 'checker-result-pending' &&
        row.roll === null && row.player === turn.player), `${label}: new turn before the result`);
    }
    if (turn.foregroundDice) {
      assert(rows.slice(turn.foregroundDice.previousPickup, turn.start).every(row => row.roll?.status !== 'current'),
        `${label}: previous dice were carried into the next roll`);
    }
    if (turn.physicalHandoff?.observedFace && turn.start === turn.physicalHandoff.outgoingStart) {
      assert(rows.slice(turn.pickupFrame, turn.physicalHandoff.incomingStart).every(row => row.roll?.status !== 'current'),
        `${label}: dice remained active after pickup`);
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
  const { boundary, closingRoll, suppressed, cubeTransfers = [] } = read(path.join(candidateDir, prefix + '-boundary.json'));
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
  if (timelineDir) verifyTimeline(prefix, boundary, reference.frames, cubeTransfers, reference.decisions.cube);
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
    if (roll.reason === 'checker-stack') {
      assert(roll.witness.before < roll.frame && roll.witness.after > roll.end && !dice(roll.dice).length, label);
    } else if (roll.reason === 'accepted-cube-response') {
      assert(cubeTransfers.some(offer => roll.frame >= offer.start && roll.end < offer.take), label);
    } else {
      assert(roll.frame >= (roll.reason === 'post-game' ? reference.ending.frame : reference.decisions.cube.startFrame), label);
    }
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
    fans: verifyFans(plan, candidate.rolls, reference, label),
    foregroundDice: verifyForegroundDice(plan, candidate.rolls, reference, label),
    cubeTransfers: verifyCubeTakes(cubeTransfers, reference, label),
    ...verifyPhysicalTiming(plan, candidate.rolls, reference.presentation.rolls, label),
    boundary: { ...boundary, reviewedFrame: reference.ending.frame },
    closingRoll: closingRoll && { ...closingRoll, dice: dice(closingRoll.dice) },
    suppressed: suppressed.map(roll => ({ ...roll, dice: dice(roll.dice) })) };
});

fs.writeFileSync(output, JSON.stringify(games) + '\n');
