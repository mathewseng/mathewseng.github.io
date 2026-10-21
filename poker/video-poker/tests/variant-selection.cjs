const chooseGame=require('./choose-game.cjs');
const assert=require('node:assert/strict'),report=require('../analysis.json');
module.exports=async function checkVariantSelection(browser,base){
 const page=await browser.newPage();
 const ready=()=>page.waitForFunction(()=>!document.querySelector('#variant option[value="low27"]')?.disabled&&document.querySelectorAll('[data-recommend]').length===60);
 try{
  await page.goto(base+'/poker/video-poker/');await ready();await page.locator('[data-view="lab"]').click();
  const defaults=[['low27','low27-flat'],['low27-double','low27-double'],['badeucey','badeucey'],['badeucey-double','badeucey-double']];
  for(const [key,option]of defaults){
   const rec=report.recommendations.find(r=>r.key===option);
   assert.ok(report.recommendations.filter(r=>r.id===rec.id&&r.doubleOnDraw===rec.doubleOnDraw&&r.result.rtp<=1).every(r=>r.result.rtp<=rec.result.rtp));
   await chooseGame(page,key);
   assert.equal(await page.locator('#lab-rtp').textContent(),(rec.result.rtp*100).toFixed(4)+'%');
   for(const [category,value]of Object.entries(rec.pays))assert.equal(await page.locator('#pay-'+category).inputValue(),String(value));
   // Saved edits survive reload; the explicit best-table action restores the chosen recommendation.
   await page.locator('#pay-wheel').fill('40');await page.locator('#pay-form button[type="submit"]').click();
   await page.reload();await ready();await chooseGame(page,key);await page.locator('[data-view="lab"]').click();
   assert.equal(await page.locator('#pay-wheel').inputValue(),'40');
   await page.locator('#best-pays').click();
   assert.equal(await page.locator('#variant').inputValue(),key);
   assert.equal(await page.locator('#pay-wheel').inputValue(),String(rec.pays.wheel));
   assert.equal(await page.locator('#lab-rtp').textContent(),(rec.result.rtp*100).toFixed(4)+'%');
  }
  await page.evaluate(()=>localStorage.clear());
  // Legacy settings belong to the formerly selected stake mode.
  await page.addInitScript(()=>{if(location.protocol.startsWith('http')&&!sessionStorage.getItem('seeded')){
   localStorage.setItem('video-poker-paytables-v1',JSON.stringify({low27:{wheel:20},badeucey:{bad5:18}}));
   localStorage.setItem('video-poker-rules-v1',JSON.stringify({badeucey:{minBadugi:3}}));
   localStorage.setItem('video-poker-draw-rules-v1',JSON.stringify({low27:true,badeucey:true}));
   sessionStorage.setItem('seeded','true');
  }});
  await page.goto(base+'/poker/video-poker/');await ready();
  await page.locator('[data-view="lab"]').click();
  const modes=[['low27',false,12],['low27-double',true,20],['badeucey',false,15],['badeucey-double',true,18]];
  for(const [key,doubled,award]of modes){
   await chooseGame(page,key);
   assert.equal(await page.locator('#rule-double').inputValue(),String(doubled));
   assert.equal(await page.locator(key.startsWith('low27')?'#pay-wheel':'#pay-bad5').inputValue(),String(award));
   if(key.startsWith('badeucey'))assert.equal(await page.locator('#rule-min-badugi').inputValue(),doubled?'3':'4');
  }
  // Editing either stake mode never overwrites its counterpart.
  for(const [index,[key]]of modes.entries()){
   await chooseGame(page,key);
   await page.locator('#pay-wheel').fill(String(30+index));
   await page.locator('#pay-form button[type="submit"]').click();
   assert.equal(await page.locator('#variant').inputValue(),key);
  }
  await page.reload();await ready();await page.locator('[data-view="lab"]').click();
  for(const [index,[key,doubled]]of modes.entries()){
   await chooseGame(page,key);
   assert.equal(await page.locator('#pay-wheel').inputValue(),String(30+index));
   assert.equal(await page.locator('#rule-double').inputValue(),String(doubled));
   await page.locator('[data-view="play"]').click();const beforeHand=await page.locator('#pnl').textContent();await page.locator('#deal').click();
   assert.equal(await page.locator('#pnl').textContent(),beforeHand);assert.ok(await page.locator('#best-pays').isDisabled());
   assert.equal(await page.locator('#double-draw').isVisible(),doubled);
   await page.locator('#deal').click();await page.locator('[data-view="lab"]').click();
  }
  await page.locator('#reset-pays').click();
  assert.equal(await page.locator('#variant').inputValue(),'badeucey-double');
  assert.equal(await page.locator('#rule-double').inputValue(),'true');
  await chooseGame(page,'badeucey');
  assert.equal(await page.locator('#pay-wheel').inputValue(),'32');
  console.log('Variant selection passed: best-RTP defaults, saved edits, four custom entries, mode-specific settings, reload, legacy migration, reset and draw availability.');
 }finally{await page.close();}
};
