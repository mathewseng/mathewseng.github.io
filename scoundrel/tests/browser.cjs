// Exercises the actual published files, with an isolated browser save store.
const assert=require("node:assert/strict"), fs=require("node:fs"), path=require("node:path");
const {chromium}=require("playwright"), {launchQuietBrowser}=require("../../scripts/quiet-browser.cjs"), {serveSite,settle}=require("../../scripts/site-pages.cjs");
const E=require("../engine.js"), study=require("../reports/outcomes.json");
const root=path.resolve(process.env.SCOUNDREL_SITE || "_site");
(async()=>{
  const server=await serveSite(root), browser=await launchQuietBrowser(chromium), errors=[];
  try {
    const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce"});
    const page=await context.newPage();
    await page.addInitScript(()=>{const RealWorker=window.Worker;window.Worker=class extends RealWorker{postMessage(message,...args){window.lastAnalysisMessage=message;return super.postMessage(message,...args);}};});
    page.on("pageerror",e=>errors.push(e.message));page.on("response",r=>{if(r.status()>=400)errors.push(r.status()+" "+r.url());});
    await page.goto(server.base+"/scoundrel/?seed=test1");await settle(page);
    assert.equal(await page.locator(".encounter").count(),4);assert.equal(await page.locator(".playing-card").count(),0);
    assert.equal(new Set(await page.locator(".encounter-art").evaluateAll(es=>es.map(e=>e.src))).size,4);
    await page.locator("#oracle-toggle").check();
    await page.waitForFunction(()=>document.querySelectorAll("#action-values tr").length>0 && !document.querySelector("#action-values").textContent.includes("Searching"),null,{timeout:45000});
    assert.ok((await page.locator("#oracle-summary").innerText()).includes("score"));
    const analysisMessage=await page.evaluate(()=>window.lastAnalysisMessage);
    assert.ok(analysisMessage.observation);assert.equal('state' in analysisMessage,false);
    for(const key of ['deck','initialDeck','seed','history'])assert.equal(key in analysisMessage.observation,false);
    const before=E.restore(await page.evaluate(()=>localStorage.getItem("scoundrel-run-v1")));
    assert.equal(await page.locator("#action-values tr").count(),E.actions(before).length);
    const fleeRows=await page.locator('[data-preview]').evaluateAll(es=>es.map(e=>JSON.parse(e.dataset.preview)).filter(a=>a.type==='flee'));
    assert.deepEqual(fleeRows.map(a=>a.direction),['left','right']);
    await page.locator('#flee-button').click();
    assert.equal(await page.locator('[data-avoid]').count(),2);
    assert.equal(await page.locator('[data-avoid-ev]').count(),2);
    assert.deepEqual(await page.locator('[data-avoid="right"] .avoid-card strong').allTextContents(),before.room.map(c=>String(c.value)).reverse());
    await page.locator('#avoid-dialog [data-close]').click();
    assert.equal(E.restore(await page.evaluate(()=>localStorage.getItem("scoundrel-run-v1"))).steps,0);
    const suggested=JSON.parse(await page.locator("#action-values tr.is-best [data-preview]").getAttribute("data-preview"));
    if(suggested.id)await page.locator(`[data-card="${suggested.id}"]`).click();
    if(suggested.type==="flee"){await page.locator("#flee-button").click();await page.locator(`[data-avoid="${suggested.direction || "left"}"]`).click();}
    else await page.locator("[data-action]").filter({hasText:suggested.mode==="bare"?"barehanded":suggested.mode==="weapon"?"Use weapon":suggested.type==="equip"?"Equip":"Drink"}).click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem("scoundrel-run-v1")).steps===1);
    await page.locator("#oracle-toggle").uncheck();await page.reload();await settle(page);assert.equal(E.restore(await page.evaluate(()=>localStorage.getItem("scoundrel-run-v1"))).steps,1);
    await page.locator("#settings-button").click();await page.locator("#atmosphere").selectOption("moss");assert.equal(await page.locator("html").getAttribute("data-atmosphere"),"moss");
    await page.locator("#catalog-button").click();assert.equal(await page.locator("#catalog-grid figure").count(),44);
    await page.locator('[data-filter="c"]').click();assert.equal(await page.locator("#catalog-grid figure").count(),13);
    await page.locator("#catalog-dialog [data-close]").click();
    await page.locator("#settings-button").click();await page.locator("#atmosphere").selectOption("ember");await page.locator("#settings-dialog [data-close]").click();
    const witness=study.rows.find(r=>r.survived);
    await page.goto(server.base+"/scoundrel/?seed="+witness.seed);await settle(page);
    for(const [i,a]of witness.line.entries()){
      if(a.id)await page.locator(`[data-card="${a.id}"]`).click();
      if(a.type==="flee"){await page.locator("#flee-button").click();await page.locator(`[data-avoid="${a.direction || "left"}"]`).click();}
      else await page.locator("[data-action]").filter({hasText:a.mode==="bare"?"barehanded":a.mode==="weapon"?"Use weapon":a.type==="equip"?"Equip":a.type==="drink"?"potion":"Enter next room"}).click();
      const actual=E.restore(await page.evaluate(()=>localStorage.getItem("scoundrel-run-v1")));assert.equal(actual.steps,i+1);
    }
    await page.locator("#result-dialog").waitFor({state:"visible"});assert.equal(await page.locator("#result-score").innerText(),String(witness.score));
    assert.equal(E.restore(await page.evaluate(()=>localStorage.getItem("scoundrel-run-v1"))).phase,"won");
    // Fresh save for screenshots and four responsive shell sizes.
    await page.goto(server.base+"/scoundrel/?seed=showcase");await settle(page);
    const shots=process.env.SCOUNDREL_SCREENSHOTS;if(shots)fs.mkdirSync(shots,{recursive:true});
    for(const viewport of [{width:1440,height:900},{width:1280,height:720},{width:375,height:812},{width:844,height:390}]){
      await page.setViewportSize(viewport);await settle(page);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,JSON.stringify(viewport));
      assert.equal(await page.locator(".encounter").count(),4);
      if(viewport.width>=1000)assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2),"desktop game fits the viewport");
      if(shots)await page.screenshot({path:path.join(shots,`scoundrel-${viewport.width}.png`),fullPage:true});
    }
    await page.setViewportSize({width:1440,height:900});await page.goto(server.base+"/scoundrel/reports/");await page.locator("#report-content").waitFor({state:"visible"});await settle(page);
    const summary=require('../reports/statistics.js').summarize(study.rows);
    assert.equal(await page.locator("#mean").innerText(),String(summary.mean));
    assert.equal(await page.locator("#median").innerText(),String(summary.median));
    assert.equal(await page.locator("#deals-body tr").count(),20);
    assert.equal(await page.locator("#proof-rate").innerText(),"1,000");
    const plotted=await page.locator('.chart-group').evaluateAll(es=>es.map(e=>({score:Number(e.dataset.score),count:Number(e.dataset.count),width:Number(e.querySelector('.chart-bar').getAttribute('width'))})));
    assert.equal(plotted.reduce((sum,bar)=>sum+bar.count,0),1000,'histogram accounts for the full cohort');
    assert.equal(plotted.length,summary.max-summary.min+1,'one bar per integer score');
    for(let i=1;i<plotted.length;i++)assert.equal(plotted[i].score,plotted[i-1].score+1,'score axis retains zero counts');
    assert.ok(plotted.every(bar=>bar.width<=3),'bars stay thin');
    async function checkMarkers(expected){
      const markers=await page.locator('.chart-reference').evaluateAll(es=>es.map(e=>({key:e.dataset.stat,value:Number(e.dataset.value),x:Number(e.getAttribute('x1'))})));
      assert.equal(markers.length,4);
      const geometry=await page.locator('.chart-group').evaluateAll(es=>{const center=e=>{const r=e.querySelector('.chart-bar');return Number(r.getAttribute('x'))+Number(r.getAttribute('width'))/2;};return {first:Number(es[0].dataset.score),left:center(es[0]),step:center(es[1])-center(es[0])};});
      for(const marker of markers){assert.equal(marker.value,expected[marker.key]);assert.ok(Math.abs(marker.x-(geometry.left+(marker.value-geometry.first)*geometry.step))<1e-7,'reference lines use the score axis');}
    }
    await checkMarkers(summary);
    await page.locator('[data-solution]').first().click();
    assert.equal(await page.locator('#solution-line li').count(),study.rows[0].line.length);
    assert.ok((await page.locator('#solution-title').innerText()).includes(String(study.rows[0].score)));
    await page.locator('#close-solution').click();
    await page.locator("#cohort").selectOption("below");
    assert.ok((await page.locator('#distribution-subtitle').innerText()).startsWith(String(study.rows.filter(r=>r.score<30).length)));
    assert.equal(await page.locator("#median").innerText(),String(summary.median),"cohort filters do not alter full-study metrics");
    await checkMarkers(require('../reports/statistics.js').summarize(study.rows.filter(r=>r.score<30)));
    await page.locator("#cohort").selectOption("all");await page.locator(".chart-group").last().click();assert.equal(await page.locator("#clear-filter").isVisible(),true);await page.locator("#clear-filter").click();
    const downloadEvent=page.waitForEvent("download");await page.locator("#download").click();const download=await downloadEvent;assert.ok(download.suggestedFilename().endsWith(".csv"));
    const csv=fs.readFileSync(await download.path(),'utf8');assert.equal(csv.trim().split('\n').length,1001);assert.ok(csv.startsWith('deal,seed,final_score,outcome,simulations_per_decision'));assert.ok(!csv.includes('incomplete'));
    if(shots)await page.screenshot({path:path.join(shots,"scoundrel-report.png"),fullPage:true});
    await page.setViewportSize({width:375,height:812});await settle(page);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    assert.ok(await page.locator('#histogram svg').isVisible());
    assert.ok(await page.locator('#histogram').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'full score distribution fits phone width');
    await checkMarkers(summary);
    await page.locator('#score-picker').selectOption('0');
    assert.equal(await page.locator('#clear-filter').isVisible(),true);
    assert.ok((await page.locator('#deals-caption').innerText()).startsWith(String(study.rows.filter(r=>r.score===0).length)));
    assert.ok((await page.locator('#deals-body tr td:nth-child(2)').allTextContents()).every(score=>score==='0'));
    await page.locator('#clear-filter').click();
    if(shots){await page.screenshot({path:path.join(shots,"scoundrel-report-phone.png"),fullPage:true});await page.locator('.distribution-section').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(shots,"scoundrel-report-phone-chart.png")});}
    assert.deepEqual(errors,[]);console.log("Scoundrel browser checks passed: all-action hidden-deck analysis, winning replay, save/resume, gallery, themes, reports, export, four viewports.");
  } finally {await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
