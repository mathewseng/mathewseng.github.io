// Scripted grades isolate summary arithmetic/persistence from engine accuracy.
const assert = require("node:assert/strict"), path = require("node:path");
module.exports = async function gameLossSummary(browser, base, out, name) {
  const report = [];
  for (const [layout, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 }, landscape: { width: 844, height: 390 } })) {
    const context = await browser.newContext({ viewport, hasTouch: layout !== "desktop", reducedMotion: "reduce", serviceWorkers: "block" });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const ready = () => page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
    const resume = async () => {
      if (!await page.locator("#resume-match").isVisible()) await page.locator("#panel-toggle").click();
      await page.locator("#resume-match").click();
      const drawer = page.locator("#details-dialog[open]");
      if (await drawer.count()) await page.keyboard.press("Escape");
    };
    try {
      await page.goto(base + "/backgammon/play/"); await ready();
      await page.evaluate(async () => {
        const r = await import("/backgammon/core/rules.mjs");
        const { playAction } = await import("/backgammon/core/table.mjs");
        const { beginDecisionAttempt, recordInitialEvaluation } = await import("/backgammon/core/decision-attempt.mjs");
        const { put, saveSettings } = await import("/backgammon/core/storage.mjs");
        const { localConfig } = await import("/backgammon/core/play-session.mjs");
        const initial = r.initialState({ phase: "roll", matchLength: 0 });
        initial.cube.value = 2;
        let game = { id: "loss-summary", initial, state: initial, started: true, events: [],
          names: ["You", "GNUbg"], config: localConfig({ strength: "quick", reviewStrength: "quick" }) };
        for (const player of [0, 1]) {
          const source = game.state;
          beginDecisionAttempt(game, { type: "double" });
          game = playAction(game, { type: "roll", dice: [4, 1] });
          game.events.at(-1).evaluation = { result: { type: "cube", status: "complete", positionKey: r.positionKey(source),
            settings: { name: "Test", plies: 0 }, units: "current-cube-points", outcomes: [.2, player ? .19 : .17, 1] } };
          const state = game.state, turns = r.legalTurns(state);
          const first = { type: "move", steps: turns[0].steps }, accepted = { type: "move", steps: turns[1].steps };
          const grade = (action, loss) => ({ result: { type: "checker", status: "complete", positionKey: r.positionKey(state),
            settings: { name: "Test", plies: 0 }, units: "current-cube-points",
            candidates: [{ equity: .2, steps: turns[1].steps }], actual: { equity: .2 - loss, steps: action.steps } } });
          beginDecisionAttempt(game, first);
          recordInitialEvaluation(game, first, grade(first, player ? .04 : .06));
          game = playAction(game, accepted);
          game.events.at(-1).evaluation = grade(accepted, player ? .02 : .01);
        }
        game = playAction(game, { type: "resign", level: 1 });
        game = playAction(game, { type: "accept" });
        saveSettings({ analysisAhead: false, equityBar: false, motion: "reduce" });
        await put("work", { id: "play", game, draft: [] });
      });
      await page.reload(); await ready(); await resume();
      const card = page.getByRole("region", { name: "Game result", exact: true });
      await card.waitFor();
      const value = (player, kind, stage) => card.locator(`[data-summary-player="${player}"] [data-loss-kind="${kind}"] [data-stage="${stage}"]`);
      assert.equal((await value(0, "checker", "initial").innerText()).trim(), "0.120\n0.120 / move");
      assert.equal((await value(0, "checker", "accepted").innerText()).trim(), "0.020\n0.020 / move");
      assert.equal((await value(0, "cube", "initial").innerText()).trim(), "0.060\n1 mistake");
      assert.equal((await value(0, "cube", "accepted").innerText()).trim(), "0.000\n0 mistakes");
      assert.equal(await value(1, "checker", "initial").locator("strong").innerText(), "0.080");
      const bounds = await card.evaluate(node => {
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom,
          overflow: node.scrollWidth > node.clientWidth + 1, height: box.height };
      });
      assert.ok(bounds.left >= 0 && bounds.right <= viewport.width + 1, `${layout}: horizontal fit ${JSON.stringify(bounds)}`);
      assert.equal(bounds.overflow, false);
      assert.ok(bounds.height <= viewport.height * .8 + 1);
      await card.locator("summary").scrollIntoViewIfNeeded();
      await card.locator("summary").click();
      assert.ok(await card.locator("details").evaluate(node => node.open));
      assert.match(await card.innerText(), /0.002/);
      await card.locator("summary").click();
      await page.screenshot({ path: path.join(out, `${name}-game-loss-summary-${layout}.png`), fullPage: true });
      // A pending original grade updates in place when background review finishes,
      // without changing the accepted grade or the game/score.
      await page.evaluate(async () => {
        const { get, put } = await import("/backgammon/core/storage.mjs");
        const work = await get("work", "play");
        delete work.game.events[1].initialDecision.evaluation;
        await put("work", work);
      });
      await page.reload(); await ready();
      await page.evaluate(async () => {
        const { EngineClient } = await import("/backgammon/engine/client.mjs");
        const { positionKey } = await import("/backgammon/core/rules.mjs");
        EngineClient.prototype.analyze = (state, options) => new Promise(resolve => {
          window.completeSummaryGrade = () => resolve({ type: "checker", status: "complete", positionKey: positionKey(state),
            settings: { name: "Test", plies: 0 }, units: "current-cube-points",
            candidates: [{ equity: .2, steps: [] }], actual: { equity: .14, steps: options.submitted } });
        });
      });
      await resume();
      await page.waitForFunction(() => typeof window.completeSummaryGrade === "function");
      assert.match(await value(0, "checker", "initial").innerText(), /1 pending/);
      await page.evaluate(() => window.completeSummaryGrade());
      await page.waitForFunction(() => document.querySelector('[data-summary-player="0"] [data-loss-kind="checker"] [data-stage="initial"] strong')?.textContent === "0.120");
      assert.equal(await value(0, "checker", "accepted").locator("strong").innerText(), "0.020");
      const archived = await page.evaluate(async () => (await (await import("/backgammon/core/storage.mjs")).get("items", "loss-summary")));
      assert.ok(archived.events[1].initialDecision.evaluation, "background initial grade is archived as well as saved to play");
      assert.deepEqual(errors, []);
      report.push({ layout, bounds, initialAndAccepted: true, liveUpdate: true });
    } catch (error) {
      await page.screenshot({ path: path.join(out, `${name}-game-loss-summary-${layout}-failure.png`), fullPage: true });
      throw error;
    } finally { await context.close(); }
  }
  return report;
};
