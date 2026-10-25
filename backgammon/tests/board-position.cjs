const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {seedOpening,waitWork}=require('./play-helpers.cjs');
module.exports=async(browser,base,out,name)=>{
 const results=[];
 const cases = [
  ...[[320,568],[375,667],[390,844],[768,1024],[1024,768],[844,390],[1366,768]].map(size=>({size,scenario:'contact'})),
  ...[[390,844],[844,390],[1366,768]].map(size=>({size,scenario:'bearoff'})),
 ];
 for(const {size:[width,height],scenario} of cases){
  const label=`${scenario}-${width}x${height}`;
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:width<1000,serviceWorkers:'block'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(name==='chromium'&&width<1000){const cdp=await ctx.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});}
  const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  try{
   await seedOpening(page,scenario==='bearoff'?[2,1,3,3]:[4,1,3,3]);
   await page.goto(base+'/backgammon/');await ready();
   await page.evaluate(async scenario=>{
    const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
    const {localConfig}=await import('/backgammon/core/play-session.mjs');
    const points=Array(24).fill(0);
    for(const [i,n] of [2,3,2,4,0,4].entries()){points[i]=n;points[23-i]=-n;}
    const initial=r.initialState({phase:'roll',matchLength:0,...(scenario==='bearoff'?{points}:{})});
    st.saveSettings({analysisAhead:false,equityBar:true,motionScale:.5});
    const game={id:'stable-board',initial,state:initial,started:true,events:[],names:['White','Black'],config:localConfig({mode:'local',tutor:false,warning:false})};
    await st.put('work',{id:'play',game,draft:[]});
   },scenario);
   await page.goto(base+'/backgammon/play/');await ready();
   await page.locator('#resume-match').click();
   await page.waitForTimeout(200);
   await page.evaluate(()=>{
    window.boardFrames=[];
    const frame=()=>{
     const svg=document.querySelector('#board > svg'),m=svg?.getScreenCTM();
     if(m){const p=new DOMPoint(0,0).matrixTransform(m);window.boardFrames.push({x:p.x+scrollX,y:p.y+scrollY,width:876*m.a,height:660*m.d,tracks:getComputedStyle(document.querySelector('.stage')).gridTemplateRows,status:document.querySelector('#message').textContent});}
     window.boardFrame=requestAnimationFrame(frame);
    };frame();
   });
   for(let turn=0;turn<2;turn++){
    if(turn===1&&scenario==='contact'){
     await page.keyboard.press('d');
     await page.locator('#take-cube').waitFor();
     await page.locator('#take-cube').click();
    }else
    await page.keyboard.press('c');
    await waitWork(page,w=>w.game.state.phase==='move');
    await page.locator('#confirm').waitFor();
    await page.keyboard.press('s');
    await page.locator('#panel-toggle').click();
    for(let i=0;i<4 && await page.locator('#confirm').isDisabled();i++)
     await page.getByLabel('Accessible move selection',{exact:true}).selectOption({index:1});
    await page.locator('#details-dialog .close').click();
    if(turn===0) {
     const before=(await waitWork(page,w=>w.draft.length>0)).draft.length;
     await page.keyboard.press('z');
     await waitWork(page,w=>w.draft.length<before);
     await page.locator('#panel-toggle').click();
     for(let i=0;i<4 && await page.locator('#confirm').isDisabled();i++)
      await page.getByLabel('Accessible move selection',{exact:true}).selectOption({index:1});
     await page.locator('#details-dialog .close').click();
    }
    await page.locator('#confirm').click();
    await waitWork(page,w=>w.game.state.phase==='roll');
    await page.waitForTimeout(350);
   }
   const frames=await page.evaluate(()=>{cancelAnimationFrame(window.boardFrame);return boardFrames;});
   fs.writeFileSync(path.join(out,`${name}-board-frames-${label}.json`),JSON.stringify(frames,null,2));
   const deltas=Object.fromEntries(['x','y','width','height'].map(key=>[key,Math.max(...frames.map(f=>f[key]))-Math.min(...frames.map(f=>f[key]))]));
   assert.ok(Object.values(deltas).every(d=>d<1),`board bounds stay fixed during ${label}: ${JSON.stringify(deltas)}`);
   if(scenario==='bearoff') {
    const saved=await waitWork(page,w=>w.game.state.off[0]+w.game.state.off[1]>0);
    assert.ok(saved.game.events.some(e=>e.action.steps?.some(s=>s.to==='off')),'fixture exercised bearing off');
   }
   await page.screenshot({path:path.join(out,`${name}-board-position-${label}.png`)});
   assert.deepEqual(errors,[]);results.push({scenario,width,height,frames:frames.length,bounds:frames[0],deltas});
  }finally{await ctx.close();}
 }
 return results;
};
