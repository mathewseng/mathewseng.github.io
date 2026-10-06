// SPDX-License-Identifier: GPL-3.0-or-later
import { el, button, dialog } from "./shell.mjs";
import { Board } from "./board.mjs";
import { settings } from "../core/storage.mjs";
import {
  applyStep,
  notation,
  playerName,
  transition,
  decisionPlayer,
} from "../core/rules.mjs";
import { decisionFeedback } from "../core/decision-feedback.mjs";
import { decisionValues, lossLegend } from "./decision-values.mjs";
import { equity, percentage } from "./analysis.mjs";

// A separate instance of the shared renderer: previews cannot touch the live
// DraftBoard. The caller owns analysis cancellation and stale-result checks.
export function decisionReview(
  source,
  {
    title = "Move hint",
    onClose = () => {},
    onUse,
    onReplay,
    replayDescription = "Rewinds this turn and any bot reply, then plays the best move. Already rolled dice are preserved.",
  } = {},
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
  const views = el("div", {
    class: "row decision-tabs",
    "aria-label": "Review view",
  });
  const notes = el("div", { class: "decision-notes", hidden: true });
  const layout = d.querySelector(".decision-layout");
  layout.append(notes);
  let explicitView = false,
    hintResult = false;
  const narrow = matchMedia("(max-width: 700px)");
  const setView = (view) => {
    d.dataset.reviewView = view;
    notes.hidden = view !== "notes";
    views
      .querySelectorAll("button")
      .forEach((b) =>
        b.setAttribute("aria-pressed", b.dataset.view === view),
      );
  };
  for (const [view, label] of [
    ["board", "Board"],
    ["decision", "Comparison"],
    ["notes", "Details"],
  ])
    views.append(
      button(
        label,
        () => {
          explicitView = true;
          setView(view);
        },
        "",
        {
          "data-view": view,
          disabled: view === "notes",
        },
      ),
    );
  d.querySelector(".dialog-header").after(views);
  setView("decision");
  const defaultView = () => {
    if (!explicitView)
      setView(narrow.matches && hintResult ? "board" : "decision");
  };
  narrow.addEventListener("change", defaultView);
  d.addEventListener(
    "close",
    () => narrow.removeEventListener("change", defaultView),
    { once: true },
  );
  const paginateNotes = () => {
    views.querySelector('[data-view="notes"]').disabled = false;
    const pages = [...body.querySelectorAll(".decision-values > p")];
    pages.push(
      ...[...body.children].filter(
        (n) =>
          n.tagName === "DETAILS" ||
          n.classList.contains("list") ||
          (n.tagName === "P" &&
            n.classList.contains("muted") &&
            !n.textContent.includes("ply ·")),
      ),
    );
    for (const node of pages) node.remove();
    const content = el("div", { class: "review-note" });
    const count = el("span", {
      class: "muted small",
      "aria-live": "polite",
    });
    let index = 0;
    const update = () => {
      const note = pages[index];
      if (note?.tagName === "DETAILS") note.open = true;
      content.replaceChildren(
        ...(note ? [note] : [el("p", {}, "No additional details.")]),
      );
      count.textContent = `${index + 1} / ${Math.max(1, pages.length)}`;
      prev.disabled = index === 0;
      next.disabled = index >= pages.length - 1;
    };
    const prev = button("Previous", () => {
      index--;
      update();
    });
    const next = button("Next", () => {
      index++;
      update();
    });
    notes.replaceChildren(
      el("h3", {}, "How to read this result"),
      content,
      el("div", { class: "row spread" }, prev, count, next),
    );
    update();
  };

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
      .forEach((b) =>
        b.setAttribute("aria-pressed", b.textContent === label),
      );
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
      hintResult = result.type !== "cube" && !result.actual;
      defaultView();
      if (result.type === "cube") {
        const f = decisionFeedback(result, source);
        const showCube = (choice, label) => {
          const state =
            !choice || choice.action === "roll"
              ? source
              : transition(
                  source,
                  { type: choice.action },
                  decisionPlayer(source),
                );
          board.render(state, {
            ...settings(),
            interactive: false,
            preview: true,
          });
          caption.textContent = `${label}${choice ? ` · ${choice.notation}` : " · original cube position"}`;
          controls
            .querySelectorAll("button")
            .forEach((b) =>
              b.setAttribute("aria-pressed", b.textContent === label),
            );
        };
        controls.replaceChildren(
          ...[
            ["Position", null],
            ["Best decision", f.best],
            ["Your decision", f.actual],
          ].map(([label, c]) =>
            button(label, () => showCube(c, label), "", {
              "aria-pressed": false,
            }),
          ),
        );
        body.replaceChildren(
          el("h3", {}, "Best evaluated decision"),
          el(
            "p",
            { class: "decision-best", "data-best-move": "" },
            f.best.notation,
          ),
          el(
            "p",
            { class: "muted small" },
            `${result.settings.name} · ${result.settings.plies} ply · ${playerName(f.perspective)}’s decision perspective`,
          ),
          el(
            "p",
            { class: "decision-loss", "data-loss-tone": f.tone },
            `${f.label} ${f.value} · ${f.label === "EV lost" ? f.units : "normalized match equity"}`,
          ),
          decisionValues(f),
          lossLegend(),
          el(
            "p",
            { class: "muted small" },
            "Cube offers use the opponent’s best evaluated reply. Values stay in the original cube units, even after a take or immediate redouble.",
          ),
          el(
            "div",
            { class: "list" },
            ...result.decision.choices.map((c) =>
              el(
                "div",
                { class: "list-row row spread" },
                el("span", {}, c.notation),
                el("strong", {}, equity(c.equity)),
              ),
            ),
          ),
          el(
            "p",
            { class: "muted small" },
            `${result.engine} · ${(result.elapsedMs / 1000).toFixed(2)} s. Evaluation estimates, not rollouts.`,
          ),
        );
        paginateNotes();
        showCube(null, "Position");
        return;
      }
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
        const f = decisionFeedback(result, source);
        body.append(
          el(
            "p",
            { class: "decision-loss", "data-loss-tone": f.tone },
            `${f.label} ${f.value} · ${f.label === "EV lost" ? f.units : "normalized match equity"}`,
          ),
          decisionValues(f),
          lossLegend(),
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
      const footer = d.querySelector("footer");
      footer.replaceChildren();
      if (onReplay) {
        const replay = button(
          "Undo & play best",
          async () => {
            if (replay.disabled) return;
            replay.disabled = true;
            try {
              await onReplay(best.steps, result);
              d.close();
            } finally {
              replay.disabled = false;
            }
          },
          "primary",
          { id: "undo-play-best", title: replayDescription },
        );
        footer.append(replay);
        body.append(el("p", { class: "muted small" }, replayDescription));
      }
      if (onUse)
        footer.prepend(
          button("Use best move", () => onUse(best.steps), "", {
            id: "use-hint",
            title:
              "Replaces your draft. Review it, then confirm on the table.",
          }),
        );
      body.append(
        el(
          "details",
          {},
          el("summary", {}, "Engine details"),
          el(
            "p",
            { class: "muted small" },
            `${result.engine} · ${(result.elapsedMs / 1000).toFixed(2)} s computation${result.cached ? " · cached" : ""}. ${result.evaluatedCount ?? result.candidates.length} legal resulting positions evaluated; small differences are estimates.`,
          ),
        ),
      );
      paginateNotes();
      show(best.steps, "Best move", true);
    },
  };
}
