const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async function practiceUX(browser, base, out, name) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const saved = () =>
    page.evaluate(
      async () =>
        (
          await (
            await import("/backgammon/core/storage.mjs")
          ).get("work", "play")
        ).game,
    );
  const wait = async (pred) => {
    for (let i = 0; i < 600; i++) {
      const v = await saved();
      if (pred(v)) return v;
      await page.waitForTimeout(100);
    }
    throw Error("Practice state did not settle");
  };
  const choose = async (id, dice) => {
    await page.locator("#" + id).click();
    const d = page.getByRole("dialog");
    await d
      .getByLabel("Die 1", { exact: true })
      .selectOption(String(dice[0]));
    await d
      .getByLabel("Die 2", { exact: true })
      .selectOption(String(dice[1]));
    await d.getByRole("button", { name: "Set roll", exact: true }).click();
    await d.waitFor({ state: "detached" });
  };
  try {
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
        started: true,
        events: [],
        names: ["You", "GNUbg"],
        config: {
          mode: "computer",
          humanSide: 0,
          strength: "quick",
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
    for (const id of [
      "undo-turn",
      "reroll",
      "reroll-bot",
      "set-roll",
      "set-bot-roll",
    ])
      assert.equal(await page.locator("#help-actions #" + id).count(), 1);
    assert.equal(await page.locator("#actions #double-cube").count(), 1);
    const help = await page.locator("#help-actions").boundingBox(),
      main = await page.locator("#actions").boundingBox();
    assert.ok(help.x + help.width <= main.x);
    await page.screenshot({
      path: path.join(out, `${name}-practice-desktop.png`),
    });
    await choose("set-roll", [3, 2]);
    await wait((g) => g.events.at(-1)?.action.type === "practice-roll");
    assert.deepEqual((await saved()).state.dice, [3, 2]);
    await page.reload();
    await page.locator("#confirm").waitFor();
    assert.deepEqual((await saved()).state.dice, [3, 2]);
    await page.evaluate(() => {
      const original = crypto.getRandomValues.bind(crypto);
      let dice = [4, 3];
      crypto.getRandomValues = (a) =>
        a instanceof Uint8Array && a.length === 1 && dice.length
          ? ((a[0] = dice.shift()), a)
          : original(a);
    });
    await page.locator("#reroll").click();
    await wait((g) => g.state.dice.join(",") === "5,4");
    // Replacing our previous roll rewinds the bot’s old reply as well.
    assert.equal(await page.locator("#set-bot-roll").isDisabled(), true);
    for (
      let i = 0;
      i < 4 &&
      (await page.locator("#confirm").count()) &&
      (await page.locator("#confirm").isDisabled());
      i++
    ) {
      await page
        .getByLabel("Accessible move selection", { exact: true })
        .selectOption({ index: 1 });
    }
    if (await page.locator("#confirm").count())
      await page.locator("#confirm").click();
    await wait((g) => g.state.turn === 0 && g.state.phase === "roll");
    await choose("set-bot-roll", [2, 1]);
    const botPlayed = await wait(
      (g) =>
        g.state.turn === 0 &&
        g.state.phase === "roll" &&
        g.events.some(
          (e) => e.action.type === "practice-roll" && e.actor === 1,
        ),
    );
    assert.equal(botPlayed.events.at(-1).actor, 1);
    assert.deepEqual(
      botPlayed.events.find(
        (e) => e.action.type === "practice-roll" && e.actor === 1,
      ).action.dice,
      [2, 1],
    );
    await page.locator("#reroll-bot").click();
    await wait(
      (g) =>
        g.state.turn === 0 &&
        g.state.phase === "roll" &&
        g.undoLog.length > botPlayed.undoLog.length,
    );
    const backup = await page.evaluate(async () => {
      const st = await import("/backgammon/core/storage.mjs");
      const b = await st.backup(true);
      return { parsed: st.parseBackup(b), raw: b };
    });
    assert.match(backup.raw, /practice-roll/);
    assert.ok(backup.parsed.items.length > 0);
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
      await page.waitForTimeout(80);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${width} document overflow`,
      );
      const box = await page.locator("#actions").boundingBox();
      if (width > 360)
        assert.ok(
          box.y + box.height <= height + 1,
          `${width} primary controls below viewport`,
        );
      await page.locator("#set-bot-roll").click();
      const dims = await page.getByRole("dialog").evaluate((e) => ({
        h: e.clientHeight,
        s: e.scrollHeight,
        w: e.clientWidth,
        sw: e.scrollWidth,
      }));
      assert.ok(
        dims.s <= dims.h + 1 && dims.sw <= dims.w + 1,
        `${width} dice dialog scroll`,
      );
      if ([375, 844, 1440].includes(width))
        await page.screenshot({
          path: path.join(out, `${name}-practice-set-dice-${width}.png`),
        });
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "detached" });
    }
    assert.deepEqual(errors, []);
    return {
      browser: name,
      cases: [
        "separate help/decision groups",
        "set and random reroll for each side; real GNUbg resumes",
        "refresh keeps dice; JSON backup includes removed lines",
        "nine viewport sizes and non-scrolling dice dialog",
      ],
    };
  } finally {
    await context.close();
  }
};
