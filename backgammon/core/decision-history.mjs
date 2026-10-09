// SPDX-License-Identifier: GPL-3.0-or-later
import {
  replay,
  canDouble,
  notation,
  positionKey,
  clone,
} from "./rules.mjs";
import { forcedTurn } from "./table.mjs";
import { decisionFeedback } from "./decision-feedback.mjs";
import { CUBE_LABELS, gradeCube } from "../engine/cube-grade.mjs";
export function compactEvaluation(source, result) {
  const compact = clone(result);
  if (compact.type === "checker") {
    compact.evaluatedCount =
      compact.evaluatedCount ?? compact.candidates.length;
    compact.candidates = compact.candidates.slice(0, 10);
  }
  return { result: compact };
}
export function gradeDecision(source, result, action) {
  return action.type === "move"
    ? result
    : gradeCube(source, result, action.type);
}
export function decisionHistory(model) {
  const states = replay(model.initial, model.events);
  const rows = [];
  model.events.forEach((event, index) => {
    const source = states[index],
      a = event.action;
    const eligible =
      a.type === "move" ||
      (source.phase === "roll" &&
        ["roll", "double"].includes(a.type) &&
        canDouble(source)) ||
      (source.phase === "double" &&
        ["take", "pass", "beaver", "raccoon"].includes(a.type));
    if (!eligible) return;
    let result = event.evaluation?.result,
      feedback = null;
    try {
      if (result?.positionKey !== positionKey(source)) result = null;
      if (result?.type === "cube")
        result = gradeCube(source, result, a.type);
      if (result) feedback = decisionFeedback(result, source);
    } catch {
      result = null;
    }
    const forced = a.type === "move" && !!forcedTurn(source);
    rows.push({
      index,
      game: source.gameNumber,
      player: event.actor,
      source,
      action: a,
      label:
        a.type === "move"
          ? notation(a.steps, event.actor)
          : CUBE_LABELS[a.type],
      forced,
      result,
      feedback,
      status: feedback ? "evaluated" : forced ? "forced" : "pending",
    });
  });
  return rows;
}
export function decisionTotals(rows, player) {
  const own = rows.filter((r) => r.player === player),
    graded = own.filter((r) => r.feedback);
  const money = own.every((r) => !r.source.matchLength);
  return {
    money,
    evaluated: graded.length,
    pending: own.filter((r) => r.status === "pending").length,
    forced: own.filter((r) => r.forced).length,
    loss: graded.reduce(
      (n, r) => n + r.feedback.loss * (money ? r.source.cube.value : 1),
      0,
    ),
  };
}

// A grade may follow an unchanged event prefix, never an unrelated replay branch.
export function sameDecisionPrefix(a, b, index) {
  return (
    JSON.stringify(a.initial) === JSON.stringify(b.initial) &&
    a.events.length > index &&
    b.events.length > index &&
    a.events
      .slice(0, index + 1)
      .every(
        (e, i) =>
          e.actor === b.events[i].actor &&
          JSON.stringify(e.action) === JSON.stringify(b.events[i].action),
      )
  );
}
export function mergeEvaluations(current, saved) {
  if (
    !saved ||
    JSON.stringify(current.initial) !== JSON.stringify(saved.initial)
  )
    return current;
  for (let i = 0; i < current.events.length; i++) {
    const a = current.events[i],
      b = saved.events[i];
    if (
      !b ||
      a.actor !== b.actor ||
      JSON.stringify(a.action) !== JSON.stringify(b.action)
    )
      break;
    if (!a.evaluation && b.evaluation) a.evaluation = clone(b.evaluation);
  }
  return current;
}
