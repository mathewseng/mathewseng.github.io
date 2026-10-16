module.exports=async(browser,base)=>{
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),page=await ctx.newPage();
 try {
  await page.goto(base+'/backgammon/');
  return await page.evaluate(async()=>{
   const {shell,DraftBoard}=await import('/backgammon/ui/shell.mjs'), r=await import('/backgammon/core/rules.mjs');
   const {saveSettings}=await import('/backgammon/core/storage.mjs');
   saveSettings({interactionMode:'advanced',motion:'full',equityBar:false,sounds:false});
   const d=new DraftBoard(shell('trainer','Interaction benchmark').board);
   const s=r.initialState({phase:'move',dice:[1,1],matchLength:0});
   s.points.fill(0);for(const [p,n] of [[5,4],[3,4],[2,2],[1,2],[0,1],[20,-15]])s.points[p]=n;s.off=[2,0];
   const paths=r.legalPaths(s), timings=[],frames=[];
   for(let i=0;i<30;i++){
    d.set(s,paths);d.minDraft=0;
    for(let move=0;move<4;move++){
     const st=d.candidates()[0];if(!st)break;
     const start=performance.now();d.point(st.from,{checkerTap:true});
     timings.push(performance.now()-start);
     await new Promise(resolve=>requestAnimationFrame(()=>{frames.push(performance.now()-start);resolve();}));
    }
    d.undo();await new Promise(resolve=>requestAnimationFrame(resolve));
   }
   const stats=a=>{a.sort((a,b)=>a-b);return {samples:a.length,medianMs:a[Math.floor(a.length/2)],p95Ms:a[Math.floor(a.length*.95)],maxMs:a.at(-1)};};
   return {viewport:'390×844 emulation; desktop CPU, not a low-battery phone',legalPaths:paths.length,action:stats(timings),nextFrame:stats(frames)};
  });
 }finally{await ctx.close();}
};
