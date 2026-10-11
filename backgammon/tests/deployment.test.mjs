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
      "reports/",
      "controls/",
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
      "engine/vendor/simd/gnubg-core-module.js",
      "engine/vendor/simd/gnubg-core-module.wasm",
      "engine/backend.mjs",
      "engine/worker.mjs",
      "engine/source/gnubg-core-955555c-bg1.tar.gz",
      "engine/source/gnubg-core-955555c-bg2.tar.gz",
      "engine/source/gnubg-core-955555c-bg4.tar.gz",
      "engine/source/gnubg-core-955555c-bg5.tar.gz",
      "data/speed-report.json",
      "data/native-benchmark.json",
      "data/accuracy-report.json",
      "data/native-validation.json",
      "licenses/GPL-3.0.txt",
      "core/rules.mjs",
      "ui/board.mjs",
      "ui/touch-moves.mjs",
      "ui/updates.mjs",
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
    assert.ok(
      readFileSync(join(site, "backgammon/sw.js"), "utf8").includes(
        `importScripts("./offline-manifest.js?v=${manifest.self.BG_CACHE_VERSION}");`,
      ),
      "Each release changes the worker bytes and versions its imported manifest",
    );
    const releaseHash = createHash("sha256")
      .update("backgammon-offline-v2\0")
      .update(
        readFileSync(join(site, "backgammon/sw.js"), "utf8").replace(
          /importScripts\("\.\/offline-manifest\.js\?v=[a-z0-9]+"\);/,
          'importScripts("./offline-manifest.js?v=generated");',
        ),
      );
    for (const file of [...manifest.self.BG_SHELL, ...manifest.self.BG_ENGINE]
      .filter((file) => file.startsWith("/backgammon/"))
      .sort()) {
      const source = readFileSync(join(site, file));
      releaseHash
        .update(file.slice("/backgammon/".length))
        .update(
          file.endsWith(".html")
            ? source.toString().replace(/\?bgv=[a-z0-9]+(?=")/g, "")
            : source,
        );
      if (file.endsWith(".html"))
        assert.ok(
          source
            .toString()
            .includes(`styles.css?bgv=${manifest.self.BG_CACHE_VERSION}`),
          `${file} invalidates the browser's stylesheet cache`,
        );
    }
    for (const file of ["hub.css", "hub.js", "peer-room.js"])
      releaseHash.update(file).update(readFileSync(join(site, "shared", file)));
    assert.equal(
      releaseHash.digest("hex").slice(0, 16),
      manifest.self.BG_CACHE_VERSION,
      "Generated worker/manifest revision matches every shipped shell and engine file",
    );
    assert.match(
      readFileSync(join(site, "backgammon/index.html"), "utf8"),
      /href="\/backgammon\/refresh\/">Refresh app<\/a>/,
      "Hub includes the network-only recovery link",
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
      assert.doesNotMatch(
        file,
        /\/\./,
        "Hidden local metadata never enters offline caches",
      );
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
