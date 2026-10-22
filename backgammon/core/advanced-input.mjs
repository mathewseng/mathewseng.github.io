// SPDX-License-Identifier: GPL-3.0-or-later
// Inputs are already filtered against complete legal turns. Never derive a
// plausible single step directly from point arithmetic: dice-use rules matter.
export function selectedDie(candidates, preferred, dice = []) {
  const available = new Set(candidates.map(step => step.die));
  return [preferred, ...[...dice].sort((a, b) => b - a)].find(die => available.has(die)) ?? null;
}

export function advancedAction({ point, checker, candidates, returns, checkerReturns = [], routes = [], preferred, dice, turn }) {
  const die = selectedDie(candidates, preferred, dice);
  const forward = candidates.filter(step => step.die === die);
  const residentStep = forward.find(step => step.from === point) || candidates.find(step => step.from === point);
  if (checker) {
    if (residentStep) return { type: "move", step: residentStep };
    // Prefer the selected die, but use the other one when needed. Only an
    // exhausted moved checker has the undo shortcut.
    if (!candidates.some(step => step.from === point)) {
      const route = checkerReturns.find(route => route.from === point);
      if (route) return { type: "undo", route };
    }
    return null;
  }
  const distance = from => from === "bar" ? 25 : turn ? 24 - from : from + 1;
  // Point-space input requests a destination. Prefer the selected die, then
  // another direct arrival, including when this point is also a draft origin.
  const step = candidates.filter(step => step.to === point)
    .sort((a, b) => Number(b.die === die) - Number(a.die === die) || distance(a.from) - distance(b.from))[0];
  if (step) return { type: "move", step };
  // Without a direct arrival, original draft point space returns its checker.
  // Disc taps on that point still play forward.
  const returning = returns.filter(route => route.to === point)
    .sort((a, b) => a.die - b.die)[0];
  if (returning) return { type: 'undo', route: returning };
  const combined = routes.filter(route => route.to === point && !route.undo && !route.switchDie && route.steps.length > 1);
  const nearest = Math.min(...combined.map(route => distance(route.from)));
  const choices = combined.filter(route => distance(route.from) === nearest);
  if (choices.length) return { type: "routes", routes: choices };
  // With no destination/return action, the rest of an occupied point extends
  // its checker's tap target. Use the same single-die preference as a disc tap.
  return residentStep ? { type: "move", step: residentStep } : null;
}
