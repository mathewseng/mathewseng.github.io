// Actual rendered text, clipping ancestors and touch targets across desktop/iPhone sizes.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const playwright = require("playwright"), {launchQuietBrowser} = require("../../scripts/quiet-browser.cjs");
const {serveSite, settle} = require("../../scripts/site-pages.cjs"), E = require("../engine.js"), catalog = require("../catalog.js");
const root = path.resolve(process.env.SCOUNDREL_SITE || "_site");
const output = process.env.SCOUNDREL_SCREENSHOTS;
const names = (process.env.SCOUNDREL_BROWSERS || "chromium").split(",");

function fixture(ids) {
  const rest = E.makeDeck().map(c=>c.id).filter(id=>!ids.includes(id));
  const state = E.createGame({deck:[...ids,...rest], seed:"layout-fixture"});
  state.health = 13;
  state.weapon = state.deck.find(c=>c.type==="weapon");
  state.deck = state.deck.filter(c=>c.id!==state.weapon.id);
  assert.ok(E.restore(state));
  return state;
}
async function loadRoom(page, ids) {
  await page.evaluate(state=>localStorage.setItem("scoundrel-run-v1",JSON.stringify(state)), fixture(ids));
  await page.reload(); await page.evaluate(()=>document.fonts.ready);
}
async function readable(page, label) {
  const issues = await page.evaluate(()=>{
    const problems=[];
    if(document.documentElement.scrollWidth>innerWidth+1)problems.push("document overflows horizontally");
    const selector=".encounter-name strong,.encounter-name small,.encounter-top>span:first-child,.selection-copy>strong,.selection-copy p,.game-button span,.game-button small,.catalog-grid figcaption strong,.catalog-grid figcaption>div>span,#artwork-title,#artwork-role,.avoid-choice-title strong,.avoid-choice-title>span,.avoid-value,#avoid-description,.report-metrics strong,.report-metrics small,#study-summary,#deals-caption,.deals-table th,.deals-table td,#solution-title,.solution-line li>div>span,.mobile-score-row strong,.mobile-score-row>span:last-child";
    for(const el of document.querySelectorAll(selector)){
      if(!el.getClientRects().length || el.closest("dialog:not([open])"))continue;
      const range=document.createRange();range.selectNodeContents(el);
      const rects=[...range.getClientRects()].filter(r=>r.width&&r.height);
      if(el.scrollWidth>el.clientWidth+2)problems.push(el.textContent+" exceeds its text box");
      for(let parent=el.parentElement;parent;parent=parent.parentElement){
        // A top-layer dialog scrolls independently and is not clipped by body.
        if(parent.tagName==="DIALOG")break;
        const style=getComputedStyle(parent), box=parent.getBoundingClientRect();
        if(!/hidden|clip/.test(style.overflowX+style.overflowY))continue;
        for(const rect of rects)if(rect.left<box.left-2||rect.right>box.right+2||rect.top<box.top-2||rect.bottom>box.bottom+2){problems.push(el.textContent+" clipped by "+parent.className);break;}
      }
    }
    return [...new Set(problems)];
  });
  assert.deepEqual(issues,[],label);
}

