// SPDX-License-Identifier: GPL-3.0-or-later
// Large-target alternative to the board. This is a view of DraftBoard, not a
// second move controller: legality, route choices and revisions stay shared.
export class TouchMoves {
  constructor(container, { selectSource, selectDestination }) {
    this.element = document.createElement("div");
    this.element.className = "touch-moves";
    this.element.hidden = true;
    this.element.setAttribute("role", "group");
    this.element.setAttribute("aria-label", "Touch move controls");
    this.source = document.createElement("select");
    this.source.setAttribute("aria-label", "Select a checker");
    this.destination = document.createElement("select");
    this.destination.setAttribute("aria-label", "Move selected checker");
    this.source.addEventListener("change", () => selectSource(this.decode(this.source.value)));
    this.destination.addEventListener("change", () => {
      const value = this.destination.value;
      // A route dialog may leave the draft unchanged. Reset the input so the
      // same destination can be chosen again after dismissing that dialog.
      this.destination.value = "";
      if (value !== "") selectDestination(this.decode(value));
    });
    this.element.append(this.source, this.destination);
    container.append(this.element);
  }
  decode(value) {
    return value === "" ? null : /^\d+$/.test(value) ? Number(value) : value;
  }
  update({ enabled, hints, selected, sources, routes, orientation }) {
    this.element.hidden = !enabled || !hints || !sources.length;
    if (this.element.hidden) return;
    const label = p => p === "bar" ? "Bar" : p === "off" ? "Off" : String(orientation ? 24 - p : p + 1);
    const options = (node, entries, value) => {
      // Keep the select itself mounted: native picker focus survives rerenders.
      const signature = JSON.stringify(entries);
      if (node.dataset.options !== signature) {
        node.replaceChildren(...entries.map(([value, text]) => new Option(text, String(value))));
        node.dataset.options = signature;
      }
      node.value = value === null ? "" : String(value);
    };
    options(this.source, [["", "From…"], ...sources.map(p => [p, `From ${label(p)}`])], selected);
    const destinations = new Map();
    for (const route of routes) {
      const kind = route.undo ? "return" : route.switchDie ? "revise" : "move";
      const current = destinations.get(route.to);
      // Forward/revision choices take precedence over an undo label, matching
      // the board's resolver when more than one action reaches this location.
      if (!current || current === "return") destinations.set(route.to, kind);
    }
    options(this.destination, [["", "To…"], ...[...destinations].map(([p, kind]) => [
      p, `To ${label(p)}${kind === "return" ? " · return" : kind === "revise" ? " · revise" : ""}`,
    ])], null);
    this.destination.disabled = selected === null || !destinations.size;
  }
}
