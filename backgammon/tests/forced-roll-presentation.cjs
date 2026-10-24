const assert = require('node:assert/strict');
const {seedOpening,waitWork,work} = require('./play-helpers.cjs');
const forced = require('./fixtures/forced-seven.json').state;

module.exports = async function forcedRollPresentation(browser,base) {
  const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'no-preference'});
  const page = await context.newPage(), errors = [], cases=[];
  page.on('pageerror',e=>errors.push(e.message));
  await seedOpening(page,[5,6]);
  const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  try {
    for(const viewport of [{width:390,height:844},{width:844,height:390}]) {
      await page.setViewportSize({width:390,height:844});
      await page.goto(base+'/backgammon/');await ready();
      await page.evaluate(async forced=>{
        const {put,saveSettings}=await import('/backgammon/core/storage.mjs');
        const {positionKey}=await import('/backgammon/core/rules.mjs');
        const {localConfig}=await import('/backgammon/core/play-session.mjs');
        const state={...forced,phase:'roll',dice:[]};
        saveSettings({motion:'full',interactionMode:'advanced',equityBar:false});
        await put('work',{id:'play',game:{id:'forced-roll-presentation',initial:state,state,events:[],started:true,
          names:['White','Black'],config:localConfig({mode:'local'})},draft:[],positionKey:positionKey(state)});
      },forced);
      await page.goto(base+'/backgammon/play/');await ready();
      await page.evaluate(async()=>{
        const {Board}=await import('/backgammon/ui/board.mjs');
        const play=Board.prototype.playTurn,roll=Board.prototype.animateDice;
        window.presentation={};
        Board.prototype.animateDice=function(...args){const r=roll.apply(this,args);presentation.rollAt=performance.now();presentation.settledAt=this.diceSettledAt;return r;};
        Board.prototype.playTurn=function(...args){presentation.playAt=performance.now();return play.apply(this,args);};
      });
      await page.locator('#resume-match').tap();
      await page.setViewportSize(viewport);
      await page.locator('#board .board-caption[role="button"]').tap();
      await waitWork(page,s=>s?.game.state.phase==='move');
      assert.equal((await work(page)).draft.length,0,'compulsory checker waits for the visible roll');
      // A tap during that presentation cannot consume a different die or lock
      // a voluntary move as if it were the mandatory prefix.
      await page.locator('#board [data-point="6"] .checker').last().tap();
      await page.keyboard.press('y');
      assert.equal((await work(page)).draft.length,0);
      await waitWork(page,s=>s?.draft.length===1);
      const timing=await page.evaluate(()=>presentation);
      assert.ok(timing.playAt>=timing.settledAt,JSON.stringify(timing));
      assert.deepEqual((await work(page)).draft,[{from:6,to:0,die:6}]);
      await page.waitForFunction(()=>!document.querySelector('.moving-checker')&&document.querySelector('#board .board-die.forced'));
      await page.waitForTimeout(250);
      assert.equal(await page.locator('#board .board-die.forced').count(),1);
      assert.equal(await page.locator('#confirm').isDisabled(),true);
      await page.locator('#board [data-point="6"] .checker').last().tap();
      await waitWork(page,s=>s?.draft.length===2);
      assert.equal(await page.locator('#confirm').isEnabled(),true);
      cases.push({viewport,timing});
    }
    assert.deepEqual(errors,[]);
    return {cases};
  } finally {await context.close();}
};
