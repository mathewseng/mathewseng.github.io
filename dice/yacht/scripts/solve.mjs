// Builds data/values.bin: the expected future score of every reachable Yacht turn-start
// state under optimal solitaire play (Verhoeff-style backward induction), as little-endian
// Float32 split into four byte planes (low bytes first) and gzipped — 2.1 MB becomes 0.85 MB.
//
//   node dice/yacht/scripts/solve.mjs [--workers N]
//
// States are solved by the number of filled boxes, most filled first, since a turn only
// leads to states with one more box filled. Each layer splits across worker threads that
// share one Float64Array.
import { writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { UPPER_SUBS, STATE_COUNT, stateIndex, solveTurn } from '../solver.mjs';

const bits = (n) => { let c = 0; while (n) { c += n & 1; n >>= 1; } return c; };

function layer(filled) {
  const states = [];
  for (let um = 0; um < 64; um += 1) {
    for (let lm6 = 0; lm6 < 64; lm6 += 1) {
      for (let y = 0; y < 3; y += 1) {
        if (bits(um) + bits(lm6) + (y ? 1 : 0) !== filled) continue;
        for (const sub of UPPER_SUBS[um]) states.push([um, sub, lm6, y]);
      }
    }
  }
  return states;
}

if (!isMainThread) {
  const V = new Float64Array(workerData.buffer);
  parentPort.on('message', ({ filled, from, to }) => {
    const states = layer(filled);
    for (let i = from; i < to; i += 1) {
      const [um, sub, lm6, y] = states[i];
      V[stateIndex(um, sub, lm6, y)] = solveTurn({ um, sub, lm6, y }, V).start;
    }
    parentPort.postMessage('done');
  });
} else {
  const arg = process.argv.indexOf('--workers');
  const count = arg > 0 ? Number(process.argv[arg + 1]) : Math.max(1, availableParallelism() - 1);
  const buffer = new SharedArrayBuffer(STATE_COUNT * 8);
  const V = new Float64Array(buffer);
  const workers = Array.from({ length: count }, () => new Worker(new URL(import.meta.url), { workerData: { buffer } }));
  const started = Date.now();
  // 13 filled: the game is over and every value stays 0.
  for (let filled = 12; filled >= 0; filled -= 1) {
    const total = layer(filled).length;
    const chunk = Math.ceil(total / count);
    await Promise.all(workers.map((worker, w) => new Promise((resolve) => {
      worker.once('message', resolve);
      worker.postMessage({ filled, from: Math.min(total, w * chunk), to: Math.min(total, (w + 1) * chunk) });
    })));
    console.log(`${filled} filled: ${total} states, ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }
  workers.forEach((worker) => worker.terminate());
  const bytes = new Uint8Array(new Float32Array(V).buffer);
  const planes = new Uint8Array(bytes.length);
  for (let i = 0; i < STATE_COUNT; i += 1) for (let j = 0; j < 4; j += 1) planes[j * STATE_COUNT + i] = bytes[i * 4 + j];
  const packed = gzipSync(planes, { level: 9 });
  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(new URL('../data/values.bin', import.meta.url), packed);
  console.log(`Expected score from the empty card: ${V[stateIndex(0, 0, 0, 0)].toFixed(6)}`);
  console.log(`${STATE_COUNT} states, ${bytes.length} bytes as Float32, ${packed.length} bytes packed, ${((Date.now() - started) / 1000).toFixed(1)}s`);
}
