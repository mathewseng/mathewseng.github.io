// Ensure persistent history buttons don't retain obsolete whole-match copies.
const assert=require('node:assert/strict');
module.exports=async function historyRetention(browser,base,out,name){
 if(name!=='chromium')return {skipped:'Requires explicit V8 garbage collection'};
 const context=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await context.route('**/backgammon/play/app.js*',async route=>{
   const response=await route.fetch();let source=await response.text();
   // Observability only: weakly track the models rendered by the real UI.
   source=source.replace('function renderFeedback() {\n  const m = model();',
    'function renderFeedback() {\n  const m = model();\n  window.historyMemory?.track(m);');
   source=source.replace('document.documentElement.dataset.appReady = "true";',`
    const trackedHistoryModels = new WeakSet();
    window.historyMemory = {refs:[], track(m) {
      if(m && !trackedHistoryModels.has(m)) {
        trackedHistoryModels.add(m); this.refs.push(new WeakRef(m));
      }
    }, render(value) {
      game=value; config=value.config; renderedFeedback=null; renderFeedback();
    }};
    document.documentElement.dataset.appReady = "true";`);
   await route.fulfill({response,body:source});
  });
  await page.goto(base+'/backgammon/play/');
  await page.waitForFunction(()=>!!window.historyMemory);
  await page.evaluate(async()=>{
   const r=await import('/backgammon/core/rules.mjs'),t=await import('/backgammon/core/table.mjs');
   const {EngineClient}=await import('/backgammon/engine/client.mjs');
   const {compactEvaluation}=await import('/backgammon/core/decision-history.mjs');
   const initial=r.initialState({phase:'move',dice:[6,1]}),engine=new EngineClient({openingBook:null});
   let model={id:crypto.randomUUID(),initial,state:initial,events:[],started:true,names:['You','GNUbg'],
     config:{mode:'computer',humanSide:0,tutor:true,reviewStrength:'quick',strength:'quick'}};
   try {
    for(let turn=0;turn<24;turn++){
     if(model.state.phase==='roll')model=t.playAction(model,{type:'roll',dice:[3,1]});
     const source=model.state,steps=r.legalTurns(source)[0].steps;
     const result=await engine.analyze(source,{preset:'quick',submitted:steps,useBook:false});
     model=t.playAction(model,{type:'move',steps});
     model.events.at(-1).evaluation=compactEvaluation(source,result);
     historyMemory.render(model);
    }
   }finally{engine.destroy();}
  });
  const cdp=await context.newCDPSession(page);
  await page.waitForTimeout(100);
  await cdp.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(100);
  await cdp.send('HeapProfiler.collectGarbage');
  const result=await page.evaluate(()=>({rendered:historyMemory.refs.length,
    retained:historyMemory.refs.filter(ref=>ref.deref()).length,
    reviews:document.querySelectorAll('#move-feedback .feedback-review').length}));
  assert.equal(result.rendered,24);
  assert.ok(result.reviews>=10,'old decision buttons remain available');
  assert.equal(result.retained,1,'only the current match model survives collection');
  // Old rows still open the correct, up-to-date analysis after collection.
  await page.locator('#move-feedback .feedback-review').last().click();
  await page.getByRole('dialog').waitFor();
  assert.ok(await page.getByRole('dialog').getByText('Checker decision',{exact:true}).isVisible());
  assert.deepEqual(errors,[]);
  return result;
 }finally{await context.close();}
};
