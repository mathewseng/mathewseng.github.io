const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function(browser,base,out,name){
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1366,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));let measured;
 try{
  await page.goto(base+'/backgammon/openings/');
  await page.locator('#opening-method').filter({hasText:'XG'}).waitFor();
  assert.equal(await page.locator('nav[aria-label="Backgammon tools"] a[aria-current="page"]').textContent(),'Openings');
  measured=await page.evaluate(async()=>{
   const {EngineClient}=await import('/backgammon/engine/client.mjs'),r=await import('/backgammon/core/rules.mjs');
   const {shareURL}=await import('/backgammon/core/xgid.mjs'),index=await(await fetch('/backgammon/engine/opening-book-data/xg/index.json')).json();
   const c=new EngineClient({workerFactory:()=>{throw Error('Reference lookup started WASM');}});let positions=0,moves=0,first;
   try{for(const[board,rolls]of Object.entries(index.entries))for(const[roll,entry]of Object.entries(rolls)){
    const v=board.split(',').map(Number),s=r.initialState({matchLength:0,phase:'move',dice:[...roll].map(Number),rules:{cube:true,jacoby:true,immediateRedoubles:2},points:v.slice(0,24),bar:v.slice(24,26),off:v.slice(26)});
    first??=s;const result=await c.analyze(s,{preset:'auto'});
    if(positions===0){const storage=await import('/backgammon/core/storage.mjs');const item=storage.itemRecord('position',{title:'Reference save',state:s,analysis:result});await storage.put('items',item);const saved=await storage.get('items',item.id);if(saved.analysis.method!=='reference'||!saved.analysis.candidates[0].referenceCredit.author)throw Error('Reference failed to persist');}
    if(result.method!=='reference'||result.book.id!==index.id||result.reference.url!==entry.source)throw Error('Incorrect reference metadata');
    const last=result.candidates.at(-1),grade=await c.analyze(s,{preset:'auto',submitted:last.steps});
    if(grade.method!=='reference'||grade.actual.key!==last.key||Math.abs(grade.error-result.candidates[0].equity+last.equity)>1e-12)throw Error('Mixed-source grading');
    positions++;moves+=result.candidates.length;
   }return{positions,moves,state:first,solverURL:shareURL(first)};}finally{c.destroy();}
  });
  assert.ok(await page.getByLabel('XG contributors').textContent());
  assert.ok(await page.locator('#opening-moves').getByText(/XG ·/).count());
  assert.equal(measured.state.rules.immediateRedoubles,2);
  assert.equal(measured.positions,729);assert.equal(measured.moves,2584);
  for(const width of [1366,390]){
   await page.setViewportSize({width,height:900});await page.goto(measured.solverURL);
   await page.getByText('Imported XG reference',{exact:false}).waitFor({state:'attached'});
   if(width<600)await page.locator('#panel-toggle').click();
   assert.equal(await page.getByText(/null ply/).count(),0);
   assert.ok(await page.getByText(/By Neil Kazaross/).count());
   assert.ok(await page.getByRole('link',{name:'Published source',exact:true}).count());
   await page.screenshot({path:path.join(out,`${name}-xg-reference-solver-${width}.png`),fullPage:true});
  }
  // A bookmarked old fragment reaches the standalone tool, retaining its query.
  await page.goto(base+'/backgammon/?from=test#openings');
  await page.waitForURL('**/backgammon/openings/?from=test#openings');
  await page.locator('#opening-method').filter({hasText:'XG'}).waitFor();
  await page.screenshot({path:path.join(out,`${name}-xg-openings-page.png`),fullPage:true});
  await page.locator('#opening-rolls [data-roll="15"]').click();
  await page.getByRole('button',{name:/^24\/18\./}).click();
  await page.locator('#opening-next').click();
  await page.waitForFunction(()=>document.querySelector('#openings').dataset.mode==='reply'&&document.querySelector('#openings').dataset.loading==='false');
  assert.match(await page.locator('#opening-method').textContent(),/GNUbg.*5 ply/);
  assert.equal(await page.locator('#opening-source').isVisible(),false);
  const fallbackState=JSON.parse(new URLSearchParams(new URL(await page.locator('#opening-solver').getAttribute('href')).hash.slice(1)).get('state'));
  assert.equal(fallbackState.rules.immediateRedoubles,0);
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
 if(name==='chromium'){
  const context=await browser.newContext({serviceWorkers:'allow'}),page=await context.newPage();
  try{
   await page.goto(base+'/backgammon/openings/');await page.locator('#opening-method').filter({hasText:'XG'}).waitFor();
   await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();
   await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
   await page.locator('#opening-method').filter({hasText:'XG'}).waitFor();
   await context.setOffline(true);await page.reload();await page.locator('#opening-method').filter({hasText:'XG'}).waitFor();
   await page.locator('#opening-next').click();await page.waitForFunction(()=>document.querySelector('#openings').dataset.mode==='reply'&&document.querySelector('#openings').dataset.loading==='false');
   assert.match(await page.locator('#opening-method').textContent(),/XG/);
  }finally{await context.close();}
 }
 return{positions:729,moves:2584,ruleContextPreserved:true,offline:name==='chromium'};
};
