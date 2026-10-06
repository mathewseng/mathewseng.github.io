// Browser-level interaction acceptance. No mocked engine or app-only test hooks.
const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async function checkerUX(browser, base, out, browserName) {
  const report = { browser: browserName, cases: [], screenshots: [] };
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    serviceWorkers: "block",
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = async (name) => {
    const file = `${browserName}-ux-${name}.png`;
    await page.screenshot({
      path: path.join(out, file),
      fullPage: true,
      animations: "disabled",
    });
    report.screenshots.push(file);
  };
  const seed = async (p, dice) =>
    p.addInitScript((values) => {
      const random = crypto.getRandomValues.bind(crypto),
        bytes = values.map((n) => n - 1);
      crypto.getRandomValues = (a) =>
        a instanceof Uint8Array && a.length === 1 && bytes.length
          ? ((a[0] = bytes.shift()), a)
          : random(a);
    }, dice);
  try {
    await seed(page, [3, 3, 6, 1]);
    await page.clock.install();
    await page.goto(base + "/backgammon/play/");
    await page
      .getByRole("button", { name: "Same device", exact: true })
      .click();
    await page.getByLabel("Match length", { exact: true }).selectOption("5");
    await page.locator("#start-match").click();
    await page.clock.runFor(200);
    await shot("opening-ready");
    await page.locator("#roll").click();
    await page
      .locator('.opening-die .die[aria-hidden="true"]')
      .first()
      .waitFor();
    await page.clock.runFor(160);
    assert.equal(await page.locator(".opening-player.revealed").count(), 1);
    assert.equal(
      await page
        .locator('.opening-player[data-player="1"] .die')
        .getAttribute("aria-hidden"),
      "true",
    );
    await shot("first-die");
    await page.clock.runFor(650);
    assert.match(await page.locator(".opening-roll h2").innerText(), /tie/);
    assert.equal(await page.locator(".opening-die .die").count(), 2);
    await shot("opening-tie");
    await page.locator("#roll").click();
    await page.locator('.opening-die .die[aria-label="6"]').waitFor();
    await page.clock.runFor(800);
    await page.clock.resume();
    const saved = () =>
      page.evaluate(
        async () =>
          (
            await (
              await import("/backgammon/core/storage.mjs")
            ).get("work", "play")
          ).game,
      );
    const openingGame = await saved();
    assert.deepEqual(openingGame.state.dice, [6, 1]);
    assert.equal(openingGame.events.length, 2);
    assert.equal(await page.locator(".movable").count(), 0);
    assert.equal(await page.locator("#dice").isVisible(), false);
    await shot("opening-winner");
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
        const fontStress = width === 320 ? await page.addStyleTag({ content: ".app { font-family: Verdana, sans-serif; }" }) : null;
        await page.waitForTimeout(100);
        await shot(`opening-${width}x${height}`);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `opening layout overflow ${width}x${height}: ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("body *")].filter(n=>n.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(n=>({tag:n.tagName,id:n.id,class:n.getAttribute("class"),right:n.getBoundingClientRect().right}))))}`,
        );
        if (width > 320)
          assert.ok(
            await page
              .locator("#begin-turn")
              .evaluate((n) => n.getBoundingClientRect().bottom <= innerHeight),
          );
        if (fontStress) await fontStress.evaluate(n=>n.remove());
      }
      await page.setViewportSize({ width: 1366, height: 768 });
    }
    await page.reload();
    await page.locator("#resume-match").click();
    if (await page.locator("#show-opening").count())
      await page.locator("#show-opening").click();
    assert.deepEqual((await saved()).events, openingGame.events);
    await page.locator("#begin-turn").click();
    assert.ok(await page.locator(".movable").count());
    await page.clock.resume();
    report.cases.push(
      "separate opening dice",
      "ties reroll without doubles",
      "opening acknowledged before moves",
      "refresh preserves committed dice",
    );

    // Mount the same production shell/board with deterministic valid positions.
    await page.evaluate(async () => {
      const { shell, DraftBoard } = await import("/backgammon/ui/shell.mjs");
      const rules = await import("/backgammon/core/rules.mjs");
      const geometry = await import("/backgammon/ui/board.mjs");
      const store = await import("/backgammon/core/storage.mjs");
      const ui = shell("play", "Checker interaction");
      const draft = new DraftBoard(ui.board);
      window.checkerTest = { draft, rules, geometry, store };
    });
    const load = async (kind = "opening", orientation = 0) =>
      page.evaluate(
        ({ kind, orientation }) => {
          const { draft: d, rules: r, store } = window.checkerTest;
          store.saveSettings({ orientation, motion: "system" });
          let s = r.initialState({
            matchLength: 0,
            phase: "move",
            dice: kind === "doubles" ? [1, 1] : [3, 1],
          });
          if (kind === "chain" || kind === "double-chain") {
            s.points = Array(24).fill(0);
            s.points[23] = 1;
            s.points[18] = -15;
            s.off = [14, 0];
            s.dice = kind === "chain" ? [3, 1] : [2, 2];
          }
          if (kind === "bar" || kind === "blocked") {
            s.points = Array(24).fill(0);
            s.points[5] = 14;
            s.bar = [1, 0];
            s.dice = [1, 2];
            if (kind === "bar") {
              s.points[23] = -1;
              s.points[18] = -14;
            } else {
              for (let i = 18; i < 24; i++) s.points[i] = -2;
              s.points[11] = -3;
            }
          }
          if (kind === "bearoff") {
            s.points = Array(24).fill(0);
            s.points[0] = 2;
            s.points[23] = -15;
            s.off = [13, 0];
            s.dice = [1, 2];
          }
          if (kind === "tall") {
            s.points = Array(24).fill(0);
            s.points[12] = 15;
            s.points[23] = -15;
            s.dice = [3, 2];
          }
          r.assertState(s);
          d.set(s, r.legalPaths(s));
          return s;
        },
        { kind, orientation },
      );
    const info = () =>
      page.evaluate(() => ({
        draft: checkerTest.draft.draft,
        state: checkerTest.draft.current(),
        selected: checkerTest.draft.selected,
        complete: checkerTest.draft.complete(),
        candidates: checkerTest.draft.candidates(),
      }));
    const pos = async (point, origin = false) =>
      page.evaluate(
        ({ point, origin }) => {
          const { draft: d, geometry: g, store } = checkerTest,
            orientation = store.settings().orientation;
          let p;
          if (origin)
            p = g.checkerPosition(
              d.current(),
              point,
              d.state.turn,
              orientation,
            );
          else if (typeof point === "number") {
            const q = g.pointGeometry(point, orientation);
            p = { x: q.x + 30, y: q.top ? 110 : 480 };
          } else
            p =
              point === "bar"
                ? { x: 408, y: d.state.turn !== orientation ? 100 : 446 }
                : { x: 843, y: d.state.turn !== orientation ? 140 : 460 };
          const client = new DOMPoint(p.x, p.y).matrixTransform(
            d.board.svg.getScreenCTM(),
          );
          return { x: client.x, y: client.y };
        },
        { point, origin },
      );
    const drag = async (from, to, { cancel = false, outside = false } = {}) => {
      const a = await pos(from, true),
        b = outside ? { x: 2, y: 2 } : await pos(to);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 10 });
      assert.equal(await page.locator(".drag-checker").count(), 1);
      if (cancel) await page.keyboard.press("Escape");
      await page.mouse.up();
    };
    await load();
    assert.equal(await page.locator(".movable").count(), 4);
    const firstDie = page.locator("#dice [role=button]").first();
    const dieNumber = await firstDie.getAttribute("data-die");
    await firstDie.focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.die),
      dieNumber,
    );
    assert.equal(await firstDie.getAttribute("aria-pressed"), "true");
    await page.keyboard.press("Space");
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.die),
      dieNumber,
    );
    assert.equal(await firstDie.getAttribute("aria-pressed"), "false");
    const st = (await info()).candidates[0];
    await page.locator(`[data-point="${st.from}"]`).click();
    assert.ok(await page.locator(".destination .landing-ring").count());
    assert.ok(await page.locator(".destination-die").count());
    await page.locator('[data-point="11"]').click(); // blocked by five opposing checkers
    assert.equal((await info()).draft.length, 0);
    assert.equal((await info()).selected, st.from);
    assert.match(await page.locator("#draft-line").innerText(), /blocked/);
    await page.locator(`[data-point="${st.to}"]`).click();
    assert.equal((await info()).draft.length, 1);
    assert.equal(await page.locator(".board-die.consumed").count(), 1);
    await page.evaluate(() => checkerTest.draft.undo()); // interrupt an in-flight animation
    assert.equal((await info()).draft.length, 0);
    await page.waitForFunction(
      () => !document.querySelector(".moving-checker"),
      null,
      { timeout: 1500 },
    );
    assert.equal(
      await page.locator(".moving-checker,[data-arriving]").count(),
      0,
    );
    report.cases.push(
      "movable source cues",
      "destination die labels and landing rings",
      "blocked tap preserves selection",
      "tap move and used die",
      "undo during animation",
    );
    for (const orientation of [0, 1]) {
      await load("opening", orientation);
      const move = (await info()).candidates[0];
      await drag(move.from, move.to);
      assert.deepEqual((await info()).draft, [move]); // native click must not duplicate the drop
      await page.evaluate(() => checkerTest.draft.undo());
      await drag(move.from, move.to, { outside: true });
      assert.equal((await info()).draft.length, 0);
      await drag(move.from, move.to, { cancel: true });
      assert.equal((await info()).draft.length, 0);
      assert.equal(await page.locator(".drag-checker").count(), 0);
    }
    await load();
    const cancelled = (await info()).candidates[0],
      a = await pos(cancelled.from, true),
      b = await pos(cancelled.to);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.evaluate(() =>
      checkerTest.draft.board.svg.dispatchEvent(
        new PointerEvent("pointercancel", {
          pointerId: checkerTest.draft.board.pointer.id,
        }),
      ),
    );
    await page.mouse.up();
    assert.equal((await info()).draft.length, 0);
    assert.equal(await page.locator(".drag-checker").count(), 0);
    report.cases.push(
      "pointer cancellation",
      "mouse drag in both orientations",
      "outside drop cancels",
      "Escape cancels drag",
      "no duplicate synthetic click",
    );
    await load("bar");
    assert.equal((await info()).selected, "bar");
    assert.equal(await page.locator(".movable").count(), 1);
    await drag("bar", 23);
    assert.equal((await info()).state.bar[1], 1);
    assert.equal((await info()).state.points[23], 1);
    await page.evaluate(() => checkerTest.draft.undo());
    assert.deepEqual((await info()).state.bar, [1, 0]);
    assert.equal((await info()).state.points[23], -1);
    await shot("bar-entry");
    for (const orientation of [0, 1]) {
      await load("bar", orientation);
      await page.locator('[data-point="23"]').click();
      assert.equal((await info()).selected, 23);
      assert.equal(
        await page
          .locator('[data-point="bar0"] .destination-die')
          .textContent(),
        "↶",
      );
      const alternate = page.locator(
        '[data-point="22"].entry-switch-destination',
      );
      assert.equal(
        await alternate.locator(".destination-die").textContent(),
        "↔2",
      );
      assert.match(
        await alternate.getAttribute("aria-label"),
        /change bar entry to die 2 instead of 1/,
      );
      assert.ok(await page.locator('[data-point="21"].destination').count());
      assert.match(
        await page.locator("#draft-line").innerText(),
        /change the entry die/,
      );
      await shot(`bar-alternate-${orientation}`);
      await page.locator('[data-point="18"]').click();
      assert.match(await page.locator("#draft-line").innerText(), /blocked/);
      assert.equal((await info()).draft.length, 1);
      await alternate.click();
      assert.deepEqual((await info()).draft, [{ from: "bar", to: 22, die: 2 }]);
      assert.equal((await info()).state.points[23], -1);
      assert.equal((await info()).state.bar[1], 0);
      assert.equal(await page.locator(".board-die.consumed").count(), 1);
      await drag(22, 23);
      assert.equal((await info()).draft[0].die, 1);
      assert.equal((await info()).state.bar[1], 1);
      await page.locator('[data-point="22"]').focus();
      await page.keyboard.press("Enter");
      assert.equal((await info()).draft[0].die, 2);
      await page.evaluate(() => {
        document.querySelector("#entry-picker")?.remove();
        const picker = checkerTest.draft.picker();
        picker.id = "entry-picker";
        document.querySelector(".action-area").append(picker);
      });
      await page.locator("#entry-picker").selectOption("switch-0");
      assert.equal((await info()).draft[0].die, 1);
      await page.evaluate(() => checkerTest.draft.reset());
      assert.deepEqual((await info()).state.bar, [1, 0]);
    }
    await page.locator("#entry-picker").evaluate((n) => n.remove());
    if (browserName === "chromium") {
      for (const preset of ["slate", "linen"]) {
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
          await page.evaluate(async (preset) => {
            const theme = { version: 1, preset, colors: {}, patterns: {} };
            checkerTest.store.saveSettings({ boardTheme: theme });
            (await import("/backgammon/core/appearance.mjs")).applyBoardTheme(
              theme,
            );
          }, preset);
          await load("bar");
          await page.locator('[data-point="23"]').click();
          await shot(`bar-switch-${preset}-${width}x${height}`);
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
          );
        }
      }
      await page.evaluate(async () => {
        const theme = { version: 1, preset: "slate", colors: {}, patterns: {} };
        checkerTest.store.saveSettings({ boardTheme: theme });
        (await import("/backgammon/core/appearance.mjs")).applyBoardTheme(
          theme,
        );
      });
      await page.setViewportSize({ width: 1366, height: 768 });
    }
    report.cases.push(
      "alternate bar die auto-highlight",
      "tap and drag entry revision restores hits and dice",
      "keyboard and selector entry revision",
      "bar revision in both orientations",
    );
    await load("bearoff");
    await page.locator('[data-point="0"]').click();
    await page.locator('[data-point="off0"]').click();
    await page.getByRole("dialog", { name: "Choose a die" }).waitFor();
    await page.keyboard.press("Escape");
    assert.equal((await info()).draft.length, 0);
    await drag(0, "off");
    await page.getByRole("button", { name: "Use 1", exact: true }).click();
    assert.equal((await info()).draft[0].die, 1);
    await page.locator('[data-point="off0"]').click();
    assert.equal((await info()).state.off[0], 15);
    assert.equal((await info()).complete, true);
    await page.evaluate(() => checkerTest.draft.undo());
    assert.equal((await info()).state.off[0], 14);
    report.cases.push(
      "bar priority and hit",
      "hit undo restores both players",
      "bearoff die choice and cancellation",
      "finish and undo bearoff",
    );
    await load("blocked");
    assert.equal((await info()).complete, true);
    assert.equal(await page.locator(".movable,.destination").count(), 0);
    assert.match(await page.locator("#draft-line").innerText(), /pass/);
    await load("doubles");
    for (let i = 0; i < 4; i++) {
      const m = (await info()).candidates[0];
      await page.evaluate((m) => checkerTest.draft.move(m), m);
    }
    assert.equal(await page.locator(".board-die.consumed").count(), 4);
    assert.equal((await info()).complete, true);
    await page.waitForFunction(
      () => !document.querySelector(".moving-checker"),
      null,
      { timeout: 1500 },
    );
    assert.equal(await page.locator(".moving-checker").count(), 0);
    // One selected checker exposes every legal combined destination. Tap and
    // drag reversals restore real draft dice; even completed turns stay editable.
    await load("chain");
    await page.locator('[data-point="23"]').click();
    for (const to of [22, 20, 19])
      assert.ok(await page.locator(`[data-point="${to}"].destination`).count());
    await shot("combined-destinations");
    await page.locator('[data-point="19"]').click();
    assert.equal((await info()).draft.length, 2);
    assert.equal((await info()).complete, true);
    await page.locator('[data-point="19"]').click(); // immediately interrupts path animation
    assert.ok(
      await page.locator('[data-point="23"].return-destination').count(),
    );
    await page.locator('[data-point="23"]').click();
    assert.equal((await info()).draft.length, 0);
    assert.equal(await page.locator(".board-die.consumed").count(), 0);
    await load("double-chain");
    await page.locator('[data-point="23"]').click();
    for (const to of [21, 19, 17, 15])
      assert.ok(await page.locator(`[data-point="${to}"].destination`).count());
    await shot("all-four-doubles");
    await drag(23, 15);
    assert.equal((await info()).draft.length, 4);
    await drag(15, 19);
    assert.equal((await info()).draft.length, 2);
    assert.equal(await page.locator(".board-die.consumed").count(), 2);
    await drag(19, 23);
    assert.equal((await info()).draft.length, 0);
    await load("bar");
    await drag("bar", 23);
    await drag(23, "bar");
    assert.deepEqual((await info()).state.bar, [1, 0]);
    assert.equal((await info()).state.points[23], -1);
    await load("bearoff");
    await page.evaluate(() => checkerTest.draft.preferDie(1));
    await drag(0, "off");
    await drag("off", 0);
    assert.equal((await info()).draft.length, 0);
    report.cases.push(
      "both dice combined destinations",
      "all four doubles destinations",
      "tap back after complete turn",
      "drag back part of a combined move",
      "bar and bearoff drag reversals",
      "larger on-board dice",
    );
    await load("tall");
    assert.match(
      await page.locator('[data-point="12"]').getAttribute("aria-label"),
      /15 Ivory/,
    );
    await drag(12, 9);
    assert.equal((await info()).draft.length, 1);
    await load();
    await page.locator('[data-point="0"]').focus();
    await page.keyboard.press("ArrowLeft");
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.point),
      "1",
    );
    await page.keyboard.press("ArrowUp");
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.point),
      "22",
    );
    const first = page.locator(".movable").first();
    await first.focus();
    await page.keyboard.press("Enter");
    assert.ok(await page.locator(".destination").count());
    const dest = page.locator(".destination").first();
    const destination = Number(await dest.getAttribute("data-point"));
    await dest.focus();
    await page.keyboard.press("Space");
    assert.equal((await info()).draft.at(-1).to, destination);
    assert.ok((await info()).draft.length >= 1);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => checkerTest.draft.undo());
    assert.equal(await page.locator(".moving-checker").count(), 0);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    report.cases.push(
      "forced pass",
      "four dice for doubles",
      "tall stacks",
      "keyboard Enter and Space",
      "reduced motion",
    );
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
        await load();
        await page.locator(".movable").first().click();
        await shot(`selected-${width}x${height}`);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `opening layout overflow ${width}x${height}: ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("body *")].filter(n=>n.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(n=>({tag:n.tagName,id:n.id,class:n.getAttribute("class"),right:n.getBoundingClientRect().right}))))}`,
        );
      }
      const touchContext = await browser.newContext({
          viewport: { width: 390, height: 844 },
          hasTouch: true,
          isMobile: true,
          serviceWorkers: "block",
        }),
        touch = await touchContext.newPage();
      await seed(touch, [3, 1]);
      await touch.goto(base + "/backgammon/play/");
      await touch.locator("#start-match").tap();
      await touch.locator("#roll").tap();
      await touch.locator("#begin-turn").tap();
      const coords = await touch.evaluate(async () => {
        const { get } = await import("/backgammon/core/storage.mjs"),
          r = await import("/backgammon/core/rules.mjs"),
          g = await import("/backgammon/ui/board.mjs");
        const s = (await get("work", "play")).game.state,
          step = r.legalPaths(s)[0].steps[0],
          matrix = document.querySelector(".bg-board").getScreenCTM(),
          a = g.checkerPosition(s, step.from, 0, 0),
          b = g.pointGeometry(step.to, 0);
        const cv = (p) => {
          const v = new DOMPoint(p.x, p.y).matrixTransform(matrix);
          return { x: v.x, y: v.y };
        };
        return { a: cv(a), b: cv({ x: b.x + 30, y: b.top ? 110 : 480 }), step };
      });
      const cdp = await touchContext.newCDPSession(touch);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ ...coords.a, id: 1 }],
      });
      for (let i = 1; i <= 8; i++)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            {
              x: coords.a.x + ((coords.b.x - coords.a.x) * i) / 8,
              y: coords.a.y + ((coords.b.y - coords.a.y) * i) / 8,
              id: 1,
            },
          ],
        });
      await touch.screenshot({
        path: path.join(out, "chromium-ux-touch-drag.png"),
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await touch.waitForFunction(
        async () =>
          (
            await (
              await import("/backgammon/core/storage.mjs")
            ).get("work", "play")
          ).draft.length === 1,
      );
      assert.equal(await touch.evaluate(() => scrollY), 0);
      assert.equal(await touch.locator(".drag-checker").count(), 0);
      await touch.locator("#undo").tap();

      await touch.evaluate(async () => {
        const { shell, DraftBoard } = await import("/backgammon/ui/shell.mjs");
        const r = await import("/backgammon/core/rules.mjs");
        const ui = shell("play", "Touch entry");
        const d = new DraftBoard(ui.board),
          points = Array(24).fill(0);
        points[5] = 14;
        points[23] = -1;
        points[18] = -14;
        const s = r.initialState({
          matchLength: 0,
          phase: "move",
          dice: [1, 2],
          points,
          bar: [1, 0],
        });
        d.set(s, r.legalPaths(s));
        window.touchDraft = d;
      });
      await touch.locator('[data-point="23"]').tap();
      await touch.locator('[data-point="22"].entry-switch-destination').tap();
      assert.equal(await touch.evaluate(() => touchDraft.draft[0].die), 2);
      const revision = await touch.evaluate(async () => {
        const g = await import("/backgammon/ui/board.mjs"),
          d = touchDraft;
        const matrix = d.board.svg.getScreenCTM();
        const cv = (p) => {
          const v = new DOMPoint(p.x, p.y).matrixTransform(matrix);
          return { x: v.x, y: v.y };
        };
        const b = g.pointGeometry(23, 0);
        return {
          a: cv(g.checkerPosition(d.current(), 22, 0, 0)),
          b: cv({ x: b.x + 30, y: b.top ? 110 : 480 }),
        };
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ ...revision.a, id: 1 }],
      });
      for (let i = 1; i <= 8; i++)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            {
              x: revision.a.x + ((revision.b.x - revision.a.x) * i) / 8,
              y: revision.a.y + ((revision.b.y - revision.a.y) * i) / 8,
              id: 1,
            },
          ],
        });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      assert.equal(await touch.evaluate(() => touchDraft.draft[0].die), 1);
      assert.equal(await touch.evaluate(() => touchDraft.current().bar[1]), 1);
      assert.equal(await touch.evaluate(() => scrollY), 0);
      await touch.screenshot({
        path: path.join(out, "chromium-ux-touch-entry-switch.png"),
        animations: "disabled",
      });
      report.cases.push(
        "touch tap and drag alternate bar entry without scrolling",
      );
      await touchContext.close();
      report.cases.push("real touch pointer stream and no accidental scroll");
    }
    const botContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
      }),
      bot = await botContext.newPage();
    await seed(bot, [1, 6]);
    let engineRequests = 0;
    bot.on("request", (r) => {
      if (/gnubg-core-module\.(wasm|data)$/.test(r.url())) engineRequests++;
    });
    await bot.goto(base + "/backgammon/play/");
    await bot.locator("#start-match").click();
    await bot.locator("#roll").click();
    await bot.waitForTimeout(850);
    assert.equal(
      await bot.locator(".opening-roll h2").innerText(),
      "GNUbg starts",
    );
    assert.equal(engineRequests, 0);
    assert.equal(
      await bot.evaluate(
        async () =>
          (
            await (
              await import("/backgammon/core/storage.mjs")
            ).get("work", "play")
          ).game.events.length,
      ),
      1,
    );
    await bot.screenshot({
      path: path.join(out, `${browserName}-ux-computer-opening.png`),
      animations: "disabled",
    });
    await bot.locator("#begin-turn").click();
    await bot.waitForFunction(
      async () =>
        (
          await (
            await import("/backgammon/core/storage.mjs")
          ).get("work", "play")
        ).game.events.some((e) => e.action.type === "move"),
      {},
      { timeout: 45000 },
    );
    await bot.locator("#roll").waitFor();
    // User actions can interrupt presentation; the committed position remains authoritative.
    await bot.locator("#roll").click();
    await bot.waitForTimeout(1100);
    assert.equal(await bot.locator(".moving-checker,.drag-checker").count(), 0);
    assert.ok(await bot.locator(".movable").count());
    const displayed = await bot.evaluate(() =>
      Array.from({ length: 24 }, (_, i) => {
        const label = document
            .querySelector(`[data-point="${i}"]`)
            .getAttribute("aria-label"),
          match = label.match(/(\d+) (Ivory|Teal) checkers/);
        return match ? Number(match[1]) * (match[2] === "Ivory" ? 1 : -1) : 0;
      }),
    );
    const committed = await bot.evaluate(
      async () =>
        (
          await (
            await import("/backgammon/core/storage.mjs")
          ).get("work", "play")
        ).game.state.points,
    );
    assert.deepEqual(displayed, committed);
    if (browserName === "chromium")
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
        await bot.setViewportSize({ width, height });
        await bot.waitForTimeout(100);
        // Keep this viewport sweep on one turn: a single-action checker tap
        // can now complete the draft automatically and start the computer.
        const file = `chromium-ux-live-${width}x${height}.png`;
        await bot.screenshot({
          path: path.join(out, file),
          animations: "disabled",
          fullPage: true,
        });
        report.screenshots.push(file);
        assert.ok(
          await bot.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `opening layout overflow ${width}x${height}: ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("body *")].filter(n=>n.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(n=>({tag:n.tagName,id:n.id,class:n.getAttribute("class"),right:n.getBoundingClientRect().right}))))}`,
        );
        assert.ok(
          await bot.evaluate(
            () =>
              document.querySelector("#board").getBoundingClientRect().bottom <=
              document.querySelector("#player").getBoundingClientRect().top + 1,
          ),
          "board must not overlap player strip",
        );
        if (width > 320)
          assert.ok(
            await bot
              .locator("#confirm")
              .evaluate((n) => n.getBoundingClientRect().bottom <= innerHeight),
          );
      }
    await botContext.close();
    report.cases.push(
      "computer opening waits for acknowledgement",
      "opponent playback interrupted by next roll",
    );
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
  return report;
};
