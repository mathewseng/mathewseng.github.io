// SPDX-License-Identifier: GPL-3.0-or-later
import { presentAnalysis, compactNotation } from "../core/move-presentation.mjs";
import { el, button, dialog, saveDialog } from "./shell.mjs";
import { Board } from "./board.mjs";
import { moveTrace } from "../core/move-trace.mjs";
import { settings } from "../core/storage.mjs";
import {
  applyStep,
  playerName,
  transition,
  decisionPlayer,
  boardKey,
} from "../core/rules.mjs";
import { decisionFeedback, lossTone } from "../core/decision-feedback.mjs";
import { decisionValues, lossLegend } from "./decision-values.mjs";
import { equity, percentage } from "./analysis.mjs";
import { EngineClient } from "../engine/client.mjs";
import { PRESETS } from "../engine/metadata.mjs";

function lossSummary(feedback) {
  const units = feedback.label === "EV lost" ? feedback.units : "normalized match equity";
  return el("p", {
    class: "decision-loss", "data-loss-tone": feedback.tone,
    title: `${feedback.label} ${feedback.value} · ${units}`,
    "aria-label": `${feedback.label} ${feedback.value} · ${units}`,
  }, `${feedback.label} ${feedback.value}`, el("span", {class: "decision-loss-unit"}, ` · ${units}`));
}

