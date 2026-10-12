// Compare only client scheduling/cache behavior. Both clients load the SAME
// assembled engine/assets, so this is not a comparison of neural strength.
const browsers = require("playwright");
const browserName = process.env.BG_BROWSER || "chromium";
const repetitions = Number(process.env.BG_SAMPLES || 5);
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10) throw Error("BG_SAMPLES must be 1–10");
const { launchQuietBrowser } = require("../../scripts/quiet-browser.cjs");
const fs = require("node:fs"), path = require("node:path"), http = require("node:http"), os = require("node:os");
const { execFileSync } = require("node:child_process");
const baselineRef = process.env.BG_BASELINE_REF || "62f0259034e730a3783c980c86da259ba5b62a3a";
const baseline = execFileSync("git", ["show", `${baselineRef}:backgammon/engine/client.mjs`]);
const root = path.resolve("_site");
const server = http.createServer((req,res) => {
  let url = new URL(req.url,"http://localhost").pathname;
  if (url === "/backgammon/engine/baseline-client.mjs") {
    res.setHeader("Content-Type","text/javascript"); res.end(baseline); return;
  }
  if (url.endsWith("/")) url += "index.html";
  const file = path.join(root,url);
  if (!file.startsWith(root+path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file,(error,data)=>{
    if(error) {res.writeHead(404);res.end();return;}
    res.setHeader("Content-Type",({".html":"text/html",".js":"text/javascript",".mjs":"text/javascript",".wasm":"application/wasm",".json":"application/json",".css":"text/css"})[path.extname(file)]||"application/octet-stream");
    res.end(data);
  });
});
const stats = samples => {
  const sorted = [...samples].sort((a,b)=>a-b);
  return {n:samples.length,median:sorted[Math.floor(sorted.length/2)],min:sorted[0],max:sorted.at(-1)};
};
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const browser = await launchQuietBrowser(browsers[browserName]);
  try {
    const page = await browser.newPage({serviceWorkers:"block"});
    await page.goto(`http://127.0.0.1:${server.address().port}/backgammon/`);
    await page.exposeFunction("measurement", row=>console.log(`${row.topic}/${row.preset}: grade ${row.baseline.toFixed(2)} → ${row.reuse.toFixed(2)} ms`));
    const data = await page.evaluate(async repetitions=>{
      const {EngineClient} = await import("/backgammon/engine/client.mjs");
      const {EngineClient:Baseline} = await import("/backgammon/engine/baseline-client.mjs");
      const {initialState} = await import("/backgammon/core/rules.mjs");
      const {ENGINE_VERSION} = await import("/backgammon/engine/metadata.mjs");
      const fixtures=(await(await fetch("/backgammon/data/exercises.json")).json()).items;
      const cases=[...["contact","race","bearoff"].map(topic=>({topic,state:fixtures.find(f=>f.topic===topic).state})),{topic:"doubles",state:initialState({phase:"move",dice:[3,3]})},{topic:"match",state:initialState({phase:"move",dice:[3,1],matchLength:7,scores:[2,4]})}];
      const rows=[];
      for(const {topic,state} of cases) for(const preset of ["expert","research"]) {
        const samples=[];
        for(let i=0;i<repetitions;i++) {
          const pair={};
          for(const mode of i%2?["reuse","baseline"]:["baseline","reuse"]) {
            let jobs=0;
            const Client=mode==="baseline"?Baseline:EngineClient;
            const engine=new Client({openingBook:null,workerFactory:()=>{
              const w=new Worker("/backgammon/engine/worker.mjs",{type:"module"}),send=w.postMessage.bind(w);
              w.postMessage=m=>{if(m.type==="analyze") jobs++;send(m);};return w;
            }});
            try {
              await engine.start();
              const start=performance.now();
              const hint=await engine.analyze(state,{preset});
              const hintMs=performance.now()-start, submitted=hint.candidates.at(-1).steps;
              const gradeStart=performance.now();
              const pending=engine.analyze(state,{preset,submitted});
              const dispatchMs=performance.now()-gradeStart;
              const grade=await pending;
              if(mode==="reuse"&&!grade.reusedHint)throw Error("Grade did not reuse completed hint");
              if(grade.settings.plies!==hint.settings.plies)throw Error("Depth changed");
              const gradeMs=performance.now()-gradeStart;
              pair[mode]={hintMs,gradeMs,dispatchMs,totalMs:performance.now()-start,jobs,candidates:hint.candidates.length,actual:grade.actual.key,equity:grade.actual.equity,loss:grade.error};
            } finally {engine.destroy();}
          }
          if(pair.baseline.actual!==pair.reuse.actual || Math.abs(pair.baseline.equity-pair.reuse.equity)>0.00001 || Math.abs(pair.baseline.loss-pair.reuse.loss)>0.00002)
            throw new Error(`${topic}/${preset}: grade differs from baseline`);
          if(pair.baseline.jobs!==2||pair.reuse.jobs!==1) throw new Error("Unexpected worker job count");
          samples.push(pair);
        }
        rows.push({topic,preset,state,samples});
        await window.measurement({topic,preset,baseline:samples.reduce((n,s)=>n+s.baseline.gradeMs,0)/repetitions,reuse:samples.reduce((n,s)=>n+s.reuse.gradeMs,0)/repetitions});
      }
      return {engine:ENGINE_VERSION,rows};
    },repetitions);
    const assetFiles=["engine/client.mjs","engine/evaluate.mjs","engine/metadata.mjs","engine/vendor/simd/gnubg-core-module.js","engine/vendor/simd/gnubg-core-module.wasm","engine/vendor/gnubg-core-module.wasm","engine/vendor/gnubg-core-module.data","core/rules.mjs","core/xgid.mjs"];
    const assets=Object.fromEntries(assetFiles.map(f=>[f,require("node:crypto").createHash("sha256").update(fs.readFileSync(path.join(root,"backgammon",f))).digest("hex")]));
    const report={schema:1,assets,baselineClientSha256:require("node:crypto").createHash("sha256").update(baseline).digest("hex"),clientSha256:require("node:crypto").createHash("sha256").update(fs.readFileSync(path.join(root,"backgammon/engine/client.mjs"))).digest("hex"),recordedAt:new Date().toISOString(),baselineClient:baselineRef,engine:data.engine,
      environment:{cpu:os.cpus()[0].model,os:`${os.platform()} ${os.release()} ${os.arch()}`,browser:`${browserName} ${browser.version()}`,condition:"Local HTTP on desktop, no CPU throttle. Fresh worker per sample, initialization excluded. Hint first, then grade the lowest-ranked candidate in that hint (not necessarily the worst legal move) using a warm native evaluation cache. Baseline and optimized order alternate. Sample count is recorded per row; median/range only, no p95. Not a phone or Internet-transfer benchmark."},
      rows:data.rows.map(row=>({...row,summary:Object.fromEntries(["baseline","reuse"].map(mode=>[mode,Object.fromEntries(["hintMs","gradeMs","dispatchMs","totalMs"].map(metric=>[metric,stats(row.samples.map(s=>s[mode][metric]))]))]))}))};
    fs.writeFileSync(process.env.BG_OUTPUT || `backgammon/docs/screened-reuse-${browserName}.json`,JSON.stringify(report,null,2)+"\n");
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
