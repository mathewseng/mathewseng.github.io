const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function highlightRendering(browser, base, out, name) {
  const report = [];
  for (const [width, height] of [[390, 844], [844, 390], [1366, 900]]) {
    // Firefox's touch emulation suppresses mouse pointer events. This rendering
    // fixture uses native mouse drags; drag-feedback also covers native touch.
    const context = await browser.newContext({ viewport: {width, height}, hasTouch: width < 1000 && name !== 'firefox',
      deviceScaleFactor: width < 1000 ? 3 : 1, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto(base + '/backgammon/');
      await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
      await page.evaluate(async () => {
        const {shell, DraftBoard} = await import('/backgammon/ui/shell.mjs');
        const r = await import('/backgammon/core/rules.mjs');
        const st = await import('/backgammon/core/storage.mjs');
        const appearance = await import('/backgammon/core/appearance.mjs');
        const d = new DraftBoard(shell('trainer', '').board);
        window.highlightFixture = {d, r, st, appearance};
      });
      const setup = orientation => page.evaluate(orientation => {
        const {d, r, st, appearance} = highlightFixture;
        const boardTheme = {preset:'graphite', colors:{selection:'#FFDA89', destination:'#FFDA89'}};
        st.saveSettings({interactionMode:'advanced', motion:'reduce', orientation, boardTheme});
        appearance.applyBoardTheme(boardTheme);
        // The reported 6-1 position, before 8/7 and after it when dragging back.
        const points = Array(24).fill(0);
        for (const [p, count] of [[24,1],[21,1],[13,2],[8,3],[7,3],[6,3],[4,2],
          [12,-3],[10,-1],[17,-2],[18,-2],[19,-5],[3,-2]]) points[p-1] = count;
        const s = r.initialState({phase:'move', dice:[6,1], points});
        r.assertState(s); d.set(s, r.legalPaths(s)); d.board.suppressClickUntil = 0;
      }, orientation);
      const position = (point, checker = false) => page.locator(`[data-point="${point}"]`).evaluate((g, checker) => {
        const n = checker ? [...g.querySelectorAll(':scope > .checker > circle:first-child')].at(-1) : g.querySelector('.point-hit');
        const x = checker ? +n.getAttribute('cx') : +n.getAttribute('x') + +n.getAttribute('width') / 2;
        // Clear the six-screen-pixel drag threshold even on short mobile boards.
        const y = checker ? +n.getAttribute('cy') : +n.getAttribute('y') +
          +n.getAttribute('height') * (+n.getAttribute('y') < 300 ? .75 : .25);
        const p = new DOMPoint(x, y).matrixTransform(g.getScreenCTM());
        return {x:p.x, y:p.y};
      }, checker);
      const lift = async (source, target) => {
        const a = await position(source, true), b = await position(target);
        await page.mouse.move(a.x, a.y); await page.mouse.down();
        await page.mouse.move(b.x, b.y, {steps:6});
        assert.equal(await page.locator('.drag-checker').count(), 1);
        assert.equal(await page.locator('.drop-hover').getAttribute('data-point'), String(target));
        const rings = await page.locator('.drag-source :is(.source-ring,.source-ring-halo)').evaluateAll(nodes =>
          nodes.map(n => getComputedStyle(n).visibility));
        assert.equal(rings.length, 2);
        assert.ok(rings.every(v => v === 'hidden'), 'pickup hides both the source ring and its dark backing');
      };
      const cancel = async () => { await page.keyboard.press('Escape'); await page.mouse.up(); };
      const outline = async (point, selector) => {
        const paint = await page.locator(`[data-point="${point}"]`).evaluate((g, selector) => {
          const n = g.querySelector(selector), style = getComputedStyle(n), svg = g.ownerSVGElement;
          const box = n.getBBox(), board = svg.viewBox.baseVal;
          return {stroke:style.stroke, width:parseFloat(style.strokeWidth), clip:style.clipPath,
            abovePaint:[...g.querySelectorAll(':scope > .point-shape,:scope > [data-pattern]')].every(p =>
              Boolean(p.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING)),
            inside:box.x > 0 && box.y > 0 && box.x + box.width < board.width && box.y + box.height < board.height};
        }, selector);
        assert.notEqual(paint.stroke, 'none');
        assert.ok(paint.width >= 2);
        assert.equal(paint.clip, 'none');
        assert.equal(paint.inside, true);
        assert.equal(paint.abovePaint, true, 'triangle and pattern cannot cover the inner half of the outline');
      };
      const arrow = async point => {
        const paint = await page.locator(`[data-point="${point}"] path.destination-die`).evaluate(n => {
          const s = getComputedStyle(n), icon = n.getBBox(), badge = n.parentElement.querySelector('.destination-badge').getBBox();
          const half = parseFloat(s.strokeWidth) / 2;
          return {fill:s.fill, stroke:s.stroke, width:parseFloat(s.strokeWidth), cap:s.strokeLinecap, join:s.strokeLinejoin,
            fits:icon.x-half >= badge.x && icon.y-half >= badge.y &&
              icon.x+icon.width+half <= badge.x+badge.width && icon.y+icon.height+half <= badge.y+badge.height};
        });
        assert.equal(paint.fill, 'none', 'return arrow stays an open stroke, not a filled text glyph');
        assert.notEqual(paint.stroke, 'none');
        assert.equal(paint.width, 3);
        assert.equal(paint.cap, 'round'); assert.equal(paint.join, 'round');
        assert.equal(paint.fits, true, 'complete arrow including its stroke fits inside the badge');
      };
      for (const orientation of [0, 1]) {
        await setup(orientation);
        await lift(7, 7);
        await outline(7, '.point-hit');
        if (!orientation) await page.screenshot({path:path.join(out, `${name}-origin-outline-${width}.png`)});
        await cancel();
        assert.equal(await page.evaluate(() => highlightFixture.d.draft.length), 0, 'returning to pickup spot cancels without moving');
        await page.evaluate(() => highlightFixture.d.move({from:7, to:6, die:1}));
        await lift(6, 7);
        await arrow(7); await outline(7, '.point-wash');
        assert.equal(await page.locator('[data-point="7"] .point-hit').evaluate(n => getComputedStyle(n).stroke), 'none',
          'return has one amber border, not a second nested hover border');
        if (!orientation) await page.screenshot({path:path.join(out, `${name}-return-arrow-${width}.png`)});
        await page.mouse.up();
        assert.equal(await page.evaluate(() => highlightFixture.d.draft.length), 0, 'dropping on original point restores its checker');

        // The same arrow is used for returning a checker to the bar.
        await page.evaluate(() => {
          const {d,r} = highlightFixture, s = r.initialState({phase:'move', dice:[4,1]});
          s.points[23]--; s.bar[0]++; d.set(s, r.legalPaths(s));
          d.move({from:'bar', to:23, die:1}); d.beginDrag(23);
        });
        await arrow('bar0');
        report.push({width, height, orientation, originOutline:true, returnArrow:true, barArrow:true, pickupHalo:true});
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  return report;
};
