// Runs the shell sweep (scripts/shell-browser.cjs) against a freshly assembled
// site from the test runner. Skipped when Playwright is not installed (the
// validate workflow installs it after this step and runs the sweep on its own).
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

let playwright = true;
try {
  require.resolve("playwright");
} catch (error) {
  playwright = false;
}

test("every assembled page passes the shell sweep", { skip: !playwright && "playwright is not installed" }, () => {
  const root = resolve(__dirname, "../..");
  const site = mkdtempSync(join(tmpdir(), "shell-sweep-"));
  try {
    execFileSync("sh", ["scripts/assemble-site.sh", site], { cwd: root });
    const run = spawnSync(process.execPath, ["scripts/shell-browser.cjs", "--site", site], { cwd: root, encoding: "utf8" });
    if (run.status !== 0) console.log(run.stdout, run.stderr);
    assert.equal(run.status, 0, "shell sweep passed");
  } finally {
    rmSync(site, { recursive: true, force: true });
  }
});
