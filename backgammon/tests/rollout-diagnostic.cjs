// SPDX-License-Identifier: GPL-3.0-or-later
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function(browser,base,out,name){
 const context=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  for(const width of [1366,390,320]){
   await page.setViewportSize({width,height:900});
   await page.goto(base+'/backgammon/reports/#rollout-diagnostic');
   const section=page.locator('#rollout-diagnostic-content');
   await section.locator('tbody tr').first().waitFor();
   await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
   if(width<600){
    const visible=await page.evaluate(()=>document.querySelector('#rollout-diagnostic h2').getBoundingClientRect().top>=document.querySelector('.docs-toc--sticky').getBoundingClientRect().bottom);
    assert.equal(visible,true,'deep-linked heading clears the sticky navigation');
    await page.screenshot({path:path.join(out,`${name}-rollout-diagnostic-header-${width}.png`)});
   }

   const report=await page.evaluate(async()=>await(await fetch('../data/rollout-diagnostic-comparison.json')).json());
   assert.equal(await section.locator('tbody tr').count(),24);
   assert.ok((await section.textContent()).includes('196,608'));
   for(const key of ['persistent','reversed','unresolved']){
    await page.getByLabel('Disagreement conclusion',{exact:true}).selectOption(key);
    assert.equal(await section.locator('tbody tr').count(),report.classifications[key]);
   }
   await page.getByLabel('Disagreement conclusion',{exact:true}).selectOption('all');
   assert.equal(await section.locator('.error').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await section.locator('tbody tr').first().locator('td').nth(3).textContent(),`[${report.rows[0].gap.familywise95.lower>=0?'+':''}${report.rows[0].gap.familywise95.lower.toFixed(5)}, ${report.rows[0].gap.familywise95.upper>=0?'+':''}${report.rows[0].gap.familywise95.upper.toFixed(5)}]`);
   await page.locator('#rollout-diagnostic').screenshot({path:path.join(out,`${name}-rollout-diagnostic-${width}.png`)});
   for(const a of await section.locator('.docs-links a').all()){
    const href=await a.getAttribute('href');
    if(href.startsWith('../'))assert.equal((await page.request.get(new URL(href,page.url()).href)).status(),200);
   }
  }
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
 return {positions:24,responsive:true,classificationFilters:true,downloads:true};
};
