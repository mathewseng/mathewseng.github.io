// Preserve historical five-ply assets, consistent fallback grades and offline use.
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function deepOpeningBook(browser,base,out,name){
  const context=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  let measured;
  try{
    await page.goto(base+'/backgammon/');
    measured=await page.evaluate(async()=>{
      const {EngineClient}=await import('/backgammon/engine/client.mjs'),r=await import('/backgammon/core/rules.mjs');
      const {OpeningBook}=await import('/backgammon/engine/opening-book.mjs');
      const {shareURL}=await import('/backgammon/core/xgid.mjs');
      const client=new EngineClient({openingBook:new OpeningBook({preferDeep:true}),workerFactory:()=>{throw Error('Covered decision started WASM');}}),states=[],keys=[];
      try{
        const index=await client.book.load('deep/index.json');
        const initial=r.initialState({matchLength:0,phase:'move',dice:[3,1],rules:{cube:true,jacoby:true,immediateRedoubles:0}});
        states.push(...Object.keys(index.openings).map(roll=>({...initial,dice:[...roll].map(Number)})));
        for(const board of Object.keys(index.replies)){
          const v=board.split(',').map(Number),state={...initial,points:v.slice(0,24),bar:v.slice(24,26),off:v.slice(26)};
          // One ordinary roll and one double per branch, alternating sides.
          states.push({...state,dice:[3,1]}, {...state,turn:1,dice:[2,2],points:state.points.toReversed().map(n=>-n),bar:state.bar.toReversed(),off:state.off.toReversed()});
        }
        for(const state of states){
          const answer=await client.analyze(state,{preset:'auto'});
          if(answer.settings.plies!==5||answer.book?.id!==index.id)throw Error('Wrong book/depth');
          const actual=answer.candidates.at(-1),grade=await client.analyze(state,{preset:'auto',submitted:actual.steps});
          if(grade.settings.plies!==5||Math.abs(grade.error-(answer.candidates[0].equity-actual.equity))>1e-8)throw Error('Inconsistent grading');
          keys.push(answer.candidates[0].key);
        }
        // The retired rollout overlay no longer overrides any direct book position.
        const solverState=states[0];
        return {id:index.id,positions:states.length,states:[states[0],states.at(-1)],keys:[keys[0],keys.at(-1)],solverURL:shareURL(solverState)};
      }finally{client.destroy();}
    });
    for(const width of [1366,390]){
      await page.goto('about:blank');await page.setViewportSize({width,height:844});await page.goto(measured.solverURL);
      await page.waitForFunction(()=>document.querySelector('#analyze')?.textContent==='Analyze'&&document.body.textContent.includes('Deep opening book · 5 ply'));
      if(width<600)await page.locator('#panel-toggle').click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:path.join(out,`${name}-deep-book-solver-${width}.png`),fullPage:true,animations:'disabled'});
    }
    await page.goto(base+'/backgammon/reports/#opening-accuracy');
    await page.locator('#opening-accuracy-content table').first().waitFor();
    assert.equal(await page.locator('#opening-accuracy-content table').count(),3);
    assert.equal(await page.locator('#opening-accuracy-content tbody tr').count(),6);
    assert.equal(await page.locator('#opening-accuracy-content .error').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.locator('#opening-accuracy').screenshot({path:path.join(out,`${name}-deep-book-comparison.png`)});
    await page.setViewportSize({width:1366,height:1000});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.locator('#opening-accuracy').screenshot({path:path.join(out,`${name}-deep-book-comparison-desktop.png`)});
    assert.equal(requests.filter(u=>/\/engine\/vendor\/|\/engine\/worker/.test(u)).length,0,'precomputed decisions and report never start WASM');
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
  // An omitted reply must fall back to one real, consistent live depth;
  // a cached five-ply hint must never become a mixed-depth actual grade.
  const live=await browser.newContext({serviceWorkers:'block'}),livePage=await live.newPage();
  try{
    await livePage.goto(base+'/backgammon/');
    const grade=await livePage.evaluate(async()=>{
      const r=await import('/backgammon/core/rules.mjs'),{EngineClient}=await import('/backgammon/engine/client.mjs');
      const {OpeningBook}=await import('/backgammon/engine/opening-book.mjs');
      const client=new EngineClient({openingBook:new OpeningBook({preferDeep:true})});
      try{
        const index=await client.book.load('deep/index.json');let state,omitted;
        for(const [board,ref]of Object.entries(index.replies)){
          const shard=await client.book.load('deep/'+ref.file),v=board.split(',').map(Number);
          for(const [roll,entry]of Object.entries(shard.rolls)){
            if(entry.rows.length===entry.total)continue;
            state=r.initialState({matchLength:0,phase:'move',dice:[...roll].map(Number),points:v.slice(0,24),bar:v.slice(24,26),off:v.slice(26),rules:{cube:true,jacoby:true,immediateRedoubles:0}});
            const hint=await client.analyze(state,{preset:'standard'});
            if(hint.settings.plies!==5)throw Error('Missing cached five-ply hint');
            omitted=r.legalTurns(state).find(t=>!hint.candidates.some(c=>c.key===t.key));
            if(omitted)break;
          }
          if(omitted)break;
        }
        if(!omitted)throw Error('Expected a screened-out reply');
        const answer=await client.analyze(state,{preset:'standard',submitted:omitted.steps});
        if(answer.book||answer.settings.plies!==1||!answer.actual||!client.worker)throw Error('Unlisted move did not receive a real live grade');
        if(answer.candidates.length!==r.legalTurns(state).length)throw Error('Live Standard must include all legal candidates');
        if(Math.abs(answer.error-Math.max(0,answer.candidates[0].equity-answer.actual.equity))>1e-8)throw Error('Mixed-depth error');
        return {plies:answer.settings.plies,candidates:answer.candidates.length};
      }finally{client.destroy();}
    });
    assert.equal(grade.plies,1);measured.unlistedReplyLiveGrade=grade;
  }finally{await live.close();}
  // Playwright's WebKit offline emulation fails before SW interception, so
  // this real offline request check runs in Chromium; all engines run above.
  if(name==='chromium'){
    const offline=await browser.newContext(),tab=await offline.newPage();
    try{
      await tab.goto(base+'/backgammon/');
      await tab.evaluate(async()=>{await navigator.serviceWorker.register('/backgammon/sw.js',{scope:'/backgammon/'});await navigator.serviceWorker.ready;});
      await tab.reload();await tab.waitForFunction(()=>!!navigator.serviceWorker.controller);
      const lookup=async states=>{
        const {EngineClient}=await import('/backgammon/engine/client.mjs');
        const {OpeningBook}=await import('/backgammon/engine/opening-book.mjs');
        const client=new EngineClient({openingBook:new OpeningBook({preferDeep:true}),workerFactory:()=>{throw Error('Offline book started WASM');}});
        try{const keys=[];for(const state of states){const r=await client.analyze(state,{preset:'auto'});if(r.settings.plies!==5)throw Error('Lost five-ply source');keys.push(r.candidates[0].key);}return keys;}
        finally{client.destroy();}
      };
      assert.deepEqual(await tab.evaluate(lookup,measured.states),measured.keys);
      await offline.setOffline(true);await tab.reload();
      assert.deepEqual(await tab.evaluate(lookup,measured.states),measured.keys);
    }finally{await offline.close();}
  }
  return {id:measured.id,positions:measured.positions,historicalBook:true,solver:true,comparison:true,unlistedReplyLiveGrade:measured.unlistedReplyLiveGrade,offline:name==='chromium'};
};
