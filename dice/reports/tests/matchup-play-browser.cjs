const assert = require("node:assert/strict");
const path = require("node:path");

module.exports = async function checkMatchupPlay(page, screenshotDir) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.locator('[data-match-tab="compare"]').click();
  await page.locator("#match-reset").click();
  await page.locator("[data-match-start]").click();
  assert.equal(
    await page.locator('[data-match-panel="play"]').isVisible(),
    true,
  );
  assert.equal(await page.locator("#match-play .die").count(), 4);
  const counts = () => page.locator(".match-play-count").allTextContents();
  const exact = () =>
    page
      .locator('[id^="match-play-exact-"]:not(#match-play-exact-bar)')
      .allTextContents();
  assert.deepEqual(await counts(), ["0", "0", "0"]);
  assert.deepEqual(await exact(), ["44.37%", "11.27%", "44.37%"]);
  await page.locator("#match-play-speed").selectOption("instant");
  const roll = async (faces) => {
    await page.evaluate((values) => {
      window.diceTestValues = values.map((face) => face - 1);
    }, faces);
    await page.locator("#match-play-roll").click();
  };
  await roll([6, 6, 1, 1]);
  await roll([1, 6, 2, 5]);
  await roll([1, 1, 6, 6]);
  assert.deepEqual(await counts(), ["1", "1", "1"]);
  assert.deepEqual(
    await page
      .locator('[id^="match-play-observed-"]:not(#match-play-observed-bar)')
      .allTextContents(),
    ["33.33%", "33.33%", "33.33%"],
  );
  assert.deepEqual(await exact(), ["44.37%", "11.27%", "44.37%"]);
  assert.match(
    await page.locator("#match-play-result").textContent(),
    /B wins by 10/,
  );
  assert.deepEqual(
    await page.locator("#match-play .die-value").allTextContents(),
    ["1", "1", "6", "6"],
  );
  assert.equal(await page.locator("#match-play-history li").count(), 3);
  // Switching rules opens a separate session and returning restores it.
  await page.locator("#match-play-a").selectOption("product");
  assert.deepEqual(await counts(), ["0", "0", "0"]);
  assert.deepEqual(await exact(), ["61.65%", "5.17%", "33.18%"]);
  await roll([2, 3, 1, 1]);
  assert.equal(await page.locator("#match-play-a-score").textContent(), "6");
  await page.locator("#match-play-a").selectOption("sum");
  assert.deepEqual(await counts(), ["1", "1", "1"]);
  assert.match(
    await page.locator("#match-play-result").textContent(),
    /B wins by 10/,
  );
  await page.locator("#match-play-handicap").fill("0.5");
  assert.deepEqual(await counts(), ["0", "0", "0"]);
  assert.equal((await exact())[1], "0.00%");
  await roll([1, 1, 1, 1]);
  assert.equal(await page.locator("#match-play-a-score").textContent(), "2.5");
  assert.match(
    await page.locator("#match-play-a-detail").textContent(),
    /Rule score 2 \+0.5 handicap/,
  );
  await page.locator("#match-play-handicap").fill("0.3");
  assert.equal(await page.locator("#match-play-roll").isDisabled(), true);
  assert.equal(await page.locator("#match-play-error").isVisible(), true);
  await page.locator("#match-play-handicap").fill("0");
  assert.deepEqual(await counts(), ["1", "1", "1"]);
  await page.locator("#match-play-reset").click();
  assert.deepEqual(await counts(), ["0", "0", "0"]);
  assert.equal(
    await page.locator("#match-play-rounds").textContent(),
    "0 rolls",
  );
  // Real motion: sampled once, four permanent faces tumble, tally waits for both pairs.
  await page.locator("#match-play-speed").selectOption("normal");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const moving = await page.evaluate(async () => {
    window.diceTestValues = [0, 5, 1, 2];
    document.querySelector("#match-play-roll").click();
    document.querySelector("#match-play-roll").click();
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    return {
      busy: document.querySelector("#match-play-roll").disabled,
      locked: ["a", "b", "handicap", "speed", "reset"].every(
        (id) => document.querySelector("#match-play-" + id).disabled,
      ),
      moving: document.querySelectorAll("#match-play .is-rolling").length,
      tally: document.querySelector("#match-play-rounds").textContent,
      hiddenScores: [
        ...document.querySelectorAll(".match-play-score strong"),
      ].every((el) => el.textContent === "—"),
    };
  });
  assert.equal(moving.busy, true);
  assert.equal(moving.locked, true);
  assert.ok(moving.moving >= 2);
  assert.equal(moving.tally, "0 rolls");
  assert.equal(moving.hiddenScores, true);
  await page.waitForFunction(
    () => !document.querySelector("#match-play-roll").disabled,
  );
  assert.deepEqual(await counts(), ["1", "0", "0"]);
  assert.deepEqual(
    await page.locator("#match-play .die-value").allTextContents(),
    ["1", "6", "2", "3"],
  );
  assert.ok(
    await page.locator("#match-play canvas").evaluateAll((canvases) =>
      canvases.every((canvas) =>
        canvas
          .getContext("2d")
          .getImageData(0, 0, canvas.width, canvas.height)
          .data.some((v, i) => i % 4 === 3 && v > 0),
      ),
    ),
  );
  await page.screenshot({
    path: path.join(screenshotDir, "matchup-play-desktop.png"),
  });
  // Leaving the report mid-roll settles exactly once, even after animation time passes.
  await page.evaluate(() => {
    window.diceTestValues = [0, 0, 0, 0];
    document.querySelector("#match-play-roll").click();
    document.querySelector('[data-view="explore"]').click();
  });
  await page.waitForTimeout(600);
  await page.locator('[data-view="matchups"]').click();
  assert.deepEqual(await counts(), ["1", "1", "0"]);
  // Hiding the document has the same settle-once behavior.
  await page.evaluate(() => {
    window.diceTestValues = [0, 0, 5, 5];
    document.querySelector("#match-play-roll").click();
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.hidden;
  });
  await page.waitForTimeout(600);
  assert.deepEqual(await counts(), ["1", "1", "1"]);
  // Reduced-motion still honors Normal while settling synchronously.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await roll([6, 6, 1, 1]);
  assert.equal(await page.locator("#match-play-roll").isDisabled(), false);
  assert.deepEqual(await counts(), ["2", "1", "1"]);
  await page.locator("#match-play-compare").click();
  assert.equal(await page.locator("#match-a").inputValue(), "sum");
  await page.locator("#match-b").selectOption("mod10");
  await page.locator("[data-match-start]").click();
  assert.equal(await page.locator("#match-play-b").inputValue(), "mod10");
  await roll([6, 6, 6, 6]);
  assert.equal(await page.locator("#match-play-b-score").textContent(), "2");
  for (const [width, height] of [
    [390, 844],
    [320, 568],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width, height });
    await page
      .locator("#matchups-workspace")
      .evaluate((el) => (el.scrollTop = 0));
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.ok(
      await page
        .locator("#matchups-workspace")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    );
    const rollBounds = await page.locator("#match-play-roll").boundingBox();
    assert.ok(
      rollBounds.y >= 0 && rollBounds.y + rollBounds.height <= height,
      "Roll button stays visible at phone and tablet sizes",
    );
    assert.ok(
      await page.locator(".match-play-dice").evaluateAll((containers) =>
        containers.every((container) => {
          const box = container.getBoundingClientRect();
          return [...container.querySelectorAll(".die")].every((die) => {
            const r = die.getBoundingClientRect();
            return r.left >= box.left && r.right <= box.right;
          });
        }),
      ),
    );
    await page.screenshot({
      path: path.join(screenshotDir, `matchup-play-${width}.png`),
    });
    if (width <= 390) {
      await page
        .locator(".match-play-stats")
        .evaluate((el) => el.scrollIntoView({ block: "start" }));
      const dock = await page.locator("#match-play-roll").boundingBox();
      assert.ok(
        dock.y >= 0 && dock.y + dock.height <= height,
        "Roll remains reachable while inspecting counts and exact odds",
      );
      await page.screenshot({
        path: path.join(screenshotDir, `matchup-play-stats-${width}.png`),
      });
    }
    await roll([1, 1, 2, 3]);
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.locator('[data-match-tab="compare"]').click();
};
