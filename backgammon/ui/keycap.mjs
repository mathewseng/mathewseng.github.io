// SPDX-License-Identifier: GPL-3.0-or-later
// One drawing for HTML controls and SVG board labels. Size is presentation only.
const NS = "http://www.w3.org/2000/svg";
export const keyLabel = key => key === "Space" ? "Space" : String(key).toUpperCase();
function node(tag, attrs, text) {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
}
export function keycapGraphic(key, { x = 0, y = 0, height = 20, maxWidth = Infinity, className = "" } = {}) {
  const label = keyLabel(key), width = Math.max(20, 10 + label.length * 7);
  const scale = Math.min(height / 20, maxWidth / width);
  const graphic = node("g", { class: `keycap-art ${className}`.trim(),
    transform: `translate(${x - width * scale / 2} ${y}) scale(${scale})`,
    "aria-hidden": "true", "pointer-events": "none" });
  graphic.append(
    node("rect", { x: .5, y: .5, width: width - 1, height: 19, rx: 4, class: "keycap-face" }),
    node("path", { d: `M4 17.5H${width - 4}`, class: "keycap-edge" }),
    node("text", { x: width / 2, y: 13.5, "text-anchor": "middle", class: "keycap-label" }, label),
  );
  return graphic;
}
export function keycap(key) {
  const width = Math.max(20, 10 + keyLabel(key).length * 7);
  const badge = document.createElement("kbd");
  badge.className = "keycap";
  badge.setAttribute("aria-hidden", "true");
  const graphic = node("svg", { viewBox: `0 0 ${width} 20`, width, height: 20, focusable: "false" });
  graphic.append(keycapGraphic(key, { x: width / 2 }));
  badge.append(graphic);
  return badge;
}
