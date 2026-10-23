const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const browsers = require("playwright"), { launchQuietBrowser } = require("../../scripts/quiet-browser.cjs"), { serveSite } = require("../../scripts/site-pages.cjs");
const E = require("../engine.js");
(async () => {
  const server = await serveSite(path.resolve(process.env.SCOUNDREL_SITE || "_site"));
  try {
    for (const name of (process.env.SCOUNDREL_BROWSERS || "chromium").split(",")) {
      const browser = await launchQuietBrowser(browsers[name]);
      try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.addInitScript(() => {
          const NativeWorker = window.Worker; window.searchRequests = []; window.searchUpdates = [];
          window.Worker = class extends NativeWorker {
            constructor(...args) { super(...args); this.addEventListener("message", ({ data }) => window.searchUpdates.push({ requestId: data.requestId, target: data.target, simulations: data.simulations, pending: data.pending, error: data.error })); }
            postMessage(message, ...args) { window.searchRequests.push(message); return super.postMessage(message, ...args); }
          };
        });
        await page.goto(server.base + "/scoundrel/?seed=deck-overview");
        await page.waitForFunction(() => window.searchRequests.length === 1);
        assert.equal(await page.locator("#oracle-toggle").isChecked(), false);
        assert.equal(await page.locator("#oracle-panel").isVisible(), false);
        const request = await page.evaluate(() => searchRequests[0]);
        assert.equal(request.target, 100000);
        for (const key of ["seed", "deck", "initialDeck", "history"]) assert.equal(key in request.observation, false);
        assert.equal(await page.locator("#deck-count").innerText(), "44");
        await page.locator("#cards-left-button").click();
        assert.equal(await page.locator(".deck-card").count(), 44);
        assert.equal(await page.locator(".deck-card.is-dimmed").count(), 0);
        assert.equal(await page.locator('[data-state="room"]').count(), 4);
        await page.locator('[data-deck-mode="resolved"]').click();
        assert.equal(await page.locator(".deck-card.is-dimmed").count(), 44);
        await page.locator('[data-deck-mode="left"]').click();
        await page.locator('[data-inventory-card="2s"]').click();
        await page.locator("#artwork-dialog").waitFor({ state: "visible" });
        await page.locator("#artwork-dialog [data-close]").click();
        assert.equal(await page.locator("#deck-dialog").isVisible(), true);
        assert.equal(await page.evaluate(() => document.activeElement.dataset.inventoryCard), "2s");
        for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
          await page.setViewportSize(viewport); await page.evaluate(() => document.fonts.ready);
          const vertical = viewport.width <= 900 && viewport.height > viewport.width;
          await page.waitForFunction(value => document.querySelector("#deck-matrix").dataset.orientation === value, vertical ? "columns" : "rows");
          assert.equal(await page.locator(".deck-matrix tbody tr").count(), vertical ? 13 : 4);
          assert.equal(await page.locator(".deck-matrix thead th[data-suit]").count(), vertical ? 4 : 0);
          assert.equal(await page.locator(".deck-card").count(), 44);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
          const bounds = await page.locator("#deck-dialog").boundingBox();
          assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1);
          const clipped = await page.locator(".deck-dialog h2,.deck-view-toggle button,.deck-matrix th").evaluateAll(es => es.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
          assert.deepEqual(clipped, []);
          if (process.env.SCOUNDREL_SCREENSHOTS) { fs.mkdirSync(process.env.SCOUNDREL_SCREENSHOTS, { recursive: true }); await page.locator("#deck-dialog").screenshot({ path: path.join(process.env.SCOUNDREL_SCREENSHOTS, `${name}-deck-${viewport.width}.png`) }); }
        }
        await page.locator("#deck-dialog [data-close]").click();
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForFunction(() => searchUpdates.some(update => update.simulations >= 1000));
        if (process.env.SCOUNDREL_COMPLETE_SEARCH === "1") await page.waitForFunction(() => searchUpdates.some(update => update.simulations === 100000 && update.pending === false), null, { timeout: 240000 });
        await page.locator("#oracle-toggle").check();
        assert.equal(await page.evaluate(() => searchRequests.length), 1, "opening analysis reuses the background search");
        assert.ok(await page.locator("#action-values tr").count() > 0);
        assert.ok((await page.locator("#search-progress").innerText()).includes("simulations"));
        if (process.env.SCOUNDREL_COMPLETE_SEARCH === "1") assert.ok((await page.locator("#search-progress").innerText()).includes("100,000 simulations · complete"));
        await page.locator("#oracle-toggle").uncheck(); await page.locator("#oracle-toggle").check();
        assert.equal(await page.evaluate(() => searchRequests.length), 1, "toggling visibility never restarts search");
        await page.locator("#oracle-toggle").uncheck();
        await page.locator('[data-card="9h"]').click();
        await page.locator('[data-action]').filter({ hasText: "Drink potion" }).click();
        assert.equal(await page.evaluate(() => searchRequests.length), 2);
        assert.equal(await page.evaluate(() => searchRequests[1].target), 100000);
        assert.equal(await page.locator("#deck-count").innerText(), "43");
        assert.equal(await page.locator("#cleared-count").innerText(), "1");
        await page.locator("#cards-resolved-button").click();
        assert.equal(await page.locator(".deck-card:not(.is-dimmed)").count(), 1);
        assert.equal(await page.locator('[data-inventory-card="9h"]').getAttribute("data-state"), "resolved");
        await page.locator('[data-deck-mode="left"]').click(); assert.equal(await page.locator(".deck-card.is-dimmed").count(), 1);
        await page.locator("#deck-dialog [data-close]").click();
        const fled = E.transition(E.createGame({ seed: "deck-overview" }), { type: "flee", direction: "right" });
        async function inventory(state) {
          await page.evaluate(state => localStorage.setItem("scoundrel-run-v1", JSON.stringify(state)), state); await page.reload();
          await page.locator("#cards-left-button").click();
          assert.deepEqual(await page.locator("[data-bottom-card]").evaluateAll(es => es.map(e => e.dataset.bottomCard)), state.knownBottom, "bottom queue retains the remembered draw order");
          assert.ok((await page.locator(".deck-bottom p").innerText()).startsWith(String(state.deck.length - state.knownBottom.length)), "unseen cards precede the known queue");
          for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 1440, height: 900 }]) {
            await page.setViewportSize(viewport);
            assert.equal(await page.locator(".deck-bottom").evaluate(e => e.scrollWidth > e.clientWidth + 1), false);
            if (process.env.SCOUNDREL_SCREENSHOTS) await page.locator("#deck-dialog").screenshot({ path: path.join(process.env.SCOUNDREL_SCREENSHOTS, `${name}-bottom-${viewport.width}.png`) });
          }
          const snapshot = await page.locator(".deck-card").evaluateAll(es => es.map(e => ({ id: e.dataset.inventoryCard, state: e.dataset.state, dimmed: e.classList.contains("is-dimmed") })));
          await page.locator("#deck-dialog [data-close]").click(); return snapshot;
        }
        const original = await inventory(fled);
        assert.equal(original.filter(card => card.dimmed).length, 0, "avoided cards remain unresolved");
        const unknown = fled.deck.length - fled.knownBottom.length;
        assert.deepEqual(await inventory({ ...fled, deck: [...fled.deck.slice(0, unknown).reverse(), ...fled.deck.slice(unknown)] }), original, "inventory never reveals unseen order");
        const card = page.locator(".encounter").first(); await page.waitForTimeout(1100);
        const bounds = await card.boundingBox(); await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height * .2);
        await page.waitForFunction(() => document.querySelector(".encounter.is-tilting")?.style.getPropertyValue("--tilt-y"));
        assert.ok((await card.evaluate(el => getComputedStyle(el).transform)).startsWith("matrix3d"));
        await page.emulateMedia({ reducedMotion: "reduce" });
        assert.equal(await card.evaluate(el => el.style.getPropertyValue("--tilt-y")), "");
        assert.equal(await card.evaluate(el => getComputedStyle(el).transform), "none");
        assert.deepEqual(errors, []);
        console.log(`${name}: inventory states, public-information boundary, orientation, artwork, tilt and automatic 100k search reuse passed${process.env.SCOUNDREL_COMPLETE_SEARCH === "1" ? " (100k completed while hidden)" : ""}`);
      } finally { await browser.close(); }
    }
  } finally { await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
