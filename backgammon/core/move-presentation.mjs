// SPDX-License-Identifier: GPL-3.0-or-later
import { applyStep, boardKey, distance, stepsForDie, positionKey } from "./rules.mjs";

// Checkers are interchangeable. Engine move order is not a useful display
// identity: 5/2 8/5 11/8 can be the single journey 11/2. Choose among legal
// full turns with the identical final board, never rewrite the recorded turn.
const positions = new Map();
export function compactNotation(source, steps) {
  const stacks = new Map(), journeys = [];
  let state = source;
  for (const step of steps) {
    const stack = stacks.get(step.from) || [];
    const piece = stack.pop() || { from: step.from, stops: [] };
    if (!journeys.includes(piece)) journeys.push(piece);
    stacks.set(step.from, stack);
    const hit = step.to !== "off" && state.points[step.to] === (source.turn ? 1 : -1);
    piece.stops.push({ point: step.to, hit });
    const target = stacks.get(step.to) || [];
    target.push(piece);
    stacks.set(step.to, target);
    state = applyStep(state, step);
  }
  const number = point => typeof point === "number" ? distance(point, source.turn) : point;
  const rank = point => point === "bar" ? 25 : point === "off" ? 0 : number(point);
  journeys.sort((a, b) => rank(b.from) - rank(a.from) || rank(b.stops.at(-1).point) - rank(a.stops.at(-1).point));
  const counts = new Map();
  for (const piece of journeys) {
    const text = [number(piece.from), ...piece.stops.filter((s, i) => s.hit || i === piece.stops.length - 1)
      .map(s => `${number(s.point)}${s.hit ? "*" : ""}`)].join("/");
    counts.set(text, (counts.get(text) || 0) + 1);
  }
  return { count: journeys.length, notation: [...counts].map(([text, n]) => text + (n > 1 ? `(${n})` : "")).join(" ") || "Pass — no legal move" };
}

export function presentMove(source, steps) {
  const key = positionKey(source) + JSON.stringify(steps);
  if (positions.has(key)) return structuredClone(positions.get(key));
  const target = boardKey(steps.reduce((s, step) => applyStep(s, step), source));
  let best = null;
  // At most 24 permutations. Replaying farthest-to-nearest joins the flow at
  // each intermediate point and attains the minimum number of moved checkers:
  // only points with a net departure need supply a new checker identity.
  // Search the remaining legal orders for the shortest repeated-move notation.
  // The same steps/dice and final board preserve full-turn dice-use rules.
  const visit = (state, rest, ordered) => {
    if (!rest.length) {
      if (boardKey(state) !== target) return;
      const candidate = { ...compactNotation(source, ordered), steps: ordered };
      if (!best || candidate.count < best.count || (candidate.count === best.count &&
          (candidate.notation.length < best.notation.length ||
           (candidate.notation.length === best.notation.length && candidate.notation < best.notation)))) best = candidate;
      return;
    }
    const seen = new Set();
    for (const [i, step] of rest.entries()) {
      const id = JSON.stringify(step);
      if (seen.has(id)) continue;
      seen.add(id);
      if (!stepsForDie(state, step.die).some(s => s.from === step.from && s.to === step.to)) continue;
      visit(applyStep(state, step), rest.filter((_, j) => i !== j), [...ordered, step]);
    }
  };
  visit(source, steps, []);
  const result = { steps: best?.steps || steps, notation: best?.notation || compactNotation(source, steps).notation };
  if (positions.size >= 128) positions.delete(positions.keys().next().value);
  positions.set(key, result);
  return structuredClone(result);
}

export function presentAnalysis(source, result, limit = 10) {
  if (result?.type !== "checker") return result;
  const display = candidate => candidate?.steps
    ? { ...candidate, ...presentMove(source, candidate.steps) } : candidate;
  // Complete 0–2 ply results can contain thousands of legal alternatives.
  // Only format the visible leaders here; expanded lists format their own rows.
  return { ...result, candidates: result.candidates.map((c, i) => i < limit ? display(c) : c), actual: display(result.actual) };
}
