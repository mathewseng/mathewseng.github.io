const assert=require('node:assert/strict');
module.exports=async(browser,base)=>{
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
 try {
  await page.goto(base+'/backgammon/');
  const report=await page.evaluate(async()=>{
   const {EngineClient}=await import('/backgammon/engine/client.mjs');
   const {initialState}=await import('/backgammon/core/rules.mjs');
   const points=Array(24).fill(0);points[0]=5;points[1]=5;points[2]=5;points[23]=-15;
   const state=initialState({phase:'move',points,dice:[4,2],matchLength:0});
   const results=[];
   for(const backend of ['scalar','simd']) {
    const client=new EngineClient({openingBook:null,workerFactory:()=>new Worker(`/backgammon/engine/worker.mjs?backend=${backend}`,{type:'module'})});
    try {
     for(const preset of ['extended5','extended6']) for(const phase of ['move','roll']) {
      const s={...state,phase,dice:phase==='move'?[4,2]:[]};
      const checkpoints=[];
      const result=await client.analyze(s,{preset,useBook:false,onProgress:p=>checkpoints.push(p)});
      results.push({backend,actualBackend:result.backend,preset,phase,plies:result.settings.plies,
       scores:result.candidates?result.candidates.map(c=>[c.key,c.equity]):result.outcomes,progress:checkpoints});
     }
    }finally{client.destroy();}
   }
   return results;
  });
  for(const row of report) {
   assert.equal(row.plies,row.preset==='extended5'?5:6);
   assert.ok(row.scores.length);
   const simd=report.find(r=>r.backend==='simd'&&r.preset===row.preset&&r.phase===row.phase);
   if(row.phase==='move') {
    assert.ok(row.progress.some(p=>p.plies===row.plies&&p.completed===p.total));
    for(const [key,equity] of row.scores)assert.ok(Math.abs(equity-simd.scores.find(c=>c[0]===key)[1])<1e-5);
   }else row.scores.forEach((v,i)=>assert.ok(Math.abs(v-simd.scores[i])<1e-5));
  }
  return report;
 }finally{await context.close();}
};
