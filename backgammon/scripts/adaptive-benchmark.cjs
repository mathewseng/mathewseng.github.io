// Real assembled-site WASM, fresh worker per sample. No mock timers/engine.
const fs = require("node:fs"), os = require("node:os");
const browsers = require("playwright");
const { launchQuietBrowser } = require("../../scripts/quiet-browser.cjs");
const summary = values => {
  const sorted = [...values].sort((a,b) => a-b);
  return { n: sorted.length, median: sorted[Math.floor(sorted.length/2)], min: sorted[0], max: sorted.at(-1) };
};
(async () => {
  const results = [];
  for (const name of (process.env.BG_BROWSERS || "chromium,firefox,webkit").split(",")) {
    const browser = await launchQuietBrowser(browsers[name], { headless: true });
    try {
      const page = await browser.newPage({ serviceWorkers: "block" });
      await page.goto((process.env.BG_BASE_URL || "http://127.0.0.1:8878") + "/backgammon/");
      await page.exposeFunction("record", row => console.log(name, row.topic, row.sample, `${row.plies} ply`, `${row.elapsedMs.toFixed(1)} ms`));
      const report = await page.evaluate(async n => {
        const { EngineClient } = await import("/backgammon/engine/client.mjs");
        const { ENGINE_VERSION } = await import("/backgammon/engine/metadata.mjs");
        const { initialState } = await import("/backgammon/core/rules.mjs");
        const fixtures = (await (await fetch("/backgammon/data/exercises.json")).json()).items;
        const cases = [...["opening","contact","race","bearoff","cube"].map(topic => ({topic,state:fixtures.find(f => f.topic === topic).state})),
          { topic:"doubles",state:initialState({phase:"move",dice:[3,3]}) },
          { topic:"match",state:initialState({phase:"move",dice:[3,1],matchLength:7,scores:[2,4]}) }];
        const rows = [];
        for (const { topic,state } of cases) {
          const samples = [];
          for (let sample = 0; sample < n; sample++) {
            const client = new EngineClient(), levels = [];
            try {
              await client.start();
              const start = performance.now();
              const result = await client.analyze(state, {preset:"auto",onEvaluation:r => levels.push({plies:r.settings.plies,atMs:performance.now()-start})});
              const elapsedMs = performance.now()-start;
              const entry = { sample, elapsedMs, plies:result.settings.plies, settings:result.settings, budget:result.budget, levels, startup:client.startup,
                best:result.candidates?.[0].key || result.action, candidates:result.candidates?.length || null };
              if (sample === 0) {
                // Independent fresh worker at exactly the completed preset:
                // neither native caches nor our retained screening are shared.
                const reference = new EngineClient();
                try {
                  const preset = Object.entries((await import("/backgammon/engine/metadata.mjs")).PRESETS).find(([,v]) => v.plies === result.settings.plies)[0];
                  const expected = await reference.analyze(state, {preset});
                  let maxDifference = 0;
                  for (const c of result.candidates || [result]) {
                    const other = expected.candidates ? expected.candidates.find(o => o.key === c.key) : expected;
                    if (!other) throw Error("Adaptive search changed candidate coverage");
                    for (const field of ["equity","cubeless","mwc"])
                      if (c[field] !== null) maxDifference = Math.max(maxDifference,Math.abs(c[field]-other[field]));
                    c.probabilities.forEach((p,i) => maxDifference = Math.max(maxDifference,Math.abs(p-other.probabilities[i])));
                  }
                  if (maxDifference > .00001) throw Error(`${topic}: completed search differs by ${maxDifference}`);
                  if ((expected.candidates?.[0].key || expected.action) !== entry.best) throw Error("Adaptive best decision differs from the same fixed depth");
                  entry.reference = {preset,maxDifference,elapsedMs:expected.elapsedMs};
                } finally { reference.destroy(); }
              }
              samples.push(entry);
              await window.record({topic,...entry});
            } finally { client.destroy(); }
          }
          rows.push({topic,state,samples});
        }
        return {engine:ENGINE_VERSION,rows};
      }, Number(process.env.BG_SAMPLES || 5));
      results.push({browser:name,version:browser.version(),...report,rows:report.rows.map(row => ({...row,summary:summary(row.samples.map(s => s.elapsedMs)),completedPlies:row.samples.map(s => s.plies)}))});
    } finally { await browser.close(); }
  }
  const report = {recordedAt:new Date().toISOString(),environment:{cpu:os.cpus()[0].model,os:`${os.platform()} ${os.release()} ${os.arch()}`},
    method:"Local HTTP assembled site; fresh worker/native cache each sample; HTTP and compilation caches may be warm. Startup components recorded separately. Wall time includes worker messages and deadline termination. Maximum four plies. First sample per position checked against an independent fixed-depth worker at the completed preset. Median/range only; no p95. Desktop measurements, not a physical-phone benchmark.",results};
  fs.writeFileSync(process.env.BG_ADAPTIVE_REPORT || "backgammon/data/adaptive-benchmark.json",JSON.stringify(report,null,2)+"\n");
})().catch(e => {console.error(e);process.exitCode=1;});
