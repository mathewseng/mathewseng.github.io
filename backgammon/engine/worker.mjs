// SPDX-License-Identifier: GPL-3.0-or-later
import createModule from "./vendor/gnubg-core-module.js";
import { createEvaluator } from "./evaluate.mjs";
let evaluator;
async function init() {
  const start = performance.now();
  const asset = async (name) => {
    const response = await fetch(new URL("./vendor/" + name, import.meta.url));
    if (!response.ok)
      throw new Error(`Engine asset failed: ${name} (${response.status})`);
    return response.arrayBuffer();
  };
  const [wasm, data] = await Promise.all([
    asset("gnubg-core-module.wasm"),
    asset("gnubg-core-module.data"),
  ]);
  const transferMs = performance.now() - start,
    compileStart = performance.now(),
    compiled = await WebAssembly.compile(wasm),
    compileMs = performance.now() - compileStart;
  const initStart = performance.now();
  const module = await createModule({
    locateFile: (path) => new URL(`./vendor/${path}`, import.meta.url).href,
    getPreloadedPackage: () => data,
    instantiateWasm(imports, receive) {
      WebAssembly.instantiate(compiled, imports).then((instance) =>
        receive(instance, compiled),
      );
      return {};
    },
    print: () => {},
    printErr: (message) => console.warn(message),
  });
  evaluator = createEvaluator(module);
  return {
    elapsedMs: performance.now() - start,
    transferMs,
    compileMs,
    initializeMs: performance.now() - initStart,
    bytes: wasm.byteLength + data.byteLength,
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
    const result = evaluator.analyze(
      request.state,
      request.preset,
      request.kind,
      request.submitted,
    );
    postMessage({ id, type: "result", result: { ...result, requestId: id } });
  } catch (e) {
    postMessage({ id, type: "error", message: e.message });
  }
};
