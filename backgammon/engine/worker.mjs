// SPDX-License-Identifier: GPL-3.0-or-later
import { supportsSIMD, backendPath } from "./backend.mjs";
import { createEvaluator } from "./evaluate.mjs";
import { runRollout } from "./rollout.mjs";
let evaluator, activeBackend;
async function init() {
  const start = performance.now();
  const asset = async (name) => {
    const response = await fetch(new URL(name, import.meta.url));
    if (!response.ok)
      throw new Error(`Engine asset failed: ${name} (${response.status})`);
    return response.arrayBuffer();
  };
  const requested = new URL(self.location.href).searchParams.get("backend");
  let backend = requested !== "scalar" && supportsSIMD() ? "simd" : "scalar";
  let fallback = false, transferMs = 0, compileMs = 0, initializeMs = 0, wasmBytes = 0;
  const load = async kind => {
    const base = backendPath(kind);
    const [loader, wasm] = await Promise.all([
      import(new URL(base + "gnubg-core-module.js", import.meta.url)),
      asset(base + "gnubg-core-module.wasm"),
    ]);
    wasmBytes += wasm.byteLength;
    return {loader, wasm};
  };
  const loadPreferred = async () => {
    try { return await load(backend); }
    catch (error) {
      if (backend === "scalar") throw error;
      backend = "scalar";
      fallback = true;
      return load(backend);
    }
  };
  // Share one data package; only download the selected executable variant.
  const [data, candidate] = await Promise.all([
    asset("./vendor/gnubg-core-module.data"), loadPreferred(),
  ]);
  transferMs = performance.now() - start;
  const initialize = async ({loader, wasm}) => {
    let compiled;
    const compilation = performance.now();
    try { compiled = await WebAssembly.compile(wasm); }
    finally { compileMs += performance.now() - compilation; }
    const initialization = performance.now();
    try {
      const module = await loader.default({
        getPreloadedPackage: () => data,
        instantiateWasm(imports, receive) {
          // Instantiation errors propagate into the loader instead of becoming
          // an unhandled rejected promise and a 45-second initialization hang.
          const instance = new WebAssembly.Instance(compiled, imports);
          receive(instance, compiled);
          return instance.exports;
        },
        print: () => {},
        printErr: (message) => console.warn(message),
      });
      evaluator = createEvaluator(module);
    } finally { initializeMs += performance.now() - initialization; }
  };
  try { await initialize(candidate); }
  catch (error) {
    if (backend === "scalar") throw error;
    backend = "scalar";
    fallback = true;
    const fetchStart = performance.now(), scalar = await load(backend);
    transferMs += performance.now() - fetchStart;
    await initialize(scalar);
  }
  activeBackend = backend;
  return {
    elapsedMs: performance.now() - start,
    transferMs,
    compileMs,
    initializeMs,
    bytes: wasmBytes + data.byteLength,
    backend,
    fallback,
  };
}
self.onmessage = async ({ data }) => {
  const { id, type, ...request } = data;
  try {
    if (type === "init") {
      const timing = await init();
      postMessage({
        id,
        type: "ready",
        ...timing,
        capabilities: evaluator.capabilities,
      });
      return;
    }
    if (!evaluator) throw new Error("Engine is not initialized.");
    const result = request.rollout
      ? await runRollout(
          evaluator,
          request.state,
          request.rollout,
          request.submitted,
          (checkpoint) => postMessage({ id, type: "progress", checkpoint }),
        )
      : evaluator.analyze(
          request.state,
          request.preset,
          request.kind,
          request.submitted,
        );
    postMessage({ id, type: "result", result: { ...result, backend: activeBackend, requestId: id } });
  } catch (e) {
    postMessage({ id, type: "error", message: e.message });
  }
};
