// SPDX-License-Identifier: GPL-3.0-or-later
// Build-time policy only. A turn means one player's complete checker turn,
// not one die and not a search ply. Rank exact boards, not duplicate histories.
import { commitTurn, boardKey, initialState } from '../core/rules.mjs';

export const CONTINUATION_POLICY = Object.freeze({ thirdBoards: 'all-near-best', replyEquityWindow: .040, fourthBoards: 'preserve' });
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
export function thirdBranches(index, readShard, limit = Infinity) {
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
export function fourthBranches(third, readRolls, limit = Infinity) {
  const branches = [];
  for (const branch of third) for (const [dice, entry] of Object.entries(readRolls(branch.board))) {
    const s = { ...branch.state, dice: [...dice].map(Number) }, steps = rowSteps(entry.rows[0]);
    branches.push({ state: nextBoard(s, steps), weight: branch.weight * rollWeight(dice),
      parent: { board: branch.board, roll: dice, steps } });
  }
  return rankBranches(branches, limit);
}

// All reply boards were already selected from near-best openings. Include
// every evaluated reply inside the window, then merge transpositions. No
// probability is assigned to choosing one of several near-best moves.
export function nearThirdBranches(index, readShard, window = CONTINUATION_POLICY.replyEquityWindow) {
  if (!Number.isFinite(window) || window < 0) throw Error('Invalid reply equity window.');
  const boards = new Map();
  for (const [board, ref] of Object.entries(index.replies)) {
    for (const [roll, entry] of Object.entries(readShard(ref.file).rolls)) {
      const state = stateForBoard(board, [...roll].map(Number));
      for (const row of entry.rows.filter(r => entry.rows[0][1] - r[1] <= window + 1e-8)) {
        const steps = rowSteps(row), after = nextBoard(state, steps), key = boardKey(after);
        const old = boards.get(key);
        if (old) old.paths++;
        else boards.set(key, { board: key, state: after, paths: 1, parent: { board, roll, steps } });
      }
    }
  }
  return [...boards.values()].sort((a, b) => a.board < b.board ? -1 : a.board > b.board ? 1 : 0);
}
