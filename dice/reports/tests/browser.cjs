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
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400)
        errors.push(`${response.status()} ${response.url()}`);
    });
    async function ready() {
      await page.waitForFunction(() =>
        /^(Complete|Partial) search/.test(
          document.querySelector("#search-status").textContent,
        ),
      );
    }
    await page.goto(base + "/dice/reports");
    await ready();
    assert.equal(await page.locator("#allow-zero").isChecked(), true);
    const payouts = await page
      .locator("#results-body tr")
      .evaluateAll((rows) =>
        rows.map((row) =>
          [...row.cells].slice(1, 6).map((cell) => Number(cell.textContent)),
        ),
      );
    for (const p of payouts) {
      let divisor = 0;
      for (const value of p) {
        let b = Math.abs(value);
        while (b) [divisor, b] = [b, divisor % b];
      }
      assert.equal(divisor, 1);
    }
    await page.locator("#allow-zero").uncheck();
    await page.waitForTimeout(300);
    await ready();
    assert.equal(
      await page
        .locator("#results-body td.payout")
        .evaluateAll((cells) =>
          cells.some((cell) => Number(cell.textContent) === 0),
        ),
      false,
    );
    await page.locator("#reset-filters").click();
    await ready();
    assert.equal(await page.locator("#allow-zero").isChecked(), true);
    assert.ok(page.url().endsWith("/dice/reports/"));
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
    );
    assert.equal(await page.locator("#distribution .outcome").count(), 5);
    assert.ok(
      (await page.locator("#distribution").textContent()).includes(
        "625 / 1,296",
      ),
    );
    assert.ok(
      (await page.locator("#analysis").textContent()).includes(
        "= 0 / 1296 = 0",
      ),
    );
    const screenshotDir = path.join(
      require("node:os").tmpdir(),
      "dice-reports-qa",
    );
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({
      path: path.join(screenshotDir, "desktop.png"),
      fullPage: true,
    });
    for (const n of [2, 3, 5, 6, 4]) {
      await page.locator(`[data-n="${n}"]`).click();
      await ready();
      assert.equal(await page.locator("#distribution .outcome").count(), n + 1);
      assert.ok((await page.locator("#results-body tr").count()) > 0);
      assert.equal(
        await page.locator(`[data-n="${n}"]`).getAttribute("aria-pressed"),
        "true",
      );
    }
    await page.locator(".rank-button").first().focus();
    await page.keyboard.press("Enter");
    assert.ok(
      (await page.locator("#analysis h2").textContent()).includes("Rank 01"),
    );
    assert.equal(
      await page
        .locator(".rank-button")
        .first()
        .evaluate((el) => document.activeElement === el),
      true,
    );
    await page.locator("#max-payout").fill("59");
    await page.waitForTimeout(300);
    await ready();
    assert.equal(await page.locator("#featured").isVisible(), false);
    await page.locator("#reset-filters").click();
    await ready();
    await page.locator("#open-checker").click();
    await page.locator("#checker-payouts").fill("-2, 1, 3, 12, 61");
    assert.match(
      await page.locator("#checker-result").textContent(),
      /Exact numerator: 1/,
    );
    assert.match(
      await page.locator("#checker-result").textContent(),
      /Player edge/,
    );
    assert.match(
      await page.locator("#checker-result").textContent(),
      /must be \+60/,
    );
    await page.locator("#apply-repair").click();
    assert.match(
      await page.locator("#checker-result").textContent(),
      /Exactly fair/,
    );
    await page.locator("#checker-payouts").fill("-2, 1, 3, 12, 59");
    assert.match(
      await page.locator("#checker-result").textContent(),
      /House edge/,
    );
    await page.locator("#checker-payouts").fill("-4, 2, 8, 14, 20");
    assert.match(
      await page.locator("#checker-result").textContent(),
      /Exactly fair/,
    );
    assert.match(
      await page.locator("#checker-result").textContent(),
      /2× scaled copy/,
    );
    await page.locator("#checker-payouts").fill("-2, 1, 3.5, 12, 59");
    assert.match(
      await page.locator("#checker-result").textContent(),
      /whole numbers/,
    );
    await page.locator("#checker-n").selectOption("2");
    await page
      .locator("#checker-payouts")
      .fill("-9007199254740993, 0, 225179981368524826");
    assert.match(
      await page.locator("#checker-result").textContent(),
      /Exact numerator: 1/,
    );
    assert.match(
      await page.locator("#checker-result").textContent(),
      /must be \+225179981368524825/,
    );
    assert.match(
      await page.locator("#checker-result").textContent(),
      /Outside current filters/,
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#checker-dialog").isVisible(), false);
    await page.locator("#min-p0").fill("1");
    await page.waitForTimeout(300);
    assert.ok((await page.locator("#filter-error").textContent()).length > 0);
    assert.equal(await page.locator("#results-body tr").count(), 0);
    await page.locator("#reset-filters").click();
    await ready();
    await page.locator("#max-results").fill("5");
    await page.waitForTimeout(300);
    await ready();
    assert.equal(await page.locator("#results-body tr").count(), 5);
    await page.locator("#ranking").selectOption("jackpot");
    await ready();
    const maximums = await page
      .locator("#results-body tr")
      .evaluateAll((rows) =>
        rows.map((row) => Number(row.cells[6].textContent)),
      );
    assert.deepEqual(
      maximums,
      [...maximums].sort((a, b) => b - a),
    );
    await page.locator('[data-n="6"]').click();
    await ready();
    await page.locator("#strict").uncheck();
    await page.locator("#max-payout").fill("1000000");
    await page.waitForTimeout(350);
    // Opening the checker while a broad worker search runs proves the UI stays responsive.
    const t = Date.now();
    await page.locator("#open-checker").click();
    assert.ok(Date.now() - t < 1200);
    await page.keyboard.press("Escape");
    await ready();
    assert.match(
      await page.locator("#search-status").textContent(),
      /Partial search/,
    );
    await page.locator("#max-payout").fill("900000");
    await page.waitForTimeout(300);
    await page.locator('[data-n="2"]').click();
    await page.locator("#reset-filters").click();
    await ready();
    assert.equal(await page.locator("#distribution .outcome").count(), 3);
    await page.locator('[data-n="4"]').click();
    await ready();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await ready();
    assert.equal(
      await page.locator("#filters-disclosure").getAttribute("open"),
      null,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: path.join(screenshotDir, "mobile.png"),
      fullPage: true,
    });
    await page.locator(".rank-button").first().click();
    assert.equal(
      await page
        .locator("#inspector")
        .evaluate((el) => document.activeElement === el),
      true,
    );
    await page.locator("#open-checker").click();
    assert.ok(
      await page
        .locator("#checker-dialog")
        .evaluate((el) => el.getBoundingClientRect().width <= innerWidth),
    );
    await page.keyboard.press("Escape");
    await page.locator("#filters-disclosure summary").click();
    await page.locator("#allow-zero").check();
    await page.waitForTimeout(300);
    await ready();
    assert.ok((await page.locator("#results-body tr").count()) > 0);
    await page.locator("#math-reference summary").click();
    assert.equal(await page.locator("#all-weights tr").count(), 5);
    await page.locator('[data-n="6"]').click();
    await ready();
    await page.locator("#max-payout").fill("1000000");
    await page.locator("#ranking").selectOption("jackpot");
    await ready();
    await page.locator(".rank-button").first().click();
    for (const width of [320, 768, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      `Dice browser checks passed: route, worker, filters, rankings, exact checker/repair, responsiveness, keyboard, mobile. Screenshots: ${screenshotDir}`,
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
