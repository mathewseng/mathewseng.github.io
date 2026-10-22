const assert=require('node:assert/strict');
module.exports=async function(browser,base){
 const page=await browser.newPage({viewport:{width:375,height:812},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base+'/poker/video-poker/');await page.waitForFunction(()=>!document.querySelector('option[value=cribbage7-net-double]').disabled);
  await page.locator('#game-picker-open').tap();await page.locator('[data-family="Cribbage"]').tap();
  assert.equal(await page.locator('.cribbage-grid tbody tr').count(),4);assert.equal(await page.locator('.cribbage-choice').count(),16);
  for(const size of [{width:320,height:640},{width:375,height:812},{width:430,height:932}]){
   await page.setViewportSize(size);
   const rows=await page.locator('.cribbage-grid tbody tr').evaluateAll(es=>es.map(row=>[...row.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right};})));
   for(const row of rows){assert.equal(row.length,4);for(let i=0;i<4;i++){assert.ok(row[i].width>=44&&row[i].height>=44,JSON.stringify(row[i]));assert.ok(row[i].x>=0&&row[i].right<=size.width);assert.ok(Math.abs(row[i].y-row[0].y)<1);if(i)assert.ok(row[i].x>=row[i-1].right);}}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await page.setViewportSize({width:375,height:812});
  await page.locator('[data-game="cribbage4"]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>document.activeElement.dataset.game),'cribbage4-double');await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.dataset.game),'cribbage5-double');await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>document.activeElement.dataset.game),'cribbage5');await page.keyboard.press('ArrowUp');assert.equal(await page.evaluate(()=>document.activeElement.dataset.game),'cribbage4');
  const keys=await page.locator('.cribbage-choice').evaluateAll(es=>es.map(e=>e.dataset.game));
  for(const key of keys){
   await page.locator(`[data-game="${key}"]`).tap();assert.equal(await page.locator('#variant').inputValue(),key);assert.equal(await page.locator('#rule-double').inputValue(),String(key.endsWith('-double')));assert.equal(await page.locator('#rule-cribbage-payout').inputValue(),key.includes('-net')?'net':'return');
   assert.equal(await page.locator('#pnl').textContent(),'0');
   await page.locator('#game-picker-open').tap();assert.equal(await page.locator('[data-family="Cribbage"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.cribbage-choice[aria-pressed="true"]').getAttribute('data-game'),key);assert.equal(await page.locator('.cribbage-selected').count(),1);
  }
  await page.locator('#game-search').fill('7 cards');assert.equal(await page.locator('.cribbage-grid tbody tr').count(),1);assert.equal(await page.locator('.cribbage-choice').count(),4);
  await page.locator('#game-search').fill('2x');assert.equal(await page.locator('.cribbage-choice').count(),8);assert.equal(await page.locator('.cribbage-filtered').count(),8);
  await page.locator('#game-search').fill('');await page.locator('[data-game="cribbage5-net-double"]').tap();await page.locator('#game-picker-open').tap();
  await page.screenshot({path:'/tmp/video-poker-cribbage-grid-mobile.png',animations:'disabled'});
  await page.setViewportSize({width:1440,height:900});await page.screenshot({path:'/tmp/video-poker-cribbage-grid-desktop.png',animations:'disabled'});
  assert.deepEqual(errors,[]);console.log('Cribbage grid passed: 16 mobile selections, four aligned columns at 320/375/430px, selected states, mode routing, automatic Cribbage filter, search and spatial arrow keys.');
 }finally{await page.close();}
};
