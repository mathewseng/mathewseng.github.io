/** Use repeated camera boards to place visible checker moves within a frozen decision. */
import { solverUrl } from '../project_paths.mjs';

const { applyStep, boardKey, legalPaths } = await import(solverUrl('backgammon/core/rules.mjs'));

export function checkerStages(input, paths = legalPaths(input)) {
  const stages = new Map();
  const add = state => stages.set(boardKey(state), {
    points: state.points, bar: state.bar, borneOff: state.off,
  });
  add(input);
  for (const { steps } of paths) {
    let state = input;
    for (const step of steps) {
      state = applyStep(state, step, input.turn);
      add(state);
    }
  }
  return stages;
}

export function observedCheckerKey(board) {
  return board && boardKey({
    points: board.points.map(([white, dark]) => white - dark), bar: board.bar, off: board.borneOff,
  });
}

export function trackCheckerCounts(rows, boards, roll, input, id, paths) {
  const start = boardKey(input);
  const stages = checkerStages(input, paths);
  let current = null, candidate = null;
  const observations = [];
  for (let frame = roll.start; frame < roll.end; frame++) {
    const key = observedCheckerKey(boards[frame]);
    const stage = stages.get(key);
    const existing = rows[frame].displayPoints;
    if (!stage || key === current || (!current && key === start && !existing)) continue;
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
