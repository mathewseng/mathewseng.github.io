// Run after scripts/assemble-site.sh. Real WASM, three browser engines, UI snapshots.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const browsers=require('playwright'),{launchQuietBrowser}=require('../../scripts/quiet-browser.cjs');
const root=path.resolve('_site'),out=path.resolve('backgammon/test-results/search-policy');fs.mkdirSync(out,{recursive:true});
const traces=JSON.parse(fs.readFileSync('backgammon/docs/search-policy-traces.json'));
const live=JSON.parse(fs.readFileSync('backgammon/docs/search-policy-live.json'));
const fixture=traces.cases.find(c=>c.id===live.rows.find(r=>r.policy.budget.reason==='clear-lead'&&r.policy.plies===2).id);
const server=http.createServer((req,res)=>{
 let url=new URL(req.url,'http://localhost').pathname;if(url.endsWith('/'))url+='index.html';
 const file=path.resolve(root,'.'+url);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm','.css':'text/css'})[path.extname(file)]||'text/html');
 fs.readFile(file,(e,b)=>{if(e)res.writeHead(404);res.end(e?'Not found':b);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,report=[];
 try{for(const name of (process.env.BG_BROWSERS||'chromium,firefox,webkit').split(',')){
  const browser=await launchQuietBrowser(browsers[name],{headless:true});
  try{
   const adaptive=await require('./adaptive.cjs')(browser,base,out,name);
   const page=await browser.newPage({serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/backgammon/');
   const result=await page.evaluate(async state=>{
    const {EngineClient}=await import('/backgammon/engine/client.mjs');
    const {PRESETS}=await import('/backgammon/engine/metadata.mjs');
    const client=new EngineClient();
    try{
     const hint=await client.analyze(state,{preset:'auto'});
     if(hint.settings.plies<3)throw Error('Auto ended below the minimum depth');
     if(hint.budget.reason==='clear-lead'&&(!hint.budget.lead.stable||hint.settings.plies<3))throw Error('Premature gap stop');
     if(!hint.budget.forecast||hint.budget.policy!=='minimum-three-v2')throw Error('Missing cost/model metadata');
     const submitted=hint.candidates.at(-1).steps;
     const actual=await client.analyze(state,{preset:'auto',submitted});
     if(actual.settings.plies<3||actual.budget.reason==='clear-lead'||!actual.actual)throw Error('Actual grading used the hint shortcut');
     const preset=Object.keys(PRESETS).find(k=>PRESETS[k].plies===actual.settings.plies);
     const fixed=await client.analyze(state,{preset,submitted});
     if(Math.abs(actual.actual.equity-fixed.actual.equity)>1e-5)throw Error('Grading changed actual equity');
     return {hintReason:hint.budget.reason,hintPlies:hint.settings.plies,gradingReason:actual.budget.reason,gradingPlies:actual.settings.plies};
    }finally{client.destroy();}
   },fixture.state);
   const url=await page.evaluate(async s=>(await import('/backgammon/core/xgid.mjs')).shareURL(s),fixture.state);
   for(const viewport of [{width:1366,height:768},{width:390,height:844}]){
    await page.setViewportSize(viewport);await page.goto(url);
    await page.waitForFunction(()=>document.querySelector('#analyze')?.textContent==='Analyze'&&document.querySelector('#analysis-budget')?.textContent.includes('Next depth:'));
    if(viewport.width<600)await page.locator('#panel-toggle').click();
    await page.locator('#analysis-budget').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`${out}/${name}-policy-${viewport.width}.png`,fullPage:true,animations:'disabled'});
   }
   assert.deepEqual(errors,[]);report.push({name,version:browser.version(),adaptive,result});console.log(name,JSON.stringify(result));
  }finally{await browser.close();}
 }
 fs.writeFileSync(`${out}/browser-report.json`,JSON.stringify(report,null,2)+'\n');
 }finally{server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
