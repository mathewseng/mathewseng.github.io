const { launchQuietBrowser } = require("../../scripts/quiet-browser.cjs");
const { chromium } = require("playwright");
const fs = require("node:fs"),
  os = require("node:os");
(async () => {
  const browser = await launchQuietBrowser(chromium);
  try {
    const page = await browser.newPage({ serviceWorkers: "block" });
    await page.goto(
      (process.env.BG_BASE_URL || "http://127.0.0.1:8877") + "/backgammon/",
    );
    await page.exposeFunction("benchmarkProgress", (x) => console.log(x));
    const data = await page.evaluate(async () => {
      const { EngineClient } = await import("/backgammon/engine/client.mjs");
      const { ENGINE_VERSION } =
        await import("/backgammon/engine/metadata.mjs");
      const fixtures = (
        await (await fetch("/backgammon/data/exercises.json")).json()
      ).items;
      const rows = [],
        startup = [];
      for (const topic of ["opening", "contact", "race", "bearoff", "cube"]) {
        const s = fixtures.find((f) => f.topic === topic).state;
        for (const preset of [
          "quick",
          "standard",
          "deep",
          "expert",
          "research",
          "rollout64",
          "rollout256",
        ]) {
          const times = [],
            cached = [],
            endToEnd = [];
          for (let i = 0; i < 3; i++) {
            const e = new EngineClient();
            const t = performance.now();
            const options = preset.startsWith("rollout")
              ? {
                  rollout: {
                    trials: Number(preset.slice(7)),
                    seed: 20261006 + i,
                  },
                }
              : { preset };
            try {
              await e.start();
              startup.push(e.startup);
              const r = await e.analyze(s, options);
              times.push(r.elapsedMs);
              endToEnd.push(performance.now() - t);
              const h = performance.now();
              await e.analyze(s, options);
              cached.push(performance.now() - h);
            } finally {
              e.destroy();
            }
          }
          rows.push({
            topic,
            preset,
            samples: times,
            cachedSamples: cached,
            endToEndSamples: endToEnd,
          });
          await window.benchmarkProgress(
            `${topic} ${preset}: ${times.map((n) => n.toFixed(1)).join(", ")} ms`,
          );
        }
      }
      return { engine: ENGINE_VERSION, rows, startup };
    });
    const stats = (xs) => {
      const sorted = [...xs].sort((a, b) => a - b);
      return {
        n: xs.length,
        median: sorted[Math.floor(sorted.length / 2)],
        min: sorted[0],
        max: sorted.at(-1),
      };
    };
    const report = {
      schema: 1,
      recordedAt: new Date().toISOString(),
      engine: data.engine,
      environment: {
        cpu: os.cpus()[0].model,
        os: `${os.platform()} ${os.release()} ${os.arch()}`,
        browser: `Chromium ${browser.version()}`,
        condition:
          "Desktop, local HTTP, no CPU throttling. Fresh worker for each sample; browser HTTP/WASM compilation caches may be warm. No app or GNUbg evaluation cache reused between samples. Not a real phone or Internet transfer benchmark.",
      },
      startup: Object.fromEntries(
        ["transferMs", "compileMs", "initializeMs", "elapsedMs"].map((k) => [
          k,
          stats(data.startup.map((s) => s[k])),
        ]),
      ),
      bytes: data.startup[0].bytes,
      rows: data.rows.map((r) => ({
        ...r,
        compute: stats(r.samples),
        cacheHit: stats(r.cachedSamples),
        endToEnd: stats(r.endToEndSamples),
      })),
    };
    fs.writeFileSync(
      "backgammon/data/speed-report.json",
      JSON.stringify(report, null, 2),
    );
    console.log("Saved speed-report.json");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
