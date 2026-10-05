const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  try {
    const p = await b.newPage({ serviceWorkers: "block" });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(
      (process.env.BG_BASE_URL || "http://127.0.0.1:8765") +
        "/backgammon/play/",
    );
    const optionalRules = process.env.BG_MONEY_RULES === "1";
    await p
      .getByLabel("Match length", { exact: true })
      .selectOption(optionalRules ? "0" : "1");
    if (optionalRules) {
      await p.locator(".game-rules summary").click();
      await p
        .getByLabel("Automatic opening doubles", { exact: true })
        .selectOption("1");
      await p
        .getByLabel("Immediate redoubles", { exact: true })
        .selectOption("2");
    }
    await p.locator("#start-match").click();
    let decisions = 0,
      offered = false;
    const state = () =>
      p.evaluate(async () => {
        const { get } = await import("/backgammon/core/storage.mjs");
        return (await get("work", "play")).game.state;
      });
    for (let n = 0; n < 700; n++) {
      if (await p.locator("#begin-turn").count())
        await p.locator("#begin-turn").click();
      const s = await state();
      if (s.phase === "over") break;
      const actor =
        s.phase === "double"
          ? 1 - s.pending.by
          : s.phase === "resign"
            ? 1 - s.turn
            : s.turn;
      if (actor === 1) {
        await p.waitForFunction(
          async (seq) => {
            const { get } = await import("/backgammon/core/storage.mjs");
            return (await get("work", "play")).game.state.sequence > seq;
          },
          s.sequence,
          { timeout: 30000 },
        );
        continue;
      }
      if (
        optionalRules &&
        !offered &&
        s.phase === "roll" &&
        (await p
          .getByRole("button", { name: "Double", exact: true })
          .isEnabled())
      ) {
        offered = true;
        await p.getByRole("button", { name: "Double", exact: true }).click();
      } else if (["opening", "roll"].includes(s.phase))
        await p.locator("#roll").click();
      else if (s.phase === "move") {
        while (await p.locator("#confirm").isDisabled())
          await p.locator("#draft-controls select").selectOption({ index: 1 });
        await p.locator("#confirm").click();
        decisions++;
      } else if (s.phase === "double")
        await p.getByRole("button", { name: /^Take / }).click();
      else throw new Error("Unexpected phase " + s.phase);
      await p.waitForFunction(
        async (seq) => {
          const { get } = await import("/backgammon/core/storage.mjs");
          return (await get("work", "play")).game.state.sequence > seq;
        },
        s.sequence,
        { timeout: 30000 },
      );
    }
    const final = await state();
    assert.equal(final.phase, "over");
    assert.equal(final.result.matchOver, !optionalRules);
    assert.deepEqual(errors, []);
    const replayed = await p.evaluate(async () => {
      const { get, all } = await import("/backgammon/core/storage.mjs"),
        { replay } = await import("/backgammon/core/rules.mjs"),
        game = (await get("work", "play")).game;
      return {
        same:
          JSON.stringify(replay(game.initial, game.events).at(-1)) ===
          JSON.stringify(game.state),
        saved: (await all()).some((i) => i.kind === "match"),
      };
    });
    assert.ok(replayed.same && replayed.saved);
    console.log(
      JSON.stringify(
        {
          completeComputerGame: true,
          optionalRules,
          humanDecisions: decisions,
          sequence: final.sequence,
          result: final.result,
          replay: replayed,
        },
        null,
        2,
      ),
    );
    await p.screenshot({
      path: `backgammon/test-results/computer-complete${optionalRules ? "-optional" : ""}.png`,
    });
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
