// SPDX-License-Identifier: GPL-3.0-or-later
import { clone } from './rules.mjs';

export function editorOwner(state, point) {
  if (Number.isInteger(point) && point >= 0 && point < 24)
    return state.points[point] ? Number(state.points[point] < 0) : null;
  return /^(bar|off)[01]$/.test(point) ? Number(point.at(-1)) : null;
}
export function editorCount(state, point) {
  if (Number.isInteger(point) && point >= 0 && point < 24) return Math.abs(state.points[point]);
  return /^(bar|off)[01]$/.test(point) ? state[point.slice(0, -1)][Number(point.at(-1))] : 0;
}
export function editorTargets(state, from) {
  const owner = editorOwner(state, from);
  if (owner === null || !editorCount(state, from)) return [];
  return [...state.points.flatMap((n, p) => !n || Number(n < 0) === owner ? [p] : []), `bar${owner}`, `off${owner}`];
}
export function transferChecker(state, from, to) {
  if (from === to || !editorTargets(state, from).includes(to)) return null;
  const next = clone(state), owner = editorOwner(state, from), sign = owner ? -1 : 1;
  for (const [point, delta] of [[from, -1], [to, 1]]) {
    if (typeof point === 'number') next.points[point] += sign * delta;
    else next[point.slice(0, -1)][owner] += delta;
  }
  return next;
}

// Setup taps edit the position, never play a die. Returning a checker to its
// tray keeps all fifteen accounted for and makes repeated placement reversible.
export function editChecker(state, point, player, checkerTap = false) {
  if (String(point).startsWith('off')) return null;
  const owner = editorOwner(state, point);
  if (checkerTap && editorCount(state, point))
    return transferChecker(state, point, `off${owner}`);
  return transferChecker(state, `off${player}`, point);
}

export function clearPosition(state) {
  return {...clone(state), points:Array(24).fill(0), bar:[0,0], off:[15,15]};
}

export function swapPositionColors(state) {
  const next = clone(state);
  next.points = state.points.slice().reverse().map(n => n ? -n : 0);
  next.bar.reverse(); next.off.reverse(); next.scores.reverse();
  next.turn = 1 - state.turn;
  if (next.cube.owner !== null) next.cube.owner = 1 - next.cube.owner;
  if (next.pending?.by !== undefined) next.pending.by = 1 - next.pending.by;
  if (next.winner !== null && next.winner !== undefined) next.winner = 1 - next.winner;
  return next;
}
