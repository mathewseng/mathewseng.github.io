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
      const parts = [...face.children].filter(n => !n.classList.contains("die-status-mark"));
      const fade = parts[0].getAnimations().find(a => a.id === "dice-opacity");
      const style = getComputedStyle(face), matrix = new DOMMatrix(style.transform);
      return { transform: style.transform, scale: matrix.a, y: matrix.f,
        opacities: parts.map(n => Number(getComputedStyle(n).opacity)),
        fade: fade ? { duration: fade.effect.getTiming().duration,
          frames: fade.effect.getKeyframes().map(f => Number(f.opacity)) } : null,
        selected: face.parentElement.classList.contains("preferred"),
        motion: motion ? { duration: motion.effect.getTiming().duration,
          frames: motion.effect.getKeyframes().map(f => ({ transform: f.transform, filter: f.filter })) } : null };
    }));
    const seek = time => page.evaluate(time => {
      document.getAnimations().filter(a => ["dice-selection", "dice-opacity"].includes(a.id)).forEach(a => { a.currentTime = time; });
    }, time);
    const finish = () => page.evaluate(() => {
      document.getAnimations().filter(a => ["dice-selection", "dice-opacity"].includes(a.id)).forEach(a => a.finish());
    });
    const activate = async selector => touch ? page.locator(selector).tap() : page.locator(selector).click();
    const loadRoll = async dice => {
      await page.evaluate(async dice => {
        const { put, saveSettings } = await import("/backgammon/core/storage.mjs");
        const { initialState } = await import("/backgammon/core/rules.mjs");
        const { localConfig } = await import("/backgammon/core/play-session.mjs");
        saveSettings({ interactionMode: "advanced", motion: "system" });
        const s = initialState({ phase: "move", dice });
        await put("work", { id: "play", game: { id: "dice-motion", state: s, initial: s,
          events: [], started: true, names: ["You", "Friend"], config: localConfig({ mode: "local" }) }, draft: [] });
      }, dice);
      await page.reload(); await ready(); await activate("#resume-match");
    };
    try {
      // Pause only the real selection animation for deterministic frame checks.
      // Keyboard, touch/click handlers, board rendering and WAAPI are unmodified.
      await page.addInitScript(() => {
        const animate = Element.prototype.animate;
        Element.prototype.animate = function(frames, options) {
          const result = animate.call(this, frames, options);
          if (["dice-selection", "dice-opacity"].includes(options?.id)) { result.pause(); result.currentTime = 0; }
          return result;
        };
      });
      await page.goto(base + "/backgammon/play/"); await ready();
      await loadRoll([4, 1]);
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
      if (touch) await page.locator('#board [data-point="12"] .checker').last().tap();
      else await page.keyboard.press("1");
      assert.equal(await page.locator(".board-die.consumed").count(), 1);
      dice = await snapshot();
      assert.deepEqual(dice.map(d => d.motion?.duration), [280, 280], "used die lowers while next die lifts");
      assert.deepEqual(dice[0].fade.frames, [1, .38], "used face fades from full brightness");
      assert.equal(dice[0].fade.duration, 280, "fade and lift have the same duration");
      await seek(100);
      const using = await snapshot();
      assert.ok(using[0].scale > 1 && using[0].scale < 1.08);
      assert.ok(using[1].scale > 1 && using[1].scale < 1.08);
      assert.ok(using[0].opacities.every(o => o > .38 && o < 1), "face, pattern and pips fade together");
      assert.ok(using[1].opacities.every(o => o === 1), "next die stays bright");
      await page.screenshot({ path: path.join(out, `${name}-dice-used-mid-${touch ? "phone" : "desktop"}.png`) });
      await page.keyboard.press("s");
      assert.equal(await page.locator(".board-die.consumed").count(), 0, "S still undoes after playing a die");
      dice = await snapshot();
      assert.deepEqual(dice.map(d => d.motion.frames[0].transform), using.map(d => d.transform), "undo reverses the interrupted lift");
      assert.ok(Math.abs(dice[0].fade.frames[0] - using[0].opacities[0]) < 1e-6, "undo reverses the interrupted fade");
      await finish();
      assert.ok((await snapshot()).every(d => d.opacities.every(o => o === 1)));
      await page.keyboard.press("1"); await finish();
      await activate("#undo");
      assert.deepEqual((await snapshot())[0].fade.frames, [.38, 1], "Undo button restores the dimmed die");
      await seek(100);
      await page.screenshot({ path: path.join(out, `${name}-dice-undo-mid-${touch ? "phone" : "desktop"}.png`) });
      await finish();
      await page.keyboard.press("1"); await finish();
      await page.keyboard.press("u"); // Remaining 1: 6/5 (13/12 is blocked).
      assert.equal(await page.locator(".board-die.consumed").count(), 2);
      assert.deepEqual((await snapshot())[1].fade.frames, [1, .38], "last die fades even without a next die");
      await finish();
      await activate("#reset-draft");
      assert.ok((await snapshot()).every(d => d.fade?.frames[0] === .38 && d.fade.frames[1] === 1), "Reset restores both dice together");
      await finish();
      await loadRoll([3, 3]);
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("1");
        dice = await snapshot();
        assert.equal(await page.locator(".board-die.consumed").count(), i + 1);
        assert.deepEqual(dice[i].fade.frames, [1, .38], `doubles slot ${i} fades`);
        assert.equal(dice[i].motion?.duration, 280, `doubles slot ${i} lowers`);
        if (i < 3) assert.equal(dice[i + 1].motion?.duration, 280, "next doubles slot lifts");
        await finish();
      }
      await page.keyboard.press("z");
      assert.deepEqual((await snapshot())[3].fade.frames, [.38, 1], "doubles undo restores the correct slot");
      await finish();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.keyboard.press("1");
      assert.ok((await snapshot()).every(d => !d.motion && !d.fade), "reduced motion consumes immediately");
      await page.keyboard.press("z");
      assert.ok((await snapshot()).every(d => !d.motion && !d.fade), "reduced motion undoes immediately");
      assert.equal(await page.evaluate(() => visualViewport.scale), 1);
      assert.deepEqual(errors, []);
      report.push({ touch, simultaneous: true, interruption: true, directDie: true, switchControl: true,
        use: true, undo: true, reset: true, doubles: true, reducedMotion: true });
    } finally { await context.close(); }
  }
  return report;
};
