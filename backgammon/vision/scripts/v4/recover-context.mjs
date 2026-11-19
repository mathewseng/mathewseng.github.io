/** Recover stable boards and physical dice episodes from recorded observations. */
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, replayDir, solverUrl } from '../project_paths.mjs';
import { rowsFrom, stateFor } from '../v2/solve_games.mjs';
import { trackCheckerCounts } from './checker-counts.mjs';
import { observedBoard } from './bearoff-board.mjs';
import { applyAccounting, writeReplay } from './accounting.mjs';
import { rollCubePositions, scoreRollCubes } from './cube-rolls.mjs';

const { boardKey, legalTurns, notation } = await import(solverUrl('backgammon/core/rules.mjs'));
const { toXGID } = await import(solverUrl('backgammon/core/xgid.mjs'));
const read = (dir, file) => JSON.parse(fs.readFileSync(path.join(dir, file)));
const rawDir = path.join(artifactDir, 'v2');
const keyOf = board => board && boardKey({
  points: board.points.map(([white, dark]) => white - dark), bar: board.bar, off: board.borneOff,
});
const same = (a, b) => a?.length === b?.length && a?.every((value, i) => value === b[i]);
const centersClose = ([x, y], [a, b]) => Math.hypot(x - a, y - b) <= 12;
const allDice = Array.from({ length: 6 }, (_, low) =>
  Array.from({ length: 6 - low }, (_, offset) => [low + offset + 1, low + 1])).flat();

function visibleFace(reading, center) {
  if (reading?.handRegions?.some(([l, t, r, b]) =>
    center[0] >= l - 12 && center[0] <= r + 12 && center[1] >= t - 12 && center[1] <= b + 12)) return null;
  const die = reading?.dice.find(die => die.score >= .61 && die.locationScore >= .25 &&
    centersClose(center, die.center));
  return die?.value ?? die?.candidateValue ?? null;
}

function pairedReading(raw, centers, start, end) {
  if (centers?.length !== 2) return null;
  const counts = centers.map(() => new Map());
  let paired = 0;
  for (const reading of raw.slice(Math.max(0, start), end)) {
    const pair = centers.map(center => visibleFace(reading, center));
    if (pair.every(Boolean)) paired++;
    for (const [index, value] of pair.entries()) {
      if (value) counts[index].set(value, (counts[index].get(value) ?? 0) + 1);
    }
  }
  const faces = counts.map(tally => {
    const [[value, count] = []] = [...tally].sort((a, b) => b[1] - a[1]);
    const total = [...tally.values()].reduce((sum, next) => sum + next, 0);
    return count >= 10 && count / total >= .85 ? value : null;
  });
  return paired >= 6 && faces.every(Boolean) ? faces.sort((a, b) => b - a) : null;
}

function hasPair(raw, centers, dice, start, end) {
  const pair = pairedReading(raw, centers, start, end);
  return same(pair, dice);
}

function boardWindow(boards, start, end, expected = null) {
  const candidates = new Map();
  for (let frame = Math.max(0, start); frame < Math.min(boards.length, end); frame++) {
    const position = boards[frame];
    if (!position) continue;
    const key = keyOf(position);
    if (expected && key !== expected) continue;
    const previous = candidates.get(key);
    const hits = (previous?.hits ?? []).filter(other => frame - other <= 18);
    hits.push(frame);
    if (hits.length >= 8) candidates.set(key, { hits, position, frame: hits[0], supported: true });
    else candidates.set(key, { hits, position, frame: hits[0], supported: previous?.supported });
  }
  const stable = [...candidates.values()].filter(candidate => candidate.supported && candidate.hits.length >= 8);
  if (stable.length !== 1) return null;
  return stable[0];
}

function beforeRoll(boards, roll, lower) {
  // Prefer the 2 seconds immediately before the dice. Do not search through
  // another roll for a seemingly compatible board.
  return boardWindow(boards, Math.max(lower, roll.start - 52), roll.start + 3);
}

function legalDecision(before, player, dice, after) {
  const input = stateFor(before, player, [...dice].reverse());
  const actions = legalTurns(input);
  return { input, actions, played: after ? actions.find(action => action.key === keyOf(after)) : null };
}


