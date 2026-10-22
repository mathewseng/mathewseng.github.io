const assert = require('node:assert/strict'), http = require('node:http');
// Real HTTP failures reach module workers consistently in all three browsers.
module.exports = async function puretdLoading(browser, base) {
  const requests = new Map(), failed = new Set(), cases = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const match = /^\/__puretd_test\/([^/]+)(\/.*)$/.exec(url.pathname);
    const mode = match?.[1], file = match?.[2] || url.pathname;
    if (mode && file.includes('/vendor/puretd/')) requests.get(mode).push(file);
    const send = (status, type, bytes) => {
      res.writeHead(status, {'Content-Type':type, 'Cache-Control':'no-store'});res.end(bytes);
    };
    try {
      if (mode === 'no-simd' && file.endsWith('/engine/backend.mjs'))
        return send(200, 'text/javascript', 'export const supportsSIMD=()=>false;');
      if ((mode === 'bad-simd' && !file.includes('/scalar/') || mode === 'bad-both') && file.endsWith('.wasm'))
        return send(200, 'application/wasm', 'corrupt test binary');
      if (mode === 'bad-model' && file.endsWith('money.bin'))
        return send(200, 'application/octet-stream', 'corrupt test model');
      if (mode === 'retry-model' && file.endsWith('money.bin') && !failed.has(mode)) {
        failed.add(mode);return send(503, 'application/octet-stream', 'temporary test failure');
      }
      const source = await fetch(base + file + url.search);
      send(source.status, source.headers.get('content-type') || 'application/octet-stream', Buffer.from(await source.arrayBuffer()));
    } catch(error) {send(500, 'text/plain', error.message);}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    for (const mode of ['no-simd','bad-simd','bad-both','bad-model','retry-model','unknown-model']) {
      requests.set(mode, []);
      const context = await browser.newContext({serviceWorkers:'block'});
      try {
        const page = await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/backgammon/`);
        const result = await page.evaluate(async mode=>{
          const {EngineClient}=await import('/backgammon/engine/client.mjs');
          const {initialState}=await import('/backgammon/core/rules.mjs');
          const points=Array(24).fill(0);points[0]=1;points[23]=-14;
          const state=initialState({points,bar:[0,0],off:[14,1],phase:'move',dice:[2,1],matchLength:0,
            rules:{cube:true,jacoby:true,automaticDoubles:0,immediateRedoubles:0}});
          const url=`/__puretd_test/${mode}/backgammon/engine/puretd-worker.mjs${mode==='unknown-model'?'?model=unknown':''}`;
          const client=new EngineClient({openingBook:null,workerFactory:()=>new Worker(url,{type:'module'})});
          let initialError;
          try {
            if(mode==='retry-model')try{await client.analyze(state,{preset:'standard'});}catch(error){initialError=error.message;}
            const answer=await client.analyze(state,{preset:'standard'});
            return {backend:answer.backend,equity:answer.candidates[0].equity,startup:client.startup,initialError};
          }catch(error){return {error:error.message,released:client.worker===null,ready:client.ready};}
          finally{client.destroy();}
        },mode);
        const fetched=requests.get(mode);
        if(['bad-both','bad-model','unknown-model'].includes(mode)) {
          assert.match(result.error,mode==='unknown-model'?/Unknown PureTD model/:/integrity check failed/);
          assert.ok(result.released&&!result.ready,'failed initialization releases worker');
          if(mode==='bad-model')assert.ok(!fetched.some(url=>url.endsWith('.wasm')),'corrupt model must stop before executable loading');
          if(mode==='unknown-model')assert.equal(fetched.length,0);
        } else {
          assert.equal(result.equity,1);
          assert.equal(result.backend,mode==='retry-model'?'simd':'scalar');
          assert.equal(result.startup.fallback,mode==='bad-simd');
          assert.equal(fetched.filter(url=>url.endsWith('money.bin')).length,mode==='retry-model'?2:1);
          if(mode==='no-simd')assert.ok(!fetched.some(url=>url.endsWith('.wasm')&&!url.includes('/scalar/')));
          if(mode==='retry-model')assert.match(result.initialError,/503/);
        }
        cases.push({mode,...result,fetched});
      }finally{await context.close();}
    }
    return cases;
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
};
