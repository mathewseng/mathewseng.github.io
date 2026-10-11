const assert = require("node:assert/strict"), path = require("node:path");
module.exports = async function mobileStudy(browser, base, out, name) {
  const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:"block",reducedMotion:"reduce"});
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const shot = label => page.screenshot({path:path.join(out,`${name}-study-${label}.png`)});
  const saved = () => page.evaluate(async () => (await import("/backgammon/core/storage.mjs")).get("work","solver"));
  const bounds = () => page.evaluate(() => {
    const box = s => { const r = document.querySelector(s).getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}; };
    return {board:box("#board"),actions:box("#actions"),strip:box(".study-strip"),overflow:document.documentElement.scrollWidth > innerWidth + 1};
  });
  try {
    await page.goto(base + "/backgammon/solver/");
    await page.locator("#analyze").waitFor();
    await page.evaluate(async () => {
      const {initialState} = await import("/backgammon/core/rules.mjs");
      const {put} = await import("/backgammon/core/storage.mjs");
      await put("work",{id:"solver",state:initialState({phase:"move",dice:[3,1],matchLength:0}),context:null});
    });
    await page.reload();
    await page.waitForFunction(() => document.querySelector(".study-strip:not([hidden])") && document.querySelector("#analyze")?.textContent === "Analyze");
    const source = await saved();
    for (const [width,height] of [[320,568],[375,667],[390,844],[430,932]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(()=>scrollTo(0,0));
      const original = await bounds();
      assert.ok(!original.overflow,`solver ${width}: no horizontal scroll`);
      if (width >=375) assert.ok(original.actions.bottom <= height+1,`solver ${width}: primary action below screen ${JSON.stringify(original)}`);
      await page.getByRole("button",{name:"Next move preview",exact:true}).tap();
      assert.equal(await page.getByLabel("Preview evaluated move",{exact:true}).inputValue(),"0");
      await page.getByRole("button",{name:"Next move preview",exact:true}).tap();
      assert.equal(await page.getByLabel("Preview evaluated move",{exact:true}).inputValue(),"1");
      await page.getByLabel("Preview evaluated move",{exact:true}).selectOption("9");
      assert.ok(await page.getByRole("button",{name:"Next move preview",exact:true}).isDisabled());
      await page.getByRole("button",{name:"Previous move preview",exact:true}).tap();
      assert.equal(await page.getByLabel("Preview evaluated move",{exact:true}).inputValue(),"8");
      await shot(`solver-${width}`);
      const preview = await bounds();
      assert.equal(preview.board.width,original.board.width,"preview preserves board width");
      assert.equal(preview.board.height,original.board.height,"preview preserves board height");
      await page.getByLabel("Preview evaluated move",{exact:true}).selectOption("-1");
      assert.ok(await page.getByRole("button",{name:"Previous move preview",exact:true}).isDisabled());
      assert.deepEqual(await saved(),source,"previews do not edit the persisted source or run more analysis");
      if (width === 320) {
        await page.locator("#analyze").scrollIntoViewIfNeeded();
        assert.ok((await page.locator("#analyze").boundingBox()).y + 48 <= height + 1,"smallest phones scroll to reach actions");
      }
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator("#panel-toggle").tap();
    await page.locator("#details-dialog .list button").nth(2).tap();
    await page.locator("#details-dialog").waitFor({state:"detached"});
    assert.equal(await page.getByLabel("Preview evaluated move",{exact:true}).inputValue(),"2","a full-list preview reveals board and synchronizes strip");
    await page.locator("#edit-position").tap();
    assert.ok(await page.locator(".study-strip").isHidden(),"editing hides stale analysis");
    await page.getByLabel("Board editing tool",{exact:true}).selectOption("remove");
    await page.locator('#board [data-point="7"] .checker > circle').first().tap();
    const removed = await saved();
    assert.equal(removed.state.off[0],source.state.off[0] + 1);
    await page.getByLabel("Board editing tool",{exact:true}).selectOption("ivory");
    await page.locator('#board [data-point="7"] .point-number-hit').tap();
    assert.equal((await saved()).state.off[0],0);
    await page.getByRole("button",{name:"Dice & rules",exact:true}).tap();
    await page.getByRole("dialog").waitFor();
    await page.getByRole("dialog").getByRole("button",{name:"Close",exact:true}).tap();
    await shot("editor");
    await page.setViewportSize({width:1440,height:900});
    assert.ok(await page.locator(".study-editor").isHidden(),"desktop retains the inspector");
    await page.setViewportSize({width:390,height:844});
    await page.goto(base + "/backgammon/trainer/");
    await page.locator("#submit-decision").waitFor();
    assert.ok(await page.locator(".study-strip").isHidden(),"no answer spoilers");
    await page.locator("#panel-toggle").tap();
    for (let i=0;i<4 && await page.locator("#submit-decision").isDisabled();i++)
      await page.getByLabel("Accessible move selection",{exact:true}).selectOption({index:1});
    await page.locator("#details-dialog .close").tap();
    await page.locator("#submit-decision").tap();
    await page.locator("#next-exercise").waitFor();
    assert.ok(await page.locator(".study-strip").isVisible());
    for (const [width,height] of [[375,667],[390,844]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(()=>scrollTo(0,0));
      const m = await bounds();
      assert.ok(!m.overflow && m.actions.bottom <= height+1,`trainer ${width} fits: ${JSON.stringify(m)}`);
      await shot(`trainer-${width}`);
    }
    await page.getByLabel("Preview evaluated move",{exact:true}).selectOption("0");
    await page.getByLabel("Preview evaluated move",{exact:true}).selectOption("-1");
    const trainerOriginal = await page.evaluate(async () => {
      const {get} = await import("/backgammon/core/storage.mjs");
      const s = await get("work","trainer");
      const data = await (await fetch("/backgammon/data/exercises.json")).json();
      return data.items.find(e => e.id === s.exerciseId).state.points;
    });
    const boardPoints = await page.locator('#board .point[data-point]').evaluateAll(ns => ns.filter(n=>/^\d+$/.test(n.dataset.point)).map(n=>({i:Number(n.dataset.point),count:n.getAttribute("aria-label")})));
    for (const n of boardPoints) {
      const expected = trainerOriginal[n.i];
      assert.ok(n.count.includes(expected ? `${Math.abs(expected)} ${expected > 0 ? "Ivory" : "Teal"} checkers` : "empty"),"Original restores the actual exercise, not the submitted draft");
    }
    await page.locator("#next-exercise").tap();
    assert.ok(await page.locator(".study-strip").isHidden(),"next exercise hides previous answer");
    await page.locator("#panel-toggle").tap();
    await page.getByLabel("Practice set",{exact:true}).selectOption("cube");
    await page.locator("#details-dialog .close").tap();
    await page.getByRole("button",{name:"No double",exact:true}).tap();
    await page.locator("#next-exercise").waitFor();
    assert.ok(await page.getByRole("button",{name:"Compare cube options",exact:true}).isVisible());
    assert.ok(await page.getByLabel("Preview evaluated move",{exact:true}).isHidden(),"cube choices do not pretend to be checker previews");
    await shot("trainer-cube");
    await page.getByRole("button",{name:"Compare cube options",exact:true}).tap();
    assert.ok(await page.locator("#details-dialog").isVisible());
    assert.deepEqual(errors,[]);
    return {browser:name,realEngine:true,top10:true,sourcePreserved:true,touchEditing:true,trainerSpoilersHidden:true};
  } finally { await context.close(); }
};
