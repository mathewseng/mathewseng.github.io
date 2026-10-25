// Scripted analysis tests the warning/commit boundary, not GNUbg accuracy.
const assert=require('node:assert/strict'),path=require('node:path');
const { waitWork }=require('./play-helpers.cjs');
module.exports=async function revisionWarning(browser,base,out,name){
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'}),page=await ctx.newPage();
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
            candidates:[candidate(legalTurns(s)[1].steps,.1)],actual:candidate(options.submitted || legalTurns(s)[0].steps,.1-loss),error:loss};
        };
      },loss);
      await page.locator('#resume-match').click();
      await page.locator('#confirm').click();
      if(loss>.002){
        await page.getByRole('dialog').getByRole('heading',{name:'Review before confirming?'}).waitFor();
        // The pending warning opens before grading. This case tests revising a
        // completed grade; the unlisted cases below cover revision while pending.
        await waitWork(page,w=>w?.game.initialDecision?.evaluation?.result?.error===loss);
        assert.deepEqual(await page.locator('.checker-warning .dialog-foot button').allTextContents(),['Hint','Play Best','Reset','Play Anyway']);
        assert.equal((await read()).game.events.length,0,'warning leaves turn uncommitted');
        assert.equal(await page.locator('.checker-warning .close').getAttribute('aria-label'),'Revise');
        await page.locator('.checker-warning .close').click();
        assert.equal((await read()).game.events.length,0);
        const first=(await read()).game.initialDecision;
        assert.equal(first.action.type,'move','first submitted choice survives revision');
        assert.equal(first.evaluation.result.error,loss,'the first grade is saved before acceptance');
        assert.equal(await page.locator('#confirm').isEnabled(),true);
        await page.locator('#confirm').click();
        await page.getByRole('button',{name:'Play Best',exact:true}).click();
      }
      await waitWork(page,w=>w?.game.id==='warning-boundary'&&w.game.events.length>0);
      assert.equal((await read()).game.events[0]?.action.type,'move');
      assert.equal((await read()).game.events[0].initialDecision.evaluation.result.error,loss);
      assert.equal(await page.locator('dialog[open]').count(),0);
      cases.push({loss,warned:loss>.002,committedOnlyOnConfirmation:true});
    }
    // An unlisted candidate opens immediately, before its exact grade exists.
    for(const response of ['reset','revise','revise-late-zero','hint','best','anyway-pending','anyway-graded','complete','zero','threshold','fail']) {
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
          options.onUnlisted?.();
          return new Promise((resolve,reject)=>{window.finishPending=async(fail=false,loss=.02)=>{
            if(fail){reject(new Error('Test worker failure'));return;}
            const r=await import('/backgammon/core/rules.mjs');
            const leading=loss===0?-1:.1;
            const candidate=(steps,equity)=>({steps,equity,notation:r.notation(steps,s.turn),probabilities:[.5,.1,.01,.1,.01]});
            resolve({type:'checker',status:'complete',engine:'Test',positionKey:r.positionKey(s),settings:{name:'Test 2 ply',plies:2},units:'current-cube-points',perspective:s.turn,candidates:[candidate(r.legalTurns(s)[1].steps,leading)],actual:candidate(options.submitted || r.legalTurns(s)[0].steps,leading-loss),error:loss});
          };});
        };
      });
      await page.locator('#resume-match').click();
      await page.evaluate(()=>{window.submittedDice=[...document.querySelectorAll('#board .board-die-face')];});
      await page.locator('#confirm').click();
      await page.locator('#pending-move-loss').waitFor();
      assert.ok(await page.evaluate(()=>submittedDice.every((node,i)=>node===document.querySelectorAll('#board .board-die-face')[i])),
        'Confirm keeps the submitted board and its animation nodes while grading');
      assert.ok(await page.locator('#board [role="button"]').evaluateAll(nodes=>nodes.every(node=>node.getAttribute('aria-disabled')==='true')),
        'the retained board is locked until the player revises or confirms');
      assert.match(await page.locator('#pending-move-loss').textContent(),/Still calculating EV/);
      assert.equal((await read()).game.events.length,0);
      if(response==='zero'||response==='threshold') {
        const loss=response==='zero'?0:.002;
        await page.evaluate(loss=>window.finishPending(false,loss),loss);
        const accepted=await waitWork(page,w=>w?.game.events.length>0);
        assert.equal(accepted.game.events[0].action.type,'move');
        assert.equal(await page.locator('dialog[open]').count(),0,'a completed good grade dismisses even an unlisted-move warning');
      } else if(response.startsWith('anyway-')) {
        const submitted=(await read()).draft;
        // The following bot turn starts a different analysis. Resolve the
        // original submission specifically when simulating its late reply.
        await page.evaluate(()=>{window.finishSubmitted=window.finishPending;});
        if(response==='anyway-graded') {
          await page.evaluate(()=>window.finishPending());
          await page.waitForFunction(()=>!document.querySelector('#pending-move-loss').textContent.includes('Still calculating'));
        }
        await page.getByRole('button',{name:'Play Anyway',exact:true}).click();
        const accepted=await waitWork(page,w=>w?.game.events.length>0);
        assert.deepEqual(accepted.game.events[0].action.steps,submitted,'Play Anyway commits the submitted move, not the best move');
        const count=accepted.game.events.length;
        await page.evaluate(()=>window.finishSubmitted());await page.waitForTimeout(80);
        assert.equal((await read()).game.events.length,count,'a late grade cannot submit a second action');
        assert.equal(await page.locator('dialog[open]').count(),0);
      } else if(response==='reset') {
        const buttons=await page.locator('.checker-warning .dialog-foot button').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y,width:n.getBoundingClientRect().width})));
        assert.deepEqual(buttons.map(b=>b.text),['Hint','Play Best','Reset','Play Anyway']);
        assert.ok(await page.locator('.checker-warning .dialog-body').evaluate(n=>n.scrollHeight<=n.clientHeight+1),
          'the warning copy remains fully visible above both button rows');
        await page.screenshot({path:path.join(out,`${name}-revision-warning-actions.png`)});
        assert.equal(buttons[0].y,buttons[1].y);assert.equal(buttons[2].y,buttons[3].y);
        assert.ok(buttons[2].y>buttons[0].y && buttons[1].x>buttons[0].x);
        await page.getByRole('button',{name:'Reset',exact:true}).click();
        const reset=await waitWork(page,w=>w?.draft.length===0);
        assert.equal(reset.game.events.length,0);
        assert.ok(reset.game.initialDecision,'reset retains the initial submitted choice for feedback');
        await page.evaluate(()=>window.finishPending());await page.waitForTimeout(80);
        assert.equal((await read()).draft.length,0,'late grading cannot restore or commit a reset draft');
        assert.equal(await page.locator('dialog[open]').count(),0);
        assert.equal(await page.locator('#confirm').isEnabled(),false);
      } else if(response==='revise'||response==='revise-late-zero') {
        assert.equal(await page.locator('.checker-warning .close').getAttribute('aria-label'),'Revise');
        if(response==='revise-late-zero') {
          await page.evaluate(()=>{document.querySelector('.checker-warning .close').click();return window.finishPending(false,0);});
        } else {
          await page.locator('.checker-warning .close').click();
          await page.evaluate(()=>window.finishPending());
        }
        await page.waitForTimeout(80);
        assert.equal((await read()).game.events.length,0,'cancelled completion cannot commit');
        assert.ok(await page.locator('#confirm').isEnabled());
      } else {
        if(response==='complete'||response==='fail') {
          await page.evaluate(fail=>window.finishPending(fail),response==='fail');
          await page.waitForFunction(()=>!document.querySelector('#pending-move-loss').textContent.includes('Still calculating'));
          assert.equal((await read()).game.events.length,0,'completion alone cannot commit');
          assert.match(await page.locator('#pending-move-loss').textContent(),response==='fail'?/EV unavailable/:/0.020/);
        }
        if(response==='hint'||response==='best') {
          await page.locator('.checker-warning').getByRole('button',{name:response==='hint'?'Hint':'Play Best',exact:true}).click();
          await page.getByRole('dialog',{name:'Move hint',exact:true}).waitFor();
          await page.evaluate(()=>window.finishPending());
          if(response==='hint') {
            await page.locator('.review-move[data-rank="1"]').waitFor();
            assert.equal((await read()).game.events.length,0,'opening a hint never commits the drafted move');
            await page.getByRole('button',{name:'Play best',exact:true}).click();
          }
        } else await page.getByRole('button',{name:response==='fail'?'Play Anyway':'Play Best',exact:true}).click();
        await waitWork(page,w=>w?.game.id==='pending-warning'&&w.game.events.length>0);
        assert.equal((await read()).game.events[0]?.action.type,'move');
      }
      cases.push({unlisted:response});
    }
  }finally{await ctx.close();}
  return cases;
};
