/** Find a filmed game boundary using future camera evidence. */
import { pairVisible } from './dice-pose-continuity.mjs';

const distance = (point, side) => side ? 24 - point : point + 1;
const countOnBoard = (state, side) =>
  state.bar[side] + state.points.reduce((count, pair) => count + pair[side], 0);

function sustained(rows, start, end, window, required, supports) {
  let hits = [];
  for (let frame = start; frame < end; frame++) {
    const state = rows[frame]?.state;
    if (!state?.points || !state.bar || !supports(state, frame)) continue;
    hits = hits.filter(prior => frame - prior < window);
    hits.push(frame);
    if (hits.length >= required) return { first: hits[0], last: frame, count: hits.length };
  }
  return null;
}

function resemblesOpening(state, opening) {
  let matched = 0, extra = 0;
  if (state.bar.some(Boolean)) return false;
  for (const side of [0, 1]) {
    let occupied = 0;
    for (const [index, point] of state.points.entries()) {
      const expected = Math.max(0, (side ? -1 : 1) * opening[index]);
      occupied += Math.min(expected, point[side]);
      extra += Math.max(0, point[side] - expected);
    }
    if (occupied < 11) return false;
    matched += occupied;
  }
  return matched >= 25 && extra <= 1;
}

function surfaceTracks(observations) {
  const tracks = [];
  for (const read of observations.cube) {
    if (read.side !== 'playing-surface' || read.visibleSamples < 10 ||
        !Number.isFinite(read.x) || !Number.isFinite(read.y)) continue;
    const prior = tracks.at(-1);
    if (prior && prior.face === read.face && read.start - prior.end <= 150 &&
        Math.hypot(prior.x - read.x, prior.y - read.y) <= 12) {
      prior.end = Math.max(prior.end, read.end);
      prior.samples += read.visibleSamples;
    } else tracks.push({ ...read, samples: read.visibleSamples });
  }
  return tracks.filter(track => track.samples >= 45 && track.end - track.start >= 75);
}

function missingCheckers(state, anchor, side) {
  return anchor.points.reduce((removed, point, index) =>
    state.occludedPoints?.includes(index + 1) ? removed :
      removed + Math.max(0, point[side] - state.points[index][side]), 0);
}

function continuingPlay(group, observations, from, to) {
  return group.turns.some(turn => turn.start >= from && turn.start < to &&
    turn.steps && turn.after && turn.dice?.every(Number.isInteger)) ||
    observations.pairs.some(roll => !roll.opening && roll.start >= from && roll.start < to &&
      roll.end - roll.start >= 15 && roll.actorEvidence === 'dice-body-agreement' &&
      roll.quality >= .88 && roll.dice?.every(Number.isInteger));
}

function inferPass(rows, group, observations, cubes, opening) {
  for (const surface of surfaceTracks(observations)) {
    if (surface.start < group.first || surface.end >= group.last) continue;
    const before = cubes.findLast(cube => !cube.offered && cube.frame < surface.start);
    if (!before?.stake) continue;
    const centered = observations.cube.find(read => read.side === 'centered' &&
      read.start > surface.end && read.start < group.last && read.start - surface.end <= 125 &&
      read.end - read.start >= 100 && read.visibleSamples >= 30);
    if (!centered || observations.cube.some(read => read.side !== 'centered' && read.side !== 'playing-surface' &&
        read.start > surface.start && read.start < centered.start &&
        read.stake === 2 * before.stake && read.end - read.start >= 35)) continue;
    const prior = group.turns.findLast(turn => turn.start < surface.start &&
      Number.isInteger(turn.resultFrame) && turn.resultFrame < surface.start &&
      turn.after && turn.steps && turn.dice?.every(Number.isInteger));
    const offerer = prior ? (prior.player === 'white' ? 'dark' : 'white') : null;
    if (!offerer || before.side !== 'centered' &&
        before.side !== (offerer === 'white' ? 'far-side' : 'near-side')) continue;
    // Stable, legal play on a continuing game board is evidence against a pass.
    if (continuingPlay(group, observations, surface.start, centered.start)) continue;

    const empty = sustained(rows, surface.start, Math.min(group.last, centered.start + 125), 35, 8,
      state => !state.occludedPoints?.length && !state.handRegions?.length &&
        [0, 1].every(side => countOnBoard(state, side) <= 2));
    if (empty && centered.stake === 1 && surface.face === before.stake * 2) {
      const anchor = group.runs.findLast(run => run.last < empty.first && run.last >= surface.start &&
        run.count >= 12 && run.position.borneOff.every(count => count === 0));
      const pack = anchor && sustained(rows, anchor.last + 1, empty.first, 24, 6,
        state => [0, 1].every(side => missingCheckers(state, anchor.position, side) >= 3));
      if (pack) return { frame: pack.first, confirmedFrame: empty.last, offerFrame: surface.start,
        cubeReturnedFrame: centered.start, kind: 'pack-up-after-offer', winner: offerer, points: before.stake };
    }
    const reset = sustained(rows, centered.start, group.last, 35, 6, state => resemblesOpening(state, opening));
    if (reset && !continuingPlay(group, observations, centered.start, reset.first)) {
      return { frame: centered.start, confirmedFrame: reset.last, offerFrame: surface.start,
        kind: 'cube-returned-before-reset', winner: offerer, points: before.stake };
    }
  }
  return null;
}

