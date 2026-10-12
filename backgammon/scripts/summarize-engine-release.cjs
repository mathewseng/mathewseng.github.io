// SPDX-License-Identifier: GPL-3.0-or-later
// Keep release evidence separate from historical experimental reports.
const fs = require('node:fs'), crypto = require('node:crypto');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (name, completed = true) => {
  const file = 'backgammon/test-results/bg6/' + name + '.json';
  const bytes = fs.readFileSync(file), value = JSON.parse(bytes);
  if (value.error || (completed && !value.finishedAt)) throw Error('Incomplete release check: ' + name);
  return { value, rawFile: file, rawSHA256: sha(bytes) };
};
const median = values => {
  const sorted = [...values].sort((a, b) => a - b), i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
};
const compact = ({ answer, ...timing }) => {
  const values = (answer.candidates || [answer]).map(c => ({ key: c.key, action: c.action,
    equity: c.equity, cubeless: c.cubeless, mwc: c.mwc, probabilities: c.probabilities,
    outcomes: c.outcomes, outcomesMWC: c.outcomesMWC }));
  return { ...timing, candidates: values.length, best: values[0].key || values[0].action,
    equity: values[0].equity, numericalSHA256: sha(JSON.stringify(values)) };
};
const comparisons = ['chromium', 'webkit', 'corpus'].map(name => {
  const { value: { rows, ...metadata }, ...raw } = read(name);
  const groups = new Map();
  for (const row of rows) {
    const key = row.id + '/' + row.preset;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return { name, ...raw, ...metadata,
    timingInterpretation: name === 'corpus' ? 'Functional comparison only; one observation, concurrent checks.' : 'Five alternating pairs per case; other applications remained active. No p95 or phone claim.',
    summaries: [...groups].map(([key, group]) => ({ key, pairs: group.length,
      baselineMedianMs: median(group.map(r => r.baseline.computeMs)),
      candidateMedianMs: median(group.map(r => r.candidate.computeMs)),
      pairedMedianSavingPercent: median(group.map(r => 100 * (1 - r.candidate.computeMs / r.baseline.computeMs))),
      maxDifference: Math.max(...group.map(r => r.maxDifference)) })),
    rows: rows.map(row => ({ ...row, baseline: compact(row.baseline), candidate: compact(row.candidate) })) };
});
const { value: probes, ...probeRaw } = read('probes');
const { value: validation, ...validationRaw } = read('release-validation');
const { value: reproducibility, ...rebuildRaw } = read('reproducibility', false);
const { value: fixtures, ...fixtureRaw } = read('fixture-parity', false);
const { value: book, ...bookRaw } = read('book-browser/report', false);
if (book.browsers.length !== 3 || book.browsers.some(b => b.n !== 28659)) throw Error('Incomplete book browser checks');
if (reproducibility.length !== 7 || reproducibility.some(x => !x.identical)) throw Error('Rebuild mismatch');
if (validation.results.length !== 3 || probes.lifecycle?.length !== 4) throw Error('Incomplete native gates');
const resume = JSON.parse(fs.readFileSync('backgammon/test-results/bg6/book-resume.log', 'utf8').trim()).plan;
if (resume.missing || resume.reused !== 27930) throw Error('Book resume lost work');
const generator = JSON.parse(fs.readFileSync('backgammon/test-results/bg6/book-generator.log', 'utf8').trim());
if (generator.rows.length !== 3 || generator.rows.some(r => r.maxDifference > 0.00001)) throw Error('Pinned generator failed');
const testLog = fs.readFileSync('backgammon/test-results/bg6/unit-tests.log', 'utf8');
if (!/^# fail 0$/m.test(testLog)) throw Error('Unit suite failed or incomplete');
const applicationFile = 'backgammon/test-results/browser-report-chromium.json';
const applicationBytes = fs.readFileSync(applicationFile), application = JSON.parse(applicationBytes);
if (!application.assembled || !application.engine?.version.endsWith('+bg6') || !application.updatesUX)
  throw Error('Application checks missing or for an older engine');
const report = { schema: 1, recordedAt: new Date().toISOString(),
  engine: 'gnubg-core/955555c69adebb1d7de23abc1018074158621168+bg6',
  baseline: 'gnubg-core/955555c69adebb1d7de23abc1018074158621168+bg5',
  limitations: [
    'Implementation parity and speed tests, not evidence of increased playing strength or exhaustive correctness.',
    'Desktop Apple M4 Pro; phone-sized screenshots are emulation. No physical iPhone latency measurements.',
    'Weights, search depth, screening and rollout policy are unchanged. Auto timing forecasts remain estimates.',
    'The common comparison harness labels both native arms with current JS metadata; executable hashes identify the bg5 baseline. Historical book results retain their genuine bg5 provenance.',
    'Historical benchmark reports remain historical. This report describes the actual bg6 release binaries.',
  ],
  source: { file: 'backgammon/engine/source/gnubg-core-955555c-bg6.tar.gz',
    sha256: sha(fs.readFileSync('backgammon/engine/source/gnubg-core-955555c-bg6.tar.gz')) },
  comparisons, reproducibility: { ...rebuildRaw, results: reproducibility },
  nativeProbes: { ...probeRaw, ...probes, summary: {
    networkEvaluations: probes.networks.reduce((n, r) => n + r.steps, 0),
    moveCases: probes.boards.reduce((n, r) => n + r.positions, 0),
    moveEntries: probes.boards.reduce((n, r) => n + r.moves, 0),
    hashCollisions: probes.boards.at(-1).collisions,
    lifecycleLoads: probes.lifecycle.reduce((n, r) => n + r.loaded, 0) } },
  workerValidation: { ...validationRaw, ...validation },
  fixtures: { ...fixtureRaw, ...fixtures },
  unitTests: { passed: Number(/^# pass (\d+)$/m.exec(testLog)?.[1]), failed: 0, logSHA256: sha(testLog) },
  application: { rawFile: applicationFile, rawSHA256: sha(applicationBytes), browsers: application.browsers,
    assembled: true, engine: application.engine, suites: Object.keys(application).filter(key => !['base', 'browsers', 'assembled', 'engine', 'screenshots'].includes(key)),
    screenshots: application.screenshots },
  book: { ...bookRaw, ...book, timingInterpretation: 'Functional checks concurrent with other release checks; lookup timings are observations under that load, not an isolated benchmark.',
    browsers: book.browsers.map(({ samples, ...browser }) => browser), resume, generator },
};
fs.writeFileSync('backgammon/docs/bg6-release.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ pairs: comparisons.reduce((n, r) => n + r.rows.length, 0),
  native: report.nativeProbes.summary, browsers: validation.results.map(r => r.browser), book: resume }));
