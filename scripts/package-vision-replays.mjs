import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const vision = join(process.argv[2] || "_site", "backgammon", "vision");
const html = readFileSync(join(vision, "index.html"), "utf8");
const download = html.match(/<a\b[^>]*\bid="download-replay"[^>]*>/)?.[0];
const source = download?.match(/\bhref="https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/releases\/download\/([\w.-]+)\/(game-01-analysis\.mp4)"/);
if (!source) throw new Error("Could not find the published Backgammon replay release");

const [, repository, release, firstGame] = source;
const mediaPath = `media/${release}`;
const player = html.match(/<video\b[^>]*\bid="replay"[^>]*>/)?.[0];
if (!player?.includes(`src="${mediaPath}/${firstGame}"`)) {
  throw new Error("The Backgammon video source and download link refer to different releases");
}
const games = [...html.matchAll(/\bdata-game="([1-9]\d*)"/g)];
if (!games.length) throw new Error("Could not find the Backgammon replay games");
const assets = games.map(([, game]) => `game-${game.padStart(2, "0")}-analysis.mp4`);
const destination = join(vision, mediaPath);
mkdirSync(destination, { recursive: true });
execFileSync("gh", ["release", "download", release, "--repo", repository, "--dir", destination,
  ...assets.flatMap(asset => ["--pattern", asset])], { stdio: "inherit" });

for (const asset of assets) {
  if (!statSync(join(destination, asset)).size) throw new Error(`Empty Backgammon replay file: ${asset}`);
}
