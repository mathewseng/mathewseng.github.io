// Stateful browser regression: review the committed hold, never the final hand.
const assert = require('node:assert/strict');
const E = require('../engine.js');
const S = require('../solver.js');

module.exports = async function checkDecisionReview(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let workers = 0;
  page.on('worker', () => workers++);
  const initial = E.parseHand('As Ks Qs Js 2d');
  const choices = S.solveHand(initial, E.byId.jacks);
  const chosen = choices.find(row => row.mask === 16);
  const best = choices[0];
  const waitReview = () => page.locator('#decision-ev').waitFor({ timeout: 30000 });
  const value = id => page.locator('#' + id).getAttribute('data-ev').then(Number);
  try {
    await page.goto(base + '/poker/video-poker/');
    await page.evaluate(cards => {
      VideoPoker.shuffledDeck = () => [...cards, ...Array.from({ length: 52 }, (_, i) => i).filter(c => !cards.includes(c))];
    }, initial);
    await page.locator('#deal').click();
    await page.locator('[data-card="4"]').click();
    await page.locator('#deal').click();
    await waitReview();
    assert.ok(Math.abs(await value('decision-ev') - chosen.ev) < 1e-10);
    assert.ok(Math.abs(await value('best-decision-ev') - best.ev) < 1e-10);
    assert.ok(Math.abs(await value('decision-loss') - (best.ev - chosen.ev)) < 1e-10);
    assert.match(await page.locator('#strategy-status').textContent(), /Original deal: As Ks Qs Js 2d/);
    assert.match(await page.locator('#decision-summary').textContent(), /2d/);
    assert.equal(await page.locator('.strategy-row.chosen').getAttribute('data-mask'), '16');
    assert.equal(await page.locator('.strategy-row').count(), 6, 'chosen hold stays visible outside the top five');
    assert.equal(await page.locator('#hold-best').isDisabled(), true);
    await page.locator('#show-all').click();
    assert.equal(await page.locator('.strategy-row').count(), 32);
    await page.locator('#show-all').click();
    await page.screenshot({ path: '/tmp/video-poker-decision-review.png', fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: '/tmp/video-poker-decision-review-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });

    // An already solved hand is reused; the selected hold can change after solving.
    await page.locator('#deal').click();
    assert.equal(await page.locator('#decision-summary').isHidden(), true);
    await page.locator('#solve-hand').click();
    await page.waitForFunction(() => document.querySelectorAll('.strategy-row').length === 5, {}, { timeout: 30000 });
    assert.equal(workers, 1, 'the next hand reuses the indexed worker');
    await page.locator('#hold-best').click();
    const countBeforeDraw = workers;
    await page.locator('#deal').click();
    await waitReview();
    assert.equal(workers, countBeforeDraw, 'drawing reuses the pre-draw solution');
    assert.ok(Math.abs(await value('decision-ev') - best.ev) < 1e-10);
    assert.equal(await value('decision-loss'), 0);
    assert.match(await page.locator('#decision-summary').textContent(), /Optimal decision/);

    // Stop an automatic review by starting another hand; stale replies must not appear.
    await page.locator('#deal').click();
    await page.locator('#deal').click();
    await page.locator('#deal').click();
    await page.locator('#solve-hand').click();
    await page.waitForFunction(() => document.querySelectorAll('.strategy-row').length === 5, {}, { timeout: 30000 });
    assert.equal(await page.locator('#decision-summary').isHidden(), true);
    assert.equal(await page.locator('#strategy-title').textContent(), 'The best decision');
    assert.equal(await page.locator('#variant').isDisabled(), true);
    assert.equal(workers, 1, 'stale review cancellation retains the same hand index');
    assert.deepEqual(errors, []);
    console.log('Decision review passed: automatic exact EV, original-deal snapshot, chosen alternative, cached optimal hold, responsive summary, and stale-review cancellation.');
  } finally {
    await page.close();
  }
};
