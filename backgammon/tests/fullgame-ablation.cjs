// SPDX-License-Identifier: GPL-3.0-or-later
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function(browser,base,out,name){
 const context=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  for(const width of [1366,390,320]){
   await page.setViewportSize({width,height:900});
   await page.goto(base+'/backgammon/reports/#fullgame-ablation');
   const section=page.locator('#fullgame-ablation-content');
   await section.locator('tbody tr').first().waitFor();
   await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
   const report=await page.evaluate(async()=>await(await fetch('../data/fullgame-ablation-comparison.json')).json());
   assert.equal(await section.locator('table').count(),3);
   assert.equal(await section.locator('table').first().locator('tbody tr').count(),4);
   assert.equal(await section.locator('table').nth(1).locator('tbody tr').count(),3);
   const detail=section.locator('table').last();
   assert.equal(await detail.locator('tbody tr').count(),15);
   assert.ok((await section.textContent()).includes('138,240'));
   for(const effect of ['cutoff','checker','cube']){
    await page.getByLabel('Full-game effect',{exact:true}).selectOption(effect);
    const e=report.rows[0].effects[effect],number=v=>`${v>=0?'+':''}${v.toFixed(5)}`;
    assert.equal(await detail.locator('tbody tr').first().locator('td').nth(3).textContent(),number(e.difference));
    assert.equal(await detail.locator('tbody tr').first().locator('td').nth(4).textContent(),`[${number(e.familywise95.lower)}, ${number(e.familywise95.upper)}]`);
   }
   await page.getByLabel('Full-game effect',{exact:true}).selectOption('cutoff');
   assert.equal(await section.locator('.error').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(width<600){
    await page.evaluate(()=>document.querySelector('#fullgame-ablation').scrollIntoView());
    const visible=await page.evaluate(()=>document.querySelector('#fullgame-ablation h2').getBoundingClientRect().top>=document.querySelector('.docs-toc--sticky').getBoundingClientRect().bottom);
    assert.equal(visible,true,'heading clears sticky navigation');
   }
   await page.screenshot({path:path.join(out,`${name}-fullgame-ablation-header-${width}.png`)});
   await page.locator('#fullgame-ablation').screenshot({path:path.join(out,`${name}-fullgame-ablation-${width}.png`)});
   for(const a of await section.locator('.docs-links a').all()){
    const href=await a.getAttribute('href');
    if(href.startsWith('../'))assert.equal((await page.request.get(new URL(href,page.url()).href)).status(),200);
   }
  }
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
 return {positions:15,responsive:true,causalContrasts:true,downloads:true};
};
