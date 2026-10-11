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
    this.quick = document.createElement("div");
    this.quick.className = "touch-destinations";
    this.quick.hidden = true;
    this.quick.setAttribute("role", "group");
    this.quick.setAttribute("aria-label", "Quick destinations");
    this.heading = document.createElement("span");
    this.heading.className = "touch-destinations-heading";
    this.targets = document.createElement("div");
    this.targets.className = "touch-destination-buttons";
    this.quick.append(this.heading, this.targets);
    this.targets.addEventListener("click", event => {
      const target = event.target.closest("button[data-destination]");
      if (!target || !this.targets.contains(target)) return;
      const keyboard = event.detail === 0;
      selectDestination(this.decode(target.dataset.destination));
      // A move can replace this button or hide the whole tray. Return keyboard
      // users to the stable picker; touch users keep their current scroll.
      if (keyboard && !document.querySelector("dialog[open]"))
        this.source.focus({ preventScroll: true });
    });
    this.element.append(this.source, this.destination);
    container.append(this.quick, this.element);
  }
  decode(value) {
    return value === "" ? null : /^\d+$/.test(value) ? Number(value) : value;
  }
  update({ enabled, hints, selected, sources, routes, orientation }) {
    this.element.hidden = !enabled || !hints || !sources.length;
    this.quick.hidden = this.element.hidden || selected === null || !routes.length;
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
    this.heading.textContent = selected === null ? "" : `From ${label(selected)} · tap a destination`;
    // This is the same destination map as the picker and board. Never guess a
    // die or choose a different route just to make a larger touch target.
    const signature = JSON.stringify([selected, orientation, [...destinations]]);
    if (this.quick.dataset.options !== signature) {
      this.targets.replaceChildren(...[...destinations].map(([point, kind]) => {
        const target = document.createElement("button");
        target.type = "button";
        target.dataset.destination = String(point);
        target.dataset.kind = kind;
        const action = kind === "return" ? "Return" : kind === "revise" ? "Revise" : "Move";
        const mark = kind === "return" ? "↶" : kind === "revise" ? "↔" : "→";
        target.textContent = `${mark} ${label(point)}`;
        target.setAttribute("aria-label", `${action} checker from ${label(selected)} to ${label(point)}`);
        target.title = `${action} to ${label(point)}`;
        return target;
      }));
      this.quick.dataset.options = signature;
    }
  }
}