function normalizeRolls(game, raw, boundaries) {
  const merged = [];
  const changes = [];
  const turnFor = roll => game.turns[(roll.decision ?? roll.sourceTurns[0]) - 1];
  for (const original of game.presentation.rolls) {
    const roll = { ...original };
    const turn = turnFor(roll);
    if (roll.evidence === 'roll-inferred-from-moves' || roll.dice.includes(null)) {
      const direct = pairedReading(raw, turn.centers, roll.start, Math.min(roll.end, roll.start + 300));
      if (direct && !same(direct, roll.dice)) {
        changes.push({ frame: roll.start, before: roll.dice, after: direct, kind: 'settled-dice' });
        roll.dice = direct;
        roll.evidence = 'repeated-settled-dice-faces';
      }
    }
    const prior = merged.at(-1);
    const compatible = prior && roll.dice.filter(Boolean).every(die => prior.dice.includes(die));
    if (!prior || prior.pickup !== null || prior.player !== roll.player || prior.dice.includes(null) ||
        !compatible || roll.start - prior.end > 8 * 25 ||
        (prior.decision && roll.decision) ||
        boundaries.some(frame => frame >= prior.end && frame <= roll.start) ||
        !hasPair(raw, turnFor(prior).centers, prior.dice, prior.end - 95, prior.end + 12) ||
        !hasPair(raw, turnFor(prior).centers, prior.dice, roll.start - 12, Math.min(roll.end, roll.start + 100))) {
      merged.push(roll);
      continue;
    }
    changes.push({ frame: prior.start, next: roll.start, end: roll.end, kind: 'same-physical-roll' });
    prior.sourceTurns = [...prior.sourceTurns, ...roll.sourceTurns];
    prior.end = roll.end;
    prior.pickup = roll.pickup;
  }
  game.presentation.rolls = merged;
  return changes;
}

