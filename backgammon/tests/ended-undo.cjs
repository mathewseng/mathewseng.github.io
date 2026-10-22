const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function endedUndo(browser,base,out,name){
  const report=[];
  for(const touch of [false,true]){
    const ctx=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1366,height:768},hasTouch:touch,reducedMotion:'reduce',serviceWorkers:'block'});
    const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
    const read=()=>page.evaluate(async()=>(await(await import('/backgammon/core/storage.mjs')).get('work','play')));
    const tap=locator=>touch?locator.tap():locator.click();
    try{
      await page.goto(base+'/backgammon/play/');await ready();
      for(const mode of ['computer','local']){
        // Preserve the previous page's checkpoint before installing a new mode.
        await page.goto(base+'/backgammon/');await ready();
        await page.evaluate(async mode=>{
          const {initialState,legalTurns}=await import('/backgammon/core/rules.mjs'),{playAction}=await import('/backgammon/core/table.mjs'),{put,saveSettings}=await import('/backgammon/core/storage.mjs'),{localConfig}=await import('/backgammon/core/play-session.mjs');
          const points=Array(24).fill(0);points[0]=1;points[23]=-15;
          const s=initialState({phase:'move',dice:[1,2],points,off:[14,0],matchLength:3,scores:[2,2]});
          const won=playAction({id:'ended-undo-'+mode,started:true,state:s,initial:s,events:[],names:['You','Opponent'],config:localConfig({mode,humanSide:0,tutor:false,warning:false,strength:'quick'})},{type:'move',steps:legalTurns(s)[0].steps});
          saveSettings({motion:'reduce',analysisAhead:false,equityBar:false});await put('work',{id:'play',game:won,draft:[]});
        },mode);
        await page.goto(base+'/backgammon/play/');await ready();await tap(page.locator('#resume-match'));
        const won=(await read()).game;
        assert.equal(won.state.phase,'over');assert.equal(await page.locator('#undo-turn').isEnabled(),true);
        await tap(page.locator('#undo-turn'));
        if(mode==='local'){
          assert.equal((await read()).game.state.phase,'over','opponent has not yet agreed');
          await tap(page.getByRole('button',{name:'Accept undo',exact:true}));
        }
        await page.waitForFunction(()=>document.querySelector('#confirm') && !document.querySelector('#confirm').disabled);
        let restored=await read();assert.deepEqual(restored.game.state,won.initial);assert.equal(restored.game.reviewingTurn,true);
        await page.waitForTimeout(220);assert.equal((await read()).game.state.phase,'move','forced winning turn stays open for review');
        await page.screenshot({path:path.join(out,`${name}-ended-undo-${mode}-${touch?'phone':'desktop'}.png`)});
        await page.reload();await ready();await tap(page.locator('#resume-match'));
        await page.waitForFunction(()=>document.querySelector('#confirm') && !document.querySelector('#confirm').disabled);
        assert.deepEqual((await read()).game.state,won.initial,'refresh preserves restored score and original dice');
        assert.equal(await page.locator('.confirm-status').count(),0,'no routine subtitle under Confirm');
        await tap(page.locator('#confirm'));
        await page.locator('#next-game').waitFor();
        assert.deepEqual((await read()).game.state,won.state,'replaying awards points once');
        report.push({mode,touch,forcedGameEndUndo:true,refresh:true,scoreRestored:true});
      }
      assert.deepEqual(errors,[]);
    }finally{await ctx.close();}
  }
  return report;
};
