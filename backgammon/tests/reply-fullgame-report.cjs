const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async function(browser,base){
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
 try{
  await page.goto(base+'/backgammon/reports/#reply-fullgame-precision');
  await page.locator('#reply-fullgame-precision-content p').first().waitFor();
  assert.equal(await page.locator('#reply-fullgame-precision-content .error').count(),0);
  // A deterministic UI fixture exercises the completed renderer without
  // reading or publishing any interim experiment outcomes.
  const inputs=JSON.parse(fs.readFileSync('backgammon/docs/reply-fullgame-precision-inputs.json'));
  const report={complete:true,records:20480,totalTrials:655360,conclusions:{'persistent-policy-disagreement':0,'XG-choice-supported':0,unresolved:6},absoluteEV:{withinTolerance:20},rows:inputs.plan.map(d=>({id:d.id,source:d.source,xgMove:d.referenceBest.move,conclusion:'unresolved',policies:{'full-strong':{bestMove:d.referenceBest.move,candidates:d.candidates.map(c=>({move:c.notation,equity:c.reference.xgEquity,referenceEquity:c.reference.xgEquity,referenceDifference:0,withinTolerance:true})),retainedReferenceGaps:d.candidates.filter(c=>c.board!==d.referenceBest.board).map(c=>({move:c.notation,difference:0,familywise95:{lower:-.001,upper:.001}}))}}}))};
  await page.route('**/data/reply-fullgame-precision-comparison.json',route=>route.fulfill({json:report}));await page.reload();
  const tables=page.locator('#reply-fullgame-precision-content table');await tables.first().waitFor();
  assert.equal(await tables.count(),3);
  for(const[i,n]of [[0,6],[1,14],[2,20]])assert.equal(await tables.nth(i).locator('tbody tr').count(),n);
  assert.doesNotMatch(await page.locator('#reply-fullgame-precision-content').textContent(),/undefined|NaN/);
  for(const width of [1366,390,320]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 }finally{await context.close();}
 return{pendingAndComplete:true,positions:6,pairedGaps:14,candidateEVs:20};
};
