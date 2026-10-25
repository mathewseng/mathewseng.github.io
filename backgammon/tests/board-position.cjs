const assert=require('node:assert/strict'),path=require('node:path');
const {seedOpening,waitWork}=require('./play-helpers.cjs');
module.exports=async(browser,base,out,name)=>{
 const results=[];
 for(const [width,height] of [[390,844],[375,667],[844,390],[1366,768]]){
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:width<1000,serviceWorkers:'block'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(name==='chromium'&&width<1000){const cdp=await ctx.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});}
  const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  try{
   await seedOpening(page,[4,1,3,1,4,2]);
   await page.goto(base+'/backgammon/');await ready();
   await page.evaluate(async()=>{
    const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
    const {localConfig}=await import('/backgammon/core/play-session.mjs');
    const initial=r.initialState({phase:'roll',matchLength:0});
    st.saveSettings({analysisAhead:false,equityBar:true,motionScale:.5});
    const game={id:'stable-board',initial,state:initial,started:true,events:[],names:['White','Black'],config:localConfig({mode:'local',tutor:false,warning:false})};
    await st.put('work',{id:'play',game,draft:[]});
   });
   await page.goto(base+'/backgammon/play/');await ready();
   await page.locator('#resume-match').click();
   await page.waitForTimeout(200);
   await page.evaluate(()=>{
    window.boardFrames=[];
    const frame=()=>{
     const svg=document.querySelector('#board > svg'),m=svg?.getScreenCTM();
     if(m){const p=new DOMPoint(0,0).matrixTransform(m);window.boardFrames.push({y:p.y+scrollY,scale:m.a});}
     window.boardFrame=requestAnimationFrame(frame);
    };frame();
   });
   for(let turn=0;turn<2;turn++){
    if(turn===1){
     await page.keyboard.press('d');
     await page.locator('#take-cube').waitFor();
     await page.locator('#take-cube').click();
    }else
    await page.keyboard.press('c');
    await waitWork(page,w=>w.game.state.phase==='move');
    await page.locator('#confirm').waitFor();
    await page.locator('#panel-toggle').click();
    for(let i=0;i<4 && await page.locator('#confirm').isDisabled();i++)
     await page.getByLabel('Accessible move selection',{exact:true}).selectOption({index:1});
    await page.locator('#details-dialog .close').click();
    await page.locator('#confirm').click();
    await waitWork(page,w=>w.game.state.phase==='roll');
    await page.waitForTimeout(350);
   }
   const frames=await page.evaluate(()=>{cancelAnimationFrame(window.boardFrame);return boardFrames;});
   const ys=frames.map(f=>f.y),range=Math.max(...ys)-Math.min(...ys);
   assert.ok(range<1,`visible board y stays fixed at ${width}x${height}: ${Math.min(...ys)}–${Math.max(...ys)}`);
   await page.screenshot({path:path.join(out,`${name}-board-position-${width}.png`)});
   assert.deepEqual(errors,[]);results.push({width,height,frames:frames.length,y:ys[0],range});
  }finally{await ctx.close();}
 }
 return results;
};
