// SPDX-License-Identifier: GPL-3.0-or-later
import { chooseSearchDecision, leadInfo, SEARCH_POLICY_VERSION } from './search-policy.mjs';
export const ADAPTIVE_SEARCH = Object.freeze({
  version: SEARCH_POLICY_VERSION,
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
  const start = now(), levels = [], evaluations = [];
  let result;
  for (const preset of ADAPTIVE_SEARCH.presets) {
    const previous = evaluations.at(-1), began = now();
    const evaluation = evaluator.analyze(state, preset, kind, submitted, {
      automatic: true,
      retainKeys: previous?.candidates?.length ? [previous.candidates[0].key] : [],
    });
    const stageMs = now() - began;
    const completed = { ...evaluation, stageMs,
      settings: { ...evaluation.settings, searchPolicy: SEARCH_POLICY_VERSION } };
    evaluations.push(completed);
    levels.push({ preset, plies: completed.settings.plies, elapsedMs: stageMs });
    const elapsedMs = now() - start;
    const decision = chooseSearchDecision(state, evaluations, elapsedMs, ADAPTIVE_SEARCH.targetMs, submitted);
    const reason = levels.length === ADAPTIVE_SEARCH.presets.length ? 'maximum-depth'
      : elapsedMs >= ADAPTIVE_SEARCH.targetMs ? 'time-budget' : decision.reason;
    result = {
      ...completed,
      elapsedMs,
      budget: { targetMs: ADAPTIVE_SEARCH.targetMs, levels: [...levels], reason,
        policy: SEARCH_POLICY_VERSION, lead: leadInfo(completed, previous), forecast: decision.forecast },
    };
    publish(result);
    if (reason !== 'searching') break;
  }
  return result;
}
