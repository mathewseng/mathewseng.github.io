const { launchQuietBrowser } = require("../../scripts/quiet-browser.cjs");
// Add automatic Quick -> Deep pipeline timings to an existing speed report.
const { chromium } = require("playwright"),
  fs = require("node:fs");
(async () => {
  const browser = await launchQuietBrowser(chromium);
  try {
    const p = await browser.newPage({ serviceWorkers: "block" });
    await p.goto(
      (process.env.BG_BASE_URL || "http://127.0.0.1:8878") + "/backgammon/",
    );
    const rows = await p.evaluate(async () => {
      const { EngineClient } = await import("/backgammon/engine/client.mjs");
      const f = (await (await fetch("/backgammon/data/exercises.json")).json())
          .items,
        rows = [];
      for (const topic of ["opening", "contact", "race", "bearoff", "cube"]) {
        const samples = [];
        for (let i = 0; i < 3; i++) {
          const e = new EngineClient(),
            s = f.find((x) => x.topic === topic).state,
            start = performance.now();
          const q = await e.analyze(s, { preset: "quick" }),
            firstMs = performance.now() - start;
          const d = await e.analyze(s, { preset: "deep" });
          samples.push({
            firstMs,
            finalMs: performance.now() - start,
            rankChanged: q.candidates?.[0]?.key !== d.candidates?.[0]?.key,
          });
          e.destroy();
        }
        rows.push({ topic, samples });
      }
      return rows;
    });
    const report = JSON.parse(
      fs.readFileSync("backgammon/data/speed-report.json"),
    );
    report.auto = {
      recordedAt: new Date().toISOString(),
      method:
        "Three fresh workers per position; Quick then Deep in one worker. Includes initialization, excludes UI painting.",
      rows,
    };
    fs.writeFileSync(
      "backgammon/data/speed-report.json",
      JSON.stringify(report, null, 2),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
