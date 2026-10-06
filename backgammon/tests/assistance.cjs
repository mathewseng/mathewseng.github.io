// Hints and turn feedback against real GNUbg, served from the assembled site.
const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async function assistanceUX(
  browser,
  base,
  out,
  browserName,
) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors = [],
    screenshots = [],
    cases = [],
    timings = {};
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = async (name) => {
    const file = `${browserName}-assistance-${name}.png`;
    await page.screenshot({ path: path.join(out, file), fullPage: true });
    screenshots.push(file);
  };
  const saved = () =>
    page.evaluate(async () =>
      (await import("/backgammon/core/storage.mjs")).get("work", "play"),
    );
  const waitSaved = async (predicate) => {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const value = await saved();
      if (predicate(value)) return value;
      await page.waitForTimeout(50);
    }
    throw new Error("Timed out waiting for saved game");
  };
  const close = () =>
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
  const bestReady = () =>
    page
      .locator("[data-best-move]")
      .waitFor({ state: "attached", timeout: 60000 });
  const finishDraft = async () => {
    for (
      let i = 0;
      i < 4 && (await page.locator("#confirm").isDisabled());
      i++
    )
      await page
        .getByLabel("Accessible move selection", { exact: true })
        .selectOption({ index: 1 });
    assert.ok(await page.locator("#confirm").isEnabled());
  };
  try {
    await page.addInitScript(() => {
      const original = crypto.getRandomValues.bind(crypto);
      const dice = [5, 0, 3, 1, 2, 0, 4, 1];
      crypto.getRandomValues = (a) =>
        a instanceof Uint8Array && a.length === 1 && dice.length
          ? ((a[0] = dice.shift()), a)
          : original(a);
    });
    await page.goto(base + "/backgammon/play/");
    await page.locator("#start-match").click();
    assert.equal(await page.locator("#hint").count(), 0);
    await page.locator("#roll").click();
    await page.locator("#begin-turn").click();
    await page
      .getByLabel("Accessible move selection", { exact: true })
      .selectOption({ index: 1 });
    const partial = await waitSaved((s) => s?.draft.length === 1);
    let begin = Date.now();
    await page.locator("#hint").click();
    await bestReady();
    timings.coldHintMs = Date.now() - begin;
    assert.equal(
      await page.locator("[data-best-move]").innerText(),
      "13/7 8/7",
    );
    assert.deepEqual((await saved()).game, partial.game);
    assert.deepEqual((await saved()).draft, partial.draft);
    await shot("hint-desktop");
    await page.setViewportSize({ width: 375, height: 667 });
    await shot("hint-phone");
    assert.ok((await page.locator("#use-hint").boundingBox()).y < 667);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page
      .getByRole("button", { name: "Position", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Best move", exact: true })
      .click();
    await page.keyboard.press("Escape");
    assert.deepEqual((await saved()).draft, partial.draft);
    assert.ok(await page.locator("#hint").isEnabled());
    assert.ok(
      await page
        .locator("#hint")
        .evaluate((e) => document.activeElement === e),
      "Escape returns keyboard focus to Hint",
    );
    assert.equal(
      await page.locator("#board .board-die.consumed").count(),
      1,
    );
    cases.push(
      "real engine hint; whole original roll; previews preserve live draft; Escape releases modal",
    );

    // Use hint changes only the draft. Undo/Reset and confirmation still work.
    begin = Date.now();
    await page.locator("#hint").click();
    await bestReady();
    timings.warmHintMs = Date.now() - begin;
    await page.locator("#use-hint").click();
    await waitSaved((s) => s?.draft.length === 2);
    assert.deepEqual((await saved()).game, partial.game);
    assert.ok(await page.locator("#confirm").isEnabled());
    await page.locator("#undo").click();
    assert.equal((await saved()).draft.length, 1);
    await page.locator("#reset-draft").click();
    await waitSaved((s) => s?.draft.length === 0);
    cases.push(
      "use best move is reversible draft, never an automatic submission",
    );

    await page.getByLabel("Show move feedback", { exact: true }).check();
    await waitSaved((s) => s?.game.config.tutor === true);
    assert.ok(
      await page
        .getByLabel("Show move feedback", { exact: true })
        .evaluate((e) => document.activeElement === e),
      "toggle retains keyboard focus after refresh",
    );
    await finishDraft();
    const submitted = await saved();
    begin = Date.now();
    // Repeated commands must not commit twice even while analysis is pending.
    await page.locator("#confirm").evaluate((b) => {
      b.click();
      b.click();
    });
    await page.locator("#review-feedback").waitFor({ timeout: 60000 });
    timings.feedbackMs = Date.now() - begin;
    const graded = await waitSaved(
      (s) =>
        s?.feedback &&
        s.game.state.turn === 0 &&
        s.game.state.phase === "roll",
    );
    assert.deepEqual(graded.feedback.source, submitted.game.state);
    assert.equal(
      graded.feedback.result.positionKey,
      await page.evaluate(
        async (s) =>
          (await import("/backgammon/core/rules.mjs")).positionKey(s),
        submitted.game.state,
      ),
    );
    assert.equal(
      graded.game.events.filter(
        (e) => e.actor === 0 && e.action.type === "move",
      ).length,
      1,
    );
    const r = graded.feedback.result;
    assert.equal(r.status, "complete");
    assert.ok(r.actual && r.error > 0);
    assert.ok(
      Math.abs(r.error - (r.candidates[0].equity - r.actual.equity)) < 1e-8,
    );
    assert.match(
      await page.locator("#move-feedback").innerText(),
      /EV lost/,
    );
    assert.match(
      await page.locator("#move-feedback").innerText(),
      /Best 13\/7 8\/7/,
    );
    // Player identity uses its own accent; EV-loss text keeps the loss scale.
    const historyColors = await page.evaluate(() => {
      const color = (side) => {
        const row = document.querySelector(
          `#move-feedback [data-history-side="${side}"]`,
        );
        return {
          border: getComputedStyle(row).borderLeftColor,
          label: row.querySelector(".history-player").textContent,
        };
      };
      const review = document.querySelector("#review-feedback");
      return {
        self: color("self"),
        opponent: color("opponent"),
        ev: getComputedStyle(review.querySelector(".value")).color,
        identity: getComputedStyle(review.querySelector(".history-player"))
          .color,
      };
    });
    assert.notEqual(
      historyColors.self.border,
      historyColors.opponent.border,
    );
    assert.match(historyColors.self.label, /your/);
    assert.match(historyColors.opponent.label, /opponent/);
    assert.notEqual(historyColors.ev, historyColors.identity);
    assert.deepEqual(r.actual.steps, submitted.draft);
    cases.push(
      "confirmed human turn graded; exact original context; duplicate click guarded; summary retained during bot reply",
    );

    // Viewport checks cover the extra action and compact feedback, not only setup.
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
      await page.evaluate(() => scrollTo(0, 0));
      await shot(`feedback-${width}x${height}`);
      const geometry = await page.evaluate(() => {
        const box = (s) => {
          const r = document.querySelector(s).getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, width: r.width };
        };
        return {
          board: box("#board"),
          actions: box("#actions"),
          feedback: box("#move-feedback"),
          scroll: document.documentElement.scrollHeight,
          width: document.documentElement.scrollWidth,
        };
      });
      assert.ok(
        geometry.width <= width + 1,
        `horizontal overflow ${width}`,
      );
      if (width > 320) {
        assert.ok(
          geometry.actions.bottom <= height + 1,
          `primary controls fit ${width}x${height}`,
        );
        assert.ok(
          geometry.board.bottom <= height + 1,
          `board fits ${width}x${height}`,
        );
        assert.ok(
          width >= 1025 || geometry.scroll <= height + 1,
          `document fits ${width}x${height}: ${geometry.scroll}`,
        );
      }
    }
    // Choose a roll with real decisions, so a random forced pass cannot remove Confirm.
    await page.evaluate(async () => {
      const r = await import("/backgammon/core/rules.mjs");
      const st = await import("/backgammon/core/storage.mjs");
      const { forcedTurn } = await import("/backgammon/core/table.mjs");
      const state = (await st.get("work", "play")).game.state;
      let dice;
      for (let a = 1; a <= 6 && !dice; a++)
        for (let b = 1; b <= 6; b++) {
          if (
            !forcedTurn(
              r.transition(
                state,
                { type: "roll", dice: [a, b] },
                state.turn,
              ),
            )
          ) {
            dice = [a - 1, b - 1];
            break;
          }
        }
      const original = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = (array) =>
        array instanceof Uint8Array && array.length === 1 && dice.length
          ? ((array[0] = dice.shift()), array)
          : original(array);
    });
    await page.locator("#roll").click();
    await page.locator("#confirm").waitFor();
    for (const [width, height] of [
      [375, 667],
      [844, 390],
      [1366, 768],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => scrollTo(0, 0));
      await shot(`moving-${width}x${height}`);
      const geometry = await page.evaluate(() => ({
        height: document.documentElement.scrollHeight,
        width: document.documentElement.scrollWidth,
        confirm: document.querySelector("#confirm").getBoundingClientRect()
          .bottom,
      }));
      assert.ok(
        geometry.width <= width + 1 &&
          (width >= 1025 || geometry.height <= height + 1),
        `moving layout fits ${width}x${height}: ${JSON.stringify(geometry)}`,
      );
      assert.ok(
        geometry.confirm <= height + 1,
        "confirm visible with feedback and Hint",
      );
    }
    await page.setViewportSize({ width: 375, height: 667 });
    // Different platform font metrics must not require another fixed board
    // height allowance. The moving row includes all four checker actions.
    for (const family of ["Arial", "Verdana"]) {
      const style = await page.addStyleTag({
        content: `.app { font-family: ${family}, sans-serif; }`,
      });
      const fit = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      }));
      assert.ok(
        fit.width <= 376 && fit.height <= 668,
        `${family} phone layout: ${JSON.stringify(fit)}`,
      );
      await style.evaluate((e) => e.remove());
    }
    await page.locator('[data-decision-type="checker"]').first().click();
    if (await page.locator(".decision-tabs").count())
      await page.locator('.decision-tabs [data-view="board"]').click();
    await page
      .getByRole("button", { name: "Your move", exact: true })
      .click();
    await shot("review-phone");
    await close();
    await page.locator("#panel-toggle").click();
    assert.ok(
      await page
        .getByLabel("Show move feedback", { exact: true })
        .isChecked(),
    );
    await page.getByLabel("Show move feedback", { exact: true }).uncheck();
    await close();
    assert.ok(await page.locator("#move-feedback").isHidden());
    await page.locator("#panel-toggle").click();
    await page.getByLabel("Show move feedback", { exact: true }).check();
    await close();
    cases.push(
      "phone feedback toggle; review compares source, best and played positions; responsive primary actions",
    );

    const feedbackBeforeNavigation = (await saved()).feedback;
    await page.getByRole("link", { name: "Solver", exact: true }).click();
    if (
      await page
        .getByRole("dialog", { name: "Open the committed position?" })
        .count()
    )
      await page
        .getByRole("dialog", { name: "Open the committed position?" })
        .getByRole("button", { name: "Continue", exact: true })
        .click();
    await page.waitForURL("**/solver/**");
    await page.getByRole("link", { name: "Play", exact: true }).click();
    await page.locator("#review-feedback").waitFor();
    assert.equal((await saved()).game.id, partial.game.id);
    assert.deepEqual((await saved()).feedback, feedbackBeforeNavigation);
    assert.equal((await saved()).game.config.tutor, true);
    cases.push("feedback and live toggle survive Solver round trip");

    // Same-device/online games must never expose hint or turn grading controls.
    await page.locator("#players-control").click();
    await page.locator("#dialog-play-both").click();
    // The native close event removes the dialog on a later browser task.
    // Count only after cleanup, rather than its now-inaccessible old toggle.
    await page.locator("dialog").waitFor({ state: "detached" });
    assert.ok(await page.locator("#move-feedback").isHidden());
    assert.equal(
      await page.getByLabel("Show move feedback", { exact: true }).count(),
      0,
    );
    assert.equal(await page.locator("#hint").count(), 0);
    cases.push("assistance hidden for same-device play");
    if (browserName === "chromium") {
      // Delay/fail only the real engine data download; no mock recommendations.
      let assetMode = "hold";
      const held = [];
      await context.route("**/engine/vendor/*.data", (route) => {
        if (assetMode === "hold") held.push(route);
        else if (assetMode === "fail")
          route.fulfill({
            status: 503,
            body: "Offline for integration test",
          });
        else route.continue();
      });
      const waitHeld = async () => {
        const deadline = Date.now() + 15000;
        while (!held.length && Date.now() < deadline)
          await page.waitForTimeout(50);
        assert.ok(
          held.length,
          "the actual worker requested its engine database",
        );
      };
      const releaseHeld = async () => {
        for (const route of held.splice(0))
          await route.continue().catch(() => {});
      };
      const assign = async (id) => {
        await page.locator("#players-control").click();
        await page.locator("#dialog-" + id).click();
      };
      await assign("bot-teal");
      const beforeCancel = await saved();
      await page.locator("#hint").click();
      await waitHeld();
      await shot("hint-loading-phone");
      await page.keyboard.press("Escape");
      await page.locator("#hint").waitFor();
      await releaseHeld();
      assert.deepEqual((await saved()).game.state, beforeCancel.game.state);
      assetMode = "fail";
      await page.locator("#hint").click();
      await page
        .getByRole("button", { name: "Retry hint", exact: true })
        .waitFor();
      await shot("hint-error-phone");
      assetMode = "pass";
      await page
        .getByRole("button", { name: "Retry hint", exact: true })
        .click();
      await bestReady();
      await close();
      cases.push(
        "cancel during real worker initialization; stale work discarded; failed asset has working retry",
      );

      await assign("play-both"); // Terminates the warm worker before the next check.
      await assign("bot-teal");
      await page.setViewportSize({ width: 1366, height: 768 });
      await finishDraft();
      const pending = await saved();
      assetMode = "hold";
      await page.locator("#confirm").click();
      await waitHeld();
      await page.locator("#cancel-feedback").click();
      assert.ok(await page.locator("#confirm").isEnabled());
      assert.deepEqual((await saved()).draft, pending.draft);
      assert.deepEqual((await saved()).game.state, pending.game.state);
      await releaseHeld();
      assetMode = "fail";
      await page.locator("#confirm").click();
      await page
        .getByRole("dialog", {
          name: "Move feedback unavailable",
          exact: true,
        })
        .waitFor();
      await shot("feedback-error");
      await page
        .getByRole("button", {
          name: "Confirm without feedback",
          exact: true,
        })
        .click();
      await waitSaved(
        (s) => s?.game.events.length === pending.game.events.length + 1,
      );
      assert.equal((await saved()).game.state.turn, 1);
      assert.equal((await saved()).feedback, null);
      cases.push(
        "cancel grading preserves full draft; engine failure allows a legal turn without invented feedback",
      );
      await context.unroute("**/engine/vendor/*.data");
    }
    // Real-engine edge cases: the human on Teal in a match, and a forced pass.
    const edgeContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    const edge = await edgeContext.newPage();
    edge.on("pageerror", (e) => errors.push(e.message));
    try {
      for (const scenario of ["match-teal", "warning"]) {
        await edge.goto(base + "/backgammon/");
        const id = await edge.evaluate(async (scenario) => {
          const r = await import("/backgammon/core/rules.mjs");
          const store = await import("/backgammon/core/storage.mjs");
          let source = r.initialState({
            matchLength: scenario === "match-teal" ? 5 : 0,
          });
          source = r.transition(source, {
            type: "opening",
            dice: scenario === "match-teal" ? [1, 6] : [6, 1],
          });
          r.assertState(source);
          const id = crypto.randomUUID();
          await store.put("work", {
            id: "play",
            game: {
              id,
              initial: source,
              state: source,
              events: [],
              started: true,
              names: source.turn ? ["GNUbg", "You"] : ["You", "GNUbg"],
              config: {
                mode: "computer",
                humanSide: source.turn,
                strength: "quick",
                tutor: true,
                warning: scenario === "warning",
                matchLength: source.matchLength,
                rules: source.rules,
              },
            },
            positionKey: r.positionKey(source),
            draft: [],
          });
          return id;
        }, scenario);
        await edge.goto(base + "/backgammon/play/#resume=" + id);
        await edge.locator("#hint").click();
        await edge.locator("#use-hint").waitFor({ timeout: 60000 });
        await edge.locator("#use-hint").click();
        if (scenario === "warning") {
          await edge.locator("#reset-draft").click();
          await edge.locator("#panel-toggle").click();
          for (
            let i = 0;
            i < 4 && (await edge.locator("#confirm").isDisabled());
            i++
          )
            await edge
              .getByLabel("Accessible move selection", { exact: true })
              .selectOption({ index: 1 });
          await edge
            .getByRole("dialog")
            .getByRole("button", { name: "Close", exact: true })
            .click();
          await edge.locator("#confirm").click();
          await edge
            .getByRole("button", { name: "Revise", exact: true })
            .click();
          assert.ok(await edge.locator("#confirm").isEnabled());
          assert.equal(
            await edge.evaluate(
              async () =>
                (
                  await (
                    await import("/backgammon/core/storage.mjs")
                  ).get("work", "play")
                ).game.events.length,
            ),
            0,
          );
        }
        await edge.locator("#confirm").click();
        if (scenario === "warning")
          await edge
            .getByRole("button", { name: "Confirm anyway", exact: true })
            .click();
        await edge.locator("#review-feedback").waitFor({ timeout: 60000 });
        const result = await edge.evaluate(
          async () =>
            (
              await (
                await import("/backgammon/core/storage.mjs")
              ).get("work", "play")
            ).feedback.result,
        );
        if (scenario === "warning") assert.ok(result.error > 0.04);
        else assert.equal(result.error, 0);
        assert.equal(result.perspective, scenario === "match-teal" ? 1 : 0);
        assert.match(
          await edge.locator("#move-feedback").innerText(),
          scenario === "match-teal"
            ? /Equity lost 0.000/
            : scenario === "warning"
              ? /EV lost/
              : /EV lost 0.000/,
        );
        if (scenario === "match-teal")
          assert.ok(Number.isFinite(result.actual.mwc));
        await edge.locator("#review-feedback").click();
        const file = `${browserName}-assistance-${scenario}.png`;
        await edge.screenshot({
          path: path.join(out, file),
          fullPage: true,
        });
        screenshots.push(file);
        await edge
          .getByRole("dialog")
          .getByRole("button", { name: "Close", exact: true })
          .click();
      }
      cases.push(
        "real match equity with human on Teal; equivalent best decision is zero loss; automatic passes tested separately; warning revise/confirm never commits prematurely",
      );
    } finally {
      await edgeContext.close();
    }
    assert.deepEqual(errors, []);
    return { browserName, cases, screenshots, timings, engine: r.engine };
  } finally {
    await context.close();
  }
};
