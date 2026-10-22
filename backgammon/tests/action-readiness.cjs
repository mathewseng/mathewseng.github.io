// Actual Play + GNUbg, desktop and touch. No canned solver answers. A held
// IndexedDB transaction tests rendering independence from slow storage.
const assert=require('node:assert/strict');
const path=require('node:path');
const {waitForAsync}=require('./play-helpers.cjs');
module.exports=async function actionReadiness(browser,base,out,name){
 const reports=[];
 for(const touch of [false,true]){
  const ctx=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1366,height:768},hasTouch:touch,serviceWorkers:'block'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(base+'/backgammon/');
   await page.evaluate(async()=>{
    const r=await import('/backgammon/core/rules.mjs'), st=await import('/backgammon/core/storage.mjs');
    const {localConfig,defaultPlayRules}=await import('/backgammon/core/play-session.mjs');
    const s=r.initialState({phase:'move',turn:1,dice:[3,1],matchLength:0,rules:defaultPlayRules(0)});
    st.saveSettings({equityBar:true,analysisAhead:true,motion:'full'});
    await st.put('work',{id:'play',game:{id:'action-readiness',started:true,state:s,initial:s,events:[],names:['You','GNUbg'],config:localConfig(),localRolls:{version:1,seed:'1b'.padStart(64,'0'),cursor:0}},draft:[]});
   });
   await page.goto(base+'/backgammon/play/');
   await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
   await page.evaluate(async()=>{
    const {EngineClient}=await import('/backgammon/engine/client.mjs');
    window.readiness={calls:[],starts:0};
    const analyze=EngineClient.prototype.analyze,start=EngineClient.prototype.start;
    EngineClient.prototype.start=function(...args){if(!this.worker)readiness.starts++;return start.apply(this,args)};
    EngineClient.prototype.analyze=function(state,options={}){
     const row={state,options,at:performance.now()};readiness.calls.push(row);
     return analyze.call(this,state,options).then(result=>{row.result=result;row.ms=performance.now()-row.at;return result},error=>{row.error=error.name;throw error});
    };
   });
   await page.locator('#resume-match')[touch?'tap':'click']();
   await page.locator('#board .moving-checker').first().waitFor({timeout:90000});
   await page.locator('#board .last-move-ghost').first().waitFor({state:'attached',timeout:90000});
   await page.waitForFunction(()=>readiness.calls.some(c=>c.state.phase==='move'&&c.state.turn===0&&c.options.priority===-20&&c.result),null,{timeout:90000});
   await page.waitForFunction(()=>document.querySelector('#roll')&&!document.querySelector('#roll').disabled);
   assert.equal(page.workers().filter(w=>new URL(w.url()).pathname.endsWith('/engine/worker.mjs')).length,1,
    'equity and preparation share the one live engine');
   assert.equal(page.workers().filter(w=>new URL(w.url()).pathname.endsWith('/core/progress-worker.mjs')).length,1,
    'progress saves use their own worker, separate from evaluation and input');
   await page.evaluate(async()=>{
    const {database}=await import('/backgammon/core/storage.mjs');
    const db=await database(),tx=db.transaction('work','readwrite'),store=tx.objectStore('work');
    readiness.storageUntil=performance.now()+1000;
    const hold=()=>{const req=store.get('play');req.onsuccess=()=>{if(performance.now()<readiness.storageUntil)hold()}};hold();
    readiness.storageFinished=false;tx.oncomplete=()=>{readiness.storageFinished=true};
    readiness.tapAt=performance.now();
    const observer=new MutationObserver(()=>{
     if(!document.querySelector('#board .board-dice:not(.last-roll)'))return;
     readiness.visualMs=performance.now()-readiness.tapAt;
     readiness.renderedBeforeStorage=!readiness.storageFinished;
     readiness.equityAtRender=document.querySelector('#equity-bar').dataset.state;
     observer.disconnect();
    });observer.observe(document.querySelector('#board'),{subtree:true,childList:true});
   });
   if(touch){
    const b=await page.locator('#board .bg-board').boundingBox();await page.touchscreen.tap(b.x+b.width*.3,b.y+b.height*.5);
   }else await page.keyboard.press('c');
   await page.waitForFunction(()=>readiness.visualMs!==undefined);
   const result=await page.evaluate(()=>({visualMs:readiness.visualMs,renderedBeforeStorage:readiness.renderedBeforeStorage,equityAtRender:readiness.equityAtRender,
    preparations:readiness.calls.filter(c=>c.state.phase==='move'&&c.state.turn===0&&c.options.priority===-20&&c.result).map(c=>({ms:c.ms,plies:c.result.settings.plies})),
    roll:readiness.calls.find(c=>c.state.phase==='roll'&&c.state.turn===0&&c.options.priority===20)?.result?.cached,
    equity:[...document.querySelectorAll('.equity-number')].map(n=>n.textContent).filter(Boolean)}));
   assert.equal(result.renderedBeforeStorage,true,'dice render without waiting for storage');
   assert.ok(result.visualMs<500,JSON.stringify(result));
   assert.equal(result.roll,true,'rolling reuses the prepared cube decision');
   assert.equal(result.equityAtRender,'ready','prepared checker equity appears with the dice');
   assert.match(result.equity[0],/^\d+\.\d{3}$/);
   await waitForAsync(page,async()=>{
    const {get}=await import('/backgammon/core/storage.mjs');const w=await get('work','play');return w.game.localRolls.cursor===1&&w.game.state.turn===0&&w.game.state.phase==='move';
   });
   await page.screenshot({path:path.join(out,`${name}-ready-${touch?'phone':'desktop'}.png`)});
   assert.deepEqual(errors,[]);reports.push({touch,...result});
  }finally{await ctx.close()}
 }
 return reports;
};