function bearingSide(state, side) {
  return state.trayEvidence?.[side] && state.borneOff[side] >= 2 &&
    !state.bar[side] && countOnBoard(state, side) + state.borneOff[side] === 15 &&
    state.points.every((point, index) => !point[side] || distance(index, side) <= 6);
}

function singleSideAnchor(rows, group) {
  // One reliable tray and its 15 checkers can establish the bearing-off
  // phase even when the other player's tray lies outside the board crop.
  return sustained(rows, group.first, group.last, 30, 8,
    state => !state.occludedPoints?.length && !state.handRegions?.length &&
      [0, 1].some(side => bearingSide(state, side)));
}

function setupWitness(rows, first, last, position, side, opening) {
  if (position.borneOff[side] < 2 || position.bar[side]) return [];
  const farthest = Math.max(0, ...position.points.map((point, i) => point[side] ? distance(i, side) : 0));
  return opening.flatMap((value, index) => {
    if (value * (side ? -1 : 1) < 2 || distance(index, side) <= farthest) return [];
    const stack = sustained(rows, first, last, 25, 6,
      state => !state.occludedPoints?.includes(index + 1) && state.points[index][side] >= 2);
    return stack ? [{ ...stack, point: index + 1, side }] : [];
  });
}

function inferReset(rows, group, opening) {
  const advanced = group.runs.find(run => run.count >= 12 &&
    run.position.borneOff.some(count => count >= 2)) ?? singleSideAnchor(rows, group);
  if (!advanced) return null;
  const restored = sustained(rows, advanced.last + 1, group.last, 50, 8, state => resemblesOpening(state, opening));
  if (!restored) return null;
  // Bearing-off checkers cannot return to play. A buildup farther from home
  // than the prior board, followed by the opening formation, marks setup.
  const before = group.runs.findLast(run => run.last < restored.first &&
    run.count >= 10 && run.position.borneOff.some(count => count >= 2));
  const witnesses = [0, 1].flatMap(side => {
    if (before) return setupWitness(rows, before.last + 1, restored.first, before.position, side, opening);
    const lastPlay = group.turns.findLast(turn => turn.start < restored.first &&
      turn.centers && turn.dice?.every(Number.isInteger));
    const earlier = sustained(rows, lastPlay?.start ?? group.first, restored.first, 25, 8,
      state => !state.occludedPoints?.length && !state.handRegions?.length && bearingSide(state, side));
    return earlier ? setupWitness(rows, earlier.last + 1, restored.first, rows[earlier.last].state, side, opening) : [];
  }).sort((a, b) => a.first - b.first);
  const stack = witnesses[0];
  return { frame: stack?.first ?? restored.first, confirmedFrame: restored.last, kind: 'opening-position-restored',
    ...(stack ? { setupPoint: stack.point, setupPlayer: stack.side ? 'dark' : 'white' } : {}) };
}

export function inferGameBoundary(rows, groups, observations, cubes, opening) {
  for (const group of groups) {
    const boundary = inferPass(rows, group, observations, cubes, opening) ?? inferReset(rows, group, opening);
    if (boundary) return boundary;
  }
  return null;
}

function stableFaceAt(frames, [x, y]) {
  const votes = new Map();
  for (const state of frames) {
    const die = state?.dice?.find(read => Number.isInteger(read.value) && read.value >= 1 && read.value <= 6 && read.score >= .85 &&
      Math.hypot(read.center[0] - x, read.center[1] - y) <= 8);
    if (die) votes.set(die.value, (votes.get(die.value) ?? 0) + 1);
  }
  const [first, second] = [...votes].sort((a, b) => b[1] - a[1]);
  return first && first[1] >= Math.max(6, 3 * (second?.[1] ?? 0)) ? first[0] : null;
}

export function backfillClosingRoll(group, rows, poses, boundary) {
  if (!poses || boundary.kind !== 'opening-position-restored') return null;
  const index = group.turns.findLastIndex(turn => turn.start < boundary.frame);
  const turn = group.turns[index];
  if (!turn || turn.end < boundary.frame || turn.after || turn.dice?.every(Number.isInteger) ||
      turn.actorEvidence !== 'dice-body-agreement' || turn.centers?.length !== 2) return null;
  const side = Number(turn.player === 'dark');
  if (turn.player !== boundary.setupPlayer || !(turn.before?.position.borneOff[side] >= 12)) return null;
  const lower = Math.max(group.first, turn.start - 50, (group.turns[index - 1]?.end ?? -1) + 1);
  let frame = lower, run = 0;
  while (frame < turn.start && run < 6) {
    run = pairVisible(poses[frame], turn.centers) ? run + 1 : 0;
    frame++;
  }
  if (run < 6) return null;
  const start = frame - run;
  const camera = rows.slice(start, boundary.frame).map(row => row.state);
  const alternate = poses.slice(start, boundary.frame);
  const dice = turn.centers.flatMap(center => {
    const face = stableFaceAt(camera, center);
    return face && stableFaceAt(alternate, center) === face ? [face] : [];
  });
  if (!dice.length) return null;
  const faces = dice.length === 2 ? dice.sort((a, b) => a - b) : [dice[0], null];
  group.turns[index] = { ...turn, start, dice: faces, evidence: 'closing-dice-pose' };
  return { previousStart: turn.start, frame: start, player: turn.player, dice: faces };
}
