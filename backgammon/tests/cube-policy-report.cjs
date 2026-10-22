const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async function(browser,base){
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
 try{
  await page.goto(base+'/backgammon/reports/#cube-policy-study');
  const section=page.locator('#cube-policy-study-content');await section.locator('p').first().waitFor();
  assert.equal(await section.locator('.error').count(),0);
  const input=JSON.parse(fs.readFileSync('backgammon/docs/cube-policy-study-v2-inputs.json'));
  const r={complete:true,studyVersion:2,records:5120,totalTrials:163840,source:input.plan[0].source,policies:input.policies.map(p=>({id:p.id,gap:{difference:0,direction:'unresolved',familywise95:{lower:-.01,upper:.01}},candidates:input.plan[0].candidates.map(c=>({role:c.role,equity:c.reference.xgEquity,referenceEquity:c.reference.xgEquity,referenceDifference:0,withinTolerance:true,referenceCredit:{author:'Fixture contributor'}})),cubeActions:[100,2,1,0,0,0,0,103,1000,0],maxCube:8})),effects:input.effects.map(([after,before])=>({after,before,difference:0,familywise95:{lower:-.01,upper:.01}}))};
  await page.route('**/data/cube-policy-study-comparison.json',route=>route.fulfill({json:r}));await page.reload();await section.locator('table').first().waitFor();
  assert.equal(await section.locator('table').count(),4);
  assert.equal(await section.getByText('XG · Fixture contributor',{exact:true}).count(),10);
  for(const[i,n]of [[0,5],[1,4],[2,10],[3,3]])assert.equal(await section.locator('table').nth(i).locator('tbody tr').count(),n);
  assert.doesNotMatch(await section.textContent(),/undefined|NaN/);
  assert.equal(await section.getByRole('link',{name:'All 20 worker records and validation'}).getAttribute('href'),'../docs/cube-policy-study-v2-execution.json');
  assert.equal(await section.getByRole('link',{name:'Raw paired batches (gzip)'}).getAttribute('href'),'../docs/cube-policy-study-v2-batches.jsonl.gz');
  for(const width of [1366,390,320]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 }finally{await context.close();}
 return{policies:5,pairedEffects:4,candidateEVs:10,viewports:3};
};
