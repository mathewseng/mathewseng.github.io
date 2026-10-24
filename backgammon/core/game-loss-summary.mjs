// SPDX-License-Identifier: GPL-3.0-or-later
import { needsRevisionWarning } from "./decision-feedback.mjs";

// Per-game, per-player totals on the active history line only. A checker move
// means a full turn (all its dice), including forced turns but excluding passes.
export function gameLossSummary(rows, gameNumber, matchLength = 0) {
  const game = rows.filter(row => row.game === gameNumber);
  const money = !matchLength;
  const summarize = (decisions, initial) => {
    let total = 0, evaluated = 0, pending = 0, unavailable = 0, mistakes = 0;
    for (const row of decisions) {
      const feedback = initial ? row.initialFeedback : row.feedback;
      if (row.forced) { evaluated++; continue; }
      if (!feedback) {
        if (initial && !row.initialAction) unavailable++;
        else pending++;
        continue;
      }
      total += feedback.loss;
      evaluated++;
      if (needsRevisionWarning(feedback.loss)) mistakes++;
    }
    return { total, average: evaluated ? total / evaluated : null,
      mistakes, evaluated, pending, unavailable, count: decisions.length };
  };
  return {
    money,
    players: [0, 1].map(player => {
      const own = game.filter(row => row.player === player);
      const checker = own.filter(row => row.action.type === "move" && row.action.steps.length);
      const cube = own.filter(row => row.action.type !== "move");
      return { player,
        checker: { initial: summarize(checker, true), accepted: summarize(checker, false) },
        cube: { initial: summarize(cube, true), accepted: summarize(cube, false) },
      };
    }),
  };
}
