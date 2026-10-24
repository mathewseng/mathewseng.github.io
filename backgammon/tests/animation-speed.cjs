const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function animationSpeed(browser,base,out,name){
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'no-preference',serviceWorkers:'block'});
 const page=await ctx.newPage(),errors=[],samples=[];
 page.on('pageerror',e=>errors.push(e.message));
 try {
  await page.goto(base+'/backgammon/');
  await page.evaluate(async()=>{
   const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
   const {shell}=await import('/backgammon/ui/shell.mjs');
   st.saveSettings({motion:'system',motionScale:1});
   const ui=shell('play','Animation speed');
   const s=r.initialState({phase:'move',dice:[3,1],matchLength:0}),step=r.legalPaths(s)[0].steps[0];
   window.speedFixture={r,st,ui,s,step,options:{interactive:true,orientation:0,preferredDie:3}};
   ui.board.render(s,speedFixture.options);
   await st.put('work',{id:'animation-speed-fixture',state:s,draft:[step]});
  });
  const saved=await page.evaluate(async()=>JSON.stringify(await speedFixture.st.get('work','animation-speed-fixture')));
  const open=()=>page.locator('#preferences').click();
  const slider=page.getByRole('slider',{name:'Animation speed',exact:true});
  const set=async value=>{
   await open();await slider.press('Home');
   for(let i=0;i<value*4;i++)await slider.press('ArrowRight');
   assert.equal(await slider.inputValue(),String(value));
   assert.match(await slider.getAttribute('aria-valuetext'),value===0?/Instant/:value===1?/Normal/:value<1?/faster/:/slower/);
   for(const [width,height] of [[390,844],[844,390],[1366,768]]){
    await page.setViewportSize({width,height});await slider.scrollIntoViewIfNeeded();
    const fit=await slider.evaluate(n=>{
     const r=n.getBoundingClientRect(),body=document.querySelector('.settings-dialog .dialog-body');
     return {width:r.width,height:r.height,reachable:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===n,
      bodyHeight:body.clientHeight,overflow:body.scrollWidth>body.clientWidth+1};
    });
    assert.ok(fit.width>=44&&fit.height>=44&&!fit.overflow&&fit.reachable&&fit.bodyHeight>=150,JSON.stringify({width,height,fit}));
   }
   await page.setViewportSize({width:390,height:844});
   if(value===3)await page.screenshot({path:path.join(out,`${name}-animation-speed-phone.png`)});
   await page.locator('.settings-dialog .close').click();
  };
  for(const scale of [.25,1,3,0]){
   await set(scale);
   const sample=await page.evaluate(()=>{
    const {ui,s,step,r,options}=speedFixture,b=ui.board;
    b.render(s,{...options,presentation:{roll:true}});
    const dice=b.animations.filter(a=>a.id==='dice-roll').map(a=>a.effect.getTiming().duration);
    b.cancelAnimations();
    const after=r.applyStep(s,step);b.render(after,options);
    const flight=b.animateMove(s,after,step);
    const moving=b.svg.querySelector('.moving-checker');
    const duration=moving?.getAnimations()[0]?.effect.getTiming().duration??0;
    b.cancelAnimations();
    b.showPreview(s,{...options,interactive:false,preview:true});
    b.cancelAnimations();
    b.showPreview(after,{...options,interactive:false,preview:true});
    const preview=b.animations.filter(a=>a.id==='preview-transition').map(a=>a.effect.getTiming().duration);
    b.cancelAnimations();
    return {dice,flight,duration,preview,faceTransition:getComputedStyle(b.svg.querySelector('.board-die-face')).transitionDuration};
   });
   if(scale===0){assert.equal(sample.dice.length,0);assert.equal(sample.duration,0);assert.equal(sample.flight,0);assert.equal(sample.preview.length,0);}
   else {assert.ok(sample.dice.every(d=>d===560*scale));assert.equal(sample.duration,460*scale);assert.ok(sample.preview.includes(560*scale),JSON.stringify({scale,sample}));}
   samples.push({scale,...sample});
  }
  await set(3);
  await page.evaluate(()=>speedFixture.ui.board.render(speedFixture.s,{...speedFixture.options,presentation:{roll:true}}));
  await open();await slider.press('Home');
  assert.equal(await page.locator('#board').evaluate(n=>n.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0,'instant settles active animations');
  await page.locator('.settings-dialog .close').click();
  assert.equal(await page.evaluate(async()=>JSON.stringify(await speedFixture.st.get('work','animation-speed-fixture'))),saved);
  for(const route of ['/backgammon/','/backgammon/controls/','/backgammon/openings/']) {
   await page.goto(base+route);
   await page.waitForFunction(()=>document.documentElement.dataset.motionScale==='0');
   assert.equal(await page.evaluate(async()=>(await import('/backgammon/ui/motion.mjs')).motionDuration(1000)),0,route);
  }
  await page.goto(base+'/backgammon/play/');await open();assert.equal(await slider.inputValue(),'0','instant persists across pages');
  await slider.press('End');await page.locator('.settings-dialog .close').click();await page.reload();await open();
  assert.equal(await slider.inputValue(),'3','slow setting persists after reload');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.evaluate(async()=>(await import('/backgammon/ui/motion.mjs')).motionDuration(1000)),0);
  assert.deepEqual(errors,[]);return {samples,persisted:true,gamePreserved:true,instantInterrupt:true};
 }finally{await ctx.close();}
};
