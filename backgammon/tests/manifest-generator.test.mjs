import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
test("offline release generation ignores macOS metadata excluded by deployment", () => {
  const root = mkdtempSync(join(tmpdir(), "bg-manifest-")),
    base = join(root, "backgammon");
  try {
    for (const dir of [
      "backgammon/scripts",
      "backgammon/core",
      "backgammon/engine/vendor",
      "shared",
    ])
      mkdirSync(join(root, dir), { recursive: true });
    copyFileSync(
      new URL("../scripts/offline-manifest.mjs", import.meta.url),
      join(base, "scripts/offline-manifest.mjs"),
    );
    writeFileSync(
      join(base, "sw.js"),
      'importScripts("./offline-manifest.js?v=initial");',
    );
    writeFileSync(join(base, "index.html"), '<script src="app.js"></script>');
    writeFileSync(join(base, "app.js"), "export const app = 1;");
    writeFileSync(
      join(base, "engine/vendor/core.wasm"),
      new Uint8Array([0, 97, 115, 109]),
    );
    for (const name of ["hub.css", "hub.js", "peer-room.js"])
      writeFileSync(join(root, "shared", name), "");
    const generate = () =>
      execFileSync(process.execPath, [
        join(base, "scripts/offline-manifest.mjs"),
      ]);
    generate();
    const before = readFileSync(join(base, "offline-manifest.js"), "utf8");
    writeFileSync(join(base, ".DS_Store"), "finder metadata");
    writeFileSync(join(base, "core/.DS_Store"), "nested finder metadata");
    generate();
    assert.equal(
      readFileSync(join(base, "offline-manifest.js"), "utf8"),
      before,
    );
    assert.doesNotMatch(before, /DS_Store/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
