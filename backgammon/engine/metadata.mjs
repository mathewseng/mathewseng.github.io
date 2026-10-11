// SPDX-License-Identifier: GPL-3.0-or-later
export const ENGINE_VERSION =
  "gnubg-core/955555c69adebb1d7de23abc1018074158621168+bg4";
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
  threads: 1,
  maximumPlies: 4,
};
