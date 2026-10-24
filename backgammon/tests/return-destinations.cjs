const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function returnDestinations(browser,base,out,name){
 const report=[];
 for(const [width,height] of [[1366,768],[390,844],[844,390]]){
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:width!==1366,reducedMotion:'reduce',serviceWorkers:'block'}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try {
   await page.goto(base+'/backgammon/');
   await page.evaluate(async()=>{
    const {shell,DraftBoard}=await import('/backgammon/ui/shell.mjs');
    const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
    st.saveSettings({motion:'reduce',interactionMode:'advanced',equityBar:false});
    const d=new DraftBoard(shell('trainer','Return destinations').board);
    window.returnsTest={d,r,st};
   });
   for(const turn of [0,1]) for(const orientation of [0,1]) for(const target of [9,10]) for(const separate of [false,true]) {
    const expected=await page.evaluate(({turn,orientation,target,separate})=>{
     const {d,r,st}=returnsTest, p=n=>turn?24-n:n-1, points=Array(24).fill(0);
     st.saveSettings({orientation});
     for(const [n,count] of [[4,2],[5,3],[6,3],[7,2],[8,2],[11,1],[13,1],[15,1],[2,-1],[3,-4],[19,-1],[20,-2],[21,-2],[23,-3],[24,-2]]) points[p(n)]=count*(turn?-1:1);
     if(separate){points[p(15)]=0;points[p(13)]=0;points[p(9)]=turn?-1:1;points[p(10)]=turn?-1:1;}
     const s=r.initialState({phase:'move',dice:[6,5],turn,points}),paths=r.legalPaths(s);
     d.set(s,paths);
     const draft=separate?[{from:p(9),to:p(4),die:5},{from:p(10),to:p(4),die:6}]:[{from:p(15),to:p(9),die:6},{from:p(9),to:p(4),die:5}];
     d.draft=draft;d.selected=null;d.render();d.board.suppressClickUntil=0;
     return separate?draft.filter(step=>step.from!==p(target)):[{from:p(15),to:p(target),die:15-target}];
    },{turn,orientation,target,separate});
    const point=turn?24-target:target-1;
    const q=await page.locator(`[data-point="${point}"] .point-hit`).evaluate(n=>{
     const p=new DOMPoint(+n.getAttribute('x')+ +n.getAttribute('width')/2,+n.getAttribute('y')+ +n.getAttribute('height')/2).matrixTransform(n.getScreenCTM());return{x:p.x,y:p.y};
    });
    if(width===1366)await page.mouse.click(q.x,q.y);else await page.touchscreen.tap(q.x,q.y);
    assert.deepEqual(await page.evaluate(()=>returnsTest.d.draft),expected,JSON.stringify({width,turn,orientation,target,separate}));
    assert.equal(await page.evaluate(()=>returnsTest.r.matchingPaths(returnsTest.d.paths,returnsTest.d.draft).length>0),true);
   }
   await page.screenshot({path:path.join(out,`${name}-return-targets-${width}.png`)});
   assert.deepEqual(errors,[]);report.push({width,height,returnTargets:[9,10],bothPlayers:true,otherCheckerPreserved:true});
  }finally{await ctx.close();}
 }
 return report;
};
