const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { launchQuietBrowser } = require('../../../scripts/quiet-browser.cjs');
const { serveSite } = require('../../../scripts/site-pages.cjs');
(async () => {
  const { rulesEV } = await import('../rules-ev.mjs');
  const { settings } = await import('../engine.mjs');
  const server = await serveSite(path.resolve('_site')), browser = await launchQuietBrowser(chromium);
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const format = v => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(3)}`;
    const draft = async () => settings(await page.evaluate(() => {
      const value = id => document.getElementById(id).value;
      return { n: Number(value('dice-count')), scoring: value('scoring'), settlement: value('settlement'), fee: Number(value('fee')), runs: value('runs'), doubling: document.getElementById('doubling').checked,
        payouts: Object.fromEntries([...document.querySelectorAll('[data-payout]')].map(el => [el.dataset.payout, Number(el.value)])) };
    }));
    async function previewMatches() {
      const c = await draft(), result = rulesEV(c);
      const mode = c.scoring === 'poker' ? 'paytable' : c.settlement;
      const profile = result.profiles.find(p => p.mode === mode), expected = format(c.doubling ? profile.doubleEV : profile.singleEV);
      await page.waitForFunction(expected => document.getElementById('rules-ev-preview').dataset.state === 'ready' && document.getElementById('rules-ev-value').textContent === expected, expected);
      assert.equal(await page.locator('#rules-comparison-body tr').count(), result.profiles.length);
      for (const p of result.profiles) for (const doubled of [false, true]) {
        const el = page.locator(`[data-mode="${p.mode}"][data-double="${doubled}"]`);
        assert.ok((await el.textContent()).startsWith(format(doubled ? p.doubleEV : p.singleEV)));
        assert.equal(await el.getAttribute('aria-current'), p.mode === mode && doubled === c.doubling ? 'true' : null);
      }
      assert.match(await page.locator('#rules-ev-value').getAttribute('title'), /\d+ \/ \d+ net units per hand/);
      return expected;
    }
    await page.goto(`${server.base}/dice/draw/`);
    await page.waitForFunction(() => document.getElementById('game-ev').dataset.state === 'ready');
    const initial = await page.locator('#game-ev').textContent();
    assert.match(initial, /\+1\.362/);
    await page.locator('#open-settings').click();
    for (const scoring of ['cribbage', 'poker', 'yahtzee']) {
      await page.locator('#scoring').selectOption(scoring);
      for (let n = 2; n <= 7; n++) {
        await page.locator('#dice-count').selectOption(String(n));
        if (scoring !== 'poker') await page.locator('#fee').fill('8');
        for (const doubled of [false, true]) {
          await page.locator('#doubling').setChecked(doubled);
          await previewMatches();
        }
      }
    }
    assert.equal(await page.locator('#game-ev').textContent(), initial, 'draft rules never change the active game EV');
    await page.locator('#scoring').selectOption('cribbage');
    await page.locator('#dice-count').selectOption('5');
    await page.locator('#fee').fill('10');
    await page.locator('#runs').selectOption('longest'); const longest = await previewMatches();
    await page.locator('#runs').selectOption('all'); const all = await previewMatches();
    assert.notEqual(longest, all);
    for (const fee of ['0', '200', '3', '17']) await page.locator('#fee').fill(fee);
    await previewMatches();
    await page.locator('#fee').fill('');
    await page.waitForFunction(() => document.getElementById('rules-ev-value').textContent === 'Enter valid values');
    assert.equal(await page.locator('#rules-comparison-body tr').count(), 0, 'invalid drafts never display a stale EV');
    await page.locator('#fee').fill('4.5');
    await page.waitForFunction(() => document.getElementById('rules-ev-value').textContent === 'Enter valid values');
    await page.locator('#fee').fill('5');
    await previewMatches();
    await page.locator('#scoring').selectOption('poker');
    const beforeCustom = await previewMatches();
    await page.locator('[data-payout="pair"]').fill('123');
    const custom = await previewMatches(); assert.notEqual(beforeCustom, custom);
    await page.locator('#apply-settings').click();
    await page.waitForFunction(expected => document.getElementById('game-ev').textContent.includes(expected), custom);
    await page.locator('#roll').click(); await page.locator('#solve').click(); await page.locator('#ev-summary').waitFor();
    assert.ok((await page.locator('#game-ev').textContent()).includes(custom), 'a particular roll and its solution never replace rules EV');
    await page.locator('#open-settings').click(); assert.ok(await page.locator('#dice-count').isDisabled()); await previewMatches();
    for (const [width, height] of [[320, 568], [375, 667], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.locator('.rules-comparison').evaluate(el => el.scrollIntoView({ block: 'start' }));
      assert.ok(await page.locator('#settings-dialog [data-close]').evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }), 'scrolling to comparisons never scrolls the modal header away');
      const box = await page.locator('#rules-ev-preview').boundingBox();
      assert.ok(box.y >= 0 && box.y + box.height <= height, `rules EV stays visible in a short-screen dialog: ${width}×${height} ${JSON.stringify(box)}`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.keyboard.press('Escape'); await page.locator('#stand').click();
    await page.reload(); await page.waitForFunction(expected => document.getElementById('game-ev').textContent.includes(expected), custom);
    await page.locator('#open-settings').click(); await page.locator('#scoring').selectOption('yahtzee'); await previewMatches();
    await page.keyboard.press('Escape'); assert.ok((await page.locator('#game-ev').textContent()).includes(custom));
    await page.locator('#open-settings').click(); assert.equal(await page.locator('#scoring').inputValue(), 'poker'); await previewMatches();
    assert.deepEqual(errors, []);
    console.log('Rules EV browser checks passed: every scorer/count, both stakes and modes, custom payouts, invalid drafts, stale results, active-hand review, persistence and small screens.');
  } finally { await browser.close(); await server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
