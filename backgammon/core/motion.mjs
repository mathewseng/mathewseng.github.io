// SPDX-License-Identifier: GPL-3.0-or-later
// The slider scales presentation time: zero is instant, one keeps the original
// pace, and moving right gives each animation more time. Game state is unchanged.
export function normalizeMotionScale(value, legacyMotion = "system") {
  if (legacyMotion === "reduce") return 0;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(3, Math.max(0, value))
    : 1;
}
