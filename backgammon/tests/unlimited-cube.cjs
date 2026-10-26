const assert=require('node:assert/strict'),path=require('node:path');
const {waitWork}=require('./play-helpers.cjs');
module.exports=async(browser,base,out,name)=>{
 const report=[];
 for(const [layout,width,height,touch] of [['portrait',390,844,true],['landscape',844,390,true],['desktop',1366,768,false]]){
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:touch,reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  const resume=async()=>{
   await ready();
   // Isolate interaction/layout from bot search; actual GNUbg parity is covered by options-ui.
   await page.evaluate(async()=>{(await import('/backgammon/engine/client.mjs')).EngineClient.prototype.analyze=()=>new Promise(()=>{});});
   await page.locator('#resume-match').click();await page.locator('#take-cube').waitFor();
  };
  try{
   await page.goto(base+'/backgammon/play/');await ready();
   await page.locator('.game-rules summary').click();
   assert.equal(await page.getByLabel('Immediate redoubles',{exact:true}).inputValue(),'-1');
   await page.getByLabel('Immediate redoubles',{exact:true}).selectOption('2');
   await page.getByLabel('Immediate redoubles',{exact:true}).selectOption('-1');
   await page.evaluate(async()=>{
    const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
    const {localConfig,defaultPlayRules}=await import('/backgammon/core/play-session.mjs');
    const s=r.transition(r.initialState({turn:1,phase:'roll',matchLength:0,rules:defaultPlayRules(0)}),{type:'double'},1);
    st.saveSettings({motion:'reduce',analysisAhead:false,equityBar:false,keyboardEnabled:true,skin:'liquid-chrome'});
    await st.put('work',{id:'play',game:{id:'unlimited-cube',started:true,initial:s,state:s,events:[],names:['White','Black'],config:localConfig({mode:'local',matchLength:0,rules:s.rules,tutor:false,warning:false})},draft:[]});
   });
   await page.reload();await resume();
   for(let depth=0;depth<6;depth++){
    const action=depth%2?'raccoon':'beaver',label=depth%2?'Raccoon':'Beaver',key=depth%2?'R':'B';
    await page.waitForFunction(({action,stake})=>document.querySelector('#immediate-redouble')?.dataset.cubeAction===action&&document.querySelector('#drop-cube .cube-reply-value')?.textContent===`−${stake}`,{action,stake:2**depth});
    assert.equal(await page.locator('#immediate-redouble .cube-reply-label').textContent(),label);
    assert.equal(await page.locator('#immediate-redouble kbd text').textContent(),key);
    assert.equal(await page.locator('#immediate-redouble .cube-reply-value').textContent(),String(2**(depth+2)));
    const geometry=await page.locator('.cube-reply').evaluateAll(buttons=>buttons.map(b=>{
     const face=b.querySelector('.cube-reply-face').getBoundingClientRect(),word=b.querySelector('.cube-reply-label').getBoundingClientRect(),value=b.querySelector('.cube-reply-value').getBoundingClientRect();
     return {stacked:word.bottom<=value.top,centered:Math.abs(word.x+word.width/2-face.x-face.width/2)<1&&Math.abs(value.x+value.width/2-face.x-face.width/2)<1,
      contained:word.top>=face.top&&value.bottom<=face.bottom&&word.left>=face.left&&word.right<=face.right};
    }));
    assert.ok(geometry.every(g=>g.stacked&&g.centered&&g.contained),`${layout} ${depth}: ${JSON.stringify(geometry)}`);
    if(depth===2||depth===3){
     await page.waitForLoadState('networkidle');
     await page.screenshot({path:path.join(out,`${name}-unlimited-${depth===2?'raccoon':'rebeaver'}-${layout}.png`)});
    }
    // Alternate tapping and the actual B/R keyboard shortcuts.
    if(touch)await page.locator('#immediate-redouble').tap();else await page.keyboard.press(key);
    const saved=await waitWork(page,w=>w?.game.state.pending?.depth===depth+1);
    assert.equal(saved.game.state.cube.owner,0,'first beaverer retains ownership');
    assert.equal(saved.game.events.at(-1).action.type,action);
    if(depth===2){
     await page.waitForLoadState('networkidle');await page.reload();await resume();
     const restored=await waitWork(page,w=>w?.game.state.pending?.depth===3);
     assert.equal(restored.game.state.rules.immediateRedoubles,-1);
    }
   }
   await page.locator('#drop-cube').click();
   const ended=await waitWork(page,w=>w?.game.state.phase==='over');
   assert.equal(ended.game.state.result.points,64);
   assert.equal(ended.game.state.result.winner,1);
   await page.waitForLoadState('networkidle');
   assert.deepEqual(errors,[]);
   report.push({layout,chain:ended.game.events.map(e=>e.action.type),loss:ended.game.state.result.points,reload:true});
  }finally{await ctx.close();}
 }
 return report;
};
