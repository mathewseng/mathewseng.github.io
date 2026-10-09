// Native Play regression for compulsory moves independent of dice order.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const fixtures = [
  "forced-seven",
  "forced-six-off",
  "double-four-choice",
  "forced-four",
  "doubles-choice",
];
module.exports = async function draftChoices(browser, base, out, name) {
  const cases = [];
  for (const touch of [false, true]) {
    const context = await browser.newContext({
      viewport: touch
        ? { width: 390, height: 844 }
        : { width: 1366, height: 768 },
      hasTouch: touch,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => d.accept());
    const read = () =>
      page.evaluate(async () =>
        (await import("/backgammon/core/storage.mjs")).get("work", "play"),
      );
    try {
      for (const fixture of fixtures)
        for (const turn of [0, 1])
          for (const orientation of [0, 1]) {
            const source = JSON.parse(
              fs.readFileSync(path.join(__dirname, `fixtures/${fixture}.json`)),
            ).state;
            await page.goto(base + "/backgammon/");
            const data = await page.evaluate(
              async ({ source, turn, orientation }) => {
                const r = await import("/backgammon/core/rules.mjs"),
                  t = await import("/backgammon/core/table.mjs"),
                  st = await import("/backgammon/core/storage.mjs");
                if (turn) {
                  source.turn = 1;
                  source.points = source.points.reverse().map((n) => -n);
                  source.bar.reverse();
                  source.off.reverse();
                }
                const paths = r.legalPaths(source),
                  auto = t.draftAutomation(source, [], paths),
                  id = crypto.randomUUID();
                st.saveSettings({
                  orientation,
                  motion: "reduce",
                  moveHints: true,
                });
                await st.put("work", {
                  id: "play",
                  game: {
                    id,
                    initial: source,
                    state: source,
                    events: [],
                    started: true,
                    names: ["You", "Opponent"],
                    config: {
                      mode: "local",
                      humanSide: turn,
                      matchLength: 0,
                      rules: source.rules,
                    },
                  },
                  draft: [],
                  positionKey: r.positionKey(source),
                });
                const suffixes = r
                  .matchingPaths(paths, auto.steps)
                  .map((p) => p.steps.slice(auto.steps.length));
                return { id, auto, suffixes };
              },
              { source, turn, orientation },
            );
            await page.goto(base + "/backgammon/play/#resume=" + data.id);
            await page.locator("#confirm").waitFor();
            await page.waitForFunction(
              async (n) =>
                (
                  await (
                    await import("/backgammon/core/storage.mjs")
                  ).get("work", "play")
                )?.draft.length === n,
              data.auto.steps.length,
            );
            let w = await read();
            assert.deepEqual(w.draft, data.auto.steps);
            assert.equal(w.game.events.length, 0);
            assert.ok(await page.locator("#undo").isDisabled());
            assert.ok(await page.locator("#reset-draft").isDisabled());
            assert.ok(await page.locator("#confirm").isDisabled());
            await page.reload();
            await page.locator("#confirm").waitFor();
            assert.deepEqual((await read()).draft, data.auto.steps);
            if (!turn && !orientation)
              await page.screenshot({
                path: path.join(
                  out,
                  `${name}-${fixture}-${touch ? "touch" : "mouse"}.png`,
                ),
              });
            // Exercise remaining choices through native checker-disc and point taps.
            const unique = [
              ...new Map(
                data.suffixes.map((s) => [JSON.stringify(s), s]),
              ).values(),
            ];
            for (const suffix of unique) {
              for (const step of suffix) {
                w = await read();
                if (w.draft.length === data.auto.steps.length + suffix.length)
                  break;
                const location =
                  step.from === "bar" || step.from === "off"
                    ? step.from + turn
                    : step.from;
                if (
                  !(await page
                    .locator(`[data-point="${location}"].selected`)
                    .count())
                ) {
                  const pos = await page
                    .locator(`[data-point="${location}"] .checker > circle`)
                    .first()
                    .boundingBox();
                  if (touch)
                    await page.touchscreen.tap(
                      pos.x + pos.width / 2,
                      pos.y + pos.height / 2,
                    );
                  else
                    await page.mouse.click(
                      pos.x + pos.width / 2,
                      pos.y + pos.height / 2,
                    );
                }
                const dest = step.to === "off" ? "off" + turn : step.to;
                const box = await page
                  .locator(
                    `[data-point="${dest}"] ${step.to === "off" ? ".point-hit" : ".point-number-hit"}`,
                  )
                  .boundingBox();
                const x = step.to === "off" ? box.x + 3 : box.x + box.width / 2,
                  y =
                    step.to === "off"
                      ? box.y + box.height - 3
                      : box.y + box.height / 2;
                if (touch) await page.touchscreen.tap(x, y);
                else await page.mouse.click(x, y);
                await page.waitForTimeout(50);
              }
              w = await read();
              assert.equal(w.game.events.length, 0);
              assert.equal(
                w.draft.length,
                source.dice[0] === source.dice[1] ? 4 : 2,
              );
              assert.deepEqual(
                w.draft.slice(0, data.auto.steps.length),
                data.auto.steps,
              );
              await page.locator("#reset-draft").click();
              assert.deepEqual((await read()).draft, data.auto.steps);
            }
            if (fixture === "forced-seven") {
              // A legacy computer draft may have the optional die first and an old
              // autoCommit marker. Recovery normalizes it but must not submit it.
              await page.evaluate(async () => {
                const st = await import("/backgammon/core/storage.mjs"),
                  r = await import("/backgammon/core/rules.mjs"),
                  w = await st.get("work", "play");
                w.draft = r
                  .legalPaths(w.game.state)
                  .find((p) => p.steps[0].die === 5).steps;
                w.autoCommit = true;
                w.game.config.mode = "computer";
                w.game.config.strength = "quick";
                await st.put("work", w);
              });
              await page.reload();
              await page.locator("#confirm").waitFor();
              await page.waitForTimeout(150);
              w = await read();
              assert.equal(w.game.events.length, 0);
              assert.equal(w.draft.length, 2);
              assert.deepEqual(w.draft[0], data.auto.steps[0]);
              assert.ok(await page.locator("#confirm").isEnabled());
              await page.locator("#reset-draft").click();
              assert.deepEqual((await read()).draft, data.auto.steps);
            }
            cases.push({
              fixture,
              touch,
              turn,
              orientation,
              forced: data.auto.steps.length,
            });
          }
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  return { browser: name, cases };
};
