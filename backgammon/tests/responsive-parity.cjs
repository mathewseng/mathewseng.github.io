const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async function parity(browser, base, out, name) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    hasTouch: true,
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const close = async () => {
    if (!await page.getByRole("dialog").count()) return;
    await page
      .getByRole("dialog")
      .last()
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await page.waitForTimeout(30);
  };
  const inventory = () =>
    page
      .locator(
        "#panel button,#panel input,#panel select,#panel textarea,#panel summary,#panel a[href]",
      )
      .evaluateAll((ns) =>
        ns.map((n) => [
          n.tagName,
          n.getAttribute("aria-label") || n.textContent.trim() || n.type,
          n.disabled || false,
        ]),
      );
  const exerciseControls = async () => {
    await page
      .locator("#panel details")
      .evaluateAll((ns) => ns.forEach((n) => (n.open = true)));
    const controls = page.locator(
      "#panel button:visible,#panel input:visible,#panel select:visible,#panel textarea:visible,#panel summary:visible,#panel a[href]:visible",
    );
    for (let i = 0; i < (await controls.count()); i++) {
      const n = controls.nth(i);
      await n.scrollIntoViewIfNeeded();
      const fit = await n.evaluate((n) => {
        const r = n.getBoundingClientRect(),
          top = document.elementFromPoint(
            r.x + r.width / 2,
            Math.min(innerHeight - 1, r.y + r.height / 2),
          );
        return {
          name: n.getAttribute("aria-label") || n.textContent.trim(),
          left: r.left,
          right: r.right,
          hit: !!top && (top === n || n.contains(top)),
        };
      });
      if (await page.locator("#details-dialog").count()) {
        const closeBox = await page.locator("#details-dialog .close").boundingBox();
        assert.ok(closeBox.y >= 0 && closeBox.y + closeBox.height <= page.viewportSize().height,
          "Close remains in view while accessing every control");
      }
      assert.ok(
        fit.left >= -1 &&
          fit.right <= page.viewportSize().width + 1 &&
          fit.hit,
        `${name} inaccessible control ${JSON.stringify(fit)}`,
      );
    }
  };
  try {
    await page.goto(base + "/backgammon/");
    await page.evaluate(async () => {
      const r = await import("/backgammon/core/rules.mjs"),
        st = await import("/backgammon/core/storage.mjs");
      await st.put(
        "items",
        st.itemRecord("position", {
          state: r.initialState({ phase: "move", dice: [4, 3] }),
          title: "Parity position",
          notes: "Desktop and mobile",
        }),
      );
    });
    for (const route of ["play", "trainer", "solver", "library"]) {
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.goto(base + `/backgammon/${route}/`);
      await page.waitForFunction(
        () => document.querySelector("#panel")?.children.length > 0,
      );
      if (route === "library")
        await page
          .getByRole("button", {
            name: "Open Parity position",
            exact: true,
          })
          .click();
      if (route === "solver") await page.locator("#edit-position").click();
      await page.locator("#panel-toggle").click();
      await exerciseControls();
      const expected = await inventory();
      await close();
      for (const [width, height] of [
        [320, 568],
        [390, 844],
        [844, 390],
        [768, 1024],
        [1366, 768],
      ]) {
        await page.setViewportSize({ width, height });
        if (await page.locator("#panel-toggle").isVisible())
          await page.locator("#panel-toggle").click();
        else assert.ok(await page.locator("#panel").isVisible(), "inline setup replaces the phone drawer");
        assert.deepEqual(
          await inventory(),
          expected,
          `${route} ${width}: same complete control inventory`,
        );
        await exerciseControls();
        await page
          .locator("#panel")
          .evaluate((n) => n.scrollIntoView({ block: "start" }));
        if ([390, 844, 1366].includes(width))
          await page.screenshot({
            path: path.join(out, `${name}-parity-${route}-${width}.png`),
          });
        await close();
        assert.equal(
          await page.locator("#panel").evaluate((n) => n.parentElement.id),
          "inspector",
        );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `${route} ${width}: horizontal overflow`,
        );
      }
      if (route === "library") {
        await page.setViewportSize({ width: 390, height: 844 });
        await page
          .getByRole("button", {
            name: "Open Parity position",
            exact: true,
          })
          .click();
        await page
          .getByLabel("Notes", { exact: true })
          .fill("Edited on mobile");
        await page
          .getByRole("button", { name: "Save changes", exact: true })
          .click();
        await close();
        await page.setViewportSize({ width: 1366, height: 768 });
        assert.equal(
          await page.getByLabel("Notes", { exact: true }).inputValue(),
          "Edited on mobile",
        );
      }
    }
    await page
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Display & controls", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("dialog")
        .getByRole("link", { name: "All projects", exact: true })
        .getAttribute("href"),
      "/",
    );
    await close();
    await page.goto(base + "/backgammon/");
    const id = await page.evaluate(async () => {
      const r = await import("/backgammon/core/rules.mjs"),
        t = await import("/backgammon/core/table.mjs"),
        st = await import("/backgammon/core/storage.mjs");
      const initial = r.initialState({ matchLength: 0 });
      let game = {
        id: crypto.randomUUID(),
        initial,
        state: initial,
        events: [],
        started: true,
        names: ["You", "GNUbg"],
        config: {
          mode: "computer",
          humanSide: 0,
          strength: "quick",
          reviewStrength: "quick",
          tutor: false,
          matchLength: 0,
          rules: initial.rules,
        },
      };
      game = t.playAction(game, { type: "opening", dice: [6, 1] }, 0);
      game = t.playAction(game, {
        type: "move",
        steps: r.legalTurns(game.state)[0].steps,
      });
      game = t.playAction(game, { type: "roll", dice: [4, 3] });
      game = t.playAction(game, {
        type: "move",
        steps: r.legalTurns(game.state)[0].steps,
      });
      await st.put("work", {
        id: "play",
        game,
        draft: [],
        positionKey: r.positionKey(game.state),
      });
      return game.id;
    });
    await page.goto(base + "/backgammon/play/#resume=" + id);
    await page.locator("#roll").waitFor();
    const expected = await page
      .locator("#help-actions button")
      .evaluateAll((ns) => ns.map((n) => [n.id, n.disabled]));
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [844, 390],
      [1366, 768],
    ]) {
      await page.setViewportSize({ width, height });
      await page.locator("#all-controls").click();
      assert.deepEqual(
        await page
          .locator(".practice-controls-dialog button[id]")
          .evaluateAll((ns) => ns.map((n) => [n.id, n.disabled])),
        expected,
      );
      assert.ok(
        await page
          .locator(".practice-controls-dialog")
          .evaluate(
            (d) =>
              d.scrollWidth <= d.clientWidth + 1 &&
              d.scrollHeight <= d.clientHeight + 1,
          ),
      );
      await page.screenshot({
        path: path.join(out, `${name}-parity-practice-${width}.png`),
      });
      await close();
      assert.equal(
        await page
          .locator("#help-actions")
          .evaluate((n) => n.parentElement.className),
        "help-cluster",
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#all-controls").click();
    await page.locator("#set-bot-roll").click();
    await page.waitForFunction(
      () => !document.querySelector(".practice-controls-dialog"),
    );
    assert.ok(
      await page.getByRole("dialog").isVisible(),
      "practice action opens its real dialog",
    );
    await close();
    assert.deepEqual(errors, []);
    return {
      browser: name,
      cases: [
        "same reachable detail controls across four tools and five layouts",
        "mobile Library edits survive desktop resize",
        "same live practice controls in desktop/mobile drawer; actual bot-roll action; focus/DOM restored",
      ],
    };
  } finally {
    await context.close();
  }
};
