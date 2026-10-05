// Real Web Audio, WAAPI, controls and state invariants on the assembled site.
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
module.exports = async function feedbackUX(browser, base, out, browserName) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    serviceWorkers: "block",
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const report = { cases: [], screenshots: [], audio: null };
  const shot = async (name) => {
    const file = `${browserName}-feedback-${name}.png`;
    await page.screenshot({ path: path.join(out, file), fullPage: true });
    report.screenshots.push(file);
  };
  const cues = () => page.evaluate(() => feedbackCues);
  const settled = () =>
    page.waitForFunction(
      () => !document.querySelector(".moving-checker,[data-arriving]"),
      null,
      { timeout: 2000 },
    );
  const pauseBoard = (time = 105) =>
    page.evaluate((time) => {
      for (const animation of document.getAnimations()) {
        if (animation.effect?.target?.closest("#board")) {
          animation.pause();
          animation.currentTime = time;
        }
      }
    }, time);
  try {
    await page.addInitScript(() => {
      const random = crypto.getRandomValues.bind(crypto),
        dice = [2, 0, 3, 1];
      crypto.getRandomValues = (a) =>
        a instanceof Uint8Array && a.length === 1 && dice.length
          ? ((a[0] = dice.shift()), a)
          : random(a);
    });
    await page.goto(base + "/backgammon/play/");
    assert.equal(
      await page.evaluate(
        async () => !!(await import("/backgammon/ui/sound.mjs")).sound.context,
      ),
      false,
    );
    await page.evaluate(async () => {
      const { sound } = await import("/backgammon/ui/sound.mjs");
      window.feedbackCues = [];
      const play = sound.play.bind(sound);
      sound.play = (name) => {
        const played = play(name);
        if (played) feedbackCues.push(name);
        return played;
      };
    });
    await page
      .getByRole("button", { name: "Same device", exact: true })
      .click();
    await page.waitForFunction(
      async () =>
        (await import("/backgammon/ui/sound.mjs")).sound.context?.state ===
        "running",
    );
    await page.locator("#start-match").click();
    await page.locator("#roll").click();
    await page.locator("#begin-turn").waitFor();
    await page.waitForFunction(
      () => !document.querySelector("#begin-turn")?.disabled,
    );
    assert.deepEqual(await cues(), ["die", "die"]);
    await shot("opening");
    await page.locator("#begin-turn").click();
    while (await page.locator("#confirm").isDisabled())
      await page.locator("#draft-controls select").selectOption({ index: 1 });
    await settled();
    await page.locator("#confirm").click();
    await page.getByRole("button", { name: "Double", exact: true }).click();
    await page.getByRole("button", { name: "Take 2", exact: true }).click();
    await page.locator("#roll").click();
    await page.locator(".board-die-face").first().waitFor();
    await pauseBoard(110);
    assert.ok(
      await page
        .locator(".board-die-face")
        .evaluateAll((nodes) => nodes.some((n) => n.getAnimations().length)),
    );
    await shot("dice-tumble");
    assert.ok((await cues()).includes("roll"));
    assert.ok((await cues()).includes("cube"));
    assert.ok((await cues()).includes("confirm"));
    await page.evaluate(() =>
      document.getAnimations().forEach((a) => a.finish()),
    );
    const gameState = await page.evaluate(
      async () =>
        (
          await (
            await import("/backgammon/core/storage.mjs")
          ).get("work", "play")
        ).game,
    );
    assert.deepEqual(gameState.state.dice, [4, 2]);
    report.cases.push(
      "lazy gesture-unlocked real AudioContext",
      "one sound per opening die",
      "committed roll/cube/confirmation cues",
    );

    await page.locator("#preferences").click();
    await page
      .getByRole("button", { name: "Display & controls", exact: true })
      .click();
    const volume = page.getByRole("slider", {
      name: "Sound volume",
      exact: true,
    });
    await volume.focus();
    await page.keyboard.press("Home");
    assert.equal(
      await page
        .getByRole("button", { name: "Preview sounds", exact: true })
        .isDisabled(),
      true,
    );
    await page.keyboard.press("End");
    for (let n = 0; n < 6; n++) await page.keyboard.press("ArrowLeft");
    assert.equal(await volume.inputValue(), "70");
    await page
      .getByRole("button", { name: "Preview sounds", exact: true })
      .click();
    await shot("settings-desktop");
    const sizes =
      browserName === "chromium"
        ? [
            [320, 568],
            [375, 667],
            [390, 844],
            [430, 932],
            [844, 390],
            [768, 1024],
            [1024, 768],
            [1366, 768],
            [1440, 900],
          ]
        : [
            [390, 844],
            [844, 390],
          ];
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await volume.scrollIntoViewIfNeeded();
      await shot(`settings-${width}x${height}`);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      assert.ok(
        await volume.evaluate((n) => n.getBoundingClientRect().height >= 44),
      );
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await page.locator("#sound-toggle").click();
    assert.equal(
      await page.locator("#sound-toggle").getAttribute("aria-pressed"),
      "false",
    );
    assert.equal(
      await page.evaluate(
        async () =>
          (await import("/backgammon/ui/sound.mjs")).sound.voices.size,
      ),
      0,
    );
    const other = await context.newPage();
    await other.goto(base + "/backgammon/solver/");
    assert.equal(
      await other.locator("#sound-toggle").getAttribute("aria-pressed"),
      "false",
    );
    await other.locator("#sound-toggle").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#sound-toggle").getAttribute("aria-pressed") ===
        "true",
    );
    await other.close();
    await page.bringToFront();
    assert.deepEqual(
      await page.evaluate(
        async () =>
          (
            await (
              await import("/backgammon/core/storage.mjs")
            ).get("work", "play")
          ).game,
      ),
      gameState,
    );
    report.cases.push(
      "keyboard volume and zero volume",
      "mute stops active voices",
      "settings persist and sync across tools/tabs",
      "settings preserve committed dice/history",
    );

    // Render the actual generated buffers through this browser's audio engine.
    report.audio = await page.evaluate(async () => {
      const { CUES, synthesizeCue } =
        await import("/backgammon/core/sound.mjs");
      const { SoundPlayer } = await import("/backgammon/ui/sound.mjs");
      const Context =
        window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const ctx = new Context(1, 44100 * 7, 44100);
      const output = [];
      let at = 0.1;
      for (const name of Object.keys(CUES)) {
        const samples = synthesizeCue(name, ctx.sampleRate);
        const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
        buffer.copyToChannel(samples, 0);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(at);
        output.push({ name, at, duration: samples.length / ctx.sampleRate });
        at += 0.55;
      }
      const rendered = await ctx.startRendering(),
        data = rendered.getChannelData(0);
      for (const entry of output) {
        const region = data.slice(
          Math.floor(entry.at * 44100),
          Math.ceil((entry.at + entry.duration) * 44100),
        );
        entry.peak = Math.max(...region.map(Math.abs));
        entry.rms = Math.sqrt(
          region.reduce((sum, x) => sum + x * x, 0) / region.length,
        );
      }
      return {
        sampleRate: rendered.sampleRate,
        cues: output,
        samples: Array.from(data),
      };
    });
    for (const cue of report.audio.cues) {
      assert.ok(cue.peak > 0.025 && cue.peak < 0.8);
      assert.ok(cue.rms > 0.003);
    }
    if (browserName === "chromium") {
      const samples = report.audio.samples,
        wav = Buffer.alloc(44 + samples.length * 2);
      wav.write("RIFF", 0);
      wav.writeUInt32LE(wav.length - 8, 4);
      wav.write("WAVEfmt ", 8);
      wav.writeUInt32LE(16, 16);
      wav.writeUInt16LE(1, 20);
      wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(44100, 24);
      wav.writeUInt32LE(88200, 28);
      wav.writeUInt16LE(2, 32);
      wav.writeUInt16LE(16, 34);
      wav.write("data", 36);
      wav.writeUInt32LE(samples.length * 2, 40);
      samples.forEach((v, i) =>
        wav.writeInt16LE(Math.round(v * 32767), 44 + i * 2),
      );
      fs.writeFileSync(path.join(out, "sound-preview.wav"), wav);
    }
    delete report.audio.samples;
    report.cases.push(
      "all 11 cues rendered by real OfflineAudioContext without clipping",
    );

    await page.reload();
    await page.locator("#resume-match").click();
    await page.locator(".board-die-face").first().waitFor();
    assert.equal(
      await page.evaluate(
        async () => (await import("/backgammon/ui/sound.mjs")).sound.last.size,
      ),
      0,
    );
    assert.equal(
      await page
        .locator(".board-die-face")
        .evaluateAll((nodes) => nodes.some((n) => n.getAnimations().length)),
      false,
    );
    assert.deepEqual(
      await page.evaluate(
        async () =>
          (
            await (
              await import("/backgammon/core/storage.mjs")
            ).get("work", "play")
          ).game,
      ),
      gameState,
    );
    report.cases.push(
      "resume preserves dice and never replays old sound/roll effects",
    );

    // Use the production board/draft with a legally validated doubles route.
    await page.evaluate(async () => {
      const { shell, DraftBoard } = await import("/backgammon/ui/shell.mjs");
      const rules = await import("/backgammon/core/rules.mjs");
      const store = await import("/backgammon/core/storage.mjs");
      const ui = shell("play", "Motion check");
      const draft = new DraftBoard(ui.board);
      const state = rules.initialState({
        matchLength: 0,
        phase: "move",
        dice: [2, 2],
      });
      state.points = Array(24).fill(0);
      state.points[23] = 1;
      state.points[18] = -15;
      state.off = [14, 0];
      rules.assertState(state);
      draft.set(state, rules.legalPaths(state));
      window.feedbackBoard = { draft, state, rules, store };
    });
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => {
        const { draft: d, state, rules: r } = feedbackBoard;
        d.set(state, r.legalPaths(state));
        d.point(23);
        d.point(15);
        for (const a of d.board.animations) {
          a.pause();
          a.currentTime = 105;
        }
      });
      await shot(`checker-arc-${width}x${height}`);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      assert.ok(await page.locator(".moving-checker").count());
      await page.evaluate(() => {
        const { draft: d } = feedbackBoard;
        d.reset();
      });
      await settled();
      assert.equal(
        await page.evaluate(() => feedbackBoard.draft.draft.length),
        0,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      const d = feedbackBoard.draft;
      d.point(23);
      d.point(15);
      d.point(15);
    });
    assert.equal(
      await page.locator(".moving-checker,[data-arriving]").count(),
      0,
      "Next tap settles a compound animation immediately",
    );
    await page.evaluate(() => feedbackBoard.draft.point(23));
    await settled();
    assert.deepEqual(
      await page.evaluate(() => feedbackBoard.draft.current().points),
      await page.evaluate(() => feedbackBoard.state.points),
    );
    await page.evaluate(() => {
      const d = feedbackBoard.draft;
      d.point(23);
      d.point(15);
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(
      () => !document.querySelector(".moving-checker,[data-arriving]"),
    );
    await page.evaluate(() => feedbackBoard.draft.reset());
    assert.equal(await page.locator(".moving-checker").count(), 0);
    await shot("reduced-motion");
    report.cases.push(
      "lift/waypoint/settle frames across viewports",
      "reset/reverse exact original state",
      "next input interrupts motion",
      "live reduced-motion changes settle immediately",
    );

    await page.evaluate(() => {
      window.originalStorageWrite = Storage.prototype.setItem;
      Storage.prototype.setItem = () => {
        throw new Error("Storage full");
      };
    });
    await page.locator("#sound-toggle").click();
    assert.equal(
      await page.locator("#sound-toggle").getAttribute("aria-pressed"),
      "false",
    );
    assert.match(
      await page.locator("#toast").innerText(),
      /applies to this tab/,
    );
    assert.equal(
      await page.evaluate(async () =>
        (await import("/backgammon/ui/sound.mjs")).sound.play("roll"),
      ),
      false,
    );
    await page.evaluate(() => {
      Storage.prototype.setItem = originalStorageWrite;
    });
    await page.locator("#sound-toggle").click();
    assert.equal(
      await page.locator("#sound-toggle").getAttribute("aria-pressed"),
      "true",
    );
    report.cases.push("mute remains usable when browser storage fails");

    // A background lifecycle signal cancels both scheduled contacts and active
    // audio; visibility is simulated here (not a physical mobile suspension).
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() => {
      const d = feedbackBoard.draft;
      d.point(23);
      d.point(15);
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    assert.equal(await page.locator(".moving-checker").count(), 0);
    assert.equal(
      await page.evaluate(
        async () =>
          (await import("/backgammon/ui/sound.mjs")).sound.voices.size,
      ),
      0,
    );
    assert.equal(
      await page.evaluate(
        () => feedbackBoard.draft.board.feedbackTimers.length,
      ),
      0,
    );
    report.cases.push(
      "background signal cancels audio and pending contact timers",
    );
    assert.deepEqual(errors, []);
    return report;
  } finally {
    await context.close();
  }
};
