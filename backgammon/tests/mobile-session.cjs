// Consecutive full games in one document, with real touch input and GNUbg.
// Run separately from other heavy browser jobs so memory/timing are comparable.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {launchQuietBrowser}=require('../../scripts/quiet-browser.cjs');
const fullGame=require('./mobile-fullgame.cjs');
const out=process.env.BG_TEST_OUT||'backgammon/test-results/mobile-session';
const games=Number(process.env.BG_SESSION_GAMES||6);
process.env.BG_CPU_RATE ||= '4';
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await launchQuietBrowser(require('playwright').chromium);
 const browserCdp=await browser.newBrowserCDPSession(),samples=[];
 let page,docToken,loads=0;
 const save=()=>fs.writeFileSync(path.join(out,'session-memory.json'),JSON.stringify({games,cpuSlowdown:Number(process.env.BG_CPU_RATE),samples},null,2));
 try{
  await fullGame(browser,process.env.BG_BASE_URL||'http://127.0.0.1:8767',out,'chromium',{
   games,contextOptions:{serviceWorkers:'block'},
   onPage:async({page:p,context})=>{
    page=p;
    page.on('load',()=>loads++);
    await context.addInitScript(()=>{
     window.sessionProbe={token:crypto.randomUUID(),workers:[],releases:[],clients:[]};
     const NativeWorker=window.Worker;
     window.Worker=class extends NativeWorker{
      constructor(url,options){
       super(url,options);
       const row={url:String(url),start:performance.now(),bytes:0};sessionProbe.workers.push(row);
       this.addEventListener('message',e=>{if(e.data.__memory)row.bytes=e.data.__memory.bytes;});
       const terminate=this.terminate.bind(this);
       this.terminate=()=>{row.end=performance.now();terminate();};
      }
     };
     // Install before Play constructs its engine. Keep only WeakRefs to clients.
     window.sessionProbeReady=import('/backgammon/engine/client.mjs').then(({EngineClient})=>{
      const start=EngineClient.prototype.start,release=EngineClient.prototype.releaseWorker;
      EngineClient.prototype.start=function(...args){
       if(!sessionProbe.clients.some(ref=>ref.deref()===this))sessionProbe.clients.push(new WeakRef(this));
       return start.apply(this,args);
      };
      EngineClient.prototype.releaseWorker=function(...args){
       if(this.worker)sessionProbe.releases.push({at:performance.now(),ready:this.ready,retiring:this.retiring&&{...this.retiring},active:this.active&&{id:this.active.id,priority:this.active.priority,elapsed:performance.now()-this.active.started},stack:new Error().stack});
       return release.apply(this,args);
      };
     });
    });
    await context.route('**/engine/worker.mjs*',async route=>{
     const response=await route.fetch();
     const prefix=`let probeMemory;const Instance=WebAssembly.Instance;WebAssembly.Instance=new Proxy(Instance,{construct(target,args){const instance=Reflect.construct(target,args);probeMemory=Object.values(instance.exports).find(v=>v instanceof WebAssembly.Memory);return instance;}});const send=self.postMessage.bind(self);self.postMessage=(msg,...args)=>send({...msg,__memory:{bytes:probeMemory?.buffer.byteLength||0}},...args);\n`;
     await route.fulfill({response,body:prefix+await response.text()});
    });
   },
   onReady:async({page})=>{docToken=await page.evaluate(()=>sessionProbe.token);},
   onGame:async({page,cdp,gameIndex,report})=>{
    await page.waitForTimeout(1500);
    const beforeGC=await cdp.send('Runtime.getHeapUsage');
    await cdp.send('HeapProfiler.collectGarbage');
    await page.waitForTimeout(100);
    await cdp.send('HeapProfiler.collectGarbage');
    const heap=await cdp.send('Runtime.getHeapUsage'),dom=await cdp.send('Memory.getDOMCounters');
    const details=await page.evaluate(()=>{
     const p=sessionProbe;
     return {token:p.token,workers:p.workers,releases:p.releases,clients:p.clients.map(ref=>ref.deref()).filter(Boolean).map(c=>({cache:c.cache.size,cacheRows:[...c.cache.values()].reduce((n,r)=>n+c.resultWeight(r),0),decisions:c.decisions.size,readings:c.readings.size,queue:c.queue.length,active:c.active&&{priority:c.active.priority,preset:c.active.preset}}))};
    });
    docToken??=details.token;assert.equal(details.token,docToken,'same document survives every game');assert.equal(loads,1,'no spontaneous page navigation');
    const {processInfo}=await browserCdp.send('SystemInfo.getProcessInfo');
    const processes=processInfo.filter(p=>['renderer','GPU'].includes(p.type));
    let rss='';try{rss=execFileSync('ps',['-o','pid=,rss=','-p',processes.map(p=>p.id).join(',')],{encoding:'utf8'});}catch{}
    // Also sample without this game's diagnostic evaluations/timing arrays.
    // The complete report already lives in Node and on disk.
    await page.evaluate(()=>{
      const p=mobileGame;p.results.clear();
      p.actions.length=p.frames.length=p.tasks.length=p.renders.length=p.calls.length=0;
    });
    await cdp.send('HeapProfiler.collectGarbage');
    const appHeap=await cdp.send('Runtime.getHeapUsage');
    const sample={game:gameIndex,at:new Date().toISOString(),release:report.timing.release,events:report.game.events.length,heap,appHeap,beforeGC,dom,processes,rssKiB:rss,...details};
    samples.push(sample);save();
    assert.ok(details.workers.filter(w=>!w.end && w.url.endsWith('/engine/worker.mjs')).length<=1,'at most one live GNUbg worker');
    assert.ok(details.workers.some(w=>w.bytes>0),'native memory instrumentation reached the real worker');
    for(const client of details.clients){
      assert.ok(client.cache<=64 && client.cacheRows<=4096 && client.decisions<=16 && client.readings<=64,'engine caches remain bounded');
    }
    console.log('MEMORY',JSON.stringify({game:gameIndex,heapMiB:heap.usedSize/2**20,appHeapMiB:appHeap.usedSize/2**20,wasmMiB:details.workers.filter(w=>!w.end).reduce((n,w)=>n+w.bytes,0)/2**20,workers:details.workers.length,liveWorkers:details.workers.filter(w=>!w.end).length,dom,clients:details.clients}));
   }
  });
  assert.equal(samples.length,games);
 }finally{save();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
