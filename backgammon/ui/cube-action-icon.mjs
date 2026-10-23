// SPDX-License-Identifier: GPL-3.0-or-later
const paths = {
  double: "M5 15 15 5M5 5h10v10",
  redouble: "M3 12 10 5l7 7M3 17l7-7 7 7",
  take: "m4 10 4 4 8-8",
  drop: "m5 5 10 10M15 5 5 15",
};

export function cubeActionIcon(kind) {
  const ns = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(ns, "svg");
  for (const [name, value] of Object.entries({
    viewBox: "0 0 20 20", width: 16, height: 16,
    class: "history-action-icon", "data-cube-icon": kind,
    "aria-hidden": "true", focusable: "false", fill: "none",
    stroke: "currentColor", "stroke-width": 1.8,
    "stroke-linecap": "round", "stroke-linejoin": "round",
  })) icon.setAttribute(name, value);
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", paths[kind]);
  icon.append(path);
  return icon;
}
