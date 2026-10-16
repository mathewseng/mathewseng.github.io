const assert=require('node:assert/strict');
// Drive an actual future checker position that the scheduler prepared. Fixed
// test dice are installed before analysis, never selected from engine results.
module.exports=async function prethinkFuture(browser,base){
  const context=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage();
  const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  try {
    await page.goto(base+'/backgammon/play/');await ready();
    await page.evaluate(async()=>{
      const{put,saveSettings}=await import('/backgammon/core/storage.mjs');
      const{initialState}=await import('/backgammon/core/rules.mjs');
      const{localConfig,defaultPlayRules}=await import('/backgammon/core/play-session.mjs');
      const s=initialState({phase:'move',dice:[4,1],matchLength:0,rules:defaultPlayRules(0)});
      saveSettings({analysisAhead:true,motion:'reduce'});
      await put('work',{id:'play',game:{id:'future-hit',started:true,state:s,initial:s,events:[],names:['You','GNUbg'],config:localConfig(),localRolls:{version:1,seed:'1b'.padStart(64,'0'),cursor:0}},draft:[]});
    });
    await page.reload();await ready();
    await page.evaluate(async()=>{
      const{EngineClient}=await import('/backgammon/engine/client.mjs');
      const original=EngineClient.prototype.analyze;window.futureCalls=[];
      EngineClient.prototype.analyze=function(state,options={}){
        const row={state,options,began:performance.now()};futureCalls.push(row);
        return original.call(this,state,options).then(result=>{row.result=result;row.ms=performance.now()-row.began;return result;},error=>{row.error=error.name;throw error;});
      };
    });
    await page.locator('#resume-match').click();
    await page.waitForFunction(()=>futureCalls.some(r=>r.options.priority===-20&&r.state.phase==='move'&&r.state.turn===1&&r.state.dice.join()==='2,1'&&r.result),null,{timeout:180000});
    await page.locator('#hint').click();await page.locator('#use-hint').click();
    await page.keyboard.press('c');
    await page.waitForFunction(()=>futureCalls.some(r=>r.state.phase==='move'&&r.state.turn===1&&r.options.priority===undefined&&r.result),null,{timeout:60000});
    const report=await page.evaluate(()=>{
      const played=futureCalls.find(r=>r.state.phase==='move'&&r.state.turn===1&&r.options.priority===undefined&&r.result);
      const prepared=futureCalls.find(r=>r.options.priority===-20&&r.result?.positionKey===played.result.positionKey);
      return{retrievalMs:played.ms,preparationMs:prepared?.ms,dice:played.state.dice,plies:played.result.settings.plies,cached:played.result.cached,
        sameAnswer:JSON.stringify(prepared?.result.candidates)===JSON.stringify(played.result.candidates),
        preparedBeforePlay:futureCalls.indexOf(prepared)<futureCalls.indexOf(played)};
    });
    assert.deepEqual(report.dice,[2,1]);assert.equal(report.cached,true);
    assert.ok(report.plies>=2&&report.sameAnswer&&report.preparedBeforePlay);
    const saved=await page.evaluate(async()=>(await(await import('/backgammon/core/storage.mjs')).get('work','play')).game);
    assert.equal(saved.localRolls.cursor,1,'only the committed roll consumes the seed');
    assert.equal(saved.localRolls.seed,'1b'.padStart(64,'0'));
    return report;
  }finally{await context.close();}
};
