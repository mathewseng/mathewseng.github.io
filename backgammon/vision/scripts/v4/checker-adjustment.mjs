/** A filmed checker rearrangement outside the roller's move. Uses fixed point numbers. */
import assert from 'node:assert/strict';

export function adjustPoints(points, adjustment, reverse = false) {
  if (!adjustment) return points;
  const [from, to] = reverse ? [adjustment.to, adjustment.from] : [adjustment.from, adjustment.to];
  const direction = adjustment.player === 'white' ? 1 : -1;
  assert(from !== to && from >= 1 && from <= 24 && to >= 1 && to <= 24);
  assert(points[from - 1] * direction > 0 && points[to - 1] * direction >= 0);
  const result = points.slice();
  result[from - 1] -= direction;
  result[to - 1] += direction;
  return result;
}

export function turnResult(turn) {
  if (!turn.after || !turn.adjustment) return turn.after;
  const points = adjustPoints(turn.after.points.map(([white, dark]) => white - dark), turn.adjustment, true);
  return { ...turn.after, points: points.map(count => [Math.max(0, count), Math.max(0, -count)]) };
}
