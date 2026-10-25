const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async(browser,base,out,name)=>{
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base+'/backgammon/');
  await page.evaluate(async()=>{
   const r=await import('/backgammon/core/rules.mjs'),{decisionReview}=await import('/backgammon/ui/decision-review.mjs'),{EngineClient}=await import('/backgammon/engine/client.mjs');
   const points=Array(24).fill(0);points[0]=5;points[1]=5;points[2]=5;points[23]=-15;
   const source=r.initialState({phase:'move',points,dice:[4,2],matchLength:0}),engine=new EngineClient();
   const result=await engine.analyze(source,{preset:'quick',useBook:false});engine.destroy();
   window.searchFixture={r,decisionReview,source,result,EngineClient,original:EngineClient.prototype.analyze,destroy:EngineClient.prototype.destroy};
   window.jobs=[];window.destroyed=0;
   EngineClient.prototype.analyze=function(s,opts){return new Promise((resolve,reject)=>jobs.push({s,opts,resolve,reject}));};
   EngineClient.prototype.destroy=function(){destroyed++;searchFixture.destroy.call(this);};
   window.openSearch=()=>decisionReview(source,{beforeRoll:{outcomes:[.123,.2,1],settings:{plies:2}}}).result({...result,elapsedMs:100},false);
   openSearch();
  });
  assert.equal(await page.locator('.review-preroll-equity').textContent(),'+0.123','pre-roll number is independent of rolled best equity');
  assert.equal(await page.locator('.review-position-dice').getAttribute('aria-label'),'Rolled 4–2');
  assert.equal(await page.locator('.decision-choices button').count(),0);
  assert.deepEqual(await page.locator('.review-depth strong').allTextContents(),['2 ply','3 ply','4 ply','5 ply','6 ply']);
  const three=()=>page.getByRole('button',{name:'Analyze at 3 ply',exact:true});
  assert.match(await three().textContent(),/~\d/);
  const before=await page.locator('.review-move[data-rank="1"]').textContent();
  await three().tap();
  assert.equal(await page.getByRole('progressbar',{name:'Analysis progress'}).isVisible(),true);
  await page.evaluate(()=>jobs.at(-1).opts.onProgress({plies:3,completed:2,total:5}));
  assert.equal(await page.locator('.review-search progress').getAttribute('value'),'0.4');
  assert.equal(await page.locator('.review-move[data-rank="1"]').textContent(),before);
  await page.evaluate(()=>jobs.at(-1).reject(new Error('Test engine failure')));
  await page.getByRole('button',{name:'Retry',exact:true}).waitFor();
  await page.getByRole('button',{name:'Retry',exact:true}).tap();
  await page.evaluate(()=>{const f=searchFixture;jobs.at(-1).resolve({...f.result,settings:{...f.result.settings,plies:3,name:'Expert'},elapsedMs:500});});
  await page.waitForFunction(()=>document.querySelector('.review-search-notice').textContent.includes('3 ply complete'));
  assert.equal(await three().count(),0);
  const four=()=>page.getByRole('button',{name:'Analyze at 4 ply',exact:true});
  for(const [width,height] of [[320,568],[390,844],[844,390],[1366,768]]){
   await page.setViewportSize({width,height});
   const fit=await page.locator('.decision-dialog').evaluate(n=>({x:n.scrollWidth<=n.clientWidth+1,y:n.scrollHeight<=n.clientHeight+1,list:n.querySelector('.review-move-rows').clientHeight,position:n.querySelector('.review-position').getBoundingClientRect().height}));
   assert.ok(fit.x&&fit.y&&fit.list>=44&&fit.position>=44,JSON.stringify({width,height,fit}));
   await page.screenshot({path:path.join(out,`${name}-review-depth-${width}.png`)});
  }
  await four().click();await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.evaluate(()=>{const f=searchFixture;jobs.at(-1).resolve({...f.result,settings:{...f.result.settings,plies:4,name:'Research'}});});
  assert.equal(await four().count(),1,'late cancelled result does not replace current comparison');
  assert.equal(await page.locator('.review-search-working').isVisible(),false);
  await four().click();await page.keyboard.press('Escape');await page.locator('.decision-dialog').waitFor({state:'detached'});
  assert.ok(await page.evaluate(()=>destroyed)>=2);
  // Restore the real worker and complete both a pre-roll evaluation and 3/4 ply.
  await page.evaluate(()=>{
   const f=searchFixture;f.EngineClient.prototype.analyze=f.original;f.EngineClient.prototype.destroy=f.destroy;
   f.decisionReview(f.source).result(f.result,false);
  });
  await page.waitForFunction(()=>/^[-+]\d/.test(document.querySelector('.review-preroll-equity').textContent));
  await three().click();
  await page.waitForFunction(()=>document.querySelector('.review-search-notice').textContent.includes('3 ply complete'),null,{timeout:120000});
  await four().click();
  await page.waitForFunction(()=>document.querySelector('.review-search-notice').textContent.includes('4 ply complete'),null,{timeout:120000});
  for(const depth of [5,6]) {
   await page.getByRole('button',{name:`Analyze at ${depth} ply`,exact:true}).click();
   await page.waitForFunction(depth=>document.querySelector('.review-search-notice').textContent.includes(`${depth} ply complete`),depth,{timeout:120000});
  }
  await page.keyboard.press('Escape');
  // A published reference has no usable local timing, but all buttons still
  // expose a rough duration before any new search starts.
  await page.evaluate(()=>{
   const f=searchFixture;
   f.decisionReview(f.source,{beforeRoll:{outcomes:[0,0,0]}}).result({...f.result,method:'reference',book:{},elapsedMs:1},false);
  });
  const estimates=await page.locator('.review-depth small').allTextContents();
  assert.equal(estimates.length,5);assert.ok(estimates.every(s=>s.startsWith('~')&&!/unknown|unavailable/i.test(s)));
  await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);return {preRoll:true,realDepths:[3,4,5,6],alwaysEstimated:true,progress:true,retry:true,cancel:true,layouts:4};
 }finally{await ctx.close();}
};
