const assert=require('node:assert/strict');
module.exports=async function checkVariantSelection(browser,base){
 const page=await browser.newPage();
 try{
  // Legacy settings belong to the formerly selected stake mode.
  await page.addInitScript(()=>{if(location.protocol.startsWith('http')&&!sessionStorage.getItem('seeded')){
   localStorage.setItem('video-poker-paytables-v1',JSON.stringify({low27:{wheel:20},badeucey:{bad5:18}}));
   localStorage.setItem('video-poker-rules-v1',JSON.stringify({badeucey:{minBadugi:3}}));
   localStorage.setItem('video-poker-draw-rules-v1',JSON.stringify({low27:true,badeucey:true}));
   sessionStorage.setItem('seeded','true');
  }});
  await page.goto(base+'/poker/video-poker/');
  await page.locator('[data-view="lab"]').click();
  const modes=[['low27',false,10],['low27-double',true,20],['badeucey',false,16],['badeucey-double',true,18]];
  for(const [key,doubled,award]of modes){
   await page.locator('#variant').selectOption(key);
   assert.equal(await page.locator('#rule-double').inputValue(),String(doubled));
   assert.equal(await page.locator(key.startsWith('low27')?'#pay-wheel':'#pay-bad5').inputValue(),String(award));
   if(key.startsWith('badeucey'))assert.equal(await page.locator('#rule-min-badugi').inputValue(),doubled?'3':'4');
  }
  // Editing either stake mode never overwrites its counterpart.
  for(const [index,[key]]of modes.entries()){
   await page.locator('#variant').selectOption(key);
   await page.locator('#pay-wheel').fill(String(30+index));
   await page.locator('#pay-form button[type="submit"]').click();
   assert.equal(await page.locator('#variant').inputValue(),key);
  }
  await page.reload();await page.locator('[data-view="lab"]').click();
  for(const [index,[key,doubled]]of modes.entries()){
   await page.locator('#variant').selectOption(key);
   assert.equal(await page.locator('#pay-wheel').inputValue(),String(30+index));
   assert.equal(await page.locator('#rule-double').inputValue(),String(doubled));
   await page.locator('[data-view="play"]').click();await page.locator('#deal').click();
   assert.equal(await page.locator('#double-draw').isVisible(),doubled);
   await page.locator('#deal').click();await page.locator('[data-view="lab"]').click();
  }
  await page.locator('#reset-pays').click();
  assert.equal(await page.locator('#variant').inputValue(),'badeucey-double');
  assert.equal(await page.locator('#rule-double').inputValue(),'true');
  await page.locator('#variant').selectOption('badeucey');
  assert.equal(await page.locator('#pay-wheel').inputValue(),'32');
  console.log('Variant selection passed: four custom entries, mode-specific settings, reload, legacy migration, reset and draw availability.');
 }finally{await page.close();}
};
