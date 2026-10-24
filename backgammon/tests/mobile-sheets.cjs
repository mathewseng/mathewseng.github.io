const assert = require("node:assert/strict"), path = require("node:path");

module.exports = async function mobileSheets(browser, base, out, name) {
  const context = await browser.newContext({
    viewport:{width:390,height:844}, hasTouch:true, reducedMotion:"reduce",
    serviceWorkers:"block", ...(name === "firefox" ? {} : {isMobile:true}),
  });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const shot = label => page.screenshot({path:path.join(out,`${name}-sheets-${label}.png`)});
  const work = () => page.evaluate(async () => {
    const w = await (await import("/backgammon/core/storage.mjs")).get("work","play");
    return {game:w.game,draft:w.draft};
  });
  try {
    await page.goto(base+"/backgammon/play/");
    const id = await page.evaluate(async () => {
      const r=await import("/backgammon/core/rules.mjs"), st=await import("/backgammon/core/storage.mjs");
      st.saveSettings({interactionMode:"beginner"});
      const initial=r.initialState({phase:"move",dice:[4,1],matchLength:5}), id=crypto.randomUUID();
      await st.put("work",{id:"play",game:{id,initial,state:initial,events:[],started:true,
        names:["Alexandria with a very long name","Opponent with a very long name"],
        config:{mode:"local",humanSide:0,strength:"quick",matchLength:5,rules:initial.rules}},draft:[],positionKey:r.positionKey(initial)});
      return id;
    });
    await page.goto(base+`/backgammon/play/#resume=${id}`);
    await page.reload();
    await page.locator("#confirm").waitFor();
    await page.getByLabel("Select a checker",{exact:true}).selectOption("12");
    await page.getByLabel("Move selected checker",{exact:true}).selectOption("8");
    // The draft is saved after a paint (play/app.js saveDraftAfterPaint); wait for it.
    let before = await work();
    for (let i=0; i<100 && before.draft.length!==1; i++) { await page.waitForTimeout(50); before = await work(); }
    assert.equal(before.draft.length,1);
    for (const [width,height] of [[320,568],[375,667],[390,844],[430,932],[844,390],[768,1024],[1366,768]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(()=>scrollTo(0,0));
      const strip=await page.locator("#player").evaluate(row=>{
        const name=row.querySelector("strong").getBoundingClientRect(), badge=row.querySelector(".player-status").getBoundingClientRect(), stats=row.querySelector(".player-stats").getBoundingClientRect();
        return {text:row.querySelector(".player-status").textContent, badgeVisible:badge.width>0,
          noOverlap:name.right<=badge.left && (!stats.width || badge.right<=stats.left), right:Math.max(badge.right,stats.right),width:innerWidth};
      });
      assert.equal(strip.text,"To move");
      assert.ok(strip.badgeVisible && strip.noOverlap && strip.right<=strip.width, `long names never cover turn status or score: ${width}x${height} ${JSON.stringify(strip)}`);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.locator("#all-controls").click();
      const d=page.locator(".practice-controls-dialog");
      await d.waitFor();
      const box=await d.boundingBox();
      if(width<=700 && height>500) {
        assert.equal(box.x,8,"phone sheet leaves a safe edge");
        assert.ok(Math.abs(box.y+box.height-(height-12))<2,"phone tools stay above the bottom safe edge");
      }
      for(const button of await d.locator("button").all()) {
        const r=await button.boundingBox();
        assert.ok(r.height>=44 && r.width>=44 && r.x>=0 && r.x+r.width<=width+1 && r.y+r.height<=height+1,"sheet buttons fit with full touch targets");
      }
      await shot(`controls-${width}`);
      // Padding is part of the sheet, not its dismissible backdrop.
      await page.touchscreen.tap(box.x+4,box.y+70);
      assert.ok(await d.isVisible());
      // Dragging outside is not a tap and should never dismiss the sheet.
      await page.mouse.move(2,2);await page.mouse.down();
      await page.mouse.move(60,10);await page.mouse.move(2,2);await page.mouse.up();
      assert.ok(await d.isVisible());
      await page.touchscreen.tap(2,2);
      await d.waitFor({state:"detached"});
      assert.equal(await page.locator("#help-actions").count(),1);
      assert.equal(await page.locator(".help-cluster #help-actions").count(),1,"original live controls return after backdrop dismissal");
      assert.ok(await page.evaluate(()=>!document.documentElement.classList.contains("bg-dialog-open")));
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator("#mobile-tools").focus();await page.keyboard.press("Enter");
    await page.locator(".tool-menu-dialog").waitFor();
    await page.keyboard.press("Escape");
    await page.locator(".tool-menu-dialog").waitFor({state:"detached"});
    assert.ok(await page.locator("#mobile-tools").evaluate(n=>n===document.activeElement));

    await page.locator("#panel-toggle").tap();
    await page.locator("#details-dialog").getByRole("button",{name:"Save position",exact:true}).tap();
    const form=page.getByRole("dialog",{name:"Save to Library",exact:true});
    await form.waitFor();
    await page.getByLabel("Name",{exact:true}).fill("Keep this mobile draft");
    await page.touchscreen.tap(2,2);
    assert.ok(await form.isVisible(),"backdrop cannot discard an unfinished form");
    assert.equal(await page.getByLabel("Name",{exact:true}).inputValue(),"Keep this mobile draft");
    await shot("nested-form");
    await form.locator(".close").tap();
    await form.waitFor({state:"detached"});
    assert.ok(await page.locator("#details-dialog").isVisible());
    assert.ok(await page.evaluate(()=>document.documentElement.classList.contains("bg-dialog-open")),"parent sheet keeps the scroll lock");
    await page.touchscreen.tap(2,2);
    await page.locator("#details-dialog").waitFor({state:"detached"});
    assert.equal(await page.locator("#inspector > #panel").count(),1);
    assert.deepEqual(await work(),before,"sheets never change saved dice or draft steps");

    await page.locator("#analysis-jump").tap();
    const scroll = await page.evaluate(()=>scrollY);
    assert.ok(scroll>0);
    await page.evaluate(async()=> (await import("/backgammon/ui/shell.mjs")).openPanel());
    await page.locator("#details-dialog").waitFor();
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overflowY),"hidden");
    if (name !== "webkit") {
      await page.mouse.move(2,2);await page.mouse.wheel(0,500);
    }
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(()=>scrollY),scroll,"background cannot scroll under a sheet");
    await page.locator("#details-dialog .close").tap();
    await page.locator("#details-dialog").waitFor({state:"detached"});
    assert.equal(await page.evaluate(()=>scrollY),scroll,"closing returns to the same analysis position");
    await page.evaluate(async()=> {
      (await import("/backgammon/ui/shell.mjs")).openPanel();
      // Returning to a historical position deliberately goes back to the board.
      scrollTo({top:0,behavior:"instant"});
      document.querySelector("#details-dialog").close();
    });
    await page.locator("#details-dialog").waitFor({state:"detached"});
    assert.equal(await page.evaluate(()=>scrollY),0,"closing never overrides an intentional return to the board");
    assert.equal(await page.evaluate(()=>document.body.style.minHeight),"","scroll lock leaves no stale document height");

    await page.evaluate(async()=>{
      const {players}=await import("/backgammon/ui/shell.mjs"), r=await import("/backgammon/core/rules.mjs");
      const s=r.initialState({phase:"roll"});players(s,["You","Friend"]);
    });
    assert.equal(await page.locator("#player .player-status").textContent(),"To roll");
    await page.evaluate(async()=>{
      const {players}=await import("/backgammon/ui/shell.mjs"), r=await import("/backgammon/core/rules.mjs");
      players(r.transition(r.initialState({phase:"roll"}),{type:"double"}),["You","Friend"]);
      scrollTo(0,0);
    });
    assert.equal(await page.locator("#opponent .player-status").textContent(),"To reply");
    assert.equal(await page.locator("#player .player-status").count(),0);
    await shot("cube-turn-status");
    assert.deepEqual(errors,[]);
    return {browser:name,viewports:7,readableTurnStatus:true,backdropDismissal:true,formsProtected:true,nestedScrollLock:true,scrollAndDraftPreserved:true};
  } finally {await context.close();}
};
