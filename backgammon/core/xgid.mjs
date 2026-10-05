// SPDX-License-Identifier: GPL-3.0-or-later
// XGID uppercase = Ivory (GNU player 1). Position string runs bar(Teal), points 1..24, bar(Ivory).
import { initialState, assertState, rulesOf, offerDepth } from "./rules.mjs";
export function toXGID(s, { engine = false } = {}) {
  assertState(s);
  if (["opening", "resign", "over"].includes(s.phase))
    throw new Error(
      "XGID export requires a checker, pre-roll, or cube decision.",
    );
  if (offerDepth(s))
    throw new Error(
      "This XGID encoder supports ordinary cube offers. Use a position link or Library JSON for pending beavers and raccoons.",
    );
  if (
    !engine &&
    (rulesOf(s).automaticDoubles || rulesOf(s).immediateRedoubles > 1)
  )
    throw new Error(
      "Use a full position link or Library JSON to preserve the opening-double limit and raccoon setting.",
    );
  const letter = (n) =>
    n === 0 ? "-" : String.fromCharCode((n > 0 ? 64 : 96) + Math.abs(n));
  const board = [-s.bar[1], ...s.points, s.bar[0]].map(letter).join("");
  const flags = s.matchLength
    ? Number(s.crawford)
    : Number(s.rules.jacoby) + (rulesOf(s).immediateRedoubles ? 2 : 0);
  return `XGID=${board}:${Math.log2(s.cube.value)}:${s.cube.owner === null ? 0 : s.cube.owner === 0 ? 1 : -1}:${s.turn === 0 ? 1 : -1}:${s.phase === "double" ? "D" : s.dice.length ? s.dice.join("") : "00"}:${s.scores[0]}:${s.scores[1]}:${flags}:${s.matchLength}:${s.rules.cube ? 10 : 0}`;
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
    (+length === 0 && ![0, 1, 2, 3].includes(+rule)) ||
    (+length > 0 && ![0, 1].includes(+rule))
  )
    throw new Error("Unknown XGID rule flags.");
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
    crawford: +length > 0 && +rule === 1,
    crawfordPlayed:
      +rule === 0 && +length > 0 && [+a, +b].includes(+length - 1),
    rules: {
      cube: +limit === 10,
      jacoby: +length === 0 && !!(+rule & 1),
      immediateRedoubles: +length === 0 && +rule & 2 ? 1 : 0,
    },
    pending:
      phase === "double" ? { type: "double", by: +turn === 1 ? 0 : 1 } : null,
  });
}
export function shareURL(s, route = "solver") {
  const u = new URL(
    `/backgammon/${route}/`,
    globalThis.location?.origin || "https://mathewseng.github.io",
  );
  assertState(s);
  // This encoder implements the verified standard XGID subset.
  // Full application links also preserve optional rule limits and immediate offers.
  u.hash = new URLSearchParams({ state: JSON.stringify(s) }).toString();
  return u.href;
}
export function sharedPosition(params) {
  if (params.has("state")) {
    const text = params.get("state");
    if (text.length > 6000) throw new Error("Shared position is too large.");
    return assertState(JSON.parse(text));
  }
  return fromXGID(params.get("xgid"));
}
