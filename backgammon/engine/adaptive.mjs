// SPDX-License-Identifier: GPL-3.0-or-later
import { chooseSearchDecision, leadInfo, SEARCH_POLICY_VERSION, SEARCH_LIMITS } from './search-policy.mjs';
export const ADAPTIVE_SEARCH = Object.freeze({
  version: SEARCH_POLICY_VERSION,
  ...SEARCH_LIMITS,
  presets: Object.freeze(["quick", "standard", "deep", "expert", "research"]),
});
// Broad 0-ply screening before automatic 1/2-ply searches. Keep sixteen even
// outside the window, up to twenty-four within it, plus the user's actual move.
// Fixed Quick/Standard/Deep remain exhaustive over legal resulting boards.
export const ADAPTIVE_ROOT = Object.freeze({ plies: 0, minimum: 16, maximum: 24, threshold: 0.16 });

// Publish whole evaluations, always completing at least three plies. Deeper
// stages are gated by estimated cost/stability, not an elapsed-time cutoff.
export function* adaptiveStages(evaluator, state, kind, submitted, now = () => performance.now()) {
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
      settings: { ...evaluation.settings, searchPolicy: SEARCH_POLICY_VERSION, ...SEARCH_LIMITS } };
    evaluations.push(completed);
    levels.push({ preset, plies: completed.settings.plies, elapsedMs: stageMs });
    const elapsedMs = now() - start;
    const decision = completed.settings.plies < ADAPTIVE_SEARCH.minimumPlies
      ? { reason: 'searching', lead: null, forecast: null }
      : chooseSearchDecision(state, evaluations, submitted);
    const reason = levels.length === ADAPTIVE_SEARCH.presets.length ? 'maximum-depth'
      : decision.reason;
    result = {
      ...completed,
      elapsedMs,
      budget: { ...SEARCH_LIMITS, levels: [...levels], reason,
        policy: SEARCH_POLICY_VERSION, lead: leadInfo(completed, previous), forecast: decision.forecast },
    };
    yield result;
    if (reason !== 'searching') break;
  }
  return result;
}

export function runAdaptive(evaluator, state, kind, submitted, publish, now) {
  let result;
  for (result of adaptiveStages(evaluator, state, kind, submitted, now)) publish(result);
  return result;
}

// Yield to worker messages between complete depths. A live decision can stop
// at the minimum depth without reloading the WASM instance and its warm cache.
export async function runAdaptiveAsync(evaluator, state, kind, submitted, publish,
  readyOnly = () => false, yieldStage = () => new Promise(resolve => setTimeout(resolve, 0))) {
  let result;
  for (result of adaptiveStages(evaluator, state, kind, submitted)) {
    publish(result);
    await yieldStage();
    if (readyOnly() && result.settings.plies >= ADAPTIVE_SEARCH.minimumPlies) {
      return {...result, budget:{...result.budget, reason:'ready-to-play'}};
    }
  }
  return result;
}
