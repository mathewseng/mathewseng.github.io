// SPDX-License-Identifier: GPL-3.0-or-later
import { SEARCH_MODEL } from './search-model.mjs';
import { PRESETS } from './metadata.mjs';

export const SEARCH_POLICY_VERSION = 'minimum-two-v3';
export const SEARCH_LIMITS = Object.freeze({ minimumPlies: 2, maxNextStageMs: 5000, maximumCubePlies: 3 });

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
  // Cube searches do not enumerate root checker candidates. Extrapolate their
  // observed stage growth instead; this is a rough estimate, not a trained ETA.
  if (current?.type === 'cube' && depth === 2 &&
      Number.isFinite(current.stageMs) && Number.isFinite(previous?.stageMs)) {
    const cost = Math.max(.25, current.stageMs);
    return { nextPlies: depth + 1, estimateMs: cost * Math.max(1, cost / Math.max(.25, previous.stageMs)),
      model: 'observed-cube-growth-v1' };
  }
  const count = nextCandidateCount(evaluations);
  if (!model || !count || !previous?.candidates?.length || !state?.points ||
      !Number.isFinite(current.stageMs) || !Number.isFinite(previous.stageMs)) return null;
  const x = timingFeatures(state, current, previous, count);
  const base = Math.max(.25, current.stageMs) * count / current.candidates.length;
  const exponent = model.method === 'regression'
    ? x.reduce((sum, value, i) => sum + value * model.coefficients[i], 0)
    : model.coefficients[0];
  const modelEstimateMs = model.method === 'ratio'
    ? Math.max(.25, current.stageMs) * Math.exp(exponent)
    : base * Math.exp(Math.max(-6, Math.min(8, exponent)));
  // The historical regression was trained on capped timings and can badly
  // underestimate 4 ply (live 4-1: ~0.8 s at 3 ply, ~13.5 s at 4). At that
  // optional stage use both its upper residual and observed per-candidate
  // growth. Keep the 2→3 policy unchanged; never skip the 2-ply minimum.
  const observedGrowthMs = Math.max(.25, current.stageMs) * count / current.candidates.length *
    Math.max(1, (Math.max(.25,current.stageMs)/current.candidates.length) /
      (Math.max(.25,previous.stageMs)/previous.candidates.length));
  const estimateMs = depth === 3
    ? Math.max(modelEstimateMs * Math.exp(model.residualP90), observedGrowthMs)
    : modelEstimateMs;
  return {
    nextPlies: depth + 1, candidates: count, estimateMs,
    modelEstimateMs, ...(depth === 3 ? { observedGrowthMs, safety: 'four-ply-upper-growth' } : {}),
    // Empirical residual spread, not a calibrated confidence interval and not
    // a promise across browsers/devices. Users can cancel an underestimated job.
    lowMs: modelEstimateMs * Math.exp(model.residualP10),
    highMs: Math.max(estimateMs, modelEstimateMs * Math.exp(model.residualP90)),
    model: SEARCH_MODEL.version,
  };
}

export function chooseSearchDecision(state, evaluations, submitted = null) {
  const current = evaluations.at(-1), previous = evaluations.at(-2);
  if (!['checker', 'cube'].includes(current?.type) || ![2, 3].includes(current.settings.plies))
    return { reason: 'searching', lead: null, forecast: null };
  // Cube 0–3 ply can be almost entirely warm from the previous checker search,
  // while 4 ply still takes several seconds. That ratio is not a safe forecast.
  // Auto caps cube decisions at 3; explicit Fixed 4 remains available.
  if (current.type === 'cube' && current.settings.plies >= SEARCH_LIMITS.maximumCubePlies)
    return { reason: 'cube-depth-limit', lead: null, forecast: null };
  const lead = leadInfo(current, previous), forecast = forecastNext(state, evaluations);
  // Match equity and actual-move grading need more than a stable top ranking.
  // Cubeful money gets a larger margin than the historical cubeless sample.
  const margin = state.rules?.cube ? SEARCH_MODEL.policy.moneyGap : SEARCH_MODEL.policy.cubelessGap;
  if (!submitted && !state.matchLength && lead?.stable && lead.gap >= margin &&
      lead.previousGap >= .02 && forecast?.estimateMs >= 50)
    return { reason: 'clear-lead', lead, forecast };
  // Five seconds is an estimate for the NEXT stage, not a total-time deadline.
  // Completing the minimum depth never consumes the allowance for trying 3 ply.
  if (forecast && forecast.estimateMs > SEARCH_LIMITS.maxNextStageMs)
    return { reason: 'predicted-cost', lead, forecast };
  return { reason: 'searching', lead, forecast };
}
