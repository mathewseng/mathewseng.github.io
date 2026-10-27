const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { launchQuietBrowser } = require('../../../scripts/quiet-browser.cjs');
const { serveSite } = require('../../../scripts/site-pages.cjs');
(async () => {
  const { solveHand } = await import('../engine.mjs');
  const server = await serveSite(path.resolve('_site')), browser = await launchQuietBrowser(chromium);
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      const original = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = array => {
        if (!window.testDice?.length) return original(array);
        for (let i = 0; i < array.length; i++) array[i] = window.testDice.shift();
        return array;
      };
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const snapshot = () => page.evaluate(() => JSON.parse(localStorage.getItem('draw-dice-v1')));
    const seed = dice => page.evaluate(values => { window.testDice = values.map(face => face - 1); }, dice);
    const format = value => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(3)}`;
    const label = (dice, mask) => mask === 2 ** dice.length - 1 ? 'Keep all' : mask ? `Hold ${dice.filter((_, i) => mask & (1 << i)).sort((a,b) => a-b).join(' · ')}` : 'Reroll all';
    async function checkCurrent() {
      const saved = await snapshot(), opening = saved.round.phase === 'hold' ? saved.round.dice : saved.round.decision.dice;
      const solved = solveHand(opening, saved.round.config), best = solved.best;
      await page.waitForFunction(expected => document.getElementById('roll-advice').textContent.includes(expected), `Exact net EV ${format(best.ev)} units`);
      assert.ok((await page.locator('#roll-advice').textContent()).includes(`${label(opening, best.mask)} · ${best.multiplier}×`));
      return solved;
    }
    async function checkHistory() {
      const saved = await snapshot();
      await page.waitForFunction(count => document.querySelectorAll('.history-best').length === count, saved.history.length);
      for (let i = 0; i < saved.history.length; i++) {
        const entry = saved.history[i], { decision } = entry, solved = solveHand(decision.dice, entry.config);
        const played = solved.decisions.find(d => d.mask === decision.mask && d.multiplier === decision.multiplier);
        const row = page.locator('.history-row').nth(i);
        assert.equal(await row.locator('.history-best').textContent(), `Best: ${label(decision.dice, solved.best.mask)} · ${solved.best.multiplier}×`);
        assert.deepEqual(await row.locator('.history-evs strong').allTextContents(), [format(solved.best.ev), format(played.ev), Math.max(0, solved.best.ev - played.ev).toFixed(3)]);
        assert.ok((await row.locator('.history-opening').textContent()).includes(decision.dice.join(' · ')));
        assert.equal(await row.locator('.history-dice').textContent(), entry.dice.join(' '));
      }
    }
    await page.goto(`${server.base}/dice/draw/`);
    await page.locator('#open-settings').click(); await page.locator('#doubling').check(); await page.locator('#apply-settings').click();
    await seed([1, 2, 2, 3, 6]); await page.locator('#roll').click();
    await checkCurrent();
    assert.deepEqual((await snapshot()).round.held, Array(5).fill(false), 'automatic advice never chooses the player’s hold');
    await page.locator('[data-die="0"]').click(); await page.locator('[data-die="2"]').click();
    await seed([5, 5, 5]); await page.locator('#double').click();
    assert.deepEqual((await snapshot()).history[0].decision, { dice: [1, 2, 2, 3, 6], mask: 5, multiplier: 2 });
    await checkCurrent(); await checkHistory();
    await page.locator('.history-detail summary').first().click();
    assert.ok(await page.locator('.history-detail table').first().isVisible());
    await seed([6, 6, 6, 6, 6]); await page.locator('#roll').click(); await checkCurrent();
    await page.locator('#stand').click(); await checkHistory();
    assert.equal((await snapshot()).history[0].decision.mask, 31, 'Keep all is recorded even with no marked holds');
    await page.reload(); await checkCurrent(); await checkHistory();
    const archived = await snapshot();
    await page.locator('#open-settings').click(); await page.locator('#scoring').selectOption('yahtzee'); await page.locator('#dice-count').selectOption('7'); await page.locator('#apply-settings').click();
    await seed([1, 2, 2, 3, 4, 5, 6]); await page.locator('#roll').click(); await checkCurrent();
    await checkHistory(); assert.deepEqual((await snapshot()).history, archived.history, 'past advice continues to use each entry’s original rules');
    await page.locator('#stand').click(); await checkHistory();
    for (const [width, height] of [[320, 568], [375, 667], [844, 390], [1280, 720]]) {
      await page.setViewportSize({ width, height });
      await page.locator('.history-detail summary').first().click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const summary = await page.locator('.history-detail summary').first().boundingBox();
      assert.ok(summary.height >= 44, 'history details have a touch-sized target');
    }
    // Resolve multiple opening analyses after their rounds have already ended.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#reset-session').click();
    await page.locator('#open-settings').click(); await page.locator('#scoring').selectOption('cribbage'); await page.locator('#dice-count').selectOption('5'); await page.locator('#doubling').check(); await page.locator('#apply-settings').click();
    await page.route('**/dice/draw/worker.js', async route => { await new Promise(resolve => setTimeout(resolve, 300)); await route.continue(); });
    await page.reload();
    const a = [1, 2, 3, 4, 5], drawn = [6, 6, 6, 6, 6], b = [2, 2, 2, 3, 3], c = [1, 1, 4, 5, 6];
    await seed([...a, ...drawn, ...b, ...c]);
    await page.evaluate(() => {
      const click = id => document.getElementById(id).click();
      click('roll'); click('double'); click('roll'); click('stand'); click('roll');
    });
    const rapid = await snapshot();
    assert.equal(rapid.hands, 2); assert.deepEqual(rapid.round.dice, c);
    await checkCurrent(); await checkHistory();
    assert.deepEqual(await snapshot(), rapid, 'late advice never changes sampled dice, settlement or the current hand');
    assert.deepEqual(rapid.history.map(h => h.decision.dice), [b, a]);
    await page.reload(); await checkCurrent(); await checkHistory();
    // Legacy or invalid decision metadata must not invent an opening roll.
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('draw-dice-v1'));
      delete saved.history[0].decision; saved.history[1].decision.mask = 999;
      localStorage.setItem('draw-dice-v1', JSON.stringify(saved));
    });
    await page.reload(); await checkCurrent();
    assert.equal(await page.locator('.history-best').count(), 0);
    assert.equal(await page.getByText('Opening roll not saved for this older hand.', { exact: true }).count(), 2);
    assert.equal((await snapshot()).pnl, rapid.pnl);
    await page.locator('#stand').click(); await page.locator('#reset-session').click();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.history-row').count(), 0);
    assert.equal((await snapshot()).hands, 0, 'reset cannot be undone by a late analysis');
    await page.unroute('**/dice/draw/worker.js');
    await page.route('**/dice/draw/worker.js', route => route.abort());
    await page.reload(); await page.locator('#roll').click(); await page.locator('#stand').click();
    await page.locator('[data-retry-history]').waitFor();
    await page.unroute('**/dice/draw/worker.js');
    await page.locator('[data-retry-history]').click();
    await checkHistory(); await checkCurrent();
    assert.equal((await snapshot()).hands, 1, 'retrying failed advice never replays a hand');
    assert.deepEqual(errors, []);
    console.log('Automatic advice checks passed: opening recommendations, played/best EVs, saved review, settings changes, delayed workers, legacy entries and responsive history.');
  } finally { await browser.close(); await server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
