// SPDX-License-Identifier: GPL-3.0-or-later
// Reproducible, resumable GNUbg opening/reply book. No third-party move database.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {chromium}=require('playwright'),{launchQuietBrowser}=require('../../scripts/quiet-browser.cjs');
const {resolveBookInputs,recipe}=require('./book-inputs.cjs');
const root=resolveBookInputs(),out=path.resolve('backgammon/engine/opening-book-data');
const checkpoint=path.resolve('backgammon/test-results/opening-book-build.json');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const worker=require('./book-evaluator.cjs');
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost').pathname;
 if(url==='/book-worker.mjs'){res.setHeader('Content-Type','text/javascript');return res.end(worker);}
 if(url==='/')return res.end('<!doctype html><title>Opening book generation</title>');
 const f=path.resolve(root,'.'+url);if(!f.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.json':'application/json'})[path.extname(f)]||'text/html');
 fs.readFile(f,(e,b)=>{if(e)res.writeHead(404);res.end(e?'Not found':b);});});
(async()=>{
 const {initialState,commitTurn,boardKey}=await import('../core/rules.mjs');const ENGINE_VERSION=recipe.engine;
 const {BOOK_ID}=await import('../engine/opening-book.mjs');
 const files=['engine/evaluate.mjs','engine/vendor/simd/gnubg-core-module.js','engine/vendor/simd/gnubg-core-module.wasm','engine/vendor/gnubg-core-module.data','core/rules.mjs','core/xgid.mjs'];
 const assets=Object.fromEntries(files.map(p=>[p,hash(fs.readFileSync(path.join(root,'backgammon',p)))]));
 const signature=hash(JSON.stringify({assets,worker,engine:ENGINE_VERSION}));
 fs.mkdirSync(path.dirname(checkpoint),{recursive:true});fs.mkdirSync(out,{recursive:true});
 let progress=fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint)):null;
 if(progress&&progress.signature!==signature)throw Error('Checkpoint input mismatch; move the old checkpoint before rebuilding.');
 progress??={signature,engine:ENGINE_VERSION,assets,startedAt:new Date().toISOString(),openings:{},replies:{}};
 const save=()=>{fs.writeFileSync(checkpoint+'.tmp',JSON.stringify(progress));fs.renameSync(checkpoint+'.tmp',checkpoint);};
 const seed=initialState({matchLength:0,phase:'move',dice:[2,1],rules:{cube:true,jacoby:true}});
 const mirror=s=>({...s,points:s.points.toReversed().map(x=>-x),bar:[...s.bar].reverse(),off:[...s.off].reverse(),turn:1-s.turn});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await launchQuietBrowser(chromium);
 try{const page=await browser.newPage({serviceWorkers:'block'});await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.evaluate(()=>new Promise((resolve,reject)=>{window.bookWorker=new Worker('/book-worker.mjs',{type:'module'});bookWorker.onmessage=e=>e.data.ready?resolve():reject(Error(e.data.error));bookWorker.onerror=e=>reject(Error(e.message));}));
 const analyze=(state,opening)=>page.evaluate(({state,opening})=>new Promise((resolve,reject)=>{bookWorker.onmessage=({data})=>data.error?reject(Error(data.error)):resolve(data);bookWorker.onerror=e=>reject(Error(e.message));bookWorker.postMessage({state,opening});}),{state,opening});
 for(let a=2;a<=6;a++)for(let b=1;b<a;b++){const key=`${a}${b}`;if(!progress.openings[key]){progress.openings[key]=await analyze({...seed,dice:[a,b]},true);save();console.log('opening',key,progress.openings[key].rows.length,Math.round(progress.openings[key].elapsedMs)+' ms');}}
 const positions=new Map(),openingEntries={};
 for(const [roll,result] of Object.entries(progress.openings)){
  const s={...seed,dice:[...roll].map(Number)},best=result.rows[0].equity;
  openingEntries[roll]={...result,near:[]};
  for(const c of result.rows.filter(c=>best-c.equity<=.040+1e-8)){
   const reply=mirror({...commitTurn(s,c.steps),turn:1});const key=boardKey(reply),id=hash(key).slice(0,16);
   positions.set(id,reply);openingEntries[roll].near.push({steps:c.steps,loss:best-c.equity,reply:id});
  }
 }
 console.log(positions.size+' near-best opening boards × 21 reply rolls');
 const jobs=[];
 for(const [id,s] of positions){progress.replies[id]??={};for(let a=1;a<=6;a++)for(let b=1;b<=a;b++){
  const roll=`${a}${b}`;if(!progress.replies[id][roll])jobs.push({id,s,roll});
 }}
 await Promise.all(Array.from({length:4},async()=>{
  const tab=await browser.newPage({serviceWorkers:'block'});await tab.goto(`http://127.0.0.1:${server.address().port}/`);
  await tab.evaluate(()=>new Promise((resolve,reject)=>{window.bookWorker=new Worker('/book-worker.mjs',{type:'module'});bookWorker.onmessage=e=>e.data.ready?resolve():reject(Error(e.data.error));bookWorker.onerror=e=>reject(Error(e.message));}));
  while(jobs.length){const {id,s,roll}=jobs.shift();const r=await tab.evaluate(state=>new Promise((resolve,reject)=>{bookWorker.onmessage=({data})=>data.error?reject(Error(data.error)):resolve(data);bookWorker.onerror=e=>reject(Error(e.message));bookWorker.postMessage({state,opening:false});}),{...s,dice:[...roll].map(Number),phase:'move'});
   progress.replies[id][roll]=r;save();console.log('reply',id,roll,Math.round(r.elapsedMs)+' ms · remaining '+jobs.length);
  }await tab.close();
 }));
 const compact=r=>({total:r.total,rows:r.rows.map(c=>[c.steps.map(s=>[s.from,s.to,s.die]),c.equity,c.cubeless,...c.probabilities])});
 const index={schema:1,id:BOOK_ID,engine:ENGINE_VERSION,plies:3,threshold:.040,context:{matchLength:0,cube:true,jacoby:true,immediateRedoubles:0,cubeOwner:null},settings:{name:'Opening book',plies:3,cubeful:true,pruning:true,deterministic:true,noise:0,replyFilter:{plies:2,minimum:10,threshold:.080}},openings:{},replies:{},provenance:{assets,builtAt:new Date().toISOString(),generator:'backgammon/scripts/build-opening-book.cjs'}};
 for(const [roll,r] of Object.entries(openingEntries))index.openings[roll]={...compact(r),near:r.near};
 for(const [id,s] of positions){const body=JSON.stringify({schema:1,id:index.id,engine:ENGINE_VERSION,board:boardKey(s),rolls:Object.fromEntries(Object.entries(progress.replies[id]).map(([roll,r])=>[roll,compact(r)]))})+'\n';
  const file=`reply-${id}.json`;fs.writeFileSync(path.join(out,file),body);index.replies[boardKey(s)]={file,sha256:hash(body)};
 }
 // Remove only obsolete generated shards after the replacement book is complete.
 const kept=new Set(Object.values(index.replies).map(ref=>ref.file));
 for(const file of fs.readdirSync(out))if(/^reply-[a-f0-9]{16}\.json$/.test(file)&&!kept.has(file))fs.unlinkSync(path.join(out,file));
 fs.writeFileSync(path.join(out,'index.json'),JSON.stringify(index)+'\n');
 progress.finishedAt=new Date().toISOString();save();console.log('Published '+Object.keys(index.openings).length+' openings and '+positions.size*21+' replies.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
