/** Reconstruct a game timeline from full-session checker and dice evidence. */
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { artifactDir, solverUrl, visionStateDir } from '../project_paths.mjs';
import { observedBoard } from './bearoff-board.mjs';
import { faceAt, pairVisible, pickupAfterPose, rejoinDicePose, stationaryPoseOnset, traceDicePoseHistory,
  verifyDicePose, visible } from './dice-pose-continuity.mjs';
import { refineIncompletePair, shortDicePairs } from './short-dice-pairs.mjs';
import { recoverStationaryFaces } from './stationary-face-votes.mjs';
import { backfillClosingRoll, inferGameBoundary } from './game-boundary.mjs';
import {
  evaluateDecision, loadEvaluator, matchingTurns, okay, positional, rowsFrom, stateFor,
} from '../v2/solve_games.mjs';

const { boardKey, commitTurn, initialState, pipCount, stepsForDie } = await import(solverUrl('backgammon/core/rules.mjs'));
const { fromXGID } = await import(solverUrl('backgammon/core/xgid.mjs'));
const names = ['white', 'dark'];
const fps = 25;
const allDice = Array.from({ length: 6 }, (_, i) =>
  Array.from({ length: 6 - i }, (_, j) => [i + 1, i + j + 1])).flat();
const openingState = initialState();
const opening = boardKey(openingState);
const baseline = path.join(artifactDir, 'v4');
const out = path.resolve(process.env.OFFICE3_REPLAY_DIR ?? baseline);
const observationsDir = path.resolve(process.env.OFFICE3_VISION_OBSERVATIONS_DIR ?? baseline);
const poseStateDir = process.env.OFFICE3_VISION_POSE_STATE_DIR;
const longFootprintFile = process.env.OFFICE3_VISION_LONG_FOOTPRINTS;
const longFootprints = longFootprintFile ? JSON.parse(fs.readFileSync(longFootprintFile, 'utf8')) : {};
const v2 = path.join(artifactDir, 'v2');

