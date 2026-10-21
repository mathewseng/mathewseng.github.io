const assert=require('node:assert/strict'),E=require('../engine.js'),S=require('../cribbage-solver.js'),report={recommendations:[...require('../cribbage-analysis.json').recommendations,...require('../cribbage-net-analysis.json').recommendations]};
const evText=r=>(r.estimated?'≈ ':'')+(r.netEV>0?'+':'')+Number(r.netEV.toFixed(6)).toLocaleString('en-US',{maximumFractionDigits:6});
module.exports=async function checkCribbage(browser,base){
 const page=await browser.newPage({viewport:{width:375,height:812},isMobile:true,hasTouch:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base+'/poker/video-poker/');await page.waitForFunction(()=>!document.querySelector('option[value=cribbage7-double]').disabled);
  assert.equal(await page.locator('#variant optgroup').first().locator('option').count(),4);
  assert.equal(await page.locator('#variant optgroup[label=Cribbage] option').count(),16);
  await page.evaluate(()=>{const first=[36,12,13,14,16,17,22];VideoPoker.shuffledDeck=()=>first.concat(Array.from({length:52},(_,i)=>i).filter(c=>!first.includes(c)));});
  let total=0;
  for(const n of [4,5,6,7])for(const payout of ['return','net'])for(const doubled of [false,true]){
   const key='cribbage'+n+(payout==='net'?'-net':'')+(doubled?'-double':'');await page.locator('#variant').selectOption(key);
   const recommended=report.recommendations.filter(r=>r.id==='cribbage'+n&&r.rules.payout===payout&&r.doubleOnDraw===doubled&&r.result.netEV<=0).sort((a,b)=>b.result.netEV-a.result.netEV)[0];
   assert.equal(await page.locator('#return-label').textContent(),'EV / hand');
   assert.equal(await page.locator('#return-value').textContent(),evText(recommended.result));
   assert.equal(await page.locator('#lab-rtp').textContent(),evText(recommended.result));
   assert.match(await page.locator('.analysis-panel h2').first().textContent(),/net EV/);
   assert.doesNotMatch(await page.locator('.analysis-panel').first().textContent(),/RTP|Expected return/);
   assert.equal(await page.locator('#best-pays').textContent(),'Recommended fee');
   assert.equal(await page.locator('#hand .playing-card').count(),n);
   for(const box of await page.locator('#hand .playing-card').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,width:r.width,right:r.right};})))assert.ok(box.width>=44&&box.x>=0&&box.right<=375);
   assert.equal(await page.locator('#pay-fee').getAttribute('step'),'1');
   const fee=Number(await page.locator('#pay-fee').inputValue()),variant={...E.byId['cribbage'+n],pays:{fee},rules:{payout,scoreCap:7},doubleOnDraw:doubled};
   await page.locator('#deal').tap();assert.equal(Number((await page.locator('#pnl').textContent()).replaceAll(',','')),total);
   const h=[36,12,13,14,16,17,22].slice(0,n),best=S.solveHand(h,variant);
   await page.locator('#solve-hand').tap();await page.waitForFunction(()=>document.querySelectorAll('.strategy-row').length>=5,null,{timeout:30000});
   await page.locator('#show-all').tap();assert.equal(await page.locator('.strategy-row').count(),doubled?2**(n+1)-1:2**n);
   const first=page.locator('.strategy-row').first();assert.equal(Number(await first.getAttribute('data-mask')),best[0].mask);assert.equal(await first.getAttribute('data-doubled'),String(best[0].doubled));
   // All cards are reachable and tap exactly once. Pat may never use 2×.
   for(let i=0;i<n;i++)await page.locator(`[data-card="${i}"]`).tap();
   assert.equal(await page.locator('.card-slot.held').count(),n);if(doubled)assert.ok(await page.locator('#double-draw').isDisabled());
   await page.locator(`[data-card="${n-1}"]`).tap();assert.equal(await page.locator('.card-slot.held').count(),n-1);
   assert.equal(Number((await page.locator('#pnl').textContent()).replaceAll(',','')),total);
   const mask=(1<<(n-1))-1,chosen=best.find(r=>r.mask===mask&&r.doubled===doubled);
   const deck=[36,12,13,14,16,17,22].concat(Array.from({length:52},(_,i)=>i).filter(c=>![36,12,13,14,16,17,22].includes(c)));
   const final=E.draw(h,mask,deck.slice(n)),profit=(E.evaluate(final,variant).payout-1)*(doubled?2:1);total+=profit;
   await page.locator(doubled?'#double-draw':'#deal').tap();
   await page.waitForSelector('#decision-ev');assert.ok(Math.abs(Number(await page.locator('#decision-ev').getAttribute('data-ev'))-chosen.netEV)<1e-9);
   assert.equal(Number((await page.locator('#pnl').textContent()).replaceAll(',','')),total);
   assert.equal(Number(await page.locator('.history-entry').first().getAttribute('data-net')),profit);
   assert.match(await page.locator('#hold-instruction').textContent(),/cribbage points/);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if(n===7&&doubled){await page.locator('#show-all').tap();await page.screenshot({path:'/tmp/video-poker-cribbage-mobile.png',fullPage:true});}
  }
  assert.equal(await page.locator('.history-entry').count(),16);
  await page.locator('[data-view=lab]').tap();
  for(const rec of report.recommendations){
   const option=page.locator('.recommendation').filter({has:page.locator(`[data-recommend="${rec.key}"]`)});
   assert.equal(await option.locator('.return-comparison').textContent(),evText(rec.result)+' EV / hand');
   assert.doesNotMatch(await option.textContent(),/RTP|100%/);
  }
  const positive=report.recommendations.find(r=>r.id==='cribbage4'&&!r.doubleOnDraw&&r.result.netEV>0);
  await page.locator(`[data-recommend="${positive.key}"]`).tap();
  assert.equal(await page.locator('#return-value').textContent(),evText(positive.result));
  assert.match(await page.locator('#return-value').textContent(),/^\+/);
  await page.locator('#variant').selectOption('jacks');
  assert.equal(await page.locator('#return-label').textContent(),'Perfect-play return');
  assert.equal(await page.locator('#return-value').textContent(),'99.5439%');
  assert.equal(await page.locator('.analysis-panel h2').first().textContent(),'Exact return');
  assert.equal(await page.locator('#best-pays').textContent(),'Best RTP table');
  // Editable fee and scoring rules persist independently across stake modes.
  await page.locator('#variant').selectOption('cribbage4');await page.locator('[data-view=lab]').tap();
  await page.locator('#pay-fee').fill('99');await page.locator('#pay-fee').press('ArrowUp');assert.equal(await page.locator('#pay-fee').inputValue(),'100');
  await page.locator('#rule-cribbage-payout').selectOption('net');await page.locator('#rule-cribbage-cap').selectOption('5');await page.locator('#pay-form button[type=submit]').tap();
  assert.equal(await page.locator('#lab-rtp').textContent(),'Not solved');
  await page.reload();await page.waitForFunction(()=>!document.querySelector('option[value=cribbage4]').disabled);await page.locator('#variant').selectOption('cribbage4-net');
  assert.equal(await page.locator('#pay-fee').inputValue(),'100');assert.equal(await page.locator('#rule-cribbage-payout').inputValue(),'net');assert.equal(await page.locator('#rule-cribbage-cap').inputValue(),'5');
  await page.evaluate(()=>{const first=[36,12,13,14];VideoPoker.shuffledDeck=()=>first.concat(Array.from({length:52},(_,i)=>i).filter(c=>!first.includes(c)));});
  await page.locator('#deal').tap();assert.equal(await page.locator('#pnl').textContent(),'0');for(let i=0;i<4;i++)await page.locator(`[data-card="${i}"]`).tap();await page.locator('#deal').tap();
  const net=E.evaluate([36,12,13,14],{...E.byId.cribbage4,pays:{fee:100},rules:{payout:'net',scoreCap:5}}).payout-1;
  assert.equal(Number(await page.locator('#pnl').textContent()),net);assert.equal(Number(await page.locator('.history-entry').first().getAttribute('data-net')),net);assert.equal(await page.locator('#hand-status').textContent(),'You lose '+(-net));
  await page.locator('#variant').selectOption('cribbage4');assert.notEqual(await page.locator('#pay-fee').inputValue(),'100');assert.equal(await page.locator('#rule-cribbage-payout').inputValue(),'return');
  await page.locator('#variant').selectOption('cribbage4-net-double');assert.notEqual(await page.locator('#pay-fee').inputValue(),'100');assert.equal(await page.locator('#rule-cribbage-payout').inputValue(),'net');
  await page.locator('#variant').selectOption('cribbage4-double');assert.notEqual(await page.locator('#pay-fee').inputValue(),'100');assert.equal(await page.locator('#rule-cribbage-payout').inputValue(),'return');
  await page.locator('#variant').selectOption('cribbage7');await page.locator('[data-view=lab]').tap();assert.match(await page.locator('#lab-result').textContent(),/sampled.*EV is estimated/);assert.match(await page.locator('#solve-all').textContent(),/Estimate/);
  await page.locator('#solve-all').tap();await page.locator('#cancel-solve').tap();assert.match(await page.locator('#solve-status').textContent(),/canceled/);
  assert.deepEqual(errors,[]);console.log('Cribbage browser checks passed: sixteen games, 4–7 cards, all exact decisions, 2× eligibility, mobile taps, settlement, history, fee/rule persistence and estimated-return labels.');
 }finally{await page.close();}
};
