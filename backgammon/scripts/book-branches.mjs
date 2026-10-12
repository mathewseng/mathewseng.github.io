// SPDX-License-Identifier: GPL-3.0-or-later
// Build-time policy only. A turn means one player's complete checker turn,
// not one die and not a search ply. Rank exact boards, not duplicate histories.
import { commitTurn, boardKey, initialState } from '../core/rules.mjs';

export const CONTINUATION_POLICY = Object.freeze({ thirdBoards: 64, fourthBoards: 32 });
export const rollWeight = roll => (roll[0] === roll[1] ? 1 : 2) / 36;
export const rowSteps = row => row[0].map(([from, to, die]) => ({ from, to, die }));
export function nextBoard(state, steps) {
  const after = commitTurn(state, steps);
  return { ...after, turn: 0, points: after.points.toReversed().map(n => -n),
    bar: after.bar.toReversed(), off: after.off.toReversed(), phase: 'move' };
}
export function stateForBoard(board, dice = [2, 1]) {
  const v = board.split(',').map(Number);
  return initialState({ matchLength: 0, phase: 'move', dice,
    rules: { cube: true, jacoby: true }, points: v.slice(0, 24), bar: v.slice(24, 26), off: v.slice(26) });
}
export function rankBranches(branches, limit) {
  const merged = new Map();
  for (const branch of branches) {
    const key = boardKey(branch.state), old = merged.get(key);
    if (old) old.weight += branch.weight;
    else merged.set(key, { ...branch, board: key });
  }
  // Lexical tie break makes truncation reproducible on every locale/platform.
  return [...merged.values()].sort((a, b) => b.weight - a.weight || (a.board < b.board ? -1 : a.board > b.board ? 1 : 0)).slice(0, limit);
}
export function thirdBranches(index, readShard, limit = CONTINUATION_POLICY.thirdBoards) {
  const branches = [];
  for (const [roll, opening] of Object.entries(index.openings)) {
    const start = initialState({ matchLength: 0, phase: 'move', dice: [...roll].map(Number), rules: { jacoby: true } });
    const reply = nextBoard(start, rowSteps(opening.rows[0]));
    const shard = readShard(index.replies[boardKey(reply)].file);
    for (const [dice, entry] of Object.entries(shard.rolls)) {
      const s = { ...reply, dice: [...dice].map(Number) }, steps = rowSteps(entry.rows[0]);
      branches.push({ state: nextBoard(s, steps), weight: rollWeight(dice) / 15,
        parent: { board: boardKey(s), roll: dice, steps } });
    }
  }
  return rankBranches(branches, limit);
}
export function fourthBranches(third, readRolls, limit = CONTINUATION_POLICY.fourthBoards) {
  const branches = [];
  for (const branch of third) for (const [dice, entry] of Object.entries(readRolls(branch.board))) {
    const s = { ...branch.state, dice: [...dice].map(Number) }, steps = rowSteps(entry.rows[0]);
    branches.push({ state: nextBoard(s, steps), weight: branch.weight * rollWeight(dice),
      parent: { board: branch.board, roll: dice, steps } });
  }
  return rankBranches(branches, limit);
}
