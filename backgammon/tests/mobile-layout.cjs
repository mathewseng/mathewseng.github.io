const assert = require("node:assert/strict"), path = require("node:path");
module.exports = async function mobileLayout(browser, base, out, name) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, hasTouch: true, reducedMotion: "reduce", serviceWorkers: "block" });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const sizes = [[320,568],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1366,768],[1440,900]];
  const shot = async label => page.screenshot({path: path.join(out, `${name}-mobile-${label}.png`)});
  try {
    await page.addInitScript(() => {
      const random = crypto.getRandomValues.bind(crypto), bytes = [5,0];
      crypto.getRandomValues = a => a instanceof Uint8Array && a.length === 1 && bytes.length ? ((a[0] = bytes.shift()),a) : random(a);
    });
    await page.goto(base + "/backgammon/play/");
    await page.setViewportSize({width:390,height:844});
    await page.getByRole("button", {name:"Computer",exact:true}).waitFor();
    assert.equal(await page.getByRole("button", {name:"Computer",exact:true}).getAttribute("aria-pressed"), "true", "setup communicates the chosen mode");
    assert.equal(await page.getByRole("button", {name:"Same device",exact:true}).getAttribute("aria-pressed"), "false");
    for (const width of [320,375,390,430]) {
      await page.setViewportSize({width,height:width===320?568:844});
      assert.ok(await page.getByLabel("Match length",{exact:true}).isVisible(), "phone setup is inline");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await shot(`setup-${width}`);
    }
    await page.getByRole("button", {name:"Online",exact:true}).tap();
    assert.ok(await page.locator("#create-room").isVisible(), "create/join remain visible without a drawer");
    await page.getByLabel("Your name",{exact:true}).fill("Long mobile player name");
    await page.setViewportSize({width:390,height:460});
    await page.getByLabel("Room code",{exact:true}).fill("ABC234");
    assert.equal(await page.getByLabel("Room code",{exact:true}).inputValue(), "ABC234", "fields remain usable with a shortened keyboard viewport");
    await page.setViewportSize({width:390,height:844});
    await page.getByRole("button", {name:"Same device",exact:true}).click();
    await page.locator(".game-rules > summary").tap();
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.locator("#start-match").click();
    await page.waitForFunction(() => scrollY === 0);
    await page.locator("#roll").click();
    await page.locator("#begin-turn").click();
    for (const [width,height] of sizes) {
      await page.setViewportSize({width,height});
      await page.evaluate(() => scrollTo(0,0));
      await page.waitForTimeout(70);
      const metrics = await page.evaluate(() => {
        const box = s => { const r = document.querySelector(s).getBoundingClientRect(); return {top:r.top,bottom:r.bottom,width:r.width,height:r.height}; };
        return {board:box("#board"),opponent:box("#opponent"),player:box("#player"),confirm:box("#confirm"),overflow:document.documentElement.scrollWidth > innerWidth + 1};
      });
      assert.ok(!metrics.overflow, `horizontal overflow ${width}`);
      if (width >= 375) assert.ok(metrics.confirm.bottom <= height + 1, `confirm offscreen ${width}: ${JSON.stringify(metrics)}`);
      if (width <= 700 && height > 500) {
        assert.ok(Math.abs(metrics.board.height / metrics.board.width - 660/876) < .01, "board keeps its aspect ratio");
        for (const gap of [metrics.board.top - metrics.opponent.bottom, metrics.player.top - metrics.board.bottom])
          assert.ok(gap >= -1 && gap < 3, "player strips hug the board without overlap");
        assert.ok(metrics.confirm.height >= 48, "large primary touch target");
        const help = await page.locator(".help-cluster").boundingBox();
        assert.ok(metrics.confirm.top >= help.y + help.height, "primary action follows help controls at the bottom");
      }
      if (width <= 700 || height <= 500)
        assert.ok(await page.locator(".touch-moves").isVisible(), "large move controls work in portrait and landscape");
      await shot(`play-${width}`);
      if (width >= 650 && height <= 500) {
        const detail = await page.locator("#panel-toggle").boundingBox();
        const dock = await page.locator(".action-area").boundingBox();
        assert.ok(detail.y + detail.height <= dock.y + 1, "landscape tools never overlap the action dock");
        assert.ok(metrics.board.height > height - 110, "landscape reclaims the redundant header row for the board");
        await page.locator("#mobile-tools").tap();
        await page.locator(".tool-menu-dialog .close").tap();
        await page.locator(".tool-menu-dialog").waitFor({state:"detached"});
      }
      if (width <=700 || height <=500) {
        await page.locator("#analysis-jump").tap();
        assert.ok(await page.locator("#review-heading").evaluate(e => document.activeElement === e));
        await shot(`analysis-${width}`);
        await page.getByRole("button",{name:"Back to board ↑",exact:true}).tap();
        assert.equal(await page.evaluate(() => scrollY), 0);
      }
    }
    await page.setViewportSize({width:390,height:844});
    // Secondary tools share the original stateful buttons, including after
    // closing, rotating and launching a second dialog from the sheet.
    assert.ok(!(await page.locator("#equity-toggle").isVisible()));
    await page.locator("#mobile-tools").focus();
    await page.keyboard.press("Enter");
    await page.locator(".tool-menu-dialog").waitFor();
    await page.keyboard.press("Escape");
    await page.locator(".tool-menu-dialog").waitFor({state:"detached"});
    assert.ok(await page.locator("#mobile-tools").evaluate(n => document.activeElement === n), "sheet returns keyboard focus");
    await page.locator("#mobile-tools").tap();
    await shot("tools");
    await page.locator(".tool-menu-dialog #equity-toggle").tap();
    await page.locator(".tool-menu-dialog").waitFor({state:"detached"});
    assert.equal(await page.locator("#equity-toggle").getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("#equity-toggle").count(), 1);
    await page.locator("#mobile-tools").tap();
    await page.locator(".tool-menu-dialog #equity-toggle").tap();
    await page.locator(".tool-menu-dialog").waitFor({state:"detached"});
    await page.locator("#mobile-tools").tap();
    await page.setViewportSize({width:1024,height:768});
    await page.locator(".tool-menu-dialog .close").click();
    await page.locator(".tool-menu-dialog").waitFor({state:"detached"});
    assert.ok(await page.locator("#toolbar #equity-toggle").isVisible(), "original tools return to the desktop toolbar");
    await page.setViewportSize({width:390,height:844});
    // Actual touch input, then reverse the draft. Board geometry stays fixed.
    const before = await page.locator("#board").boundingBox();
    await page.locator('#board [data-point="12"] .checker > circle').first().tap();
    await page.locator('#board [data-point="6"] .point-number-hit').tap();
    for (const id of ["undo-turn", "undo", "reset-draft", "all-controls"]) {
      const box = await page.locator(`#${id}`).boundingBox();
      assert.ok(box && box.x >=0 && box.x+box.width<=390 && box.height>=44, `${id} needs no horizontal scrolling`);
    }
    await page.locator("#all-controls").tap();
    await page.locator(".practice-controls-dialog #undo").tap();
    await page.locator(".practice-controls-dialog").waitFor({state:"detached"});
    assert.deepEqual(await page.locator("#board").boundingBox(), before);
    await page.locator("#panel-toggle").tap();
    await page.locator("#details-dialog").waitFor();
    await shot("details");
    const detail = await page.locator("#details-dialog").boundingBox();
    assert.ok(detail.y >= 0 && detail.y + detail.height <= 845);
    for (let step = 0; step < 4 && await page.locator("#confirm").isDisabled(); step++)
      await page.getByLabel("Accessible move selection", {exact:true}).selectOption({index:1});
    await page.locator("#details-dialog").getByRole("button",{name:"Close",exact:true}).tap();
    await page.locator("#confirm").tap();
    await page.locator("#double-cube").tap();
    await page.locator("#take-cube").waitFor();
    await shot("cube");
    for (const action of ["#drop-cube", "#take-cube"]) {
      const rect = await page.locator(action).boundingBox();
      assert.ok(rect.height >=48 && rect.y + rect.height <=844, "cube replies stay reachable");
    }
    await page.locator("#take-cube").tap();
    // CSS zoom is a reflow stress test, not a claim of physical-device testing.
    await page.evaluate(() => {
      document.documentElement.style.zoom = "1.4";
      document.querySelector("#player .player-name strong").textContent = "A very long player name for narrow screen testing";
    });
    await page.locator("#analysis-jump").scrollIntoViewIfNeeded();
    await shot("enlarged");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `enlarged content reflows: ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll(".app *")].filter(n => n.getBoundingClientRect().right > innerWidth + 1).slice(0,12).map(n => ({tag:n.tagName,id:n.id,width:n.getBoundingClientRect().width}))))}`);
    await page.locator("#analysis-jump").tap();
    await page.getByRole("button",{name:"Back to board ↑",exact:true}).tap();
    await page.evaluate(() => document.documentElement.style.zoom = "");
    // Shared mobile chrome and form controls in all tools.
    for (const route of ["trainer","solver","library"]) {
      await page.goto(base + `/backgammon/${route}/`);
      await page.locator("#page-title").waitFor();
      await page.waitForFunction(() => document.querySelector("#panel")?.children.length > 0);
      if (route === "trainer") await page.locator("#submit-decision").waitFor();
      await shot(route);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route} overflows`);
      if (route !== "library") {
        await page.locator("#panel-toggle").tap();
        await shot(`${route}-details`);
        const fonts = await page.locator("#details-dialog input:not([type=checkbox]):not([type=range]), #details-dialog select, #details-dialog textarea").evaluateAll(es => es.map(e => parseFloat(getComputedStyle(e).fontSize)));
        assert.ok(fonts.every(n => n >=16), `${route} must avoid input zoom`);
        await page.locator("#details-dialog").getByRole("button",{name:"Close",exact:true}).tap();
      }
      await page.locator("#mobile-tools").tap();
      if (route === "solver") {
        await page.locator(".tool-menu-dialog").getByRole("button",{name:"Save",exact:true}).tap();
        await page.getByRole("dialog",{name:"Save to Library",exact:true}).waitFor();
        await page.getByLabel("Name",{exact:true}).fill("Phone study");
        await page.getByRole("dialog",{name:"Save to Library",exact:true}).getByRole("button",{name:"Save",exact:true}).tap();
        await page.getByRole("dialog").waitFor({state:"detached"});
        assert.equal(await page.locator("#toolbar").getByRole("button",{name:"Save",exact:true,includeHidden:true}).count(),1);
      } else {
        assert.ok(await page.locator(".tool-menu-dialog button:not(.close)").count() > 0);
        await page.locator(".tool-menu-dialog .close").tap();
        await page.locator(".tool-menu-dialog").waitFor({state:"detached"});
      }
    }
    assert.deepEqual(errors, []);
    return {browser:name,viewports:sizes.length,touchMoveUndo:true,cubeReplies:true,enlargedContent:true,analysisNavigation:true,sharedInputs:true,inlineSetup:true,mobileTools:true,rotation:true,shortenedKeyboardViewport:true};
  } finally {await context.close();}
};
