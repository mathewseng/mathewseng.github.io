// Shell sweep (docs/redesign/prompt.md, QA gate 1): visits every page of an
// assembled _site in Chromium at 1440x900, 375x812 and 844x390 and checks the
// shared-shell contract.
//
//   sh scripts/assemble-site.sh _site && node scripts/shell-browser.cjs
//   SHELL_PAGES=/poker/,/ofc/ node scripts/shell-browser.cjs   # a subset
//   SHELL_ROOT_FONT=24 node scripts/shell-browser.cjs          # the text-zoom pass (QA gate 6)
//   node scripts/shell-browser.cjs --site /tmp/site            # another directory
//
// Every page: no horizontal overflow (documentElement.scrollWidth <= innerWidth).
// Pages that link shared/app.css (the shell): a .topbar; every .btn, .field
// control, .tabs tab, .segmented option, .tool-nav link and .switcher link is
// at least 44px tall and wide on the phone viewports; a visible focus ring on
// the first 20 tabbable elements.
// Pages listed in MIGRATED (families that have been rewritten on the shared
// system): no rendered text under 12px outside aria-hidden decoration, a skip
// link and main#main[tabindex="-1"].
// Every page also gets a non-failing report of those counts so the drift is
// visible before a family migrates.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { launchQuietBrowser } = require("./quiet-browser.cjs");
const { serveSite, listPages, settle } = require("./site-pages.cjs");

// Pages whose families have migrated onto tokens.css + app.css. Add each
// family's pages as its rollout step lands.
// Every published page has migrated onto tokens.css + app.css (docs/redesign/).
const MIGRATED = new Set([
  "/", "/ofc/", "/poker/", "/blackjack/", "/dice/", "/backgammon/",
  "/poker/dodge/", "/poker/dodge/simulator/", "/poker/222/", "/poker/video-poker/", "/poker/calculations/",
  "/poker/play/", "/poker/rush/", "/poker/ultimate-omaha/", "/poker/edge-the-dealer/",
  "/ofc/play/", "/ofc/fantasyland-trainer/", "/ofc/fantasyland-ev/",
  "/blackjack/strategy/", "/dice/reports/", "/microtonal-lab/", "/cards/",
  "/scoundrel/", "/scoundrel/reports/",
  "/backgammon/play/", "/backgammon/trainer/", "/backgammon/solver/", "/backgammon/library/",
  "/backgammon/openings/", "/backgammon/controls/", "/backgammon/reports/", "/backgammon/refresh/",
  "/gym/",
]);

const VIEWPORTS = [
  { width: 1440, height: 900, phone: false },
  { width: 375, height: 812, phone: true },
  { width: 844, height: 390, phone: true },
];
const TARGETS = '.btn, .switcher a, .tool-nav a, .tabs > [role="tab"], .segmented > label, .segmented > button, .field input:not([type="range"], [type="checkbox"], [type="radio"]), .field select, .field textarea';
const MIN_TEXT = 12;
const MIN_TARGET = 44;

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const root = path.resolve(option("--site") || "_site");
const only = process.env.SHELL_PAGES ? process.env.SHELL_PAGES.split(",") : null;
const rootFont = process.env.SHELL_ROOT_FONT ? Number(process.env.SHELL_ROOT_FONT) : null;

// Runs inside the page: measures everything the sweep asserts on.
function inspect({ targets, minText, minTarget }) {
  const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const decorated = (el) => !!el.closest('[aria-hidden="true"]');
  const smallText = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const seen = new Set();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    if (!el || seen.has(el) || ["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(el.tagName)) continue;
    seen.add(el);
    if (!visible(el) || decorated(el)) continue;
    const rect = node.parentElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < minText) smallText.push({ tag: el.tagName.toLowerCase(), cls: (el.getAttribute("class") || "").slice(0, 40), size: +size.toFixed(2), text: node.textContent.trim().slice(0, 30) });
  }
  const smallTargets = [];
  for (const el of document.querySelectorAll(targets)) {
    if (!visible(el)) continue;
    const box = el.getBoundingClientRect();
    if (box.width + 0.5 < minTarget || box.height + 0.5 < minTarget)
      smallTargets.push({ tag: el.tagName.toLowerCase(), cls: (el.getAttribute("class") || "").slice(0, 40), w: Math.round(box.width), h: Math.round(box.height), text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24) });
  }
  const main = document.querySelector("main#main");
  return {
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth,
    shell: !!document.querySelector('link[href*="shared/app.css"]'),
    topbar: !!document.querySelector(".topbar"),
    skipLink: !!document.querySelector('a.skip-link, a[href="#main"]'),
    main: !!main && main.getAttribute("tabindex") === "-1",
    smallText,
    smallTargets,
  };
}

