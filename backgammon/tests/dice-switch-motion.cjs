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
      const box = face.firstElementChild.getBoundingClientRect();
      const center = new DOMPoint(0, 0).matrixTransform(face.parentElement.getScreenCTM());
      return { transform: style.transform, scale: matrix.a, y: matrix.f,
        centerError: Math.hypot(box.x + box.width / 2 - center.x, box.y + box.height / 2 - center.y),
        opacities: parts.map(n => Number(getComputedStyle(n).opacity)),
        fade: fade ? { duration: fade.effect.getTiming().duration,
          frames: fade.effect.getKeyframes().map(f => Number(f.opacity)) } : null,
        marks: Object.fromEntries([...face.querySelectorAll('[data-die-mark]')].map(mark => {
          const style = getComputedStyle(mark), animation = mark.getAnimations().find(a => a.id === "dice-mark");
          return [mark.dataset.dieMark, { opacity: Number(style.opacity), offset: parseFloat(style.strokeDashoffset),
            stroke: style.stroke, motion: animation ? animation.effect.getKeyframes().map(f => ({
              opacity: Number(f.opacity), offset: parseFloat(f.strokeDashoffset) })) : null }];
        })),
        selected: face.parentElement.classList.contains("preferred"),
        motion: motion ? { duration: motion.effect.getTiming().duration,
          frames: motion.effect.getKeyframes().map(f => ({ transform: f.transform, filter: f.filter })) } : null };
    }));
    const seek = time => page.evaluate(time => {
      document.getAnimations().filter(a => ["dice-selection", "dice-opacity", "dice-mark", "dice-control"].includes(a.id)).forEach(a => { a.currentTime = time; });
    }, time);
    const finish = () => page.evaluate(() => {
      document.getAnimations().filter(a => ["dice-selection", "dice-opacity", "dice-mark", "dice-control"].includes(a.id)).forEach(a => a.finish());
    });
    const control = () => page.locator("#board .dice-switch").evaluate(node => ({
      label: node.getAttribute("aria-label"),
      icons: Object.fromEntries([...node.querySelectorAll('[data-dice-icon]')].map(n => [n.dataset.diceIcon, Number(getComputedStyle(n).opacity)])),
    }));
    const hitAreas = () => page.locator("#board .board-die-hit").evaluateAll(nodes => nodes.map(n => {
      const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
    }));
    const activate = async selector => touch ? page.locator(selector).tap() : page.locator(selector).click();
    const tapLane = async () => {
      const box = await page.locator('#board .dice-switch-hit').boundingBox();
      if (touch) await page.touchscreen.tap(box.x + 3, box.y + box.height / 2);
      else await page.mouse.click(box.x + 3, box.y + box.height / 2);
    };
    const loadRoll = async (dice, mode = "advanced") => {
      await page.evaluate(async ({dice, mode}) => {
        const { put, saveSettings } = await import("/backgammon/core/storage.mjs");
        const { initialState } = await import("/backgammon/core/rules.mjs");
        const { localConfig } = await import("/backgammon/core/play-session.mjs");
        saveSettings({ interactionMode: mode, motion: "system" });
        const s = initialState({ phase: "move", dice });
        await put("work", { id: "play", game: { id: "dice-motion", state: s, initial: s,
          events: [], started: true, names: ["You", "Friend"], config: localConfig({ mode: "local" }) }, draft: [] });
      }, {dice, mode});
      await page.reload(); await ready(); await activate("#resume-match");
    };
    try {
      // Pause only the real dice animations for deterministic frame checks.
      // Keyboard, touch/click handlers, board rendering and WAAPI are unmodified.
      await page.addInitScript(() => {
        const animate = Element.prototype.animate;
        Element.prototype.animate = function(frames, options) {
          const result = animate.call(this, frames, options);
          if (["dice-selection", "dice-opacity", "dice-mark", "dice-control"].includes(options?.id)) { result.pause(); result.currentTime = 0; }
          return result;
        };
      });
      await page.goto(base + "/backgammon/play/"); await ready();
      await loadRoll([4, 1]);
      const originalHits = await hitAreas();
      assert.equal((await control()).label, "Switch selected die");
      assert.ok((await snapshot()).every(d => d.marks.check.opacity === 0 && d.marks.blocked.opacity === 0));
      assert.deepEqual((await snapshot()).map(d => d.motion), [null, null], "initial dice do not replay a selection transition");
      await page.keyboard.press("s");
      let dice = await snapshot();
      assert.deepEqual(dice.map(d => d.selected), [false, true], "selection changes immediately");
      assert.deepEqual(dice.map(d => d.motion?.duration), [280, 280], "both dice animate together for S");
      assert.ok(Math.abs(dice[0].scale - 1.12) < 1e-6, "old die starts lifted");
      assert.ok(Math.abs(dice[1].scale - 1) < 1e-6, "new die starts lowered");
      await seek(100);
      const midway = await snapshot();
      for (const die of midway) {
        assert.ok(die.scale > 1 && die.scale < 1.12, "scale interpolates");
        assert.equal(die.y, 0, "selection never translates vertically");
        assert.ok(die.centerError < .05, "enlargement stays centered on the die");
        assert.ok(die.marks.selected.opacity > 0 && die.marks.selected.opacity < 1, "colored rim crossfades with scale");
      }
      await page.screenshot({ path: path.join(out, `${name}-dice-switch-mid-${touch ? "phone" : "desktop"}.png`) });
      await page.keyboard.press("s");
      dice = await snapshot();
      assert.deepEqual(dice.map(d => d.motion.frames[0].transform), midway.map(d => d.transform), "rapid reversal starts at the current pose, not an endpoint");
      await finish();
      assert.ok(Math.abs((await snapshot())[0].scale - 1.12) < 1e-6);
      // Tapping the selected face, or gaps/padding, toggles rather than doing nothing.
      await activate('#board .board-die.preferred'); await finish();
      assert.equal(await page.locator('.board-die.preferred').getAttribute('data-die'), '1');
      await page.locator('.board-die.preferred').focus(); await page.keyboard.press('Enter'); await finish();
      assert.equal(await page.locator('.board-die.preferred').getAttribute('data-die'), '4', 'focused die uses the same action');
      for (const [dx, y] of [[-99, 330], [99, 330], [0, 296], [0, 364]]) {
        const point = await page.locator('#board .dice-switch-hit').evaluate((n, {dx, y}) => {
          const x = Number(n.getAttribute('x')) + Number(n.getAttribute('width')) / 2 + dx;
          const p = new DOMPoint(x, y).matrixTransform(n.getScreenCTM());
          return {x: p.x, y: p.y, hit: document.elementFromPoint(p.x, p.y)?.outerHTML.slice(0, 400)};
        }, {dx, y});
        const before = await page.locator('.board-die.preferred').getAttribute('data-die');
        if (touch) await page.touchscreen.tap(point.x, point.y);
        else await page.mouse.click(point.x, point.y);
        assert.notEqual(await page.locator('.board-die.preferred').getAttribute('data-die'), before, `near-dice tap switches at ${dx},${y}: ${JSON.stringify(point)}`);
        await finish();
      }
      const lane = await page.locator('#board .dice-switch-hit').evaluate(n => {
        const x = Number(n.getAttribute('x')) + 30; // Point center, not the gap between points.
        return [290, 370].map(y => {
          const p = new DOMPoint(x, y).matrixTransform(n.getScreenCTM());
          return !!document.elementFromPoint(p.x, p.y)?.closest('[data-point]');
        });
      });
      assert.deepEqual(lane, [true, true], 'expanded lane leaves the point hit regions intact');
      await page.screenshot({ path: path.join(out, `${name}-dice-selected-${touch ? "phone" : "desktop"}.png`) });
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
      assert.deepEqual(await hitAreas(), originalHits, "lift/consume do not move the tap targets");
      assert.equal((await control()).label, "Undo draft step");
      assert.ok((await control()).icons.undo > 0 && (await control()).icons.undo < 1, "control crossfades to its undo action");
      assert.ok(using[0].marks.check.opacity > 0 && using[0].marks.check.opacity < 1, "check fades in");
      assert.ok(using[0].marks.check.offset > 0 && using[0].marks.check.offset < 100, "check draws along the stroke");
      assert.ok(using[0].scale > 1 && using[0].scale < 1.12);
      assert.ok(using[1].scale > 1 && using[1].scale < 1.12);
      assert.ok(using[0].opacities.every(o => o > .38 && o < 1), "face, pattern and pips fade together");
      assert.ok(using[1].opacities.every(o => o === 1), "next die stays bright");
      await page.screenshot({ path: path.join(out, `${name}-dice-used-mid-${touch ? "phone" : "desktop"}.png`) });
      await page.keyboard.press("s");
      assert.equal(await page.locator(".board-die.consumed").count(), 0, "S still undoes after playing a die");
      dice = await snapshot();
      assert.deepEqual(dice.map(d => d.motion.frames[0].transform), using.map(d => d.transform), "undo reverses the interrupted lift");
      assert.ok(Math.abs(dice[0].fade.frames[0] - using[0].opacities[0]) < 1e-6, "undo reverses the interrupted fade");
      assert.ok(Math.abs(dice[0].marks.check.motion[0].opacity - using[0].marks.check.opacity) < 1e-6, "undo keeps the visible check opacity");
      assert.ok(Math.abs(dice[0].marks.check.motion[0].offset - using[0].marks.check.offset) < 1e-3, "undo keeps the visible stroke");
      assert.equal(dice[0].marks.check.motion[1].offset, dice[0].marks.check.motion[0].offset, "undo fades, rather than undrawing the check");
      await finish();
      assert.equal((await snapshot())[0].marks.check.opacity, 0);
      assert.deepEqual((await control()).icons, { swap: 1, undo: 0 });
      assert.ok((await snapshot()).every(d => d.opacities.every(o => o === 1)));
      await page.keyboard.press("1"); await finish();
      await page.keyboard.press("z");
      assert.deepEqual((await snapshot())[0].fade.frames, [.38, 1], "Z restores the dimmed die");
      await seek(100);
      await page.screenshot({ path: path.join(out, `${name}-dice-undo-mid-${touch ? "phone" : "desktop"}.png`) });
      const undoing = (await snapshot())[0].marks.check;
      assert.ok(undoing.opacity > 0 && undoing.opacity < 1, "completed check fades away during undo");
      assert.equal(undoing.offset, 0, "completed stroke remains intact while fading");
      await page.keyboard.press("1");
      const replaying = (await snapshot())[0].marks.check;
      assert.ok(Math.abs(replaying.motion[0].opacity - undoing.opacity) < 1e-6, "rapid replay resumes at the visible faded mark");
      await finish();
      assert.equal((await snapshot())[0].marks.check.opacity, 1);
      assert.equal((await snapshot())[0].marks.check.stroke, 'rgb(141, 219, 173)', 'chosen moves use a green check');
      assert.equal((await snapshot())[0].marks.forced.opacity, 0, 'chosen moves never show a forced arrow');
      await page.keyboard.press("u"); // Remaining 1: 6/5 (13/12 is blocked).
      assert.equal(await page.locator(".board-die.consumed").count(), 2);
      assert.deepEqual((await snapshot())[1].fade.frames, [1, .38], "last die fades even without a next die");
      await finish();
      await page.keyboard.press("x");
      assert.ok((await snapshot()).every(d => d.fade?.frames[0] === .38 && d.fade.frames[1] === 1), "Reset restores both dice together");
      assert.ok((await snapshot()).every(d => d.marks.check.motion?.[1].opacity === 0), "Reset fades both check marks");
      await finish();
      // Shortcuts disappear in both mobile orientations, not point numbers.
      for (const viewport of touch ? [{width:390,height:844}, {width:844,height:390}] : [{width:1366,height:768}]) {
        await page.setViewportSize(viewport);
        assert.equal(await page.locator('.draft-shortcuts kbd.keycap').first().isVisible(), !touch);
        assert.equal(await page.locator('#board .point-shortcut').first().isVisible(), !touch);
        assert.equal(await page.locator('#board .dice-switch .keycap-art').isVisible(), !touch);
        assert.equal(await page.locator('#board .point-number-hit + text').count(), 24);
        assert.equal(await page.locator('#board .point-number-hit + text').first().isVisible(), true);
        await page.screenshot({path: path.join(out, `${name}-dice-shortcuts-${viewport.width}.png`)});
      }
      if (touch) await page.setViewportSize({width:390,height:844});
      await loadRoll([3, 3]);
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("1");
        dice = await snapshot();
        assert.equal(await page.locator(".board-die.consumed").count(), i + 1);
        assert.deepEqual(dice[i].fade.frames, [1, .38], `doubles slot ${i} fades`);
        assert.equal(dice[i].motion?.duration, 280, `doubles slot ${i} lowers`);
        assert.deepEqual(dice[i].marks.check.motion, [{ opacity: 0, offset: 100 }, { opacity: 1, offset: 0 }], `doubles slot ${i} draws its check`);
        if (i < 3) assert.equal(dice[i + 1].motion?.duration, 280, "next doubles slot lifts");
        await finish();
      }
      await page.keyboard.press("z");
      assert.deepEqual((await snapshot())[3].fade.frames, [.38, 1], "doubles undo restores the correct slot");
      await finish();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.keyboard.press("1");
      assert.ok((await snapshot()).every(d => !d.motion && !d.fade && !d.marks.check.motion && !d.marks.blocked.motion), "reduced motion consumes immediately");
      await page.keyboard.press("z");
      assert.ok((await snapshot()).every(d => !d.motion && !d.fade && !d.marks.check.motion && !d.marks.blocked.motion), "reduced motion undoes immediately");
      assert.equal((await snapshot())[3].marks.check.opacity, 0, "reduced-motion undo hides the mark immediately");
      assert.equal(await page.evaluate(() => visualViewport.scale), 1);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      // Status-only renderer coverage supplements the real Play interactions above.
      const statuses = await page.evaluate(async () => {
        const { Board } = await import('/backgammon/ui/board.mjs');
        const { initialState } = await import('/backgammon/core/rules.mjs');
        const host = document.createElement('div'); document.body.append(host);
        host.style.setProperty('--board-selection', '#bb77ff');
        const board = new Board(host), state = initialState({ phase: 'move', dice: [6, 1] });
        const options = { chooseDie() {}, advanced: true, preferredDie: 6 };
        const read = selector => {
          const mark = host.querySelector(selector), style = getComputedStyle(mark);
          return { opacity: Number(style.opacity), stroke: style.stroke, path: mark.getAttribute('d'),
            animated: mark.getAnimations().some(a => a.id === 'dice-mark') };
        };
        board.render(state, options);
        board.render(state, { ...options, usedDice: [6], forcedDice: [6], playableDice: [] });
        board.animations.forEach(a => { a.currentTime = 100; });
        const forced = read('.die-forced'), hiddenCheck = read('.die-check'), blocked = read('.board-die.blocked .die-blocked');
        board.animations.forEach(a => a.finish());
        // A changed classification crossfades the two separate glyphs instead
        // of swapping a visible path in place or briefly showing an orange check.
        board.render(state, { ...options, usedDice: [6], playableDice: [] });
        board.animations.forEach(a => { a.currentTime = 100; });
        const crossfade = [read('.die-forced'), read('.die-check')];
        board.animations.forEach(a => a.finish());
        const regular = read('.die-check'), hiddenArrow = read('.die-forced');
        board.render(state, options);
        board.animations.forEach(a => { a.currentTime = 100; });
        const restoring = [...host.querySelectorAll('.die-status-mark:not(.die-selection-accent)')].map(n => Number(getComputedStyle(n).opacity));
        // A newly enabled reduced-motion preference settles every active mark.
        document.documentElement.dataset.motion = 'reduce'; dispatchEvent(new Event('bg-motion'));
        const settled = [...host.querySelectorAll('.die-status-mark:not(.die-selection-accent)')].every(n => getComputedStyle(n).opacity === '0');
        const animations = board.animations.length;
        const doubles = initialState({phase:'move',dice:[3,3]});
        board.render(doubles, {...options, usedDice:[3,3], forcedDice:[3], lockedDice:1});
        const mixed = [...host.querySelectorAll('.board-die')].map(die => ({
          check:Number(getComputedStyle(die.querySelector('.die-check')).opacity),
          arrow:Number(getComputedStyle(die.querySelector('.die-forced')).opacity),
          label:die.getAttribute('aria-label'),
        }));
        board.destroy(); host.remove(); document.documentElement.dataset.motion = 'system';
        return { forced, hiddenCheck, blocked, crossfade, regular, hiddenArrow, mixed, restoring, settled, animations };
      });
      assert.ok(statuses.forced.animated && statuses.forced.opacity > 0 && statuses.forced.opacity < 1);
      assert.equal(statuses.forced.stroke, 'rgb(239, 179, 101)', 'forced arrow is orange');
      assert.equal(statuses.hiddenCheck.opacity, 0, 'forced move hides the regular check');
      assert.notEqual(statuses.forced.path,statuses.regular.path,'forced and regular moves use distinct glyphs');
      assert.ok(statuses.crossfade.every(m=>m.animated && m.opacity>0 && m.opacity<1),'classification changes crossfade both glyphs');
      assert.equal(statuses.regular.stroke,'rgb(141, 219, 173)','regular check stays green with a purple selection theme');
      assert.equal(statuses.hiddenArrow.opacity,0,'completed regular mark has no forced arrow');
      assert.deepEqual(statuses.mixed.map(m=>[m.arrow,m.check]),[[1,0],[0,1],[0,0],[0,0]],'mixed doubles distinguish the forced and chosen steps');
      assert.match(statuses.mixed[0].label,/forced move/);
      assert.ok(statuses.blocked.animated && statuses.blocked.opacity > 0 && statuses.blocked.opacity < 1, 'blocked X fades in');
      assert.equal(statuses.blocked.stroke, 'rgb(255, 143, 146)', 'blocked X stays red');
      assert.ok(statuses.restoring.filter(o => o > 0 && o < 1).length === 2, 'check and blocked mark fade away together');
      assert.ok(statuses.settled && statuses.animations === 0, 'motion preference changes cancel animations and settle the current state');
      await loadRoll([4, 1], 'beginner');
      await activate('#board .board-die[data-die="4"]'); await finish();
      await activate('#board .board-die.preferred'); await finish();
      assert.equal(await page.locator('.board-die.preferred').getAttribute('data-die'), '1', 'beginner selected-face tap switches too');
      await tapLane(); await finish();
      assert.equal(await page.locator('.board-die.preferred').getAttribute('data-die'), '4', 'beginner padded area switches');
      if (touch) await page.locator('#board [data-point="12"] .checker').last().tap();
      else await page.locator('#board [data-point="12"] .checker').last().click();
      await activate('#board [data-point="8"] .point-hit');
      assert.equal(await page.locator('.board-die.consumed').count(), 1);
      assert.equal((await control()).label, 'Undo draft step', 'dice undo in both playing styles');
      await tapLane();
      assert.equal(await page.locator('.board-die.consumed').count(), 0, 'beginner lane undoes the draft');
      assert.deepEqual(errors, []);
      report.push({ touch, simultaneous: true, interruption: true, directDie: true, switchControl: true,
        use: true, undo: true, reset: true, doubles: true, checkDrawing: true, markReversal: true, switchIcon: true, stableTargets: true, centeredScale: true, coloredRim: true, nearDiceTaps: true, mobileShortcutsHidden: touch, reducedMotion: true });
    } finally { await context.close(); }
  }
  return report;
};
