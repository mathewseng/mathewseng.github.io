// Screenshot baselines for the site-wide redesign (docs/redesign/prompt.md, QA gate 4).
//
// Renders every page of an assembled _site at 1440x900 and 375x812 with Chromium
// and writes one PNG per page per viewport. Finite animations are fast-forwarded
// and infinite ones cancelled so the pictures are stable.
//
//   sh scripts/assemble-site.sh _site
//   node scripts/screenshots.cjs                      # writes scripts/screenshots/current/
//   node scripts/screenshots.cjs --out some/dir       # writes elsewhere
//   node scripts/screenshots.cjs --compare            # also compares each picture with
//                                                     # scripts/screenshots/baseline/ pixel by
//                                                     # pixel and writes diff images to
//                                                     # scripts/screenshots/diff/
//   node scripts/screenshots.cjs --only /poker/,/ofc/ # a subset of pages
//
// The baseline folder holds the pre-redesign pictures; review every change
// against it by eye and copy a reviewed picture over its baseline deliberately.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { launchQuietBrowser } = require("./quiet-browser.cjs");
const { serveSite, listPages, pageLabel, settle } = require("./site-pages.cjs");
const png = require("./png.cjs");

const VIEWPORTS = [
  [1440, 900],
  [375, 812],
];

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const root = path.resolve(option("--site") || "_site");
const out = path.resolve(option("--out") || "scripts/screenshots/current");
const baseline = path.resolve("scripts/screenshots/baseline");
const diffDir = path.resolve("scripts/screenshots/diff");
const compare = args.includes("--compare");
const only = option("--only")?.split(",");

(async () => {
  if (!fs.existsSync(root)) {
    console.error(`No assembled site at ${root}; run sh scripts/assemble-site.sh _site first.`);
    process.exit(1);
  }
  fs.mkdirSync(out, { recursive: true });
  const server = await serveSite(root);
  const browser = await launchQuietBrowser(chromium);
  const changed = [];
  const missing = [];
  try {
    const pages = listPages(root).filter((page) => !only || only.includes(page));
    for (const [width, height] of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
        hasTouch: width < 700,
        isMobile: width < 700,
        serviceWorkers: "block",
      });
      for (const pagePath of pages) {
        const page = await context.newPage();
        try {
          await page.goto(server.base + pagePath, { waitUntil: "domcontentloaded" });
          await settle(page);
          const file = path.join(out, `${pageLabel(pagePath)}-${width}x${height}.png`);
          const bytes = await page.screenshot({ fullPage: true, animations: "disabled", caret: "hide" });
          fs.writeFileSync(file, bytes);
          if (compare) {
            const reference = path.join(baseline, path.basename(file));
            if (!fs.existsSync(reference)) missing.push(path.basename(file));
            else if (!fs.readFileSync(reference).equals(bytes)) {
              const result = png.diff(png.decode(fs.readFileSync(reference)), png.decode(bytes));
              fs.mkdirSync(diffDir, { recursive: true });
              fs.writeFileSync(path.join(diffDir, path.basename(file)), png.encode(result.image));
              changed.push({ file: path.basename(file), ...result });
            }
          }
          console.log(`shot ${pagePath} @ ${width}x${height}`);
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
  if (compare) {
    console.log(`\n${changed.length} changed, ${missing.length} without a baseline`);
    for (const { file, differing, total, resized } of changed)
      console.log(`  changed: ${file.padEnd(44)} ${((100 * differing) / total).toFixed(2).padStart(6)}% of pixels${resized ? " (size changed)" : ""}  → diff/${file}`);
    for (const file of missing) console.log(`  new: ${file}`);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
