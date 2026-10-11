// SPDX-License-Identifier: GPL-3.0-or-later
export const ADAPTIVE_SEARCH = Object.freeze({
  targetMs: 1000,
  presets: Object.freeze(["quick", "standard", "deep", "expert", "research"]),
});
// Broad 0-ply screening before automatic 1/2-ply searches. Keep sixteen even
// outside the window, up to twenty-four within it, plus the user's actual move.
// Fixed Quick/Standard/Deep remain exhaustive over legal resulting boards.
export const ADAPTIVE_ROOT = Object.freeze({ plies: 0, minimum: 16, maximum: 24, threshold: 0.16 });

// Publish only whole evaluations. A parent-thread deadline terminates WASM if
// the next synchronous evaluation overruns; it retains this completed result.
export function runAdaptive(evaluator, state, kind, submitted, publish, now = () => performance.now()) {
  const start = now(), levels = [];
  let result;
  for (const preset of ADAPTIVE_SEARCH.presets) {
    const evaluation = evaluator.analyze(state, preset, kind, submitted, { automatic: true });
    levels.push({ preset, plies: evaluation.settings.plies, elapsedMs: evaluation.elapsedMs });
    const elapsedMs = now() - start;
    result = {
      ...evaluation,
      elapsedMs,
      budget: { targetMs: ADAPTIVE_SEARCH.targetMs, levels: [...levels], reason: "searching" },
    };
    publish(result);
    if (elapsedMs >= ADAPTIVE_SEARCH.targetMs) break;
  }
  return {
    ...result,
    budget: {
      ...result.budget,
      reason: levels.length === ADAPTIVE_SEARCH.presets.length ? "maximum-depth" : "time-budget",
    },
  };
}
