const assert = require('node:assert/strict');
const path = require('node:path');

// Real bot play with the bundled engine, followed by shared-board edge cases.
// Pause only the trace animations; checker playback, input and rules run normally.
module.exports = async function lastMoveEntry(browser, base, out, name) {
  const report = [];
  for (const touch of [false, true]) {
    const context = await browser.newContext({ serviceWorkers: 'block', hasTouch: touch,
      reducedMotion: 'no-preference', viewport: touch ? { width: 390, height: 844 } : { width: 1366, height: 768 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.addInitScript(() => {
        window.pauseTrace = true;
        // Keep the following human roll reproducible: a random forced turn
        // would advance the game and correctly clear this decorative trace.
        const random = crypto.getRandomValues.bind(crypto);
        let die = 0;
        crypto.getRandomValues = data => data instanceof Uint8Array && data.length === 1
          ? (data[0] = [3, 0][die++ % 2], data) : random(data);
        const animate = Element.prototype.animate;
        Element.prototype.animate = function(frames, options) {
          const a = animate.call(this, frames, options);
          if (window.pauseTrace && ['last-move-entry', 'move-arrow-entry', 'last-move-exit'].includes(options?.id)) {
            a.pause(); a.currentTime = 0;
          }
          return a;
        };
      });
      await page.goto(base + '/backgammon/');
      await page.evaluate(async () => {
        const r = await import('/backgammon/core/rules.mjs');
        const { localConfig } = await import('/backgammon/core/play-session.mjs');
        const st = await import('/backgammon/core/storage.mjs');
        const initial = r.initialState({ phase: 'move', turn: 1, dice: [3, 1], matchLength: 0 });
        await st.put('work', { id: 'play', game: { id: 'trace-entry', state: initial, initial,
          events: [], started: true, names: ['You', 'GNUbg'], config: localConfig({ mode: 'computer',
            matchLength: 0, humanSide: 0, strength: 'quick', reviewStrength: 'quick', tutor: false, warning: false }) }, draft: [] });
        st.saveSettings({ motion: 'system', interactionMode: 'advanced', equityBar: false, boardTheme: { preset: 'plum' } });
      });
      await page.goto(base + '/backgammon/play/#resume=trace-entry');
      await page.locator('#board .moving-checker').first().waitFor({ timeout: 60000 });
      assert.equal(await page.locator('#board .last-move-ghost,#board .last-move-ring').count(), 0,
        'ghosts and outlines wait until checker playback finishes');
      await page.locator('#board .last-move-ghost').first().waitFor({ state: 'attached' });
      assert.equal(await page.locator('#board .moving-checker').count(), 0);
      const snapshot = () => page.locator('#board .last-move-ghost,#board .last-move-ring,#board .move-arrow-line')
        .evaluateAll(nodes => nodes.map(n => {
          const a = n.getAnimations()[0], target = Number(a?.effect.getKeyframes().at(-1).opacity ?? n.getAttribute('opacity') ?? 1);
          return { kind: n.classList[0], opacity: Number(getComputedStyle(n).opacity), target,
            duration: a?.effect.getTiming().duration, easing: a?.effect.getTiming().easing };
        }));
      const start = await snapshot();
      for (const kind of ['last-move-ghost', 'last-move-ring', 'move-arrow-line'])
        assert.ok(start.some(p => p.kind === kind), `${kind} participates in the entrance`);
      assert.ok(start.every(p => p.opacity === 0 && p.duration === 760), 'all start transparent together');
      assert.equal(new Set(start.map(p => p.easing)).size, 1, 'one easing curve');
      await page.evaluate(() => document.getAnimations().filter(a => ['last-move-entry', 'move-arrow-entry'].includes(a.id))
        .forEach(a => { a.currentTime = 320; }));
      const middle = await snapshot(), fraction = middle[0].opacity / middle[0].target;
      assert.ok(fraction > 0 && fraction < 1);
      assert.ok(middle.every(p => Math.abs(p.opacity / p.target - fraction) < 1e-5), 'ghosts/rings match arrow fade progress');
      await page.screenshot({ path: path.join(out, `${name}-last-move-entry-${touch ? 'phone' : 'desktop'}.png`) });
      // Roll while the entrance is partial, using the ghost's location on touch.
      if (touch) {
        const p = await page.locator('#board .last-move-ghost circle').first().evaluate(n => {
          const p = new DOMPoint(Number(n.getAttribute('cx')), Number(n.getAttribute('cy'))).matrixTransform(n.getScreenCTM());
          return { x: p.x, y: p.y };
        });
        await page.touchscreen.tap(p.x, p.y);
      } else await page.keyboard.press('c');
      await page.locator('#board .board-dice:not(.last-roll)').waitFor();
      const exiting = await snapshot();
      assert.deepEqual(exiting.map(p => [p.kind, p.opacity]), middle.map(p => [p.kind, p.opacity]),
        'early roll freezes the visible entrance without flashing full opacity');
      assert.ok(await page.locator('#board [data-last-move-exit]').count());
      assert.equal(await page.evaluate(() => document.getAnimations().filter(a => a.id === 'last-move-entry').length), 0);
      await page.evaluate(() => document.getAnimations().filter(a => a.id === 'last-move-exit').forEach(a => a.finish()));
      await page.waitForFunction(() => !document.querySelector('#board [data-last-move-exit]'));
      assert.deepEqual(errors, []);
      report.push({ touch, realEngine: true, playback: true, synchronized: true, earlyRoll: true });
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
      const host = document.createElement('div'); document.body.replaceChildren(host);
      const board = new Board(host), results = [];
      const entryIds = ['last-move-entry', 'move-arrow-entry'];
      const seek = time => board.animations.filter(a => entryIds.includes(a.id)).forEach(a => { a.pause(); a.currentTime = time; });
      const paint = () => [...host.querySelectorAll('.last-move-ghost,.last-move-ring,.off-checker.last-moved-checker')].map(n => {
        const property = n.matches('.off-checker') ? 'strokeOpacity' : 'opacity';
        const a = n.getAnimations().find(a => a.id === 'last-move-entry');
        return { value: Number(getComputedStyle(n)[property]), opacity: Number(getComputedStyle(n).opacity),
          target: Number(a?.effect.getKeyframes().at(-1)[property] ?? n.getAttribute('opacity') ?? 1),
          off: n.matches('.off-checker'), animated: !!a };
      });
      for (const kind of ['points', 'bar', 'off']) for (const orientation of [0, 1]) {
        const initial = r.initialState({ phase: 'move', dice: [3, 1] });
        let steps;
        if (kind === 'bar') {
          initial.points = Array(24).fill(0); initial.points[5] = 14;
          initial.points[23] = -1; initial.points[18] = -14; initial.bar = [1, 0]; initial.dice = [1, 2];
          steps = [{ from: 'bar', to: 23, die: 1 }, { from: 23, to: 21, die: 2 }];
        } else if (kind === 'off') {
          initial.points = Array(24).fill(0); initial.points[0] = 3; initial.points[23] = -15;
          initial.off = [12, 0]; initial.dice = [2, 1]; steps = r.legalPaths(initial)[0].steps;
        } else steps = r.legalPaths(initial)[0].steps;
        const action = { type: 'move', steps }, state = r.transition(initial, action, 0);
        const trace = lastMove({ initial, state, events: [{ actor: 0, action }] });
        board.render(initial); // New trace, also when repeating the same fixture.
        board.render(state, { lastMove: trace, orientation }); seek(0);
        const start = paint(); seek(280); const middle = paint();
        board.render(state, { lastMove: trace, orientation, interactive: false });
        const resumed = paint();
        const arrowTargets = [...host.querySelectorAll('.last-move-arrow > path')].map(node => ({ node,
          opacity: Number(node.getAnimations()[0].effect.getKeyframes().at(-1).opacity) }));
        seek(760); const end = paint();
        const arrowsSettle = arrowTargets.every(({ node, opacity }) => Number(getComputedStyle(node).opacity) === opacity);
        results.push({ kind, orientation,
          transparent: start.length > 0 && start.every(p => p.value === 0),
          intermediate: middle.every(p => p.value > 0 && p.value < p.target),
          resumed: JSON.stringify(middle) === JSON.stringify(resumed),
          completed: end.every(p => p.value === p.target),
          arrowsSettle,
          facesStayVisible: [...start, ...middle].filter(p => p.off).every(p => p.opacity === 1) });
        // A partially visible off outline must also retain its stroke opacity
        // when a roll changes the entrance into an exit.
        seek(280); const partial = paint();
        const rolled = r.transition(state, { type: 'roll', dice: [4, 1] }, 1);
        board.render(rolled, { orientation });
        results.push({ exitPreserved: JSON.stringify(paint().map(p => p.value)) === JSON.stringify(partial.map(p => p.value)) });
        board.render(state, { lastMove: trace, orientation }); seek(280);
        document.documentElement.dataset.motion = 'reduce'; dispatchEvent(new Event('bg-motion'));
        results.push({ reducedMotionSettles: paint().every(p => !p.animated && p.value === p.target) && board.animations.length === 0 });
        board.render(state, { lastMove: trace, orientation });
        results.push({ noReducedMotionReplay: paint().every(p => !p.animated && p.value === p.target) });
        document.documentElement.dataset.motion = 'system';
      }
      board.render(r.initialState());
      results.push({ noTrace: paint().length === 0 && !host.querySelector('[data-last-move-exit]') });
      board.destroy();
      return results;
    });
    for (const check of checks) for (const [key, value] of Object.entries(check))
      if (!['kind', 'orientation'].includes(key)) assert.equal(value, true, JSON.stringify(check));
    report.push({ edgeCases: checks });
  } finally { await context.close(); }
  return report;
};
