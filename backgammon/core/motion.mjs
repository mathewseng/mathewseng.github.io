// SPDX-License-Identifier: GPL-3.0-or-later
// Speeds are displayed as playback rates; stored scales multiply duration.
export const DEFAULT_MOTION_SCALE = .5;
export const MOTION_SPEED_OPTIONS = Object.freeze([
  {label: "Instant", scale: 0},
  ...[4, 3, 2.5, 2, 1.75, 1.5, 1.25, 1, .75, .5, .25]
    .map(speed => ({label: `${speed}×`, scale: 1 / speed})),
].map(Object.freeze));
const timedScales = MOTION_SPEED_OPTIONS.slice(1).map(option => option.scale);

export function normalizeMotionScale(value, legacyMotion = "system") {
  if (legacyMotion === "reduce") return 0;
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_MOTION_SCALE;
  if (value <= 0) return 0;
  // Migrate previous continuous slider values to the nearest timed option.
  // Only an explicit zero disables animations.
  return timedScales.reduce((best, scale) =>
    Math.abs(scale - value) < Math.abs(best - value) ? scale : best, .25);
}
