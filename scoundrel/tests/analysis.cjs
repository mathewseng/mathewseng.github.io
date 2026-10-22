// Actual Web Worker budget, cancellation, shared EVs and tied recommendation UI.
const assert = require("node:assert/strict"), path = require("node:path"), fs = require("node:fs");
const { chromium } = require("playwright"), { launchQuietBrowser } = require("../../scripts/quiet-browser.cjs");
const { serveSite, settle } = require("../../scripts/site-pages.cjs"), E = require("../engine.js");
(async () => {
  const server = await serveSite(path.resolve(process.env.SCOUNDREL_SITE || "_site")), browser = await launchQuietBrowser(chromium);
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    await context.addInitScript(() => {
      const RealWorker = window.Worker;
      window.Worker = class extends RealWorker {
        constructor(...args) { super(...args); this.addEventListener("message", ({ data }) => { window.latestAnalysis = data; }); }
        postMessage(message, ...args) { window.latestRequest = message; return super.postMessage(message, ...args); }
      };
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(server.base + "/scoundrel/?seed=analysis-100k"); await settle(page);
    const shortSearch = E.createGame({ seed: "short-100k" });
    shortSearch.room = ["2s", "2c", "3h", "4h"].map(E.card); shortSearch.deck = [E.card("5d")];
    shortSearch.discard = E.makeDeck().filter(card => !["2s", "2c", "3h", "4h", "5d"].includes(card.id));
    await page.evaluate(state => localStorage.setItem("scoundrel-run-v1", JSON.stringify(state)), shortSearch);
    await page.goto(server.base + "/scoundrel/"); await settle(page);
    await page.locator("#oracle-toggle").check();
    await page.locator("#deepen-button").click();
    await page.waitForFunction(() => window.latestRequest?.deep && window.latestAnalysis?.requestId === window.latestRequest.requestId && window.latestAnalysis.pending === false, null, { timeout: 120000 });
    const completed = await page.evaluate(() => window.latestAnalysis);
    assert.equal(completed.simulations, 100000); assert.equal(completed.target, 100000);
    assert.ok((await page.locator("#search-progress").innerText()).includes("100,000 simulations · complete"));
    assert.equal(await page.locator("#deepen-button").isDisabled(), true);
    const scores = (await page.locator("#action-values .value-cell").allTextContents()).map(value => Number(value.replaceAll(",", "")));
    assert.ok(scores.every((value, i) => !i || scores[i - 1] >= value));
    const output = process.env.SCOUNDREL_SCREENSHOTS;
    if (output) { fs.mkdirSync(output, { recursive: true }); await page.locator("#oracle-panel").screenshot({ path: path.join(output, "analysis-100k.png") }); }

    const equivalent = E.createGame({ seed: "equivalent-ui" });
    equivalent.room = [E.card("2h"), E.card("8h"), E.card("9h"), null]; equivalent.deck = [];
    equivalent.weapon = E.card("6d");
    equivalent.discard = E.makeDeck().filter(card => !["2h", "8h", "9h", "6d"].includes(card.id));
    equivalent.health = 12; equivalent.potionUsed = true; equivalent.resolved = 1;
    await page.evaluate(state => localStorage.setItem("scoundrel-run-v1", JSON.stringify(state)), equivalent);
    await page.goto(server.base + "/scoundrel/");
    await page.waitForFunction(() => window.latestAnalysis?.pending === false);
    const potions = (await page.evaluate(() => window.latestAnalysis.results)).filter(row => row.action.type === "drink");
    assert.equal(new Set(potions.map(row => row.equivalence)).size, 1);
    assert.equal(new Set(potions.map(row => row.score)).size, 1);
    assert.equal(await page.locator('.encounter[data-kind="potion"].is-best').count(), 3);
    assert.equal(await page.locator('.encounter .best-ribbon').count(), 3, "one ribbon per best card");
    assert.ok((await page.locator("#oracle-summary").innerText()).includes(" or "));
    if (output) await page.screenshot({ path: path.join(output, "analysis-equal-moves.png"), fullPage: true });

    // Empty-deck avoidance redraws the four cards immediately in preview order.
    const emptyDeck = { ...equivalent, room: ["2h", "8h", "9h", "6d"].map(E.card), weapon: null, resolved: 0, potionUsed: false };
    await page.evaluate(state => localStorage.setItem("scoundrel-run-v1", JSON.stringify(state)), emptyDeck);
    await page.reload(); await settle(page);
    await page.locator("#flee-button").click();
    assert.ok((await page.locator("#avoid-description").innerText()).includes("drawn again immediately"));
    await page.locator('[data-avoid="right"]').click();
    const returned = E.restore(await page.evaluate(() => localStorage.getItem("scoundrel-run-v1")));
    assert.deepEqual(returned.room.map(card => card.id), emptyDeck.room.map(card => card.id).reverse());

    // An action during a deep search starts a fresh worker/request immediately.
    await page.goto(server.base + "/scoundrel/?seed=cancel-100k"); await settle(page);
    await page.locator("#deepen-button").click();
    const request = await page.evaluate(() => window.latestRequest.requestId);
    await page.locator(".encounter").first().click(); await page.locator("[data-action]").first().click();
    await page.waitForFunction(previous => window.latestRequest?.requestId > previous && window.latestAnalysis?.requestId === window.latestRequest.requestId && !window.latestAnalysis.pending, request);
    assert.equal(await page.evaluate(() => window.latestRequest.deep), false);
    assert.deepEqual(errors, []);
    console.log("Analysis browser checks passed: full 100k worker search, EV sorting, equivalent best choices, empty-deck order and cancellation.");
  } finally { await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
