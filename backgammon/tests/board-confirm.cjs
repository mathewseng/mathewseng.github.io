const assert=require('node:assert/strict'),path=require('node:path');
const {stageSteps,waitWork}=require('./play-helpers.cjs');
module.exports=async(browser,base,out,name)=>{
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});
 const page=await ctx.newPage(),errors=[],layouts=[],themes=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
 try {
  await page.goto(base+'/backgammon/');await ready();
  await page.evaluate(async()=>{
   const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs'),{localConfig}=await import('/backgammon/core/play-session.mjs');
   const state=r.initialState({phase:'move',dice:[4,1]});
   st.saveSettings({analysisAhead:false,equityBar:false,motion:'reduce'});
   await st.put('work',{id:'play',game:{id:'board-confirm',initial:state,state,events:[],started:true,names:['You','Black'],config:localConfig({tutor:false,warning:false})},draft:[]});
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
    const bar=document.querySelector('#board [data-pattern="bar"]').getBoundingClientRect(),surface=document.querySelector('#board [data-pattern="surface"]').getBoundingClientRect(),center={x:(surface.left+bar.left)/2,y:surface.y+surface.height/2};
    const button=document.querySelector('#confirm'),b=button.getBoundingClientRect();
    const mark=button.querySelector('.confirm-check svg').getBoundingClientRect(),style=getComputedStyle(button);
    const die=document.querySelector('#board .board-die-face > rect'),faceMatrix=die.getScreenCTM(),touch=getComputedStyle(button,'::before');
    // Firefox includes the painted stroke in SVG rect bounds. Compare the same
    // face edges across browsers, including the face's actual transform.
    const dieLeft=new DOMPoint(die.x.baseVal.value,0).matrixTransform(faceMatrix),dieRight=new DOMPoint(die.x.baseVal.value+die.width.baseVal.value,0).matrixTransform(faceMatrix);
    const dieWidth=Math.hypot(dieRight.x-dieLeft.x,dieRight.y-dieLeft.y);
    const tools=[...document.querySelectorAll('.turn-tools > button')].map(n=>({id:n.id,text:n.textContent,color:getComputedStyle(n).color,opacity:getComputedStyle(n).opacity,rect:n.getBoundingClientRect().toJSON()}));
    const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('button')?.id;
    const collisions=[...document.querySelectorAll('#board .checker > circle:first-child,#board .board-die')].filter(n=>{
     const r=n.getBoundingClientRect();return r.width&&r.height&&Math.min(r.right,b.right)-Math.max(r.left,b.left)>1&&Math.min(r.bottom,b.bottom)-Math.max(r.top,b.top)>1;
    }).length;
    return {center,barLeft:bar.left,collisions,button:b.toJSON(),dieWidth,touch:{width:parseFloat(touch.width),height:parseFloat(touch.height)},mark:mark.toJSON(),appBottom:document.querySelector('.app').getBoundingClientRect().bottom,userSelect:style.getPropertyValue('user-select')||style.getPropertyValue('-webkit-user-select'),tools,hit,opacity:style.opacity};
   });
   assert.ok(Math.abs(layout.button.x+layout.button.width/2-layout.center.x)<1&&Math.abs(layout.button.y+layout.button.height/2-layout.center.y)<1,'Confirm is centered in the left open lane');
   assert.ok(Math.abs(layout.button.width-1.5*layout.dieWidth)<1,`Confirm is 1.5 times the rendered die size at ${width}×${height}`);
   assert.ok(layout.touch.width>=44&&layout.touch.height>=44,'small boards retain a comfortable touch target');
   assert.equal(layout.button.height,layout.button.width);
   assert.ok(layout.button.right<layout.barLeft,'entire button stays on the left half');
   assert.equal(layout.collisions,0,'button does not cover checkers or dice');
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
   await page.screenshot({path:path.join(out,`${name}-board-confirm-${width}x${height}.png`)});
  }
  await page.setViewportSize({width:390,height:844});
  for(const skin of ['liquid-chrome','classic','carrara-verde','one-bit-mac']){
   await page.evaluate(async skin=>{(await import('/backgammon/ui/skin.mjs')).applySkin(skin);},skin);
   const appearance=await page.evaluate(()=>{
    const surface=id=>{const s=getComputedStyle(document.getElementById(id));return {image:s.backgroundImage,color:s.backgroundColor,radius:s.borderRadius};};
    return {confirm:surface('confirm'),hint:surface('hint')};
   });
   assert.deepEqual(appearance.confirm,appearance.hint,`${skin}: Confirm uses the theme's button surface and corners`);
   themes.push({skin,...appearance});
   await page.screenshot({path:path.join(out,`${name}-board-confirm-${skin}.png`)});
  }
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
  return {touchConfirm:true,layouts,themes};
 }finally{await ctx.close();}
};
