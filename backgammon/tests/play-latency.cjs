// Real Play controls, IndexedDB, random-roll transitions and bundled GNUbg.
// Instrument timing only: never replace the engine or feed it canned answers.
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
module.exports = async function playLatency(browser, base, out, name) {
  const context = await browser.newContext({ viewport: {width:1366,height:768}, serviceWorkers:'block' });
  const page = await context.newPage(), errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  const saved=()=>page.evaluate(async()=> (await (await import('/backgammon/core/storage.mjs')).get('work','play')).game);
  // Playwright's waitForFunction treats an async predicate as a truthy Promise;
  // poll IndexedDB from Node so timing ends only after the actual transition.
  const waitSaved=async predicate=>{
    const deadline=Date.now()+180000;
    while(Date.now()<deadline){const game=await saved();if(await predicate(game))return game;await page.waitForTimeout(25);}
    throw new Error('Timed out waiting for a committed decision');
  };
  const warning=()=>page.locator('dialog[open]').getByRole('button',{name:'Confirm anyway',exact:true});
  const rows=[];
  try {
    await page.goto(base+'/backgammon/play/'); await ready();
    await page.evaluate(async()=>{
      const {put,saveSettings}=await import('/backgammon/core/storage.mjs');
      const {initialState}=await import('/backgammon/core/rules.mjs');
      const {localConfig,defaultPlayRules}=await import('/backgammon/core/play-session.mjs');
      saveSettings({equityBar:false,analysisAhead:true,motion:'full'});
      const s=initialState({phase:'move',dice:[4,1],matchLength:0,rules:defaultPlayRules(0)});
      await put('work',{id:'play',game:{id:'latency-game',started:true,state:s,initial:s,events:[],names:['You','GNUbg'],config:localConfig(),localRolls:{version:1,seed:'1b'.padStart(64,'0'),cursor:0}},draft:[]});
    });
    await page.reload(); await ready();
    await page.evaluate(async()=>{
      const {EngineClient}=await import('/backgammon/engine/client.mjs');
      window.latency={calls:[],starts:[],cancels:[]};
      const analyze=EngineClient.prototype.analyze, start=EngineClient.prototype.start, cancel=EngineClient.prototype.cancelActive;
      EngineClient.prototype.start=function(...args){if(!this.ready&&!this.initializing)latency.starts.push(performance.now());return start.apply(this,args);};
      EngineClient.prototype.cancelActive=function(message){latency.cancels.push({at:performance.now(),priority:this.active?.priority,phase:this.active?.state.phase});return cancel.call(this,message);};
      EngineClient.prototype.analyze=function(state,opts={}){
        const row={at:performance.now(),sequence:state.sequence,phase:state.phase,turn:state.turn,priority:opts.priority??10,submitted:!!opts.submitted};latency.calls.push(row);
        return analyze.call(this,state,opts).then(result=>{Object.assign(row,{ms:performance.now()-row.at,cached:!!result.cached,reusedHint:!!result.reusedHint,preparation:result.preparation,plies:result.settings.plies,reason:result.budget?.reason,levels:result.budget?.levels});return result;},error=>{Object.assign(row,{ms:performance.now()-row.at,error:error.name});throw error;});
      };
    });
    await page.locator('#resume-match').click();
    const thinkMs=Number(process.env.BG_THINK_MS||2000), turns=Number(process.env.BG_BENCH_TURNS||4);
    for(let turn=0;turn<turns;turn++) {
      let game=await saved();
      if(game.state.phase==='over')break;
      if(game.state.phase==='roll') {
        const rollSequence=game.state.sequence;
        const began=Date.now();await page.locator('#roll').evaluate(b=>b.click());
        await waitSaved(async g=>g.state.sequence>rollSequence||await warning().count());
        if(await warning().count()) await warning().click();
        await waitSaved(g=>g.state.sequence>rollSequence);
        rows.push({turn,action:'roll',waitMs:Date.now()-began});
      }
      await page.waitForTimeout(thinkMs);
      game=await waitSaved(g=>g.state.turn===0||g.state.phase==='double'||g.state.phase==='over');
      if(game.state.phase!=='move') {console.log(`${name} turn ${turn+1}: automatic pass/forced turn`);continue;}
      // The same accessible legal-step control used by keyboard/screen-reader players.
      for(let step=0;step<4 && await page.locator('#confirm').isDisabled();step++) {
        await page.locator('#draft-controls select').selectOption({index:1},{force:true});
        await page.waitForTimeout(250);
      }
      assert.equal(await page.locator('#confirm').isDisabled(),false);
      const began=Date.now(), seq=(await saved()).state.sequence;
      await page.locator('#confirm').click();
      await waitSaved(async g=>g.state.sequence>seq||await warning().count());
      const confirmMs=Date.now()-began;
      if(await warning().count()) await warning().click();
      game=await waitSaved(g=>g.state.sequence>seq&&(g.state.turn===0||g.state.phase==='double'||g.state.phase==='over'));
      rows.push({turn,action:'confirm',waitMs:confirmMs,withBotReplyMs:Date.now()-began,state:game.state});
      console.log(`${name} turn ${turn+1}: confirm ${confirmMs} ms, with bot ${Date.now()-began} ms; ${game.state.phase}/${game.state.turn}/${game.state.sequence}`);
      if(game.state.phase==='double') break;
    }
    const game=await saved();
    const verified=await page.evaluate(async()=>{
      const{get}=await import('/backgammon/core/storage.mjs');const{replay}=await import('/backgammon/core/rules.mjs');const g=(await get('work','play')).game;
      return JSON.stringify(replay(g.initial,g.events).at(-1))===JSON.stringify(g.state);
    });
    assert.ok(verified); assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(out,`${name}-play-latency.png`)});
    const trace=await page.evaluate(()=>latency);
    assert.ok(trace.calls.filter(c=>c.plies!==undefined).every(c=>c.plies>=2),'every completed Auto result reaches at least two plies');
    const engine=await page.evaluate(async()=>({version:(await import('/backgammon/engine/metadata.mjs')).ENGINE_VERSION,policy:(await import('/backgammon/engine/search-policy.mjs')).SEARCH_POLICY_VERSION}));
    return {recordedAt:new Date().toISOString(),environment:{cpu:os.cpus()[0].model,os:`${os.platform()} ${os.release()} ${os.arch()}`,browser:`${name} ${browser.version()}`},
      engine,thinkMs,method:'Assembled site, real WASM, Auto for both sides, default Jacoby/beavers/raccoons, thinkMs pause plus 250ms per checker step, real animations, fixed test seed, indexed HMAC-SHA256 rolls. No fake engine or preloaded recommendations. Accessible move selector picks first legal step; costly-move warning is accepted. Local HTTP, desktop, not a phone benchmark. Timing includes UI and persistence; trace separates engine requests.',rows,trace,events:game.events.length,replayVerified:verified};
  } finally {
    require('node:fs').writeFileSync(path.join(out,`${name}-play-latency-partial.json`),JSON.stringify({rows,trace:await page.evaluate(()=>window.latency).catch(()=>null)},null,2));
    await context.close();
  }
};
