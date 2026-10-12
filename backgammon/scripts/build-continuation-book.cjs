// SPDX-License-Identifier: GPL-3.0-or-later
// Extend the complete first-two-turn book with a bounded, reproducible set of
// later boards. Every selected board gets all 21 rolls at the same 3-ply settings.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {chromium}=require('playwright'),{launchQuietBrowser}=require('../../scripts/quiet-browser.cjs');
const worker=require('./book-evaluator.cjs');
const root=path.resolve('_site'),out=path.resolve('backgammon/engine/opening-book-data');
const checkpoint=path.resolve('backgammon/test-results/continuation-book-build.json');
const workers=Number(process.env.BG_BOOK_WORKERS||4);
if(!Number.isInteger(workers)||workers<1||workers>8)throw Error('BG_BOOK_WORKERS must be an integer from 1 to 8.');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),id=board=>hash(board).slice(0,16);
const read=file=>JSON.parse(fs.readFileSync(path.join(out,file)));
const compact=r=>({total:r.total,rows:r.rows.map(c=>[c.steps.map(s=>[s.from,s.to,s.die]),c.equity,c.cubeless,...c.probabilities])});
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost').pathname;
 if(url==='/book-worker.mjs'){res.setHeader('Content-Type','text/javascript');return res.end(worker);}
 if(url==='/')return res.end('<!doctype html><title>Continuation book generation</title>');
 const f=path.resolve(root,'.'+url);if(!f.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.json':'application/json'})[path.extname(f)]||'text/html');
 fs.readFile(f,(e,b)=>{if(e)res.writeHead(404);res.end(e?'Not found':b);});
});
(async()=>{
 const {ENGINE_VERSION}=await import('../engine/metadata.mjs');
 const {BOOK_ID}=await import('../engine/opening-book.mjs');
 const {thirdBranches,fourthBranches,CONTINUATION_POLICY}=await import('./book-branches.mjs');
 const index=read('index.json');
 if(index.engine!==ENGINE_VERSION||index.plies!==3)throw Error('Rebuild the opening book first.');
 for(const [p,digest] of Object.entries(index.provenance.assets)){
  if(hash(fs.readFileSync('backgammon/'+p))!==digest||hash(fs.readFileSync(path.join(root,'backgammon',p)))!==digest)throw Error('Native input mismatch: '+p);
 }
 // Header/timestamp changes do not invalidate genuine identical source scores.
 const base={engine:index.engine,settings:index.settings,openings:index.openings,replies:Object.fromEntries(Object.entries(index.replies).map(([board,ref])=>[board,read(ref.file).rolls]))};
 const signature=hash(JSON.stringify({base,worker,policy:CONTINUATION_POLICY,planner:fs.readFileSync('backgammon/scripts/book-branches.mjs','utf8'),assets:index.provenance.assets}));
 let progress=fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint)):null;
 if(progress&&progress.signature!==signature)throw Error('Checkpoint input mismatch; move the old checkpoint before rebuilding.');
 progress??={signature,startedAt:new Date().toISOString(),boards:{}};
 fs.mkdirSync(path.dirname(checkpoint),{recursive:true});
 const save=()=>{fs.writeFileSync(checkpoint+'.tmp',JSON.stringify(progress));fs.renameSync(checkpoint+'.tmp',checkpoint);};
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await launchQuietBrowser(chromium);
 try{
  const tabs=await Promise.all(Array.from({length:workers},async()=>{
   const tab=await browser.newPage({serviceWorkers:'block'});await tab.goto(`http://127.0.0.1:${server.address().port}/`);
   await tab.evaluate(()=>new Promise((resolve,reject)=>{window.bookWorker=new Worker('/book-worker.mjs',{type:'module'});bookWorker.onmessage=e=>e.data.ready?resolve():reject(Error(e.data.error));bookWorker.onerror=e=>reject(Error(e.message));}));return tab;
  }));
  async function build(branches,turn){
   const jobs=[];for(const b of branches){const key=id(b.board);progress.boards[key]??={};for(let a=1;a<=6;a++)for(let c=1;c<=a;c++){const roll=`${a}${c}`;if(!progress.boards[key][roll])jobs.push({key,roll,state:{...b.state,dice:[a,c]}});}}
   console.log(`Turn ${turn}: ${branches.length} boards, ${jobs.length} uncached decisions`);
   await Promise.all(tabs.map(async tab=>{while(jobs.length){const {key,roll,state}=jobs.shift();const result=await tab.evaluate(state=>new Promise((resolve,reject)=>{bookWorker.onmessage=({data})=>data.error?reject(Error(data.error)):resolve(data);bookWorker.onerror=e=>reject(Error(e.message));bookWorker.postMessage({state,opening:false});}),state);
    progress.boards[key][roll]=result;save();if(jobs.length%20===0)console.log(`turn ${turn} · ${jobs.length} remaining · ${Math.round(result.elapsedMs)} ms`);
   }}));
  }
  const third=thirdBranches(index,read);await build(third,3);
  const rolls=board=>Object.fromEntries(Object.entries(progress.boards[id(board)]).map(([roll,r])=>[roll,compact(r)]));
  const fourth=fourthBranches(third,rolls);await build(fourth,4);
  index.id=BOOK_ID;index.continuations={};
  for(const [board,ref] of Object.entries(index.replies)){
   const shard=read(ref.file);shard.id=index.id;const body=JSON.stringify(shard)+'\n';fs.writeFileSync(path.join(out,ref.file),body);ref.sha256=hash(body);
  }
  for(const [turn,branches] of [[3,third],[4,fourth]])for(const b of branches){
   const file=`turn-${id(b.board)}.json`,body=JSON.stringify({schema:1,id:index.id,engine:index.engine,board:b.board,rolls:rolls(b.board)})+'\n';
   fs.writeFileSync(path.join(out,file),body);
   index.continuations[b.board]={file,sha256:hash(body),turn,weight:b.weight,parent:b.parent};
  }
  index.continuationBuild={policy:CONTINUATION_POLICY,selection:'Fair dice, best-ranked book moves, deduplicated board probability; lexical tie break. Fourth-turn ranking is conditional on the selected third-turn branches.',thirdMass:third.reduce((n,b)=>n+b.weight,0),fourthMass:fourth.reduce((n,b)=>n+b.weight,0),generator:'backgammon/scripts/build-continuation-book.cjs',signature,builtAt:new Date().toISOString()};
  const kept=new Set(Object.values(index.continuations).map(r=>r.file));for(const file of fs.readdirSync(out))if(/^turn-[a-f0-9]{16}\.json$/.test(file)&&!kept.has(file))fs.unlinkSync(path.join(out,file));
  fs.writeFileSync(path.join(out,'index.json'),JSON.stringify(index)+'\n');progress.finishedAt=new Date().toISOString();save();
  console.log(JSON.stringify({published:Object.keys(index.continuations).length,thirdMass:index.continuationBuild.thirdMass,fourthMass:index.continuationBuild.fourthMass}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
