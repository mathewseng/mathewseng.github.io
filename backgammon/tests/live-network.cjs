// Optional live PeerJS smoke test. Requires real internet/signaling; never mocked.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const base = process.env.BG_BASE_URL || "http://127.0.0.1:8765";
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  try {
    const hc = await browser.newContext(),
      gc = await browser.newContext();
    let host = await hc.newPage();
    const guest = await gc.newPage();
    const log = [];
    await hc.addInitScript(() => {
      const original = crypto.getRandomValues.bind(crypto),
        dice = [5, 0, 3, 1, 2, 0];
      crypto.getRandomValues = (a) =>
        a instanceof Uint8Array && a.length === 1 && dice.length
          ? ((a[0] = dice.shift()), a)
          : original(a);
    });
    async function open(p) {
      p.on("pageerror", (e) => log.push(e.message));
      await p.goto(base + "/backgammon/play/");
      await p.getByRole("button", { name: "Online", exact: true }).click();
    }
    await open(host);
    await open(guest);
    const optionalRules = process.env.BG_MONEY_RULES === "1";
    if (optionalRules) {
      await host
        .getByLabel("Match length", { exact: true })
        .selectOption("0");
      await host.locator(".game-rules summary").click();
      await host
        .getByLabel("Automatic opening doubles", { exact: true })
        .selectOption("1");
      await host
        .getByLabel("Immediate redoubles", { exact: true })
        .selectOption("2");
    }
    await host.locator("#player-name").fill("Host with a long name");
    await host.locator("#create-room").click();
    await host.waitForFunction(
      () => location.hash.includes("room="),
      {},
      { timeout: 30000 },
    );
    const code = new URLSearchParams(
      (await host.evaluate(() => location.hash)).slice(1),
    ).get("room");
    const snapshot = (p) =>
      p.evaluate(
        (code) =>
          JSON.parse(localStorage.getItem("backgammon.v1.room." + code)),
        code,
      );
    await guest.locator("#player-name").fill("Guest");
    await guest.locator("#room-code").fill(code);
    await guest.locator("#join-room").click();
    await host.waitForFunction(
      () =>
        document.querySelector("#start-room") &&
        !document.querySelector("#start-room").disabled,
      {},
      { timeout: 30000 },
    );
    await host.locator("#start-room").click();
    do {
      await host.locator("#roll").click();
      await host.waitForTimeout(150);
    } while ((await snapshot(host)).state.phase === "opening");
    await Promise.all([
      host.locator("#begin-turn").click(),
      guest.locator("#begin-turn").click(),
    ]);
    let s = await snapshot(host);
    const openingState = structuredClone(s.state);
    const actor = s.state.turn === 0 ? host : guest;
    while (await actor.locator("#confirm").isDisabled()) {
      await actor
        .locator("#draft-controls select")
        .selectOption({ index: 1 });
    }
    await actor.locator("#confirm").click();
    await host.waitForTimeout(200);
    s = await snapshot(host);
    const other = actor === host ? guest : host;
    const until = async (predicate) => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const a = await snapshot(host),
          b = await snapshot(guest);
        if (predicate(a, b)) return a;
        await host.waitForTimeout(30);
      }
      throw new Error("Online undo did not synchronize");
    };
    await actor.locator("#undo-turn").click();
    await other.locator("#decline-undo").click();
    await until(
      (a, b) =>
        !a.undoRequest && !b.undoRequest && a.undoReply?.accepted === false,
    );
    assert.deepEqual((await snapshot(host)).state, s.state);
    await other.locator("#roll").click();
    const rolled = await until(
      (a, b) => a.state.phase === "move" && b.state.phase === "move",
    );
    const retainedDice = rolled.state.dice;
    await actor.locator("#undo-turn").click();
    await other.locator("#accept-undo").waitFor();
    await other.setViewportSize({ width: 375, height: 667 });
    await other.screenshot({
      path: "backgammon/test-results/live-undo-request.png",
      fullPage: true,
    });
    await other.locator("#accept-undo").click();
    s = await until(
      (a, b) => a.undoLog?.length === 1 && b.undoLog?.length === 1,
    );
    assert.deepEqual(s.state, openingState);
    assert.deepEqual((await snapshot(guest)).state, openingState);
    assert.deepEqual(s.replayDice, [
      { actor: 1 - openingState.turn, dice: retainedDice },
    ]);
    await other.setViewportSize({ width: 1366, height: 768 });
    while (await actor.locator("#confirm").isDisabled())
      await actor
        .locator("#draft-controls select")
        .selectOption({ index: 1 });
    await actor.locator("#confirm").click();
    s = await until(
      (a, b) => a.state.phase === "roll" && b.state.phase === "roll",
    );
    const doubler = s.state.turn === 0 ? host : guest,
      receiver = s.state.turn === 0 ? guest : host;
    await doubler
      .getByRole("button", { name: "Double", exact: true })
      .click();
    const stake = s.state.cube.value;
    if (optionalRules) {
      await receiver
        .getByRole("button", {
          name: `Beaver to ${stake * 4}`,
          exact: true,
        })
        .click();
      await doubler
        .getByRole("button", {
          name: `Raccoon to ${stake * 8}`,
          exact: true,
        })
        .click();
    }
    await receiver
      .getByRole("button", {
        name: `Take ${stake * (optionalRules ? 8 : 2)}`,
        exact: true,
      })
      .click();
    await host.waitForTimeout(200);
    assert.equal(
      (await snapshot(host)).state.cube.value,
      stake * (optionalRules ? 8 : 2),
    );
    await guest.reload();
    await guest
      .getByRole("button", { name: "Online", exact: true })
      .click();
    await guest
      .getByRole("button", { name: "Reconnect saved room", exact: true })
      .click();
    await guest.waitForTimeout(1000);
    assert.deepEqual(
      (await snapshot(host)).state,
      (await snapshot(guest)).state,
    );
    // An extra participant cannot take an occupied seat.
    const overflow = await browser.newPage();
    await open(overflow);
    await overflow.locator("#room-code").fill(code);
    await overflow.locator("#join-room").click();
    await overflow.waitForFunction(
      () => document.querySelector("#toast").textContent.includes("full"),
      {},
      { timeout: 30000 },
    );
    await overflow.close();
    // Duplicate-tab resume is rejected instead of stealing the active identity.
    const duplicate = await hc.newPage();
    await open(duplicate);
    await duplicate
      .getByRole("button", { name: "Reconnect saved room", exact: true })
      .click();
    await duplicate.waitForFunction(
      () =>
        document
          .querySelector("#toast")
          .textContent.includes("already connected"),
      {},
      { timeout: 30000 },
    );
    await duplicate.close();
    // Commit a roll before killing the host; those dice must survive recovery.
    s = await snapshot(host);
    const roller = s.state.turn === 0 ? host : guest;
    await roller.locator("#roll").click();
    await host.waitForTimeout(300);
    const before = (await snapshot(host)).state;
    assert.deepEqual(
      before.dice,
      retainedDice,
      "the undone roll is actually reused",
    );
    await host.close();
    await guest.waitForFunction(
      () =>
        document
          .querySelector("#message")
          .textContent.includes("confirmation required"),
      {},
      { timeout: 45000 },
    );
    await guest.screenshot({ path: "/tmp/backgammon-live-disconnect.png" });
    host = await hc.newPage();
    await open(host);
    await host
      .getByRole("button", { name: "Reconnect saved room", exact: true })
      .click();
    await host
      .getByRole("button", { name: "Confirm recovery", exact: true })
      .waitFor({ timeout: 30000 });
    await host
      .getByRole("button", { name: "Confirm recovery", exact: true })
      .click();
    await host.waitForTimeout(500);
    assert.deepEqual((await snapshot(host)).state, before);
    assert.deepEqual((await snapshot(guest)).state, before);
    assert.equal((await snapshot(guest)).recovery, null);
    await guest.screenshot({ path: "/tmp/backgammon-live-recovered.png" });
    console.log(
      JSON.stringify(
        {
          network: "live PeerJS",
          room: code,
          createJoin: true,
          synchronizedTurn: true,
          undoDeclined: true,
          undoAccepted: true,
          revealedDiceReused: true,
          cubeTake: true,
          optionalRules,
          refreshRejoin: true,
          roomFull: true,
          duplicateTab: true,
          hostMigration: true,
          committedDicePreserved: true,
          pageErrors: log,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
