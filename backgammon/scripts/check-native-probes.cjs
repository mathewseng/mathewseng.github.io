// SPDX-License-Identifier: GPL-3.0-or-later
// Differential tests of complete native move lists and neural outputs.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { launchQuietBrowser } = require('../../scripts/quiet-browser.cjs');
const root = process.cwd();
if (!process.env.BG_BASELINE || !process.env.BG_CANDIDATE) throw Error('Set both instrumented build directories.');
const dirs = { baseline: path.resolve(process.env.BG_BASELINE), candidate: path.resolve(process.env.BG_CANDIDATE) };
const output = process.env.BG_OUTPUT || 'backgammon/test-results/native-probes.json';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const report = { schema: 1, experimental: true, startedAt: new Date().toISOString(), hashes: {}, boards: [] };
for (const [name, dir] of Object.entries(dirs)) for (const ext of ['js', 'wasm', 'data'])
  report.hashes[name + '.' + ext] = sha(fs.readFileSync(path.join(dir, 'gnubg-core-module.' + ext)));
const save = () => { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost').pathname;
  if (url === '/') { res.end('<!doctype html><title>Native differential tests</title>'); return; }
  const match = /^\/probe\/(baseline|candidate)\/(gnubg-core-module\.(?:js|wasm|data))$/.exec(url);
  const file = match ? path.join(dirs[match[1]], match[2]) : path.resolve(root, '.' + url);
  if (!match && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, bytes) => {
    res.writeHead(error ? 404 : 200, { 'Content-Type': ({ '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' })[path.extname(file)] || 'application/octet-stream' });
    res.end(error ? 'Not found' : bytes);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await launchQuietBrowser(chromium); report.browser = browser.version();
    const page = await browser.newPage({ serviceWorkers: 'block' });
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.evaluate(async () => {
      window.probes = {};
      for (const name of ['baseline', 'candidate']) {
        const { default: create } = await import('/probe/' + name + '/gnubg-core-module.js');
        const module = await create({ locateFile: file => '/probe/' + name + '/' + file, print: () => {}, printErr: () => {} });
        if (module.cwrap('init', 'number', [])() !== 0) throw Error('Probe initialization failed');
        const call = (fn, args) => {
          const ptr = fn(...args);
          if (!ptr) throw Error('Probe returned no data');
          try { const value = JSON.parse(module.UTF8ToString(ptr)); if (value.error) throw Error(value.error); return value; }
          finally { module._free(ptr); }
        };
        const moves = module.cwrap('bg_probe_moves', 'number', ['string', 'number']);
        const network = module.cwrap('bg_probe_network', 'number', ['number', 'number', 'number']);
        probes[name] = {
          moves: (...args) => call(moves, args), network: (...args) => call(network, args),
          epoch: module.cwrap('bg_probe_epoch', null, ['number']),
          collisions: module.cwrap('bg_probe_collisions', 'number', []),
        };
      }
    });
    report.networks = await page.evaluate(() => {
      const rows = [];
      for (let net = 0; net < 6; net++) for (let seed = 1; seed <= 16; seed++) {
        const a = probes.baseline.network(net, seed * 77123, 64), b = probes.candidate.network(net, seed * 77123, 64);
        if (JSON.stringify(a) !== JSON.stringify(b)) throw Error('Neural output differs: net ' + net + ', seed ' + seed);
        rows.push({ net, seed: seed * 77123, steps: a.rows.length, inputs: a.inputs, hidden: a.hidden, maxDifference: 0 });
      }
      return rows;
    });
    console.log('All six networks passed full/incremental differential tests'); save();
    const fixtures = JSON.parse(fs.readFileSync('backgammon/data/exercises.json')).items;
    const corpus = JSON.parse(fs.readFileSync('backgammon/data/accuracy-reference.json')).items;
    for (const [index, item] of [...fixtures, ...corpus].entries()) {
      const row = await page.evaluate(async ({ state, index }) => {
        const { toXGID } = await import('/backgammon/core/xgid.mjs');
        let positions = 0, moves = 0, largest = 0;
        for (let a = 1; a <= 6; a++) for (let b = 1; b <= a; b++) for (const partial of [0, 1]) {
          const xgid = toXGID({ ...state, phase: 'move', dice: [a, b], pending: null }, { engine: true });
          const expected = probes.baseline.moves(xgid, partial);
          // Exercise wraparound with an already populated index, repeatedly.
          if ((index + a + b + partial) % 17 === 0) probes.candidate.epoch(-1);
          const actual = probes.candidate.moves(xgid, partial);
          if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error(`Move order/path mismatch at ${index}, ${a}${b}, partial=${partial}`);
          positions++; moves += actual.moves.length; largest = Math.max(largest, actual.moves.length);
        }
        return { index, positions, moves, largest, collisions: probes.candidate.collisions() };
      }, { state: item.state, index });
      report.boards.push({ ...row, state: item.state });
      if (index % 25 === 0) { console.log(index + 1, 'boards passed'); save(); }
    }
    if (!report.boards.at(-1).collisions) throw Error('Hash-collision paths were not exercised');
    report.finishedAt = new Date().toISOString(); save();
    console.log(JSON.stringify({ boards: report.boards.length, positions: report.boards.reduce((n, r) => n + r.positions, 0), moves: report.boards.reduce((n, r) => n + r.moves, 0), collisions: report.boards.at(-1).collisions }));
  } finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { report.error = error.stack; save(); console.error(error); process.exitCode = 1; });
