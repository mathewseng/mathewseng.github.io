// Scripted analysis tests the warning/commit boundary, not GNUbg accuracy.
const assert=require('node:assert/strict');
const { waitWork }=require('./play-helpers.cjs');
module.exports=async function revisionWarning(browser,base){
  const ctx=await browser.newContext({reducedMotion:'reduce',serviceWorkers:'block'}),page=await ctx.newPage();
  const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  const read=()=>page.evaluate(async()=>(await(await import('/backgammon/core/storage.mjs')).get('work','play')));
  const cases=[];
  try{
    await page.goto(base+'/backgammon/play/');await ready();
    for(const loss of [.002,.0021,.003]){
      // An active Play page saves on pagehide; navigate away before seeding.
      await page.goto(base+'/backgammon/');await ready();
      await page.evaluate(async()=>{
        const {initialState,legalTurns,positionKey}=await import('/backgammon/core/rules.mjs'),{put,saveSettings}=await import('/backgammon/core/storage.mjs'),{localConfig}=await import('/backgammon/core/play-session.mjs');
        const state=initialState({phase:'move',dice:[4,1],matchLength:0});
        saveSettings({analysisAhead:false,motion:'reduce',equityBar:false});
        await put('work',{id:'play',game:{id:'warning-boundary',initial:state,state,events:[],started:true,names:['You','GNUbg'],config:localConfig({tutor:true,warning:true})},positionKey:positionKey(state),draft:legalTurns(state)[0].steps});
      });
      await page.goto(base+'/backgammon/play/');await ready();
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
        // The pending warning opens before grading. This case tests revising a
        // completed grade; the unlisted cases below cover revision while pending.
        await waitWork(page,w=>w?.game.initialDecision?.evaluation?.result?.error===loss);
        assert.equal((await read()).game.events.length,0,'warning leaves turn uncommitted');
        await page.getByRole('button',{name:'Revise',exact:true}).click();
        assert.equal((await read()).game.events.length,0);
        const first=(await read()).game.initialDecision;
        assert.equal(first.action.type,'move','first submitted choice survives revision');
        assert.equal(first.evaluation.result.error,loss,'the first grade is saved before acceptance');
        assert.equal(await page.locator('#confirm').isEnabled(),true);
        await page.locator('#confirm').click();
        await page.getByRole('button',{name:'Confirm anyway',exact:true}).click();
      }
      await waitWork(page,w=>w?.game.id==='warning-boundary'&&w.game.events.length>0);
      assert.equal((await read()).game.events[0]?.action.type,'move');
      assert.equal((await read()).game.events[0].initialDecision.evaluation.result.error,loss);
      assert.equal(await page.locator('dialog[open]').count(),0);
      cases.push({loss,warned:loss>.002,committedOnlyOnConfirmation:true});
    }
    // An unlisted candidate opens immediately, before its exact grade exists.
    for(const response of ['revise','confirm','complete','fail']) {
      await page.goto(base+'/backgammon/');await ready();
      await page.evaluate(async()=>{
        const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
        const {localConfig}=await import('/backgammon/core/play-session.mjs');
        const state=r.initialState({phase:'move',dice:[4,1],matchLength:0});
        await st.put('work',{id:'play',game:{id:'pending-warning',initial:state,state,events:[],started:true,names:['You','GNUbg'],config:localConfig({tutor:true,warning:true})},positionKey:r.positionKey(state),draft:r.legalTurns(state)[0].steps});
      });
      await page.goto(base+'/backgammon/play/');await ready();
      await page.evaluate(async()=>{
        const {AnalysisPanel}=await import('/backgammon/ui/analysis.mjs'),{EngineClient}=await import('/backgammon/engine/client.mjs');
        EngineClient.prototype.analyze=()=>new Promise(()=>{});
        AnalysisPanel.prototype.run=function(s,options){
          options.onUnlisted();
          return new Promise((resolve,reject)=>{window.finishPending=async(fail=false)=>{
            if(fail){reject(new Error('Test worker failure'));return;}
            const r=await import('/backgammon/core/rules.mjs');
            const candidate=(steps,equity)=>({steps,equity,notation:r.notation(steps,s.turn),probabilities:[.5,.1,.01,.1,.01]});
            resolve({type:'checker',status:'complete',engine:'Test',positionKey:r.positionKey(s),settings:{name:'Test 2 ply',plies:2},units:'current-cube-points',perspective:s.turn,candidates:[candidate(r.legalTurns(s)[1].steps,.1)],actual:candidate(options.submitted,.08),error:.02});
          };});
        };
      });
      await page.locator('#resume-match').click();await page.locator('#confirm').click();
      await page.locator('#pending-move-loss').waitFor();
      assert.match(await page.locator('#pending-move-loss').textContent(),/Still calculating EV/);
      assert.equal((await read()).game.events.length,0);
      if(response==='revise') {
        await page.getByRole('button',{name:'Revise',exact:true}).click();
        await page.evaluate(()=>window.finishPending());await page.waitForTimeout(80);
        assert.equal((await read()).game.events.length,0,'cancelled completion cannot commit');
        assert.ok(await page.locator('#confirm').isEnabled());
      } else {
        if(response==='complete'||response==='fail') {
          await page.evaluate(fail=>window.finishPending(fail),response==='fail');
          await page.waitForFunction(()=>!document.querySelector('#pending-move-loss').textContent.includes('Still calculating'));
          assert.equal((await read()).game.events.length,0,'completion alone cannot commit');
          assert.match(await page.locator('#pending-move-loss').textContent(),response==='fail'?/EV unavailable/:/0.020/);
        }
        await page.getByRole('button',{name:'Confirm anyway',exact:true}).click();
        await waitWork(page,w=>w?.game.id==='pending-warning'&&w.game.events.length>0);
        assert.equal((await read()).game.events[0]?.action.type,'move');
      }
      cases.push({unlisted:response});
    }
  }finally{await ctx.close();}
  return cases;
};
