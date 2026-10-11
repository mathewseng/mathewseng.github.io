const { clickTool } = require("./tool-access.cjs");
const assert = require("node:assert/strict"),
  path = require("node:path");
module.exports = async function equityBarUX(browser, base, out, name) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage(),
    errors = [];
  let assets = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().endsWith(".wasm")) assets++;
  });
  try {
    await page.goto(base + "/backgammon/");
    const fixture = await page.evaluate(async () => {
      const r = await import("/backgammon/core/rules.mjs"),
        st = await import("/backgammon/core/storage.mjs");
      const initial = r.initialState({
        phase: "move",
        dice: [3, 1],
        matchLength: 0,
      });
      const game = {
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
          matchLength: 0,
          rules: initial.rules,
        },
      };
      await st.put("work", {
        id: "play",
        game,
        draft: [],
        positionKey: r.positionKey(initial),
      });
      return { id: game.id, state: initial };
    });
    await page.goto(base + "/backgammon/play/#resume=" + fixture.id);
    await page.locator("#confirm").waitFor();
    assert.equal(
      await page.locator("#equity-toggle").getAttribute("aria-pressed"),
      "false",
    );
    assert.equal(await page.locator("#equity-bar").isVisible(), false);
    assert.equal(assets, 0);
    await clickTool(page, "#equity-toggle");
    await page
      .locator('#equity-bar[data-state="ready"]')
      .waitFor({ timeout: 60000 });
    assert.ok(assets > 0);
    assert.match(
      await page.locator("#equity-bar").getAttribute("title"),
      /Quick.*not win probability/,
    );
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
      await page.waitForTimeout(80);
      const geometry = await page.evaluate(() => {
        const e = document
            .querySelector("#equity-bar")
            .getBoundingClientRect(),
          b = document.querySelector(".bg-board").getBoundingClientRect();
        const w = Math.min(b.width, (b.height * 876) / 660),
          left = b.left + (b.width - w) / 2;
        const primary = document
          .querySelector("#confirm")
          .getBoundingClientRect();
        return {
          width: document.documentElement.scrollWidth,
          primaryLeft: primary.left,
          primaryRight: primary.right,
          left: e.left,
          right: e.right,
          boardLeft: left,
          height: e.height,
          expected: (w * 660) / 876,
        };
      });
      assert.ok(
        geometry.width <= width + 1 &&
          geometry.primaryLeft >= 0 &&
          geometry.primaryRight <= width + 1 &&
          geometry.left >= -1 &&
          geometry.right <= geometry.boardLeft + 1,
        JSON.stringify({ width, height, geometry }),
      );
      assert.ok(Math.abs(geometry.height - geometry.expected) < 2);
      if ([390, 844, 1440].includes(width))
        await page.screenshot({
          path: path.join(out, `${name}-equity-bar-${width}.png`),
        });
    }
    const initialValue = Number(
      await page.locator(".equity-number").innerText(),
    );
    await page.evaluate(async () => {
      const st = await import("/backgammon/core/storage.mjs");
      st.saveSettings({ orientation: 1 });
      dispatchEvent(new Event("bg-settings"));
    });
    assert.equal(
      Number(await page.locator(".equity-number").innerText()),
      -initialValue,
    );
    await page.evaluate(async () => {
      const st = await import("/backgammon/core/storage.mjs");
      st.saveSettings({ orientation: 0 });
      dispatchEvent(new Event("bg-settings"));
    });
    await page.keyboard.press("1");
    await page.keyboard.press("e");
    await page.locator('#equity-bar[data-state="unavailable"]').waitFor();
    await page.keyboard.press("r");
    await page.locator('#equity-bar[data-state="ready"]').waitFor();
    assert.match(
      await page.locator("#equity-bar").getAttribute("title"),
      /Your choice/,
    );
    await page.locator("#reset-draft").click();
    await page.locator('#equity-bar[data-state="ready"]').waitFor();
    await clickTool(page, "#equity-toggle");
    await page.waitForTimeout(50);
    assert.equal(page.workers().length, 0);
    // Cancellation during initialization must release the worker and reject stale completion.
    await page.route("**/engine/vendor/*.wasm", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.continue().catch(() => {});
    });
    await clickTool(page, "#equity-toggle");
    await page.locator('#equity-bar[data-state="loading"]').waitFor();
    await clickTool(page, "#equity-toggle");
    await page.waitForTimeout(300);
    assert.equal(page.workers().length, 0);
    assert.equal(await page.locator("#equity-bar").isVisible(), false);
    await page.unroute("**/engine/vendor/*.wasm");
    await page.route("**/engine/vendor/*.wasm", (route) => route.abort());
    await clickTool(page, "#equity-toggle");
    await page
      .locator('#equity-bar[data-state="error"]')
      .waitFor({ timeout: 60000 });
    await page.unroute("**/engine/vendor/*.wasm");
    await page.locator(".equity-retry").click();
    await page
      .locator('#equity-bar[data-state="ready"]')
      .waitFor({ timeout: 60000 });
    await page.reload();
    await page
      .locator('#equity-bar[data-state="ready"]')
      .waitFor({ timeout: 60000 });
    // Both cube offer and response contexts use real GNUbg, with the correct player.
    for (const response of [false, true, "owned", "crawford"]) {
      await page.goto(base + "/backgammon/");
      const id = await page.evaluate(async (response) => {
        const r = await import("/backgammon/core/rules.mjs"),
          st = await import("/backgammon/core/storage.mjs");
        let initial = r.initialState({ phase: "roll", matchLength: 0 });
        if (response === true)
          initial = r.transition(initial, { type: "double" });
        else if (response === "owned")
          initial.cube = { value: 2, owner: 1 };
        else if (response === "crawford")
          initial = r.initialState({
            phase: "roll",
            matchLength: 5,
            scores: [4, 2],
            crawford: true,
          });
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
              mode: "computer",
              humanSide: r.decisionPlayer(initial),
              strength: "quick",
              reviewStrength: "quick",
              matchLength: 0,
              rules: initial.rules,
            },
          },
          draft: [],
          positionKey: r.positionKey(initial),
        });
        return id;
      }, response);
      await page.goto(base + "/backgammon/play/#resume=" + id);
      await page
        .locator('#equity-bar[data-state="ready"]')
        .waitFor({ timeout: 60000 });
      assert.ok(
        Number.isFinite(
          Number(await page.locator(".equity-number").innerText()),
        ),
      );
      assert.match(
        await page.locator("#equity-bar").getAttribute("title"),
        response === "crawford"
          ? /normalized match equity/
          : /current-cube points/,
      );
    }
    // Trainer must not expose the position evaluation before submission.
    await page.goto(base + "/backgammon/trainer/");
    await page.locator("#submit-decision").waitFor();
    assert.equal(
      await page.locator("#equity-toggle").getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(
      await page.locator("#equity-bar").getAttribute("data-state"),
      "unavailable",
    );
    const best = await page.evaluate(async () => {
      const saved = await (
        await import("/backgammon/core/storage.mjs")
      ).get("work", "trainer");
      const source = (
        await (await fetch("/backgammon/data/exercises.json")).json()
      ).items.find((x) => x.id === saved.exerciseId).state;
      const { EngineClient } =
        await import("/backgammon/engine/client.mjs");
      const e = new EngineClient();
      try {
        return (await e.analyze(source, { preset: "quick" })).candidates[0]
          .steps;
      } finally {
        e.destroy();
      }
    });
    for (const step of best) {
      await page.locator("#draft-controls select").selectOption({
        label: await page
          .locator("#draft-controls select")
          .evaluate((select, step) => {
            const name =
                step.from === "bar" ? "bar" : String(step.from + 1),
              dest = step.to === "off" ? "off" : String(step.to + 1);
            const option = [...select.options].find(
              (o) =>
                o.textContent.startsWith(`${name}/${dest}`) &&
                o.textContent.includes(`die ${step.die}`),
            );
            if (!option)
              throw Error(
                "Missing move " +
                  JSON.stringify(step) +
                  " " +
                  select.innerText,
              );
            return option.label;
          }, step),
      });
    }
    await page.locator("#submit-decision").click();
    await page.locator("#next-exercise").waitFor({ timeout: 60000 });
    await page.locator('#equity-bar[data-state="ready"]').waitFor();
    assert.deepEqual(
      await page.locator("#panel .decision-value .muted").allTextContents(),
      ["Before", "Best choice"],
    );
    await page.screenshot({
      path: path.join(out, `${name}-trainer-best-equity.png`),
    });
    await page.goto(base + "/backgammon/solver/");
    await page.getByText("Analysis settings", { exact: true }).click();
    await page
      .getByLabel("Analysis strength", { exact: true })
      .selectOption("quick");
    await page.locator("#analyze").click();
    await page
      .locator('#equity-bar[data-state="ready"]')
      .waitFor({ timeout: 60000 });
    await page.locator("#panel .list-row").first().click();
    await page.locator('#equity-bar[data-state="unavailable"]').waitFor();
    await page.getByRole("button", { name: "Source", exact: true }).click();
    await page.locator('#equity-bar[data-state="ready"]').waitFor();
    await page.locator("#edit-position").click();
    await page.locator('#equity-bar[data-state="unavailable"]').waitFor();
    await page.goto(base + "/backgammon/library/");
    assert.equal(await page.locator("#equity-toggle").count(), 0);
    assert.deepEqual(errors, []);
    return {
      browser: name,
      cases: [
        "default off; real GNUbg equity; nine sizes; orientation reversal",
        "draft grading, cube offer/response, stale clearing, loading cancellation, off releases worker, error/retry, reload",
        "trainer spoiler protection; best choice hides duplicate equity; Solver source/preview/edit states",
      ],
    };
  } finally {
    await context.close();
  }
};
