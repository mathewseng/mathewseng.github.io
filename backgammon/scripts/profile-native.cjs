// SPDX-License-Identifier: GPL-3.0-or-later
// Diagnostic only: named WASM build on a dedicated blank profiling page.
// Production computation still runs in its worker. These are not latency benchmarks.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const crypto = require('node:crypto'), os = require('node:os');
const {chromium} = require('playwright');
const {launchQuietBrowser} = require('../../scripts/quiet-browser.cjs');
const root=process.cwd(), build=process.env.BG_PROFILE_BUILD;
if(!build)throw Error('Set BG_PROFILE_BUILD to the profile build’s dist_simd directory.');
const output=process.env.BG_OUTPUT||'backgammon/test-results/native-profile';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost').pathname;
  if(url==='/')return res.end('<!doctype html><title>GNUbg profiling</title>');
  const variant=/^\/profile\/(gnubg-core-module\.(js|wasm))$/.exec(url);
  const file=variant?path.resolve(build,variant[1]):path.resolve(root,'.'+url);
  if(!variant&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json'})[path.extname(file)]||'application/octet-stream');
  fs.readFile(file,(e,b)=>{if(e)res.writeHead(404);res.end(e?'Not found':b);});
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try{
    browser=await launchQuietBrowser(chromium);
    const page=await browser.newPage({serviceWorkers:'block'});await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async()=>{
      const {default:create}=await import('/profile/gnubg-core-module.js');
      const {createEvaluator}=await import('/backgammon/engine/evaluate.mjs');
      const module=await create({locateFile:p=>p.endsWith('.data')?'/backgammon/engine/vendor/'+p:'/profile/'+p});
      window.engine=createEvaluator(module);
      window.fixtures=(await(await fetch('/backgammon/data/exercises.json')).json()).items;
    });
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');
    const result=await page.evaluate(({topic,preset})=>{
      const state=fixtures.find(f=>f.topic===topic).state,r=engine.analyze(state,preset);
      return {state,settings:r.settings,elapsedMs:r.elapsedMs,best:r.candidates?.[0].notation||r.action};
    },{topic:process.env.BG_TOPIC||'contact',preset:process.env.BG_PRESET||'research'});
    const {profile}=await cdp.send('Profiler.stop');
    const nodes=new Map(profile.nodes.map(n=>[n.id,n])),times=new Map();
    for(let i=0;i<profile.samples.length;i++){
      const name=nodes.get(profile.samples[i]).callFrame.functionName;
      times.set(name,(times.get(name)||0)+profile.timeDeltas[i]);
    }
    const total=[...times.values()].reduce((a,b)=>a+b,0);
    const summary={recordedAt:new Date().toISOString(),method:'One diagnostic first search with Chromium CPU sampling at 1000 µs, named -g2 build, normal optimization flags. Function self-time includes inlined code. Profiler overhead and background activity affect durations; percentages describe this position only.',
      browser:browser.version(),environment:{cpu:os.cpus()[0].model,os:`${os.platform()} ${os.release()} ${os.arch()}`},
      wasmSHA256:sha(fs.readFileSync(path.resolve(build,'gnubg-core-module.wasm'))),...result,
      selfTime:[...times].map(([name,microseconds])=>({name,microseconds,percent:100*microseconds/total})).sort((a,b)=>b.microseconds-a.microseconds)};
    fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,'profile.cpuprofile'),JSON.stringify(profile));
    fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');
    console.log(JSON.stringify(summary));
  }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
