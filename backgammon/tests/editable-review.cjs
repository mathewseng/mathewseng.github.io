const assert = require('node:assert/strict');
const {waitWork} = require('./play-helpers.cjs');
module.exports = async (browser,base,out,name) => {
 const context = await browser.newContext({viewport:{width:430,height:932},hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});
 const page = await context.newPage(), errors = [], cases=[];
 page.on('pageerror',e=>errors.push(e.message));
 const seed = async () => {
  await page.goto(base+'/backgammon/');
  await page.evaluate(async()=>{
   const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs'),{localConfig}=await import('/backgammon/core/play-session.mjs');
   const state=r.initialState({phase:'move',dice:[3,1],matchLength:0});
   st.saveSettings({interactionMode:'advanced',motion:'reduce',analysisAhead:false,equityBar:false});
   await st.put('work',{id:'play',game:{id:'editable-review',state,initial:state,events:[],started:true,names:['You','GNUbg'],config:localConfig({tutor:true,warning:true})},draft:r.legalTurns(state)[0].steps,positionKey:r.positionKey(state)});
  });
  await page.goto(base+'/backgammon/play/');
  await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  await page.evaluate(async()=>{
   const {AnalysisPanel}=await import('/backgammon/ui/analysis.mjs'),{EngineClient}=await import('/backgammon/engine/client.mjs');
   EngineClient.prototype.analyze=()=>new Promise(()=>{});
   AnalysisPanel.prototype.run=(s,opts)=>new Promise(resolve=>{
    window.finishGrade=async loss=>{
     const r=await import('/backgammon/core/rules.mjs');
     const actual={steps:opts.submitted,equity:.2-loss,notation:r.notation(opts.submitted,s.turn),probabilities:[.5,.1,.01,.1,.01]};
     resolve({type:'checker',status:'complete',positionKey:r.positionKey(s),engine:'Test',perspective:s.turn,units:'current-cube-points',settings:{name:'Test 3 ply',plies:3},candidates:[{...actual,equity:.2}],actual,error:loss});
    };
   });
  });
  await page.locator('#resume-match').click();
  await page.locator('#confirm').click();
  await page.locator('.editable-checker-review').waitFor();
  assert.equal(await page.locator('.editable-checker-review .close,dialog[open]').count(),0,'editable checker review has no close button or modal');
  assert.ok(await page.locator('.editable-checker-review .dialog-foot button').evaluateAll(nodes => nodes.every(n => {
   const range = document.createRange(); range.selectNodeContents(n);
   const text = range.getBoundingClientRect(), box = n.getBoundingClientRect();
   return text.left >= box.left && text.right <= box.right && text.bottom <= box.bottom;
  })), 'all four action labels fit in every layout');
 };
 try {
  for(const [layout,viewport] of Object.entries({portrait:{width:430,height:932},landscape:{width:932,height:430},desktop:{width:1440,height:900}})) {
   await page.setViewportSize(viewport);
   for(const method of ['die','checker']) {
    await seed();
    if(method==='checker') await page.evaluate(()=>finishGrade(.12));
    const before=await waitWork(page,w=>w?.draft.length===2);
    if(method==='die') await page.locator('#board .board-die.consumed').last().click();
    else {
     const step=before.draft.at(-1), piece=page.locator(`[data-point="${step.to}"] .checker > circle`).last();
     const r=await piece.boundingBox(); await page.mouse.click(r.x+r.width/2,r.y+r.height/2);
    }
    const changed=await waitWork(page,w=>w?.draft.length<2);
    assert.equal(changed.game.events.length,0);
    await page.locator('.editable-checker-review').waitFor({state:'detached'});
    assert.ok(await page.locator('#confirm').count(),'normal confirmation control returns');
    if(method==='die') { await page.evaluate(()=>finishGrade(0)); await page.waitForTimeout(100); }
    const unchanged=await waitWork(page,w=>w?.draft.length===changed.draft.length);
    assert.equal(unchanged.game.events.length,0,'a stale good grade cannot commit an edited draft');
    while(await page.locator('#confirm').isDisabled()) await page.locator('#draft-controls select').selectOption({index:1},{force:true});
    assert.ok(await page.locator('#confirm').isVisible(),'completing the revised draft restores the checkmark');
    cases.push({layout,method});
   }
  }
  await page.setViewportSize({width:430,height:932});
  for(const [loss,tone] of [[.012,'close'],[.03,'small'],[.075,'medium'],[.252,'large']]) {
   await seed(); await page.evaluate(loss=>finishGrade(loss),loss);
   await page.locator(`.decision-review-loss[data-loss-tone="${tone}"]`).waitFor();
   const same=await page.locator('.decision-review-loss').evaluate(n=>{
    const ref=document.createElement('strong');ref.className='decision-loss';ref.dataset.lossTone=n.dataset.lossTone;document.body.append(ref);
    const same=getComputedStyle(n).color===getComputedStyle(ref).color;ref.remove();return same;
   });
   assert.ok(same,'EV loss uses the same severity color as Analysis');
   const colors=await page.locator('[data-review-action]').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).backgroundColor));
   assert.equal(new Set(colors).size,4,'each review action has its own subtle tint');
   cases.push({loss,tone});
  }
  assert.deepEqual(errors,[]); return cases;
 } finally { await context.close(); }
};
