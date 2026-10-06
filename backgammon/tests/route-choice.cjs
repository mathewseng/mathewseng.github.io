const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async function routeChoice(browser, base, out, name) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(base + "/backgammon/");
    await page.evaluate(async () => {
      const { shell, DraftBoard } =
        await import("/backgammon/ui/shell.mjs");
      const r = await import("/backgammon/core/rules.mjs");
      window.routeTest = {
        d: new DraftBoard(shell("trainer", "Combined move").board),
        r,
      };
    });
    const reset = (blots, turn = 0) =>
      page.evaluate(
        ({ blots, turn }) => {
          const { d, r } = routeTest,
            points = Array(24).fill(0);
          points[12] = 15;
          points[23] = -(15 - blots.length);
          for (const p of blots) points[p] = -1;
          const state = r.initialState({
            phase: "move",
            dice: [5, 2],
            turn,
            points: turn ? points.reverse().map((n) => -n) : points,
          });
          d.set(state, r.legalPaths(state));
        },
        { blots, turn },
      );
    const tap = async (p) => {
      await page.locator(`[data-point="${p}"]`).focus();
      await page.keyboard.press("Enter");
    };
    const read = () =>
      page.evaluate(() => ({
        draft: routeTest.d.draft,
        state: routeTest.d.current(),
      }));
    for (const turn of [0, 1]) {
      const from = turn ? 11 : 12,
        to = turn ? 18 : 5;
      for (const blots of [[], [7], [10], [5]]) {
        await reset(blots, turn);
        await tap(from);
        await tap(to);
        assert.equal(await page.getByRole("dialog").count(), 0);
        const { draft, state } = await read();
        assert.equal(draft.length, 2);
        assert.equal(state.bar[1 - turn], blots.length ? 1 : 0);
      }
      await reset([7, 10], turn);
      await tap(from);
      await tap(to);
      await page.getByRole("dialog", { name: "Choose a route" }).waitFor();
      assert.equal((await read()).draft.length, 0);
      if (!turn) {
        await page.screenshot({
          path: path.join(out, `${name}-route-genuine-choice.png`),
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
          path: path.join(out, `${name}-route-genuine-choice-phone.png`),
        });
        await page.setViewportSize({ width: 1366, height: 768 });
      }
      await page
        .getByRole("dialog")
        .locator("footer button")
        .first()
        .click();
      assert.equal((await read()).state.bar[1 - turn], 1);
    }
    // The preference does not remove a deliberate non-hitting intermediate step.
    await reset([7]);
    await tap(12);
    await tap(10);
    await tap(5);
    assert.equal((await read()).state.bar[1], 0);
    assert.deepEqual(
      (await read()).draft.map((s) => s.die),
      [2, 5],
    );
    // Real pointer drag uses the same hitting-route preference.
    await reset([7]);
    const from = await page
      .locator('[data-point="12"] .checker')
      .first()
      .boundingBox();
    const target = await page
      .locator('[data-point="5"] .point-hit')
      .boundingBox();
    await page.mouse.move(
      from.x + from.width / 2,
      from.y + from.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      target.x + target.width / 2,
      target.y + target.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal((await read()).state.bar[1], 1);
    assert.equal((await read()).draft.length, 2);
    assert.deepEqual(errors, []);
    return {
      browser: name,
      cases: [
        "quiet and single-hit routes play immediately in both directions",
        "different hits prompt; identical final hit does not",
        "manual non-hit path remains available; drag and keyboard share preference",
      ],
    };
  } finally {
    await context.close();
  }
};
