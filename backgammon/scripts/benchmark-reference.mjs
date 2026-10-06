// SPDX-License-Identifier: GPL-3.0-or-later
// GNUbg's historical .bm files use 20 A–P hex nibbles of the unary PositionKey.
// This parser is confined to the reproducible benchmark, not an advertised import format.
import { initialState, boardKey } from "../core/rules.mjs";
export function decodeBenchmarkKey(key, swapped = false) {
  if (!/^[A-P]{20}$/.test(key)) throw new Error("Invalid benchmark board key");
  const board = [Array(25).fill(0), Array(25).fill(0)];
  let player = 0,
    point = 0;
  for (let i = 0; i < 20; i += 2) {
    let byte = (key.charCodeAt(i) - 65) * 16 + key.charCodeAt(i + 1) - 65;
    for (let bit = 0; bit < 8; bit++, byte >>= 1) {
      if (byte & 1) {
        if (player > 1) throw new Error("Invalid benchmark key padding");
        board[player][point]++;
      } else if (++point === 25) {
        point = 0;
        player++;
      }
    }
  }
  if (swapped) board.reverse();
  const points = Array.from(
    { length: 24 },
    (_, i) => board[1][i] - board[0][23 - i],
  );
  return {
    points,
    bar: [board[1][24], board[0][24]],
    off: [
      15 - board[1].reduce((a, b) => a + b),
      15 - board[0].reduce((a, b) => a + b),
    ],
  };
}
export function parseBenchmarkMove(line) {
  const [kind, key, d1, d2, ...pairs] = line.trim().split(/\s+/);
  if (kind !== "m" || pairs.length % 2 || pairs.length < 4)
    throw new Error("Invalid benchmark move record");
  const state = initialState({
    ...decodeBenchmarkKey(key),
    phase: "move",
    dice: [Number(d1), Number(d2)],
    matchLength: 0,
    rules: { cube: false },
  });
  const best = Number(pairs[1]);
  return {
    key,
    state,
    reference: pairs
      .filter((_, i) => i % 2 === 0)
      .map((key, i) => ({
        key: boardKey({ ...state, ...decodeBenchmarkKey(key, true) }),
        equity: i === 0 ? best : best - Number(pairs[i * 2 + 1]),
        loss: i === 0 ? 0 : Number(pairs[i * 2 + 1]),
      })),
  };
}
