const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async function clickGuide(browser, base, out, name) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  const failures = [],
    heavy = [];
  page.on("pageerror", (e) => failures.push(e.message));
  page.on("request", (r) => {
    if (/\.(wasm|data)(\?|$)/.test(r.url())) heavy.push(r.url());
  });
  try {
    await page.goto(base + "/backgammon/");
    await page
      .getByRole("link", { name: "Clicks & highlights", exact: true })
      .click();
    await page.waitForURL("**/backgammon/controls/");
    await page.reload();
    assert.equal(await page.locator("#clicks .click-flow > li").count(), 5);
    assert.equal(await page.locator("#highlights .click-flow > li").count(), 5);
    assert.equal(await page.locator("#cases tbody tr").count(), 31);
    assert.equal(await page.locator("#cases tbody td").count(), 93);
    await page.getByRole("link", { name: "Checker & point highlights ↓", exact: true }).click();
    assert.ok(page.url().endsWith("#highlights"));
    for (const [width, height] of [
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
      await page.setViewportSize({ width, height });
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        blocks: [
          ...document.querySelectorAll(
            ".flow-question,.flow-answer,.guide-notes,.case-table,.case-table th,.case-table td",
          ),
        ].map((n) => ({ w: n.clientWidth, sw: n.scrollWidth })),
      }));
      assert.equal(
        layout.overflow,
        false,
        `${name} ${width}: horizontal overflow`,
      );
      assert.ok(
        layout.blocks.every((b) => b.sw <= b.w + 1),
        `${name} ${width}: clipped text`,
      );
      if ([320, 390, 844, 1366].includes(width))
        await page.screenshot({
          path: path.join(out, `${name}-click-guide-${width}.png`),
          fullPage: true,
        });
    }
    for (const width of [320,390,844,1366]) {
      await page.setViewportSize({width,height:width===844?390:844});
      await page.locator("#highlights").screenshot({path:path.join(out,`${name}-highlight-guide-${width}.png`)});
      await page.locator("#case-off-source").screenshot({path:path.join(out,`${name}-case-guide-${width}.png`)});
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addStyleTag({
      content: ":root { font-size: 24px !important; }",
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      "enlarged text reflows",
    );
    await page
      .getByRole("link", { name: "Back to Play →", exact: true })
      .focus();
    assert.equal(
      await page.evaluate(() =>
        document.activeElement.getAttribute("href"),
      ),
      "/backgammon/play/",
    );
    assert.deepEqual(failures, []);
    assert.deepEqual(heavy, [], "guide does not load engine");
    return {
      browser: name,
      cases: [
        "hub link and direct reload; click and highlight branches at nine sizes; enlarged text; keyboard link; no engine download",
      ],
    };
  } finally {
    await context.close();
  }
};
