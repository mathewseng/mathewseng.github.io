// SPDX-License-Identifier: GPL-3.0-or-later
// Shortcuts are prefixes of complete legal turns, never distance-only guesses.
import {
  matchingPaths,
  applyStep,
  sign,
  boardKey,
  distance,
} from "./rules.mjs";
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
  return [...routes.values()].sort(
    (a, b) => a.steps.length - b.steps.length,
  );
}
// At most 15 subsets for a four-step draft. A reversal is offered only when
// the remaining draft is still a legal prefix and exactly one own checker
// returns to one previous point. Unrelated moves stay; dependent ones cannot
// be retained illegally. Replaying restores any hits and consumed dice too.
export function reverseRoutes(state, paths, draft) {
  const at = (steps) =>
    steps.reduce((s, step) => applyStep(s, step), state);
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

// Change the first die of a drafted checker move (including bar entry).
// Preserve unrelated steps, and derive replacements only from complete legal
// paths: bar priority, maximum dice use and the higher-die rule still apply.
export function dieSwitchRoutes(state, paths, draft) {
  const routes = new Map();
  for (const back of reverseRoutes(state, paths, draft)) {
    if (back.steps.length !== 1 || back.steps[0].from !== back.to) continue;
    const old = back.steps[0];
    for (const entry of checkerRoutes(paths, back.remaining, back.to)) {
      if (
        entry.steps.length !== 1 ||
        entry.die === old.die ||
        entry.to === back.from
      )
        continue;
      const remaining = [...back.remaining, ...entry.steps];
      routes.set(JSON.stringify(remaining), {
        from: back.from,
        origin: back.to,
        to: entry.to,
        die: entry.die,
        steps: entry.steps,
        remaining,
        switchDie: true,
        replacedDie: old.die,
      });
    }
  }
  return [...routes.values()];
}

// Retained for callers that specifically need bar-entry alternatives.
export function entrySwitchRoutes(state, paths, draft) {
  return dieSwitchRoutes(state, paths, draft).filter(
    (route) => route.origin === "bar",
  );
}

// All immediately executable single-checker chains using the remaining dice.
export function availableRoutes(paths, draft) {
  const sources = [
    ...new Set(
      matchingPaths(paths, draft)
        .map((p) => p.steps[draft.length]?.from)
        .filter((p) => p !== undefined),
    ),
  ];
  return sources.flatMap((from) => checkerRoutes(paths, draft, from));
}
export function nearestRoutes(paths, draft, to, player) {
  const routes = availableRoutes(paths, draft).filter((r) => r.to === to);
  const at = (p) =>
    p === "bar" ? 25 : p === "off" ? 0 : distance(p, player);
  const nearest = Math.min(...routes.map((r) => at(r.from) - at(r.to)));
  return routes.filter((r) => at(r.from) - at(r.to) === nearest);
}
