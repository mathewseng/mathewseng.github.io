// Runs every *.test.cjs and *.test.mjs file in the site with node --test.
// gym/ has its own Vitest suite and jazz-piano-ml/ uses pytest, so both are skipped.
import { execFileSync, spawnSync } from "node:child_process";

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "*.test.cjs", "*.test.mjs"],
  { encoding: "utf8" },
)
  .split("\n")
  .filter((file) => file && !file.startsWith("gym/") && !file.startsWith("jazz-piano-ml/"));

const { status } = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(status ?? 1);
