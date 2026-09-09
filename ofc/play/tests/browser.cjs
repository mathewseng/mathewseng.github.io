const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const base = process.env.OFC_TEST_URL || "http://localhost:8000/ofc/play/";
const errors = [];
const rowPlan = [["top", "top", "top", "middle", "middle"], ["middle", "middle"], ["middle", "bottom"], ["bottom", "bottom"], ["bottom", "bottom"]];

async function pageFor(context, hash = "") {
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + hash);
  return page;
}

async function create(page, name) {
  await page.locator("#player-name").fill(name);
  await page.locator("#connect-button").click();
  await page.locator("#room-view").waitFor({ state: "visible", timeout: 30000 });
  return page.locator("#room-code-display").innerText();
}

async function join(page, code, name) {
  await page.locator("#mode-join").click();
  await page.locator("#room-code").fill(base + "#" + code);
  await page.locator("#player-name").fill(name);
  await page.locator("#connect-button").click();
  await page.locator("#room-view").waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll("#roster .roster-player:not(.empty)").length >= 2);
}

async function model(host, code) {
  return host.evaluate((code) => JSON.parse(localStorage.getItem("ofc.play.host." + code)), code);
}

async function placeTurn(page, state) {
  const action = state.actionQueue[state.actionIndex];
  const player = state.players.find((p) => p.id === state.activePlayerId);
  const first = player.draw[0];
  await page.locator('#draw-cards [data-card-id="' + first + '"]').waitFor({ state: "visible" });
  for (const [index, row] of rowPlan[action.round].entries()) {
    await page.locator('#player-board [data-row="' + row + '"] .row-label').click();
    await page.locator('#draw-cards [data-card-id="' + player.draw[index] + '"]').click();
  }
  assert.equal(await page.locator("#draw-cards .hand-slot").count(), player.draw.length, "hand positions stay fixed");
  assert.equal(await page.locator("#confirm-turn-button").isEnabled(), true);
  await page.locator("#confirm-turn-button").click();
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  try {
    // Shared storage deliberately reproduces the previous same-browser join failure.
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const host = await pageFor(context);
    await host.locator('label:has(input[name="variant"][value="progressive"])').click();
    assert.equal(await host.locator("#ultimate-row").isVisible(), true);
    await host.locator("#ultimate-row").click();
    assert.equal(await host.locator("#ultimate").isChecked(), true);
    await host.locator('label:has(input[name="variant"][value="high"])').click();
    assert.equal(await host.locator("#ultimate-row").isVisible(), false);
    assert.equal(await host.locator('input[name="fantasyMode"][value="none"]').isChecked(), true);
    await host.locator('label:has(input[name="variant"][value="dealerschoice"])').click();
    await host.locator('label:has(input[name="seats"][value="2btn"])').click();
    await host.locator('label:has(input[name="dealerChoice"][value="cribbage"])').click();
    await host.screenshot({ path: "/tmp/ofc-setup-desktop.png", fullPage: true });
    const code = await create(host, "Ada");
    const guest = await pageFor(context);
    await join(guest, code, "Ben");
    assert.match(await host.locator("#roster").innerText(), /Ada/);
    assert.match(await guest.locator("#roster").innerText(), /Ada/);
    console.log("PASS same-browser create/join with distinct players");
    const hostSession = await host.evaluate(() => JSON.parse(sessionStorage.getItem("ofc.play.session.v1")));
    const guestSession = await guest.evaluate(() => JSON.parse(sessionStorage.getItem("ofc.play.session.v1")));
    assert.notEqual(hostSession.clientId, guestSession.clientId);
    assert.equal(hostSession.isHost, true);
    assert.equal(guestSession.isHost, false);
    const third = await pageFor(await browser.newContext());
    await third.locator("#mode-join").click();
    await third.locator("#room-code").fill(code);
    await third.locator("#connect-button").click();
    await third.waitForFunction(() => document.querySelector("#setup-error").textContent.includes("full"));
    assert.equal(await third.locator("#room-view").isVisible(), false);
    console.log("PASS full room rejects join without entering lobby");

    await host.locator("#start-button").click();
    await guest.locator("#dealer-selection").waitFor({ state: "visible" });
    assert.equal(await host.locator("#draw-cards .playing-card").count(), 5);
    assert.equal(await guest.locator("#draw-cards .playing-card").count(), 5);
    assert.equal(await host.locator('[data-choice="cribbage"]').count(), 0);
    assert.equal(await guest.locator('[data-choice="high"]').isDisabled(), true);
    await host.screenshot({ path: "/tmp/ofc-choice-desktop.png", fullPage: true });
    await host.locator('[data-choice="high"]').click();
    await guest.locator("#dealer-selection").waitFor({ state: "hidden" });
    let state = await model(host, code);
    const pages = { [state.players[0].id]: host, [state.players[1].id]: guest };
    const firstDraw = state.players.find((p) => p.id === state.activePlayerId).draw;
    const card = guest.locator('#draw-cards [data-card-id="' + firstDraw[0] + '"]');
    await card.waitFor({ state: "visible" });
    await card.scrollIntoViewIfNeeded();
    const source = await card.boundingBox();
    const row = await guest.locator('#player-board [data-row="bottom"]').boundingBox();
    await guest.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await guest.mouse.down();
    await guest.mouse.move(row.x + row.width * 0.8, row.y + row.height / 2, { steps: 4 });
    assert.equal(await guest.locator(".card-drag-ghost").count(), 1);
    assert.equal(await card.evaluate((e) => getComputedStyle(e).visibility), "hidden");
    await guest.mouse.up();
    assert.equal(await guest.locator(".card-drag-ghost").count(), 1, "drop is animated, not snapped");
    await guest.waitForTimeout(300);
    assert.equal(await guest.locator('#player-board [data-row="bottom"] [data-card-id="' + firstDraw[0] + '"]').count(), 1);
    assert.equal(await guest.locator('#draw-cards [data-hand-id="' + firstDraw[0] + '"] .empty-slot').count(), 1);
    const placed = await guest.locator('#player-board [data-card-id="' + firstDraw[0] + '"]').boundingBox();
    const bank = await guest.locator('#draw-cards [data-hand-id="' + firstDraw[0] + '"]').boundingBox();
    await guest.mouse.move(placed.x + placed.width / 2, placed.y + placed.height / 2);
    await guest.mouse.down();
    await guest.mouse.move(bank.x + bank.width / 2, bank.y + bank.height / 2, { steps: 3 });
    await guest.mouse.up();
    await guest.waitForTimeout(300);
    assert.equal(await card.count(), 1, "drag returns to original hand index");
    await guest.keyboard.press("ArrowDown");
    assert.equal(await guest.locator('#player-board [data-row="top"]').getAttribute("aria-label"), "Top, selected");
    await guest.keyboard.press("1");
    assert.equal(await guest.locator('#player-board [data-row="top"] [data-card-id="' + firstDraw[0] + '"]').count(), 1);
    await guest.keyboard.press("1");
    assert.equal(await card.count(), 1, "number shortcut recalls placed card");
    await guest.keyboard.press("c");
    await guest.setViewportSize({ width: 390, height: 844 });
    await card.scrollIntoViewIfNeeded();
    const touchCard = await card.boundingBox();
    const touchRow = await guest.locator('#player-board [data-row="middle"]').boundingBox();
    const touch = await context.newCDPSession(guest);
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: touchCard.x + 15, y: touchCard.y + 20, id: 1 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: touchRow.x + touchRow.width / 2, y: touchRow.y + 30, id: 1 }] });
    assert.equal(await guest.locator(".card-drag-ghost").count(), 1);
    await guest.screenshot({ path: "/tmp/ofc-touch-drag.png" });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await guest.waitForTimeout(300);
    assert.equal(await guest.locator('#player-board [data-row="middle"] [data-card-id="' + firstDraw[0] + '"]').count(), 1);
    await guest.keyboard.press("c");
    assert.equal(await guest.locator(".hand-key").first().isVisible(), false);
    await guest.setViewportSize({ width: 1440, height: 900 });
    console.log("PASS animated drag/set/return, fixed indices, and wrapped keyboard controls");
    while (state.phase === "placement") {
      const player = state.players.find((p) => p.id === state.activePlayerId);
      const page = pages[player.ownerId];
      if (state.actionIndex === 1 || state.actionIndex === 2) {
        await page.locator('#draw-cards [data-card-id="' + player.draw[0] + '"]').waitFor({ state: "visible" });
        for (const width of [320, 375, 390, 393, 430, 412]) {
          await page.setViewportSize({ width, height: 844 });
          await page.screenshot({ path: "/tmp/ofc-active-" + state.actionIndex + "-" + width + ".png", fullPage: true });
          const overflow = await page.evaluate(() => Array.from(document.querySelectorAll(".board-cards, .draw-cards")).some((row) => {
            const cards = Array.from(row.children).map((c) => c.getBoundingClientRect());
            const parent = row.getBoundingClientRect();
            return cards.some((c) => c.left < parent.left - 1 || c.right > parent.right + 1);
          }));
          assert.equal(overflow, false, "active card overflow " + width);
        }
        await page.setViewportSize({ width: 1440, height: 900 });
      }
      await placeTurn(page, state);
      await host.waitForFunction(({ code, action }) => JSON.parse(localStorage.getItem("ofc.play.host." + code)).actionIndex !== action, { code, action: state.actionIndex });
      state = await model(host, code);
      if (state.activePlayerId?.endsWith(":second")) {
        await host.waitForFunction(() => document.querySelector("#player-label").textContent.includes("Hand 2"));
        assert.equal(await host.locator("#draw-cards [data-card-id]").count(), state.players[2].draw.length);
      }
    }
    assert.equal(state.handResult.pairResults.length, 2);
    await guest.locator("#showdown-panel").waitFor({ state: "visible" });
    await host.screenshot({ path: "/tmp/ofc-showdown-desktop.png", fullPage: true });
    await host.locator("#discards-button").click();
    assert.equal(await host.locator("#discards-content .playing-card").count(), 8);
    await host.locator('[data-close-dialog="discards-modal"]').click();
    await host.locator("#ledger-button").click();
    await host.locator(".ledger-hand summary").first().click();
    assert.equal(await host.locator(".history-board").count(), 3);
    assert.equal(await host.locator(".history-row").count(), 9);
    await host.screenshot({ path: "/tmp/ofc-ledger-desktop.png", fullPage: true });
    await host.setViewportSize({ width: 390, height: 844 });
    await host.screenshot({ path: "/tmp/ofc-ledger-mobile.png", fullPage: true });
    await host.locator(".history-board").last().scrollIntoViewIfNeeded();
    await host.screenshot({ path: "/tmp/ofc-ledger-history-mobile.png" });
    assert.equal(await host.locator("#ledger-chart").evaluate((canvas) => canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data.some((v) => v > 0)), true);
    await host.locator('[data-close-dialog="ledger-modal"]').click();
    await host.setViewportSize({ width: 1440, height: 900 });
    console.log("PASS private discards, board history, and rendered ledger graphs");
    console.log("PASS complete 15-turn Dealer's Choice / 2 on BTN hand and settlement");
    await guest.reload();
    await guest.locator("#resume-button").click();
    await guest.locator("#showdown-panel").waitFor({ state: "visible", timeout: 30000 });
    console.log("PASS reload/rejoin an active table with current state");
    await host.locator("#next-hand-button").click();
    await guest.locator("#dealer-selection").waitFor({ state: "visible" });
    assert.equal(await guest.locator('[data-choice="low"]').isEnabled(), true);
    assert.equal(await host.locator('[data-choice="low"]').isDisabled(), true);
    console.log("PASS BTN rotation also transfers dealer choice");

    // A second table has three genuinely isolated clients.
    const threeHost = await pageFor(await browser.newContext());
    await threeHost.locator('label:has(input[name="seats"][value="3"])').click();
    const threeCode = await create(threeHost, "Cal");
    const d = await pageFor(await browser.newContext());
    const e = await pageFor(await browser.newContext());
    await join(d, threeCode, "Dee");
    await join(e, threeCode, "Eli");
    await threeHost.locator("#start-button").click();
    await e.locator("#table-view").waitFor({ state: "visible" });
    assert.equal(await e.locator("#score-strip .score-player").count(), 3);
    console.log("PASS isolated three-player create/join/start");
    const formerHostContext = threeHost.context();
    await threeHost.close();
    await d.waitForFunction(() => document.querySelector("#toast").textContent.includes("You are the host"), null, { timeout: 60000 });
    await e.waitForFunction(() => document.querySelector("#network-state").dataset.state === "connected" && !document.querySelector("#table-view").hidden, null, { timeout: 60000 });
    console.log("PASS host migration preserves the game");
    const returningHost = await pageFor(formerHostContext);
    await returningHost.locator("#resume-button").click();
    await returningHost.locator("#table-view").waitFor({ state: "visible", timeout: 30000 });
    console.log("PASS former host rejoins after host migration");

    for (const [width, height] of [[320, 568], [375, 667], [390, 844], [393, 852], [430, 932], [412, 915]]) {
      const mobile = await pageFor(await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }));
      await mobile.locator('label:has(input[name="variant"][value="dealerschoice"])').click();
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "setup overflow " + width);
      await mobile.screenshot({ path: "/tmp/ofc-setup-" + width + ".png", fullPage: true });
      await guest.setViewportSize({ width, height });
      await guest.screenshot({ path: "/tmp/ofc-choice-" + width + ".png", fullPage: true });
      assert.equal(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "table overflow " + width);
      await mobile.close();
    }
    console.log("PASS six phone widths: 320, 375, 390, 393, 430, 412");
    await guest.locator('[data-choice="low"]').click();
    await guest.locator("#dealer-selection").waitFor({ state: "hidden" });
    for (const width of [320, 375, 390, 393, 430, 412]) {
      await guest.setViewportSize({ width, height: 844 });
      await guest.screenshot({ path: "/tmp/ofc-table-" + width + ".png", fullPage: true });
      const overflow = await guest.evaluate(() => Array.from(document.querySelectorAll(".table-view *")).filter((e) => e.getBoundingClientRect().right > innerWidth + 1).map((e) => e.className));
      assert.deepEqual(overflow, [], "table elements overflow " + width);
    }
    assert.deepEqual(errors, [], "browser exceptions");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
