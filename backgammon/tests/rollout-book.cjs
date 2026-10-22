const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function(browser,base,out,name){
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1366,height:1000},reducedMotion:'reduce'}),page=await context.newPage();
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 let measured;
 try{
  await page.goto(base+'/backgammon/');
  measured=await page.evaluate(async()=>{
   const {EngineClient}=await import('/backgammon/engine/client.mjs'),r=await import('/backgammon/core/rules.mjs');
   const {shareURL}=await import('/backgammon/core/xgid.mjs');
   const index=await(await fetch('/backgammon/engine/opening-book-data/rollout/index.json')).json();
   const {OpeningBook}=await import('/backgammon/engine/opening-book.mjs');
   const {rolloutBookResult,ROLLOUT_BOOK_LIVE_POLICY_REVISION}=await import('/backgammon/engine/rollout-book.mjs');
   if(ROLLOUT_BOOK_LIVE_POLICY_REVISION!==null)throw Error('Affected rollout policy became live');
   const client=new EngineClient({workerFactory:()=>{throw Error('Stored direct fallback started WASM');}});
   const direct=new OpeningBook({preferDeep:true}),states=[],depths={},screening={full:0,screened:0};
   try{
    for(const [board,rolls]of Object.entries(index.entries))for(const [roll,entry]of Object.entries(rolls)){
     const v=board.split(',').map(Number),s={...r.initialState({matchLength:0,phase:'move',dice:[...roll].map(Number),rules:{cube:true,jacoby:true,immediateRedoubles:0}}),points:v.slice(0,24),bar:v.slice(24,26),off:v.slice(26)};
     const historical=rolloutBookResult(s,entry,index,'auto');
     if(historical.method!=='rollout'||historical.settings.trials!==entry.samples||historical.candidates.some(c=>!Number.isFinite(c.standardError)))throw Error('Historical source is no longer parsable');
     const result=await client.analyze(s,{preset:'auto'}),expected=await direct.lookup(s,{preset:'auto',kind:'checker'});
     if(result.method==='rollout'||result.book?.id===index.id||result.status!=='complete'||![3,5].includes(result.settings.plies)||result.settings.trials||result.candidates.some(c=>c.standardError!==undefined||c.samples!==undefined))throw Error('Retired policy leaked into live analysis');
     if(result.book?.id!==expected.book.id||result.settings.plies!==expected.settings.plies||JSON.stringify(result.candidates)!==JSON.stringify(expected.candidates))throw Error('Fallback differs from direct tree evaluations');
     const total=r.legalTurns(s).length;
     if(result.screening){if(result.screening.total!==total||result.screening.finalists!==result.candidates.length)throw Error('Misleading screened coverage');screening.screened++;}
     else{if(result.candidates.length!==total)throw Error('Incomplete unscreened comparison');screening.full++;}
     const actual=result.candidates.at(-1),grade=await client.analyze(s,{preset:'auto',submitted:actual.steps});
     if(grade.method==='rollout'||grade.settings.plies!==result.settings.plies||grade.actual.key!==actual.key||Math.abs(grade.error-(result.candidates[0].equity-actual.equity))>1e-9)throw Error('Mixed-method grade');
     depths[result.settings.plies]=(depths[result.settings.plies]||0)+1;states.push(s);
    }
    const hint=await client.analyze(states[0],{preset:'auto'});
    return {id:index.id,positions:states.length,samples:index.provenance.positions,depths,screening,states,solverURL:shareURL(states[0]),solverPolicy:hint.settings.name};
   }finally{client.destroy();}
  });
  assert.equal(measured.positions,measured.samples);assert.equal(measured.positions,66);
  assert.deepEqual(measured.depths,{5:66});assert.deepEqual(measured.screening,{full:15,screened:51});
  for(const width of [1366,390]){
   await page.setViewportSize({width,height:900});await page.goto(measured.solverURL);
   await page.waitForFunction(policy=>document.querySelector('#analyze')?.textContent==='Analyze'&&document.body.textContent.includes(policy),measured.solverPolicy);
   if(width<600)await page.locator('#panel-toggle').click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:path.join(out,`${name}-rollout-book-solver-${width}.png`),fullPage:true});
   await page.goto(base+'/backgammon/openings/');await page.locator('#opening-method').filter({hasText:'XG'}).waitFor();
   assert.ok(await page.locator('.opening-interval').count()>0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.locator('#openings').screenshot({path:path.join(out,`${name}-rollout-book-guide-${width}.png`)});
  }
  await page.goto(base+'/backgammon/reports/#rollout-accuracy');
  await page.locator('#rollout-accuracy-content table').first().waitFor();
  assert.equal(await page.locator('#rollout-accuracy-content table').count(),2);
  assert.equal(await page.locator('#rollout-accuracy-content table').nth(1).locator('tbody tr').count(),15);
  await page.getByLabel('Rollout comparison positions',{exact:true}).selectOption('reply-disagreement');
  assert.equal(await page.locator('#rollout-accuracy-content table').nth(1).locator('tbody tr').count(),39);
  await page.getByLabel('Rollout comparison positions',{exact:true}).selectOption('opening');
  assert.equal(await page.locator('#rollout-accuracy-content .error').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#rollout-accuracy').screenshot({path:path.join(out,`${name}-rollout-comparison-mobile.png`)});
  await page.setViewportSize({width:1366,height:1000});
  await page.locator('#rollout-accuracy').screenshot({path:path.join(out,`${name}-rollout-comparison-desktop.png`)});
  assert.equal(requests.filter(u=>/\/engine\/vendor\/|\/engine\/worker/.test(u)).length,0,'stored fallbacks never start WASM');
  // Missing deep assets use three-ply tables where available; the two absent
  // positions receive a complete real live grade instead of retired estimates.
  await context.route('**/opening-book-data/deep/**',route=>route.abort());
  await context.route('**/opening-book-data/rollout/index.json',route=>route.abort());
  const fallback=await page.evaluate(async states=>{
   const {EngineClient}=await import('/backgammon/engine/client.mjs');
   const {OpeningBook}=await import('/backgammon/engine/opening-book.mjs');
   const c=new EngineClient({workerFactory:()=>{throw Error('Missing deep book started WASM despite three-ply coverage');}}),direct=new OpeningBook();
   try{let count=0,liveCount=0;for(const state of states){
    const expected=await direct.lookup(state,{preset:'auto',kind:'checker'});
    if(!expected){
     const live=new EngineClient();
     try{const result=await live.analyze(state,{preset:'standard'}),{legalTurns}=await import('/backgammon/core/rules.mjs');
      if(result.book||result.method==='rollout'||result.settings.plies!==1||!live.worker||result.candidates.length!==legalTurns(state).length)throw Error('Absent book did not receive a complete live grade');
      const actual=result.candidates.at(-1),grade=await live.analyze(state,{preset:'standard',submitted:actual.steps});
      if(grade.actual.key!==actual.key||Math.abs(grade.error-(result.candidates[0].equity-actual.equity))>1e-9)throw Error('Mixed live fallback grade');
      liveCount++;
     }finally{live.destroy();}
     continue;
    }
    const actual=await c.analyze(state,{preset:'auto'});
    if(actual.method==='rollout'||actual.settings.plies!==3||actual.book.id!==expected.book.id||JSON.stringify(actual.candidates)!==JSON.stringify(expected.candidates))throw Error('Wrong three-ply fallback');
    count++;
   }return {threePly:count,live:liveCount};}finally{c.destroy();}
  },measured.states);
  assert.deepEqual(fallback,{threePly:64,live:2});
  await context.unroute('**/opening-book-data/deep/**');
  await context.route('**/opening-book-data/xg/index.json',route=>route.abort());
  await page.goto(base+'/backgammon/openings/');
  await page.locator('#opening-method').filter({hasText:'GNUbg · 5 ply'}).waitFor();
  assert.equal(await page.locator('.opening-interval').count(),0,'tree fallback must not invent sampling intervals');
  assert.ok((await page.locator('#opening-position-note').textContent()).includes('GNUbg fallback · beavers off'));
  assert.ok(requests.some(u=>/\/engine\/vendor\/|\/engine\/worker/.test(u)),'missing direct data exercises the real engine');
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
 if(name==='chromium'){
  const offline=await browser.newContext({serviceWorkers:'allow'}),tab=await offline.newPage();
  try{
   await tab.goto(base+'/backgammon/');
   await tab.evaluate(async()=>{await navigator.serviceWorker.register('/backgammon/sw.js',{scope:'/backgammon/'});await navigator.serviceWorker.ready;});
   await tab.reload();
   await tab.waitForFunction(()=>!!navigator.serviceWorker.controller,{},{timeout:45000});
   const lookup=async states=>{
    const {EngineClient}=await import('/backgammon/engine/client.mjs');const c=new EngineClient({workerFactory:()=>{throw Error('Offline direct fallback started WASM');}});
    try{const rows=[];for(const s of states){const r=await c.analyze(s,{preset:'auto'});if(r.method==='rollout'||r.settings.plies!==5)throw Error('Offline source changed');rows.push({id:r.book.id,move:r.candidates[0].key,plies:r.settings.plies});}return rows;}finally{c.destroy();}
   };
   const online=await tab.evaluate(lookup,measured.states);await offline.setOffline(true);await tab.reload();
   assert.deepEqual(await tab.evaluate(lookup,measured.states),online);
  }finally{await offline.close();}
 }
 return {positions:measured.positions,id:measured.id,historicalParsable:true,retired:true,depths:measured.depths,screening:measured.screening,threePlyFallbackPositions:64,liveFallbackPositions:2,guideFallback:true,offline:name==='chromium'};
};
