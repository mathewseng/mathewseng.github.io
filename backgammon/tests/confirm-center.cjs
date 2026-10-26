const assert=require('node:assert/strict'),path=require('node:path');
const {stageSteps,waitWork}=require('./play-helpers.cjs');
module.exports=async(browser,base,out,name)=>{
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});
 const page=await ctx.newPage(),errors=[],layouts=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
 try {
  await page.goto(base+'/backgammon/');await ready();
  await page.evaluate(async()=>{
   const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs'),{localConfig}=await import('/backgammon/core/play-session.mjs');
   const state=r.initialState({phase:'move',dice:[4,1]});
   st.saveSettings({analysisAhead:false,equityBar:false,motion:'reduce'});
   await st.put('work',{id:'play',game:{id:'center-confirm',initial:state,state,events:[],started:true,names:['You','Black'],config:localConfig({tutor:false,warning:false})},draft:[]});
  });
  await page.goto(base+'/backgammon/play/');await ready();
  await page.evaluate(async()=>{(await import('/backgammon/engine/client.mjs')).EngineClient.prototype.analyze=()=>new Promise(()=>{});});
  await page.locator('#resume-match').tap();
  assert.equal(await page.locator('#confirm').evaluate(n=>getComputedStyle(n).pointerEvents),'none','unfinished confirmation never blocks a checker');
  const steps=await page.evaluate(async()=>{
   const {get}=await import('/backgammon/core/storage.mjs'),{legalTurns}=await import('/backgammon/core/rules.mjs');return legalTurns((await get('work','play')).game.state)[0].steps;
  });
  await stageSteps(page,steps);
  for(const [width,height] of [[320,568],[390,844],[844,390],[768,1024],[1366,768]]) {
   await page.setViewportSize({width,height});await page.waitForTimeout(80);await page.evaluate(()=>scrollTo(0,0));
   const layout=await page.evaluate(()=>{
    const bar=document.querySelector('#board [data-pattern="bar"]').getBoundingClientRect(),center={x:bar.x+bar.width/2,y:bar.y+bar.height/2};
    const button=document.querySelector('#confirm'),b=button.getBoundingClientRect();
    const mark=button.querySelector('.confirm-check svg').getBoundingClientRect(),style=getComputedStyle(button);
    const tools=[...document.querySelectorAll('.turn-tools > button')].map(n=>({id:n.id,text:n.textContent,color:getComputedStyle(n).color,opacity:getComputedStyle(n).opacity,rect:n.getBoundingClientRect().toJSON()}));
    const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('button')?.id;
    return {center,button:b.toJSON(),mark:mark.toJSON(),appBottom:document.querySelector('.app').getBoundingClientRect().bottom,radius:style.borderRadius,backgroundImage:style.backgroundImage,userSelect:style.getPropertyValue('user-select')||style.getPropertyValue('-webkit-user-select'),tools,hit,opacity:style.opacity};
   });
   assert.ok(Math.abs(layout.button.x+layout.button.width/2-layout.center.x)<1&&Math.abs(layout.button.y+layout.button.height/2-layout.center.y)<1,'Confirm is centered on the board');
   assert.equal(layout.button.width,48,'compact but accessible touch target');
   assert.equal(layout.button.height,48);
   assert.equal(layout.radius,'12px','rounded square');
   assert.equal(layout.backgroundImage,'none','no metallic stripe across the check');
   assert.equal(layout.userSelect,'none');
   assert.ok(Math.abs(layout.mark.x+layout.mark.width/2-layout.center.x)<1&&Math.abs(layout.mark.y+layout.mark.height/2-layout.center.y)<1,'SVG check is centered, independently of font metrics');
   assert.equal(layout.hit,'confirm','button is not obstructed');
   assert.equal(layout.opacity,'1');
   assert.equal(layout.tools.length,2);assert.match(layout.tools[0].text,/Hint/);assert.match(layout.tools[1].text,/Controls/);
   assert.ok(Math.abs(layout.tools[0].rect.y-layout.tools[1].rect.y)<1,'Hint and Controls form one row');
   for(const tool of layout.tools) {
    assert.ok(tool.rect.height>=44&&tool.rect.bottom<=Math.max(height,layout.appBottom),'tool fits page flow without shrinking the portrait board');
    assert.ok(tool.rect.width>=44,'tool touch width');
   }
   layouts.push({width,height,...layout});
   await page.screenshot({path:path.join(out,`${name}-center-confirm-${width}x${height}.png`)});
  }
  await page.setViewportSize({width:390,height:844});
  await page.keyboard.press('Tab');await page.locator('#confirm').focus();
  assert.equal(await page.locator('#confirm').evaluate(n=>getComputedStyle(n).outlineStyle),'solid','keyboard focus stays visible');
  await page.locator('#confirm').evaluate(n=>n.addEventListener('pointerdown',()=>{
   window.confirmPress={outline:getComputedStyle(n).outlineStyle,selection:getSelection().toString()};
  }));
  await page.locator('#confirm').tap();
  assert.deepEqual(await page.evaluate(()=>window.confirmPress),{outline:'none',selection:''},'tapping never leaves native selection/focus highlighting');
  await waitWork(page,w=>w.game.events.some(e=>e.action.type==='move'));
  assert.equal(await page.locator('#confirm').count(),0,'confirmation leaves after the human turn');
  assert.deepEqual(errors,[]);
  return {touchConfirm:true,layouts};
 }finally{await ctx.close();}
};
