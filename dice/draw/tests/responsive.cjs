// Exercise short screens and real tap/scroll behavior on the published artifact.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { chromium } = require('playwright');
const { launchQuietBrowser } = require('../../../scripts/quiet-browser.cjs');
const { serveSite } = require('../../../scripts/site-pages.cjs');

(async () => {
  const server = await serveSite(path.resolve('_site'));
  const browser = await launchQuietBrowser(chromium);
  const screenshots = path.join(os.tmpdir(), 'draw-dice-responsive');
  fs.mkdirSync(screenshots, { recursive: true });
  try {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    async function visibleTarget(selector) {
      const result = await page.locator(selector).evaluate(el => {
        const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { width: r.width, height: r.height, top: r.top, bottom: r.bottom, hit: el.contains(hit), viewport: innerHeight };
      });
      assert.ok(result.width >= 44 && result.height >= 44, `${selector} has a 44px target: ${JSON.stringify(result)}`);
      assert.ok(result.top >= 0 && result.bottom <= result.viewport + 1 && result.hit, `${selector} is visible and unobscured: ${JSON.stringify(result)}`);
    }
    async function layout() {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page never scrolls sideways');
      if (await page.evaluate(() => innerWidth >= 1000 && innerHeight >= 680)) {
        assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), 'desktop shell fits the viewport');
      }
    }
    const sizes = [[320, 568], [375, 667], [390, 844], [768, 1024], [1024, 768], [1280, 720], [1440, 900], [1920, 1080], [844, 390]];
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.goto(`${server.base}/dice/draw/`);
      await page.evaluate(() => localStorage.clear()); await page.reload();
      for (const n of [2, 5, 7]) {
        await page.locator('#open-settings').click();
        await visibleTarget('#settings-dialog [data-close]'); await visibleTarget('#apply-settings');
        await page.locator('#dice-count').selectOption(String(n));
        await page.locator('#doubling').check();
        await page.locator('#apply-settings').click();
        await page.locator('#roll').click();
        await layout();
        for (let i = 0; i < n; i++) await visibleTarget(`[data-die="${i}"]`);
        for (const style of ['2d', '3d']) {
          await page.locator(`#draw-dice-style [data-dice-style="${style}"]`).click();
          // Returning to play brings the entire tray above a fixed action bar.
          await page.locator('#dice-tray').evaluate(el => {
            const dock = document.querySelector('.action-dock');
            if (getComputedStyle(dock).position === 'fixed') {
              const amount = el.getBoundingClientRect().bottom - dock.getBoundingClientRect().top + 12;
              if (amount > 0) scrollBy(0, amount);
            }
          });
          for (let i = 0; i < n; i++) await visibleTarget(`[data-die="${i}"]`);
          for (const selector of ['#roll', '#stand', '#double', '#solve']) await visibleTarget(selector);
          await page.locator('[data-die="0"]').focus(); await page.keyboard.press('Space');
          assert.equal(await page.locator('[data-die="0"]').getAttribute('aria-pressed'), style === '2d' ? 'true' : 'false');
          await layout();
        }
        if (n === 7) {
          await page.screenshot({ path: path.join(screenshots, `${width}x${height}-play.png`) });
          await page.locator('#solve').click(); await page.locator('#ev-summary').waitFor();
          assert.ok(await page.locator('#ev-summary').evaluate(el => {
            const r = el.getBoundingClientRect(), dock = document.querySelector('.action-dock');
            const bottom = getComputedStyle(dock).position === 'fixed' ? dock.getBoundingClientRect().top : innerHeight;
            return r.top >= 0 && r.bottom <= bottom;
          }), 'solving reveals EV above the dock');
          if (width > 900) {
            await visibleTarget('#roll');
            await visibleTarget('[data-die="0"]');
            await visibleTarget('[data-die="6"]');
            assert.equal(await page.evaluate(() => scrollY), 0, 'solving never scrolls the desktop shell');
          }
          await page.screenshot({ path: path.join(screenshots, `${width}x${height}-solve.png`) });
          await page.locator('[data-option]').first().click();
          await page.locator('#open-settings').click();
          assert.ok(await page.locator('#dice-count').isDisabled());
          await visibleTarget('#settings-dialog [data-close]');
          await page.keyboard.press('Escape');
        }
        await page.locator('#stand').click();
        await visibleTarget('[data-die="0"]');
      }
      // Long paytables scroll inside the modal; its close and apply controls stay fixed.
      await page.locator('#open-settings').click();
      await page.locator('#scoring').selectOption('poker');
      await page.locator('#paytable-fields input').last().fill('99');
      await visibleTarget('#settings-dialog [data-close]'); await visibleTarget('#apply-settings');
      await page.screenshot({ path: path.join(screenshots, `${width}x${height}-settings.png`) });
      await page.locator('#apply-settings').click();
      await page.reload();
      assert.equal(await page.locator('#draw-dice-style [data-dice-style="3d"]').getAttribute('aria-pressed'), 'true', 'appearance survives refresh');
      await layout();
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => document.documentElement.style.fontSize = '24px');
    await page.locator('#roll').click(); await layout();
    await visibleTarget('#roll');
    await page.locator('#open-settings').click(); await visibleTarget('#settings-dialog [data-close]');
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    console.log(`Draw Dice responsive checks passed at ${sizes.length} viewports, both dice styles, 2/5/7 dice and enlarged text. Screenshots: ${screenshots}`);
  } finally { await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