const load = (dir, file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
const sameDice = (a, b) => a?.[0] === b?.[0] && a?.[1] === b?.[1];
const opposite = (who) => names[1 - names.indexOf(who)];
const together = (a, b, padding = 0) =>
  a.start <= b.end + padding && b.start <= a.end + padding;
const range = (start, end) => ({ start, end });

function sourceRows(game) {
  return game.segments.flatMap((part) =>
    rowsFrom(path.join(visionStateDir, part.source.replace(/\.mp4$/, '.jsonl.gz')))
      .slice(part.firstFrame, part.lastExclusive)
      .map((row, offset) => ({
        ...row, sourceFrame: row.frame, frame: part.firstGameFrame + offset,
        seconds: (part.firstGameFrame + offset) / fps,
      })));
}

function dicePoseFrames(game) {
  if (!poseStateDir) return null;
  return game.segments.flatMap(part =>
    rowsFrom(path.join(poseStateDir, part.source.replace(/\.mp4$/, '.jsonl.gz')))
      .slice(part.firstFrame, part.lastExclusive).map(row => row.state));
}

function positionRecord(position, frame) {
  const state = stateFor(position, 0, [1, 2]);
  return { position, key: boardKey(state), pips: [pipCount(state, 0), pipCount(state, 1)],
    representative: frame, start: frame / fps, end: frame / fps };
}

function boardRuns(rows, first, last) {
  const known = new Map();
  const records = rows.slice(first, last).map((row) => {
    const position = observedBoard(row.state);
    if (!position) return null;
    const key = JSON.stringify(position);
    if (!known.has(key)) known.set(key, okay(position) ? positionRecord(position, row.frame) : null);
    return known.get(key);
  });
  const runs = [];
  const radius = 10;
  let active;
  for (let i = 0; i < records.length; i++) {
    const observed = records[i];
    if (!observed) continue;
    const support = records.slice(Math.max(i - radius, 0), i + radius + 1)
      .filter((other) => other === observed).length;
    if (support < 6) continue;
    const frame = first + i;
    if (active?.key !== observed.key || frame - active.last > 62) {
      active = { ...observed, first: frame, last: frame, start: frame / fps, representative: frame, count: 0 };
      runs.push(active);
    }
    active.last = frame;
    active.end = frame / fps;
    active.count++;
  }
  const stable = runs.filter((r) => r.count >= 6);
  // Suppress a short conflicting read inside two observations of the same board.
  return stable.filter((r, i) => {
    const prev = stable[i - 1], next = stable[i + 1];
    return !prev || !next || prev.key !== next.key || next.first - prev.last > fps * 2 || r.count >= 13;
  });
}

function seededTurn(entry, rows) {
  const beforeState = fromXGID(entry.xgid);
  const before = positionRecord({
    points: beforeState.points.map((n) => [Math.max(n, 0), Math.max(-n, 0)]),
    bar: beforeState.bar, borneOff: beforeState.off,
  }, entry.preMoveFrame);
  const resultFrame = entry.observedResultFrame;
  const afterPosition = resultFrame === null ? null : rows[resultFrame]?.state?.position;
  const after = afterPosition ? positionRecord(afterPosition, resultFrame) : null;
  const start = Math.round((entry.rollSettledSeconds ?? entry.startSeconds) * fps);
  return {
    player: entry.player, dice: entry.dice, start, end: Math.round(entry.endSeconds * fps),
    before, after, resultFrame, steps: entry.played?.steps, existing: entry,
    evidence: entry.evidence, priority: entry.countedInGameLoss ? 10 : after ? 8 : 4,
  };
}

function rawSide(rows, start, end, dice) {
  const votes = [0, 0];
  for (let i = Math.max(0, start - 8); i <= Math.min(rows.length - 1, end); i++) {
    const candidates = rows[i].state?.dice ?? [];
    for (let side = 0; side < names.length; side++) {
      const seen = candidates.filter((d) => (side === 0 ? d.center[0] <= 260 : d.center[0] >= 310) &&
        d.score >= .62 && d.locationScore >= .20);
      const values = seen.map((d) => d.value || d.candidateValue);
      const faces = [...values].sort((a, b) => a - b);
      if (faces.length === 2 && sameDice(faces, dice)) votes[side]++;
    }
  }
  const which = Number(votes[1] > votes[0]);
  return votes[which] >= 5 && votes[which] >= votes[1 - which] * 2 ? names[which] : null;
}

function samePose(a, b) {
  if (!a || !b) return false;
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  return Math.min(Math.max(dist(a[0], b[0]), dist(a[1], b[1])),
    Math.max(dist(a[0], b[1]), dist(a[1], b[0]))) < 12;
}

function observedRolls(game, observations, rows) {
  const pairs = observations.pairs.map(r => ({ ...r,
    evidence: r.actorEvidence === 'dice-body-agreement' ? 'physical-dice-color-and-stationary-tracks' : 'same-half-dice-tracks',
  }));
  const legacy = game.conditional.map((entry) => {
    const start = Math.round(entry.startSeconds * fps), end = Math.round(entry.endSeconds * fps);
    const pair = pairs.find((r) => together(r, { start, end }) && sameDice(r.dice, entry.dice));
    const tracked = pairs.some((r) => together(r, { start, end }) &&
      Math.min(r.end, end) - Math.max(r.start, start) >= 12);
    if (tracked && !pair) return null;
    const player = pair?.player || rawSide(rows, start, end, entry.dice);
    return { start, end, dice: entry.dice, player, quality: .64,
      beforeFrame: entry.byPlayer[0].preMoveFrame, alternatives: entry.byPlayer,
      evidence: 'rolling-area-and-repeated-dice' };
  }).filter(Boolean);
  const partials = observations.individual.filter((r) => r.quality >= .78 && r.end - r.start >= 17 &&
    !pairs.some((p) => together(p, r, 12) && p.player === r.player));
  const rolls = [...pairs, ...legacy, ...partials.map((r) => ({
    ...r, dice: [r.value, null], evidence: 'single-die-track',
  }))];
  for (const roll of rolls) {
    const correction = observations.reviewed.find((r) => together(roll, r) && r.end - r.start >= 10 &&
      (!r.centers || samePose(r.centers, roll.centers)));
    if (correction) {
      roll.dice = correction.dice;
      roll.evidence = 'reviewed-neighboring-frames';
      if (correction.centers) {
        roll.reviewedPose = true;
        roll.quality = Math.max(.94, roll.quality);
      }
    }
  }
  return rolls.sort((a, b) => a.start - b.start);
}

function matchRoll(roll, runs, end, known) {
  const options = roll.dice[0] === null ? allDice :
    roll.dice[1] === null ? allDice.filter((d) => d.includes(roll.dice[0])) : [roll.dice];
  const pre = runs.filter((r) => r.first <= roll.start + 5 && r.last >= roll.start - 65).slice(-3);
  const following = runs.filter((r) => r.first >= roll.start + 5 && r.first <= end && r.count >= 10);
  const which = known ? names.indexOf(known) : null;
  const matches = [];
  for (const before of pre) {
    if (roll.opening && before.key !== opening) continue;
    for (const after of following) {
      const exact = matchingTurns(before, after, options, which);
      if (exact.length === 1) matches.push({ ...exact[0], before, after });
    }
  }
  const before = pre.at(-1);
  if (!matches.length && roll.stationaryFaces && known && before?.position.bar[which]) {
    const firstAtEnd = following.find(after => after.last >= roll.end);
    const state = stateFor(before.position, which, roll.dice);
    if (firstAtEnd?.key === before.key && !following.some(after => after.key !== before.key) &&
        roll.dice.every(face => stepsForDie(state, face).length === 0)) {
      matches.push({ player: which, dice: roll.dice, steps: [], before, after: firstAtEnd,
        resultFrame: Math.max(firstAtEnd.first, roll.end) });
    }
  }
  // Prefer the last observed pre-roll board and an established result that
  // persists to pickup. A different legal result may be a mid-turn board.
  matches.sort((a, b) => b.before.last - a.before.last ||
    Math.abs(a.after.first - roll.end) - Math.abs(b.after.first - roll.end) ||
    b.after.count - a.after.count);
  return { before, match: matches[0] };
}

function inferDiceFromCheckers(roll, match, runs, poseFrames, until) {
  if (!poseFrames || roll.opening || roll.dice.some(Number.isInteger) ||
      roll.actorEvidence !== 'dice-body-agreement' || roll.centers?.length !== 2 ||
      names[match.player] !== roll.player) return null;
  const { before, after } = match;
  if (before.count < 12 || before.last < roll.start - 25 || after.count < 12 ||
      after.last < roll.end - 24 || after.first > roll.end + 25) return null;
  const lastBoard = runs.findLast(run => run.first <= until && run.last >= roll.end - 24 && run.count >= 12);
  if (lastBoard?.key !== after.key) return null;
  const frames = poseFrames.slice(roll.start, Math.min(roll.end + 1, roll.start + 40));
  const hits = frames.flatMap((frame, offset) => pairVisible(frame, roll.centers) ? [roll.start + offset] : []);
  if (hits.length < 6 || hits.at(-1) - hits[0] < 8) return null;
  return { firstPose: hits[0], lastPose: hits.at(-1), samples: hits.length,
    before: before.last, after: after.first };
}

function extendedRoll(roll, runs, poseFrames, limit, rolls) {
  if (!poseFrames || roll.reviewedPose || !roll.player || roll.dice[0] === null) return null;
  const pose = verifyDicePose(roll, poseFrames, limit);
  if (!pose) return null;
  const next = rolls.find(other => other.start > pose.end && other.player !== roll.player &&
    other.centers && other.quality >= .75);
  // A clear board may only become visible as the player removes the dice.
  // Stop at the next credible throw before that player can move checkers.
  const resultLimit = Math.min(pose.end + 25, next ? next.start - 1 : limit - 1);
  const before = runs.filter(r => r.first <= pose.start + 5 && r.last >= pose.start - 65).at(-1);
  const after = runs.filter(r => r.first >= pose.start + 5 && r.first <= resultLimit &&
    r.last >= pose.end - 24 && r.count >= 12).at(-1);
  const diceOptions = roll.stationaryFaces ? [roll.dice] : allDice;
  const options = before && after ? matchingTurns(before, after, diceOptions, names.indexOf(roll.player)) : [];
  const match = options.length === 1 && roll.dice.some(face => options[0].dice.includes(face)) ? options[0] : null;
  if (!match) {
    // Strong reads at the same two locations can establish a roll even
    // when the observed checker movement cannot be scored.
    if (pose.relocatedAt != null || roll.actorEvidence !== 'dice-body-agreement' ||
        roll.quality < .90 || !roll.dice.every(Number.isInteger)) return null;
    return { ...roll, ...pose, before, resultFrame: null, evidence: 'continuous-dice-poses', priority: 8 };
  }
  return { ...roll, ...pose, before, after, dice: match.dice, resultFrame: after.first, steps: match.steps,
    evidence: 'continuous-dice-poses-and-legal-result', priority: 9 };
}

function footprintRoll(seed, proof, trials, runs, nextBoundary) {
  const { sourceStart, firstTogether, lastTogether, clear, coverage, maxGap, centers, player } = proof;
  if (clear === null || coverage < .67 || maxGap > 160 || clear - firstTogether < fps * 5) return null;
  const corroboration = trials.filter(roll => roll.player === player && roll.start >= sourceStart && roll.start < clear &&
    samePose(roll.centers, centers));
  const votes = new Map();
  for (const observed of corroboration) {
    for (const face of new Set(observed.dice.filter(Number.isInteger))) votes.set(face, (votes.get(face) ?? 0) + 1);
  }
  const stableFaces = [...votes].filter(([, count]) => count >= 2).map(([face]) => face);
  // The camera proves these are still the same dice. Independent face votes
  // help choose between otherwise legal rolls to the same resulting board.
  const diceOptions = seed.dice.every(Number.isInteger) ? [seed.dice] :
    stableFaces.length ? allDice.filter(dice => stableFaces.every(face => dice.includes(face))) : [];
  const nextThrow = trials.find(roll => roll.start >= clear && roll.centers &&
    (roll.reviewedPose || roll.quality >= .80 && roll.dice.every(Number.isInteger)));
  const resultLimit = Math.min(clear + 24, nextBoundary - 1, (nextThrow?.start ?? Infinity) - 1);
  const before = runs.filter(run => run.first <= firstTogether + 5 && run.last >= sourceStart - 65).at(-1);
  const after = runs.filter(run => run.first >= firstTogether + 5 && run.first <= resultLimit &&
    run.last >= clear - 20 && run.count >= 12).at(-1);
  const matches = before && after ? matchingTurns(before, after, diceOptions, names.indexOf(player)) : [];
  if (matches.length !== 1) return null;
  const [match] = matches;
  return { ...seed, start: Math.min(sourceStart, firstTogether), end: Math.max(clear - 1, after.first),
    pickupFrame: clear, poseLastSeen: lastTogether,
    before, after, dice: match.dice, steps: match.steps, resultFrame: after.first, footprint: proof,
    evidence: 'stationary-footprints-and-legal-result', priority: 12 };
}

function relocatedRoll(followup, proof, rolls, runs, poseFrames, limit) {
  if (!poseFrames || proof.clear !== null || proof.coverage < .90 || proof.maxGap > 24 ||
      proof.lastTogether - proof.firstTogether < fps * 5 || followup.dice[1] !== null) return null;
  const earlier = rolls.findLast(roll => roll.start < followup.start && roll.player === followup.player &&
    roll.centers?.length === 2 && roll.actorEvidence === 'dice-body-agreement' &&
    roll.dice.every(Number.isInteger) && roll.quality >= .90 &&
    roll.end < proof.firstTogether && proof.firstTogether - roll.end <= 150);
  if (!earlier || rolls.some(roll => roll.start > earlier.start && roll.start < proof.lastTogether &&
      roll.centers?.length === 2 && roll.quality >= .85 && roll.dice.every(Number.isInteger))) return null;
  const next = rolls.find(roll => roll.start > proof.lastTogether && roll.centers && roll.quality >= .80 &&
    roll.dice.every(Number.isInteger));
  const cutoff = Math.min(limit, next?.start ?? limit);
  const pose = rejoinDicePose(earlier, followup, proof, poseFrames, cutoff);
  if (!pose) return null;
  const before = runs.findLast(run => run.first <= earlier.start && run.last >= earlier.start - fps && run.count >= 12);
  const after = runs.findLast(run => run.first > earlier.start && run.first < Math.min(cutoff, pose.pickupFrame + fps) &&
    run.last >= pose.pickupFrame - 5 && run.count >= 12);
  const [move] = before && after ? matchingTurns(before, after, [earlier.dice], names.indexOf(earlier.player)) : [];
  return move ? { ...earlier, ...pose, end: Math.max(pose.pickupFrame - 1, after.first), before, after,
    steps: move.steps, resultFrame: after.first, evidence: 'continuous-dice-poses-and-legal-result',
    priority: 12, movedDie: { previousCenters: earlier.centers, laterCenters: proof.centers, ...pose } } : null;
}

function recoverRollHistory(roll, rolls, runs, frames, first, last, offers) {
  if (!frames || roll.opening || roll.reviewedPose || roll.centers?.length !== 2 ||
      roll.actorEvidence !== 'dice-body-agreement' || roll.quality < .72 ||
      !Number.isInteger(roll.dice[0]) || roll.dice[1] !== null || roll.end - roll.start < 4 * fps) return null;
  const reliable = other => other.centers?.length === 2 && other.quality >= .85 && other.dice.every(Number.isInteger);
  const prior = rolls.findLast(other => other.end < roll.start && reliable(other));
  const next = rolls.find(other => other.start > roll.end && reliable(other));
  const beforeOffer = offers.findLast(offer => offer.endFrame < roll.start);
  const afterOffer = offers.find(offer => offer.startFrame > roll.end);
  if (offers.some(offer => roll.start < offer.endFrame && roll.end >= offer.startFrame)) return null;
  const lower = Math.max(first, (prior?.end ?? -1) + 1, beforeOffer?.endFrame ?? first);
  const cutoff = Math.min(last, next?.start ?? last, afterOffer?.startFrame ?? last);
  const poseHistory = traceDicePoseHistory(roll, frames, lower, cutoff);
  if (!poseHistory || rolls.some(other => other.start > poseHistory.start && other.start < poseHistory.pickupFrame &&
      reliable(other))) return null;
  const { start, face, pickupFrame, poseLastSeen } = poseHistory;
  const before = runs.findLast(run => run.first <= start && run.last >= start - fps && run.count >= 12);
  const after = runs.findLast(run => run.first >= pickupFrame - 8 && run.first < Math.min(cutoff, pickupFrame + fps) &&
    run.last >= pickupFrame && run.count >= 12);
  const matches = before && after ? matchingTurns(before, after, allDice.filter(dice => dice.includes(face)),
    names.indexOf(roll.player)) : [];
  if (matches.length !== 1) return null;
  const [move] = matches;
  return { ...roll, start, end: Math.max(pickupFrame - 1, after.first), centers: poseHistory.history[0].centers,
    dice: move.dice, before, after, steps: move.steps, resultFrame: after.first, pickupFrame, poseLastSeen,
    evidence: 'dice-pose-history-and-legal-result', priority: 12, poseHistory: { ...poseHistory, seedStart: roll.start } };
}

function proposedRolls(game, observations, rows, runs, first, last, anchors, poseFrames) {
  const rolls = observedRolls(game, observations, rows).filter((r) => r.start >= first && r.start < last)
    .map(roll => recoverStationaryFaces(roll, rows, poseFrames, first, last));
  const spans = (longFootprints[game.number] ?? []).flatMap(proof => {
    const proofEnd = proof.clear ?? proof.lastTogether;
    if (proof.sourceStart < first || proofEnd >= last ||
        game.reviewedCubeOffers.some(offer => offer.startFrame < proofEnd && offer.endFrame >= proof.sourceStart)) return [];
    const seed = rolls.find(roll => roll.start === proof.sourceStart && roll.player === proof.player &&
      samePose(roll.centers, proof.centers));
    if (!seed || seed.reviewedPose) return [];
    if (proof.clear === null) {
      const offer = game.reviewedCubeOffers.find(item => item.startFrame >= proofEnd);
      const resumed = relocatedRoll(seed, proof, rolls, runs, poseFrames, Math.min(last, offer?.startFrame ?? last));
      return resumed ? [resumed] : [];
    }
    if (rolls.some(roll => roll.reviewedPose && roll.start > proof.firstTogether && roll.start < proof.clear &&
      roll.centers && !samePose(roll.centers, proof.centers))) return [];
    const nextOffer = game.reviewedCubeOffers.find(offer => offer.startFrame >= proof.clear);
    const stationary = footprintRoll(seed, proof, rolls, runs, Math.min(last, nextOffer?.startFrame ?? last));
    return stationary ? [stationary] : [];
  });
  const normal = rolls.flatMap((roll) => {
    const history = recoverRollHistory(roll, rolls, runs, poseFrames, first, last, game.reviewedCubeOffers);
    if (history) return [history];
    const extended = extendedRoll(roll, runs, poseFrames, last, rolls);
    if (extended) return [extended];
    const next = rolls.find((r) => r.start > roll.end &&
      (r.quality >= .80 && r.dice[1] !== null ||
        roll.stationaryFaces && r.actorEvidence === 'dice-body-agreement' && r.centers));
    const anchor = anchors.find((r) => r.start > roll.start + 10 && r.priority >= 8);
    const until = Math.min(last - 1, roll.end + 55, roll.stationaryFaces ? Infinity : roll.start + fps * 19,
      next ? next.start - 1 : Infinity, anchor ? anchor.start - 1 : Infinity);
    const attempt = matchRoll(roll, runs, until, roll.player);
    const fallback = !attempt.match && roll.centers && !roll.reviewedPose && !roll.stationaryFaces && roll.dice[1] !== null
      ? matchRoll({ ...roll, dice: [roll.dice[0], null] }, runs, until, roll.player).match
      : null;
    const { before } = attempt;
    const match = attempt.match || fallback;
    if (roll.opening && (!match || match.before.key !== opening)) return [];
    if (match) {
      const player = names[match.player];
      const fullVision = !fallback && roll.dice[1] !== null;
      const hasFace = roll.dice[0] !== null;
      const checkerDice = !hasFace && inferDiceFromCheckers(roll, match, runs, poseFrames, until);
      return [{ ...roll, player, dice: hasFace || checkerDice ? match.dice : null, before: match.before, after: match.after,
        resultFrame: match.resultFrame ?? match.after.first, steps: hasFace || checkerDice ? match.steps : null,
        ...(checkerDice && { checkerDice }),
        ...(roll.centers ? { poseLastSeen: roll.end } : {}),
        end: Math.min(until, Math.max(roll.end, match.resultFrame ?? (match.after.first + 14))),
        evidence: fullVision ? (roll.reviewedPose ? 'reviewed-roll-and-legal-result' :
          roll.stationaryFaces ? 'stationary-faces-and-legal-result' : 'tracked-roll-and-legal-result') : hasFace ?
          'legal-result-and-single-die' : checkerDice ? 'two-dice-bodies-and-unique-legal-roll' : 'two-dice-poses-and-legal-result',
        priority: roll.reviewedPose ? 11 : fullVision ? 9 : 7 }];
    }
    if (!roll.player) return [];
    const sameSide = observations.individual.filter((track) => track.player === roll.player &&
      together(track, roll, 8)).length;
    const crediblePair = roll.dice[1] !== null && (roll.stationaryFaces || roll.quality >= .82 ||
      (roll.alternatives && roll.end - roll.start >= 20) || (sameSide >= 2 && roll.end - roll.start >= 42));
    const crediblePartial = roll.dice[1] === null &&
      ((roll.centers && roll.end - roll.start >= 28) || (roll.quality >= .84 && roll.end - roll.start >= 25));
    if (!crediblePair && !crediblePartial) return [];
    return [{ ...roll, before, ...(roll.centers ? { poseLastSeen: roll.end } : {}),
      end: Math.min(last - 1, roll.end + 14),
      resultFrame: null, priority: roll.reviewedPose ? 11 : crediblePair ? 5 : 2 }];
  });
  return [...spans, ...normal];
}

function boardOnlyTurns(runs, anchors) {
  const proposals = [];
  for (let i = 1; i < runs.length; i++) {
    const before = runs[i - 1], after = runs[i];
    if (after.first - before.last > 60 || before.count < 14 || after.count < 16) continue;
    const window = range(Math.max(before.first, before.last - 14), after.first + 16);
    if (anchors.some((r) => together(r, window, 12))) continue;
    const plays = matchingTurns(before, after, allDice);
    const players = new Set(plays.map((a) => a.player));
    if (players.size !== 1) continue;
    const p = plays[0], future = runs[i + 1];
    if (future && future.first - after.last < 24 && future.pips[p.player] < after.pips[p.player] &&
        future.pips[1 - p.player] >= after.pips[1 - p.player]) continue;
    // A legal board transition identifies the mover, while multiple possible
    // dice combinations still leave the faces unconfirmed.
    proposals.push({ ...window, before, after, player: names[p.player], dice: null,
      resultFrame: after.first, evidence: 'legal-checker-transition', priority: 6 });
  }
  return proposals;
}

function matchHandoff(grade, incoming, runs, start, firstResult, lastResult, diceOptions) {
  const shared = runs.find(run => run.key === grade.after.key && run.count >= 12 &&
    run.first <= start + fps && run.last >= start);
  if (!shared) return null;
  const prior = stateFor(grade.before.position, names.indexOf(grade.player), grade.dice);
  try {
    if (boardKey(commitTurn(prior, grade.steps)) !== shared.key) return null;
  } catch {
    return null;
  }
  const ending = runs.findLast(run => run.first > shared.last && run.first <= lastResult &&
    run.last >= firstResult && run.count >= 12);
  const matches = ending ? matchingTurns(shared, ending, diceOptions, names.indexOf(incoming.player)) : [];
  return matches.length === 1 ? { move: matches[0], shared, ending } : null;
}

function reconcilePhysicalHandoffs(anchors, visual, runs, poseFrames) {
  if (!poseFrames) return [];
  const physical = visual.filter(roll => !roll.opening && !roll.footprint && roll.centers?.length === 2 &&
    roll.actorEvidence === 'dice-body-agreement' && roll.quality >= .90 &&
    roll.poseLastSeen - roll.start >= fps && roll.dice?.every(Number.isInteger))
    .sort((a, b) => a.start - b.start);
  const reconciled = [];
  for (const [index, outgoing] of physical.entries()) {
    const incoming = physical[index + 1];
    if (!incoming || outgoing.player === incoming.player || outgoing.poseLastSeen >= incoming.start ||
        incoming.start - outgoing.poseLastSeen > 2 * fps) continue;
    // Match the late archived grade to the earlier pose it was scored from.
    // The previous complete board and both recorded die faces must agree.
    const grades = anchors.filter(turn => turn.steps?.length && turn.after && turn.player === outgoing.player &&
      sameDice(turn.dice, outgoing.dice) && turn.before.key === outgoing.before?.key &&
      turn.start > outgoing.start && turn.start <= outgoing.poseLastSeen && turn.end >= incoming.start &&
      Math.abs(turn.resultFrame - incoming.start) <= fps);
    if (grades.length !== 1 || incoming.after) continue;
    const grade = grades[0];
    const start = stationaryPoseOnset(poseFrames, incoming.centers, incoming.start,
      Math.min(incoming.start + fps, incoming.poseLastSeen));
    if (start === null || start <= outgoing.poseLastSeen) continue;
    const cutoff = Math.min(incoming.poseLastSeen + 55, physical[index + 2]?.start - 1 || Infinity);
    const match = matchHandoff(grade, incoming, runs, start, incoming.poseLastSeen - fps, cutoff, [incoming.dice]);
    if (!match) continue;
    const { move, shared, ending } = match;
    const witness = { outgoingStart: outgoing.start, outgoingSeen: outgoing.poseLastSeen,
      previousGradeStart: grade.start, incomingStart: start, sharedBoard: shared.first };
    reconciled.push(
      { ...grade, start: outgoing.start, end: start - 1, centers: outgoing.centers,
        poseLastSeen: outgoing.poseLastSeen, priority: 12, physicalHandoff: witness },
      { ...incoming, start, end: ending.first, before: shared, after: ending, steps: move.steps,
        resultFrame: ending.first, evidence: 'physical-handoff-and-legal-result', priority: 12, physicalHandoff: witness },
    );
  }
  return reconciled;
}

function reconcilePartialHandoffs(anchors, pairs, runs, frames, first, last, offers) {
  if (!frames) return [];
  const bodyPairs = pairs.filter(pair => pair.start >= first && pair.start < last && !pair.opening &&
    pair.centers?.length === 2 && pair.actorEvidence === 'dice-body-agreement');
  const reconciled = [];
  for (const incoming of bodyPairs) {
    if (!Number.isInteger(incoming.dice[0]) || incoming.dice[1] !== null || incoming.end - incoming.start < 4 * fps ||
        offers.some(offer => offer.startFrame <= incoming.end && offer.endFrame >= incoming.start)) continue;
    const start = stationaryPoseOnset(frames, incoming.centers, incoming.start, incoming.start + fps);
    if (start === null) continue;
    const priorCandidates = anchors.filter(grade => grade.after && grade.steps?.length && grade.player !== incoming.player &&
      grade.start < start && grade.end >= start && Math.abs(grade.resultFrame - start) <= fps);
    if (priorCandidates.length !== 1) continue;
    const grade = priorCandidates[0];
    const priorBodies = bodyPairs.filter(pair => pair.player === grade.player && pair.start <= grade.start &&
      pair.end >= grade.start + fps && pair.end < start && start - pair.end <= 2 * fps &&
      pair.dice.every(face => face === null || grade.dice.includes(face)));
    if (priorBodies.length !== 1) continue;
    const [outgoing] = priorBodies;
    if (frames.slice(grade.start, grade.start + 12).filter(read => pairVisible(read, outgoing.centers)).length < 6) continue;
    const priorPickup = pickupAfterPose(outgoing, frames, start);
    const nextRoll = bodyPairs.find(pair => pair.start > incoming.end && pair.quality >= .72);
    const nextOffer = offers.find(offer => offer.startFrame > incoming.end);
    const cutoff = Math.min(last, nextRoll?.start ?? last, nextOffer?.startFrame ?? last);
    const pickup = pickupAfterPose(incoming, frames, cutoff);
    if (!priorPickup || !pickup) continue;
    const known = incoming.dice[0];
    const match = matchHandoff(grade, incoming, runs, start, pickup.pickupFrame, Math.min(cutoff - 1, pickup.pickupFrame + fps),
      allDice.filter(dice => dice.includes(known)));
    if (!match || match.ending.first < pickup.pickupFrame - 8) continue;
    const { shared, ending, move } = match;
    const witness = { outgoingStart: grade.start, outgoingSeen: priorPickup.poseLastSeen, previousGradeStart: grade.start,
      incomingStart: start, sharedBoard: shared.first, observedFace: known };
    reconciled.push(
      { ...grade, end: priorPickup.pickupFrame - 1, centers: outgoing.centers, ...priorPickup,
        priority: 12, physicalHandoff: witness },
      { ...incoming, start, end: Math.max(pickup.pickupFrame - 1, ending.first), ...pickup, dice: move.dice,
        before: shared, after: ending, steps: move.steps, resultFrame: ending.first,
        evidence: 'physical-handoff-and-legal-result', priority: 12, physicalHandoff: witness },
    );
  }
  return reconciled;
}

function chooseTurns(proposals, last) {
  const turns = [];
  for (const roll of [...proposals].sort((a, b) => b.priority - a.priority || a.start - b.start)) {
    const existing = turns.find((r) => {
      if (!together(r, roll, 10)) return false;
      if (r.footprint || roll.footprint) return together(r, roll);
      const [before, after] = r.start < roll.start ? [r, roll] : [roll, r];
      // Physical handoffs carry their own timing and preserve both turns.
      if ((before.physicalHandoff || after.physicalHandoff) && before.player !== after.player &&
          before.end < after.start) return false;
      // A presentation buffer must not swallow the other player's next throw.
      if ((before.stationaryFaces || after.stationaryFaces) && before.player !== after.player &&
          before.centers && after.centers && before.poseLastSeen < after.start &&
          (before.resultFrame == null || before.resultFrame < after.start)) return false;
      if (r.evidence !== 'continuous-dice-poses-and-legal-result' &&
          roll.evidence !== 'continuous-dice-poses-and-legal-result') return true;
      return before.player === after.player || before.end > after.start + 15 ||
        before.resultFrame == null || before.resultFrame >= after.start ||
        !before.after || before.after.key !== after.before?.key;
    });
    if (!existing) {
      turns.push({ ...roll });
      continue;
    }
    if (!existing.footprint && !existing.physicalHandoff && !existing.movedDie && !existing.poseHistory &&
        existing.player === roll.player && sameDice(existing.dice, roll.dice) &&
        (existing.before?.key === roll.before?.key || !existing.before || !roll.before)) {
      existing.start = Math.min(existing.start, roll.start);
      existing.end = Math.max(existing.end, roll.end);
    }
  }
  turns.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const roll of turns) {
    const previous = merged.at(-1);
    const sameBoard = previous?.before?.key && previous.before.key === roll.before?.key;
    if (previous && previous.player === roll.player && sameDice(previous.dice, roll.dice) &&
        roll.start - previous.end <= (sameBoard ? 115 : 40) && !previous.after && !roll.after &&
        (!previous.before || !roll.before || sameBoard)) {
      previous.end = Math.max(previous.end, roll.end);
    } else merged.push(roll);
  }
  return merged.map((r, i) => ({
    ...r, end: Math.min(last - 1, merged[i + 1]?.start - 1 || Infinity, r.end),
  })).filter((r) => r.end >= r.start);
}

