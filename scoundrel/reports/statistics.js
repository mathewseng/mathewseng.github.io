(function (root) {
  "use strict";
  const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  function median(xs) { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function summarize(rows) {
    const lower = rows.map((r) => r.score), upper = rows.map((r) => r.upper);
    const average = mean(lower), n = rows.length;
    const variance = n > 1 ? lower.reduce((sum, x) => sum + (x - average) ** 2, 0) / (n - 1) : 0;
    return { n, mean: average, meanUpper: mean(upper), median: median(lower), medianUpper: median(upper), wins: lower.filter((x) => x > 0).length, possibleWins: upper.filter((x) => x > 0).length, exact: rows.filter((r) => r.exact).length, min: n ? Math.min(...lower) : null, max: n ? Math.max(...lower) : null, sd: Math.sqrt(variance), se: n ? Math.sqrt(variance / n) : null };
  }
  const api = { mean, median, summarize };
  root.ScoundrelStatistics = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
