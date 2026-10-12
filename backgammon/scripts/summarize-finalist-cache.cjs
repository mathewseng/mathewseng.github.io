// Keep every input, score and timing while sharing identical answer payloads.
const fs = require('node:fs'), crypto = require('node:crypto');
const files = process.argv.slice(2);
if (!files.length) throw Error('Pass completed finalist-cache-study JSON reports');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const answers = {};
function arm(value) {
  return { ...value, rows: value.rows.map(({ result, ...row }) => {
    const answerId = sha(JSON.stringify(result));
    answers[answerId] = result;
    return { ...row, answerId };
  }) };
}
const stats = values => {
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  return { n, median: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    range: [sorted[0], sorted.at(-1)] };
};
const runs = files.map(file => {
  const bytes = fs.readFileSync(file), report = JSON.parse(bytes);
  if (!report.finishedAt || report.error || !report.rows.length) throw Error('Incomplete report: ' + file);
  return { ...report, sourceFile: file, sourceSha256: sha(bytes), rows: report.rows.map(row =>
    ({ ...row, baseline: arm(row.baseline), candidate: arm(row.candidate) })) };
});
const summaries = runs.flatMap(run => {
  const groups = new Map();
  for (const row of run.rows) {
    const key = row.id + '/' + row.preset;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].map(rows => ({ sourceFile: run.sourceFile, browser: run.browser,
    id: rows[0].id, preset: rows[0].preset, samples: rows.length,
    maxDifference: Math.max(...rows.map(r => r.maxDifference)),
    stages: rows[0].baseline.rows.map((r, i) => ({ label: r.label,
      baselineMs: stats(rows.map(pair => pair.baseline.rows[i].elapsedMs)),
      candidateMs: stats(rows.map(pair => pair.candidate.rows[i].elapsedMs)),
      baselineCalls: rows.map(pair => pair.baseline.rows[i].calls),
      candidateCalls: rows.map(pair => pair.candidate.rows[i].calls) })) }));
});
const report = { schema: 1, recordedAt: new Date().toISOString(),
  method: 'Lossless shared answers, keyed by SHA-256 of the original JSON payload. Each stage references answerId. All settings, high-depth scores, excluded keys, input positions, hashes, native call counts and raw timings retained. Diagnostic cases, not random sampling, a phone benchmark, or an independent strength test.',
  pairs: runs.reduce((n, run) => n + run.rows.length, 0), runs, summaries, answers };
fs.writeFileSync('backgammon/docs/finalist-cache-results.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ pairs: report.pairs, answers: Object.keys(answers).length, summaries }));
