const assert = require('node:assert/strict'), path = require('node:path');

// Actual GNUbg candidates and the real dialog. Freeze only presentation clocks
// to assert continuity at exact frames, including an interrupted switch.
module.exports = async function reviewMotion(browser, base, out, name) {
  const report = [];
  for (const [width, height] of [[1366, 768], [390, 844], [844, 390]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width !== 1366,
      serviceWorkers: 'block', reducedMotion: 'no-preference' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.addInitScript(() => {
        const animate = Element.prototype.animate;
        Element.prototype.animate = function(frames, options) {
          const a = animate.call(this, frames, options);
          if (options?.id === 'preview-transition') { a.pause(); a.currentTime = 0; }
          return a;
        };
      });
      await page.goto(base + '/backgammon/');
      await page.evaluate(async () => {
        const { initialState } = await import('/backgammon/core/rules.mjs');
        const { EngineClient } = await import('/backgammon/engine/client.mjs');
        const { decisionReview } = await import('/backgammon/ui/decision-review.mjs');
        const { capturePreview } = await import('/backgammon/ui/preview-motion.mjs');
        const source = initialState({ phase: 'move', dice: [4, 3] });
        const engine = new EngineClient();
        try {
          const result = await engine.analyze(source, { preset: 'quick' });
          window.reviewSource = source; window.originalSource = JSON.stringify(source);
          window.reviewApi = decisionReview(source, { title: 'Checker decision' });
          window.reviewApi.result({ ...result, actual: result.candidates[2] }, false);
        } finally { engine.destroy(); }
        window.reviewPose = () => capturePreview(document.querySelector('.decision-board svg')).pieces
          .filter(p => p.faces.some(f => f.opacity > .005))
          .map(p => [p.player, +p.x.toFixed(3), +p.y.toFixed(3), +(p.scale || 1).toFixed(3)])
          .sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        window.seekReview = time => document.getAnimations().filter(a => a.id === 'preview-transition')
          .forEach(a => { a.currentTime = Math.min(time, a.effect.getTiming().duration - .01); });
        window.finishReview = async () => {
          const animations = document.getAnimations().filter(a => a.id === 'preview-transition');
          animations.forEach(a => a.finish());
          await Promise.all(animations.map(a => a.finished.catch(() => {})));
        };
        await window.finishReview();
      });
      await page.getByRole('tab', { name: 'Board', exact: true }).click();
      const choose = async label => {
        const button = page.getByRole('button', { name: label, exact: true });
        if (await button.isVisible()) { if (width === 1366) await button.click(); else await button.tap(); }
        else await page.getByLabel('Preview evaluated move', { exact: true }).selectOption(label === 'Position' ? '-1' : label === 'Best move' ? '0' : '2');
      };
      const pose = () => page.evaluate(() => window.reviewPose());
      const before = await pose();
      await choose('Position');
      assert.deepEqual(await pose(), before, 'first frame keeps the preview currently on screen');
      assert.ok(await page.locator('.preview-motion-piece').count());
      assert.ok(await page.locator('.preview-motion-ink .last-move-arrows').count());
      assert.ok(await page.locator('.preview-motion-ink .last-move-ghost').count());
      await page.evaluate(() => window.seekReview(140));
      const middle = await pose();
      assert.notDeepEqual(middle, before, 'checkers travel towards the source');
      const fading = await page.locator('.preview-motion-ink').evaluateAll(ns => ns.map(n => +getComputedStyle(n).opacity));
      assert.ok(fading.every(v => v > 0 && v < 1));
      await page.screenshot({ path: path.join(out, `${name}-review-motion-return-${width}.png`) });
      await choose('Your move');
      assert.deepEqual(await pose(), middle, 'rapid switch continues from current checker positions');
      const pressed = page.locator('.decision-choices [aria-pressed="true"]');
      assert.equal(await pressed.textContent(), 'Your move');
      await page.evaluate(() => window.seekReview(240));
      const incoming = await page.locator('.decision-board .last-move-ghost,.decision-board .last-move-arrows')
        .evaluateAll(ns => ns.filter(n => !n.closest('.preview-motion-layer')).map(n => +getComputedStyle(n).opacity));
      assert.ok(incoming.length && incoming.every(v => v > 0 && v < 1));
      await page.screenshot({ path: path.join(out, `${name}-review-motion-choice-${width}.png`) });
      const unchanged = await pose();
      await choose('Your move');
      assert.deepEqual(await pose(), unchanged, 'reselecting the active view does not restart it');
      await page.evaluate(() => window.finishReview());
      assert.equal(await page.locator('.preview-motion-layer,[data-preview-hidden]').count(), 0, 'settled previews have no overlays');
      const finished = await pose();
      await choose('Position');
      await page.evaluate(() => window.seekReview(170));
      await choose('Best move');
      await page.evaluate(() => window.seekReview(130));
      await choose('Your move');
      await page.evaluate(() => window.finishReview());
      assert.deepEqual(await pose(), finished, 'last selection wins after rapid reversals');
      assert.equal(await page.evaluate(() => JSON.stringify(window.reviewSource) === window.originalSource), true);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const fit = await page.locator('.decision-dialog').evaluate(d => ({ x: d.scrollWidth <= d.clientWidth + 1,
        y: d.scrollHeight <= d.clientHeight + 1, scrollWidth: d.scrollWidth, width: d.clientWidth,
        overflowing: [...d.querySelectorAll('*')].filter(n => n.getBoundingClientRect().right > d.getBoundingClientRect().right + 1)
          .map(n => [n.tagName, n.className?.baseVal ?? n.className]).slice(0, 8),
        overflowBoxes: [...d.querySelectorAll('*')].filter(n => n instanceof HTMLElement && n.scrollWidth > n.clientWidth + 1)
          .map(n => [n.tagName, n.className, n.scrollWidth, n.clientWidth]).slice(0, 8) }));
      assert.ok(fit.x && fit.y, JSON.stringify({ width, height, fit }));
      await choose('Position');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => !document.querySelector('.preview-motion-layer'));
      await choose('Best move');
      assert.equal(await page.locator('.preview-motion-layer,[data-preview-hidden]').count(), 0);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await choose('Your move');
      await page.keyboard.press('Escape');
      await page.locator('.decision-dialog').waitFor({ state: 'detached' });
      assert.equal(await page.locator('.decision-dialog').count(), 0);
      assert.equal(await page.evaluate(() => document.getAnimations().filter(a => a.id === 'preview-transition').length), 0);
      assert.deepEqual(errors, []);
      report.push({ width, height, realEngine: true, continuous: true, interruption: true, reducedMotion: true });
    } finally { await context.close(); }
  }
  const context = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'no-preference' });
  try {
    const page = await context.newPage();
    await page.goto(base + '/backgammon/');
    const edgeCases = await page.evaluate(async () => {
      const r = await import('/backgammon/core/rules.mjs');
      const { Board } = await import('/backgammon/ui/board.mjs');
      const { moveTrace } = await import('/backgammon/core/move-trace.mjs');
      const { capturePreview } = await import('/backgammon/ui/preview-motion.mjs');
      const host = document.createElement('div'); document.body.replaceChildren(host);
      const board = new Board(host), checks = [];
      const finish = async () => {
        const animations = board.animations.filter(a => a.id === 'preview-transition');
        animations.forEach(a => a.finish());
        await Promise.all(animations.map(a => a.finished.catch(() => {})));
      };
      const seek = time => board.animations.filter(a => a.id === 'preview-transition').forEach(a => { a.pause(); a.currentTime = time; });
      for (const kind of ['bar-hit', 'existing-bar-hit', 'bearoff', 'compressed']) for (const orientation of [0, 1]) {
        const source = r.initialState({ phase: 'move', dice: [1, 2] });
        source.points = Array(24).fill(0);
        let steps;
        if (kind.includes('hit')) {
          source.bar = [1, kind === 'existing-bar-hit' ? 1 : 0];
          source.points[5] = 14; source.points[23] = -1; source.points[18] = -14 + source.bar[1];
          steps = [{ from: 'bar', to: 23, die: 1 }, { from: 23, to: 21, die: 2 }];
        } else if (kind === 'bearoff') {
          source.off = [11, 0]; source.points[0] = 4; source.points[23] = -15;
          steps = r.legalPaths(source)[0].steps;
        } else {
          source.points[5] = 15; source.points[23] = -15;
          steps = [{ from: 5, to: 4, die: 1 }, { from: 5, to: 3, die: 2 }];
        }
        const after = steps.reduce((s, step) => r.applyStep(s, step), source);
        const original = JSON.stringify(source);
        const show = (state, trace = null) => board.showPreview(state, { orientation, lastMove: trace,
          usedDice: trace ? steps.map(s => s.die) : [] });
        board.previewKey = null; board.render(source, { orientation, preview: true, interactive: false });
        const before = capturePreview(board.svg).pieces;
        show(after, moveTrace(after, source.turn, steps, source.dice)); seek(0);
        const start = capturePreview(board.svg).pieces.filter(p => p.faces.some(f => f.opacity > .005));
        const arriving = [...host.querySelectorAll('.preview-motion-piece')].filter(n => n.previewSprite.player === 0);
        // Even when 15 checkers share five display slots, departures start at
        // the old stack rather than fading into existence at the destination.
        if (kind === 'compressed') {
          const departures = arriving.filter(n => ['4:0','3:0'].includes(n.previewSprite.key));
          checks.push({ compressedOrigins: departures.length === 2 && departures
            .every(n => new DOMMatrix(getComputedStyle(n).transform).e === before.find(p => p.key === '5:4').x) });
        }
        if (kind === 'existing-bar-hit') {
          const hit = [...host.querySelectorAll('.preview-motion-piece')].find(n => n.previewSprite.player === 1 && n.previewSprite.key === '23:0');
          checks.push({ hitArrivesOnBar: !!hit && hit.getAnimations()[0].effect.getKeyframes().at(-1).transform
            .includes(`translate(408px, ${orientation ? 506 : 100}px)`) });
        }
        if (kind === 'bearoff') {
          const counter = arriving.find(n => n.previewSprite.key === 'off0:count');
          checks.push({ offCountStaysPut: !!counter && counter.getAnimations()[0].effect.getKeyframes()
            .every(frame => frame.transform === `translate(843px, ${orientation ? 66 : 594}px)`) });
        }
        checks.push({ kind, orientation, hasMotion: arriving.length > 0,
          immutable: JSON.stringify(source) === original,
          noTeleport: start.every(p => before.some(b => b.player === p.player && Math.abs(b.x - p.x) < .01 && Math.abs(b.y - p.y) < .01)) });
        seek(200); show(source); seek(140); show(after, moveTrace(after, source.turn, steps, source.dice));
        await finish();
        checks.push({ settled: !host.querySelector('.preview-motion-layer,[data-preview-hidden]'),
          state: r.boardKey(board.state) === r.boardKey(after) });
        show(source); seek(130);
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
        checks.push({ hiddenSettles: !host.querySelector('.preview-motion-layer,[data-preview-hidden]') && board.animations.length === 0 });
        delete document.hidden;
      }
      board.destroy(); return checks;
    });
    for (const check of edgeCases) for (const [key, value] of Object.entries(check))
      if (!['kind', 'orientation'].includes(key)) assert.equal(value, true, JSON.stringify(check));
    report.push({ edgeCases });
  } finally { await context.close(); }
  return report;
};
