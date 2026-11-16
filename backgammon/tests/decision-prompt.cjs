const assert = require('node:assert/strict');

module.exports = async (browser, base) => {
  const context = await browser.newContext({viewport:{width:430,height:932},hasTouch:true,serviceWorkers:'block'});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(base + '/backgammon/');
    await page.evaluate(async () => {
      const {decisionPrompt} = await import('/backgammon/ui/decision-prompt.mjs');
      const {el,button} = await import('/backgammon/ui/shell.mjs');
      const container = el('div', {id:'review-fixture'});
      document.body.append(container);
      window.reviewActions = [];
      window.openReview = () => {
        const copy = el('p', {role:'status'}, 'Still calculating EV…');
        const prompt = decisionPrompt('Review before confirming?', copy,
          ['Hint','Play best','Reset','Play anyway'].map(label => button(label, () => {
            reviewActions.push(label); prompt.close();
          })), {container,checker:true});
        window.reviewFixture = {prompt,copy,closes:0};
        prompt.addEventListener('close', () => reviewFixture.closes++);
      };
      openReview();
    });
    const inline = page.locator('.inline-decision-review');
    await inline.waitFor();
    assert.equal(await page.locator('dialog[open]').count(), 0);
    assert.equal(await inline.getAttribute('role'), 'region');
    for (const [width,height] of [[320,568],[375,667],[390,844],[430,932]]) {
      await page.setViewportSize({width,height});
      const sizes = await inline.locator('.dialog-foot button').evaluateAll(nodes => nodes.map(n => {
        const r = n.getBoundingClientRect(); return {width:r.width,height:r.height};
      }));
      assert.ok(sizes.every(r => r.width >= 44 && r.height >= 48));
      assert.ok(await inline.evaluate(n => n.scrollWidth <= n.clientWidth + 1));
    }
    await page.evaluate(() => reviewFixture.copy.textContent = 'EV lost 0.125 vs the best play.');
    await inline.getByRole('button', {name:'Play best',exact:true}).focus();
    await page.setViewportSize({width:844,height:390});
    await page.locator('dialog[open] .decision-prompt').waitFor();
    assert.ok(await page.evaluate(() => document.querySelector('dialog[open]').contains(reviewFixture.prompt)));
    assert.equal(await page.evaluate(() => reviewFixture.closes), 0, 'rotation never revises or commits');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Play best');
    await page.setViewportSize({width:430,height:932});
    await inline.waitFor();
    await page.waitForFunction(() => !document.documentElement.classList.contains('bg-dialog-open'));
    assert.equal(await inline.locator('[role="status"]').textContent(), 'EV lost 0.125 vs the best play.');
    for (const label of ['Hint','Play best','Reset','Play anyway']) {
      await inline.getByRole('button', {name:label,exact:true}).click();
      assert.equal(await page.evaluate(() => reviewFixture.closes), 1);
      assert.ok(await page.locator('#review-fixture').isHidden());
      await page.evaluate(() => openReview());
    }
    assert.deepEqual(await page.evaluate(() => reviewActions), ['Hint','Play best','Reset','Play anyway']);
    await inline.focus();
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => reviewFixture.closes), 1);
    assert.deepEqual(errors, []);
    return {inlinePortrait:true,rotatesWithoutChangingDecision:true,allActions:true,minimumTarget:48};
  } finally { await context.close(); }
};
