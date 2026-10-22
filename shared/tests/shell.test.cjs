// The shared shell: tokens.css defines every token the shared stylesheets use,
// no shared stylesheet redefines a token, every page that loads app.css loads
// tokens.css first, the token colours clear the contrast floors in
// docs/redesign/prompt.md, and the shared scripts load in Node.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const tokensCss = read("shared/tokens.css");

// Custom properties set by markup (inline styles), scripts or the component's
// own consumer rather than by tokens.css.
const RUNTIME_VARIABLES = new Set([
  "--i", "--k", "--y", "--n", "--c", "--s", "--x", "--h", // hub stagger, fan and art positions (inline styles)
  "--mx", "--my", "--tx", "--ty", // hub.js pointer light and fan tilt
  "--dot", "--swatch", "--reveal-delay", // set by a sibling rule in the same file
  "--value", "--bar-color", // bars and progress
  "--tab-left", "--tab-width", // shared/tabs.js
  "--dialog-visible-height", "--dialog-visible-top", // shared/sheet.js
  "--table-sticky-top", "--table-sticky-left", // set by .table-wrap itself
  "--card-width", "--card-w-board", // cards.css API
  "--keycap-fill", "--keycap-stroke", // .keycap sets its own defaults
]);

function definedTokens(css) {
  return new Set(Array.from(css.matchAll(/(--[a-z0-9-]+)\s*:/g), (m) => m[1]));
}

function usedTokens(css) {
  return new Set(Array.from(css.matchAll(/var\(\s*(--[a-z0-9-]+)/g), (m) => m[1]));
}

const tokens = definedTokens(tokensCss);

test("tokens.css defines the token families the brief names", () => {
  for (const name of [
    "--page", "--surface", "--surface-2", "--surface-3", "--glass", "--line", "--line-strong", "--line-opaque", "--control-border",
    "--ink", "--muted", "--soft", "--on-accent", "--accent", "--accent-2",
    "--family-ofc", "--family-poker", "--family-blackjack", "--family-dice", "--family-backgammon", "--family-home",
    "--family-cards", "--family-gym", "--family-microtonal",
    "--good", "--bad", "--warn", "--info", "--hit", "--stand", "--double", "--split", "--surrender",
    "--cat-1", "--cat-6", "--chart-grid", "--player-1", "--player-2",
    "--t-xs", "--t-sm", "--t-md", "--t-lg", "--t-xl", "--t-hero",
    "--s-1", "--s-6", "--r-sm", "--r-md", "--r-lg", "--r-pill",
    "--shadow-tile", "--shadow-raised", "--shadow-sheet", "--focus-ring", "--focus-halo",
    "--ease", "--spring", "--d-fast", "--d-base", "--d-slow",
    "--card-w-preview", "--card-w-seat", "--card-w-tray", "--card-w-table",
  ])
    assert.ok(tokens.has(name), `${name} is defined in tokens.css`);
  assert.match(tokensCss, /--t-xs:\s*0\.75rem/, "the type floor is 12px");
  assert.match(tokensCss, /prefers-reduced-motion: reduce[\s\S]*animation-duration: 0\.01ms/, "reduced motion uses near-zero durations, never animation: none");
  assert.doesNotMatch(stripComments(tokensCss), /animation:\s*none/);
  assert.match(tokensCss, /:root\[data-theme="light"\]/, "the light theme hook is documented");
});

test("every token the shared stylesheets use is defined in tokens.css", () => {
  for (const file of ["shared/app.css", "shared/hub.css", "shared/hub-art.css"]) {
    const css = read(file);
    const local = definedTokens(css);
    for (const name of usedTokens(css))
      assert.ok(tokens.has(name) || local.has(name) || RUNTIME_VARIABLES.has(name), `${file} uses ${name}, which tokens.css does not define`);
  }
});

test("no shared stylesheet redefines a token from tokens.css", () => {
  for (const file of ["shared/app.css", "shared/hub.css", "shared/hub-art.css", "shared/cards.css"]) {
    const redefined = Array.from(definedTokens(read(file))).filter((name) => tokens.has(name));
    assert.deepEqual(redefined, [], `${file} redefines ${redefined.join(", ")}`);
  }
});

test("only tokens.css uses !important, and only for reduced motion and [hidden]", () => {
  for (const file of ["shared/app.css", "shared/hub.css", "shared/hub-art.css", "shared/cards.css"])
    assert.doesNotMatch(stripComments(read(file)), /!important/, `${file} has no !important`);
  const important = stripComments(tokensCss).match(/!important/g) || [];
  assert.equal(important.length, 7, "six reduced-motion declarations and the [hidden] rule");
});

test("every page that links app.css links tokens.css before any other stylesheet", () => {
  const pages = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "index.html", "*/index.html"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((file) => file && !file.startsWith("gym/") && !file.startsWith("node_modules/") && !file.includes("/tests/") && !file.startsWith("shared/preview/"));
  let linked = 0;
  for (const page of pages) {
    const html = read(page);
    if (!/shared\/app\.css/.test(html)) continue;
    linked++;
    const links = Array.from(html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g), (m) => m[1]);
    assert.ok(links.length && /shared\/tokens\.css/.test(links[0]), `${page} links tokens.css first (got ${links[0]})`);
    assert.ok(/shared\/app\.css/.test(links[1]), `${page} links app.css second`);
    if (/class="directory"/.test(html)) {
      const categories = JSON.parse(read('shared/site-map.json')).categories;
      assert.match(html, /aria-label="Project categories"/, `${page} has category navigation`);
      for (const category of categories) assert.ok(html.includes(`#${category.id}"`), `${page} links ${category.name}`);
    } else if (/shared\/hub\.css/.test(html)) {
      const switcher = Array.from(html.matchAll(/data-to="([a-z]+)"/g), (m) => m[1]);
      assert.deepEqual(switcher, ["ofc", "poker", "blackjack", "backgammon", "dice"], `${page} has the five switcher links in one order`);
      assert.match(html, /classList\.add\("is-ready"\)/, `${page} sets html.is-ready before first paint`);
    }
  }
  assert.ok(linked >= 6, "the landing page and the five hubs link app.css");
});

