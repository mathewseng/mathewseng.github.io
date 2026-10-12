// SPDX-License-Identifier: GPL-3.0-or-later
// Bounded writes: each completed roll rewrites only its board (21 rolls),
// never the growing book. Atomic replacement survives process interruption.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const boardId = board => digest(board).slice(0, 16);
function atomicJSON(file, value) {
  const temp = file + `.tmp-${process.pid}`, fd = fs.openSync(temp, 'w');
  try { fs.writeFileSync(fd, JSON.stringify(value) + '\n'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(temp, file);
}
function processAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) throw Error('Invalid build PID.');
  try { process.kill(pid, 0); return true; } catch (e) { if (e.code === 'ESRCH') return false; throw e; }
}
// A tiny journal covers the gap between directory renames. A later invocation
// restores the preceding publication if the process died inside that gap.
function recoverPublication(target, root) {
  const journal = path.join(root, 'publication.json');
  if (!fs.existsSync(journal)) return;
  const saved = JSON.parse(fs.readFileSync(journal));
  if (saved.target !== target || path.dirname(path.dirname(saved.backup)) !== root || path.basename(saved.backup) !== 'previous-publication') throw Error('Invalid publication journal.');
  if (processAlive(saved.pid)) throw Error('Book publication already running.');
  if (!fs.existsSync(target)) {
    if (!fs.existsSync(saved.backup)) throw Error('Missing previous publication; inspect checkpoint.');
    fs.renameSync(saved.backup, target);
  }
  fs.unlinkSync(journal);
}
class BookCheckpoint {
  constructor(root, signature) {
    if (!/^[a-f0-9]{64}$/.test(signature)) throw Error('Invalid checkpoint signature.');
    this.signature = signature; this.dir = path.join(root, signature);
    fs.mkdirSync(this.dir, { recursive: true });
    const manifest = path.join(this.dir, 'manifest.json');
    if (fs.existsSync(manifest)) {
      this.manifest = JSON.parse(fs.readFileSync(manifest));
      if (this.manifest.schema !== 1 || this.manifest.signature !== signature) throw Error('Checkpoint input mismatch.');
    } else {
      this.manifest = { schema: 1, signature, startedAt: new Date().toISOString() };
      atomicJSON(manifest, this.manifest);
    }
  }
  lock() {
    const file = path.join(this.dir, 'build.lock');
    if (fs.existsSync(file)) {
      const pid = Number(fs.readFileSync(file, 'utf8'));
      if (!Number.isInteger(pid) || pid < 1) throw Error('Invalid build lock; inspect before removing.');
      if (processAlive(pid)) throw Error(`Book generator already running (PID ${pid}).`);
      fs.unlinkSync(file);
    }
    fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
    this.lockFile = file;
  }
  unlock() {
    if (this.lockFile && fs.existsSync(this.lockFile) && fs.readFileSync(this.lockFile, 'utf8') === String(process.pid)) fs.unlinkSync(this.lockFile);
    this.lockFile = null;
  }
  load(board) {
    const file = path.join(this.dir, boardId(board) + '.json');
    if (!fs.existsSync(file)) return {};
    const { sha256, ...value } = JSON.parse(fs.readFileSync(file));
    if (value.schema !== 1 || value.signature !== this.signature || value.board !== board || digest(JSON.stringify(value)) !== sha256)
      throw Error(`Corrupt or incompatible checkpoint: ${file}`);
    return value.rolls;
  }
  save(board, rolls) {
    const value = { schema: 1, signature: this.signature, board, rolls };
    atomicJSON(path.join(this.dir, boardId(board) + '.json'), { ...value, sha256: digest(JSON.stringify(value)) });
  }
  publish(target, stage) {
    const backup = path.join(this.dir, 'previous-publication'), journal = path.join(path.dirname(this.dir), 'publication.json');
    fs.rmSync(backup, { recursive: true, force: true });
    atomicJSON(journal, { target, backup, pid: process.pid });
    fs.renameSync(target, backup);
    try { fs.renameSync(stage, target); } catch (e) { fs.renameSync(backup, target); fs.unlinkSync(journal); throw e; }
    fs.unlinkSync(journal);
  }
  finish(stats) { atomicJSON(path.join(this.dir, 'manifest.json'), { schema: 1, signature: this.signature, startedAt: this.manifest.startedAt, finishedAt: new Date().toISOString(), ...stats }); }
}
module.exports = { BookCheckpoint, boardId, digest, atomicJSON, recoverPublication };
