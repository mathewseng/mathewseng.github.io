import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const configured = process.env.OFFICE3_ARTIFACT_DIR;
const localPath = configured?.startsWith("~/")
  ? path.join(homedir(), configured.slice(2))
  : configured;

export const artifactDir = path.resolve(
  localPath || path.join(homedir(), "Downloads", "office-3-backgammon-20261117"),
);
export const solverDir = path.join(artifactDir, "site-solver");
export const solverUrl = (modulePath) => pathToFileURL(path.join(solverDir, modulePath));
