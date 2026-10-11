// SPDX-License-Identifier: GPL-3.0-or-later
import { el, button, openPanel } from "./shell.mjs";
import { equity, percentage } from "./analysis.mjs";
import { boardKey } from "../core/rules.mjs";

// Keep previews beside the board on phones. These are the same evaluated
// candidates used by the full results panel; choosing one never edits a game.
export class StudyStrip {
  constructor(onPreview) {
    this.onPreview = onPreview;
    this.candidates = [];
    this.select = el("select", {
      "aria-label": "Preview evaluated move",
      onChange: () => this.choose(Number(this.select.value)),
    });
    this.previous = button("←", () => this.choose(Number(this.select.value) - 1), "", {
      "aria-label": "Previous move preview",
    });
    this.next = button("→", () => this.choose(Number(this.select.value) + 1), "", {
      "aria-label": "Next move preview",
    });
    this.heading = el("strong");
    this.value = el("span", { class: "study-preview-value", role: "status" });
    this.chooser = el("div", { class: "study-preview-controls" }, this.previous, this.select, this.next);
    this.details = button("Compare cube options", () => openPanel(), "ghost");
    this.node = el("section", { class: "study-strip", hidden: true, "aria-label": "Position review" },
      el("div", { class: "study-strip-heading" }, this.heading),
      this.chooser, this.value, this.details);
    document.querySelector(".action-area").prepend(this.node);
  }
  choose(index) {
    if (index < -1 || index >= this.candidates.length) return;
    this.onPreview(index === -1 ? null : this.candidates[index]);
  }
  set(result, preview) {
    this.node.hidden = !result;
    if (!result) { this.result = null; return; }
    const isChecker = result.type === "checker";
    this.chooser.hidden = !isChecker;
    this.details.hidden = isChecker;
    const units = result.units === "current-cube-points" ? "equity" : "match win";
    const previewKey = preview ? boardKey(preview) : null;
    const candidates = (result.candidates || []).slice(0, 10);
    for (const extra of [result.actual, result.candidates?.find(c => c.key === previewKey)])
      if (extra && !candidates.some(c => c.key === extra.key)) candidates.push(extra);
    if (this.result !== result || this.candidates.map(c => c.key).join("|") !== candidates.map(c => c.key).join("|")) {
      this.candidates = candidates;
      this.select.replaceChildren(el("option", { value: -1 }, "Original position"),
        ...this.candidates.map((c, i) => el("option", { value: i },
          `${result.candidates.indexOf(c) + 1 || "Played"}. ${c.notation}${c.key === result.actual?.key ? " · played" : ""}`)));
      this.result = result;
    }
    const chosen = preview ? this.candidates.findIndex(c => c.key === previewKey) : -1;
    this.select.value = String(chosen);
    this.previous.disabled = chosen < 0;
    this.next.disabled = chosen >= this.candidates.length - 1;
    if (isChecker) {
      this.heading.textContent = `${result.settings.name} · move previews`;
      const candidate = this.candidates[Math.max(0, chosen)];
      const value = candidate?.mwc == null ? equity(candidate?.equity ?? 0) : percentage(candidate.mwc);
      this.value.textContent = candidate
        ? `${chosen < 0 ? "Best: " + candidate.notation + " · " : ""}${value} ${units}${chosen > 0 ? " · Δ " + equity(candidate.equity - result.candidates[0].equity) : ""}`
        : "No checker moves available.";
    } else {
      const name = { roll: "No double", double: "Double", take: "Take", pass: "Pass", beaver: "Beaver", raccoon: "Raccoon" };
      this.heading.textContent = result.available === false ? "Cube unavailable" : `Best: ${name[result.action] || result.action}`;
      this.value.textContent = `${result.settings.name} · ${result.mwc == null ? equity(result.equity) : percentage(result.mwc)} ${units}`;
    }
  }
}

export function closeStudyPanel() {
  // A preview selected in the phone drawer should reveal the board, not hide
  // the outcome behind that drawer. Desktop keeps its in-place inspector.
  if (matchMedia("(max-width: 820px), (max-height: 500px)").matches)
    document.getElementById("details-dialog")?.close();
}
