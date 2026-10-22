const assert = require("node:assert/strict"), path = require("node:path"), fs = require("node:fs");
const { chromium } = require("playwright"), { launchQuietBrowser } = require("../../scripts/quiet-browser.cjs");
const { serveSite, settle } = require("../../scripts/site-pages.cjs");
const catalog = require("../catalog.js");
(async () => {
  const server = await serveSite(path.resolve(process.env.SCOUNDREL_SITE || "_site"));
  const browser = await launchQuietBrowser(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const url = server.base + "/scoundrel/gallery/", visibleCards = () => page.locator(".collection-card:visible");
  const shots = process.env.SCOUNDREL_SCREENSHOTS; if (shots) fs.mkdirSync(shots, { recursive: true });
  try {
    await page.goto(url); await settle(page);
    assert.equal(await visibleCards().count(), 44);
    assert.equal(await page.locator("#result-count").innerText(), "44 cards");
    for (const [suit, count] of [["s", 13], ["c", 13], ["d", 9], ["h", 9]]) { await page.locator(`[data-filter="${suit}"]`).click(); assert.equal(await visibleCards().count(), count); }
    await page.locator('[data-filter="d"]').click(); await page.locator("#card-search").fill("Oathbreaker");
    assert.equal(await visibleCards().count(), 1); assert.ok(page.url().includes("q=Oathbreaker"));
    await visibleCards().click(); assert.equal(await page.locator("#viewer-name").innerText(), "Oathbreaker");
    assert.equal(await page.locator("#next-card").isDisabled(), true);
    await page.keyboard.press("Escape"); assert.equal(await page.locator("#card-viewer").isVisible(), false);
    await page.locator("#card-search").fill("no-such-card"); assert.equal(await page.locator("#empty-state").isVisible(), true);
    await page.locator("#reset-filters").click(); assert.equal(await visibleCards().count(), 44);
    const first = page.locator('[data-card="2s"]'); await first.click();
    assert.equal(await page.locator("#viewer-name").innerText(), catalog["2s"].name);
    await page.keyboard.press("ArrowRight"); assert.equal(await page.locator("#viewer-name").innerText(), catalog["3s"].name);
    await page.keyboard.press("ArrowLeft"); assert.equal(await page.locator("#viewer-name").innerText(), catalog["2s"].name);
    await page.goBack(); assert.equal(await page.locator("#card-viewer").isVisible(), false);
    assert.equal(await first.evaluate(el => el === document.activeElement), true);
    const box = await first.locator(".card-plane").boundingBox();
    await page.mouse.move(box.x + box.width * .85, box.y + box.height * .2); await page.waitForTimeout(400);
    assert.notEqual(await first.evaluate(el => el.style.getPropertyValue("--tilt-y")), "");
    await page.mouse.move(5, 5); await page.waitForTimeout(400);
    assert.equal(await first.evaluate(el => el.style.getPropertyValue("--tilt-y")), "");
    if (shots) await page.screenshot({ path: path.join(shots, "scoundrel-gallery-desktop.png") });
    await page.goto(url + "?suit=c#Qc"); await settle(page);
    assert.equal(await page.locator("#viewer-name").innerText(), catalog.Qc.name); assert.equal(new URL(page.url()).hash, "#Qc");
    await page.locator("#next-card").click(); assert.equal(await page.locator("#viewer-name").innerText(), catalog.Kc.name);
    await page.reload(); await settle(page); assert.equal(await page.locator("#viewer-name").innerText(), catalog.Kc.name);
    if (shots) await page.screenshot({ path: path.join(shots, "scoundrel-gallery-viewer.png") });
    await page.keyboard.press("Escape"); await page.locator('[data-filter="all"]').click();
    for (const viewport of [{ width: 375, height: 812 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport); await settle(page);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, JSON.stringify(viewport));
      const clipped = await page.locator(".card-caption strong").evaluateAll(elements => elements.filter(el => !el.closest("[hidden]") && el.scrollWidth > el.clientWidth + 1).map(el => el.textContent));
      assert.deepEqual(clipped, []);
      await page.locator('[data-card="As"]').click();
      const dialogBounds = await page.locator("#card-viewer").boundingBox();
      assert.ok(dialogBounds.width <= viewport.width && dialogBounds.height <= viewport.height);
      await page.locator("#next-card").click(); assert.equal(await page.locator("#viewer-name").innerText(), catalog["2c"].name);
      await page.keyboard.press("Escape");
    }
    await page.setViewportSize({ width: 375, height: 812 }); await page.goto(url); await settle(page);
    if (shots) await page.screenshot({ path: path.join(shots, "scoundrel-gallery-phone.png"), fullPage: true });
    await first.click();
    await page.locator(".viewer-art").evaluate(el => { for (const [type, property, x] of [["touchstart", "touches", 280], ["touchend", "changedTouches", 100]]) { const event = new Event(type, { bubbles: true }); Object.defineProperty(event, property, { value: [{ clientX: x, clientY: 100 }] }); el.dispatchEvent(event); } });
    assert.equal(await page.locator("#viewer-name").innerText(), catalog["3s"].name);
    await page.keyboard.press("Escape"); await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 }); await first.hover();
    assert.equal(await first.locator(".card-plane").evaluate(el => getComputedStyle(el).transform), "none");
    for (const entry of Object.values(catalog)) { const response = await page.request.get(server.base + "/scoundrel/" + entry.image); assert.equal(response.status(), 200, entry.image); }
    assert.deepEqual(errors, []);
    console.log("Gallery verified: 44 images, filters, search, deep links/reload, history, keyboard, swipe, tilt, reduced motion and desktop/phone layouts.");
  } finally { await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
