// SPDX-License-Identifier: GPL-3.0-or-later
// Full third-turn coverage; reuse existing fourth-turn entries without widening
// that separate scope. Uses the historical book's pinned real WASM inputs.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright'), { launchQuietBrowser } = require('../../scripts/quiet-browser.cjs');
const worker = require('./book-evaluator.cjs');
const { BookCheckpoint, boardId, digest, atomicJSON, recoverPublication } = require('./book-checkpoint.cjs');
const { resolveBookInputs, recipe } = require('./book-inputs.cjs');
const root = resolveBookInputs(), out = path.resolve('backgammon/engine/opening-book-data');
const workers = Number(process.env.BG_BOOK_WORKERS || 8);
const stopAfter = Number(process.env.BG_BOOK_STOP_AFTER || Infinity);
if (!Number.isInteger(workers) || workers < 1 || workers > 16) throw Error('BG_BOOK_WORKERS must be an integer from 1 to 16.');
if (stopAfter !== Infinity && (!Number.isInteger(stopAfter) || stopAfter < 1)) throw Error('Invalid BG_BOOK_STOP_AFTER.');
const read = file => JSON.parse(fs.readFileSync(path.join(out, file)));
const compact = r => ({ total: r.total, rows: r.rows.map(c => [c.steps.map(s => [s.from, s.to, s.die]), c.equity, c.cubeless, ...c.probabilities]), elapsedMs: r.elapsedMs });
const allRolls = Array.from({ length: 6 }, (_, i) => Array.from({ length: i + 1 }, (_, j) => `${i + 1}${j + 1}`)).flat();
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost').pathname;
  if (url === '/book-worker.mjs') { res.setHeader('Content-Type', 'text/javascript'); return res.end(worker); }
  if (url === '/') return res.end('<!doctype html><title>Continuation book generation</title>');
  const file = path.resolve(root, '.' + url);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  res.setHeader('Content-Type', ({ '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' })[path.extname(file)] || 'text/html');
  fs.readFile(file, (e, b) => { if (e) res.writeHead(404); res.end(e ? 'Not found' : b); });
});
(async () => {
  const { BOOK_ID, bookResult } = await import('../engine/opening-book.mjs');
  const { nearThirdBranches, stateForBoard, CONTINUATION_POLICY } = await import('./book-branches.mjs');
  recoverPublication(out, path.resolve('backgammon/test-results/book-checkpoints'));
  const index = read('index.json');
  if (index.engine !== recipe.engine || index.plies !== 3 || index.threshold !== .040) throw Error('Rebuild the opening book first.');
  const expectedSettings = { name: 'Opening book', plies: 3, cubeful: true, pruning: true, deterministic: true, noise: 0, replyFilter: { plies: 2, minimum: 10, threshold: .080 } };
  const expectedContext = { matchLength: 0, cube: true, jacoby: true, immediateRedoubles: 0, cubeOwner: null };
  const { isDeepStrictEqual } = require('node:util');
  if (!isDeepStrictEqual(index.settings, expectedSettings) || !isDeepStrictEqual(index.context, expectedContext)) throw Error('Unsupported source book settings or rule context.');
  for (const [file, hash] of Object.entries(index.provenance.assets)) {
    if (digest(fs.readFileSync(path.join(root, 'backgammon', file))) !== hash) throw Error('Native input mismatch: ' + file);
  }
  // Numerical identity is separate from coverage policy and deployment version:
  // adding branches must not discard completed, identically evaluated boards.
  const inputs = { engine: index.engine, settings: index.settings, context: index.context, assets: index.provenance.assets, worker };
  const signature = digest(JSON.stringify(inputs));
  const checkpoint = new BookCheckpoint(path.resolve('backgammon/test-results/book-checkpoints'), signature);
  checkpoint.lock();
  let browser, stopping = false, failed = null, completed = 0, seeded = 0, reused = 0;
  const start = Date.now();
  const stop = () => { stopping = true; console.log('Stopping after in-flight evaluations; checkpoints remain resumable.'); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    const verifiedRead = file => {
      const ref = [...Object.values(index.replies), ...Object.values(index.continuations || {})].find(r => r.file === file);
      const bytes = fs.readFileSync(path.join(out, file));
      if (!ref || digest(bytes) !== ref.sha256) throw Error('Published shard checksum mismatch: ' + file);
      const shard = JSON.parse(bytes);
      if (shard.schema !== 1 || shard.engine !== index.engine || shard.id !== index.id) throw Error('Published shard version mismatch: ' + file);
      return shard;
    };
    const third = nearThirdBranches(index, verifiedRead);
    const thirdKeys = new Set(third.map(b => b.board));
    // Keep these same 32 published positions even after rebuilding the base
    // opening/reply index from scratch (which has no continuation metadata).
    const retained = require('./retained-fourth-boards.json').boards;
    const fourthRefs = Object.entries(index.continuations || {}).filter(([, ref]) => ref.turn === 4);
    const fourth = (fourthRefs.length ? fourthRefs : retained.map(({ board, ...ref }) => [board, ref])).filter(([board]) => !thirdKeys.has(board))
      .map(([board, ref]) => ({ board, state: stateForBoard(board), parent: ref.parent, weight: ref.weight }));
    const branches = [...third.map(b => ({ ...b, turn: 3 })), ...fourth.map(b => ({ ...b, turn: 4 }))];
    const header = { ...index, id: BOOK_ID };
    const validate = (board, roll, entry) => {
      const result = bookResult(stateForBoard(board, [...roll].map(Number)), entry, header, 'auto');
      if (!result || entry.rows.length < Math.min(10, entry.total)) throw Error('Incomplete book shortlist.');
    };
    const jobs = [];
    // Seed from verified published evaluations. Old build timing data is not
    // invented for imports. Each existing board is saved only once here.
    for (const branch of branches) {
      const saved = checkpoint.load(branch.board);
      const ref = index.continuations?.[branch.board] || index.replies?.[branch.board];
      let changed = false;
      if (ref && allRolls.some(roll => !saved[roll])) {
        const shard = verifiedRead(ref.file);
        if (shard.board !== branch.board) throw Error('Published shard board mismatch.');
        for (const roll of allRolls) if (!saved[roll] && shard.rolls[roll]) {
          validate(branch.board, roll, shard.rolls[roll]);
          saved[roll] = { ...shard.rolls[roll], reusedFrom: { book: index.id, sha256: ref.sha256 } };
          seeded++; changed = true;
        }
      }
      if (changed) checkpoint.save(branch.board, saved);
      for (const roll of allRolls) if (saved[roll]) { validate(branch.board, roll, saved[roll]); reused++; }
      const missing = allRolls.filter(roll => !saved[roll]);
      if (missing.length) jobs.push({ branch, missing });
    }
    const missingCount = jobs.reduce((sum, job) => sum + job.missing.length, 0);
    const plan = { signature, thirdBoards: third.length, fourthBoards: fourth.length, decisions: branches.length * 21, reused, seeded, missing: missingCount, workers };
    console.log(JSON.stringify({ plan }));
    if (process.argv.includes('--plan')) return;
    if (jobs.length) {
      await new Promise(r => server.listen(0, '127.0.0.1', r));
      // The generator owns shutdown so Playwright must not close workers before
      // an in-flight result has been checkpointed on Ctrl-C / SIGTERM.
      browser = await launchQuietBrowser(chromium, { handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false });
      const tabs = await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, async () => {
        const tab = await browser.newPage({ serviceWorkers: 'block' });
        await tab.goto(`http://127.0.0.1:${server.address().port}/`);
        await tab.evaluate(() => new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(Error('Book worker initialization timed out.')), 30000);
          window.bookWorker = new Worker('/book-worker.mjs', { type: 'module' });
          bookWorker.onmessage = e => { clearTimeout(timeout); e.data.ready ? resolve() : reject(Error(e.data.error)); };
          bookWorker.onerror = e => { clearTimeout(timeout); reject(Error(e.message)); };
        }));
        return tab;
      }));
      const progress = setInterval(() => console.log(JSON.stringify({ completed, remaining: missingCount - completed, elapsedSeconds: Math.round((Date.now() - start) / 1000), decisionsPerSecond: +(completed / ((Date.now() - start) / 1000)).toFixed(2) })), 30000);
      let cursor = 0;
      try {
        await Promise.all(tabs.map(async tab => {
          try {
            while (!stopping && cursor < jobs.length) {
              const { branch, missing } = jobs[cursor++], saved = checkpoint.load(branch.board);
              for (const roll of missing) {
                if (stopping) break;
                const state = { ...branch.state, dice: [...roll].map(Number) };
                const result = await tab.evaluate(state => new Promise((resolve, reject) => {
                  const timeout = setTimeout(() => { bookWorker.terminate(); reject(Error('Book evaluation timed out; rerun to resume.')); }, 120000);
                  bookWorker.onmessage = ({ data }) => { clearTimeout(timeout); data.error ? reject(Error(data.error)) : resolve(data); };
                  bookWorker.onerror = e => { clearTimeout(timeout); reject(Error(e.message)); }; bookWorker.postMessage({ state, opening: false });
                }), state);
                const entry = compact(result); validate(branch.board, roll, entry);
                saved[roll] = entry; checkpoint.save(branch.board, saved); completed++;
                if (completed >= stopAfter) stopping = true;
              }
            }
          } catch (e) { failed ||= e; stopping = true; }
        }));
      } finally { clearInterval(progress); }
      if (failed) throw failed;
      if (stopping) { console.log(JSON.stringify({ checkpointed: completed, published: false })); return; }
    }
    // Assemble a complete release away from the live directory. Only publish
    // after every planned board and roll has passed validation.
    const stage = path.join(checkpoint.dir, 'publication');
    fs.rmSync(stage, { recursive: true, force: true }); fs.mkdirSync(stage);
    const next = { ...index, id: BOOK_ID, continuations: {} };
    for (const ref of Object.values(next.replies)) {
      const shard = verifiedRead(ref.file); shard.id = BOOK_ID;
      const body = JSON.stringify(shard) + '\n'; fs.writeFileSync(path.join(stage, ref.file), body); ref.sha256 = digest(body);
    }
    for (const branch of branches) {
      const saved = checkpoint.load(branch.board), rolls = {};
      for (const roll of allRolls) {
        validate(branch.board, roll, saved[roll]);
        const { total, rows } = saved[roll]; rolls[roll] = { total, rows };
      }
      const file = `turn-${boardId(branch.board)}.json`;
      const body = JSON.stringify({ schema: 1, id: BOOK_ID, engine: index.engine, board: branch.board, rolls }) + '\n';
      fs.writeFileSync(path.join(stage, file), body);
      next.continuations[branch.board] = { file, sha256: digest(body), turn: branch.turn, parent: branch.parent,
        ...(branch.turn === 3 ? { paths: branch.paths } : { weight: branch.weight }) };
    }
    const { missing: initialMissing, ...counts } = plan;
    const stats = { ...counts, initialMissing, remaining: 0, computedThisRun: completed, elapsedSeconds: (Date.now() - start) / 1000 };
    next.continuationBuild = { policy: CONTINUATION_POLICY,
      selection: 'Every evaluated reply within 0.040 equity after every opening within 0.040 equity; deduplicated boards, all 21 rolls. Previously published fourth-turn coverage retained.',
      generator: 'backgammon/scripts/build-continuation-book.cjs', signature,
      coverageSignature: digest(JSON.stringify({ policy: CONTINUATION_POLICY, boards: branches.map(b => b.board), base: index.replies })),
      builtAt: new Date().toISOString(), ...stats };
    atomicJSON(path.join(stage, 'index.json'), next);
    checkpoint.publish(out, stage);
    checkpoint.finish(stats);
    console.log(JSON.stringify({ published: branches.length, ...stats }));
  } finally {
    if (browser) await browser.close(); if (server.listening) server.close();
    checkpoint.unlock(); process.off('SIGINT', stop); process.off('SIGTERM', stop);
  }
})().catch(e => { console.error(e); process.exitCode = 1; if (server.listening) server.close(); });
