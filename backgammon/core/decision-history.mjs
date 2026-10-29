// SPDX-License-Identifier: GPL-3.0-or-later
import {
  canDouble,
  notation,
  positionKey,
  clone,
} from "./rules.mjs";
import { forcedTurn, blockedBarRoll } from "./table.mjs";
import { historyStates } from "./history-states.mjs";
import { decisionFeedback } from "./decision-feedback.mjs";
import { CUBE_LABELS, gradeCube } from "../engine/cube-grade.mjs";
import { sameDecisionAction, decisionAttempts } from "./decision-attempt.mjs";
export function compactEvaluation(source, result) {
  // A saved review needs the ranked moves, submitted move and screening
  // summary, not thousands of discarded search paths. Compact before cloning:
  // every later turn copies this history, including initial/accepted grades.
  const screen = value => {
    const {excluded, initial, ...summary} = value;
    return {...summary, ...(initial ? {initial:screen(initial)} : {})};
  };
  return { result: clone({ ...result,
    ...(result.type === "checker" ? {
      evaluatedCount: result.evaluatedCount ?? result.candidates.length,
      candidates: result.candidates.slice(0, 10),
    } : {}),
    ...(result.screening ? {screening:screen(result.screening)} : {}),
  }) };
}
export function gradeDecision(source, result, action) {
  return action.type === "move"
    ? result
    : gradeCube(source, result, action.type);
}
// historyStates supplies deeply frozen positions. Reuse their stable keys
// across background grades instead of reserializing the whole match each time.
const positionKeys = new WeakMap();
function sourceKey(source) {
  if (!positionKeys.has(source)) positionKeys.set(source, positionKey(source));
  return positionKeys.get(source);
}
export function decisionHistory(model) {
  const states = historyStates(model);
  const rows = [];
  let turn = 1, turnStart = 0;
  model.events.forEach((event, index) => {
    const source = states[index],
      a = event.action;
    if (index && source.gameNumber !== states[index - 1].gameNumber) {
      turn = 1;
      turnStart = index;
    } else if (index && ['move', 'skip-roll'].includes(model.events[index - 1].action.type)) {
      turn++;
      turnStart = index;
    }
    const eligible =
      a.type === "move" ||
      (source.phase === "roll" &&
        ["roll", "skip-roll", "double"].includes(a.type) &&
        !(a.type === 'skip-roll' && event.automatic) &&
        !(a.type === "roll" && blockedBarRoll(source)) &&
        canDouble(source)) ||
      (source.phase === "double" &&
        ["take", "pass", "beaver", "raccoon"].includes(a.type));
    if (!eligible) return;
    let result = event.evaluation?.result || null,
      feedback = null;
    try {
      if (result && result.positionKey !== sourceKey(source)) result = null;
      if (result?.type === "cube")
        result = gradeCube(source, result, a.type);
      if (result) feedback = decisionFeedback(result, source);
    } catch {
      result = null;
    }
    const forced = a.type === "move" && !!forcedTurn(source);
    const attempts = decisionAttempts(event.initialDecision).map((attempt, attemptIndex) => {
      const action = attempt.action;
      let feedbackForAttempt = null;
      try {
        const saved = attempt.evaluation?.result;
        if (saved && saved.positionKey === sourceKey(source))
          feedbackForAttempt = decisionFeedback(gradeDecision(source, saved, action), source);
        else if (sameDecisionAction(action, a)) feedbackForAttempt = feedback;
        // A cube evaluation contains all options, so a revised cube decision
        // can be graded without another engine search.
        else if (result?.type === "cube")
          feedbackForAttempt = decisionFeedback(gradeDecision(source, result, action), source);
      } catch { /* Missing/stale attempt analysis remains pending. */ }
      return { action, feedback: feedbackForAttempt, attemptIndex };
    });
    const initialAction = attempts[0]?.action || null;
    const initialFeedback = attempts[0]?.feedback || null;
    rows.push({
      index,
      game: source.gameNumber,
      turn,
      turnStart,
      turnPlayer: source.turn,
      player: event.actor,
      source,
      action: a,
      choiceMethod: ["manual", "play-best"].includes(event.choiceMethod) ? event.choiceMethod : null,
      label:
        a.type === "move"
          ? notation(a.steps, event.actor)
          : CUBE_LABELS[a.type],
      forced,
      result,
      feedback,
      initialAction,
      initialFeedback,
      attempts,
      status: feedback ? "evaluated" : forced ? "forced" : "pending",
    });
  });
  return rows;
}

// One display row per player's decisions in a turn. A cube exchange can put
// another player's response between the offer and checker play. Keep that
// response separate, and preserve every original decision/grade/return target.
// Keys come from event boundaries, never adjacency, dice or checker position.
export function groupDecisionTurns(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.game}:${row.turnStart}:${row.player}`;
    if (!groups.has(key)) groups.set(key, {
      key, game: row.game, turn: row.turn, player: row.player,
      response: row.player !== row.turnPlayer, decisions: [],
    });
    groups.get(key).decisions.push(row);
  }
  return [...groups.values()].map(group => ({
    ...group, decisions: group.decisions.sort((a, b) => a.index - b.index),
  })).sort((a, b) => a.decisions.at(-1).index - b.decisions.at(-1).index);
}
export function decisionTotals(rows, player) {
  const own = rows.filter((r) => r.player === player),
    graded = own.filter((r) => r.feedback);
  const money = own.every((r) => !r.source.matchLength);
  return {
    money,
    lossUnits: "normalized-equity",
    evaluated: graded.length,
    pending: own.filter((r) => r.status === "pending").length,
    forced: own.filter((r) => r.forced).length,
    loss: graded.reduce(
      (n, r) => n + r.feedback.loss,
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
    if (!a.choiceMethod && b.choiceMethod) a.choiceMethod = b.choiceMethod;
    if (!a.initialDecision && b.initialDecision) a.initialDecision = clone(b.initialDecision);
    else {
      const savedAttempts = decisionAttempts(b.initialDecision);
      for (const [index, attempt] of decisionAttempts(a.initialDecision).entries()) {
        const savedAttempt = savedAttempts[index];
        // A matching game line can still contain different draft revisions.
        // Only merge grades across the identical attempt prefix.
        if (!sameDecisionAction(attempt.action, savedAttempt?.action)) break;
        if (!attempt.evaluation && savedAttempt.evaluation)
          attempt.evaluation = clone(savedAttempt.evaluation);
      }
    }
  }
  return current;
}
