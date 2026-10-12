// Same native engine, paired evaluator comparison for moves outside a hint list.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),browsers=require('playwright');
const {launchQuietBrowser}=require('../../scripts/quiet-browser.cjs');
const ref='0d5408ed2f7fd6fbda553002adcd19f14c584767',root=process.cwd();
const baseline=execFileSync('git',['show',ref+':backgammon/engine/evaluate.mjs']);
const name=process.env.BG_BROWSER||'chromium',samples=Number(process.env.BG_SAMPLES||3);
if(!Number.isInteger(samples)||samples<1||samples>5)throw Error('BG_SAMPLES must be 1–5');
const output=process.env.BG_OUTPUT||`backgammon/test-results/finalist-cache/${name}.json`;
const worker=`onmessage=async({data:{state,variant,preset}})=>{try{
 const {default:create}=await import('/backgammon/engine/vendor/simd/gnubg-core-module.js');
 const {createEvaluator}=await import('/backgammon/engine/'+(variant==='baseline'?'baseline-evaluate.mjs':'evaluate.mjs'));
 const {legalTurns}=await import('/backgammon/core/rules.mjs');
 const start=performance.now(),module=await create({locateFile:p=>'/backgammon/engine/vendor/'+(p.endsWith('.data')?'':'simd/')+p,print:()=>{},printErr:()=>{}});
 const calls={},cwrap=module.cwrap.bind(module);
 module.cwrap=(name,...args)=>{const fn=cwrap(name,...args);return name==='bg_score'?((...a)=>{calls[a[2]]=(calls[a[2]]||0)+1;return fn(...a);}):fn;};
 const engine=createEvaluator(module),startupMs=performance.now()-start,rows=[];
 const run=(label,submitted)=>{const before={...calls},start=performance.now();const result=engine.analyze(state,preset,'checker',submitted);
 rows.push({label,elapsedMs:performance.now()-start,calls:Object.fromEntries(Object.entries(calls).map(([d,n])=>[d,n-(before[d]||0)])),
 result:{engine:result.engine,settings:result.settings,perspective:result.perspective,units:result.units,positionKey:result.positionKey,
 candidates:result.candidates,actual:result.actual,error:result.error,screening:result.screening?{finalists:result.screening.finalists,total:result.screening.total,
 excluded:result.screening.excluded.map(c=>c.key),retainedLeader:result.screening.retainedLeader}:null}});return result;};
 const hint=run('hint',null),outside=legalTurns(state).filter(t=>!hint.candidates.some(c=>c.key===t.key)).slice(-2);
 if(!outside.length)throw Error('Fixture needs an unlisted legal move');
 for(let i=0;i<outside.length;i++)run('grade-'+i,outside[i].steps);
 run('hint-again',null);
 postMessage({startupMs,rows});engine.shutdown();
 }catch(e){postMessage({error:e.stack});}};`;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost').pathname;
 if(url==='/'){res.end('<!doctype html><title>Finalist cache study</title>');return;}
 res.setHeader('Content-Type',url.endsWith('.wasm')?'application/wasm':url.endsWith('.json')?'application/json':'text/javascript');
 if(url==='/study-worker.mjs'){res.end(worker);return;}
 if(url==='/backgammon/engine/baseline-evaluate.mjs'){res.end(baseline);return;}
 const file=path.resolve(root,'.'+url);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(e,b)=>{if(e)res.writeHead(404);res.end(e?'Not found':b);});
});
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const report={schema:1,startedAt:new Date().toISOString(),baselineRef:ref,samples,
 method:'Alternating paired fresh workers. Identical bg6 SIMD native assets. Hint then two legal moves outside that hint, then hint again. Initialization excluded. Native caches stay warm within each sequence. No opening lookup book. Diagnostic cases, not a random workload or playing-strength test. Local HTTP and desktop browser, no physical-phone or WAN claim. Median and range only for repeated samples.',
 environment:{cpu:os.cpus()[0].model,os:`${os.platform()} ${os.release()} ${os.arch()}`,load:os.loadavg()},
 hashes:{baseline:sha(baseline),worker:sha(worker),script:sha(fs.readFileSync(__filename))},rows:[]};
