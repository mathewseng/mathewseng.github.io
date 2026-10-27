const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { launchQuietBrowser } = require('../../../scripts/quiet-browser.cjs');
const { serveSite } = require('../../../scripts/site-pages.cjs');

(async () => {
  const engine = await import('../engine.mjs');
  const server = await serveSite(path.resolve('_site'));
  const browser = await launchQuietBrowser(chromium);
  const screenshots = path.join(os.tmpdir(), 'draw-dice-qa');
  fs.mkdirSync(screenshots, { recursive: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      const original = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = array => {
        if (window.testDice?.length) { for (let i = 0; i < array.length; i++) array[i] = window.testDice.shift(); return array; }
        return original(array);
      };
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    const text = id => page.locator(`#${id}`).textContent();
    const snapshot = () => page.evaluate(() => JSON.parse(localStorage.getItem('draw-dice-v1')));
    const seed = faces => page.evaluate(values => { window.testDice = values.map(x => x - 1); }, faces);
    async function configure({ scoring = 'cribbage', n = 5, mode = 'capped', double = false, fee = 10, runs = 'longest' } = {}) {
      await page.locator('#open-settings').click();
      await page.locator('#scoring').selectOption(scoring);
      await page.locator('#dice-count').selectOption(String(n));
      if (scoring !== 'poker') await page.locator('#settlement').selectOption(mode);
      if (scoring === 'cribbage') await page.locator('#runs').selectOption(runs);
      await page.locator('#doubling').setChecked(double);
      if (scoring !== 'poker') await page.locator('#fee').fill(String(fee));
      await page.getByRole('button', { name: 'Apply settings' }).click();
    }
    async function fit() {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
      for (const el of await page.locator('.die-slot, .actions button:visible').all()) {
        const box = await el.boundingBox(); assert.ok(box.width >= 44 && box.height >= 44, 'touch target is at least 44px');
      }
    }
    await page.goto(`${server.base}/dice/`);
    await page.getByRole('link', { name: /Draw Dice Keep your/ }).click();
    await page.locator('#roll').waitFor();
    await page.screenshot({ path: path.join(screenshots, 'desktop-ready.png') });
    assert.equal(await text('hands'), '0');
    await seed([1, 2, 2, 3, 6]); await page.locator('#roll').click();
    assert.equal(Number(await text('score-total')), engine.cribbageScore([1, 2, 2, 3, 6]).points);
    await page.locator('#open-settings').click();
    assert.ok(await page.locator('#dice-count').isDisabled(), 'active rules can be reviewed but not edited');
    assert.ok(await page.locator('#apply-settings').isHidden());
    await page.keyboard.press('Escape');
    await page.keyboard.press('1'); await page.keyboard.press('3');
    assert.equal(await page.locator('[data-die="0"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-die="2"]').getAttribute('aria-pressed'), 'true');
    await page.reload();
    assert.equal(await page.locator('[data-die="0"]').getAttribute('aria-pressed'), 'true', 'active hold persists');
    await page.locator('#solve').click();
    await page.locator('#apply-hold').waitFor();
    assert.match(await text('advice-text'), /Exact net EV/);
    const solvedOpening = engine.solveHand([1, 2, 2, 3, 6], (await snapshot()).config);
    const evText = value => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(3)}`;
    assert.equal(await page.locator('#ev-summary strong').nth(1).textContent(), evText(solvedOpening.best.ev));
    assert.equal(await page.locator('.strategy-table tbody tr').count(), 5);
    await page.locator('#show-options').click();
    const uniqueHolds = new Set(solvedOpening.decisions.map(d => [1, 2, 2, 3, 6].filter((_, i) => d.mask & (1 << i)).sort().join(',')));
    assert.equal(await page.locator('.strategy-table tbody tr').count(), uniqueHolds.size, 'equivalent duplicate-face holds are grouped');
    const openingState = await snapshot();
    for (const style of ['3d', '2d']) {
      await page.locator(`#draw-dice-style [data-dice-style="${style}"]`).click();
      assert.equal(await page.locator('#dice-tray').getAttribute('data-dice-style'), style);
      assert.deepEqual(await snapshot(), openingState, 'appearance does not change the round, holds or PnL');
    }
    await page.locator('.score-group').first().locator('summary').click();
    await page.screenshot({ path: path.join(screenshots, 'desktop-held.png') });
    await seed([5, 5, 5]); await page.locator('#roll').click();
    let saved = await snapshot();
    assert.deepEqual(saved.round.dice, [1, 5, 2, 5, 5]);
    assert.equal(saved.hands, 1);
    assert.equal(await text('strategy-title'), 'Decision review');
    assert.match(await text('strategy-note'), /Opening roll: 1 · 2 · 2 · 3 · 6/);
    assert.equal(await page.locator('#ev-summary strong').nth(1).textContent(), evText(solvedOpening.best.ev), 'review retains opening EV after the dice change');
    const before = saved.pnl;
    await page.reload();
    assert.equal((await snapshot()).pnl, before, 'settled refresh does not pay again');
    assert.equal(await text('hands'), '1');

    await configure({ n: 2, mode: 'net', double: true, fee: 1 });
    await seed([3, 3]); await page.locator('#roll').click();
    await page.locator('#solve').click(); await page.locator('#apply-hold').waitFor();
    if (await page.locator('#show-options').isVisible()) await page.locator('#show-options').click();
    const doubledOption = page.locator('[data-option][data-stake="2"]').first();
    const doubledMask = Number(await doubledOption.getAttribute('data-option'));
    const twoDiceSolution = engine.solveHand([3, 3], (await snapshot()).config);
    const expectedDouble = twoDiceSolution.decisions.find(d => d.mask === doubledMask && d.multiplier === 2);
    await doubledOption.click();
    assert.equal(await page.locator('#ev-summary strong').first().textContent(), evText(expectedDouble.ev));
    assert.deepEqual((await snapshot()).round.held, [0, 1].map(i => !!(doubledMask & (1 << i))));
    assert.equal((await snapshot()).hands, 1, 'selecting a doubled option does not play or charge it');
    assert.match(await text('advice-text'), /Choose Double & reroll/);
    // Restore the fixture's empty hold before exercising the explicit double action.
    for (let i = 0; i < 2; i++) if ((await snapshot()).round.held[i]) await page.locator(`[data-die="${i}"]`).click();
    await page.locator('[data-die="0"]').click();
    await page.locator('[data-die="1"]').click();
    assert.ok(await page.locator('#double').isDisabled(), 'all held cannot double');
    await page.locator('[data-die="1"]').click();
    await seed([3]); await page.locator('#double').click();
    saved = await snapshot();
    assert.equal(saved.round.result.net, 2);
    assert.equal(saved.round.result.multiplier, 2);
    assert.equal(saved.pnl, before + 2);
    assert.match(await text('payout-preview'), /\(2 − 1\) × 2 = \+2/);

    // Every scoring family, count, and actual assembled worker.
    for (const scoring of ['cribbage', 'poker', 'yahtzee']) {
      for (let n = 2; n <= 7; n++) {
        await configure({ scoring, n, double: true });
        const faces = Array.from({ length: n }, (_, i) => i % 6 + 1);
        await seed(faces); await page.locator('#roll').click();
        saved = await snapshot();
        assert.equal(Number(await text('score-total')), engine.scoreHand(faces, saved.config).points);
        assert.equal(await page.locator('.die-slot').count(), n);
        if (n === 7) {
          await page.locator('#solve').click(); await page.locator('#apply-hold').waitFor();
          const solved = engine.solveHand(faces, saved.config);
          await page.locator('#apply-hold').click();
          assert.deepEqual((await snapshot()).round.held, faces.map((_, i) => !!(solved.best.mask & (1 << i))));
        }
        if (scoring === 'poker') assert.ok(await page.locator('.paytable-reference').isVisible(), 'paytable remains readable during play');
        await page.locator('#stand').click();
        assert.equal((await snapshot()).round.result.multiplier, 1, 'keep all remains single stake');
      }
    }
    // Invalid fees cannot save, and edited category payouts survive switching.
    await configure({ scoring: 'poker', n: 5 });
    await page.locator('#open-settings').click();
    await page.locator('[data-payout="run-5"]').fill('123');
    await page.getByRole('button', { name: 'Apply settings' }).click();
    await seed([1, 2, 3, 4, 5]); await page.locator('#roll').click();
    assert.equal(await text('score-total'), '123'); await page.locator('#stand').click();
    await configure();
    await page.locator('#open-settings').click();
    await page.locator('#fee').fill('-1'); await page.getByRole('button', { name: 'Apply settings' }).click();
    assert.ok(await page.locator('#settings-dialog').isVisible());
    await page.locator('#fee').fill('17');
    await page.locator('#doubling').check();
    // A saved target variant may have its own fee; use a fresh run variant to
    // verify a toggle never resets the newly entered fee unnecessarily.
    await page.locator('#runs').selectOption('all');
    await page.locator('#fee').fill('17'); await page.locator('#doubling').uncheck();
    assert.equal(await page.locator('#fee').inputValue(), '17');
    await page.keyboard.press('r');
    assert.equal((await snapshot()).round, null, 'shortcuts do not fire inside settings');
    await page.getByRole('button', { name: 'Apply settings' }).click();
    await configure({ scoring: 'poker', n: 5 });
    assert.equal((await snapshot()).config.payouts['run-5'], 123, 'per-variant payouts persist');

    await configure({ n: 5, double: true });
    await seed([1, 2, 2, 3, 6]); await page.locator('#roll').click();
    await page.locator('[data-die="1"]').click(); await page.locator('[data-die="2"]').click();
    for (const width of [375, 320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await fit();
      if (width === 1440) assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), 'desktop app fits the viewport');
      if (width === 375) await page.screenshot({ path: path.join(screenshots, 'phone-held.png'), fullPage: true });
    }
    await page.locator('#stand').click();
    await page.setViewportSize({ width: 375, height: 812 });
    await configure({ n: 7, double: true });
    await seed([1, 2, 2, 3, 4, 5, 6]); await page.locator('#roll').click();
    await fit(); await page.screenshot({ path: path.join(screenshots, 'phone-seven.png'), fullPage: true });
    await page.locator('#stand').click(); await page.locator('#open-settings').click();
    await page.screenshot({ path: path.join(screenshots, 'phone-settings.png'), fullPage: true });
    await page.keyboard.press('Escape');
    assert.ok(!(await page.locator('#settings-dialog').isVisible()));

    // Animation locks duplicate clicks, and hiding the tab ends the lock.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const handsBefore = (await snapshot()).hands;
    await seed([6, 6, 6, 6, 6, 6, 6]);
    await page.evaluate(() => { document.getElementById('roll').click(); document.getElementById('roll').click(); });
    assert.equal((await snapshot()).hands, handsBefore);
    await page.waitForFunction(() => !document.getElementById('roll').disabled);
    await seed([3, 3, 3, 3, 3, 3, 3]);
    await page.evaluate(() => { document.getElementById('double').click(); document.getElementById('double').click(); });
    assert.equal((await snapshot()).hands, handsBefore + 1);
    await page.reload();
    assert.equal((await snapshot()).hands, handsBefore + 1, 'reload during animation retains only one settlement');
    await page.locator('#reset-session').click();
    assert.equal(await text('pnl'), '0'); assert.equal(await text('hands'), '0');
    await page.evaluate(() => localStorage.setItem('draw-dice-v1', '{bad json'));
    await page.reload(); await page.locator('#roll').click();
    assert.equal((await snapshot()).round.phase, 'hold', 'corrupt storage recovers');

    // A preference chosen on either game also updates an already-open dice tab.
    const other = await context.newPage();
    await other.goto(`${server.base}/dice/reports/`);
    await other.waitForFunction(() => /^(Complete|Partial) search/.test(document.getElementById('search-status').textContent));
    await other.locator('#play-selected').click();
    assert.equal(await other.locator('#play-dice-style [data-dice-style="2d"]').getAttribute('aria-pressed'), 'true');
    const beforeStyleChange = await snapshot();
    await other.locator('#play-dice-style [data-dice-style="3d"]').click();
    await page.waitForFunction(() => document.getElementById('dice-tray').dataset.diceStyle === '3d');
    assert.deepEqual(await snapshot(), beforeStyleChange, 'cross-tab display changes preserve the active hand');
    await page.reload();
    assert.equal(await page.locator('#draw-dice-style [data-dice-style="3d"]').getAttribute('aria-pressed'), 'true');
    await other.close();

    const blocked = await browser.newContext({ reducedMotion: 'reduce' });
    await blocked.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('Storage blocked'); }; });
    const memoryPage = await blocked.newPage();
    await memoryPage.goto(`${server.base}/dice/draw/`); await memoryPage.locator('#roll').click();
    await memoryPage.locator('#stand').click();
    assert.equal(await memoryPage.locator('#hands').textContent(), '1');
    assert.ok(await memoryPage.locator('#storage-note').isVisible());
    await blocked.close();
    assert.deepEqual(errors, []);
    console.log(`Draw Dice browser checks passed. Screenshots: ${screenshots}`);
  } finally { await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
