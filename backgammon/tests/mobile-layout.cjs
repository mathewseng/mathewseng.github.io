const assert = require("node:assert/strict"), path = require("node:path");
module.exports = async function mobileLayout(browser, base, out, name) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, hasTouch: true, reducedMotion: "reduce", serviceWorkers: "block" });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const sizes = [[320,568],[375,667],[390,844],[430,932],[844,390],[768,1024],[1024,768],[1366,768],[1440,900]];
  const shot = async label => page.screenshot({path: path.join(out, `${name}-mobile-${label}.png`)});
  try {
    await page.addInitScript(() => {
      const random = crypto.getRandomValues.bind(crypto), bytes = [5,0];
      crypto.getRandomValues = a => a instanceof Uint8Array && a.length === 1 && bytes.length ? ((a[0] = bytes.shift()),a) : random(a);
    });
    await page.goto(base + "/backgammon/play/");
    await page.getByRole("button", {name:"Same device",exact:true}).click();
    await page.locator("#start-match").click();
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
      }
      await shot(`play-${width}`);
      if (width <=700 || height <=500) {
        await page.locator("#analysis-jump").tap();
        assert.ok(await page.locator("#review-heading").evaluate(e => document.activeElement === e));
        await shot(`analysis-${width}`);
        await page.getByRole("button",{name:"Back to board ↑",exact:true}).tap();
        assert.equal(await page.evaluate(() => scrollY), 0);
      }
    }
    await page.setViewportSize({width:390,height:844});
    // Actual touch input, then reverse the draft. Board geometry stays fixed.
    const before = await page.locator("#board").boundingBox();
    await page.locator('#board [data-point="12"] .checker > circle').first().tap();
    await page.locator('#board [data-point="6"] .point-number-hit').tap();
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
    }
    assert.deepEqual(errors, []);
    return {browser:name,viewports:sizes.length,touchMoveUndo:true,cubeReplies:true,enlargedContent:true,analysisNavigation:true,sharedInputs:true};
  } finally {await context.close();}
};
