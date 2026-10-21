// SPDX-License-Identifier: GPL-3.0-or-later
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function(browser,base,out,name){
 const context=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  for(const width of [1366,390,320]){
   await page.setViewportSize({width,height:900});await page.goto(base+'/backgammon/reports/#fullgame-precision');
   const section=page.locator('#fullgame-precision-content');await section.locator('tbody tr').first().waitFor();
   await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
   const report=await page.evaluate(async()=>await(await fetch('../data/fullgame-precision-comparison.json')).json());
   assert.equal(await section.locator('table').count(),4);
   for(const [i,n] of [3,3,4,15].entries())assert.equal(await section.locator('table').nth(i).locator('tbody tr').count(),n);
   assert.ok((await section.textContent()).includes('430,080'));assert.ok((await section.textContent()).includes('262,144'));
   const detail=section.locator('table').last();
   for(const effect of ['cutoff','checker']){
    await page.getByLabel('Precision cohort effect',{exact:true}).selectOption(effect);
    const e=report.rows[0].effects[effect],number=v=>`${v>=0?'+':''}${v.toFixed(5)}`;
    assert.equal(await detail.locator('tbody tr').first().locator('td').nth(3).textContent(),number(e.difference));
    assert.equal(await detail.locator('tbody tr').first().locator('td').nth(4).textContent(),`[${number(e.familywise95.lower)}, ${number(e.familywise95.upper)}]`);
   }
   await page.getByLabel('Precision cohort effect',{exact:true}).selectOption('cutoff');
   assert.equal(await section.locator('.error').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.evaluate(()=>document.querySelector('#fullgame-precision').scrollIntoView());
   if(width<600)assert.equal(await page.evaluate(()=>document.querySelector('#fullgame-precision h2').getBoundingClientRect().top>=document.querySelector('.docs-toc--sticky').getBoundingClientRect().bottom),true);
   await page.screenshot({path:path.join(out,`${name}-fullgame-precision-header-${width}.png`)});
   await page.locator('#fullgame-precision').screenshot({path:path.join(out,`${name}-fullgame-precision-${width}.png`)});
   for(const a of await section.locator('.docs-links a').all()){
    const href=await a.getAttribute('href');if(href.startsWith('../'))assert.equal((await page.request.get(new URL(href,page.url()).href)).status(),200);
   }
  }
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
 return {positions:15,openingTrials:32768,responsive:true,pairedEffects:true,downloads:true};
};
