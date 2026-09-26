const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright");

const base = process.env.OFC_EV_TEST_URL || "http://localhost:8000/ofc/fantasyland-ev/";
const output = process.env.OFC_EV_SCREENSHOTS || "/tmp/ofc-extended-ev-screenshots";
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  try {
    for (const [width, height] of [[1440, 900], [390, 844], [430, 932]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(base);
      for (const variant of ["badeucey", "bdp", "high", "low", "cribbage"]) {
        await page.locator(`label:has(input[name="variant"][value="${variant}"])`).click();
        const extended = ["badeucey", "bdp"].includes(variant);
        const expected = extended ? 21 : 15;
        assert.equal(await page.locator("#matrix-body tr").count(), expected);
        assert.equal(await page.locator("#ev-chart .chart-row").count(), expected);
        assert.equal(await page.locator("#repeat-source-chart .repeat-source-row").count(), expected);
        assert.equal(await page.locator("#distribution-chart .distribution-row").count(), expected);
        assert.equal(await page.locator("#deck-matrix-body tr").count(), extended ? 14 : 10);
        assert.equal(await page.locator("#joker-probability-body tr").count(), extended ? 14 : 10);
        assert.match(await page.locator("#matrix-meta").innerText(), /10,000 samples\/config/);
        assert.ok(!/NaN|Infinity|undefined/.test(await page.locator("main").innerText()));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "no page-wide horizontal overflow");
        if (width < 680) {
          const heading = await page.locator("#matrix-title").boundingBox();
          const metadata = await page.locator("#matrix-meta").boundingBox();
          assert.ok(metadata.y >= heading.y + heading.height, "mobile matrix metadata sits below the title");
          assert.ok(heading.height < 45, "matrix title is not squeezed into a narrow column");
        }
        for (const cards of extended ? [13, 18, 19] : [13]) for (const jokers of [0, 1, 2]) {
          const row = page.locator(`#matrix-body tr[data-config="${cards}-${jokers}"]`);
          assert.equal(await row.locator('[data-value="samples"]').innerText(), "10,000");
          const expectedEv = await page.evaluate(({ variant, cards, jokers }) => window.OFCFantasylandPrecomputed.results[variant][`${cards}-${jokers}`].immediate, { variant, cards, jokers });
          assert.equal(Number(await row.locator('[data-value="immediate"]').innerText()), Number(expectedEv.toFixed(2)));
        }
        await page.locator('button[aria-label="Show repeat details for 13 cards and 2 jokers"]').click();
        assert.match(await page.locator("#repeat-source-detail").innerText(), /13 cards \/ 2 jokers/);
        await page.locator("#repeat-source-panel").screenshot({ path: `${output}/${variant}-${width}-repeats.png` });
        await page.locator('section[aria-labelledby="matrix-title"]').screenshot({ path: `${output}/${variant}-${width}-matrix.png` });
        if (["low", "badeucey", "cribbage"].includes(variant)) {
          await page.locator('label:has(#top-repeat-jacks-plus)').click();
          const expectedRepeat = await page.evaluate((variant) => window.OFCFantasylandPrecomputed.topRepeatJacksPlusResults[variant]["13-2"].repeatRate, variant);
          const actual = await page.locator('#matrix-body [data-config="13-2"] [data-value="repeat"]').innerText();
          assert.equal(actual, `${(expectedRepeat * 100).toFixed(1)}%`);
          assert.equal(await page.locator("#matrix-body tr").count(), expected);
          await page.reload();
          await page.locator(`label:has(input[name="variant"][value="${variant}"])`).click();
          assert.equal(await page.locator("#top-repeat-jacks-plus").isChecked(), true);
          assert.equal(await page.locator("#ev-chart .chart-row").count(), expected, "cached data retains extended rows");
          await page.locator('label:has(#top-repeat-jacks-plus)').click();
        }
      }
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`EV rendering, data, toggles and layout passed at ${width}x${height}`);
    }
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
