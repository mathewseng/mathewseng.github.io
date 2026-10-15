const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
module.exports = async function diceUndo(browser, base, out, name) {
  const results = [];
  for (const touch of [false, true]) {
    const context = await browser.newContext({viewport: touch ? {width:390,height:844} : {width:1366,height:768}, hasTouch:touch, reducedMotion:'reduce', serviceWorkers:'block'});
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const ready = () => page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    const tap = async locator => touch ? locator.tap() : locator.click();
    const read = () => page.evaluate(async () => (await import('/backgammon/core/storage.mjs')).get('work','play'));
    const used = () => page.locator('#board .board-die.consumed').count();
    const load = async (dice, mode = 'advanced', state = null) => {
      await page.evaluate(async ({dice, mode, state}) => {
        const {put,saveSettings} = await import('/backgammon/core/storage.mjs');
        const {initialState} = await import('/backgammon/core/rules.mjs');
        const {localConfig} = await import('/backgammon/core/play-session.mjs');
        const points = Array(24).fill(0); points[12] = 1; points[5] = 14; points[23] = -15;
        const s = state || initialState({phase:'move', dice, points, matchLength:0});
        saveSettings({interactionMode:mode, motion:'reduce'});
        await put('work', {id:'play', game:{id:'die-undo', initial:s,state:s,events:[],started:true,names:['You','Friend'],config:localConfig({mode:'local'})},draft:[]});
      }, {dice,mode,state});
      await page.reload(); await ready(); await tap(page.locator('#resume-match'));
    };
    const count = async n => page.waitForFunction(async n => (await (await import('/backgammon/core/storage.mjs')).get('work','play')).draft.length === n, n);
    try {
      await page.goto(base+'/backgammon/play/'); await ready();
      // Every doubles slot reverses that step and its dependent continuation.
      for (const slot of [3, 2, 1, 0]) {
        await load([3,3]);
        for (const point of [12,9,6,3]) await tap(page.locator(`#board [data-point="${point}"] .checker`).last());
        await count(4);
        const before = await read();
        if (slot === 3) {
          const clear = await page.evaluate(() => {
            const icon = document.querySelector('#board .dice-switch-surface').getBoundingClientRect();
            return [...document.querySelectorAll('#board .board-die-face > rect:first-child')].every(n => {
              const r = n.getBoundingClientRect(); return r.right < icon.left || r.left > icon.right;
            });
          });
          assert.ok(clear, 'doubles undo icon stays clear of every face');
          await page.screenshot({path:path.join(out,`${name}-dice-undo-ready-${touch?'phone':'desktop'}.png`)});
        }
        assert.equal(await page.locator('#confirm').isEnabled(), true);
        await tap(page.locator('#board .board-die').nth(slot));
        await count(slot);
        const after = await read();
        assert.deepEqual(after.draft, before.draft.slice(0,slot));
        assert.deepEqual(after.game.state, before.game.state, 'dice taps never change the committed roll');
        assert.equal(after.game.events.length, 0, 'undo cannot submit or take back a turn');
        assert.equal(await used(), slot);
        assert.equal(await page.locator('#confirm').isDisabled(), true);
      }
      // Available dice also undo, instead of merely changing preference.
      for (const mode of ['advanced','beginner']) {
        await load([4,1], mode);
        await tap(page.locator('#board [data-point="12"] .checker').last());
        if (mode === 'beginner') await tap(page.locator('#board [data-point="8"] .point-hit'));
        await count(1);
        await tap(page.locator('#board .board-die:not(.consumed)').first());
        await count(0);
      }
      // Match visual slots to chronological dice use, even when rolled in the other order.
      await load([4,1]);
      await page.keyboard.press('s');
      await tap(page.locator('#board [data-point="5"] .checker').last());
      await tap(page.locator('#board [data-point="12"] .checker').last());
      await count(2);
      assert.deepEqual(await page.locator('#board .board-die').evaluateAll(ds => ds.map(d => Number(d.dataset.draftIndex))), [1,0]);
      await tap(page.locator('#board .board-die').first()); await count(1);
      await page.keyboard.press('x'); await count(0);
      await page.keyboard.press('z'); await count(0);
      assert.equal((await read()).game.events.length, 0);
      assert.equal(await page.locator('#undo,#reset-draft,.board-undo').count(),0);
      assert.equal(await page.locator('.draft-shortcuts').isVisible(),!touch);
      assert.equal(await page.locator('.draft-shortcuts').textContent().then(s=>s.includes('Z')&&s.includes('X')),true);
      // Forced dice are kept when a user taps a locked step or uses reset.
      const forced = JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/forced-seven.json'))).state;
      await load(forced.dice,'advanced',forced); await count(1);
      await tap(page.locator('#board .board-die.consumed').first()); await count(1);
      await page.keyboard.press('x'); await count(1);
      await load([4,1]);
      for (const viewport of touch ? [{width:320,height:568},{width:375,height:667},{width:390,height:844},{width:430,height:932},{width:844,height:390}] : [{width:1366,height:768},{width:1440,height:900}]) {
        await page.setViewportSize(viewport);
        const geometry = await page.evaluate(() => {
          const rect = s => document.querySelector(s).getBoundingClientRect().toJSON();
          const dice = [...document.querySelectorAll('#board .board-die-face > rect:first-child')].map(n=>n.getBoundingClientRect().toJSON());
          return {board:rect('#board .bg-board'),confirm:rect('#confirm'),swap:rect('#board .dice-switch-surface'),dice,overflow:document.documentElement.scrollWidth > innerWidth+1};
        });
        assert.equal(geometry.overflow,false);
        assert.ok(geometry.confirm.width>=44&&geometry.confirm.height>=44);
        assert.ok(geometry.confirm.bottom<=viewport.height+2,`reachable confirm ${JSON.stringify({viewport,geometry})}`);
        for(const die of geometry.dice) assert.ok(die.right<geometry.swap.left||die.left>geometry.swap.right,'switch never covers enlarged dice');
        if(touch&&viewport.width<viewport.height) assert.ok(geometry.board.width>=viewport.width-36,'portrait board uses the available width');
        if(touch&&viewport.width>viewport.height) assert.ok(geometry.board.height>=viewport.height*.93,'landscape board uses almost full height');
        await page.screenshot({path:path.join(out,`${name}-dice-undo-${viewport.width}x${viewport.height}.png`)});
        results.push({touch,viewport,geometry});
      }
      assert.deepEqual(errors,[]);
    } finally {await context.close();}
  }
  return results;
};
