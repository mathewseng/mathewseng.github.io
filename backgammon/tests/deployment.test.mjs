import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
test("assembled site publishes the exact Backgammon solver exception and all engine assets", () => {
  const site = mkdtempSync(join(tmpdir(), "bg-site-"));
  try {
    execFileSync("sh", ["scripts/assemble-site.sh", site]);
    for (const route of [
      "",
      "play/",
      "trainer/",
      "solver/",
      "library/",
      "refresh/",
    ])
      assert.ok(
        existsSync(join(site, "backgammon", route, "index.html")),
        route,
      );
    for (const file of [
      "engine/vendor/gnubg-core-module.js",
      "engine/vendor/gnubg-core-module.wasm",
      "engine/vendor/gnubg-core-module.data",
      "engine/worker.mjs",
      "engine/source/gnubg-core-955555c-bg1.tar.gz",
      "licenses/GPL-3.0.txt",
      "core/rules.mjs",
      "ui/board.mjs",
      "styles.css",
      "data/exercises.json",
    ])
      assert.ok(existsSync(join(site, "backgammon", file)), file);
    for (const path of [
      "blackjack/strategy/solver",
      "backgammon/tests",
      "backgammon/test-results",
      "backgammon/scripts",
      "scripts",
      "jazz-piano-ml",
    ])
      assert.equal(existsSync(join(site, path)), false, path);
    assert.ok(existsSync(join(site, "shared/peer-room.js")));
    const manifest = { self: {} };
    runInNewContext(
      readFileSync(join(site, "backgammon/offline-manifest.js"), "utf8"),
      manifest,
    );
    for (const file of [
      ...manifest.self.BG_SHELL,
      ...manifest.self.BG_ENGINE,
    ]) {
      assert.ok(
        existsSync(join(site, file)),
        `Offline asset is published: ${file}`,
      );
      assert.doesNotMatch(file, /\/(?:test-results|tests|scripts|docs)\//);
      assert.ok(
        !file.startsWith("/backgammon/refresh/"),
        "Recovery stays outside the offline cache",
      );
    }
    for (const file of manifest.self.BG_ENGINE) {
      assert.equal(
        manifest.self.BG_ENGINE_DIGESTS[file],
        createHash("sha256")
          .update(readFileSync(join(site, file)))
          .digest("hex"),
      );
    }
    assert.match(
      readFileSync(join(site, "index.html"), "utf8"),
      /href="\/backgammon\/"/,
    );
  } finally {
    rmSync(site, { recursive: true, force: true });
  }
});
