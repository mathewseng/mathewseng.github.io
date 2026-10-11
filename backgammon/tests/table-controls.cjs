const { clickTool } = require("./tool-access.cjs");
// Local table handoffs, opponent markers and automatic Solver work: real WASM.
const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async function tableControls(browser, base, out, browserName) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const page = await context.newPage(),
    errors = [],
    screenshots = [],
    cases = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", async (d) => {
    errors.push(`Unexpected native dialog: ${d.type()}`);
    await d.accept();
  });
  const shot = async (name) => {
    const file = `${browserName}-table-${name}.png`;
    await page.screenshot({ path: path.join(out, file), fullPage: true });
    screenshots.push(file);
  };
  const saved = () =>
    page.evaluate(async () =>
      (await import("/backgammon/core/storage.mjs")).get("work", "play"),
    );
  const waitState = async (turn, phase) => {
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      const s = (await saved())?.game.state;
      if (s?.turn === turn && s.phase === phase) return;
      await page.waitForTimeout(50);
    }
    throw new Error(
      `Timed out waiting for side ${turn}, phase ${phase}: ${JSON.stringify(await saved())}`,
    );
  };
  const assign = async (id) => {
    await clickTool(page, "#players-control");
    await page.locator(`#dialog-${id}`).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  };
  const analyzed = () =>
    page
      .getByRole("button", { name: "Save as exercise", exact: true })
      .waitFor({ timeout: 45000 });
  const finishDraft = async () => {
    while (await page.locator("#confirm").isDisabled())
      await page
        .getByLabel("Accessible move selection", { exact: true })
        .selectOption({ index: 1 });
  };
  try {
    await page.addInitScript(() => {
      const random = crypto.getRandomValues.bind(crypto),
        bytes = [2, 2, 5, 0, 3, 1, 4, 1, 2, 0];
      crypto.getRandomValues = (a) =>
        a instanceof Uint8Array && a.length === 1 && bytes.length
          ? ((a[0] = bytes.shift()), a)
          : random(a);
    });
    await page.goto(base + "/backgammon/play/");
    assert.equal(
      await page.getByLabel("Match length", { exact: true }).inputValue(),
      "0",
    );
    await page.locator("#start-match").click();
    await assign("switch-sides");
    assert.ok(
      await page.locator("#roll").isEnabled(),
      "the human playing Teal can start the opening roll",
    );
    await assign("switch-sides");
    await page.locator("#roll").click();
    await page.locator(".opening-roll h2").filter({ hasText: "tie" }).waitFor();
    assert.deepEqual((await saved()).game.state.cube, {
      value: 2,
      owner: null,
    });
    assert.match(
      await page.locator(".opening-roll").innerText(),
      /Stakes are now 2/,
    );
    await shot("opening-double-default");
    await page.locator("#roll").click();
    await page.locator("#begin-turn").click();
    await page
      .getByLabel("Accessible move selection", { exact: true })
      .selectOption({ index: 1 });
    const partial = await saved();
    await clickTool(page, "#players-control");
    assert.ok(await page.locator("#dialog-switch-sides").isDisabled());
    await page.locator("#dialog-play-both").click();
    assert.deepEqual((await saved()).draft, partial.draft);
    await assign("bot-teal");
    assert.deepEqual((await saved()).draft, partial.draft);
    cases.push(
      "default opening double",
      "draft protected during control changes",
    );

    await page.getByRole("link", { name: "Solver", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await page.waitForURL("**/backgammon/solver/**");
    await analyzed(); // No Analyze click: the real engine runs on arrival.
    await shot("solver-auto-result");
    await page.goBack();
    await page.locator("#confirm").waitFor();
    assert.deepEqual((await saved()).draft, partial.draft);
    assert.equal(await page.locator(".board-die.consumed").count(), 1);
    await page.getByRole("link", { name: "Solver", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await page.waitForURL("**/backgammon/solver/**");
    await analyzed();
    await page.getByRole("link", { name: "Play", exact: true }).click();
    await page.locator("#confirm").waitFor();
    const resumed = await saved();
    assert.equal(resumed.game.id, partial.game.id);
    assert.deepEqual(resumed.game.state, partial.game.state);
    assert.deepEqual(resumed.game.events, partial.game.events);
    assert.deepEqual(resumed.draft, partial.draft);
    assert.equal(resumed.game.config.mode, "computer");
    assert.equal(resumed.game.config.humanSide, 0);
    cases.push(
      "Solver automatically evaluates",
      "return restores bot and unfinished draft",
    );

    await page.locator("#reset-draft").click();
    await page
      .getByRole("button", { name: "Open in Solver", exact: true })
      .click();
    await page.waitForURL("**/backgammon/solver/**");
    await analyzed();
    await page
      .getByRole("button", { name: "Play from this position", exact: true })
      .click();
    await page.locator("#confirm").waitFor();
    const study = await saved();
    assert.notEqual(study.game.id, partial.game.id);
    assert.deepEqual(study.game.state, partial.game.state);
    assert.equal(study.game.config.mode, "computer");
    assert.equal(study.game.config.strength, partial.game.config.strength);
    assert.deepEqual(study.draft, []);
    // Returning to the original Solver must still find the original table.
    await page.goBack();
    await page.getByRole("link", { name: "Play", exact: true }).click();
    await page.locator("#confirm").waitFor();
    assert.equal((await saved()).game.id, partial.game.id);
    cases.push(
      "play-forward inherits bot",
      "original table survives a separate study",
    );

    await finishDraft();
    await page.locator("#confirm").click();
    await waitState(0, "roll");
    await page.locator(".last-moved-checker").first().waitFor();
    await page.locator(".last-move-ghost").first().waitFor();
    assert.equal(await page.locator(".last-roll .board-die").count(), 2);
    assert.equal(await page.locator(".last-roll [role=button]").count(), 0);
    const previousDice = await page.evaluate(async () => {
      const { get } = await import("/backgammon/core/storage.mjs");
      const { lastMove } = await import("/backgammon/core/play-session.mjs");
      return lastMove((await get("work", "play")).game).dice;
    });
    assert.deepEqual(
      await page
        .locator(".last-roll .board-die")
        .evaluateAll((nodes) => nodes.map((n) => Number(n.dataset.die))),
      previousDice,
    );
    assert.match(await page.locator("#draft-line").innerText(), /Last move/);
    const last = await saved();
    assert.equal(last.game.events.at(-1).actor, 1, JSON.stringify(last.game));
    assert.equal(last.game.events.at(-1).action.type, "move");
    await page.reload();
    await page.waitForFunction(() =>
      document.querySelector("#roll,#resume-match"),
    );
    if (await page.locator("#resume-match").count())
      await page.locator("#resume-match").click();
    await page.locator(".last-move-ghost").first().waitFor();
    assert.deepEqual((await saved()).game.events, last.game.events);
    assert.deepEqual(
      await page
        .locator(".last-roll .board-die")
        .evaluateAll((nodes) => nodes.map((n) => Number(n.dataset.die))),
      previousDice,
    );
    cases.push(
      "last-move ghosts and original dice survive reload without rerolling",
    );
    for (const [width, height] of [
      [1366, 768],
      [375, 667],
      [320, 568],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await shot(`opponent-${width}x${height}`);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `horizontal overflow at ${width}`,
      );
      if (width !== 320)
        assert.ok(
          await page
            .locator("#roll")
            .evaluate(
              (n) => n.getBoundingClientRect().bottom <= innerHeight + 1,
            ),
          `roll below fold at ${width}`,
        );
      await clickTool(page, "#players-control");
      await shot(`players-${width}x${height}`);
      await page.keyboard.press("Escape");
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.locator("#roll").click();
    await page.locator("#confirm").waitFor();
    assert.equal(await page.locator("[data-last-moved]").count(), 0);
    assert.equal(await page.locator(".last-move-ghost,.last-roll").count(), 0);
    assert.doesNotMatch(
      await page.locator("#draft-line").innerText(),
      /Last move/,
    );
    const beforeSwitch = await saved();
    await assign("switch-sides");
    await waitState(1, "roll");
    let current = await saved();
    assert.equal(current.game.config.humanSide, 1);
    assert.equal(
      current.game.state.sequence,
      beforeSwitch.game.state.sequence + 1,
    );
    assert.equal(current.game.events.at(-1).actor, 0);
    assert.deepEqual(current.game.names, ["GNUbg", "You"]);
    assert.equal(
      await page.evaluate(
        async () =>
          (await import("/backgammon/core/storage.mjs")).settings().orientation,
      ),
      1,
    );
    await shot("switched-sides");
    await assign("play-both");
    const both = await saved();
    assert.equal(both.game.config.mode, "local");
    assert.deepEqual(both.game.state, current.game.state);
    await assign("bot-teal");
    await waitState(0, "roll");
    assert.equal((await saved()).game.config.humanSide, 0);
    cases.push(
      "opponent markers visible until roll",
      "responsive player controls",
      "switch sides plays real GNUbg as Ivory",
      "both sides and reassigned bot",
    );

    // Hold a real worker's load to exercise cancellation during initialization.
    await assign("play-both");
    await page.locator("#roll").click();
    const untouched = await saved();
    let release, started;
    const gate = new Promise((r) => {
        release = r;
      }),
      loading = new Promise((r) => {
        started = r;
      });
    await page.route("**/engine/worker.mjs", async (route) => {
      started();
      await gate;
      await route.continue().catch(() => {});
    });
    await assign("bot-ivory");
    await Promise.race([
      loading,
      page.waitForTimeout(15000).then(() => {
        throw new Error("Worker initialization request was not observed.");
      }),
    ]);
    await assign("play-both");
    release();
    await page.unroute("**/engine/worker.mjs");
    await page.waitForTimeout(200);
    assert.deepEqual((await saved()).game.state, untouched.game.state);
    assert.deepEqual((await saved()).game.events, untouched.game.events);
    await assign("bot-ivory");
    await waitState(1, "roll");
    cases.push("cancel initializing bot without a late move; restart succeeds");

    // Entering the editor cancels automatic analysis; invalid drafts never run.
    // Hold initialization so this tests cancellation, rather than racing the
    // completed-result repaint between WebKit's pointerdown and pointerup.
    let releaseEditor, editorStarted;
    const editorGate = new Promise((r) => {
        releaseEditor = r;
      }),
      editorLoading = new Promise((r) => {
        editorStarted = r;
      });
    await page.route("**/engine/worker.mjs", async (route) => {
      editorStarted();
      await editorGate;
      await route.continue().catch(() => {});
    });
    try {
      await page.getByRole("link", { name: "Solver", exact: true }).click();
      await page.waitForURL("**/backgammon/solver/**");
      await Promise.race([
        editorLoading,
        page.waitForTimeout(15000).then(() => {
          throw new Error("Automatic Solver initialization was not observed.");
        }),
      ]);
      await page
        .getByRole("button", { name: "Edit position", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Done editing", exact: true })
        .waitFor();
    } finally {
      releaseEditor();
      await page.unroute("**/engine/worker.mjs");
    }
    assert.equal(await page.locator("#analyze").innerText(), "Analyze");
    await page
      .getByRole("button", { name: "Clear board", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Done editing", exact: true })
      .click();
    assert.ok(await page.locator("#analyze").isDisabled());
    assert.equal(
      await page
        .getByRole("button", { name: "Save as exercise", exact: true })
        .count(),
      0,
    );
    cases.push("editor cancels automatic work and rejects invalid positions");
    // Complete a real analysis during a held click. The same Edit control must
    // survive the result repaint, including WebKit's pointer target tracking.
    const race = await context.newPage();
    race.on("pageerror", (e) => errors.push(e.message));
    let finishLoad, observeLoad;
    const finishGate = new Promise((r) => {
        finishLoad = r;
      }),
      observed = new Promise((r) => {
        observeLoad = r;
      });
    await race.route("**/engine/worker.mjs", async (route) => {
      observeLoad();
      await finishGate;
      await route.continue().catch(() => {});
    });
    try {
      const url = await page.evaluate(async () => {
        const { initialState } = await import("/backgammon/core/rules.mjs");
        return (await import("/backgammon/core/xgid.mjs")).shareURL(
          initialState({ phase: "move", dice: [6, 1] }),
        );
      });
      await race.goto(url);
      await Promise.race([
        observed,
        race.waitForTimeout(15000).then(() => {
          throw new Error("Solver worker not observed for click test.");
        }),
      ]);
      const target = await race.locator("#edit-position").boundingBox();
      await race.mouse.move(
        target.x + target.width / 2,
        target.y + target.height / 2,
      );
      await race.mouse.down();
      finishLoad();
      await race.waitForFunction(
        () => document.querySelector("#analyze")?.textContent === "Analyze",
      );
      await race.mouse.up();
      await race
        .getByRole("button", { name: "Done editing", exact: true })
        .waitFor();
      assert.ok(
        await race
          .getByRole("button", { name: "Clear board", exact: true })
          .isVisible(),
      );
      cases.push(
        "Solver Edit click survives analysis completion between pointerdown and pointerup",
      );
    } finally {
      finishLoad();
      await race.close();
    }
    assert.deepEqual(errors, []);
    return { cases, screenshots };
  } finally {
    await context.close();
  }
};
