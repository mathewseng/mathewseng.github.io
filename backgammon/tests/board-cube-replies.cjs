const assert=require('node:assert/strict'),path=require('node:path');
const {waitWork}=require('./play-helpers.cjs');
module.exports=async(browser,base,out,name)=>{
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
 const page=await ctx.newPage(),errors=[],failedRequests=[],report=[];
 page.on('pageerror',e=>errors.push({message:e.message,stack:e.stack,url:page.url()}));
 page.on('requestfailed',r=>failedRequests.push({url:r.url(),failure:r.failure()?.errorText}));
 const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
 try{
  for(const action of ['take','pass','beaver','match','raccoon']){
   const initialCube={take:1,pass:8,beaver:4,match:2,raccoon:64}[action],currentCube=action==='raccoon'?initialCube*2:initialCube;
   await page.goto(base+'/backgammon/');await ready();
   await page.evaluate(async({action,initialCube})=>{
    const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
    const {localConfig}=await import('/backgammon/core/play-session.mjs');
    const turn=action==='raccoon'?0:1;
    let s=r.transition(r.initialState({turn,phase:'roll',cube:{value:initialCube,owner:initialCube===1?null:turn},matchLength:action==='match'?7:0,rules:{immediateRedoubles:action==='match'?0:2}}),{type:'double'},turn);
    if(action==='raccoon')s=r.transition(s,{type:'beaver'},1);
    st.saveSettings({motion:'reduce',analysisAhead:false,equityBar:false});
    await st.put('work',{id:'play',game:{id:'cube-'+action,started:true,state:s,initial:s,events:[],names:['You','Black'],
      config:localConfig({mode:'computer',humanSide:0,matchLength:s.matchLength,rules:s.rules,tutor:false,warning:false})},draft:[]});
   },{action,initialCube});
   await page.goto(base+'/backgammon/play/');await ready();
   await page.evaluate(async()=>{(await import('/backgammon/engine/client.mjs')).EngineClient.prototype.analyze=()=>new Promise(()=>{});});
   await page.locator('#resume-match').tap();await page.locator('#take-cube').waitFor();
   assert.equal(await page.locator('#drop-cube .cube-reply-label').innerText(),'Drop');
   assert.equal(await page.locator('#drop-cube .cube-reply-value').innerText(),`−${currentCube}`,'Drop shows the current stake, before accepting the offer');
   assert.equal(await page.locator('#take-cube .cube-reply-value').innerText(),String(currentCube*2));
   if(action!=='match')assert.equal(await page.locator('#immediate-redouble .cube-reply-value').innerText(),String(currentCube*4));
   assert.equal(await page.locator('#confirm').count(),0);
   assert.equal(await page.locator('#immediate-redouble').count(),action==='match'?0:1);
   for(const [width,height] of [[320,568],[390,844],[667,260],[844,390],[1366,768]]){
    await page.setViewportSize({width,height});
    await page.waitForFunction(()=>{
      const board=document.querySelector('#board .bg-board').getBoundingClientRect(),drop=document.querySelector('#drop-cube').getBoundingClientRect(),take=document.querySelector('#take-cube').getBoundingClientRect();
      const svg=document.querySelector('#board .bg-board'), m=svg.getScreenCTM();
      const target=new DOMPoint(48,330).matrixTransform(m),bar=document.querySelector('#board [data-pattern="bar"]').getBoundingClientRect(),center={x:bar.x+bar.width/2};
      return Math.abs(drop.left-target.x)<1&&Math.abs(take.left+take.width/2-center.x)<1&&Math.abs(drop.top+drop.height/2-target.y)<1&&drop.top>=board.top&&take.bottom<=board.bottom;
    });
    const boxes=await page.evaluate(()=>Object.fromEntries(['drop-cube','take-cube','immediate-redouble'].map(id=>{
     const n=document.getElementById(id);if(!n)return[id,null];const r=n.getBoundingClientRect();
     return[id,{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,home:n.parentElement.id||n.parentElement.className}];
    })));
    assert.ok(boxes['drop-cube'].x+boxes['drop-cube'].width<boxes['take-cube'].x);
    const labels=await page.locator('.cube-reply').evaluateAll(buttons=>buttons.map(button=>{
      const face=button.querySelector('.cube-reply-face').getBoundingClientRect(),content=button.querySelector('.cube-reply-content').getBoundingClientRect();
      return {id:button.id,dx:content.x+content.width/2-face.x-face.width/2,dy:content.y+content.height/2-face.y-face.height/2,inside:content.left>=face.left&&content.right<=face.right&&content.top>=face.top&&content.bottom<=face.bottom};
    }));
    for(const label of labels){
      assert.ok(Math.abs(label.dx)<1&&Math.abs(label.dy)<1,`label and value centered together: ${JSON.stringify(label)}`);
      assert.ok(label.inside,`label fits button: ${label.id} at ${width}×${height}`);
    }
    for(const b of Object.values(boxes).filter(Boolean))assert.ok(b.height>=44&&b.y>=0&&b.bottom<=height+1,JSON.stringify({width,height,boxes}));
    if(action!=='match'){
      assert.match(boxes['immediate-redouble'].home,/board-cube-replies/);
      assert.ok(boxes['take-cube'].x+boxes['take-cube'].width<boxes['immediate-redouble'].x,'Beaver is to the right of Take');
      assert.ok(Math.abs(boxes['drop-cube'].y-boxes['immediate-redouble'].y)<1,'all cube actions align');
      const midpoint=b=>b.x+b.width/2;
      assert.ok(Math.abs((midpoint(boxes['drop-cube'])+midpoint(boxes['immediate-redouble']))/2-midpoint(boxes['take-cube']))<1,'Drop and redouble are symmetric around Take');
    }
    const collisions=await page.evaluate(()=>{
      const circles=[...document.querySelectorAll('#board .checker > circle:first-child')].map(n=>n.getBoundingClientRect());
      return ['drop-cube','take-cube','immediate-redouble'].filter(id=>document.getElementById(id)).flatMap(id=>{
        const b=document.getElementById(id).querySelector(".cube-reply-face").getBoundingClientRect();
        return circles.filter(c=>Math.min(b.right,c.right)-Math.max(b.left,c.left)>1&&Math.min(b.bottom,c.bottom)-Math.max(b.top,c.top)>1).map(c=>({id,checker:{x:c.x,y:c.y,width:c.width,height:c.height},button:{x:b.x,y:b.y,width:b.width,height:b.height}}));
      });
    });
    assert.deepEqual(collisions,[],`cube controls never cover checkers at ${width}×${height}`);

    if(action==='take')await page.screenshot({path:path.join(out,`${name}-cube-replies-${width}.png`)});
   }
   if(action!=='match'){
    await page.setViewportSize({width:390,height:844});
    await page.locator(action==='take'?'#take-cube':action==='pass'?'#drop-cube':'#immediate-redouble').tap();
    const saved=await waitWork(page,w=>w?.game.events.some(e=>e.action.type===action));
    assert.equal(saved.game.events[0].action.type,action);
    assert.equal(saved.game.events[0].actor,0);
    if(action==='pass')assert.equal(saved.game.state.result.points,currentCube,'displayed Drop cost matches the scored loss');
   }
   // Finish post-action module imports before the next fixture navigates away.
   // The deliberately pending engine promise itself needs no network activity.
   await page.waitForLoadState('networkidle');
   report.push({action});
  }
  // Opponent decisions must never briefly mount the local player's controls,
  // including the render before the computer's pending search starts.
  for(const phase of ['double','move','roll']){
   await page.setViewportSize({width:390,height:844});
   await page.goto(base+'/backgammon/');await ready();
   await page.evaluate(async phase=>{
    const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
    const {localConfig}=await import('/backgammon/core/play-session.mjs');
    const s=phase==='double'
     ?r.transition(r.initialState({turn:0,phase:'roll',matchLength:0,rules:{immediateRedoubles:2}}),{type:'double'},0)
     :r.initialState({turn:1,phase,dice:phase==='move'?[4,1]:[],matchLength:0});
    st.saveSettings({motion:'reduce',analysisAhead:false,equityBar:false});
    await st.put('work',{id:'play',game:{id:'opponent-'+phase,started:true,state:s,initial:s,events:[],names:['You','Black'],
     config:localConfig({mode:'computer',humanSide:0,matchLength:0,rules:s.rules,tutor:false,warning:false})},draft:[]});
   },phase);
   await page.goto(base+'/backgammon/play/');await ready();
   await page.evaluate(async()=>{
    (await import('/backgammon/engine/client.mjs')).EngineClient.prototype.analyze=()=>{
     window.opponentAnalysisStarted=true;return new Promise(()=>{});
    };
    window.foreignBoardActions=[];
    const selector='#confirm,#drop-cube,#take-cube,#immediate-redouble';
    new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{
     if(node.nodeType!==1)return;
     if(node.matches(selector))foreignBoardActions.push(node.id);
     foreignBoardActions.push(...[...node.querySelectorAll(selector)].map(n=>n.id));
    }))).observe(document.querySelector('#board'),{childList:true,subtree:true});
   });
   await page.locator('#resume-match').tap();
   await page.waitForFunction(()=>window.opponentAnalysisStarted);
   assert.equal(await page.locator('#confirm,#drop-cube,#take-cube,#immediate-redouble').count(),0,`${phase}: no player actions during opponent search`);
   assert.deepEqual(await page.evaluate(()=>foreignBoardActions),[],`${phase}: no momentary opponent action buttons`);
   await page.waitForLoadState('networkidle');
   report.push({opponentPhase:phase,controlsHidden:true});
  }
  assert.deepEqual(errors,[],JSON.stringify({errors,failedRequests}));return report;
 }finally{await ctx.close();}
};
