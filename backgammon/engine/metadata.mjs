// SPDX-License-Identifier: GPL-3.0-or-later
export const ENGINE_VERSION =
  "gnubg-core/955555c69adebb1d7de23abc1018074158621168+bg1";
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
});
export const CAPABILITIES = {
  checker: true,
  arbitraryMove: true,
  cube: true,
  match: true,
  rollouts: false,
  threads: 1,
  maximumPlies: 2,
};
