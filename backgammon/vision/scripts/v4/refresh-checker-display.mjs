/** Refresh visible checker counts while preserving the scored decisions and loss ledger. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, replayDir } from '../project_paths.mjs';
import { rowsFrom, stateFor } from '../v2/solve_games.mjs';
import { writeReplay } from './accounting.mjs';
import { observedBoard } from './bearoff-board.mjs';
import { checkerStages, observedCheckerKey, trackCheckerCounts } from './checker-counts.mjs';

const [source] = process.argv.slice(2);
assert(source && path.resolve(source) !== path.resolve(replayDir), 'Supply a distinct scored replay directory.');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const raw = path.join(artifactDir, 'v2');
const reports = [];
fs.mkdirSync(replayDir, { recursive: true });

for (const game of [1, 2, 3, 4, 5]) {
  const prefix = `game-0${game}`;
  const data = read(path.join(source, prefix + '-game.json'));
  const rows = rowsFrom(path.join(source, prefix + '-state.jsonl.gz'));
  const recording = read(path.join(raw, `game-${game}-analysis.json`));
  const boards = recording.segments.flatMap(segment =>
    rowsFrom(path.join(raw, 'state', segment.source.replace(/\.mp4$/, '.jsonl.gz')))
      .slice(segment.firstFrame, segment.lastExclusive).map(({ state }) => observedBoard(state)));
  assert.equal(boards.length, rows.length);
  const report = { game, compared: 0, previousMatches: 0, updatedMatches: 0, improved: 0, regressed: 0 };
  for (const roll of data.presentation.rolls) {
    const id = roll.decision;
    const turn = id && data.turns[id - 1];
    if (!turn?.before || !turn.after || !data.decisions[id].played || !turn.dice.every(Number.isInteger)) continue;
    const input = stateFor(turn.before, Number(roll.player === 'dark'), turn.dice);
    const stages = checkerStages(input);
    const previous = rows.slice(roll.start, roll.end).map(row => row.displayPoints);
    trackCheckerCounts(rows, boards, roll, input, id);
    for (let frame = roll.start; frame < roll.end; frame++) {
      const row = rows[frame];
      if (row.turn !== id || row.phase !== 'move') continue;
      const evidence = stages.get(observedCheckerKey(boards[frame]));
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
  }
  writeReplay(prefix, data, rows);
  reports.push(report);
  console.log(JSON.stringify(report));
}
fs.writeFileSync(path.join(replayDir, 'checker-motion-validation.json'), JSON.stringify(reports, null, 2) + '\n');
