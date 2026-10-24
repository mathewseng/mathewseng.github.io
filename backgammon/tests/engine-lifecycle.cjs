const assert = require('node:assert/strict');

// Real native searches, repeatedly interrupted between candidate scores. The
// warm WASM instance must survive; cancellation may not lower search depth or
// leak stale answers into the next position.
module.exports = async function engineLifecycle(browser, base) {
  const context = await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},hasTouch:true});
  const page = await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.goto(base+'/backgammon/');
    const report = await page.evaluate(async()=>{
      const {EngineClient}=await import('/backgammon/engine/client.mjs');
      const {AnalysisPanel}=await import('/backgammon/ui/analysis.mjs');
      const {initialState,positionKey}=await import('/backgammon/core/rules.mjs');
      let workers=0, cancellations=0;
      const client=new EngineClient({openingBook:null,workerFactory:()=>{
        workers++;return new Worker('/backgammon/engine/worker.mjs',{type:'module'});
      }});
      const check=(ok,message)=>{if(!ok)throw Error(message);};
      try {
        await client.start();
        check(client.startup.cooperativeCancellation,'cancellation protocol available');
        for(let i=0;i<24;i++) {
          const state=initialState({phase:'move',dice:[6,1+i%6],matchLength:7,scores:[Math.floor(i/6),0]});
          let interrupted=false;
          try {
            await client.analyze(state,{preset:'auto',priority:-20,onEvaluation:r=>{
              if(!interrupted){interrupted=true;client.cancelWhere(job=>job.priority<0);}
            }});
          } catch(error) {check(error.name==='AbortError','only an intentional cancellation is expected');cancellations++;}
          check(interrupted,'a real checkpoint preceded cancellation');
          const deadline=performance.now()+2000;
          while(client.retiring&&performance.now()<deadline)await new Promise(r=>setTimeout(r,10));
          check(!client.retiring,'worker acknowledges cancellation');
        }
        check(workers<=2,`repeated cancellation recreated ${workers} workers`);
        const state=initialState({phase:'move',dice:[4,1],matchLength:7,scores:[1,2]});
        const result=await client.analyze(state,{preset:'auto',readyOnly:true,priority:20});
        check(result.settings.plies>=3,'live play still requires three ply');
        check(result.positionKey===positionKey(state),'result belongs to the requested position');
        const next=await client.analyze(state,{preset:'auto',readyOnly:true});
        check(next.cached&&next.candidates[0].key===result.candidates[0].key,'completed answer remains reusable');
        const panel=new AnalysisPanel();
        // Exercise the same policy used when dismissing a pending hint/warning.
        panel.engine=client;
        const warm=client.worker;
        try {
          let interrupted=false;
          const pending=panel.run({...state,dice:[6,6]}, {preset:'auto',priority:20,onEvaluation:()=>{
            if(!interrupted){interrupted=true;panel.cancel({releaseWorker:false});}
          }});
          await pending.then(()=>{throw Error('cancelled panel result escaped');},error=>check(error.name==='AbortError','panel search cancels'));
          const deadline=performance.now()+2000;
          while(client.retiring&&performance.now()<deadline)await new Promise(r=>setTimeout(r,10));
          check(client.worker===warm&&!client.retiring,'closing a warning reuses the warm engine');
          panel.cancel({releaseWorker:false});
          check(client.worker===warm,'an idle engine is also retained');
          const live=await panel.run(state,{preset:'auto',readyOnly:true});
          check(live.settings.plies>=3,'next action retains its completed depth');
          panel.cancel();
          check(client.worker===null,'page teardown still releases workers');
        } finally {panel.cancel();}
        return {cancellations,workers,plies:result.settings.plies,backend:result.backend};
      } finally {client.destroy();}
    });
    assert.equal(report.cancellations,24);assert.deepEqual(errors,[]);return report;
  } finally {await context.close();}
};
