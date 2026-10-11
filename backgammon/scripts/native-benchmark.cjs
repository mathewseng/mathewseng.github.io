// Paired native builds, with identical JS evaluator, weights and search settings.
// Fresh worker/native cache per sample; alternate order to reduce timing bias.
const fs = require("node:fs"), path = require("node:path"), http = require("node:http"), os = require("node:os");
const browsers = require("playwright");
const { launchQuietBrowser } = require("../../scripts/quiet-browser.cjs");
const root = path.resolve("."), vendor = path.join(root,"backgammon/engine/vendor");
const variants = {scalar:vendor,simd:process.env.BG_SIMD_DIR || path.join(vendor,"simd")};
const server = http.createServer((req,res) => {
  const url = new URL(req.url,"http://localhost").pathname;
  const variant = /^\/variants\/(scalar|simd)\/(gnubg-core-module\.(js|wasm))$/.exec(url);
  const file = variant ? path.join(variants[variant[1]],variant[2]) : path.join(root,url.endsWith("/") ? url+"index.html" : url);
  if(!variant && !file.startsWith(root+path.sep)) {res.writeHead(403);res.end();return;}
  fs.readFile(file,(err,data) => {
    if(err) {res.writeHead(404);res.end();return;}
    res.setHeader("Content-Type",({".mjs":"text/javascript",".js":"text/javascript",".html":"text/html",".css":"text/css",".json":"application/json",".wasm":"application/wasm"})[path.extname(file)]||"application/octet-stream");
    res.end(data);
  });
});
const stats = samples => {
  const sorted = [...samples].sort((a,b)=>a-b);
  return {n:samples.length,median:sorted[Math.floor(sorted.length/2)],min:sorted[0],max:sorted.at(-1)};
};
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const results=[];
  try {
    for(const name of (process.env.BG_BROWSERS || "chromium,firefox,webkit").split(",")) {
      const browser=await launchQuietBrowser(browsers[name],{headless:true});
      try {
        const page=await browser.newPage({serviceWorkers:"block"});
        await page.goto(`http://127.0.0.1:${server.address().port}/backgammon/`);
        await page.exposeFunction("measurement",row=>console.log(name, row.topic,row.preset,row.scalar.toFixed(1),"→",row.simd.toFixed(1),"ms"));
        const rows=await page.evaluate(async()=>{
          const {initialState,positionKey}=await import("/backgammon/core/rules.mjs");
          const {PRESETS}=await import("/backgammon/engine/metadata.mjs");
          const fixtures=(await(await fetch("/backgammon/data/exercises.json")).json()).items;
          const cases=[...["opening","contact","race","bearoff","cube"].map(topic=>({topic,state:fixtures.find(f=>f.topic===topic).state})),
            {topic:"doubles",state:initialState({phase:"move",dice:[3,3]})},
            {topic:"match",state:initialState({phase:"move",dice:[3,1],matchLength:7,scores:[2,4]})}];
          const source=`import {createEvaluator} from '${location.origin}/backgammon/engine/evaluate.mjs';
            onmessage=async({data:{variant,state,preset}})=>{try {
              const start=performance.now();
              const [{default:createModule},wasm,data]=await Promise.all([
                import('${location.origin}/variants/'+variant+'/gnubg-core-module.js'),
                fetch('${location.origin}/variants/'+variant+'/gnubg-core-module.wasm').then(r=>r.arrayBuffer()),
                fetch('${location.origin}/backgammon/engine/vendor/gnubg-core-module.data').then(r=>r.arrayBuffer())]);
              const transferMs=performance.now()-start,compileStart=performance.now(),compiled=await WebAssembly.compile(wasm),compileMs=performance.now()-compileStart,initStart=performance.now();
              const module=await createModule({getPreloadedPackage:()=>data,instantiateWasm(imports,receive){const instance=new WebAssembly.Instance(compiled,imports);receive(instance,compiled);return instance.exports;},print:()=>{},printErr:()=>{}});
              const engine=createEvaluator(module),initializeMs=performance.now()-initStart,answer=engine.analyze(state,preset);
              const warmAnswers=[];
              for(let i=0;i<3;i++)warmAnswers.push(engine.analyze(state,preset));
              postMessage({answer,warmAnswers,startup:{transferMs,compileMs,initializeMs}});engine.shutdown();
            }catch(e){postMessage({error:e.stack});}};`;
          const url=URL.createObjectURL(new Blob([source],{type:"text/javascript"}));
          const run=(variant,state,preset)=>new Promise((resolve,reject)=>{
            const worker=new Worker(url,{type:"module"}),timeout=setTimeout(()=>{worker.terminate();reject(Error("Native benchmark timed out"));},120000);
            const done=()=>{clearTimeout(timeout);worker.terminate();};
            worker.onmessage=({data})=>{done();data.error?reject(Error(data.error)):resolve(data);};
            worker.onerror=e=>{done();reject(Error(e.message));};
            worker.postMessage({variant,state,preset});
          });
          const rows=[];
          try {
            for(const {topic,state} of cases) for(const preset of ["standard","deep"]) {
              const samples=[];
              for(let i=0;i<5;i++) {
                const pair={};
                for(const variant of i%2?["simd","scalar"]:["scalar","simd"])
                  pair[variant]=await run(variant,state,preset);
                const a=pair.scalar.answer,b=pair.simd.answer;
                const aCandidates=a.candidates||[a],bCandidates=b.candidates||[b];
                if(aCandidates.length!==bCandidates.length) throw Error("Candidate coverage changed");
                let maxDifference=0;
                for(const c of aCandidates) {
                  const other=a.candidates?bCandidates.find(o=>o.key===c.key):b;
                  if(!other) throw Error("Missing legal move");
                  for(const field of ["equity","cubeless","mwc"])
                    if(c[field]==null || other[field]==null) {if(c[field]!==other[field])throw Error("Units changed");}
                    else maxDifference=Math.max(maxDifference,Math.abs(c[field]-other[field]));
                  c.probabilities.forEach((p,j)=>maxDifference=Math.max(maxDifference,Math.abs(p-other.probabilities[j])));
                }
                if(maxDifference>0.00001)throw Error(`${topic}/${preset} differs by ${maxDifference}`);
                if((a.candidates?.[0].key||a.action)!==(b.candidates?.[0].key||b.action))throw Error("Best decision changed");
                for(const {answer,warmAnswers} of Object.values(pair))for(const warm of warmAnswers) {
                  if((answer.candidates?.[0].key||answer.action)!==(warm.candidates?.[0].key||warm.action))throw Error("Warm best decision changed");
                  for(const c of answer.candidates||[answer]) {
                    const next=warm.candidates?warm.candidates.find(o=>o.key===c.key):warm;
                    if(!next||Math.abs(c.equity-next.equity)>0.00001)throw Error("Warm native cache changed equity");
                  }
                }
                samples.push(Object.fromEntries(Object.entries(pair).map(([variant,{answer,warmAnswers,startup}])=>[variant,{elapsedMs:answer.elapsedMs,warmElapsedMs:warmAnswers.map(a=>a.elapsedMs).sort((a,b)=>a-b)[1],warmSamples:warmAnswers.map(a=>a.elapsedMs),startup,candidates:aCandidates.length,maxDifference}])));
              }
              rows.push({topic,preset,positionKey:positionKey(state),state,settings:PRESETS[preset],samples});
              await window.measurement({topic,preset,...Object.fromEntries(["scalar","simd"].map(v=>[v,samples.reduce((s,x)=>s+x[v].elapsedMs,0)/samples.length]))});
            }
          } finally {URL.revokeObjectURL(url);}
          return rows;
        });
        results.push({browser:name,version:browser.version(),rows:rows.map(row=>({...row,summary:Object.fromEntries(["scalar","simd"].map(v=>[v,{cold:stats(row.samples.map(s=>s[v].elapsedMs)),warm:stats(row.samples.map(s=>s[v].warmElapsedMs)),startup:Object.fromEntries(["transferMs","compileMs","initializeMs"].map(f=>[f,stats(row.samples.map(s=>s[v].startup[f]))]))}]))}))});
      } finally {await browser.close();}
    }
    const crypto=require("node:crypto");
    const {ENGINE_VERSION}=await import(require("node:url").pathToFileURL(path.join(root,"backgammon/engine/metadata.mjs")));
    const report={schema:2,engine:ENGINE_VERSION,builds:{emscripten:"4.0.15",scalar:"-O2",simd:"-O3 -flto -msimd128 -ffp-contract=off"},recordedAt:new Date().toISOString(),environment:{cpu:os.cpus()[0].model,os:`${os.platform()} ${os.release()} ${os.arch()}`,conditions:"Local HTTP; fresh worker/native evaluation cache per sample; HTTP/JIT compilation caches may be warm. Five alternating paired workers; cold is the first search and warm is the within-worker median of three repeats (raw samples retained). Median/range of five worker samples only; no p95. Same weights, evaluator and presets. No CPU throttle. Not a phone benchmark."},
      assets:Object.fromEntries(Object.entries(variants).map(([name,dir])=>{const bytes=fs.readFileSync(path.join(dir,"gnubg-core-module.wasm"));return [name,{bytes:bytes.length,sha256:crypto.createHash("sha256").update(bytes).digest("hex")}];})),results};
    fs.writeFileSync(process.env.BG_NATIVE_REPORT || "backgammon/data/native-benchmark.json",JSON.stringify(report,null,2)+"\n");
  } finally {server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
