const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/origin-return.json")),
);
module.exports = async function originReturns(browser, base, out, name) {
  const cases = [];
  for (const touch of [false, true]) {
    const context = await browser.newContext({
      viewport: touch
        ? { width: 390, height: 844 }
        : { width: 1366, height: 768 },
      hasTouch: touch,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    const page = await context.newPage(),
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
    const wait = async (draft) => {
      await page.waitForFunction(
        async (n) =>
          (
            await (
              await import("/backgammon/core/storage.mjs")
            ).get("work", "play")
          )?.draft.length === n,
        draft.length,
      );
      const w = await read();
      assert.deepEqual(w.draft, draft);
      assert.equal(w.game.events.length, 0);
      await page.waitForTimeout(80);
      assert.deepEqual((await read()).draft, draft);
    };
    const load = async (turn, orientation) => {
      await page.goto(base + "/backgammon/");
      const id = await page.evaluate(
        async ({ fixture, turn, orientation }) => {
          const r = await import("/backgammon/core/rules.mjs"),
            st = await import("/backgammon/core/storage.mjs"),
            s = r.clone(fixture.state),
            p = (n) => (turn ? 23 - n : n);
          if (turn) {
            s.points.reverse();
            s.points = s.points.map((n) => -n);
            s.turn = 1;
            s.bar.reverse();
            s.off.reverse();
          }
          const draft = fixture.draft.map((m) => ({
            ...m,
            from: p(m.from),
            to: p(m.to),
          }));
          st.saveSettings({ orientation, numbers: true, motion: "reduce", boardTheme: { version: 1, preset: "plum", colors: {} } });
          const id = crypto.randomUUID();
          await st.put("work", {
            id: "play",
            game: {
              id,
              initial: s,
              state: s,
              events: [],
              started: true,
              names: ["Ivory", "Teal"],
              config: {
                mode: "local",
                humanSide: turn,
                matchLength: 0,
                rules: s.rules,
              },
            },
            draft,
            positionKey: r.positionKey(s),
          });
          return id;
        },
        { fixture, turn, orientation },
      );
      await page.goto(base + "/backgammon/play/#resume=" + id);
      await page.locator("#confirm").waitFor();
    };
    const coords = (p, disc = false) =>
      page.evaluate(
        ({ p, disc }) => {
          const g = document.querySelector(`[data-point="${p}"]`),
            h = g.querySelector(disc ? ".checker > circle" : ".point-hit");
          const v = new DOMPoint(
            +h.getAttribute(disc ? "cx" : "x") + (disc ? 0 : 30),
            +h.getAttribute(disc ? "cy" : "y") + (disc ? 0 : 130),
          ).matrixTransform(document.querySelector(".bg-board").getScreenCTM());
          return { x: v.x, y: v.y };
        },
        { p, disc },
      );
    const tap = async (p, disc = false) => {
      const v = await coords(p, disc);
      if (touch) await page.touchscreen.tap(v.x, v.y);
      else await page.mouse.click(v.x, v.y);
    };
    try {
      for (const turn of [0, 1])
        for (const orientation of [0, 1]) {
          const p = (n) => (turn ? 23 - n : n),
            original = fixture.draft.map((m) => ({
              ...m,
              from: p(m.from),
              to: p(m.to),
            })),
            revised = [{ from: p(15), to: p(12), die: 3 }];
          await load(turn, orientation);
          await wait(original);
          assert.equal(
            await page
              .locator(`[data-point="${p(15)}"].return-destination`)
              .count(),
            1,
          );
          assert.equal(
            await page
              .locator(`[data-point="${p(10)}"].return-destination`)
              .count(),
            0,
            "11 is an intermediate stop, not an original return",
          );
          assert.equal(
            await page.locator(`[data-point="${p(12)}"].reachable`).count(),
            1,
            "13 is an actionable dice revision without selection",
          );
          const strokes = await page
            .locator(`[data-point="${p(15)}"]`)
            .evaluate((g) =>
              Object.fromEntries(
                ["point-hit", "point-shape", "point-wash"].map((c) => {
                  const s = getComputedStyle(g.querySelector("." + c));
                  return [c, { stroke: s.stroke, dash: s.strokeDasharray }];
                }),
              ),
            );
          assert.equal(strokes["point-hit"].stroke, "none");
          assert.equal(strokes["point-shape"].stroke, "none");
          assert.notEqual(strokes["point-wash"].stroke, "none");
          assert.equal(strokes["point-wash"].dash, "none");
          if (!turn && !orientation)
            await page.screenshot({
              path: path.join(
                out,
                `${name}-origin-${touch ? "touch" : "mouse"}-unselected.png`,
              ),
            });
          await tap(p(12));
          await wait(revised); // Open space above the existing 13-point stack.
          assert.equal(await page.locator(".board-die.consumed").count(), 1);
          assert.equal(await page.locator("#confirm").isDisabled(), true);
          await page.reload();
          await page.locator("#confirm").waitFor();
          await wait(revised);
          await page.locator("#reset-draft").click();
          await wait([]);
          await load(turn, orientation);
          await tap(p(7), true); // Select the actual moved checker at 8.
          assert.equal(
            await page.locator(`[data-point="${p(12)}"].destination`).count(),
            1,
          );
          assert.equal(
            await page.locator(`[data-point="${p(10)}"].destination`).count(),
            0,
          );
          if (!turn && !orientation)
            await page.screenshot({
              path: path.join(
                out,
                `${name}-origin-${touch ? "touch" : "mouse"}-selected.png`,
              ),
            });
          await tap(p(15));
          await wait([]); // Orange returns the entire 16/11/8 chain.
          await load(turn, orientation);
          await tap(p(10));
          await wait(original); // Unhighlighted intermediate point is quiet.
          await page.locator("#undo").click();
          await wait(original.slice(0, 1)); // Stepwise Undo is still available.
          if (!touch) {
            await load(turn, orientation);
            const a = await coords(p(7), true),
              b = await coords(p(12));
            await page.mouse.move(a.x, a.y);
            await page.mouse.down();
            await page.mouse.move(b.x, b.y, { steps: 8 });
            await page.mouse.up();
            await wait(revised);
            await load(turn, orientation);
            const key = await page.evaluate(
              async ({ point, orientation }) => {
                const k = await import("/backgammon/core/shortcuts.mjs");
                return k.SHORTCUTS.find(
                  (d) =>
                    /^(top|bottom)/.test(d.id) &&
                    k.visiblePoint(d.id, orientation) === point,
                ).keys[0];
              },
              { point: p(12), orientation },
            );
            await page.keyboard.press("Shift+" + key);
            await wait(revised);
          }
          cases.push({ touch, turn, orientation });
        }
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  return { browser: name, cases };
};
