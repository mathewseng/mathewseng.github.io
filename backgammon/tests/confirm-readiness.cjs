const assert=require('node:assert/strict');
const {waitWork}=require('./play-helpers.cjs');
// Controlled slow/failing analysis verifies the interaction boundary. Separate
// real-WASM cases below verify minimum depth, cache reuse and worker survival.
module.exports=async function confirmReadiness(browser,base,out,name){
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[],cases=[];
 page.on('pageerror',e=>errors.push(e.message));
 if(name==='chromium')await(await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate',{rate:4});
 const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
 try{
  for(const mode of ['pending-revise','pending-good','pending-bad','failed','warnings-off']){
   await page.goto(base+'/backgammon/');await ready();
   await page.evaluate(async mode=>{
    const r=await import('/backgammon/core/rules.mjs'),s=await import('/backgammon/core/storage.mjs');
    const {localConfig}=await import('/backgammon/core/play-session.mjs');
    const state=r.initialState({phase:'move',dice:[4,1],matchLength:7});
    s.saveSettings({analysisAhead:false,equityBar:false,motion:'reduce'});
    await s.put('work',{id:'play',game:{id:mode,initial:state,state,events:[],started:true,names:['White','Black'],
      config:localConfig({tutor:true,warning:mode!=='warnings-off',strength:'auto',reviewStrength:'auto'})},
      positionKey:r.positionKey(state),draft:r.legalTurns(state)[0].steps});
   },mode);
   await page.goto(base+'/backgammon/play/');await ready();
   await page.evaluate(async()=>{
    const {AnalysisPanel}=await import('/backgammon/ui/analysis.mjs'),{EngineClient}=await import('/backgammon/engine/client.mjs');
    EngineClient.prototype.analyze=()=>new Promise(()=>{});
    AnalysisPanel.prototype.run=async function(state,options){
     if(!options.submitted)return new Promise(()=>{});
     window.requested=options;
     return new Promise((resolve,reject)=>{window.finishCheck=async(loss=0,fail=false)=>{
      if(fail){reject(Error('Simulated worker failure'));return;}
      const r=await import('/backgammon/core/rules.mjs');
      const actual={steps:options.submitted,key:r.boardKey(r.commitTurn(state,options.submitted)),equity:.1-loss,probabilities:[.5,.1,.01,.1,.01]};
      resolve({status:'complete',type:'checker',positionKey:r.positionKey(state),engine:'test',perspective:state.turn,units:'normalized-match-equity',
        settings:{plies:3,name:'Test 3 ply'},candidates:[{...actual,equity:.1}],actual,error:loss});
     };});
    };
    const p=window.confirmTiming={};
    document.addEventListener('pointerup',e=>{if(e.target.closest('#confirm'))p.at=performance.now();},true);
    new MutationObserver(()=>{if(p.at&&!p.response&&(document.querySelector('dialog[open]')||!document.querySelector('#confirm')))
      p.response=performance.now()-p.at;}).observe(document.querySelector('.app'),{subtree:true,childList:true});
    // Dialogs are mounted on body, not inside the application shell.
    new MutationObserver(()=>{if(p.at&&!p.response&&document.querySelector('dialog[open]'))p.response=performance.now()-p.at;})
      .observe(document.body,{subtree:true,childList:true});
   });
   await page.locator('#resume-match').tap();await page.locator('#confirm').tap();
   if(mode==='warnings-off'){
    await waitWork(page,w=>w.game.events.length>0);
    assert.equal(await page.locator('dialog[open]').count(),0);
   }else{
    await page.locator('#pending-move-loss').waitFor({timeout:1000});
    assert.equal((await page.evaluate(async()=>(await(await import('/backgammon/core/storage.mjs')).get('work','play')).game.events.length)),0);
    assert.equal(await page.evaluate(()=>requested.readyOnly),true);
    if(mode==='pending-revise'){
     await page.getByRole('button',{name:'Revise',exact:true}).tap();
     await page.evaluate(()=>finishCheck(.05));await page.waitForTimeout(100);
     assert.ok(await page.locator('#confirm').isEnabled());
     await waitWork(page,w=>w.game.events.length===0&&w.draft.length>0);
    }else if(mode==='pending-good'){
     await page.evaluate(()=>finishCheck(0));await waitWork(page,w=>w.game.events.length>0);
     assert.equal(await page.locator('dialog[open]').count(),0);
    }else{
     await page.evaluate(fail=>finishCheck(.05,fail),mode==='failed');
     await page.waitForFunction(()=>!document.querySelector('#pending-move-loss').textContent.includes('Still calculating'));
     assert.match(await page.locator('#pending-move-loss').textContent(),mode==='failed'?/EV unavailable/:/0.050/);
     await page.getByRole('button',{name:mode==='failed'?'Confirm without feedback':'Play Best',exact:true}).tap();await waitWork(page,w=>w.game.events.length>0);
    }
   }
   const timing=await page.evaluate(()=>confirmTiming);
   assert.ok(timing.response<250,JSON.stringify({mode,...timing}));cases.push({mode,responseMs:timing.response});
  }
  await page.goto(base+'/backgammon/');await ready();
  const native=await page.evaluate(async()=>{
   const {EngineClient}=await import('/backgammon/engine/client.mjs'),r=await import('/backgammon/core/rules.mjs');
   let starts=0;
   const engine=new EngineClient({openingBook:null,workerFactory:()=>{starts++;return new Worker('/backgammon/engine/worker.mjs',{type:'module'});}});
   const state=r.initialState({phase:'move',dice:[4,1],matchLength:7});
   try{
    await engine.start();
    const began=performance.now(),first=await engine.analyze(state,{preset:'auto',readyOnly:true});
    const coldMs=performance.now()-began;
    const full=await engine.analyze(state,{preset:'expert'});
    const at=performance.now(),cached=await engine.analyze(state,{preset:'expert',readyOnly:true});
    const readyMs=performance.now()-at;
    const grade=engine.readyResult(state,{preset:'auto',submitted:first.candidates[0].steps});
    return {coldMs,readyMs,firstPlies:first.settings.plies,reason:first.budget.reason,
      deeperPlies:cached.settings.plies,sameAnswer:cached.candidates[0].key===full.candidates[0].key,
      gradeLoss:grade.error,starts};
   }finally{engine.destroy();}
  });
  assert.equal(native.firstPlies,3);assert.equal(native.reason,'ready-to-play');assert.equal(native.starts,1);
  assert.equal(native.deeperPlies,3);assert.equal(native.sameAnswer,true);assert.equal(native.gradeLoss,0);
  assert.ok(native.readyMs<100,JSON.stringify(native));assert.deepEqual(errors,[]);
  return {browser:name,cpuSlowdown:name==='chromium'?4:1,cases,native};
 }finally{await context.close();}
};