function blockedEntryEvidence(rows, first, last, player, faces) {
  const index = names.indexOf(player);
  const targets = faces.map(face => index === 0 ? 24 - face : face - 1);
  const observations = new Map();
  for (const row of rows.slice(first, last)) {
    const view = row.state;
    if (!(view?.bar?.[index] > 0) || view.handRegions?.some(([left, , right]) => left <= 295 && right >= 265)) continue;
    if (!targets.every(target => !view.occludedPoints?.includes(target + 1) &&
        view.points?.[target]?.[index] === 0 && view.points[target][1 - index] >= 2)) continue;
    const count = view.bar[index];
    if (!observations.has(count)) observations.set(count, []);
    observations.get(count).push(row.frame);
  }
  const consistent = [...observations.entries()].filter(([, frames]) => frames.length >= 4);
  return consistent.length === 1 ? consistent[0] : null;
}

function repeatedVisibleBoard(rows, first, last, player) {
  const side = names.indexOf(player);
  const observations = new Map();
  for (const row of rows.slice(first, last)) {
    const view = row.state;
    if (!view?.points || !(view.bar?.[side] > 0) || view.handRegions?.length || view.occludedPoints?.length) continue;
    const key = JSON.stringify([view.points, view.bar]);
    if (!observations.has(key)) observations.set(key, []);
    observations.get(key).push(row.frame);
  }
  const stable = [...observations.entries()].filter(([, frames]) => frames.length >= 4);
  return stable.length === 1 ? stable[0] : null;
}

