/** Build viewer intervals from the complete recording without retiming the game events. */
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, replayDir } from '../project_paths.mjs';
import { rowsFrom } from '../v2/solve_games.mjs';
import { rollCubePositions, scoreRollCubes } from './cube-rolls.mjs';
import { applyAccounting, writeReplay } from './accounting.mjs';

const FPS = 25;
const HOLD = 2 * FPS;
const radius = 14;
const v2 = path.join(artifactDir, 'v2');
const read = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name)));
const faces = dice => (dice ?? []).filter(Number.isInteger).sort((a, b) => a - b);
const distance = ([x, y], [a, b]) => Math.hypot(x - a, y - b);
const stationary = (anchor, die) => anchor.value === die.value && distance(anchor.center, die.center) < radius;
const senses = (row, anchor) => row?.dice.some(die => stationary(anchor, die));
const touching = (row, [x, y]) => row?.hands.some(([l, t, r, b]) =>
  x >= l - radius && x <= r + radius && y >= t - radius && y <= b + radius);

function pose(turn, raw) {
  const wanted = faces(turn.dice);
  if (!wanted.length) return [];
  const clusters = [];
  const first = Math.max(0, turn.start - 30);
  for (const row of raw.slice(first, turn.end + 1)) {
    for (const die of row?.dice ?? []) {
      if (!wanted.includes(die.value) ||
          (!turn.opening && (die.center[0] >= 295 ? 'dark' : 'white') !== turn.player)) continue;
      const anchor = clusters.find(cluster => stationary(cluster, die));
      if (anchor) anchor.samples++;
      else clusters.push({ ...die, samples: 1 });
    }
  }
  const ranked = clusters.filter(cluster => cluster.samples >= 5).sort((a, b) => b.samples - a.samples);
  const selected = [];
  for (const value of wanted) {
    const anchor = ranked.find(die => die.value === value &&
      selected.every(other => distance(other.center, die.center) > radius));
    if (anchor) selected.push(anchor);
  }
  return selected;
}

function hasContinuity(a, b, raw) {
  if (a.turn.player !== b.turn.player || a.turn.pickupFrame != null) return false;
  const first = faces(a.turn.dice), second = faces(b.turn.dice);
  if (!first.length || !second.length ||
      (first.length === second.length && first.some((die, i) => die !== second[i])) ||
      !first.some(die => second.includes(die))) return false;
  // A stationary witness must survive across the hole. Equal face values
  // alone are insufficient evidence for merging different physical throws.
  const matching = a.pose.filter(anchor => b.pose.some(other =>
    anchor.value === other.value && distance(anchor.center, other.center) <= radius));
  if (matching.length === 2 && b.turn.start - a.turn.end <= 7 * FPS) return true;
  return matching.some(anchor => {
    let last = a.turn.end - HOLD;
    for (let frame = a.turn.end - FPS; frame <= b.turn.start + FPS; frame++) {
      if (senses(raw[frame], anchor)) {
        if (frame - last > 4 * FPS) return false;
        last = frame;
      }
    }
    return last >= b.turn.start - FPS;
  });
}

function contactEnd(raw, anchors, lastSight, stop) {
  if (!anchors.length || lastSight === null) return null;
  const first = Math.max(0, lastSight - 12);
  const last = Math.min(stop, lastSight + 2 * FPS);
  let contact = false, clear = 0;
  for (let frame = first; frame < last; frame++) {
    if (!raw[frame]) {
      clear = 0;
      continue;
    }
    const covered = anchors.some(anchor => touching(raw[frame], anchor.center));
    contact ||= covered;
    const present = anchors.some(anchor => senses(raw[frame], anchor));
    clear = !covered && !present && frame > lastSight ? clear + 1 : 0;
    if (contact && clear >= 8) return frame - clear + 1;
  }
  return null;
}

