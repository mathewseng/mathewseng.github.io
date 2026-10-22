// Exercises the actual published files, with an isolated browser save store.
const assert=require("node:assert/strict"), fs=require("node:fs"), path=require("node:path");
const {chromium}=require("playwright"), {launchQuietBrowser}=require("../../scripts/quiet-browser.cjs"), {serveSite,settle}=require("../../scripts/site-pages.cjs");
const E=require("../engine.js"), study=require("../reports/outcomes.json");
const root=path.resolve(process.env.SCOUNDREL_SITE || "_site");
(async()=>{
  const server=await serveSite(root), browser=await launchQuietBrowser(chromium), errors=[];
  try {
    const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce"});
    const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));page.on("response",r=>{if(r.status()>=400)errors.push(r.status()+" "+r.url());});
    await page.goto(server.base+"/scoundrel/?seed=test1");await settle(page);
    assert.equal(await page.locator(".encounter").count(),4);assert.equal(await page.locator(".playing-card").count(),0);
    assert.equal(new Set(await page.locator(".encounter-art").evaluateAll(es=>es.map(e=>e.src))).size,4);
    await page.locator("#oracle-toggle").check();
    await page.waitForFunction(()=>document.querySelectorAll("#action-values tr").length>0 && !document.querySelector("#action-values").textContent.includes("Searching"),null,{timeout:45000});
    assert.ok((await page.locator("#oracle-summary").innerText()).includes("score"));
    const before=E.restore(await page.evaluate(()=>localStorage.getItem("scoundrel-run-v1")));
    assert.equal(await page.locator("#action-values tr").count(),E.actions(before).length);
    const suggested=JSON.parse(await page.locator("#action-values tr.is-best [data-preview]").getAttribute("data-preview"));
    if(suggested.id)await page.locator(`[data-card="${suggested.id}"]`).click();
    if(suggested.type==="flee")await page.locator("#flee-button").click();
    else await page.locator("[data-action]").filter({hasText:suggested.mode==="bare"?"barehanded":suggested.mode==="weapon"?"Use weapon":suggested.type==="equip"?"Equip":"Drink"}).click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem("scoundrel-run-v1")).steps===1);
    await page.locator("#oracle-toggle").uncheck();await page.reload();await settle(page);assert.equal(E.restore(await page.evaluate(()=>localStorage.getItem("scoundrel-run-v1"))).steps,1);
    await page.locator("#settings-button").click();await page.locator("#atmosphere").selectOption("moss");assert.equal(await page.locator("html").getAttribute("data-atmosphere"),"moss");
    await page.locator("#catalog-button").click();assert.equal(await page.locator("#catalog-grid figure").count(),44);
    await page.locator('[data-filter="c"]').click();assert.equal(await page.locator("#catalog-grid figure").count(),13);
    await page.locator("#catalog-dialog [data-close]").click();
    await page.locator("#settings-button").click();await page.locator("#atmosphere").selectOption("ember");await page.locator("#settings-dialog [data-close]").click();
    const witness=study.rows.find(r=>r.exact);
    await page.goto(server.base+"/scoundrel/?seed="+witness.seed);await settle(page);
    for(const [i,a]of witness.line.entries()){
      if(a.id)await page.locator(`[data-card="${a.id}"]`).click();
      if(a.type==="flee")await page.locator("#flee-button").click();
      else await page.locator("[data-action]").filter({hasText:a.mode==="bare"?"barehanded":a.mode==="weapon"?"Use weapon":a.type==="equip"?"Equip":a.type==="drink"?"potion":"Enter next room"}).click();
      const actual=E.restore(await page.evaluate(()=>localStorage.getItem("scoundrel-run-v1")));assert.equal(actual.steps,i+1);
    }
    await page.locator("#result-dialog").waitFor({state:"visible"});assert.equal(await page.locator("#result-score").innerText(),String(witness.score));
    assert.equal(E.restore(await page.evaluate(()=>localStorage.getItem("scoundrel-run-v1"))).phase,"won");
    // Fresh save for screenshots and the three responsive shell sizes.
    await page.goto(server.base+"/scoundrel/?seed=showcase");await settle(page);
    const shots=process.env.SCOUNDREL_SCREENSHOTS;if(shots)fs.mkdirSync(shots,{recursive:true});
    for(const viewport of [{width:1440,height:900},{width:375,height:812},{width:844,height:390}]){
      await page.setViewportSize(viewport);await settle(page);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,JSON.stringify(viewport));
      assert.equal(await page.locator(".encounter").count(),4);
      if(shots)await page.screenshot({path:path.join(shots,`scoundrel-${viewport.width}.png`),fullPage:true});
    }
    await page.setViewportSize({width:1440,height:900});await page.goto(server.base+"/scoundrel/reports/");await page.locator("#report-content").waitFor({state:"visible"});await settle(page);
    assert.match(await page.locator("#mean").innerText(),/\d/);assert.equal(await page.locator("#deals-body tr").count(),20);
    await page.locator("#cohort").selectOption("proven");assert.equal(await page.locator("#cohort-warning").isVisible(),true);assert.equal(await page.locator("#proof-rate").innerText(),"100.0%");
    await page.locator("#cohort").selectOption("all");await page.locator(".chart-group").last().click();assert.equal(await page.locator("#clear-filter").isVisible(),true);await page.locator("#clear-filter").click();
    const downloadEvent=page.waitForEvent("download");await page.locator("#download").click();assert.ok((await downloadEvent).suggestedFilename().endsWith(".csv"));
    if(shots)await page.screenshot({path:path.join(shots,"scoundrel-report.png"),fullPage:true});
    await page.setViewportSize({width:375,height:812});await settle(page);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    if(shots)await page.screenshot({path:path.join(shots,"scoundrel-report-phone.png"),fullPage:true});
    assert.deepEqual(errors,[]);console.log("Scoundrel browser checks passed: all-action oracle, full winning replay, save/resume, gallery, themes, reports, export, three viewports.");
  } finally {await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
