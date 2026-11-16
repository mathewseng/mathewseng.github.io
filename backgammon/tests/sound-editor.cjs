const assert = require("node:assert/strict");
const path = require("node:path");

module.exports = async function soundEditor(browser, base, out, name) {
  const views = [
    ["desktop", 1440, 900, false],
    ["portrait", 430, 932, true],
    ["landscape", 932, 430, true],
    ["small-phone", 320, 568, true],
  ];
  const screenshots = [];
  for (const [view, width, height, hasTouch] of views) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch, serviceWorkers: "block" });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto(base + "/backgammon/play/");
      // An existing pre-editor preference migrates without changing volume/mute.
      await page.evaluate(() => localStorage.setItem("backgammon.v1.settings", JSON.stringify({sound:{enabled:true,volume:35}})));
      await page.locator("#preferences").click();
      await page.getByRole("tab", { name: "Sounds", exact: true }).click();
      const editor = page.locator(".sound-editor");
      await editor.waitFor();
      assert.equal(await editor.locator(".sound-action").count(), 11);
      assert.equal(await page.getByLabel("Volume", {exact:true}).inputValue(), "35");
      const choice = (action, style) => page.getByRole("button", {name:`${action}: ${style}`,exact:true});
      assert.equal(await editor.locator("select").count(), 0, "all sound choices are directly tappable");
      await page.evaluate(async () => {
        const {sound} = await import("/backgammon/ui/sound.mjs");
        window.soundPreviews = [];
        const play = sound.play.bind(sound);
        sound.play = name => { const result = play(name); if(result) soundPreviews.push(name); return result; };
      });
      await choice("Hit checker", "Silent").click();
      await choice("Move checker", "Glass").click();
      await page.waitForFunction(() => soundPreviews.length === 1);
      await choice("Move checker", "Wood").click();
      await page.waitForFunction(() => soundPreviews.length === 2);
      await choice("Move checker", "Wood").click();
      await page.waitForFunction(() => soundPreviews.length === 3);
      assert.deepEqual(await page.evaluate(() => soundPreviews), ["move","move","move"], "each tap plays immediately, including the selected choice");
      assert.equal(await choice("Move checker", "Wood").getAttribute("aria-pressed"), "true");
      assert.equal(await choice("Move checker", "Glass").getAttribute("aria-pressed"), "false");
      await page.waitForFunction(() => /Move checker · Wood/.test(document.querySelector(".sound-status").textContent));
      const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("backgammon.v1.settings")).sound);
      assert.equal((await stored()).effects.move, "wood");
      assert.equal((await stored()).effects.hit, "off");
      for (const row of await editor.locator(".sound-action").all()) {
        await row.scrollIntoViewIfNeeded();
        for (const control of await row.locator("button").all()) {
          const bounds = await control.boundingBox();
          assert.ok(bounds.width >= 44 && bounds.height >= 44, "44px sound controls");
        }
      }
      const layout = await page.locator(".settings-dialog").evaluate(dialog => {
        const rect = dialog.getBoundingClientRect(), body = dialog.querySelector(".dialog-body");
        return {fits:rect.top>=0 && rect.bottom<=innerHeight+1,overflow:body.scrollWidth>body.clientWidth+1};
      });
      assert.deepEqual(layout, {fits:true,overflow:false});
      await page.locator(".settings-dialog .dialog-body").evaluate(node => node.scrollTop = 0);
      if (view === "landscape") await editor.locator(".sound-action").first().scrollIntoViewIfNeeded();
      const shot = path.join(out, `${name}-sound-editor-${view}.png`);
      await page.screenshot({path:shot});
      screenshots.push(shot);
      await page.getByRole("checkbox", {name:"Sound effects",exact:true}).uncheck();
      const previews = await page.evaluate(() => soundPreviews.length);
      await choice("Roll dice", "Felt").click();
      assert.equal(await page.evaluate(() => soundPreviews.length), previews, "muted or zero-volume choices save silently");
      await page.getByRole("button", {name:"Reset choices",exact:true}).click();
      assert.deepEqual(await stored(), {enabled:false,volume:35,effects:{}});
      await page.getByRole("checkbox", {name:"Sound effects",exact:true}).check();
      await page.getByLabel("Volume", {exact:true}).fill("0");
      await choice("Roll dice", "Digital").click();
      assert.equal(await page.evaluate(() => soundPreviews.length), previews);
      await editor.locator(".sound-bulk summary").click();
      await choice("All actions", "Felt").click();
      const all = await stored();
      assert.equal(Object.keys(all.effects).length, 11);
      assert.ok(Object.values(all.effects).every(style => style === "felt"));
      await choice("Move checker", "Glass").click();
      await page.locator(".settings-dialog .close").click();
      await page.reload();
      await page.locator("#preferences").click();
      await page.getByRole("tab", {name:"Sounds",exact:true}).click();
      assert.equal(await choice("Move checker", "Glass").getAttribute("aria-pressed"), "true");
      assert.equal(await page.getByLabel("Volume", {exact:true}).inputValue(), "0");
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  return {viewports:views.length,screenshots,persistence:true,perActionPreview:true,muteAndReset:true};
};
