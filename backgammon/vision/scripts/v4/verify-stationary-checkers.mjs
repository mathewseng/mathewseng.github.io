/** Compare camera-level recovery and the published checker display with the prior replay. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, replayDir, visionStateDir } from '../project_paths.mjs';
import { rowsFrom } from '../v2/solve_games.mjs';

const [previous, baseObservations, planValidation] = process.argv.slice(2);
assert(previous && baseObservations && planValidation, 'Supply the previous replay, camera-state directory, and plan comparison.');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const labels = read(new URL('../calibration/reviewed-checker-centers.json', import.meta.url));
const training = read(path.join(replayDir, 'checker-center-validation.json'));
const plans = read(planValidation);
const restored = checker => checker.source === 'stationary-checker-recovery';
const color = label => ['white', 'dark'].includes(label) ? label : null;
const at = (state, center) => state?.checkers.filter(checker =>
  (checker.center[0] - center[0]) ** 2 + (checker.center[1] - center[1]) ** 2 <= 14 ** 2) ?? [];
const has = (state, center, value) => {
  const candidates = at(state, center);
  return value ? candidates.length === 1 && candidates[0].color === value : !candidates.length;
};
const report = [];
let total = 0;

for (const game of [1, 2, 3, 4, 5]) {
  const prefix = `game-0${game}`;
  const original = read(path.join(previous, `${prefix}-game.json`));
  const updated = read(path.join(replayDir, `${prefix}-game.json`));
  assert.deepEqual(updated, original, `${prefix} scored history`);
  const timeline = rowsFrom(path.join(replayDir, `${prefix}-state.jsonl.gz`));
  const prior = rowsFrom(path.join(previous, `${prefix}-state.jsonl.gz`));
  const recording = read(path.join(artifactDir, 'v2', `game-${game}-analysis.json`));
  const counts = { recovered: 0, frames: 0, completeBoards: 0, controls: 0, before: 0, after: 0, newFalseMarks: 0 };
  const reviewed = new Map();
  for (const label of labels.filter(label => label.game === game && label.label !== '?')) {
    const matches = reviewed.get(label.frame) ?? [];
    matches.push(label);
    reviewed.set(label.frame, matches);
  }
  let witness = null;
  for (const part of recording.segments) {
    const name = part.source.replace(/\.mp4$/, '.jsonl.gz');
    const [base, found] = [baseObservations, visionStateDir].map(folder => rowsFrom(path.join(folder, name)));
    assert.equal(found.length, base.length);
    for (let f = part.firstFrame; f < part.lastExclusive; f++) {
      const frame = part.firstGameFrame + f - part.firstFrame;
      const before = base[f].state;
      const after = found[f].state;
      const added = after?.checkers.filter(restored) ?? [];
      if (added.length) {
        assert.deepEqual(after.checkers.filter(checker => !restored(checker)), before.checkers);
        for (const key of ['dice', 'cube', 'handRegions', 'bar', 'currentRoll']) assert.deepEqual(after[key], before[key]);
        assert(after.visibleCheckerTotals.every(total => total <= 15));
        counts.recovered += added.length;
        counts.frames++;
        counts.completeBoards += Number(!before.position && Boolean(after.position));
      }
      for (const { clip, sourceFrame, center, label, point } of reviewed.get(frame) ?? []) {
        assert.deepEqual([part.clip, f], [clip, sourceFrame]);
        const expected = color(label);
        const previously = has(before, center, expected);
        const now = has(after, center, expected);
        counts.controls++;
        counts.before += Number(previously);
        counts.after += Number(now);
        if (!expected) counts.newFalseMarks += Number(at(after, center).some(restored));
        if (expected && now && !previously && (!witness || (game === 3 && frame === 31300))) {
          witness = { frame, center, point, color: expected };
        }
      }
      if (game === 3 && frame === 31300) {
        assert.equal(before.points[6][1], 0);
        assert(added.some(checker => checker.color === 'dark' && checker.zone === 7));
      }
    }
  }
  assert.equal(counts.newFalseMarks, 0);
  assert(counts.after >= counts.before);
  total += counts.recovered;
  const changed = [];
  assert.equal(timeline.length, prior.length);
  for (const [index, row] of timeline.entries()) {
    const { displayPoints, ...current } = row;
    const { displayPoints: old, ...earlier } = prior[index];
    assert.deepEqual(current, earlier, `${prefix} frame ${index}`);
    if (JSON.stringify(displayPoints) !== JSON.stringify(old)) changed.push(index);
  }
  const visible = [];
  if (game === 4) {
    assert.deepEqual(changed, Array.from({ length: 32 }, (_, i) => 3098 + i));
    assert(timeline.slice(3098, 3130).every(row => row.displayPoints[3] === 0 && row.displayPoints[9] === -1));
    visible.push({ frame: 3098, from: 4, to: 10, color: 'dark' });
  } else if (game === 5) {
    assert.deepEqual(changed, Array.from({ length: 60 }, (_, i) => 1934 + i));
    assert(timeline.slice(1934, 1994).every(row => row.displayPoints[6] === -1 && row.displayPoints[10] === 0));
    assert(timeline.slice(1994, 2017).every(row => row.displayPoints[6] === 0 && row.displayPoints[10] === -1));
    visible.push({ frame: 1934, from: 11, to: 7, color: 'dark' }, { frame: 1994, from: 7, to: 11, color: 'dark' });
  } else assert.deepEqual(changed, []);
  const plan = plans.find(item => item.game === game);
  for (const key of ['matched', 'correctDice', 'correctBefore', 'correctAfter']) {
    assert(plan.candidate.counts[key] >= plan.current.counts[key]);
  }
  for (const key of ['wrongDice', 'actorMismatches']) assert(plan.candidate.counts[key] <= plan.current.counts[key]);
  report.push({ game, counts, witness, visible, previous: plan.current.counts, candidate: plan.candidate.counts });
}

const correct = training.held.filter(row => row.read === (color(row.label) ?? 'other')).length;
const model = { training: training.training, held: training.held.length, heldClips: training.holdoutClips.length, correct };
fs.writeFileSync(path.join(replayDir, 'stationary-checker-validation.json'), JSON.stringify({ model, games: report }) + '\n');
console.log(JSON.stringify({ total, model, games: report.map(({ game, counts, visible }) => ({ game, counts, visible })) }));
