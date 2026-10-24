const assert = require("node:assert/strict");
module.exports = async function pageProgress(browser, base) {
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 1366, height: 768 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  try {
    await page.goto(base + "/backgammon/");
    const id = await page.evaluate(async () => {
      const st = await import("/backgammon/core/storage.mjs"),
        r = await import("/backgammon/core/rules.mjs"),
        state = r.initialState({phase: "move", dice: [3, 1]}),
        id = crypto.randomUUID();
      st.saveSettings({motion: "reduce"});
      await st.put("work", {
        id: "play", positionKey: r.positionKey(state), draft: [],
        game: {id, initial: state, state, events: [], started: true,
          names: ["You", "Opponent"], config: {mode: "local", humanSide: 0, matchLength: 0, rules: state.rules}},
      });
      return id;
    });
    await page.goto(base + "/backgammon/play/#resume=" + id);
    await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
    const storedBase = await page.evaluate(async () => {
      const value = await (await import("/backgammon/core/storage.mjs")).get("work", "play");
      // Persistence runs in a worker now; changing the window's IndexedDB
      // prototype no longer interrupts a real Play save. Fail the writer's
      // public boundary so the pagehide checkpoint must recover the draft.
      const {ProgressWriter} = await import('/backgammon/core/progress-writer.mjs');
      ProgressWriter.prototype.save = async () => { throw new Error('Simulated interrupted save'); };
      return JSON.stringify(value);
    });
    await page.locator("#draft-controls select").selectOption({index: 1});
    const checkpoint = await page.evaluate(() => {
      dispatchEvent(new PageTransitionEvent("pagehide"));
      return JSON.parse(sessionStorage.getItem("backgammon.page-progress./backgammon/play/")).value;
    });
    assert.equal(checkpoint.base, storedBase, "checkpoint identifies the last successfully saved work");
    assert.ok(checkpoint.draft.length);
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
    assert.deepEqual(await page.evaluate(async () =>
      (await (await import("/backgammon/core/storage.mjs")).get("work", "play")).draft,
    ), checkpoint.draft, "emergency checkpoint restores a draft whose IndexedDB write failed");
    await page.goto(base + "/backgammon/trainer/");
    await page.locator("#draft-controls select").selectOption({ index: 1 });
    const draft = await page.evaluate(
      async () =>
        (
          await (
            await import("/backgammon/core/storage.mjs")
          ).get("work", "trainer")
        ).draft,
    );
    assert.ok(draft.length);
    await page.reload();
    await page.locator("#draft-controls select").waitFor();
    assert.deepEqual(
      await page.evaluate(
        async () =>
          (
            await (
              await import("/backgammon/core/storage.mjs")
            ).get("work", "trainer")
          ).draft,
      ),
      draft,
    );
    await page.goto(base + "/backgammon/solver/");
    await page.locator("#edit-position").click();
    const snapshot = await page.evaluate(async () => {
      const st = await import("/backgammon/core/storage.mjs"),
        r = await import("/backgammon/core/rules.mjs");
      const item = st.itemRecord("position", {
        state: r.initialState(),
        title: "Update recovery fixture",
      });
      await st.put("items", item);
      return item.id;
    });
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
    await page.locator("#edit-position").waitFor();
    assert.equal(
      await page.locator("#edit-position").textContent(),
      "Done editing",
    );
    await page.goto(base + "/backgammon/library/");
    await page.getByRole("button", { name: /Update recovery fixture/ }).click();
    const notes = page.getByLabel("Notes", { exact: true });
    await notes.fill("An unfinished annotation survives the update.");
    await page.reload();
    await page.getByLabel("Notes", { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel("Notes", { exact: true }).inputValue(),
      "An unfinished annotation survives the update.",
    );
    assert.equal(
      await page.evaluate(
        async (id) =>
          (
            await (
              await import("/backgammon/core/storage.mjs")
            ).get("items", id)
          ).notes,
        snapshot,
      ),
      "",
      "recovering an unsaved field does not silently commit it",
    );
    assert.deepEqual(errors, []);
    return {
      playInterruptedSave: true,
      trainerDraft: true,
      solverEditor: true,
      libraryUnsavedNotes: true,
    };
  } finally {
    await context.close();
  }
};
