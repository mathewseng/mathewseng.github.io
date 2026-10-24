const assert=require('node:assert/strict');
const path=require('node:path');
const {seedOpening,work,waitWork}=require('./play-helpers.cjs');

module.exports=async(browser,base,out,name)=>{
  const report=[];
  for(const variant of [
    {touch:false,turn:0,viewport:{width:1366,height:768}},
    {touch:true,turn:0,viewport:{width:390,height:844}},
    {touch:true,turn:1,viewport:{width:844,height:390}},
  ]){
    const {touch,turn,viewport}=variant;
    const ctx=await browser.newContext({viewport,hasTouch:touch,serviceWorkers:'block',reducedMotion:'no-preference'});
    const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
    const load=async(kind)=>{
      await seedOpening(page,[1,2]);
      await page.goto(base+'/backgammon/');await ready();
      await page.evaluate(async({kind,turn})=>{
        const {initialState}=await import('/backgammon/core/rules.mjs');
        const {put,saveSettings}=await import('/backgammon/core/storage.mjs');
        const {playAction}=await import('/backgammon/core/table.mjs');
        const {localConfig}=await import('/backgammon/core/play-session.mjs');
        const points=Array(24).fill(0);for(let i=0;i<6;i++)points[i]=2;points[5]=5;points[17]=-14;
        if(['open','miss'].includes(kind)){points[5]=1;points[4]+=4;}
        const s=initialState({phase:'roll',points:turn?points.toReversed().map(n=>-n):points,
          bar:turn?[1,0]:[0,1],turn,matchLength:0,cube:{value:2,owner:kind==='cube'?turn:1-turn}});
        saveSettings({motion:'full',orientation:turn,analysisAhead:false,equityBar:false,moveFeedback:false});
        let game={id:'closed-opponent',started:true,initial:s,state:s,events:[],
          ...(kind==='review'?{reviewingTurn:true}:{}),names:['White','Black'],
          config:localConfig({mode:'computer',humanSide:turn,tutor:false,warning:false,strength:'quick'})};
        if(kind==='miss'){
          game.initial={...s,phase:'move',turn:1-turn,dice:[1,2]};game.state=game.initial;
          game=playAction(game,{type:'move',steps:[]});
        }
        await put('work',{id:'play',draft:[],game});
      },{kind,turn});
      await page.goto(base+'/backgammon/play/#resume=closed-opponent');await ready();
    };
    try{
      // No gesture is needed, but leave enough time to see the previous move.
      await load('closed');
      await page.waitForFunction(()=>document.querySelector('#board .board-caption text')?.textContent.includes('to roll'));
      const caption=page.locator('#board .board-caption text').first();
      assert.equal(await caption.textContent(),`${touch?'Tap':'Click'} to roll`);
      assert.equal(await caption.getAttribute('x'),'610','always use the right dice area with no previous dice');
      await page.screenshot({path:path.join(out,`${name}-closed-opponent-${touch?turn?'landscape':'portrait':'desktop'}.png`)});
      const rolled=await waitWork(page,w=>w?.game.state.phase==='move');
      assert.deepEqual(rolled.game.events.map(e=>e.action),[{type:'roll',dice:[1,2]}]);
      assert.equal(rolled.game.localRolls.cursor,1);
      await page.waitForTimeout(950);
      assert.equal((await work(page)).game.localRolls.cursor,1,'do not repeat a committed roll');

      await load('miss');
      const afterMiss=await waitWork(page,w=>w?.game.events.length===2);
      assert.deepEqual(afterMiss.game.events.map(e=>e.action),[{type:'move',steps:[]},{type:'roll',dice:[1,2]}]);
      assert.equal(afterMiss.game.localRolls.cursor,1);

      // Opening a menu pauses the timer, and closing it resumes automatically.
      await load('closed');
      await page.locator('#preferences')[touch?'tap':'click']();
      await page.waitForTimeout(1100);
      assert.equal((await work(page)).game.events.length,0,'no background roll while a dialog is open');
      await page.locator('.settings-dialog .close')[touch?'tap':'click']();
      await waitWork(page,w=>w?.game.state.phase==='move');

      for(const kind of ['cube','open','review']){
        await load(kind);await page.waitForTimeout(1200);
        const saved=(await work(page)).game;
        assert.equal(saved.state.phase,'roll',`${kind} stays manual`);
        assert.equal(saved.events.length,0);
        assert.equal(await page.locator('#board .board-caption text').first().getAttribute('x'),'610');
      }
      assert.deepEqual(errors,[]);report.push({...variant,automatic:true,failedEntry:true,dialogPause:true,legalCubePreserved:true,openEntryManual:true,reviewManual:true});
    }finally{await ctx.close();}
  }
  return report;
};