function findBlockedFans(turns, pairs, fresh, rows, poses, runs, first, last, offers) {
  if (!poses) return turns;
  const confirmed = pairs.filter(pair => pair.actorEvidence === 'dice-body-agreement' && !pair.opening && pair.centers?.length === 2);
  const candidates = [...confirmed, ...fresh.filter(pair => !confirmed.some(saved =>
    together(pair, saved, 8) && samePose(pair.centers, saved.centers)))];
  const result = [...turns];
  for (const pair of candidates) {
    const length = pair.end - pair.start;
    if (pair.start < first || pair.end >= last || length < 10 || length > 75 ||
        offers.some(offer => offer.startFrame <= pair.end && offer.endFrame >= pair.start)) continue;
    const start = stationaryPoseOnset(poses, pair.centers, pair.start, pair.end) ??
      pair.shortPairEvidence?.firstTogether ?? pair.firstTogether;
    if (start == null) continue;
    const overlapping = result.filter(turn => turn.start >= start - 15 && turn.start < pair.end && turn.player === pair.player);
    if (overlapping.length > 1 || overlapping.some(turn => turn.steps || turn.dice?.every(Number.isInteger))) continue;
    const existing = overlapping[0];
    const prior = result.findLast(turn => turn !== existing && turn.start < start);
    const next = result.find(turn => turn !== existing && turn.start >= start);
    if (!prior || !next || prior.player === pair.player || next.player === pair.player ||
        prior.poseLastSeen >= start || prior.resultFrame > start || prior.end > start + 12) continue;
    const pickup = pickupAfterPose(pair, poses, last);
    if (!pickup || pickup.pickupFrame > next.start + 15) continue;
    const { pickupFrame, poseLastSeen } = pickup;
    const incoming = pickupFrame > next.start && confirmed.find(candidate => candidate.player === next.player &&
      Math.abs(candidate.start - next.start) <= 8 && candidate.dice.some(face => Number.isInteger(face) && next.dice?.includes(face)));
    const settled = incoming && stationaryPoseOnset(poses, incoming.centers, incoming.start,
      Math.min(incoming.end, next.start + fps));
    const nextStart = settled >= pickupFrame && settled < next.end && (next.resultFrame == null || settled < next.resultFrame)
      ? settled : next.start;
    const rawReads = rows.slice(start, poseLastSeen + 1).map(row => row.state);
    const poseReads = poses.slice(start, poseLastSeen + 1);
    const saved = pair.dice?.filter(Number.isInteger) ?? [];
    const seenFaces = pair.centers.map(center => {
      const face = faceAt(rawReads, center);
      const alternate = faceAt(poseReads, center);
      return alternate !== null && (face === alternate || face === null && saved.length === 1 && saved[0] === alternate)
        ? alternate : null;
    }).filter(Number.isInteger);
    // The paired read can be stronger than either short per-location sequence.
    const dice = saved.length === 2 && pair.quality >= .82 && seenFaces.every(face => saved.includes(face)) ?
      saved : seenFaces;
    const consistent = saved.length !== 1 || dice.includes(saved[0]);
    const blocked = consistent && dice.length === 2 ? [...new Set(dice)] : [1, 2, 3, 4, 5, 6];
    const beforeStart = Math.max(first, start - 18);
    const afterEnd = Math.min(last, pickupFrame + 23, nextStart + 20);
    const beforeReads = blockedEntryEvidence(rows, beforeStart, start + 10, pair.player, blocked);
    const afterReads = blockedEntryEvidence(rows, pickupFrame, afterEnd, pair.player, blocked);
    const verifiedBlock = beforeReads && afterReads && beforeReads[0] === afterReads[0];
    let observations;
    if (verifiedBlock) {
      observations = [beforeReads[1].at(-1), afterReads[1][0]];
    } else {
      if (dice.length === 2 || saved.length === 2) continue;
      // Two physical dice and an unchanged board establish the turn.
      // Keep the faces and legality unresolved when entry is not verified.
      const earlier = repeatedVisibleBoard(rows, beforeStart, start + 10, pair.player);
      const later = repeatedVisibleBoard(rows, pickupFrame, afterEnd, pair.player);
      if (!earlier || earlier[0] !== later?.[0]) continue;
      observations = [earlier[1].at(-1), later[1][0]];
    }
    const before = runs.findLast(run => run.first <= start && run.last >= start - 12 && run.count >= 10);
    const after = runs.find(run => run.key === before?.key && run.first <= pickupFrame + 25 && run.last >= pickupFrame);
    const end = Math.min(nextStart - 1, pickupFrame - 1);
    if (end < start) continue;
    const tail = poses.slice(poseLastSeen, pickupFrame);
    const lastVisibleDie = poseLastSeen + tail.findLastIndex(read => pair.centers.some(center => visible(read, center)));
    if (prior.end >= start) prior.end = start - 1;
    if (existing) result.splice(result.indexOf(existing), 1);
    next.start = nextStart;
    result.push({ ...pair, start, end, ...pickup, dice: verifiedBlock && consistent ?
      [...dice.sort((a, b) => a - b), null, null].slice(0, 2) : [null, null],
      before: after ? before : null, after: after ?? null,
      steps: verifiedBlock ? [] : null, resultFrame: verifiedBlock ? pickupFrame : null,
      evidence: verifiedBlock ? 'camera-pickup-and-blocked-bar' : 'camera-pickup-and-unchanged-board', priority: 9,
      fanEvidence: { before: observations[0], after: observations[1], blocked: verifiedBlock ? blocked : [], lastVisibleDie } });
    result.sort((a, b) => a.start - b.start);
  }
  return result;
}

