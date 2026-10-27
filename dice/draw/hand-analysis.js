// Keep a pending opening-roll analysis alive when the player draws or moves
// on. The current hand and its history entry can share the same result.
const cache = new Map(), pending = new Map();
let worker, nextId = 0;
export function analyzeHand(dice, config) {
  const key = JSON.stringify([dice, config]);
  if (cache.has(key)) return cache.get(key);
  if (!worker) {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      if (data.error) { cache.delete(request.key); request.reject(new Error(data.error)); }
      else request.resolve(data.result);
    };
    worker.onerror = () => {
      worker.terminate(); worker = null;
      for (const request of pending.values()) { cache.delete(request.key); request.reject(new Error('Advice could not load.')); }
      pending.clear();
    };
  }
  const promise = new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { key, resolve, reject });
    worker.postMessage({ id, dice, config });
  });
  if (cache.size >= 32) cache.delete(cache.keys().next().value);
  cache.set(key, promise);
  return promise;
}
