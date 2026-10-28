// Exercise startup failures, recovery, and an indefinitely stalled result request.
const assert = require('node:assert/strict'), path = require('node:path');
const { chromium } = require('playwright'), { launchQuietBrowser } = require('../../scripts/quiet-browser.cjs');
const { serveSite } = require('../../scripts/site-pages.cjs');
(async () => {
  const server = await serveSite(path.resolve(process.env.SCOUNDREL_SITE || '_site')), browser = await launchQuietBrowser(chromium);
  try {
    for (const failure of ['script-once', 'results-once', 'script-blocked', 'results-stalled', 'missing-resize-observer']) {
      const page = await browser.newPage(); let requests = 0;
      const pattern = failure.startsWith('script') ? '**/reports/statistics.js?*' : '**/outcomes.json?*';
      if (failure === 'missing-resize-observer') await page.addInitScript(() => { delete window.ResizeObserver; });
      await page.route(pattern, route => {
        if (failure === 'missing-resize-observer') return route.continue();
        requests++;
        if (failure.endsWith('once') && requests > 1) return route.continue();
        if (failure === 'results-stalled') return; // Fetch must abort, never wait forever.
        return route.abort();
      });
      await page.goto(server.base + '/scoundrel/reports/', { waitUntil: 'domcontentloaded' });
      if (failure.endsWith('once') || failure === 'missing-resize-observer') {
        await page.locator('#report-content').waitFor({ state: 'visible' });
        if (failure.endsWith('once')) assert.equal(requests, 2);
        assert.equal(await page.locator('#loading').isVisible(), false);
      } else {
        await page.locator('#retry-report').waitFor({ state: 'visible', timeout: 30000 });
        if (failure.endsWith('once')) assert.equal(requests, 2);
        assert.equal(await page.locator('#report-content').isVisible(), false);
        assert.ok((await page.locator('#loading').innerText()).includes('could not load'));
        await page.unroute(pattern); await page.locator('#retry-report').click();
        await page.locator('#report-content').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#proof-rate').innerText(), '100,000');
      }
      await page.close(); console.log(failure + ': recovery passed');
    }
  } finally { await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
