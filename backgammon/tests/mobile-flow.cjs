const assert = require("node:assert/strict"), path = require("node:path");
module.exports = async function mobileFlow(browser, base, out, name) {
  const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:"block",reducedMotion:"reduce"});
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const shot = label => page.screenshot({path:path.join(out,`${name}-flow-${label}.png`)});
  const reachable = async selector => {
    const result = await page.locator(selector).evaluate(n => {
      const r = n.getBoundingClientRect(), hit = document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return {fits:r.top>=0 && r.bottom<=innerHeight+1 && r.right<=innerWidth+1,hit:n===hit || n.contains(hit),height:r.height};
    });
    assert.ok(result.fits && result.hit, `${selector} must be visible and tappable: ${JSON.stringify(result)}`);
    assert.ok(result.height>=44, `${selector} needs a full touch target`);
  };
  try {
    await page.goto(base+"/backgammon/trainer/");
    await page.locator("#submit-decision").waitFor();
    for (const [width,height] of [[320,568],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(()=>scrollTo(0,0));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      if (width>320) {
        await reachable("#submit-decision");
        await reachable(".trainer-help button:first-child");
        await reachable(".trainer-help button:last-child");
      } else {
        await page.locator("#submit-decision").scrollIntoViewIfNeeded();
        await reachable("#submit-decision");
      }
      if (height<500) {
        assert.ok(await page.locator("#inspector").isHidden(),"no clipped inspector in landscape");
        assert.ok(await page.locator(".touch-moves").isVisible());
        const picker=await page.locator(".touch-moves").boundingBox(), submit=await page.locator("#submit-decision").boundingBox();
        assert.ok(picker.y+picker.height<=submit.y,"pickers precede the primary action");
        assert.ok((await page.locator("#board").boundingBox()).height>height-110,"larger study board in landscape");
      }
      await shot(`trainer-${width}`);
    }
    await page.setViewportSize({width:390,height:844});
    const decision = await page.locator("#subtitle").textContent();
    await page.locator(".trainer-help").getByRole("button",{name:"Hint",exact:true}).tap();
    const hint = page.getByRole("dialog",{name:"Study hint",exact:true});
    await hint.waitFor();
    assert.ok((await hint.textContent()).includes("assisted"));
    await hint.getByRole("button",{name:"Close",exact:true}).tap();
    assert.equal(await page.locator("#subtitle").textContent(),decision,"hint does not skip the exercise");
    await page.locator(".trainer-help").getByRole("button",{name:"Skip",exact:true}).tap();
    await page.waitForFunction(()=>document.querySelector("#subtitle").textContent.startsWith("2 of 5"));
    const attempts=await page.evaluate(async()=>(await import("/backgammon/core/storage.mjs")).all("progress"));
    assert.ok(attempts.some(p=>p.skips>0),"skip is honestly recorded");
    await page.locator("#panel-toggle").tap();
    await page.getByLabel("Practice set",{exact:true}).selectOption("cube");
    await page.locator("#details-dialog .close").tap();
    await page.getByRole("button",{name:"No double",exact:true}).tap();
    await page.locator("#next-exercise").waitFor();
    assert.ok(await page.locator(".trainer-help").isHidden(),"no stale help after answering");
    await page.setViewportSize({width:844,height:390});
    await reachable("#next-exercise");
    await page.getByRole("button",{name:"Compare cube options",exact:true}).tap();
    await page.locator("#details-dialog .close").tap();
    await shot("cube-review-landscape");

    await page.goto(base+"/backgammon/solver/");
    await page.locator("#analyze").waitFor();
    await page.locator("#edit-position").tap();
    await page.getByLabel("Board editing tool",{exact:true}).selectOption("remove");
    await page.getByRole("button",{name:"Dice & rules",exact:true}).tap();
    await page.getByRole("dialog").getByRole("button",{name:"Close",exact:true}).tap();
    await shot("solver-edit-landscape");
    await page.locator("#edit-position").tap();
    await page.locator("#analyze").tap();
    await page.waitForFunction(()=>document.querySelector("#analyze")?.textContent==="Analyze" && !document.querySelector(".study-strip").hidden);
    for (const [width,height] of [[667,375],[844,390],[932,430]]) {
      await page.setViewportSize({width,height});
      await reachable("#analyze");
      await reachable(".study-preview-controls select");
      await page.getByRole("button",{name:"Next move preview",exact:true}).tap();
      assert.equal(await page.getByLabel("Preview evaluated move",{exact:true}).inputValue(),"0");
      await page.getByLabel("Preview evaluated move",{exact:true}).selectOption("-1");
      await shot(`solver-results-${width}`);
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator("#mobile-tools").tap();
    await page.getByRole("button",{name:"Save",exact:true}).tap();
    await page.getByLabel("Name",{exact:true}).fill("Keyboard-friendly save");
    // Model Safari's separate visual viewport as well as shortened windows.
    // This is a browser-level contract test, not a physical keyboard claim.
    await page.evaluate(() => {
      Object.defineProperty(visualViewport,"height",{configurable:true,value:400});
      Object.defineProperty(visualViewport,"offsetTop",{configurable:true,value:18});
      visualViewport.dispatchEvent(new Event("resize"));
    });
    const vv = await page.locator(".dialog[open]").boundingBox();
    assert.ok(vv.y>=18 && vv.y+vv.height<=418,"form fits the keyboard's visual viewport");
    await page.evaluate(() => {
      delete visualViewport.height; delete visualViewport.offsetTop;
      visualViewport.dispatchEvent(new Event("resize"));
    });
    for (const [width,height] of [[320,350],[390,420],[844,310]]) {
      await page.setViewportSize({width,height});
      await reachable(".dialog[open] .close");
      await reachable(".dialog[open] footer button");
      await page.getByLabel("Tags",{exact:true}).fill("mobile, layout");
      await reachable(".dialog[open] footer button");
      await shot(`keyboard-${width}`);
    }
    await page.getByRole("dialog").getByRole("button",{name:"Save",exact:true}).tap();
    await page.getByRole("dialog").waitFor({state:"detached"});
    const items=await page.evaluate(async()=>(await import("/backgammon/core/storage.mjs")).all());
    assert.ok(items.some(i=>i.title==="Keyboard-friendly save" && i.tags.includes("mobile")),"keyboard-sized save persists entered values");
    assert.deepEqual(errors,[]);
    return {browser:name,trainerHelp:true,landscapeEditorAndPreviews:true,keyboardSizedForms:true,realEngine:true};
  } finally {await context.close();}
};
