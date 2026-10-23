const assert = require("node:assert/strict");
module.exports = async function cubeDisplay(browser, base, out, name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 },
    hasTouch: true, reducedMotion: "reduce", serviceWorkers: "block" });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.stack || e.message));
  const control = () => page.getByLabel("Show unturned cube as 1 instead of 64", { exact: true });
  const work = () => page.evaluate(async () => {
    const saved = await (await import("/backgammon/core/storage.mjs")).get("work", "play");
    return { game: saved.game, draft: saved.draft };
  });
  const close = () => page.locator(".settings-dialog .close").tap();
  const waitValue = value => page.waitForFunction(v =>
    document.querySelector("#board .board-cube > text")?.textContent === v, value);
  try {
    await page.goto(base + "/backgammon/");
    await page.evaluate(async () => {
      const r = await import("/backgammon/core/rules.mjs"),
        s = await import("/backgammon/core/storage.mjs");
      const initial = r.initialState({ phase: "move", dice: [6, 1], matchLength: 0 });
      const game = { id: "cube-display", started: true, initial, state: initial, events: [], names: ["White", "Black"],
        config: { mode: "local", humanSide: 0, matchLength: 0, rules: initial.rules,
          strength: "auto", reviewStrength: "auto", tutor: true, warning: true,
          name: "You", opponent: "Friend" } };
      await s.put("work", { id: "play", game, draft: [r.legalPaths(initial)[0].steps[0]],
        positionKey: r.positionKey(initial) });
    });
    await page.goto(base + "/backgammon/play/#resume=cube-display");
    await waitValue("64");
    const before = await work();
    await page.locator("#preferences").tap();
    assert.equal(await control().isChecked(), false);
    await control().check();
    await waitValue("1"); // Live board updates even before Settings closes.
    await close();
    assert.deepEqual(await work(), before, "display preference preserves the game and partial turn");
    await page.reload();
    await waitValue("1");
    await page.locator("#preferences").tap();
    assert.equal(await control().isChecked(), true, "preference survives reload");
    await control().uncheck();
    await waitValue("64");
    await control().check();
    await close();
    assert.deepEqual(await work(), before);
    for (const route of ["solver/", ""]) {
      await page.goto(base + "/backgammon/" + route);
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".board-cube > text")].some(n => n.textContent === "1"));
    }
    const values = await page.evaluate(async () => {
      const { Board } = await import("/backgammon/ui/board.mjs"),
        { initialState } = await import("/backgammon/core/rules.mjs"),
        { settings } = await import("/backgammon/core/storage.mjs");
      const host = document.createElement("div");
      document.body.append(host);
      const board = new Board(host), values = [];
      for (const value of [1, 2, 64, 128]) {
        board.render(initialState({ cube: { value, owner: value === 1 ? null : 0 } }),
          { ...settings(), interactive: false, preview: true });
        values.push(host.querySelector(".board-cube > text").textContent);
      }
      board.destroy(); host.remove();
      return values;
    });
    assert.deepEqual(values, ["1", "2", "64", "128"], "only the unturned cube changes");
    assert.deepEqual(errors, []);
    return { browser: name, immediate: true, persisted: true, draftPreserved: true, actual64Preserved: true };
  } finally { await context.close(); }
};