// Elements that draw their own focus indicator inside an SVG rather than with
// an outline: the Backgammon board (its keyboard model is asserted by
// backgammon/tests/background-focus.cjs).
const SELF_FOCUS = "#hub-board svg, .bg-board, .bg-board *";

// Tabs through the first `count` elements and reports those without a ring.
async function focusRings(page, count) {
  const missing = [];
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
  });
  for (let i = 0; i < count; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate((selfFocus) => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const ring = el.matches(selfFocus) || (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== "none";
      return { ring, tag: el.tagName.toLowerCase(), cls: (el.getAttribute("class") || "").slice(0, 40), text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24) };
    }, SELF_FOCUS);
    if (!info) break;
    if (!info.ring) missing.push(info);
  }
  return missing;
}

(async () => {
  if (!fs.existsSync(root)) {
    console.error(`No assembled site at ${root}; run sh scripts/assemble-site.sh _site first.`);
    process.exit(1);
  }
  const pages = listPages(root).filter((page) => !only || only.includes(page));
  const server = await serveSite(root);
  const browser = await launchQuietBrowser(chromium);
  const failures = [];
  const report = [];
  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        hasTouch: viewport.phone,
        isMobile: viewport.phone,
        serviceWorkers: "block",
      });
      if (rootFont)
        await context.addInitScript((size) => {
          // The root element does not exist yet when an init script runs.
          const apply = () => document.documentElement.style.setProperty("font-size", `${size}px`);
          if (document.documentElement) apply();
          else
            new MutationObserver((records, observer) => {
              if (!document.documentElement) return;
              apply();
              observer.disconnect();
            }).observe(document, { childList: true });
        }, rootFont);
      for (const pagePath of pages) {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        try {
          await page.goto(server.base + pagePath, { waitUntil: "domcontentloaded" });
          await settle(page);
          const result = await page.evaluate(inspect, { targets: TARGETS, minText: MIN_TEXT, minTarget: MIN_TARGET });
          const strict = MIGRATED.has(pagePath);
          const label = `${pagePath} @ ${viewport.width}x${viewport.height}`;
          const problems = [];
          if (result.overflow) problems.push(`horizontal overflow: scrollWidth ${result.scrollWidth} > innerWidth ${result.innerWidth}`);
          let rings = [];
          if (result.shell) {
            if (!result.topbar) problems.push("no .topbar");
            if (viewport.phone && result.smallTargets.length)
              problems.push(`${result.smallTargets.length} targets under ${MIN_TARGET}px: ${result.smallTargets.slice(0, 4).map((t) => `${t.tag}.${t.cls} ${t.w}x${t.h} "${t.text}"`).join(", ")}`);
            rings = await focusRings(page, 20);
            if (rings.length) problems.push(`${rings.length} focused elements without a ring: ${rings.slice(0, 4).map((r) => `${r.tag}.${r.cls} "${r.text}"`).join(", ")}`);
          }
          if (strict) {
            if (result.smallText.length)
              problems.push(`${result.smallText.length} text nodes under ${MIN_TEXT}px: ${result.smallText.slice(0, 4).map((t) => `${t.tag}.${t.cls} ${t.size}px "${t.text}"`).join(", ")}`);
            if (!result.skipLink) problems.push("no skip link");
            if (!result.main) problems.push('no main#main[tabindex="-1"]');
          }
          if (errors.length) problems.push(`page errors: ${errors.slice(0, 2).join(" | ")}`);
          report.push({ label, shell: result.shell, strict, text: result.smallText.length, targets: viewport.phone ? result.smallTargets.length : null, rings: result.shell ? rings.length : null, skip: result.skipLink, main: result.main, overflow: result.overflow });
          if (problems.length) failures.push({ label, problems });
          console.log(`${problems.length ? "FAIL" : "ok  "} ${label}${problems.length ? "\n      " + problems.join("\n      ") : ""}`);
        } finally {
          await page.close();
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
  console.log("\nDrift report (text nodes < 12px / targets < 44px on phones / focus rings missing / skip link / main#main):");
  for (const row of report)
    console.log(
      `  ${row.label.padEnd(40)} ${row.shell ? (row.strict ? "migrated" : "shell   ") : "legacy  "}  text<12: ${String(row.text).padStart(4)}  targets<44: ${row.targets == null ? "   -" : String(row.targets).padStart(4)}  rings missing: ${row.rings == null ? "  -" : String(row.rings).padStart(3)}  skip: ${row.skip ? "y" : "n"}  main: ${row.main ? "y" : "n"}`,
    );
  if (failures.length) {
    console.error(`\n${failures.length} page/viewport combinations failed the shell sweep.`);
    process.exit(1);
  }
  console.log(`\nShell sweep passed on ${pages.length} pages × ${VIEWPORTS.length} viewports.`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
