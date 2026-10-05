// Actual service workers and the assembled app; no mocked registration/cache APIs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

module.exports = async function updatesUX(browser, out, browserName) {
  const root = path.resolve("_site");
  let release = "one",
    failAsset = false,
    failWorker = false;
  const requests = [];
  const mime = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let pathname = url.pathname;
    if (pathname.endsWith("/")) pathname += "index.html";
    const file = path.join(root, pathname);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403);
      return res.end();
    }
    requests.push({ release, url: req.url });
    res.setHeader(
      "Content-Type",
      mime[path.extname(file)] || "application/octet-stream",
    );
    if (failWorker && pathname === "/backgammon/sw.js") {
      res.writeHead(503);
      return res.end("Network unavailable");
    }
    res.setHeader(
      "Cache-Control",
      pathname.endsWith("/sw.js") ? "no-cache" : "public, max-age=86400",
    );
    if (failAsset && pathname === "/backgammon/ui/board.mjs") {
      res.writeHead(503);
      return res.end("Temporary download failure");
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(404);
        return res.end("Not found");
      }
      if (pathname === "/backgammon/sw.js")
        data = data
          .toString()
          .replace(
            /offline-manifest\.js\?v=[a-z0-9]+/,
            `offline-manifest.js?v=${release}`,
          );
      else if (pathname === "/backgammon/offline-manifest.js")
        data = data
          .toString()
          .replace(/BG_CACHE_VERSION='[^']+'/, `BG_CACHE_VERSION='${release}'`);
      else if (pathname.endsWith("index.html"))
        data = data
          .toString()
          .replace("<html", `<html data-app-release="${release}"`)
          .replace(/\?bgv=[a-z0-9]+/g, `?bgv=${release}`);
      else if (pathname.endsWith("/app.js"))
        data =
          data.toString() +
          `\ndocument.documentElement.dataset.codeRelease = '${release}';`;
      else if (pathname === "/backgammon/ui/board.mjs")
        data =
          data.toString() +
          `\ndocument.documentElement.dataset.boardCodeRelease = '${release}';`;
      else if (pathname === "/backgammon/styles.css")
        data = data.toString() + `\n:root { --cache-release: ${release}; }`;
      res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 },
  });
  const report = { cases: [], screenshots: [] },
    errors = [];
  context.on("page", (page) =>
    page.on("pageerror", (error) => errors.push(error.message)),
  );
  const shot = async (page, name) => {
    const file = `${browserName}-updates-${name}.png`;
    await page.screenshot({ path: path.join(out, file), fullPage: true });
    report.screenshots.push(file);
  };
  const ready = (page) =>
    page.evaluate(async () => {
      const r = await navigator.serviceWorker.ready;
      if (r.active.state !== "activated")
        await new Promise((resolve) => {
          const worker = r.active;
          worker.addEventListener("statechange", () => {
            if (worker.state === "activated") resolve();
          });
        });
      return { state: r.active.state, policy: r.updateViaCache };
    });
  const atRelease = async (page, version) => {
    await page.waitForFunction(
      (v) =>
        document.documentElement.dataset.appRelease === v &&
        document.readyState === "complete",
      version,
      { timeout: 60000 },
    );
    await page.waitForFunction(
      () => !document.querySelector(".app-update-dialog[open]"),
    );
    await page.waitForFunction(() => {
      const status = document.getElementById("app-update-status");
      return !status || ["current", "offline"].includes(status.dataset.state);
    });
    const styleRelease = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--cache-release")
        .trim(),
    );
    assert.equal(styleRelease, version);
    await page.waitForFunction(
      (v) => document.documentElement.dataset.codeRelease === v,
      version,
    );
    assert.equal(
      await page.locator("html").getAttribute("data-board-code-release"),
      version,
      "Unversioned module dependencies also come from the matching release",
    );
  };
  const reconnect = (page) =>
    page.evaluate(() => dispatchEvent(new Event("online")));
  const saved = (page) =>
    page.evaluate(async () => {
      const store = await import("/backgammon/core/storage.mjs");
      return {
        work: await store.get("work", "play"),
        items: await store.all(),
        settings: localStorage.getItem("backgammon.v1.settings"),
        other: localStorage.getItem("poker.sentinel"),
      };
    });
  try {
    let page = await context.newPage();
    let loads = 0;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) loads++;
    });
    await page.goto(base + "/backgammon/");
    assert.deepEqual(await ready(page), { state: "activated", policy: "none" });
    assert.equal(loads, 1, "First installation does not reload the page");
    await page.reload(); // Become controlled by release one.
    await atRelease(page, "one");
    assert.equal(
      await page
        .getByRole("link", { name: "Refresh app", exact: true })
        .getAttribute("href"),
      "/backgammon/refresh/",
    );
    await page.evaluate(async () => {
      const store = await import("/backgammon/core/storage.mjs");
      const rules = await import("/backgammon/core/rules.mjs");
      await store.put(
        "items",
        store.itemRecord("position", {
          state: rules.initialState(),
          title: "Keep through automatic updates",
        }),
      );
      store.saveSettings({
        motion: "reduce",
        boardTheme: {
          version: 1,
          preset: "midnight",
          colors: { frame: "#223344" },
        },
      });
      localStorage.setItem("poker.sentinel", "keep");
      await (
        await caches.open("poker-cache")
      ).put("/poker/sentinel", new Response("keep"));
    });
    const original = await saved(page);
    release = "two";
    await page.reload(); // Old cached hub boots, checks, activates and reloads itself.
    await atRelease(page, "two");
    assert.deepEqual(await saved(page), original);
    assert.ok(
      requests.some((r) => r.url === "/backgammon/offline-manifest.js?v=two"),
    );
    const settledLoads = loads;
    await reconnect(page);
    await page.waitForFunction(
      () =>
        document.getElementById("app-update-status").dataset.state ===
        "current",
    );
    assert.equal(
      loads,
      settledLoads,
      "An unchanged release never causes a reload loop",
    );
    report.cases.push(
      "hub registration, first install and one automatic reload for a new release",
      "versioned manifest bypasses long-lived HTTP cache",
      "Library/preferences and unrelated family data retained",
      "no reload for unchanged releases",
    );

    release = "three";
    await reconnect(page); // Simulated browser online event; the entire upgrade is real.
    await atRelease(page, "three");
    report.cases.push("automatic check and activation on reconnect");
    for (const [width, height] of [
      [320, 568],
      [375, 667],
      [844, 390],
      [1366, 768],
    ]) {
      await page.setViewportSize({ width, height });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      if (width <= 700) {
        const navigation = await page
          .locator(".switcher a")
          .evaluateAll((links) =>
            links.map((link) => {
              const box = link.getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(link);
              const text = range.getBoundingClientRect();
              return {
                name: link.textContent,
                width: box.width,
                height: box.height,
                fits: text.left >= box.left && text.right <= box.right,
              };
            }),
          );
        for (const link of navigation)
          assert.ok(
            link.width >= 44 && link.height >= 44 && link.fits,
            `${link.name} remains a readable touch target`,
          );
      }
      await shot(page, `hub-${width}x${height}`);
    }

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(base + "/backgammon/play/");
    await page
      .getByRole("button", { name: "Same device", exact: true })
      .click();
    await page.locator("#start-match").click();
    do {
      await page.locator("#roll").click();
      await page.waitForFunction(
        () => !document.querySelector("#roll")?.disabled,
      );
    } while (await page.locator("#roll").count());
    await page.locator("#begin-turn").click();
    await page.locator("#draft-controls select").selectOption({ index: 1 });
    await page.waitForFunction(
      async () =>
        (
          await (
            await import("/backgammon/core/storage.mjs")
          ).get("work", "play")
        )?.draft?.length > 0,
    );
    const game = await saved(page),
      gameLoads = loads;
    release = "four";
    await reconnect(page);
    await page.waitForFunction(
      async () =>
        (await navigator.serviceWorker.getRegistration("/backgammon/"))?.waiting
          ?.state === "installed",
      null,
      { timeout: 60000 },
    );
    assert.equal(
      loads,
      gameLoads,
      "An interacted-with tool never auto-reloads",
    );
    assert.equal(
      await page.locator("html").getAttribute("data-app-release"),
      "three",
    );
    assert.deepEqual(
      await saved(page),
      game,
      "Committed dice and unfinished draft unchanged",
    );
    await page.locator(".brand[data-update-ready]").waitFor();
    await shot(page, "game-retained");
    const hub = await context.newPage();
    await hub.goto(base + "/backgammon/");
    await hub.waitForFunction(() =>
      document
        .getElementById("app-update-status")
        .textContent.includes("Finish and close"),
    );
    assert.equal(
      await hub.locator("html").getAttribute("data-app-release"),
      "three",
    );
    assert.ok(
      await hub.evaluate(async () =>
        (await caches.keys()).includes("backgammon-assets-three"),
      ),
    );
    await hub.setViewportSize({ width: 375, height: 667 });
    await shot(hub, "other-game-open");
    await page.close();
    page = hub;
    await page.bringToFront();
    await page.evaluate(() => dispatchEvent(new Event("focus")));
    await atRelease(page, "four");
    assert.deepEqual(await saved(page), game);
    assert.equal(
      await page.evaluate(
        async () => await (await caches.match("/poker/sentinel")).text(),
      ),
      "keep",
    );
    report.cases.push(
      "active game and draft prevent automatic reload",
      "another open Backgammon window prevents early activation",
      "returning to the hub applies a staged update once other windows close",
      "dice, draft and Library survive automatic activation exactly",
    );

    release = "five";
    failAsset = true;
    await reconnect(page);
    await page.waitForFunction(
      () =>
        document.getElementById("app-update-status").dataset.state === "error",
      null,
      { timeout: 60000 },
    );
    assert.equal(
      await page.locator("html").getAttribute("data-app-release"),
      "four",
    );
    assert.ok(
      await page.evaluate(async () =>
        (await caches.keys()).includes("backgammon-assets-four"),
      ),
    );
    assert.deepEqual(await saved(page), game);
    await shot(page, "failed-download");
    failAsset = false;
    await reconnect(page);
    await atRelease(page, "five");
    assert.deepEqual(await saved(page), game);
    assert.deepEqual(errors, []);
    report.cases.push(
      "failed shell download preserves working release and saved data",
      "reconnect retries a failed download successfully",
    );
    // The cache remains usable if update registration/checking fails at boot.
    failWorker = true;
    await page.reload();
    await atRelease(page, "five");
    await page.waitForFunction(
      () =>
        document.getElementById("app-update-status").dataset.state ===
        "offline",
    );
    failWorker = false;
    release = "six";
    await reconnect(page);
    await atRelease(page, "six");
    assert.deepEqual(await saved(page), game);
    release = "seven";
    await page.goto(base + "/backgammon/solver/");
    await atRelease(page, "seven");
    assert.deepEqual(await saved(page), game);
    report.cases.push(
      "cached startup with a failed network check recovers on reconnect",
      "an untouched direct tool visit updates automatically",
    );
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  fs.writeFileSync(
    path.join(out, `${browserName}-updates.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(
    `${browserName}: automatic update checks passed (${report.cases.length} cases)`,
  );
  return report;
};
