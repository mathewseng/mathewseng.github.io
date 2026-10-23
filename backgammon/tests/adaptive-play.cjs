// Actual bundled WASM, not a mocked engine. Trace calls only to inspect dispatch.
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function adaptivePlay(browser,base,out,name){
 const context=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce',serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await require("./play-helpers.cjs").seedOpening(page,[6,1]);
  await page.goto(base+'/backgammon/play/');await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  // Exercise live adaptive search; money openings can use a published XG
  // reference with no search ply count. Reference dispatch is tested separately.
  await page.getByLabel('Match length',{exact:true}).selectOption('7');
  await page.evaluate(async()=>{const {EngineClient}=await import('/backgammon/engine/client.mjs');const original=EngineClient.prototype.analyze;window.engineTrace=[];EngineClient.prototype.analyze=function(state,options={}){return original.call(this,state,options).then(result=>{engineTrace.push({turn:state.turn,phase:state.phase,preset:options.preset||'quick',submitted:!!options.submitted,plies:result.settings?.plies,budget:result.budget?.reason,error:result.error});return result;});};});
  await page.locator('#start-match').click();await require('./play-helpers.cjs').openingComplete(page);
  const started=Date.now();await page.locator('#hint').click();await page.locator('[data-best-move]').waitFor({timeout:120000});
  const hintMs=Date.now()-started;
  assert.ok((await page.evaluate(()=>engineTrace)).some(r=>r.preset==='auto'&&r.plies>=2));
  await page.locator('#use-hint').click();await page.locator('#confirm').waitFor();
  await page.keyboard.press('c');
  // Wait for bot checker choice and persisted evaluations, including cube choice.
  let game; const deadline=Date.now()+180000;
  while(Date.now()<deadline) {
    game=await page.evaluate(async()=>{const{get}=await import('/backgammon/core/storage.mjs');return (await get('work','play')).game;});
    if(game.events.some(e=>e.actor===1&&e.action.type==='move'&&e.evaluation)) break;
    await page.waitForTimeout(100);
  }
  const evaluations=game.events.filter(e=>e.evaluation).map(e=>({actor:e.actor,action:e.action.type,plies:e.evaluation.result.settings.plies,policy:e.evaluation.result.settings.searchPolicy}));
  assert.ok(evaluations.some(e=>e.actor===0&&e.action==='move'&&e.plies>=2));
  assert.ok(evaluations.some(e=>e.actor===1&&e.action==='move'&&e.plies>=2));
  await page.locator('#review-heading').scrollIntoViewIfNeeded();assert.ok(await page.locator('.history-turn').count());
  await page.locator('[data-history-filter="opponent"]').click();
  const botDepth = evaluations.find(e=>e.actor===1&&e.action==='move').plies;
  const depthLabel = page.locator('.feedback-review[data-history-side="opponent"][data-decision-type="checker"] .history-depth');
  assert.equal(await depthLabel.textContent(), `${botDepth} ply`, 'opponent history shows the actual saved Auto depth');
  assert.equal(await depthLabel.getAttribute('title'), `Completed analysis · ${botDepth} ply`);
  await page.screenshot({path:path.join(out,`${name}-adaptive-feedback.png`),fullPage:true});
  for (const width of [320,390]) {
    await page.setViewportSize({width,height:844});
    await page.locator('#review-heading').scrollIntoViewIfNeeded();
    assert.equal(await depthLabel.textContent(), `${botDepth} ply`);
    const clipped = await page.locator('.history-turn, .history-kind, .history-depth').evaluateAll(nodes=>nodes.filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.textContent));
    assert.deepEqual(clipped, [], `analysis depth fits ${width}px`);
    await page.locator('#move-feedback').screenshot({path:path.join(out,`${name}-adaptive-feedback-phone-${width}.png`)});
  }
  // High money cubes preserve unit equity and context without overflowing the
  // upstream XGID parser's 4096 cap. Ordinary scores do not enter money equity.
  const scale=await page.evaluate(async()=>{const{EngineClient}=await import('/backgammon/engine/client.mjs');const{initialState}=await import('/backgammon/core/rules.mjs');const{defaultPlayRules}=await import('/backgammon/core/play-session.mjs');const e=new EngineClient({openingBook:null});try{const s=initialState({phase:'roll',matchLength:0,rules:defaultPlayRules(0),cube:{value:2,owner:0}});const a=await e.analyze(s,{preset:'quick'});const b=await e.analyze({...s,scores:[900000,120000],cube:{value:16384,owner:0}},{preset:'quick'});return {a:a.equity,b:b.equity,actionA:a.action,actionB:b.action};}finally{e.destroy();}});
  assert.ok(Math.abs(scale.a-scale.b)<1e-6);assert.equal(scale.actionA,scale.actionB);
  await page.setViewportSize({width:1366,height:768});
  await page.locator('#panel-toggle').scrollIntoViewIfNeeded();await page.locator('#panel-toggle').click();
  await page.getByLabel('Computer strength',{exact:true}).selectOption('quick');
  await page.getByLabel('Hint & review strength',{exact:true}).selectOption('standard');
  await page.locator('dialog .close').click();
  await require('./play-helpers.cjs').roll(page);
  await page.locator('#hint').waitFor();await page.locator('#hint').click();
  await page.locator('[data-best-move]').waitFor({timeout:120000});
  assert.ok((await page.evaluate(()=>engineTrace)).some(r=>r.preset==='standard'&&r.plies===1),'fixed hint stays at exactly 1 ply');
  await page.locator('#use-hint').click();await page.keyboard.press('c');
  const fixedDeadline=Date.now()+30000;
  while(Date.now()<fixedDeadline && !(await page.evaluate(()=>engineTrace.some(r=>r.turn===1&&r.phase==='move'&&r.preset==='quick'&&r.plies===0)))) await page.waitForTimeout(100);
  assert.ok(await page.evaluate(()=>engineTrace.some(r=>r.turn===1&&r.phase==='move'&&r.preset==='quick'&&r.plies===0)),'fixed bot stays at exactly 0 ply');
  assert.deepEqual(errors,[]);return{hintMs,evaluations,trace:await page.evaluate(()=>engineTrace),scale};
 }finally{await context.close();}
};