// WCAG 2 contrast of the token colours against each surface.
function luminance(hex) {
  const n = hex.replace("#", "");
  const full = n.length === 3 ? n.split("").map((c) => c + c).join("") : n;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function hexToken(name) {
  const match = tokensCss.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`));
  assert.ok(match, `${name} is a hex colour`);
  return match[1];
}

test("token colours clear the contrast floors", () => {
  const surfaces = ["--page", "--surface", "--surface-2", "--surface-3"].map(hexToken);
  const floor = (name, minimum, over = surfaces, note = "") => {
    const colour = hexToken(name);
    for (const surface of over) {
      const ratio = contrast(colour, surface);
      assert.ok(ratio >= minimum, `${name} ${colour} on ${surface} is ${ratio.toFixed(2)}:1, below ${minimum}:1 ${note}`);
    }
  };
  floor("--ink", 13);
  floor("--muted", 6.9, surfaces.slice(0, 3));
  floor("--muted", 4.5, [surfaces[3]], "(AA on wells)");
  floor("--soft", 4.5, surfaces.slice(0, 1), "(tertiary, ≥ 15px only)");
  for (const name of ["--good", "--bad", "--warn", "--info", "--surrender", "--player-1", "--player-2"]) floor(name, 4.5);
  for (const family of ["ofc", "poker", "blackjack", "dice", "backgammon", "home", "cards", "gym", "microtonal"]) floor(`--family-${family}`, 4.5);
  floor("--control-border", 3, surfaces.slice(0, 3), "(non-text boundary)");
  const onAccent = hexToken("--on-accent");
  for (const family of ["ofc", "poker", "blackjack", "dice", "backgammon", "home", "cards", "gym", "microtonal"])
    assert.ok(contrast(onAccent, hexToken(`--family-${family}`)) >= 4.5, `--on-accent on --family-${family}`);
  assert.ok(contrast(onAccent, hexToken("--bad")) >= 4.5, "--on-accent on --bad (danger buttons)");
});

test("the club suit keeps white rank text at 3:1 or better", () => {
  const club = read("shared/cards.css").match(/--card-club:\s*(#[0-9a-f]{6})/i)[1];
  assert.ok(contrast("#ffffff", club) >= 3, `white on ${club} is ${contrast("#ffffff", club).toFixed(2)}:1`);
});

test("the shared scripts load in Node and expose their APIs", () => {
  assert.equal(typeof require("../tabs.js").init, "function");
  const sheet = require("../sheet.js");
  for (const name of ["open", "close", "fit", "create", "setError", "confirm"]) assert.equal(typeof sheet[name], "function", `Sheet.${name}`);
  assert.equal(typeof require("../card-drag.js"), "function");
  const keycap = require("../keycap.js");
  assert.equal(keycap.keyLabel("Space"), "Space");
  assert.equal(keycap.keyLabel("r"), "R");
  assert.equal(typeof keycap.keycap, "function");
  assert.equal(typeof keycap.keycapGraphic, "function");
});

test("icons.svg is a sprite of 20px symbols", () => {
  const svg = read("shared/icons.svg");
  const symbols = Array.from(svg.matchAll(/<symbol id="(i-[a-z-]+)" viewBox="0 0 20 20">/g), (m) => m[1]);
  assert.ok(symbols.length >= 20, "at least twenty icons");
  for (const name of ["i-sound", "i-sound-off", "i-rules", "i-settings", "i-close", "i-menu", "i-external", "i-copy", "i-check", "i-warning"])
    assert.ok(symbols.includes(name), name);
  assert.equal((svg.match(/<symbol /g) || []).length, symbols.length, "every symbol is on the 20px grid");
});
