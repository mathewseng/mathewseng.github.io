const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const { launchQuietBrowser } = require('../../../scripts/quiet-browser.cjs');
const { serveSite } = require('../../../scripts/site-pages.cjs');

(async () => {
  const site = await serveSite(path.resolve(__dirname, '../../..'));
  const browser = await launchQuietBrowser(process.env.EWI_BROWSER === 'webkit' ? webkit : chromium);
  const failures = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => failures.push(error.message));
  fs.mkdirSync('/tmp/ewi-redesign', { recursive: true });
  try {
    await page.goto(site.base + '/music/ewi-fingerings/');
    await page.waitForSelector('.alternate');
    assert.equal(await page.locator('#selected-note').textContent(), 'G4');
    assert.equal(await page.locator('.alternate').count(), 9);
    await page.screenshot({ path: '/tmp/ewi-redesign/after-desktop.png' });

    // Note selection, chromatic spelling, octave offsets, and low/high overlap.
    await page.locator('[data-pitch="0"]').click();
    assert.equal(await page.locator('.alternate').count(), 7);
    await page.locator('.alternate').filter({ hasText: 'Low extension' }).first().click();
    assert.equal(await page.locator('#thumb-label').textContent(), 'Register 0');
    await page.locator('.alternate').filter({ hasText: 'Main fingering' }).click();
    assert.equal(await page.locator('#thumb-label').textContent(), 'Register -1');
    await page.selectOption('#spelling', 'flats');
    await page.locator('[data-pitch="1"]').click();
    assert.equal(await page.locator('#selected-note').textContent(), 'D♭4');
    await page.locator('#octave-up').click();
    assert.equal(await page.locator('#selected-note').textContent(), 'D♭5');
    await page.locator('#hear-note').click();
    assert.match(await page.locator('#app-status').textContent(), /Reference tone/);
    await page.locator('[data-pitch="2"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#selected-note').textContent(), 'E♭5');
    assert.equal(await page.locator(':focus').getAttribute('data-pitch'), '3');

    // A phrase is calculated globally and can be constrained by the user.
    await page.getByRole('button', { name: 'Melody planner', exact: true }).click();
    assert.equal(await page.locator('.phrase-step').count(), 5);
    await page.screenshot({ path: '/tmp/ewi-redesign/planner-desktop.png' });
    await page.locator('#melody').fill('G4 G5');
    await page.locator('#melody-form').getByRole('button', { name: 'Find fingerings' }).click();
    await page.locator('[data-step="1"]').click();
    assert.match(await page.locator('#transition-detail').textContent(), /up toward the mouthpiece 1 register step/);
    assert.match(await page.locator('#transition-detail').textContent(), /No new keys/);
    await page.selectOption('#step-variant', { index: 1 });
    assert.match(await page.locator('.phrase-step').nth(1).textContent(), /locked/);
    await page.locator('#unlock').click();
    assert.equal(await page.locator('#unlock').isDisabled(), true);
    await page.locator('#melody').fill('C#5 D5 C#5');
    await page.locator('#melody-form').getByRole('button', { name: 'Find fingerings' }).click();
    await page.selectOption('#roller-weight', '10');
    assert.match(await page.locator('#plan-summary').textContent(), /0 thumb register steps/);
    await page.selectOption('#pinky-weight', '4');
    await page.selectOption('#familiar-weight', '3');
    await page.locator('#play-phrase').click();
    assert.equal(await page.locator('#play-phrase').textContent(), 'Stop');
    await page.locator('#play-phrase').click();
    assert.equal(await page.locator('#play-phrase').textContent(), 'Play phrase');

    // Invalid input never leaves a stale route or injects markup.
    await page.locator('#melody').fill('C4 <script>bad</script>');
    assert.equal(await page.locator('.phrase-step').count(), 0);
    await page.locator('#melody-form').getByRole('button', { name: 'Find fingerings' }).click();
    assert.equal(await page.locator('#melody-error').isVisible(), true);
    assert.equal(await page.locator('.transition-inspector').isVisible(), false);
    await page.locator('[data-phrase="C4 D4 E4 F4 G4 A4 B4 C5"]').click();
    assert.equal(await page.locator('.phrase-step').count(), 8);
    assert.equal(await page.locator('#melody-error').isVisible(), false);

    // The full 64-note phrase stays bounded and all notes render.
    await page.locator('#melody').fill(Array(8).fill('C4 D4 E4 F4 G4 A4 B4 C5').join(' '));
    await page.locator('#melody-form').getByRole('button', { name: 'Find fingerings' }).click();
    assert.equal(await page.locator('.phrase-step').count(), 64);
    await page.locator('[data-phrase="B4 C5 D5 C5 B4"]').click();

    // Keyboard and click access to every key description.
    await page.getByRole('button', { name: 'Keys & technique', exact: true }).click();
    for (let i = 0; i < 13; i++) {
      await page.locator(`#key-picker [data-key="${i}"]`).click();
      assert.match(await page.locator('#key-detail h3').textContent(), new RegExp(`^K${i + 1} ·`));
    }
    await page.locator('#guide-diagram [data-key="2"]').focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#key-detail h3').textContent(), /^K3/);
    assert.equal(await page.locator(':focus').getAttribute('data-key'), '2');
    await page.screenshot({ path: '/tmp/ewi-redesign/guide-desktop.png' });

    for (const viewport of [{ width: 375, height: 812 }, { width: 844, height: 390 }, { width: 320, height: 740 }, { width: 768, height: 1024 }]) {
      await page.setViewportSize(viewport);
      for (const view of ['explore', 'plan', 'guide']) {
        await page.locator(`[data-view="${view}"]`).click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${view} overflows ${viewport.width}`);
        const tiny = await page.locator(`#${view} button:visible, #${view} select:visible, #${view} textarea:visible`).evaluateAll(elements => elements.filter(el => {
          const rect = el.getBoundingClientRect(); return rect.width < 43.5 || rect.height < 43.5;
        }).map(el => el.id || el.textContent.slice(0, 20)));
        assert.deepEqual(tiny, [], `small touch targets ${view} ${viewport.width}`);
        if (viewport.width === 375) await page.screenshot({ path: `/tmp/ewi-redesign/${view}-mobile.png`, fullPage: true });
      }
    }
    // A normal persistence reload, and a privacy mode where storage throws.
    await page.getByRole('button', { name: 'Fingerings', exact: true }).click();
    await page.locator('[data-pitch="7"]').click();
    await page.reload(); await page.waitForSelector('.alternate');
    assert.equal(await page.locator('#selected-note').textContent(), 'G5');
    await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Disabled by browser'); } }));
    await page.reload(); await page.waitForSelector('.alternate');
    assert.equal(await page.locator('#selected-note').textContent(), 'G4');
    assert.deepEqual(failures, []);
    console.log('PASS: note/octave exploration, all 13 keys, global phrase planning, locks, audio, validation, privacy fallback, and responsive layouts at four viewport sizes.');
  } finally { await browser.close(); await site.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
