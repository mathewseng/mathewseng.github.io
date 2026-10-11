// Actual assembled files, three browser engines, warm lookup timing and live
// GNUbg cross-checks. Uses quiet browsers; no phone hardware claims.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),os=require('node:os');
const browsers=require('playwright'),{launchQuietBrowser}=require('../../scripts/quiet-browser.cjs');
const root=path.resolve('_site'),out=path.resolve(process.env.BG_BOOK_OUTPUT||'backgammon/test-results/opening-book');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{let url=new URL(req.url,'http://localhost').pathname;if(url.endsWith('/'))url+='index.html';const file=path.resolve(root,'.'+url);
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.json':'application/json','.css':'text/css'})[path.extname(file)]||'text/html');
 fs.readFile(file,(e,b)=>{if(e)res.writeHead(404);res.end(e?'Not found':b);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,report={environment:{cpu:os.cpus()[0].model,os:`${os.platform()} ${os.release()} ${os.arch()}`},method:'Local HTTP; native WASM served from _site. Warm lookup timings exclude shard transfer, include validation and client dispatch, one observation for each of 729 positions. Browser emulation, not real phone measurements.',browsers:[]};
 try{for(const name of (process.env.BG_BROWSERS||'chromium,firefox,webkit').split(',')){
  const browser=await launchQuietBrowser(browsers[name]);
  try{const page=await browser.newPage({serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/backgammon/');
   const measured=await page.evaluate(async()=>{
    const r=await import('/backgammon/core/rules.mjs'),{EngineClient}=await import('/backgammon/engine/client.mjs'),{OpeningBook}=await import('/backgammon/engine/opening-book.mjs');
    const s=r.initialState({phase:'move',dice:[3,1],matchLength:0,rules:{jacoby:true}}),book=new OpeningBook(),client=new EngineClient({openingBook:book,workerFactory:()=>{throw Error('Book created WASM worker');}});
    const check=(b,m)=>{if(!b)throw Error(m);},start=performance.now(),first=await client.analyze(s,{preset:'auto'}),firstLookupMs=performance.now()-start;
    check(first.book&&first.settings.plies===3,'No opening book result');
    const idx=await book.load('index.json'),cases=Object.keys(idx.openings).map(roll=>({...s,dice:[...roll].map(Number)})),samples=[];
    for(const board of Object.keys(idx.replies)){const v=board.split(',').map(Number),reply={...s,points:v.slice(0,24),bar:v.slice(24,26),off:v.slice(26)};for(let a=1;a<=6;a++)for(let b=1;b<=a;b++)cases.push({...reply,dice:[a,b]});}
    try{for(const state of cases){await book.prepare(state);client.cache.clear();const begin=performance.now(),answer=await client.analyze(state,{preset:'auto'});samples.push(performance.now()-begin);check(answer.book,'Missing reply');check(answer.positionKey===r.positionKey(state),'Wrong identity');check(r.boardKey(r.commitTurn(state,answer.candidates[0].steps))===answer.candidates[0].key,'Illegal book move');}
     const sorted=[...samples].sort((a,b)=>a-b);window.bookCases=cases;window.bookIndex=idx;
     return {firstLookupMs,n:samples.length,medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:sorted.at(-1),samples};
    }finally{client.destroy();}
   });
   const native=await page.evaluate(async()=>{
    const {EngineClient}=await import('/backgammon/engine/client.mjs'),{initialState}=await import('/backgammon/core/rules.mjs');
    const client=new EngineClient(),rows=[],fixtures=[bookCases[1],bookCases[8],bookCases[14],bookCases[25],bookCases[35],bookCases.at(-1)];
    const mirror=s=>({...s,turn:1-s.turn,points:[...s.points].reverse().map(n=>-n),bar:[...s.bar].reverse(),off:[...s.off].reverse()});
    try{
     for(let i=0;i<fixtures.length;i++){
      const source={...(i%2?mirror(fixtures[i]):fixtures[i]),cube:{value:[1,2,4,64,1024,1][i],owner:null}};
      const book=await client.analyze(source,{preset:'expert'}),chosen=book.candidates[0],live=await client.analyze(source,{preset:'expert',submitted:chosen.steps,useBook:false});
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
   // Solver loads the book immediately and exposes actual settings on desktop/phone.
   const url=await page.evaluate(async()=>{const {shareURL}=await import('/backgammon/core/xgid.mjs');return shareURL(bookCases[1]);});
   for(const viewport of [{width:1366,height:768},{width:390,height:844}]){
    await page.setViewportSize(viewport);await page.goto(url);
    await page.waitForFunction(()=>document.querySelector('#analyze')?.textContent==='Analyze'&&document.body.textContent.includes('precomputed opening book'));
    if(viewport.width<600)await page.locator('#panel-toggle').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`${out}/${name}-solver-${viewport.width}.png`,fullPage:true,animations:'disabled'});
   }
   // The actual Play bot consumes the book result and commits the legal turn.
   const id=await page.evaluate(async()=>{
    const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
    const initial=r.initialState({matchLength:0,phase:'move',dice:[3,1],rules:{jacoby:true}}),id=crypto.randomUUID();
    st.saveSettings({motion:'reduce',moveFeedback:false});
    await st.put('work',{id:'play',game:{id,initial,state:initial,events:[],started:true,names:['GNUbg','You'],config:{mode:'computer',humanSide:1,strength:'quick',reviewStrength:'deep',matchLength:0,rules:initial.rules}},draft:[],positionKey:r.positionKey(initial)});
    return id;
   });
   await page.goto(base+'/backgammon/play/#resume='+id);
   await page.waitForFunction(async()=>{
    const st=await import('/backgammon/core/storage.mjs'),work=await st.get('work','play');
    return work?.game?.events.some(e=>e.action.type==='move'&&e.evaluation?.result?.book);
   });
   const played=await page.evaluate(async()=>{const st=await import('/backgammon/core/storage.mjs');const work=await st.get('work','play');return work.game.events.find(e=>e.action.type==='move').evaluation.result;});
   assert.equal(played.book.stage,'opening');assert.equal(played.settings.plies,3);
   await page.screenshot({path:`${out}/${name}-play-390.png`,fullPage:true,animations:'disabled'});
   if(name==='chromium') {
    const offline=await browser.newContext(),tab=await offline.newPage();
    try {
     await tab.goto(base+'/backgammon/');
     await tab.evaluate(async()=>{await navigator.serviceWorker.register('/backgammon/sw.js',{scope:'/backgammon/'});await navigator.serviceWorker.ready;});
     await tab.reload();await tab.waitForFunction(()=>!!navigator.serviceWorker.controller);
     const warm=await tab.evaluate(async()=>{
      const {EngineClient}=await import('/backgammon/engine/client.mjs'),{initialState,commitTurn}=await import('/backgammon/core/rules.mjs');
      const e=new EngineClient({workerFactory:()=>{throw Error('Offline book should not load WASM');}});
      try {const s=initialState({matchLength:0,phase:'move',dice:[3,1],rules:{jacoby:true}}),first=await e.analyze(s,{preset:'auto'});
       const reply={...commitTurn(s,first.candidates[0].steps),turn:1,dice:[6,6]},answer=await e.analyze(reply,{preset:'auto'});
       return {reply,key:answer.candidates[0].key};
      }finally{e.destroy();}
     });
     await offline.setOffline(true);await tab.reload();
     const key=await tab.evaluate(async s=>{const {EngineClient}=await import('/backgammon/engine/client.mjs');const e=new EngineClient({workerFactory:()=>{throw Error('Offline book should not load WASM');}});try{return (await e.analyze(s,{preset:'auto'})).candidates[0].key;}finally{e.destroy();}},warm.reply);
     assert.equal(key,warm.key);
    } finally {await offline.close();}
   }
   assert.deepEqual(errors,[]);report.browsers.push({name,version:browser.version(),...measured,native});console.log(name,JSON.stringify({...measured,samples:undefined,native}));
  }finally{await browser.close();}
 }
 fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
 }finally{server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
