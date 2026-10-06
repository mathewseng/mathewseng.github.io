const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async function historyReturn(browser, base, out, name) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const saved = () =>
    page.evaluate(
      async () =>
        (
          await (
            await import("/backgammon/core/storage.mjs")
          ).get("work", "play")
        ).game,
    );
  try {
    await page.goto(base + "/backgammon/play/");
    assert.equal(await page.locator("#undo-turn").isVisible(), true);
    assert.equal(await page.locator("#undo-turn").isDisabled(), true);
    await page.goto(base + "/backgammon/");
    const fixture = await page.evaluate(async () => {
      const r = await import("/backgammon/core/rules.mjs"),
        t = await import("/backgammon/core/table.mjs"),
        st = await import("/backgammon/core/storage.mjs");
      const { EngineClient } =
        await import("/backgammon/engine/client.mjs");
      const { compactEvaluation } =
        await import("/backgammon/core/decision-history.mjs");
      const engine = new EngineClient();
      const initial = r.initialState({ matchLength: 0 });
      let game = {
        id: crypto.randomUUID(),
        initial,
        state: initial,
        events: [],
        started: true,
        names: ["You", "GNUbg"],
        config: {
          mode: "computer",
          humanSide: 0,
          strength: "quick",
          reviewStrength: "quick",
          tutor: true,
          matchLength: 0,
          rules: initial.rules,
        },
      };
      game = t.playAction(game, { type: "opening", dice: [6, 1] }, 0);
      const sources = [];
      try {
        for (let player = 0; player < 2; player++) {
          if (player)
            game = t.playAction(game, { type: "roll", dice: [4, 3] });
          const source = r.clone(game.state),
            steps = r.legalTurns(source)[0].steps;
          sources.push(source);
          const result = await engine.analyze(source, {
            preset: "quick",
            submitted: steps,
          });
          game = t.playAction(game, { type: "move", steps });
          game.events.at(-1).evaluation = compactEvaluation(source, result);
        }
      } finally {
        engine.destroy();
      }
      await st.put("work", {
        id: "play",
        game,
        draft: [],
        positionKey: r.positionKey(game.state),
      });
      return { id: game.id, sources, events: game.events };
    });
    await page.goto(base + "/backgammon/play/#resume=" + fixture.id);
    await page.locator("#roll").waitFor();
    for (const side of ["self", "opponent"])
      assert.ok(
        await page
          .locator(`#move-feedback [data-history-side="${side}"]`)
          .count(),
      );
    await page
      .locator('#move-feedback .feedback-review[data-history-side="self"]')
      .click();
    assert.equal(await page.locator("#undo-play-best").count(), 1);
    for (const [width, height] of [
      [320, 568],
      [375, 667],
      [390, 844],
      [430, 932],
      [844, 390],
      [768, 1024],
      [1024, 768],
      [1366, 768],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(50);
      const fits = await page.getByRole("dialog").evaluate((d) => ({
        w: d.scrollWidth <= d.clientWidth + 1,
        h: d.scrollHeight <= d.clientHeight + 1,
        bottom: d.querySelector("#return-position").getBoundingClientRect()
          .bottom,
      }));
      assert.ok(
        fits.w && fits.h && fits.bottom <= height,
        JSON.stringify({ width, height, fits }),
      );
    }
    await page.screenshot({
      path: path.join(out, `${name}-history-return-actions.png`),
    });
    await page.keyboard.press("Escape");
    await page
      .locator(
        '#move-feedback .feedback-review[data-history-side="opponent"]',
      )
      .click();
    await page.locator("#return-position").waitFor();
    await page.screenshot({
      path: path.join(out, `${name}-history-return-desktop.png`),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(out, `${name}-history-return-phone.png`),
    });
    await page.locator("#return-position").click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await page.waitForFunction(() => document.querySelector("#confirm"));
    let game = await saved();
    assert.deepEqual(game.state, fixture.sources[1]);
    assert.equal(game.config.humanSide, 1); // Restored opponent decision is immediately playable.
    assert.equal(game.undoLog.at(-1).reason, "history-return");
    assert.deepEqual(game.undoLog.at(-1).events, fixture.events.slice(3));
    assert.equal(await page.locator("#undo-turn").isVisible(), true);
    await page.reload();
    await page.locator("#confirm").waitFor();
    assert.deepEqual((await saved()).state, fixture.sources[1]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("#review-session").click();
    await page
      .locator(".session-decisions")
      .getByRole("button", { name: "Return to this position" })
      .first()
      .click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    game = await saved();
    assert.deepEqual(game.state, fixture.sources[0]);
    assert.equal(game.config.humanSide, 0);
    assert.equal(game.undoLog.length, 2);
    assert.deepEqual(errors, []);
    return {
      browser: name,
      cases: [
        "always visible undo; player history colors; real-engine decision review return",
        "opponent-side control; original dice/state; archived branch; reload; session timeline return",
      ],
    };
  } catch (e) {
    console.error(await page.locator("body").innerText());
    console.error(errors);
    throw e;
  } finally {
    await context.close();
  }
};
