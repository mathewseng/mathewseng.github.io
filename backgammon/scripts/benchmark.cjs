const { launchQuietBrowser } = require("../../scripts/quiet-browser.cjs");
// Local HTTP benchmark. Not a real-phone or WAN measurement.
const { chromium } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
(async () => {
  const browser = await launchQuietBrowser(chromium, {
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" }),
      page = await context.newPage();
    await page.goto(
      (process.env.BG_BASE_URL || "http://127.0.0.1:8765") + "/backgammon/",
    );
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    const data = await page.evaluate(async () => {
      const { EngineClient } = await import("/backgammon/engine/client.mjs");
      const fixtures = (
        await (await fetch("/backgammon/data/exercises.json")).json()
      ).items;
      const startup = [];
      for (let i = 0; i < 10; i++) {
        const e = new EngineClient();
        await e.start();
        startup.push(e.startup);
        e.destroy();
      }
      const engine = new EngineClient();
      await engine.start();
      const samples = [];
      for (const topic of ["opening", "contact", "race", "bearoff", "cube"]) {
        const state = fixtures.find((f) => f.topic === topic).state;
        for (const preset of ["quick", "standard", "deep"]) {
          const n = preset === "deep" ? 5 : 30,
            ms = [];
          for (let i = 0; i < n; i++) {
            engine.cache.clear();
            const result = await engine.analyze(state, { preset });
            ms.push(result.elapsedMs);
          }
          const cold = [];
          for (let j = 0; j < 5; j++) {
            const fresh = new EngineClient();
            await fresh.start();
            const result = await fresh.analyze(state, { preset });
            cold.push(result.elapsedMs);
            fresh.destroy();
          }
          samples.push({
            topic,
            preset,
            condition: "warm GNUbg evaluation cache",
            samples: ms,
            coldSamples: cold,
          });
        }
      }
      engine.destroy();
      return {
        startup,
        samples,
        engine: (await import("/backgammon/engine/metadata.mjs"))
          .ENGINE_VERSION,
        userAgent: navigator.userAgent,
      };
    });
    const stats = (a) => {
      const s = a.slice().sort((a, b) => a - b);
      return {
        n: a.length,
        median: s[Math.floor(s.length / 2)],
        ...(s.length >= 20
          ? { p95: s[Math.ceil(0.95 * s.length) - 1] }
          : { min: s[0], max: s.at(-1) }),
      };
    };
    const report = {
      recordedAt: new Date().toISOString(),
      engine: data.engine,
      environment: {
        platform: os.platform(),
        arch: os.arch(),
        cpu: os.cpus()[0].model,
        browser: browser.version(),
        condition:
          "Local HTTP; fresh workers for startup/cold computation; HTTP cache disabled; browser may cache compiled WASM; no CPU throttle; not a real phone",
      },
      startup: Object.fromEntries(
        ["transferMs", "compileMs", "initializeMs", "elapsedMs"].map((k) => [
          k,
          stats(data.startup.map((x) => x[k])),
        ]),
      ),
      bytes: data.startup[0].bytes,
      compute: data.samples.map((r) => ({
        ...r,
        statistics: stats(r.samples),
        coldStatistics: stats(r.coldSamples),
      })),
    };
    fs.writeFileSync(
      "backgammon/docs/benchmarks.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
