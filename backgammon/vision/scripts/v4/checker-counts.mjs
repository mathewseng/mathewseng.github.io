/** Use repeated camera boards to place visible checker moves within a frozen decision. */
import { solverUrl } from '../project_paths.mjs';
import { adjustPoints } from './checker-adjustment.mjs';

const { applyStep, boardKey, legalPaths } = await import(solverUrl('backgammon/core/rules.mjs'));

export function checkerStages(input, paths = legalPaths(input), adjustment, onStage) {
  const stages = new Map();
  const add = (state, steps, count) => {
    const points = adjustPoints(state.points, adjustment);
    const key = boardKey(adjustment ? { ...state, points } : state);
    stages.set(key, { points, bar: state.bar, borneOff: state.off });
    onStage?.(key, state, steps.slice(0, count));
  };
  add(input, [], 0);
  for (const { steps } of paths) {
    let state = input;
    for (const [index, step] of steps.entries()) {
      state = applyStep(state, step, input.turn);
      add(state, steps, index + 1);
    }
  }
  return stages;
}

export function observedCheckerKey(board) {
  return board && boardKey({
    points: board.points.map(([white, dark]) => white - dark), bar: board.bar, off: board.borneOff,
  });
}

export function trackCheckerCounts(rows, boards, roll, input, id, { paths, adjustment, witnesses } = {}) {
  const start = boardKey(input);
  const stages = checkerStages(input, paths);
  const adjusted = adjustment && checkerStages(input, paths, adjustment);
  let current = null, candidate = null;
  const observations = [];
  for (let frame = roll.start; frame < roll.end; frame++) {
    const witness = witnesses?.get(frame);
    const key = observedCheckerKey(witness ?? boards[frame]);
    const stage = (adjusted && frame >= adjustment.frame ? adjusted : stages).get(key);
    const existing = rows[frame].displayPoints;
    if (witness && !stage) throw new Error(`Checker witness is outside the legal stages at frame ${frame}.`);
    if (!stage || key === current || (!current && key === start && !existing)) continue;
    if (witness) {
      current = key;
      observations.push({ first: frame, points: stage.points });
      candidate = null;
      continue;
    }
    if (candidate?.key !== key || frame - candidate.last > 4) {
      candidate = { key, first: frame, last: frame, votes: 1 };
      continue;
    }
    candidate.last = frame;
    // Retain short, visible transitions when the existing point tracker and
    // the full-board observation agree. A revised arrangement needs more views.
    const agrees = existing?.every((count, i) => count === stage.points[i]);
    const required = agrees ? 3 : 7;
    if (++candidate.votes >= required) {
      current = key;
      observations.push({ first: candidate.first, points: stage.points });
      candidate = null;
    }
  }
  let tracked = null, index = 0;
  for (let frame = roll.start; frame < roll.end; frame++) {
    if (observations[index]?.first === frame) tracked = observations[index++].points;
    const row = rows[frame];
    if (tracked && row.turn === id && row.phase === 'move') row.displayPoints = tracked;
  }
}
