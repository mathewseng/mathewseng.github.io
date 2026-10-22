// Focused progressive-enhancement checks for the homepage and project catalog.
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

async function assertHomepage(page) {
  assert.equal(await page.locator(".hero--home .fan .playing-card").count(), 4, "the original four-card hero remains");
  assert.deepEqual(await page.locator(".tiles--hubs a.tile").evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
    ["/ofc/", "/poker/", "/blackjack/", "/backgammon/", "/dice/"], "the original game hubs remain in their original order");
  const rows = await page.locator("li[data-project]").evaluateAll((items) => items.map((item) => ({
    path: item.dataset.project,
    href: item.querySelector("a").getAttribute("href"),
    name: item.querySelector("h3").textContent.trim(),
    dates: [...item.querySelectorAll(".project-dates time")].map((time) => time.getAttribute("datetime")),
  })));
  assert.equal(rows.length, map.projects.length, "every project is directly linked from the homepage");
  for (const project of map.projects) {
    const row = rows.find((item) => item.path === project.path);
    assert.deepEqual(row, { path: project.path, href: project.path, name: project.name, dates: [project.created, project.updated] }, `${project.name} keeps its link and dates`);
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "the homepage fits the viewport");
}

async function assertCategoryInView(page, id) {
  await page.waitForFunction((category) => {
    const heading = document.querySelector(`#heading-${category}`).getBoundingClientRect();
    return heading.top >= -1 && heading.bottom <= innerHeight + 1;
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
      await page.goto(server.base, { waitUntil: "load" });
      await assertHomepage(page);

      // Search remains available in the category directories.
      const music = map.projects.filter((project) => project.category === "music");
      await page.goto(`${server.base}/music/`, { waitUntil: "load" });
      assert.ok(await page.evaluate(() => {
        const directory = document.querySelector(".project-directory");
        const internal = ["auto", "scroll"].includes(getComputedStyle(directory).overflowY);
        return !internal || directory.getBoundingClientRect().bottom <= document.querySelector(".directory-footer").getBoundingClientRect().top + 1;
      }), "the scrollable category directory fits above its footer");
      const search = page.getByRole("searchbox", { name: "Search projects" });
      assert.equal((await visiblePaths(page)).length, music.length);

      await search.fill("  EaR   MuSiC ");
      const expected = music.filter((project) => {
        const text = `${project.name} ${project.description} ${project.category}`.toLowerCase();
        return text.includes("ear") && text.includes("music");
      }).map((project) => project.path).sort();
      assert.deepEqual((await visiblePaths(page)).sort(), expected, "search matches all words without case or whitespace sensitivity");
      assert.equal(await page.locator("#project-count").textContent(), `${expected.length} ${expected.length === 1 ? "project" : "projects"}`);

      await search.fill("a project that cannot possibly exist 987654321");
      assert.equal((await visiblePaths(page)).length, 0);
      assert.ok(await page.locator("#directory-empty").isVisible(), "empty search explains how to recover");
      assert.equal(await page.locator(".project-section:not([hidden])").count(), 0);
      await page.getByRole("button", { name: "Clear", exact: true }).click();
      assert.equal(await search.inputValue(), "");
      assert.equal((await visiblePaths(page)).length, music.length);
      assert.equal(await search.evaluate((element) => element === document.activeElement), true, "clear returns focus to search");

      await search.pressSequentially("microtonal");
      assert.deepEqual(await visiblePaths(page), ["/microtonal-lab/"]);
      assert.equal(await page.locator("#project-count").textContent(), "1 project");
      await search.press("Escape");
      assert.equal(await search.inputValue(), "");
      assert.equal((await visiblePaths(page)).length, music.length);

      // Category navigation still reaches the homepage groups, including by keyboard.
      await search.fill("microtonal");
      await page.locator('.category-nav a[href="/#music"]').click();
      assert.equal(new URL(page.url()).pathname, "/");
      assert.equal(new URL(page.url()).hash, "#music");
      await assertCategoryInView(page, "music");
      await page.goto(`${server.base}/music/`, { waitUntil: "domcontentloaded" });
      const pokerLink = page.locator('.category-nav a[href="/#poker"]');
      await page.keyboard.press("Tab");
      await pokerLink.focus();
      const ring = await pokerLink.evaluate((element) => {
        const style = getComputedStyle(element);
        return (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== "none";
      });
      assert.ok(ring, "category links have a visible keyboard focus indicator");
      await page.keyboard.press("Enter");
      await page.waitForURL(`${server.base}/#poker`);
      await assertCategoryInView(page, "poker");

      for (const id of ["games", "music", "tools"]) {
        await page.goto(`${server.base}/${id}/`, { waitUntil: "domcontentloaded" });
        const rows = await visiblePaths(page);
        assert.deepEqual(rows.sort(), map.projects.filter((project) => project.category === id).map((project) => project.path).sort());
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${id} directory fits the viewport`);
      }
      assert.deepEqual(errors, [], "homepage and category navigation cause no JavaScript errors");
      await context.close();

      const withoutJS = await browser.newContext({ viewport, javaScriptEnabled: false, reducedMotion: "reduce" });
      const staticPage = await withoutJS.newPage();
      await staticPage.goto(server.base, { waitUntil: "load" });
      await assertHomepage(staticPage);
      await staticPage.locator('li[data-project="/music/ewi-fingerings/"] a').click();
      assert.equal(new URL(staticPage.url()).pathname, "/music/ewi-fingerings/", "project links navigate without JavaScript");
      assert.equal(await staticPage.title(), "EWI Fingerings", "the imported destination is served");
      assert.equal(await staticPage.locator(".legacy-header time").count(), 2, "the destination dates remain available without JavaScript");
      await withoutJS.close();
      console.log(`Homepage and project directories passed at ${viewport.width}×${viewport.height}, with and without JavaScript.`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
