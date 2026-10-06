const { launchQuietBrowser } = require("../../scripts/quiet-browser.cjs");
/* Browser integration uses the assembled _site and real bundled WASM. Run after assemble-site.sh. */
const { chromium, firefox, webkit } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const root = path.resolve("_site"),
  out = path.resolve("backgammon/test-results");
fs.mkdirSync(out, { recursive: true });
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".txt": "text/plain",
};
const server = http.createServer((req, res) => {
  let url = new URL(req.url, "http://localhost").pathname;
  if (url.endsWith("/")) url += "index.html";
  const file = path.join(root, url);
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (e, data) => {
    if (e) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.setHeader(
      "Content-Type",
      MIME[path.extname(file)] || "application/octet-stream",
    );
    res.end(data);
  });
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const errors = [],
    report = {
      base,
      assembled: true,
      browsers: [],
      screenshots: [],
      engine: null,
    };
  try {
    for (const browserName of (process.env.BG_BROWSERS || "chromium").split(
      ",",
    )) {
      const browser = await launchQuietBrowser(
        { chromium, firefox, webkit }[browserName],
        {
          headless: true,
          ...(browserName === "chromium" && process.env.CHROME_PATH
            ? { executablePath: process.env.CHROME_PATH }
            : {}),
        },
      );
      console.log(`Testing ${browserName} ${browser.version()}`);
      report.browsers.push({
        name: browserName,
        version: browser.version(),
      });
      try {
        const context = await browser.newContext({
          viewport: { width: 1366, height: 768 },
          serviceWorkers: "block",
        });
        const page = await context.newPage();
        page.on("pageerror", (e) => errors.push(e.stack));
        const shot = async (name) => {
          const file = path.join(out, `${browserName}-${name}.png`);
          await page.screenshot({ path: file, fullPage: true });
          report.screenshots.push(path.basename(file));
        };
        await page.goto(base + "/backgammon/play/");
        await page
          .getByRole("button", { name: "Same device", exact: true })
          .click();
        await page
          .getByLabel("Match length", { exact: true })
          .selectOption("5");
        await shot("setup");
        await page.locator("#start-match").click();
        do {
          await page.locator("#roll").click();
          await page.waitForTimeout(25);
        } while (await page.locator("#roll").count());
        await page.locator("#begin-turn").click();
        const steps = async () => {
          while (await page.locator("#confirm").isDisabled())
            await page
              .locator("#draft-controls select")
              .selectOption({ index: 1 });
        };
        await steps();
        await page.locator("#reset-draft").click();
        assert.equal(await page.locator(".board-die.consumed").count(), 0);
        assert.ok(await page.locator("#confirm").isDisabled());
        await steps();
        await page.locator("#undo").click();
        assert.ok(await page.locator("#confirm").isDisabled());
        await steps();
        await shot("active-draft");
        await page.locator("#confirm").click();
        await page
          .getByRole("button", { name: "Double", exact: true })
          .click();
        await shot("cube-decision");
        await page
          .getByRole("button", { name: "Take 2", exact: true })
          .click();
        const saved = await page.evaluate(async () => {
          const { get } = await import("/backgammon/core/storage.mjs");
          return (await get("work", "play")).game.state;
        });
        await page.reload();
        await page.locator("#resume-match").click();
        const resumed = await page.evaluate(async () => {
          const { get } = await import("/backgammon/core/storage.mjs");
          return (await get("work", "play")).game.state;
        });
        assert.deepEqual(resumed, saved);
        await page
          .getByRole("button", { name: "Save position", exact: true })
          .click();
        await page
          .getByLabel("Name", { exact: true })
          .fill("Browser-tested cube");
        await page
          .getByLabel("Notes", { exact: true })
          .fill("<img src=x onerror=alert(1)> is literal text.");
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Save", exact: true })
          .click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        await page.goto(base + "/backgammon/library/");
        await page
          .getByRole("button", {
            name: "Open Browser-tested cube",
            exact: true,
          })
          .click();
        await shot("library-populated");
        assert.equal(await page.locator("#panel img").count(), 0);
        await page.goto(base + "/backgammon/trainer/");
        await page.locator("#submit-decision").waitFor();
        assert.equal(
          await page.getByText("Evaluated moves", { exact: true }).count(),
          0,
        );
        await shot("trainer-before");
        while (await page.locator("#submit-decision").isDisabled())
          await page
            .locator("#draft-controls select")
            .selectOption({ index: 1 });
        await page.locator("#submit-decision").click();
        await page
          .getByText("Evaluated moves", { exact: true })
          .waitFor({ timeout: 45000 });
        await shot("trainer-after");
        await page.goto(base + "/backgammon/solver/");
        await page.locator("#edit-position").click();
        await shot("solver-editing");
        await page
          .getByRole("button", { name: "Done editing", exact: true })
          .click();
        await page.locator("#analyze").click();
        await page
          .getByText("Evaluated moves", { exact: true })
          .waitFor({ timeout: 45000 });
        await shot("solver-results");
        const real = await page.evaluate(async () => {
          const { EngineClient } =
            await import("/backgammon/engine/client.mjs");
          const { initialState, legalTurns, positionKey } =
            await import("/backgammon/core/rules.mjs");
          const { fromXGID } = await import("/backgammon/core/xgid.mjs");
          const engine = new EngineClient();
          const fixtures = (
            await (await fetch("/backgammon/data/exercises.json")).json()
          ).items;
          const checked = [];
          for (const item of [
            fixtures[0],
            fixtures.find((i) => i.topic === "contact"),
            fixtures.find((i) => i.topic === "race"),
            fixtures.find((i) => i.topic === "bearoff"),
            fixtures.find((i) => i.topic === "cube"),
          ]) {
            const result = await engine.analyze(item.state);
            const ref = item.analysis;
            const a =
                result.type === "checker"
                  ? result.candidates[0].equity
                  : result.equity,
              b =
                ref.type === "checker"
                  ? ref.candidates[0].equity
                  : ref.equity;
            if (Math.abs(a - b) > 0.0001)
              throw new Error("Engine regression " + item.id);
            checked.push({ id: item.id, equity: a, ms: result.elapsedMs });
          }
          const { default: createModule } =
            await import("/backgammon/engine/vendor/gnubg-core-module.js");
          const module = await createModule({
            locateFile: (name) =>
              new URL("/backgammon/engine/vendor/" + name, location.href)
                .href,
            print: () => {},
            printErr: () => {},
          });
          module.cwrap("init", "number", [])();
          const hint = module.cwrap("hint", "number", ["string", "number"]);
          const { toXGID } = await import("/backgammon/core/xgid.mjs");
          const upstream = (state) => {
            const ptr = hint(toXGID(state), 0);
            try {
              return JSON.parse(module.UTF8ToString(ptr));
            } finally {
              module._free(ptr);
            }
          };
          for (const item of fixtures.slice(0, 5)) {
            const ref = upstream(item.state),
              value = await engine.analyze(item.state);
            if (
              Math.abs(ref.data[0].equity[0] - value.candidates[0].equity) >
              0.00011
            )
              throw new Error("Upstream hint/bridge mismatch.");
          }
          const many = initialState({
            matchLength: 0,
            phase: "move",
            dice: [2, 2],
          });
          const turns = legalTurns(many);
          const graded = await engine.analyze(many, {
            submitted: turns.at(-1).steps,
          });
          if (
            !graded.actual ||
            graded.candidates.length !== turns.length ||
            turns.length <= 40
          )
            throw new Error("Arbitrary move grading failed.");
          const limited = upstream(many);
          if (limited.data.length !== 40)
            throw new Error("Expected documented 40-hint cutoff.");
          const outside = graded.candidates.find(
            (c) => c.equity < limited.data.at(-1).equity[0] - 0.0002,
          );
          if (!outside) throw new Error("Need a move outside hint list.");
          const actualOutside = await engine.analyze(many, {
            submitted: outside.steps,
          });
          if (Math.abs(actualOutside.actual.equity - outside.equity) > 1e-8)
            throw new Error("Outside-list grading mismatch.");
          module.cwrap("shutdown", "number", [])();
          const pos = fromXGID(
            "XGID=aBaB--C-A---dE--ac-e----B-:0:0:1:42:0:0:0:0:10",
          );
          const reverse = {
            ...pos,
            points: pos.points
              .slice()
              .reverse()
              .map((n) => -n),
            turn: 1,
            bar: pos.bar.slice().reverse(),
            off: pos.off.slice().reverse(),
          };
          const a = await engine.analyze(pos),
            b = await engine.analyze(reverse);
          if (
            Math.abs(a.candidates[0].equity - b.candidates[0].equity) >
            0.00001
          )
            throw new Error("Perspective reversal mismatch.");
          const match = { ...pos, matchLength: 7, scores: [2, 5] };
          const m = await engine.analyze(match);
          if (
            m.candidates.some((c) => c.mwc < 0 || c.mwc > 1) ||
            Math.abs(m.candidates[0].equity - a.candidates[0].equity) <
              0.001
          )
            throw new Error("Match context missing.");
          const deep = engine.analyze(pos, { preset: "deep" });
          setTimeout(() => engine.cancel(), 1);
          let cancelled = false;
          try {
            await deep;
          } catch (e) {
            cancelled = e.name === "AbortError";
          }
          if (!cancelled) throw new Error("Real cancellation failed.");
          const again = await engine.analyze(pos);
          engine.destroy();
          return {
            version: a.engine,
            checked,
            arbitraryCandidates: turns.length,
            outsideHintList: true,
            upstreamHintComparisons: 5,
            perspective: true,
            matchContext: true,
            realCancellation: cancelled,
            restart: again.status,
            crossOriginIsolated,
          };
        });
        report.engine = real;
        if (browserName === "chromium") {
          for (const [w, h] of [
            [320, 568],
            [375, 667],
            [390, 844],
            [430, 932],
            [844, 390],
            [768, 1024],
            [1024, 768],
            [1366, 768],
            [1440, 900],
          ]) {
            await page.setViewportSize({ width: w, height: h });
            for (const route of [
              "",
              "play/",
              "trainer/",
              "solver/",
              "library/",
            ]) {
              await page.goto(base + "/backgammon/" + route);
              await page.waitForTimeout(60);
              await shot(`${route.replace("/", "") || "hub"}-${w}x${h}`);
              const layout = await page.evaluate(() => ({
                width: document.documentElement.scrollWidth,
                height: document.documentElement.scrollHeight,
                boardBottom: document
                  .querySelector("#board")
                  ?.getBoundingClientRect().bottom,
                playerTop: document
                  .querySelector("#player")
                  ?.getBoundingClientRect().top,
                action: document
                  .querySelector("#actions")
                  ?.getBoundingClientRect().bottom,
              }));
              assert.ok(
                layout.width <= w + 1,
                `horizontal overflow ${route} ${w}: ${layout.width}`,
              );
              if (layout.playerTop !== undefined)
                assert.ok(
                  layout.boardBottom <= layout.playerTop + 1,
                  `board overlaps player strip ${route} ${w}x${h}`,
                );
              if (route && w > 320) {
                assert.ok(
                  layout.height <= h + 1,
                  `document scroll ${route} ${w}: ${layout.height}`,
                );
                if (route !== "library/")
                  assert.ok(
                    layout.action <= h + 1,
                    `action offscreen ${route} ${w}`,
                  );
              }
            }
          }
          await page.setViewportSize({ width: 390, height: 844 });
          await page.goto(base + "/backgammon/play/");
          await page.emulateMedia({ reducedMotion: "reduce" });
          await page.locator("#panel-toggle").click();
          await page.getByLabel("Ivory player").count();
          await page
            .getByRole("dialog")
            .getByRole("button", { name: "Close", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Settings", exact: true })
            .focus();
          await page.keyboard.press("Enter");
          await page.getByRole("dialog").waitFor();
          assert.ok(await page.getByRole("dialog").isVisible());
          await page.keyboard.press("Escape");
          await page.getByRole("dialog").waitFor({ state: "detached" });
          assert.equal(await page.getByRole("dialog").count(), 0);
          await page.evaluate(
            () => (document.documentElement.style.fontSize = "24px"),
          );
          await shot("enlarged-text");
          // Separate fresh context forces genuine network-load/error states; no service-worker cache masks failures.
          const failureContext = await browser.newContext({
              serviceWorkers: "block",
            }),
            failure = await failureContext.newPage();
          await failure.route("**/gnubg-core-module.data", (r) =>
            r.abort(),
          );
          await failure.goto(base + "/backgammon/solver/");
          await failure.locator("#analyze").click();
          await failure.waitForFunction(
            () => document.querySelector("#toast").textContent.length > 0,
            {},
            { timeout: 50000 },
          );
          await failure.screenshot({
            path: path.join(out, "chromium-engine-error.png"),
            fullPage: true,
          });
          report.screenshots.push("chromium-engine-error.png");
          await failureContext.close();
        }
        await context.close();
        const researchOutput = path.join(out, `research-${browserName}`);
        fs.mkdirSync(researchOutput, { recursive: true });
        await require("./research.cjs")(browser, base, researchOutput);
        (report.lastMoveUX ||= []).push(
          await require("./last-move.cjs")(browser, base, out, browserName),
        );
        report.checkerUX ||= [];
        report.checkerUX.push(
          await require("./checker-ux.cjs")(
            browser,
            base,
            out,
            browserName,
          ),
        );
        report.feedbackUX ||= [];
        report.feedbackUX.push(
          await require("./feedback.cjs")(browser, base, out, browserName),
        );
        report.appearanceUX ||= [];
        report.appearanceUX.push(
          await require("./appearance.cjs")(
            browser,
            base,
            out,
            browserName,
          ),
        );
        report.optionsUX ||= [];
        report.optionsUX.push(
          await require("./options-ui.cjs")(
            browser,
            base,
            out,
            browserName,
          ),
        );
        report.refreshUX ||= [];
        (report.tableControls ||= []).push(
          await require("./table-controls.cjs")(
            browser,
            base,
            out,
            browserName,
          ),
        );
        (report.routeChoice ||= []).push(
          await require("./route-choice.cjs")(
            browser,
            base,
            out,
            browserName,
          ),
        );
        (report.repeatPlay ||= []).push(
          await require("./repeat-play.cjs")(
            browser,
            base,
            out,
            browserName,
          ),
        );
        (report.directPlay ||= []).push(
          await require("./direct-play.cjs")(
            browser,
            base,
            out,
            browserName,
          ),
        );
        (report.highlightActions ||= []).push(
          await require("./highlight-actions.cjs")(browser, base, out, browserName),
        );
        (report.responsiveParity ||= []).push(
          await require("./responsive-parity.cjs")(browser, base, out, browserName),
        );
        (report.clickGuide ||= []).push(
          await require("./click-guide.cjs")(browser, base, out, browserName),
        );
        (report.cubeOptions ||= []).push(
          await require("./cube-options.cjs")(browser, base, out, browserName),
        );
        (report.equityBar ||= []).push(
          await require("./equity-bar.cjs")(browser, base, out, browserName),
        );
        (report.historyReturn ||= []).push(
          await require("./history-return.cjs")(
            browser,
            base,
            out,
            browserName,
          ),
        );
        (report.practiceUX ||= []).push(
          await require("./practice.cjs")(browser, base, out, browserName),
        );
        (report.keyboardUX ||= []).push(
          await require("./keyboard.cjs")(browser, base, out, browserName),
        );
        (report.decisionUX ||= []).push(
          await require("./decision-ux.cjs")(
            browser,
            base,
            out,
            browserName,
          ),
        );
        (report.assistanceUX ||= []).push(
          await require("./assistance.cjs")(
            browser,
            base,
            out,
            browserName,
          ),
        );
        (report.turnPolicy ||= []).push(
          await require("./turn-policy.cjs")(
            browser,
            base,
            out,
            browserName,
          ),
        );
        report.refreshUX.push(
          await require("./refresh.cjs")(browser, out, browserName),
        );
        report.updatesUX ||= [];
        report.updatesUX.push(
          await require("./updates.cjs")(browser, out, browserName),
        );
        // Offline shell and coherent engine cache, scoped exclusively to this family.
        const offline = await browser.newContext(),
          op = await offline.newPage();
        await op.goto(base + "/backgammon/solver/");
        await op.locator("#analyze").click();
        await op
          .getByText("Evaluated moves", { exact: true })
          .waitFor({ timeout: 45000 });
        await op.evaluate(() => navigator.serviceWorker.ready);
        await op.reload();
        await op.locator("#analyze").click();
        await op
          .getByText("Evaluated moves", { exact: true })
          .waitFor({ timeout: 45000 });
        await op.waitForFunction(async () => {
          const cache = await caches.open(
            "backgammon-assets-" +
              (
                await fetch("/backgammon/offline-manifest.js").then((r) =>
                  r.text(),
                )
              ).match(/BG_CACHE_VERSION='([^']+)'/)[1],
          );
          return !!(await cache.match(
            "/backgammon/engine/vendor/gnubg-core-module.data",
          ));
        });
        if (browserName === "webkit") {
          server.closeAllConnections();
          await new Promise((resolve) => server.close(resolve));
          report.webkitOfflineMode =
            "HTTP server stopped; Playwright setOffline causes internal WebKit errors before service-worker interception";
        } else await offline.setOffline(true);
        await op.goto(base + "/backgammon/trainer/");
        await op.locator("#submit-decision").waitFor();
        await op.goto(base + "/backgammon/solver/");
        await op.locator("#analyze").click();
        await op
          .getByText("Evaluated moves", { exact: true })
          .waitFor({ timeout: 45000 });
        await offline.close();
        fs.writeFileSync(
          path.join(out, `browser-report-${browserName}.json`),
          JSON.stringify(
            { ...report, completedBrowser: browserName, offline: true },
            null,
            2,
          ),
        );
      } finally {
        // Bound teardown even if an installed browser exits before its close acknowledgement.
        let timer;
        try {
          await Promise.race([
            browser.close(),
            new Promise((resolve, reject) => {
              timer = setTimeout(
                () =>
                  browser.isConnected()
                    ? reject(new Error("Browser teardown timed out"))
                    : resolve(),
                5000,
              );
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      }
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(
        out,
        `browser-report-${report.browsers.map((b) => b.name).join("-")}.json`,
      ),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    server.close();
  }
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
