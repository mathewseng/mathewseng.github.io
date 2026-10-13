// SPDX-License-Identifier: GPL-3.0-or-later
// Inputs are already filtered against complete legal turns. Never derive a
// plausible single step directly from point arithmetic: dice-use rules matter.
export function selectedDie(candidates, preferred, dice = []) {
  const available = new Set(candidates.map(step => step.die));
  return [preferred, ...dice].find(die => available.has(die)) ?? null;
}

export function advancedAction({ point, checker, candidates, returns, routes = [], preferred, dice, turn }) {
  const die = selectedDie(candidates, preferred, dice);
  const forward = candidates.filter(step => step.die === die);
  if (checker) {
    const step = forward.find(step => step.from === point);
    if (step) return { type: "move", step };
    // An unplayable selected die must not undo a checker which can still use
    // the other die. Only an exhausted moved checker has the undo shortcut.
    if (!candidates.some(step => step.from === point)) {
      const route = returns.find(route => route.from === point);
      if (route) return { type: "undo", route };
    }
    return null;
  }
  const distance = from => from === "bar" ? 25 : turn ? 24 - from : from + 1;
  // Point-space input requests a destination. Prefer the selected die, then
  // another direct arrival, before spending several dice on one checker.
  const step = candidates.filter(step => step.to === point)
    .sort((a, b) => Number(b.die === die) - Number(a.die === die) || distance(a.from) - distance(b.from))[0];
  if (step) return { type: "move", step };
  const combined = routes.filter(route => route.to === point && !route.undo && !route.switchDie && route.steps.length > 1);
  const nearest = Math.min(...combined.map(route => distance(route.from)));
  const choices = combined.filter(route => distance(route.from) === nearest);
  return choices.length ? { type: "routes", routes: choices } : null;
}
