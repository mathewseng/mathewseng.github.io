const { showPlayControls } = require("./play-helpers.cjs");
const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function touchAdvanced(browser, base, out, name) {
  const context = await browser.newContext({ viewport: {width:390,height:844}, hasTouch:true, reducedMotion:'reduce', serviceWorkers:'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const ready = () => page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
  const consumed = () => page.locator('.board-die.consumed').count();
  const tapChecker = async point => {
    const rect = await page.locator(`[data-point="${point}"] .checker > circle`).first().boundingBox();
    await page.touchscreen.tap(rect.x+rect.width/2,rect.y+rect.height/2);
  };
  try {
    await page.goto(base+'/backgammon/play/'); await ready();
    await page.evaluate(async () => {
      const {put,saveSettings} = await import('/backgammon/core/storage.mjs');
      const {initialState} = await import('/backgammon/core/rules.mjs');
      const {localConfig,defaultPlayRules} = await import('/backgammon/core/play-session.mjs');
      saveSettings({interactionMode:'advanced',motion:'reduce'});
      const s = initialState({phase:'move',dice:[4,1],matchLength:0,rules:defaultPlayRules(0)});
      await put('work',{id:'play',game:{id:'touch-advanced',state:s,initial:s,events:[],started:true,names:['You','Friend'],config:localConfig({mode:'local'})},draft:[]});
    });
    await page.reload(); await ready(); await page.locator('#resume-match').tap();
    await tapChecker(12); assert.equal(await consumed(),1);
    await page.keyboard.press('s'); assert.equal(await consumed(),0,'S undoes the chosen draft step');
    await page.keyboard.press('s'); assert.equal(await page.locator('.board-die.preferred').getAttribute('data-die'),'1');
    await page.locator('.dice-switch').tap(); assert.equal(await page.locator('.board-die.preferred').getAttribute('data-die'),'4');
    await page.keyboard.press('1'); assert.equal(await consumed(),1,'point shortcut plays from occupied point');
    await page.keyboard.press('z'); assert.equal(await consumed(),0);
    await tapChecker(5); await tapChecker(5); assert.equal(await consumed(),2,'repeated taps each play a die');
    assert.equal(await page.evaluate(() => visualViewport.scale),1,'double tap does not zoom');
    assert.equal(await page.evaluate(() => getSelection().toString()),'','touch does not select native text');
    assert.equal(await page.locator('#confirm').isEnabled(),true);
    await page.keyboard.press('c');
    await page.waitForSelector('.board-cube[role="button"]');
    assert.equal(await page.locator('.board-cube').textContent().then(t=>t.includes('D')),true);
    await page.screenshot({path:path.join(out,`${name}-cube-shortcut-phone.png`)});
    // Tap outside the larger face but inside its free-lane target. This must
    // offer the cube, not trigger the adjacent board's roll action.
    const cubeTap=await page.evaluate(()=>{const p=new DOMPoint(805,330).matrixTransform(document.querySelector('#board svg').getScreenCTM());return{x:p.x,y:p.y};});
    assert.equal(await page.locator('.cube-face').getAttribute('width'),'52');
    await page.touchscreen.tap(cubeTap.x,cubeTap.y);
    await page.locator('#take-cube').waitFor();
    const cubeOverlap=await page.evaluate(()=>{
      const a=document.querySelector('.cube-hit').getBBox();
      // Include the generous pickup target around a populated tray's checker.
      const trays=[...document.querySelectorAll('[data-point^="off"] .point-hit')].map(n=>n.getBBox());
      trays.push({x:820,y:221,width:46,height:58},{x:820,y:381,width:46,height:58});
      return trays.some(b=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y);
    });
    assert.equal(cubeOverlap,false,'cube hitbox does not steal off-tray taps');
    await page.keyboard.press('c');assert.equal(await page.locator('#take-cube').count(),1,'C never takes or redoubles');
    await page.keyboard.press('t');
    await page.waitForSelector('.board-cube[role="button"]',{state:'hidden'});
    // Anywhere on the board rolls, including a checker under the pointer.
    // Keep a choiceful roll: a random forced turn can finish before #confirm is
    // observable, which does not indicate a failed roll or broken touch input.
    await page.evaluate(() => {
      const random = crypto.getRandomValues.bind(crypto), dice = [3, 0];
      crypto.getRandomValues = a => a instanceof Uint8Array && a.length === 1 && dice.length
        ? ((a[0] = dice.shift()), a) : random(a);
    });
    await page.keyboard.press('c');
    await page.waitForSelector('#confirm');
    await showPlayControls(page);
    await page.locator('#all-controls').tap();
    assert.equal(await page.locator('.practice-controls-dialog .controls-nav a').count(),4);
    await page.locator('dialog .close').tap();
    await page.setViewportSize({width:844,height:390});
    await page.locator('#preferences').tap();
    assert.equal(await page.getByLabel('Playing style',{exact:true}).inputValue(),'advanced');
    await page.locator('dialog .close').tap();
    await page.screenshot({path:path.join(out,`${name}-touch-landscape.png`)});
    assert.deepEqual(errors,[]);
    return {touch:true,keyboard:true,cube:true,boardRoll:true,selection:false,doubleTapZoom:false};
  } finally {await context.close();}
};
