// Skins against the assembled site: every registered skin is selectable from
// Settings → Board colors, persists, repaints the chrome and the board, runs
// (or omits) its shader, honours reduced motion, and reaches the hub and the
// docs pages from storage. The shader layer itself is also exercised with a
// synthetic skin so it is covered before themed skins ship.
const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async function skinsUX(browser, base, out, browserName) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: "block",
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const report = { cases: [], skins: [], screenshots: [] };
  const shot = async (name) => {
    const file = `${browserName}-skin-${name}.png`;
    await page.screenshot({ path: path.join(out, file), animations: "disabled" });
    report.screenshots.push(file);
  };
  const stored = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("backgammon.v1.settings") || "{}"));
  const state = () =>
    page.evaluate(() => ({
      skin: document.documentElement.dataset.skin,
      scheme: document.documentElement.style.colorScheme,
      themeColor: document.querySelector('meta[name="theme-color"]')?.content,
      page: document.documentElement.style.getPropertyValue("--page").trim(),
      canvas: !!document.getElementById("skin-canvas"),
      canvasFirst: document.body.firstElementChild?.id === "skin-canvas",
      shaderClass: document.documentElement.classList.contains("skin-shader"),
      style: document.getElementById("skin-style")?.textContent ?? null,
      defs: document.getElementById("skin-board-definitions")?.dataset.skin ?? null,
      defsCount: document.querySelectorAll("#skin-board-definitions defs > *").length,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      boot: JSON.parse(localStorage.getItem("backgammon.v1.skin-boot") || "null"),
      shader: window.__bgShader,
    }));
  const openColors = async () => {
    await page.locator("#preferences").click();
    await page.locator(".settings-dialog").waitFor();
    await page.getByRole("tab", { name: "Board colors", exact: true }).click();
  };
  const close = async () => {
    await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  };
  const setMotion = async (value) => {
    await page.getByRole("tab", { name: "Display & controls", exact: true }).click();
    await page.getByLabel("Motion", { exact: true }).selectOption(value);
    await page.getByRole("tab", { name: "Board colors", exact: true }).click();
  };
  const frames = () => page.evaluate(() => window.__bgShader?.frames ?? 0);
  const expectStill = async () => {
    await page.waitForTimeout(150);
    const a = await frames();
    await page.waitForTimeout(400);
    assert.equal(await frames(), a, "frame counter stops under reduced motion");
    assert.equal(await page.evaluate(() => window.__bgShader.running), false);
  };
  try {
    await page.goto(base + "/backgammon/play/");
    await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
    const skins = await page.evaluate(async () =>
      (await import("/backgammon/skins/index.mjs")).SKINS.map((s) => ({
        id: s.id,
        name: s.name,
        scheme: s.scheme,
        page: s.tokens.page,
        surface: s.tokens.surface,
        ink: s.tokens.ink,
        muted: s.tokens.muted,
        shader: !!s.shader,
        hasCss: !!s.css.trim(),
        defs: (s.defs.match(/<(?:linear|radial)Gradient|<pattern|<filter/g) || []).length > 0,
      })),
    );
    assert.ok(skins.length >= 1 && skins[0].id === "classic");
    const initial = await state();
    assert.equal(initial.skin, "tidal"); // the default skin (skins/index.mjs DEFAULT_SKIN)
    await openColors();
    const section = page.locator('section[aria-label="Style"] .skin-grid');
    assert.equal(await section.locator(".skin-choice").count(), skins.length);
    for (const skin of skins) {
      const choice = page.locator(`.skin-choice[data-skin="${skin.id}"]`);
      const box = await choice.boundingBox();
      assert.ok(box.height >= 44, `${skin.id} choice is ${box.height}px tall`);
      await choice.click();
      assert.equal(await choice.getAttribute("aria-pressed"), "true");
      const settings = await stored();
      assert.equal(settings.skin, skin.id);
      assert.equal(settings.boardTheme.preset, skin.id === "classic" ? "slate" : skin.id);
      assert.deepEqual(settings.boardTheme.colors, {});
      const preset = skin.id === "classic" ? "slate" : skin.id;
      assert.equal(await page.locator(`.theme-preset[data-preset="${preset}"]`).getAttribute("aria-pressed"), "true");
      assert.equal(await page.locator("#theme-name").innerText(), await page.evaluate(
        async (id) => (await import("/backgammon/core/appearance.mjs")).BOARD_PRESETS.find((p) => p.id === id).name, preset));
      const s = await state();
      assert.equal(s.skin, skin.id);
      assert.equal(s.scheme, skin.scheme);
      assert.equal(s.themeColor, skin.page);
      assert.equal(s.page, skin.page);
      assert.deepEqual(s.boot, { id: skin.id, page: skin.page, surface: skin.surface, ink: skin.ink, muted: skin.muted, scheme: skin.scheme });
      assert.equal(s.defs, skin.id);
      assert.equal(s.defsCount > 0, skin.defs, `${skin.id} defs injected`);
      assert.equal(!!s.style?.trim(), skin.hasCss, `${skin.id} css injected`);
      assert.equal(s.canvas, skin.shader, `${skin.id} canvas present iff shader`);
      assert.equal(s.shaderClass, skin.shader);
      if (skin.shader) {
        assert.ok(s.canvasFirst, "canvas is the first child of body");
        assert.equal(s.bodyBackground, "rgba(0, 0, 0, 0)", "body is transparent under a shader");
        await page.waitForFunction(() => window.__bgShader?.running === true, null, { timeout: 2000 });
        const before = await frames();
        await page.waitForTimeout(300);
        assert.ok((await frames()) > before, `${skin.id} shader draws frames`);
        await setMotion("reduce");
        await expectStill();
        assert.equal(await page.locator("#skin-canvas").count(), 1, "the still frame keeps the canvas");
        await setMotion("system");
        await page.waitForFunction(() => window.__bgShader?.running === true, null, { timeout: 2000 });
      } else {
        assert.equal(await page.evaluate(() => window.__bgShader?.running ?? false), false);
      }
      assert.deepEqual(errors, [], skin.id);
      report.skins.push({ id: skin.id, shader: skin.shader, renderer: s.shader?.renderer || null });
      if (browserName === "chromium") {
        await shot(`${skin.id}-settings`);
        await close();
        await page.waitForTimeout(skin.shader ? 250 : 50);
        await shot(`${skin.id}-1440x900`);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(skin.shader ? 350 : 50);
        await shot(`${skin.id}-390x844`);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForTimeout(50);
        await openColors();
      }
    }
    report.cases.push(`${skins.length} skins selectable, stored, applied and screenshotted`);

    // The shader layer with a synthetic skin: compiles, paces, pauses under
    // reduced motion, restarts on the next bg-motion, and stops cleanly.
    await close();
    const synthetic = await page.evaluate(async () => {
      const layer = await import("/backgammon/ui/shader-layer.mjs");
      const skin = {
        id: "synthetic", scheme: "dark",
        shader: {
          fragment: "precision mediump float;uniform float u_time;uniform vec2 u_resolution;uniform vec2 u_pointer;uniform vec3 u_c1,u_c2,u_c3,u_c4;uniform float u_dark;void main(){vec2 uv=gl_FragCoord.xy/u_resolution;gl_FragColor=vec4(mix(u_c1,u_c2,uv.x*0.5+0.25*sin(u_time))*u_dark,1.0);}",
          colors: ["#08090D", "#9BD6C9", "#151A24", "#7CC8FF"], speed: 1, fps: 60, stillAt: 2,
        },
      };
      const started = layer.startShader(skin);
      await new Promise((r) => setTimeout(r, 600));
      const canvas = document.getElementById("skin-canvas");
      const running = window.__bgShader.running, frames = window.__bgShader.frames;
      const first = document.body.firstElementChild === canvas;
      document.documentElement.dataset.motion = "reduce";
      dispatchEvent(new Event("bg-motion"));
      await new Promise((r) => setTimeout(r, 120));
      const stillFrames = window.__bgShader.frames;
      await new Promise((r) => setTimeout(r, 300));
      const stillFrames2 = window.__bgShader.frames, stillRunning = window.__bgShader.running;
      document.documentElement.dataset.motion = "system";
      dispatchEvent(new Event("bg-motion"));
      await new Promise((r) => setTimeout(r, 300));
      const resumed = window.__bgShader.running && window.__bgShader.frames > stillFrames2;
      // A broken fragment must warn, remove the canvas and never throw.
      const bad = layer.startShader({ id: "broken", scheme: "dark", shader: { ...skin.shader, fragment: "void main(){ nope }" } });
      await new Promise((r) => setTimeout(r, 400));
      const brokenCanvas = !!document.getElementById("skin-canvas"), brokenClass = document.documentElement.classList.contains("skin-shader");
      layer.stopShader();
      return { started, running, frames, first, stillAdvanced: stillFrames2 - stillFrames, stillRunning, resumed, bad,
        brokenCanvas, brokenClass, renderer: window.__bgShader.renderer, afterStop: !!document.getElementById("skin-canvas") };
    });
    assert.equal(synthetic.started, true);
    assert.equal(synthetic.running, true, JSON.stringify(synthetic));
    assert.ok(synthetic.frames > 3, JSON.stringify(synthetic));
    assert.ok(synthetic.first);
    assert.equal(synthetic.stillAdvanced, 0, "no frames after the still frame");
    assert.equal(synthetic.stillRunning, false);
    assert.ok(synthetic.resumed, "resumes when motion returns");
    assert.equal(synthetic.brokenCanvas, false, "a compile failure removes the canvas");
    assert.equal(synthetic.brokenClass, false);
    assert.equal(synthetic.afterStop, false);
    assert.deepEqual(errors, []);
    report.cases.push("shader layer: synthetic fragment runs, pauses under reduced motion, resumes, fails safely");
    report.renderer = synthetic.renderer;

    // Storage → hub and docs pages, with the last selected skin.
    const last = skins.at(-1);
    await page.evaluate((id) => {
      const s = JSON.parse(localStorage.getItem("backgammon.v1.settings") || "{}");
      s.skin = id;
      localStorage.setItem("backgammon.v1.settings", JSON.stringify(s));
    }, last.id);
    for (const route of ["/backgammon/", "/backgammon/controls/"]) {
      await page.goto(base + route);
      await page.waitForFunction((id) => document.documentElement.dataset.skin === id, last.id);
      const s = await state();
      assert.equal(s.themeColor, last.page, route);
      assert.equal(s.canvas, last.shader, route);
      assert.deepEqual(errors, [], route);
      if (browserName === "chromium") await shot(`${last.id}-${route.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "hub"}`);
    }
    // The pre-paint script applies the cached skin before any module runs.
    const prepaint = await page.evaluate(() => {
      const boot = JSON.parse(localStorage.getItem("backgammon.v1.skin-boot"));
      return { boot, skin: document.documentElement.dataset.skin };
    });
    assert.equal(prepaint.boot.id, last.id);
    const probe = await context.newPage();
    await probe.addInitScript(() => {
      // Runs before <html> exists: watch the document for the attribute.
      new MutationObserver(() => {
        const skin = document.documentElement?.dataset.skin;
        if (skin && !window.__skinSeen)
          window.__skinSeen = { skin, bodyReady: !!document.body };
      }).observe(document, { attributes: true, childList: true, subtree: true });
    });
    await probe.goto(base + "/backgammon/play/");
    const seen = await probe.evaluate(() => window.__skinSeen);
    assert.equal(seen?.skin, last.id, "data-skin painted from the boot cache");
    assert.equal(seen?.bodyReady, false, "painted in <head>, before the body exists");
    await probe.close();
    report.cases.push("hub and docs apply the stored skin; the head script paints data-skin before the body");
    assert.deepEqual(errors, []);
    return report;
  } finally {
    await context.close();
  }
};
