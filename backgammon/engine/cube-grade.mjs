// SPDX-License-Identifier: GPL-3.0-or-later
import { decisionPlayer } from "../core/rules.mjs";
export const CUBE_LABELS = {
  roll: "No double",
  double: "Double",
  take: "Take",
  pass: "Pass",
  beaver: "Beaver",
  raccoon: "Raccoon",
};
// GNUbg's raw cube outcomes use the original roller's perspective and cube.
// Feedback converts ALL alternatives together to the actual decision maker.
export function cubeChoices(state, result) {
  if (result.type !== "cube" || !Array.isArray(result.outcomes))
    throw new Error("A cube evaluation is required.");
  const [no, take, pass] = result.outcomes;
  if (![no, take, pass].every(Number.isFinite))
    throw new Error("Invalid cube equities.");
  const reply = take <= pass ? 1 : 2;
  const raw =
    result.decisionOptions ||
    (state.phase === "double"
      ? [
          { action: "take", equity: take, index: 1 },
          { action: "pass", equity: pass, index: 2 },
        ]
      : state.phase === "roll" && result.available !== false
        ? [
            { action: "roll", equity: no, index: 0 },
            {
              action: "double",
              equity: Math.min(take, pass),
              index: reply,
            },
          ]
        : []);
  const player = decisionPlayer(state),
    flip = player !== state.turn;
  if (!raw.length || raw.some((c) => !Number.isFinite(c.equity)))
    throw new Error("No legal cube decision to grade.");
  return raw
    .map((c) => {
      const mwc =
        c.mwc ??
        (c.index === undefined ? null : result.outcomesMWC?.[c.index]);
      return {
        ...c,
        notation: CUBE_LABELS[c.action],
        equity: flip ? -c.equity : c.equity,
        mwc: Number.isFinite(mwc) ? (flip ? 1 - mwc : mwc) : null,
      };
    })
    .sort((a, b) => b.equity - a.equity);
}
export function gradeCube(state, result, decision) {
  const choices = cubeChoices(state, result),
    actual = choices.find((c) => c.action === decision);
  if (!actual)
    throw new Error("This decision is not a legal analyzed cube choice.");
  return {
    ...result,
    error: Math.max(0, choices[0].equity - actual.equity),
    actualDecision: decision,
    decision: {
      player: decisionPlayer(state),
      choices,
      best: choices[0],
      actual,
    },
  };
}
