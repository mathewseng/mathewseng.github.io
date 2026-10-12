// SPDX-License-Identifier: GPL-3.0-or-later
// Compare an experimental executable against the deployed SIMD engine.
// No change to application assets; all requests bypass the opening book.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const os = require('node:os'), crypto = require('node:crypto');
const { launchQuietBrowser } = require('../../scripts/quiet-browser.cjs');
const browsers = require('playwright');
const root = process.cwd(), variants = {
  baseline:path.resolve('backgammon/engine/vendor/simd'),
  candidate:path.resolve(process.env.BG_CANDIDATE || 'backgammon/test-results/activation-pilot/dist_simd'),
};
const output = process.env.BG_OUTPUT || 'backgammon/test-results/activation-pilot/results.json';
const browserName = process.env.BG_BROWSER || 'chromium', samples = Number(process.env.BG_SAMPLES || 3);
if (!Number.isInteger(samples) || samples < 1 || samples > 10) throw Error('Invalid sample count');
const presets = (process.env.BG_PRESETS || 'deep,expert').split(',');
const workerSource = `
import {createEvaluator} from '/backgammon/engine/evaluate.mjs';
onmessage=async({data:{state,preset,variant}})=>{try {
  const begin=performance.now();
  const {default:create}=await import('/variants/'+variant+'/gnubg-core-module.js');
  const module=await create({locateFile:p=>p.endsWith('.data')?'/backgammon/engine/vendor/'+p:'/variants/'+variant+'/'+p,print:()=>{},printErr:()=>{}});
  const engine=createEvaluator(module),startupMs=performance.now()-begin;
  const start=performance.now(),answer=engine.analyze(state,preset);
  postMessage({answer,computeMs:performance.now()-start,startupMs});
}catch(e){postMessage({error:e.stack});}};`;
const server = http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost').pathname;
  if(url==='/')return res.end('<!doctype html><title>Native search experiment</title>');
  res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm'})[path.extname(url)]||'application/octet-stream');
  if(url==='/experiment/worker.mjs')return res.end(workerSource);
  const match=/^\/variants\/(baseline|candidate)\/(gnubg-core-module\.(js|wasm))$/.exec(url);
  const file=match?path.join(variants[match[1]],match[2]):path.resolve(root,'.'+url);
  if(!match&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(file,(e,b)=>{if(e)res.writeHead(404);res.end(e?'Not found':b);});
});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={schema:1,startedAt:new Date().toISOString(),environment:{cpu:os.cpus()[0].model,os:`${os.platform()} ${os.release()} ${os.arch()}`,load:os.loadavg()},
  method:'Paired first-search native comparison. Fresh worker/native caches per sample; alternating baseline/candidate order across repetitions (baseline first for one sample); startup recorded separately; local HTTP and warm browser compilation/HTTP caches possible. Identical JS evaluator, canonical states, weights, presets and candidate filters. Not real-phone measurements. This script runs searches sequentially; other applications remain running and can affect timings.',
  samples,presets,hashes:{script:sha(fs.readFileSync(__filename)),worker:sha(workerSource)},rows:[]};
const save=()=>{fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');};
(async()=>{
  const {initialState}=await import('../core/rules.mjs');
  const fixtures=JSON.parse(fs.readFileSync('backgammon/data/exercises.json')).items;
  let cases=[...['opening','contact','race','bearoff','cube'].map(topic=>({topic,state:fixtures.find(f=>f.topic===topic).state})),
    {topic:'doubles',state:initialState({phase:'move',dice:[3,3]})},
    {topic:'match',state:initialState({phase:'move',dice:[3,1],matchLength:7,scores:[2,4]})}];
  if(process.env.BG_TOPICS)cases=cases.filter(c=>process.env.BG_TOPICS.split(',').includes(c.topic));
  if(process.env.BG_CORPUS==='1')cases=JSON.parse(fs.readFileSync('backgammon/data/accuracy-reference.json')).items.map((item,index)=>({id:`reference-${index}`,topic:item.topic,state:item.state}));
  report.cases=cases;
  for(const [variant,dir]of Object.entries(variants))report.hashes[variant]=Object.fromEntries(['js','wasm'].map(ext=>[ext,sha(fs.readFileSync(path.join(dir,'gnubg-core-module.'+ext)))]));
  for(const file of ['engine/vendor/gnubg-core-module.data','engine/evaluate.mjs','engine/metadata.mjs','core/rules.mjs','core/xgid.mjs'])report.hashes[file]=sha(fs.readFileSync('backgammon/'+file));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try{
    browser=await launchQuietBrowser(browsers[browserName]);report.browser={name:browserName,version:browser.version()};
    const page=await browser.newPage({serviceWorkers:'block'});await page.goto(`http://127.0.0.1:${server.address().port}/`);
    for(const item of cases)for(const preset of presets)for(let sample=0;sample<samples;sample++){
      const pair={};
      for(const variant of sample%2?['candidate','baseline']:['baseline','candidate'])pair[variant]=await page.evaluate(({state,preset,variant})=>new Promise((resolve,reject)=>{
        const worker=new Worker('/experiment/worker.mjs',{type:'module'});
        const timer=setTimeout(()=>{worker.terminate();reject(Error('Search exceeded 180 seconds'));},180000);
        const finish=()=>{clearTimeout(timer);worker.terminate();};
        worker.onerror=e=>{finish();reject(Error(e.message));};
        worker.onmessage=({data})=>{finish();data.error?reject(Error(data.error)):resolve(data);};
        worker.postMessage({state,preset,variant});
      }),{state:item.state,preset,variant});
      const a=pair.baseline.answer,b=pair.candidate.answer,ac=a.candidates||[a],bc=b.candidates||[b];
      if(ac.length!==bc.length || (a.candidates?.[0].key||a.action)!==(b.candidates?.[0].key||b.action))throw Error('Candidate coverage or winner changed');
      let maxDifference=0;
      const compare=(x,y)=>{if(x==null||y==null){if(x!==y)throw Error('Missing number');return;}if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Invalid number');maxDifference=Math.max(maxDifference,Math.abs(x-y));};
      for(const c of ac){const ref=a.candidates?bc.find(r=>r.key===c.key):b;if(!ref)throw Error('Missing candidate');
        for(const field of ['equity','cubeless','mwc'])compare(c[field],ref[field]);
        for(const field of ['probabilities','outcomes','outcomesMWC'])if(c[field])c[field].forEach((x,i)=>compare(x,ref[field]?.[i]));}
      if(maxDifference>0.00001)throw Error(`Native parity failed: ${maxDifference}`);
      const row={id:item.id||item.topic,topic:item.topic,preset,sample,maxDifference,baseline:pair.baseline,candidate:pair.candidate};
      report.rows.push(row);save();console.log(JSON.stringify({...row,baseline:pair.baseline.computeMs,candidate:pair.candidate.computeMs}));
    }
    report.finishedAt=new Date().toISOString();report.environmentEnd={load:os.loadavg()};save();
  }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
