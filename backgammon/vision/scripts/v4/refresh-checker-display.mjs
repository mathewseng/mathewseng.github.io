/** Refine confirmed checker display timing without changing the scored moves. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, replayDir, visionStateDir } from '../project_paths.mjs';
import { rowsFrom, stateFor } from '../v2/solve_games.mjs';
import { applyAccounting, writeReplay } from './accounting.mjs';
import { observedBoard } from './bearoff-board.mjs';
import { checkerStages, observedCheckerKey, trackCheckerCounts } from './checker-counts.mjs';

const [source] = process.argv.slice(2);
assert(source && path.resolve(source) !== path.resolve(replayDir), 'Supply a distinct scored replay directory.');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const raw = path.join(artifactDir, 'v2');
const reports = [];
fs.mkdirSync(replayDir, { recursive: true });

function earlyStackResult(states, keys, start, stop, after) {
  let first = null, run = [];
  for (let frame = start; frame < stop; frame++) {
    const key = keys[frame];
    if (key && key !== after) {
      first = null;
      run = [];
    }
    if (key !== after || !states[frame]?.stackReadings?.some(reading =>
      reading.method === 'supplemental-tall-stack-reader')) continue;
    run = run.filter(witness => frame - witness <= 6);
    run.push(frame);
    if (run.length >= 4) first ??= run[0];
  }
  return first;
}

function keepResult(game, rows, states, keys, roll, turn, id, barriers, report) {
  const result = rows[turn.resultFrame];
  if (!result || result.turn !== id || result.phase !== 'played') return;
  const after = observedCheckerKey(turn.after);
  if (observedCheckerKey(game.positions[result.position]) !== after) return;
  const before = observedCheckerKey(turn.before);
  if (before === after) return;
  const first = Math.max(turn.start + 1, barriers.findLast(frame => frame < result.frame) ?? 0);
  const earlier = earlyStackResult(states, keys, first, result.frame, after);
  if (earlier !== null && rows.slice(earlier, turn.resultFrame).every(row =>
    row.turn === id && row.phase === 'move' && !row.cube?.offered)) {
    report.earlierResults.push({ decision: id, previous: turn.resultFrame, frame: earlier });
    for (const row of rows.slice(earlier, turn.resultFrame + 1)) {
      row.phase = 'played';
      row.position = result.position;
      if (row.roll && Number.isInteger(roll.pickup) && row.frame >= roll.pickup) {
        row.roll.status = 'last';
        row.decision = null;
      }
      delete row.displayPoints;
    }
    turn.resultFrame = game.decisions[id].observedResultFrame = earlier;
  }
  const limit = barriers.find(frame => frame > result.frame) ?? rows.length;
  let firstCarried = null, carried = 0;
  for (let frame = result.frame + 1; frame < limit; frame++) {
    const row = rows[frame];
    if (row.turn || row.cube?.offered || !['between-rolls', 'pre-roll'].includes(row.phase)) break;
    const position = game.positions[row.position];
    const current = observedCheckerKey(position);
    if (current && current !== before && current !== after) break;
    if (current === after) continue;
    if (position?.observedFrame > result.frame) break;
    row.position = result.position;
    delete row.displayPoints;
    firstCarried ??= frame;
    carried++;
  }
  if (carried) report.carriedResults.push({ decision: id, frame: firstCarried, frames: carried });
}

function restoreFinalCheckerDisplay(rows, states, roll, turn, id) {
  if (!Number.isInteger(turn.resultFrame)) return;
  const final = turn.after.points.map(([white, dark]) => white - dark);
  const last = Math.min(roll.end, turn.resultFrame);
  let previous = -1, first = null;
  for (let frame = Math.max(roll.start, last - 25, turn.resultFrame - 36); frame < last; frame++) {
    const row = rows[frame];
    const camera = states[frame];
    if (row.turn !== id || row.phase !== 'move' || !camera || !row.displayPoints) continue;
    const changed = row.displayPoints.flatMap((value, index) => value === final[index] ? [] : [index]);
    if (changed.length !== 2) continue;
    const [a, b] = changed;
    if (row.displayPoints[a] !== final[b] || row.displayPoints[b] !== final[a] ||
        ![0, 1, -1].includes(final[a]) || ![0, 1, -1].includes(final[b]) || (final[a] && final[b])) continue;
    if (changed.some(index => camera.occludedPoints?.includes(index + 1))) continue;
    if (!changed.every(index => camera.points[index][0] - camera.points[index][1] === final[index])) {
      first = null;
      previous = -1;
      continue;
    }
    // Two nearby local views can show a return to the eventual position before
    // the rest of the board clears. Keep accounting at the verified result.
    if (previous === frame - 1) first ??= previous;
    previous = frame;
  }
  if (first !== null) for (const row of rows.slice(first, turn.resultFrame)) {
    if (row.turn === id && ['move', 'checker-result-pending'].includes(row.phase)) row.displayPoints = final;
  }
}

for (const game of [1, 2, 3, 4, 5]) {
  const prefix = `game-0${game}`;
  const data = read(path.join(source, prefix + '-game.json'));
  const rows = rowsFrom(path.join(source, prefix + '-state.jsonl.gz'));
  const recording = read(path.join(raw, `game-${game}-analysis.json`));
  const states = recording.segments.flatMap(segment =>
    rowsFrom(path.join(visionStateDir, segment.source.replace(/\.mp4$/, '.jsonl.gz')))
      .slice(segment.firstFrame, segment.lastExclusive).map(({ state }) => state));
  const boards = states.map(state => observedBoard(state));
  const keys = boards.map(observedCheckerKey);
  assert.equal(boards.length, rows.length);
  const report = { game, compared: 0, previousMatches: 0, updatedMatches: 0, improved: 0, regressed: 0,
    tallStackFrames: states.filter(state => state?.stackReadings?.some(
      reading => reading.method === 'supplemental-tall-stack-reader')).length,
    earlierResults: [], carriedResults: [] };
  const barriers = [...recording.segments.filter(part => part.discontinuity).map(part => part.firstGameFrame),
    ...data.presentation.rolls.map(roll => roll.start), data.decisions.cube?.startFrame,
    data.ending?.frame].filter(Number.isInteger).sort((a, b) => a - b);
  for (const roll of data.presentation.rolls) {
    const id = roll.decision;
    const turn = id && data.turns[id - 1];
    if (!turn?.before || !turn.after || !data.decisions[id]?.countedInGameLoss || !turn.dice.every(Number.isInteger)) continue;
    const input = stateFor(turn.before, Number(roll.player === 'dark'), turn.dice);
    const stages = checkerStages(input);
    const previous = rows.slice(roll.start, roll.end).map(row => row.displayPoints);
    trackCheckerCounts(rows, boards, roll, input, id);
    restoreFinalCheckerDisplay(rows, states, roll, turn, id);
    for (let frame = roll.start; frame < roll.end; frame++) {
      const row = rows[frame];
      if (row.turn !== id || row.phase !== 'move') continue;
      const evidence = stages.get(keys[frame]);
      if (!evidence) continue;
      const fallback = data.positions[row.position]?.points.map(([white, dark]) => white - dark) ?? input.points;
      const before = previous[frame - roll.start] ?? fallback;
      const after = row.displayPoints ?? fallback;
      const was = before.every((count, i) => count === evidence.points[i]);
      const now = after.every((count, i) => count === evidence.points[i]);
      report.compared++;
      report.previousMatches += Number(was);
      report.updatedMatches += Number(now);
      report.improved += Number(!was && now);
      report.regressed += Number(was && !now);
    }
    keepResult(data, rows, states, keys, roll, turn, id, barriers, report);
  }
  applyAccounting(data, rows);
  writeReplay(prefix, data, rows);
  reports.push(report);
  console.log(JSON.stringify(report));
}
fs.writeFileSync(path.join(replayDir, 'checker-motion-validation.json'), JSON.stringify(reports, null, 2) + '\n');
