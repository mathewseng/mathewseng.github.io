const { launchQuietBrowser } = require("../../scripts/quiet-browser.cjs");
const { chromium } = require("playwright");
const fs = require("node:fs");
const assert = require("node:assert/strict");
(async () => {
  const b = await launchQuietBrowser(chromium, {
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  try {
    const c = await b.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        serviceWorkers: "block",
      }),
      p = await c.newPage();
    const base = process.env.BG_BASE_URL || "http://127.0.0.1:8765";
    await p.goto(base + "/backgammon/play/");
    await p.getByRole("button", { name: "Same device", exact: true }).tap();
    await p.getByLabel("Ivory player").fill("Long name — localization");
    await p.locator("#start-match").tap();
    do {
      await p.locator("#roll").tap();
      await p.waitForTimeout(30);
    } while (await p.locator("#roll").count());
    await p.locator("#begin-turn").tap();
    const step = await p.evaluate(async () => {
      const { get } = await import("/backgammon/core/storage.mjs"),
        { legalTurns } = await import("/backgammon/core/rules.mjs");
      return legalTurns((await get("work", "play")).game.state)[0].steps[0];
    });
    await p.locator(`g[data-point="${step.from}"]`).tap();
    assert.ok(await p.locator(".destination").count());
    await p.locator(`g[data-point="${step.to}"]`).tap();
    assert.ok(await p.locator("#undo").isEnabled());
    await p.screenshot({
      path: "backgammon/test-results/touch-active-390.png",
    });
    await p.locator("#undo").tap();
    const response = await p.evaluate(async (from) => {
      const samples = [];
      for (let i = 0; i < 30; i++) {
        const start = performance.now();
        document
          .querySelector(`g[data-point="${from}"]`)
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await new Promise(requestAnimationFrame);
        samples.push(performance.now() - start);
      }
      return samples;
    }, step.from);
    response.sort((a, b) => a - b);
    assert.ok(response[15] < 100);
    await p.locator("#panel-toggle").tap();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .tap();
    await p.getByRole("button", { name: "Settings", exact: true }).tap();
    await p
      .getByRole("button", { name: "Display & controls", exact: true })
      .tap();
    await p.getByLabel("Motion", { exact: true }).selectOption("reduce");
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .tap();
    assert.equal(await p.locator("html").getAttribute("data-motion"), "reduce");
    // Effective 200% zoom on a 1366×768 desktop and a keyboard-reduced phone viewport.
    await p.setViewportSize({ width: 683, height: 384 });
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await p.screenshot({
      path: "backgammon/test-results/zoom-effective-200.png",
      fullPage: true,
    });
    await p.setViewportSize({ width: 390, height: 420 });
    await p.getByRole("button", { name: "Settings", exact: true }).click();
    await p.screenshot({
      path: "backgammon/test-results/keyboard-short-viewport.png",
      fullPage: true,
    });
    const report = {
      emulation: true,
      realDevice: false,
      touchSourceDestination: true,
      longName: true,
      reducedMotion: true,
      effectiveZoom: "683×384 CSS viewport representing 200% at 1366×768",
      keyboardSimulation:
        "390×420 viewport; does not claim a real iOS keyboard",
      interaction: {
        samples: response,
        median: response[15],
        p95: response[28],
        unit: "ms from click dispatch to next animation frame",
      },
    };
    fs.writeFileSync(
      "backgammon/docs/interaction-benchmark.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
