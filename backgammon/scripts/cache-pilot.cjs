// SPDX-License-Identifier: GPL-3.0-or-later
// Research-only cache sizing. Real WASM, fresh worker for every timed search.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const os = require('node:os'), crypto = require('node:crypto');
const { launchQuietBrowser } = require('../../scripts/quiet-browser.cjs');
const browsers = require('playwright');
const root = process.cwd(), build = path.resolve(process.env.BG_CACHE_BUILD || 'backgammon/test-results/cache-pilot/dist_simd');
const output = process.env.BG_OUTPUT || 'backgammon/test-results/cache-pilot/results.json';
const browserName = process.env.BG_BROWSER || 'chromium', samples = Number(process.env.BG_SAMPLES || 1);
const configurations = JSON.parse(process.env.BG_CACHE_CONFIGS || '[[19,16],[19,18],[20,18],[21,19]]');
if (!Number.isInteger(samples) || samples < 1 || samples > 10) throw Error('Invalid sample count');
const presets = (process.env.BG_PRESETS || 'deep,expert,research').split(',');
const workerSource = `
import create from '/experiment/gnubg-core-module.js';
import {createEvaluator} from '/backgammon/engine/evaluate.mjs';
const module = await create({locateFile:p=>'/experiment/'+p,print:()=>{},printErr:()=>{}});
const engine = createEvaluator(module);
onmessage = ({data:{state,preset,configuration}}) => {try {
  const resize = module.cwrap('bg_cache_config','number',['number','number']);
  if(resize(...configuration)<0) throw Error('Cache allocation failed');
  const memoryBytes=module.cwrap('bg_memory_size','number',[])();
  const begin=performance.now(),answer=engine.analyze(state,preset);
  postMessage({answer,computeMs:performance.now()-begin,memoryBytes});
} catch(e) {postMessage({error:e.stack});}};
postMessage({ready:true});`;
const server = http.createServer((req,res)=>{
  const url = new URL(req.url,'http://localhost').pathname;
  if(url==='/')return res.end('<!doctype html><title>Cache sizing experiment</title>');
  res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm'})[path.extname(url)] || 'application/octet-stream');
  if(url==='/experiment/worker.mjs')return res.end(workerSource);
  const base=url.startsWith('/experiment/')?build:root;
  const file=path.resolve(base,'.'+(base===build?url.slice('/experiment'.length):url));
  if(!file.startsWith(base+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(file,(e,b)=>{if(e)res.writeHead(404);res.end(e?'Not found':b);});
});
const sha = b=>crypto.createHash('sha256').update(b).digest('hex');
const report={schema:1,startedAt:new Date().toISOString(),environment:{cpu:os.cpus()[0].model,os:`${os.platform()} ${os.release()} ${os.arch()}`,load:os.loadavg()},
  method:'Cache-size diagnostic; no search/weight/filter changes. Fresh worker/native caches per sample, local HTTP, startup excluded, configuration order rotated across repetitions. Browser compilation/HTTP caches may be warm. Not phone measurements. Allocation is before timing; heap size includes allocator growth/fragmentation.',
  configurations,samples,presets,hashes:{script:sha(fs.readFileSync(__filename)),worker:sha(workerSource)},rows:[]};
const save=()=>{fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');};
(async()=>{
  const {initialState}=await import('../core/rules.mjs');
  const fixtures=JSON.parse(fs.readFileSync('backgammon/data/exercises.json')).items;
  const cases=[...['contact','race'].map(topic=>({topic,state:fixtures.find(f=>f.topic===topic).state})),
    {topic:'doubles',state:initialState({phase:'move',dice:[3,3]})},
    {topic:'match',state:initialState({phase:'move',dice:[3,1],matchLength:7,scores:[2,4]})}];
  for(const ext of ['js','wasm','data'])report.hashes[ext]=sha(fs.readFileSync(path.join(build,'gnubg-core-module.'+ext)));
  report.cases=cases;
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try {
    browser=await launchQuietBrowser(browsers[browserName]);report.browser={name:browserName,version:browser.version()};
    const page=await browser.newPage({serviceWorkers:'block'});await page.goto(`http://127.0.0.1:${server.address().port}/`);
    for(const item of cases)for(const preset of presets){
      let reference;
      for(let sample=0;sample<samples;sample++)for(let offset=0;offset<configurations.length;offset++){
        const configuration=configurations[(sample+offset)%configurations.length];
        const result=await page.evaluate(({state,preset,configuration})=>new Promise((resolve,reject)=>{
          const started=performance.now(),worker=new Worker('/experiment/worker.mjs',{type:'module'});let startupMs;
          const timer=setTimeout(()=>{worker.terminate();reject(Error('Search exceeded 180 seconds'));},180000);
          const finish=()=>{clearTimeout(timer);worker.terminate();};
          worker.onerror=e=>{finish();reject(Error(e.message));};
          worker.onmessage=({data})=>{if(data.ready){startupMs=performance.now()-started;worker.postMessage({state,preset,configuration});}
            else{finish();data.error?reject(Error(data.error)):resolve({...data,startupMs});}};
        }),{state:item.state,preset,configuration});
        const {answer,...timing}=result;
        reference ||= answer;
        if(answer.candidates.length!==reference.candidates.length || answer.candidates[0].key!==reference.candidates[0].key)throw Error('Candidate coverage or winner changed');
        let maxDifference=0;
        for(const c of answer.candidates){const ref=reference.candidates.find(r=>r.key===c.key);if(!ref)throw Error('Missing candidate');
          for(const field of ['equity','cubeless','mwc'])if(c[field]!=null)maxDifference=Math.max(maxDifference,Math.abs(c[field]-ref[field]));
          c.probabilities.forEach((x,i)=>maxDifference=Math.max(maxDifference,Math.abs(x-ref.probabilities[i])));}
        if(maxDifference>0.00001)throw Error(`Cache-size parity failed: ${maxDifference}`);
        const row={topic:item.topic,preset,configuration,sample,...timing,maxDifference,best:answer.candidates[0].key,candidates:answer.candidates.map(({key,equity,probabilities})=>({key,equity,probabilities}))};
        report.rows.push(row);save();console.log(JSON.stringify({...row,candidates:row.candidates.length,best:undefined}));
      }
    }
    report.finishedAt=new Date().toISOString();report.environmentEnd={load:os.loadavg()};save();
  }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
