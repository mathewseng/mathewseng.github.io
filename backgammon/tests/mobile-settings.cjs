const assert = require("node:assert/strict"), path = require("node:path");

module.exports = async function mobileSettings(browser, base, out, name) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 }, hasTouch: true,
    reducedMotion: "reduce", serviceWorkers: "block",
  });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const sizes = [[320,568],[375,667],[390,844],[430,932],[844,390],[768,1024],[1024,768],[1366,768],[1440,900]];
  const storedWork = () => page.evaluate(async () => {
    const {get} = await import("/backgammon/core/storage.mjs");
    const work = await get("work", "play");
    return {game:work.game, draft:work.draft};
  });
  const section = label => page.getByRole("button", {name:label, exact:true});
  const reachable = async locator => {
    const result = await locator.evaluate(n => {
      const r = n.getBoundingClientRect(), target = document.elementFromPoint(r.x+r.width/2, r.y+r.height/2);
      return {visible:n === target || n.contains(target), width:r.width, height:r.height};
    });
    assert.ok(result.visible, "control must not be covered or clipped");
    assert.ok(result.height >= 44 && result.width >= 44, "ordinary controls have 44px touch targets");
  };
  try {
    await page.addInitScript(() => {
      const random = crypto.getRandomValues.bind(crypto), dice = [2,0];
      crypto.getRandomValues = a => a instanceof Uint8Array && a.length === 1 && dice.length
        ? ((a[0] = dice.shift()), a) : random(a);
    });
    await page.goto(base + "/backgammon/play/");
    await section("Same device").click();
    await page.locator("#start-match").click();
    await page.locator("#roll").click();
    await page.locator("#begin-turn").click();
    await page.locator("#draft-controls select").selectOption({index:1});
    await page.waitForFunction(async () => (await (await import("/backgammon/core/storage.mjs")).get("work","play")).draft.length === 1);
    const before = await storedWork();
    await page.locator("#preferences").focus();
    await page.keyboard.press("Enter");
    const dialog = page.locator(".settings-dialog");
    await dialog.waitFor();
    for (const [width,height] of sizes) {
      await page.setViewportSize({width,height});
      await section("Board colors").tap();
      await reachable(section("Board colors"));
      await reachable(section("Display & controls"));
      await reachable(section("Keyboard"));
      await reachable(dialog.locator(".close"));
      const metrics = await dialog.evaluate(d => {
        const body = d.querySelector(".dialog-body"), r = d.getBoundingClientRect();
        return {bodyWidth:body.clientWidth, bodyScroll:body.scrollWidth, top:r.top, bottom:r.bottom, viewport:innerHeight};
      });
      assert.ok(metrics.bodyScroll <= metrics.bodyWidth + 1, "settings never need sideways scrolling");
      assert.ok(metrics.top >= 0 && metrics.bottom <= metrics.viewport + 1, "settings fit the dynamic viewport");
      await page.screenshot({path:path.join(out, name + "-settings-" + width + ".png")});
      await dialog.locator(".dialog-body").evaluate(n => n.scrollTop = n.scrollHeight);
      await reachable(section("Display & controls"));
      await section("Display & controls").tap();
      assert.equal(await dialog.locator(".dialog-body").evaluate(n => n.scrollTop), 0, "changing sections starts at the first control");
      await reachable(page.getByLabel("Board orientation", {exact:true}));
      await section("Keyboard").tap();
      assert.ok(await page.getByLabel("Enable game shortcuts", {exact:true}).isVisible());
    }
    await page.setViewportSize({width:320,height:568});
    await section("Board colors").tap();
    await page.locator('[data-preset="amber"]').tap();
    await reachable(section("Display & controls")); // tabs remain pinned at the end of 24 presets
    await section("Display & controls").tap();
    await page.getByLabel("Show legal-move hints", {exact:true}).uncheck();
    await page.getByLabel("Motion", {exact:true}).selectOption("reduce");
    await page.locator(".settings-updates summary").tap();
    await page.getByRole("button",{name:"Check for updates",exact:true}).waitFor();
    assert.ok(await page.locator(".release-status").isVisible());
    await section("Board colors").tap();
    await section("Colors").tap();
    await page.locator(".color-group summary").filter({hasText:"Board surfaces"}).tap();
    const hex = page.getByLabel("Frame hex", {exact:true});
    await hex.fill("#274C50");
    // A shorter viewport approximates the space left by a phone keyboard.
    await page.setViewportSize({width:390,height:430});
    await hex.scrollIntoViewIfNeeded();
    await reachable(hex);
    assert.equal(await hex.evaluate(n => getComputedStyle(n).fontSize), "16px");
    await hex.fill("#badhex");
    assert.equal(await hex.getAttribute("aria-invalid"), "true");
    await hex.fill("#274C50");
    await reachable(section("Display & controls"));
    await reachable(dialog.locator(".close"));
    await page.screenshot({path:path.join(out,name+"-settings-keyboard.png")});
    await page.setViewportSize({width:390,height:844});
    await section("Display & controls").tap();
    await page.screenshot({path:path.join(out,name+"-settings-display.png")});
    await dialog.locator(".close").tap();
    await dialog.waitFor({state:"detached"});
    assert.deepEqual(await storedWork(), before, "appearance and settings preserve the live draft and dice");
    assert.ok(await page.locator("#preferences").evaluate(n => document.activeElement === n), "close returns focus to Settings");
    const settings = await page.evaluate(() => JSON.parse(localStorage.getItem("backgammon.v1.settings")));
    assert.equal(settings.moveHints, false);
    assert.equal(settings.boardTheme.preset, "amber");
    assert.equal(settings.boardTheme.colors.frame, "#274C50");
    assert.equal(settings.motion, "reduce");
    assert.deepEqual(errors, []);
    return {browser:name,viewports:sizes.length,pinnedNavigation:true,allPresetsReachable:true,keyboardViewport:true,settingsPersist:true,draftPreserved:true};
  } finally { await context.close(); }
};
