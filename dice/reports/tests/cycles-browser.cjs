const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async function checkCycles(page, base, screenshotDir) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/dice/reports/#cycles");
  await page.locator("#cycle-title").waitFor();
  assert.equal(
    await page
      .locator('[data-match-tab="cycles"]')
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(await page.locator("button[data-cycle-id]").count(), 36);
  assert.equal(
    await page.locator("#cycle-title").textContent(),
    "High, sum & low",
  );
  assert.deepEqual(
    await page.locator(".cycle-wins > strong").allTextContents(),
    ["50.23%", "50.23%", "57.25%"],
  );
  assert.deepEqual(
    await page.locator(".cycle-ties > strong").allTextContents(),
    ["0.00%", "0.00%", "0.00%"],
  );
  assert.deepEqual(
    await page.locator(".cycle-wins > .match-exact").allTextContents(),
    ["217/432", "217/432", "371/648"],
  );
  await page.screenshot({
    path: path.join(screenshotDir, "cycles-desktop.png"),
  });
  const ids = await page
    .locator("button[data-cycle-id]")
    .evaluateAll((els) => els.map((el) => el.dataset.cycleId));
  // Every report button loads that edge's exact rules and exact odds into Play.
  for (const id of ids) {
    await page.locator(`button[data-cycle-id="${id}"]`).click();
    for (let edge = 0; edge < 3; edge++) {
      const expected = await page
        .locator(`[data-cycle-edge="${edge}"] td > strong`)
        .allTextContents();
      await page.locator(`[data-cycle-play="${edge}"]`).click();
      assert.deepEqual(
        await page
          .locator('[id^="match-play-exact-"]:not(#match-play-exact-bar)')
          .allTextContents(),
        expected,
        id,
      );
      assert.equal(
        await page.locator("#match-play-handicap").inputValue(),
        "0",
      );
      assert.equal(await page.locator("#match-play-roll").isEnabled(), true);
      await page.locator("#cycle-play-back").click();
      assert.equal(
        await page.locator("#cycle-detail").getAttribute("data-cycle-id"),
        id,
      );
    }
  }
  await page.locator('button[data-cycle-id="high-sum-low"]').click();
  await page.locator('[data-cycle-play="0"]').click();
  await page.locator("#match-play-speed").selectOption("instant");
  await page.evaluate(() => {
    window.diceTestValues = [0, 0, 0, 0];
  });
  await page.locator("#match-play-roll").click();
  assert.equal(await page.locator("#match-play-a-score").textContent(), "1");
  assert.equal(
    await page.locator("#match-play-b-score").textContent(),
    "-0.25",
  );
  assert.equal(await page.locator("#match-play-count-wins").textContent(), "1");
  await page.locator("#match-play-compare").click();
  assert.equal(await page.locator("#match-b").inputValue(), "cycle-sum-1-n9");
  assert.equal(
    await page.locator("#match-distribution").locator("svg").count(),
    1,
  );
  assert.ok(
    await page
      .locator("#match-margin-table")
      .textContent()
      .then((t) => t.includes("0.25")),
  );
  await page.locator('[data-match-tab="cycles"]').click();
  await page.locator('[data-cycle-play="0"]').click();
  assert.equal(await page.locator("#match-play-count-wins").textContent(), "1");
  await page.locator("#cycle-play-back").click();
  await page.locator("#cycle-filter").selectOption("no-ties");
  assert.equal(await page.locator("button[data-cycle-id]").count(), 5);
  await page.locator("#cycle-filter").selectOption("whole");
  assert.equal(await page.locator("button[data-cycle-id]").count(), 12);
  await page.locator("#cycle-filter").selectOption("all");
  await page.locator("#cycle-search").fill("impossible-no-match");
  assert.equal(await page.locator("#cycle-detail").isVisible(), false);
  assert.equal(
    await page.locator("#cycle-count").textContent(),
    "0 of 36 cycles",
  );
  await page.locator("#cycle-search").fill("product");
  assert.ok((await page.locator("button[data-cycle-id]").count()) > 0);
  await page.locator("#cycle-search").fill("");
  await page.locator('button[data-cycle-id="one-point-trio"]').click();
  assert.deepEqual(
    await page.locator(".cycle-ties > strong").allTextContents(),
    ["18.21%", "16.20%", "16.20%"],
  );
  await page.locator('button[data-cycle-id="high-sum-low"]').click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page
      .locator("#matchups-workspace")
      .evaluate((el) => (el.scrollTop = 0));
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.ok(
      await page
        .locator("#matchups-workspace")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    );
    await page
      .locator("#cycle-mobile-select")
      .selectOption("whole-number-trio");
    assert.equal(
      await page.locator("#cycle-title").textContent(),
      "The whole-number version",
    );
    await page.locator("#cycle-filter-toggle").click();
    await page.locator("#cycle-filter").selectOption("no-ties");
    assert.equal(await page.locator("#cycle-mobile-select option").count(), 5);
    await page.locator("#cycle-filter").selectOption("all");
    await page.locator("#cycle-filter-toggle").click();
    await page.locator("#cycle-mobile-select").selectOption("high-sum-low");
    await page.locator("#cycle-title").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(screenshotDir, `cycles-${width}.png`),
    });
    await page.locator(".cycle-odds").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(screenshotDir, `cycles-odds-${width}.png`),
    });
    await page.locator('[data-cycle-play="2"]').click();
    assert.equal(
      await page.locator("#match-play-exact-wins").textContent(),
      "57.25%",
    );
    await page.locator("#cycle-play-back").click();
  }
  await page.setViewportSize({ width: 1440, height: 960 });
};