function reconstruct(game, observations, rows, poseFrames) {
  const brief = poseFrames ? shortDicePairs(poseFrames, observations.breaks) : [];
  if (poseFrames && process.env.OFFICE3_TRIAL_SHORT_DICE === '1') {
    observations = { ...observations, pairs: observations.pairs.map(roll => refineIncompletePair(roll, brief)) };
  }
  const intervals = [...new Set([0, ...observations.breaks, rows.length])].sort((a, b) => a - b);
  return intervals.slice(1).map((last, index) => {
    const first = intervals[index], runs = boardRuns(rows, first, last);
    const old = game.analyses.map((entry) => seededTurn(entry, rows))
      .filter((r) => r.start >= first && r.start < last)
      .filter((r) => {
        // A late flickering face read inside an existing stationary roll may
        // be on an intermediate board. Reconstruct the move from the first
        // observed pose instead of treating the flicker as a new roll.
        const continued = observations.pairs.find((p) => p.player === r.player &&
          p.start < r.start - 70 && p.end >= r.start - 6 &&
          r.before.representative > p.start + 45);
        return !continued;
      });
    const anchors = old.filter((r) => r.priority >= 8).sort((a, b) => a.start - b.start);
    const visual = proposedRolls(game, observations, rows, runs, first, last, anchors, poseFrames);

    // Dice-color-only hypotheses in the older review need independent spatial
    // support. A valid completed legal move is a stronger mover witness.
    const retained = old.filter((r) => r.priority >= 8 ||
      visual.some((v) => together(r, v) && v.player === r.player && sameDice(v.dice, r.dice)));
    const handoffs = reconcilePhysicalHandoffs(anchors, visual, runs, poseFrames);
    const partialHandoffs = reconcilePartialHandoffs(anchors, observations.pairs, runs, poseFrames,
      first, last, game.reviewedCubeOffers);
    const extras = boardOnlyTurns(runs, [...retained, ...visual]);
    const turns = chooseTurns([...handoffs, ...partialHandoffs, ...retained, ...visual, ...extras], last);
    return { first, last, runs, turns: findBlockedFans(turns, observations.pairs, brief, rows, poseFrames,
      runs, first, last, game.reviewedCubeOffers) };
  });
}