(async()=>{
  const server=await serveSite(root);
  if(output)fs.mkdirSync(output,{recursive:true});
  try {
    for(const browserName of names){
      const browser=await launchQuietBrowser(playwright[browserName]);
      try {
        const sizes=[{width:1440,height:900},{width:1280,height:720},{width:1024,height:768},{width:320,height:568},{width:375,height:667},{width:375,height:812},{width:390,height:844},{width:430,height:932},{width:600,height:900},{width:844,height:390}];
        for(const viewport of sizes){
          const phone=viewport.width<=600;
          const context=await browser.newContext({viewport,isMobile:phone,hasTouch:phone,deviceScaleFactor:phone?2:1,reducedMotion:"reduce"});
          const page=await context.newPage(), errors=[];
          page.on("pageerror",e=>errors.push(e.message));
          await page.goto(server.base+"/scoundrel/");await settle(page);
          const all=Object.keys(catalog), thorough=[320,375,1280].includes(viewport.width);
          const groups=thorough?Array.from({length:11},(_,i)=>all.slice(i*4,i*4+4)):[["5s","4s","7c","8c"]];
          for(const ids of groups){
            await loadRoom(page,ids);
            for(const id of ids){await page.locator(`[data-card="${id}"]`).click();await readable(page,`${browserName} ${viewport.width} ${id}`);}
          }
          await loadRoom(page,["2c","5d","8h","4s"]);
          await page.locator('[data-card="4s"]').click();await readable(page,"both fight actions");
          for(const box of await page.locator("#encounter-actions button").evaluateAll(es=>es.map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}))))assert.ok(box.w>=44&&box.h>=44,"44px action target");
          if(viewport.width>=1000)assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2),`${viewport.width}: desktop fits`);
          if(output){await page.evaluate(()=>Promise.all([...document.querySelectorAll(".encounter-art")].map(i=>i.decode())));await page.screenshot({path:path.join(output,`${browserName}-${viewport.width}x${viewport.height}.png`),fullPage:true});}
          await page.locator('#flee-button').click();await readable(page,'avoidance preview');
          assert.equal(await page.locator('[data-avoid]').count(),2);
          if(output && [390,1280].includes(viewport.width))await page.screenshot({path:path.join(output,`${browserName}-avoid-${viewport.width}.png`)});
          await page.locator('#avoid-dialog [data-close]').click();
          if(phone){
            await page.locator('#room-cards').dispatchEvent('pointerdown',{pointerType:'touch',isPrimary:true,pointerId:7,clientX:200,clientY:300});
            await page.locator('#room-cards').dispatchEvent('pointerup',{pointerType:'touch',isPrimary:true,pointerId:7,clientX:100,clientY:305});
            assert.equal(await page.locator('#avoid-dialog').isVisible(),true,'horizontal swipe opens choice');
            assert.equal(await page.evaluate(()=>document.activeElement.dataset.avoid),'left');
            await page.locator('#avoid-dialog [data-close]').click();
            await page.locator('#room-cards').dispatchEvent('pointerdown',{pointerType:'touch',isPrimary:true,pointerId:8,clientX:200,clientY:300});
            await page.locator('#room-cards').dispatchEvent('pointerup',{pointerType:'touch',isPrimary:true,pointerId:8,clientX:195,clientY:400});
            assert.equal(await page.locator('#avoid-dialog').isVisible(),false,'vertical scroll does not avoid');
          }
          await page.locator('#flee-button').click();
          const preAvoid=E.restore(await page.evaluate(()=>localStorage.getItem('scoundrel-run-v1')));
          await page.locator('[data-avoid="right"]').click();
          const postAvoid=E.restore(await page.evaluate(()=>localStorage.getItem('scoundrel-run-v1')));
          assert.deepEqual(postAvoid,E.transition(preAvoid,{type:'flee',direction:'right'}));
          assert.equal(await page.locator('#flee-button').isDisabled(),true);
          if(viewport.width===390 || viewport.width===1280){
            await page.locator("#settings-button").click();await page.locator("#catalog-button").click();
            await readable(page,"all collection captions");
            if(output)await page.screenshot({path:path.join(output,`${browserName}-collection-${viewport.width}.png`)});
            await page.locator('[data-art="5s"]').click();assert.equal(await page.locator("#artwork-title").innerText(),catalog["5s"].name);await readable(page,"artwork dialog");
            if(output)await page.screenshot({path:path.join(output,`${browserName}-artwork-${viewport.width}.png`)});
            await page.locator("#artwork-dialog [data-close]").click();assert.ok(await page.locator("#catalog-dialog").isVisible());
            await page.locator("#catalog-dialog [data-close]").click();
            await page.locator("#oracle-toggle").check();await page.waitForFunction(()=>document.querySelectorAll("#action-values tr").length>0);
            await readable(page,"oracle fits without horizontal scrolling");
            assert.ok(await page.locator(".oracle-table-wrap").evaluate(e=>e.scrollWidth<=e.clientWidth+1),"EV table fits");
            if(output){await page.locator("#oracle-panel").scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`${browserName}-oracle-${viewport.width}.png`)});}
            await page.locator("#oracle-toggle").uncheck();
            // Simulate enlarged text, including headings that must remain inside cards.
            await page.addStyleTag({content:".encounter-name strong{font-size:20px!important}.selection-copy p{font-size:18px!important}"});
            await readable(page,"enlarged text");
          }
          if([320,375,390,1280].includes(viewport.width)){
            await page.goto(server.base+'/scoundrel/reports/');await page.locator('#report-content').waitFor({state:'visible'});await page.evaluate(()=>document.fonts.ready);
            await readable(page,'exact report');
            assert.ok(await page.locator('.deals-table-wrap').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'deal table fits phone width');
            assert.equal(await page.locator('#median').innerText(),String(require('../reports/statistics.js').summarize(require('../reports/outcomes.json').rows).median));
            if(phone){await page.locator('.mobile-score-row').first().click();assert.equal(await page.locator('#clear-filter').isVisible(),true);await page.locator('#clear-filter').click();}
            await page.locator('[data-solution]').first().click();await readable(page,'solution dialog');
            if(output && [390,1280].includes(viewport.width))await page.screenshot({path:path.join(output,`${browserName}-solution-${viewport.width}.png`)});
            await page.locator('#close-solution').click();
          }
          assert.deepEqual(errors,[]);await context.close();
        }
        console.log(`${browserName}: all 44 names, desktop and portrait phone layouts, touch targets, gallery, art viewer and EV rows passed.`);
      }finally{await browser.close();}
    }
  } finally {await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
