const { waitForAsync } = require("./play-helpers.cjs");
// Actual service workers and the assembled app; no mocked registration/cache APIs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

module.exports = async function updatesUX(browser, _base, out, browserName) {
  const root = path.resolve("_site");
  let release = "one",
    failAsset = false,
    failWorker = false,
    delayAssets = false;
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
    const servedRelease = release;
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
            `offline-manifest.js?v=${servedRelease}`,
          );
      else if (pathname === "/backgammon/offline-manifest.js")
        data = data
          .toString()
          .replace(
            /BG_CACHE_VERSION='[^']+'/,
            `BG_CACHE_VERSION='${url.searchParams.get("v") || servedRelease}'`,
          );
      else if (pathname.endsWith("index.html"))
        data = data
          .toString()
          .replace("<html", `<html data-app-release="${servedRelease}"`)
          .replace(/\?bgv=[a-z0-9]+/g, `?bgv=${servedRelease}`);
      else if (pathname.endsWith("/app.js"))
        data =
          data.toString() +
          `\ndocument.documentElement.dataset.codeRelease = '${servedRelease}';`;
      else if (pathname === "/backgammon/ui/board.mjs")
        data =
          data.toString() +
          `\ndocument.documentElement.dataset.boardCodeRelease = '${servedRelease}';`;
      else if (pathname === "/backgammon/styles.css")
        data =
          data.toString() + `\n:root { --cache-release: ${servedRelease}; }`;
      if (delayAssets && pathname.endsWith(".mjs"))
        setTimeout(() => res.end(data), 100);
      else res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 },
  });
  const report = { cases: [], screenshots: [] },
    errors = [],
    expectedNetworkErrors = [];
  context.on("page", (page) =>
    page.on("pageerror", (error) => {
      if (
        (failAsset || failWorker) &&
        /backgammon\/sw\.js due to access control checks/.test(error.message)
      )
        expectedNetworkErrors.push(error.message); // WebKit's event for the deliberately failed worker install.
      else errors.push(error.message);
    }),
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
    await page
      .waitForFunction(
        (v) =>
          document.documentElement.dataset.appRelease === v &&
          document.readyState === "complete",
        version,
        { timeout: 60000 },
      )
      .catch(async (error) => {
        console.error(
          "Update diagnostic",
          version,
          await page.evaluate(async () => {
            const r = await navigator.serviceWorker.getRegistration();
            return {
              html: document.documentElement.dataset.appRelease,
              code: document.documentElement.dataset.codeRelease,
              body: document.body.innerText,
              sw: [r?.active?.state, r?.installing?.state, r?.waiting?.state],
            };
          }),
        );
        throw error;
      });
    await page.waitForFunction(
      () => !document.querySelector(".app-update-dialog[open]"),
    );
    await page.waitForFunction(() => {
      const status = document.getElementById("app-update-status");
      return !status || ["current", "offline"].includes(status.dataset.state);
    });
    await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
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
        items: (await store.all()).map(({ updatedAt, ...item }) => item),
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
    await page.reload(); // A new page load must finish the real update before entering the tool.
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
    await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
    await page.evaluate(async () => {
      const {put, saveSettings} = await import("/backgammon/core/storage.mjs");
      const {initialState} = await import("/backgammon/core/rules.mjs");
      const {localConfig} = await import("/backgammon/core/play-session.mjs");
      const state = initialState({phase:"move", dice:[4,1]});
      saveSettings({interactionMode:"advanced", motion:"reduce"});
      await put("work", {id:"play", game:{id:"update-test", initial:state, state, events:[],
        started:true, names:["You","Friend"], config:localConfig({mode:"local"})}, draft:[]});
    });
    await page.reload();
    await page.locator("#resume-match").click();
    await page.keyboard.press("1");
    await waitForAsync(page,async () =>
      (await (await import("/backgammon/core/storage.mjs")).get("work","play"))?.draft?.length === 1);
    const game = await saved(page),
      gameLoads = loads;
    release = "four";
    await reconnect(page);
    await waitForAsync(page,
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
    await page.evaluate(() => {
      window.restoreSentinel = {alive:true};
      dispatchEvent(new PageTransitionEvent("pagehide", {persisted:true}));
      dispatchEvent(new PageTransitionEvent("pageshow", {persisted:true}));
    });
    await page.locator("#confirm").waitFor();
    await page.waitForTimeout(300);
    assert.equal(loads, gameLoads, "A page-cache restore stages updates without reloading play");
    assert.equal(await page.evaluate(() => window.restoreSentinel?.alive), true);
    assert.deepEqual((await saved(page)).work, game.work, "The restored draft is unchanged with an update waiting");
    // A load with a staged release cannot expose controls before activation.
    let leavePrompts = 0;
    page.on("dialog", (d) => { leavePrompts++; d.accept(); });
    await page.reload();
    await atRelease(page, "four");
    await page.waitForFunction(() => document.querySelector("#board .point"));
    const restored = await saved(page);
    assert.deepEqual(
      restored.work,
      game.work,
      "the exact game, committed dice and unfinished draft resume",
    );
    assert.deepEqual(restored.items, game.items);
    await shot(page, "game-restored");
    const promptsBefore = leavePrompts;
    const restoredLoads = loads;
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        dispatchEvent(new PageTransitionEvent("pagehide", {persisted:true}));
        dispatchEvent(new PageTransitionEvent("pageshow", {persisted:true}));
      });
      await page.waitForTimeout(100);
    }
    await atRelease(page, "four");
    await page.locator("#confirm").waitFor();
    assert.equal(loads, restoredLoads, "Repeated page-cache restores never navigate");
    assert.equal(leavePrompts, promptsBefore, "Restoring a page does not prompt to leave");
    assert.deepEqual((await saved(page)).work, restored.work);

    report.cases.push(
      "load gate installs a staged update before play",
      "active play is not interrupted by background downloads",
      "draft, dice, Library and preferences survive the required reload",
      "Safari page-cache restores retain the live document and draft, with and without a staged update",
    );
    await page.goto(base + "/backgammon/");
    await atRelease(page, "four");

    release = "five";
    failAsset = true;
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector(".app-update-dialog button:not([hidden])"),
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
    // Restore the network: the bounded automatic retry must recover on its own.
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
    ((failWorker = false), (delayAssets = false));
    release = "six";
    await page.reload();
    await atRelease(page, "six");
    assert.deepEqual(await saved(page), game);
    release = "seven";
    await page.setViewportSize({ width: 375, height: 667 });
    delayAssets = true;
    const solverNavigation = page.goto(base + "/backgammon/solver/", {
      waitUntil: "commit",
    });
    await solverNavigation;
    await page.locator(".app-update-dialog progress[value]").waitFor();
    assert.equal(
      await page.locator("#board").count(),
      0,
      "tool is not interactive during the required update",
    );
    const progress = await page
      .locator("progress")
      .evaluate((p) => ({ value: p.value, max: p.max }));
    assert.ok(progress.value > 0 && progress.max > progress.value);
    await shot(page, "downloading-phone");
    await atRelease(page, "seven");
    delayAssets = false;
    report.cases.push(
      "real file download progress before tool initialization",
      "retry after failed download",
      "offline startup",
      "no stale dependency cache after reload",
    );

    // Another live window must not be claimed or discarded by an updater.
    const other = await context.newPage();
    await other.goto(base + "/backgammon/");
    release = "eight";
    await page.bringToFront();
    await page.reload({ waitUntil: "commit" });
    await page.getByRole("button", { name: "Retry update" }).waitFor();
    assert.match(
      await page.locator(".update-message").textContent(),
      /other Backgammon tabs/,
    );
    assert.equal(await page.locator("#board").count(), 0);
    await shot(page, "other-tab");
    await other.close();
    await atRelease(page, "eight");
    report.cases.push(
      "another window pauses activation without losing its state",
    );
    // Simulate stale HTML surviving activation, with a real current worker.
    // Start a fresh gate module on that document; worker/cache APIs are untouched.
    const beforeRace = loads;
    await page.evaluate(async () => {
      const entry = document.querySelector('[src*="?bgv="], [href*="?bgv="]');
      const attribute = entry.hasAttribute("src") ? "src" : "href";
      entry.setAttribute(attribute, entry.getAttribute(attribute).replace(/bgv=[a-z0-9]+/, "bgv=stale"));
      const {startUpdates} = await import("/backgammon/ui/updates.mjs?race=activated");
      startUpdates();
    });
    await page.waitForEvent("framenavigated", {predicate: frame => frame === page.mainFrame(), timeout:15000});
    await atRelease(page, "eight");
    assert.equal(loads, beforeRace + 1, "stale document catches up to active worker in exactly one reload");
    assert.deepEqual((await saved(page)).work, game.work);
    report.cases.push("already-active release repairs stale HTML without waiting for another installation");

    // Exhaust automatic retries; manual Retry must still work without navigation.
    release = "nine";
    failAsset = true;
    await page.reload();
    await page.bringToFront();
    await waitForAsync(page,async () => {
      const retry = document.querySelector(".app-update-dialog button");
      const progress = document.querySelector(".app-update-dialog progress");
      const registration = await navigator.serviceWorker.getRegistration("/backgammon/");
      // A late download message can replace the error text while a worker is
      // still installing. Text alone does not establish exhausted retries.
      return retry?.isConnected && !retry.hidden && progress?.hidden &&
        !registration?.installing && !registration?.waiting &&
        !document.hidden &&
        !document.querySelector(".update-message").textContent.includes("Retrying automatically");
    }, null, {timeout:60000});
    assert.deepEqual((await saved(page)).work, game.work);
    failAsset = false;
    await page.getByRole("button", {name:"Retry update"}).click();
    await atRelease(page, "nine");
    assert.deepEqual((await saved(page)).work, game.work);
    report.cases.push("persistent download failure stops automatic retries; explicit Retry still recovers with game intact");
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  fs.writeFileSync(
    path.join(out, `${browserName}-updates.json`),
    JSON.stringify({ ...report, expectedNetworkErrors }, null, 2),
  );
  console.log(
    `${browserName}: automatic update checks passed (${report.cases.length} cases)`,
  );
  return report;
};
