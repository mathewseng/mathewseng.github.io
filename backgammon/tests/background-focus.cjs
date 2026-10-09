const assert = require("node:assert/strict"), path = require("node:path");
module.exports = async function backgroundFocus(browser, base, out, name) {
  const cases = [];
  for (const touch of [false, true]) {
    const context = await browser.newContext({
      viewport: touch ? { width: 390, height: 844 } : { width: 1366, height: 768 },
      hasTouch: touch, reducedMotion: "reduce", serviceWorkers: "block",
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    try {
      await page.goto(base + "/backgammon/");
      await page.evaluate(async () => {
        const { shell, DraftBoard } = await import("/backgammon/ui/shell.mjs");
        const r = await import("/backgammon/core/rules.mjs");
        const d = new DraftBoard(shell("play", "Background focus").board);
        document.querySelector(".app").classList.add("play-page");
        const s = r.initialState({ phase: "move", dice: [4, 1] });
        d.set(s, r.legalPaths(s));
        window.focusTest = d;
      });
      const state = () => page.evaluate(() => ({ selected: focusTest.selected, draft: focusTest.draft }));
      const tap = async (target) => {
        const p = await page.evaluate(target => {
          const svg = document.querySelector("#board .bg-board");
          if (target === "margin") {
            const b = svg.getBoundingClientRect();
            return { x: b.left + 2, y: b.top + b.height / 2 };
          }
          const q = new DOMPoint(target === "frame" ? 10 : 100, 330).matrixTransform(svg.getScreenCTM());
          return { x: q.x, y: q.y };
        }, target);
        if (touch) await page.touchscreen.tap(p.x, p.y);
        else await page.mouse.click(p.x, p.y);
      };
      for (const target of ["margin", "frame", "center"]) {
        await page.evaluate(() => { focusTest.selected = 12; focusTest.render(); });
        // Exercise the keyboard-to-pointer transition that exposes the browser's
        // implicit SVG focus ring, as well as ordinary repeated background taps.
        await page.locator('#board [data-point="12"]').focus();
        await page.keyboard.press("ArrowRight");
        await tap(target);
        assert.deepEqual(await state(), { selected: null, draft: [] });
        const focus = await page.evaluate(() => {
          const svg = document.querySelector("#board .bg-board"), slot = document.querySelector("#board");
          return [svg, slot].map(el => ({
            focused: document.activeElement === el,
            outline: getComputedStyle(el).outlineStyle,
            width: parseFloat(getComputedStyle(el).outlineWidth),
          }));
        });
        assert.ok(focus.every(f => !f.focused || f.outline === "none" || f.width === 0), JSON.stringify({name,touch,target,focus}));
        await tap(target);
        assert.deepEqual(await state(), { selected: null, draft: [] });
      }
      await page.screenshot({ path: path.join(out, `${name}-background-clear-${touch ? "phone" : "desktop"}.png`) });
      await page.locator('#board [data-point="12"]').focus();
      await page.keyboard.press("ArrowRight");
      const pointFocus = await page.evaluate(() => {
        const point = document.activeElement, hit = point.querySelector(".point-hit");
        return { point: point.dataset.point, visible: point.matches(":focus-visible"), stroke: getComputedStyle(hit).stroke };
      });
      assert.ok(pointFocus.point && pointFocus.visible && pointFocus.stroke !== "none", JSON.stringify(pointFocus));
      await page.keyboard.press("Enter");
      const die = page.locator('#board .board-die[role="button"]').first();
      await die.focus();
      const dieFocus = await die.evaluate(el => ({
        visible: el.matches(":focus-visible"),
        stroke: getComputedStyle(el.querySelector(".board-die-face > rect:first-child")).stroke,
      }));
      assert.ok(dieFocus.visible && dieFocus.stroke === pointFocus.stroke, JSON.stringify(dieFocus));
      // Real controls continue to expose their own keyboard focus treatment.
      await page.locator("#preferences").focus();
      assert.ok(await page.locator("#preferences").evaluate(el => el.matches(":focus-visible") && getComputedStyle(el).outlineStyle !== "none"));
      assert.deepEqual(errors, []);
      cases.push(`${touch ? "touch" : "mouse"}: background clears selection without a container focus ring; keyboard controls retain focus`);
    } finally { await context.close(); }
  }
  return { browser: name, cases };
};
