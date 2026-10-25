const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function solverLayout(browser, base, out, name) {
  // Exercise the ordinary motion preference: Solver must still be instant.
  const context = await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block',reducedMotion:'no-preference'});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.boardAnimations = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function(...args) {
      if (this.closest?.('.bg-board')) window.boardAnimations.push(this.getAttribute('class'));
      return animate.apply(this,args);
    };
    const play = Animation.prototype.play;
    Animation.prototype.play = function() {
      const node = this.effect?.target;
      if (node?.closest?.('.bg-board')) window.boardAnimations.push(node.getAttribute('class'));
      return play.call(this);
    };
  });
  const geometry = () => page.locator('#board').evaluate(n => {
    const r = n.getBoundingClientRect(), svg = n.querySelector('svg').getBoundingClientRect();
    return {width:r.width,height:r.height,boardWidth:svg.width,boardHeight:svg.height};
  });
  const stable = async (expected, label) => {
    assert.deepEqual(await geometry(),expected,label);
    assert.deepEqual(await page.evaluate(() => window.boardAnimations),[],`${label}: no board animation was started`);
    assert.equal(await page.locator('.moving-checker,.arrival-resident,.drop-landing-ghost').count(),0,`${label}: no transient checker sprites`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),`${label}: no horizontal overflow`);
  };
  const add = () => page.locator('#board [data-point="9"] .point-number-hit').click();
  try {
    await page.goto(base+'/backgammon/solver/');
    await page.locator('#edit-position').waitFor();
    for (const [width,height] of [[1440,900],[1280,800],[1025,768],[1024,768],[390,844],[375,667],[320,568],[844,390]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {scrollTo(0,0);resolve();})));
      console.log(`Solver geometry ${name}: ${width}×${height}`);
      const board = await geometry();
      assert.ok(await page.evaluate(() => {
        const board = document.querySelector('#board').getBoundingClientRect();
        return document.querySelector('#opponent').getBoundingClientRect().bottom <= board.top + 1 &&
          document.querySelector('#player').getBoundingClientRect().top >= board.bottom - 1;
      }), `${width}: player strips do not overlap the board`);
      if (width >= 1025) {
        const available = await page.evaluate(() => document.querySelector('.stage').getBoundingClientRect().height -
          document.querySelector('#opponent').getBoundingClientRect().height - document.querySelector('#player').getBoundingClientRect().height);
        assert.ok(Math.abs(board.height-available)<1,`${width}: board uses all height remaining between player labels`);
        assert.ok(await page.locator('#inspector .solver-controls').count(), 'desktop controls share the scrolling inspector');
      }
      await page.locator('#edit-position').click();
      await stable(board,`${width}: enter editor`);
      await page.locator('#editor-tools').evaluate(n => n.open = true);
      await page.locator('#editor-clear').click();
      await stable(board,`${width}: empty board`);
      await add();
      await stable(board,`${width}: first checker`);
      await page.locator('#board [data-point="9"] > .checker').last().click();
      await stable(board,`${width}: remove checker`);
      await page.locator('#editor-undo').click();
      await stable(board,`${width}: undo`);
      await page.locator('#editor-redo').click();
      await stable(board,`${width}: redo`);
      await page.locator('#editor-tools').evaluate(n => n.open = false);
      await stable(board,`${width}: collapse tools`);
      await page.locator('#editor-tools').evaluate(n => n.open = true);
      await page.locator('#editor-start').click();
      await stable(board,`${width}: starting position`);
      // Toggle equity without changing the board's reserved geometry.
      await page.evaluate(() => document.querySelector('#equity-toggle').click());
      await stable(board,`${width}: equity toggle`);
      await page.evaluate(() => document.querySelector('#equity-toggle').click());
      await page.locator('#edit-position').click();
      await stable(board,`${width}: leave editor and start analysis`);
      if (width === 1440 || width === 390 || width === 844) {
        await page.locator('[data-analyze-preset="deep"]').click();
        await page.waitForFunction(() => document.querySelector('#analyze')?.textContent === 'Analyze' && !document.querySelector('.study-strip').hidden,null,{timeout:60000});
        await stable(board,`${width}: analysis finished`);
        await page.getByRole('button',{name:'Next move preview',exact:true}).click();
        await stable(board,`${width}: alternative preview`);
        await page.getByRole('button',{name:'Show original position',exact:true}).click();
        await stable(board,`${width}: original preview`);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {scrollTo(0,0);resolve();})));
        await page.screenshot({path:path.join(out,`${name}-solver-layout-${width}.png`)});
      }
    }
    assert.deepEqual(errors,[]);
  } catch (error) {
    await page.screenshot({path:path.join(out,`${name}-solver-layout-failure.png`)});
    throw error;
  } finally { await context.close(); }
};
