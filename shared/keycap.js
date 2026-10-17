// Shared keycap drawing, promoted from backgammon/ui/keycap.mjs: one SVG
// keycap for HTML controls (a <kbd class="keycap"> badge inside a button) and
// for labels drawn inside an SVG board. Size is presentation only; styles are
// .keycap, .keycap-face, .keycap-edge and .keycap-label in shared/app.css.
//
// Classic script: exposes window.Keycap (and module.exports in Node).
//
//   button.append(Keycap.keycap("Space"));                 // <kbd class="keycap"><svg>…</svg></kbd>
//   svg.append(Keycap.keycapGraphic("R", { x: 40, y: 8, height: 16 }));
//   Keycap.keyLabel("r")                                   // "R"
(function (root) {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";

  const keyLabel = (key) => (key === "Space" ? "Space" : String(key).toUpperCase());

  function node(tag, attrs, text) {
    const element = root.document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function keycapWidth(label) {
    return Math.max(20, 10 + label.length * 7);
  }

  // An SVG <g> drawing of the key, centred on x and starting at y, scaled to
  // `height` (20 units tall by design) and never wider than maxWidth.
  function keycapGraphic(key, { x = 0, y = 0, height = 20, maxWidth = Infinity, className = "" } = {}) {
    const label = keyLabel(key);
    const width = keycapWidth(label);
    const scale = Math.min(height / 20, maxWidth / width);
    const graphic = node("g", {
      class: ("keycap-art " + className).trim(),
      transform: "translate(" + (x - (width * scale) / 2) + " " + y + ") scale(" + scale + ")",
      "aria-hidden": "true",
      "pointer-events": "none",
    });
    graphic.append(
      node("rect", { x: 0.5, y: 0.5, width: width - 1, height: 19, rx: 4, class: "keycap-face" }),
      node("path", { d: "M4 17.5H" + (width - 4), class: "keycap-edge" }),
      node("text", { x: width / 2, y: 13.5, "text-anchor": "middle", class: "keycap-label" }, label),
    );
    return graphic;
  }

  // A <kbd class="keycap"> badge for HTML controls; aria-hidden because the
  // control's own label or title names the shortcut.
  function keycap(key) {
    const width = keycapWidth(keyLabel(key));
    const badge = root.document.createElement("kbd");
    badge.className = "keycap";
    badge.setAttribute("aria-hidden", "true");
    const graphic = node("svg", { viewBox: "0 0 " + width + " 20", width, height: 20, focusable: "false" });
    graphic.append(keycapGraphic(key, { x: width / 2 }));
    badge.append(graphic);
    return badge;
  }

  const api = { keyLabel, keycapGraphic, keycap };
  root.Keycap = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
