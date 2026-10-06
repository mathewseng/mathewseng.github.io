const { launchQuietBrowser } = require("../../scripts/quiet-browser.cjs");
// Reproduce against an assembled local site. Reference source is in data/accuracy-reference.json.
const { chromium } = require("playwright");
const fs = require("node:fs");
(async () => {
  const browser = await launchQuietBrowser(chromium);
  try {
    const page = await browser.newPage({ serviceWorkers: "block" });
    await page.goto(
      (process.env.BG_BASE_URL || "http://127.0.0.1:8877") + "/backgammon/",
    );
    await page.exposeFunction("reportProgress", (x) => console.log(x));
    const report = await page.evaluate(async () => {
      const { EngineClient } = await import("/backgammon/engine/client.mjs");
      const { ENGINE_VERSION } =
        await import("/backgammon/engine/metadata.mjs");
      const corpus = await (
        await fetch("/backgammon/data/accuracy-reference.json")
      ).json();
      const rows = [];
      const engine = new EngineClient();
      try {
        for (const [index, row] of corpus.items.entries()) {
          const results = {};
          for (const preset of ["quick", "standard", "deep"]) {
            const r = await engine.analyze(row.state, { preset });
            const best = r.candidates[0];
            const ref = row.reference.find((c) => c.key === best.key);
            const referenced = r.candidates.filter((c) =>
              row.reference.some((q) => q.key === c.key),
            );
            const restricted = row.reference.find(
              (c) => c.key === referenced[0]?.key,
            );
            results[preset] = {
              best: best.notation,
              key: best.key,
              referenceLoss: ref?.loss ?? null,
              referenceCovered: !!ref,
              restrictedLoss: restricted?.loss ?? null,
              elapsedMs: r.elapsedMs,
            };
          }
          rows.push({
            topic: row.topic,
            line: row.line,
            key: row.key,
            results,
          });
          if (index % 10 === 0)
            await window.reportProgress(`${index + 1}/${corpus.items.length}`);
        }
      } finally {
        engine.destroy();
      }
      return {
        schema: 1,
        recordedAt: new Date().toISOString(),
        engine: ENGINE_VERSION,
        description: corpus.description,
        sources: corpus.sources,
        rows,
      };
    });
    report.browser = browser.version();
    report.summary = ["contact", "race", "crashed"].map((topic) => ({
      topic,
      presets: ["quick", "standard", "deep"].map((preset) => {
        const rows = report.rows
          .filter((r) => r.topic === topic)
          .map((r) => r.results[preset]);
        const covered = rows.filter((r) => r.referenceCovered);
        return {
          preset,
          n: rows.length,
          covered: covered.length,
          meanReferenceLoss:
            covered.reduce((s, r) => s + r.referenceLoss, 0) / covered.length,
          agreementWithin005: covered.filter((r) => r.referenceLoss <= 0.005)
            .length,
          restrictedMeanLoss:
            rows.reduce((s, r) => s + r.restrictedLoss, 0) / rows.length,
        };
      }),
    }));
    fs.writeFileSync(
      "backgammon/data/accuracy-report.json",
      JSON.stringify(report, null, 2),
    );
    console.log(report.summary);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
