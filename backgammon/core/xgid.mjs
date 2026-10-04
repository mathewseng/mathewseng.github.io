// SPDX-License-Identifier: GPL-3.0-or-later
// XGID uppercase = Ivory (GNU player 1). Position string runs bar(Teal), points 1..24, bar(Ivory).
import { initialState, assertState } from "./rules.mjs";
export function toXGID(s) {
  assertState(s);
  if (["opening", "resign", "over"].includes(s.phase))
    throw new Error(
      "XGID export requires a checker, pre-roll, or cube decision.",
    );
  const letter = (n) =>
    n === 0 ? "-" : String.fromCharCode((n > 0 ? 64 : 96) + Math.abs(n));
  const board = [-s.bar[1], ...s.points, s.bar[0]].map(letter).join("");
  return `XGID=${board}:${Math.log2(s.cube.value)}:${s.cube.owner === null ? 0 : s.cube.owner === 0 ? 1 : -1}:${s.turn === 0 ? 1 : -1}:${s.phase === "double" ? "D" : s.dice.length ? s.dice.join("") : "00"}:${s.scores[0]}:${s.scores[1]}:${s.crawford ? 1 : 0}:${s.matchLength}:${s.rules.cube ? 10 : 0}`;
}
export function fromXGID(text) {
  if (typeof text !== "string" || text.length > 160)
    throw new Error("XGID must be a string of at most 160 characters.");
  const parts = text
    .trim()
    .replace(/^XGID=/, "")
    .split(":");
  if (parts.length !== 10 || !/^[-A-Oa-o]{26}$/.test(parts[0]))
    throw new Error(
      "Expected XGID with 26 board characters and nine context fields.",
    );
  if (
    !parts
      .slice(1)
      .every((p, i) =>
        i === 3 ? /^(00|[1-6]{2}|D)$/.test(p) : /^-?\d{1,6}$/.test(p),
      )
  )
    throw new Error("Invalid XGID context field.");
  const [board, power, owner, turn, dice, a, b, rule, length, limit] = parts;
  if (
    ![0, 1, -1].includes(+owner) ||
    ![1, -1].includes(+turn) ||
    +power < 0 ||
    +power > 10 ||
    ![0, 10].includes(+limit)
  )
    throw new Error("Unsupported cube, turn, or maximum-cube field.");
  if (
    (+length === 0 && +rule !== 0) ||
    (+length > 0 && ![0, 1].includes(+rule))
  )
    throw new Error(
      "Jacoby, beavers, and unknown rule flags are not supported.",
    );
  if (/[A-O]/.test(board[0]) || /[a-o]/.test(board[25]))
    throw new Error("Bar colors are invalid.");
  const decode = (c) =>
    c === "-"
      ? 0
      : c === c.toUpperCase()
        ? c.charCodeAt(0) - 64
        : -(c.charCodeAt(0) - 96);
  const points = [...board.slice(1, 25)].map(decode),
    bar = [decode(board[25]), -decode(board[0])];
  const off = [0, 1].map(
    (p) =>
      15 -
      bar[p] -
      points.reduce(
        (n, v) => n + (v * (p === 0 ? 1 : -1) > 0 ? Math.abs(v) : 0),
        0,
      ),
  );
  const phase = dice === "D" ? "double" : dice === "00" ? "roll" : "move";
  return initialState({
    points,
    bar,
    off,
    turn: +turn === 1 ? 0 : 1,
    dice: phase === "move" ? [...dice].map(Number) : [],
    phase,
    cube: {
      value: 2 ** +power,
      owner: +owner === 0 ? null : +owner === 1 ? 0 : 1,
    },
    scores: [+a, +b],
    matchLength: +length,
    crawford: +rule === 1,
    crawfordPlayed:
      +rule === 0 && +length > 0 && [+a, +b].includes(+length - 1),
    rules: { cube: +limit === 10, jacoby: false },
    pending:
      phase === "double" ? { type: "double", by: +turn === 1 ? 0 : 1 } : null,
  });
}
export function shareURL(s, route = "solver") {
  const u = new URL(
    `/backgammon/${route}/`,
    globalThis.location?.origin || "https://mathewseng.github.io",
  );
  u.hash = new URLSearchParams({ xgid: toXGID(s) }).toString();
  return u.href;
}