for(const file of ['engine/evaluate.mjs','engine/metadata.mjs','core/rules.mjs','core/xgid.mjs','engine/vendor/simd/gnubg-core-module.js','engine/vendor/simd/gnubg-core-module.wasm','engine/vendor/gnubg-core-module.data'])report.hashes[file]=sha(fs.readFileSync('backgammon/'+file));
const save=()=>{fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');};
(async()=>{
 const {initialState}=await import('../core/rules.mjs');
 const fixtures=JSON.parse(fs.readFileSync('backgammon/data/exercises.json')).items;
 const reference=JSON.parse(fs.readFileSync('backgammon/data/accuracy-reference.json')).items;
 let cases=['contact','race','bearoff'].map(topic=>({id:topic,state:fixtures.find(f=>f.topic===topic).state}));
 cases.push({id:'crashed',state:reference[216].state},{id:'doubles',state:initialState({phase:'move',dice:[3,3],matchLength:0})},
 {id:'match',state:initialState({phase:'move',dice:[3,1],matchLength:7,scores:[2,4],cube:{value:2,owner:1}})});
 if(process.env.BG_CASES)cases=cases.filter(c=>process.env.BG_CASES.split(',').includes(c.id));
 if(!cases.length)throw Error('No cases selected');report.cases=cases;
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await launchQuietBrowser(browsers[name]);report.browser={name,version:browser.version()};
 const page=await browser.newPage({serviceWorkers:'block'});await page.goto('http://127.0.0.1:'+server.address().port);
 for(const item of cases)for(const preset of (process.env.BG_PRESETS||'expert,research').split(','))for(let sample=0;sample<samples;sample++){
 const pair={};
 for(const variant of sample%2?['candidate','baseline']:['baseline','candidate'])pair[variant]=await page.evaluate(payload=>new Promise((resolve,reject)=>{
 const w=new Worker('/study-worker.mjs',{type:'module'}),timer=setTimeout(()=>{w.terminate();reject(Error('Sequence exceeded 240 seconds'));},240000);
 const done=()=>{clearTimeout(timer);w.terminate();};w.onmessage=({data})=>{done();data.error?reject(Error(data.error)):resolve(data);};w.onerror=e=>{done();reject(Error(e.message));};w.postMessage(payload);
 }),{state:item.state,variant,preset});
 let maxDifference=0;
 for(let i=0;i<pair.baseline.rows.length;i++){
 const a=pair.baseline.rows[i].result,b=pair.candidate.rows[i].result;
 if(a.candidates.length!==b.candidates.length||a.actual?.key!==b.actual?.key||a.candidates[0].key!==b.candidates[0].key||a.units!==b.units)throw Error('Coverage, actual move, leader or units changed');
 for(const c of [...a.candidates,...(a.actual?[a.actual]:[])]){
 const d=b.candidates.find(x=>x.key===c.key);if(!d)throw Error('Missing candidate');
 for(const field of ['equity','cubeless','mwc']){if(c[field]==null||d[field]==null){if(c[field]!==d[field])throw Error('Units changed');}else maxDifference=Math.max(maxDifference,Math.abs(c[field]-d[field]));}
 c.probabilities.forEach((v,j)=>{maxDifference=Math.max(maxDifference,Math.abs(v-d.probabilities[j]));});}
 if(a.error!==null)maxDifference=Math.max(maxDifference,Math.abs(a.error-b.error));
 }
 if(maxDifference>.00002)throw Error('Numeric mismatch '+maxDifference);
 report.rows.push({id:item.id,preset,sample,maxDifference,...pair});save();
 console.log(JSON.stringify({id:item.id,preset,sample,maxDifference,stages:pair.candidate.rows.map((r,i)=>({label:r.label,beforeMs:pair.baseline.rows[i].elapsedMs,afterMs:r.elapsedMs,calls:r.calls}))}));
 }
 report.finishedAt=new Date().toISOString();save();
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{report.error=e.stack;save();console.error(e);process.exitCode=1;});
