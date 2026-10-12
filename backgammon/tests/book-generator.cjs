// Real pinned generator worker, independent of the currently deployed engine.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { launchQuietBrowser } = require('../../scripts/quiet-browser.cjs');
const { resolveBookInputs, recipe } = require('../scripts/book-inputs.cjs');
const worker = require('../scripts/book-evaluator.cjs');
const root = resolveBookInputs(), book = path.resolve('backgammon/engine/opening-book-data');
const read = file => JSON.parse(fs.readFileSync(path.join(book, file)));
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost').pathname;
  if (url === '/') { res.end('<!doctype html><title>Pinned generator regression</title>'); return; }
  if (url === '/book-worker.mjs') { res.setHeader('Content-Type', 'text/javascript'); res.end(worker); return; }
  const file = path.resolve(root, '.' + url);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, bytes) => {
    res.writeHead(error ? 404 : 200, { 'Content-Type': file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript' });
    res.end(error ? 'Not found' : bytes);
  });
});
(async () => {
  const { initialState, boardKey, commitTurn } = await import('../core/rules.mjs');
  const { stateForBoard } = await import('../scripts/book-branches.mjs');
  const index = read('index.json'), reply = Object.entries(index.replies)[0];
  const third = Object.entries(index.continuations).find(([, ref]) => ref.turn === 3);
  const cases = [
    { stage: 'opening', state: initialState({ phase: 'move', dice: [3, 1], matchLength: 0, rules: { jacoby: true } }), entry: index.openings['31'], opening: true },
    ...[reply, third].map(([board, ref], i) => ({ stage: i ? 'third-turn' : 'reply', state: stateForBoard(board, [3, 1]), entry: read(ref.file).rolls['31'], opening: false })),
  ];
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await launchQuietBrowser(chromium);
    const page = await browser.newPage({ serviceWorkers: 'block' });
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.evaluate(() => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Pinned worker initialization timeout')), 30000);
      window.bookWorker = new Worker('/book-worker.mjs', { type: 'module' });
      bookWorker.onmessage = ({ data }) => { clearTimeout(timeout); data.ready ? resolve() : reject(Error(data.error)); };
      bookWorker.onerror = event => { clearTimeout(timeout); reject(Error(event.message)); };
    }));
    const rows = [];
    for (const { state, entry, opening, stage } of cases) {
      const actual = await page.evaluate(payload => new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(Error('Pinned worker evaluation timeout')), 120000);
        bookWorker.onmessage = ({ data }) => { clearTimeout(timeout); data.error ? reject(Error(data.error)) : resolve(data); };
        bookWorker.postMessage(payload);
      }), { state, opening });
      assert.equal(actual.total, entry.total);
      assert.equal(actual.rows.length, entry.rows.length);
      let maxDifference = 0;
      for (let i = 0; i < actual.rows.length; i++) {
        const move = actual.rows[i], expected = entry.rows[i];
        const steps = expected[0].map(([from, to, die]) => ({ from, to, die }));
        assert.equal(boardKey(commitTurn(state, move.steps)), boardKey(commitTurn(state, steps)));
        [move.equity, move.cubeless, ...move.probabilities].forEach((value, j) => {
          assert.ok(Number.isFinite(value));
          maxDifference = Math.max(maxDifference, Math.abs(value - expected[j + 1]));
        });
      }
      assert.ok(maxDifference <= 0.00001, 'Pinned generator numerical mismatch');
      rows.push({ stage, candidates: actual.rows.length, maxDifference });
    }
    console.log(JSON.stringify({ engine: recipe.engine, browser: browser.version(), rows }));
  } finally {
    await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
