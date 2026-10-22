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
  function studyRows(study) {
    return study.version === 3 ? study.rows : study.scores.map((score, index) => ({ index, seed: study.seedPrefix + String(index).padStart(4, "0"), score, survived: score > 0, verified: true }));
  }
  function validate(study) {
    if (![3, 4].includes(study.version) || study.study !== "scoundrel-hidden-deck-v1" || study.policy?.exact !== false || !/^[a-f0-9]{64}$/.test(study.policy?.revision) || !Number.isInteger(study.policy.iterations) || study.policy.iterations < 16 || study.rules !== "strict-weapon-chain-bidirectional-avoidance" || !Number.isInteger(study.requestedDeals) || study.requestedDeals < 1 || typeof study.seedPrefix !== "string") throw Error("The hidden-deck study is unavailable");
    if (study.version === 4) {
      const h = study.histories, n = study.completedDeals;
      if (!Number.isInteger(n) || n < 1 || n > study.requestedDeals || study.verifiedDeals !== n || study.scores?.length !== n || !study.scores.every(x => Number.isInteger(x) && x <= 30 && x >= -208) || h?.format !== "actions-u8-base64-v1" || h.chunkSize !== 1000 || !/^histories\/[a-f0-9]{16}-[0-9]+$/.test(h.directory) || h.sha256?.length !== Math.ceil(n / h.chunkSize) || !h.sha256.every(x => /^[a-f0-9]{64}$/.test(x))) throw Error("Study contains an invalid or incomplete outcome");
    } else {
      if (study.rows?.length !== study.requestedDeals) throw Error("The complete study is unavailable");
      const seen = new Set();
      for (const row of study.rows) {
        if (!Number.isInteger(row.index) || row.index < 0 || row.index >= study.requestedDeals || seen.has(row.index) || row.seed !== study.seedPrefix + String(row.index).padStart(4, "0") || !Number.isInteger(row.score) || row.score > 30 || row.verified !== true || row.survived !== (row.score > 0) || !row.line?.length) throw Error("Study contains an invalid or incomplete outcome");
        seen.add(row.index);
      }
    }
    return study;
  }
  const api = { mean, median, quantile, summarize, validate, studyRows };
  root.ScoundrelStatistics = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
