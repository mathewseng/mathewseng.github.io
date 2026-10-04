// SPDX-License-Identifier: GPL-3.0-or-later
// GNUbg cube outcomes use the player-on-roll (doubler) perspective.
export function gradeCube(state, result, decision) {
  if (result.type !== "cube" || !Array.isArray(result.outcomes))
    throw new Error("A cube evaluation is required.");
  const [no, take, pass] = result.outcomes;
  if (![no, take, pass].every(Number.isFinite))
    throw new Error("Invalid cube equities.");
  let error;
  if (state.phase === "double" && ["take", "pass"].includes(decision))
    error = (decision === "take" ? take : pass) - Math.min(take, pass);
  else if (state.phase === "roll" && ["roll", "double"].includes(decision))
    error =
      Math.max(no, Math.min(take, pass)) -
      (decision === "double" ? Math.min(take, pass) : no);
  else
    throw new Error(
      "This decision does not belong to the analyzed cube state.",
    );
  return { ...result, error: Math.max(0, error), actualDecision: decision };
}
