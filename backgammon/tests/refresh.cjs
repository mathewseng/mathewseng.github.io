// Real service-worker upgrade, including a previously cached manifest and CSS.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
module.exports = async function refreshUX(browser, out, browserName) {
  const root = path.resolve("_site");
  let legacy = true;
  const legacyHTML = `<!doctype html><html><head><link rel="stylesheet" href="/backgammon/styles.css"></head><body><h1 id="legacy">Old Backgammon</h1></body></html>`;
  const legacyWorker = `importScripts('./offline-manifest.js');
    const CACHE = 'backgammon-assets-' + self.BG_CACHE_VERSION;
    self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(self.BG_SHELL))));
    self.addEventListener('fetch', event => {
      const url = new URL(event.request.url);
      if (event.request.method !== 'GET' || url.origin !== location.origin) return;
      const key = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
      event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(key)) || fetch(event.request)));
    });`;
  const mime = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".wasm": "application/wasm",
  };
  const server = http.createServer((req, res) => {
    let url = new URL(req.url, "http://localhost").pathname;
    if (url.endsWith("/")) url += "index.html";
    const file = path.join(root, url);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403);
      return res.end();
    }
    res.setHeader(
      "Content-Type",
      mime[path.extname(file)] || "application/octet-stream",
    );
    res.setHeader(
      "Cache-Control",
      /\/(?:sw\.js|refresh\/index\.html)$/.test(url)
        ? "no-cache"
        : "public, max-age=86400",
    );
    if (legacy) {
      if (url === "/backgammon/play/index.html") return res.end(legacyHTML);
      if (url === "/backgammon/styles.css")
        return res.end(":root { --cached-generation: legacy; }");
      if (url === "/backgammon/sw.js") return res.end(legacyWorker);
      if (url === "/backgammon/offline-manifest.js")
        return res.end(
          "self.BG_CACHE_VERSION='legacy'; self.BG_SHELL=['/backgammon/play/index.html','/backgammon/styles.css'];",
        );
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(404);
        return res.end("Not found");
      }
      res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 },
  });
  const errors = [],
    report = { cases: [], screenshots: [] };
  context.on("page", (page) =>
    page.on("pageerror", (error) => errors.push(error.message)),
  );
  const shot = async (page, name) => {
    const file = `${browserName}-refresh-${name}.png`;
    await page.screenshot({ path: path.join(out, file), fullPage: true });
    report.screenshots.push(file);
  };
  const readSaved = (page) =>
    page.evaluate(async () => {
      const storage = await import("/backgammon/core/storage.mjs");
      return {
        items: await storage.all("items"),
        progress: await storage.all("progress"),
        work: await storage.get("work", "play"),
        settings: localStorage.getItem("backgammon.v1.settings"),
        other: localStorage.getItem("other-family-setting"),
      };
    });
  try {
    const old = await context.newPage();
    await old.goto(base + "/backgammon/play/");
    await old.evaluate(async () => {
      await navigator.serviceWorker.register("/backgammon/sw.js", {
        scope: "/backgammon/",
      });
      await navigator.serviceWorker.ready;
      const storage = await import("/backgammon/core/storage.mjs");
      const rules = await import("/backgammon/core/rules.mjs");
      const initial = rules.initialState({ matchLength: 5 });
      const action = { type: "opening", dice: [3, 1] };
      const state = rules.transition(initial, action, 0);
      const config = {
        mode: "local",
        matchLength: 5,
        strength: "quick",
        tutor: false,
        warning: false,
        name: "You",
        opponent: "Friend",
      };
      const game = {
        id: "refresh-test",
        initial,
        state,
        events: [{ actor: 0, action }],
        names: ["You", "Friend"],
        config,
        started: true,
      };
      await storage.put("work", {
        id: "play",
        game,
        positionKey: rules.positionKey(state),
        draft: [rules.legalPaths(state)[0].steps[0]],
      });
      await storage.put(
        "items",
        storage.itemRecord("position", {
          state,
          title: "Keep this position",
          notes: "Saved before updating",
        }),
      );
      await storage.put("progress", {
        id: "refresh-progress",
        due: 12345,
        attempts: 2,
      });
      storage.saveSettings({
        motion: "reduce",
        orientation: 1,
        boardTheme: {
          version: 1,
          preset: "midnight",
          colors: { frame: "#223344" },
        },
      });
      localStorage.setItem("other-family-setting", "keep");
      const other = await caches.open("other-family-cache");
      await other.put("/other-family/sentinel", new Response("keep"));
    });
    await old.reload();
    assert.equal(await old.locator("#legacy").textContent(), "Old Backgammon");
    assert.ok(await old.evaluate(() => navigator.serviceWorker.controller));
    const saved = await readSaved(old);
    legacy = false;
    await old.reload();
    assert.equal(
      await old.locator("#legacy").count(),
      1,
      "The old cache actually hides the deployed update",
    );
    const recovery = await context.newPage();
    await recovery.goto(base + "/backgammon/refresh/");
    await shot(recovery, "ready");
    await recovery.locator("#refresh").click();
    await recovery.waitForFunction(
      () => !document.querySelector("#refresh").disabled,
      null,
      { timeout: 60000 },
    );
    assert.match(
      await recovery.locator("#status").innerText(),
      /Close the other Backgammon tabs/,
    );
    assert.equal(await old.locator("#legacy").count(), 1);
    assert.ok(
      await old.evaluate(async () =>
        (await caches.keys()).includes("backgammon-assets-legacy"),
      ),
      "An open game retains its working cache",
    );
    await shot(recovery, "other-tab");
    await old.close();
    await recovery.locator("#refresh").click();
    await recovery.waitForFunction(
      () => !document.querySelector("#refresh").disabled,
      null,
      { timeout: 60000 },
    );
    assert.equal(
      await recovery.locator("#status").innerText(),
      "Updated. Your saved data is unchanged.",
    );
    assert.ok(await recovery.locator("#continue").isVisible());
    assert.equal(
      await recovery
        .locator("#continue")
        .evaluate((n) => n === document.activeElement),
      true,
    );
    assert.deepEqual(
      await readSaved(recovery),
      saved,
      "Settings, game, draft, Library, progress and other-family storage survive exactly",
    );
    const cacheState = await recovery.evaluate(async () => ({
      keys: await caches.keys(),
      style: await (await caches.match("/backgammon/styles.css")).text(),
      other: await (await caches.match("/other-family/sentinel")).text(),
      recoveryCached: !!(await caches.match("/backgammon/refresh/index.html")),
      policy: (await navigator.serviceWorker.getRegistration("/backgammon/"))
        .updateViaCache,
    }));
    assert.ok(!cacheState.keys.includes("backgammon-assets-legacy"));
    assert.equal(
      cacheState.style,
      fs.readFileSync(path.join(root, "backgammon/styles.css"), "utf8"),
      "Fresh CSS replaces HTTP-cached CSS",
    );
    assert.equal(cacheState.other, "keep");
    assert.equal(cacheState.recoveryCached, false);
    assert.equal(cacheState.policy, "none");
    await shot(recovery, "complete");
    for (const [width, height] of [
      [320, 568],
      [844, 390],
      [1366, 768],
    ]) {
      await recovery.setViewportSize({ width, height });
      assert.ok(
        await recovery.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "No horizontal overflow",
      );
      await shot(recovery, `${width}x${height}`);
    }
    await recovery.setViewportSize({ width: 375, height: 667 });
    await recovery.locator("#continue").click();
    await recovery.locator("#panel-toggle").click();
    await recovery.locator("#resume-match").click();
    await recovery
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    if (await recovery.locator("#begin-turn").count())
      await recovery.locator("#begin-turn").click();
    await recovery.locator("#undo").waitFor();
    assert.ok(await recovery.locator("#undo").isEnabled());
    const resumed = await readSaved(recovery);
    assert.deepEqual(
      resumed.work.game.state,
      saved.work.game.state,
      "Committed opening dice are unchanged",
    );
    assert.deepEqual(resumed.work.draft, saved.work.draft);
    await recovery.locator("#preferences").click();
    await recovery.locator('[data-preset="midnight"]').waitFor();
    assert.equal(
      await recovery
        .locator('[data-preset="midnight"]')
        .getAttribute("aria-pressed"),
      "true",
    );
    report.cases.push(
      "real legacy cache and long-lived HTTP cache upgrade",
      "safe refusal with another Backgammon window",
      "Library, game, dice, draft, training progress and preferences retained",
      "other-family storage and cache retained",
      "uncached recovery route",
      "latest board themes loaded",
      "mobile and short landscape reflow",
    );
    assert.deepEqual(errors, []);
    const fresh = await browser.newContext();
    try {
      const page = await fresh.newPage();
      await page.goto(base + "/backgammon/refresh/");
      await page.locator("#refresh").click();
      await page.waitForFunction(
        () => !document.querySelector("#refresh").disabled,
        null,
        { timeout: 60000 },
      );
      assert.equal(
        await page.locator("#status").innerText(),
        "Updated. Your saved data is unchanged.",
        "Recovery also works without an existing service worker",
      );
      report.cases.push("first-time installation through recovery");
    } finally {
      await fresh.close();
    }
  } finally {
    await context.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  return report;
};
