const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async function autoReviewUX(browser, base, out, name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block" });
  const page = await context.newPage(), errors = [];
  const waitFor = async (predicate, arg) => {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (await page.evaluate(predicate, arg)) return;
      await page.waitForTimeout(80);
    }
    throw new Error("Timed out waiting for saved analysis");
  };
  page.on("pageerror", e => errors.push(e.message));
  try {
    await page.goto(base + "/backgammon/play/");
    const fixture = await page.evaluate(async () => {
      const r = await import("/backgammon/core/rules.mjs"), t = await import("/backgammon/core/table.mjs"), s = await import("/backgammon/core/storage.mjs");
      const initial = r.initialState({ phase: "roll", matchLength: 0 });
      let game = { id: "auto-review-real", started: true, names: ["You", "GNUbg"], initial, state: initial, events: [],
        config: { mode: "computer", humanSide: 0, matchLength: 0, rules: initial.rules, strength: "quick", reviewStrength: "quick", tutor: false, warning: false } };
      for (let p = 0; p < 2; p++) {
        game = t.playAction(game, { type: "roll", dice: [3, 1] });
        game = t.playAction(game, { type: "move", steps: r.legalTurns(game.state)[0].steps });
      }
      game = t.playAction(game, { type: "roll", dice: [4, 2] });
      await s.put("work", { id: "play", game, positionKey: r.positionKey(game.state), draft: [] });
      return { state: game.state, events: game.events.map(e => ({ actor: e.actor, action: e.action })) };
    });
    await page.goto(base + "/backgammon/play/#resume=auto-review-real");
    await page.reload();
    await page.locator("#confirm").waitFor();
    await waitFor(async () => {
      const s = await import("/backgammon/core/storage.mjs"), h = await import("/backgammon/core/decision-history.mjs");
      const w = await s.get("work", "play");
      return w?.game.id === "auto-review-real" && h.decisionHistory(w.game).every(r => r.feedback);
    });
    const saved = () => page.evaluate(async () => (await import("/backgammon/core/storage.mjs")).get("work", "play"));
    const reviewed = await saved();
    assert.deepEqual(reviewed.game.state, fixture.state);
    assert.deepEqual(reviewed.game.events.map(e => ({actor: e.actor, action: e.action})), fixture.events);
    assert.equal(reviewed.game.config.tutor, false);
    const grades = reviewed.game.events.filter(e => e.evaluation);
    assert.ok(grades.some(e => e.actor === 0 && e.action.type === "move"), JSON.stringify(reviewed.game.events));
    assert.ok(grades.some(e => e.actor === 1 && e.action.type === "move"));
    assert.ok(grades.some(e => e.evaluation.result.type === "cube"));
    // A new native confirmation with feedback off is also graded after play.
    for (let i = 0; i < 4 && await page.locator("#confirm").isDisabled(); i++)
      await page.getByLabel("Accessible move selection", {exact: true}).selectOption({index: 1});
    const nextIndex = reviewed.game.events.length;
    await page.locator("#confirm").click();
    await waitFor(async index => {
      const w = await (await import("/backgammon/core/storage.mjs")).get("work", "play");
      return w?.game.events[index]?.evaluation?.result?.actual;
    }, nextIndex);
    // Revealing feedback displays the real grade, without needing another move.
    await page.locator("#panel-toggle").click();
    await page.locator("#details-dialog [data-move-feedback]").check();
    await page.locator("#details-dialog").getByRole("button", {name: "Close", exact: true}).click();
    await page.locator('#move-feedback [data-history-side="self"].feedback-review').first().waitFor();
    await page.locator("#move-feedback").scrollIntoViewIfNeeded();
    await page.screenshot({path: path.join(out, `${name}-auto-review-phone.png`)});
    await page.setViewportSize({width: 1366, height: 768});
    await page.locator("#move-feedback").scrollIntoViewIfNeeded();
    assert.ok((await page.locator("#move-feedback").boundingBox()).width > 700, "desktop analysis retains its main column");
    await page.screenshot({path: path.join(out, `${name}-auto-review-desktop.png`)});
    await page.reload();
    const reloaded = await saved();
    assert.ok(reloaded.game.events[nextIndex].evaluation.result.actual);
    const archived = await page.evaluate(async () => (await import("/backgammon/core/storage.mjs")).get("items", "auto-review-real"));
    assert.ok(archived.events[nextIndex].evaluation.result.actual);
    assert.deepEqual(errors, []);
    return {browser: name, feedbackOff: true, bothPlayers: true, cube: true, nativeConfirm: true, persisted: true};
  } finally { await context.close(); }
};
