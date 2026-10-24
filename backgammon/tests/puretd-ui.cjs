const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function puretdUI(browser,base,out,name) {
 const context=await browser.newContext({viewport:{width:1366,height:800},serviceWorkers:'block',reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 try {
  await page.goto(base+'/backgammon/');
  const url=await page.evaluate(async()=>{
   const {initialState}=await import('/backgammon/core/rules.mjs'),{shareURL}=await import('/backgammon/core/xgid.mjs');
   return shareURL(initialState({phase:'move',dice:[3,1],matchLength:0,rules:{cube:true,jacoby:true,automaticDoubles:0,immediateRedoubles:0}}));
  });
  await page.goto(url);
  await page.waitForFunction(()=>document.querySelector('#analyze')?.textContent==='Analyze'&&document.querySelector('#panel .list-row'),null,{timeout:60000});
  await page.getByText('Analysis settings',{exact:true}).click();
  await page.getByLabel('Analysis strength',{exact:true}).locator('[data-choice="puretd"]').click();
  const start=requests.length;await page.locator('#analyze').click();
  await page.waitForFunction(()=>document.querySelector('#analyze')?.textContent==='Analyze'&&document.querySelector('#panel')?.textContent.includes('PureTD money · 1 ply'),null,{timeout:60000});
  const text=await page.locator('#panel').innerText();
  assert.match(text,/does not produce win or gammon probabilities/);assert.match(text,/Model identity and search settings/);
  assert.ok(!text.includes('Cubeless equity'));assert.ok(!text.includes('NaN'));
  assert.ok(requests.slice(start).some(url=>url.endsWith('/puretd/money.bin')),'model actually loaded');
  assert.ok(!requests.slice(start).some(url=>/opening-book-data|xg-reference-data/.test(url)),'no reference substitution');
  await page.getByText('Analysis settings',{exact:true}).click();
  await page.getByLabel('Analysis strength',{exact:true}).locator('[data-choice="puretd-wide"]').click();
  await page.locator('#analyze').click();
  await page.waitForFunction(()=>document.querySelector('#analyze')?.textContent==='Analyze'&&document.querySelector('#panel')?.textContent.includes('PureTD wide · 1 ply'),null,{timeout:60000});
  assert.ok(requests.some(url=>url.endsWith('/puretd/money-wide.bin')),'wide model actually loaded');
  await page.getByText('Analysis method & limits',{exact:true}).click();
  const explanation=page.getByText('PureTD wide · independent learned',{exact:false});await explanation.waitFor({state:'visible'});
  assert.match(await explanation.innerText(),/No imported opening values or equity correction/);
  const screenshots=[];
  for(const [width,height] of [[1366,800],[390,844]]) {
   await page.setViewportSize({width,height});
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   if(width<1000)await page.locator('#panel-toggle').click();
   if(!await explanation.isVisible())await page.getByText('Analysis method & limits',{exact:true}).click();
   await explanation.scrollIntoViewIfNeeded();
   const geometry=await explanation.evaluate(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,overflow:document.documentElement.scrollWidth>innerWidth+1};});
   assert.ok(!geometry.overflow&&geometry.left>=-1&&geometry.right<=width+1&&geometry.top>=-1&&geometry.bottom<=height+1,JSON.stringify(geometry));
   const file=`${name}-puretd-${width}.png`;await page.screenshot({path:path.join(out,file),animations:'disabled'});screenshots.push(file);
  }
  // Exercise the production worker and queue, including forced scalar, grading,
  // cancellation/restart, and unsupported-state rejection before loading.
  const worker=await page.evaluate(async()=>{
   const {EngineClient}=await import('/backgammon/engine/client.mjs'),{AnalysisPanel}=await import('/backgammon/ui/analysis.mjs');
   const {initialState,legalTurns}=await import('/backgammon/core/rules.mjs');
   const state=initialState({phase:'move',dice:[3,1],matchLength:0,rules:{cube:true,jacoby:true,automaticDoubles:0,immediateRedoubles:0}});
   const e=new EngineClient({openingBook:null,workerFactory:()=>new Worker('/backgammon/engine/puretd-worker.mjs?backend=scalar',{type:'module'})});
   try {
    const first=await e.analyze(state,{preset:'standard'}),graded=await e.analyze(state,{preset:'standard',submitted:legalTurns(state).at(-1).steps});
    if(!graded.cached||!graded.actual)throw Error('grading did not reuse complete result');
    const pending=e.analyze({...state,dice:[6,6]},{preset:'standard'}).then(()=>{throw Error('cancellation resolved');},error=>error.name);
    e.cancel();if(await pending!=='AbortError')throw Error('wrong cancellation');
    const restarted=await e.analyze({...state,dice:[2,1]},{preset:'standard'});
    const panel=new AnalysisPanel();panel.preset='puretd';let rejected=false;
    try {await panel.analyzeRaw({...state,matchLength:7});}catch(error){rejected=/money play/.test(error.message);}
    if(!rejected||panel.moneyEngine.worker)throw Error('unsupported context loaded model');
    const cube=await panel.analyzeRaw({...state,phase:'roll',dice:[]});
    if(cube.type!=='cube'||!cube.engine.startsWith('gnubg-core/')||cube.settings.plies!==2||panel.moneyEngine.worker)
      throw Error('mixed checker/cube review must use labeled GNUbg cube analysis');
    panel.cancel();return {backend:first.backend,best:first.candidates[0].notation,engine:first.engine,restarted:restarted.status,unsupportedRejected:rejected,cubeEngine:cube.engine};
   } finally {e.destroy();}
  });
  assert.equal(worker.backend,'scalar');assert.equal(worker.restarted,'complete');assert.deepEqual(errors,[]);
  return {browser:name,worker,screenshots};
 } finally {await context.close();}
};
