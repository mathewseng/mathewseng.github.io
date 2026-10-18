const assert=require('node:assert/strict');
const {seedOpening,work,waitWork}=require('./play-helpers.cjs');
module.exports=async function sealedRoll(browser,base){
 const reports=[];
 for(const touch of [false,true])for(const kind of ['single','gammon','finish']){
  const gammon=kind==='gammon',finishes=kind==='finish';
  const ctx=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1366,height:768},hasTouch:touch,serviceWorkers:'block'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   const dice=gammon?[6,5]:finishes?[6,1]:[1,1];await seedOpening(page,dice);
   await page.goto(base+'/backgammon/');
   const initial=await page.evaluate(async ({gammon,finishes})=>{
    const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
    const {localConfig}=await import('/backgammon/core/play-session.mjs');
    const {certainBearoff}=await import('/backgammon/core/certain-bearoff.mjs');
    const points=Array(24).fill(0);points[gammon||finishes?5:2]=gammon?3:finishes?1:2;points[gammon?17:23]=gammon?-15:finishes?-1:-5;
    const s=r.initialState({phase:'roll',points,off:gammon?[12,0]:finishes?[14,14]:[13,10],matchLength:0,cube:{value:4,owner:0}});
    if(certainBearoff(s))throw Error('Fixture must remain uncertain before rolling');
    st.saveSettings({motion:'full',equityBar:false,analysisAhead:false});
    await st.put('work',{id:'play',game:{id:'sealed-roll',initial:s,state:s,events:[],started:true,names:['White','Black'],config:localConfig({tutor:false,warning:false,strength:'quick',reviewStrength:'quick'})},draft:[]});return s;
   },{gammon,finishes});
   await page.goto(base+'/backgammon/play/#resume=sealed-roll');
   await page.locator('#board.roll-ready').waitFor();
   await page.waitForTimeout(850);
   assert.equal((await work(page)).game.state.phase,'roll');
   const start=Date.now();
   if(touch){const b=await page.locator('#board .bg-board').boundingBox();await page.touchscreen.tap(b.x+b.width*.3,b.y+b.height*.5);}
   else await page.keyboard.press('c');
   await page.waitForFunction(()=>document.getAnimations().some(a=>a.id==='dice-roll'));
   assert.equal(await page.locator('.moving-checker').count(),0,'no meaningless checker animation before the award');
   const rolled=await waitWork(page,w=>w?.game.state.phase==='move');
   assert.deepEqual(rolled.game.state.dice,dice);
   assert.equal(await page.locator('#confirm:visible').count(),0,'sealed roll needs no confirmation');
   await page.locator('#next-game').waitFor();
   const elapsedMs=Date.now()-start,ended=(await waitWork(page,w=>w?.game.state.phase==='over')).game;
   assert.deepEqual(ended.events.map(e=>e.action.type),['roll','finish-race']);
   assert.deepEqual(ended.state.points,initial.points,'end without fabricated moves');
   assert.equal(ended.state.result.level,gammon?2:1);
   assert.equal(ended.state.result.points,gammon?8:4);
   assert.ok(elapsedMs>=500&&elapsedMs<2500,'only the brief roll reveal precedes the result');
   await page.reload();await page.locator('#next-game').waitFor();
   assert.deepEqual((await work(page)).game.state.scores,ended.state.scores,'reload does not award again');
   await page.locator('#undo-turn')[touch?'tap':'click']();
   const restored=(await waitWork(page,w=>w?.game.reviewingTurn)).game;
   assert.deepEqual(restored.state,rolled.game.state,'explicit undo retains the actual dice');
   await page.waitForTimeout(850);assert.equal((await work(page)).game.state.phase,'move','undo does not immediately re-end the game');
   assert.deepEqual(errors,[]);reports.push({touch,kind,elapsedMs});
  }finally{await ctx.close();}
 }
 return reports;
};
