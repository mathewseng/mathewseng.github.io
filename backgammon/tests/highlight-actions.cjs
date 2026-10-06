const assert = require("node:assert/strict");
const path = require("node:path");

// Click the advertised area itself, not a controller helper or a legal-move menu.
module.exports = async function highlightActions(browser, base, out, name) {
  const results = [];
  for (const touch of [false, true]) {
    const context = await browser.newContext({
      viewport: touch ? { width: 390, height: 844 } : { width: 1366, height: 768 },
      hasTouch: touch,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    try {
      await page.goto(base + "/backgammon/");
      await page.evaluate(async () => {
        const { shell, DraftBoard } = await import("/backgammon/ui/shell.mjs");
        const r = await import("/backgammon/core/rules.mjs");
        const storage = await import("/backgammon/core/storage.mjs");
        window.highlightTest = { r, storage, fixtures: new Map(), d: new DraftBoard(shell("trainer", "Highlight actions").board) };
      });
      const set = (fixture, turn, orientation, selected = null) => page.evaluate(({fixture, turn, orientation, selected}) => {
        const { r, storage, fixtures, d } = highlightTest;
        storage.saveSettings({orientation});
        const p = n => turn ? 23 - n : n;
        const key = `${fixture}:${turn}`;
        if (!fixtures.has(key)) {
          const s = r.initialState({phase: "move", dice: [4, 3], turn});
          let draft = [];
          if (fixture === "return") {
            draft = [{from: p(12), to: p(8), die: 4}, {from: p(12), to: p(9), die: 3}];
          } else if (fixture === "bar") {
            s.points[p(23)] -= r.sign(turn);
            s.bar[turn]++;
            draft = [{from: "bar", to: p(21), die: 3}];
          } else if (fixture === "off") {
            s.points = Array(24).fill(0);
            s.points[p(3)] = 3 * r.sign(turn);
            s.points[p(1)] = 12 * r.sign(turn);
            s.points[p(20)] = -15 * r.sign(turn);
          } else if (fixture === "doubles") s.dice = [2, 2];
          fixtures.set(key, {state: s, paths: r.legalPaths(s), draft});
        }
        const saved = fixtures.get(key);
        d.set(saved.state, saved.paths);
        d.draft = [...saved.draft];
        d.selected = typeof selected === "number" ? p(selected) : selected;
        d.render();
      }, {fixture, turn, orientation, selected});
      const signature = () => page.evaluate(() => JSON.stringify(highlightTest.d.draft));
      let clicks = 0;
      const tap = async (point, disc = false) => {
        clicks++;
        const pos = await page.evaluate(({point, disc}) => {
          const g = document.querySelector(`[data-point="${point}"]`), hit = g.querySelector(".point-hit"),
            circle = disc && g.querySelector(".checker > circle");
          const x = circle ? +circle.getAttribute("cx") : +hit.getAttribute("x") + +hit.getAttribute("width") / 2;
          const y = circle ? +circle.getAttribute("cy") : point.startsWith("bar")
            ? (+hit.getAttribute("y") < 100 ? 282 : 406)
            : point.startsWith("off") ? +hit.getAttribute("y") + 120
            : +hit.getAttribute("y") < 100 ? 280 : 380;
          const pos = new DOMPoint(x,y).matrixTransform(document.querySelector(".bg-board").getScreenCTM());
          return {x:pos.x,y:pos.y};
        }, {point:String(point),disc});
        if (touch) await page.touchscreen.tap(pos.x,pos.y);
        else await page.mouse.click(pos.x,pos.y);
      };
      await set("opening", 0, 0);
      if (!touch) {
        const blocked = page.locator('[data-point="18"]');
        const fill = () => blocked.locator(".point-hit").evaluate(n => getComputedStyle(n).fill);
        const before = await fill();
        await blocked.hover();
        assert.equal(await fill(), before, "hover must not advertise an unavailable point");
        assert.equal(await blocked.evaluate(n => getComputedStyle(n).cursor), "default");
      }
      for (const turn of [0, 1]) for (const orientation of [0, 1]) {
        const p = n => turn ? 23 - n : n;
        for (const disc of [false, true]) {
          await set("return", turn, orientation);
          assert.equal(await page.locator(`[data-point="${p(12)}"].return-destination`).count(), 1);
          await tap(p(12), disc);
          assert.equal(await page.evaluate(() => highlightTest.d.draft.length), 1, "occupied amber target returns nearest checker, including an immovable resident disc");
        }
        await set("bar", turn, orientation, 21);
        await tap(`bar${turn}`);
        assert.equal(await page.evaluate(() => highlightTest.d.draft.length), 0, "entire bar return badge is clickable in either orientation");
        for (const fixture of ["opening", "doubles", "bar", "off", "return"]) {
          await set(fixture, turn, orientation);
          const selections = [null, ...await page.evaluate(() => highlightTest.d.sources())];
          for (const selection of selections) {
            // set() accepts player-zero point indexes; source lists are canonical.
            const selected = typeof selection === "number" ? p(selection) : selection;
            await set(fixture, turn, orientation, selected);
            const targets = await page.locator(".point.reachable,.point.destination,.point.return-destination").evaluateAll(nodes => nodes.map(n=>n.dataset.point));
            for (const target of targets) {
              await set(fixture, turn, orientation, selected);
              const before = await signature();
              await tap(target);
              const dialog = page.locator("dialog[open]");
              assert.ok(await signature() !== before || await dialog.count(), `${fixture}, player ${turn}, orientation ${orientation}, selected ${selected}: highlight ${target} must act`);
              if (await dialog.count()) await dialog.getByRole("button",{name:"Close",exact:true}).click();
            }
          }
        }
      }
      await set("return", 0, 0);
      await page.screenshot({path:path.join(out,`${name}-highlight-${touch ? "touch" : "mouse"}.png`)});
      // Non-interactive previews cannot advertise a stale actionable selection.
      await page.evaluate(() => {
        const d=highlightTest.d;
        d.selected=8;
        d.preview=d.current();
        d.render();
      });
      assert.equal(await page.locator(".point.selected,.source-ring,.point.destination,.point.reachable,.point.return-destination").count(),0);
      await page.evaluate(() => {
        const d = highlightTest.d;
        d.preview = null;
        d.enabled = false;
        d.render();
      });
      assert.equal(await page.locator(".point.selected,.source-ring,.point.destination,.point.reachable,.point.return-destination").count(), 0);
      assert.deepEqual(errors, []);
      results.push({input: touch ? "touch" : "mouse", clicks});
    } finally { await context.close(); }
  }
  return {browser:name, inputs:results, coverage:"advertised forward, combined, doubles, undo, alternate die, bar and off destinations; both players and orientations"};
};
