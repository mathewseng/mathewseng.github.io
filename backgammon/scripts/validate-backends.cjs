// Reproduce backend parity and HTTP failure/retry checks against the assembled site.
const fs = require("node:fs"), browsers = require("playwright");
const { launchQuietBrowser } = require("../../scripts/quiet-browser.cjs");
const loading = require("../tests/backend-loading.cjs");
const native = require("../tests/native-backends.cjs");
(async () => {
  const base = process.env.BG_BASE_URL || "http://127.0.0.1:8878";
  const results = [];
  for (const name of ["chromium", "firefox", "webkit"]) {
    const browser = await launchQuietBrowser(browsers[name], {headless:true});
    try {
      results.push({browser:name, version:browser.version(),
        loading:await loading(browser, base),
        native:await native(browser, base, {corpus:name === "chromium"}),
      });
      console.log(name, "backend loading and numeric comparison passed");
    } finally { await browser.close(); }
  }
  fs.writeFileSync("backgammon/docs/backend-validation.json", JSON.stringify({
    recordedAt:new Date().toISOString(), status:"complete", results,
  }, null, 2) + "\n");
})().catch(e => {console.error(e); process.exitCode = 1;});
