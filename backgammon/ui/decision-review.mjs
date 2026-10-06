// SPDX-License-Identifier: GPL-3.0-or-later
import { el, button, dialog } from "./shell.mjs";
import { Board } from "./board.mjs";
import { settings } from "../core/storage.mjs";
import { applyStep, notation, playerName } from "../core/rules.mjs";
import { decisionFeedback } from "../core/decision-feedback.mjs";
import { equity, percentage } from "./analysis.mjs";

// A separate instance of the shared renderer: previews cannot touch the live
// DraftBoard. The caller owns analysis cancellation and stale-result checks.
export function decisionReview(
  source,
  { title = "Move hint", onClose = () => {}, onUse } = {},
) {
  const slot = el("div", { class: "decision-board" });
  const body = el("div", { class: "decision-content" });
  const controls = el("div", { class: "row wrap decision-choices" });
  const caption = el("p", { class: "decision-caption", role: "status" });
  const d = dialog(
    title,
    el(
      "div",
      { class: "decision-layout" },
      el("div", { class: "decision-position" }, slot, controls, caption),
      body,
    ),
  );
  d.classList.add("decision-dialog");
  const board = new Board(slot);
  const show = (steps, label, animate = false) => {
    const after = steps.reduce((s, step) => applyStep(s, step), source);
    board.render(after, {
      ...settings(),
      interactive: false,
      preview: true,
      usedDice: steps.map((s) => s.die),
    });
    if (animate) board.playTurn(source, steps);
    caption.textContent = `${label} · ${steps.length ? notation(steps, source.turn) : label === "Position" ? "original roll" : "Pass"}`;
    controls
      .querySelectorAll("button")
      .forEach((b) => b.setAttribute("aria-pressed", b.textContent === label));
  };
  show([], "Position");
  d.addEventListener(
    "close",
    () => {
      board.destroy();
      onClose();
    },
    { once: true },
  );
  return {
    dialog: d,
    loading(status, preset) {
      controls.replaceChildren();
      show([], "Position");
      body.replaceChildren(
        el("h3", {}, "Finding the best turn…"),
        status,
        el(
          "p",
          { class: "muted small" },
          `${preset} analysis uses the whole original roll. Your draft stays saved.`,
        ),
        button("Cancel hint", () => d.close()),
      );
    },
    error(error, retry) {
      body.replaceChildren(
        el("p", { class: "notice", role: "alert" }, error.message),
        el(
          "p",
          { class: "muted small" },
          "Your draft is unchanged. Close this view to keep playing.",
        ),
        button("Retry hint", retry, "primary"),
      );
    },
    result(result) {
      const best = result.candidates[0];
      const choices = [
        ["Position", null],
        ["Best move", best],
      ];
      if (result.actual) choices.push(["Your move", result.actual]);
      controls.replaceChildren(
        ...choices.map(([label, c]) =>
          button(label, () => show(c?.steps || [], label, !!c), "", {
            "aria-pressed": false,
          }),
        ),
      );
      body.replaceChildren(
        el("h3", {}, "Best evaluated move"),
        el(
          "p",
          { class: "decision-best", "data-best-move": "" },
          best.notation,
        ),
        el(
          "p",
          { class: "muted small" },
          `${result.settings.name} · ${result.settings.plies} ply · ${playerName(source.turn)}’s perspective`,
        ),
      );
      if (result.actual) {
        const f = decisionFeedback(result);
        body.append(
          el("p", { class: "decision-loss" }, `${f.label} ${f.value}`),
          el(
            "p",
            { class: "muted small" },
            `${f.units}${f.matchChanceLoss === null ? "" : ` · ${f.matchChanceLoss.toFixed(2)} percentage points of match-winning chance`}. Estimated difference at this setting.`,
          ),
        );
      }
      body.append(
        el(
          "p",
          { class: "small" },
          result.units === "current-cube-points"
            ? `Best equity ${equity(best.equity)} current-cube points. Multiply by cube ${source.cube.value} for session points.`
            : `Best match-winning chance ${percentage(best.mwc)}. Equity differences use normalized match equity.`,
        ),
      );
      if (onUse)
        body.append(
          button("Use best move", () => onUse(best.steps), "primary", {
            id: "use-hint",
          }),
          el(
            "p",
            { class: "muted small" },
            "Replaces your draft. Review it, then confirm on the table.",
          ),
        );
      body.append(
        el(
          "details",
          {},
          el("summary", {}, "Engine details"),
          el(
            "p",
            { class: "muted small" },
            `${result.engine} · ${(result.elapsedMs / 1000).toFixed(2)} s computation${result.cached ? " · cached" : ""}. ${result.candidates.length} legal resulting positions evaluated; small differences are estimates.`,
          ),
        ),
      );
      show(best.steps, "Best move", true);
    },
  };
}
