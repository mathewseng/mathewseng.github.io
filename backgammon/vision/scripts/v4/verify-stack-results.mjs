/** Verify that checker timing improves without changing any scored play or physical roll. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, replayDir, visionStateDir } from '../project_paths.mjs';
import { rowsFrom } from '../v2/solve_games.mjs';
import { observedBoard } from './bearoff-board.mjs';
import { observedCheckerKey } from './checker-counts.mjs';

const [source] = process.argv.slice(2);
assert(source, 'Supply the replay before the supplemental stack pass.');
const read = (dir, file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
const labelFile = new URL('../calibration/reviewed-tall-stack-points.json', import.meta.url);
const labels = JSON.parse(fs.readFileSync(labelFile, 'utf8'));
const witnesses = [];

for (const game of [1, 2, 3, 4, 5]) {
  const prefix = `game-0${game}`;
  const original = read(source, `${prefix}-game.json`);
  const updated = read(replayDir, `${prefix}-game.json`);
  assert.deepEqual(updated.presentation, original.presentation);
  assert.deepEqual(updated.turns.map(({ resultFrame, ...turn }) => turn),
    original.turns.map(({ resultFrame, ...turn }) => turn));
  const scored = ({ observedResultFrame, ...decision }) => decision;
  for (const id of Object.keys(original.decisions)) {
    assert.deepEqual(scored(updated.decisions[id]), scored(original.decisions[id]), `${prefix}, decision ${id}`);
  }
  const rows = rowsFrom(path.join(replayDir, `${prefix}-state.jsonl.gz`));
  const before = rowsFrom(path.join(source, `${prefix}-state.jsonl.gz`));
  assert.equal(rows.length, before.length);
  assert.deepEqual(rows.at(-1).loss, before.at(-1).loss);
  const recording = read(path.join(artifactDir, 'v2'), `game-${game}-analysis.json`);
  const retained = new Map();
  for (const label of labels.filter(label => label.game === game)) {
    const { frame, clip, sourceFrame, point, count } = label;
    assert.deepEqual([rows[frame].clip, rows[frame].sourceFrame], [clip, sourceFrame]);
    const segment = recording.segments.findLast(part => part.firstGameFrame <= frame);
    const file = segment.source.replace(/\.mp4$/, '.jsonl.gz');
    if (!retained.has(file)) retained.set(file, [path.join(artifactDir, 'v2', 'state'), visionStateDir]
      .map(directory => rowsFrom(path.join(directory, file))));
    const [current, updated] = retained.get(file).map(records => {
      const detection = records[sourceFrame].state?.points[point - 1];
      return detection ? detection[0] - detection[1] : null;
    });
    assert(current !== count || updated === count, `Regressed tall stack witness at ${prefix}:${frame}`);
    witnesses.push({ ...label, current, updated });
  }
  if (game !== 5) continue;

  const opening = updated.turns[28];
  assert.deepEqual([opening.start, opening.resultFrame, opening.pickupFrame], [488, 572, 588]);
  const result = observedCheckerKey(opening.after);
  assert.notEqual(observedCheckerKey(updated.positions[rows[571].position]), result);
  for (let frame = 572; frame < 636; frame++) {
    assert.equal(observedCheckerKey(updated.positions[rows[frame].position]), result, `Opening result at frame ${frame}`);
  }
  assert(rows.slice(572, 622).every(row => row.playedDecision === 29));
  const black = updated.turns[32];
  assert.deepEqual([black.resultFrame, black.pickupFrame], [2017, 3213]);
  assert(rows.slice(2017, 2067).every(row => row.playedDecision === 33));
  assert(rows[2017].loss.dark.checkerLoss > rows[2016].loss.dark.checkerLoss);
  for (let frame = 13667; frame < 14335; frame++) {
    assert.equal(rows[frame].position, before[frame].position, `Newer physical board at frame ${frame}`);
  }
  const clip = recording.segments.findLast(part => part.firstGameFrame <= 572);
  const camera = rowsFrom(path.join(visionStateDir, clip.source.replace(/\.mp4$/, '.jsonl.gz')))[rows[572].sourceFrame].state;
  assert.equal(observedCheckerKey(observedBoard(camera)), result);
  const loose = camera.checkers.find(reading => reading.zone === 'loose');
  assert(loose);
  loose.center[0] += 30;
  assert.equal(observedBoard(camera), null, 'A checker outside its stack cannot complete the board.');
}
fs.writeFileSync(path.join(replayDir, 'tall-stack-witnesses.json'), JSON.stringify(witnesses) + '\n');
console.log('Checked all games for identical decisions, roll times, and total EV loss. Verified the Game 5 opening stack and result timing.');