function cubeTimeline(game, observations) {
  const changes = [];
  let current;
  const update = (frame, cube) => {
    if (current && current.stake === cube.stake && current.side === cube.side &&
        current.offered === cube.offered && current.closed === cube.closed) return;
    if (changes.at(-1)?.frame === frame) changes.pop();
    current = cube;
    changes.push({ frame, ...cube });
  };
  if (game.number > 1) update(0, { stake: 1, side: 'centered', evidence: 'verified-opening' });
  const offers = game.reviewedCubeOffers;
  const events = observations.cube.filter((r) => r.side !== 'playing-surface');
  for (const e of events) {
    // Game reset is stronger evidence for the starting stake than a face left
    // showing from the preceding game. A raise needs a post-opening change.
    if (game.number > 1 && e.start < 150 && e.stake !== 1) continue;
    if (e.end - e.start < 24 && e.visibleSamples < 20) continue;
    if (current?.stake && e.stake < current.stake) continue;
    if (current?.stake && e.stake > current.stake * 2) continue;
    update(e.start, { stake: e.stake, side: e.side, evidence: e.evidence });
  }
  if (offers.length) {
    const first = offers[0];
    const end = changes.find((c) => c.frame > first.startFrame && c.stake === first.offeredFace)?.frame ?? game.frames;
    const before = changes.filter((c) => c.frame < first.startFrame).at(-1);
    changes.push({
      frame: first.startFrame, stake: first.preOfferStake, side: before?.side,
      offered: first.offeredFace, offerer: first.offerer, responder: opposite(first.offerer),
      evidence: 'reviewed-cube-offer', end,
    });
  }
  return changes.sort((a, b) => a.frame - b.frame);
}

