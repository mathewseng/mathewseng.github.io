// SPDX-License-Identifier: GPL-3.0-or-later
import { SEARCH_MODEL } from './search-model.mjs';
import { PRESETS } from './metadata.mjs';

export const SEARCH_POLICY_VERSION = 'gap-time-v1';

export function leadInfo(current, previous) {
  const a = current?.candidates, b = previous?.candidates;
  if (!a?.length || a.length < 2 || !a.every(c => Number.isFinite(c.equity))) return null;
  return {
    gap: Math.max(0, a[0].equity - a[1].equity),
    previousGap: b?.length >= 2 ? Math.max(0, b[0].equity - b[1].equity) : null,
    stable: Boolean(b?.length && a[0].key === b[0].key),
  };
}

export function nextCandidateCount(evaluations) {
  const current = evaluations.at(-1), deep = evaluations.find(r => r.settings.plies === 2);
  if (!deep?.candidates?.length || ![2, 3].includes(current?.settings.plies)) return null;
  const settings = current.settings.plies === 2 ? PRESETS.expert : PRESETS.research;
  const candidates = deep.candidates;
  const keys = new Set(candidates.filter((c, i) => i < 2 ||
    (i < settings.finalists && candidates[0].equity - c.equity <= settings.threshold) ||
    c.key === deep.actual?.key).map(c => c.key));
  keys.add(current.candidates[0].key);
  return keys.size;
}

export function timingFeatures(state, current, previous, nextCount) {
  const n = current.candidates.length;
  const unit = Math.max(.25, current.stageMs) / n;
  const prior = Math.max(.25, previous.stageMs) / previous.candidates.length;
  const white = state.points.flatMap((p, i) => p > 0 ? [i] : []);
  const black = state.points.flatMap((p, i) => p < 0 ? [i] : []);
  const contact = state.bar.some(Boolean) ||
    (white.length > 0 && black.length > 0 && Math.max(...white) > Math.min(...black));
  return [1, Math.max(-4, Math.min(4, Math.log(unit / prior))), Math.log(n), Math.log(nextCount),
    Number(contact), Number(state.bar.some(Boolean)), Number(state.rules.cube),
    Number(state.matchLength > 0), Number(state.dice[0] === state.dice[1])];
}

export function forecastNext(state, evaluations) {
  const current = evaluations.at(-1), previous = evaluations.at(-2);
  const depth = current?.settings.plies, model = SEARCH_MODEL.depths[depth];
  const count = nextCandidateCount(evaluations);
  if (!model || !count || !previous?.candidates?.length || !state?.points ||
      !Number.isFinite(current.stageMs) || !Number.isFinite(previous.stageMs)) return null;
  const x = timingFeatures(state, current, previous, count);
  const base = Math.max(.25, current.stageMs) * count / current.candidates.length;
  const exponent = model.method === 'regression'
    ? x.reduce((sum, value, i) => sum + value * model.coefficients[i], 0)
    : model.coefficients[0];
  const estimateMs = model.method === 'ratio'
    ? Math.max(.25, current.stageMs) * Math.exp(exponent)
    : base * Math.exp(Math.max(-6, Math.min(8, exponent)));
  return {
    nextPlies: depth + 1, candidates: count, estimateMs,
    // Empirical residual spread, not a calibrated confidence interval and not
    // a promise across browsers/devices. The parent deadline remains required.
    lowMs: estimateMs * Math.exp(model.residualP10),
    highMs: estimateMs * Math.exp(model.residualP90),
    model: SEARCH_MODEL.version,
  };
}

export function chooseSearchDecision(state, evaluations, elapsedMs, targetMs, submitted = null) {
  const current = evaluations.at(-1), previous = evaluations.at(-2);
  if (current?.type !== 'checker' || ![2, 3].includes(current.settings.plies))
    return { reason: 'searching', lead: null, forecast: null };
  const lead = leadInfo(current, previous), forecast = forecastNext(state, evaluations);
  // Match equity and actual-move grading need more than a stable top ranking.
  // Cubeful money gets a larger margin than the historical cubeless sample.
  const margin = state.rules?.cube ? SEARCH_MODEL.policy.moneyGap : SEARCH_MODEL.policy.cubelessGap;
  if (!submitted && !state.matchLength && lead?.stable && lead.gap >= margin &&
      lead.previousGap >= .02 && forecast?.estimateMs >= 50)
    return { reason: 'clear-lead', lead, forecast };
  // Skip only a stage forecast to be comfortably outside the remaining time.
  // Very short timings are noisy; still try the next level when current <10 ms.
  if (current.stageMs >= 10 && forecast && forecast.estimateMs > SEARCH_MODEL.policy.costMultiplier * Math.max(0, targetMs-elapsedMs))
    return { reason: 'predicted-cost', lead, forecast };
  return { reason: 'searching', lead, forecast };
}
