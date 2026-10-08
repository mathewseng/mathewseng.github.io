// Exercise the assembled GitHub Pages artifact, including module-worker loading.
const { chromium } = require("playwright");
const { launchQuietBrowser } = require("../../../scripts/quiet-browser.cjs");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve("_site");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let file = path.resolve(root, "." + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!url.pathname.endsWith("/")) {
      res.writeHead(301, { Location: url.pathname + "/" + url.search });
      res.end();
      return;
    }
    file = path.join(file, "index.html");
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
    });
    res.end(data);
  });
});
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await launchQuietBrowser(chromium);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      reducedMotion: "reduce",
    });
    // Stub only this test browser's entropy to exercise each visible result.
    await context.addInitScript(() => {
      const original = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = (array) => {
        if (window.diceTestValues?.length) {
          for (let i = 0; i < array.length; i++)
            array[i] = window.diceTestValues.shift();
          return array;
        }
        return original(array);
      };
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400)
        errors.push(`${response.status()} ${response.url()}`);
    });
    const screenshotDir = path.join(
      require("node:os").tmpdir(),
      "dice-reports-qa",
    );
    fs.mkdirSync(screenshotDir, { recursive: true });
    async function ready() {
      await page.waitForFunction(() =>
        /^(Complete|Partial) search/.test(
          document.querySelector("#search-status").textContent,
        ),
      );
    }
    async function filters(action) {
      await page.locator('[data-open="filters-dialog"]').click();
      await action();
      await page.waitForTimeout(300);
      await page.locator('[data-close="filters-dialog"]').last().click();
      await ready();
    }
    async function fit() {
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "No page horizontal overflow",
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight,
        ),
        "Workspace fits viewport",
      );
    }
    async function roll(faces, payout, label) {
      await page.evaluate(
        (values) => (window.diceTestValues = values),
        faces.map((face) => face - 1),
      );
      await page.locator("#roll-button").click();
      await page.waitForFunction(
        () => !document.querySelector("#roll-button").disabled,
      );
      assert.equal(
        await page.locator("#result-payout").textContent(),
        payout === 0 ? "Push" : `${payout > 0 ? "+" : ""}${payout} units`,
      );
      assert.equal(await page.locator("#result-label").textContent(), label);
      assert.deepEqual(
        await page
          .locator(".die")
          .evaluateAll((dice) => dice.map((el) => Number(el.dataset.face))),
        faces,
      );
      assert.equal(
        await page.locator('#play-paytable [aria-current="true"]').count(),
        1,
      );
    }
    await page.goto(base + "/dice/reports");
    await ready();
    assert.ok(page.url().endsWith("/dice/reports/"));
    await fit();
    assert.equal(await page.locator("#allow-zero").isChecked(), true);
    await filters(async () => {
      await page.locator("#allow-zero").uncheck();
    });
    assert.equal(
      await page
        .locator("#results-body td.payout")
        .evaluateAll((cells) =>
          cells.some((cell) => Number(cell.textContent) === 0),
        ),
      false,
    );
    await filters(async () => {
      await page.locator("#reset-filters").click();
    });
    await page.locator(".rank-button").first().focus();
    await page.keyboard.press("Enter");
    assert.match(await page.locator("#analysis h2").textContent(), /Rank 01/);
    assert.ok(
      await page
        .locator(".rank-button")
        .first()
        .evaluate((el) => document.activeElement === el),
    );
    // Each mode and dice count has the right payout partition and exact proof.
    for (const [mode, lengths] of [
      ["chosen", [3, 4, 5, 6, 7]],
      ["single", [2, 3, 4, 5, 6]],
      ["full", [2, 3, 5, 7, 9]],
    ]) {
      await page.locator(`button[data-mode="${mode}"]`).click();
      await ready();
      for (let dice = 2; dice <= 6; dice++) {
        await page.locator(`[data-n="${dice}"]`).click();
        await ready();
        assert.equal(
          await page.locator("#distribution .outcome").count(),
          lengths[dice - 2],
        );
        assert.equal(
          await page
            .locator("#results-body tr")
            .first()
            .locator(".payout")
            .count(),
          lengths[dice - 2],
        );
        assert.match(
          await page.locator("#analysis").textContent(),
          new RegExp(`= 0 / ${6 ** dice} = 0`),
        );
      }
    }
    assert.deepEqual(
      await page.locator("#distribution .outcome b").allTextContents(),
      [
        "Singles",
        "Pair",
        "2 pair",
        "Trips / boat",
        "3 pair / quads",
        "Quads + pair",
        "2 trips",
        "Quints",
        "Sexts",
      ],
    );
    // Every displayed column toggles both ways, without changing membership.
    const ranks = await page.locator(".rank-button").allTextContents();
    const keys = await page
      .locator("#results-head button")
      .evaluateAll((buttons) => buttons.map((b) => b.dataset.sort));
    for (let column = 0; column < keys.length; column++)
      for (let click = 0; click < 2; click++) {
        const button = page.locator(
          `#results-head [data-sort="${keys[column]}"]`,
        );
        await button.click();
        const asc =
          (await button.locator("..").getAttribute("aria-sort")) ===
          "ascending";
        const values = await page
          .locator("#results-body tr")
          .evaluateAll(
            (rows, column) =>
              rows.map((row) => Number(row.cells[column].textContent)),
            column,
          );
        assert.deepEqual(
          values,
          [...values].sort((a, b) => (asc ? a - b : b - a)),
        );
        assert.deepEqual(
          (await page.locator(".rank-button").allTextContents()).sort(),
          [...ranks].sort(),
        );
      }
    await page.locator("#results-scroll").evaluate((el) => (el.scrollLeft = 0));
    await page.locator(".rank-button").first().click();
    await fit();
    await page.screenshot({
      path: path.join(screenshotDir, "explore-desktop.png"),
    });
    // Fair custom schedule, zero push, grouped outcomes, and PnL across changes.
    await page.locator("#open-checker").click();
    await page.locator("#checker-n").selectOption("4");
    await page.locator("#checker-payouts").fill("-1, 0, 1, 2, 11");
    assert.match(
      await page.locator("#checker-result").textContent(),
      /Exact numerator: 6/,
    );
    await page.locator("#apply-repair").click();
    assert.equal(
      await page.locator("#checker-payouts").inputValue(),
      "-1, 0, 1, 2, 10",
    );
    await page.locator("#play-custom").click();
    await fit();
    assert.equal(await page.locator("#face-picker").isVisible(), false);
    await roll([1, 2, 3, 4], -1, "Singles");
    assert.equal(
      await page.locator("#dice-stage").getAttribute("data-effect"),
      "loss",
    );
    await roll([1, 1, 2, 3], 0, "Pair");
    assert.equal(
      await page.locator("#dice-stage").getAttribute("data-effect"),
      "push",
    );
    await roll([1, 1, 1, 2], 1, "Trips");
    await roll([1, 1, 2, 2], 2, "2 pair");
    assert.equal(await page.locator("#pnl").textContent(), "+2");
    await roll([6, 6, 6, 6], 10, "Quads");
    assert.equal(
      await page.locator("#dice-stage").getAttribute("data-effect"),
      "jackpot",
    );
    assert.equal(await page.locator("#pnl").textContent(), "+12");
    await page.locator("#choose-schedule").click();
    await page.locator(".rank-button").first().click();
    const selectedPayouts = await page
      .locator("#results-body tr.selected .payout")
      .allTextContents();
    await page.locator("#play-selected").click();
    assert.deepEqual(
      await page.locator(".paytable-row strong").allTextContents(),
      selectedPayouts,
    );
    assert.equal(await page.locator("#pnl").textContent(), "+12");
    const selected = selectedPayouts.map(Number);
    await roll([1, 1, 1, 2, 3, 4], selected[3], "Trips / boat");
    await roll([1, 1, 1, 2, 2, 3], selected[3], "Trips / boat");
    await roll([1, 1, 2, 2, 3, 3], selected[4], "3 pair / quads");
    await roll([1, 1, 1, 1, 2, 3], selected[4], "3 pair / quads");
    await roll([1, 1, 1, 1, 2, 2], selected[5], "Quads + pair");
    await roll([1, 1, 1, 2, 2, 2], selected[6], "2 trips");
    // Selection dropdown applies its payouts while keeping PnL.
    const before = await page.locator("#pnl").textContent();
    await page.locator("#play-schedule").selectOption("1");
    assert.equal(await page.locator("#pnl").textContent(), before);
    const alternate = await page
      .locator(".paytable-row strong")
      .last()
      .textContent();
    await roll([6, 6, 6, 6, 6, 6], Number(alternate), "Sexts");
    await page.screenshot({
      path: path.join(screenshotDir, "play-desktop.png"),
    });
    // Actual motion path: no duplicate award, no rule changes while in flight.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const rounds = Number(
      (await page.locator("#round-count").textContent()).split(" ")[0],
    );
    await page.evaluate(() => (window.diceTestValues = [5, 5, 5, 5, 5, 5]));
    await page.locator("#roll-button").click();
    assert.equal(await page.locator("#play-schedule").isDisabled(), true);
    assert.equal(await page.locator("#reset-pnl").isDisabled(), true);
    await page.locator("#roll-button").evaluate((el) => el.click());
    assert.ok(
      await page
        .locator(".die")
        .first()
        .evaluate((el) =>
          getComputedStyle(el).animationName.includes("tumble"),
        ),
    );
    await page.waitForFunction(
      () => !document.querySelector("#roll-button").disabled,
    );
    assert.equal(
      await page.locator("#round-count").textContent(),
      `${rounds + 1} rolls`,
    );
    assert.equal(await page.locator("#particles i").count(), 18);
    await page.emulateMedia({ reducedMotion: "reduce" });
    // Mobile workspaces fit; nine-category paytable scrolls locally on short screens.
    for (const [width, height] of [
      [390, 844],
      [320, 568],
      [768, 1024],
      [1024, 768],
    ]) {
      await page.setViewportSize({ width, height });
      await fit();
      const box = await page.locator("#roll-button").boundingBox();
      assert.ok(box.y + box.height <= height, "Roll action stays visible");
      assert.ok(
        await page.locator("#dice-stage").evaluate((stage) => {
          const area = stage.getBoundingClientRect();
          return [...stage.querySelectorAll(".die")].every((die) => {
            const bounds = die.getBoundingClientRect();
            return bounds.left >= area.left && bounds.right <= area.right;
          });
        }),
        "Every die fits in the table at phone and tablet widths",
      );
      if (width === 390)
        await page.screenshot({
          path: path.join(screenshotDir, "play-mobile.png"),
        });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('button[data-view="explore"]').click();
    await fit();
    await page.screenshot({
      path: path.join(screenshotDir, "explore-mobile.png"),
    });
    await page.locator(".rank-button").first().click();
    assert.equal(await page.locator("#inspector").isVisible(), true);
    await fit();
    assert.ok(
      await page
        .locator("#inspector")
        .evaluate((el) => document.activeElement === el),
    );
    await page.locator("#play-inspected").click();
    await fit();
    await page.locator("#reset-pnl").click();
    assert.equal(await page.locator("#pnl").textContent(), "0");
    assert.equal(await page.locator("#round-count").textContent(), "0 rolls");
    await page.locator('button[data-view="explore"]').click();
    await page.locator('button[data-mode="chosen"]').click();
    await ready();
    await page.locator('[data-n="4"]').click();
    await ready();
    await page.locator("#inspect-feature").click();
    await page.locator("#play-inspected").click();
    await page.locator('[data-face-choice="6"]').click();
    await roll([6, 6, 6, 6], 60, "4 matches");
    assert.equal(await page.locator(".die.match").count(), 4);
    assert.equal(await page.locator("#pnl").textContent(), "+60");
    await page.locator('button[data-view="explore"]').click();
    await page.locator('[data-n="6"]').click();
    await ready();
    await page.locator("#play-selected").click();
    await page.setViewportSize({ width: 320, height: 568 });
    await fit();
    const topPayout = Number(
      await page.locator(".paytable-row strong").last().textContent(),
    );
    await roll([6, 6, 6, 6, 6, 6], topPayout, "6 matches");
    assert.ok(
      await page.locator("#play-paytable").evaluate((el) => {
        const hit = el
          .querySelector('[aria-current="true"]')
          .getBoundingClientRect();
        const viewport = el.getBoundingClientRect();
        return (
          el.scrollTop > 0 &&
          hit.top >= viewport.top &&
          hit.bottom <= viewport.bottom + 1
        );
      }),
      "The latest payout scrolls into view inside the short-phone paytable",
    );
    assert.ok(
      await page
        .locator(".die")
        .first()
        .evaluate((el) => getComputedStyle(el).animationName === "none"),
    );
    await page.locator('button[data-view="explore"]').click();
    await filters(async () => {
      await page.locator("#max-results").fill("5");
    });
    assert.equal(await page.locator("#results-body tr").count(), 5);
    await filters(async () => {
      await page.locator("#strict").uncheck();
      await page.locator("#max-payout").fill("1000000");
    });
    await page.locator('[data-n="6"]').click();
    await ready();
    assert.match(
      await page.locator("#search-status").textContent(),
      /Partial search/,
    );
    await page.locator("#open-checker").click();
    await page.keyboard.press("Escape");
    await filters(async () => {
      await page.locator("#min-p0").fill("1");
      await page.waitForTimeout(300);
      assert.match(
        await page.locator("#filter-error").textContent(),
        /whole numbers|range/,
      );
      await page.locator("#reset-filters").click();
    });
    assert.deepEqual(errors, []);
    console.log(
      `Dice browser checks passed: modes, grouped outcomes, exact repair, filters, both sorts, chosen face, roll locking, PnL, effects, keyboard, desktop/mobile fit. Screenshots: ${screenshotDir}`,
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