function applyGameBoundary(groups, changes, boundary) {
  const suppressed = [];
  if (!boundary) return { changes, suppressed };
  const stop = boundary.offerFrame ?? boundary.frame;
  for (const group of groups) {
    group.turns = group.turns.flatMap(turn => {
      if (turn.start >= stop) {
        const reason = turn.start >= boundary.frame ? 'post-game' : 'cube-response';
        suppressed.push({ frame: turn.start, end: turn.end, player: turn.player, dice: turn.dice, reason });
        return [];
      }
      if (turn.end < stop) return [turn];
      const validResult = turn.resultFrame == null || turn.resultFrame < stop;
      return [{ ...turn, end: stop - 1,
        ...(!validResult && { after: null, steps: null, resultFrame: null }) }];
    });
  }
  const earlier = changes.filter(cube => cube.frame < stop);
  if (boundary.offerFrame != null) {
    const previous = earlier.at(-1);
    earlier.push({ frame: boundary.offerFrame, stake: boundary.points, side: previous?.side,
      offered: 2 * boundary.points, offerer: boundary.winner, responder: opposite(boundary.winner),
      evidence: 'stationary-cube-on-playing-surface', end: boundary.frame });
  }
  return { changes: [...earlier, { frame: boundary.frame, closed: true, evidence: boundary.kind }], suppressed };
}

function findCube(changes, frame) {
  const pending = changes.find((c) => c.offered && c.frame <= frame && frame < c.end);
  return pending || changes.findLast((c) => c.frame <= frame && !c.offered) || null;
}

function scoringContext(cube) {
  if (cube?.stake === 1 && cube.side === 'centered') return { stake: 1, side: 'centered' };
  return null;
}

function scoreKey(player, dice, before, cube) {
  return [player, ...dice, before, cube ? 'centered' : 'cubeless'].join('|');
}

function existingScores(game) {
  const scores = new Map();
  for (const item of [...game.conditional.flatMap((entry) => entry.byPlayer), ...game.analyses]) {
    scores.set(scoreKey(item.player, item.dice, boardKey(fromXGID(item.xgid)), scoringContext(item.cube)), item);
  }
  return scores;
}

function scoreTurns(game, groups, changes, analysis, shouldScore) {
  const cache = existingScores(game);
  let reused = 0, scored = 0;
  for (const group of groups) {
    for (const turn of group.turns) {
      if (!turn.before || !turn.dice || turn.dice[1] === null) continue;
      const cube = scoringContext(findCube(changes, turn.start));
      const key = scoreKey(turn.player, turn.dice, turn.before.key, cube);
      const old = cache.get(key);
      // Scoring always uses the actual chosen roller. Reuse identical board,
      // roller, dice and cube inputs, including a previously graded move.
      const playedBefore = old?.played ? JSON.stringify(old.played.steps) : null;
      const playedNow = turn.steps ? JSON.stringify(turn.steps) : null;
      if (old && playedBefore === playedNow) {
        turn.decision = old;
        reused++;
      } else if (shouldScore) {
        try {
          turn.decision = evaluateDecision(analysis, {
            start: turn.start / fps, end: turn.end / fps, rollStart: turn.start / fps,
            player: names.indexOf(turn.player), dice: turn.dice, before: turn.before,
            after: turn.after, steps: turn.steps, evidence: turn.evidence,
          }, { rows: [] }, 'research', cube);
          cache.set(key, turn.decision);
          scored++;
        } catch (error) {
          turn.scoringError = error.message;
          console.error('Scoring error', game.number, turn.start, error.message);
        }
      }
    }
  }
  return { reused, scored };
}

function chooseBoardChanges(group) {
  const { runs, turns, first, last } = group;
  const candidates = runs
    .filter((r) => r.count >= 11 && r.last - r.first >= 10)
    .filter((r) => !turns.some((t) => t.before && t.after && r.first > t.start &&
      r.first < t.resultFrame && r.key !== t.before.key))
    .map((run) => ({ frame: run.first, run, evidence: 'multi-frame-checker-count', priority: 0 }));
  for (const t of turns) {
    // Anchor the analysis to the pre-move board through the confirmed result.
    if (t.before) candidates.push({ frame: t.start, run: t.before, evidence: 'pre-move-board', priority: 1 });
    if (t.after && t.resultFrame !== null) candidates.push({
      frame: t.resultFrame, run: t.after, evidence: 'legal-result', priority: 2,
    });
  }
  const ordered = candidates.filter((c) => c.frame >= first && c.frame < last)
    .sort((a, b) => a.frame - b.frame || b.priority - a.priority);
  const unique = ordered.filter((c, i) => ordered[i - 1]?.frame !== c.frame);
  return unique.filter((c, i) => unique[i - 1]?.run.key !== c.run.key);
}

