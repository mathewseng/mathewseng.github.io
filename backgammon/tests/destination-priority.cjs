const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function destinationPriority(browser, base, out, name) {
  let cases = 0;
  for (const touch of [false, true]) {
    const context = await browser.newContext({
      viewport: touch ? {width:390,height:844} : {width:1366,height:768},
      hasTouch:touch, reducedMotion:'reduce', serviceWorkers:'block',
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(base + '/backgammon/');
      await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
      await page.evaluate(async () => {
        const {shell,DraftBoard} = await import('/backgammon/ui/shell.mjs');
        const r = await import('/backgammon/core/rules.mjs');
        const storage = await import('/backgammon/core/storage.mjs');
        window.destinationTest = {r,storage,d:new DraftBoard(shell('trainer','Destination clicks').board)};
      });
      for (const turn of [0,1]) for (const orientation of [0,1]) for (const target of ['number','point']) {
        await page.evaluate(({turn,orientation}) => {
          const {r,storage,d} = destinationTest, p = point => turn ? 23-point : point;
          storage.saveSettings({interactionMode:'advanced',orientation,motion:'reduce',equityBar:false});
          const points = Array(24).fill(0);
          for (const [point,count] of [[5,2],[6,5],[8,3],[10,1],[13,3],[18,1],[3,-3],[19,-3],[20,-1],[21,-2],[22,-2],[23,-2],[24,-2]])
            points[p(point-1)] = count * (turn ? -1 : 1);
          const state = r.initialState({phase:'move',dice:[1,1],turn,points,matchLength:0,cube:{value:2,owner:null}});
          d.set(state,r.legalPaths(state));
          d.draft = Array.from({length:2},()=>({from:p(4),to:p(3),die:1}));
          d.render();
        },{turn,orientation});
        const point = turn ? 19 : 4;
        assert.equal(await page.locator('.board-die.consumed').count(),2);
        if (!touch && turn === 0 && orientation === 0 && target === 'number')
          await page.screenshot({path:path.join(out,`${name}-destination-5-before.png`)});
        for (let moved = 1; moved <= 2; moved++) {
          const pos = await page.locator(`[data-point="${point}"]`).evaluate((node,target) => {
            const hit = node.querySelector(target === 'number' ? '.point-number-hit' : '.point-hit');
            const x = +hit.getAttribute('x') + +hit.getAttribute('width')/2;
            const y = +hit.getAttribute('y') + (target === 'number' ? +hit.getAttribute('height')/2 : 130);
            const p = new DOMPoint(x,y).matrixTransform(node.ownerSVGElement.getScreenCTM());
            return {x:p.x,y:p.y};
          },target);
          if (touch) await page.touchscreen.tap(Math.round(pos.x),Math.round(pos.y));
          else await page.mouse.click(pos.x,pos.y);
          const result = await page.evaluate(() => ({draft:destinationTest.d.draft,points:destinationTest.d.current().points}));
          const p = point => turn ? 23-point : point;
          assert.deepEqual(result.draft.slice(0,2),Array.from({length:2},()=>({from:p(4),to:p(3),die:1})), 'keeps the two existing 5/4 moves');
          assert.equal(result.draft.length,2+moved);
          assert.deepEqual(result.draft.at(-1),{from:p(5),to:p(4),die:1});
          assert.equal(Math.abs(result.points[p(5)]),5-moved);
          assert.equal(Math.abs(result.points[p(4)]),moved);
          assert.equal(await page.locator('.board-die.consumed').count(),2+moved);
        }
        if (turn === 0 && orientation === 0 && target === 'number')
          await page.screenshot({path:path.join(out,`${name}-destination-5-after-${touch?'phone':'desktop'}.png`)});
        cases++;
      }
      assert.deepEqual(errors,[]);
    } finally {
      await context.close();
    }
  }
  return {cases, description:'Point 5 and its number play 6/5 twice after two 5/4 moves; mouse/touch, both players and orientations'};
};
