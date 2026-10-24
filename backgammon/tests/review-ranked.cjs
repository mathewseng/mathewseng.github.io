const assert = require("node:assert/strict"),
  path = require("node:path");
module.exports = async function reviewRanked(browser, base, out, name) {
  const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      hasTouch: true,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(base + "/backgammon/");
    const expected = await page.evaluate(async () => {
      const r = await import("/backgammon/core/rules.mjs"),
        { EngineClient } = await import("/backgammon/engine/client.mjs"),
        { decisionReview } = await import("/backgammon/ui/decision-review.mjs");
      const source = r.initialState({
          phase: "move",
          dice: [3, 1],
          matchLength: 0,
        }),
        engine = new EngineClient();
      try {
        const result = await engine.analyze(source, { preset: "quick" });
        window.reviewFixture = { source, result, decisionReview };
        decisionReview(source, {
          title: "Move review",
          onReplay: () => {},
          onReturn: () => {},
        }).result({ ...result, actual: result.candidates.at(-1) });
        const {presentAnalysis} = await import("/backgammon/core/move-presentation.mjs");
        return presentAnalysis(source, result).candidates
          .slice(0, 10)
          .map((c) => ({ notation: c.notation, equity: c.equity }));
      } finally {
        engine.destroy();
      }
    });
    assert.equal(expected.length, 10);
    assert.match(await page.locator(".decision-caption").textContent(), /^Best move ·/);
    assert.ok(await page.locator(".decision-board .last-move-arrow").count() > 0);
    assert.equal(await page.locator("#undo-play-best").count(), 1);
    const sizes = [
      [320, 568],
      [375, 667],
      [390, 844],
      [430, 932],
      [844, 390],
      [768, 1024],
      [1024, 768],
      [1366, 768],
      [1440, 900],
    ];
    for (const [width, height] of sizes) {
      await page.setViewportSize({width,height});
      await page.waitForTimeout(50);
      assert.equal(await page.locator('.decision-dialog select').count(),0,'no preview dropdown');
      assert.equal(await page.getByRole('tab',{name:'Board',exact:true}).count(),0);
      assert.equal(await page.getByRole('tab',{name:'Comparison',exact:true}).count(),0);
      assert.ok(await page.locator('.decision-board').isVisible());
      assert.ok(await page.locator('.review-moves').isVisible(),'comparison and board share the review');
      assert.equal(await page.locator('.review-move').count(),10);
      await page.locator('.decision-details-toggle').click();
      assert.ok(await page.locator('.decision-notes').isVisible());
      await page.locator('.decision-details-toggle').click();
      const boardBox=await page.locator('.decision-board').boundingBox();
      for (const rank of [10,2,1]) {
        await page.locator(`.review-move[data-rank="${rank}"]`).click();
        assert.equal(await page.locator('.review-move[aria-pressed="true"]').getAttribute('data-rank'),String(rank));
        assert.ok((await page.locator('.decision-caption').textContent()).includes(expected[rank-1].notation));
        assert.deepEqual(await page.locator('.decision-board').boundingBox(),boardBox,'changing move preserves board size');
      }
      const fit=await page.locator('.decision-dialog').evaluate(d=>({
        overflow:d.scrollHeight>d.clientHeight+1 || d.scrollWidth>d.clientWidth+1,
        list:d.querySelector('.review-move-rows').getBoundingClientRect().toJSON(),
        position:d.querySelector('.decision-position').getBoundingClientRect().toJSON(),
        footer:d.querySelector('footer').getBoundingClientRect().toJSON(),
      }));
      assert.ok(!fit.overflow && fit.list.height>=44 && fit.list.bottom<=fit.footer.top+1,JSON.stringify({width,height,fit}));
      if(width<=700 && height>500) assert.ok(fit.position.bottom<=fit.list.top,'portrait puts choices under board');
      else assert.ok(fit.position.right<=fit.list.x,'wide views put choices beside board');
      await page.getByRole('button',{name:'Position',exact:true}).click();
      assert.equal(await page.locator('.review-move[aria-pressed="true"]').count(),0);
      await page.getByRole('button',{name:'Best move',exact:true}).click();
      await page.screenshot({path:path.join(out,`${name}-ranked-review-${width}.png`)});
    }
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(async () => {
      (await import('/backgammon/core/storage.mjs')).saveSettings({skin:'liquid-chrome'});
      await (await import('/backgammon/ui/skin.mjs')).applySkin('liquid-chrome');
    });
    await page.waitForFunction(()=>document.documentElement.dataset.skin==='liquid-chrome');
    await page.screenshot({path:path.join(out,`${name}-ranked-metallic-phone.png`)});
    await page.getByRole("button", { name: "Best move", exact: true }).click();
    assert.equal(
      await page.locator('.review-move[aria-pressed="true"]').count(),
      1,
    );
    await page.getByRole("button", { name: "Position", exact: true }).click();
    assert.equal(await page.locator(".decision-board .last-move-arrow").count(), 0);
    assert.equal(
      await page.locator('.review-move[aria-pressed="true"]').count(),
      0,
    );
    await page.keyboard.press("Escape");
    await page.locator(".decision-dialog").waitFor({ state: "detached" });
    await page.evaluate(() => {
      const { source, result, decisionReview } = reviewFixture;
      decisionReview(source, { onReplay: () => {} }).result({
        ...result,
        actual: result.candidates[0],
      });
    });
    assert.equal(
      await page.locator("#undo-play-best").count(),
      0,
      "best played needs no corrective action",
    );
    assert.match(await page.locator(".decision-caption").textContent(), /^Best\/your move ·/);
    assert.equal(await page.locator(".decision-choices button").count(), 2);
    assert.equal(await page.getByRole("button", {name: "Your move", exact:true}).count(), 0);
    assert.ok(await page.getByRole("button", {name: "Best/your move",exact:true}).getAttribute("aria-pressed") === "true");
    await page.keyboard.press("Escape");
    await page.locator(".decision-dialog").waitFor({ state: "detached" });
    await page.evaluate(() => {
      const { source, result, decisionReview } = reviewFixture;
      decisionReview(source, { opponent: true }).result({...result, actual: result.candidates[0]});
    });
    assert.match(await page.locator(".decision-caption").textContent(), /^Best\/their move ·/);
    assert.equal(await page.locator(".decision-choices button").count(), 2);
    assert.ok(await page.locator(".decision-board .last-move-arrow").count() > 0);
    await page.keyboard.press("Escape");
    await page.locator(".decision-dialog").waitFor({ state: "detached" });
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => {
      const { source, result, decisionReview } = reviewFixture;
      decisionReview(source).result({
        ...result,
        actual: result.candidates[0],
        evaluatedCount: result.candidates.length,
        candidates: result.candidates.slice(0, 1),
      });
    });
    await page.waitForFunction(
      () =>
        document.querySelector(".review-move-heading strong")?.textContent ===
        "Top 10 moves",
    );
    assert.match(await page.locator(".decision-content").innerText(), /Fresh/);
    assert.ok(
      await page
        .getByRole("dialog")
        .evaluate(
          (d) =>
            d.scrollHeight <= d.clientHeight + 1 &&
            d.querySelector(".review-moves").getBoundingClientRect().bottom <=
              d.querySelector(".decision-layout").getBoundingClientRect()
                .bottom,
        ),
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.body).touchAction),
      "manipulation",
    );
    // Selection is reserved for the board and drag surfaces; the inspector,
    // dialogs and the review section stay selectable (docs/redesign/prompt.md).
    assert.equal(
      await page.evaluate(
        () =>
          getComputedStyle(document.querySelector(".bg-board")).userSelect ||
          getComputedStyle(document.querySelector(".bg-board")).webkitUserSelect,
      ),
      "none",
    );
    const heading = await page.locator("h1").boundingBox();
    await page.mouse.move(heading.x, heading.y + heading.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      heading.x + heading.width,
      heading.y + heading.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();
    assert.equal(await page.evaluate(() => getSelection().toString()), "");
    assert.deepEqual(errors, []);
    return {
      browser: name,
      viewports: sizes.length,
      realEngine: true,
      candidates: 10,
    };
  } finally {
    await context.close();
  }
};
