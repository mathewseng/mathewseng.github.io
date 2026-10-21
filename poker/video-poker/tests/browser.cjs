// node poker/video-poker/tests/browser.cjs [assembled site directory]
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require('playwright'),{launchQuietBrowser}=require('../../../scripts/quiet-browser.cjs'),{serveSite}=require('../../../scripts/site-pages.cjs');
(async()=>{const server=await serveSite(path.resolve(process.argv[2]||'.')),browser=await launchQuietBrowser(chromium),errors=[];
try{
 await require('./cribbage-browser.cjs')(browser,server.base);
 await require('./mobile-response.cjs')(browser,server.base);
 await require('./variant-selection.cjs')(browser,server.base);
 await require('./decision-review.cjs')(browser,server.base);
 await require('./badeucey-rules.cjs')(browser,server.base);
 await require('./double-draw.cjs')(browser,server.base);
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.base+'/poker/video-poker/');await page.waitForFunction(()=>document.getElementById('return-value').textContent==='99.5439%');
 assert.equal(await page.locator('#variant option').count(),27);
 await page.screenshot({path:'/tmp/video-poker-desktop.png',fullPage:true});
 await page.locator('#variant').selectOption('badeucey');await page.locator('[data-view="lab"]').click();await page.locator('#reset-pays').click();await page.locator('[data-view="play"]').click();await page.locator('.spot-editor summary').click();await page.locator('#spot-hand').fill('7s 5h 4d 3c 2s');await page.locator('#spot-form button').click();
 await page.waitForFunction(()=>document.querySelectorAll('.strategy-row').length===5,{},{timeout:30000});
 assert.match(await page.locator('#strategy-status').textContent(),/Hold all 5.*25/);
 await page.locator('#hold-best').click();assert.equal(await page.locator('.card-slot.held').count(),5);
 await page.locator('#show-all').click();assert.equal(await page.locator('.strategy-row').count(),32);
 await page.waitForTimeout(350);await page.screenshot({path:'/tmp/video-poker-strategy.png',fullPage:true});
 // A study hand never pays out; Deal starts a random wager.
 await page.locator('#deal').click();assert.equal(await page.locator('#pnl').textContent(),'0');assert.ok(await page.locator('#variant').isDisabled());
 await page.locator('[data-card="0"]').click();assert.equal(await page.locator('.card-slot.held').count(),1);await page.keyboard.press('2');assert.equal(await page.locator('.card-slot.held').count(),2);await page.keyboard.press('2');
 const original=await page.locator('#hand button').evaluateAll(els=>els.map(e=>e.getAttribute('aria-label')));
 await page.locator('#deal').click();const drawn=await page.locator('#hand .playing-card').evaluateAll(els=>els.map(e=>e.getAttribute('aria-label')));
 assert.equal(drawn[0],original[0]);for(let i=1;i<5;i++)assert.ok(!original.includes(drawn[i]));assert.equal(await page.locator('#hands-played').textContent(),'1');assert.ok(await page.locator('#variant').isEnabled());
 await page.locator('[data-view="lab"]').click();await page.locator('[data-recommend="badeucey"]').click();assert.equal(await page.locator('#lab-rtp').textContent(),'99.9326%');assert.equal(await page.locator('#pay-qualify').inputValue(),'1');assert.ok(await page.locator('#pay-qualify').isDisabled());
 await page.locator('#solve-all').click();await page.waitForFunction(()=>document.getElementById('solve-status').textContent.startsWith('Complete'),{},{timeout:30000});assert.equal(await page.locator('#lab-rtp').textContent(),'99.9326%');
 await page.screenshot({path:'/tmp/video-poker-lab.png',fullPage:true});
 await page.locator('#pay-low9').fill('4');await page.locator('#pay-form button[type="submit"]').click();assert.equal(await page.locator('#lab-rtp').textContent(),'Not solved');
 await page.locator('#solve-all').click();await page.locator('#cancel-solve').click();assert.match(await page.locator('#solve-status').textContent(),/canceled/);
 await page.reload();await page.locator('#variant').selectOption('badeucey');await page.locator('[data-view="lab"]').click();assert.equal(await page.locator('#pay-low9').inputValue(),'4');await page.locator('#reset-pays').click();assert.equal(await page.locator('#pay-low9').inputValue(),'1');
 await page.locator('[data-view="play"]').click();await page.locator('.spot-editor summary').click();await page.locator('#spot-hand').fill('As As 2h 3h 4h');await page.locator('#spot-form button').click();assert.match(await page.locator('#global-status').textContent(),/different cards/);
 // Every game can deal, solve and draw using its actual deck and paytable.
 for(const id of await page.locator('#variant option').evaluateAll(es=>es.map(e=>e.value))){await page.locator('#variant').selectOption(id);await page.locator('#deal').click();await page.locator('#solve-hand').click();await page.waitForFunction(()=>document.querySelectorAll('.strategy-row').length===5,{},{timeout:30000});await page.locator('#hold-best').click();await page.locator('#deal').click();assert.ok(Number.isFinite(Number((await page.locator('#pnl').textContent()).replaceAll(',',''))),id);}
 await page.waitForTimeout(350);
 for(const viewport of [{width:375,height:812},{width:844,height:390},{width:1280,height:720},{width:1440,height:900}]){await page.setViewportSize(viewport);for(const view of ['play','lab','rules']){await page.locator(`[data-view="${view}"]`).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${view} overflow ${viewport.width}`);if(viewport.width===375)await page.screenshot({path:`/tmp/video-poker-mobile-${view}.png`,fullPage:true});}}
 assert.deepEqual(errors,[]);console.log('Video poker browser checks passed: 27 games, exact worker, all holds, draw exclusions, recommendations, edits, persistence, cancel, mobile and desktop.');
}finally{await browser.close();await server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
