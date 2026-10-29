const assert = require("node:assert/strict"), path = require("node:path");
module.exports = async function cubeHistory(browser, base, out, name) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true,
    reducedMotion: "reduce", serviceWorkers: "block",
  });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const expected = [
    ["", "2", null],
    ["2 → 4", "2", "double"],
    ["Beaver 4 → 8", "4", "redouble"],
    ["Raccoon 8 → 16", "8", "redouble"],
    ["Take 16", "16", "take"],
    ["16 → 32", "16", "double"],
    ["Drop 32 · concede 16", "16", "drop"],
  ].sort();
  const read = () => page.locator('#move-feedback [data-decision-type="cube"]').evaluateAll(rows =>
    rows.map(row => [
      row.querySelector(".history-played")?.textContent ?? "",
      row.querySelector(".history-cube-icon").textContent,
      row.querySelector("[data-cube-icon]")?.dataset.cubeIcon ?? null,
    ]).sort());
  try {
    await page.goto(base + "/backgammon/");
    await page.evaluate(async () => {
      const r = await import("/backgammon/core/rules.mjs"),
        t = await import("/backgammon/core/table.mjs"),
        s = await import("/backgammon/core/storage.mjs");
      const initial = r.initialState({ phase: "roll", matchLength: 0,
        cube: { value: 2, owner: null }, rules: { immediateRedoubles: 2 } });
      let game = { id: "cube-history", started: true, initial, state: initial, events: [],
        names: ["White", "Black"], config: { mode: "local", humanSide: 0,
          matchLength: 0, rules: initial.rules, tutor: true, reviewStrength: "quick" } };
      const play = action => { game = t.playAction(game, action); };
      play({ type: "roll", dice: [3, 1] });
      play({ type: "move", steps: r.legalTurns(game.state)[0].steps });
      for (const type of ["double", "beaver", "raccoon", "take"]) play({ type });
      play({ type: "roll", dice: [4, 2] });
      play({ type: "move", steps: r.legalTurns(game.state)[0].steps });
      play({ type: "double" }); play({ type: "pass" });
      await s.put("work", { id: "play", game, draft: [], positionKey: r.positionKey(game.state) });
    });
    await page.goto(base + "/backgammon/play/#resume=cube-history");
    await page.locator('[data-history-filter="all"]').tap();
    assert.deepEqual(await read(), expected, "queued cube actions use their historical values and action icons");
    assert.equal(await page.locator(".feedback-pending").count(), 9);
    assert.deepEqual(await page.locator('#move-feedback .history-roll').evaluateAll(ns=>ns.map(n=>n.getAttribute('aria-label')).sort()),
      ['Rolled 3–1','Rolled 4–2'],'rolls remain visible before move analysis completes');
    // Grade the exact stored decisions with real GNUbg, then prove the same
    // presentation survives loading evaluations and opening a review.
    await page.goto(base + "/backgammon/");
    await page.evaluate(async () => {
      const s = await import("/backgammon/core/storage.mjs"),
        h = await import("/backgammon/core/decision-history.mjs"),
        { EngineClient } = await import("/backgammon/engine/client.mjs");
      const saved = await s.get("work", "play"), engine = new EngineClient();
      try {
        for (const row of h.decisionHistory(saved.game)) {
          const result = await engine.analyze(row.source, { preset: "quick",
            submitted: row.action.type === "move" ? row.action.steps : null });
          saved.game.events[row.index].evaluation = h.compactEvaluation(row.source,
            h.gradeDecision(row.source, result, row.action));
        }
        await s.put("work", saved);
      } finally { engine.destroy(); }
    });
    await page.goto(base + "/backgammon/play/#resume=cube-history");
    await page.locator('[data-history-filter="all"]').tap();
    assert.equal(await page.locator(".feedback-review").count(), 9);
    assert.equal(await page.locator('.feedback-review[data-decision-type="cube"][data-played-best="true"] .history-loss').count(),0,'zero-loss cube decisions omit loss');
    assert.deepEqual(await read(), expected);
    for (const [width, height] of [[320, 568], [390, 844], [1366, 900]]) {
      await page.setViewportSize({ width, height });
      await page.locator("#review-heading").scrollIntoViewIfNeeded();
      const clipped = await page.locator(".history-turn, .history-played, .history-kind").evaluateAll(
        nodes => nodes.filter(n => n.scrollWidth > n.clientWidth + 1).map(n => n.textContent));
      assert.deepEqual(clipped, [], `cube actions fit at ${width}px`);
      const paired = await page.locator('.history-turn-decisions[data-paired="true"]').evaluateAll(groups => groups.map(group => {
        const cubes = [...group.querySelectorAll('[data-decision-type="cube"]')].map(n => n.getBoundingClientRect());
        const move = group.querySelector('[data-decision-type="checker"]').getBoundingClientRect();
        return {sameRow: move.y === cubes[0].y, sideBySide: cubes.every(c => c.right <= move.x + 1),
          spansExchange: move.bottom >= cubes.at(-1).bottom - 1,
          proportions: cubes.every(c => Math.abs(move.width - c.width * 2) < 1)};
      }));
      assert.equal(paired.length, 2);
      assert.ok(paired.every(g => g.sameRow && g.sideBySide && g.spansExchange && g.proportions), `checker stays beside its entire cube exchange with twice its width at ${width}px`);
      assert.ok(await page.locator('.decision-value-grid').evaluateAll(groups => groups.every(group => {
        const values = [...group.querySelectorAll('strong')].map(n => n.textContent);
        return new Set(values).size === values.length;
      })), 'summary equities never repeat');
      await page.locator("#move-feedback").screenshot({ path: path.join(out, `${name}-cube-history-${width}.png`) });
    }
    await page.locator('.feedback-review[data-decision-type="cube"]').filter({ hasText: "Take 16" }).tap();
    await page.locator(".decision-dialog").waitFor();
    await page.locator(".decision-dialog .close").tap();
    assert.deepEqual(await read(), expected, "reviewing never changes history values");
    assert.deepEqual(errors, []);
    return { browser: name, realEngine: true, pendingAndEvaluated: true, cubeActions: 7, viewports: 3 };
  } finally { await context.close(); }
};
