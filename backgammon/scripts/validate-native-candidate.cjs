// SPDX-License-Identifier: GPL-3.0-or-later
// Run production worker/context/rollout tests against a research executable.
// The assembled site and deployed binaries are never modified.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const browsers = require('playwright');
const { launchQuietBrowser } = require('../../scripts/quiet-browser.cjs');
const native = require('../tests/native-backends.cjs');
const contexts = require('../tests/engine-cache-context.cjs');
const loading = require('../tests/backend-loading.cjs');
const root = path.resolve('_site');
if (!process.env.BG_CANDIDATE) throw Error('Set BG_CANDIDATE to the candidate dist_simd directory.');
const candidate = path.resolve(process.env.BG_CANDIDATE);
const output = process.env.BG_OUTPUT || 'backgammon/test-results/native-candidate-validation.json';
const names = (process.env.BG_BROWSERS || 'chromium,firefox,webkit').split(',');
if (names.some(name => !['chromium', 'firefox', 'webkit'].includes(name))) throw Error('Unknown browser.');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const report = {
  schema: 1, experimental: true, startedAt: new Date().toISOString(),
  method: 'Assembled application worker with candidate SIMD loader/WASM substituted by a local HTTP fixture; unchanged scalar executable is the numerical baseline. Opening book disabled for native comparisons. Includes warm/fresh cache contexts, arbitrary grades, seeded rollout/resume and real HTTP loading failures.',
  hashes: {}, results: [],
};
for (const extension of ['js', 'wasm']) {
  report.hashes['candidate.' + extension] = sha(fs.readFileSync(path.join(candidate, 'gnubg-core-module.' + extension)));
  report.hashes['scalar.' + extension] = sha(fs.readFileSync(path.join(root, 'backgammon/engine/vendor/gnubg-core-module.' + extension)));
}
const data = fs.readFileSync(path.join(root, 'backgammon/engine/vendor/gnubg-core-module.data'));
if (!data.equals(fs.readFileSync(path.join(candidate, 'gnubg-core-module.data')))) throw Error('Candidate data package differs.');
report.hashes.data = sha(data);
for (const file of ['engine/evaluate.mjs', 'engine/worker.mjs', 'engine/client.mjs', 'engine/metadata.mjs'])
  report.hashes[file] = sha(fs.readFileSync(path.join(root, 'backgammon', file)));
const save = () => {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
};
const server = http.createServer((req, res) => {
  let url = new URL(req.url, 'http://localhost').pathname;
  if (url.endsWith('/')) url += 'index.html';
  const match = /^\/backgammon\/engine\/vendor\/simd\/(gnubg-core-module\.(?:js|wasm))$/.exec(url);
  const file = match ? path.join(candidate, match[1]) : path.resolve(root, '.' + url);
  if (!match && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, bytes) => {
    res.writeHead(error ? 404 : 200, {
      'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' })[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(error ? 'Not found' : bytes);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const name of names) {
      const browser = await launchQuietBrowser(browsers[name]);
      try {
        const result = { browser: name, version: browser.version() };
        result.native = await native(browser, base, { corpus: name === 'chromium' && process.env.BG_CORPUS !== '0' });
        result.contexts = await contexts(browser, base);
        result.loading = await loading(browser, base);
        report.results.push(result); save();
        console.log(name, result.native.rows.length, 'numeric comparisons, cache contexts and loading passed');
      } finally { await browser.close(); }
    }
    report.finishedAt = new Date().toISOString(); save();
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { report.error = error.stack; save(); console.error(error); process.exitCode = 1; });
