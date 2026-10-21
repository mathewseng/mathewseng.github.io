const assert=require('node:assert/strict');
module.exports=async function checkMobileResponse(browser,base){
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base+'/poker/video-poker/');
  await page.locator('#deal').tap();
  const initial=await page.evaluate(()=>{window.cardNodes=[...document.querySelectorAll('#hand button')];return {animation:getComputedStyle(document.querySelector('.card-slot')).animationName,transition:getComputedStyle(cardNodes[0]).transitionDuration,touch:getComputedStyle(cardNodes[0]).touchAction};});
  assert.equal(initial.animation,'none');assert.equal(initial.transition,'0s');assert.equal(initial.touch,'manipulation');
  for(let i=0;i<5;i++){
   await page.locator(`[data-card="${i}"]`).tap();
   assert.equal(await page.locator(`[data-card="${i}"]`).getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('.card-slot.held').count(),i+1);
   assert.ok(await page.evaluate(()=>cardNodes.every((node,index)=>node===document.querySelector(`[data-card="${index}"]`))),'holding preserves every card node');
  }
  await page.locator('[data-card="0"]').tap();assert.equal(await page.locator('[data-card="0"]').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('#pnl').textContent(),'0');assert.equal(await page.locator('#history-list li').count(),0);
  await page.locator('#deal').tap();assert.equal(await page.locator('#hands-played').textContent(),'1');
  assert.equal(await page.locator('#history-list li').count(),1);
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('.card-slot')].every(el=>getComputedStyle(el).animationName==='none')));
  // Starting another hand remains available while the first EV index is being built.
  await page.locator('#deal').tap();assert.equal(await page.locator('#hand button').count(),5);
  await page.locator('[data-card="2"]').tap();assert.equal(await page.locator('[data-card="2"]').getAttribute('aria-pressed'),'true');
  assert.deepEqual(errors,[]);console.log('Mobile response passed: stable card nodes, immediate touch states, no delayed reveal, one action per tap and playable during EV work.');
 }finally{await page.close();}
};
