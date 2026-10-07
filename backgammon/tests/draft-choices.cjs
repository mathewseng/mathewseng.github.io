// Actual Play controller, native hit regions, persisted draft and committed events.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/doubles-choice.json")),
).state;
module.exports = async function draftChoices(browser, base, out, name) {
  const report = [];
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
      page.evaluate(async () =>
        (await import("/backgammon/core/storage.mjs")).get("work", "play"),
      );
    const settled = async (length) => {
      await page.waitForFunction(async (length) => {
        const w = await (
          await import("/backgammon/core/storage.mjs")
        ).get("work", "play");
        return w?.draft.length === length || w?.game.events.length;
      }, length);
      const w = await read();
      assert.equal(
        w.game.events.length,
        0,
        "A destination click must not commit a roll that had a choice",
      );
      assert.equal(w.game.state.phase, "move");
      assert.equal(w.draft.length, length);
      await page.waitForTimeout(100); // Catch queued refill/commit after undo and settings updates.
      assert.deepEqual(
        (await read()).draft,
        w.draft,
        "draft must remain stable",
      );
      assert.equal((await read()).game.events.length, 0);
      return w;
    };
    const load = async (
      turn,
      orientation,
      { draft = [], autoCommit = false, mode = "local" } = {},
    ) => {
      await page.goto(base + "/backgammon/");
      const id = await page.evaluate(
        async ({ fixture, turn, orientation, draft, autoCommit, mode }) => {
          const r = await import("/backgammon/core/rules.mjs"),
            st = await import("/backgammon/core/storage.mjs");
          const s = r.clone(fixture);
          if (turn) {
            s.points.reverse();
            s.points = s.points.map((n) => -n);
            s.turn = 1;
            s.bar.reverse();
            s.off.reverse();
          }
          r.assertState(s);
          st.saveSettings({ orientation, numbers: true, motion: "reduce" });
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
                mode,
                humanSide: turn,
                tutor: false,
                matchLength: 0,
                strength: "quick",
                rules: s.rules,
              },
            },
            draft,
            positionKey: r.positionKey(s),
            autoCommit,
          });
          return id;
        },
        { fixture, turn, orientation, draft, autoCommit, mode },
      );
      await page.goto(base + "/backgammon/play/#resume=" + id);
      await page.locator("#confirm").waitFor();
      return settled(draft.length || 1);
    };
    const coordinates = (p, region = "space") =>
      page.evaluate(
        ({ p, region }) => {
          const g = document.querySelector(`[data-point="${p}"]`),
            svg = document.querySelector(".bg-board");
          let x, y;
          if (region === "disc") {
            const c = g.querySelector(".checker > circle");
            x = +c.getAttribute("cx");
            y = +c.getAttribute("cy");
          } else {
            const h = g.querySelector(
              region === "number" ? ".point-number-hit" : ".point-hit",
            );
            x = +h.getAttribute("x") + 30;
            y = +h.getAttribute("y") + (region === "number" ? 14 : 130);
          }
          const v = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
          return { x: v.x, y: v.y };
        },
        { p, region },
      );
    const tap = async (p, region = "space") => {
      const pos = await coordinates(p, region);
      if (touch) await page.touchscreen.tap(pos.x, pos.y);
      else await page.mouse.click(pos.x, pos.y);
    };
    try {
      for (const turn of [0, 1])
        for (const orientation of [0, 1]) {
          const p = (n) => (turn ? 23 - n : n);
          const start = await load(turn, orientation);
          assert.deepEqual(
            start.draft,
            [{ from: p(21), to: p(15), die: 6 }],
            "only globally forced first six is previewed",
          );
          const destinations = await page
            .locator(".point.reachable[data-point]")
            .evaluateAll((ns) => ns.map((n) => n.dataset.point));
          for (const n of [15, 9, 3])
            assert.ok(destinations.includes(String(p(n))));
          if (!turn && !orientation)
            await page.screenshot({
              path: path.join(
                out,
                `${name}-doubles-choice-${touch ? "touch" : "mouse"}-initial.png`,
              ),
            });
          await tap(p(12), "disc"); // Blocked resident 13 cannot be selected.
          await tap(p(0)); // An unavailable empty point remains a quiet no-op.
          await settled(1);
          assert.equal(await page.locator(".point.selected").count(), 0);
          await tap(p(3)); // Screenshot: point 4, above its three immovable resident checkers.
          const first = await settled(4);
          assert.equal(await page.locator("#confirm").isEnabled(), true);
          assert.deepEqual(
            first.game.state,
            start.game.state,
            "canonical position/dice remain unchanged until Confirm",
          );
          await page.screenshot({
            path: path.join(
              out,
              `${name}-doubles-choice-${touch ? "touch" : "mouse"}-${turn}-${orientation}.png`,
            ),
          });
          await page.locator("#undo").click();
          await settled(3);
          await page.evaluate(() => dispatchEvent(new Event("bg-settings")));
          await settled(3); // A rerender must not silently reapply the undone suffix.
          await page.reload();
          await page.locator("#confirm").waitFor();
          await settled(3);
          await tap(p(3), "disc");
          await tap(p(9));
          await settled(3); // Neither an intermediate stop nor a forced origin is a return target.
          await page.locator("#undo").click();
          await settled(2); // The separate Undo button can still remove that individual step.
          await page.locator("#reset-draft").click();
          await settled(1);
          await tap(p(15)); // Point-space uses 22/16, then previews the mandatory 16/10.
          await settled(3);
          await tap(p(9)); // Bring the other checker to 10: the other legal final position.
          const alternative = await settled(4);
          if (!turn && !orientation)
            await page.screenshot({
              path: path.join(
                out,
                `${name}-doubles-choice-${touch ? "touch" : "mouse"}-alternative.png`,
              ),
            });
          const keys = await page.evaluate(
            async ({ first, alternative }) => {
              const r = await import("/backgammon/core/rules.mjs");
              return [first, alternative].map((w) =>
                r.boardKey(
                  w.draft.reduce(
                    (s, step) => r.applyStep(s, step),
                    w.game.state,
                  ),
                ),
              );
            },
            { first, alternative },
          );
          assert.notEqual(
            keys[0],
            keys[1],
            "both strategic outcomes remain reachable",
          );
          await page.locator("#confirm").click();
          await page.waitForFunction(
            async () =>
              (
                await (
                  await import("/backgammon/core/storage.mjs")
                ).get("work", "play")
              )?.game.events.length === 1,
          );
          assert.equal((await read()).game.events[0].action.type, "move");
          await load(turn, orientation);
          await tap(p(21), "disc");
          await tap(p(3), "number"); // Same first outcome, different source and a three-die shortcut.
          const explicit = await settled(4);
          assert.equal(
            await page.evaluate(async (w) => {
              const r = await import("/backgammon/core/rules.mjs");
              return r.boardKey(
                w.draft.reduce((s, step) => r.applyStep(s, step), w.game.state),
              );
            }, explicit),
            keys[0],
          );
          await page.locator("#reset-draft").click();
          await settled(1);
          await tap(p(9));
          await settled(2); // The third original highlighted destination: 16/10.
          await tap(p(3));
          await settled(4); // Then 10/4, with the same Confirm requirement.
          // Exact same destination through a physical drag and visible-row key.
          if (!touch) {
            await load(turn, orientation);
            const a = await coordinates(p(15), "disc"),
              b = await coordinates(p(3));
            await page.mouse.move(a.x, a.y);
            await page.mouse.down();
            await page.mouse.move(b.x, b.y, { steps: 8 });
            await page.mouse.up();
            await settled(4);
            await page.keyboard.press("z");
            await settled(3);
            await page.keyboard.press("x");
            await settled(1);
            const key = await page.evaluate(
              async ({ point, orientation }) => {
                const k = await import("/backgammon/core/shortcuts.mjs");
                return k.SHORTCUTS.find(
                  (d) =>
                    /^(top|bottom)/.test(d.id) &&
                    k.visiblePoint(d.id, orientation) === point,
                ).keys[0];
              },
              { point: p(3), orientation },
            );
            await page.keyboard.press("Shift+" + key);
            await settled(4);
          }
          await load(turn, orientation, {
            draft: first.draft,
            autoCommit: true,
          });
          assert.equal(
            await page.locator("#confirm").isEnabled(),
            true,
            "old recovery flags cannot commit a chosen draft",
          );
          await page.reload();
          await page.locator("#confirm").waitFor();
          await settled(4);
          await load(turn, orientation, { mode: "computer" });
          await tap(p(3));
          await settled(4); // Do not launch a bot reply before explicit confirmation.
          report.push({ input: touch ? "touch" : "mouse", turn, orientation });
        }
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  return { browser: name, cases: report };
};
