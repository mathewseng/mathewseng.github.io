const assert = require('node:assert/strict');
module.exports = async function checkerAnimationCleanup(browser, base) {
  const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
  const page = await context.newPage(), errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  try {
    await page.goto(base+'/backgammon/');
    await page.evaluate(async()=>{
      const {shell,DraftBoard}=await import('/backgammon/ui/shell.mjs');
      const r=await import('/backgammon/core/rules.mjs'),st=await import('/backgammon/core/storage.mjs');
      st.saveSettings({motion:'full',interactionMode:'advanced'});
      const d=new DraftBoard(shell('trainer','Animation cleanup').board);
      const s=r.initialState({points:[0,2,2,2,2,2,2,0,-2,0,0,0,2,0,-1,-1,0,0,-2,-2,-3,-2,1,0],
        bar:[0,2],phase:'move',dice:[1,5]});
      window.cleanup={d,s,r};d.set(s,r.legalPaths(s));
    });
    for (const rerender of [false,true]) {
      await page.evaluate(()=>{const {d,s,r}=cleanup;d.set(s,r.legalPaths(s));d.move({from:12,to:7,die:5});});
      await page.waitForTimeout(120);
      await page.evaluate(()=>cleanup.d.move({from:7,to:6,die:1}));
      if(rerender) await page.evaluate(()=>cleanup.d.render());
      await page.waitForTimeout(1500);
      const motion=await page.evaluate(()=>({
        pieces:document.querySelectorAll('.moving-checker').length,
        arriving:document.querySelectorAll('[data-arriving]').length,
        complete:cleanup.d.complete(),
      }));
      assert.deepEqual(motion,{pieces:0,arriving:0,complete:true});
    }
    await page.evaluate(async()=>{
      const {d,s,r}=cleanup;d.set(s,r.legalPaths(s));d.move({from:12,to:7,die:5});
      const piece=d.board.svg.querySelector('.moving-checker');
      piece.getAnimations()[0].cancel();
      await Promise.resolve();
    });
    assert.equal(await page.locator('.moving-checker,[data-arriving]').count(),0,
      'cancelled flights retire their sprite and restore the destination face');
    assert.deepEqual(errors,[]);
    return {passed:true};
  } finally {await context.close();}
};
