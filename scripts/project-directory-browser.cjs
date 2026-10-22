// Focused progressive-enhancement checks for the project catalog.
// Usage: node scripts/project-directory-browser.cjs [--site _site]
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { chromium } = require("playwright");
const { launchQuietBrowser } = require("./quiet-browser.cjs");
const { serveSite } = require("./site-pages.cjs");

const option = process.argv.indexOf("--site");
const root = resolve(option >= 0 ? process.argv[option + 1] : "_site");
const map = JSON.parse(readFileSync(resolve(root, "shared/site-map.json"), "utf8"));

async function visiblePaths(page) {
  return page.locator("[data-project]:not([hidden])").evaluateAll((rows) => rows.map((row) => row.dataset.project));
}

async function assertCategoryInView(page, id) {
  await page.waitForFunction((category) => {
    const heading = document.querySelector(`#heading-${category}`).getBoundingClientRect();
    const directory = document.querySelector(".project-directory");
    const bounds = directory.getBoundingClientRect();
    const internalScroll = ["auto", "scroll"].includes(getComputedStyle(directory).overflowY);
    const top = internalScroll ? Math.max(0, bounds.top) : 0;
    const bottom = internalScroll ? Math.min(innerHeight, bounds.bottom) : innerHeight;
    return heading.top >= top - 1 && heading.bottom <= bottom + 1;
  }, id, { timeout: 5000 });
}

(async () => {
  const server = await serveSite(root);
  const browser = await launchQuietBrowser(chromium);
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }, { width: 844, height: 390 }]) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(server.base, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState('load');
      assert.ok(await page.evaluate(() => {
        const directory = document.querySelector('.project-directory');
        const internal = ['auto', 'scroll'].includes(getComputedStyle(directory).overflowY);
        return !internal || directory.getBoundingClientRect().bottom <= document.querySelector('.directory-footer').getBoundingClientRect().top + 1;
      }), 'the scrollable directory fits above its footer');
      const search = page.getByRole("searchbox", { name: "Search projects" });
      assert.equal((await visiblePaths(page)).length, map.projects.length);

      await search.fill("  FaNtAsYlAnD   poker ");
      const expected = map.projects.filter((project) => {
        const text = `${project.name} ${project.description} ${project.category}`.toLowerCase();
        return text.includes("fantasyland") && text.includes("poker");
      }).map((project) => project.path).sort();
      assert.deepEqual((await visiblePaths(page)).sort(), expected, "search matches all words without case or whitespace sensitivity");
      assert.equal(await page.locator("#project-count").textContent(), `${expected.length} projects`);

      await search.fill("a project that cannot possibly exist 987654321");
      assert.equal((await visiblePaths(page)).length, 0);
      assert.ok(await page.locator("#directory-empty").isVisible(), "empty search explains how to recover");
      assert.equal(await page.locator(".project-section:not([hidden])").count(), 0);
      await page.getByRole("button", { name: "Clear", exact: true }).click();
      assert.equal(await search.inputValue(), "");
      assert.equal((await visiblePaths(page)).length, map.projects.length);
      assert.equal(await search.evaluate((element) => element === document.activeElement), true, "clear returns focus to search");

      await search.pressSequentially("microtonal");
      assert.deepEqual(await visiblePaths(page), ["/microtonal-lab/"]);
      assert.equal(await page.locator("#project-count").textContent(), "1 project");
      await search.press("Escape");
      assert.equal(await search.inputValue(), "");
      assert.equal((await visiblePaths(page)).length, map.projects.length);

      await search.fill("fantasyland");
      const musicLink = page.locator('.category-nav a[href="#music"]');
      await musicLink.click();
      assert.equal(await search.inputValue(), "", "category jumps clear filters that would hide the target");
      assert.equal(new URL(page.url()).hash, "#music");
      assert.equal(await musicLink.getAttribute("aria-current"), "location");
      await assertCategoryInView(page, "music");

      // Category jumps also work when activated with the keyboard.
      const pokerLink = page.locator('.category-nav a[href="#poker"]');
      await page.keyboard.press("Tab");
      await pokerLink.focus();
      const ring = await pokerLink.evaluate((element) => {
        const style = getComputedStyle(element);
        return (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== "none";
      });
      assert.ok(ring, "category links have a visible keyboard focus indicator");
      await page.keyboard.press("Enter");
      assert.equal(new URL(page.url()).hash, "#poker");
      await assertCategoryInView(page, "poker");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "the directory fits the viewport");

      for (const id of ["games", "music", "tools"]) {
        await page.goto(`${server.base}/${id}/`, { waitUntil: "domcontentloaded" });
        const rows = await visiblePaths(page);
        assert.deepEqual(rows.sort(), map.projects.filter((project) => project.category === id).map((project) => project.path).sort());
      }
      assert.deepEqual(errors, [], "directory navigation causes no JavaScript errors");
      await context.close();

      const withoutJS = await browser.newContext({ viewport, javaScriptEnabled: false, reducedMotion: "reduce" });
      const staticPage = await withoutJS.newPage();
      await staticPage.goto(server.base, { waitUntil: "domcontentloaded" });
      await staticPage.waitForLoadState('load');
      assert.equal(await staticPage.locator("a.project-row").count(), map.projects.length, "all project links exist without JavaScript");
      assert.equal(await staticPage.locator(".project-dates time").count(), map.projects.length * 2, "all dates exist without JavaScript");
      await staticPage.locator('.category-nav a[href="#music"]').click();
      assert.equal(new URL(staticPage.url()).hash, "#music");
      await assertCategoryInView(staticPage, "music");
      await staticPage.locator('a.project-row[href="/music/ewi-fingerings/"]').click();
      assert.equal(new URL(staticPage.url()).pathname, "/music/ewi-fingerings/", "project links navigate without JavaScript");
      assert.equal(await staticPage.title(), "EWI Fingerings", "the imported destination is served");
      assert.equal(await staticPage.locator(".legacy-header time").count(), 2, "the destination dates remain available without JavaScript");
      await withoutJS.close();
      console.log(`Project directory passed at ${viewport.width}×${viewport.height}, with and without JavaScript.`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
