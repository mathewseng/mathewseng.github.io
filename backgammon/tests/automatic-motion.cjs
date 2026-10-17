const assert=require('node:assert/strict');
module.exports=async function automaticMotion(browser,base){
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),page=await ctx.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base+'/backgammon/');
  await page.evaluate(async()=>{
   const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
   const {localConfig}=await import('/backgammon/core/play-session.mjs');
   const points=Array(24).fill(0);points[5]=1;points[23]=-1;
   const s=r.initialState({phase:'roll',turn:0,points,off:[14,14],matchLength:0,cube:{value:2,owner:1}});
   const {seededLocalRoll}=await import('/backgammon/core/local-rolls.mjs');
   let localRolls;
   for(let i=0;i<100;i++){
    localRolls={version:1,seed:i.toString(16).padStart(64,'0'),cursor:0};
    if((await seededLocalRoll(localRolls)).includes(6))break;
   }
   st.saveSettings({equityBar:false,analysisAhead:false,motion:'full'});
   await st.put('work',{id:'play',game:{id:'forced-animation',state:s,initial:s,events:[],started:true,names:['You','GNUbg'],
    config:localConfig({tutor:false,warning:false}),localRolls},draft:[]});
  });
  await page.goto(base+'/backgammon/play/#resume=forced-animation');
  await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  await page.evaluate(()=>{
   window.motionLog=[];const animate=Element.prototype.animate;
   Element.prototype.animate=function(frames,options){
    if(options?.id==='dice-roll'||this.classList.contains('moving-checker'))motionLog.push({at:performance.now(),id:options?.id||'checker',duration:options.duration});
    return animate.call(this,frames,options);
   };
  });
  await page.keyboard.press('c');
  await page.waitForFunction(()=>motionLog.some(m=>m.id==='dice-roll'));
  assert.equal(await page.locator('#board .moving-checker').count(),0,'forced move does not erase the roll reveal');
  await page.waitForFunction(()=>motionLog.some(m=>m.id==='checker'));
  const timeline=await page.evaluate(()=>motionLog);
  const roll=timeline.find(m=>m.id==='dice-roll'),move=timeline.find(m=>m.id==='checker');
  assert.ok(move.at-roll.at>=700,JSON.stringify(timeline));
  assert.ok(move.duration>=450);
  await page.waitForFunction(()=>!document.querySelector('#board .moving-checker'));
  const game=await page.evaluate(async()=>(await(await import('/backgammon/core/storage.mjs')).get('work','play')).game);
  assert.equal(game.state.phase,'over');assert.equal(game.localRolls.cursor,1);assert.equal(game.events.length,2);
  assert.deepEqual(errors,[]);return timeline;
 }finally{await ctx.close()}
};
