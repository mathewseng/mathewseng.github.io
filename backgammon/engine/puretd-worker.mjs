// SPDX-License-Identifier: GPL-3.0-or-later
import { supportsSIMD } from './backend.mjs';
import { createPuretdEvaluator } from './puretd.mjs';
import { PURETD, PURETD_WIDE } from './puretd-metadata.mjs';
let evaluator, backend;
async function asset(name) {
  const response = await fetch(new URL('./vendor/puretd/' + name, import.meta.url));
  if (!response.ok) throw Error(`PureTD asset failed: ${name} (${response.status})`);
  const bytes = await response.arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== PURETD.assets[name]) throw Error('PureTD asset integrity check failed. Refresh the app.');
  return bytes;
}
async function init() {
  const choice = new URL(self.location.href).searchParams.get('model');
  if (choice && choice !== 'wide') throw Error('Unknown PureTD model.');
  const selected = choice === 'wide' ? PURETD_WIDE : PURETD;
  const start = performance.now(), model = await asset(selected.file);
  const requested = new URL(self.location.href).searchParams.get('backend');
  backend = requested !== 'scalar' && supportsSIMD() ? 'simd' : 'scalar';
  const load = async () => {
    const prefix = backend === 'scalar' ? 'scalar/' : '';
    const [loader, wasmBinary] = await Promise.all([
      import(new URL('./vendor/puretd/' + prefix + 'puretd-module.mjs', import.meta.url)),
      asset(prefix + 'puretd-module.wasm'),
    ]);
    const module = await loader.default({ wasmBinary, print: () => {}, printErr: message => console.warn(message) });
    module.FS.writeFile('/' + selected.file, new Uint8Array(model));
    evaluator = createPuretdEvaluator(module, selected);
  };
  let fallback = false;
  try { await load(); } catch (error) {
    if (backend === 'scalar') throw error;
    backend = 'scalar'; fallback = true; await load();
  }
  return { elapsedMs: performance.now() - start, backend, fallback,
    capabilities: { checker: true, cube: false, match: false, equityOnly: true, maximumPlies: 1, engine: selected.id } };
}
self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'init') return postMessage({ id, type: 'ready', ...await init() });
    if (!evaluator) throw Error('PureTD is not initialized.');
    if (data.rollout || data.prepared || data.kind !== 'checker' || data.preset !== 'standard')
      throw Error('Unsupported PureTD request.');
    const result = evaluator.analyze(data.state, { submitted: data.submitted, plies: 1 });
    postMessage({ id, type: 'result', result: { ...result, backend, requestId: id } });
  } catch (error) { postMessage({ id, type: 'error', message: error.message }); }
};
