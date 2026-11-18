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
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => failures.push(error.message));
  fs.mkdirSync('/tmp/ewi-redesign', { recursive: true });
  async function setKeyRegister(target) {
    const current = Number(await page.locator('#key-register').textContent());
    const step = Math.sign(target - current);
    for (let register = current; register !== target; register += step) {
      await page.locator('[data-register-step="' + step + '"]').click();
    }
    assert.equal(Number(await page.locator('#key-register').textContent()), target);
  }
  try {
    await page.goto(site.base + '/music/ewi-fingerings/');
    await page.waitForSelector('.alternate');
    assert.equal(await page.locator('#explore [data-spelling="flats"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#selected-note').textContent(), 'G');
    assert.equal(await page.locator('select').count(), 0);
    assert.equal(await page.locator('#melody').inputValue(), 'C4 D4 E4 F4 G4 A4 B4 C5');
    assert.equal(await page.locator('.alternate').count(), 12);
    await page.screenshot({ path: '/tmp/ewi-redesign/after-desktop.png' });
    assert.equal(await page.locator('.alternate').first().locator('image').count(), 13, 'all 13 keys use the original artwork');
    assert.match(await page.locator('.alternate').first().locator('image').nth(1).getAttribute('href'), /left-index-key\.png$/);
    assert.deepEqual(await page.locator('#chart-key-numbers span').allTextContents(), Array.from({ length: 13 }, (_, i) => String(i + 1)));
    await page.setViewportSize({ width: 1280, height: 800 });
    for (let key = 0; key < 12; key++) {
      await page.locator(`[data-pitch="${key}"]`).click();
      const last = await page.locator('.ranked-rows .alternate').last().boundingBox();
      const lastDisclosure = await page.locator('.additional-fingerings summary').last().boundingBox();
      assert.ok(Math.max(last.y + last.height, lastDisclosure.y + lastDisclosure.height) <= 800,
        `pitch ${key}: default fingerings and disclosure fit on a laptop without scrolling`);
    }
    const melodyButton = await page.locator('#add-note').boundingBox();
    assert.ok(melodyButton.y + melodyButton.height <= 800, 'adding the selected fingering fits without scrolling');
    await page.locator('[data-pitch="7"]').click();
    await page.setViewportSize({ width: 375, height: 812 });
    const visibleChoices = await page.locator('.alternate').evaluateAll(elements => elements.filter(el => {
      const rect = el.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight;
    }).length);
    assert.ok(visibleChoices >= 8, `phone should show at least eight complete G fingerings, saw ${visibleChoices}`);
    assert.equal(await page.locator('#fingering-detail').isVisible(), false);
    await page.locator('#detail-toggle').click();
    assert.equal(await page.locator('#fingering-detail').isVisible(), true);
    await page.locator('#detail-toggle').click();
    await page.setViewportSize({ width: 1440, height: 900 });

    // Ranked results start with circles and bis, then paginate the other side keys.
    assert.deepEqual((await page.locator('.alternate-held').allTextContents()).slice(0, 3), ['3', '4', '3']);
    await page.locator('[data-pitch="10"]').click();
    assert.match(await page.locator('.alternate').first().getAttribute('aria-label'), /^Rank 1, 2 keys down\. Touch K1, K2\.$/);
    assert.match(await page.locator('#ranking-detail').textContent(), /2 keys down · 0 side touches/);
    await page.locator('[data-pitch="4"]').click();
    assert.equal(await page.locator('.alternate').count(), 4);
    assert.equal(await page.locator('.additional-fingerings summary').textContent(), '406 side-key fingerings');
    await page.locator('.additional-fingerings summary').click();
    await page.waitForSelector('.additional-rows .alternate');
    assert.equal(await page.locator('.additional-rows .alternate').count(), 12);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    assert.equal(await page.locator('.additional-pagination [role="status"]').textContent(), '13–24 of 406');
    await page.locator('.additional-rows .alternate').first().click();
    assert.equal(await page.locator('.additional-fingerings').getAttribute('open'), '');
    assert.equal(await page.locator('#selected-variant').textContent(), 'Rank 17');

    // Pitch-class selection and overlap between two reference registers.
    await page.locator('[data-pitch="0"]').click();
    assert.equal(await page.locator('.alternate').count(), 4);
    assert.deepEqual(await page.locator('.register-group').evaluateAll(groups => groups.map(g => [g.dataset.register, g.querySelectorAll('.alternate').length])), [['-1', 3], ['0', 1]]);
    await page.locator('[data-register="0"] .alternate').first().click();
    assert.equal(await page.locator('#thumb-offset').textContent(), 'Thumb 1 octave higher than rank 1.');
    await page.locator('[data-register="-1"] .alternate').first().click();
    assert.equal(await page.locator('#thumb-offset').isVisible(), false);
    await page.locator('#explore [data-spelling="flats"]').click();
    await page.locator('[data-pitch="1"]').click();
    assert.equal(await page.locator('#selected-note').textContent(), 'D♭');
    assert.equal(await page.locator('#hear-note').textContent(), 'Hear D♭4');
    await page.locator('#hear-note').click();
    assert.match(await page.locator('#app-status').textContent(), /Reference tone: D♭4/);
    await page.locator('[data-pitch="2"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#selected-note').textContent(), 'E♭');
    assert.equal(await page.locator(':focus').getAttribute('data-pitch'), '3');

    // A phrase is calculated globally and can be constrained by the user.
    await page.getByRole('button', { name: 'Add E♭4 to melody', exact: true }).click();
    assert.match(await page.locator('#melody').inputValue(), / E♭4$/);
    await page.getByRole('button', { name: 'Across the break', exact: true }).click();
    assert.equal(await page.locator('.phrase-step').count(), 5);
    await page.screenshot({ path: '/tmp/ewi-redesign/planner-desktop.png' });
    await page.locator('#melody').fill('G4 G5');
    await page.locator('#melody-form').getByRole('button', { name: 'Find fingerings' }).click();
    await page.locator('[data-step="0"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-step="1"]').getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('#transition-detail').textContent(), /up toward the mouthpiece 1 octave/);
    assert.match(await page.locator('#transition-detail').textContent(), /No new keys/);
    await page.locator('#step-variant button').nth(1).click();
    assert.match(await page.locator('.phrase-step').nth(1).textContent(), /locked/);
    await page.locator('#unlock').click();
    assert.equal(await page.locator('#unlock').isDisabled(), true);
    await page.locator('#melody').fill('C#5 D5 C#5');
    await page.locator('#melody-form').getByRole('button', { name: 'Find fingerings' }).click();
    await page.locator('[data-weight="roller"][data-value="10"]').click();
    assert.match(await page.locator('#plan-summary').textContent(), /0 thumb octave steps/);
    await page.locator('[data-weight="pinky"][data-value="4"]').click();
    await page.locator('[data-weight="unfamiliar"][data-value="3"]').click();
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
    await page.locator('#open-scales').click();
    await page.getByRole('button', { name: 'Major (Ionian)', exact: true }).click();
    assert.equal(await page.locator('.phrase-step').count(), 8);
    assert.equal(await page.locator('#melody-error').isVisible(), false);
    await page.locator('#open-scales').click();
    await page.locator('[data-scale-root="2"]').click();
    await page.locator('[data-scale-group="4"]').click();
    await page.locator('[data-scale-offset="1"]').click();
    await page.locator('[data-use-custom]').click();
    assert.equal(await page.locator('#melody').inputValue(), 'D4 E♭4 E4 G♭4 G4 A4 B4 D♭5 D5');
    assert.equal(await page.locator('#scale-library').isVisible(), false);

    // The full 64-note phrase stays bounded and all notes render.
    await page.locator('#melody').fill(Array(8).fill('C4 D4 E4 F4 G4 A4 B4 C5').join(' '));
    await page.locator('#melody-form').getByRole('button', { name: 'Find fingerings' }).click();
    assert.equal(await page.locator('.phrase-step').count(), 64);
    await page.locator('[data-phrase="B4 C5 D5 C5 B4"]').click();

    // Latching input, live staff, and examples must agree across key interactions.
    await page.getByRole('button', { name: 'Key explorer', exact: true }).click();
    assert.equal(await page.locator('#key-note').textContent(), 'D♭5');
    assert.equal(await page.locator('#key-picker button image').count(), 13);
    const lastKey = await page.locator('#key-picker button').last().boundingBox();
    assert.ok(lastKey.y + lastKey.height <= 900, 'all key controls fit on desktop');
    assert.equal(await page.locator('#key-picker .conditional-key').count(), 7);
    assert.equal(await page.locator('#key-picker .effect-up-one').count(), 3);
    assert.equal(await page.locator('#key-picker .effect-down-one').count(), 4);
    assert.equal(await page.locator('#key-picker .key-family').first().locator('.effect-down-two').count(), 6);
    assert.equal(await page.locator('#key-picker .key-family').last().locator('.effect-down-two').count(), 0);
    assert.match((await page.locator('#key-picker [data-key="0"] .key-dependencies').allTextContents()).join(' '), /K3:−3/);
    assert.deepEqual(await page.locator('#key-detail dt').allTextContents(), ['Usually', 'Exceptions', 'With your other keys']);
    assert.equal(await page.locator('#key-rule-rows tr').first().locator('td').last().locator(':scope > *').first().getAttribute('class'), 'rule-usual-text');
    await page.locator('#key-picker [data-key="1"]').click();
    assert.equal(await page.locator('#key-picker [data-key="1"]').getAttribute('aria-pressed'), 'false');
    assert.match(await page.locator('#key-detail').textContent(), /Hold K1 to use K2/);
    await page.locator('#key-picker [data-key="2"]').click();
    assert.equal(await page.locator('#key-note').textContent(), 'C5');
    await page.locator('#key-picker [data-key="0"]').click();
    assert.equal(await page.locator('#key-note').textContent(), 'A4');
    assert.match(await page.locator('#key-detail').textContent(), /C5 → A4 \(−3\)/);
    await page.locator('#key-picker [data-key="1"]').click();
    assert.equal(await page.locator('#key-note').textContent(), 'A4');
    assert.equal(await page.locator('#key-picker [data-key="1"]').getAttribute('aria-pressed'), 'false', 'redundant bis does not latch');
    assert.match(await page.locator('#key-detail').textContent(), /K2 has no effect while K1 and K3 are held/);
    await page.locator('#key-picker [data-key="0"]').click();
    assert.equal(await page.locator('#key-picker [data-key="1"]').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#key-note').textContent(), 'C5');
    await page.locator('#clear-keys').click();
    // Holding K3 strips an already held bis from the redundant combination.
    await page.locator('#key-picker [data-key="0"]').click();
    await page.locator('#key-picker [data-key="1"]').click();
    assert.equal(await page.locator('#key-note').textContent(), 'B♭4');
    await page.locator('#key-picker [data-key="2"]').click();
    assert.equal(await page.locator('#key-picker [data-key="1"]').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#key-note').textContent(), 'A4');
    await page.locator('#clear-keys').click();
    await page.locator('#key-picker [data-key="4"]').click();
    await page.locator('#key-picker [data-key="6"]').click();
    assert.equal(await page.locator('#key-note').textContent(), 'D5', 'shared raise does not add twice');
    await page.locator('#key-picker [data-key="10"]').click();
    assert.equal(await page.locator('#key-note').textContent(), 'E♭5');
    await page.locator('#clear-keys').click();
    for (const index of [0, 2, 3]) await page.locator('#key-picker [data-key="' + index + '"]').click();
    await setKeyRegister(1);
    assert.equal(await page.locator('#key-note').textContent(), 'G5');
    assert.match(await page.locator('#key-staff svg').getAttribute('aria-label'), /G5 on treble clef/);
    await page.locator('#clear-keys').click();
    await setKeyRegister(0);
    for (const index of [0, 2, 3, 7, 8, 9, 12]) await page.locator('#key-picker [data-key="' + index + '"]').click();
    assert.equal(await page.locator('#key-note').textContent(), 'C4');
    assert.equal(await page.locator('#key-staff .staff-ledger').count(), 1);
    await setKeyRegister(-1);
    assert.match(await page.locator('#key-staff svg').getAttribute('aria-label'), /C3 on bass clef/);
    await page.locator('[data-rule-filter="interacting"]').click();
    assert.equal(await page.locator('#key-rule-rows tr').count(), 7);
    await page.locator('[data-rule-filter="fixed"]').click();
    assert.equal(await page.locator('#key-rule-rows tr').count(), 6);
    await page.locator('[data-rule-filter="all"]').click();
    await setKeyRegister(0);
    await page.locator('#clear-keys').click();
    await setKeyRegister(4);
    assert.equal(await page.locator('#key-range').isVisible(), true);
    assert.equal(await page.locator('#hear-keys').isDisabled(), true);
    await setKeyRegister(0);

    // Keyboard and click access to every key description.
    for (let i = 0; i < 13; i++) {
      await page.locator(`#key-picker [data-key="${i}"]`).click();
      assert.match(await page.locator('#key-detail h3').textContent(), new RegExp(`^K${i + 1} ·`));
    }
    await page.locator('#key-picker [data-key="2"]').focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#key-detail h3').textContent(), /^K3/);
    assert.equal(await page.locator(':focus').getAttribute('data-key'), '2');
    await page.screenshot({ path: '/tmp/ewi-redesign/guide-desktop.png' });

    await page.locator('[data-view="moves"]').click();
    assert.equal(await page.locator('#move-matrix button').count(), 132);
    assert.match(await page.locator('#move-result').textContent(), /B♭ → B/);
    assert.match(await page.locator('#move-result .move-grid').textContent(), /ReleaseK2/);
    await page.locator('#move-matrix [data-from="0"][data-to="11"]').click();
    assert.equal(await page.locator('#move-matrix [aria-pressed="true"]').textContent(), '5');
    await page.keyboard.press('ArrowLeft');
    assert.match(await page.locator('#move-result').textContent(), /C → B♭/);

    for (const viewport of [{ width: 375, height: 812 }, { width: 844, height: 390 }, { width: 320, height: 740 }, { width: 768, height: 1024 }]) {
      await page.setViewportSize(viewport);
      for (const view of ['explore', 'plan', 'guide', 'moves']) {
        await page.locator(`[data-view="${view}"]`).click();
        const overflow = await page.evaluate(() => ({
          width: innerWidth, scroll: document.documentElement.scrollWidth, x: scrollX,
          outside: [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && el.getBoundingClientRect().width).slice(0, 8).map(el => ({ tag: el.tagName, id: el.id, right: Math.round(el.getBoundingClientRect().right) })),
        }));
        assert.ok(overflow.scroll <= overflow.width, `${view} overflows ${viewport.width}: ${JSON.stringify(overflow)}`);
        const tiny = await page.locator(`#${view} button:visible, #${view} textarea:visible`).evaluateAll(elements => elements.filter(el => {
          const rect = el.getBoundingClientRect();
          if (el.closest('.move-matrix')) return rect.width < 24 || rect.height < 30;
          return rect.width < 43.5 || rect.height < 43.5;
        }).map(el => el.id || el.textContent.slice(0, 20)));
        assert.deepEqual(tiny, [], `small touch targets ${view} ${viewport.width}`);
        if (viewport.width === 375) await page.screenshot({ path: `/tmp/ewi-redesign/${view}-mobile.png`, fullPage: true });
      }
    }
    // A normal persistence reload, and a privacy mode where storage throws.
    await page.getByRole('button', { name: 'Fingerings', exact: true }).click();
    await page.locator('[data-pitch="7"]').click();
    await page.reload(); await page.waitForSelector('.alternate');
    assert.equal(await page.locator('#selected-note').textContent(), 'G');
    await page.locator('#explore [data-spelling="sharps"]').click();
    await page.reload(); await page.waitForSelector('.alternate');
    assert.equal(await page.locator('#explore [data-spelling="sharps"]').getAttribute('aria-pressed'), 'true', 'spelling survives reload');
    await page.evaluate(() => {
      localStorage.removeItem('ewi-practice-v3');
      localStorage.removeItem('ewi-practice-v2');
      localStorage.setItem('ewi-practice-v1', JSON.stringify({ midi: 73, flats: false, phrase: 'C4 D4' }));
    });
    await page.reload(); await page.waitForSelector('.alternate');
    assert.equal(await page.locator('#selected-note').textContent(), 'D♭', 'old implicit sharp default migrates to flats');
    assert.equal(await page.locator('#hear-note').textContent(), 'Hear D♭4', 'saved octave maps to the chart reference');
    assert.equal(await page.locator('#melody').inputValue(), 'C4 D4');
    await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Disabled by browser'); } }));
    await page.reload(); await page.waitForSelector('.alternate');
    assert.equal(await page.locator('#selected-note').textContent(), 'G');
    assert.deepEqual(failures, []);
    console.log('PASS: pitch-class chart, bis constraint, all 13 keys, global phrase planning, locks, audio, privacy fallback, and four responsive layouts.');
  } finally { await browser.close(); await site.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
