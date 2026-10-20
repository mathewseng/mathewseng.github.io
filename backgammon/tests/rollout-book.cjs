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
   const client=new EngineClient({workerFactory:()=>{throw Error('Stored rollout started WASM');}}),states=[];
   try{
    for(const [board,rolls]of Object.entries(index.entries))for(const [roll,entry]of Object.entries(rolls)){
     const v=board.split(',').map(Number),s={...r.initialState({matchLength:0,phase:'move',dice:[...roll].map(Number),rules:{cube:true,jacoby:true,immediateRedoubles:0}}),points:v.slice(0,24),bar:v.slice(24,26),off:v.slice(26)};
     const result=await client.analyze(s,{preset:'auto'});
     if(result.book?.id!==index.id||result.method!=='rollout'||result.settings.trials!==entry.samples||result.candidates.some(c=>!Number.isFinite(c.standardError)||c.samples!==entry.samples))throw Error('Stored source/uncertainty changed');
     const actual=result.candidates.at(-1),grade=await client.analyze(s,{preset:'auto',submitted:actual.steps});
     if(grade.method!=='rollout'||grade.actual.key!==actual.key||Math.abs(grade.error-(result.candidates[0].equity-actual.equity))>1e-9)throw Error('Mixed-method grade');
     states.push(s);
    }
    const hint=await client.analyze(states[0],{preset:'auto'}),missing=r.legalTurns(states[0]).find(t=>!hint.candidates.some(c=>c.key===t.key));
    if(!missing)throw Error('Expected a screened-out opening alternative');
    const fallback=await client.analyze(states[0],{preset:'auto',submitted:missing.steps});
    if(fallback.method==='rollout'||fallback.settings.plies!==5||!fallback.actual||fallback.candidates.length!==r.legalTurns(states[0]).length)throw Error('Unlisted opening must get one full five-ply comparison');
    if(Math.abs(fallback.error-(fallback.candidates[0].equity-fallback.actual.equity))>1e-9)throw Error('Mixed-method fallback loss');
    return {id:index.id,positions:states.length,samples:index.provenance.positions,states:[states[0],states.at(-1)],solverURL:shareURL(states[0])};
   }finally{client.destroy();}
  });
  assert.equal(measured.positions,measured.samples);
  for(const width of [1366,390]){
   await page.setViewportSize({width,height:900});await page.goto(measured.solverURL);
   await page.waitForFunction(()=>document.querySelector('#analyze')?.textContent==='Analyze'&&document.body.textContent.includes('Short/deep opening rollout'));
   if(width<600)await page.locator('#panel-toggle').click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:path.join(out,`${name}-rollout-book-solver-${width}.png`),fullPage:true});
   await page.goto(base+'/backgammon/#openings');await page.locator('#opening-method').filter({hasText:'Rollout'}).waitFor();
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
  await context.route('**/opening-book-data/rollout/index.json',route=>route.abort());
  const missing=await page.evaluate(async state=>{
   const {EngineClient}=await import('/backgammon/engine/client.mjs');
   const c=new EngineClient({workerFactory:()=>{throw Error('Missing rollout book started WASM despite five-ply coverage');}});
   try{const r=await c.analyze(state,{preset:'auto'});return {plies:r.settings.plies,method:r.method||'tree'};}finally{c.destroy();}
  },measured.states[0]);
  assert.equal(missing.method,'tree');assert.equal(missing.plies,5);
  assert.equal(requests.filter(u=>/\/engine\/vendor\/|\/engine\/worker/.test(u)).length,0);
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
    const {EngineClient}=await import('/backgammon/engine/client.mjs');const c=new EngineClient({workerFactory:()=>{throw Error('Offline stored rollout started WASM');}});
    try{const rows=[];for(const s of states){const r=await c.analyze(s,{preset:'auto'});rows.push({id:r.book.id,move:r.candidates[0].key,se:r.candidates[0].standardError});}return rows;}finally{c.destroy();}
   };
   const online=await tab.evaluate(lookup,measured.states);await offline.setOffline(true);await tab.reload();
   assert.deepEqual(await tab.evaluate(lookup,measured.states),online);
  }finally{await offline.close();}
 }
 return {positions:measured.positions,id:measured.id,uncertainty:true,missingBookFallback:true,offline:name==='chromium'};
};
