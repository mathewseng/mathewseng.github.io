const assert=require('node:assert/strict'),path=require('node:path');
const {waitWork}=require('./play-helpers.cjs');

module.exports=async(browser,base,out,name)=>{
 const ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
 const page=await ctx.newPage(),errors=[],report=[];
 page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
 try{
  await page.goto(base+'/backgammon/');await ready();
  await page.evaluate(async()=>{
   const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
   const {localConfig,defaultPlayRules}=await import('/backgammon/core/play-session.mjs');
   const initial=r.initialState({turn:0,phase:'roll',matchLength:0,rules:defaultPlayRules(0)});
   st.saveSettings({motion:'reduce',analysisAhead:false,equityBar:true});
   await st.put('work',{id:'play',game:{id:'layout-dock',started:true,initial,state:initial,events:[],names:['White','Black'],
    config:localConfig({mode:'local',matchLength:0,rules:initial.rules,tutor:false,warning:false})},draft:[]});
  });
  await page.goto(base+'/backgammon/play/');await ready();
  // This test is about layout/state preservation; no engine result is needed.
  await page.evaluate(async()=>{(await import('/backgammon/engine/client.mjs')).EngineClient.prototype.analyze=()=>new Promise(()=>{});});
  await page.locator('#resume-match').click();await page.locator('#board.roll-ready').waitFor();
  const measure=async()=>page.evaluate(()=>{
   const box=n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom};};
   const rail=document.querySelector('.landscape-dock');
   const children=[...rail.children].filter(n=>n.getBoundingClientRect().height&&getComputedStyle(n).display!=='none'&&getComputedStyle(n).visibility!=='hidden');
   return {width:innerWidth,height:innerHeight,rail:box(rail),rows:children.map(n=>({id:n.id||n.className,...box(n)})),
    players:['opponent','player'].map(id=>box(document.getElementById(id))),
    controls:[...rail.querySelectorAll('button')].filter(n=>n.checkVisibility()&&!n.disabled).map(n=>({id:n.id,...box(n)})),
    overflow:document.documentElement.scrollWidth>innerWidth+1};
  });
  for(const [width,height] of [[844,390],[932,310],[667,260]]){
   await page.setViewportSize({width,height});
   await page.waitForFunction(()=>document.querySelector('.app').classList.contains('landscape-table'));
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const m=await measure();
   await page.screenshot({path:path.join(out,`${name}-dock-${width}x${height}.png`)});
   assert.equal(m.overflow,false);
   assert.ok(m.rail.y>=0&&m.rail.bottom<=height+1,JSON.stringify(m));
   for(let i=1;i<m.rows.length;i++)assert.ok(m.rows[i].y>=m.rows[i-1].bottom-1,JSON.stringify(m));
   assert.ok(Math.abs(m.players[0].w-m.players[1].w)<1,'both players have the same full-width row');
   assert.ok(m.players.every(p=>p.w>190),'neither player shrinks when the active side changes');
   for(const id of ['landscape-pages','sound-toggle','screen-toggle','preferences','panel-toggle','mobile-tools','all-controls']){
    const b=m.controls.find(n=>n.id===id);assert.ok(b&&b.w>=43&&b.h>=43&&b.bottom<=height+1,`${id} remains reachable at ${width}x${height}`);
   }
   report.push(m);
  }
  await page.setViewportSize({width:844,height:390});
  for(const id of ['landscape-pages','preferences','panel-toggle','mobile-tools','all-controls']){
   await page.locator('#'+id).click();await page.locator('dialog[open]').last().waitFor();
   const d=await page.locator('dialog[open]').last().boundingBox();
   assert.ok(d.x>=0&&d.y>=0&&d.x+d.width<=845&&d.y+d.height<=391,`${id} dialog fits`);
   if(id==='landscape-pages')assert.equal(await page.locator('dialog[open] .landscape-pages a').count(),6);
   await page.locator('dialog[open]').last().locator('.close').click();
  }
  await page.keyboard.press('d');await page.locator('#take-cube').waitFor();
  const pending=await waitWork(page,w=>w.game.state.phase==='double');
  const before=(await measure()).players;
  await page.locator('#immediate-redouble').tap();await waitWork(page,w=>w.game.state.pending?.depth===1);
  const after=(await measure()).players;
  assert.deepEqual(after,before,'alternating cube ownership does not move either player row');
  const saved=(await waitWork(page,w=>w.game.state.pending?.depth===1)).game.state;
  for(const [width,height,landscape] of [[390,844,false],[1366,768,false],[844,390,true]]){
   await page.setViewportSize({width,height});
   await page.waitForFunction(active=>document.querySelector('.app').classList.contains('landscape-table')===active,landscape);
   assert.equal(await page.locator('#preferences').count(),1);
   assert.equal(await page.locator('#take-cube').count(),1);
   assert.equal(await page.locator('#all-controls').count(),1);
   const state=(await waitWork(page,w=>w.game.state.phase==='double')).game.state;
   assert.deepEqual(state,saved,'rotation preserves the pending offer and game');
   const cube=await page.locator('#take-cube').boundingBox();assert.ok(cube.x>=0&&cube.y>=0&&cube.x+cube.width<=width&&cube.y+cube.height<=height);
  }
  await page.locator('#drop-cube').tap();await waitWork(page,w=>w.game.state.phase==='over');
  await page.getByRole('button',{name:/Next game/i}).scrollIntoViewIfNeeded();
  await page.getByRole('button',{name:/Next game/i}).click();
  await waitWork(page,w=>w.game.state.gameNumber>pending.game.state.gameNumber);
  assert.deepEqual(errors,[]);
  return {layouts:report,rotationPreservedGame:true,panels:5,nextGame:true};
 }finally{await ctx.close();}
};
