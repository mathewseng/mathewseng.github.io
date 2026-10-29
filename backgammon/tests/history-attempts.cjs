// Scripted grades exercise real Confirm/Revise/Play Best and persistence, not engine accuracy.
const assert = require('node:assert/strict'), path = require('node:path');
const {waitWork} = require('./play-helpers.cjs');
module.exports = async (browser, base, out, name) => {
  const report = [];
  for (const [layout,viewport] of Object.entries({desktop:{width:1440,height:900},portrait:{width:390,height:844},landscape:{width:844,height:390}})) {
    const context = await browser.newContext({viewport,hasTouch:layout!=='desktop',reducedMotion:'reduce',serviceWorkers:'block'});
    const page = await context.newPage(), errors = [];
    page.on('pageerror',e=>errors.push(e.message));
    const ready = () => page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
    const hub = async () => {await page.goto(base+'/backgammon/');await ready();await page.waitForLoadState('networkidle');};
    const resume = async () => {
      await page.goto(base+'/backgammon/play/');await ready();
      await page.evaluate(async () => {
        const {AnalysisPanel} = await import('/backgammon/ui/analysis.mjs');
        const {EngineClient} = await import('/backgammon/engine/client.mjs');
        const r = await import('/backgammon/core/rules.mjs');
        const {ENGINE_VERSION} = await import('/backgammon/engine/metadata.mjs');
        EngineClient.prototype.analyze = () => new Promise(()=>{});
        AnalysisPanel.prototype.run = async (state,options) => {
          if (state.phase !== 'move') return new Promise(()=>{}); // Leave the following bot turn idle.
          const turns=r.legalTurns(state), steps=options.submitted || turns[1].steps;
          const board=xs=>r.boardKey(xs.reduce((s,step)=>r.applyStep(s,step),state));
          const loss=board(steps)===board(turns[0].steps) ? .06 : board(steps)===board(turns[1].steps) ? 0 : .03;
          const candidate=(steps,equity)=>({steps,equity,notation:r.notation(steps,state.turn),probabilities:[.5,.1,.01,.1,.01]});
          return {type:'checker',status:'complete',engine:ENGINE_VERSION,positionKey:r.positionKey(state),
            settings:{name:'Test',plies:3},units:'current-cube-points',perspective:state.turn,
            candidates:[candidate(turns[1].steps,.2)],actual:candidate(steps,.2-loss),error:loss};
        };
      });
      if (!await page.locator('#resume-match').isVisible()) await page.locator('#panel-toggle').click();
      await page.locator('#resume-match').click();
      if (await page.locator('#details-dialog[open]').count()) await page.locator('#details-dialog .close').click();
    };
    try {
      await hub();
      await page.evaluate(async () => {
        const r=await import('/backgammon/core/rules.mjs'), st=await import('/backgammon/core/storage.mjs');
        const {localConfig}=await import('/backgammon/core/play-session.mjs');
        const initial=r.initialState({phase:'roll',matchLength:0,cube:{value:2,owner:null}});
        const {playAction}=await import('/backgammon/core/table.mjs');
        let game={id:'history-attempts',initial,state:initial,events:[],started:true,names:['You','Black'],config:localConfig({tutor:true,warning:true})};
        game=playAction(game,{type:'roll',dice:[1,4]});
        game.events[0].evaluation={result:{type:'cube',status:'complete',positionKey:r.positionKey(initial),
          settings:{name:'Test',plies:3},units:'current-cube-points',outcomes:[.2,.1,1]}};
        st.saveSettings({analysisAhead:false,motion:'reduce',equityBar:false});
        await st.put('work',{id:'play',game,positionKey:r.positionKey(game.state),draft:r.legalTurns(game.state)[0].steps});
      });
      await resume();
      await page.locator('#confirm').click();
      await waitWork(page,w=>w?.game.initialDecision?.evaluation);
      await page.locator('.checker-warning .close').click();
      // Reload between attempts to prove that revising does not discard the first choice.
      await hub();
      const expected = await page.evaluate(async () => {
        const st=await import('/backgammon/core/storage.mjs'), r=await import('/backgammon/core/rules.mjs');
        const {presentMove}=await import('/backgammon/core/move-presentation.mjs');
        const work=await st.get('work','play'), turns=r.legalTurns(work.game.state);
        work.draft=turns[2].steps; await st.put('work',work);
        return [turns[0],turns[2]].map(turn=>presentMove(work.game.state,turn.steps).notation);
      });
      await resume();
      await page.locator('#confirm').click();
      await waitWork(page,w=>w?.game.initialDecision?.revisions?.[0]?.evaluation);
      await page.locator('.checker-warning').getByRole('button',{name:'Play Best',exact:true}).click();
      const accepted=await waitWork(page,w=>w?.game.events.some(e=>e.action.type==='move'));
      assert.equal(accepted.game.events[1].initialDecision.revisions.length,1);
      const checker=page.locator('#move-feedback [data-history-side="self"][data-decision-type="checker"]');
      const check = async () => {
        await checker.waitFor();
        assert.deepEqual(await checker.locator('.history-initial .history-attempt-label').allTextContents(),['Attempt 1','Attempt 2']);
        assert.deepEqual(await checker.locator('.history-initial .history-played').allTextContents(),expected);
        assert.deepEqual(await checker.locator('.history-initial-loss strong').allTextContents(),['0.060','0.030']);
        assert.equal(await checker.locator('.history-accepted .history-attempt-label').innerText(),'Played best');
        assert.equal(await checker.locator('.history-choice-method').innerText(),'Hint');
        assert.equal(await checker.locator('.history-choice-method').getAttribute('data-choice-method'),'play-best');
        assert.equal(await checker.locator('.history-equity').innerText(),'+0.200');
        assert.equal(await checker.locator('.history-depth, .decision-values-compact, .history-loss').count(),0);
        assert.doesNotMatch(await checker.innerText(),/Best equity|ply/);
      };
      await check();
      await hub(); await resume(); await check();
      await checker.click();
      assert.match(await page.locator('.decision-dialog').innerText(),/3 ply/,'solved depth remains in the modal');
      await page.locator('.decision-dialog .close').click();
      await page.locator('#review-heading').evaluate(n=>n.scrollIntoView({block:'start'}));
      if (layout==='landscape') await checker.evaluate(n=>n.closest('.history-turn').scrollIntoView({block:'center'}));
      const cube=page.locator('#move-feedback [data-history-side="self"][data-decision-type="cube"]');
      const a=await cube.boundingBox(),b=await checker.boundingBox();
      assert.ok(Math.abs(b.width-a.width*2)<1,'Cube/Move keep their 1:2 proportions');
      const label=await cube.locator('.history-kind-label').boundingBox(),equity=await cube.locator('.history-equity').boundingBox();
      assert.ok(equity.y < label.y+label.height && equity.x > label.x,'cube equity stays beside its title');
      assert.equal(await cube.locator('.history-played-best').count(),0);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      assert.equal(await page.locator('.toast:not([hidden])').count(),0,'no caught application errors');
      await page.screenshot({path:path.join(out,`${name}-history-attempts-${layout}.png`)});
      const archived=await page.evaluate(async()=>(await import('/backgammon/core/storage.mjs')).get('items','history-attempts'));
      assert.equal(archived.events[1].initialDecision.revisions.length,1,'archived games retain all attempts');
      assert.equal(archived.events[1].choiceMethod,'play-best','the choice method survives archival');
      if (layout==='desktop') {
        for (const viewHint of [false,true]) {
          await hub();
          await page.evaluate(async () => {
            const st=await import('/backgammon/core/storage.mjs'), r=await import('/backgammon/core/rules.mjs');
            const work=await st.get('work','play');
            work.game.id='manual-best';work.game.events=work.game.events.slice(0,1);
            work.game.state=r.transition(work.game.initial,work.game.events[0].action,0);
            work.positionKey=r.positionKey(work.game.state);
            work.draft=r.legalTurns(work.game.state)[1].steps;
            await st.put('work',work);
          });
          await resume();
          if (viewHint) {
            await page.locator('#hint').click();
            await page.locator('.review-move[data-rank="1"]').waitFor();
            await page.locator('.decision-dialog .close').click();
            await waitWork(page,w=>w?.game.hintDecision);
            await hub(); await resume(); // Reloading must not turn a seen hint into Found.
          }
          await page.locator('#confirm').click();
          const manual=await waitWork(page,w=>w?.game.events.some(e=>e.action.type==='move'));
          assert.equal(manual.game.events[1].choiceMethod,viewHint?'hint':'manual');
          assert.equal(await checker.locator('.history-choice-method').innerText(),viewHint?'Hint':'Found');
        }
      }
      assert.deepEqual(errors,[]);
      report.push({layout,attempts:2,reload:true,archive:true,modalDepth:true});
    } catch (error) {
      await page.screenshot({path:path.join(out,`${name}-history-attempts-${layout}-failure.png`),fullPage:true});
      throw error;
    } finally {await context.close();}
  }
  return report;
};
