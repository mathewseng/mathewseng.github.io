const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async(browser,base,out,name)=>{
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
 try{
  await page.goto(base+'/backgammon/');await ready();
  await page.evaluate(async()=>{
   const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
   const {playAction}=await import('/backgammon/core/table.mjs'),{localConfig}=await import('/backgammon/core/play-session.mjs');
   const initial=r.initialState({phase:'move',dice:[4,1],matchLength:0});
   let game={id:'mobile-summary',initial,state:initial,started:true,events:[],names:['You','Black'],config:localConfig({mode:'computer',humanSide:0,tutor:true,warning:false,strength:'quick'})};
   for(let n=0;n<2;n++){
    const s=game.state,turns=r.legalTurns(s),steps=turns[0].steps;
    game=playAction(game,{type:'move',steps});
    game.events.at(-1).evaluation={result:{type:'checker',status:'complete',positionKey:r.positionKey(s),settings:{name:'Test',plies:0},units:'current-cube-points',
      candidates:[{equity:.2,steps:turns[1].steps}],actual:{equity:n?.18:.19,steps}}};
    if(!n)game=playAction(game,{type:'roll',dice:[4,1]});
   }
   st.saveSettings({analysisAhead:false,equityBar:false,motion:'reduce'});
   await st.put('work',{id:'play',game,draft:[]});
  });
  await page.goto(base+'/backgammon/play/');await ready();
  // Hold any background grading. It must not delay the existing summary.
  await page.evaluate(async()=>{(await import('/backgammon/engine/client.mjs')).EngineClient.prototype.analyze=()=>new Promise(()=>{});});
  await page.locator('#resume-match').tap();
  const summary=page.locator('#mobile-game-summary'),history=page.locator('.history-game-card').first();
  await summary.waitFor();
  assert.equal(await summary.evaluate(n=>n.open),true,'running summary opens by default');
  assert.equal(await summary.locator('[data-loss-kind="checker"] [data-stage="accepted"] strong').innerText(),'0.010');
  assert.equal(await history.locator('button[aria-expanded]').count(),0,'history summary has no collapse button');
  assert.ok(await history.locator('table').isVisible(),'history summary is expanded initially');
  const layouts=[];
  const checkFit=async(label)=>{
   for(const [width,height] of [[320,480],[320,568],[375,667],[390,600],[390,744],[390,844],[430,932],[600,800]]) {
    await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));
    await page.waitForTimeout(80);
    const flow=await summary.evaluate(n=>{
     const rect=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
     const matrix=document.querySelector('#board > svg').getScreenCTM();
     return {summary:rect(n),body:rect(n.querySelector('.history-game-detail')),board:rect(document.querySelector('#board')),
      renderedBoard:{width:876*matrix.a,height:660*matrix.d},stage:rect(document.querySelector('.stage')),
      player:rect(document.querySelector('#player')),app:rect(document.querySelector('.app')),review:rect(document.querySelector('#play-review')),
      position:getComputedStyle(n).position,overflow:document.documentElement.scrollWidth>innerWidth+1};
    });
    layouts.push({label,width,height,...flow});
    assert.ok(!['fixed','sticky','absolute'].includes(flow.position),'summary belongs to page flow');
    assert.ok(flow.summary.bottom<=flow.app.bottom+1&&flow.body.bottom<=flow.summary.bottom+1,`summary stays inside page flow ${JSON.stringify({label,width,height,flow})}`);
    if(height>=844&&width<=430)assert.ok(flow.summary.bottom<=height+1,'tall phones still fit the summary without scrolling');
    assert.ok(Math.abs(flow.renderedBoard.width-flow.stage.width)<1,'rendered board fills the available width, even on short phones');
    assert.ok(Math.abs(flow.stage.width-(width-8))<1,'only the safe outer gutter reduces phone width');
    assert.ok(flow.summary.top>=flow.player.bottom-1,'summary follows the board and player');
    assert.ok(flow.board.height>=100,'board keeps usable space');
    assert.ok(!flow.overflow,'no sideways scrolling');
    assert.ok(flow.review.top>=flow.app.bottom-1,'analysis begins below the first screen');
    assert.ok(await page.locator('.help-cluster').isHidden(),'secondary actions live in Controls');
    assert.ok(await page.locator('.turn-tools #all-controls').isVisible(),'Controls remains visible above the summary');
    assert.ok(await page.locator('.turn-tools #hint').isVisible(),'Hint remains visible above the summary');
    const geometry=()=>page.locator('#opponent,#player,#board,.board-actions').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return [r.x+scrollX,r.y+scrollY,r.width,r.height];}));
    // Firefox rounds client coordinates differently after scrolling to the
    // disclosure. Compare document geometry within subpixel precision.
    const assertStable=(actual,expected,label)=>assert.ok(actual.every((bounds,i)=>bounds.every((v,j)=>Math.abs(v-expected[i][j])<.05)),label);
    const expanded=await geometry();
    await summary.locator(':scope > summary').tap();
    await page.waitForTimeout(80);
    assertStable(await geometry(),expanded,'collapse does not move or resize any table element');
    await summary.locator(':scope > summary').tap();
    await page.waitForTimeout(80);
    assertStable(await geometry(),expanded,'expand does not move or resize any table element');
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:path.join(out,`${name}-summary-${label}-${width}-${height}.png`)});
    await page.evaluate(()=>scrollTo(0,100));
    const moved=await summary.evaluate(n=>({top:n.getBoundingClientRect().top,scroll:scrollY}));
    assert.ok(moved.scroll>0&&Math.abs(flow.summary.top-moved.top-moved.scroll)<1,'summary scrolls away with the board');
   }
   await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));
  };
  await checkFit('no-equity');
  await page.locator('#equity-toggle').evaluate(n=>n.click());
  await page.locator('#board.has-equity-bar').waitFor();
  await checkFit('equity');
  await summary.locator(':scope > summary').tap();
  assert.equal(await summary.evaluate(n=>n.open),false);
  for(const id of ['hint','all-controls']) {
   const button=page.locator('#'+id);assert.ok(await button.isVisible(),id+' is always available');
   const r=await button.boundingBox();assert.ok(r.height>=44&&r.y+r.height<=844+1,id+' fits with a touch target');
  }
  await page.screenshot({path:path.join(out,`${name}-mobile-summary-controls.png`)});
  await page.locator('#all-controls').tap();
  await page.locator('#analysis-jump').tap();
  assert.ok(await page.locator('#review-heading').evaluate(n=>document.activeElement===n),'analysis jump works');
  await page.getByRole('button',{name:'Back to board ↑',exact:true}).tap();
  await summary.locator(':scope > summary').tap();
  assert.ok(await summary.evaluate(n=>n.open),'Game summary reopens the panel');
  for(const viewport of [{width:844,height:390},{width:1366,height:768}]){
   await page.setViewportSize(viewport);await summary.waitFor({state:'hidden'});
   assert.ok(await page.locator('.turn-tools').isVisible(),'landscape/desktop keep Hint and Controls');
   assert.ok(await history.locator('table').isVisible());
  }
  await page.setViewportSize({width:390,height:844});await summary.waitFor();
  assert.ok(await summary.evaluate(n=>n.open),'rotation preserves disclosure preference');
  await summary.locator('table').waitFor();
  for(const width of [640,700]){
   await page.setViewportSize({width,height:900});await page.waitForTimeout(80);
   const boardWidth=await page.locator('#board > svg').evaluate(n=>n.getScreenCTM().a*876);
   assert.ok(Math.abs(boardWidth-(width-8))<1,'wide portrait phones also fill available width');
  }

  assert.deepEqual(errors,[]);
  return {alwaysExpandedHistory:true,defaultExpanded:true,utilityToggle:true,widthFirstPortrait:true,normalPageFlow:true,layouts};
 }finally{await ctx.close();}
};
