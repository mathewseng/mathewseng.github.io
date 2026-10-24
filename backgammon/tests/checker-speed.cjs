// Optional measurement, not a timing assertion or part of routine CI.
// Run via BG_MODULES=checker-speed after assembling the site.
const fs=require('node:fs'),zlib=require('node:zlib'),path=require('node:path');
module.exports=async function checkerSpeed(browser,base,out,name) {
  const corpus=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'../docs/puretd-native-parity.json.gz'))));
  const inputs=[0,1,14,15,20,40,80,146,300,700].map(i=>corpus.openings[i]);
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  try {
    await page.goto(base+'/backgammon/');
    await page.exposeFunction('recordSpeed',row=>console.log(name,JSON.stringify(row)));
    const rows=await page.evaluate(async inputs=>{
      const {EngineClient}=await import('/backgammon/engine/client.mjs');
      const rows=[],methods=[
        {name:'GNUbg 2 ply',preset:'deep',url:'/backgammon/engine/worker.mjs'},
        {name:'GNUbg 3 ply',preset:'expert',url:'/backgammon/engine/worker.mjs'},
        {name:'PureTD 1 ply',preset:'standard',url:'/backgammon/engine/puretd-worker.mjs'},
        {name:'PureTD wide 1 ply',preset:'standard',url:'/backgammon/engine/puretd-worker.mjs?model=wide'},
      ];
      for(let repeat=0;repeat<3;repeat++) {
        const clients=methods.map(m=>new EngineClient({openingBook:null,workerFactory:()=>new Worker(m.url,{type:'module'})}));
        try {
          for(const client of clients)await client.start();
          for(const [i,input] of inputs.entries())for(let j=0;j<methods.length;j++) {
            const index=(repeat+i+j)%methods.length,method=methods[index],client=clients[index];
            const start=performance.now(),result=await client.analyze(input.state,{preset:method.preset,useBook:false});
            if(result.cached||result.book||result.backend!=='simd')throw Error('Unexpected cache, book or backend');
            const row={id:input.id,repeat,method:method.name,engine:result.engine,modelSHA256:result.model?.sha256,
              backend:result.backend,wallMs:performance.now()-start,searchMs:result.elapsedMs,
              startupMs:client.startup.elapsedMs,candidates:result.candidates.length,best:result.candidates[0].key};
            rows.push(row);await window.recordSpeed(row);
          }
        }finally{clients.forEach(c=>c.destroy());}
      }
      return rows;
    },inputs);
    const median=xs=>{const s=xs.toSorted((a,b)=>a-b);return (s[Math.floor((s.length-1)/2)]+s[Math.ceil((s.length-1)/2)])/2;};
    return {schema:1,browser:name,version:browser.version(),recordedAt:new Date().toISOString(),
      method:'Ten fixed opening/reply positions, three repetitions, fresh workers per repetition, rotating method order per position. No opening book or result-cache hits. Startup is separate; native position caches can warm naturally across positions. Development-machine load is not isolated; these are exploratory latencies, not a controlled or general speed claim.',
      cases:inputs.map(c=>c.id),rows,summary:[...new Set(rows.map(r=>r.method))].map(method=>{
        const data=rows.filter(r=>r.method===method);
        return {method,measurements:data.length,medianSearchMs:median(data.map(r=>r.searchMs)),
          medianWallMs:median(data.map(r=>r.wallMs)),totalSearchMs:data.reduce((n,r)=>n+r.searchMs,0)};
      })};
  }finally{await context.close();}
};
