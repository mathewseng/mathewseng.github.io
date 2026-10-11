const assert=require("node:assert/strict"),path=require("node:path");
module.exports=async function openingHints(browser,base,out,name){
  const cases=[];
  for(const touch of [false,true]){
    const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1366,height:768},hasTouch:touch,reducedMotion:"reduce",serviceWorkers:"block"});
    const page=await context.newPage(),errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    const click=async locator=>touch?locator.tap():locator.click();
    const read=()=>page.evaluate(async()=>(await import("/backgammon/core/storage.mjs")).get("work","play"));
    try{
      await page.addInitScript(()=>{
        const random=crypto.getRandomValues.bind(crypto),bytes=[2,2,5,5,2,5];
        crypto.getRandomValues=a=>a instanceof Uint8Array&&a.length===1&&bytes.length?((a[0]=bytes.shift()),a):random(a);
      });
      await page.goto(base+"/backgammon/play/");
      await click(page.getByRole("button",{name:"Same device",exact:true}));
      await click(page.locator("#start-match"));
      for(const value of [2,4]){
        await click(page.locator("#roll"));
        await page.waitForFunction(async value=>(await(await import("/backgammon/core/storage.mjs")).get("work","play"))?.game.state.cube.value===value,value);
        // Persistence completes before the opening animation refreshes its copy.
        await page.waitForFunction(value=>document.querySelector(".opening-roll")?.textContent.includes(`Stakes are now ${value}`),value);
        assert.match(await page.locator(".opening-roll").innerText(),new RegExp(`Stakes are now ${value}`));
      }
      await click(page.locator("#roll"));
      await page.locator("#begin-turn").waitFor();
      const ratios=await page.locator(".opening-die .die").evaluateAll(dice=>dice.map(d=>{
        const b=d.getBoundingClientRect(),p=d.querySelector("i").getBoundingClientRect();
        return {ratio:p.width/b.width,round:Math.abs(p.width-p.height)<.1};
      }));
      assert.ok(ratios.every(r=>r.ratio>.19&&r.ratio<.21&&r.round),JSON.stringify(ratios));
      await page.screenshot({path:path.join(out,`${name}-opening-pips-${touch?"phone":"desktop"}.png`)});
      await click(page.locator("#begin-turn"));
      await click(page.locator("#preferences"));
      await click(page.getByRole("button",{name:"Display & controls",exact:true}));
      await page.locator("#move-hints").uncheck();
      await click(page.locator(".settings-dialog").getByRole("button",{name:"Close",exact:true}));
      await page.locator("#board .bg-board.no-move-hints").waitFor();
      const visibleRings=()=>page.locator("#board .source-ring").evaluateAll(es=>es.filter(e=>getComputedStyle(e).display!=="none").length);
      await page.waitForFunction(()=>[...document.querySelectorAll("#board .point:not(.selected) .source-ring")].every(e=>getComputedStyle(e).display==="none"));
      assert.equal(await visibleRings(),await page.locator("#board .point.selected .source-ring").count(),
        "only the selected checker may retain a ring");
      assert.ok(await page.locator("#board .bg-board.no-move-hints").count());
      const step=await page.evaluate(async()=>{
        const st=await import("/backgammon/core/storage.mjs"),r=await import("/backgammon/core/rules.mjs");
        return r.legalPaths((await st.get("work","play")).game.state)[0].steps[0];
      });
      await click(page.locator(`#board [data-point="${step.from}"] .checker > circle`).first());
      assert.equal(await visibleRings(),1);
      assert.equal(await page.locator("#board .selected").getAttribute("data-point"),String(step.from));
      const highlights=await page.locator("#board :is(.point-wash,.landing-ring,.destination-die,.destination-badge)").evaluateAll(es=>es.filter(e=>getComputedStyle(e).display!=="none").length);
      assert.equal(highlights,0);
      await page.screenshot({path:path.join(out,`${name}-no-hints-${touch?"phone":"desktop"}.png`)});
      await click(page.locator(`#board [data-point="${step.to}"] .point-number-hit`));
      await page.waitForFunction(async()=>(await(await import("/backgammon/core/storage.mjs")).get("work","play"))?.draft.length>0);
      assert.equal((await read()).draft[0].from,step.from);
      await page.goto(base+"/backgammon/play/#resume="+(await read()).game.id);
      await page.locator("#confirm").waitFor();
      await page.locator("#board .bg-board.no-move-hints").waitFor();
      await click(page.locator("#panel-toggle"));
      await click(page.locator("#game-rule-reference summary"));
      const rules=await page.locator("#game-rule-reference").innerText();
      for(const phrase of ["1 → 2 → 4 → 8","Jacoby","Entering from the bar","Crawford","Beavers","Resignation","Bearing off"])assert.ok(rules.includes(phrase),phrase);
      await page.screenshot({path:path.join(out,`${name}-all-rules-${touch?"phone":"desktop"}.png`)});
      await page.keyboard.press("Escape");
      await click(page.locator("#preferences"));
      await click(page.getByRole("button",{name:"Display & controls",exact:true}));
      assert.equal(await page.locator("#move-hints").isChecked(),false);
      await page.locator("#move-hints").check();
      await click(page.locator(".settings-dialog").getByRole("button",{name:"Close",exact:true}));
      assert.equal(await page.locator("#board .bg-board.no-move-hints").count(),0);
      assert.deepEqual(errors,[]);
      cases.push(`${touch?"touch":"mouse"}: consecutive opening ties, pip proportions, hidden hints retain legal input and persist, full rules in Details`);
    }finally{await context.close();}
  }
  return {browser:name,cases};
};
