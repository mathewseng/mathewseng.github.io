const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async function repeatPlay(browser, base, out, name) {
  const errors = [];
  for (const touch of [false, true]) {
    const context = await browser.newContext({
      viewport: touch
        ? { width: 390, height: 844 }
        : { width: 1366, height: 768 },
      hasTouch: touch,
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await page.goto(base + "/backgammon/");
      await page.evaluate(async () => {
        const { shell, DraftBoard } =
          await import("/backgammon/ui/shell.mjs");
        const r = await import("/backgammon/core/rules.mjs");
        const ui = shell("trainer", "Point input");
        window.repeatTest = { r, d: new DraftBoard(ui.board) };
      });
      const reset = async (dice) =>
        page.evaluate((dice) => {
          const { r, d } = repeatTest;
          const s = r.initialState({ phase: "move", dice });
          d.set(s, r.legalPaths(s));
        }, dice);
      const tap = async (p) => {
        const pos = await page.evaluate((p) => {
          const g = document.querySelector(`[data-point="${p}"]`),
            hit = g.querySelector(".point-hit");
          const x = Number(hit.getAttribute("x")) + 30,
            y = p >= 12 ? 54 : 606;
          const pos = new DOMPoint(x, y).matrixTransform(
            document.querySelector(".bg-board").getScreenCTM(),
          );
          return { x: pos.x, y: pos.y };
        }, p);
        if (touch) await page.touchscreen.tap(pos.x, pos.y);
        else await page.mouse.click(pos.x, pos.y);
      };
      const read = () =>
        page.evaluate(() => ({
          draft: repeatTest.d.draft,
          selected: repeatTest.d.selected,
          points: repeatTest.d.current().points,
        }));
      await reset([3, 1]);
      await tap(4); // First tap hits an empty point, next tap hits the arriving checker.
      await tap(4);
      assert.deepEqual(
        (await read()).draft.map((s) => [s.from, s.to, s.die]),
        [
          [5, 4, 1],
          [7, 4, 3],
        ],
      );
      assert.equal((await read()).points[4], 2);
      await tap(4); // Triple-tap after the roll is used must not reverse it.
      assert.equal((await read()).draft.length, 2);
      await reset([3, 1]);
      await page.locator('[data-point="4"]').focus();
      await page.keyboard.down("Shift");
      await page.keyboard.down("Enter");
      await page.keyboard.down("Enter"); // Native key-repeat is not another press.
      assert.equal((await read()).draft.length, 1);
      await page.keyboard.up("Enter");
      await page.keyboard.up("Shift");
      await page.keyboard.press("Shift+Enter");
      assert.equal((await read()).points[4], 2);
      await reset([2, 2]);
      for (let i = 0; i < 4; i++) await tap(3);
      assert.equal((await read()).points[3], 4);
      assert.equal((await read()).draft.length, 4);
      await reset([3, 1]);
      await tap(4);
      await page.waitForTimeout(420);
      await tap(4);
      assert.equal(
        (await read()).draft.length,
        1,
        "paused tap must not auto-play the sole forward move",
      );
      assert.equal((await read()).selected, 4);
      const highlight = await page.evaluate(() => {
        const options = repeatTest.d.board.renderOptions;
        return {
          expected: [
            ...new Set(repeatTest.d.routes().map((r) => r.to)),
          ].sort(),
          actual: [
            ...new Set([
              ...options.reachable,
              ...options.reverseTargets,
              ...options.destinations,
            ]),
          ].sort(),
          rings: [...document.querySelectorAll(".source-ring")].map(
            (n) => n.closest("[data-point]").dataset.point,
          ),
        };
      });
      assert.deepEqual(highlight.actual, highlight.expected);
      assert.deepEqual(highlight.rings, ["4"]);
      await page.screenshot({
        path: path.join(
          out,
          `${name}-repeat-${touch ? "touch" : "mouse"}-selected.png`,
        ),
      });
      await reset([4, 3]);
      await tap(12);
      assert.equal((await read()).selected, 12);
      assert.ok(
        await page.evaluate(() => {
          const allowed = new Set(
            repeatTest.d.routes().map((r) => String(r.to)),
          );
          return [
            ...document.querySelectorAll(
              ".point.reachable,.point.destination,.point.return-destination",
            ),
          ].every((n) => allowed.has(n.dataset.point));
        }),
      );
      // An unrelated drafted checker's undo target is hidden while one is selected.
      await reset([3, 1]);
      await page.evaluate(() => {
        const d = repeatTest.d;
        d.move({ from: 5, to: 4, die: 1 });
        d.move({ from: 12, to: 9, die: 3 });
        d.selected = 4;
        d.render();
      });
      assert.equal(
        await page.locator('[data-point="5"].return-destination').count(),
        1,
      );
      assert.equal(
        await page.locator('[data-point="12"].return-destination').count(),
        0,
      );
      // Actual Play keyboard wiring, with a recoverable legal local fixture.
      const id = await page.evaluate(async () => {
        const r = await import("/backgammon/core/rules.mjs"),
          st = await import("/backgammon/core/storage.mjs");
        const state = r.initialState({
            phase: "move",
            dice: [3, 1],
            matchLength: 0,
          }),
          id = crypto.randomUUID();
        await st.put("work", {
          id: "play",
          game: {
            id,
            initial: state,
            state,
            events: [],
            started: true,
            names: ["Ivory", "Teal"],
            config: {
              mode: "local",
              humanSide: 0,
              matchLength: 0,
              rules: state.rules,
            },
          },
          draft: [],
          positionKey: r.positionKey(state),
        });
        return id;
      });
      await page.goto(base + "/backgammon/play/#resume=" + id);
      await page.locator("#confirm").waitFor();
      await page.keyboard.press("i");
      await page.keyboard.press("i");
      await page.waitForFunction(
        () => document.querySelectorAll(".board-die.consumed").length === 2,
      );
      assert.equal(
        await page.locator('[data-point="4"] .checker').count(),
        2,
      );
      await page.keyboard.press("i");
      assert.equal(
        await page.locator('[data-point="4"] .checker').count(),
        2,
      );
      await page.keyboard.press("x");
      await page.keyboard.press("i");
      await page.waitForTimeout(420);
      await page.keyboard.press("i");
      assert.equal(await page.locator(".board-die.consumed").count(), 1);
      assert.equal(
        await page.locator(".point.selected").getAttribute("data-point"),
        "4",
      );
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
  return {
    browser: name,
    cases: [
      "mouse and touch: repeated destination builds a point; four taps use doubles",
      "paused arrival selects without auto-moving; surplus rapid taps do not undo",
      "selected checker owns every move highlight and source ring",
      "actual Play point keys repeat and respect pause/reset",
    ],
  };
};
