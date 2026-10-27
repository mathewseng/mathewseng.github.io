const assert=require('node:assert/strict'),path=require('node:path');
const {waitWork}=require('./play-helpers.cjs');
module.exports=async(browser,base,out,name)=>{
 const report=[];
 for(const [layout,width,height,touch] of [['desktop',1366,768,false],['portrait',390,844,true],['landscape',844,390,true]]){
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:touch,reducedMotion:'no-preference',serviceWorkers:'block'});
  const page=await ctx.newPage(),errors=[];
  const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(base+'/backgammon/');await ready();
   await page.evaluate(async()=>{
    const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
    const {localConfig,defaultPlayRules}=await import('/backgammon/core/play-session.mjs'),{playAction}=await import('/backgammon/core/table.mjs');
    const initial=r.initialState({turn:0,phase:'move',dice:[6,4],matchLength:0,rules:defaultPlayRules(0)});
    const game=playAction({id:'cube-dice',started:true,initial,state:initial,events:[],names:['White','Black'],
     config:localConfig({mode:'local',matchLength:0,rules:initial.rules,tutor:false,warning:false})},
     {type:'move',steps:[{from:7,to:1,die:6},{from:5,to:1,die:4}]});
    st.saveSettings({motion:'system',motionScale:.5,analysisAhead:false,equityBar:false,keyboardEnabled:true,skin:'liquid-chrome'});
    await st.put('work',{id:'play',game,draft:[]});
   });
   await page.goto(base+'/backgammon/play/');await ready();
   // Keep this focused on cube controls and historical dice, with no bot/tutor wait.
   await page.evaluate(async()=>{(await import('/backgammon/engine/client.mjs')).EngineClient.prototype.analyze=()=>new Promise(()=>{});});
   await page.locator('#resume-match').click();await page.locator('#board.roll-ready').waitFor();
   assert.equal(await page.locator('#board .board-dice.last-roll .board-die').count(),2,'fixture has the previous real turn\'s dice');
   assert.ok(await page.locator('#board .last-move-ghost').count());
   if(touch)await page.locator('#board .board-cube').tap();else await page.keyboard.press('d');
   await page.locator('#take-cube').waitFor();
   const hidden=async()=>{
    assert.equal(await page.locator('#board .board-die,#board .dice-switch,#board .dice-switch-hit,#board .dice-layout-retiring').count(),0,'no dice or dice hit targets beneath cube buttons');
    assert.equal(await page.locator('#board .board-dice').getAttribute('display'),'none');
    assert.ok(await page.locator('#board .last-move-ghost').count(),'last-move checker trace stays available');
   };
   await hidden();
   await page.waitForLoadState('networkidle');
   // Capture the actual settled UI, with normal motion enabled.
   await page.waitForFunction(()=>!document.getAnimations().some(a=>a.playState==='running'&&a.effect?.getTiming().iterations!==Infinity));
   await page.screenshot({path:path.join(out,`${name}-cube-without-dice-${layout}.png`)});
   for(let depth=1;depth<=3;depth++){
    if(touch)await page.locator('#immediate-redouble').tap();else await page.keyboard.press(depth%2?'b':'r');
    await waitWork(page,w=>w?.game.state.pending?.depth===depth);
    await hidden();
   }
   // Persisted/reloaded offers must hide old rolls as well.
   await page.waitForLoadState('networkidle');await page.reload();await ready();
   await page.evaluate(async()=>{(await import('/backgammon/engine/client.mjs')).EngineClient.prototype.analyze=()=>new Promise(()=>{});});
   await page.locator('#resume-match').click();await page.locator('#take-cube').waitFor();await hidden();
   await page.locator('#take-cube').click();
   await page.locator('#board .board-dice:not(.last-roll) .board-die').first().waitFor();
   const rolled=await waitWork(page,w=>w?.game.events.some(e=>e.action.type==='roll'));
   assert.equal(rolled.game.state.phase,'move');
   assert.equal(rolled.game.state.cube.value,16);
   assert.equal(await page.locator('#board .board-dice').getAttribute('display'),null,'newly rolled dice return after the offer is accepted');
   assert.ok(await page.locator('.board-cube-replies').isHidden());
   await page.waitForLoadState('networkidle');
   assert.deepEqual(errors,[]);
   report.push({layout,previousDice:[6,4],hiddenDuring:['double','beaver','raccoon','rebeaver','reload'],newRoll:rolled.game.state.dice});
  }finally{await ctx.close();}
 }
 return report;
};
