// Real browser controls, IndexedDB, exports, and real GNUbg opponent.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
module.exports = async function turnPolicy(
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
  const page = await context.newPage(),
    errors = [],
    screenshots = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const saved = () =>
    page.evaluate(async () =>
      (await import("/backgammon/core/storage.mjs")).get("work", "play"),
    );
  const wait = async (predicate) => {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const s = await saved();
      if (predicate(s)) return s;
      await page.waitForTimeout(30);
    }
    throw new Error("Saved turn did not reach expected state");
  };
  const finish = async () => {
    for (
      let i = 0;
      i < 4 && (await page.locator("#confirm").isDisabled());
      i++
    )
      await page
        .getByLabel("Accessible move selection", { exact: true })
        .selectOption({ index: 1 });
    await page.locator("#confirm").click();
  };
  const shot = async (name) => {
    const file = `${browserName}-turn-policy-${name}.png`;
    await page.screenshot({ path: path.join(out, file), fullPage: true });
    screenshots.push(file);
  };
  try {
    await page.addInitScript(() => {
      const original = crypto.getRandomValues.bind(crypto),
        values = [5, 0, 3, 1, 2, 0];
      crypto.getRandomValues = (a) =>
        a instanceof Uint8Array && a.length === 1 && values.length
          ? ((a[0] = values.shift()), a)
          : original(a);
    });
    await page.goto(base + "/backgammon/play/");
    await page
      .getByRole("button", { name: "Same device", exact: true })
      .click();
    await page.locator("#start-match").click();
    assert.equal(
      (await wait((s) => s?.game.started)).game.state.rules.jacoby,
      true,
    );
    await page.locator("#roll").click();
    await page.locator("#begin-turn").click();
    const original = (await saved()).game;
    await finish();
    const committed = await wait((s) => s?.game.events.length === 2);
    await page.locator("#undo-turn").click();
    await page.locator("#decline-undo").click();
    assert.deepEqual((await saved()).game.state, committed.game.state);
    await page.locator("#undo-turn").click();
    await page.setViewportSize({ width: 375, height: 667 });
    await shot("approval-phone");
    await page.locator("#accept-undo").click();
    await wait((s) => s?.game.undoLog?.length === 1 && !s.game.undoRequest);
    assert.deepEqual((await saved()).game.state, original.state);
    assert.equal(await page.locator("#undo-turn").count(), 0);
    await page.setViewportSize({ width: 1366, height: 768 });
    await finish();
    await page.locator("#roll").click();
    await wait(
      (s) => s?.game.state.phase === "move" && s.game.state.turn === 1,
    );
    const rolled = (await saved()).game.state.dice;
    await page.locator("#undo-turn").click();
    await page.locator("#accept-undo").click();
    await wait((s) => s?.game.undoLog?.length === 2 && !s.game.undoRequest);
    assert.deepEqual((await saved()).game.replayDice, [
      { actor: 1, dice: rolled },
    ]);
    await finish();
    await page.locator("#roll").click();
    await wait(
      (s) => s?.game.state.phase === "move" && s.game.state.turn === 1,
    );
    assert.deepEqual((await saved()).game.state.dice, rolled);
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
      await shot(`undo-${width}x${height}`);
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        bottom: document.querySelector("#undo-turn").getBoundingClientRect()
          .bottom,
      }));
      assert.ok(dimensions.width <= width + 1, JSON.stringify(dimensions));
      if (width > 320)
        assert.ok(
          dimensions.height <= height + 1 &&
            dimensions.bottom <= height + 1,
          `${width}x${height} ${JSON.stringify(dimensions)}`,
        );
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.evaluate(async (id) => {
      const store = await import("/backgammon/core/storage.mjs");
      const item = await store.get("items", id);
      await store.put("items", {
        ...item,
        notes: "Keep my annotation",
        title: "My recorded game",
      });
    }, original.id);
    await finish();
    await page
      .getByRole("button", { name: "New match", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await page.locator("#start-match").click();
    const second = await wait((s) => s?.game.id !== original.id);
    await page.goto(base + "/backgammon/library/#games");
    await page
      .getByRole("button", { name: "Open My recorded game", exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Item type", { exact: true }).inputValue(),
      "match",
    );
    await page.locator("#export-library").click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#export-games").click();
    const download = await downloadPromise,
      file = path.join(out, `${browserName}-game-history.json`);
    await download.saveAs(file);
    const exported = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.ok(
      exported.items.some(
        (i) =>
          i.id === original.id &&
          i.notes === "Keep my annotation" &&
          i.undoLog.length === 2,
      ),
    );
    assert.ok(exported.items.some((i) => i.id === second.game.id));
    assert.ok(exported.items.every((i) => i.kind === "match"));
    await page.evaluate(
      async (text) =>
        (await import("/backgammon/core/storage.mjs")).parseBackup(text),
      JSON.stringify(exported),
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Open My recorded game", exact: true })
      .waitFor();
    await shot("history");
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 667 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await shot(`history-${width}`);
    }
    await page.setViewportSize({ width: 1366, height: 768 });

    // Restore valid forced fixtures: no Hint/Confirm/pass interaction is needed.
    for (const type of ["pass", "bearoff", "already-rolled"]) {
      await page.goto(base + "/backgammon/");
      const id = await page.evaluate(async (type) => {
        const { initialState } = await import("/backgammon/core/rules.mjs");
        const store = await import("/backgammon/core/storage.mjs");
        const s = initialState({ matchLength: 0 });
        s.points.fill(0);
        s.phase = type === "already-rolled" ? "move" : "roll";
        if (type === "bearoff") {
          s.points[0] = 2;
          s.points[23] = -15;
          s.off = [13, 0];
        } else {
          s.points[5] = 14;
          s.bar = [1, 0];
          for (let i = 18; i < 24; i++) s.points[i] = -2;
          s.points[17] = -3;
        }
        if (type === "already-rolled") s.dice = [2, 1];
        const id = crypto.randomUUID();
        await store.put("work", {
          id: "play",
          game: {
            id,
            initial: s,
            state: s,
            events: [],
            started: true,
            names: ["Ivory", "Teal"],
            config: {
              mode: "local",
              humanSide: 0,
              matchLength: 0,
              rules: s.rules,
              strength: "quick",
            },
          },
          draft: [],
        });
        return id;
      }, type);
      await page.goto(base + "/backgammon/play/#resume=" + id);
      if (type !== "already-rolled") await page.locator("#roll").click();
      const completed = await wait(
        (s) => s?.game.id === id && s.game.events.at(-1)?.automatic,
      );
      assert.equal(
        completed.game.state.phase,
        type === "bearoff" ? "over" : "roll",
      );
      assert.equal(await page.locator("#confirm").count(), 0);
      assert.equal(await page.locator("#undo-turn").count(), 0);
      assert.equal(await page.locator("#hint").count(), 0);
      await shot(type);
    }
    // Genuine engine reply can be rewound with the human's last chosen turn.
    await page
      .getByRole("button", { name: "New match", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Computer", exact: true })
      .click();
    await page.locator("#start-match").click();
    await page.locator("#roll").click();
    await page.locator("#begin-turn").click();
    // A reload restarts the deterministic test dice, so the human wins 6–1.
    const source = (await saved()).game.state;
    await finish();
    await wait(
      (s) => s?.game.state.turn === 0 && s.game.state.phase === "roll",
    );
    await page.locator("#undo-turn").click();
    const rewound = await wait(
      (s) => s?.game.state.phase === "move" && s.game.undoLog?.length,
    );
    assert.deepEqual(rewound.game.state, source);
    assert.ok(rewound.game.replayDice.length > 0);
    assert.equal(rewound.game.config.mode, "computer");
    assert.deepEqual(errors, []);
    return {
      browserName,
      screenshots,
      cases: [
        "local accept/decline; original dice restored",
        "later revealed dice replayed without reroll",
        "nine viewport undo controls",
        "automatic persistent history, annotations and validated export",
        "forced pass, bearoff and old forced recovery",
        "real GNUbg reply and human turn rewound together",
      ],
    };
  } finally {
    await context.close();
  }
};
