const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async(browser,base,out,name)=>{
 const ctx=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block',reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.stack));
 const waitForRoll = async id => {
  for(let i=0;i<100;i++) {
   if(await page.evaluate(async id=>{const st=await import('/backgammon/core/storage.mjs'),work=await st.get('work','play');return work?.game.id===id&&work.game.events.some(e=>e.action.type==='roll');},id))return;
   await page.waitForTimeout(50);
  }
  throw new Error('Automatic roll did not persist: '+id);
 };
 try {
  await page.goto(base+'/backgammon/');
  await page.evaluate(async()=>{
   const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
   const {decisionReview}=await import('/backgammon/ui/decision-review.mjs');
   (await import('/backgammon/ui/shell.mjs')).shell('trainer','Solution preview');
   st.saveSettings({equityBar:false,analysisAhead:false,sounds:false,boardTheme:'slate'});
   const s=r.initialState({phase:'move',dice:[3,3],matchLength:0});s.points.fill(0);
   for(const [p,n] of [[11,1],[10,1],[9,2],[8,2],[7,2],[6,2],[5,2],[4,2],[1,1],[3,-2],[18,-1],[19,-4],[20,-3],[21,-1],[22,-2],[23,-1]])s.points[p-1]=n;
   s.bar=[0,1];s.cube={value:2,owner:0};
   const steps=[[5,2],[8,5],[10,7],[11,8]].map(([a,b])=>({from:a-1,to:b-1,die:3}));
   const candidate={steps,key:r.boardKey(steps.reduce((s,st)=>r.applyStep(s,st),s)),notation:r.notation(steps),equity:.782,probabilities:[.8,.1,0,.02,0]};
   window.solutionSource=s;
   window.showSolution = options => decisionReview(s,options).result({type:'checker',status:'complete',engine:'Display fixture',positionKey:r.positionKey(s),settings:{name:'Fixture',plies:3},perspective:0,units:'current-cube-points',elapsedMs:0,candidates:[candidate]},false);
   window.showSolution({onReturn:()=>{}});
  });
  assert.equal(await page.locator('.last-move-arrow').count(),2);
  assert.match(await page.locator('[data-best-move]').textContent(),/11\/2 10\/7/);
  assert.equal(await page.locator('.bg-board text').filter({hasText:/^(BAR|OFF)$/}).count(),0);
  for(const [width,height] of [[320,568],[375,667],[390,844],[430,932],[844,390],[768,1024],[1024,768],[1366,768],[1440,900]]) {
   await page.setViewportSize({width,height});
   await page.waitForTimeout(35);
   const fit=await page.locator('.decision-dialog').evaluate(d=>({x:d.scrollWidth<=d.clientWidth+1,y:d.scrollHeight<=d.clientHeight+1,save:d.querySelector('#save-review-position').getBoundingClientRect().bottom<=innerHeight+1}));
   assert.deepEqual(fit,{x:true,y:true,save:true},`${width}x${height}`);
   if([390,844,1366].includes(width))await page.screenshot({path:path.join(out,`${name}-solution-polish-${width}.png`)});
  }
  await page.locator('#save-review-position').click();
  await page.getByRole('dialog',{name:'Save to Library'}).getByLabel('Name',{exact:true}).fill('Compact solution regression');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  const saved=await page.evaluate(async()=>{const st=await import('/backgammon/core/storage.mjs'),r=await import('/backgammon/core/rules.mjs');return (await st.all()).some(item=>item.title==='Compact solution regression'&&r.positionKey(item.state)===r.positionKey(window.solutionSource));});
  assert.equal(saved,true,'saved original decision and dice');
  await page.keyboard.press('Escape');
  await page.evaluate(()=>window.showSolution({replayLabel:"Play best",onReplay:()=>{}}));
  assert.equal(await page.getByRole('button',{name:'Use best move',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Play best',exact:true}).count(),1);
  for(const [width,height] of [[320,568],[390,844],[844,390]]) {
    await page.setViewportSize({width,height});
    assert.equal(await page.locator('.decision-dialog').evaluate(d=>d.scrollHeight<=d.clientHeight+1 && [...d.querySelectorAll('footer button')].every(b=>{const r=b.getBoundingClientRect();return r.right<=innerWidth&&r.bottom<=innerHeight;})),true,'hint actions fit with Save');
  }
  await page.keyboard.press('Escape');
  // Resume a just-accepted cube: the human must roll exactly once, automatically.
  await page.evaluate(async()=>{
   const r=await import('/backgammon/core/rules.mjs'),{studyGame}=await import('/backgammon/core/play-session.mjs'),{localPlayAction}=await import('/backgammon/core/local-rolls.mjs'),st=await import('/backgammon/core/storage.mjs');
   let game=studyGame(r.initialState({phase:'roll',matchLength:0}),null,'auto-take-test');
   game=await localPlayAction(game,{type:'double'});game=await localPlayAction(game,{type:'take'});
   await st.put('work',{id:'play',game,positionKey:r.positionKey(game.state),draft:[]});
  });
  await page.goto(base+'/backgammon/play/#resume=auto-take-test');
  await waitForRoll('auto-take-test');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(async()=>(await(await import('/backgammon/core/storage.mjs')).get('work','play')).game.events.filter(e=>e.action.type==='roll').length),1);
  // An accepted offer while backgrounded rolls when the page becomes visible.
  await page.goto(base+'/backgammon/');
  await page.evaluate(async()=>{
   const r=await import('/backgammon/core/rules.mjs'),{studyGame}=await import('/backgammon/core/play-session.mjs'),{localPlayAction}=await import('/backgammon/core/local-rolls.mjs'),st=await import('/backgammon/core/storage.mjs');
   let game=studyGame(r.initialState({phase:'roll',matchLength:0}),null,'hidden-take-test');
   game=await localPlayAction(game,{type:'double'});game=await localPlayAction(game,{type:'take'});
   await st.put('work',{id:'play',game,positionKey:r.positionKey(game.state),draft:[]});
  });
  await page.addInitScript(()=>{if(location.hash.includes('hidden-take-test'))Object.defineProperty(document,'hidden',{configurable:true,value:true});});
  await page.goto(base+'/backgammon/play/#resume=hidden-take-test');
  await page.locator('#board .board-cube').waitFor();await page.waitForTimeout(150);
  assert.equal(await page.evaluate(async()=>(await(await import('/backgammon/core/storage.mjs')).get('work','play')).game.events.filter(e=>e.action.type==='roll').length),0);
  await page.evaluate(()=>{delete document.hidden;dispatchEvent(new Event('visibilitychange'));});
  await waitForRoll('hidden-take-test');
  assert.equal(await page.evaluate(async()=>(await(await import('/backgammon/core/storage.mjs')).get('work','play')).game.events.filter(e=>e.action.type==='roll').length),1);
  // No human confirmation control while the bot owns the checker decision.
  await page.goto(base+'/backgammon/');
  await page.evaluate(async()=>{
   const r=await import('/backgammon/core/rules.mjs'),{studyGame}=await import('/backgammon/core/play-session.mjs'),st=await import('/backgammon/core/storage.mjs');
   const game=studyGame(r.initialState({phase:'move',turn:1,dice:[3,1],matchLength:5}),{game:{config:{mode:'computer',humanSide:0,strength:'quick'}}},'bot-confirm-test');
   await st.put('work',{id:'play',game,positionKey:r.positionKey(game.state),draft:[]});
  });
  await page.route('**/*.wasm',route=>route.abort()); // Hold the bot decision, not its move logic.
  await page.goto(base+'/backgammon/play/#resume=bot-confirm-test');
  await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  assert.equal(await page.locator('#confirm').count(),0);
  await page.goto(base+'/backgammon/');await page.unroute('**/*.wasm');
  // Isolated renderer geometry, after testing the actual app's cube transition.
  await page.goto(base+'/backgammon/');
  await page.evaluate(async()=>{
   const {Board}=await import('/backgammon/ui/board.mjs'),{EquityBar}=await import('/backgammon/ui/equity-bar.mjs'),r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
   const container=document.createElement('div');container.className='board-slot';container.style.cssText='height:95dvh;width:100%;';
   const app=document.createElement('main');app.className='play-page live-table';app.append(container);document.body.replaceChildren(app);
   const board=new Board(container);window.polishBoard=board;
   const state=r.initialState({phase:'move',dice:[6,1],matchLength:0});state.points.fill(0);state.points[5]=5;state.points[3]=5;state.points[20]=-14;state.off=[5,1];state.cube={value:4,owner:0};
   window.polishState=state;st.saveSettings({equityBar:true});
   const bar=new EquityBar(board,document.createElement('button'));window.polishBar=bar;
   board.render(state,{interactive:true,numbers:true,reachable:['off',4],sources:[5],orientation:0});
   bar.paint('ready',{ivory:.73,choice:'Fixture',units:'current-cube-points',setting:'Fixture'});
  });
  for(const [width,height] of [[390,844],[844,390],[1366,768]]) {
   await page.setViewportSize({width,height});await page.waitForTimeout(60);
   assert.equal(await page.locator('.off-checker').count(),0);
   const labels=await page.locator('.equity-number').allTextContents();assert.deepEqual(labels.filter(Boolean),['0.730']);
   const bounds=await page.evaluate(()=>{
    const board=window.polishBoard.svg,cube=board.querySelector('.cube-hit').getBoundingClientRect(),off=board.querySelector('[data-point="off0"] .point-hit').getBoundingClientRect();
    return {separated:cube.bottom<off.top,numbers:[...window.polishBar.node.querySelectorAll('.equity-number')].every(n=>n.scrollWidth<=n.clientWidth+1),overflow:document.documentElement.scrollWidth<=innerWidth+1};
   });
   assert.deepEqual(bounds,{separated:true,numbers:true,overflow:true},`${width}x${height} equity rail`);
   await page.screenshot({path:path.join(out,`${name}-board-polish-${width}.png`)});
  }
  assert.deepEqual(errors,[]);
  return {notation:'11/2 10/7',arrows:2,viewports:9,savedPosition:true,automaticTakeRoll:true,confirmationOnlyOnHumanTurn:true};
 }finally{await ctx.close();}
};
