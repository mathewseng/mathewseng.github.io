// Real Play, GNUbg and storage. Quick isolates UI/history cost from search
// depth; separate adaptive/prethink tests cover Auto and prepared grading.
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function confirmLatency(browser,base,out,name){
 const {longMatch}=await import('./helpers/long-match.mjs'),fixture=longMatch(),reports=[];
 for(const touch of [false,true]){
  const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1366,height:768},hasTouch:touch,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(base+'/backgammon/');
   await page.evaluate(async game=>{
    const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
    const {localConfig}=await import('/backgammon/core/play-session.mjs');
    game.config=localConfig({strength:'quick',reviewStrength:'quick',warning:false});
    game.localRolls={version:1,seed:'1b'.padStart(64,'0'),cursor:0};
    st.saveSettings({motion:'full',analysisAhead:true,equityBar:true});
    await st.put('work',{id:'play',game,positionKey:r.positionKey(game.state),draft:r.legalTurns(game.state)[0].steps});
   },fixture);
   await page.goto(base+'/backgammon/play/');
   await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
   await page.evaluate(async()=>{
    const {EngineClient}=await import('/backgammon/engine/client.mjs'),analyze=EngineClient.prototype.analyze;
    window.confirmTrace=[];
    EngineClient.prototype.analyze=function(state,options={}){
     const row={sequence:state.sequence,priority:options.priority,submitted:!!options.submitted};confirmTrace.push(row);
     return analyze.call(this,state,options).then(result=>{row.result={cached:!!result.cached,actual:!!result.actual};return result;},error=>{row.error=error.name;throw error;});
    };
   });
   await page.locator('#resume-match').click();
   await page.locator('#confirm:not(:disabled)').waitFor();
   await page.waitForFunction(sequence=>confirmTrace.some(r=>r.sequence===sequence&&r.submitted&&r.result?.actual),fixture.state.sequence,{timeout:90000});
   // Warm layout and history; measure repeated reviews and the actual tap,
   // not the one-time cold import/validation of a saved match.
   await page.waitForTimeout(300);
   const throttle=touch&&name==='chromium'?6:1;
   if(throttle>1){const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:throttle});}
   await page.evaluate(()=>{
    window.confirmPerf={tasks:[],frames:[],start:null,firstPaintMs:null,active:true};
    if(PerformanceObserver.supportedEntryTypes.includes('longtask'))new PerformanceObserver(list=>{
     confirmPerf.tasks.push(...list.getEntries().map(e=>({start:e.startTime,ms:e.duration})));
    }).observe({type:'longtask'});
    let last=performance.now();function frame(now){if(!confirmPerf.active)return;confirmPerf.frames.push(now-last);last=now;requestAnimationFrame(frame)}requestAnimationFrame(frame);
    document.querySelector('#confirm').addEventListener('click',()=>{
     confirmPerf.start=performance.now();requestAnimationFrame(()=>{confirmPerf.firstPaintMs=performance.now()-confirmPerf.start});
    },{capture:true,once:true});
   });
   await page.waitForTimeout(700);
   await page.locator('#confirm')[touch?'tap':'click']();
   await page.waitForTimeout(3000);
   const measured=await page.evaluate(()=>{confirmPerf.active=false;return {...confirmPerf,trace:confirmTrace};});
   const committed=await page.evaluate(async()=>{
    const {get}=await import('/backgammon/core/storage.mjs'),{replay}=await import('/backgammon/core/rules.mjs');
    const saved=await get('work','play'),g=saved.game;
    return {events:g.events,sequence:g.state.sequence,replayed:JSON.stringify(replay(g.initial,g.events).at(-1))===JSON.stringify(g.state)};
   });
   const report={touch,throttle,historyEvents:fixture.events.length,firstPaintMs:measured.firstPaintMs,
    longestTaskMs:Math.max(0,...measured.tasks.map(t=>t.ms)),longestFrameMs:Math.max(...measured.frames),
    cachedGrade:measured.trace.some(r=>r.sequence===fixture.state.sequence&&r.priority===20&&r.submitted&&r.result?.cached),
    replayed:committed.replayed};
   assert.equal(report.cachedGrade,true,'Confirm reuses an actual prepared GNUbg grade');
   assert.ok(report.firstPaintMs!==null&&report.firstPaintMs<250,JSON.stringify(report));
   assert.ok(report.longestTaskMs<600,'No repeated whole-match stall: '+JSON.stringify(report));
   assert.ok(committed.sequence>fixture.state.sequence);
   assert.deepEqual(committed.events.slice(0,fixture.events.length).map(e=>[e.actor,e.action]),fixture.events.map(e=>[e.actor,e.action]),'existing game is preserved');
   assert.ok(committed.replayed,'saved game independently replays exactly');
   if(touch)await page.locator('#analysis-jump').click();
   else await page.locator('.history-turn').first().scrollIntoViewIfNeeded();
   await page.locator('.history-turn').first().waitFor({state:'visible'});
   assert.match(await page.locator('.history-turn').first().innerText(),/You|Opponent/,'history remains readable after scrolling');
   assert.ok(await page.locator('.history-turn').first().locator('.history-played').first().innerText(),'the move text is rendered');
   await page.evaluate(()=>{
    window.stableReview=document.querySelector('.history-turn');
    window.reviewUpdates=0;
    new MutationObserver(()=>reviewUpdates++).observe(document.querySelector('#move-feedback'),{childList:true,subtree:true});
   });
   await page.waitForFunction(()=>reviewUpdates>0);
   assert.ok(await page.evaluate(()=>stableReview===document.querySelector('.history-turn')),'background analysis keeps the unchanged visible turn in place');
   await page.screenshot({path:path.join(out,`${name}-confirm-history-${touch?'phone':'desktop'}.png`)});
   assert.deepEqual(errors,[]);reports.push(report);
  }finally{await context.close();}
 }
 return reports;
};