function recover(game, rows, recording, raw) {
  const offer = game.decisions.cube;
  const boundaries = recording.segments.filter(segment => segment.discontinuity).map(segment => segment.firstGameFrame);
  if (offer) boundaries.push(offer.startFrame, offer.endFrame);
  const boards = raw.map(reading => observedBoard(reading));
  const changes = normalizeRolls(game, raw, boundaries);
  const changed = new Set(changes.map(change => change.frame));
  const rolls = game.presentation.rolls;
  let positionId = Math.max(...Object.keys(game.positions).map(Number)) + 1;
  for (const [i, roll] of rolls.entries()) {
    const id = roll.decision ?? roll.sourceTurns[0];
    const turn = game.turns[id - 1];
    const next = rolls[i + 1];
    const directChange = !same([...turn.dice].sort((a, b) => b - a), roll.dice);
    if (roll.decision && !directChange && !changed.has(roll.start)) continue;

    const floor = Math.max(rolls[i - 1]?.end ?? 0, boundaries.filter(frame => frame <= roll.start).at(-1) ?? 0);
    const witness = beforeRoll(boards, roll, floor);
    const before = turn.before ?? witness?.position;
    if (!before) continue;
    const beforeKey = keyOf(before);
    const player = Number(roll.player === 'dark');
    let after = null;
    let resultFrame = null;
    const handoff = roll.pickup != null && next && next.player !== roll.player && next.start - roll.pickup <= 125 &&
      !boundaries.some(frame => frame > roll.start && frame <= next.start);
    if (handoff) {
      const following = game.turns[(next.decision ?? next.sourceTurns[0]) - 1].before;
      const finish = boardWindow(boards, roll.pickup - 16, next.start + 14, keyOf(following));
      if (finish && keyOf(finish.position) !== beforeKey) {
        after = finish.position;
        resultFrame = finish.frame;
      }
    }

    const options = roll.dice.every(Boolean) ? [roll.dice] :
      allDice.filter(dice => roll.dice.filter(Boolean).every(die => dice.includes(die)));
    const valid = after ? options.filter(dice => legalDecision(before, player, dice, after).played) : [];
    const dice = roll.dice.every(Boolean) ? roll.dice : valid.length === 1 ? valid[0] : null;
    if (!dice) continue;
    const { input, actions, played } = legalDecision(before, player, dice, after);
    if (!played) {
      after = null;
      resultFrame = null;
    }
    const asc = [...dice].reverse();
    const evidence = directChange ? 'repeated-settled-dice-faces' : 'stable-board-and-bear-off-inventory';
    Object.assign(turn, { before, after, dice: asc, resultFrame, steps: played?.steps ?? null,
      end: Math.max(turn.end, resultFrame ?? 0), evidence, pickupFrame: roll.pickup });
    Object.assign(roll, { dice, decision: id, evidence });
    game.decisions[id] = {
      player: roll.player, dice: asc, evidence, xgid: toXGID(input),
      startFrame: turn.start, endFrame: turn.end, observedResultFrame: resultFrame,
      startSeconds: turn.start / 25, endSeconds: turn.end / 25, legalCandidates: actions.length,
      actions: actions.map(action => ({
        key: action.key, notation: notation(action.steps, player), steps: action.steps,
        xgid: toXGID({ ...action.state, phase: 'roll', dice: [] }, { engine: true }),
        isPlayed: action.key === played?.key,
      })),
    };
    const beforeId = positionId++;
    game.positions[beforeId] = { ...before, onRoll: roll.player, observedFrame: witness?.frame ?? roll.start,
      source: evidence, equities: null };
    const afterId = after ? positionId++ : null;
    if (after) game.positions[afterId] = { ...after, onRoll: next.player, observedFrame: resultFrame, source: evidence, equities: null };
    for (const row of rows.slice(roll.start, next?.start ?? roll.end)) {
      if (row.roll && roll.sourceTurns.includes(row.roll.id)) {
        row.roll = { id, player: roll.player, dice: asc, status: row.roll.status, evidence };
        if (row.turn !== null && roll.sourceTurns.includes(row.turn)) {
          row.turn = id;
          row.roll.status = 'current';
          row.player = roll.player;
          row.phase = resultFrame !== null && row.frame >= resultFrame ? 'played' : 'move';
          row.decision = id;
          delete row.displayPoints;
        }
      }
      if (row.frame < roll.end || (after && row.frame >= resultFrame)) {
        row.position = after && row.frame >= resultFrame ? afterId : beforeId;
      }
    }
    // Roll intervals can span a clip seam or a detector hole. Inner source
    // rows still need to satisfy their original frame bounds for verification.
    turn.start = Math.min(turn.start, roll.start);
    turn.end = Math.max(roll.end - 1, ...roll.sourceTurns.map(sourceId => game.turns[sourceId - 1].end));
    game.decisions[id].endFrame = turn.end;
    game.decisions[id].endSeconds = turn.end / 25;
    trackCheckerCounts(rows, boards, roll, input, id);
    changes.push({ id, frame: roll.start, dice, off: before.borneOff, result: played?.steps ?? null, kind: 'checker-decision' });
  }
  return changes;
}

const source = path.resolve(process.argv[2]);
fs.mkdirSync(replayDir, { recursive: true });
for (const number of (process.argv.length > 3 ? process.argv.slice(3).map(Number) : [1, 2, 3, 4, 5])) {
  const prefix = `game-0${number}`;
  const game = read(source, prefix + '-game.json');
  const rows = rowsFrom(path.join(source, prefix + '-state.jsonl.gz'));
  const recording = read(rawDir, `game-${number}-analysis.json`);
  const raw = recording.segments.flatMap(segment =>
    rowsFrom(path.join(rawDir, 'state', segment.source.replace(/\.mp4$/, '.jsonl.gz')))
      .slice(segment.firstFrame, segment.lastExclusive).map(row => row.state));
  const changes = recover(game, rows, recording, raw);
  if (changes.length) {
    const known = new Map(game.presentation.cubeRolls.map(entry => [entry.xgid, entry]));
    const cuts = recording.segments.filter(segment => segment.discontinuity).map(segment => segment.firstGameFrame);
    const opportunities = rollCubePositions(game, rows, game.presentation.rolls, cuts);
    const missing = opportunities.filter(item => !known.has(item.xgid));
    for (const item of await scoreRollCubes(missing)) known.set(item.xgid, item);
    game.presentation.cubeRolls = opportunities.map(item => {
      const { options, outcomeProbabilities, evLoss } = known.get(item.xgid);
      return { ...item, options, outcomeProbabilities, evLoss };
    });
  }
  game.contextRecovery = changes;
  applyAccounting(game, rows);
  writeReplay(prefix, game, rows);
  console.log(prefix, JSON.stringify(changes));
}
