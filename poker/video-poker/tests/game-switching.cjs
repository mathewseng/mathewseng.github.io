const assert=require('node:assert/strict');
module.exports=async function checkGameSwitching(browser,base){
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.switchWorkers=[];
  window.Worker=class {
   constructor(){window.switchWorkers.push(this);}
   postMessage(message){this.message=message;}
   terminate(){this.terminated=true;}
  };
 });
 try{
  await page.goto(base+'/poker/video-poker/');
  await page.waitForFunction(()=>!document.querySelector('option[value="cribbage7-double"]').disabled);
  // Seed one settled hand so cancellation must preserve real session accounting.
  await page.locator('#deal').tap();await page.locator('#deal').tap();
  const pnl=await page.locator('#pnl').textContent(),history=await page.locator('#history-list').textContent();
  const keys=await page.locator('#variant option').evaluateAll(es=>es.map(e=>e.value));
  for(const key of keys){
   assert.ok(await page.locator('#variant').isEnabled(),`selector stays enabled before ${key}`);
   await page.locator('#variant').selectOption(key);
   assert.equal(await page.locator('#variant').inputValue(),key);
   assert.equal(await page.locator('#hand button').count(),0,'switch clears the unfinished deal');
   assert.equal(await page.locator('.strategy-row').count(),0);
   assert.equal(await page.locator('#pnl').textContent(),pnl);
   assert.equal(await page.locator('#history-list').textContent(),history);
   assert.equal(await page.locator('#hands-played').textContent(),'1');
   await page.locator('#deal').tap();await page.locator('[data-card="0"]').tap();
   assert.ok(await page.locator('#variant').isEnabled(),`unfinished ${key} must not lock switching`);
   await page.locator('#solve-hand').tap();
   assert.ok(await page.locator('#variant').isEnabled(),`solving ${key} must not lock switching`);
  }
  await page.locator('#variant').selectOption('jacks');
  assert.match(await page.locator('#global-status').textContent(),/Unfinished hand canceled/);
  assert.ok(await page.evaluate(()=>switchWorkers.every(w=>w.terminated)));
  // Even a callback already queued by an abandoned calculation must be ignored.
  await page.evaluate(()=>{for(const w of switchWorkers){w.onmessage({data:{id:w.message.id,progress:.9,stage:'STALE'}});w.onmessage({data:{id:w.message.id,result:[]}});w.onerror({message:'STALE ERROR'});}});
  assert.equal(await page.locator('.strategy-row').count(),0);
  assert.doesNotMatch(await page.locator('#strategy-status').textContent(),/STALE/);
  assert.doesNotMatch(await page.locator('#global-status').textContent(),/STALE/);
  assert.equal(await page.locator('#pnl').textContent(),pnl);
  assert.equal(await page.locator('#history-list').textContent(),history);
  assert.ok(await page.locator('#variant').isEnabled());
  assert.deepEqual(errors,[]);
  console.log('Game switching passed: all 27 choices remain available during hands and solves; cancellation preserves PnL/history and rejects stale callbacks.');
 }finally{await page.close();}
};
