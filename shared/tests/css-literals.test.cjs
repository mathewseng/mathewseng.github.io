// Hex and rgba literal drift lint (docs/redesign/prompt.md, QA gate 3).
//
// Counts colour literals (#hex, rgb()/rgba(), hsl()/hsla()) in every tracked
// stylesheet outside tokens.css, cards.css and the Backgammon board palette,
// prints the table, and fails when a file's count rises above the recorded
// baseline in css-literals.json. Lower counts pass; record them with
//
//   CSS_LITERALS_UPDATE=1 node --test shared/tests/css-literals.test.cjs
//
// so the baseline only ever moves down.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const baselineFile = path.join(__dirname, "css-literals.json");
const EXEMPT = new Set(["shared/tokens.css", "shared/cards.css"]);
const LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgb|hsl)a?\(/gi;

function countLiterals(css) {
  // Ignore comments and url() payloads (SVG data URIs carry their own colours).
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/url\([^)]*\)/g, "url()");
  return (stripped.match(LITERAL) || []).length;
}

function stylesheets() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.css"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((file) => file && !file.startsWith("gym/") && !file.startsWith("node_modules/") && !file.startsWith("_site/") && !file.startsWith("shared/preview/"))
    .filter((file) => !EXEMPT.has(file) && !/backgammon\/.*palette/.test(file));
}

test("colour literals per stylesheet never rise above the recorded baseline", () => {
  const counts = {};
  for (const file of stylesheets()) counts[file] = countLiterals(fs.readFileSync(path.join(root, file), "utf8"));
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  console.log(`colour literals outside tokens.css/cards.css: ${total} in ${rows.length} stylesheets`);
  for (const [file, n] of rows) console.log(`  ${String(n).padStart(4)}  ${file}`);

  if (process.env.CSS_LITERALS_UPDATE) {
    fs.writeFileSync(baselineFile, JSON.stringify(counts, null, 2) + "\n");
    console.log(`baseline written to ${path.relative(root, baselineFile)}`);
    return;
  }
  assert.ok(fs.existsSync(baselineFile), "css-literals.json baseline exists (run with CSS_LITERALS_UPDATE=1)");
  const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
  const risen = [];
  const lowered = [];
  for (const [file, n] of rows) {
    const was = baseline[file];
    if (was == null) {
      if (n > 0) risen.push(`${file}: new stylesheet with ${n} literals (record it deliberately)`);
    } else if (n > was) risen.push(`${file}: ${was} → ${n}`);
    else if (n < was) lowered.push(`${file}: ${was} → ${n}`);
  }
  if (lowered.length) console.log(`lower than baseline (update it): ${lowered.join("; ")}`);
  assert.deepEqual(risen, [], `colour literal counts rose:\n  ${risen.join("\n  ")}`);
});
