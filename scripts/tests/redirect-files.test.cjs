const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, statSync, existsSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { resolve, join } = require("node:path");
const vm = require("node:vm");

function fixture(t, redirects) {
  const root = mkdtempSync(join(tmpdir(), "redirect-files-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "scripts"));
  for (const file of ["build-redirects.mjs", "assemble-site.sh"]) copyFileSync(resolve(__dirname, "..", file), join(root, "scripts", file));
  writeFileSync(join(root, "redirects.json"), JSON.stringify(redirects));
  return root;
}

function redirectTarget(html, search = "?room=abc%2B123&seed=42", hash = "#turn-3") {
  let target;
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "redirect has an executable client-side fallback");
  vm.runInNewContext(script, { location: { search, hash, replace: (value) => { target = value; } } });
  return target;
}

test("assembly excludes the native project and generated app bundle", (t) => {
  const root = fixture(t, {});
  mkdirSync(join(root, "ios/build/PocketSite.app/Site"), { recursive: true });
  writeFileSync(join(root, "ios/build/PocketSite.app/Site/index.html"), "nested copy");
  writeFileSync(join(root, "ios/private-native.swift"), "native source");
  writeFileSync(join(root, "index.html"), "website");
  execFileSync("sh", ["scripts/assemble-site.sh", "_site"], { cwd: root, stdio: "pipe" });
  assert.equal(existsSync(join(root, "_site/ios")), false);
  assert.equal(readFileSync(join(root, "_site/index.html"), "utf8"), "website");
});

test("assembly preserves exact legacy filenames and their query strings and fragments", (t) => {
  const root = fixture(t, { "/Poker/ShotClock/ShotClock.html": "/poker/shot-clock/", "/PokerPreflop.html": "/poker/preflop-classic/", "/old-tool/": "/tools/new-tool/" });
  mkdirSync(join(root, "poker/shot-clock"), { recursive: true });
  writeFileSync(join(root, "poker/shot-clock/index.html"), "<main>The real app</main>");
  execFileSync("sh", ["scripts/assemble-site.sh", "_site"], { cwd: root, stdio: "pipe" });
  for (const [old, destination] of [["Poker/ShotClock/ShotClock.html", "/poker/shot-clock/"], ["PokerPreflop.html", "/poker/preflop-classic/"], ["old-tool/index.html", "/tools/new-tool/"]]) {
    const file = join(root, "_site", old);
    assert.ok(statSync(file).isFile(), `${old} is a file rather than a .html directory`);
    const html = readFileSync(file, "utf8");
    assert.equal(redirectTarget(html), `${destination}?room=abc%2B123&seed=42#turn-3`);
    assert.ok(html.includes(`<link rel="canonical" href="${destination}"`));
    assert.ok(html.includes(`<a href="${destination}">`), "a plain link works without JavaScript");
  }
  assert.equal(readFileSync(join(root, "_site/poker/shot-clock/index.html"), "utf8"), "<main>The real app</main>");
});

test("folder and explicit index aliases can share one redirect file", (t) => {
  for (const paths of [["/bank-discrepancy/", "/bank-discrepancy/index.html"], ["/bank-discrepancy/index.html", "/bank-discrepancy/"]]) {
    const root = fixture(t, Object.fromEntries(paths.map((path) => [path, "/tools/bank-discrepancy/"])));
    const site = join(root, "_site");
    const run = spawnSync(process.execPath, ["scripts/build-redirects.mjs", site], { cwd: root, encoding: "utf8" });
    assert.equal(run.status, 0, `equivalent aliases coexist in either order: ${run.stderr}`);
    assert.equal(redirectTarget(readFileSync(join(site, "bank-discrepancy/index.html"), "utf8"), "?weights=2,1", "#result"), "/tools/bank-discrepancy/?weights=2,1#result");
  }
});

test("redirect aliases cannot overwrite a real page or conceal conflicting targets", (t) => {
  const root = fixture(t, { "/bank-discrepancy/": "/tools/bank-discrepancy/" });
  const site = join(root, "_site");
  mkdirSync(join(site, "bank-discrepancy"), { recursive: true });
  const realPage = "<main>Keep my existing app</main>";
  writeFileSync(join(site, "bank-discrepancy/index.html"), realPage);
  const run = spawnSync(process.execPath, ["scripts/build-redirects.mjs", site], { cwd: root, encoding: "utf8" });
  assert.notEqual(run.status, 0);
  assert.equal(readFileSync(join(site, "bank-discrepancy/index.html"), "utf8"), realPage);

  const conflict = fixture(t, { "/bank-discrepancy/": "/tools/one/", "/bank-discrepancy/index.html": "/tools/two/" });
  const second = spawnSync(process.execPath, ["scripts/build-redirects.mjs", "_site"], { cwd: conflict, encoding: "utf8" });
  assert.notEqual(second.status, 0, "different destinations for the same output must fail");
});

test("case-only legacy aliases preserve the real app on either filesystem type", (t) => {
  const root = fixture(t, { "/Games/Cardsweeper/": "/games/cardsweeper/", "/Games/Cardsweeper/index.html": "/games/cardsweeper/" });
  const site = join(root, "_site");
  const canonical = join(site, "games/cardsweeper/index.html");
  const legacy = join(site, "Games/Cardsweeper/index.html");
  mkdirSync(join(site, "games/cardsweeper"), { recursive: true });
  const realPage = "<main>The actual Cardsweeper project</main>";
  writeFileSync(canonical, realPage);
  // Detect the mounted filesystem rather than assume macOS is insensitive or
  // Linux is sensitive. The temporary directory can live on either volume.
  const sameFile = existsSync(legacy) && statSync(legacy).dev === statSync(canonical).dev && statSync(legacy).ino === statSync(canonical).ino;
  const run = spawnSync(process.execPath, ["scripts/build-redirects.mjs", site], { cwd: root, encoding: "utf8" });
  assert.equal(run.status, 0, `case-only aliases assemble without clobbering the app: ${run.stderr}`);
  assert.equal(readFileSync(canonical, "utf8"), realPage, "the canonical app is never replaced by its own redirect");
  if (sameFile) {
    assert.equal(readFileSync(legacy, "utf8"), realPage, "the filesystem already resolves the legacy spelling to the app");
    assert.match(run.stdout, /case-insensitive filesystem alias/);
  } else {
    assert.equal(redirectTarget(readFileSync(legacy, "utf8")), "/games/cardsweeper/?room=abc%2B123&seed=42#turn-3", "case-sensitive hosting receives an exact uppercase redirect");
    assert.notEqual(statSync(legacy).ino, statSync(canonical).ino, "the redirect is a separate file");
  }
});
