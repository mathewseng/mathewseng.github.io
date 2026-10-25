const assert = require('node:assert/strict');
const path = require('node:path');
const {waitForAsync} = require('./play-helpers.cjs');

module.exports = async function solverMobile(browser, base, out, name) {
  const errors = [], checked = [];
  for (const [width, height] of [[320,568], [390,744], [430,932], [568,320], [667,375], [844,390]]) {
    const context = await browser.newContext({viewport:{width,height}, hasTouch:true,
      ...(name === 'firefox' ? {} : {isMobile:true}), serviceWorkers:'block'});
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    const saved = predicate => waitForAsync(page, async expression => {
      const s = (await (await import('/backgammon/core/storage.mjs')).get('work','solver'))?.state;
      return s && new Function('s', `return ${expression}`)(s);
    }, predicate);
    const layout = async () => {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const m = await page.evaluate(() => {
        const rect = selector => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};
        };
        return {slot:rect('#board'),board:rect('.bg-board'),top:rect('#opponent'),bottom:rect('#player'),
          controls:rect('.solver-controls'),actions:rect('.solver-controls > .action-main'),
          overflow:document.documentElement.scrollWidth > innerWidth + 1};
      });
      assert.equal(m.overflow,false,`${width}: no sideways scrolling`);
      assert.ok(Math.abs(m.board.w / m.board.h - 876 / 660) < .01,`${width}: SVG fits its actual board, without letterboxing: ${JSON.stringify(m.board)}`);
      assert.ok(m.top.bottom <= m.board.y + 1 && m.slot.bottom <= m.bottom.y + 1,`${width}: player labels never cover board or equity`);
      if (width < height) {
        assert.ok(Math.abs(m.board.x-m.slot.x)<1 && Math.abs(m.board.w-m.slot.w)<1,`${width}: portrait board uses full width`);
        assert.ok(m.controls.y >= m.bottom.bottom,`${width}: controls follow player strip`);
      } else {
        assert.ok(m.controls.w >= 240,`${width}: usable landscape control rail`);
        assert.ok(m.controls.x >= m.slot.right && m.controls.bottom <= height + 1,`${width}: rail stays beside the board and inside viewport`);
      }
      return m;
    };
    try {
      await page.goto(base+'/backgammon/solver/');
      await page.locator('#edit-position').waitFor();
      const initial = await layout();
      await page.locator('#edit-position').tap();
      await page.locator('.bg-board.is-editor').waitFor();
      assert.equal(await page.locator('#edit-position').getAttribute('aria-pressed'),'true');
      const edited = await layout();
      assert.deepEqual([edited.board.w,edited.board.h],[initial.board.w,initial.board.h]);
      // Actual touch editing: remove, add, undo and redo, with the same saved position.
      await page.locator('[data-point="7"] > .checker').last().tap();
      await saved('s.off[0] === 1');
      await page.locator('[data-point="6"] .point-hit').tap();
      await saved('s.points[6] === 1 && s.off[0] === 0');
      await page.locator('#editor-undo').tap();
      await saved('s.points[6] === 0 && s.off[0] === 1');
      await page.locator('#editor-redo').tap();
      await saved('s.points[6] === 1 && s.off[0] === 0');
      await page.locator('#solver-dice').tap();
      const dialog = page.locator('.dice-editor-dialog');
      await dialog.waitFor();
      const box = await dialog.boundingBox();
      assert.ok(box.x >= 0 && box.y >= 0 && box.x+box.width <= width+1 && box.y+box.height <= height+1,`${width}: dice dialog fits`);
      await page.getByRole('button',{name:'Apply dice',exact:true}).tap();
      await page.locator('#editor-tools > summary').tap();
      await page.locator('#editor-start').tap();
      await saved('s.points[7] === 3 && s.off[0] === 0');
      await page.locator('#editor-tools > summary').tap();
      await page.evaluate(() => {scrollTo(0,0);document.querySelector('.solver-controls').scrollTop=0;});
      await layout();
      await page.screenshot({path:path.join(out,`${name}-solver-mobile-edit-${width}.png`),fullPage:true});
      // The pinned actions must stay tappable while the landscape editor scrolls.
      await page.locator('[data-analyze-preset="deep"]').tap();
      await page.waitForFunction(() => document.querySelector('#analyze')?.textContent === 'Analyze' &&
        !document.querySelector('.study-strip').hidden,null,{timeout:60000});
      await page.getByRole('button',{name:'Next move preview',exact:true}).tap();
      await page.getByRole('button',{name:'Show original position',exact:true}).tap();
      await page.getByRole('button',{name:'Compare evaluated moves',exact:true}).tap();
      await page.locator('#details-dialog').waitFor();
      await page.locator('#details-dialog .list-row').first().tap();
      await page.waitForFunction(() => !document.querySelector('#details-dialog[open]'));
      await page.evaluate(() => {scrollTo(0,0);document.querySelector('.solver-controls').scrollTop=0;});
      await layout();
      assert.ok(await page.evaluate(() => {
        const preview = document.querySelector('.study-strip').getBoundingClientRect();
        const search = document.querySelector('.solver-quick-analysis').getBoundingClientRect();
        return preview.bottom <= search.top + 1;
      }), 'move previews appear before additional searches');
      if (width > height) {
        const preview = await page.getByRole('button',{name:'Compare evaluated moves',exact:true}).boundingBox();
        assert.ok(preview.y >= 0 && preview.y + preview.height <= height, 'landscape preview is visible without scrolling');
      }
      await page.screenshot({path:path.join(out,`${name}-solver-mobile-results-${width}.png`),fullPage:true});
      // Rotation retains the source and the same reachable controls.
      await page.setViewportSize({width:height,height:width});
      await page.locator('#edit-position').tap();
      await saved('s.points[7] === 3 && s.off[0] === 0');
      checked.push({width,height,touchEditing:true,realAnalysis:true});
    } catch (error) {
      await page.screenshot({path:path.join(out,`${name}-solver-mobile-failure-${width}.png`),fullPage:true});
      throw error;
    } finally { await context.close(); }
  }
  assert.deepEqual(errors,[]);
  return {checked,errors};
};
