const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async function lastMoveUX(browser, base, out, browserName) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    serviceWorkers: "block",
  });
  const page = await context.newPage(),
    screenshots = [],
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(base + "/backgammon/play/");
    await page.locator("#start-match").waitFor();
    await page.evaluate(async () => {
      const { shell, DraftBoard, button } =
        await import("/backgammon/ui/shell.mjs");
      const r = await import("/backgammon/core/rules.mjs");
      const { lastMove } = await import("/backgammon/core/play-session.mjs");
      const { applyBoardTheme } =
        await import("/backgammon/core/appearance.mjs");
      const { saveSettings } = await import("/backgammon/core/storage.mjs");
      const ui = shell("play", "Last turn"),
        d = new DraftBoard(ui.board);
      window.ghostTest = { r, lastMove, applyBoardTheme, saveSettings, d };
      document.querySelector("#actions").append(
        button(
          "Roll",
          () => {
            d.lastMove = null;
            const next = r.transition(
              d.state,
              { type: "roll", dice: [2, 4] },
              d.state.turn,
            );
            d.set(next, r.legalPaths(next));
          },
          "primary",
        ),
      );
    });
    for (const kind of [
      "chain",
      "doubles",
      "bar-hit",
      "bearoff",
      "tall",
      "pass",
    ])
      for (const orientation of [0, 1]) {
        const result = await page.evaluate(
          ({ kind, orientation }) => {
            const { r, lastMove, d, saveSettings, applyBoardTheme } = ghostTest;
            saveSettings({ orientation, motion: "reduce" });
            applyBoardTheme({
              preset: orientation ? "linen" : "slate",
              version: 1,
              colors: {},
              patterns: {},
            });
            let initial = r.initialState({ phase: "move", dice: [3, 1] }),
              steps;
            if (kind === "chain")
              steps = r
                .legalPaths(initial)
                .find((p) => p.steps[0].to === p.steps[1].from).steps;
            if (kind === "doubles") {
              initial.dice = [1, 1];
              steps = Array.from({ length: 4 }, () => ({
                from: 5,
                to: 4,
                die: 1,
              }));
            }
            if (kind === "tall") {
              initial.points = Array(24).fill(0);
              initial.points[12] = 15;
              initial.points[23] = -15;
              initial.dice = [1, 1];
              steps = Array.from({ length: 4 }, () => ({
                from: 12,
                to: 11,
                die: 1,
              }));
            }
            if (kind === "bar-hit") {
              initial.points = Array(24).fill(0);
              initial.points[5] = 14;
              initial.points[23] = -1;
              initial.points[18] = -14;
              initial.bar = [1, 0];
              initial.dice = [1, 2];
              steps = [
                { from: "bar", to: 23, die: 1 },
                { from: 23, to: 21, die: 2 },
              ];
            }
            if (kind === "bearoff") {
              initial.points = Array(24).fill(0);
              initial.points[0] = 3;
              initial.points[23] = -15;
              initial.off = [12, 0];
              initial.dice = [2, 1];
              steps = r.legalPaths(initial)[0].steps;
            }
            if (kind === "pass") {
              initial.points = Array(24).fill(0);
              initial.points[5] = 14;
              initial.points[23] = -2;
              initial.points[22] = -2;
              initial.points[18] = -11;
              initial.bar = [1, 0];
              initial.dice = [1, 2];
              steps = [];
            }
            const action = { type: "move", steps },
              state = r.transition(initial, action, 0);
            const game = { initial, state, events: [{ actor: 0, action }] };
            const markers = lastMove(game);
            d.lastMove = markers;
            d.set(state, []);
            return { markers, dice: initial.dice, state };
          },
          { kind, orientation },
        );
        assert.equal(await page.locator(".last-roll .board-die").count(), 2);
        assert.deepEqual(
          await page
            .locator(".last-roll .board-die")
            .evaluateAll((ns) => ns.map((n) => Number(n.dataset.die))),
          result.dice,
        );
        assert.equal(await page.locator(".last-roll [role=button]").count(), 0);
        assert.equal(
          await page
            .locator(".last-move-ghost")
            .evaluateAll((ns) =>
              ns.reduce((n, g) => n + Number(g.dataset.ghostCount), 0),
            ),
          Object.values(result.markers.origins).reduce(
            (n, o) => n + o.count,
            0,
          ),
        );
        for (const key of Object.keys(result.markers.origins))
          assert.match(
            await page
              .locator(`[data-point="${key === "bar" ? "bar0" : key}"]`)
              .getAttribute("aria-label"),
            /previous location/,
          );
        for (const viewport of kind === "chain"
          ? [
              [320, 568],
              [375, 667],
              [390, 844],
              [844, 390],
              [1366, 768],
            ]
          : [[390, 844]]) {
          await page.setViewportSize({
            width: viewport[0],
            height: viewport[1],
          });
          const file = `${browserName}-last-move-${kind}-${orientation}-${viewport.join("x")}.png`;
          await page.screenshot({
            path: path.join(out, file),
            animations: "disabled",
            fullPage: true,
          });
          screenshots.push(file);
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
          );
        }
        await page.getByRole("button", { name: "Roll", exact: true }).click();
        assert.equal(
          await page
            .locator(".last-move-ghost,.last-roll,.last-moved-checker")
            .count(),
          0,
        );
        assert.deepEqual(
          await page.evaluate(() => ghostTest.d.state.dice),
          [2, 4],
        );
      }
    assert.deepEqual(errors, []);
    return { browser: browserName, cases: 12, screenshots };
  } finally {
    await context.close();
  }
};
