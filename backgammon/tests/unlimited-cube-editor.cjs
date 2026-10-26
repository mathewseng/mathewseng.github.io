const assert=require('node:assert/strict');
const {waitWork}=require('./play-helpers.cjs');
module.exports=async(browser,base)=>{
 const ctx=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce',serviceWorkers:'block'});
 const page=await ctx.newPage(),errors=[];
 const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
 const quietEngine=()=>page.evaluate(async()=>{(await import('/backgammon/engine/client.mjs')).EngineClient.prototype.analyze=()=>new Promise(()=>{});});
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base+'/backgammon/');await ready();
  const url=await page.evaluate(async()=>{
   const r=await import('/backgammon/core/rules.mjs'),x=await import('/backgammon/core/xgid.mjs'),st=await import('/backgammon/core/storage.mjs');
   st.saveSettings({motion:'reduce',analysisAhead:false,equityBar:false});
   let s=r.transition(r.initialState({phase:'roll',matchLength:0,rules:{immediateRedoubles:-1}}),{type:'double'},0);
   for(let i=0;i<5;i++)s=r.transition(s,{type:r.immediateRedoubleAction(s)},r.decisionPlayer(s));
   return x.shareURL(s);
  });
  await page.goto(url);await ready();await quietEngine();
  await page.locator('#edit-position').click();await page.locator('#editor-context').click();
  const decision=page.getByLabel('Decision',{exact:true});
  assert.equal(await decision.locator('[aria-pressed="true"]').getAttribute('data-choice'),'beaver');
  await page.getByRole('button',{name:'Apply context',exact:true}).click();
  await page.waitForFunction(async()=>{
   const saved=await(await import('/backgammon/core/storage.mjs')).get('work','solver');
   return saved?.state.pending?.depth===5;
  });
  const edited=await page.evaluate(async()=>(await(await import('/backgammon/core/storage.mjs')).get('work','solver')).state);
  assert.equal(edited.rules.immediateRedoubles,-1);
  assert.equal(edited.pending.by,1);
  assert.equal(edited.cube.owner,1);
  await page.waitForLoadState('networkidle');
  // Resume that same repeated offer and Take it. The original roller keeps the turn.
  await page.evaluate(async s=>{
   const st=await import('/backgammon/core/storage.mjs'),{localConfig}=await import('/backgammon/core/play-session.mjs');
   await st.put('work',{id:'play',game:{id:'rebeaver-take',started:true,initial:s,state:s,events:[],names:['White','Black'],config:localConfig({mode:'local',matchLength:0,rules:s.rules,tutor:false,warning:false})},draft:[]});
  },edited);
  await page.goto(base+'/backgammon/play/');await ready();await quietEngine();
  await page.locator('#resume-match').click();await page.locator('#take-cube').waitFor();
  assert.equal(await page.locator('#take-cube .cube-reply-value').textContent(),'64');
  await page.keyboard.press('t');
  const taken=await waitWork(page,w=>w?.game.events.some(e=>e.action.type==='take'));
  assert.equal(taken.game.state.turn,0);
  assert.deepEqual(taken.game.state.cube,{value:64,owner:1});
  await page.waitForLoadState('networkidle');
  assert.deepEqual(errors,[]);
  return {editorPreservesDepth:edited.pending.depth,takeCube:taken.game.state.cube};
 }finally{await ctx.close();}
};
