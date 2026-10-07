const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async function directPlay(browser, base, out, name) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = (label) =>
    page.screenshot({
      path: path.join(out, `${name}-direct-${label}.png`),
    });
  try {
    await page.goto(base + "/backgammon/");
    await page.evaluate(async () => {
      const { shell, DraftBoard } =
        await import("/backgammon/ui/shell.mjs");
      const r = await import("/backgammon/core/rules.mjs");
      const ui = shell("trainer", "Direct checker actions");
      const d = new DraftBoard(ui.board);
      const s = r.initialState({ phase: "move", dice: [4, 3] });
      d.set(s, r.legalPaths(s));
      window.direct = { d, r };
    });
    const click = async (p, checker) => {
      const pos = await page.evaluate(
        ({ p, checker }) => {
          const g = document.querySelector(`[data-point="${p}"]`),
            svg = document.querySelector(".bg-board");
          let x, y;
          if (checker) {
            const c = g.querySelector(".checker > circle");
            x = +c.getAttribute("cx");
            y = +c.getAttribute("cy");
          } else {
            const hit = g.querySelector(".point-hit");
            x = +hit.getAttribute("x") + 5;
            y = +hit.getAttribute("y") + 120;
          }
          const v = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
          return { x: v.x, y: v.y };
        },
        { p, checker },
      );
      await page.mouse.click(pos.x, pos.y);
    };
    const draft = () => page.evaluate(() => direct.d.draft);
    // Entire empty point surface, well away from the old tip shortcut.
    await click(8, false);
    assert.deepEqual(
      (await draft()).map((s) => [s.from, s.to, s.die]),
      [[12, 8, 4]],
    );
    // Even a sole forward step requires selecting then choosing its destination.
    await click(12, true);
    assert.equal((await draft()).length, 1);
    await click(9, false);
    assert.deepEqual(
      (await draft()).map((s) => [s.from, s.to, s.die]),
      [
        [12, 8, 4],
        [12, 9, 3],
      ],
    );
    assert.ok(
      await page.locator('[data-point="12"].return-destination').count(),
    );
    await shot("undo-target");
    // Disc and point-space fallback select; the explicit return target undoes.
    await page.waitForTimeout(400);
    await click(9, false);
    assert.equal((await draft()).length, 2);
    await click(12, false);
    assert.equal((await draft()).length, 1);
    await click(12, true);
    assert.equal((await draft()).length, 1);
    await click(9, false);
    assert.equal((await draft()).length, 2);
    await page.waitForTimeout(400);
    await click(9, true);
    assert.equal((await draft()).length, 2);
    await click(12, false);
    assert.equal((await draft()).length, 1);
    await click(8, true); // Select the moved checker, then its explicit undo target.
    await click(12, false);
    assert.equal((await draft()).length, 0);
    // Multiple choices select without making an arbitrary move.
    await click(12, true);
    assert.equal((await draft()).length, 0);
    assert.equal(
      await page.locator(".selected").getAttribute("data-point"),
      "12",
    );
    // A selected checker moves to a legal occupied destination.
    await click(5, false);
    assert.equal((await draft()).length, 2);
    assert.equal((await draft()).at(-1).to, 5);
    // No remaining continuation does not imply undo-only: the initial die can change.
    await page.evaluate(() => {
      const s = direct.r.initialState({ phase: "move", dice: [4, 3] });
      s.points.fill(0);
      s.points[12] = 1;
      s.points[6] = 14;
      s.points[5] = -2;
      s.points[23] = -13;
      direct.d.set(s, direct.r.legalPaths(s));
    });
    await click(12, false);
    assert.equal((await draft()).length, 0);
    await click(8, false);
    await page.waitForTimeout(400);
    await click(8, true);
    assert.equal((await draft()).length, 1);
    assert.equal(
      await page.locator(".selected").getAttribute("data-point"),
      "8",
    );
    assert.match(
      await page.locator('[data-point="9"]').getAttribute("aria-label"),
      /change first die/,
    );
    await shot("alternate-initial-die");
    await click(9, false);
    assert.deepEqual(
      (await draft()).map((s) => [s.from, s.to, s.die]),
      [[12, 9, 3]],
    );
    // A disc always selects, even when it can only return or another checker can land.
    await page.evaluate(() => {
      const s = direct.r.initialState({ phase: "move", dice: [4, 3] });
      s.points.fill(0);
      s.points[12] = 1;
      s.points[6] = 13;
      s.points[11] = 1;
      s.points[5] = -2;
      s.points[9] = -2; // The other die cannot be used from the original point either.
      s.points[23] = -11;
      direct.d.set(s, direct.r.legalPaths(s));
    });
    await click(12, true);
    await click(8, false);
    assert.equal((await draft()).length, 1);
    await page.waitForTimeout(400); // Paused single tap keeps undo-only behavior.
    await click(8, true);
    assert.equal((await draft()).length, 1);
    await click(12, false);
    assert.equal((await draft()).length, 0);
    // A checker that can still move is selected, never silently undone.
    await page.evaluate(() => {
      const s = direct.r.initialState({ phase: "move", dice: [4, 3] });
      direct.d.set(s, direct.r.legalPaths(s));
    });
    await click(8, false);
    await page.waitForTimeout(400);
    await click(8, true);
    assert.equal((await draft()).length, 1);
    assert.equal(
      await page.locator(".selected").getAttribute("data-point"),
      "8",
    );
    await page.evaluate(() => direct.d.reset());
    const geometry = await page.evaluate(() => {
      const points = [...document.querySelectorAll("[data-point]")].filter(
        (n) => /^\d+$/.test(n.dataset.point),
      );
      return points.map((n) =>
        [...n.querySelectorAll(".checker > circle:first-child")].map(
          (c) => ({ y: +c.getAttribute("cy"), r: +c.getAttribute("r") }),
        ),
      );
    });
    for (const circles of geometry)
      for (let i = 1; i < circles.length; i++)
        assert.ok(
          Math.abs(circles[i].y - circles[i - 1].y) ===
            circles[i].r + circles[i - 1].r,
        );
    assert.equal(
      await page.locator('[data-point="12"] .checker').count(),
      5,
    );
    assert.equal(
      await page.locator('[data-point="12"] .checker text').count(),
      0,
    );
    for (const count of [6, 15]) {
      await page.evaluate((count) => {
        const s = direct.r.initialState();
        s.points = s.points.map((n) => Math.min(n, 0));
        s.points[12] = count;
        s.off[0] = 15 - count;
        direct.d.set(s, []);
      }, count);
      assert.equal(
        await page.locator('[data-point="12"] .checker').count(),
        5,
      );
      assert.equal(
        await page
          .locator('[data-point="12"] .checker:last-child text')
          .textContent(),
        String(count),
      );
    }
    await shot("five-checker-stack");
    await page.evaluate(() => {
      const s = direct.r.initialState({ phase: "move", dice: [1, 6] });
      direct.d.set(s, direct.r.legalPaths(s));
    });
    const radii = await page
      .locator(".board-die-face circle")
      .evaluateAll((ns) => ns.map((n) => n.getAttribute("r")));
    assert.equal(new Set(radii).size, 1);
    assert.equal(
      await page.locator(".board-cube rect").first().getAttribute("x"),
      "825",
    );
    await shot("board");
    await page.evaluate(() => {
      const { d, r } = direct;
      const s = r.initialState({ phase: "move", dice: [1, 1] });
      d.set(s, r.legalPaths(s));
      d.draft = d.paths[0].steps.slice(0, 2);
      d.minDraft = 1;
      d.reset();
      if (
        d.minDraft !== 1 ||
        d.draft.length !== 1 ||
        d.reverseMoves().length
      )
        throw new Error("Reset unlocked compulsory prefix");
      d.undo();
      if (d.draft.length !== 1)
        throw new Error("Undo crossed compulsory prefix");
    });
    // Actual engine result in the production review component, across all viewports.
    await page.evaluate(async () => {
      const { EngineClient } =
        await import("/backgammon/engine/client.mjs");
      const { decisionReview } =
        await import("/backgammon/ui/decision-review.mjs");
      const { gradeCube } =
        await import("/backgammon/engine/cube-grade.mjs");
      const s = direct.r.initialState({ phase: "roll", matchLength: 0 });
      const engine = new EngineClient();
      const result = await engine.analyze(s, { preset: "quick" });
      Object.assign(result, gradeCube(s, result, "roll"));
      engine.destroy();
      window.review = decisionReview(s, { title: "Cube decision" });
      review.result(result);
    });
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
      for (const view of ["decision", "board", "notes"]) {
        await page.locator(`.decision-tabs [data-view="${view}"]`).click();
        const geometry = await page
          .locator(".decision-dialog")
          .evaluate((d) => ({
            width: d.clientWidth,
            scrollWidth: d.scrollWidth,
            height: d.clientHeight,
            scrollHeight: d.scrollHeight,
            body: [
              ...d.querySelectorAll(
                ".dialog-body,.decision-content,.decision-position",
              ),
            ]
              .filter((n) => n.getClientRects().length)
              .map((n) => ({
                w: n.clientWidth,
                sw: n.scrollWidth,
                h: n.clientHeight,
                sh: n.scrollHeight,
              })),
            rect: d.getBoundingClientRect().toJSON(),
          }));
        assert.ok(
          geometry.scrollWidth <= geometry.width + 1 &&
            geometry.scrollHeight <= geometry.height + 1,
          `${view} modal ${width}x${height}: ${JSON.stringify(geometry)}`,
        );
        for (const n of geometry.body)
          assert.ok(
            n.sh <= n.h + 1 && n.sw <= n.w + 1,
            `${view} inner overflow ${width}x${height}: ${JSON.stringify(geometry)}`,
          );
        assert.ok(
          geometry.rect.top >= 0 && geometry.rect.bottom <= height + 1,
        );
      }
      await page.locator('.decision-tabs [data-view="decision"]').click();
      await shot(`modal-${width}x${height}`);
    }
    await page.keyboard.press("Escape");
    for (const kind of ["prefix", "suffix"]) {
      await page.goto(base + "/backgammon/");
      const id = await page.evaluate(async (kind) => {
        const r = await import("/backgammon/core/rules.mjs"),
          st = await import("/backgammon/core/storage.mjs");
        const initial = r.initialState({
          phase: "move",
          dice: [1, 2],
          matchLength: 0,
        });
        initial.points.fill(0);
        if (kind === "prefix") {
          initial.points[5] = 14;
          initial.points[22] = -2;
          initial.points[18] = -13;
          initial.bar = [1, 0];
        } else {
          initial.points[5] = 1;
          initial.points[4] = 1;
          initial.points[23] = -15;
          initial.off = [13, 0];
        }
        const id = crypto.randomUUID();
        await st.put("work", {
          id: "play",
          game: {
            id,
            initial,
            state: initial,
            events: [],
            started: true,
            names: ["Ivory", "Teal"],
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
      }, kind);
      await page.goto(base + "/backgammon/play/#resume=" + id);
      if (kind === "prefix") {
        await page.waitForFunction(
          () =>
            document.querySelectorAll(".board-die.consumed").length === 1,
        );
        assert.equal(await page.locator("#undo").isDisabled(), true);
        assert.equal(await page.locator("#reset-draft").isDisabled(), true);
        await page.reload();
        await page.waitForFunction(
          () =>
            document.querySelectorAll(".board-die.consumed").length === 1,
        );
      } else {
        await page.locator("#confirm").waitFor();
        await page.keyboard.press("u"); // point 6
        await page.keyboard.press("i"); // selected 6/5 uses 1; the remaining 2 is forced
        // Remaining 2 fills the preview, but the original roll had choices.
        await page.waitForFunction(
          () => !document.querySelector("#confirm")?.disabled,
        );
        const pending = await page.evaluate(
          async () =>
            await (
              await import("/backgammon/core/storage.mjs")
            ).get("work", "play"),
        );
        assert.equal(pending.game.events.length, 0);
        assert.equal(pending.draft.length, 2);
        await page.locator("#confirm").click();
        await page.locator("#roll").waitFor();
        const game = await page.evaluate(
          async () =>
            (
              await (
                await import("/backgammon/core/storage.mjs")
              ).get("work", "play")
            ).game,
        );
        assert.equal(game.state.turn, 1);
        assert.deepEqual(game.events.at(-1).action.steps, [
          { from: 5, to: 4, die: 1 },
          { from: 4, to: 2, die: 2 },
        ]);
        assert.equal(
          await page
            .locator("#help-actions button")
            .first()
            .getAttribute("id"),
          "undo-turn",
        );
        await page.evaluate(() => scrollTo(0, 0));
        const layout = await page.evaluate(() => ({
          board: document
            .querySelector("#board")
            .getBoundingClientRect()
            .toJSON(),
          actions: document
            .querySelector("#actions")
            .getBoundingClientRect()
            .toJSON(),
          review: document
            .querySelector(".play-review")
            .getBoundingClientRect().top,
          height: innerHeight,
        }));
        assert.ok(layout.board.height > 600);
        assert.ok(
          layout.actions.bottom > layout.height - 30 &&
            layout.actions.bottom <= layout.height,
        );
        assert.ok(layout.review >= layout.height);
        await shot("desktop-table");
      }
    }
    assert.deepEqual(errors, []);
    return {
      browser: name,
      cases: [
        "disc selection; point-space selected/nearest move; explicit return and alternate first die",
        "five touching checker slots and overflow counts; uniform pips; right-side cube",
        "real-engine review with three non-scrolling views at nine sizes",
      ],
    };
  } finally {
    await context.close();
  }
};
