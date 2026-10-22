const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { readFileSync, existsSync } = require("node:fs");
const { resolve } = require("node:path");

const root = resolve(__dirname, "../..");
const read = (file) => readFileSync(resolve(root, file), "utf8");
const map = JSON.parse(read("shared/site-map.json"));
const decode = (value) => value.replace(/&(?:amp|quot|lt|gt|#39);/g, (entity) => ({ "&amp;": "&", "&quot;": '"', "&lt;": "<", "&gt;": ">", "&#39;": "'" }[entity]));
const fileFor = (url) => {
  const path = new URL(url, "https://mathewseng.github.io").pathname;
  return path.endsWith("/") ? `${path.slice(1)}index.html` : path.slice(1);
};
const importedRoutes = [
  ["/poker/three-pick-two/", "Poker/3Pick2/"],
  ["/poker/pokerdle/", "Poker/Pokerdle/"],
  ["/poker/shot-clock/", "Poker/ShotClock/"],
  ["/poker/preflop-ranges/", "Poker/Preflop/"],
  ["/poker/preflop-classic/", "Poker/PokerPreflop/PokerPreflop.html"],
  ["/poker/preflop-classic-v2/", "Poker/PokerPreflop/PokerPreflop2.html"],
  ["/poker/heads-up-preflop/", "Poker/Other/HUNL.html"],
  ["/poker/range-converter/", "Poker/GTOWizardScripts/SimpToGTO.html"],
  ["/poker/source-tools/#flop-reports-parser", "Poker/GTOWizardScripts/FlopReportsParser.js"],
  ["/poker/source-tools/#range-parser", "Poker/GTOWizardScripts/RangeParser.js"],
  ["/poker/source-tools/#flop-ev-parser", "Poker/GTOWizardScripts/FlopEVParser.js"],
  ["/poker/source-tools/#skip-straight-probability", "Poker/Other/SkipStraightProbability.py"],
  ["/poker/source-tools/#range-approximator", "Poker/Other/RangeApproximator.py"],
  ["/poker/source-tools/#100nl-complete-text", "Poker/Other/100NL_Complete_Text.txt"],
  ["/poker/source-tools/", "Poker/GTOWizardScripts/"],
  ["/music/ear-training/", "Music/EarTraining"],
  ["/music/perception-test/", "Music/PerceptionTest"],
  ["/music/chord-net/", "Music/ChordNet"],
  ["/music/ewi-fingerings/", "EWI"],
  ["/music/musical-masterpieces/", "Random/musicalMasterpieces.html"],
  ["/games/aperiodic-minesweeper/", "Games/AperiodicMinesweeper"],
  ["/games/cardsweeper/", "Games/Cardsweeper"],
  ["/games/guessjack/", "Games/GuessJack"],
  ["/games/word-hunt/", "Lori/WordHunt"],
  ["/games/blus-adventure/", "Lori/BlusAdventure"],
  ["/games/tft/", "Random/TFT.html"],
  ["/tools/mandelbrot/", "Random/mandelbrotSet.html"],
  ["/tools/sbeve/", "Random/sbeve.html"],
  ["/tools/bank-discrepancy/", "bank-discrepancy"],
];

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

test("every project has a unique route, category, source, and valid ordered dates", () => {
  assert.ok(map.projects.length > 0);
  const categories = new Set(map.categories.map((category) => category.id));
  const paths = new Set();
  for (const project of map.projects) {
    assert.ok(project.name && project.description, `${project.path} has useful directory text`);
    assert.ok(categories.has(project.category), `${project.path} has a known category`);
    assert.ok(!paths.has(project.path), `${project.path} appears once`);
    paths.add(project.path);
    assert.ok(validDate(project.created), `${project.path} has a valid creation day: ${project.created}`);
    assert.ok(validDate(project.updated), `${project.path} has a valid update day: ${project.updated}`);
    assert.ok(project.created <= project.updated, `${project.path} was created before its last update`);
    assert.ok(project.sourcePaths?.length, `${project.path} has update-tracking source paths`);
    for (const source of project.sourcePaths) assert.ok(existsSync(resolve(root, source)), `${project.path} source exists: ${source}`);
    if (!project.path.startsWith("/")) continue;
    const html = read(fileFor(project.path));
    const fragment = new URL(project.path, "https://mathewseng.github.io").hash.slice(1);
    if (fragment) assert.ok(html.includes(`id="${fragment}"`), `${project.path} points to an existing section`);
  }
});

test("the catalog represents every published project index", () => {
  const indexes = [...new Set(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "index.html", "*/index.html"], { cwd: root, encoding: "utf8" }).trim().split("\n"))];
  const categoryIndexes = new Set(map.categories.map((category) => fileFor(category.path)));
  const catalogFiles = new Set(map.projects.filter((project) => project.path.startsWith("/")).map((project) => fileFor(project.path)));
  const excluded = /^(?:_site|node_modules|scripts|shared\/preview|jazz-piano-ml)\/|\/(?:tests|node_modules|dist)\//;
  const missing = indexes.filter((file) => file && file !== "index.html" && !categoryIndexes.has(file) && !excluded.test(file) && !catalogFiles.has(file));
  assert.deepEqual(missing, [], "every app, report, gallery and tool is reachable from the directory");
});

