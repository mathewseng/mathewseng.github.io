const assert=require('node:assert/strict');
const {waitWork}=require('./play-helpers.cjs');
// Production scheduler and GNUbg: time the actual next human cube decision,
// including the 4x-throttled UI. A separate delayed result checks the Roll gate.
module.exports=async(browser,base,out,name)=>{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
 try {
  if(name==='chromium') {const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});}
  await page.goto(base+'/backgammon/');await ready();
  await page.evaluate(async()=>{
   const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
   const {localConfig}=await import('/backgammon/core/play-session.mjs');
   const s=r.initialState({phase:'move',turn:1,dice:[4,1],matchLength:7});
   st.saveSettings({analysisAhead:true,equityBar:true,motion:'full',animationSpeed:.5});
   await st.put('work',{id:'play',game:{id:'next-human-cube',started:true,state:s,initial:s,events:[],names:['You','GNUbg'],config:localConfig({matchLength:7,strength:'auto',reviewStrength:'auto'}),localRolls:{version:1,seed:'b7'.repeat(32),cursor:0}},draft:[]});
  });
  await page.goto(base+'/backgammon/play/');await ready();
  await page.evaluate(async()=>{
   const {EngineClient}=await import('/backgammon/engine/client.mjs');
   const original=EngineClient.prototype.analyze;window.cubeCalls=[];
   EngineClient.prototype.analyze=function(state,options={}) {
    const row={phase:state.phase,turn:state.turn,priority:options.priority,began:performance.now()};cubeCalls.push(row);
    return original.call(this,state,options).then(result=>{Object.assign(row,{ms:performance.now()-row.began,result});return result;},error=>{row.error=error.name;throw error;});
   };
   const observe=()=>{if(document.querySelector('#board.roll-ready'))window.humanTurnAt??=performance.now();else requestAnimationFrame(observe);};observe();
  });
  await page.locator('#resume-match').tap();
  await page.locator('#board.roll-ready').waitFor({timeout:180000});
  await page.waitForFunction(()=>cubeCalls.some(r=>r.priority===3&&r.phase==='roll'&&r.turn===0&&r.result),null,{timeout:180000});
  const before=await page.evaluate(()=>{
   const row=cubeCalls.find(r=>r.priority===3&&r.phase==='roll'&&r.turn===0&&r.result);
   return {headStartMs:humanTurnAt-row.began,solveMs:row.ms,plies:row.result.settings.plies,completedBeforeTurn:row.began+row.ms<=humanTurnAt};
  });
  assert.ok(before.headStartMs>0,'next cube starts during the opponent move');
  assert.ok(before.plies>=3);
  await page.keyboard.press('c');
  await waitWork(page,w=>w.game.state.turn===0&&w.game.state.phase==='move');
  const retrieved=await page.evaluate(()=>cubeCalls.find(r=>r.priority===20&&r.phase==='roll'&&r.turn===0&&r.result));
  assert.ok(retrieved.result.cached,'rolling reuses prepared cube evaluation');
  // A real cache miss cannot consume the roll while the cube is still pending.
  await page.goto(base+'/backgammon/');await ready();
  await page.evaluate(async()=>{
   const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
   const {localConfig}=await import('/backgammon/core/play-session.mjs');
   const s=r.initialState({phase:'roll',matchLength:7});
   st.saveSettings({analysisAhead:false,equityBar:false,motion:'reduce'});
   await st.put('work',{id:'play',game:{id:'pending-cube',started:true,state:s,initial:s,events:[],names:['You','GNUbg'],config:localConfig({matchLength:7})},draft:[]});
  });
  await page.goto(base+'/backgammon/play/');await ready();
  await page.evaluate(async()=>{
   const {AnalysisPanel}=await import('/backgammon/ui/analysis.mjs');
   AnalysisPanel.prototype.run=state=>new Promise(resolve=>{window.finishCube=async()=>{
    const {positionKey}=await import('/backgammon/core/rules.mjs');
    resolve({type:'cube',status:'complete',positionKey:positionKey(state),settings:{name:'Test',plies:3},action:'roll',equity:.1,outcomes:[.1,-.2,1],decisionOptions:[{action:'roll',equity:.1},{action:'double',equity:-.2}],units:'current-cube-points',perspective:state.turn});
   };});
  });
  await page.locator('#resume-match').tap();await page.locator('#board.roll-ready').waitFor();
  await page.keyboard.press('c');
  await page.locator('#pending-move-loss').waitFor();
  assert.ok(await page.getByRole('button',{name:'Confirm anyway',exact:true}).isDisabled());
  assert.equal((await waitWork(page,w=>w.game.id==='pending-cube')).game.state.phase,'roll');
  await page.evaluate(()=>finishCube());
  await waitWork(page,w=>w.game.state.phase==='move');
  assert.equal(await page.locator('dialog[open]').count(),0);
  assert.deepEqual(errors,[]);
  return {browser:name,...before,retrievalMs:retrieved.ms,rollWaitsForCube:true};
 }finally{await context.close();}
};