// A separate instance of the shared renderer: previews cannot touch the live
// DraftBoard. Callers own live analysis; this dialog owns and cancels the
// optional worker that expands an older saved review.
export function decisionReview(
  source,
  {
    title = "Move hint",
    opponent = false,
    onClose = () => {},
    replayLabel = "Undo & play best",
    onReplay,
    onReturn,
    replayDescription = "Rewinds this turn and any bot reply, then plays the best move. Already rolled dice are preserved.",
  } = {},
) {
  const slot = el("div", { class: "decision-board" });
  const body = el("div", { class: "decision-content" });
  const controls = el("div", { class: "row wrap decision-choices", role: "group", "aria-label": "Board preview" });
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
  const appendReturn = () => {
    d.querySelector("footer").append(button("Save position", () => saveDialog(source), "", { id: "save-review-position", title: "Save this decision with its original dice and rules" }));
    if (!onReturn) return;
    const back = button(
      "Return to this position",
      async () => {
        if (back.disabled) return;
        back.disabled = true;
        try {
          await onReturn();
          d.close();
        } finally {
          back.disabled = false;
        }
      },
      "",
      {
        id: "return-position",
        title:
          "Restore the original decision and dice. The previous line stays in history.",
      },
    );
    d.querySelector("footer").append(back);
  };
  appendReturn();

  const notes = el("div", { class: "decision-notes", hidden: true });
  const layout = d.querySelector(".decision-layout");
  layout.append(notes);
  let moveListResize = () => {}, revealSelectedMove = () => {};
  const resizeMoves = () => moveListResize();
  window.addEventListener("resize", resizeMoves);
  d.addEventListener(
    "close",
    () => window.removeEventListener("resize", resizeMoves),
    { once: true },
  );
  const detailToggle = button("Details", () => {
    setView(d.dataset.reviewView === "notes" ? "decision" : "notes");
  }, "ghost decision-details-toggle", {disabled:true, "aria-expanded":false});
  d.querySelector(".dialog-header .close").before(detailToggle);
  const setView = (view) => {
    d.dataset.reviewView = view;
    notes.hidden = view !== "notes";
    detailToggle.textContent = view === "notes" ? "Review" : "Details";
    detailToggle.setAttribute("aria-expanded", String(view === "notes"));
    if (view === "decision") queueMicrotask(() => revealSelectedMove());
  };
  setView("decision");
  const paginateNotes = () => {
    detailToggle.disabled = false;
    const pages = [...body.querySelectorAll(".decision-values > p")];
    if (previewResult) pages.unshift(...body.querySelectorAll(".decision-values-compact"));
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

  let savedEngine = null,
    selectPreview = () => {},
    previewResult = null,
    bestPreviewLabel = "Best move";
  const board = new Board(slot);
  board.svg.setAttribute("preserveAspectRatio", "xMidYMin meet");
  const show = (steps, label) => {
    const after = steps.reduce((s, step) => applyStep(s, step), source);
    board.showPreview(after, {
      ...settings(),
      interactive: false,
      preview: true,
      usedDice: steps.map((s) => s.die),
      lastMove: label === "Position" ? null : moveTrace(after, source.turn, steps, source.dice),
    });
    selectPreview(steps, label);
    caption.textContent = `${label} · ${steps.length ? compactNotation(source, steps).notation : label === "Position" ? "original roll" : "Pass"}`;
    controls.querySelectorAll("button").forEach((b) =>
      b.setAttribute("aria-pressed", label === "Position"
        ? b.dataset.preview === "position"
        : b.dataset.preview === "move" && b.dataset.positionKey === boardKey(after)),
    );
  };
  show([], "Position");
  d.addEventListener(
    "close",
    () => {
      savedEngine?.destroy();
      board.destroy();
      onClose();
    },
    { once: true },
  );
  const api = {
    dialog: d,
    loading(status, preset) {
      previewResult = null;
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
      previewResult = null;
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
    result(result, expandSaved = true, freshReview = false) {
      result = presentAnalysis(source, result);
      moveListResize = () => {};
      revealSelectedMove = () => {};
      d.dataset.decisionKind = result.type;
      selectPreview = () => {};
      previewResult = result.type === "cube" ? null : result;
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
          body
            .querySelectorAll(".review-cube-choice")
            .forEach((b) =>
              b.setAttribute(
                "aria-pressed",
                b.dataset.action === choice?.action,
              ),
            );
          caption.textContent = `${label}${choice ? ` · ${choice.notation}` : " · original cube position"}`;
          controls
            .querySelectorAll("button")
            .forEach((b) =>
              b.setAttribute("aria-pressed", b.dataset.action === (choice?.action || "position")),
            );
        };
        const sameDecision = f.actual?.action === f.best.action;
        const bestDecisionLabel = sameDecision
          ? opponent ? "Best/their decision" : "Best/your decision"
          : "Best decision";
        controls.replaceChildren(
          ...[
            ["Position", null],
            [bestDecisionLabel, f.best],
            ...(!sameDecision && f.actual ? [[opponent ? "Their decision" : "Your decision", f.actual]] : []),
          ].map(([label, c]) =>
            button(label, () => showCube(c, label), "", {
              "aria-pressed": false,
              "data-action": c?.action || "position",
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
            `${result.settings.name} · ${result.method === "reference" ? "published XG book" : `${result.settings.plies} ply`} · ${playerName(f.perspective)}`,
          ),
          lossSummary(f),
          decisionValues(f, false, {
            opponent,
            onChoice: (choice) => {
              showCube(choice, choice.notation);
            },
          }),
          lossLegend(),
          el(
            "p",
            { class: "muted small" },
            "Cube offers use the opponent’s best evaluated reply. Values stay in the original cube units, even after a take or immediate redouble.",
          ),
          el(
            "p",
            { class: "muted small" },
            `${result.engine} · ${(result.elapsedMs / 1000).toFixed(2)} s. Evaluation estimates, not rollouts.`,
          ),
        );
        paginateNotes();
        showCube(f.best, bestDecisionLabel);
        return;
      }
      const best = result.candidates[0];
      const sameMove = result.actual &&
        boardKey(best.steps.reduce((s, st) => applyStep(s, st), source)) ===
        boardKey(result.actual.steps.reduce((s, st) => applyStep(s, st), source));
      bestPreviewLabel = sameMove
        ? opponent ? "Best/their move" : "Best/your move"
        : "Best move";
      const choices = [
        ["Position", null],
        [bestPreviewLabel, best],
      ];
      if (result.actual && !sameMove)
        choices.push([
          opponent ? "Opponent’s move" : "Your move",
          result.actual,
        ]);
      controls.replaceChildren(
        ...choices.map(([label, c]) =>
          button(label, () => show(c?.steps || [], label), "", {
            "aria-pressed": false,
            "data-preview": c ? "move" : "position",
            ...(c ? { "data-position-key": boardKey(c.steps.reduce((s, step) => applyStep(s, step), source)) } : {}),
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
          `${freshReview ? "Fresh · " : ""}${result.settings.name} · ${result.method === "reference" ? "published XG book" : `${result.settings.plies} ply`} · ${playerName(source.turn)}’s perspective`,
        ),
      );
      if (result.actual) {
        const f = decisionFeedback(result, source);
        body.append(
          lossSummary(f),
          decisionValues(f, true, { opponent }),
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
          { class: "muted small" },
          result.units === "current-cube-points"
            ? `Best equity ${equity(best.equity)} current-cube points. Multiply by cube ${source.cube.value} for session points.`
            : `Best match-winning chance ${percentage(best.mwc)}. Equity differences use normalized match equity.`,
        ),
      );
      const footer = d.querySelector("footer");
      footer.replaceChildren();
      appendReturn();
      const bestPlayed =
        result.actual &&
        (Math.abs(best.equity - result.actual.equity) <= 1e-7 ||
          boardKey(best.steps.reduce((s, st) => applyStep(s, st), source)) ===
            boardKey(
              result.actual.steps.reduce((s, st) => applyStep(s, st), source),
            ));
      if (onReplay && !bestPlayed) {
        const replay = button(
          replayLabel,
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
      body.append(
        el(
          "details",
          {},
          el("summary", {}, "Engine details"),
          el(
            "p",
            { class: "muted small" },
            `${result.engine} · ${(result.elapsedMs / 1000).toFixed(2)} s computation${result.cached ? " · cached" : ""}. ${result.evaluatedCount ?? result.candidates.length} ${result.method === "reference" ? "source-listed positions; imported XG values, Jacoby, beavers and raccoons on" : "legal resulting positions evaluated"}; small differences are estimates.`,
          ),
        ),
      );
      // All ten evaluated alternatives stay available in a scrolling list.
      // Selection previews this isolated board, never live play.
      const candidates = result.candidates.slice(0, 10);
      const ranked = el("section", {
        class: "review-moves",
        "aria-label": "Ranked moves",
      });
      const rows = el("div", { class: "review-move-rows" });
      let selected = 0;
      const redraw = () => {
        const scrollTop = rows.scrollTop;
        rows.replaceChildren(
          ...candidates.map((c, rank) => {
            const played =
              result.actual &&
              boardKey(c.steps.reduce((s, st) => applyStep(s, st), source)) ===
                boardKey(
                  result.actual.steps.reduce(
                    (s, st) => applyStep(s, st),
                    source,
                  ),
                );
            const loss = Math.max(0, best.equity - c.equity);
            const row = button(
              "",
              () => {
                selected = rank;
                show(c.steps, rank === 0 ? bestPreviewLabel : `Move ${rank + 1}`);
                redraw();
                rows.querySelector(`[data-rank="${rank + 1}"]`)?.focus({ preventScroll: true });
              },
              "review-move",
              {
                "data-rank": rank + 1,
                "aria-pressed": String(rank === selected),
                "aria-label": `Move ${rank + 1}: ${c.notation}${played ? (opponent ? ", opponent’s choice" : ", your choice") : ""}. Equity ${equity(c.equity)}. Loss ${loss.toFixed(3)}. Preview move`,
              },
            );
            row.append(
              el("span", { class: "review-rank" }, String(rank + 1)),
              el(
                "span",
                { class: "review-notation" },
                c.notation,
                ...(c.referenceCredit ? [el("small", {}, `XG · ${c.referenceCredit.author}`)] : []),
                ...(played
                  ? [
                      el(
                        "small",
                        {},
                        rank === 0 ? bestPreviewLabel : opponent ? "Opponent’s choice" : "Your choice",
                      ),
                    ]
                  : []),
              ),
              el("span", { class: "review-number" }, equity(c.equity)),
              el(
                "span",
                {
                  class: "review-number review-loss",
                  "data-loss-tone": lossTone(loss).tone,
                },
                rank === 0 ? "Best" : loss.toFixed(3),
              ),
            );
            return row;
          }),
        );
        rows.scrollTop = scrollTop;
      };
      ranked.append(
        el(
          "div",
          { class: "review-move-heading" },
          el("strong", {}, `Top ${candidates.length} moves`),
          el("span", {}, "Equity"),
          el("span", {}, "Loss"),
        ),
        rows,
      );
      body.append(ranked);
      revealSelectedMove = () => {
        const row = rows.querySelector('[aria-pressed="true"]');
        if (!row || !rows.clientHeight) return;
        const top = row.getBoundingClientRect().top - rows.getBoundingClientRect().top;
        if (top < 0) rows.scrollTop += top;
        else if (top + row.offsetHeight > rows.clientHeight)
          rows.scrollTop += top + row.offsetHeight - rows.clientHeight;
      };
      moveListResize = revealSelectedMove;
      selectPreview = (steps, label) => {
        const key = boardKey(steps.reduce((s, st) => applyStep(s, st), source));
        const next =
          label === "Position"
            ? -1
            : candidates.findIndex(
                (c) =>
                  boardKey(
                    c.steps.reduce((s, st) => applyStep(s, st), source),
                  ) === key,
              );
        if (next !== selected) {
          selected = next;
          redraw();
        }
        revealSelectedMove();
      };
      paginateNotes();
      redraw();
      show(best.steps, bestPreviewLabel);
      // Older saved reviews retained only one candidate. Re-evaluate the entire
      // comparison together; never mix old equities with new candidate scores.
      const preset = Object.keys(PRESETS).find(
        (k) => PRESETS[k].name === result.settings.name,
      );
      if (
        expandSaved &&
        preset &&
        result.candidates.length < Math.min(10, result.evaluatedCount || 0)
      ) {
        const heading = ranked.querySelector("strong");
        const expand = async () => {
          heading.textContent = "Loading top moves…";
          ranked.setAttribute("aria-busy", "true");
          savedEngine?.destroy();
          const engine = (savedEngine = new EngineClient());
          try {
            const fresh = await engine.analyze(source, {
              preset,
              submitted: result.actual?.steps || null,
            });
            if (!d.open || savedEngine !== engine) return;
            api.result(fresh, false, true);
          } catch (error) {
            if (!d.open || savedEngine !== engine) return;
            heading.replaceChildren(
              button("Retry loading moves", expand, "", {
                title: error.message,
              }),
            );
            ranked.removeAttribute("aria-busy");
          } finally {
            engine.destroy();
            if (savedEngine === engine) savedEngine = null;
          }
        };
        expand();
      }
    },
  };
  return api;
}
