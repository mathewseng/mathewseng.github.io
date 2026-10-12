// SPDX-License-Identifier: GPL-3.0-or-later
// Retain every paired timing and a digest of the complete numerical outputs.
// Incomplete experiments are rejected, never reported as successful tests.
const fs = require('node:fs'), crypto = require('node:crypto');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => {
  const bytes = fs.readFileSync('backgammon/test-results/' + file), value = JSON.parse(bytes);
  if (!value.finishedAt || value.error) throw Error('Incomplete experiment: ' + file);
  return { value, rawFile: 'backgammon/test-results/' + file, rawSHA256: sha(bytes) };
};
const median = values => {
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const compact = ({ answer, ...timing }) => {
  const values = (answer.candidates || [answer]).map(c => ({ key: c.key, action: c.action,
    equity: c.equity, cubeless: c.cubeless, mwc: c.mwc, probabilities: c.probabilities,
    outcomes: c.outcomes, outcomesMWC: c.outcomesMWC }));
  return { ...timing, candidates: values.length, best: values[0].key || values[0].action,
    equity: values[0].equity, numericalSHA256: sha(JSON.stringify(values)) };
};
const sources = [
  ['output', 'output-pilot/steady-chromium.json'],
  ['hidden-block', 'hidden-block-pilot/chromium.json'],
  ['prune-state', 'prune-state-pilot/local-chromium.json'],
  ['combined', 'combined-pilot/chromium.json'],
  ['combined', 'combined-pilot/webkit.json'],
  ['combined', 'combined-pilot/firefox.json'],
  ['combined-repeat', 'combined-pilot/chromium-repeat.json'],
];
const experiments = sources.map(([variant, file]) => {
  const { value, ...raw } = read(file), { rows, ...metadata } = value;
  const groups = new Map();
  for (const row of rows) {
    const key = row.id + '/' + row.preset;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return { variant, ...raw, ...metadata,
    summaries: [...groups].map(([key, group]) => ({ key, pairs: group.length,
      baselineMedianMs: median(group.map(r => r.baseline.computeMs)),
      candidateMedianMs: median(group.map(r => r.candidate.computeMs)),
      pairedMedianSavingPercent: median(group.map(r => 100 * (1 - r.candidate.computeMs / r.baseline.computeMs))),
      maxDifference: Math.max(...group.map(r => r.maxDifference)) })),
    rows: rows.map(row => ({ ...row, baseline: compact(row.baseline), candidate: compact(row.candidate) })) };
});
const { value: probes, ...probeRaw } = read('combined-pilot/probes.json');
const { value: validation, ...validationRaw } = read('combined-pilot/validation.json');
const report = { schema: 1, recordedAt: new Date().toISOString(), deployed: false,
  limitations: [
    'Research candidates only. The deployed engine and all opening-book numerical provenance remain bg5.',
    'Desktop Apple M4 Pro, not physical iPhone measurements. Background applications remained active; paired order alternated, but load and browser compilation can still affect timings.',
    'Five to ten repetitions per combined timing group: report medians and individual observations, not a stable p95 estimate. Tiny bearoff cases are sensitive to timer resolution.',
    'Direct network probes test full and incremental execution against the same execution modes in the baseline; they do not assert that incremental arithmetic equals full arithmetic.',
    'Correctness comparisons exercise many cases but are not a proof for every possible position. Allocation failure and a complete source/version release remain promotion gates.',
  ],
  sourceArchive: { file: 'backgammon/engine/source/gnubg-core-955555c-bg5.tar.gz',
    sha256: sha(fs.readFileSync('backgammon/engine/source/gnubg-core-955555c-bg5.tar.gz')) },
  patches: Object.fromEntries(['activation', 'move-index', 'output', 'hidden-block', 'prune-state', 'native-probes']
    .map(name => [name, sha(fs.readFileSync(`backgammon/scripts/patch-${name}${name === 'native-probes' ? '' : '-pilot'}.py`))])),
  harnesses: Object.fromEntries(['build-native-pilot.sh', 'native-probes.c', 'check-native-probes.cjs',
    'native-search-pilot.cjs', 'validate-native-candidate.cjs', 'summarize-native-followup.cjs']
    .map(file => [file, sha(fs.readFileSync('backgammon/scripts/' + file))])),
  experiments,
  nativeProbes: { ...probeRaw, ...probes, summary: {
    networkEvaluations: probes.networks.reduce((n, r) => n + r.steps, 0),
    moveCases: probes.boards.reduce((n, r) => n + r.positions, 0),
    moveEntries: probes.boards.reduce((n, r) => n + r.moves, 0),
    hashCollisions: probes.boards.at(-1).collisions } },
  workerValidation: { ...validationRaw, ...validation },
};
fs.writeFileSync('backgammon/docs/native-optimization-followup.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ experiments: experiments.length, pairs: experiments.reduce((n, r) => n + r.rows.length, 0),
  probes: report.nativeProbes.summary, browsers: validation.results.map(r => r.browser) }));
