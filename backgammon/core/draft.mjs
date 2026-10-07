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

// Board returns go to a checker's pre-roll origin, never an intermediate stop.
// Checkers are indistinguishable in canonical state. For draft interaction the
// most recent arrival is the top checker, so continuing that stack continues
// its journey. Undo still removes an individual step separately.
export function originalReturnRoutes(state, paths, draft, minDraft = 0) {
  const stacks = new Map();
  const add = (point, count) =>
    stacks.set(
      point,
      Array.from({ length: count }, () => ({ origin: point, indices: [] })),
    );
  add("bar", state.bar[state.turn]);
  add("off", state.off[state.turn]);
  state.points.forEach((n, p) => add(p, Math.max(0, n * sign(state.turn))));
  for (const [i, step] of draft.entries()) {
    const checker = stacks.get(step.from)?.pop();
    if (!checker) return [];
    checker.indices.push(i);
    stacks.get(step.to).push(checker);
  }
  const reversals = reverseRoutes(state, paths, draft);
  const results = new Map();
  for (const [from, checkers] of stacks)
    for (const checker of checkers) {
      if (!checker.indices.length || checker.indices.some((i) => i < minDraft))
        continue;
      const remaining = draft.filter((_, i) => !checker.indices.includes(i));
      const key = JSON.stringify(remaining);
      const route = reversals.find(
        (r) =>
          r.from === from &&
          r.to === checker.origin &&
          JSON.stringify(r.remaining) === key,
      );
      if (route) results.set(key, route);
    }
  return [...results.values()];
}

// Change the first die of a drafted checker move (including bar entry).
// Preserve unrelated steps, and derive replacements only from complete legal
// paths: bar priority, maximum dice use and the higher-die rule still apply.
export function dieSwitchRoutes(state, paths, draft) {
  const routes = new Map();
  for (const back of reverseRoutes(state, paths, draft)) {
    // A completed chain can be rewound and restarted with the other die too.
    // Only replace a continuous journey, leaving independent checkers intact.
    if (
      back.steps[0].from !== back.to ||
      back.steps.at(-1).to !== back.from ||
      back.steps.some((step, i) => i && step.from !== back.steps[i - 1].to)
    )
      continue;
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
  const at = (p) => (p === "bar" ? 25 : p === "off" ? 0 : distance(p, player));
  const nearest = Math.min(...routes.map((r) => at(r.from) - at(r.to)));
  return routes.filter((r) => at(r.from) - at(r.to) === nearest);
}

// Resolve a combined-checker shortcut, not the player's whole turn. For the
// same source, destination and consumed dice, prefer a hitting path to a quiet
// path. Distinct hitting outcomes remain a choice. Single-die/bearoff choices
// and draft revisions retain their explicit die/undo selection.
export function preferHittingRoutes(state, routes) {
  if (routes.length < 2) return routes;
  const first = routes[0];
  const diceKey = (r) =>
    r.steps
      .map((s) => s.die)
      .sort()
      .join();
  if (
    routes.some(
      (r) =>
        r.undo ||
        r.switchDie ||
        r.steps.length < 2 ||
        r.from !== first.from ||
        r.to !== first.to ||
        diceKey(r) !== diceKey(first),
    )
  )
    return routes;
  const opponent = 1 - state.turn;
  const hits = routes.filter(
    (r) =>
      r.steps.reduce((s, step) => applyStep(s, step), state).bar[opponent] >
      state.bar[opponent],
  );
  return hits.length ? hits : [first];
}
