const assert = require("node:assert/strict"),
  path = require("node:path");
module.exports = async function reviewRanked(browser, base, out, name) {
  const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      hasTouch: true,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(base + "/backgammon/");
    const expected = await page.evaluate(async () => {
      const r = await import("/backgammon/core/rules.mjs"),
        { EngineClient } = await import("/backgammon/engine/client.mjs"),
        { decisionReview } = await import("/backgammon/ui/decision-review.mjs");
      const source = r.initialState({
          phase: "move",
          dice: [3, 1],
          matchLength: 0,
        }),
        engine = new EngineClient();
      try {
        const result = await engine.analyze(source, { preset: "quick" });
        window.reviewFixture = { source, result, decisionReview };
        decisionReview(source, {
          title: "Move review",
          onReplay: () => {},
          onReturn: () => {},
        }).result({ ...result, actual: result.candidates.at(-1) });
        return result.candidates
          .slice(0, 10)
          .map((c) => ({ notation: c.notation, equity: c.equity }));
      } finally {
        engine.destroy();
      }
    });
    assert.equal(expected.length, 10);
    assert.equal(await page.locator("#undo-play-best").count(), 1);
    const sizes = [
      [320, 568],
      [375, 667],
      [390, 844],
      [430, 932],
      [844, 390],
      [768, 1024],
      [1024, 768],
      [1366, 768],
      [1440, 900],
    ];
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(50);
      await page
        .getByRole("button", { name: "Comparison", exact: true })
        .click();
      const visited = new Set();
      for (let p = 0; p < 12; p++) {
        const rows = page.locator(".review-move");
        const ranks = await rows.evaluateAll((ns) =>
          ns.map((n) => +n.dataset.rank),
        );
        ranks.forEach((r) => visited.add(r));
        const fit = await page.getByRole("dialog").evaluate((d) => ({
          scroll:
            d.scrollHeight > d.clientHeight + 1 ||
            d.scrollWidth > d.clientWidth + 1,
          rows: d.querySelector(".review-moves").getBoundingClientRect().bottom,
          footer: d.querySelector("footer").getBoundingClientRect().top,
        }));
        if (fit.scroll || fit.rows > fit.footer + 1)
          await page.screenshot({
            path: path.join(out, `${name}-ranked-overflow-${width}.png`),
          });
        assert.ok(
          !fit.scroll && fit.rows <= fit.footer + 1,
          JSON.stringify({ width, height, fit }),
        );
        const rank = ranks[0];
        await rows.first().click();
        assert.match(
          await page.locator(".decision-caption").innerText(),
          new RegExp(`Move ${rank} ·`),
        );
        assert.ok(
          (await page.locator(".decision-caption").innerText()).includes(
            expected[rank - 1].notation,
          ),
        );
        await page
          .getByRole("button", { name: "Comparison", exact: true })
          .click();
        if (
          !(await page
            .getByRole("button", { name: "Next moves", exact: true })
            .isVisible()) ||
          (await page
            .getByRole("button", { name: "Next moves", exact: true })
            .isDisabled())
        )
          break;
        await page
          .getByRole("button", { name: "Next moves", exact: true })
          .click();
      }
      // Resize can retain the previous page; return to page one and traverse all.
      while (
        (await page
          .getByRole("button", { name: "Previous moves", exact: true })
          .isVisible()) &&
        !(await page
          .getByRole("button", { name: "Previous moves", exact: true })
          .isDisabled())
      )
        await page
          .getByRole("button", { name: "Previous moves", exact: true })
          .click();
      for (let p = 0; p < 12; p++) {
        (
          await page
            .locator(".review-move")
            .evaluateAll((ns) => ns.map((n) => +n.dataset.rank))
        ).forEach((r) => visited.add(r));
        if (
          !(await page
            .getByRole("button", { name: "Next moves", exact: true })
            .isVisible()) ||
          (await page
            .getByRole("button", { name: "Next moves", exact: true })
            .isDisabled())
        )
          break;
        await page
          .getByRole("button", { name: "Next moves", exact: true })
          .click();
      }
      assert.equal(visited.size, 10);
      while (
        (await page
          .getByRole("button", { name: "Previous moves", exact: true })
          .isVisible()) &&
        !(await page
          .getByRole("button", { name: "Previous moves", exact: true })
          .isDisabled())
      )
        await page
          .getByRole("button", { name: "Previous moves", exact: true })
          .click();
      await page.screenshot({
        path: path.join(out, `${name}-ranked-review-${width}.png`),
      });
    }
    await page.getByRole("button", { name: "Best move", exact: true }).click();
    assert.equal(
      await page.locator('.review-move[aria-pressed="true"]').count(),
      1,
    );
    await page.getByRole("button", { name: "Position", exact: true }).click();
    assert.equal(
      await page.locator('.review-move[aria-pressed="true"]').count(),
      0,
    );
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const { source, result, decisionReview } = reviewFixture;
      decisionReview(source, { onReplay: () => {} }).result({
        ...result,
        actual: result.candidates[0],
      });
    });
    assert.equal(
      await page.locator("#undo-play-best").count(),
      0,
      "best played needs no corrective action",
    );
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => {
      const { source, result, decisionReview } = reviewFixture;
      decisionReview(source).result({
        ...result,
        actual: result.candidates[0],
        evaluatedCount: result.candidates.length,
        candidates: result.candidates.slice(0, 1),
      });
    });
    await page.waitForFunction(
      () =>
        document.querySelector(".review-move-heading strong")?.textContent ===
        "Top 10 moves",
    );
    assert.match(await page.locator(".decision-content").innerText(), /Fresh/);
    assert.ok(
      await page
        .getByRole("dialog")
        .evaluate(
          (d) =>
            d.scrollHeight <= d.clientHeight + 1 &&
            d.querySelector(".review-moves").getBoundingClientRect().bottom <=
              d.querySelector(".decision-layout").getBoundingClientRect()
                .bottom,
        ),
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.body).touchAction),
      "manipulation",
    );
    assert.equal(
      await page.evaluate(
        () =>
          getComputedStyle(document.body).userSelect ||
          getComputedStyle(document.body).webkitUserSelect,
      ),
      "none",
    );
    const heading = await page.locator("h1").boundingBox();
    await page.mouse.move(heading.x, heading.y + heading.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      heading.x + heading.width,
      heading.y + heading.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();
    assert.equal(await page.evaluate(() => getSelection().toString()), "");
    assert.deepEqual(errors, []);
    return {
      browser: name,
      viewports: sizes.length,
      realEngine: true,
      candidates: 10,
    };
  } finally {
    await context.close();
  }
};
