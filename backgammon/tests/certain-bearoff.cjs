const { showPlayControls } = require("./play-helpers.cjs");
const assert=require('node:assert/strict');
const {waitWork,work}=require('./play-helpers.cjs');
module.exports=async function certainBearoff(browser,base){
 const report=[];
 for(const touch of [false,true]){
  const ctx=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1366,height:768},hasTouch:touch,serviceWorkers:'block'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  const tap=locator=>touch?locator.tap():locator.click();
  try{
   for(const kind of ['single','gammon','resumed','taken','uncertain']){
    await page.goto(base+'/backgammon/');
    const original=await page.evaluate(async kind=>{
     const {initialState,legalTurns}=await import('/backgammon/core/rules.mjs');
     const {playAction}=await import('/backgammon/core/table.mjs');
     const {localConfig}=await import('/backgammon/core/play-session.mjs');
     const {saveSettings,put}=await import('/backgammon/core/storage.mjs');
     const points=Array(24).fill(0);points[kind==='uncertain'?5:['resumed','taken'].includes(kind)?0:3]=1;points[kind==='gammon'?12:23]=kind==='gammon'?-15:kind==='uncertain'?-1:-7;
     const initial=initialState({points,off:[14,kind==='gammon'?0:kind==='uncertain'?14:8],phase:['uncertain','resumed','taken'].includes(kind)?'roll':'move',dice:['uncertain','resumed','taken'].includes(kind)?[]:[1,2],turn:kind==='resumed'?1:0,matchLength:0,cube:{value:kind==='taken'?2:4,owner:0}});
     let game={id:'certain-'+kind,state:initial,initial,events:[],started:true,names:['You','GNUbg'],config:localConfig({mode:'computer',humanSide:0,tutor:false,warning:false,strength:'quick'}),localRolls:{version:1,seed:'abc123'.padStart(64,'0'),cursor:17}};
     if(!['uncertain','resumed','taken'].includes(kind))game=playAction(game,{type:'move',steps:legalTurns(initial)[0].steps});
     if(kind==='taken'){game=playAction(game,{type:'double'});game=playAction(game,{type:'take'});}
     saveSettings({equityBar:false,analysisAhead:false,motion:'full'});
     await put('work',{id:'play',game,draft:[]});return game;
    },kind);
    await page.goto(base+'/backgammon/play/#resume=certain-'+kind);await ready();
    if(kind==='uncertain'){
     await page.waitForTimeout(1000);
     assert.equal((await work(page)).game.state.phase,'roll','a possible upset must remain playable');
    }else{
     await page.locator('#next-game').waitFor();
     const ended=(await waitWork(page,w=>w?.game.state.phase==='over')).game;
     assert.equal(ended.state.result.reason,'certain bearoff');
     assert.equal(ended.state.result.level,kind==='gammon'?2:1);
     assert.equal(ended.state.result.points,kind==='gammon'?8:4);
     assert.deepEqual(ended.localRolls,original.localRolls,'no roll is consumed');
     assert.deepEqual(ended.state.points,original.state.points,'no checker moves are invented');
     assert.deepEqual(ended.events.map(e=>e.action.type),kind==='resumed'?['finish-race']:kind==='taken'?['double','take','finish-race']:['move','finish-race']);
     await page.reload();await ready();
     await page.locator('#next-game').waitFor();
     assert.deepEqual((await work(page)).game.state,ended.state,'reload cannot award twice');
     await showPlayControls(page);
     await tap(page.locator('#undo-turn'));
     const restored=(await waitWork(page,w=>w?.game.reviewingTurn)).game;
     assert.deepEqual(restored.state,kind==='taken'?original.state:original.initial);
     await page.waitForTimeout(900);
     assert.equal((await work(page)).game.state.phase,(kind==='taken'?original.state:original.initial).phase,'undo stays open instead of immediately ending again');
     if(kind==='resumed'){
      await page.reload();await ready();
      await page.getByRole('button',{name:'Resume computer',exact:true}).waitFor();
      await page.waitForTimeout(900);assert.deepEqual((await work(page)).game.state,original.initial,'reload keeps an undone computer turn paused');
     }
    }
    report.push({touch,kind});
   }
   assert.deepEqual(errors,[]);
  }finally{await ctx.close()}
 }
 return report;
};