function buildTimeline(game, groups, cubes, rows, analysis, result) {
  const turns = groups.flatMap((g) => g.turns);
  for (const [i, turn] of turns.entries()) turn.id = i + 1;
  const decisions = {};
  const positions = {};
  let lastPositionKey, lastPositionId, positionIndex = 0;
  const output = [], losses = [];
  const seenLosses = new Set();
  for (const turn of turns) {
    const d = turn.decision;
    if (!d) continue;
    const grade = d.evLoss !== null &&
      (turn.existing?.countedInGameLoss || turn.checkerDice || turn.physicalHandoff || turn.movedDie || turn.poseHistory ||
        turn.evidence === 'reviewed-roll-and-legal-result' ||
        turn.evidence === 'stationary-footprints-and-legal-result' ||
        turn.evidence === 'stationary-faces-and-legal-result' ||
        (turn.evidence === 'tracked-roll-and-legal-result' && turn.quality >= .82));
    decisions[turn.id] = { ...d, player: turn.player, startFrame: turn.start, endFrame: turn.end,
      countedInGameLoss: !!grade, evidence: turn.evidence };
    if (grade) {
      const frame = turn.resultFrame ?? turn.end;
      const key = [frame, turn.player, d.xgid].join('|');
      if (!seenLosses.has(key)) {
        losses.push({ frame, player: turn.player, loss: d.evLoss, kind: 'checker' });
        seenLosses.add(key);
      }
    }
  }
  if (game.reviewedCubeOffers.length) {
    const offer = game.reviewedCubeOffers[0];
    decisions.cube = offer;
    losses.push({ frame: offer.startFrame, player: offer.offerer, loss: offer.offerEvLoss, kind: 'cube' });
  }
  losses.sort((a, b) => a.frame - b.frame);
  let applied = 0;
  const cumulative = Object.fromEntries(names.map((name) => [name, { loss: 0, count: 0 }]));
  for (const group of groups) {
    const boards = chooseBoardChanges(group);
    let bi = -1, ti = -1;
    for (let i = group.first; i < group.last; i++) {
      while (bi + 1 < boards.length && boards[bi + 1].frame <= i) bi++;
      while (ti + 1 < group.turns.length && group.turns[ti + 1].start <= i) ti++;
      while (applied < losses.length && losses[applied].frame <= i) {
        const { player, loss } = losses[applied++];
        cumulative[player].loss += loss;
        cumulative[player].count++;
      }
      const cube = findCube(cubes, i);
      const gapCube = group.first > 0 && cube && cube.frame < group.first && !cube.closed ? null : cube;
      const board = gapCube?.closed ? null : boards[bi] ?? null;
      const current = group.turns[ti];
      const next = group.turns[ti + 1];
      const completed = current?.resultFrame != null && i >= current.resultFrame;
      const shown = current && current.end >= i;
      const onBoard = shown && (current.pickupFrame == null || i < current.pickupFrame);
      let phase = 'between-rolls', player = null, actorEvidence = null;
      if (gapCube?.closed) {
        phase = 'game-closed';
        actorEvidence = gapCube.evidence;
      } else if (gapCube?.offered) {
        phase = 'cube-response';
        player = gapCube.responder;
        actorEvidence = gapCube.evidence;
      } else if (shown) {
        phase = completed ? 'played' : onBoard ? 'move' : 'checker-result-pending';
        player = current.player;
        actorEvidence = current.evidence;
      } else if (next?.before && next.before.key === board?.run.key && next.start - i <= 300 &&
          !(current && current.player === next.player && !completed)) {
        phase = board.run.key === opening && !current ? 'opening' : 'pre-roll';
        player = phase === 'opening' ? null : next.player;
        actorEvidence = player ? 'upcoming-physical-roll' : null;
      } else if (completed && current.after?.key === board?.run.key && (!next || next.player !== current.player)) {
        phase = 'pre-roll';
        player = opposite(current.player);
        actorEvidence = 'turn-alternation-after-legal-result';
      } else if (!current && game.number > 1 && (board?.run.key === opening || i < 25)) {
        phase = 'opening';
      }
      const printRoll = current && !['cube-response', 'game-closed', 'checker-result-pending'].includes(phase);
      let decision = gapCube?.offered && decisions.cube ? 'cube' : onBoard && decisions[current.id] ? current.id : null;
      if (phase === 'game-closed') decision = null;
      const markerPlayer = !board || phase === 'game-closed' ? null :
        phase === 'cube-response' ? gapCube.offerer :
        completed && board.run.key === current.after?.key ? opposite(current.player) : player;
      const positionKey = board ? [board.run.key, markerPlayer, scoringContext(gapCube) ? 1 : 0].join('|') : null;
      if (lastPositionKey !== positionKey) {
        lastPositionKey = positionKey;
        lastPositionId = board ? ++positionIndex : null;
        if (board) {
          let equities = null;
          if (analysis && markerPlayer) {
            try {
              equities = positional(analysis, board.run, names.indexOf(markerPlayer), [], scoringContext(gapCube));
            } catch (error) {
              console.error('Position error', game.number, i, error.message);
            }
          }
          positions[lastPositionId] = { ...board.run.position, observedFrame: board.run.representative,
            source: board.evidence, onRoll: markerPlayer, equities };
        }
      }
      const raw = rows[i];
      output.push({
        frame: i, clip: raw.clip, sourceFrame: raw.sourceFrame, sourcePts: raw.pts,
        sourceTimeBase: raw.timeBase, phase, player, actorEvidence,
        ...(gapCube?.closed && result && { result }),
        turn: !gapCube?.closed && shown ? current.id : null,
        roll: printRoll ? { id: current.id, player: current.player, dice: current.dice,
          ...(current.steps?.length === 0 && current.fanEvidence && { fan: true }),
          status: onBoard ? 'current' : 'last', evidence: current.evidence } : null,
        cube: gapCube && !gapCube.closed ? { stake: gapCube.stake, side: gapCube.side, offered: gapCube.offered ?? null,
          evidence: gapCube.evidence } : null,
        position: lastPositionId, decision, loss: {
          white: { ...cumulative.white }, dark: { ...cumulative.dark },
        },
      });
    }
  }
  return { output, decisions, positions, losses };
}

function writeAtomic(destination, content) {
  const temporary = destination + '.part';
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, destination);
}

const args = process.argv.slice(2);
const isPlan = args.includes('--plan');
const gameNumbers = args.filter((a) => a !== '--plan').map(Number);
if (gameNumbers.some((n) => !Number.isInteger(n) || n < 1 || n > 5)) throw new Error('Use game numbers 1–5');
fs.mkdirSync(out, { recursive: true });
const analysis = isPlan ? null : await loadEvaluator();
for (const number of gameNumbers.length ? gameNumbers : [1, 2, 3, 4, 5]) {
  const prefix = `game-${String(number).padStart(2, '0')}`;
  const game = load(v2, `game-${number}-analysis.json`);
  const observations = load(observationsDir, `${prefix}-observations.json`);
  const rows = sourceRows(game);
  if (rows.length !== game.frames) throw new Error('Frame count does not match source timeline');
  const poseFrames = dicePoseFrames(game);
  const groups = reconstruct(game, observations, rows, poseFrames);
  const cubeEvents = cubeTimeline(game, observations);
  const boundary = inferGameBoundary(rows, groups, observations, cubeEvents, openingState.points);
  const closingGroup = boundary && groups.find(group => group.first <= boundary.frame && boundary.frame < group.last);
  const closingRoll = closingGroup ? backfillClosingRoll(closingGroup, rows, poseFrames, boundary) : null;
  const { changes, suppressed } = applyGameBoundary(groups, cubeEvents, boundary);
  const scores = scoreTurns(game, groups, changes, analysis, !isPlan);
  const turns = groups.flatMap((g) => g.turns);
  const authored = turns.map(({ before, after, existing, decision, alternatives, ...turn }) => ({
    ...turn, before: before?.position ?? null, after: after?.position ?? null,
  }));
  if (isPlan) {
    writeAtomic(path.join(out, `${prefix}-plan.json`), JSON.stringify(authored));
    writeAtomic(path.join(out, `${prefix}-boundary.json`), JSON.stringify({ boundary, closingRoll, suppressed }));
    console.log(JSON.stringify({ game: number, turns: turns.length, complete: turns.filter((r) => r.dice?.[1]).length,
      boardResults: turns.filter((r) => r.after).length, boundary, suppressed: suppressed.length,
      cubeChanges: changes, ...scores }));
    continue;
  }
  const result = boundary?.winner ? { frame: boundary.frame, winner: boundary.winner,
    points: boundary.points, reason: 'pass', inferred: true } : null;
  const { output, ...lookup } = buildTimeline(game, groups, changes, rows, analysis, result);
  writeAtomic(path.join(out, `${prefix}-state.jsonl.gz`),
    gzipSync(output.map((row) => JSON.stringify(row)).join('\n') + '\n'));
  writeAtomic(path.join(out, `${prefix}-game.json`),
    JSON.stringify({ game: number, frames: game.frames, turns: authored, ...lookup,
      ...(boundary ? { ending: { frame: boundary.frame, kind: boundary.kind }, boundary } : {}),
      ...(result && { result }),
    }));
  console.log(JSON.stringify({ game: number, frames: rows.length, turns: turns.length,
    decisions: Object.keys(lookup.decisions).length, ...scores }));
}
