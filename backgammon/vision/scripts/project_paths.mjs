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
export const visionStateDir = path.resolve(process.env.OFFICE3_VISION_STATE_DIR || path.join(artifactDir, 'v2', 'state'));
export const solverDir = path.join(artifactDir, "site-solver");
export const solverUrl = (modulePath) => pathToFileURL(path.join(solverDir, modulePath));

export const replayDir = path.resolve(process.env.OFFICE3_REPLAY_DIR || path.join(artifactDir, "v4-4ply"));
