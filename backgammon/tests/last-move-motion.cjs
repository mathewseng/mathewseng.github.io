const assert = require('node:assert/strict');
const path = require('node:path');

// Actual Play resume/roll/draft controls; only the exit animation clock is
// paused for reproducible intermediate frames. No engine or transport mocks.
module.exports = async function lastMoveMotion(browser, base, out, name) {
  const report = [];
  for (const touch of [false, true]) {
    const context = await browser.newContext({ serviceWorkers: 'block', hasTouch: touch,
      reducedMotion: 'no-preference', viewport: touch ? { width: 390, height: 844 } : { width: 1366, height: 768 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const exit = '#board [data-last-move-exit]';
    const ready = () => page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    const seek = time => page.evaluate(time => document.getAnimations()
      .filter(a => a.id === 'last-move-exit').forEach(a => { a.currentTime = time; }), time);
    const poses = () => page.locator(exit).evaluateAll(nodes => nodes.map(n => ({
      kind: n.dataset.lastMoveExit, opacity: Number(getComputedStyle(n).opacity),
      time: n.getAnimations()[0]?.currentTime, pointer: getComputedStyle(n).pointerEvents,
    })));
    const roll = async () => {
      if (!touch) return page.keyboard.press('c');
      const p = await page.locator('#board svg.bg-board').evaluate(svg => {
        const p = new DOMPoint(240, 330).matrixTransform(svg.getScreenCTM());
        return { x: p.x, y: p.y };
      });
      await page.touchscreen.tap(p.x, p.y);
    };
    const resume = async () => {
      await page.goto(base + '/backgammon/play/#resume=last-move-fade'); await ready();
      await page.locator('#board.roll-ready').waitFor();
    };
    try {
      await page.addInitScript(() => {
        window.pauseMoveExit = true;
        // Commit a reproducible 4–1 roll through the normal dice source. Other
        // cryptographic uses (including ids) retain the browser implementation.
        const random = crypto.getRandomValues.bind(crypto);
        let die = 0;
        crypto.getRandomValues = data => data instanceof Uint8Array && data.length === 1
          ? (data[0] = [3, 0][die++ % 2], data) : random(data);
        const animate = Element.prototype.animate;
        Element.prototype.animate = function(frames, options) {
          const a = animate.call(this, frames, options);
          if (options?.id === 'last-move-exit' && window.pauseMoveExit) { a.pause(); a.currentTime = 0; }
          return a;
        };
        // Board transitions start together after all resting poses are read.
        const play = Animation.prototype.play;
        Animation.prototype.play = function() {
          const result = play.call(this);
          if (this.id === 'last-move-exit' && window.pauseMoveExit) { this.pause(); this.currentTime = 0; }
          return result;
        };
      });
      await page.goto(base + '/backgammon/');
      await page.evaluate(async () => {
        const r = await import('/backgammon/core/rules.mjs');
        const { playAction } = await import('/backgammon/core/table.mjs');
        const { localConfig } = await import('/backgammon/core/play-session.mjs');
        const st = await import('/backgammon/core/storage.mjs');
        const initial = r.initialState({ phase: 'move', turn: 1, dice: [3, 1] });
        const steps = r.legalPaths(initial).find(p => p.steps[0].to === p.steps[1].from).steps;
        const game = playAction({ id: 'last-move-fade', initial, state: initial, events: [], started: true,
          names: ['You', 'Friend'], config: localConfig({ mode: 'local', tutor: false }) }, { type: 'move', steps });
        await st.put('work', { id: 'play', game, draft: [], positionKey: r.positionKey(game.state) });
        st.saveSettings({ motion: 'system', interactionMode: 'advanced', equityBar: false, boardTheme: { preset: 'plum' } });
      });
      await resume();
      assert.ok(await page.locator('#board .last-move-ghost').count());
      // Complete the entrance so the first case verifies a full trace fading.
      await page.evaluate(() => document.getAnimations().forEach(a => a.finish()));
      await roll();
      await page.locator('#board .board-dice:not(.last-roll)').waitFor({ timeout: 5000 });
      let motion = await poses();
      for (const kind of ['ghost', 'arrows', 'ring']) assert.ok(motion.some(p => p.kind === kind), kind + ' fades');
      assert.ok(motion.every(p => p.opacity === 1 && p.pointer === 'none'));
      assert.equal(await page.locator(exit + ' [role], ' + exit + ' [tabindex]').count(), 0, 'no stale controls');
      assert.equal(await page.locator('#board [data-last-moved]').count(), 0, 'live semantics update on roll');
      await seek(100);
      motion = await poses();
      assert.ok(motion.every(p => p.opacity > 0 && p.opacity < 1));
      assert.ok(motion.every(p => Math.abs(p.opacity - motion[0].opacity) < 1e-5), 'all trace ink fades together');
      await page.screenshot({ path: path.join(out, `${name}-last-move-fade-${touch ? 'phone' : 'desktop'}.png`) });
      // Switching dice must preserve the same in-progress fade, not restart it.
      if (touch) await page.locator('#board .dice-switch').tap();
      else await page.keyboard.press('s');
      assert.deepEqual(await poses(), motion);
      const protectedDice = await page.locator('#board [data-last-move-exit="arrows"]').evaluate(n =>
        !!(n.compareDocumentPosition(document.querySelector('#board .board-dice')) & Node.DOCUMENT_POSITION_FOLLOWING));
      assert.ok(protectedDice, 'new dice render above outgoing paths');
      // A real checker input and undo remain usable while the ghosts fade.
      const point = page.locator('#board [data-point="23"] .checker').last();
      if (touch) await point.tap(); else await point.click();
      await page.locator('#board .board-die.consumed').waitFor();
      assert.ok((await poses()).every(p => p.time === 100), 'checker render preserves fade position');
      await page.keyboard.press('z');
      assert.equal(await page.locator('#board .board-die.consumed').count(), 0);
      assert.ok((await poses()).every(p => p.time === 100), 'undo does not revive the trace');
      await page.evaluate(() => {
        window.pauseMoveExit = false;
        document.getAnimations().filter(a => a.id === 'last-move-exit').forEach(a => a.play());
      });
      await page.waitForFunction(() => !document.querySelector('#board [data-last-move-exit]'));
      assert.equal(await page.locator('#board .last-move-ghost,#board .last-move-arrows,#board .last-move-ring').count(), 0);
      // No ghost state/animation is saved; only the original committed move and
      // this one roll are recorded. Undo stays inside this turn.
      const saved = await page.evaluate(async () => {
        const st = await import('/backgammon/core/storage.mjs');
        const work = await st.get('work', 'play');
        return { events: work.game.events.map(e => e.action.type), phase: work.game.state.phase };
      });
      assert.deepEqual(saved, { events: ['move', 'roll'], phase: 'move' });
      assert.deepEqual(errors, []);
      report.push({ touch, fadeTogether: true, interruption: true, immediateControls: true, cleanup: true });
    } finally { await context.close(); }
  }
  const context = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'no-preference' });
  try {
    const page = await context.newPage();
    await page.goto(base + '/backgammon/');
    const checks = await page.evaluate(async () => {
      const r = await import('/backgammon/core/rules.mjs');
      const { lastMove } = await import('/backgammon/core/play-session.mjs');
      const { Board } = await import('/backgammon/ui/board.mjs');
      const { saveSettings } = await import('/backgammon/core/storage.mjs');
      saveSettings({ motion: 'system' });
      const host = document.createElement('div'); document.body.replaceChildren(host);
      const board = new Board(host), results = [];
      const exits = () => [...host.querySelectorAll('[data-last-move-exit]')];
      const fixture = kind => {
        const initial = r.initialState({ phase: 'move', dice: [3, 1] });
        let steps;
        if (kind === 'bar') {
          initial.points = Array(24).fill(0); initial.points[5] = 14;
          initial.points[23] = -1; initial.points[18] = -14; initial.bar = [1, 0];
          initial.dice = [1, 2];
          steps = [{ from: 'bar', to: 23, die: 1 }, { from: 23, to: 21, die: 2 }];
        } else if (kind === 'off') {
          initial.points = Array(24).fill(0); initial.points[0] = 3; initial.points[23] = -15;
          initial.off = [12, 0]; initial.dice = [2, 1];
          steps = r.legalPaths(initial)[0].steps;
        } else steps = r.legalPaths(initial)[0].steps;
        const action = { type: 'move', steps }, state = r.transition(initial, action, 0);
        return { state, trace: lastMove({ initial, state, events: [{ actor: 0, action }] }),
          rolled: r.transition(state, { type: 'roll', dice: [4, 1] }, 1) };
      };
      for (const kind of ['points', 'bar', 'off']) for (const orientation of [0, 1]) {
        const { state, trace, rolled } = fixture(kind);
        board.render(state, { lastMove: trace, orientation });
        // Roll while arrow entrance is incomplete, including hidden arrowheads.
        for (const a of board.svg.getAnimations({ subtree: true })) { a.pause(); a.currentTime = 250; }
        const paths = () => [...host.querySelectorAll('.last-move-arrow path')].map(p => {
          const s = getComputedStyle(p); return [s.opacity, s.strokeDasharray, s.strokeDashoffset];
        });
        const drawn = paths();
        board.render(state, { lastMove: trace, orientation, interactive: false });
        const redrawPreserved = JSON.stringify(paths()) === JSON.stringify(drawn);
        board.render(rolled, { orientation });
        for (const a of board.animations) if (a.id === 'last-move-exit') { a.pause(); a.currentTime = 0; }
        results.push({ kind, orientation, drawnPreserved: JSON.stringify(paths()) === JSON.stringify(drawn), redrawPreserved,
          exits: exits().length, masks: host.querySelectorAll('mask').length,
          barPoint: kind !== 'bar' || !!host.querySelector('[data-point="bar0"] [data-last-move-exit="ghost"]'),
          offOutline: kind !== 'off' || (() => {
            const rings = [...host.querySelectorAll('[data-point="off0"] [data-last-move-exit="ring"] .last-move-ring')];
            return rings.length > 0 && rings.every(n => n.getAttribute('fill') === 'none');
          })() });
        board.render(rolled, { orientation: 1 - orientation });
        results.push({ clearedOnFlip: exits().length === 0 });
      }
      const { state, trace, rolled } = fixture('points');
      const start = () => {
        board.render(state, { lastMove: trace });
        board.render(rolled);
      };
      start();
      document.documentElement.dataset.motion = 'reduce'; dispatchEvent(new Event('bg-motion'));
      results.push({ preferenceCleanup: exits().length === 0 && board.animations.length === 0 });
      start(); results.push({ reducedMotion: exits().length === 0 });
      document.documentElement.dataset.motion = 'system'; start();
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      results.push({ visibilityCleanup: exits().length === 0 && board.animations.length === 0 });
      start(); results.push({ hiddenMotion: exits().length === 0 });
      delete document.hidden;
      start(); board.render(rolled, { preview: true });
      results.push({ previewCleanup: exits().length === 0 });
      start(); board.destroy();
      results.push({ destroyCleanup: exits().length === 0 && board.animations.length === 0 });
      return results;
    });
    for (const check of checks) {
      if ('kind' in check) {
        assert.ok(check.drawnPreserved && check.redrawPreserved && check.exits > 0 && check.masks === 1 && check.barPoint && check.offOutline, JSON.stringify(check));
      } else assert.ok(Object.values(check).every(Boolean), JSON.stringify(check));
    }
    report.push({ sharedBoard: checks });
  } finally { await context.close(); }
  return report;
};
