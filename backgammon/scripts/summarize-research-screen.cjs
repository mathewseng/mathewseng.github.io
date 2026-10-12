// Preserve timings and all high-depth comparisons without repeating the large
// lower-depth excluded lists from each diagnostic worker response.
const fs = require('node:fs'), crypto = require('node:crypto');
const files = process.argv.slice(2);
if (!files.length) throw Error('Pass completed research-screen-study JSON files');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const median = values => {
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
};
function result(r) {
  if (!r) return null;
  return { engine: r.engine, settings: r.settings, perspective: r.perspective, units: r.units,
    candidates: r.candidates, actual: r.actual, error: r.error,
    screening: r.screening && { ...r.screening, excluded: undefined,
      excludedCount: r.screening.excluded?.length,
      initial: r.screening.initial && { ...r.screening.initial, excluded: undefined,
        excludedCount: r.screening.initial.excluded?.length } } };
}
function arm(value) { return { ...value, answer: result(value.answer), previous: result(value.previous) }; }
const runs = files.map(file => {
  const bytes = fs.readFileSync(file), source = JSON.parse(bytes);
  if (!source.finishedAt || source.error) throw Error('Incomplete report: ' + file);
  return { ...source, sourceFile: file, sourceSha256: sha(bytes), rows: source.rows.map(row =>
    ({ ...row, baseline: arm(row.baseline), candidate: arm(row.candidate) })) };
});
const summaries = runs.flatMap(run => {
  const groups = new Map();
  for (const row of run.rows) {
    const key = row.id + '/' + row.mode;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].map(rows => ({ sourceFile: run.sourceFile, browser: run.browser,
    id: rows[0].id, mode: rows[0].mode, samples: rows.length,
    baselineMs: median(rows.map(r => r.baseline.researchMs)),
    candidateMs: median(rows.map(r => r.candidate.researchMs)),
    baselineRangeMs: [Math.min(...rows.map(r => r.baseline.researchMs)), Math.max(...rows.map(r => r.baseline.researchMs))],
    candidateRangeMs: [Math.min(...rows.map(r => r.candidate.researchMs)), Math.max(...rows.map(r => r.candidate.researchMs))],
    changed: rows.filter(r => r.changed).length, added: rows.map(r => r.added),
    maxDifference: Math.max(...rows.map(r => r.maxDifference)),
    fourPlyGains: rows.map(r => r.fourPlyGain), candidateNativeCalls: rows.map(r => r.candidate.calls) }));
});
const report = { schema: 1, recordedAt: new Date().toISOString(),
  method: 'Compact paired reports. All high-depth scores, submitted moves, input positions, hashes and raw timings retained. Lower-depth excluded rows are represented by counts; regenerate full reports with research-screen-study.cjs. Small selected diagnostic corpus; no population-frequency, phone-speed or independent playing-strength claim.',
  pairs: runs.reduce((n, r) => n + r.rows.length, 0), runs, summaries };
fs.writeFileSync('backgammon/docs/research-screen-results.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ pairs: report.pairs, runs: runs.length, summaries: summaries.length }));
