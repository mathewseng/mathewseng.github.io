// Actual assembled files, three browser engines, warm lookup timing and live
// GNUbg cross-checks. Uses quiet browsers; no phone hardware claims.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),os=require('node:os');
const browsers=require('playwright'),{launchQuietBrowser}=require('../../scripts/quiet-browser.cjs');
const root=path.resolve('_site'),out=path.resolve(process.env.BG_BOOK_OUTPUT||'backgammon/test-results/opening-book');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{let url=new URL(req.url,'http://localhost').pathname;if(url.endsWith('/'))url+='index.html';const file=path.resolve(root,'.'+url);
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.json':'application/json','.css':'text/css'})[path.extname(file)]||'text/html');
 fs.readFile(file,(e,b)=>{if(e)res.writeHead(404);res.end(e?'Not found':b);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,report={environment:{cpu:os.cpus()[0].model,os:`${os.platform()} ${os.release()} ${os.arch()}`},method:'Local HTTP; native WASM served from _site. Warm lookup timings exclude shard transfer, include validation and client dispatch, one observation for every covered decision. Browser emulation, not real phone measurements.',browsers:[]};
 try{for(const name of (process.env.BG_BROWSERS||'chromium,firefox,webkit').split(',')){
  const browser=await launchQuietBrowser(browsers[name]);
  try{const page=await browser.newPage({serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/backgammon/');
   const measured=await page.evaluate(async()=>{
    const r=await import('/backgammon/core/rules.mjs'),{EngineClient}=await import('/backgammon/engine/client.mjs'),{OpeningBook}=await import('/backgammon/engine/opening-book.mjs');
    const s=r.initialState({phase:'move',dice:[3,1],matchLength:0,rules:{jacoby:true}}),book=new OpeningBook(),client=new EngineClient({openingBook:book,workerFactory:()=>{throw Error('Book created WASM worker');}});
    const check=(b,m)=>{if(!b)throw Error(m);},start=performance.now(),first=await client.analyze(s,{preset:'auto'}),firstLookupMs=performance.now()-start;
    check(first.book&&first.settings.plies===3,'No opening book result');
    const idx=await book.load('index.json'),cases=Object.keys(idx.openings).map(roll=>({...s,dice:[...roll].map(Number)})),samples=[];
    for(const board of Object.keys({...idx.replies,...idx.continuations})){const v=board.split(',').map(Number),reply={...s,points:v.slice(0,24),bar:v.slice(24,26),off:v.slice(26)};for(let a=1;a<=6;a++)for(let b=1;b<=a;b++)cases.push({...reply,dice:[a,b]});}
    try{for(const state of cases){await book.prepare(state);client.cache.clear();const begin=performance.now(),answer=await client.analyze(state,{preset:'auto'});samples.push(performance.now()-begin);check(answer.book,'Missing reply');check(answer.positionKey===r.positionKey(state),'Wrong identity');check(r.boardKey(r.commitTurn(state,answer.candidates[0].steps))===answer.candidates[0].key,'Illegal book move');}
     const sorted=[...samples].sort((a,b)=>a-b);window.bookCases=cases;window.bookIndex=idx;
     return {bookId:idx.id,firstLookupMs,n:samples.length,medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:sorted.at(-1),samples};
    }finally{client.destroy();}
   });
   assert.equal(measured.n,28659);
   const native=await page.evaluate(async()=>{
    const {EngineClient}=await import('/backgammon/engine/client.mjs'),{initialState}=await import('/backgammon/core/rules.mjs');
    const {boardKey}=await import('/backgammon/core/rules.mjs');
    const later=turn=>bookCases.find(s=>bookIndex.continuations[boardKey(s)]?.turn===turn);
    const third=bookCases.filter(s=>bookIndex.continuations[boardKey(s)]?.turn===3);
    const sampleThird=[third[Math.floor(third.length*.25)],third[Math.floor(third.length*.5)],third[Math.floor(third.length*.75)],third.at(-1)];
    const client=new EngineClient(),rows=[],fixtures=[bookCases[1],bookCases[8],bookCases[14],bookCases[25],bookCases[35],bookCases[728],later(3),{...later(3),dice:[6,6]},later(4),{...later(4),dice:[4,2]},...sampleThird];
    const mirror=s=>({...s,turn:1-s.turn,points:[...s.points].reverse().map(n=>-n),bar:[...s.bar].reverse(),off:[...s.off].reverse()});
    try{
     for(let i=0;i<fixtures.length;i++){
      const source={...(i%2?mirror(fixtures[i]):fixtures[i]),cube:{value:[1,2,4,64,1024][i%5],owner:null}};
      const book=await client.analyze(source,{preset:'expert'}),chosen=book.candidates[0],live=await client.analyze(source,{preset:'expert',submitted:chosen.steps,useBook:false});
      if(live.book||live.settings.plies!==3||!client.worker)throw Error('Native cross-check did not run live 3-ply WASM');
      const pairs=[[chosen.equity,live.actual.equity],[chosen.cubeless,live.actual.cubeless],...chosen.probabilities.map((p,j)=>[p,live.actual.probabilities[j]])];
      const difference=Math.max(...pairs.map(([a,b])=>Math.abs(a-b)));
      if(difference>1e-5)throw Error('Book/native mismatch '+difference);
      rows.push({dice:source.dice,turn:source.turn,cube:source.cube.value,stage:book.book.stage,notation:chosen.notation,difference,liveMs:live.elapsedMs});
     }
     for(const change of [{matchLength:5,rules:{cube:true,jacoby:false}}, {rules:{cube:true,jacoby:false}}, {rules:{cube:true,jacoby:true,immediateRedoubles:1}}, {cube:{value:2,owner:0}}]){
      const result=await client.analyze(initialState({...bookCases[1],...change}),{preset:'quick'});
      if(result.book||result.settings.plies!==0)throw Error('Incompatible context used book');
     }
     return rows;
    }finally{client.destroy();}
   });
   // Direct Solver links find later-turn entries on both desktop and phone.
   const later=await page.evaluate(()=>[3,4].map(turn=>{
    const board=Object.keys(bookIndex.continuations).find(b=>bookIndex.continuations[b].turn===turn),v=board.split(',').map(Number);
    return {...bookCases[1],points:v.slice(0,24),bar:v.slice(24,26),off:v.slice(26),dice:[3,1]};
   }));
   for(const [i,state] of later.entries())for(const viewport of [{width:1366,height:768},{width:390,height:844}]){
    const url=await page.evaluate(async s=>{const {shareURL}=await import('/backgammon/core/xgid.mjs');return shareURL(s);},state);
    // shareURL differs only in its hash. Start a new document so this measures
    // direct navigation, rather than retaining the previous page's open drawer.
    await page.goto('about:blank');await page.setViewportSize(viewport);await page.goto(url);
    await page.waitForFunction(turn=>document.querySelector('#analyze')?.textContent==='Analyze'&&document.body.textContent.includes(`precomputed opening book (turn ${turn})`),i+3);
    if(viewport.width<600)await page.locator('#panel-toggle').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`${out}/${name}-turn${i+3}-solver-${viewport.width}.png`,fullPage:true,animations:'disabled'});
   }
   // The actual Play bot consumes the book result and commits the legal turn.
   const id=await page.evaluate(async initial=>{
    const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
    const id=crypto.randomUUID();
    st.saveSettings({motion:'reduce',moveFeedback:false});
    await st.put('work',{id:'play',game:{id,initial,state:initial,events:[],started:true,names:['GNUbg','You'],config:{mode:'computer',humanSide:1,strength:'quick',reviewStrength:'deep',matchLength:0,rules:initial.rules}},draft:[],positionKey:r.positionKey(initial)});
    return id;
   },later[0]);
   await page.goto(base+'/backgammon/play/#resume='+id);
   // waitForFunction treats an async predicate's Promise as truthy before its
   // IndexedDB result is available. Await each read and keep the matching event.
   let played;
   const until=Date.now()+30000;
   while(!played&&Date.now()<until){
    played=await page.evaluate(async id=>{
     const st=await import('/backgammon/core/storage.mjs'),work=await st.get('work','play');
     return work?.game?.id===id&&work.game.events.find(e=>e.action.type==='move'&&e.evaluation?.result?.book)?.evaluation.result;
    },id);
    if(!played)await page.waitForTimeout(30);
   }
   assert.ok(played,'Bot did not commit a book move within 30 seconds');
   assert.equal(played.book.stage,'third-turn');assert.equal(played.settings.plies,3);
   await page.screenshot({path:`${out}/${name}-play-390.png`,fullPage:true,animations:'disabled'});
   if(name==='chromium') {
    const offline=await browser.newContext(),tab=await offline.newPage();
    try {
     await tab.goto(base+'/backgammon/');
     await tab.evaluate(async()=>{await navigator.serviceWorker.register('/backgammon/sw.js',{scope:'/backgammon/'});await navigator.serviceWorker.ready;});
     await tab.reload();await tab.waitForFunction(()=>!!navigator.serviceWorker.controller);
     const warm=await tab.evaluate(async positions=>{
      const {EngineClient}=await import('/backgammon/engine/client.mjs');
      const e=new EngineClient({workerFactory:()=>{throw Error('Offline book should not load WASM');}});
      try {const entries=[];for(const [i,state] of positions.entries()){
       const answer=await e.analyze(state,{preset:'auto'});
       if(answer.book.stage!==['third-turn','fourth-turn'][i])throw Error('Missing offline entry');
       entries.push({state,key:answer.candidates[0].key});
      }return entries;
      }finally{e.destroy();}
     },later);
     await offline.setOffline(true);await tab.reload();
     const keys=await tab.evaluate(async entries=>{
      const {EngineClient}=await import('/backgammon/engine/client.mjs');
      const e=new EngineClient({workerFactory:()=>{throw Error('Offline book should not load WASM');}});
      try {const keys=[];for(const entry of entries)keys.push((await e.analyze(entry.state,{preset:'auto'})).candidates[0].key);return keys;}
      finally{e.destroy();}
     },warm);
     assert.deepEqual(keys,warm.map(entry=>entry.key));
    } finally {await offline.close();}
   }
   assert.deepEqual(errors,[]);report.browsers.push({name,version:browser.version(),...measured,native});console.log(name,JSON.stringify({...measured,samples:undefined,native}));
  }finally{await browser.close();}
 }
 fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
 }finally{server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
