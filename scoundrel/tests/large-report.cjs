// Scale fixture only: repeat observed score values to stress 100,000-row rendering.
// This synthetic dataset is intercepted in this isolated browser, never published.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const browsers = require("playwright"), { launchQuietBrowser } = require("../../scripts/quiet-browser.cjs"), { serveSite } = require("../../scripts/site-pages.cjs");
const S = require("../reports/statistics.js"), D = require("../scripts/study-data.cjs"), original = require("../reports/outcomes.json");
const first = D.readRows(original, require.resolve("../reports/outcomes.json"), 1)[0], scores = S.studyRows(original).map(r => r.score);
const fixture = { ...original, version: 4, requestedDeals: 100000, completedDeals: 100000, verifiedDeals: 100000, scores: Array.from({ length: 100000 }, (_, i) => scores[i % scores.length]), histories: { ...original.histories, sha256: Array.from({ length: 100 }, (_, i) => original.histories.sha256[i % original.histories.sha256.length]) } };
const summary = S.summarize(S.studyRows(fixture));
(async () => {
  const server = await serveSite(path.resolve(process.env.SCOUNDREL_SITE || "_site"));
  try {
    for (const name of (process.env.SCOUNDREL_BROWSERS || "chromium,webkit").split(",")) {
      const browser = await launchQuietBrowser(browsers[name]);
      try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }), errors = [], historyRequests = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("request", request => { if (request.url().includes("/histories/")) historyRequests.push(request.url()); });
        await page.route("**/outcomes.json?*", route => route.fulfill({ json: fixture }));
        await page.goto(server.base + "/scoundrel/reports/");await page.locator("#report-content").waitFor();
        assert.equal(await page.locator("#proof-rate").innerText(), "100,000");assert.equal(historyRequests.length, 0, "initial report does not download histories");
        assert.equal(await page.locator("#mean").innerText(), summary.mean.toLocaleString("en-US", { maximumFractionDigits: 3 }));
        assert.equal(await page.locator(".chart-group").evaluateAll(es => es.reduce((s, e) => s + Number(e.dataset.count), 0)), 100000);
        for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
          await page.setViewportSize(viewport);await page.evaluate(() => document.fonts.ready);
          await page.waitForFunction(() => Math.abs(document.querySelector("#histogram svg").viewBox.baseVal.width - document.querySelector("#histogram").getBoundingClientRect().width) < 1.1);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
          const clipped = await page.locator(".chart-label,.chart-stat strong,.report-metrics strong,.report-metrics small").evaluateAll(es => es.filter(e => { const r = e.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth + 1; }).map(e => e.textContent));
          assert.deepEqual(clipped, []);
          assert.equal(await page.locator(".chart-reference").count(), 20);
          assert.deepEqual(await page.locator(".chart-reference[data-percentile]").evaluateAll(es => es.map(e => ({ percentile: Number(e.dataset.percentile), value: Number(e.dataset.value) })).sort((a, b) => a.percentile - b.percentile)), summary.percentiles);
          await page.locator("#histogram").focus(); await page.keyboard.press("Home"); await page.keyboard.press("ArrowRight");
          assert.equal(await page.locator("#score-picker").inputValue(), String(summary.min + 1));
          const percentile = fixture.scores.filter(score => score <= summary.min + 1).length / fixture.scores.length * 100;
          assert.equal(Number(await page.locator("#chart-selection").getAttribute("data-percentile")), percentile);
          assert.ok((await page.locator("#chart-caption").innerText()).includes("percentile"));
          await page.keyboard.press("Escape");
          assert.equal(await page.locator("#chart-selection").count(), 0);
          if (process.env.SCOUNDREL_SCREENSHOTS) {
            const folder = process.env.SCOUNDREL_SCREENSHOTS;fs.mkdirSync(folder, { recursive: true });
            await page.locator(".distribution-section").screenshot({ path: path.join(folder, `${name}-100000-chart-${viewport.width}.png`) });
          }
        }
        await page.locator("[data-solution]").first().click();await page.waitForFunction(n => document.querySelectorAll("#solution-line li").length === n, first.line.length);
        assert.equal(historyRequests.length, 1);await page.locator("#close-solution").click();
        await page.locator("[data-solution]").first().click();await page.locator("#solution-line li").first().waitFor();assert.equal(historyRequests.length, 1, "history shard is reused");await page.locator("#close-solution").click();
        await page.locator("#score-picker").selectOption(String(first.score));assert.ok((await page.locator("#deals-body tr td:nth-child(2)").allTextContents()).every(x => Number(x) === first.score));
        await page.locator("#clear-filter").click();
        const event = page.waitForEvent("download");await page.locator("#download").click();const download = await event;
        assert.equal(fs.readFileSync(await download.path(), "utf8").trim().split("\n").length, 100001);
        assert.deepEqual(errors, []);console.log(`${name}: 100,000-row chart, mobile layout, lazy histories and CSV passed`);
      } finally { await browser.close(); }
    }
  } finally { await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
