const assert = require("node:assert/strict"),
  path = require("node:path");
module.exports = async function cubeOptions(browser, base, out, name) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(base + "/backgammon/");
    for (const scenario of [
      "offer",
      "best-offer",
      "beaver",
      "raccoon",
      "match",
    ]) {
      const expected = await page.evaluate(async (scenario) => {
        const r = await import("/backgammon/core/rules.mjs");
        const { EngineClient } =
          await import("/backgammon/engine/client.mjs");
        const { gradeCube, cubeChoices } =
          await import("/backgammon/engine/cube-grade.mjs");
        const { decisionReview } =
          await import("/backgammon/ui/decision-review.mjs");
        let source = r.initialState({
          phase: "roll",
          matchLength: scenario === "match" ? 5 : 0,
          rules: {
            jacoby: false,
            automaticDoubles: 0,
            immediateRedoubles: scenario === "match" ? 0 : 2,
          },
        });
        if (!["offer", "best-offer"].includes(scenario))
          source = r.transition(source, { type: "double" }, 0);
        if (scenario === "raccoon")
          source = r.transition(source, { type: "beaver" }, 1);
        const engine = new EngineClient();
        try {
          const raw = await engine.analyze(source, { preset: "quick" });
          const choices = cubeChoices(source, raw);
          const result = gradeCube(
            source,
            raw,
            (scenario === "best-offer" ? choices[0] : choices.at(-1))
              .action,
          );
          decisionReview(source, {
            title: "Cube decision",
            opponent: true,
            onReturn: () => {},
          }).result(result);
          return {
            units: raw.units,
            choices: result.decision.choices.map((c) => ({
              label: c.notation,
              equity: c.equity,
              ev: c.equity * source.cube.value,
              mwc: c.mwc,
            })),
          };
        } finally {
          engine.destroy();
        }
      }, scenario);
      const actions = scenario.includes("offer")
        ? ["Double", "No double"]
        : scenario === "match"
          ? ["Pass", "Take"]
          : [scenario === "beaver" ? "Beaver" : "Raccoon", "Pass", "Take"];
      assert.deepEqual(
        expected.choices.map((c) => c.label).sort(),
        actions.sort(),
      );
      const table = page.locator("[data-cube-options] table");
      await table.waitFor();
      assert.equal(
        await table.locator("tbody tr").count(),
        expected.choices.length + 1,
      );
      const rows = await table.locator("tbody tr").allTextContents();
      for (const [i, c] of expected.choices.entries()) {
        assert.ok(rows[i + 1].includes(c.label));
        const cells = await table
          .locator("tbody tr")
          .nth(i + 1)
          .locator("td")
          .allTextContents();
        assert.ok(Math.abs(Number(cells[0]) - c.equity) < 0.00051);
        if (expected.units === "current-cube-points")
          assert.ok(Math.abs(Number(cells[1]) - c.ev) < 0.00051);
        else
          assert.ok(Math.abs(parseFloat(cells[1]) - c.mwc * 100) < 0.051);
      }
      for (const c of expected.choices) {
        const option = page.getByRole("button", {name: `${c.label}: preview decision`, exact: true});
        await option.click();
        assert.equal(await option.getAttribute("aria-pressed"), "true");
        assert.ok((await page.locator(".decision-caption").innerText()).includes(c.label));
      }
      for (const [width, height] of [
        [320, 568],
        [375, 667],
        [390, 844],
        [430, 932],
        [844, 390],
        [768, 1024],
        [1024, 768],
        [1366, 768],
        [1440, 900],
      ]) {
        await page.setViewportSize({ width, height });
        const widerFont = width === 320 ? await page.addStyleTag({content:".decision-dialog { font-family: Verdana, sans-serif; }"}) : null;
        await page.waitForTimeout(30);
        const fit = await page.getByRole("dialog").evaluate((d) => {
          const r = d.getBoundingClientRect(),
            t = d.querySelector("table").getBoundingClientRect();
          return {
            scroll:
              d.scrollHeight <= d.clientHeight + 1 &&
              d.scrollWidth <= d.clientWidth + 1,
            bottom: t.bottom,
            right: t.right,
            edge: r.right,
            footer: d.querySelector("footer").getBoundingClientRect().top,
          };
        });
        assert.ok(
          fit.scroll &&
            fit.right <= fit.edge &&
            fit.bottom <= fit.footer + 1,
          JSON.stringify({ scenario, width, height, fit }),
        );
        if ([320, 375, 844, 1366].includes(width))
          await page.screenshot({
            path: path.join(
              out,
              `${name}-cube-options-${scenario}-${width}.png`,
            ),
          });
        if (widerFont) await widerFont.evaluate(n=>n.remove());
      }
      await page.keyboard.press("Escape");
    }
    assert.deepEqual(errors, []);
    return {
      browser: name,
      cases: [
        "real cube offer, take/pass/beaver, take/pass/raccoon and match alternatives; equity and original-cube EV",
        "every option in Comparison without modal scrolling at nine viewports",
      ],
    };
  } finally {
    await context.close();
  }
};
