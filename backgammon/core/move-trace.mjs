// SPDX-License-Identifier: GPL-3.0-or-later
// Display identity only: continue the top moved checker before taking another
// original checker from a stack. Canonical game state remains untouched.
export function moveTrace(after, player, steps, dice = []) {
  const stacks = new Map(), origins = new Map(), changes = new Map(), checkers = [];
  for (const step of steps) {
    const source = stacks.get(step.from) || [];
    let piece = source.pop();
    if (!piece) {
      const departure = origins.get(step.from) || 0;
      origins.set(step.from, departure + 1);
      piece = { from: step.from, departure, path: [step.from] };
      checkers.push(piece);
    }
    stacks.set(step.from, source);
    piece.to = step.to;
    piece.path.push(step.to);
    const target = stacks.get(step.to) || [];
    target.push(piece);
    stacks.set(step.to, target);
    changes.set(step.from, (changes.get(step.from) || 0) - 1);
    changes.set(step.to, (changes.get(step.to) || 0) + 1);
  }
  const count = point => typeof point === 'number'
    ? Math.max(0, after.points[point] * (player ? -1 : 1)) : after[point][player];
  const originData = Object.fromEntries([...origins].map(([point, n]) =>
    [point, { count: n, before: count(point) - changes.get(point) }]));
  for (const piece of checkers)
    piece.fromIndex = originData[piece.from].before - piece.departure - 1;
  for (const [point, pieces] of stacks)
    pieces.forEach((piece, i) => { piece.toIndex = count(point) - pieces.length + i; });
  return {
    player, dice: [...dice], steps: structuredClone(steps), origins: originData,
    points: Object.fromEntries([...stacks].filter(([, pieces]) => pieces.length).map(([p, pieces]) => [p, pieces.length])),
    checkers: checkers.map(({ departure, ...piece }) => piece),
  };
}
