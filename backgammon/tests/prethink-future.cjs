const assert=require('node:assert/strict');
// Drive an actual future checker position that the scheduler prepared. Fixed
// test dice are installed before analysis, never selected from engine results.
async function runCase(browser,base,matchLength){
  const context=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage();
  const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  try {
    await page.goto(base+'/backgammon/play/');await ready();
    await page.evaluate(async matchLength=>{
      const{put,saveSettings}=await import('/backgammon/core/storage.mjs');
      const{initialState}=await import('/backgammon/core/rules.mjs');
      const{localConfig,defaultPlayRules}=await import('/backgammon/core/play-session.mjs');
      const s=initialState({phase:'move',dice:[4,1],matchLength,rules:defaultPlayRules(matchLength)});
      saveSettings({analysisAhead:true,motion:'reduce'});
      await put('work',{id:'play',game:{id:'future-hit',started:true,state:s,initial:s,events:[],names:['You','GNUbg'],config:localConfig(),localRolls:{version:1,seed:'1b'.padStart(64,'0'),cursor:0}},draft:[]});
    },matchLength);
    await page.reload();await ready();
    await page.evaluate(async()=>{
      const{EngineClient}=await import('/backgammon/engine/client.mjs');
      const original=EngineClient.prototype.analyze;window.futureCalls=[];
      EngineClient.prototype.analyze=function(state,options={}){
        const row={state,options,began:performance.now()};futureCalls.push(row);
        return original.call(this,state,{...options,onEvaluation:result=>{
          if(result.settings?.plies>=3){row.ready=result;row.readyMs=performance.now()-row.began;}
          options.onEvaluation?.(result);
        }}).then(result=>{row.result=result;row.ms=performance.now()-row.began;row.ready=result;row.readyMs=row.ms;return result;},error=>{row.error=error.name;throw error;});
      };
    });
    await page.locator('#resume-match').click();
    // Optional fourth ply may still be running (or hit the background deadline).
    // A completed three-ply checkpoint is already playable and must be reused.
    await page.waitForFunction(()=>futureCalls.some(r=>r.options.priority===-20&&r.state.phase==='move'&&r.state.turn===1&&r.state.dice.join()==='2,1'&&r.ready),null,{timeout:180000});
    await page.locator('#hint').click();await page.locator('#undo-play-best').click();
    await page.waitForFunction(()=>futureCalls.some(r=>r.state.phase==='move'&&r.state.turn===1&&r.options.priority===undefined&&r.result),null,{timeout:60000});
    const report=await page.evaluate(()=>{
      const played=futureCalls.find(r=>r.state.phase==='move'&&r.state.turn===1&&r.options.priority===undefined&&r.result);
      const prepared=futureCalls.find(r=>r.options.priority===-20&&r.ready?.positionKey===played.result.positionKey);
      return{retrievalMs:played.ms,preparationMs:prepared?.readyMs,dice:played.state.dice,plies:played.result.settings.plies,method:played.result.method,bookSource:played.result.book?.source,referenceURL:played.result.reference?.url,cached:played.result.cached,
        sameAnswer:JSON.stringify(prepared?.ready.candidates)===JSON.stringify(played.result.candidates),
        preparedBeforePlay:futureCalls.indexOf(prepared)<futureCalls.indexOf(played)};
    });
    assert.deepEqual(report.dice,[2,1]);assert.equal(report.cached,true);
    assert.ok(report.sameAnswer&&report.preparedBeforePlay,JSON.stringify(report));
    if(matchLength===0){assert.equal(report.method,'reference');assert.equal(report.plies,null);assert.equal(report.bookSource,'published-xg-reference');assert.match(report.referenceURL,/^https:\/\/www\.extremegammon\.com\/OB\//);}
    else assert.ok(report.plies>=3&&report.method!=='reference',JSON.stringify(report));
    // Cached bot decisions can now finish before the asynchronous work save.
    // Wait for the committed roll's acknowledgement, not the prior draft.
    const saved=(await require('./play-helpers.cjs').waitWork(page,w=>w?.game.localRolls.cursor===1)).game;
    assert.equal(saved.localRolls.cursor,1,'only the committed roll consumes the seed');
    assert.equal(saved.localRolls.seed,'1b'.padStart(64,'0'));
    return report;
  }finally{await context.close();}
};

module.exports=async(browser,base)=>({reference:await runCase(browser,base,0),tree:await runCase(browser,base,7)});
