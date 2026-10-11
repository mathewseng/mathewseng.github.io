// Real progressive-search traces, including right-censored expensive stages.
// Run after assembling _site. Resume by rerunning with the same asset hashes.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const os = require('node:os'), crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {webkit} = require('playwright');
const {launchQuietBrowser} = require('../../scripts/quiet-browser.cjs');
const site = path.resolve(process.env.BG_SITE || '_site');
const output = path.resolve(process.env.BG_OUTPUT || 'backgammon/test-results/search-policy/results.json');
const stageLimitMs = 4000;
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const corpusBytes = fs.readFileSync('backgammon/data/accuracy-reference.json');
const corpus = JSON.parse(corpusBytes);
const command = (cmd,args) => {try{return execFileSync(cmd,args,{encoding:'utf8'}).trim();}catch{return null;}};
const environment = () => ({cpu:os.cpus()[0].model,cores:os.cpus().length,os:`${os.platform()} ${os.release()} ${os.arch()}`,power:command('pmset',['-g','batt']),powerSettings:command('pmset',['-g','custom']),load:os.loadavg()});
const worker = `
import create from '/backgammon/engine/vendor/simd/gnubg-core-module.js';
import {createEvaluator} from '/backgammon/engine/evaluate.mjs';
const module=await create({locateFile:p=>p.endsWith('.data')?'/backgammon/engine/vendor/'+p:'/backgammon/engine/vendor/simd/'+p});
const engine=createEvaluator(module); let best=null;
postMessage({type:'ready'});
onmessage=({data})=>{
 try {const r=engine.analyze(data.state,data.preset,'checker',null,{automatic:true,retainKeys:best?[best]:[]});best=r.candidates[0]?.key;
 postMessage({type:'result',result:{settings:r.settings,elapsedMs:r.elapsedMs,candidates:r.candidates.map(c=>({key:c.key,equity:c.equity,notation:c.notation})),total:r.screening?.total??r.candidates.length,rootCount:r.screening?.initial?.finalists??(r.screening?.plies===0?r.screening.finalists:r.screening?.total??r.candidates.length)}});
 }catch(e){postMessage({type:'error',error:e.message});}
};`;
const hashes = Object.fromEntries(['engine/evaluate.mjs','engine/adaptive.mjs','engine/metadata.mjs','engine/vendor/simd/gnubg-core-module.js','engine/vendor/simd/gnubg-core-module.wasm','engine/vendor/gnubg-core-module.data','core/rules.mjs','core/xgid.mjs'].map(p=>{
 const name='backgammon/'+p, a=fs.readFileSync(name),b=fs.readFileSync(path.join(site,name));if(!a.equals(b))throw Error('Assembled asset mismatch '+name);return [name,sha(a)];
}));
const signature=sha(JSON.stringify({hashes,corpus:sha(corpusBytes),worker:sha(worker),stageLimitMs}));
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost').pathname;
 res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.json':'application/json'})[path.extname(url)]||'text/html');
 if(url==='/trace-worker.mjs')return res.end(worker);
 if(url==='/')return res.end('<!doctype html><title>Search policy measurements</title>');
 const file=path.resolve(site,'.'+url);if(!file.startsWith(site+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(file,(error,data)=>{if(error)res.writeHead(404);res.end(error?'Not found':data);});
});
(async()=>{
 const {initialState}=await import('../core/rules.mjs');
 const cases=[];
 // Interleave classes. Additional contexts share a position's validation group.
 for(let i=0;i<100;i++)for(let topic=0;topic<3;topic++){
  const index=topic*100+i,row=corpus.items[index];
  cases.push({id:'reference-'+index,index,topic:row.topic,context:'cubeless',state:row.state});
  if(i%10===5){
   cases.push({id:'money-'+index,index,topic:row.topic,context:'money',state:initialState({...row.state,rules:{...row.state.rules,cube:true,jacoby:true}})});
   cases.push({id:'match-'+index,index,topic:row.topic,context:'match',state:initialState({...row.state,matchLength:7,scores:[2,4],rules:{...row.state.rules,cube:true,jacoby:false}})});
  }
 }
 fs.mkdirSync(path.dirname(output),{recursive:true});
 let report=fs.existsSync(output)?JSON.parse(fs.readFileSync(output)):null;
 if(report&&report.signature!==signature)throw Error('Existing output uses different inputs; choose BG_OUTPUT.');
 report??={schema:1,signature,startedAt:new Date().toISOString(),revision:command('git',['rev-parse','HEAD']),engine:'gnubg-core/955555c69adebb1d7de23abc1018074158621168+bg5',hashes,corpusSha256:sha(corpusBytes),stageLimitMs,cases,samples:[],sessions:[],method:'360 positions/contexts: all 300 reference cubeless decisions plus 30 matched Jacoby money and 30 seven-point match contexts. Fresh worker per case; progressive 0/1/2/3/4 ply reuses native and root caches. Automatic root filters; retains the previous completed winner. One observation per case/stage, 4000 ms per-stage wall timeout. A timeout is a lower bound, never an exact duration. Remaining deeper stages are unobserved. Local HTTP, actual assembled SIMD WASM in WebKit, no artificial CPU throttling. Browser compilation/HTTP caches may be warm. Background apps stay running. Startup separate.'};
 const save=()=>fs.writeFileSync(output,JSON.stringify(report)+'\n');
 report.sessions.push({at:new Date().toISOString(),environment:environment()});save();
 let browser;await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  browser=await launchQuietBrowser(webkit);report.browser={name:'webkit',version:browser.version()};
  const page=await browser.newPage({serviceWorkers:'block'});await page.goto(`http://127.0.0.1:${server.address().port}/`);
  for(const row of cases){
   if(report.samples.some(s=>s.id===row.id))continue;
   const sample=await page.evaluate(({state,stageLimitMs})=>new Promise(resolve=>{
    const start=performance.now(),w=new Worker('/trace-worker.mjs',{type:'module'}),levels=[];
    const presets=['quick','standard','deep','expert','research'];let stage=0,begin,timeout,startupMs;
    const finish=extra=>{clearTimeout(timeout);w.terminate();resolve({startupMs,levels,...extra});};
    const run=()=>{begin=performance.now();timeout=setTimeout(()=>finish({censored:{plies:stage,lowerBoundMs:performance.now()-begin}}),stageLimitMs);w.postMessage({state,preset:presets[stage]});};
    timeout=setTimeout(()=>finish({error:'Initialization timeout'}),45000);
    w.onerror=e=>finish({error:e.message});
    w.onmessage=({data})=>{
     if(data.type==='ready'){clearTimeout(timeout);startupMs=performance.now()-start;run();}
     else if(data.type==='error')finish({error:data.error});
     else{clearTimeout(timeout);levels.push({...data.result,plies:stage,wallMs:performance.now()-begin});stage++;if(stage===presets.length)finish({});else run();}
    };
   }),{state:row.state,stageLimitMs});
   report.samples.push({id:row.id,index:row.index,context:row.context,topic:row.topic,...sample});save();
   console.log(`${report.samples.length}/${cases.length} ${row.id} ${sample.levels.map(l=>l.plies+':'+Math.round(l.wallMs)).join(' ')}${sample.censored?' censored:'+sample.censored.plies:''}${sample.error?' ERROR:'+sample.error:''}`);
   if(sample.error)throw Error(sample.error);
  }
  report.finishedAt=new Date().toISOString();report.environmentEnd=environment();save();
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
