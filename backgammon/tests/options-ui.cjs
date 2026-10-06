// Optional rules through the actual Play UI, persisted state, Solver and real WASM.
const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async function optionsUX(browser, base, out, browserName) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    serviceWorkers: "block",
  });
  const page = await context.newPage(),
    errors = [],
    shots = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = async (name) => {
    const file = `${browserName}-options-${name}.png`;
    await page.screenshot({
      path: path.join(out, file),
      fullPage: true,
      animations: "disabled",
    });
    shots.push(file);
  };
  const state = () =>
    page.evaluate(
      async () =>
        (
          await (
            await import("/backgammon/core/storage.mjs")
          ).get("work", "play")
        ).game.state,
    );
  try {
    await page.addInitScript(() => {
      const random = crypto.getRandomValues.bind(crypto),
        bytes = [3, 3, 5, 0];
      crypto.getRandomValues = (a) =>
        a instanceof Uint8Array && a.length === 1 && bytes.length
          ? ((a[0] = bytes.shift()), a)
          : random(a);
    });
    await page.goto(base + "/backgammon/play/");
    await page
      .getByRole("button", { name: "Same device", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Match length", { exact: true }).inputValue(),
      "0",
    );
    await page.getByLabel("Match length", { exact: true }).selectOption("5");
    await page.locator(".game-rules summary").click();
    assert.ok(
      await page.getByLabel("Jacoby rule", { exact: true }).isDisabled(),
    );
    await page.getByLabel("Match length", { exact: true }).selectOption("0");
    await page.locator(".game-rules summary").click();
    assert.ok(
      await page.getByLabel("Jacoby rule", { exact: true }).isChecked(),
    );
    assert.equal(
      await page
        .getByLabel("Automatic opening doubles", { exact: true })
        .inputValue(),
      "1",
    );
    assert.equal(
      await page
        .getByLabel("Immediate redoubles", { exact: true })
        .inputValue(),
      "0",
    );
    await page
      .getByLabel("Automatic opening doubles", { exact: true })
      .selectOption("1");
    await page
      .getByLabel("Immediate redoubles", { exact: true })
      .selectOption("2");
    await shot("rules");
    await page.locator("#start-match").click();
    await page.locator("#roll").click();
    await page.locator(".opening-roll h2").filter({ hasText: "tie" }).waitFor();
    assert.equal((await state()).cube.value, 2);
    assert.match(
      await page.locator(".opening-roll").innerText(),
      /Stakes are now 2/,
    );
    await shot("automatic-double");
    await page.locator("#roll").click();
    await page.locator("#begin-turn").click();
    while (await page.locator("#confirm").isDisabled())
      await page.locator("#draft-controls select").selectOption({ index: 1 });
    await page.locator("#confirm").click();
    await page.getByRole("button", { name: "Double", exact: true }).click();
    await page
      .getByRole("button", { name: "Beaver to 8", exact: true })
      .click();
    assert.equal((await state()).pending.depth, 1);
    await shot("beaver");
    await page.reload();
    await page.locator("#resume-match").click();
    assert.equal((await state()).pending.depth, 1);
    await page
      .getByRole("button", { name: "Raccoon to 16", exact: true })
      .click();
    assert.equal((await state()).pending.depth, 2);
    await shot("raccoon");
    await page.getByRole("button", { name: "Take 16", exact: true }).click();
    const s = await state();
    assert.deepEqual(s.cube, { value: 16, owner: 0 });
    assert.equal(s.turn, 1);
    assert.equal(s.phase, "roll");
    const studyURL = await page.evaluate(async () => {
      const { initialState, transition } =
          await import("/backgammon/core/rules.mjs"),
        { shareURL } = await import("/backgammon/core/xgid.mjs");
      let p = initialState({
        matchLength: 0,
        phase: "roll",
        rules: { jacoby: true, automaticDoubles: 1, immediateRedoubles: 2 },
      });
      p = transition(p, { type: "double" }, 0);
      p = transition(p, { type: "beaver" }, 1);
      return shareURL(p);
    });
    await page.goto(studyURL);
    await page.locator("#edit-position").click();
    await page
      .getByRole("button", { name: "Dice, cube & match context", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Decision", { exact: true }).inputValue(),
      "beaver",
    );
    await page.getByLabel("Decision", { exact: true }).selectOption("raccoon");
    await page
      .getByLabel("Cube value (accepted stake)", { exact: true })
      .fill("4");
    await page
      .getByRole("button", { name: "Apply context", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Done editing", exact: true })
      .click();
    assert.match(
      await page.locator("#position-rules").innerText(),
      /Jacoby.*Beavers \+ raccoons/,
    );
    await page.locator("#analyze").click();
    await page
      .getByRole("button", { name: "Save as exercise", exact: true })
      .waitFor({ timeout: 45000 });
    await shot("solver-raccoon");
    await page
      .getByRole("button", { name: "Save as exercise", exact: true })
      .click();
    await page.getByLabel("Name", { exact: true }).fill("Optional cube study");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    const item = await page.evaluate(async () =>
      (await (await import("/backgammon/core/storage.mjs")).all("items")).find(
        (i) => i.title === "Optional cube study",
      ),
    );
    assert.ok(item.tags.includes("exercise"));
    assert.equal(item.state.pending.depth, 2);
    assert.equal(item.state.cube.owner, 1);
    assert.equal(item.state.rules.immediateRedoubles, 2);
    await page.goto(base + "/backgammon/trainer/");
    await page
      .getByLabel("Practice set", { exact: true })
      .selectOption("mistakes");
    await page.locator("#cube-take").waitFor();
    assert.match(
      await page.locator("#message").innerText(),
      /Raccoon to 8.*Teal to decide/,
    );
    assert.match(await page.locator("#practice-rules").innerText(), /Jacoby/);
    await page.locator("#cube-take").click();
    await page
      .getByRole("button", { name: "Original position", exact: true })
      .waitFor({ timeout: 45000 });
    await shot("trainer-raccoon");
    const engine = await page.evaluate(async () => {
      const { EngineClient } = await import("/backgammon/engine/client.mjs"),
        { initialState, transition, decisionPlayer } =
          await import("/backgammon/core/rules.mjs"),
        { gradeCube } = await import("/backgammon/engine/cube-grade.mjs");
      const e = new EngineClient(),
        rows = [];
      const near = (a, b) => {
        if (Math.abs(a - b) > 0.00002)
          throw new Error(`Cube perspective/units mismatch: ${a} / ${b}`);
      };
      try {
        // A legal race with an intentionally bad double should invite a beaver.
        const points = Array(24).fill(0);
        points[5] = 15;
        points[20] = -15;
        for (const depth of [1, 2])
          for (const turn of [0, 1]) {
            let p = initialState({
              matchLength: 0,
              phase: "roll",
              points: turn
                ? points
                    .slice()
                    .reverse()
                    .map((n) => -n)
                : points,
              turn,
              rules: {
                jacoby: true,
                automaticDoubles: 1,
                immediateRedoubles: depth,
              },
            });
            p = transition(p, { type: "double" }, turn);
            let first;
            for (const choice of ["beaver", "raccoon", "take"]) {
              const r = await e.analyze(p),
                who = decisionPlayer(p);
              if (!r.decisionOptions?.length)
                throw new Error("Missing legal response branches");
              const values = r.decisionOptions.map((x) => x.equity),
                best =
                  who === p.turn ? Math.max(...values) : Math.min(...values);
              near(r.equity, best);
              near(gradeCube(p, r, r.action).error, 0);
              near(
                r.decisionOptions.find((x) => x.action === "take").equity,
                -1.8059411,
              );
              const pass = r.decisionOptions.find((x) => x.action === "pass");
              near(pass.equity, p.pending.by === p.turn ? 1 : -1);
              for (const c of r.decisionOptions)
                if (gradeCube(p, r, c.action).error < 0)
                  throw new Error("Negative decision loss");
              const prior = rows.find(
                (x) =>
                  x.depth === depth &&
                  x.stage === (p.pending.depth || 0) &&
                  x.turn === 0,
              );
              if (prior) near(prior.equity, r.equity);
              rows.push({
                depth,
                stage: p.pending.depth || 0,
                turn,
                equity: r.equity,
                action: r.action,
                options: r.decisionOptions,
                ms: r.elapsedMs,
              });
              first ||= r;
              if (!r.decisionOptions.some((c) => c.action === choice)) break;
              p = transition(p, { type: choice }, who);
              if (p.phase !== "double") break;
            }
            if (first.action !== "beaver")
              throw new Error("Known bad double should be beavered");
          }
        const money = initialState({
            matchLength: 0,
            phase: "move",
            dice: [3, 1],
          }),
          ordinary = await e.analyze(money),
          jacoby = await e.analyze({
            ...money,
            rules: { ...money.rules, jacoby: true },
          });
        if (ordinary.positionKey === jacoby.positionKey)
          throw new Error("Rules missing from cache key");
        if (
          Math.abs(
            ordinary.candidates[0].equity - jacoby.candidates[0].equity,
          ) < 0.0001
        )
          throw new Error("Jacoby context ignored");
        for (const matchLength of [0, 5]) {
          const noCube = await e.analyze(
            initialState({
              matchLength,
              phase: "roll",
              rules: { cube: false },
            }),
          );
          if (noCube.available || noCube.settings.cubeful)
            throw new Error("No-cube analysis context ignored");
          near(noCube.equity, noCube.cubeless);
        }
        return {
          version: ordinary.engine,
          rows,
          jacoby: jacoby.candidates[0].equity,
          ordinary: ordinary.candidates[0].equity,
        };
      } finally {
        e.destroy();
      }
    });
    assert.deepEqual(errors, []);
    return {
      defaults: true,
      automaticDouble: true,
      beaverRaccoon: true,
      pendingOfferReload: true,
      solverContextAndSavedPractice: true,
      engine,
      screenshots: shots,
    };
  } finally {
    await context.close();
  }
};
