// SPDX-License-Identifier: GPL-3.0-or-later
// Inputs are already filtered against complete legal turns. Never derive a
// plausible single step directly from point arithmetic: dice-use rules matter.
export function selectedDie(candidates, preferred, dice = []) {
  const available = new Set(candidates.map(step => step.die));
  return [preferred, ...dice].find(die => available.has(die)) ?? null;
}

export function advancedAction({ point, checker, candidates, returns, preferred, dice, turn }) {
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
  const step = forward.filter(step => step.to === point)
    .sort((a, b) => distance(a.from) - distance(b.from))[0];
  return step ? { type: "move", step } : null;
}
