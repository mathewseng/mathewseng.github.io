/** Use later confirmation to time visible intermediate steps on the board. */
import { solverUrl } from '../project_paths.mjs';

const { applyStep, boardKey, legalPaths } = await import(solverUrl('backgammon/core/rules.mjs'));

export function trackCheckerCounts(rows, boards, roll, input, id) {
  const start = boardKey(input);
  const stages = new Map();
  const makeStage = (state, level) => {
    const key = boardKey(state);
    if (!stages.has(key)) stages.set(key, { points: state.points, level });
  };
  for (const { steps } of legalPaths(input)) {
    let state = input;
    for (const [index, step] of steps.entries()) {
      state = applyStep(state, step, input.turn);
      makeStage(state, index + 1);
    }
  }
  let current = null, candidate = null, count = 0;
  const observations = [];
  for (let frame = roll.start; frame < roll.end; frame++) {
    const position = boards[frame];
    const key = position && boardKey({ points: position.points.map(([white, dark]) => white - dark),
      bar: position.bar, off: position.borneOff });
    const stage = stages.get(key);
    if (key && key !== start && stage && (!current || stage.level > current.level)) {
      if (candidate?.key !== key || frame - candidate.last > 4) {
        candidate = { key, first: frame, last: frame };
        count = 1;
      } else {
        candidate.last = frame;
        if (++count >= 7) {
          current = stage;
          observations.push({ first: candidate.first, points: stage.points });
        }
      }
    }
  }
  let tracked = null, index = 0;
  for (let frame = roll.start; frame < roll.end; frame++) {
    if (observations[index]?.first === frame) tracked = observations[index++].points;
    const row = rows[frame];
    if (tracked && row.turn === id && row.phase === 'move') row.displayPoints = tracked;
  }
}

