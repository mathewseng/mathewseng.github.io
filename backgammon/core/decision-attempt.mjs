// SPDX-License-Identifier: GPL-3.0-or-later
import { clone, positionKey } from "./rules.mjs";

// Dice are the outcome of choosing to roll, not part of the cube decision.
export function sameDecisionAction(a, b) {
  return !!a && !!b && a.type === b.type &&
    (a.type !== "move" || JSON.stringify(a.steps) === JSON.stringify(b.steps));
}
export function currentAttempt(table) {
  const attempt = table.initialDecision;
  return attempt?.index === table.events.length &&
    attempt.positionKey === positionKey(table.state) ? attempt : null;
}
export function markHintSeen(table) {
  table.hintDecision = {index:table.events.length, positionKey:positionKey(table.state)};
}
export function decisionHintSeen(table) {
  return table.hintDecision?.index === table.events.length &&
    table.hintDecision.positionKey === positionKey(table.state);
}
// Keep the first submission in the existing save format; revisions extend it
// without changing initial-versus-accepted summary statistics.
export function decisionAttempts(first) {
  return first?.action ? [first, ...(first.revisions || [])] : [];
}
export function beginDecisionAttempt(table, action) {
  if (!currentAttempt(table)) table.initialDecision = {
    index: table.events.length,
    positionKey: positionKey(table.state),
    action: clone(action),
  };
  else if (!sameDecisionAction(decisionAttempts(table.initialDecision).at(-1).action, action))
    (table.initialDecision.revisions ||= []).push({ action: clone(action) });
  return table.initialDecision;
}
export function recordInitialEvaluation(table, action, evaluation) {
  for (const attempt of decisionAttempts(currentAttempt(table))) {
    if (!attempt.evaluation && sameDecisionAction(attempt.action, action))
      attempt.evaluation = clone(evaluation);
  }
}
// Called only after a successful rules transition. Every new decision carries
// an explicit first action, so older saves with no record stay distinguishable.
export function acceptedAttempt(table, action) {
  const attempt = currentAttempt(table);
  return attempt ? {
    action: clone(attempt.action),
    ...(attempt.evaluation ? { evaluation: clone(attempt.evaluation) } : {}),
    ...(attempt.revisions?.length ? { revisions: clone(attempt.revisions) } : {}),
  } : { action: clone(action) };
}
