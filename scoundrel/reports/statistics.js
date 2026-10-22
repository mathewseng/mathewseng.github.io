(function (root) {
  "use strict";
  const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  // Linear interpolation between adjacent order statistics (R-7 percentiles).
  function percentile(sorted, p) { if (!sorted.length) return null; const position = (sorted.length - 1) * p, low = Math.floor(position); return sorted[low] + (position - low) * (sorted[Math.min(low + 1, sorted.length - 1)] - sorted[low]); }
  function quantile(xs, p) { if (!Number.isFinite(p) || p < 0 || p > 1) throw Error("Quantile must be between 0 and 1"); return percentile(xs.slice().sort((a, b) => a - b), p); }
  const median = xs => quantile(xs, .5);
  function summarize(rows) {
    const scores = rows.map(r => r.score).sort((a, b) => a - b), average = mean(scores), n = rows.length;
    const variance = n > 1 ? scores.reduce((sum, x) => sum + (x - average) ** 2, 0) / (n - 1) : 0;
    return { n, sum: scores.reduce((a, b) => a + b, 0), mean: average, median: percentile(scores, .5), q1: percentile(scores, .25), q3: percentile(scores, .75), wins: scores.filter(x => x > 0).length, verified: rows.filter(r => r.verified).length, min: n ? scores[0] : null, max: n ? scores[n - 1] : null, sd: Math.sqrt(variance) };
  }
  function validate(study) {
    if (study.version !== 3 || study.study !== "scoundrel-hidden-deck-v1" || study.policy?.exact !== false || study.rules !== "strict-weapon-chain-bidirectional-avoidance" || study.requestedDeals !== 1000 || study.rows?.length !== 1000) throw Error("The complete 1,000-deal study is unavailable");
    const seen = new Set();
    for (const row of study.rows) {
      if (!Number.isInteger(row.index) || row.index < 0 || row.index >= 1000 || seen.has(row.index) || row.seed !== study.seedPrefix + String(row.index).padStart(4, "0") || !Number.isInteger(row.score) || row.score > 30 || row.verified !== true || row.survived !== (row.score > 0) || !row.line?.length) throw Error("Study contains an invalid or incomplete outcome");
      seen.add(row.index);
    }
    return study;
  }
  const api = { mean, median, quantile, summarize, validate };
  root.ScoundrelStatistics = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
