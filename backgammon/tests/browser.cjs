const { waitForAsync } = require("./play-helpers.cjs");
const { launchQuietBrowser } = require("../../scripts/quiet-browser.cjs");
/* Browser integration uses the assembled _site and real bundled WASM. Run after assemble-site.sh. */
const { chromium, firefox, webkit } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const root = path.resolve(process.env.BG_SITE_ROOT || "_site"),
  out = path.resolve(process.env.BG_TEST_OUT || "backgammon/test-results");
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
        const run = async (moduleName, ...args) => {
          console.log(`RUN ${browserName}: ${moduleName}`);
          const contexts = new Set(browser.contexts());
          try {
            const result = await require(`./${moduleName}.cjs`)(...args);
            console.log(`PASS ${browserName}: ${moduleName}`);
            return result;
          } catch (error) {
            if (!process.env.BG_KEEP_GOING) throw error;
            console.error(`FAIL ${browserName}: ${moduleName}`, error);
            process.exitCode = 1;
            return {failed: true, error: String(error)};
          } finally {
            await Promise.all(browser.contexts().filter(c => !contexts.has(c)).map(c => c.close()));
          }
        };
        // Focused suites share the assembled-site server and browser teardown.
        // No engine mocking is added by this runner.
        if (process.env.BG_MODULES) {
          for (const moduleName of process.env.BG_MODULES.split(",")) {
            if (!/^[a-z][a-z0-9-]*$/.test(moduleName)) throw new Error("Invalid test module name");
            const args = moduleName === "refresh" ? [browser, out, browserName]
              : moduleName === "native-backends" ? [browser, base, {corpus: browserName === "chromium"}]
              : [browser, base, out, browserName];
            const result = await run(moduleName, ...args);
            fs.writeFileSync(path.join(out, `${browserName}-${moduleName}-report.json`), JSON.stringify(result ?? {passed: true}, null, 2));
          }
          continue;
        }
        console.log(`RUN ${browserName}: integration`);
        const context = await browser.newContext({
          viewport: { width: 1366, height: 768 },
          serviceWorkers: "block",
        });
        const page = await context.newPage();
        page.on("pageerror", (e) => errors.push(e.stack));
        // Exercise the async wait helper in a real browser: false promises must
        // keep polling, and a permanently false condition must fail the test.
        assert.equal(await waitForAsync(page, async () => {
          await Promise.resolve();
          window.asyncWaitAttempts = (window.asyncWaitAttempts || 0) + 1;
          return window.asyncWaitAttempts >= 3 ? window.asyncWaitAttempts : false;
        }), 3);
        await assert.rejects(
          waitForAsync(page, async () => false, null, {timeout:100}),
          /Async browser condition did not become true/,
        );
        const shot = async (name) => {
          const file = path.join(out, `${browserName}-${name}.png`);
          await page.screenshot({ path: file, fullPage: true });
          report.screenshots.push(path.basename(file));
        };
        await require("./play-helpers.cjs").seedOpening(page, [6, 1]);
        await page.goto(base + "/backgammon/play/");
        await page
          .getByRole("button", { name: "Same device", exact: true })
          .click();
        await page
          .getByLabel("Match length", { exact: true })
          .selectOption("5");
        await shot("setup");
        await page.locator("#start-match").click();
        await page.locator("#confirm").waitFor({ timeout: 30000 });
        const steps = async () => {
          while (await page.locator("#confirm").isDisabled())
            await page
              .locator("#draft-controls select")
              .selectOption({ index: 1 });
        };
        await steps();
        await page.evaluate(() => document.activeElement?.blur());
        await page.keyboard.press("x");
        assert.equal(await page.locator(".board-die.consumed").count(), 0);
        assert.ok(await page.locator("#confirm").isDisabled());
        await steps();
        await page.evaluate(() => document.activeElement?.blur());
        await page.keyboard.press("z");
        assert.ok(await page.locator("#confirm").isDisabled());
        await steps();
        await shot("active-draft");
        await page.locator("#confirm").click();
        await page.locator(".board-cube").click();
        await shot("cube-decision");
        await page
          .getByRole("button", { name: "Take 2", exact: true })
          .click();
        await require("./play-helpers.cjs").waitWork(page, w => w?.game.state.phase === "move");
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
        // A valid edited position starts analysis as soon as editing finishes.
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
          const engine = new EngineClient({ openingBook: null });
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
              if (route === "solver/" && w === 320)
                await page.addStyleTag({content:"body,button,input,select{font-family:Verdana,sans-serif!important}"});
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
              // Play and the portrait Solver intentionally scroll to controls
              // and analysis. Solver still reserves a visible board above them.
              // Live board/action fit is checked by control-polish at these sizes.
              const scrollingSolver = route === "solver/" && w <= 1024 && h > 500;
              if (scrollingSolver)
                assert.ok(layout.boardBottom <= h + 1, `Solver board offscreen ${w}x${h}`);
              if (route && route !== "play/" && !scrollingSolver && w > 320) {
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
          assert.ok(await page.getByLabel("Match length", { exact: true }).isVisible(), "phone setup is directly available");
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
        console.log(`PASS ${browserName}: integration`);
        (report.solutionPolish ||= []).push(
          await run("solution-polish", browser, base, out, browserName),
        );
        const researchOutput = path.join(out, `research-${browserName}`);
        fs.mkdirSync(researchOutput, { recursive: true });
        await run("research", browser, base, researchOutput);
        await run("rollout-policies", browser, base, out, browserName);
        report.adaptive = await run("adaptive", browser, base, out, browserName);
        (report.dragFeedback ||= []).push(
          await run("drag-feedback", browser, base, out, browserName),
        );
        (report.highlightRendering ||= []).push(
          await run("highlight-rendering", browser, base, out, browserName),
        );
        (report.actionReadiness ||= []).push(
          await run("confirm-readiness", browser, base, out, browserName),
          await run("action-readiness", browser, base, out, browserName),
          await run("confirm-latency", browser, base, out, browserName),
          await run("automatic-motion", browser, base, out, browserName),
          await run("certain-bearoff", browser, base, out, browserName),
          await run("sealed-roll", browser, base, out, browserName),
        );
        (report.moveArrows ||= []).push(
          await run("move-arrows", browser, base, out, browserName),
        );
        (report.reviewSelection ||= []).push(
          await run("review-selection", browser, base, out, browserName),
        );
        (report.reviewMotion ||= []).push(
          await run("review-motion", browser, base, out, browserName),
        );
        (report.lastMoveUX ||= []).push(
          await run("last-move", browser, base, out, browserName),
        );
        report.checkerUX ||= [];
        report.checkerUX.push(
          await run("checker-ux",
            browser,
            base,
            out,
            browserName,
          ),
        );
        report.feedbackUX ||= [];
        report.feedbackUX.push(
          await run("feedback", browser, base, out, browserName),
        );
        report.appearanceUX ||= [];
        report.appearanceUX.push(
          await run("appearance",
            browser,
            base,
            out,
            browserName,
          ),
        );
        report.skinsUX ||= [];
        report.skinsUX.push(
          await run("skins", browser, base, out, browserName),
        );
        report.optionsUX ||= [];
        report.optionsUX.push(
          await run("options-ui",
            browser,
            base,
            out,
            browserName,
          ),
        );
        report.refreshUX ||= [];
        (report.tableControls ||= []).push(
          await run("table-controls",
            browser,
            base,
            out,
            browserName,
          ),
        );
        (report.routeChoice ||= []).push(
          await run("route-choice",
            browser,
            base,
            out,
            browserName,
          ),
        );
        (report.repeatPlay ||= []).push(
          await run("repeat-play",
            browser,
            base,
            out,
            browserName,
          ),
        );
        (report.directPlay ||= []).push(
          await run("direct-play",
            browser,
            base,
            out,
            browserName,
          ),
        );
        (report.highlightActions ||= []).push(
          await run("highlight-actions", browser, base, out, browserName),
        );
        (report.checkerRevisions ||= []).push(
          await run("checker-revisions", browser, base, out, browserName),
        );
        (report.originReturns ||= []).push(
          await run("origin-returns", browser, base, out, browserName),
        );
        (report.draftChoices ||= []).push(
          await run("draft-choices", browser, base, out, browserName),
        );
        (report.backgroundFocus ||= []).push(
          await run("background-focus", browser, base, out, browserName),
        );
        (report.diceUndo ||= []).push(
          await run("dice-undo", browser, base, out, browserName),
        );
        (report.blockedPass ||= []).push(
          await run("blocked-pass", browser, base, out, browserName),
        );
        (report.diceCountMotion ||= []).push(
          await run("dice-count-motion", browser, base, out, browserName),
        );
        (report.checkerTargets ||= []).push(
          await run("checker-targets", browser, base, out, browserName),
        );
        (report.bearoffTargets ||= []).push(
          await run("bearoff-targets", browser, base, out, browserName),
        );
        (report.openingGuide ||= []).push(
          await run("opening-guide", browser, base, out, browserName),
        );
        (report.rolloutBook ||= []).push(
          await run("rollout-book", browser, base, out, browserName),
        );
        (report.rolloutDiagnostic ||= []).push(
          await run("rollout-diagnostic", browser, base, out, browserName),
        );
        (report.fullgameAblation ||= []).push(
          await run("fullgame-ablation", browser, base, out, browserName),
        );
        (report.fullgamePrecision ||= []).push(
          await run("fullgame-precision", browser, base, out, browserName),
        );
        (report.replyFullgamePrecision ||= []).push(
          await run("reply-fullgame-report", browser, base, out, browserName),
        );
        (report.correctedRolloutStudy ||= []).push(
          await run("filtered-rollout-report", browser, base, out, browserName),
        );
        (report.cubePolicyStudy ||= []).push(
          await run("cube-policy-report", browser, base, out, browserName),
        );
        (report.deepOpeningBook ||= []).push(
          await run("deep-opening-book", browser, base, out, browserName),
        );
        (report.revisionWarning ||= []).push(
          await run("revision-warning", browser, base, out, browserName),
        );
        (report.endedUndo ||= []).push(
          await run("ended-undo", browser, base, out, browserName),
        );
        (report.gameLossSummary ||= []).push(
          await run("game-loss-summary", browser, base, out, browserName),
          await run("mobile-summary", browser, base, out, browserName),
          await run("board-cube-replies", browser, base, out, browserName),
          await run("cube-dice", browser, base, out, browserName),
          await run("landscape-dock", browser, base, out, browserName),
          await run("cube-shortcuts", browser, base, out, browserName),
          await run("unlimited-cube", browser, base, out, browserName),
          await run("unlimited-cube-editor", browser, base, out, browserName),
          await run("board-position", browser, base, out, browserName),
        );
        (report.diceSwitchMotion ||= []).push(
          await run("dice-switch-motion", browser, base, out, browserName),
        );
        (report.highlightMotion ||= []).push(
          await run("highlight-motion", browser, base, out, browserName),
        );
        (report.lastMoveMotion ||= []).push(
          await run("last-move-motion", browser, base, out, browserName),
        );
        (report.lastMoveEntry ||= []).push(
          await run("last-move-entry", browser, base, out, browserName),
        );
        (report.engineReuse ||= []).push(
          {browser: browserName, ...await run("engine-reuse", browser, base)},
        );
        (report.preparedGrading ||= []).push(
          {browser: browserName, ...await run("prepared-grading", browser, base)},
        );
        (report.futureReuse ||= []).push(
          {browser: browserName, ...await run("prethink-future", browser, base)},
        );
        (report.researchScreen ||= []).push(
          {browser: browserName, cases: await run("research-screen", browser, base, out, browserName)},
        );
        (report.checkerVerification ||= []).push(
          {browser: browserName, result: await run("verify-search", browser, base)},
        );
        (report.verifyUI ||= []).push(
          await run("verify-ui", browser, base, out, browserName),
        );
        (report.puretdUI ||= []).push(
          await run("puretd-ui", browser, base, out, browserName),
        );
        (report.learnedEvaluators ||= []).push(
          await run("learned-evaluators", browser, base, out, browserName),
        );
        (report.puretdLoading ||= []).push(
          {browser:browserName,cases:await run("puretd-loading",browser,base)},
        );
        (report.engineCacheContext ||= []).push(
          {browser: browserName, cases: await run("engine-cache-context", browser, base)},
        );
        (report.engineLifecycle ||= []).push(
          {browser: browserName, ...await run("engine-lifecycle", browser, base)},
        );
        (report.backendLoading ||= []).push({browser: browserName,
          cases: await run("backend-loading", browser, base),
        });
        (report.nativeBackends ||= []).push({browser: browserName,
          ...(await run("native-backends", browser, base, {corpus: browserName === "chromium"})),
        });
        (report.openingHints ||= []).push(
          await run("opening-hints", browser, base, out, browserName),
        );
        (report.actionAudit ||= []).push(
          await run("action-audit", browser, base, out, browserName),
        );
        (report.responsiveParity ||= []).push(
          await run("responsive-parity", browser, base, out, browserName),
          await run("page-layout-audit", browser, base, out, browserName),
        );
        (report.mobileLayout ||= []).push(
          await run("mobile-layout", browser, base, out, browserName),
        );
        (report.mobileStudy ||= []).push(
          await run("mobile-study", browser, base, out, browserName),
        );
        (report.solverLayout ||= []).push(
          await run("solver-layout", browser, base, out, browserName),
        );
        (report.solverEditor ||= []).push(
          await run("solver-editor", browser, base, out, browserName),
        );
        (report.solverMobile ||= []).push(
          await run("solver-mobile", browser, base, out, browserName),
        );
        (report.mobileLibrary ||= []).push(
          await run("mobile-library", browser, base, out, browserName),
        );
        (report.mobileFlow ||= []).push(
          await run("mobile-flow", browser, base, out, browserName),
        );
        (report.mobileHistory ||= []).push(
          await run("mobile-history", browser, base, out, browserName),
        );
        (report.cubeHistory ||= []).push(
          await run("cube-history", browser, base, out, browserName),
        );
        (report.cubeDisplay ||= []).push(
          await run("cube-display", browser, base, out, browserName),
        );
        (report.mobileSettings ||= []).push(
          await run("mobile-settings", browser, base, out, browserName),
        );
        (report.barEntry ||= []).push(
          await run("bar-entry", browser, base, out, browserName),
        );
        (report.touchMoves ||= []).push(
          await run("touch-moves", browser, base, out, browserName),
        );
        (report.mobileQuick ||= []).push(
          await run("mobile-quick", browser, base, out, browserName),
        );
        (report.mobileSheets ||= []).push(
          await run("mobile-sheets", browser, base, out, browserName),
        );
        (report.clickGuide ||= []).push(
          await run("click-guide", browser, base, out, browserName),
        );
        (report.rankedReview ||= []).push(
          await run("review-ranked", browser, base, out, browserName),
        );
        (report.modalFit ||= []).push(
          await run("modal-fit", browser, base, out, browserName),
        );
        (report.cubeOptions ||= []).push(
          await run("cube-options", browser, base, out, browserName),
        );
        (report.equityBar ||= []).push(
          await run("equity-bar", browser, base, out, browserName),
        );
        (report.equityLatency ||= []).push(
          await run("equity-latency", browser, base, out, browserName),
        );
        (report.landscapeViewport ||= []).push(
          await run("landscape-viewport", browser, base, out, browserName),
        );
        (report.historyTree ||= []).push(
          await run("history-tree", browser, base, out, browserName),
        );
        (report.autoReview ||= []).push(
          await run("auto-review", browser, base, out, browserName),
        );
        (report.historyReturn ||= []).push(
          await run("history-return",
            browser,
            base,
            out,
            browserName,
          ),
        );
        (report.historyRetention ||= []).push(
          await run("history-retention", browser, base, out, browserName),
          await run("paged-history", browser, base, out, browserName),
        );
        (report.practiceUX ||= []).push(
          await run("practice", browser, base, out, browserName),
        );
        (report.keyboardUX ||= []).push(
          await run("keyboard", browser, base, out, browserName),
        );
        (report.decisionUX ||= []).push(
          await run("decision-ux",
            browser,
            base,
            out,
            browserName,
          ),
        );
        (report.assistanceUX ||= []).push(
          await run("assistance",
            browser,
            base,
            out,
            browserName,
          ),
        );
        (report.turnPolicy ||= []).push(
          await run("turn-policy",
            browser,
            base,
            out,
            browserName,
          ),
        );
        report.refreshUX.push(
          await run("refresh", browser, out, browserName),
        );
        // The focused Play command is also part of the full regression run.
        for (const moduleName of ["review-search", "animation-speed", "return-destinations", "roll-prompt", "race-auto-play", "closed-opponent-roll", "hint-play-best", "initial-forced-only", "forced-roll-presentation", "control-polish", "board-confirm", "play-footer", "advanced-ui", "bot-opening-parity", "dice-order", "destination-priority", "touch-advanced", "adaptive-play", "prethink-ui", "prethink-cube"]) {
          (report.playControls ||= []).push({module: moduleName, browser: browserName,
            result: await run(moduleName, browser, base, out, browserName)});
        }
        (report.pageProgress ||= []).push(await run("page-progress", browser, base));
        report.updatesUX ||= [];
        report.updatesUX.push(
          await run("updates", browser, base, out, browserName),
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
        await waitForAsync(op,async () => {
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
