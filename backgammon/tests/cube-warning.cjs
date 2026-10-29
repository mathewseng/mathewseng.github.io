const assert=require('node:assert/strict'),path=require('node:path');
const {waitWork}=require('./play-helpers.cjs');
module.exports=async(browser,base,out,name)=>{
 const report=[];
 for(const [layout,viewport] of Object.entries({desktop:{width:1440,height:900},portrait:{width:390,height:844},landscape:{width:844,height:390}})){
  const context=await browser.newContext({viewport,hasTouch:layout!=='desktop',serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  if(name==='chromium')await(await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate',{rate:4});
  page.on('pageerror',e=>errors.push(e.message));
  const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  try{
   for(const cached of [true,false]){
    await page.goto(base+'/backgammon/');await ready();await page.waitForLoadState('networkidle');
    await page.evaluate(async()=>{
     const r=await import('/backgammon/core/rules.mjs'),s=await import('/backgammon/core/storage.mjs'),{localConfig}=await import('/backgammon/core/play-session.mjs');
     const state=r.initialState({phase:'roll',matchLength:0});
     s.saveSettings({analysisAhead:false,equityBar:false,motion:'system'});
     await s.put('work',{id:'play',game:{id:'cube-warning',initial:state,state,events:[],started:true,names:['You','Black'],config:localConfig({tutor:true,warning:true})},draft:[]});
    });
    await page.goto(base+'/backgammon/play/');await ready();
    await page.evaluate(async cached=>{
     const {AnalysisPanel}=await import('/backgammon/ui/analysis.mjs'),{EngineClient}=await import('/backgammon/engine/client.mjs'),{positionKey}=await import('/backgammon/core/rules.mjs');
     EngineClient.prototype.analyze=()=>new Promise(()=>{});
     EngineClient.prototype.readyResult=()=>cached?{}:null;
     AnalysisPanel.prototype.run=state=>new Promise(resolve=>{
      window.finishCube=()=>resolve({type:'cube',status:'complete',positionKey:positionKey(state),settings:{name:'Test',plies:3},units:'current-cube-points',perspective:state.turn,outcomes:[.4,.7,1]});
      if(cached)window.finishCube();
     });
    },cached);
    await page.locator('#resume-match').click();
    if(await page.locator('#details-dialog[open]').count())await page.locator('#details-dialog .close').click();
    await page.locator('#board.roll-ready').waitFor();
    const board=await page.locator('#board').boundingBox();
    const tap=async(x,y)=>layout==='desktop'?page.mouse.click(x,y):page.touchscreen.tap(x,y);
    const roll=()=>tap(board.x+board.width*.72,board.y+board.height*.5);
    await roll();
    const modal=page.getByRole('dialog',{name:'Review before confirming?',exact:true});
    await modal.waitFor();
    assert.equal(await modal.evaluate(n=>getComputedStyle(n).opacity),'1','the warning is immediately visible when it blocks play');
    if(!cached)await page.evaluate(()=>window.finishCube());
    await waitWork(page,w=>w?.game.initialDecision?.evaluation);
    await page.waitForTimeout(250);
    const box=await modal.boundingBox();
    assert.ok(box.width>100&&box.height>100&&box.y>=0&&box.y+box.height<=viewport.height+1,JSON.stringify(box));
    assert.equal(await modal.evaluate(n=>getComputedStyle(n).opacity),'1');
    assert.ok(await modal.getByRole('button',{name:'Confirm anyway',exact:true}).isEnabled());
    await page.screenshot({path:path.join(out,`${name}-cube-warning-${layout}-${cached?'cached':'pending'}.png`)});
    await (cached?modal.locator('.close'):modal.locator('footer').getByRole('button',{name:'Revise',exact:true})).click();
    await modal.waitFor({state:'detached'});
    assert.equal((await page.evaluate(async()=>(await(await import('/backgammon/core/storage.mjs')).get('work','play')))).game.events.length,0);
    await page.locator('#board.roll-ready').waitFor();
    await roll();await modal.waitFor();
    await page.evaluate(()=>{window.oldCubeCompletion=window.finishCube;});
    await tap(4,viewport.height-4);
    await modal.waitFor({state:'detached'});
    await page.evaluate(()=>window.oldCubeCompletion());
    await page.waitForTimeout(80);
    assert.equal((await page.evaluate(async()=>(await(await import('/backgammon/core/storage.mjs')).get('work','play')))).game.events.length,0,'backdrop revision defeats late completion');
    await page.locator('#board.roll-ready').waitFor();
    await roll();await modal.waitFor();
    if(!cached)await page.evaluate(()=>window.finishCube());
    await page.waitForFunction(()=>!document.querySelector('dialog[open] .primary')?.disabled);
    await modal.getByRole('button',{name:'Confirm anyway',exact:true}).click();
    const committed=await waitWork(page,w=>w?.game.events.length>0);
    assert.equal(committed.game.events[0].action.type,'roll');
    assert.equal(await page.locator('dialog[open]').count(),0,'continuing removes the modal and backdrop');
    report.push({layout,cached});
   }
   assert.deepEqual(errors,[]);
  }catch(error){await page.screenshot({path:path.join(out,`${name}-cube-warning-${layout}-failure.png`),fullPage:true});throw error;}
  finally{await context.close();}
 }
 return report;
};
