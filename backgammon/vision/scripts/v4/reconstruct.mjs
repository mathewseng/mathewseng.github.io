/** Reconstruct a game timeline from full-session checker and dice evidence. */
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { artifactDir, solverUrl, visionStateDir } from '../project_paths.mjs';
import { observedBoard } from './bearoff-board.mjs';
import { verifyDicePose } from './dice-pose-continuity.mjs';
import { refineIncompletePair, shortDicePairs } from './short-dice-pairs.mjs';
import { recoverStationaryFaces } from './stationary-face-votes.mjs';
import {
  evaluateDecision, loadEvaluator, matchingTurns, okay, positional, rowsFrom, stateFor,
} from '../v2/solve_games.mjs';

const { boardKey, initialState, pipCount, stepsForDie } = await import(solverUrl('backgammon/core/rules.mjs'));
const { fromXGID } = await import(solverUrl('backgammon/core/xgid.mjs'));
const names = ['white', 'dark'];
const fps = 25;
const allDice = Array.from({ length: 6 }, (_, i) =>
  Array.from({ length: 6 - i }, (_, j) => [i + 1, i + j + 1])).flat();
const opening = boardKey(initialState());
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

function proposedRolls(game, observations, rows, runs, first, last, anchors, poseFrames) {
  const rolls = observedRolls(game, observations, rows).filter((r) => r.start >= first && r.start < last)
    .map(roll => recoverStationaryFaces(roll, rows, poseFrames, first, last));
  const spans = (longFootprints[game.number] ?? []).flatMap(proof => {
    if (proof.sourceStart < first || proof.clear === null || proof.clear >= last ||
        game.reviewedCubeOffers.some(offer => offer.startFrame < proof.clear && offer.endFrame >= proof.sourceStart)) return [];
    const seed = rolls.find(roll => roll.start === proof.sourceStart && roll.player === proof.player &&
      samePose(roll.centers, proof.centers));
    if (!seed || seed.reviewedPose) return [];
    if (rolls.some(roll => roll.reviewedPose && roll.start > proof.firstTogether && roll.start < proof.clear &&
      roll.centers && !samePose(roll.centers, proof.centers))) return [];
    const nextOffer = game.reviewedCubeOffers.find(offer => offer.startFrame >= proof.clear);
    const stationary = footprintRoll(seed, proof, rolls, runs, Math.min(last, nextOffer?.startFrame ?? last));
    return stationary ? [stationary] : [];
  });
  const normal = rolls.flatMap((roll) => {
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
      return [{ ...roll, player, dice: hasFace ? match.dice : null, before: match.before, after: match.after,
        resultFrame: match.resultFrame ?? match.after.first, steps: hasFace ? match.steps : null,
        ...(roll.centers ? { poseLastSeen: roll.end } : {}),
        end: Math.min(until, Math.max(roll.end, match.resultFrame ?? (match.after.first + 14))),
        evidence: fullVision ? (roll.reviewedPose ? 'reviewed-roll-and-legal-result' :
          roll.stationaryFaces ? 'stationary-faces-and-legal-result' : 'tracked-roll-and-legal-result') : hasFace ?
          'legal-result-and-single-die' : 'two-dice-poses-and-legal-result',
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

function chooseTurns(proposals, last) {
  const turns = [];
  for (const roll of [...proposals].sort((a, b) => b.priority - a.priority || a.start - b.start)) {
    const existing = turns.find((r) => {
      if (!together(r, roll, 10)) return false;
      if (r.footprint || roll.footprint) return together(r, roll);
      const [before, after] = r.start < roll.start ? [r, roll] : [roll, r];
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
    if (!existing.footprint && existing.player === roll.player && sameDice(existing.dice, roll.dice) &&
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

function reconstruct(game, observations, rows, poseFrames) {
  if (poseFrames && process.env.OFFICE3_TRIAL_SHORT_DICE === '1') {
    const brief = shortDicePairs(poseFrames, observations.breaks);
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
    const extras = boardOnlyTurns(runs, [...retained, ...visual]);
    return { first, last, runs, turns: chooseTurns([...retained, ...visual, ...extras], last) };
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
  const lastOfferEnd = Math.max(-1, ...offers.map((o) => o.endFrame));
  const events = observations.cube.filter((r) => r.side !== 'playing-surface');
  for (const e of events) {
    if (current?.closed) continue;
    // Game reset is stronger evidence for the starting stake than a face left
    // showing from the preceding game. A raise needs a post-opening change.
    if (game.number > 1 && e.start < 150 && e.stake !== 1) continue;
    if (e.end - e.start < 24 && e.visibleSamples < 20) continue;
    if (current?.stake && e.stake < current.stake) {
      if (e.stake === 1 && offers.length && e.start > lastOfferEnd && e.end - e.start >= 100) {
        update(e.start, { stake: 1, side: e.side, closed: true, evidence: 'reviewed-offer-followed-by-cube-reset' });
      }
      continue;
    }
    if (current?.stake && e.stake > current.stake * 2) continue;
    update(e.start, { stake: e.stake, side: e.side, evidence: e.evidence });
  }
  if (offers.length) {
    const first = offers[0];
    const end = changes.find((c) => c.frame > first.startFrame &&
      (c.closed || c.stake === first.offeredFace))?.frame ?? game.frames;
    const before = changes.filter((c) => c.frame < first.startFrame).at(-1);
    changes.push({
      frame: first.startFrame, stake: first.preOfferStake, side: before?.side,
      offered: first.offeredFace, offerer: first.offerer, responder: opposite(first.offerer),
      evidence: 'reviewed-cube-offer', end,
    });
  }
  return changes.sort((a, b) => a.frame - b.frame);
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

function buildTimeline(game, groups, cubes, rows, analysis) {
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
      (turn.existing?.countedInGameLoss || turn.evidence === 'reviewed-roll-and-legal-result' ||
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
      const board = boards[bi] ?? null;
      const current = group.turns[ti];
      const next = group.turns[ti + 1];
      const completed = current?.resultFrame != null && i >= current.resultFrame;
      const shown = current && current.end >= i;
      const onBoard = shown && (current.pickupFrame == null || i < current.pickupFrame);
      const cube = findCube(cubes, i);
      const gapCube = group.first > 0 && cube && cube.frame < group.first && !cube.closed ? null : cube;
      let phase = 'between-rolls', player = null, actorEvidence = null;
      if (gapCube?.closed) {
        phase = 'game-closed';
      } else if (gapCube?.offered) {
        phase = 'cube-response';
        player = gapCube.responder;
        actorEvidence = 'reviewed-cube-offer';
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
      let decision = gapCube?.offered ? 'cube' : onBoard && decisions[current.id] ? current.id : null;
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
        turn: shown ? current.id : null,
        roll: printRoll ? { id: current.id, player: current.player, dice: current.dice,
          status: onBoard ? 'current' : 'last', evidence: current.evidence } : null,
        cube: gapCube ? { stake: gapCube.stake, side: gapCube.side, offered: gapCube.offered ?? null,
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
  const groups = reconstruct(game, observations, rows, dicePoseFrames(game));
  const changes = cubeTimeline(game, observations);
  const scores = scoreTurns(game, groups, changes, analysis, !isPlan);
  const turns = groups.flatMap((g) => g.turns);
  const authored = turns.map(({ before, after, existing, decision, alternatives, ...turn }) => ({
    ...turn, before: before?.position ?? null, after: after?.position ?? null,
  }));
  if (isPlan) {
    writeAtomic(path.join(out, `${prefix}-plan.json`), JSON.stringify(authored));
    console.log(JSON.stringify({ game: number, turns: turns.length, complete: turns.filter((r) => r.dice?.[1]).length,
      boardResults: turns.filter((r) => r.after).length, cubeChanges: changes, ...scores }));
    continue;
  }
  const { output, ...lookup } = buildTimeline(game, groups, changes, rows, analysis);
  writeAtomic(path.join(out, `${prefix}-state.jsonl.gz`),
    gzipSync(output.map((row) => JSON.stringify(row)).join('\n') + '\n'));
  writeAtomic(path.join(out, `${prefix}-game.json`),
    JSON.stringify({ game: number, frames: game.frames, turns: authored, ...lookup }));
  console.log(JSON.stringify({ game: number, frames: rows.length, turns: turns.length,
    decisions: Object.keys(lookup.decisions).length, ...scores }));
}
