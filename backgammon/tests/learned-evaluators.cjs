const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function learnedEvaluators(browser,base,out,name) {
 const context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'}),page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try {
  await page.goto(base+'/backgammon/reports/#learned-evaluators');
  const section=page.locator('#learned-evaluators');await section.locator('table').first().getByRole('rowheader',{name:'PureTD wide 1 ply',exact:true}).waitFor({timeout:60000});
  const text=await section.innerText();
  assert.match(text,/705 of 729/);assert.match(text,/703 are outside/);assert.match(text,/0\.00379/);
  assert.match(text,/finite XG rollouts/);assert.match(text,/beavers\/raccoons off/);
  assert.equal(await section.locator('table').count(),3);
  assert.match(await section.locator('table').nth(1).innerText(),/666[\s\S]*625[\s\S]*644[\s\S]*0\.00322/);
  const screenshots=[];
  for(const [width,height] of [[1366,900],[390,844]]) {
   await page.setViewportSize({width,height});await section.scrollIntoViewIfNeeded();
   const layout=await section.evaluate(n=>({overflow:document.documentElement.scrollWidth>innerWidth+1,
    tables:[...n.querySelectorAll('.table-wrap')].map(t=>({width:t.clientWidth,scroll:t.scrollWidth,overflow:getComputedStyle(t).overflowX}))}));
   assert.equal(layout.overflow,false,JSON.stringify(layout));
   assert.ok(layout.tables.every(t=>t.scroll<=t.width+1||['auto','scroll'].includes(t.overflow)));
   const file=`${name}-learned-evaluators-${width}.png`;await page.screenshot({path:path.join(out,file),animations:'disabled'});screenshots.push(file);
  }
  assert.deepEqual(errors,[]);return {browser:name,completeCorpus:true,toleranceFailuresVisible:true,screenshots};
 }finally{await context.close();}
};
