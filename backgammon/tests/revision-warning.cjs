// Scripted analysis tests the warning/commit boundary, not GNUbg accuracy.
const assert=require('node:assert/strict');
module.exports=async function revisionWarning(browser,base){
  const ctx=await browser.newContext({reducedMotion:'reduce',serviceWorkers:'block'}),page=await ctx.newPage();
  const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  const read=()=>page.evaluate(async()=>(await(await import('/backgammon/core/storage.mjs')).get('work','play')));
  const cases=[];
  try{
    await page.goto(base+'/backgammon/play/');await ready();
    for(const loss of [.002,.0021,.003]){
      await page.evaluate(async()=>{
        const {initialState,legalTurns,positionKey}=await import('/backgammon/core/rules.mjs'),{put,saveSettings}=await import('/backgammon/core/storage.mjs'),{localConfig}=await import('/backgammon/core/play-session.mjs');
        const state=initialState({phase:'move',dice:[4,1],matchLength:0});
        saveSettings({analysisAhead:false,motion:'reduce',equityBar:false});
        await put('work',{id:'play',game:{id:'warning-boundary',initial:state,state,events:[],started:true,names:['You','GNUbg'],config:localConfig({tutor:true,warning:true})},positionKey:positionKey(state),draft:legalTurns(state)[0].steps});
      });
      await page.reload();await ready();
      await page.evaluate(async loss=>{
        const {AnalysisPanel}=await import('/backgammon/ui/analysis.mjs'),{EngineClient}=await import('/backgammon/engine/client.mjs');
        const {legalTurns,notation,positionKey}=await import('/backgammon/core/rules.mjs');
        const {ENGINE_VERSION}=await import('/backgammon/engine/metadata.mjs');
        // Keep background review/computer requests idle; foreground evaluation
        // below is explicit and independent of the real-WASM integration test.
        EngineClient.prototype.analyze=()=>new Promise(()=>{});
        AnalysisPanel.prototype.run=async function(s,options){
          const candidate=(steps,equity)=>({steps,equity,notation:notation(steps,s.turn),probabilities:[.5,.1,.01,.1,.01]});
          return {type:'checker',status:'complete',engine:ENGINE_VERSION,positionKey:positionKey(s),requestId:'threshold-test',settings:{name:'Test',plies:0},units:'current-cube-points',perspective:s.turn,
            candidates:[candidate(legalTurns(s)[1].steps,.1)],actual:candidate(options.submitted,.1-loss),error:loss};
        };
      },loss);
      await page.locator('#resume-match').click();
      await page.locator('#confirm').click();
      if(loss>.002){
        await page.getByRole('dialog').getByRole('heading',{name:'Review before confirming?'}).waitFor();
        assert.equal((await read()).game.events.length,0,'warning leaves turn uncommitted');
        await page.getByRole('button',{name:'Revise',exact:true}).click();
        assert.equal((await read()).game.events.length,0);
        assert.equal(await page.locator('#confirm').isEnabled(),true);
        await page.locator('#confirm').click();
        await page.getByRole('button',{name:'Confirm anyway',exact:true}).click();
      }
      const deadline=Date.now()+5000;while((await read()).game.events.length===0&&Date.now()<deadline)await page.waitForTimeout(25);
      assert.equal((await read()).game.events[0]?.action.type,'move');
      assert.equal(await page.locator('dialog[open]').count(),0);
      cases.push({loss,warned:loss>.002,committedOnlyOnConfirmation:true});
    }
  }finally{await ctx.close();}
  return cases;
};
