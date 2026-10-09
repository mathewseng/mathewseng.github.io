const assert = require("node:assert/strict"),
  path = require("node:path");
module.exports = async function historyTreeUX(browser, base, out, name) {
  const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      hasTouch: true,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const read = () =>
    page.evaluate(
      async () =>
        await (
          await import("/backgammon/core/storage.mjs")
        ).get("work", "play"),
    );
  try {
    await page.goto(base + "/backgammon/");
    const fixture = await page.evaluate(async () => {
      const r = await import("/backgammon/core/rules.mjs"),
        t = await import("/backgammon/core/table.mjs"),
        p = await import("/backgammon/core/practice.mjs"),
        st = await import("/backgammon/core/storage.mjs"),
        h = await import("/backgammon/core/history-tree.mjs");
      const initial = r.initialState({
          phase: "move",
          dice: [3, 1],
          matchLength: 0,
        }),
        turns = r.legalTurns(initial);
      let a = {
        id: crypto.randomUUID(),
        initial,
        state: initial,
        events: [],
        started: true,
        names: ["You", "Opponent"],
        config: {
          mode: "local",
          humanSide: 0,
          matchLength: 0,
          rules: initial.rules,
        },
      };
      a = t.playAction(a, { type: "move", steps: turns[0].steps });
      for (let i = 0; i < 12 && a.state.phase !== "over"; i++) {
        a = t.playAction(a, { type: "roll", dice: [3, 1] });
        if (a.state.phase === "move")
          a = t.playAction(a, {
            type: "move",
            steps: r.legalTurns(a.state)[0].steps,
          });
      }
      let b = p.returnToDecision(a, 0, initial);
      b = t.playAction(b, { type: "move", steps: turns.at(-1).steps });
      const tree = h.historyTree(b),
        old = tree.nodes.find((n) => n.depth === 2 && !n.active);
      st.saveSettings({ motion: "reduce", orientation: 0 });
      await st.put("work", {
        id: "play",
        game: b,
        draft: [],
        positionKey: r.positionKey(b.state),
      });
      return {
        id: b.id,
        current: b.events,
        old: old.id,
        oldState: old.state,
        nodes: tree.nodes.length,
      };
    });
    await page.goto(base + "/backgammon/play/#resume=" + fixture.id);
    await page.locator("#roll").waitFor();
    assert.ok(await page.locator("#undo-turn").isEnabled());
    const initial = JSON.stringify((await read()).game);
    await page.keyboard.press("z");
    await page.keyboard.press("z");
    assert.equal(
      JSON.stringify((await read()).game),
      initial,
      "Z cannot undo a committed turn in roll phase",
    );
    await page.evaluate(async () => {
      const st = await import("/backgammon/core/storage.mjs"),
        r = await import("/backgammon/core/rules.mjs"),
        t = await import("/backgammon/core/table.mjs"),
        w = await st.get("work", "play");
      w.game = t.playAction(w.game, { type: "roll", dice: [3, 1] });
      w.positionKey = r.positionKey(w.game.state);
      w.draft = [];
      await st.put("work", w);
    });
    await page.reload();
    await page.locator("#confirm").waitFor();
    const rolled = await read();
    await page.keyboard.press("z");
    assert.deepEqual(
      (await read()).game.events,
      rolled.game.events,
      "Z with an empty draft cannot fall back to last turn",
    );
    const step = await page.evaluate(async () => {
      const w = await (
          await import("/backgammon/core/storage.mjs")
        ).get("work", "play"),
        r = await import("/backgammon/core/rules.mjs");
      return r.nextSteps(r.legalPaths(w.game.state), w.draft)[0];
    });
    await page
      .locator(`[data-point="${step.from}"] .checker > circle`)
      .first()
      .click();
    await page.locator(`[data-point="${step.to}"] .point-number-hit`).click();
    const moved = await read();
    assert.ok(moved.draft.length > rolled.draft.length);
    await page.keyboard.press("z");
    assert.ok((await read()).draft.length < moved.draft.length);
    assert.deepEqual((await read()).game.events, rolled.game.events);
    // Remapping undo keeps its draft-only semantics.
    await page.evaluate(async () => {
      const st = await import("/backgammon/core/storage.mjs");
      st.saveSettings({
        shortcuts: { ...st.settings().shortcuts, undo: ["j"] },
      });
    });
    await page.keyboard.press("j");
    assert.deepEqual((await read()).game.events, rolled.game.events);
    const oldNode = await page.evaluate(async (expected) => {
      const w = await (
          await import("/backgammon/core/storage.mjs")
        ).get("work", "play"),
        h = await import("/backgammon/core/history-tree.mjs");
      return h
        .historyTree(w.game)
        .nodes.find(
          (n) =>
            !n.active &&
            h.historyStateKey(n.state) === h.historyStateKey(expected),
        ).id;
    }, fixture.oldState);
    await page.locator("#history-tree").click();
    await page.locator(".history-dialog").waitFor();
    const unchanged = JSON.stringify(await read());
    const sizes = [
      [320, 568],
      [375, 667],
      [390, 844],
      [430, 932],
      [844, 390],
      [768, 1024],
      [1024, 768],
      [1366, 768],
      [1440, 900],
    ];
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(70);
      const d = page.locator(".history-dialog");
      await d.getByRole("button", { name: "Tree", exact: true }).click();
      await d
        .getByRole("button", { name: "Current position", exact: true })
        .click();
      const fit = await d.evaluate((d) => {
        const l = d.querySelector(".history-tree-list"),
          p = d.querySelector(".history-tree-pager");
        return {
          overflow:
            d.scrollHeight > d.clientHeight + 1 ||
            d.scrollWidth > d.clientWidth + 1,
          rows: l.lastElementChild?.getBoundingClientRect().bottom,
          pager: p.getBoundingClientRect().top,
        };
      });
      assert.ok(
        !fit.overflow && fit.rows <= fit.pager + 1,
        JSON.stringify({ width, height, fit }),
      );
      await d.locator('[role="treeitem"]').first().click();
      await d.getByRole("button", { name: "Board", exact: true }).click();
      assert.ok(await d.locator(".bg-board").isVisible());
      assert.equal(
        JSON.stringify(await read()),
        unchanged,
        "preview never mutates live game or draft",
      );
      await page.screenshot({
        path: path.join(out, `${name}-tree-board-${width}.png`),
      });
      await d.getByRole("button", { name: "Tree", exact: true }).click();
      await page.screenshot({
        path: path.join(out, `${name}-tree-${width}.png`),
      });
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(70);
    const d = page.locator(".history-dialog");
    await d
      .getByRole("button", { name: "Current position", exact: true })
      .click();
    const first = d.locator('[role="treeitem"]').first();
    await first.click(); await first.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowLeft");
    assert.equal(await d.locator('[role="treeitem"]').count(), 1);
    await page.keyboard.press("ArrowRight");
    assert.ok(await d.locator('[role="treeitem"]').count() > 1);
    await page.keyboard.press("ArrowDown");
    assert.notEqual(await d.locator('[aria-selected="true"]').getAttribute("data-history-node"), "0");
    // Traverse pages and restore a position in the abandoned branch.
    while (!(await d.locator(`[data-history-node="${oldNode}"]`).count()))
      await d.getByRole("button", { name: "Next page", exact: true }).click();
    await d.locator(`[data-history-node="${oldNode}"]`).click();
    await d.locator("#history-return").click();
    await d.waitFor({ state: "detached" });
    const restored = await read();
    assert.deepEqual(restored.game.state, fixture.oldState);
    assert.equal(restored.game.undoLog.length, 2);
    await page.reload();
    await page.locator("#history-tree").click();
    const count = await page.evaluate(async () => {
      const w = await (
        await import("/backgammon/core/storage.mjs")
      ).get("work", "play");
      return (await import("/backgammon/core/history-tree.mjs")).historyTree(
        w.game,
      ).nodes.length;
    });
    assert.ok(count >= fixture.nodes, "reload retains both continuations");
    await page.keyboard.press("Escape");
    await page.goto(base + "/backgammon/library/#games");
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".library-item").length ||
        document.querySelector("#library-history-tree"),
    );
    // Library item layout uses the existing list; select the saved match by text.
    await page.locator(".library-item").first().click();
    await page.locator("#library-history-tree").click();
    assert.ok(await page.locator(".history-dialog").isVisible());
    assert.equal(await page.locator("#history-return").count(), 0);
    assert.deepEqual(errors, []);
    return {
      browser: name,
      viewports: sizes.length,
      previewIsolated: true,
      restoresBranches: true,
      undoDraftOnly: true,
    };
  } finally {
    await context.close();
  }
};
