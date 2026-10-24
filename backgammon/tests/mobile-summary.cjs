const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async(browser,base,out,name)=>{
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
 try{
  await page.goto(base+'/backgammon/');await ready();
  await page.evaluate(async()=>{
   const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
   const {playAction}=await import('/backgammon/core/table.mjs'),{localConfig}=await import('/backgammon/core/play-session.mjs');
   const initial=r.initialState({phase:'move',dice:[4,1],matchLength:0});
   let game={id:'mobile-summary',initial,state:initial,started:true,events:[],names:['You','Black'],config:localConfig({mode:'computer',humanSide:0,tutor:true,warning:false,strength:'quick'})};
   for(let n=0;n<2;n++){
    const s=game.state,turns=r.legalTurns(s),steps=turns[0].steps;
    game=playAction(game,{type:'move',steps});
    game.events.at(-1).evaluation={result:{type:'checker',status:'complete',positionKey:r.positionKey(s),settings:{name:'Test',plies:0},units:'current-cube-points',
      candidates:[{equity:.2,steps:turns[1].steps}],actual:{equity:n?.18:.19,steps}}};
    if(!n)game=playAction(game,{type:'roll',dice:[4,1]});
   }
   st.saveSettings({analysisAhead:false,equityBar:false,motion:'reduce'});
   await st.put('work',{id:'play',game,draft:[]});
  });
  await page.goto(base+'/backgammon/play/');await ready();
  // Hold any background grading. It must not delay the existing summary.
  await page.evaluate(async()=>{(await import('/backgammon/engine/client.mjs')).EngineClient.prototype.analyze=()=>new Promise(()=>{});});
  await page.locator('#resume-match').tap();
  const summary=page.locator('#mobile-game-summary'),history=page.locator('.history-game-card').first();
  await summary.waitFor();
  assert.equal(await summary.evaluate(n=>n.open),false);
  assert.equal(await summary.locator('table').count(),0,'collapsed summary lazily mounts its detail');
  assert.match(await summary.locator(':scope > summary').innerText(),/0.010/);
  assert.equal(await history.locator('button[aria-expanded]').count(),0,'history summary has no collapse button');
  assert.ok(await history.locator('table').isVisible(),'history summary is expanded initially');
  const box=()=>page.locator('#board').evaluate(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height};});
  const before=await box();
  await summary.locator(':scope > summary').tap();
  await summary.locator('table').waitFor();
  assert.equal(await summary.locator('[data-loss-kind="checker"] [data-stage="accepted"] strong').innerText(),'0.010');
  assert.deepEqual(await box(),before,'expanding summary never resizes the board');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await summary.screenshot({path:path.join(out,`${name}-mobile-summary-expanded.png`)});
  await page.screenshot({path:path.join(out,`${name}-mobile-summary-page.png`),fullPage:true});
  for(const viewport of [{width:844,height:390},{width:1366,height:768}]){
   await page.setViewportSize(viewport);await summary.waitFor({state:'hidden'});
   assert.ok(await history.locator('table').isVisible());
  }
  await page.setViewportSize({width:390,height:844});await summary.waitFor();
  assert.ok(await summary.evaluate(n=>n.open),'rotation preserves disclosure preference');
  await summary.locator('table').waitFor();
  await summary.locator(':scope > summary').tap();
  assert.equal(await summary.evaluate(n=>n.open),false);
  assert.deepEqual(errors,[]);
  return {alwaysExpandedHistory:true,portraitDisclosure:true,boardUnchanged:true};
 }finally{await ctx.close();}
};