test("all imported projects retain their original repository, paths and creation dates", () => {
  for (const [path, source] of importedRoutes) {
    const project = map.projects.find((entry) => entry.path === path);
    assert.ok(project, `${path} was imported`);
    assert.match(project.origin?.repository || "", /(?:^|\/)matheweon\/matheweon\.github\.io(?:\.git)?\/?$/);
    assert.match(project.origin.commit, /^[a-f0-9]{40}$/i, `${path} has a pinned source commit`);
    assert.ok(project.origin.paths.some((value) => value.replace(/\/$/, "") === source.replace(/\/$/, "")), `${path} retains source path ${source}`);
    assert.ok(validDate(project.origin.created), `${path} retains original creation date`);
    assert.ok(validDate(project.origin.updated), `${path} retains original update date`);
    assert.equal(project.created, project.origin.created, `${path} is not dated to its import`);
    assert.ok(project.updated >= project.origin.updated, `${path} updates do not predate its original source`);
    const html = read(fileFor(path));
    assert.doesNotMatch(html, /(?:href|src)\s*=\s*["'][^"']*(?:https?:)?\/\/matheweon\.github\.io/i, `${path} no longer loads or navigates to the old local site`);
  }
});

test("homepage and category directories contain static links and matching dates for every project", () => {
  for (const [file, projects] of [["index.html", map.projects], ...map.categories.filter((category) => ["games", "music", "tools"].includes(category.id)).map((category) => [fileFor(category.path), map.projects.filter((project) => project.category === category.id)])]) {
    const html = read(file);
    const rows = new Map([...html.matchAll(/<li\b[^>]*\bdata-project="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map((match) => [decode(match[1]), match[2]]));
    assert.equal(rows.size, projects.length, `${file} has one static row per project`);
    for (const project of projects) {
      const row = rows.get(project.path);
      assert.ok(row, `${file} links ${project.path} without JavaScript`);
      const href = row.match(/<a\b[^>]*\bhref="([^"]+)"/)?.[1];
      assert.equal(decode(href || ""), project.path, `${project.name} opens its canonical route`);
      assert.equal(decode(row.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] || ""), project.name);
      const dates = [...row.matchAll(/<time\b[^>]*datetime="([^"]+)"[^>]*>([^<]+)<\/time>/g)];
      assert.deepEqual(dates.map((date) => date[1]), [project.created, project.updated], `${project.name} dates match the catalog`);
      assert.ok(dates.every((date) => !/Invalid|undefined/.test(date[2])), `${project.name} dates are readable`);
    }
  }
});
