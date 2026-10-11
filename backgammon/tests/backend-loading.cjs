const assert = require("node:assert/strict"), http = require("node:http");
// Serve fault variants over real HTTP. Playwright worker request interception
// differs by browser; a route mock that never runs is not fallback evidence.
module.exports = async function backendLoading(browser, base) {
  const cases = [], requests = new Map(), failedOnce = new Set();
  const fixture = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const match = /^\/__engine_test\/([^/]+)(\/.*)$/.exec(url.pathname);
    const mode = match?.[1], file = match?.[2] || url.pathname;
    if (mode && file.includes("/engine/vendor/")) requests.get(mode).push(file);
    const send = (status, type, body) => {
      res.writeHead(status, {"Content-Type": type, "Cache-Control": "no-store"}); res.end(body);
    };
    try {
      if (mode === "unsupported" && file.endsWith("/engine/backend.mjs"))
        return send(200, "text/javascript", 'export const supportsSIMD=()=>false;export const backendPath=b=>b==="simd"?"./vendor/simd/":"./vendor/";');
      const simd = file.includes("/vendor/simd/");
      if ((simd && ["missing-wasm", "invalid-wasm"].includes(mode) || mode === "invalid-both") && file.endsWith(".wasm"))
        return send(mode === "missing-wasm" ? 404 : 200, "application/wasm", "invalid test binary");
      if (simd && mode === "missing-loader" && file.endsWith(".js"))
        return send(404, "text/javascript", "test failure");
      if (simd && mode === "failed-initialize" && file.endsWith(".js"))
        return send(200, "text/javascript", 'export default options=>options.instantiateWasm({},()=>{});');
      if (["failed-data", "retry-data"].includes(mode) && file.endsWith(".data") && !failedOnce.has(mode)) {
        if (mode === "retry-data") failedOnce.add(mode);
        return send(503, "application/octet-stream", "test failure");
      }
      const response = await fetch(base + file + url.search);
      send(response.status, response.headers.get("content-type") || "application/octet-stream", Buffer.from(await response.arrayBuffer()));
    } catch (error) { send(500, "text/plain", error.message); }
  });
  await new Promise(resolve => fixture.listen(0, "127.0.0.1", resolve));
  const local = `http://127.0.0.1:${fixture.address().port}`;
  try {
    for (const mode of ["auto", "scalar", "unsupported", "missing-wasm", "invalid-wasm", "missing-loader", "failed-initialize", "invalid-both", "failed-data", "retry-data"]) {
      requests.set(mode, []);
      const context = await browser.newContext({serviceWorkers: "block"});
      try {
        const page = await context.newPage(); await page.goto(local + "/backgammon/");
        const value = await page.evaluate(async ({mode}) => {
          const {EngineClient} = await import("/backgammon/engine/client.mjs");
          const {initialState} = await import("/backgammon/core/rules.mjs");
          const url = `/__engine_test/${mode}/backgammon/engine/worker.mjs${mode === "scalar" ? "?backend=scalar" : ""}`;
          const e = new EngineClient({workerFactory: () => new Worker(url, {type: "module"})});
          let initialError;
          const analyze = () => e.analyze(initialState({phase: "move", dice: [3,1], matchLength: 0}), {preset: "quick"});
          try {
            if (mode === "retry-data") try { await analyze(); } catch (error) { initialError = error.message; }
            const result = await analyze();
            return {startup: e.startup, best: result.candidates[0].notation, backend: result.backend, initialError};
          } catch (error) { return {error: error.message, workerReleased: e.worker === null, ready: e.ready}; }
          finally { e.destroy(); }
        }, {mode});
        const fetched = requests.get(mode);
        if (["failed-data", "invalid-both"].includes(mode)) {
          assert.ok(value.error, `${mode}: must report failure`);
          assert.ok(value.workerReleased && !value.ready, `${mode}: failed worker must be released`);
          if (mode === "failed-data") assert.match(value.error, /Engine asset failed.*503/);
        } else {
          assert.equal(value.best, "8/5 6/5");
          assert.equal(value.backend, ["auto", "retry-data"].includes(mode) ? "simd" : "scalar", `${mode}: ${JSON.stringify(value)}`);
          assert.equal(value.startup.fallback, ["missing-wasm", "invalid-wasm", "missing-loader", "failed-initialize"].includes(mode));
          assert.equal(fetched.filter(url => url.endsWith(".data")).length, mode === "retry-data" ? 2 : 1, "one data download per initialization");
          if (["scalar", "unsupported"].includes(mode)) assert.ok(!fetched.some(url => url.includes("/simd/")), "unsupported browsers must not fetch SIMD");
          if (mode === "auto") assert.ok(!fetched.includes("/backgammon/engine/vendor/gnubg-core-module.wasm"), "do not download both executables on success");
          if (mode === "retry-data") assert.match(value.initialError, /503/, "retry must follow a real failed initialization");
        }
        cases.push({mode, ...value, fetched});
      } finally { await context.close(); }
    }
    return cases;
  } finally { fixture.closeAllConnections(); await new Promise(resolve => fixture.close(resolve)); }
};
