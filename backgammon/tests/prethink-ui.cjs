// Real bundled WASM + production Play lifecycle. Instrument calls, never values.
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function prethinkUI(browser,base,out,name){
 const ctx=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block',reducedMotion:'reduce'});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
 try {
  await page.goto(base+'/backgammon/play/');await ready();
  await page.evaluate(async()=>{
   const{put,saveSettings}=await import('/backgammon/core/storage.mjs');
   const{initialState}=await import('/backgammon/core/rules.mjs');
   const{localConfig,defaultPlayRules}=await import('/backgammon/core/play-session.mjs');
   saveSettings({equityBar:false,motion:'reduce',analysisAhead:true});
   // Keep this interaction test on live WASM; prethink-future covers money-book reuse too.
   const s=initialState({phase:'move',dice:[4,1],rules:defaultPlayRules(7),matchLength:7});
   await put('work',{id:'play',game:{id:'prethink-browser',started:true,state:s,initial:s,events:[],names:['You','GNUbg'],config:localConfig({strength:'quick',reviewStrength:'auto'})},draft:[]});
  });
  await page.reload();await ready();
  await page.evaluate(async()=>{
   const{EngineClient}=await import('/backgammon/engine/client.mjs');
   const original=EngineClient.prototype.analyze;window.thinking=[];
   EngineClient.prototype.analyze=function(state,opts={}){
    const began=performance.now(),trace={state,opts,began};thinking.push(trace);
    return original.call(this,state,opts).then(result=>{Object.assign(trace,{ms:performance.now()-began,result});return result;},err=>{trace.error=err.name;throw err;});
   };
  });
  await page.locator('#resume-match').click();
  // Interaction stays available while actual WASM computes in its worker.
  await page.waitForFunction(()=>thinking.some(t=>t.opts.priority===-5));
  await page.keyboard.press('1');
  assert.ok(await page.locator('.board-die.consumed').count()>0);
  await page.keyboard.press('z');assert.equal(await page.locator('.board-die.consumed').count(),0);
  // No Hint or Confirm click is needed to start current-position analysis.
  await page.waitForFunction(()=>thinking.some(t=>t.opts.priority===-5&&t.result?.settings?.plies>=2),{},{timeout:180000});
  const root=await page.evaluate(()=>thinking.find(t=>t.opts.priority===-5&&t.result));
  assert.ok(root.result.settings.plies>=2);
  await page.waitForFunction(()=>thinking.some(t=>t.opts.priority===-20&&t.result),{},{timeout:90000});
  assert.equal(await page.locator('#board .preview-arrow').count(),0,'no strategic preview leaks while thinking');
  await page.locator('#hint').click();await page.locator('#undo-play-best').waitFor({timeout:30000});
  assert.ok(await page.evaluate(()=>thinking.some(t=>t.opts.priority===20&&!t.opts.submitted&&t.result?.cached)),'hint reuses preparation');
  await page.keyboard.press('Escape');
  await require('./play-helpers.cjs').stageSteps(page,root.result.candidates[0].steps);
  // A complete draft is prepared before confirmation too.
  await page.waitForFunction(()=>thinking.some(t=>t.opts.priority===-4&&t.result?.actual),{},{timeout:180000});
  const grade=await page.evaluate(()=>thinking.find(t=>t.opts.priority===-4&&t.result));
  const before=performance.now();await page.keyboard.press('c');
  await page.waitForFunction(()=>thinking.some(t=>t.opts.priority===20&&t.opts.submitted&&t.result?.actual),{},{timeout:30000});
  const confirmed=await page.evaluate(()=>thinking.find(t=>t.opts.priority===20&&t.opts.submitted&&t.result?.actual));
  assert.ok(confirmed.result.cached);assert.equal(confirmed.result.settings.plies,grade.result.settings.plies);
  assert.equal(confirmed.result.actual.equity,grade.result.actual.equity);
  const confirmationMs=performance.now()-before;
  await page.locator('#preferences').click();
  assert.equal(await page.getByLabel('Analyze ahead in computer games').isChecked(),true);
  await page.getByLabel('Analyze ahead in computer games').uncheck();
  await page.screenshot({path:path.join(out,`${name}-prethink-settings.png`)});
  await page.locator('dialog .close').click();
  const report={rootMs:root.ms,plies:root.result.settings.plies,reason:root.result.budget?.reason,gradeMs:grade.ms,gradeReused:!!grade.result.reusedHint,confirmationMs,engineRetrievalMs:confirmed.ms,trace:await page.evaluate(()=>thinking.map(t=>({phase:t.state.phase,turn:t.state.turn,priority:t.opts.priority,preset:t.opts.preset,ms:t.ms,cached:t.result?.cached,plies:t.result?.settings?.plies,error:t.error})))};
  assert.deepEqual(errors,[]);return report;
 }finally{await ctx.close();}
};
