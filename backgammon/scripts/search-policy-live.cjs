// Paired, fresh-worker comparison of the stopping policy against deadline-only
// search. Both arms use exactly the same evaluator, filters and winner retention.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {createHash}=require('node:crypto');
const {webkit}=require('playwright');
const {launchQuietBrowser}=require('../../scripts/quiet-browser.cjs');
const site=path.resolve('_site'),out=path.resolve(process.env.BG_OUTPUT||'backgammon/docs/search-policy-live.json');
const traces=JSON.parse(fs.readFileSync('backgammon/docs/search-policy-traces.json'));
const replay=JSON.parse(fs.readFileSync('backgammon/docs/search-policy-replay.json'));
const cases=traces.cases.filter(c=>replay.rows.find(r=>r.id===c.id)?.split==='test');
const sha=x=>createHash('sha256').update(x).digest('hex');
const adaptive=fs.readFileSync(path.join(site,'backgammon/engine/adaptive.mjs'),'utf8');
const stopCall='chooseSearchDecision(state, evaluations, elapsedMs, ADAPTIVE_SEARCH.targetMs, submitted)';
if(!adaptive.includes(stopCall))throw Error('Historical one-second benchmark: run this script from revision f344694. Current Auto uses minimum-three-v2.');
const baseline=adaptive.replace(stopCall,"({reason:'searching',lead:null,forecast:null})");
const worker=fs.readFileSync(path.join(site,'backgammon/engine/worker.mjs'),'utf8')
 .replace('from "./adaptive.mjs"','from "./baseline-adaptive.mjs"');
const server=http.createServer((req,res)=>{
 let url=new URL(req.url,'http://localhost').pathname;if(url.endsWith('/'))url+='index.html';
 res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.css':'text/css'})[path.extname(url)]||'text/html');
 if(url==='/backgammon/engine/baseline-worker.mjs')return res.end(worker);
 if(url==='/backgammon/engine/baseline-adaptive.mjs')return res.end(baseline);
 const file=path.resolve(site,'.'+url);if(!file.startsWith(site+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(file,(e,data)=>{if(e)res.writeHead(404);res.end(e?'Not found':data);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 const report={recordedAt:new Date().toISOString(),environment:{cpu:os.cpus()[0].model,cores:os.cpus().length,os:`${os.platform()} ${os.release()} ${os.arch()}`},
  method:'One paired observation per held-out case/context. Alternate which arm goes first. Fresh worker each arm; initialization excluded and recorded. Actual EngineClient deadline, local assembled-site SIMD WASM, WebKit, no CPU throttling. Deadline-only baseline changes just the stopping decision; both arms retain the prior winner. HTTP/compilation caches may be warm. Desktop, not physical iPhone.',
  hashes:{adaptive:sha(adaptive),baseline:sha(baseline),trace:sha(fs.readFileSync('backgammon/docs/search-policy-traces.json')),wasm:sha(fs.readFileSync(path.join(site,'backgammon/engine/vendor/simd/gnubg-core-module.wasm')))},rows:[]};
 const save=()=>fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
 try{
  browser=await launchQuietBrowser(webkit,{headless:true});report.browser=browser.version();
  const page=await browser.newPage({serviceWorkers:'block'});await page.goto(`http://127.0.0.1:${server.address().port}/backgammon/`);
  for(let i=0;i<cases.length;i++){
   const entry=cases[i];const pair={id:entry.id,index:entry.index,context:entry.context};
   for(const arm of i%2?['policy','baseline']:['baseline','policy']){
    pair[arm]=await page.evaluate(async({state,arm})=>{
     const {EngineClient}=await import('/backgammon/engine/client.mjs');
     const client=new EngineClient(arm==='baseline'?{workerFactory:()=>new Worker('/backgammon/engine/baseline-worker.mjs',{type:'module'})}:{});
     try{
      await client.start();const start=performance.now();
      const r=await client.analyze(state,{preset:'auto'});
      if(r.status!=='complete'||!r.candidates.length)throw Error('Incomplete real engine result');
      return {elapsedMs:performance.now()-start,startup:client.startup,plies:r.settings.plies,budget:r.budget,best:r.candidates[0].key,
       candidates:r.candidates.map(c=>({key:c.key,equity:c.equity}))};
     }finally{client.destroy();}
    },{state:entry.state,arm});
   }
   pair.changed=pair.baseline.best!==pair.policy.best;
   const common=pair.baseline.candidates.find(c=>c.key===pair.policy.best);
   pair.foregoneGainAtBaseline=common?pair.baseline.candidates[0].equity-common.equity:null;
   report.rows.push(pair);save();console.log(`${i+1}/${cases.length} ${entry.id} ${Math.round(pair.baseline.elapsedMs)} -> ${Math.round(pair.policy.elapsedMs)} ms ${pair.baseline.plies} -> ${pair.policy.plies} ply ${pair.policy.budget.reason}${pair.changed?' CHANGED':''}`);
  }
  const quantile=(xs,q)=>{const a=xs.toSorted((a,b)=>a-b),i=(a.length-1)*q;return a[Math.floor(i)]+(a[Math.ceil(i)]-a[Math.floor(i)])*(i%1);};
  report.summary=Object.fromEntries(['baseline','policy'].map(arm=>{const xs=report.rows.map(r=>r[arm].elapsedMs);return [arm,{n:xs.length,meanMs:xs.reduce((a,b)=>a+b,0)/xs.length,medianMs:quantile(xs,.5),p95Ms:quantile(xs,.95)}];}));
  report.changed=report.rows.filter(r=>r.changed).length;
  report.finishedAt=new Date().toISOString();save();console.log(JSON.stringify(report.summary));
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
