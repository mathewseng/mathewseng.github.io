// SPDX-License-Identifier: GPL-3.0-or-later
// Shortcuts are prefixes of complete legal turns, never distance-only guesses.
import { matchingPaths, applyStep, sign, boardKey } from "./rules.mjs";
export function checkerRoutes(paths, draft, from) {
  const routes = new Map();
  for (const path of matchingPaths(paths, draft)) {
    let point = from;
    const steps = [];
    for (const step of path.steps.slice(draft.length)) {
      if (step.from !== point || point === "off") break;
      steps.push(step);
      point = step.to;
      routes.set(JSON.stringify(steps), {
        from,
        to: point,
        steps: [...steps],
        die: steps.reduce((n, s) => n + s.die, 0),
        undo: false,
      });
    }
  }
  return [...routes.values()].sort((a, b) => a.steps.length - b.steps.length);
}
// At most 15 subsets for a four-step draft. A reversal is offered only when
// the remaining draft is still a legal prefix and exactly one own checker
// returns to one previous point. Unrelated moves stay; dependent ones cannot
// be retained illegally. Replaying restores any hits and consumed dice too.
export function reverseRoutes(state, paths, draft) {
  const at = (steps) => steps.reduce((s, step) => applyStep(s, step), state);
  const current = at(draft),
    p = state.turn;
  const counts = (s) => [
    s.bar[p],
    ...s.points.map((n) => Math.max(0, n * sign(p))),
    s.off[p],
  ];
  const before = counts(current),
    point = (i) => (i === 0 ? "bar" : i === 25 ? "off" : i - 1);
  const results = new Map();
  for (let mask = 1; mask < 2 ** draft.length; mask++) {
    const remaining = draft.filter((_, i) => !(mask & (1 << i)));
    if (!matchingPaths(paths, remaining).length) continue;
    const after = at(remaining),
      delta = counts(after).map((n, i) => n - before[i]);
    if (
      delta.filter((n) => n === 1).length !== 1 ||
      delta.filter((n) => n === -1).length !== 1 ||
      delta.some((n) => Math.abs(n) > 1) ||
      delta.filter(Boolean).length !== 2
    )
      continue;
    const from = point(delta.indexOf(-1)),
      to = point(delta.indexOf(1));
    const removed = draft.filter((_, i) => mask & (1 << i));
    const key = `${from}:${to}:${boardKey(after)}:${remaining.map((s) => s.die).join()}`;
    results.set(key, {
      from,
      to,
      undo: true,
      remaining,
      steps: removed,
      die: removed.reduce((n, s) => n + s.die, 0),
    });
  }
  return [...results.values()];
}
