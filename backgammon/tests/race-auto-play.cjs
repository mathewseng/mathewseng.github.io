const assert=require('node:assert/strict'),path=require('node:path');
const {seedOpening,waitWork,work}=require('./play-helpers.cjs');

module.exports=async(browser,base,out,name)=>{
  const reports=[];
  for(const variant of [
    {touch:false,turn:0,viewport:{width:1366,height:768}},
    {touch:true,turn:0,viewport:{width:390,height:844}},
    {touch:true,turn:1,viewport:{width:844,height:390}},
  ]) {
    const {touch,turn,viewport}=variant;
    const context=await browser.newContext({viewport,hasTouch:touch,serviceWorkers:'block',reducedMotion:'no-preference'});
    const page=await context.newPage(),errors=[];
    if(touch&&name==='chromium')await(await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate',{rate:4});
    page.on('pageerror',e=>errors.push(e.message));
    const caption=page.locator('#board .board-caption'),verb=touch?'tap':'click';
    await seedOpening(page,[6,6,6,5,1,2]);
    const load=async(kind='no-cube',scale=.5)=>{
      console.log(`${name}: race ${viewport.width} ${kind}`);
      await page.goto(base+'/backgammon/');
      await page.evaluate(async({turn,kind,scale})=>{
        const {initialState}=await import('/backgammon/core/rules.mjs');
        const {put,saveSettings}=await import('/backgammon/core/storage.mjs');
        const {localConfig}=await import('/backgammon/core/play-session.mjs');
        const points=Array(24).fill(0);points[2]=15;points[21]=-15;
        const state=initialState({phase:'roll',points,turn,matchLength:0,
          cube:kind==='no-cube'?{value:1,owner:null}:{value:2,owner:kind.startsWith('offer-')?1-turn:turn},
          rules:kind==='no-cube'?{cube:false,jacoby:false,automaticDoubles:0,immediateRedoubles:0}:{cube:true,jacoby:true,immediateRedoubles:2}});
        saveSettings({motion:'full',motionScale:scale,analysisAhead:false,equityBar:false,moveFeedback:false,orientation:turn});
        await put('work',{id:'play',draft:[],game:{id:'race-auto-'+kind,started:true,initial:state,state,events:[],names:['White','Black'],
          config:localConfig({mode:'computer',humanSide:turn,tutor:false,warning:false,strength:'quick',reviewStrength:'quick'})}});
      },{turn,kind,scale});
      await page.goto(base+'/backgammon/play/#resume=race-auto-'+kind);
      await page.locator('#board.roll-ready').waitFor();
      if(kind!=='no-cube')await page.evaluate(async kind=>{
        // Deterministic boundary/failure fixtures at the engine seam. Rolling,
        // forced play, bot turns, gestures, persistence and scheduling are real.
        const {EngineClient}=await import('/backgammon/engine/client.mjs');
        const {positionKey}=await import('/backgammon/core/rules.mjs');
        const {clearRaceCubeAction}=await import('/backgammon/core/race-auto-play.mjs');
        const analyze=EngineClient.prototype.analyze;
        EngineClient.prototype.analyze=function(s,options={}){
          if(kind==='native')return analyze.call(this,s,options).then(result=>{
            if(options.preset==='expert')window.raceNative={action:clearRaceCubeAction(s,result),plies:result.settings.plies};
            return result;
          });
          const cube=outcomes=>({type:'cube',status:'complete',available:true,perspective:s.turn,positionKey:positionKey(s),
            engine:'fixture',settings:{plies:3,cubeful:true,noise:0},units:'current-cube-points',outcomes});
          if(kind.startsWith('offer-')&&options.preset==='quick'&&s.phase==='roll')
            return Promise.resolve({...cube([-.4,.2,1]),action:'double'});
          if(kind.startsWith('offer-')&&options.preset==='expert'&&s.phase==='double') {
            const answer=cube([0,kind==='offer-pass'?1.5:kind==='offer-close'?.99:.5,1]);
            if(kind==='offer-close')return new Promise(resolve=>{window.finishRaceCube=()=>resolve(answer);});
            return Promise.resolve(answer);
          }
          if(options.preset==='expert'&&s.phase==='roll'){
            if(kind==='failure')return Promise.reject(Error('fixture unavailable'));
            const answer={type:'cube',status:'complete',available:true,perspective:s.turn,positionKey:positionKey(s),
              engine:'fixture',settings:{plies:3,cubeful:true,noise:0},units:'current-cube-points',
              outcomes:[0,kind==='close'?-.01:-.3,1]};
            if(kind==='delayed')return new Promise(resolve=>{window.finishRaceCube=()=>resolve(answer);});
            return Promise.resolve(answer);
          }
          return analyze.call(this,s,options);
        };
      },kind);
    };
    const tap=async(n=1)=>{
      const box=await page.locator('#board .bg-board').boundingBox();
      for(let i=0;i<n;i++){
        const x=box.x+box.width*610/876,y=box.y+box.height*330/660;
        if(touch)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
      }
    };
    const nextRoll=w=>w?.game.state.phase==='roll'&&w.game.state.turn===turn&&w.game.localRolls?.cursor===2;
    try {
      await load();
      assert.deepEqual(await caption.locator('text').allTextContents(),[`${touch?'Tap':'Click'} to roll`,`Double ${verb} to auto play`]);
      await page.screenshot({path:path.join(out,`${name}-race-prompt-${viewport.width}.png`)});
      await tap();await waitWork(page,nextRoll);
      await page.waitForTimeout(700);assert.equal((await work(page)).game.localRolls.cursor,2,'single tap never opts in');

      await load();await tap(2);
      const choice=await waitWork(page,w=>w?.game.localRolls?.cursor===3&&w.game.state.phase==='move');
      assert.equal(choice.game.state.turn,turn);
      assert.deepEqual(choice.game.events.filter(e=>e.action.type==='roll').map(e=>e.action.dice),[[6,6],[6,5],[1,2]]);
      assert.equal(choice.game.events.filter(e=>e.action.type==='move'&&e.actor===turn).length,1,'only the fully forced checker turn commits');
      assert.ok(!(await caption.textContent()).includes('Auto play on'),'stops for a checker choice');
      await page.waitForTimeout(700);assert.equal((await work(page)).game.localRolls.cursor,3);
      await page.screenshot({path:path.join(out,`${name}-race-choice-${viewport.width}.png`)});

      await load();await tap(2);
      await page.locator('#preferences')[touch?'tap':'click']();
      await waitWork(page,nextRoll);await page.waitForTimeout(700);
      assert.equal((await work(page)).game.localRolls.cursor,2,'settings pause auto play');
      await page.locator('.settings-dialog .close')[touch?'tap':'click']();
      await waitWork(page,w=>w?.game.localRolls?.cursor===3&&w.game.state.phase==='move');

      await load('no-cube',2);await tap(2);
      await page.waitForFunction(()=>document.querySelector('#board .board-caption')?.textContent.includes('Auto play on'));
      await caption.locator('.board-caption-hit')[touch?'tap':'click']();
      await waitWork(page,nextRoll);await page.waitForTimeout(1100);
      assert.equal((await work(page)).game.localRolls.cursor,2,'tap to stop prevents the next roll');

      await load('no-cube',2);await tap(2);await waitWork(page,nextRoll);
      await page.reload();await page.locator('#board.roll-ready').waitFor();
      await page.waitForTimeout(1100);
      assert.equal((await work(page)).game.localRolls.cursor,2,'reload does not resume automatic intent');

      for(const kind of ['clear','close','failure','delayed']) {
        await load(kind);await tap(2);
        if(kind==='clear'){
          const continued=await waitWork(page,w=>w?.game.localRolls?.cursor===3);
          assert.equal(continued.game.events.filter(e=>e.action.type==='roll').at(-1).evaluation.result.actualDecision,'roll');
        } else {
          await waitWork(page,nextRoll);
          if(kind==='delayed') {
            await page.waitForFunction(()=>typeof window.finishRaceCube==='function');
            await caption.locator('.board-caption-hit')[touch?'tap':'click']();
            await page.evaluate(()=>window.finishRaceCube());
          }
          await page.waitForFunction(()=>!document.querySelector('#board .board-caption')?.textContent.includes('Auto play on'));
          await page.waitForTimeout(650);
          assert.equal((await work(page)).game.localRolls.cursor,2,kind+' leaves the cube choice before rolling');
        }
      }
      for(const kind of ['offer-take','offer-pass','offer-close']) {
        await load(kind);await tap(2);
        if(kind==='offer-close') {
          await page.waitForFunction(()=>typeof window.finishRaceCube==='function');
          assert.ok(await page.locator('.board-cube-replies').isHidden(),'cube buttons do not overlap the auto-play stop prompt');
          assert.ok(await caption.locator('.board-caption-hit').isVisible());
          await page.evaluate(()=>window.finishRaceCube());
          await page.locator('#take-cube').waitFor({state:'visible'});
          assert.ok(await page.locator('#drop-cube').isVisible());
          await page.screenshot({path:path.join(out,`${name}-race-cube-choice-${viewport.width}.png`)});
          await page.waitForTimeout(650);
          assert.equal((await work(page)).game.state.phase,'double','close offer remains a human decision');
        } else {
          const reply=kind==='offer-pass'?'pass':'take';
          const handled=await waitWork(page,w=>w?.game.events.some(e=>e.actor===turn&&e.action.type===reply));
          assert.ok(handled.game.events.some(e=>e.action.type==='double'));
          assert.equal(handled.game.events.find(e=>e.actor===turn&&e.action.type===reply).evaluation.result.error,0);
          if(reply==='pass')assert.equal(handled.game.state.phase,'over');
          else await waitWork(page,w=>w?.game.localRolls?.cursor===3&&w.game.state.phase==='move');
        }
      }
      await load('native');await tap(2);
      await page.waitForFunction(()=>window.raceNative,{},{timeout:60000});
      const native=await page.evaluate(()=>window.raceNative);
      assert.ok(native.plies>=3,'real GNUbg reached the minimum cube depth');
      if(native.action) {
        const played=await waitWork(page,w=>w?.game.events.length>4);
        assert.equal(played.game.events[4].action.type,native.action.type,'real engine drives the automatic cube action');
      } else {
        await waitWork(page,nextRoll);
        assert.ok(!(await caption.textContent()).includes('Auto play on'),'real close cube stops before rolling');
      }
      assert.deepEqual(errors,[]);
      reports.push({...variant,cpuSlowdown:touch&&name==='chromium'?4:1,forcedRun:true,checkerChoiceStop:true,
        cubeBoundary:true,failedAnalysisStop:true,lateResultIgnored:true,manualStop:true,nativeCube:native});
    } finally {await context.close();}
  }
  return reports;
};
