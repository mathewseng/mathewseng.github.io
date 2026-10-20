const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=async function(browser,base,out,browserName){
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base+'/backgammon/');
  const result=await page.evaluate(async()=>{
   const {EngineClient}=await import('/backgammon/engine/client.mjs');
   const {shareURL}=await import('/backgammon/core/xgid.mjs');
   const {put}=await import('/backgammon/core/storage.mjs');
   const fixtures=(await(await fetch('/backgammon/data/exercises.json')).json()).items;
   const s=fixtures.find(f=>f.topic==='race').state,e=new EngineClient({openingBook:null});
   const rows=[];let cp;
   try{
    for(const policy of ['basic','balanced','short-deep','strong']){
     const r=await e.analyze(s,{rollout:{trials:64,seed:731,policy}});
     const depth={basic:0,balanced:1,strong:2,'short-deep':2}[policy];
     if(r.settings.policyId!==policy||r.settings.checkerPlies!==depth||r.settings.cubePlies!==depth||!r.candidates.every(c=>c.samples===64&&c.checkerPlies===depth&&c.cubePlies===depth))throw Error('Policy not applied');
     if(r.settings.truncationPlies!==(policy==='short-deep'?5:0)||!r.candidates.every(c=>c.truncationPlies===(policy==='short-deep'?5:0)))throw Error('Truncation not applied');
     rows.push({policy,equity:r.candidates[0].equity,best:r.candidates[0].key});cp=r.checkpoint;
    }
    let rejected=false;try{await e.analyze(s,{rollout:{trials:64,seed:731,policy:'balanced',resume:cp}});}catch{rejected=true;}
    if(!rejected)throw Error('Cross-policy samples accepted');
    if(rows.every(r=>r.equity===rows[0].equity))throw Error('Policies have no effect');
    await put('work',{id:'solver-rollout',checkpoint:cp});
    return {rows,url:shareURL(s),samples:64};
   }finally{e.destroy();}
  });
  await page.goto(result.url.replace(new URL(result.url).origin,base));
  await page.waitForFunction(()=>document.querySelector('#analyze')?.textContent==='Analyze' && document.querySelector('#analysis-budget')?.textContent.includes('completed'),{},{timeout:120000});
  await page.locator('#panel-toggle').click();
  await page.getByRole('button',{name:'Analysis section',exact:true}).click();
  await page.locator('#rollout-controls summary').click();
  await page.getByRole('button',{name:/Resume \/ extend/}).waitFor();
  const balanced=page.getByRole('button',{name:'Balanced · checker 1 / cube 1 ply',exact:true});
  await balanced.click();
  assert.equal(await page.locator('#start-rollout').isDisabled(),true,'Saved Strong samples cannot resume as Balanced');
  await page.getByRole('button',{name:'Strong · checker 2 / cube 2 ply',exact:true}).click();
  // Auto analysis may still be running; its Cancel button is independent.
  await page.waitForFunction(()=>!document.querySelector('#start-rollout').disabled,{},{timeout:120000});
  await page.screenshot({path:path.join(out,`${browserName}-rollout-policies-mobile.png`),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);return result;
 }finally{await context.close();}
};
