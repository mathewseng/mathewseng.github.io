const assert = require('node:assert/strict');
const E = require('../engine.js');
const S = require('../solver.js');

module.exports = async function checkBadeuceyRules(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const lab = () => page.locator('[data-view="lab"]').click();
  const play = () => page.locator('[data-view="play"]').click();
  const apply = () => page.locator('#pay-form button[type="submit"]').click();
  const select = (id, value) => page.locator('#rule-' + id).selectOption(String(value));
  try {
    await page.goto(base + '/poker/video-poker/');
    assert.equal(await page.locator('#variant optgroup').first().getAttribute('label'), 'Custom variants');
    assert.deepEqual(await page.locator('#variant optgroup').first().locator('option').evaluateAll(es => es.map(e => e.value)), ['low27', 'badeucey']);
    await page.locator('#variant').selectOption('badeucey');
    await page.waitForFunction(() => document.getElementById('return-value').textContent === '62.8248%');
    assert.equal(await page.locator('#paytable .group-label').count(), 3);
    await lab();
    assert.equal(await page.locator('.payout-group').count(), 3);
    for (const key of ['lowT', 'badT']) {
      assert.equal(await page.locator('#pay-' + key).inputValue(), '0');
      assert.equal(await page.locator('#pay-' + key).getAttribute('step'), '1');
    }
    await select('min-badugi', 3);
    assert.match(await page.locator('#edit-status').textContent(), /Unapplied/);
    await apply();
    assert.equal(await page.locator('#lab-rtp').textContent(), 'Not solved', 'rule changes invalidate the original RTP');
    await page.locator('#solve-all').click();
    await page.waitForFunction(() => document.getElementById('solve-status').textContent.startsWith('Complete'), {}, { timeout: 60000 });
    assert.equal(await page.locator('#lab-rtp').textContent(), '105.9994%');
    await page.reload();
    await page.locator('#variant').selectOption('badeucey');
    await lab();
    assert.equal(await page.locator('#rule-min-badugi').inputValue(), '3');
    assert.equal(await page.locator('#lab-rtp').textContent(), 'Not solved');
    await select('min-badugi', 0);
    assert.ok(await page.locator('#rule-badugi-rank').isDisabled());
    await select('min-badugi', 4);
    assert.ok(await page.locator('#rule-badugi-rank').isEnabled());
    await select('five-card', 'any');
    await select('low-rank', 10);
    await select('badugi-rank', 7);
    await page.locator('#pay-lowT').fill('2');
    await page.locator('#pay-badT').fill('1');
    await apply();
    await page.screenshot({ path: '/tmp/video-poker-badeucey-rules.png', fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: '/tmp/video-poker-badeucey-rules-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });

    // Settle a paired hand under relaxed rules and compare its decision review to the same configuration.
    const initial = E.parseHand('7s 5h 4d 3c 3s');
    const variant = { ...E.byId.badeucey, pays: { ...E.byId.badeucey.pays, lowT: 2, badT: 1 }, rules: E.normalizeBadeuceyRules({ fiveCard: 'any', maxLowRank: 10, maxBadugiRank: 7 }) };
    const choices = S.solveHand(initial, variant);
    await page.evaluate(cards => {
      VideoPoker.shuffledDeck = () => [...cards, ...Array.from({ length: 52 }, (_, i) => i).filter(c => !cards.includes(c))];
    }, initial);
    await play();
    await page.locator('#deal').click();
    for (let i = 0; i < 5; i++) await page.locator(`[data-card="${i}"]`).click();
    await lab();
    assert.ok(await page.locator('#rule-five-card').isDisabled());
    assert.ok(await page.locator('#pay-form button[type="submit"]').isDisabled());
    await play();
    await page.locator('#deal').click();
    assert.equal(await page.locator('#last-return').textContent(), '5', 'paired hand earns the push and four-card badugi points only');
    await page.locator('#decision-ev').waitFor({ timeout: 30000 });
    assert.equal(Number(await page.locator('#decision-ev').getAttribute('data-ev')), 5);
    assert.ok(Math.abs(Number(await page.locator('#best-decision-ev').getAttribute('data-ev')) - choices[0].ev) < 1e-10);
    await lab();
    await page.locator('[data-recommend="badeucey"]').click();
    assert.equal(await page.locator('#rule-five-card').inputValue(), 'high-card');
    assert.equal(await page.locator('#rule-min-badugi').inputValue(), '4');
    assert.equal(await page.locator('#rule-low-rank').inputValue(), '14');
    assert.equal(await page.locator('#rule-badugi-rank').inputValue(), '14');
    assert.equal(await page.locator('#pay-lowT').inputValue(), '0');
    assert.equal(await page.locator('#lab-rtp').textContent(), '98.8783%');
    await page.locator('#reset-pays').click();
    assert.equal(await page.locator('#lab-rtp').textContent(), '62.8248%');

    // Existing saved custom paytables survive the addition of two new award fields.
    await page.evaluate(() => {
      const pays = { ...VideoPoker.byId.badeucey.pays, low9: 3 };
      delete pays.lowT;
      delete pays.badT;
      localStorage.setItem('video-poker-paytables-v1', JSON.stringify({ badeucey: pays }));
    });
    await page.reload();
    await page.locator('#variant').selectOption('badeucey');
    await lab();
    assert.equal(await page.locator('#pay-low9').inputValue(), '3');
    assert.equal(await page.locator('#pay-lowT').inputValue(), '0');
    assert.equal(await page.locator('#pay-badT').inputValue(), '0');
    assert.deepEqual(errors, []);
    console.log('Badeucey rules passed: custom dropdown, grouped integer awards, rule-sensitive EV, persistence, live-hand locking, relaxed settlement, reset, recommendations and migration.');
  } finally {
    await page.close();
  }
};
