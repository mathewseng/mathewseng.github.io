const { launchQuietBrowser } = require("../../scripts/quiet-browser.cjs");
// Run after generate-positions.mjs with a local repository HTTP server on port 8765.
const { chromium } = require("playwright");
const fs = require("node:fs");
(async () => {
  const browser = await launchQuietBrowser(chromium, {
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  try {
    const p = await browser.newPage();
    await p.goto(
      (process.env.BG_BASE_URL || "http://127.0.0.1:8765") + "/backgammon/",
    );
    const data = await p.evaluate(async () => {
      const data = await (
        await fetch("/backgammon/data/exercises.json")
      ).json();
      const { EngineClient } = await import("/backgammon/engine/client.mjs");
      const engine = new EngineClient();
      for (const item of data.items) {
        item.analysis = await engine.analyze(item.state);
        item.analysis.provenance =
          "Pinned engine evaluated during fixture generation";
      }
      engine.destroy();
      return data;
    });
    fs.writeFileSync("backgammon/data/exercises.json", JSON.stringify(data));
    console.log(
      `Scored ${data.items.length} legal fixtures with the real engine.`,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
