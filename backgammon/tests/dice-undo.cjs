const { waitForAsync } = require("./play-helpers.cjs");
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
    const load = async (dice, mode = 'advanced', state = null, {turn = 0, orientation = 0} = {}) => {
      await page.evaluate(async ({dice, mode, state, turn, orientation}) => {
        const {put,saveSettings} = await import('/backgammon/core/storage.mjs');
        const {initialState} = await import('/backgammon/core/rules.mjs');
        const {localConfig} = await import('/backgammon/core/play-session.mjs');
        const points = Array(24).fill(0); points[12] = 1; points[5] = 14; points[23] = -15;
        const s = state || initialState({phase:'move', dice, turn, points:turn ? points.reverse().map(n=>-n) : points, matchLength:0});
        saveSettings({interactionMode:mode, motion:'reduce', orientation});
        await put('work', {id:'play', game:{id:'die-undo', initial:s,state:s,events:[],started:true,names:['You','Friend'],config:localConfig({mode:'local'})},draft:[]});
      }, {dice,mode,state,turn,orientation});
      await page.reload(); await ready(); await tap(page.locator('#resume-match'));
    };
    const count = async n => waitForAsync(page,async n => (await (await import('/backgammon/core/storage.mjs')).get('work','play')).draft.length === n && document.querySelectorAll('#board .board-die.consumed').length === n, n);
    const tapBoard = async (x,y) => {
      const p = await page.locator('#board svg').evaluate((svg,{x,y}) => {
        const p = new DOMPoint(x,y).matrixTransform(svg.getScreenCTM()); return {x:p.x,y:p.y,hit:document.elementFromPoint(p.x,p.y)?.outerHTML.slice(0,300)};
      }, {x,y});
      // WebKit truncates fractional touch coordinates; round to the intended pixel.
      if (touch) await page.touchscreen.tap(Math.round(p.x),Math.round(p.y));
      else await page.mouse.click(p.x,p.y);
      return p;
    };
    try {
      await page.goto(base+'/backgammon/play/'); await ready();
      // Every doubles slot restores one die, rebasing the same checker’s remaining steps.
      for (const slot of [3, 2, 1, 0]) {
        await load([3,3]);
        for (const point of [12,9,6,3]) await tap(page.locator(`#board [data-point="${point}"] .checker`).last());
        await count(4);
        if (slot === 3) {
          // Keep inside the lane after mobile browsers round touch coordinates.
          await tapBoard(450,330); await count(3);
          assert.equal(await page.locator('#board [data-point="3"] .checker').count(), 1, `last step returns to point 4: ${JSON.stringify((await read()).draft)}`);
          await tap(page.locator('#board [data-point="3"] .checker').last()); await count(4);
        }
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
        await count(3);
        const after = await read();
        assert.deepEqual(after.draft, before.draft.slice(0,3));
        assert.deepEqual(after.game.state, before.game.state, 'dice taps never change the committed roll');
        assert.equal(after.game.events.length, 0, 'undo cannot submit or take back a turn');
        assert.equal(await used(), 3);
        assert.equal(await page.locator('#confirm').isDisabled(), true);
      }
      // Undo the first die of a combined checker journey without clearing both.
      for(const value of [4,1]){
        await load([4,1]);
        for(const point of [12,8])await tap(page.locator(`#board [data-point="${point}"] .checker`).last());
        await count(2);
        await tap(page.locator(`#board .board-die[data-die="${value}"]`));await count(1);
        assert.deepEqual((await read()).draft,[{from:12,to:value===4?11:8,die:value===4?1:4}]);
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
      // The entire empty middle lane, including both far edges, switches before
      // a move and undoes only the editable draft afterward. Exercise the real
      // saved Play session with mouse/touch, both players and both orientations.
      for (const mode of ['advanced','beginner']) for (const turn of [0,1]) for (const orientation of [0,1]) {
        await load([4,1],mode,null,{turn,orientation});
        const right = turn === orientation, edge = right ? 430 : 20;
        const xs = right ? [430,490,610,730,796] : [20,80,204,324,386];
        const selectedDie = () => page.locator('#board .board-die.preferred').getAttribute('data-die');
        await tap(page.locator('#board .board-die[data-die="4"]'));
        for (const x of xs) for (const y of [296,364]) {
          const before = await selectedDie();
          await tapBoard(x,y);
          assert.notEqual(await selectedDie(),before,`empty dice half switches at ${x},${y}, turn ${turn}, orientation ${orientation}, ${mode}`);
          await count(0);
        }
        const preferred = await selectedDie();
        for (const x of [right ? 204 : 610,408]) {
          const hit = await tapBoard(x,330);
          assert.equal(await selectedDie(),preferred,`opposite half/bar does not switch: ${JSON.stringify({touch,mode,turn,orientation,x,hit})}`);
        }
        await tap(page.locator('#board .board-die[data-die="4"]'));
        // Selecting the active face toggles; explicitly select 4 if necessary.
        if (await selectedDie() !== '4') await tapBoard(edge,330);
        const source = turn ? 11 : 12, destination = turn ? 15 : 8;
        await tap(page.locator(`#board [data-point="${source}"] .checker`).last());
        if (mode === 'beginner') await tap(page.locator(`#board [data-point="${destination}"] .point-hit`));
        await count(1);
        const committed = (await read()).game;
        await tapBoard(edge,330); await count(0);
        assert.deepEqual((await read()).game,committed,'empty-lane undo preserves committed dice, events and game');
        const boundaries = await page.locator('#board svg').evaluate((svg,xs) => xs.flatMap(x => [290,370].map(y => {
          const p = new DOMPoint(x,y).matrixTransform(svg.getScreenCTM());
          const hit = document.elementFromPoint(p.x,p.y);
          return {point:!!hit?.closest('[data-point]'),x,y,hit:hit?.outerHTML.slice(0,300)};
        })), right ? [450,630,780] : [40,200,370]);
        assert.ok(boundaries.every(p=>p.point),`full-width lane does not cover adjacent point targets: ${JSON.stringify({touch,mode,turn,orientation,boundaries})}`);
        results.push({touch,mode,turn,orientation,fullDiceLane:true});
      }
      // Match visual slots to chronological dice use, even when rolled in the other order.
      for(const reverse of [false,true])for(const value of [4,1]){
        await load([4,1]);
        if(reverse)await page.keyboard.press('s');
        for(const point of reverse?[5,12]:[12,5])await tap(page.locator(`#board [data-point="${point}"] .checker`).last());
        await count(2);
        const before=await read(),retained=before.draft.filter(step=>step.die!==value);
        await tap(page.locator(`#board .board-die[data-die="${value}"]`));
        await count(1);
        assert.deepEqual((await read()).draft,retained,'die tap preserves the other independent move');
        assert.deepEqual((await read()).game,before.game,'single-die undo preserves committed state');
        assert.equal(await page.locator(`#board .board-die[data-die="${value}"]`).getAttribute('data-status'),'selected');
      }
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
      const mark = await page.locator('#board .board-die.forced').evaluate(die=>({
        arrow:getComputedStyle(die.querySelector('.die-forced')).opacity,
        check:getComputedStyle(die.querySelector('.die-check')).opacity,
        color:getComputedStyle(die.querySelector('.die-forced')).stroke,
      }));
      assert.deepEqual(mark,{arrow:'1',check:'0',color:'rgb(239, 179, 101)'});
      await page.screenshot({path:path.join(out,`${name}-forced-arrow-${touch?'phone':'desktop'}.png`)});
      await tap(page.locator('#board .board-die.consumed').first()); await count(1);
      await tapBoard(450,330); await count(1);
      assert.equal((await read()).game.events.length,0,'empty-lane tap cannot undo a forced step or committed turn');
      await page.keyboard.press('x'); await count(1);
      await load([4,1]);
      for (const viewport of touch ? [{width:320,height:568},{width:375,height:667},{width:390,height:844},{width:430,height:932},{width:844,height:390}] : [{width:1366,height:768},{width:1440,height:900}]) {
        await page.setViewportSize(viewport);
        // The board fits after the viewport resize observer and its next frame.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const geometry = await page.evaluate(() => {
          const rect = s => document.querySelector(s).getBoundingClientRect().toJSON();
          const dice = [...document.querySelectorAll('#board .board-die-face > rect:first-child')].map(n=>n.getBoundingClientRect().toJSON());
          return {board:rect('#board .bg-board'),confirm:rect('#confirm'),swap:rect('#board .dice-switch-surface'),dice,overflow:document.documentElement.scrollWidth > innerWidth+1};
        });
        assert.equal(geometry.overflow,false);
        assert.ok(geometry.confirm.width>=44&&geometry.confirm.height>=44);
        assert.ok(geometry.confirm.bottom<=viewport.height+2,`reachable confirm ${JSON.stringify({viewport,geometry})}`);
        for(const die of geometry.dice) assert.ok(die.right<geometry.swap.left||die.left>geometry.swap.right,'switch never covers enlarged dice');
        // Eight pixels of page gutters plus the 32px equity rail.
        if(touch&&viewport.width<viewport.height) assert.ok(geometry.board.width>=viewport.width-40-1,`portrait board uses the available width: ${JSON.stringify({viewport,geometry})}`);
        if(touch&&viewport.width>viewport.height) assert.ok(geometry.board.height>=viewport.height*.93,'landscape board uses almost full height');
        await page.screenshot({path:path.join(out,`${name}-dice-undo-${viewport.width}x${viewport.height}.png`)});
        results.push({touch,viewport,geometry});
      }
      assert.deepEqual(errors,[]);
    } catch (error) {
      await page.screenshot({path:path.join(out,`${name}-dice-undo-failure-${touch?'touch':'mouse'}.png`)});
      console.error('Dice undo state', JSON.stringify({touch, draft:(await read())?.draft}));
      throw error;
    } finally {await context.close();}
  }
  return results;
};
