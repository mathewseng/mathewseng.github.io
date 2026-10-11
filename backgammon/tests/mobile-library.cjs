const assert = require("node:assert/strict"), path = require("node:path");
module.exports = async function mobileLibrary(browser, base, out, name) {
  const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:"reduce",serviceWorkers:"block"});
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  try {
    await page.goto(base + "/backgammon/library/");
    const fixture = await page.evaluate(async () => {
      const r = await import("/backgammon/core/rules.mjs"), st = await import("/backgammon/core/storage.mjs");
      const {EngineClient} = await import("/backgammon/engine/client.mjs");
      const {playAction} = await import("/backgammon/core/table.mjs");
      const initial = r.initialState({phase:"move",dice:[3,1],matchLength:0});
      const engine = new EngineClient();
      try {
        const result = await engine.analyze(initial, {preset:"quick"});
        let game = {id:crypto.randomUUID(), initial, state:initial, events:[], started:true,
          names:["You with a longer name", "Opponent with a longer name"],
          config:{mode:"local",humanSide:0,matchLength:0,rules:initial.rules}};
        game = playAction(game, {type:"move",steps:result.candidates[0].steps});
        game.events[0].evaluation = {result:{...result,actual:result.candidates[0]}};
        game = playAction(game, {type:"roll",dice:[4,2]});
        game = playAction(game, {type:"move",steps:r.legalTurns(game.state)[0].steps});
        await st.put("items",st.itemRecord("match",{...game,title:"Phone session",status:"in-progress"}));
        for (let i=0;i<20;i++) await st.put("items",st.itemRecord("position",{state:initial,
          title:i === 0 ? "A long saved position name that should wrap without hiding its actions" : `Practice ${i}`,
          collection:i%2 ? "Race" : "Contact",updatedAt:Date.now()-i-1000}));
        return {position:"A long saved position name that should wrap without hiding its actions"};
      } finally {engine.destroy();}
    });
    await page.reload();
    await page.locator(".library-session-players").waitFor();
    assert.match(await page.locator('.library-session-player[data-player="0"]').textContent(), /0\.000 EV points lost/);
    assert.match(await page.locator('.library-session-player[data-player="1"]').textContent(), /— EV points lost/);
    assert.match(await page.locator(".library-session-count").textContent(), /1 game · 1 evaluated · 2 unreviewed/);
    for (const [width,height] of [[320,568],[375,667],[390,844],[430,932],[844,390],[768,1024],[1366,768]]) {
      await page.setViewportSize({width,height});
      await page.locator(".library-layout").evaluate(e => e.scrollTop = 0);
      await page.locator(".library-list").evaluate(e => e.scrollTop = 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1), `${width} Library fits`);
      const before = await page.locator(".library-filters").boundingBox();
      if (width <= 1024) {
        const search = await page.getByLabel("Search Library",{exact:true}).boundingBox();
        assert.ok(search.width >= before.width-1, "search uses a readable full row even beside a landscape inspector");
      }
      if (width <= 700) {
        await page.locator(".library-layout").evaluate(e => e.scrollTop = 800);
        const after = await page.locator(".library-filters").boundingBox();
        assert.equal(after.y,before.y,"filters remain reachable while browsing saved games");
        await page.locator(".library-layout").evaluate(e => e.scrollTop = 0);
      }
      await page.screenshot({path:path.join(out,`${name}-library-list-${width}.png`)});
      await page.getByLabel("Collection filter",{exact:true}).selectOption("Contact");
      await page.getByLabel("Search Library",{exact:true}).fill("long saved");
      assert.equal(await page.locator(".library-item").count(),1);
      await page.getByRole("button",{name:`Open ${fixture.position}`,exact:true}).tap();
      const open = page.getByRole("button",{name:"Open in Solver",exact:true});
      const bounds = await open.boundingBox();
      assert.ok(bounds.y >= 0 && bounds.y+bounds.height <= height+1 && bounds.height >=44,"opening a saved position is the first reachable action");
      await page.screenshot({path:path.join(out,`${name}-library-selected-${width}.png`)});
      if (await page.locator("#details-dialog").count()) {
        await page.locator("#details-dialog .close").tap();
        await page.locator("#details-dialog").waitFor({state:"detached"});
      }
      await page.getByLabel("Search Library",{exact:true}).fill("");
      await page.getByLabel("Collection filter",{exact:true}).selectOption("");
    }
    await page.setViewportSize({width:390,height:460});
    await page.getByLabel("Search Library",{exact:true}).fill("no matches");
    assert.match(await page.locator(".empty").textContent(), /No matching items/);
    await page.getByLabel("Search Library",{exact:true}).fill("long saved");
    await page.getByRole("button",{name:`Open ${fixture.position}`,exact:true}).tap();
    await page.getByRole("button",{name:"Open in Solver",exact:true}).tap();
    await page.waitForURL(/\/backgammon\/solver\/\?item=/);
    await page.locator("#analyze").waitFor();
    assert.deepEqual(errors,[]);
    return {browser:name,viewports:7,stickyFilters:true,search:true,openSavedPosition:true,realEngineSummary:true};
  } finally {await context.close();}
};
