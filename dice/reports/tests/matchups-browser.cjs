const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

module.exports = async function checkMatchups(page, base, screenshotDir) {
  // Start a fresh document: adding only a fragment to the previous URL would
  // preserve the preceding suite's open dialog and session state.
  await page.goto("about:blank");
  await page.goto(base + "/dice/reports/#matchups");
  await page.locator("#match-result").waitFor();
  assert.equal(await page.locator("#explore-workspace").isVisible(), false);
  assert.deepEqual(
    await page.locator(".match-metrics strong").allTextContents(),
    ["44.37%", "11.27%", "44.37%"],
  );
  assert.match(
    await page.locator(".match-metrics small").nth(1).textContent(),
    /146 \/ 1,296 = 73\/648/,
  );
  assert.equal(await page.locator("#match-featured-body tr").count(), 48);
  assert.equal(await page.locator("[data-match-roll]").count(), 36);
  assert.equal(await page.locator("#match-margin-chart rect").count(), 21);
  assert.match(
    await page
      .locator("#match-margin-thresholds tbody tr")
      .nth(1)
      .textContent(),
    /44.37%.*575\/1296.*44.37%/,
  );
  await page.locator("#match-jump-featured").click();
  assert.equal(
    await page
      .locator("#match-featured-title")
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page
    .locator('#match-featured-body [data-match-a="sum"][data-match-b="sum"]')
    .click();
  await page.screenshot({
    path: path.join(screenshotDir, "matchups-desktop.png"),
  });

  await page.locator("#match-b").selectOption("max");
  assert.equal(
    await page.locator(".match-metrics strong").first().textContent(),
    "75.69%",
  );
  await page.locator("#match-a").selectOption("max");
  await page.locator("#match-b").selectOption("avg");
  assert.deepEqual(
    await page.locator(".match-metrics strong").allTextContents(),
    ["66.44%", "8.33%", "25.23%"],
  );
  await page.locator("#match-handicap").fill("0.5");
  const beforeSwap = await page
    .locator(".match-metrics strong")
    .allTextContents();
  await page.locator("#match-swap").click();
  assert.deepEqual(
    await page.locator(".match-metrics strong").allTextContents(),
    [...beforeSwap].reverse(),
  );
  assert.equal(await page.locator("#match-handicap").inputValue(), "-0.5");
  await page.locator("#match-handicap").fill("0.3");
  assert.equal(await page.locator("#match-error").isVisible(), true);
  await page.locator("#match-reset").click();
  await page.locator("#match-b").selectOption("plus2");
  await page.locator("#match-balance").click();
  assert.equal(await page.locator("#match-handicap").inputValue(), "2");
  assert.deepEqual(
    await page.locator(".match-metrics strong").allTextContents(),
    ["44.37%", "11.27%", "44.37%"],
  );
  await page.locator("#match-reset").click();
  assert.equal(await page.locator("#match-error").isVisible(), false);
  await page.locator("#match-handicap").fill("36");
  assert.equal(
    await page.locator(".match-metrics strong").first().textContent(),
    "100.00%",
  );
  assert.match(
    await page.locator("#match-handicap-note").textContent(),
    /outside the chart/,
  );
  await page.locator("#match-reset").click();
  await page.locator("#match-handicap-slider").focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator("#match-handicap").inputValue(), "0.5");
  assert.equal(
    await page.locator(".match-metrics strong").nth(1).textContent(),
    "0.00%",
  );
  await page.locator('[data-match-roll="35"]').click();
  assert.match(
    await page.locator("#match-roll-detail").textContent(),
    /36\/36 wins/,
  );
  await page.locator("#match-reset").click();
  await page.locator('[data-match-roll="0"]').click();
  assert.match(
    await page.locator("#match-roll-detail").textContent(),
    /0\/36 wins.*1\/36 ties.*35\/36 losses/,
  );
  const selection = await page.locator("#selection-name").textContent();
  await page.keyboard.press("ArrowDown");
  assert.equal(
    await page.locator("#selection-name").textContent(),
    selection,
    "Matchup keys do not select hidden payout rows",
  );

  await page.locator('[data-match-tab="catalogue"]').click();
  assert.equal(await page.locator("#match-catalogue-body tr").count(), 1024);
  assert.equal(await page.locator("#match-matrix button").count(), 144);
  await page.screenshot({
    path: path.join(screenshotDir, "matchups-matrix-desktop.png"),
  });
  await page.locator("#match-matrix-metric").selectOption("ties");
  assert.equal(
    await page
      .locator('#match-matrix [data-match-a="sum"][data-match-b="sum"]')
      .textContent(),
    "11.3",
  );
  await page.locator("#match-matrix-scope").selectOption("all");
  assert.equal(await page.locator("#match-matrix button").count(), 1024);
  assert.equal(
    await page
      .locator(
        '#match-matrix [data-match-a="doubles-only"][data-match-b="doubles-only"]',
      )
      .textContent(),
    "69.9",
  );
  await page.locator("#match-matrix-scope").selectOption("core");
  await page.locator("#match-matrix-metric").selectOption("wins");
  await page.locator("#match-search").fill("product");
  assert.equal(await page.locator("#match-catalogue-body tr").count(), 183);
  await page.locator("#match-search").fill("no-such-rule");
  assert.equal(await page.locator("#match-catalogue-body tr").count(), 0);
  assert.match(
    await page.locator("#match-catalogue-status").textContent(),
    /No matches/,
  );
  await page.locator("#match-search").fill("");
  await page.locator("#match-filter").selectOption("balanced");
  const balanced = await page.locator("#match-catalogue-body tr").count();
  assert.ok(balanced >= 32 && balanced < 1024);
  await page.locator("#match-filter").selectOption("all");
  await page.locator("#match-sort").selectOption("ties");
  const ties = (
    await page
      .locator("#match-catalogue-body td:nth-child(3)")
      .allTextContents()
  ).map(parseFloat);
  assert.deepEqual(
    ties,
    [...ties].sort((a, b) => b - a),
  );
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#match-download").click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "two-dice-matchups.csv");
  const csv = await fs.readFile(await download.path(), "utf8");
  assert.equal(csv.split("\r\n").length, 1025);
  assert.match(csv, /"Doubles score zero"/);
  assert.match(csv, /"sum"/i);
  await page
    .locator('#match-matrix [data-match-a="product"][data-match-b="sum"]')
    .click();
  assert.equal(await page.locator("#match-a").inputValue(), "product");
  assert.equal(await page.locator("#match-b").inputValue(), "sum");
  assert.deepEqual(
    await page.locator(".match-metrics strong").allTextContents(),
    ["61.65%", "5.17%", "33.18%"],
  );
  assert.equal(
    await page.locator("#matchups-workspace").evaluate((el) => el.scrollTop),
    0,
  );

  await page.locator('[data-match-tab="events"]').click();
  assert.equal(await page.locator("#match-events li").count(), 123);
  await page.screenshot({
    path: path.join(screenshotDir, "matchups-events-desktop.png"),
  });
  await page.locator("#match-event-search").fill("At least one 6");
  assert.equal(await page.locator("#match-events li").count(), 1);
  assert.match(await page.locator("#match-events li").textContent(), /30.56%/);
  await page.locator("#match-event-search").fill("");

  await page.locator('[data-match-tab="four"]').click();
  assert.equal(await page.locator("#match-four-events li").count(), 29);
  assert.deepEqual(
    await page.locator("#match-agreement-summary strong").allTextContents(),
    ["90.74%", "1.54%", "7.72%"],
  );
  assert.equal(await page.locator("#match-agreement-grid td").count(), 9);
  await page.screenshot({
    path: path.join(screenshotDir, "matchups-four-desktop.png"),
  });
  await page.locator("#match-agreement-y").selectOption("avg");
  assert.deepEqual(
    await page.locator("#match-agreement-summary strong").allTextContents(),
    ["100.00%", "0.00%", "0.00%"],
  );
  await page.locator("#match-agreement-y").selectOption("product");
  await page.locator("#match-four-search").fill("Same pair, either order");
  assert.equal(await page.locator("#match-four-events li").count(), 1);
  assert.match(
    await page.locator("#match-four-events li").textContent(),
    /5.09%.*11\/216.*66 \/ 1,296/,
  );
  await page.locator("#match-four-search").fill("no-such-event");
  assert.equal(await page.locator("#match-four-events li").count(), 0);
  await page.locator("#match-four-search").fill("");

  for (const width of [760, 390, 320]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    for (const name of ["compare", "play", "catalogue", "events", "four"]) {
      await page.locator(`[data-match-tab="${name}"]`).click();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${name} has no page overflow at ${width}`,
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight,
        ),
        `${name} fits viewport at ${width}`,
      );
      assert.ok(
        await page
          .locator("#matchups-workspace")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
        `${name} only scrolls designated tables horizontally at ${width}`,
      );
      await page
        .locator("#matchups-workspace")
        .evaluate((el) => (el.scrollTop = 0));
      if (width === 390)
        await page.screenshot({
          path: path.join(screenshotDir, `matchups-${name}-mobile.png`),
        });
    }
    await page.locator('[data-view="explore"]').click();
    assert.equal(await page.locator("#matchups-workspace").isVisible(), false);
    await page.locator('[data-view="matchups"]').click();
    assert.equal(await page.locator("#matchups-workspace").isVisible(), true);
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await require("./matchup-play-browser.cjs")(page, screenshotDir);
};
