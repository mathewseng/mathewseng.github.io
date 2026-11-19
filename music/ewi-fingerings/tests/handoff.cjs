const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium, devices, webkit } = require('playwright');
const { launchQuietBrowser } = require('../../../scripts/quiet-browser.cjs');
const { serveSite } = require('../../../scripts/site-pages.cjs');

const imported = 'chart-1101000010000';
const chartTouch = 'Touch K1, K2, K4, K9';

async function check(browser, url, mobile) {
  const context = await browser.newContext(mobile ? devices['iPhone 13'] : { viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  // Observe the actual scheduled oscillator pitches, with output muted by the test helper.
  await page.addInitScript(() => {
    window.scheduledNotes = [];
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (at = 0) {
      const midi = Math.round(69 + 12 * Math.log2(this.frequency.value / 440));
      window.scheduledNotes.push({ midi, at });
      return start.call(this, at);
    };
  });
  const activate = selector => mobile ? page.locator(selector).tap() : page.locator(selector).press('Enter');
  try {
    await page.goto(url);
    assert.equal(await page.locator('[data-view="guide"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#key-picker').isVisible(), true);
    await activate('[data-view="plan"]');
    const melody = page.locator('#melody');
    await melody.fill('G4 A5');
    await activate('[data-view="explore"]');
    assert.equal(await page.locator('[data-fingering="10"] .mini-diagram use').count(), 13);
    await activate('[data-fingering="10"]');
    if (mobile) await activate('#detail-toggle');
    assert.match(await page.locator('#held-description').textContent(), /Touch K1, K2, K4, K9/);
    assert.match(await page.locator('#ranking-detail').textContent(), /4 keys down · 0 side touches/);
    assert.equal(await page.locator('#add-note').textContent(), 'Add G5 to melody');
    await activate('#add-note');
    assert.equal(await melody.inputValue(), 'G4 A5 G5');
    const lastStep = page.locator('[data-step="2"]');
    assert.equal(await page.locator(':focus').getAttribute('data-step'), '2');
    assert.match(await lastStep.getAttribute('aria-label'), /G5, locked/);
    assert.equal(await lastStep.locator('svg').getAttribute('aria-label'), chartTouch);
    await activate('[data-step="2"]');
    assert.equal(await page.locator('dialog[open]').count(), 0);
    assert.equal(await page.locator('#step-variant [aria-pressed="true"]').getAttribute('data-fingering-choice'), imported);

    // Unlock and select the same chart option again, then recalculate and play.
    await activate('#unlock');
    assert.equal(await page.locator('#step-variant [aria-pressed="true"]').getAttribute('data-fingering-choice'), '');
    await activate('[data-fingering-choice="' + imported + '"]');
    assert.equal(await page.locator('#step-variant [aria-pressed="true"]').getAttribute('data-fingering-choice'), imported);
    await activate('#melody-form button[type=submit]');
    assert.equal(await lastStep.locator('svg').getAttribute('aria-label'), chartTouch);
    await page.locator('#tempo').fill('240');
    await activate('#play-phrase');
    await page.waitForFunction(() => window.scheduledNotes.length === 3);
    await page.waitForFunction(() => document.querySelector('.phrase-step.playing')?.dataset.step === '0');
    const scheduled = await page.evaluate(() => window.scheduledNotes);
    assert.deepEqual(scheduled.map(note => note.midi), [67, 81, 79]);
    assert.ok(scheduled[0].at < scheduled[1].at && scheduled[1].at < scheduled[2].at);
    await page.waitForFunction(() => document.querySelector('#play-phrase').textContent === 'Play phrase');
    assert.match(await lastStep.getAttribute('aria-label'), /locked/);

    await activate('#reverse-melody');
    assert.equal(await melody.inputValue(), 'G5 A5 G4');
    assert.deepEqual(await page.locator('.phrase-step strong').allTextContents(), ['A', 'G', 'G']);
    const firstStep = page.locator('[data-step="0"]');
    assert.match(await firstStep.getAttribute('aria-label'), /G5, locked/);
    assert.equal(await firstStep.locator('svg').getAttribute('aria-label'), chartTouch);
    await page.evaluate(() => { window.scheduledNotes.length = 0; });
    await activate('#play-phrase');
    await page.waitForFunction(() => window.scheduledNotes.length === 3);
    assert.deepEqual(await page.evaluate(() => window.scheduledNotes.map(note => note.midi)), [79, 81, 67]);
    await page.waitForFunction(() => document.querySelector('#play-phrase').textContent === 'Play phrase');

    // An empty phrase defaults to octave 4. Appending another note keeps that first lock.
    await melody.fill('');
    await activate('[data-view="explore"]');
    assert.equal(await page.locator('#add-note').textContent(), 'Add G4 to melody');
    await activate('#add-note');
    assert.equal(await melody.inputValue(), 'G4');
    assert.equal(await page.locator('.phrase-step').count(), 1);
    assert.match(await page.locator('[data-step="0"]').getAttribute('aria-label'), /G4, locked/);
    await melody.fill('G4 G5');
    await activate('#melody-form button[type=submit]');
    assert.match(await page.locator('[data-step="0"]').getAttribute('aria-label'), /G4, locked/);
    assert.equal(await page.locator('[data-step="0"] svg').getAttribute('aria-label'), chartTouch);
    await activate('[data-view="guide"]');
    await activate(mobile ? '#key-picker [data-key-shape="1"] rect' : '#key-picker [data-key="1"]');
    assert.equal(await page.locator('#key-held').textContent(), 'Held: K2.');
    assert.equal(await page.locator('#key-note').textContent(), 'C5');
    if (mobile) {
      assert.equal(await page.locator('html').evaluate(root => getComputedStyle(root).touchAction), 'manipulation');
      const key = page.locator('#key-picker [data-key-shape="0"] use');
      const center = await key.boundingBox();
      const x = center.x + center.width / 2;
      const y = center.y + center.height / 2;
      const scale = await page.evaluate(() => visualViewport.scale);
      await page.touchscreen.tap(x, y);
      assert.equal(await page.locator('#key-held').textContent(), 'Held: K1, K2.');
      await page.touchscreen.tap(x, y);
      assert.equal(await page.locator('#key-held').textContent(), 'Held: K2.');
      assert.equal(await page.evaluate(() => visualViewport.scale), scale);
    }
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
}

(async () => {
  const site = await serveSite(path.resolve(__dirname, '../../..'));
  const desktop = await launchQuietBrowser(chromium);
  const mobile = await launchQuietBrowser(webkit);
  try {
    const url = site.base + '/music/ewi-fingerings/';
    await Promise.all([check(desktop, url, false), check(mobile, url, true)]);
    console.log('PASS: exact chart fingering, octave context and fallback, keyboard and touch handoff, and scheduled phrase audio.');
  } finally {
    await Promise.all([desktop.close(), mobile.close(), site.close()]);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
