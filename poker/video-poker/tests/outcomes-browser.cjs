const chooseGame=require('./choose-game.cjs');
const assert=require('node:assert/strict'),report=require('../outcome-analysis.json');
module.exports=async function(browser,base){
 const page=await browser.newPage({viewport:{width:375,height:812},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base+'/poker/video-poker/');await page.waitForSelector('#outcome-chart tbody tr',{state:'attached'});await page.waitForFunction(()=>!document.querySelector('option[value=cribbage7-net-double]').disabled);
  await page.locator('[data-view=lab]').tap();
  const keys=await page.locator('#variant option').evaluateAll(es=>es.map(e=>e.value));assert.equal(keys.length,35);
  for(const key of keys){
   await chooseGame(page,key);
   const entry=report.entries.find(r=>r.id+(r.rules?.payout==='net'?'-net':'')+(r.doubleOnDraw?'-double':'')===key);
   assert.equal(await page.locator('#outcome-chart tbody tr').count(),entry.result.payouts.filter(r=>r.probability>1e-12).length,key);
   assert.equal(await page.locator('#outcome-summary strong').count(),4);
   assert.match(await page.locator('#outcome-note').textContent(),entry.result.estimated?/Estimated from/:/Exact across/);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile overflow: '+key);
  }
  await chooseGame(page,'cribbage4-net');
  await page.locator('#pay-fee').fill('20');await page.locator('#pay-form button[type=submit]').tap();
  assert.equal(await page.locator('#outcome-chart tbody tr').count(),0);assert.match(await page.locator('#outcome-note').textContent(),/Solve the game/);
  await page.locator('#solve-all').tap();await page.waitForFunction(()=>document.querySelector('#solve-status').textContent.startsWith('Complete.'),null,{timeout:30000});
  assert.ok(await page.locator('#outcome-chart tbody tr').count()>0);assert.match(await page.locator('#outcome-note').textContent(),/Exact across/);
  await page.locator('#best-pays').tap();await page.locator('.payout-frequency').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/video-poker-payout-frequency-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:900});await page.locator('.payout-frequency').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/video-poker-payout-frequency-desktop.png',fullPage:true});
  // Saved settlement edits from before the menu split migrate without overwriting capped settings.
  await page.evaluate(()=>{localStorage.setItem('video-poker-paytables-v2',JSON.stringify({cribbage5:{fee:77}}));localStorage.setItem('video-poker-rules-v2',JSON.stringify({cribbage5:{payout:'net',scoreCap:5}}));});
  await page.reload();await page.waitForFunction(()=>!document.querySelector('option[value=cribbage5-net]').disabled);await chooseGame(page,'cribbage5-net');assert.equal(await page.locator('#pay-fee').inputValue(),'77');assert.equal(await page.locator('#rule-cribbage-cap').inputValue(),'5');
  await chooseGame(page,'cribbage5');assert.notEqual(await page.locator('#pay-fee').inputValue(),'77');assert.equal(await page.locator('#rule-cribbage-payout').inputValue(),'return');
  assert.deepEqual(errors,[]);console.log('Payout charts passed: all 35 defaults, exact/estimated labels, mobile layout, edited-rule invalidation, worker recalculation and legacy net-mode migration.');
 }finally{await page.close();}
};
