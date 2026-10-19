const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function bearoffTargets(browser, base, out, name) {
  const results = [];
  for (const layout of ['desktop', 'portrait', 'landscape']) {
    const touch = layout !== 'desktop' && name !== 'firefox';
    const context = await browser.newContext({
      viewport: layout === 'desktop' ? {width:1366,height:900}
        : layout === 'portrait' ? {width:390,height:844} : {width:844,height:390},
      hasTouch: touch, serviceWorkers: 'block',
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(base + '/backgammon/');
      await page.evaluate(async () => {
        const {shell, DraftBoard} = await import('/backgammon/ui/shell.mjs');
        const rules = await import('/backgammon/core/rules.mjs');
        const storage = await import('/backgammon/core/storage.mjs');
        const ui = shell('trainer', 'Bear-off targets');
        window.bearoff = {d:new DraftBoard(ui.board), rules, storage, cubes:0};
        bearoff.d.board.onCube = () => bearoff.cubes++;
      });
      const fixture = async (mode, turn, orientation, preferred, variant = '') => {
        await page.evaluate(({mode,turn,orientation,preferred,variant}) => {
          const {d,rules:r,storage} = bearoff;
          storage.saveSettings({interactionMode:mode, orientation, motion:'reduce', moveHints:false, equityBar:false});
          document.documentElement.dataset.motion = 'reduce';
          const points = Array(24).fill(0);
          points[5]=5; points[2]=5; points[0]=5; points[18]=-15;
          if (variant === 'outside') {points[5]--; points[6]++;}
          if (variant === 'bar') points[5]--;
          const s = r.initialState({phase:'move', dice:[3,1], turn,
            points:turn ? points.toReversed().map(n => -n) : points,
            bar:variant === 'bar' ? (turn ? [0,1] : [1,0]) : [0,0],
            cube:{value:2,owner:turn},
          });
          d.set(s,r.legalPaths(s),variant !== 'disabled');
          d.preferDie(preferred);
          if (variant === 'preview') {d.preview=s; d.render();}
          d.board.suppressClickUntil=0;
          bearoff.cubes=0;
        }, {mode,turn,orientation,preferred,variant});
        await page.locator('.bg-board').scrollIntoViewIfNeeded();
      };
      const tap = async (x, y) => {
        const p = await page.evaluate(({x,y}) => {
          const p = new DOMPoint(x,y).matrixTransform(bearoff.d.board.svg.getScreenCTM());
          return {x:p.x,y:p.y};
        }, {x,y});
        if (touch) await page.touchscreen.tap(p.x,p.y);
        else await page.mouse.click(p.x,p.y);
      };
      for (const mode of ['advanced','beginner']) for (const turn of [0,1])
        for (const orientation of [0,1]) for (const preferred of [1,3]) {
          await fixture(mode,turn,orientation,preferred);
          const top = turn !== orientation;
          assert.equal(await page.locator('.bearoff-hit').count(),1);
          assert.equal(await page.locator(`[data-point="off${turn}"] .bearoff-hit`).count(),1);
          // Far above/below the small count tray, plus the outside edge beside
          // it. These locations were all background before the expanded target.
          const x = preferred === 1 ? 805 : 870;
          const y = preferred === 1 ? (top ? 260 : 400) : (top ? 75 : 585);
          await tap(x,y);
          const first = {from:turn ? 24-preferred : preferred-1,to:'off',die:preferred};
          assert.deepEqual(await page.evaluate(() => bearoff.d.draft),[first],
            `${layout}, ${mode}, player ${turn}, orientation ${orientation}: selected die bears off`);
          assert.equal(await page.evaluate(() => bearoff.d.current().off[bearoff.d.state.turn]),1);
          // The opponent tray remains unrelated, even with a reversible off disc.
          await tap(870,top ? 585 : 75);
          assert.deepEqual(await page.evaluate(() => bearoff.d.draft),[first]);
          // A cube owned by this player overlaps the lane and must win hit testing.
          await tap(843,top ? 160 : 500);
          assert.equal(await page.evaluate(() => bearoff.cubes),1);
          assert.deepEqual(await page.evaluate(() => bearoff.d.draft),[first]);
          // A further side tap plays the remaining die rather than returning
          // the checker already off. Exhausting the dice removes the shortcut.
          await tap(x,y);
          assert.deepEqual(await page.evaluate(() => bearoff.d.draft),[first,
            {from:turn ? 24-(4-preferred) : 3-preferred,to:'off',die:4-preferred}]);
          assert.equal(await page.locator('.bearoff-hit').count(),0);
          assert.equal(await page.evaluate(() => bearoff.d.state.phase),'move','bear-off tap never confirms');
          await tap(x,y);
          assert.equal(await page.evaluate(() => bearoff.d.draft.length),2,'background cannot spend another die');
          if (mode === 'advanced') {
            await tap(843,top ? 66 : 594);
            assert.deepEqual(await page.evaluate(() => bearoff.d.draft),[first],'count disc still undoes only its checker');
          }
          results.push({layout,mode,turn,orientation,preferred});
        }
      for (const variant of ['outside','bar','disabled','preview']) {
        await fixture('advanced',0,0,3,variant);
        assert.equal(await page.locator('.bearoff-hit').count(),0,`${variant}: no bear-off shortcut`);
        await tap(805,400);
        assert.deepEqual(await page.evaluate(() => bearoff.d.draft),[],`${variant}: no illegal bearoff`);
      }
      await fixture('advanced',0,0,3);
      await tap(805,400);
      // The expanded destination belongs to a group with an undoable checker,
      // but pressing that empty space must not begin dragging the off counter.
      await page.locator('.bearoff-hit').dispatchEvent('pointerdown',{
        pointerId:9,pointerType:touch ? 'touch' : 'mouse',isPrimary:true,button:0,
      });
      assert.equal(await page.evaluate(() => !!bearoff.d.board.pointer),false);
      await page.locator('.bg-board').screenshot({path:path.join(out,`${name}-bearoff-${layout}.png`)});
      assert.deepEqual(errors,[]);
    } finally { await context.close(); }
  }
  return results;
};
