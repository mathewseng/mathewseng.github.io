const assert=require('node:assert/strict');
module.exports=async function checkMobileResponse(browser,base){
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base+'/poker/video-poker/');
  await page.locator('#deal').tap();
  const initial=await page.evaluate(()=>{window.cardNodes=[...document.querySelectorAll('#hand button')];return {animation:getComputedStyle(document.querySelector('.card-slot')).animationName,transition:getComputedStyle(cardNodes[0]).transitionDuration,touch:getComputedStyle(cardNodes[0]).touchAction};});
  assert.equal(initial.animation,'none');assert.equal(initial.transition,'0s');assert.equal(initial.touch,'manipulation');
  if(browser.browserType().name()==='chromium'){
  const cdp=await page.context().newCDPSession(page);
  const point=async index=>{const box=await page.locator(`[data-card="${index}"]`).boundingBox();return {x:box.x+box.width/2,y:box.y+box.height/2,id:1};};
  const touch=(type,points=[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
  const held=index=>page.locator(`[data-card="${index}"]`).getAttribute('aria-pressed');
  // Assert while the finger is still down: a completed tap alone cannot detect this delay.
  await touch('touchStart',[await point(0)]);assert.equal(await held(0),'true');
  await touch('touchEnd');assert.equal(await held(0),'true','release must not toggle twice');
  await touch('touchStart',[await point(0)]);assert.equal(await held(0),'false');
  await touch('touchEnd');assert.equal(await held(0),'false');
  await touch('touchStart',[await point(0)]);assert.equal(await held(0),'true');
  await touch('touchCancel');assert.equal(await held(0),'false','canceled contact restores an unheld card');
  await page.locator('[data-card="0"]').tap();
  await touch('touchStart',[await point(0)]);assert.equal(await held(0),'false');
  await touch('touchCancel');assert.equal(await held(0),'true','canceled contact restores a held card');
  await page.locator('[data-card="0"]').tap();
  const start=await point(0);await touch('touchStart',[start]);
  await touch('touchMove',[{...start,y:start.y+40}]);assert.equal(await held(0),'false','scrolling rolls back the contact');
  await touch('touchEnd');assert.equal(await held(0),'false');
  const first=await point(0),second={...await point(1),id:2};
  await touch('touchStart',[first]);assert.equal(await held(0),'true');
  await touch('touchStart',[first,second]);assert.equal(await held(0),'false','multi-touch restores the original hold');
  await touch('touchEnd');assert.equal(await held(1),'false');
  // Mouse and keyboard retain native click activation on the same device.
  await page.locator('[data-card="0"]').click();assert.equal(await held(0),'true');
  await page.locator('[data-card="0"]').press('Space');assert.equal(await held(0),'false');
  }
  await page.evaluate(()=>{window.touchStates=[];document.addEventListener('pointerdown',e=>{const card=e.target.closest('[data-card]');if(card)touchStates.push(card.getAttribute('aria-pressed'));});});
  for(let i=0;i<5;i++){
   await page.locator(`[data-card="${i}"]`).tap();
   assert.equal(await page.locator(`[data-card="${i}"]`).getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('.card-slot.held').count(),i+1);
   assert.ok(await page.evaluate(()=>cardNodes.every((node,index)=>node===document.querySelector(`[data-card="${index}"]`))),'holding preserves every card node');
  }
  await page.locator('[data-card="0"]').tap();assert.equal(await page.locator('[data-card="0"]').getAttribute('aria-pressed'),'false');
  assert.deepEqual(await page.evaluate(()=>touchStates),['true','true','true','true','true','false'],'native taps change on contact in this browser');
  assert.equal(await page.locator('#pnl').textContent(),'0');assert.equal(await page.locator('#history-list li').count(),0);
  await page.locator('#deal').tap();assert.equal(await page.locator('#hands-played').textContent(),'1');
  assert.equal(await page.locator('#history-list li').count(),1);
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('.card-slot')].every(el=>getComputedStyle(el).animationName==='none')));
  // Starting another hand remains available while the first EV index is being built.
  await page.locator('#deal').tap();assert.equal(await page.locator('#hand button').count(),5);
  await page.locator('[data-card="2"]').tap();assert.equal(await page.locator('[data-card="2"]').getAttribute('aria-pressed'),'true');
  assert.deepEqual(errors,[]);console.log('Mobile response passed: stable card nodes, finger-down holds, release deduplication, scroll/cancel rollback, keyboard activation, no delayed reveal, one action per tap and playable during EV work.');
 }finally{await page.close();}
};
