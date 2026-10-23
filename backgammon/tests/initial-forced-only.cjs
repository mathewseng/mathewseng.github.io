const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { waitWork } = require('./play-helpers.cjs');

module.exports = async function initialForcedOnly(browser, base, out, name) {
  const cases = [];
  for (const touch of [false, true]) {
    const context = await browser.newContext({
      viewport: touch ? {width:390,height:844} : {width:1366,height:768},
      hasTouch:touch, reducedMotion:'reduce', serviceWorkers:'block',
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    const ready = () => page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    const tap = locator => touch ? locator.tap() : locator.click();
    const load = async (mode, turn, fixture = null) => {
      await page.goto(base+'/backgammon/'); await ready();
      await page.evaluate(async ({mode,turn,fixture}) => {
        const {put,saveSettings} = await import('/backgammon/core/storage.mjs');
        const {initialState,positionKey} = await import('/backgammon/core/rules.mjs');
        const {localConfig} = await import('/backgammon/core/play-session.mjs');
        const points = Array(24).fill(0);
        points[5]=1; points[4]=14; points[23]=-15;
        const state = fixture || initialState({phase:'move',dice:[1,2],turn,
          points:turn ? points.reverse().map(n=>-n) : points});
        saveSettings({interactionMode:mode,motion:'reduce',orientation:turn});
        await put('work',{id:'play',game:{id:'initial-forced-only',initial:state,state,
          events:[],started:true,names:['White','Black'],config:localConfig({mode:'local'})},
          draft:[],positionKey:positionKey(state)});
      },{mode,turn,fixture});
      await page.goto(base+'/backgammon/play/'); await ready();
      await tap(page.locator('#resume-match'));
    };
    const count = n => waitWork(page, s => s?.draft.length === n);
    try {
      for (const mode of ['advanced','beginner']) for (const turn of [0,1]) {
        await load(mode,turn);
        const p = n => turn ? 23-n : n;
        if (mode === 'advanced' && await page.locator('#board .board-die.preferred').getAttribute('data-die') !== '1')
          await tap(page.locator('#board .board-die[data-die="1"]'));
        await tap(page.locator(`#board [data-point="${p(5)}"] .checker`).last());
        if (mode === 'beginner') await tap(page.locator(`#board [data-point="${p(4)}"] .point-number-hit`));
        const first = await count(1);
        assert.deepEqual(first.draft,[{from:p(5),to:p(4),die:1}]);
        // Allow the old queued auto-completion to run; it must leave this die alone.
        await page.waitForTimeout(600);
        assert.equal((await count(1)).game.events.length,0);
        assert.equal(await page.locator('#board .board-die.consumed').count(),1);
        assert.equal(await page.locator('#board .board-die.forced').count(),0);
        assert.equal(await page.locator('#confirm').isDisabled(),true);
        await tap(page.locator(`#board [data-point="${p(4)}"] .checker`).last());
        if (mode === 'beginner') await tap(page.locator(`#board [data-point="${p(2)}"] .point-number-hit`));
        await count(2);
        assert.equal(await page.locator('#confirm').isEnabled(),true);
        const marks = await page.locator('#board .board-die.consumed').evaluateAll(dice => dice.map(d => ({
          check:getComputedStyle(d.querySelector('.die-check')).opacity,
          forced:getComputedStyle(d.querySelector('.die-forced')).opacity,
        })));
        assert.ok(marks.every(mark => mark.check === '1' && mark.forced === '0'),JSON.stringify(marks));
        // Undoing and restoring must not reapply the unique suffix either.
        await tap(page.locator('#board .board-die[data-die="2"]'));
        await count(1); await page.reload(); await ready();
        await tap(page.locator('#resume-match')); await count(1);
        await page.waitForTimeout(600);
        assert.equal(await page.locator('#board .board-die.consumed').count(),1);
        assert.equal(await page.locator('#confirm').isDisabled(),true);
        cases.push({touch,mode,turn,manualRemainder:true});
      }
      const forced = JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/forced-seven.json'))).state;
      await load('advanced',0,forced);
      await count(1);
      assert.equal(await page.locator('#board .board-die.forced').count(),1,'initial compulsory move still plays automatically');
      await page.screenshot({path:path.join(out,`${name}-initial-forced-${touch?'phone':'desktop'}.png`)});
      assert.deepEqual(errors,[]);
    } finally { await context.close(); }
  }
  return {cases};
};
