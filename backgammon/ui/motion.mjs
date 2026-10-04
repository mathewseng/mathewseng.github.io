// SPDX-License-Identifier: GPL-3.0-or-later
export function reducedMotion() {
  return (
    document.documentElement.dataset.motion === "reduce" ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
