const assert=require('node:assert/strict');
module.exports=async function(browser,base){
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base+'/poker/video-poker/');await page.waitForFunction(()=>!document.querySelector('option[value=cribbage7-net-double]').disabled);
  assert.ok(await page.locator('#variant').isHidden());await page.screenshot({path:'/tmp/video-poker-redesign-desktop.png'});
  await page.locator('#game-picker-open').click();assert.equal(await page.locator('#game-picker-open').getAttribute('aria-expanded'),'true');assert.ok(await page.locator('#game-search').evaluate(el=>el===document.activeElement));
  await page.locator('[data-family="All"]').click();assert.equal(await page.locator('.game-choice').count(),35);
  assert.deepEqual(await page.locator('#game-results h3').allTextContents(),['Custom variants','Cribbage','Classic','Bonus','Wild cards']);
  await page.waitForTimeout(180);await page.screenshot({path:'/tmp/video-poker-game-picker-desktop.png'});
  await page.locator('#game-search').fill('2-7');assert.equal(await page.locator('.game-choice').count(),2);await page.locator('#game-search').fill('2x');assert.equal(await page.locator('.game-choice').count(),10);await page.locator('#game-search').fill('');
  await page.locator('[data-family="Cribbage"]').click();assert.equal(await page.locator('.game-choice').count(),16);
  await page.locator('#game-search').fill('7 cards');assert.equal(await page.locator('.game-choice').count(),4);
  await page.locator('#game-search').fill('unknown game');assert.ok(await page.locator('#game-empty').isVisible());assert.equal(await page.locator('.game-choice').count(),0);
  await page.locator('#game-search').fill('7 cards');await page.locator('#game-search').press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.dataset.game),'cribbage7');await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.dataset.game),'cribbage7-net-double');await page.keyboard.press('Enter');
  assert.ok(await page.locator('#game-picker').isHidden());assert.equal(await page.locator('#variant').inputValue(),'cribbage7-net-double');assert.match(await page.locator('#game-current-name').textContent(),/7 cards.*2×.*Points/);assert.ok(await page.locator('#game-picker-open').evaluate(el=>el===document.activeElement));
  await page.locator('#deal').click();await page.locator('[data-card="0"]').click();const held=await page.locator('.card-slot.held').count();
  await page.locator('#game-picker-open').click();await page.locator('[data-game="cribbage7-net-double"]').focus();await page.keyboard.press('1');assert.equal(await page.locator('.card-slot.held').count(),held,'dialog keys never change the hand');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('#game-picker-open').getAttribute('aria-expanded')==='false');assert.equal(await page.locator('#game-picker-open').getAttribute('aria-expanded'),'false');assert.equal(await page.locator('.card-slot.held').count(),held);
  await page.locator('#game-picker-open').click();await page.locator('[data-game="cribbage7-net-double"]').click();assert.equal(await page.locator('.card-slot.held').count(),held,'choosing the current game preserves the hand');
  await page.locator('#game-picker-open').click();await page.mouse.click(5,5);assert.ok(await page.locator('#game-picker').isHidden());
  await page.setViewportSize({width:375,height:812});await page.locator('#game-picker-open').click();assert.ok(await page.locator('#game-picker-close').evaluate(el=>el===document.activeElement));await page.locator('[data-family="Cribbage"]').click();await page.screenshot({path:'/tmp/video-poker-game-picker-mobile.png'});
  const box=await page.locator('#game-picker').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=376);assert.ok(box.y>=0&&box.y+box.height<=813);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  for(const r of await page.locator('.game-choice').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height)))assert.ok(r>=44);
  await page.locator('[data-game="cribbage4-net"]').click();assert.equal(await page.locator('#variant').inputValue(),'cribbage4-net');assert.match(await page.locator('#global-status').textContent(),/Unfinished hand canceled/);
  await page.screenshot({path:'/tmp/video-poker-redesign-mobile.png',fullPage:true});
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#game-picker-open').click();assert.equal(await page.locator('#game-picker').evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.locator('#game-picker-close').focus();await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement.closest('#game-picker')!==null),'focus stays inside the dialog');
  assert.deepEqual(errors,[]);console.log('Game browser passed: all 35 choices, family grouping, search, empty state, keyboard navigation, focus restoration, backdrop/Escape, current-hand preservation, mobile sheet and reduced motion.');
 }finally{await page.close();}
};