function track(group, raw, previous, limit, decisions) {
  const first = group[0], last = group.at(-1);
  const preferred = [...group].reverse().find(({ id }) => decisions[id]?.countedInGameLoss) ??
    [...group].reverse().find(({ id }) => decisions[id]) ?? last;
  const anchors = last.pose.length ? last.pose : preferred.pose;
  const startBound = Math.max(previous, first.turn.start - 8 * FPS);
  let start = first.turn.start;
  const complete = first.pose.length === faces(first.turn.dice).length;
  if (complete && first.pose.length) {
    for (let at = startBound; at < first.turn.start; at++) {
      if (!first.pose.some(anchor => senses(raw[at], anchor))) continue;
      const window = raw.slice(at, at + 12);
      if (first.pose.every(anchor => window.filter(row => senses(row, anchor)).length >= 4)) {
        start = at;
        break;
      }
    }
  }

  let lastSight = null;
  let sightings = [];
  for (let frame = Math.max(start, last.turn.end - HOLD); frame < limit; frame++) {
    if (!anchors.some(anchor => senses(raw[frame], anchor))) continue;
    if (frame > last.turn.end && frame - (lastSight ?? last.turn.end) > 3 * FPS) break;
    sightings = sightings.filter(other => frame - other <= 12);
    sightings.push(frame);
    if (sightings.length >= 3) lastSight = frame;
  }
  const explicit = last.turn.pickupFrame;
  const pickup = explicit != null && explicit < limit && (lastSight === null || lastSight < explicit + 8)
    ? explicit : contactEnd(raw, anchors, lastSight, limit);
  const end = Math.min(limit, pickup ?? Math.max(last.turn.end + 1, (lastSight ?? -1) + 1));
  const values = [...faces(preferred.turn.dice)].reverse();
  while (values.length < 2) values.push(null);
  return {
    start, end: Math.max(start + 1, end), pickup, player: preferred.turn.player,
    dice: values, decision: decisions[preferred.id] ? preferred.id : null,
    evidence: preferred.turn.evidence,
    sourceTurns: group.map(({ id }) => id),
  };
}

function rollIntervals(game, rows, raw, breaks) {
  const cube = game.decisions.cube;
  const terminal = rows.find(row => row.phase === 'game-closed')?.frame ?? rows.length;
  const boundary = [...breaks, terminal, ...(cube ? [cube.startFrame, cube.endFrame] : [])].sort((a, b) => a - b);
  const reports = game.turns.flatMap((turn, index) =>
    turn.start >= terminal || (cube && turn.start >= cube.startFrame && turn.start < cube.endFrame)
      ? [] : [{ turn, id: index + 1, pose: pose(turn, raw) }])
    .sort((a, b) => a.turn.start - b.turn.start);
  const groups = [];
  for (const report of reports) {
    const preceding = groups.at(-1)?.at(-1);
    if (preceding && !boundary.some(frame => frame > preceding.turn.start && frame <= report.turn.start) &&
        hasContinuity(preceding, report, raw)) groups.at(-1).push(report);
    else groups.push([report]);
  }
  const intervals = [];
  for (const [index, group] of groups.entries()) {
    const first = group[0].turn.start;
    const priorBoundary = boundary.findLast(frame => frame <= first) ?? 0;
    const next = groups[index + 1]?.[0].turn.start ?? rows.length;
    const limit = Math.min(next, boundary.find(frame => frame > first) ?? rows.length);
    const previous = Math.max(priorBoundary, intervals.at(-1)?.end ?? 0);
    const interval = track(group, raw, previous, limit, game.decisions);
    if (interval.start < limit) intervals.push(interval);
  }
  return intervals;
}

function rawFrames(recording) {
  return recording.segments.flatMap(part =>
    rowsFrom(path.join(v2, 'state', part.source.replace(/\.mp4$/, '.jsonl.gz')))
      .slice(part.firstFrame, part.lastExclusive).map(({ state }) => state && ({
        hands: state.handRegions ?? [],
        dice: state.dice.filter(die => die.score >= .65 && die.locationScore >= .11)
          .map(die => ({ center: die.center, value: die.value ?? die.candidateValue })),
      })));
}

const source = path.resolve(process.argv[2] ?? replayDir);
fs.mkdirSync(replayDir, { recursive: true });
for (const number of (process.argv.length > 3 ? process.argv.slice(3).map(Number) : [1, 2, 3, 4, 5])) {
  const prefix = `game-0${number}`;
  const game = read(source, prefix + '-game.json');
  const recording = read(v2, `game-${number}-analysis.json`);
  const timeline = prefix + '-state.jsonl.gz';
  const rows = rowsFrom(path.join(source, timeline));
  const breaks = recording.segments.filter(part => part.discontinuity).map(part => part.firstGameFrame);
  const rolls = rollIntervals(game, rows, rawFrames(recording), breaks);
  const cubeRolls = await scoreRollCubes(rollCubePositions(game, rows, rolls, breaks));
  game.presentation = { rolls, cubeRolls };
  applyAccounting(game, rows);
  writeReplay(prefix, game, rows);
  console.log(prefix, rolls.length, 'rolls', cubeRolls.length, 'no-double decisions');
}
