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
  const engineWorkers = () => page.workers().filter(w =>
    new URL(w.url()).pathname.endsWith('/engine/worker.mjs'));
  const readEquity = () => page.locator('#equity-bar').evaluate(n => {
    const bottom=n.querySelector('.equity-bottom-number').textContent;
    const top=n.querySelector('.equity-top-number').textContent;
    if ([bottom,top].filter(Boolean).length!==1 || !/^\d+\.\d{3}$/.test(bottom||top)) throw Error('Only the positive side has an unsigned number');
    return bottom ? Number(bottom) : -Number(top);
  });
  const assertPortraitBar = async () => {
    const geometry = await page.locator('#equity-bar').evaluate(n => {
      const bar = n.getBoundingClientRect(),
        board = n.parentElement.querySelector('.bg-board').getBoundingClientRect(),
        slot = n.parentElement.getBoundingClientRect(),
        meter = n.querySelector('.equity-meter').getBoundingClientRect(),
        fill = n.querySelector('.equity-fill'),
        filled = fill.getBoundingClientRect();
      return {
        below: bar.top >= board.top + (board.height + Math.min(board.height, board.width * 660 / 876)) / 2 - 1,
        contained: bar.bottom <= slot.bottom + 1,
        horizontal: bar.width > bar.height * 5,
        // The bottom player's share fills from the right in portrait.
        fraction: filled.width / (meter.width - 2),
        expected: parseFloat(fill.style.getPropertyValue('--equity-fraction')) / 100,
        rightGap: meter.right - filled.right,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.ok(geometry.below && geometry.contained && geometry.horizontal && !geometry.overflow, JSON.stringify(geometry));
    assert.ok(Math.abs(geometry.fraction - geometry.expected) < .01, JSON.stringify(geometry));
    assert.ok(Math.abs(geometry.rightGap - 1) < 1);
  };
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
      st.saveSettings({ equityBar: false, analysisAhead: false, interactionMode: "beginner" });
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
      [375, 812],
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
          top: e.top,
          bottom: e.bottom,
          barWidth: e.width,
          boardLeft: left,
          boardRight: left + w,
          boardBottom: b.top + (b.height + (w * 660) / 876) / 2,
          nextTop: document.querySelector('#player').getBoundingClientRect().top,
          height: e.height,
          expected: (w * 660) / 876,
        };
      });
      assert.ok(
        geometry.width <= width + 1 &&
          geometry.primaryLeft >= 0 &&
          geometry.primaryRight <= width + 1 &&
          geometry.left >= -1 &&
          geometry.right <= width + 1,
        JSON.stringify({ width, height, geometry }),
      );
      if (width <= 700 && height > width) {
        assert.ok(Math.abs(geometry.left - geometry.boardLeft) < 2);
        assert.ok(Math.abs(geometry.right - geometry.boardRight) < 2);
        assert.ok(geometry.barWidth > geometry.height * 5);
        assert.ok(Math.abs(geometry.top - geometry.boardBottom - 4) < 2);
        assert.ok(geometry.bottom <= geometry.nextTop + 1, 'equity stays clear of the player strip');
        assert.equal(geometry.height, 24);
        assert.ok(geometry.boardRight - geometry.boardLeft >= width - 20, 'portrait board uses the full phone width');
      } else {
        assert.ok(geometry.right <= geometry.boardLeft + 1);
        assert.ok(Math.abs(geometry.height - geometry.expected) < 2);
      }
      if ([320, 375, 390, 430, 844, 1440].includes(width))
        await page.screenshot({
          path: path.join(out, `${name}-equity-bar-${width}x${height}.png`),
        });
    }
    await page.setViewportSize({width:390, height:844});
    await page.waitForTimeout(80);
    await assertPortraitBar();
    const initialValue = await readEquity();
    await page.evaluate(async () => {
      const st = await import("/backgammon/core/storage.mjs");
      st.saveSettings({ orientation: 1 });
      dispatchEvent(new Event("bg-settings"));
    });
    assert.equal(
      await readEquity(),
      -initialValue,
    );
    await assertPortraitBar();
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
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("x");
    await page.locator('#equity-bar[data-state="ready"]').waitFor();
    await clickTool(page, "#equity-toggle");
    await page.waitForTimeout(50);
    assert.equal(engineWorkers().length, 0, "hiding equity releases its engine; saving stays independent");
    // Cancellation during initialization must release the worker and reject stale completion.
    // Block both backends: a failed SIMD load alone intentionally falls back.
    const wasmAssets = /\/engine\/vendor\/(?:simd\/)?gnubg-core-module\.wasm(?:\?.*)?$/;
    await page.route(wasmAssets, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.continue().catch(() => {});
    });
    await clickTool(page, "#equity-toggle");
    await page.locator('#equity-bar[data-state="loading"]').waitFor();
    await clickTool(page, "#equity-toggle");
    await page.waitForTimeout(300);
    assert.equal(engineWorkers().length, 0, "cancelled engine initialization leaves no evaluation worker");
    assert.equal(await page.locator("#equity-bar").isVisible(), false);
    await page.unroute(wasmAssets);
    await page.route(wasmAssets, (route) => route.abort());
    await clickTool(page, "#equity-toggle");
    await page
      .locator('#equity-bar[data-state="error"]')
      .waitFor({ timeout: 60000 });
    const retry = await page.locator('.equity-retry').boundingBox(),
      player = await page.locator('#player').boundingBox();
    assert.ok(retry.height >= 44 && retry.y + retry.height <= player.y);
    await page.unroute(wasmAssets);
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
          await readEquity(),
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
    // The accessible move selector lives in the desktop inspector.
    await page.setViewportSize({width:1440, height:900});
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
    await page.setViewportSize({width:390, height:844});
    await page.waitForTimeout(80);
    await assertPortraitBar();
    await page.screenshot({
      path: path.join(out, `${name}-trainer-best-equity.png`),
    });
    await page.setViewportSize({width:1440, height:900});
    await page.goto(base + "/backgammon/solver/");
    await page.getByText("Analysis settings", { exact: true }).click();
    await page
      .getByLabel("Analysis strength", { exact: true })
      .locator('[data-choice="quick"]').click();
    await page.locator("#analyze").click();
    await page
      .locator('#equity-bar[data-state="ready"]')
      .waitFor({ timeout: 60000 });
    await page.setViewportSize({width:390, height:844});
    await page.waitForTimeout(80);
    await assertPortraitBar();
    await page.screenshot({path:path.join(out, `${name}-solver-equity-portrait.png`)});
    await page.setViewportSize({width:375, height:667});
    await page.waitForTimeout(80);
    await assertPortraitBar();
    await page.screenshot({path:path.join(out, `${name}-solver-equity-small-portrait.png`)});
    await page.setViewportSize({width:1440, height:900});
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
        "toggle off; real GNUbg equity; ten sizes; portrait bottom bar; landscape/desktop left rail; orientation reversal",
        "draft grading, cube offer/response, stale clearing, loading cancellation, off releases worker, error/retry, reload",
        "trainer spoiler protection; best choice hides duplicate equity; Solver source/preview/edit states",
      ],
    };
  } finally {
    await context.close();
  }
};
