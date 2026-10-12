// SPDX-License-Identifier: GPL-3.0-or-later
// Real assembled production assets, without executable substitutions.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const browsers = require('playwright');
const { launchQuietBrowser } = require('../../scripts/quiet-browser.cjs');
const native = require('../tests/native-backends.cjs');
const contexts = require('../tests/engine-cache-context.cjs');
const loading = require('../tests/backend-loading.cjs');
const reuse = require('../tests/engine-reuse.cjs');
const root = path.resolve('_site'), output = process.env.BG_OUTPUT || 'backgammon/test-results/engine-release.json';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const files = ['engine/metadata.mjs', 'engine/evaluate.mjs', 'engine/client.mjs', 'engine/worker.mjs',
  'engine/vendor/gnubg-core-module.js', 'engine/vendor/gnubg-core-module.wasm', 'engine/vendor/gnubg-core-module.data',
  'engine/vendor/simd/gnubg-core-module.js', 'engine/vendor/simd/gnubg-core-module.wasm'];
const report = { schema: 1, startedAt: new Date().toISOString(), assembled: true,
  assets: Object.fromEntries(files.map(file => [file, sha(fs.readFileSync(path.join(root, 'backgammon', file)))])), results: [] };
const save = () => { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); };
const server = http.createServer((req, res) => {
  let url = new URL(req.url, 'http://localhost').pathname;
  if (url.endsWith('/')) url += 'index.html';
  const file = path.resolve(root, '.' + url);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, bytes) => {
    res.writeHead(error ? 404 : 200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' })[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(error ? 'Not found' : bytes);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const name of (process.env.BG_BROWSERS || 'chromium,firefox,webkit').split(',')) {
      if (!['chromium', 'firefox', 'webkit'].includes(name)) throw Error('Unknown browser');
      const browser = await launchQuietBrowser(browsers[name]);
      try {
        const result = { browser: name, version: browser.version() };
        console.log(name, 'native comparisons starting');
        result.native = await native(browser, base, { corpus: name === 'chromium' });
        console.log(name, result.native.rows.length, 'native comparisons passed');
        result.contexts = await contexts(browser, base);
        result.loading = await loading(browser, base);
        result.reuse = await reuse(browser, base);
        report.results.push(result); save(); console.log(name, 'all release gates passed');
      } finally { await browser.close(); }
    }
    report.finishedAt = new Date().toISOString(); save();
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { report.error = error.stack; save(); console.error(error); process.exitCode = 1; });
