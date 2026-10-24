// SPDX-License-Identifier: GPL-3.0-or-later
// Wall time from imported/cached books does not measure this device's search.
export function reviewDepthEstimate(result, target) {
  const forecast = result?.budget?.forecast;
  if (forecast?.nextPlies === target && forecast.estimateMs > 0)
    return {ms:forecast.estimateMs, rough:true};
  if (!result || result.cached || result.book || ['reference','rollout','book'].includes(result.method)) return null;
  const levels = result.budget?.levels?.filter(l=>l.elapsedMs>0) || [];
  const current = levels.at(-1) || {plies:result.settings?.plies,elapsedMs:result.stageMs || result.elapsedMs};
  if (!(current.elapsedMs > 0) || !Number.isFinite(current.plies)) return null;
  const previous = levels.at(-2);
  // A rough extrapolation, explicitly labelled. Cap pathological cache ratios;
  // fourth-ply timings, when available, use the fitted forecast above instead.
  const growth = previous ? Math.max(2,Math.min(30,current.elapsedMs/previous.elapsedMs)) : 8;
  return {ms:Math.max(100,current.elapsedMs)*growth**Math.max(0,target-current.plies),rough:true};
}
export function reviewTime(ms) {
  if (!Number.isFinite(ms)) return 'Estimate unavailable';
  if (ms < 1000) return '<1 s';
  if (ms < 60000) return `${Math.ceil(ms/1000)} s`;
  if (ms < 3600000) return `${Math.ceil(ms/60000)} min`;
  return `${(ms/3600000).toFixed(1)} h`;
}
