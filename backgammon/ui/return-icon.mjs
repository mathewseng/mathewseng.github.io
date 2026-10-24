// SPDX-License-Identifier: GPL-3.0-or-later
// Shared by moved checkers and controls that restore the original position.
export const returnIconPath = (x = 0, y = 0) =>
  `M${x + 8} ${y + 7}v-7a8 8 0 0 0-16 0v2m-4-4 4 4 4-4`;

export function returnIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(ns, "svg");
  for (const [key, value] of Object.entries({
    viewBox: "-16 -16 32 32", width: 24, height: 24,
    "aria-hidden": "true", focusable: "false", class: "return-icon",
  })) icon.setAttribute(key, value);
  const path = document.createElementNS(ns, "path");
  for (const [key, value] of Object.entries({
    d: returnIconPath(), fill: "none", stroke: "currentColor",
    "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round",
  })) path.setAttribute(key, value);
  icon.append(path);
  return icon;
}
