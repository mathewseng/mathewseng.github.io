// SPDX-License-Identifier: GPL-3.0-or-later
export const ENGINE_VERSION =
  "gnubg-core/955555c69adebb1d7de23abc1018074158621168+bg9";
export const PRESETS = Object.freeze({
  quick: {
    name: "Quick",
    plies: 0,
    cubeful: true,
    pruning: true,
    deterministic: true,
    noise: 0,
  },
  standard: {
    name: "Standard",
    plies: 1,
    cubeful: true,
    pruning: true,
    deterministic: true,
    noise: 0,
  },
  deep: {
    name: "Deep",
    plies: 2,
    cubeful: true,
    pruning: true,
    deterministic: true,
    noise: 0,
  },
  expert: {
    name: "Expert",
    plies: 3,
    cubeful: true,
    pruning: true,
    deterministic: true,
    noise: 0,
    finalists: 8,
    threshold: 0.08,
  },
  research: {
    name: "Research",
    plies: 4,
    cubeful: true,
    pruning: true,
    deterministic: true,
    noise: 0,
    finalists: 4,
    threshold: 0.04,
  },
  verify: {
    name: "Verify · unpruned",
    plies: 4,
    cubeful: true,
    pruning: false,
    deterministic: true,
    noise: 0,
    finalists: 4,
    threshold: 0.04,
    requires: "unprunedChecker",
  },
});
export const CAPABILITIES = {
  checker: true,
  arbitraryMove: true,
  cube: true,
  match: true,
  jacoby: true,
  beavers: true,
  raccoons: true,
  automaticDoubles: true,
  rollouts: true,
  rolloutPolicies: ["basic", "balanced", "strong", "short-deep"],
  threads: 1,
  maximumPlies: 4,
};

// Shared labels keep Play, hints and Solver explicit about fixed vs adaptive work.
export const SEARCH_OPTIONS = Object.freeze([
  ["auto", "Auto · adaptive, 3–4 ply"],
  ...Object.entries(PRESETS).map(([key, value]) => [key,
    `Fixed ${value.plies} ply · ${value.name}`]),
]);
export const searchName = key => key === "auto" ? "Auto · adaptive" : PRESETS[key]?.name || "Auto";
export const SEARCH_DESCRIPTION = "Auto completes at least 3 ply. Checker searches may reach 4 when a conservative cost estimate allows it; cube decisions stop at 3 because warm-cache timings cannot reliably predict their 4-ply cost. Deeper work stops above a 5-second estimate or for a substantial, stable lead. Fixed depths do not adapt. Verify independently rescans Research's 4-ply checker finalists without internal pruning; it is slower and does not establish XG accuracy. Its cube analysis uses Research's normal pruning. Matching money/Jacoby/beaver-on positions can use explicitly attributed published XG references. Other compatible book positions use stored 5-ply openings/replies or historical 3-ply later turns (except Fixed 4 and Verify). Historical filtered rollout-book estimates are retired following a checker-selection correction. The result identifies its method and sampling uncertainty.";
