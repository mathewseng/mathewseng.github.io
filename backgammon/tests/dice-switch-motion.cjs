const assert = require("node:assert/strict");
const path = require("node:path");

module.exports = async function diceSwitchMotion(browser, base, out, name) {
  const report = [];
  for (const touch of [false, true]) {
    const context = await browser.newContext({
      viewport: touch ? { width: 390, height: 844 } : { width: 1366, height: 768 },
      hasTouch: touch, serviceWorkers: "block", reducedMotion: "no-preference",
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    const ready = () => page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
    const snapshot = () => page.locator("#board .board-die-face").evaluateAll(faces => faces.map(face => {
      const motion = face.getAnimations().find(a => a.id === "dice-selection");
      const style = getComputedStyle(face), matrix = new DOMMatrix(style.transform);
      return { transform: style.transform, scale: matrix.a, y: matrix.f,
        selected: face.parentElement.classList.contains("preferred"),
        motion: motion ? { duration: motion.effect.getTiming().duration,
          frames: motion.effect.getKeyframes().map(f => ({ transform: f.transform, filter: f.filter })) } : null };
    }));
    const seek = time => page.evaluate(time => {
      document.getAnimations().filter(a => a.id === "dice-selection").forEach(a => { a.currentTime = time; });
    }, time);
    const finish = () => page.evaluate(() => {
      document.getAnimations().filter(a => a.id === "dice-selection").forEach(a => a.finish());
    });
    const activate = async selector => touch ? page.locator(selector).tap() : page.locator(selector).click();
    try {
      // Pause only the real selection animation for deterministic frame checks.
      // Keyboard, touch/click handlers, board rendering and WAAPI are unmodified.
      await page.addInitScript(() => {
        const animate = Element.prototype.animate;
        Element.prototype.animate = function(frames, options) {
          const result = animate.call(this, frames, options);
          if (options?.id === "dice-selection") { result.pause(); result.currentTime = 0; }
          return result;
        };
      });
      await page.goto(base + "/backgammon/play/"); await ready();
      await page.evaluate(async () => {
        const { put, saveSettings } = await import("/backgammon/core/storage.mjs");
        const { initialState } = await import("/backgammon/core/rules.mjs");
        const { localConfig } = await import("/backgammon/core/play-session.mjs");
        saveSettings({ interactionMode: "advanced", motion: "system" });
        const s = initialState({ phase: "move", dice: [4, 1] });
        await put("work", { id: "play", game: { id: "dice-motion", state: s, initial: s,
          events: [], started: true, names: ["You", "Friend"], config: localConfig({ mode: "local" }) }, draft: [] });
      });
      await page.reload(); await ready(); await activate("#resume-match");
      assert.deepEqual((await snapshot()).map(d => d.motion), [null, null], "initial dice do not replay a selection transition");
      await page.keyboard.press("s");
      let dice = await snapshot();
      assert.deepEqual(dice.map(d => d.selected), [false, true], "selection changes immediately");
      assert.deepEqual(dice.map(d => d.motion?.duration), [280, 280], "both dice animate together for S");
      assert.ok(Math.abs(dice[0].scale - 1.08) < 1e-6, "old die starts lifted");
      assert.ok(Math.abs(dice[1].scale - 1) < 1e-6, "new die starts lowered");
      await seek(100);
      const midway = await snapshot();
      for (const die of midway) {
        assert.ok(die.scale > 1 && die.scale < 1.08, "scale interpolates");
        assert.ok(die.y > -4 && die.y < 0, "height interpolates");
      }
      await page.screenshot({ path: path.join(out, `${name}-dice-switch-mid-${touch ? "phone" : "desktop"}.png`) });
      await page.keyboard.press("s");
      dice = await snapshot();
      assert.deepEqual(dice.map(d => d.motion.frames[0].transform), midway.map(d => d.transform), "rapid reversal starts at the current pose, not an endpoint");
      await finish();
      assert.ok(Math.abs((await snapshot())[0].scale - 1.08) < 1e-6);
      await activate('#board .board-die[data-die="1"]');
      assert.deepEqual((await snapshot()).map(d => d.motion?.duration), [280, 280], "direct die click/tap animates both faces");
      await finish();
      await activate("#board .dice-switch");
      assert.deepEqual((await snapshot()).map(d => d.motion?.duration), [280, 280], "switch control uses the same animation");
      await finish();
      await page.keyboard.press("1");
      assert.equal(await page.locator(".board-die.consumed").count(), 1);
      await page.keyboard.press("s");
      assert.equal(await page.locator(".board-die.consumed").count(), 0, "S still undoes after playing a die");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.keyboard.press("s");
      assert.deepEqual((await snapshot()).map(d => d.motion), [null, null], "reduced motion switches immediately");
      assert.equal(await page.evaluate(() => visualViewport.scale), 1);
      assert.deepEqual(errors, []);
      report.push({ touch, simultaneous: true, interruption: true, directDie: true, switchControl: true, reducedMotion: true });
    } finally { await context.close(); }
  }
  return report;
};
