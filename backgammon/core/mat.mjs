// SPDX-License-Identifier: GPL-3.0-or-later
// Strict Jellyfish MAT subset, matching GNUbg ExportGameJF's 5/33 column layout.
// https://www.gnu.org/software/gnubg/manual/gnubg.html (Jellyfish varies by exporter).
import {
  initialState,
  transition,
  legalPaths,
  boardKey,
  clone,
  applyStep,
  assertState,
} from "./rules.mjs";
export function parseMAT(text) {
  if (
    typeof text !== "string" ||
    text.length > 2 * 1024 * 1024 ||
    /[\x00-\x08]/.test(text)
  )
    throw new Error(
      "Expected a text MAT file under 2 MB; binary files are unsupported.",
    );
  const header = text.match(/^\s*(\d+) point match\s*$/m);
  if (!header) throw new Error("Missing “N point match” MAT header.");
  const matchLength = Number(header[1]);
  let s = null,
    initial = null,
    names = ["Ivory", "Teal"],
    events = [],
    games = 0;
  const add = (action, actor = s.turn) => {
    s = transition(s, action, actor);
    events.push({ actor, action });
  };
  function decision(cell, player, line) {
    cell = cell.trim();
    if (!cell) return;
    const fail = (message) => {
      throw new Error(`MAT line ${line}: ${message}`);
    };
    if (cell.startsWith("Wins ")) {
      const points = Number(cell.match(/^Wins (\d+) points?/)?.[1]);
      if (s.phase === "over") {
        if (s.result.winner !== player || s.result.points !== points)
          fail("win summary disagrees with legal play.");
        return;
      }
      const level = points / s.cube.value;
      if (
        s.turn !== 1 - player ||
        !["roll", "move"].includes(s.phase) ||
        ![1, 2, 3].includes(level)
      )
        fail("this terminal win/resignation notation is unsupported.");
      add({ type: "resign", level });
      add({ type: "accept" }, player);
      return;
    }
    if (/^Doubles\s*=>\s*\d+$/.test(cell)) {
      if (
        s.turn !== player ||
        Number(cell.match(/\d+$/)[0]) !== s.cube.value * 2
      )
        fail("invalid double.");
      add({ type: "double" }, player);
      return;
    }
    if (cell === "Takes") {
      add({ type: "take" }, player);
      return;
    }
    if (cell === "Drops") {
      add({ type: "pass" }, player);
      return;
    }
    const roll = cell.match(/^([1-6])([1-6]):\s*(.*)$/);
    if (!roll)
      fail(
        "unsupported action. Use a standard two-column Jellyfish text export.",
      );
    const dice = [+roll[1], +roll[2]];
    if (s.phase === "opening") {
      if (dice[0] === dice[1]) fail("an opening turn cannot be doubles.");
      add(
        {
          type: "opening",
          dice:
            player === 0
              ? [Math.max(...dice), Math.min(...dice)]
              : [Math.min(...dice), Math.max(...dice)],
        },
        0,
      );
    } else {
      if (s.turn !== player) fail("wrong player column.");
      add({ type: "roll", dice }, player);
    }
    const moves = roll[3].replace(/\*/g, "").trim(),
      legal = legalPaths(s);
    let after = clone(s);
    if (moves && !/^(Can't move|Cannot move|No move)$/i.test(moves)) {
      for (const token of moves.split(/\s+/)) {
        const m = token.match(
          /^((?:bar|off|\d{1,2})(?:\/(?:bar|off|\d{1,2}))+)(?:\(([1-4])\))?$/i,
        );
        if (!m) fail("unsupported checker notation.");
        const seq = m[1]
          .toLowerCase()
          .split("/")
          .map((v) =>
            v === "bar" || v === "25"
              ? "bar"
              : v === "off" || v === "0"
                ? "off"
                : player === 0
                  ? Number(v) - 1
                  : 24 - Number(v),
          );
        for (let n = 0; n < Number(m[2] || 1); n++)
          for (let j = 0; j < seq.length - 1; j++) {
            const from = seq[j],
              to = seq[j + 1],
              sg = player === 0 ? 1 : -1;
            if (
              from === "off" ||
              to === "bar" ||
              (typeof from === "number" && (from < 0 || from > 23)) ||
              (typeof to === "number" && (to < 0 || to > 23))
            )
              fail("invalid checker point.");
            if (
              from === "bar" ? !after.bar[player] : after.points[from] * sg <= 0
            )
              fail("source has no checker.");
            if (typeof to === "number" && after.points[to] * sg < -1)
              fail("blocked destination.");
            after = applyStep(after, { from, to }, player);
          }
      }
    }
    const path = legal.find((p) => boardKey(p.state) === boardKey(after));
    if (!path) fail("checker play is not a complete legal turn.");
    add({ type: "move", steps: path.steps }, player);
  }
  for (const [i, line] of text.replace(/\r/g, "").split("\n").entries()) {
    if (
      !line.trim() ||
      /^\s*(#|;)/.test(line) ||
      /^\s*\d+ point match\s*$/.test(line)
    )
      continue;
    if (/^\s*Game \d+\s*$/.test(line)) {
      games++;
      if (s) {
        if (s.phase !== "over")
          throw new Error(`MAT line ${i + 1}: previous game is incomplete.`);
        add({ type: "next" });
      }
      continue;
    }
    const score = line.match(
      /^\s*(.+?)\s*:\s*(\d+)\s{2,}(.+?)\s*:\s*(\d+)\s*$/,
    );
    if (score) {
      names = [score[1].trim().slice(0, 24), score[3].trim().slice(0, 24)];
      const scores = [+score[2], +score[4]];
      if (!s) {
        s = initialState({
          matchLength,
          scores,
          crawford: matchLength > 0 && scores.includes(matchLength - 1),
        });
        initial = clone(s);
      } else if (s.scores.some((n, j) => n !== scores[j]))
        throw new Error(`MAT line ${i + 1}: scores disagree with the replay.`);
      continue;
    }
    if (!s) throw new Error(`MAT line ${i + 1}: missing player/score row.`);
    if (/^\s*\d+\)/.test(line)) {
      // GNUbg uses '%3d) %-27s ' so the second player begins at zero-based column 33.
      const prefix = line.indexOf(")") + 2;
      if (prefix !== 5)
        throw new Error(
          `MAT line ${i + 1}: expected standard fixed-width player columns.`,
        );
      decision(line.slice(5, 33), 0, i + 1);
      decision(line.slice(33), 1, i + 1);
    } else if (/Wins \d+ points?/.test(line)) {
      const col = line.indexOf("Wins");
      decision(line.trim(), col >= 30 ? 1 : 0, i + 1);
    } else
      throw new Error(
        `MAT line ${i + 1}: unsupported text or exporter variant.`,
      );
  }
  if (!initial || !events.length)
    throw new Error("MAT contains no playable decisions.");
  assertState(s);
  return {
    version: 1,
    id: crypto.randomUUID(),
    kind: "match",
    title: names.join(" vs "),
    names,
    initial,
    events,
    notes: "Imported Jellyfish MAT text. Original rolls are preserved.",
    tags: ["imported"],
    collection: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
