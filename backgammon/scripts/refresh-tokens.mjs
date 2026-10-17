// The recovery page (refresh/index.html) must work when cached app files are
// stale, so it links nothing from shared/ and carries its own copy of the
// design tokens it uses. That copy is generated from shared/tokens.css:
// scripts/offline-manifest.mjs rewrites the marked block, and
// tests/refresh-tokens.test.mjs fails when the two drift apart.

// [name on the refresh page, name in shared/tokens.css]
export const REFRESH_TOKENS = [
  ["--page", "--page"],
  ["--surface", "--surface"],
  ["--surface-2", "--surface-2"],
  ["--line-strong", "--line-strong"],
  ["--ink", "--ink"],
  ["--muted", "--muted"],
  ["--accent", "--family-backgammon"],
  ["--on-accent", "--on-accent"],
  ["--bad", "--bad"],
  ["--r-sm", "--r-sm"],
  ["--t-xs", "--t-xs"],
  ["--t-sm", "--t-sm"],
  ["--t-md", "--t-md"],
  ["--font-sans", "--font-sans"],
];

export const BLOCK = /(\n([ \t]*)\/\* generated:tokens[^\n]*\*\/\n)[\s\S]*?(\n[ \t]*\/\* \/generated:tokens \*\/)/;

export function tokenValue(tokens, name) {
  const match = tokens.match(new RegExp(`(?:^|[\\s;{])${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`shared/tokens.css has no ${name}`);
  return match[1].replace(/\s+/g, " ").trim();
}

export function refreshTokenLines(tokens, indent = "") {
  return REFRESH_TOKENS.map(([local, source]) => `${indent}${local}: ${tokenValue(tokens, source)};`).join("\n");
}

// Returns the refresh page with its generated block rewritten from tokens.css.
export function writeRefreshTokens(page, tokens) {
  if (!BLOCK.test(page)) throw new Error("refresh/index.html has no generated:tokens block");
  return page.replace(BLOCK, (_, open, indent, close) => `${open}${refreshTokenLines(tokens, indent)}${close}`);
}
