// SPDX-License-Identifier: GPL-3.0-or-later
import { put, saveMatchHistory } from './storage.mjs';

// Shared by the worker and its fallback. Preserve the existing work record,
// archive merging and annotations, and acknowledge work before archiving it.
export async function writeProgress(snapshot, history, stored, signature = JSON.stringify(snapshot)) {
  await put('work', snapshot);
  stored(signature);
  if (history) await saveMatchHistory(snapshot.game, snapshot.game.names, snapshot.game.config.mode);
}

export class ProgressWriter {
  constructor({workerFactory = () => new Worker(new URL('./progress-worker.mjs', import.meta.url), {type:'module'}),
    write = writeProgress} = {}) {
    this.workerFactory = workerFactory;
    this.write = write;
    this.pending = new Map();
    this.serial = 0;
    this.fallbackQueue = Promise.resolve();
  }
  fallback(entry) {
    this.fallbackQueue = this.fallbackQueue.catch(() => {}).then(async () => {
      try {
        await this.write(JSON.parse(entry.payload), entry.history, entry.stored, entry.payload);
        entry.resolve();
      } catch (error) { entry.reject(error); }
      finally { this.pending.delete(entry.id); }
    });
  }
  failed() {
    if (this.unavailable) return;
    this.unavailable = true;
    this.worker?.terminate();
    this.worker = null;
    // Retry exact snapshots in request order. A worker crash must neither lose
    // a draft nor let an older save overwrite a more recent one.
    for (const entry of this.pending.values()) this.fallback(entry);
  }
  start() {
    if (this.worker || this.unavailable) return;
    try {
      const worker = this.worker = this.workerFactory();
      worker.onmessage = ({data}) => {
        if (this.worker !== worker) return;
        const entry = this.pending.get(data.id);
        if (!entry) return;
        if (data.type === 'stored') entry.stored(data.key);
        else {
          this.pending.delete(data.id);
          if (data.type === 'done') entry.resolve();
          else entry.reject(new Error(data.error || 'Game progress could not be saved.'));
        }
      };
      worker.onerror = event => { event.preventDefault?.(); this.failed(); };
      worker.onmessageerror = () => this.failed();
    } catch { this.failed(); }
  }
  save(work, {history = false, stored = () => {}} = {}) {
    // Work records use the same JSON format as exported/restored matches.
    // Capture that immutable representation once. A structuredClone followed
    // by postMessage used to copy the entire growing history twice on every
    // tap; the worker now expands it, and crash recovery keeps the exact bytes.
    const payload = JSON.stringify(work), id = ++this.serial;
    this.start();
    return new Promise((resolve, reject) => {
      const entry = {id,payload,history,stored,resolve,reject};
      this.pending.set(id,entry);
      if (this.unavailable) this.fallback(entry);
      else try { this.worker.postMessage({id,payload,history}); }
      catch { this.failed(); }
    });
  }
}
