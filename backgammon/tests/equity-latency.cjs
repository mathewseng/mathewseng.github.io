const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function equityLatency(browser, base, out, name) {
  const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,
    isMobile:true,serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await context.newPage(), errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  try {
    // A component fixture has no hub/app handlers left behind after replacing
    // markup; all production board, rail, client and worker modules are real.
    await page.route('**/__equity-test', route=>route.fulfill({contentType:'text/html',body:
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/shared/tokens.css"><link rel="stylesheet" href="/backgammon/styles.css"><style>#board .bg-board{max-height:calc(100dvh - 70px)}</style><body></body>'}));
    await page.goto(base+'/__equity-test');
    await page.evaluate(async()=>{
      const [{Board},{EquityBar},{EngineClient},rules,storage]=await Promise.all([
        import('/backgammon/ui/board.mjs'),import('/backgammon/ui/equity-bar.mjs'),
        import('/backgammon/engine/client.mjs'),import('/backgammon/core/rules.mjs'),import('/backgammon/core/storage.mjs')]);
      storage.saveSettings({equityBar:true});
      (await import('/backgammon/core/appearance.mjs')).applyBoardTheme(storage.readSettings().boardTheme);
      document.body.innerHTML='<main><div id="board" class="board-slot"></div><button id="toggle">Equity bar</button></main>';
      Object.assign(window,{Board,EquityBar,EngineClient,rules,workers:[],replyAutomatically:false,failures:0});
      window.source=rules.initialState({phase:'move',dice:[3,1]});
      window.board=new Board(document.querySelector('#board'));
      board.render(source,{interactive:false});
      window.answer=(equity=.125,plies=0)=>({status:'complete',type:'checker',perspective:0,
        units:'current-cube-points',settings:{plies,name:plies?'Expert':'Quick'},candidates:[{key:'best',equity}]});
      class MockWorker {
        constructor(){this.messages=[];this.terminated=false;workers.push(this);}
        postMessage(message){
          this.messages.push(message);
          if(message.type==='init')queueMicrotask(()=>this.reply({id:0,type:'ready',elapsedMs:1}));
          if(message.type==='analyze' && replyAutomatically)setTimeout(()=>{
            if(this.terminated)return;
            if(failures-->0)this.onerror({message:'Temporary engine failure'});
            else this.reply({id:message.id,type:'result',result:answer()});
          },10);
        }
        reply(data){this.onmessage({data});}
        terminate(){this.terminated=true;}
      }
      window.client=new EngineClient({openingBook:null,workerFactory:()=>new MockWorker()});
      window.bar=new EquityBar(board,document.querySelector('#toggle'));
      window.setSource=()=>bar.set({state:source,engine:client,auto:true,preset:'auto',beforeDecision:true});
      setSource();
    });
    await page.waitForFunction(()=>client.active);
    assert.equal(await page.evaluate(()=>client.active.preset),'quick','display does not initiate another Auto search');
    await page.evaluate(()=>{
      replyAutomatically=true;
      client.cancel(); // Previously left the same-key bar permanently loading.
    });
    await page.locator('#equity-bar[data-state="ready"]').waitFor({timeout:5000});
    assert.equal(await page.evaluate(()=>workers.length),2,'one automatic retry after cancellation');
    assert.equal(await page.locator('.equity-bottom-number').textContent(),'0.125');
    await page.evaluate(()=>{
      client.rememberReading({key:'expert',preset:'expert',state:source},answer(.347,3));
    });
    assert.equal(await page.locator('.equity-bottom-number').textContent(),'0.347','deeper results arrive without UI action');
    await page.evaluate(()=>{
      client.rememberReading({key:'late-quick',preset:'quick',state:source},answer(.22,0));
      client.fail(new Error('Unrelated deeper search failed'));
    });
    assert.equal(await page.locator('.equity-bottom-number').textContent(),'0.347','later shallow stages/errors retain useful completed equity');

    const cached=await page.evaluate(()=>{
      source={...source,dice:[5,2]};
      client.rememberReading({key:'another-preset',preset:'research',state:source},answer(.456,4));
      const previous=workers.length;setSource();
      return {previous,workers:workers.length,value:bar.label.textContent,state:bar.node.dataset.state,listeners:client.readingListeners.size};
    });
    assert.equal(cached.state,'ready');assert.equal(cached.value,'0.456');
    assert.equal(cached.workers,cached.previous,'cached different-preset reading is synchronous');
    assert.equal(cached.listeners,1,'replacing positions detaches previous observer');

    await page.evaluate(()=>{
      source={...source,dice:[6,1]};failures=1;setSource();
      client.rememberReading({key:'stale',preset:'expert',state:{...source,dice:[3,1]}},answer(9,3));
    });
    assert.notEqual(await page.locator('.equity-bottom-number').textContent(),'9.000');
    await page.locator('#equity-bar[data-state="ready"]').waitFor({timeout:5000});
    assert.equal(await page.locator('.equity-bottom-number').textContent(),'0.125','transient worker error retries automatically');

    await page.evaluate(()=>{
      Object.defineProperty(document,'hidden',{configurable:true,value:true});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.evaluate(()=>client.readingListeners.size),0);
    await page.evaluate(()=>{
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.locator('#equity-bar[data-state="ready"]').waitFor();
    assert.equal(await page.evaluate(()=>client.readingListeners.size),1,'foreground resumes without changing a checker');
    await page.evaluate(()=>{source={...source,dice:[6,2]};failures=99;setSource();});
    await page.locator('#equity-bar[data-state="error"]').waitFor({timeout:6000});
    const failedWorkers=await page.evaluate(()=>workers.length);
    await page.waitForTimeout(1400);
    assert.equal(await page.evaluate(()=>workers.length),failedWorkers,'permanent failures cannot spawn an endless retry loop');
    await page.evaluate(()=>{failures=0;});
    await page.getByRole('button',{name:'Retry',exact:true}).click();
    await page.locator('#equity-bar[data-state="ready"]').waitFor();
    await page.evaluate(()=>{bar.destroy();client.destroy();});
    assert.equal(await page.evaluate(()=>client.readingListeners.size),0);

    // Real shipped GNUbg on a phone-sized page. Chromium is throttled 4x;
    // WebKit provides an independent browser path without simulated throttling.
    if(name==='chromium'){
      const cdp=await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    }
    const timings=await page.evaluate(async()=>{
      client=new EngineClient({openingBook:null});
      bar=new EquityBar(board,document.querySelector('#toggle'));
      const timings=[];
      const waitReady=async()=>{
        const end=performance.now()+60000;
        while(bar.node.dataset.state!=='ready'){
          if(bar.node.dataset.state==='error')throw Error(bar.node.title);
          if(performance.now()>end)throw Error('Equity did not load');
          await new Promise(r=>setTimeout(r,10));
        }
      };
      source=rules.initialState({phase:'move',dice:[6,4]});
      board.render(source,{interactive:false});
      let start=performance.now();setSource();await waitReady();
      timings.push({context:'cold checker',firstMs:performance.now()-start});
      // Start an actual fixed-depth evaluation before mounting its equity:
      // its quick stage must be visible well before the requested 3 ply finishes.
      source={...source,dice:[5,2]};board.render(source,{interactive:false});
      start=performance.now();
      const full=client.analyze(source,{preset:'expert',priority:-5,useBook:false});
      setSource();await waitReady();
      const firstMs=performance.now()-start, firstTitle=bar.node.title;
      const result=await full;
      timings.push({context:'fixed 3-ply checker',firstMs,fullMs:performance.now()-start,
        firstTitle,finalTitle:bar.node.title,finalPlies:result.settings.plies});
      const next=rules.transition(source,{type:'move',steps:rules.legalTurns(source)[0].steps},source.turn);
      for(const state of [next,{...next,phase:'move',dice:[4,1]},
        rules.initialState({phase:'move',dice:[6,1],points:Array.from({length:24},(_,i)=>i===5?4:i===3?4:i===2?2:i===1?2:i===0?1:i===18?-5:i===20?-5:i===22?-5:0),off:[2,0]})]){
        source=state;board.render(source,{interactive:false});start=performance.now();setSource();await waitReady();
        timings.push({context:source.off[0]?'bearing off':source.phase,firstMs:performance.now()-start,title:bar.node.title});
      }
      const warmWorker=client.worker;
      for(let i=0;i<20;i++){
        source={...source,dice:i%2?[6,1]:[3,2]};setSource();await waitReady();
        if(client.readingListeners.size!==1)throw Error('Reading listeners accumulated');
        if(client.worker!==warmWorker)throw Error('Completed turns restarted the warm worker');
      }
      return timings;
    });
    assert.equal(timings[1].finalPlies,3,'actual decision still completes requested depth');
    assert.match(timings[1].firstTitle,/Quick/);
    assert.match(timings[1].finalTitle,/Expert/);
    for(const sample of timings.slice(1))assert.ok(sample.firstMs<2500,JSON.stringify(sample));
    assert.equal(page.workers().filter(w=>w.url().includes('/engine/worker.mjs')).length,1,'one shared native worker');
    await page.screenshot({path:path.join(out,`${name}-equity-latency-portrait.png`)});
    await page.setViewportSize({width:844,height:390});
    await page.waitForTimeout(100);
    await page.screenshot({path:path.join(out,`${name}-equity-latency-landscape.png`)});
    assert.deepEqual(errors,[]);
    return {cpuSlowdown:name==='chromium'?4:1,timings,workerCount:1,
      coverage:'cancellation, transient/permanent failure, automatic retry, hidden/resume, cross-preset cache, stale results, depth upgrades, bounded subscriptions, real GNUbg checker/cube/bearoff'};
  } finally {await context.close();}
};
