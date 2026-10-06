// Real engine, persisted sessions, production board and layout regressions.
const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async function decisionUX(
  browser,
  base,
  out,
  browserName,
) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    serviceWorkers: "block",
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage(),
    errors = [],
    screenshots = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = async (name) => {
    const file = `${browserName}-decisions-${name}.png`;
    await page.screenshot({ path: path.join(out, file), fullPage: true });
    screenshots.push(file);
  };
  try {
    await page.goto(base + "/backgammon/");
    const id = await page.evaluate(async () => {
      const r = await import("/backgammon/core/rules.mjs"),
        st = await import("/backgammon/core/storage.mjs");
      const initial = r.initialState({
        phase: "move",
        dice: [4, 3],
        matchLength: 0,
      });
      const id = crypto.randomUUID();
      st.saveSettings({ boardTheme: { preset: "plum" }, motion: "reduce" });
      await st.put("work", {
        id: "play",
        game: {
          id,
          initial,
          state: initial,
          events: [],
          started: true,
          names: ["You", "Friend"],
          config: {
            mode: "local",
            humanSide: 0,
            strength: "quick",
            matchLength: 0,
            rules: initial.rules,
          },
        },
        draft: [],
        positionKey: r.positionKey(initial),
      });
      return id;
    });
    await page.goto(base + "/backgammon/play/#resume=" + id);
    await page.locator('[data-point="12"]').click();
    await shot("selected-point");
    assert.equal(
      await page.locator('[data-point="5"] .source-ring').count(), 0,
      "selecting another checker hides unrelated source rings",
    );
    assert.equal(await page.locator('[data-point="12"] .source-ring').count(), 1);
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
      // Wait for the app's media-query listener to apply its desktop table layout.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const before = await page.locator("#board").boundingBox();
      // Actual content may grow arbitrarily. Only the secondary region should scroll.
      await page.evaluate(() => {
        const n = document.createElement("p");
        n.id = "layout-stress";
        n.textContent = "Long decision history. ".repeat(250);
        document.querySelector(".action-area").append(n);
      });
      const after = await page.locator("#board").boundingBox();
      assert.deepEqual(after, before, `fixed board ${width}x${height}`);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.evaluate(() =>
        document.querySelector("#layout-stress").remove(),
      );
      if (width === 844) {
        await page.locator("#panel-toggle").click();
        await page
          .getByLabel("Accessible move selection", { exact: true })
          .waitFor();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Close", exact: true })
          .click();
        assert.deepEqual(
          await page.locator("#board").boundingBox(),
          before,
        );
      }
      if ([375, 844, 1366].includes(width))
        await shot(`selected-${width}x${height}`);
    }
    // Point-tip quick play uses the nearest legal source with no prior selection.
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.keyboard.press("Escape");
    assert.ok(await page.locator(".point.reachable").count());
    const tip = await page
      .locator('[data-point="9"] .point-hit')
      .boundingBox();
    await page.mouse.click(tip.x + tip.width / 2, tip.y + 8);
    let quick = await page.evaluate(
      async () =>
        (
          await (
            await import("/backgammon/core/storage.mjs")
          ).get("work", "play")
        ).draft,
    );
    assert.deepEqual(
      quick.map((s) => [s.from, s.to, s.die]),
      [[12, 9, 3]],
    );
    assert.ok(await page.locator(".point.reachable").count());
    await page.locator("#undo").click();
    await page.locator('[data-point="8"]').focus();
    await page.keyboard.press("Shift+Enter");
    quick = await page.evaluate(
      async () =>
        (
          await (
            await import("/backgammon/core/storage.mjs")
          ).get("work", "play")
        ).draft,
    );
    assert.deepEqual(
      quick.map((s) => [s.from, s.to, s.die]),
      [[12, 8, 4]],
    );
    await page.locator("#undo").click();
    const touchTip = await page
      .locator('[data-point="9"] .point-hit')
      .boundingBox();
    await page.touchscreen.tap(
      touchTip.x + touchTip.width / 2,
      touchTip.y + 8,
    );
    const touchDraft = await page.evaluate(
      async () =>
        (
          await (
            await import("/backgammon/core/storage.mjs")
          ).get("work", "play")
        ).draft,
    );
    assert.deepEqual(
      touchDraft.map((s) => [s.from, s.to, s.die]),
      [[12, 9, 3]],
    );
    await shot("quick-play");
    // A real cube response finishes a game and is saved with its original context.
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(base + "/backgammon/");
    const cubeId = await page.evaluate(async () => {
      const r = await import("/backgammon/core/rules.mjs"),
        st = await import("/backgammon/core/storage.mjs");
      const initial = r.initialState({ phase: "roll", matchLength: 0 });
      const action = { type: "double" },
        state = r.transition(initial, action, 0),
        id = crypto.randomUUID();
      const game = {
        id,
        initial,
        state,
        events: [{ actor: 0, action }],
        started: true,
        names: ["GNUbg", "You"],
        config: {
          mode: "computer",
          humanSide: 1,
          strength: "quick",
          tutor: true,
          warning: false,
          matchLength: 0,
          rules: state.rules,
        },
      };
      await st.put("work", {
        id: "play",
        game,
        draft: [],
        positionKey: r.positionKey(state),
      });
      return id;
    });
    await page.goto(base + "/backgammon/play/#resume=" + cubeId);
    await shot("cube-response");
    await page.getByRole("button", { name: "Pass", exact: true }).click();
    await page.locator("#game-review").waitFor({ timeout: 60000 });
    const persisted = await page.evaluate(
      async () =>
        (
          await (
            await import("/backgammon/core/storage.mjs")
          ).get("work", "play")
        ).game,
    );
    const grade = persisted.events.at(-1).evaluation.result;
    assert.equal(grade.type, "cube");
    assert.equal(grade.actualDecision, "pass");
    assert.equal(grade.decision.player, 1);
    assert.ok(Number.isFinite(grade.error));
    await page.locator("#review-feedback").click();
    await page.getByRole("table").waitFor();
    assert.match(
      await page.getByRole("table").innerText(),
      /Before[\s\S]*Best choice/,
    );
    assert.equal(
      (await page.getByRole("table").innerText()).includes("Your choice"),
      Math.abs(grade.decision.best.equity - grade.decision.actual.equity) > 1e-7,
    );
    await shot("cube-comparison");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await page.locator("#game-review").click();
    await shot("game-review");
    await page.locator("#analyze-session").click();
    await page.waitForFunction(() =>
      document
        .querySelector('.session-review [role="status"]')
        .textContent.includes("Completed"),
    );
    await page.waitForFunction(
      () =>
        document.querySelector("#analyze-session").textContent ===
        "Analyze unreviewed decisions",
    );
    assert.match(
      await page.locator(".session-totals").innerText(),
      /0 unreviewed/,
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await page.goto(base + "/backgammon/library/#games");
    await page
      .getByRole("button", { name: "Open GNUbg vs You", exact: true })
      .click();
    await shot("session-library");
    await page.locator("#review-decisions").click();
    assert.match(
      await page.locator(".session-totals").innerText(),
      /1 evaluated · 0 unreviewed/,
    );
    await shot("saved-review");
    // Imported/exported backup retains evaluations, and live autosave retains review additions.
    const checked = await page.evaluate(async (id) => {
      const st = await import("/backgammon/core/storage.mjs");
      const item = await st.get("items", id),
        work = await st.get("work", "play");
      const count = item.events.filter((e) => e.evaluation).length;
      await st.saveMatchHistory(
        {
          ...work.game,
          events: work.game.events.map(({ evaluation, ...e }) => e),
        },
        work.game.names,
        "computer",
      );
      const after = await st.get("items", id);
      const backup = st.parseBackup(await st.backup(true));
      return {
        count,
        after: after.events.filter((e) => e.evaluation).length,
        exported: backup.items
          .find((i) => i.id === id)
          .events.filter((e) => e.evaluation).length,
      };
    }, cubeId);
    assert.deepEqual(checked, { count: 2, after: 2, exported: 2 });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await page.goto(base + "/backgammon/");
    const replayData = await page.evaluate(async () => {
      const r = await import("/backgammon/core/rules.mjs"),
        st = await import("/backgammon/core/storage.mjs"),
        { EngineClient } = await import("/backgammon/engine/client.mjs");
      const initial = r.initialState({
          phase: "move",
          dice: [6, 1],
          matchLength: 0,
        }),
        steps = r.legalTurns(initial)[0].steps;
      const engine = new EngineClient();
      const result = await engine.analyze(initial, {
        preset: "quick",
        submitted: steps,
      });
      engine.destroy();
      const action = { type: "move", steps },
        roll = { type: "roll", dice: [4, 2] };
      const state = r.transition(r.transition(initial, action, 0), roll, 1),
        id = crypto.randomUUID();
      await st.put("work", {
        id: "play",
        game: {
          id,
          initial,
          state,
          events: [
            { actor: 0, action, evaluation: { result } },
            { actor: 1, action: roll },
          ],
          started: true,
          names: ["You", "GNUbg"],
          config: {
            mode: "computer",
            humanSide: 0,
            strength: "quick",
            tutor: true,
            warning: false,
            matchLength: 0,
            rules: state.rules,
          },
        },
        draft: [],
        positionKey: r.positionKey(state),
      });
      return { id, best: result.candidates[0].steps };
    });
    await page.goto(base + "/backgammon/play/#resume=" + replayData.id);
    const waitGame = async (predicate) => {
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        const game = await page.evaluate(
          async () =>
            (
              await (
                await import("/backgammon/core/storage.mjs")
              ).get("work", "play")
            ).game,
        );
        if (predicate(game)) return game;
        await page.waitForTimeout(30);
      }
      throw new Error("Timed out waiting for committed game");
    };
    await waitGame((g) => g.state.turn === 0 && g.state.phase === "roll");
    await page.locator("#review-feedback").click();
    await page.locator("#undo-play-best").click();
    const replayed = await waitGame(
      (g) =>
        g.undoLog?.length === 1 &&
        g.events.length >= 3 &&
        g.state.turn === 0 &&
        g.state.phase === "roll",
    );
    assert.deepEqual(replayed.events[0].action.steps, replayData.best);
    assert.equal(replayed.events[0].evaluation.result.error, 0);
    assert.deepEqual(
      replayed.events.find((e) => e.action.type === "roll")?.action.dice,
      [4, 2],
      JSON.stringify({
        events: replayed.events.map((e) => e.action),
        state: replayed.state,
        replay: replayed.replayDice,
      }),
    );
    assert.deepEqual(replayed.undoLog[0].events[1].action.dice, [4, 2]);
    await shot("undo-play-best");
    await page.evaluate(() => {
      const original = crypto.getRandomValues.bind(crypto),
        dice = [5, 0];
      crypto.getRandomValues = (a) =>
        a instanceof Uint8Array && a.length === 1 && dice.length
          ? ((a[0] = dice.shift()), a)
          : original(a);
    });
    await page.locator("#roll").click();
    await page.locator("#hint").waitFor({ timeout: 60000 });
    await page.locator("#hint").click();
    await page.locator("#undo-play-best").waitFor({ timeout: 60000 });
    const priorCount = (await waitGame((g) => g.state.phase === "move"))
      .events.length;
    await page.locator("#undo-play-best").click();
    const hinted = await waitGame((g) => g.events.length > priorCount);
    assert.equal(hinted.events[priorCount].action.type, "move");
    assert.deepEqual(
      hinted.events[priorCount].action.steps,
      hinted.events[priorCount].evaluation.result.candidates[0].steps,
    );

    assert.deepEqual(errors, []);
    return {
      browser: browserName,
      screenshots,
      cases: [
        "uncluttered selected point and tall destination stack",
        "nearest legal point-tip shortcut using mouse, touch and Shift+Enter",
        "undo and play best in hints and committed reviews, preserving the bot roll",
        "fixed board across nine viewports and long history",
        "real cube feedback and before/actual/best comparison",
        "completed game review and progressive analysis",
        "session library, export and autosave preserve grades",
      ],
    };
  } finally {
    await context.close();
  }
};
