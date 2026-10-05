// Real UI checks against the assembled site. Appearance never changes game state.
const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async function appearanceUX(browser, base, out, browserName) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    serviceWorkers: "block",
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const report = { cases: [], screenshots: [] };
  const shot = async (name) => {
    const file = `${browserName}-themes-${name}.png`;
    await page.screenshot({
      path: path.join(out, file),
      fullPage: true,
      animations: "disabled",
    });
    report.screenshots.push(file);
  };
  const stored = () =>
    page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("backgammon.v1.settings"))
          ?.boardTheme || { version: 1, preset: "slate", colors: {} },
    );
  const open = async () => {
    await page.locator("#preferences").click();
    await page.locator(".settings-dialog").waitFor();
  };
  const close = async () => {
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  };
  const group = async (name) => {
    const summary = page
      .locator(".color-group summary")
      .filter({ hasText: name });
    if (!(await summary.evaluate((n) => n.parentElement.open)))
      await summary.click();
  };
  const rgb = (hex) =>
    `rgb(${hex
      .slice(1)
      .match(/../g)
      .map((n) => parseInt(n, 16))
      .join(", ")})`;
  // Closing Settings redraws the SVG. Select and read in one page task so
  // the dialog's asynchronous close event cannot detach a captured handle.
  const frame = () =>
    page.evaluate(
      () =>
        getComputedStyle(document.querySelector("#board .bg-board > rect"))
          .fill,
    );
  try {
    await page.addInitScript(() => {
      const random = crypto.getRandomValues.bind(crypto),
        dice = [2, 0];
      crypto.getRandomValues = (a) =>
        a instanceof Uint8Array && a.length === 1 && dice.length
          ? ((a[0] = dice.shift()), a)
          : random(a);
    });
    await page.goto(base + "/backgammon/play/");
    await page
      .getByRole("button", { name: "Same device", exact: true })
      .click();
    await page.locator("#start-match").click();
    await page.locator("#roll").click();
    await page.locator("#begin-turn").click();
    await page.locator("#draft-controls select").selectOption({ index: 1 });
    const work = () =>
      page.evaluate(async () => {
        const record = await (
          await import("/backgammon/core/storage.mjs")
        ).get("work", "play");
        return { game: record.game, draft: record.draft };
      });
    await page.waitForFunction(
      async () =>
        (
          await (
            await import("/backgammon/core/storage.mjs")
          ).get("work", "play")
        ).draft.length === 1,
    );
    const before = await work();
    await open();
    const themes = await page.evaluate(
      async () =>
        (await import("/backgammon/core/appearance.mjs")).BOARD_PRESETS,
    );
    for (const theme of themes) {
      await page.locator(`[data-preset="${theme.id}"]`).click();
      assert.equal((await stored()).preset, theme.id);
      assert.equal(await frame(), rgb(theme.colors.frame));
      assert.equal(await page.locator(".theme-contrast").isVisible(), false);
      const dice = await page
        .locator(".theme-dice-samples .teal-die")
        .evaluate((n) => ({
          face: getComputedStyle(n).backgroundColor,
          pips: getComputedStyle(n).color,
        }));
      assert.deepEqual(dice, {
        face: rgb(theme.colors.die1),
        pips: rgb(theme.colors.pips1),
      });
      if (browserName === "chromium") await shot(theme.id);
    }
    report.cases.push(
      "six presets with real SVG, die and pip colors",
      "all preset readability checks",
    );
    await group("Board surfaces");
    const input = page.getByLabel("Frame hex", { exact: true });
    await input.fill("abc");
    assert.equal(await frame(), "rgb(170, 187, 204)");
    await input.press("Tab");
    assert.equal(await input.inputValue(), "#AABBCC");
    await input.fill("#nope");
    assert.equal(await input.getAttribute("aria-invalid"), "true");
    assert.equal(await frame(), "rgb(170, 187, 204)");
    assert.equal((await stored()).colors.frame, "#AABBCC");
    await page
      .getByRole("button", { name: "Reset Frame", exact: true })
      .click();
    assert.equal(await frame(), rgb(themes.at(-1).colors.frame));
    assert.equal(await input.getAttribute("aria-invalid"), "false");
    await page.locator("#undo-theme").click();
    assert.equal(await frame(), "rgb(170, 187, 204)");
    await page.locator("#reset-theme").click();
    assert.deepEqual((await stored()).colors, {});
    await page
      .getByLabel("Frame color picker", { exact: true })
      .evaluate((n) => {
        n.value = "#273c4a";
        n.dispatchEvent(new Event("input", { bubbles: true }));
      });
    assert.equal(await input.inputValue(), "#273C4A");
    await group("Doubling cube");
    await page
      .getByLabel("Cube number hex", { exact: true })
      .fill(themes.at(-1).colors.cube);
    assert.match(
      await page.locator(".theme-warnings").innerText(),
      /Cube number/,
    );
    await page
      .getByRole("button", { name: "Reset Cube number", exact: true })
      .click();
    report.cases.push(
      "hex shorthand, case normalization and invalid input",
      "native picker input",
      "per-color reset, undo and preset reset",
      "low-contrast feedback",
    );

    // Every exposed color must reach a real board/dice/highlight property, including
    // counts and bearoff pieces that are absent from the initial game position.
    const coverage = await page.evaluate(async () => {
      const a = await import("/backgammon/core/appearance.mjs"),
        { Board } = await import("/backgammon/ui/board.mjs"),
        { initialState } = await import("/backgammon/core/rules.mjs");
      const container = document.createElement("div");
      container.style.cssText =
        "position:fixed;left:-2000px;width:876px;height:600px";
      document.body.append(container);
      const b = new Board(container),
        s = initialState({ phase: "move", dice: [3, 1] });
      s.points[23] = 0;
      s.bar[0] = 2;
      s.points[0] = 0;
      s.off[1] = 2;
      s.points[12] = 7;
      s.points[5] = 3;
      s.points[11] = -7;
      s.points[18] = -3;
      b.render(s, {
        selected: 7,
        sources: [7, 12, "bar"],
        destinations: [4, 6, "off"],
        moves: [
          { to: 4, die: 3 },
          { to: 6, die: 1 },
        ],
      });
      const css = [...document.styleSheets]
        .flatMap((sheet) => [...sheet.cssRules].map((r) => r.cssText))
        .join("\n");
      const attrs = container.innerHTML;
      const missing = Object.keys(a.COLOR_LABELS).filter(
        (key) => !`${attrs}\n${css}`.includes(a.colorProperty(key) + ","),
      );
      container.remove();
      return missing;
    });
    assert.deepEqual(coverage, []);
    await close();
    assert.deepEqual(
      await work(),
      before,
      "editing colors must not change the draft, dice or history",
    );
    await page.reload();
    await page.locator("#resume-match").click();
    assert.equal(await frame(), "rgb(39, 60, 74)");
    assert.deepEqual(await work(), before);
    await open();
    await page
      .getByRole("button", { name: "Display & controls", exact: true })
      .click();
    await page
      .getByLabel("Board orientation", { exact: true })
      .selectOption("1");
    await page.getByLabel("Motion", { exact: true }).selectOption("reduce");
    await close();
    assert.equal(await frame(), "rgb(39, 60, 74)");
    assert.deepEqual(await work(), before);
    await page.locator("#undo").click(); // no live draft before changing pages
    for (const route of ["trainer/", "solver/", "library/", ""]) {
      await page.goto(base + "/backgammon/" + route);
      await page.waitForFunction(
        () =>
          document.documentElement.style.getPropertyValue("--board-frame") ===
          "#273C4A",
      );
    }
    const second = await context.newPage();
    await second.goto(base + "/backgammon/solver/");
    await second.locator("#preferences").click();
    await second.locator('[data-preset="linen"]').click();
    await page.waitForFunction(
      () =>
        document.documentElement.style.getPropertyValue("--board-frame") ===
        "#D2C7B3",
    );
    await second.close();
    report.cases.push(
      "all color roles wired to rendered elements",
      "draft and dice unchanged",
      "reload and family-wide persistence",
      "cross-tab color synchronization",
      "display preferences remain independent",
    );

    await page.goto(base + "/backgammon/solver/");
    if (browserName === "chromium") {
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
        await open();
        await page.waitForTimeout(100);
        await shot(`${width}x${height}`);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
        await group("Move highlights");
        const hex = page.getByLabel("Keyboard focus hex", { exact: true });
        await hex.fill("#A14CF0");
        const reach = await hex.evaluate((n) => {
          const rect = n.getBoundingClientRect(),
            hit = document.elementFromPoint(
              rect.x + 10,
              rect.y + rect.height / 2,
            );
          return {
            reachable: hit === n,
            size: parseFloat(getComputedStyle(n).fontSize),
            height: rect.height,
          };
        });
        assert.ok(
          reach.reachable && reach.size >= 16 && reach.height >= 44,
          JSON.stringify({ width, height, reach }),
        );
        await shot(`editing-${width}x${height}`);
        await page.keyboard.press("Escape");
        await page.locator(".settings-dialog").waitFor({ state: "detached" });
        assert.equal(await page.locator(".settings-dialog").count(), 0);
        assert.equal(
          await page.evaluate(() => document.activeElement.id),
          "preferences",
        );
      }
      await page.setViewportSize({ width: 390, height: 420 });
      await open();
      await group("Points & labels");
      const numbers = page.getByLabel("Point numbers hex", { exact: true });
      await numbers.fill("#333333");
      assert.ok(
        await numbers.evaluate((n) => {
          const r = n.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= innerHeight;
        }),
      );
      await shot("keyboard-short-viewport");
      await close();
      report.cases.push(
        "nine viewport classes",
        "reachable hex controls and focus restoration",
        "keyboard-like short viewport",
      );
    }
    assert.deepEqual(errors, []);
    return report;
  } finally {
    await context.close();
  }
};
