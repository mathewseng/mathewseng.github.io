const { launchQuietBrowser } = require("../../scripts/quiet-browser.cjs");
const assert = require("node:assert/strict");
module.exports = async function research(browser, base, output) {
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(base + "/backgammon/");
    const checks = await page.evaluate(async () => {
      const { EngineClient } = await import("/backgammon/engine/client.mjs");
      const { initialState, legalTurns } =
        await import("/backgammon/core/rules.mjs");
      const fixtures = (
        await (await fetch("/backgammon/data/exercises.json")).json()
      ).items;
      const e = new EngineClient(),
        s = fixtures.find((f) => f.topic === "race").state;
      const whole = await e.analyze(s, { rollout: { trials: 64, seed: 7788 } });
      e.cache.clear();
      let cp;
      let cancelled = false;
      try {
        await e.analyze(s, {
          rollout: { trials: 256, seed: 7788 },
          onProgress: (value) => {
            cp = value;
            e.cancel();
          },
        });
      } catch (err) {
        cancelled = err.name === "AbortError";
      }
      const resumed = await e.analyze(s, {
        rollout: { trials: 64, seed: 7788, resume: cp },
      });
      if (!cancelled || cp.completed !== 32)
        throw new Error("Real batch cancellation failed");
      for (const c of whole.candidates) {
        const r = resumed.candidates.find((v) => v.key === c.key);
        if (
          !r ||
          r.samples !== c.samples ||
          Math.abs(r.equity - c.equity) > 1e-6 ||
          Math.abs(r.standardError - c.standardError) > 1e-6
        )
          throw new Error(
            "Resumed samples differ beyond floating-point cache tolerance",
          );
      }
      let invalid = false;
      try {
        await e.analyze(s, { rollout: { trials: 64, seed: 999, resume: cp } });
      } catch {
        invalid = true;
      }
      if (!invalid) throw new Error("Cross-seed checkpoint accepted");
      const different = await e.analyze(s, {
        rollout: { trials: 64, seed: 5 },
      });
      if (different.candidates[0].equity === whole.candidates[0].equity)
        throw new Error("Random seed ignored");
      const match = { ...s, matchLength: 5, scores: [2, 3] };
      const r = await e.analyze(match, { rollout: { trials: 64, seed: 44 } });
      if (
        r.units !== "normalized-match-equity" ||
        !r.candidates.every(
          (c) => Number.isFinite(c.mwc) && c.mwc >= 0 && c.mwc <= 1,
        )
      )
        throw new Error("Match rollout units");
      const mirror = {
        ...s,
        points: [...s.points].reverse().map((n) => -n),
        bar: [...s.bar].reverse(),
        off: [...s.off].reverse(),
        turn: 1 - s.turn,
        cube: {
          ...s.cube,
          owner: s.cube.owner === null ? null : 1 - s.cube.owner,
        },
      };
      const reversed = await e.analyze(mirror, {
        rollout: { trials: 64, seed: 7788 },
      });
      if (
        Math.abs(reversed.candidates[0].equity - whole.candidates[0].equity) >
        0.00002
      )
        throw new Error("Rollout perspective reversal");
      const cube = fixtures.find((f) => f.topic === "cube").state;
      const cr = await e.analyze(cube, { rollout: { trials: 64, seed: 88 } });
      if (
        !cr.outcomeSE.every((n) => Number.isFinite(n) && n >= 0) ||
        cr.outcomeSE[2] !== 0
      )
        throw new Error("Cube sampling error");
      const bearoff = fixtures.find((f) => f.topic === "bearoff").state;
      const turn = legalTurns(bearoff).at(-1);
      for (const preset of ["expert", "research"]) {
        const d = await e.analyze(bearoff, { preset, submitted: turn.steps });
        if (!d.actual || d.settings.plies < 3 || !d.screening)
          throw new Error("Selective submitted move missing");
      }
      e.destroy();
      return {
        cp: cp.completed,
        whole: whole.candidates[0].equity,
        match: r.candidates[0].mwc,
        cube: cr.action,
      };
    });
    console.log("Real research engine checks", checks);
    // Automatic Quick -> Deep uses actual worker results, with navigation-safe cancellation.
    const url = await page.evaluate(async () => {
      const { shareURL } = await import("/backgammon/core/xgid.mjs");
      const { initialState } = await import("/backgammon/core/rules.mjs");
      return shareURL(
        initialState({ phase: "move", dice: [3, 1], matchLength: 0 }),
      );
    });
    await page.goto(url);
    await page.waitForFunction(
      () =>
        document.querySelector("#analyze")?.textContent === "Analyze" &&
        document.querySelector("#message")?.textContent.includes("· Deep") &&
        !!document.querySelector("#analysis-comparison"),
    );
    assert.ok(await page.locator("#analysis-comparison").count());
    await page.screenshot({
      path: output + "/solver-auto-desktop.png",
      fullPage: true,
    });
    await page.locator("#rollout-controls summary").click();
    await page.getByLabel("Rollout trials per alternative").selectOption("64");
    await page.locator("#start-rollout").click();
    await page.waitForFunction(
      () =>
        document
          .querySelector(".engine-status")
          ?.textContent.includes("trials per alternative"),
      {},
      { timeout: 60000 },
    );
    await page.locator("#analyze").click();
    await page.reload();
    await page.waitForFunction(
      () =>
        document.querySelector("#analyze")?.textContent === "Analyze" &&
        document.querySelector("#message")?.textContent.includes("· Deep") &&
        !!document.querySelector("#analysis-comparison"),
    );
    await page.locator("#rollout-controls summary").click();
    assert.match(
      await page.locator("#start-rollout").textContent(),
      /saved trials/,
    );
    await page.getByLabel("Rollout trials per alternative").selectOption("64");
    await page.locator("#start-rollout").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#analyze")?.textContent === "Analyze" &&
        document
          .querySelector("#panel")
          ?.textContent.includes("64 trials per alternative"),
      {},
      { timeout: 60000 },
    );
    assert.equal(await page.locator("#inspector").evaluate(n => n.scrollTop), 0);
    await page.screenshot({
      path: output + "/solver-rollout-desktop.png",
      fullPage: true,
    });
    await page.goto(base + "/backgammon/play/");
    await page
      .getByLabel("Computer strength", { exact: true })
      .selectOption("quick");
    assert.equal(
      await page.getByLabel("Hint & review strength").inputValue(),
      "deep",
    );
    await page.getByLabel("Hint & review strength").selectOption("standard");
    assert.equal(
      await page.getByLabel("Computer strength", { exact: true }).inputValue(),
      "quick",
    );
    await page.goto(base + "/backgammon/reports/");
    await page.waitForFunction(() =>
      document.querySelector("#speed-content table"),
    );
    assert.equal(await page.locator("#acceleration-content tbody tr").count(), 7);
    assert.equal(page.workers().length, 0, "recorded reports do not start analysis workers");
    for (const name of ["chromium", "firefox", "webkit"]) {
      await page.getByLabel("Browser", {exact:true}).selectOption(name);
      await page.getByLabel("Analysis setting", {exact:true}).selectOption("standard");
      await page.getByLabel("Cache condition", {exact:true}).selectOption("warm");
      assert.match(await page.locator("#acceleration-content caption").innerText(), new RegExp(name + ".*Standard.*native caches warm"));
    }
    await page.getByLabel("Browser", {exact:true}).selectOption("chromium");
    await page.getByLabel("Analysis setting", {exact:true}).selectOption("deep");
    await page.getByLabel("Cache condition", {exact:true}).selectOption("cold");
    assert.equal(await page.locator(".error").count(), 0);
    await page.screenshot({
      path: output + "/report-desktop.png",
      fullPage: true,
    });
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [844, 390],
      [768, 1024],
    ]) {
      await page.setViewportSize({ width, height });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.screenshot({
        path: `${output}/report-${width}.png`,
        fullPage: true,
      });
    }
    await page
      .getByRole("button", { name: "Run measurement" })
      .scrollIntoViewIfNeeded();
    await page.getByLabel("Setting", { exact: true }).selectOption("quick");
    await page.getByRole("button", { name: "Run measurement" }).click();
    await page.waitForSelector("#device-result table");
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
};
if (require.main === module) {
  const fs = require("node:fs"),
    browsers = require("playwright");
  (async () => {
    fs.mkdirSync("backgammon/test-results/research", { recursive: true });
    const name = process.env.BG_BROWSERS || "chromium";
    const b = await launchQuietBrowser(browsers[name]);
    try {
      await module.exports(
        b,
        process.env.BG_BASE_URL || "http://127.0.0.1:8878",
        "backgammon/test-results/research",
      );
    } finally {
      await b.close();
    }
  })().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
