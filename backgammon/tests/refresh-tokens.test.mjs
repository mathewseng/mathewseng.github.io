import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BLOCK,
  REFRESH_TOKENS,
  refreshTokenLines,
  writeRefreshTokens,
} from "../scripts/refresh-tokens.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("refresh page token values match shared/tokens.css", () => {
  const page = read("../refresh/index.html"),
    tokens = read("../../shared/tokens.css");
  const block = page.match(BLOCK);
  assert.ok(block, "refresh/index.html keeps the generated:tokens block");
  assert.equal(
    writeRefreshTokens(page, tokens),
    page,
    "refresh/index.html is regenerated: run node backgammon/scripts/offline-manifest.mjs",
  );
  assert.equal(refreshTokenLines(tokens).split("\n").length, REFRESH_TOKENS.length);
  // Every custom property the page reads is one the generated block defines.
  const defined = new Set(REFRESH_TOKENS.map(([name]) => name));
  for (const [, name] of page.matchAll(/var\((--[a-z0-9-]+)/g))
    assert.ok(defined.has(name), `refresh/index.html reads ${name}, which is not generated`);
});
