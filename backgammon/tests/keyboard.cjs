const assert = require("node:assert/strict"),
  path = require("node:path");
module.exports = async function keyboardUX(
  browser,
  base,
  out,
  browserName,
) {
  const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      serviceWorkers: "block",
      reducedMotion: "reduce",
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const saved = () =>
    page.evaluate(
      async () =>
        await (
          await import("/backgammon/core/storage.mjs")
        ).get("work", "play"),
    );
  const wait = async (predicate) => {
    const until = Date.now() + 15000;
    while (Date.now() < until) {
      const v = await saved();
      if (predicate(v)) return v;
      await page.waitForTimeout(30);
    }
    throw new Error(
      "Keyboard state timed out: " +
        JSON.stringify({
          saved: await saved(),
          errors,
          ui: await page.evaluate(() => ({
            focus: document.activeElement?.outerHTML,
            message: document.querySelector("#message")?.textContent,
            selected:
              document.querySelector(".point.selected")?.dataset.point,
            dialogs: document.querySelectorAll("dialog[open]").length,
          })),
        }),
    );
  };
  try {
    await page.goto(base + "/backgammon/");
    const id = await page.evaluate(async () => {
      const r = await import("/backgammon/core/rules.mjs"),
        st = await import("/backgammon/core/storage.mjs");
      const s = r.initialState({
          phase: "move",
          dice: [4, 3],
          matchLength: 0,
        }),
        id = crypto.randomUUID();
      await st.put("work", {
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
            strength: "quick",
            matchLength: 0,
            rules: s.rules,
          },
        },
        draft: [],
        positionKey: r.positionKey(s),
      });
      return id;
    });
    await page.goto(base + "/backgammon/play/#resume=" + id);
    await page.locator("#confirm").waitFor();
    await page.keyboard.press("1");
    await page.keyboard.press("r");
    assert.deepEqual(
      (await wait((s) => s.draft.length === 1)).draft.map((s) => [
        s.from,
        s.to,
        s.die,
      ]),
      [[12, 8, 4]],
    );
    await page.keyboard.press("z");
    await wait((s) => !s.draft.length);
    await page.keyboard.press("Shift+E");
    await wait((s) => s.draft.length === 1);
    await page.keyboard.press("x");
    await wait((s) => !s.draft.length);
    await page.keyboard.press("f");
    assert.equal(
      await page.evaluate(
        async () =>
          (await import("/backgammon/core/storage.mjs")).settings()
            .orientation,
      ),
      1,
    );
    await page.keyboard.press("]");
    assert.equal(
      await page.locator(".point.selected").getAttribute("data-point"),
      "23",
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".point.selected").count(), 0);
    await page.keyboard.press("f");
    await page.keyboard.press("1");
    await page.keyboard.press("r");
    await page.keyboard.press("1");
    await page.keyboard.press("e");
    await wait((s) => s.draft.length === 2);
    await page.keyboard.press("Enter");
    await wait(
      (s) => s.game.state.phase === "roll" && s.game.state.turn === 1,
    );
    await page.keyboard.press("c");
    await wait((s) => s.game.state.phase === "double");
    await page.keyboard.press("t");
    await wait(
      (s) => s.game.state.phase === "roll" && s.game.state.cube.value === 2,
    );
    await page.keyboard.press("Space");
    await wait((s) => s.game.events.some((e) => e.action.type === "roll"));
    // Remapping, conflicting keys, native dialog typing, disabled shortcuts and persistence.
    await page.keyboard.press("?");
    await page.getByLabel("Top 1", { exact: true }).waitFor();
    const before = (await saved()).game;
    await page.getByLabel("Top 1", { exact: true }).fill("j");
    await page.getByLabel("Hint", { exact: true }).fill("q");
    await page.locator("#save-shortcuts").focus();
    await page.keyboard.press("Enter");
    assert.match(
      await page.locator('.settings-content [role="alert"]').innerText(),
      /conflicts/,
    );
    await page.getByLabel("Hint", { exact: true }).fill("h");
    await page.locator("#save-shortcuts").focus();
    await page.keyboard.press("Enter");
    assert.deepEqual((await saved()).game, before);
    await page.screenshot({
      path: path.join(out, `${browserName}-keyboard-settings.png`),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    assert.equal(
      await page.evaluate(
        async () =>
          (await import("/backgammon/core/storage.mjs")).settings()
            .shortcuts.top0[0],
      ),
      "j",
    );
    await page.reload();
    assert.equal(
      await page.evaluate(
        async () =>
          (await import("/backgammon/core/storage.mjs")).settings()
            .shortcuts.top0[0],
      ),
      "j",
    );
    // D has the opposite meaning only while answering an offer.
    await page.goto(base + "/backgammon/");
    const pendingId = await page.evaluate(async () => {
      const r = await import("/backgammon/core/rules.mjs"),
        st = await import("/backgammon/core/storage.mjs");
      const initial = r.initialState({ phase: "roll", matchLength: 0 }),
        action = { type: "double" },
        s = r.transition(initial, action, 0),
        id = crypto.randomUUID();
      await st.put("work", {
        id: "play",
        game: {
          id,
          initial,
          state: s,
          events: [{ actor: 0, action }],
          started: true,
          names: ["Ivory", "Teal"],
          config: {
            mode: "local",
            humanSide: 0,
            strength: "quick",
            matchLength: 0,
            rules: s.rules,
          },
        },
        draft: [],
        positionKey: r.positionKey(s),
      });
      return id;
    });
    await page.goto(base + "/backgammon/play/#resume=" + pendingId);
    await page.locator("#drop-cube").waitFor();
    await page.keyboard.press("d");
    await wait((s) => s.game.state.phase === "over");
    await page.locator("#next-game").waitFor();
    await page.keyboard.press("Enter");
    await wait((s) => s.game.state.phase === "opening");
    await page.evaluate(() => {
      const original = crypto.getRandomValues.bind(crypto),
        dice = [5, 0];
      crypto.getRandomValues = (a) =>
        a instanceof Uint8Array && a.length === 1 && dice.length
          ? ((a[0] = dice.shift()), a)
          : original(a);
    });
    await page.keyboard.press("Space");
    await page.locator("#begin-turn").waitFor();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("#begin-turn").count(), 0);
    await page.keyboard.press("j");
    assert.equal(
      await page.locator(".point.selected").getAttribute("data-point"),
      "12",
    );
    await page.keyboard.press("Escape");
    await page.keyboard.press("?");
    await page.getByLabel("Enable game shortcuts").uncheck();
    await page.keyboard.press("Escape");
    await page.keyboard.press("j");
    assert.equal(await page.locator(".point.selected").count(), 0);
    await page.evaluate(async () =>
      (await import("/backgammon/core/storage.mjs")).saveSettings({
        keyboardEnabled: true,
      }),
    );
    for (const kind of ["bar", "off"]) {
      await page.goto(base + "/backgammon/");
      const fixture = await page.evaluate(async (kind) => {
        const r = await import("/backgammon/core/rules.mjs"),
          st = await import("/backgammon/core/storage.mjs");
        const points = Array(24).fill(0);
        points[23] = -15;
        if (kind === "bar") points[5] = 14;
        else {
          points[0] = 1;
          points[2] = 1;
          points[5] = 1;
        }
        const initial = r.initialState({
            phase: "move",
            dice: kind === "bar" ? [3, 1] : [2, 1],
            points,
            bar: kind === "bar" ? [1, 0] : [0, 0],
            off: kind === "bar" ? [0, 0] : [12, 0],
            matchLength: 0,
          }),
          id = crypto.randomUUID();
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
              mode: "local",
              humanSide: 0,
              strength: "quick",
              matchLength: 0,
              rules: initial.rules,
            },
          },
          draft: [],
          positionKey: r.positionKey(initial),
        });
        return id;
      }, kind);
      await page.goto(base + "/backgammon/play/#resume=" + fixture);
      await page.locator("#confirm").waitFor();
      if (kind === "bar") {
        await page.keyboard.press("Escape");
        await page.keyboard.press("b");
        assert.equal(
          await page.locator(".point.selected").getAttribute("data-point"),
          "bar0",
        );
      } else {
        await page.keyboard.press("a");
        assert.equal(
          (await wait((s) => s.draft.length === 1)).draft[0].to,
          "off",
        );
      }
    }
    assert.deepEqual(errors, []);
    return {
      browser: browserName,
      cases: [
        "keyboard-only checker turns, undo/reset, orientation and confirmation",
        "Space rolls; C doubles; T takes; D drops; Enter starts next game and acknowledges opening",
        "editable bindings, collisions, form isolation and reload persistence",
      ],
      screenshots: [`${browserName}-keyboard-settings.png`],
    };
  } finally {
    await context.close();
  }
};
