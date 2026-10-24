const assert=require('node:assert/strict');
module.exports=async function automaticMotion(browser,base){
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),page=await ctx.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base+'/backgammon/');
  await page.evaluate(async()=>{
   const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
   const {localConfig}=await import('/backgammon/core/play-session.mjs');
   const points=Array(24).fill(0);for(let i=19;i<24;i++)points[i]=-3;
   const s=r.initialState({phase:'roll',turn:0,points,bar:[1,0],off:[14,0],matchLength:0,cube:{value:2,owner:1}});
   const {seededLocalRoll}=await import('/backgammon/core/local-rolls.mjs');
   let localRolls;
   for(let i=0;i<100;i++){
    localRolls={version:1,seed:i.toString(16).padStart(64,'0'),cursor:0};
    const dice=await seededLocalRoll(localRolls);
    if(dice.includes(6)&&dice[0]!==dice[1])break;
   }
   st.saveSettings({equityBar:false,analysisAhead:false,motion:'full'});
   await st.put('work',{id:'play',game:{id:'forced-animation',state:s,initial:s,events:[],started:true,names:['You','GNUbg'],
    config:localConfig({mode:'local',tutor:false,warning:false}),localRolls},draft:[]});
  });
  await page.goto(base+'/backgammon/play/#resume=forced-animation');
  await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  await page.evaluate(async()=>{
   window.motionLog=[];window.boardPaints=[];
   const {Board}=await import('/backgammon/ui/board.mjs'),paint=Board.prototype.updateChildren;
   Board.prototype.updateChildren=function(children){
    boardPaints.push({phase:this.state.phase,sequence:this.state.sequence,flight:motionLog.some(m=>m.id==='checker')});
    return paint.call(this,children);
   };
   const play=Animation.prototype.play;
   Animation.prototype.play=function(){
    if(this.id==='dice-roll')motionLog.push({at:performance.now(),id:this.id,duration:this.effect.getTiming().duration});
    return play.call(this);
   };
   const animate=Element.prototype.animate;
   Element.prototype.animate=function(frames,options){
    if(options?.id==='dice-roll'||this.classList.contains('moving-checker'))motionLog.push({at:performance.now(),id:options?.id||'checker',duration:options.duration});
    return animate.call(this,frames,options);
   };
  });
  await page.keyboard.press('c');
  await page.waitForFunction(()=>motionLog.some(m=>m.id==='dice-roll'));
  assert.equal(await page.locator('#board .moving-checker').count(),0,'forced move does not erase the roll reveal');
  await page.waitForFunction(()=>motionLog.some(m=>m.id==='checker'));
  const timeline=await page.evaluate(()=>motionLog);
  const roll=timeline.find(m=>m.id==='dice-roll'),move=timeline.find(m=>m.id==='checker');
  assert.ok(move.at-roll.at>=700,JSON.stringify(timeline));
  assert.ok(move.duration>=450);
  assert.ok(await page.evaluate(()=>!boardPaints.some(p=>p.sequence===2&&p.phase==='roll'&&!p.flight)),
    'the final position is not built and discarded before the first checker flight');
  await page.waitForFunction(()=>!document.querySelector('#board .moving-checker'));
  const game=await page.evaluate(async()=>(await(await import('/backgammon/core/storage.mjs')).get('work','play')).game);
  assert.equal(game.state.phase,'roll');assert.equal(game.state.turn,1);assert.equal(game.localRolls.cursor,1);assert.equal(game.events.length,2);
  assert.deepEqual(errors,[]);return timeline;
 }finally{await ctx.close()}
};
