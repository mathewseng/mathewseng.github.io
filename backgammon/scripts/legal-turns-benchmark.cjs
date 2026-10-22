// Differential timing: only legalTurns changes; every native asset, evaluator,
// search setting and candidate order is identical in each paired comparison.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const os = require('node:os'), crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const browsers = require('playwright');
const {launchQuietBrowser} = require('../../scripts/quiet-browser.cjs');
const browserName = process.env.BG_BROWSER || 'chromium';
const samples = Number(process.env.BG_SAMPLES || 5);
if (!Number.isInteger(samples) || samples < 1 || samples > 20) throw Error('Invalid sample count');
const baselineRef = process.env.BG_BASELINE_REF || '570f30472ec96b2450ed2822be344391f228c139';
const assets = new Map();
const baseline = execFileSync('git',['show',`${baselineRef}:backgammon/core/rules.mjs`]);
// Freeze both variants' shared code at startup, even if other work is in flight.
for (const directory of ['backgammon/core','backgammon/engine']) {
  for (const entry of fs.readdirSync(directory, {recursive:true})) {
    const file = path.join(directory,entry);
    if (fs.statSync(file).isFile() && /\.(mjs|js|wasm|data)$/.test(file))
      assets.set('/'+file,fs.readFileSync(file));
  }
}
for (const file of ['backgammon/data/exercises.json']) assets.set('/'+file,fs.readFileSync(file));
const served = new Map();
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const server = http.createServer((request,response) => {
  const original = new URL(request.url,'http://localhost').pathname;
  const isBaseline = original.startsWith('/baseline/');
  const pathname = isBaseline ? original.slice('/baseline'.length) : original;
  if (pathname === '/') {response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Solver benchmark</title>');return;}
  const bytes = isBaseline && pathname === '/backgammon/core/rules.mjs' ? baseline : assets.get(pathname);
  if (!bytes) {response.writeHead(404);response.end();return;}
  served.set(original,hash(bytes));
  response.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.json':'application/json'})[path.extname(pathname)] || 'application/octet-stream');
  response.end(bytes);
});
function stats(values) {
  const sorted = [...values].sort((a,b)=>a-b);
  return {n:values.length,median:sorted[Math.floor(sorted.length/2)],min:sorted[0],max:sorted.at(-1)};
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await launchQuietBrowser(browsers[browserName]);
  try {
    const page = await browser.newPage({serviceWorkers:'block'});
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.exposeFunction('progress', message=>console.log(message));
    const data = await page.evaluate(async ({samples,microOnly}) => {
      const optimized = await import('/backgammon/core/rules.mjs');
      const baseline = await import('/baseline/backgammon/core/rules.mjs');
      const {initialState} = optimized;
      const fixtures = (await (await fetch('/backgammon/data/exercises.json')).json()).items;
      const cases = [
        ...Array.from({length:6},(_,index)=>({id:`starting-${index+1}${index+1}`,state:initialState({phase:'move',dice:[index+1,index+1],matchLength:0})})),
        ...['contact','race','bearoff'].map(topic=>({id:`${topic}-33`,state:{...fixtures.find(f=>f.topic===topic).state,dice:[3,3]}})),
        {id:'starting-31-control',state:initialState({phase:'move',dice:[3,1],matchLength:0})},
      ];
      const micro = [];
      for (const {id,state} of cases) {
        const expected = JSON.stringify(baseline.legalTurns(state));
        if (JSON.stringify(optimized.legalTurns(state)) !== expected) throw Error(`${id}: legal result/path/order mismatch`);
        for(let warm=0;warm<10;warm++){baseline.legalTurns(state);optimized.legalTurns(state);}
        const pairs=[];
        for(let sample=0;sample<samples;sample++){
          const pair={};
          for(const mode of sample%2 ? ['optimized','baseline'] : ['baseline','optimized']) {
            const rules = mode==='baseline'?baseline:optimized, start=performance.now();
            for(let repetition=0;repetition<50;repetition++)rules.legalTurns(state);
            pair[mode]=(performance.now()-start)/50;
          }
          pairs.push(pair);
        }
        micro.push({id,state,paths:baseline.legalPaths(state).length,results:baseline.legalTurns(state).length,pairs});
      }
      const rows=[];
      const run = async (mode,state,preset) => {
        const worker = new Worker(`${mode==='baseline'?'/baseline':''}/backgammon/engine/worker.mjs`,{type:'module'});
        const request = data => new Promise((resolve,reject)=>{
          worker.onmessage=event=>event.data.type==='error'?reject(Error(event.data.message)):resolve(event.data);
          worker.onerror=event=>reject(Error(event.message));
          worker.postMessage(data);
        });
        try {
          const startup=await request({id:1,type:'init'});
          const start=performance.now();
          const {result}=await request({id:2,type:'analyze',state,preset,kind:'checker'});
          return {elapsedMs:performance.now()-start,computeMs:result.elapsedMs,startup,result};
        } finally {worker.terminate();}
      };
      if (!microOnly) for (const {id,state} of cases.filter(c=>['starting-33','contact-33','bearoff-33','starting-31-control'].includes(c.id)))
        for (const preset of ['quick','standard','deep']) {
          const pairs=[];
          for(let sample=0;sample<samples;sample++){
            const pair={};
            for(const mode of sample%2 ? ['optimized','baseline'] : ['baseline','optimized'])pair[mode]=await run(mode,state,preset);
            const clean = value => {const {elapsedMs,requestId,...result}=value.result;return result;};
            if(JSON.stringify(clean(pair.baseline))!==JSON.stringify(clean(pair.optimized)))throw Error(`${id}/${preset}: native result changed`);
            const numerical=pair.baseline.result.candidates.map(({key,steps,equity,probabilities,cubeless,mwc})=>({key,steps,equity,probabilities,cubeless,mwc}));
            for(const mode of ['baseline','optimized'])delete pair[mode].result;
            pairs.push({...pair,numerical});
          }
          rows.push({id,state,preset,pairs});
          await window.progress(`${id}/${preset}: exact numerical, candidate and order parity (${samples} pairs)`);
        }
      return {micro,rows};
    },{samples,microOnly:process.env.BG_MICRO_ONLY==='1'});
    const summarize = rows => rows.map(row=>({...row,summary:Object.fromEntries(['baseline','optimized'].map(mode=>[mode,
      stats(row.pairs.map(pair=>typeof pair[mode]==='number'?pair[mode]:pair[mode].elapsedMs))]))}));
    // Keep the complete numerical rows once, with per-sample checksums. The
    // identical native outputs need not be duplicated for every timing sample.
    const native = summarize(data.rows).map(row=>({...row,numerical:row.pairs[0].numerical,
      pairs:row.pairs.map(({numerical,...pair})=>({...pair,numericalSHA256:hash(JSON.stringify(numerical))}))}));
    const report={schema:1,recordedAt:new Date().toISOString(),baselineRef,
      method:'Identical complete legal result sets, canonical paths and order. Alternating paired samples. Micro samples each average 50 enumerations after warmup. Native samples use a fresh worker and fresh native evaluation cache, initialization excluded; both variants share the same captured evaluator and WASM. Exact full-result equality is asserted, except elapsed time/request id. Native timing includes dispatch and result transfer. No search depth, pruning filter, weights or neural arithmetic changed.',
      limitations:['Local desktop measurements; not physical-phone timings.','Background system load was not controlled. Median/range only; no tail-latency claim.','This accelerates JS root enumeration for doubles; native deep-search work and evaluator strength are unchanged.'],
      environment:{cpu:os.cpus()[0].model,os:`${os.platform()} ${os.release()} ${os.arch()}`,browser:`${browserName} ${browser.version()}`,load:os.loadavg()},
      assets:Object.fromEntries(served),micro:summarize(data.micro),native};
    const output=process.env.BG_OUTPUT || `backgammon/docs/legal-turns-speed-${browserName}.json`;
    fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
    console.log(`Saved ${output}`);
    for(const row of report.micro)console.log(`${row.id} enumeration ${row.summary.baseline.median.toFixed(3)} → ${row.summary.optimized.median.toFixed(3)} ms`);
    for(const row of report.native)console.log(`${row.id}/${row.preset} solver ${row.summary.baseline.median.toFixed(2)} → ${row.summary.optimized.median.toFixed(2)} ms`);
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
