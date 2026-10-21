const assert=require('node:assert/strict'),E=require('../engine.js'),S=require('../solver.js');
module.exports=async function checkDoubleDraw(browser,base){
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const lab=()=>page.locator('[data-view="lab"]').click(),play=()=>page.locator('[data-view="play"]').click();
 const initial=E.parseHand('7s 5h 4d 3c Kh'),v={...E.byId.low27,doubleOnDraw:true},expected=S.solveHand(initial,v);
 try{
  await page.goto(base+'/poker/video-poker/');await page.locator('#variant').selectOption('low27');await lab();
  await page.locator('#rule-double').selectOption('true');await page.locator('#pay-form button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#double-frequency')?.textContent==='14.6780%');
  assert.match(await page.locator('#lab-result').textContent(),/initial deal/);
  await page.reload();await page.locator('#variant').selectOption('low27-double');await lab();assert.equal(await page.locator('#rule-double').inputValue(),'true');
  await play();await page.evaluate(cards=>{VideoPoker.shuffledDeck=()=>[...cards,...Array.from({length:52},(_,i)=>i).filter(c=>!cards.includes(c))];},initial);
  await page.locator('#deal').click();assert.equal(await page.locator('#pnl').textContent(),'-1');
  for(let i=0;i<5;i++)await page.locator(`[data-card="${i}"]`).click();
  assert.ok(await page.locator('#double-draw').isDisabled(),'cannot double standing pat');
  await page.locator('[data-card="4"]').click();assert.ok(await page.locator('#double-draw').isEnabled());
  await page.locator('#solve-hand').click();await page.waitForFunction(()=>document.querySelectorAll('.strategy-row').length===5,{}, {timeout:30000});
  await page.locator('#show-all').click();assert.equal(await page.locator('.strategy-row').count(),63);
  assert.equal(await page.locator('.strategy-row[data-mask="31"][data-doubled="true"]').count(),0);
  await page.locator('#show-all').click();await page.screenshot({path:'/tmp/video-poker-double-draw.png',fullPage:true});
  await lab();assert.ok(await page.locator('#rule-double').isDisabled());await play();
  await page.locator('#double-draw').click();await page.locator('#decision-ev').waitFor();
  assert.equal(await page.locator('#bet').textContent(),'1');
  const final=E.draw(initial,15,Array.from({length:52},(_,i)=>i).filter(c=>!initial.includes(c))),pay=2*E.evaluate(final,v).payout;
  assert.equal(await page.locator('#last-return').count(),0);
  assert.equal(Number(await page.locator('#pnl').textContent()),pay-2);
  assert.equal(await page.locator('#hand-status').textContent(),pay===0?'You lose':pay===2?'Push':'Won +'+(pay-2));
  assert.equal(await page.locator('.strategy-row.chosen').getAttribute('data-doubled'),'true');
  assert.ok(Math.abs(Number(await page.locator('#decision-ev').getAttribute('data-ev'))-expected.find(r=>r.mask===15&&r.doubled).netEV)<1e-10);
  assert.ok(Math.abs(Number(await page.locator('#best-decision-ev').getAttribute('data-ev'))-expected[0].netEV)<1e-10);
  await page.setViewportSize({width:375,height:812});await page.waitForTimeout(350);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/video-poker-double-review-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:900});
  // Each published option applies the matching payouts, qualifiers, stake rule and result.
  const report=require('../analysis.json');await lab();
  assert.equal(await page.locator('[data-recommend]').count(),12);
  for(const rec of report.recommendations){
   const button=page.locator(`[data-recommend="${rec.key||rec.id}"]`);
   await button.evaluate(el=>el.closest('details').open=true);await button.click();
   assert.equal(await page.locator('#variant').inputValue(),rec.id+(rec.doubleOnDraw?'-double':''));
   assert.equal(await page.locator('#rule-double').inputValue(),String(!!rec.doubleOnDraw));
   assert.equal(await page.locator('#lab-rtp').textContent(),(rec.result.rtp*100).toFixed(4)+'%');
   for(const [key,value]of Object.entries(rec.pays))assert.equal(await page.locator('#pay-'+key).inputValue(),String(value));
   if(rec.id==='badeucey')assert.equal(await page.locator('#rule-min-badugi').inputValue(),String(rec.rules.minBadugi));
  }
  await page.locator('#solve-all').click();await page.waitForFunction(()=>document.getElementById('solve-status').textContent.startsWith('Complete'),{}, {timeout:60000});
  const last=report.recommendations.at(-1);assert.equal(await page.locator('#lab-rtp').textContent(),(last.result.rtp*100).toFixed(4)+'%');
  assert.equal(await page.locator('#double-frequency').textContent(),(last.result.doubleFrequency*100).toFixed(4)+'%');
  await page.screenshot({path:'/tmp/video-poker-double-lab.png',fullPage:true});
  await page.locator('#reset-pays').click();assert.equal(await page.locator('#rule-double').inputValue(),'true');assert.ok(await page.locator('#double-metrics').isVisible());
  // A doubled Badeucey qualifying push returns both stakes, with no points added.
  await page.locator('#variant').selectOption('badeucey');await page.locator('#reset-pays').click();
  await page.locator('#rule-double').selectOption('true');await page.locator('#pay-form button[type="submit"]').click();
  await play();
  const pushHand=E.parseHand('Ks Jh 9d 7c 2s'),replacement=E.parseHand('As 3h 4d 5c 6s')[0];
  await page.evaluate(({cards,next})=>{VideoPoker.shuffledDeck=()=>[...cards,next,...Array.from({length:52},(_,i)=>i).filter(c=>!cards.includes(c)&&c!==next)];},{cards:pushHand,next:replacement});
  const beforePush=Number(await page.locator('#pnl').textContent());
  await page.locator('#deal').click();for(let i=1;i<5;i++)await page.locator(`[data-card="${i}"]`).click();await page.locator('#double-draw').click();
  assert.equal(await page.locator('#hand-status').textContent(),'Push');assert.equal(Number(await page.locator('#pnl').textContent()),beforePush);
  // A one-unit push also leaves PnL unchanged.
  await page.locator('#variant').selectOption('low27');await lab();await page.locator('#reset-pays').click();await play();
  await page.evaluate(cards=>{VideoPoker.shuffledDeck=()=>[...cards,...Array.from({length:52},(_,i)=>i).filter(c=>!cards.includes(c))];},E.parseHand('Js 6h 4d 3c 2s'));
  await page.locator('#deal').click();for(let i=0;i<5;i++)await page.locator(`[data-card="${i}"]`).click();await page.locator('#deal').click();
  assert.equal(await page.locator('#hand-status').textContent(),'Push');assert.equal(Number(await page.locator('#pnl').textContent()),beforePush);
  // Negative PnL never blocks the next wager or resets the session. Solver replies are unnecessary here.
  await page.locator('#variant').selectOption('low27');await lab();await page.locator('#rule-double').selectOption('true');
  for(const input of await page.locator('#pay-editor input').all())await input.fill('0');
  await page.locator('#pay-form button[type="submit"]').click();await page.reload();await page.locator('#variant').selectOption('low27-double');
  await page.evaluate(()=>{
   window.Worker=class{postMessage(){}terminate(){}};
   const deal=document.getElementById('deal'),double=document.getElementById('double-draw');
   for(let i=0;i<60;i++){deal.click();double.click();}
  });
  assert.equal(await page.locator('#pnl').textContent(),'-120');
  assert.equal(await page.locator('#hands-played').textContent(),'60');
  assert.equal(await page.locator('#hand-status').textContent(),'You lose');
  assert.equal(await page.locator('#credits').count(),0);assert.equal(await page.locator('#last-return').count(),0);
  await page.locator('#deal').click();assert.equal(await page.locator('#pnl').textContent(),'-121');
  assert.ok(await page.locator('#double-draw').isEnabled());assert.equal(await page.locator('#bet').textContent(),'1');

  assert.deepEqual(errors,[]);console.log('Double draw passed: stake eligibility, PnL settlement and outcome labels, 63 actions, net EV review, saved mode, all 12 payout options and exact worker totals.');
 }finally{await page.close();}
};
