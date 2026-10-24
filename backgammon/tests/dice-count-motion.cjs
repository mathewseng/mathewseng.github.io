const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async(browser,base,out,name)=>{
 const report=[];
 for(const touch of [false,true]){
  const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1366,height:768},hasTouch:touch,serviceWorkers:'block'}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(base+'/backgammon/');
   await page.evaluate(async()=>{
    const {shell}=await import('/backgammon/ui/shell.mjs');const {initialState}=await import('/backgammon/core/rules.mjs');
    const {saveSettings}=await import('/backgammon/core/storage.mjs');saveSettings({motion:'full',equityBar:false});document.documentElement.dataset.motion='full';
    const board=shell('trainer','Dice motion').board;window.diceCount={board,initialState};
    const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){const a=animate.call(this,frames,options);if(options?.id?.startsWith('dice-layout')){a.pause();a.currentTime=0;}return a;};
    const play=Animation.prototype.play;Animation.prototype.play=function(){const result=play.call(this);if(this.id.startsWith('dice-layout')){this.pause();this.currentTime=0;}return result;};
   });
   const render=async(dice,turn=0,historical=false)=>page.evaluate(({dice,turn,historical})=>{
    const {board,initialState}=diceCount;board.render(initialState({phase:historical?'roll':'move',dice:historical?[]:dice,turn:historical?1-turn:turn}),{
      orientation:0,interactive:!historical,preferredDie:dice[0],chooseDie:()=>{},
      lastMove:historical?{player:turn,dice,steps:[],points:{},origins:{},checkers:[]}:null,
    });
   },{dice,turn,historical});
   const frame=async(time)=>page.evaluate(time=>{
    for(const a of document.getAnimations())if(a.id.startsWith('dice-layout')){a.pause();a.currentTime=time;}
    return [...document.querySelectorAll('.board-die')].map(n=>{const s=getComputedStyle(n),m=new DOMMatrix(s.transform);return{x:m.e,y:m.f,opacity:+s.opacity};});
   },time);
   await render([4,1]);await frame(500);
   await render([6,6]);let f=await frame(0);
   assert.deepEqual(f.map(n=>n.x),[550,550,670,670]);assert.deepEqual(f.map(n=>n.opacity),[1,0,0,1]);
   f=await frame(160);assert.ok(f[0].x<550&&f[0].x>502);assert.ok(f[1].opacity>0&&f[1].opacity<1);
   assert.ok(f.every(n=>n.y===330),'layout spreads horizontally');
   await page.screenshot({path:path.join(out,`${name}-dice-expand-${touch?'phone':'desktop'}.png`)});
   const before=f;await render([6,6]);f=await frame(0);
   f.forEach((n,i)=>assert.ok(Math.abs(n.x-before[i].x)<.01 && Math.abs(n.opacity-before[i].opacity)<.01,'interrupted redraw preserves visible frame'));
   await frame(500);await render([6,6],0,true);
   assert.equal(await page.locator('.dice-layout-retiring').count(),2);
   f=await frame(0);assert.deepEqual(f.map(n=>n.x),[502,718]);
   const ghosts=await page.locator('.dice-layout-retiring').evaluateAll(ns=>ns.map(n=>({hidden:n.getAttribute('aria-hidden'),events:getComputedStyle(n).pointerEvents})));
   assert.ok(ghosts.every(g=>g.hidden==='true'&&g.events==='none'));
   await frame(210);await page.screenshot({path:path.join(out,`${name}-dice-collapse-${touch?'phone':'desktop'}.png`)});
   await frame(500);await page.evaluate(()=>document.getAnimations().filter(a=>a.id.startsWith('dice-layout')).forEach(a=>a.finish()));
   await page.waitForTimeout(30);assert.equal(await page.locator('.dice-layout-retiring').count(),0);
   await render([5,5],1);f=await frame(0);assert.deepEqual(f.map(n=>n.x),[144,144,264,264],'new player expands within own lane');
   await page.evaluate(()=>document.documentElement.dataset.motion='reduce');await render([2,1],1);
   assert.equal(await page.locator('.dice-layout-retiring').count(),0);
   assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.id.startsWith('dice-layout')).length),0);
   assert.deepEqual(errors,[]);report.push({touch,expansion:true,collapse:true,interruption:true,reducedMotion:true});
  }finally{await context.close();}
 }
 return report;
};
