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
export function beginDecisionAttempt(table, action) {
  if (!currentAttempt(table)) table.initialDecision = {
    index: table.events.length,
    positionKey: positionKey(table.state),
    action: clone(action),
  };
  return table.initialDecision;
}
export function recordInitialEvaluation(table, action, evaluation) {
  const attempt = currentAttempt(table);
  if (attempt && !attempt.evaluation && sameDecisionAction(attempt.action, action))
    attempt.evaluation = clone(evaluation);
}
// Called only after a successful rules transition. Every new decision carries
// an explicit first action, so older saves with no record stay distinguishable.
export function acceptedAttempt(table, action) {
  const attempt = currentAttempt(table);
  return attempt ? {
    action: clone(attempt.action),
    ...(attempt.evaluation ? { evaluation: clone(attempt.evaluation) } : {}),
  } : { action: clone(action) };
}
