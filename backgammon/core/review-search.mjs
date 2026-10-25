// SPDX-License-Identifier: GPL-3.0-or-later
// Wall time from imported/cached books does not measure this device's search.
export function reviewDepthEstimate(result, target, calibration = null) {
  // A deliberately rough cold-start prior, not a measured device benchmark.
  // Book/cache retrieval times must never turn multi-ply work into a 1 ms ETA.
  const fallback = () => calibration ? reviewDepthEstimate(calibration, target) :
    {ms:1500 * 8 ** Math.max(0, target-2), rough:true, source:'prior'};
  const forecast = result?.budget?.forecast;
  if (forecast?.nextPlies === target && Number.isFinite(forecast.estimateMs) && forecast.estimateMs > 0)
    return {ms:forecast.estimateMs, rough:true, source:'measured'};
  if (!result || result.cached || result.book || ['reference','rollout','book'].includes(result.method)) return fallback();
  const levels = result.budget?.levels?.filter(l=>Number.isFinite(l.elapsedMs)&&l.elapsedMs>0) || [];
  const current = levels.at(-1) || {plies:result.settings?.plies,elapsedMs:result.stageMs || result.elapsedMs};
  if (!Number.isFinite(current.elapsedMs) || !(current.elapsedMs > 0) || !Number.isFinite(current.plies)) return fallback();
  const previous = levels.at(-2);
  // A rough extrapolation, explicitly labelled. Cap pathological cache ratios;
  // fourth-ply timings, when available, use the fitted forecast above instead.
  const growth = previous ? Math.max(2,Math.min(30,current.elapsedMs/previous.elapsedMs)) : 8;
  return {ms:Math.max(100,current.elapsedMs)*growth**Math.max(0,target-current.plies),rough:true, source:'measured'};
}
export function reviewTime(ms) {
  if (!Number.isFinite(ms)) return 'Estimate unavailable';
  if (ms < 1000) return '<1 s';
  if (ms < 60000) return `${Math.ceil(ms/1000)} s`;
  if (ms < 3600000) return `${Math.ceil(ms/60000)} min`;
  return `${(ms/3600000).toFixed(1)} h`;
}
