const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { BookCheckpoint, boardId, digest } = require('../scripts/book-checkpoint.cjs');
function temp(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-book-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
const sample = { total: 1, rows: [[[['bar', 23, 1]], .1, .1, .5, .1, 0, .1, 0]] };
test('checkpoint resumes completed rolls, leaves other boards untouched, and ignores interrupted temp writes', t => {
  const root = temp(t), sig = digest('same engine and scoring settings'), store = new BookCheckpoint(root, sig);
  store.save('board-a', { '11': sample }); store.save('board-b', { '21': sample });
  const b = path.join(store.dir, boardId('board-b') + '.json'), before = fs.readFileSync(b);
  store.save('board-a', { ...store.load('board-a'), '22': sample });
  assert.deepEqual(fs.readFileSync(b), before);
  fs.writeFileSync(path.join(store.dir, boardId('board-a') + '.json.tmp'), '{partial');
  store.finish({ remaining: 0 });
  const resumed = new BookCheckpoint(root, sig);
  assert.equal(resumed.manifest.remaining, 0);
  assert.deepEqual(Object.keys(resumed.load('board-a')), ['11', '22']);
  assert.deepEqual(resumed.load('board-b'), { '21': sample });
  assert.deepEqual(resumed.load('missing'), {});
});
test('changed numerical inputs use an isolated checkpoint and checksum corruption is rejected', t => {
  const root = temp(t), a = new BookCheckpoint(root, digest('a')), b = new BookCheckpoint(root, digest('b'));
  a.save('board', { '11': sample }); assert.deepEqual(b.load('board'), {});
  const file = path.join(a.dir, boardId('board') + '.json'), data = JSON.parse(fs.readFileSync(file));
  data.rolls['11'].rows[0][1] = 99; fs.writeFileSync(file, JSON.stringify(data));
  assert.throws(() => a.load('board'), /Corrupt/);
});
test('checkpoint refuses mismatched manifests and concurrent writers; releasing permits resume', t => {
  const root = temp(t), sig = digest('a'), a = new BookCheckpoint(root, sig), b = new BookCheckpoint(root, sig);
  a.lock(); assert.throws(() => b.lock(), /already running/); a.unlock(); b.lock(); b.unlock();
  fs.writeFileSync(path.join(a.dir, 'manifest.json'), JSON.stringify({ schema: 1, signature: digest('wrong') }));
  assert.throws(() => new BookCheckpoint(root, sig), /mismatch/);
});
test('publication keeps the previous complete book, and a failed swap restores it', t => {
  const root = temp(t), store = new BookCheckpoint(path.join(root, 'checkpoints'), digest('a'));
  const target = path.join(root, 'book'), stage = path.join(store.dir, 'publication');
  fs.mkdirSync(target); fs.writeFileSync(path.join(target, 'index.json'), 'old');
  fs.mkdirSync(stage); fs.writeFileSync(path.join(stage, 'index.json'), 'complete-new');
  store.publish(target, stage);
  assert.equal(fs.readFileSync(path.join(target, 'index.json'), 'utf8'), 'complete-new');
  assert.equal(fs.readFileSync(path.join(store.dir, 'previous-publication', 'index.json'), 'utf8'), 'old');
  assert.throws(() => store.publish(target, stage), /ENOENT/);
  assert.equal(fs.readFileSync(path.join(target, 'index.json'), 'utf8'), 'complete-new');
});
test('a process dying between publication renames can resume without losing the prior book', t => {
  const { spawnSync } = require('node:child_process');
  const { recoverPublication, atomicJSON } = require('../scripts/book-checkpoint.cjs');
  const root = temp(t), checkpoints = path.join(root, 'checkpoints'), store = new BookCheckpoint(checkpoints, digest('a'));
  const target = path.join(root, 'book'), backup = path.join(store.dir, 'previous-publication');
  fs.mkdirSync(backup); fs.writeFileSync(path.join(backup, 'index.json'), 'previous');
  const dead = spawnSync(process.execPath, ['-e', '']); assert.equal(dead.status, 0);
  atomicJSON(path.join(checkpoints, 'publication.json'), { target, backup, pid: dead.pid });
  recoverPublication(target, checkpoints);
  assert.equal(fs.readFileSync(path.join(target, 'index.json'), 'utf8'), 'previous');
  assert.equal(fs.existsSync(path.join(checkpoints, 'publication.json')), false);
  // The same dead PID can leave a stale generation lock after an abrupt kill.
  fs.writeFileSync(path.join(store.dir, 'build.lock'), String(dead.pid));
  store.lock(); store.unlock();
});
