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
  boardKey,
} from "../core/rules.mjs";
import { decisionFeedback, lossTone } from "../core/decision-feedback.mjs";
import { decisionValues, lossLegend } from "./decision-values.mjs";
import { equity, percentage } from "./analysis.mjs";
import { EngineClient } from "../engine/client.mjs";
import { PRESETS } from "../engine/metadata.mjs";
import { StudyStrip } from "./study-strip.mjs";

// A separate instance of the shared renderer: previews cannot touch the live
// DraftBoard. Callers own live analysis; this dialog owns and cancels the
// optional worker that expands an older saved review.
export function decisionReview(
  source,
  {
    title = "Move hint",
    opponent = false,
    onClose = () => {},
    onUse,
    onReplay,
    onReturn,
    replayDescription = "Rewinds this turn and any bot reply, then plays the best move. Already rolled dice are preserved.",
  } = {},
) {
  const slot = el("div", { class: "decision-board" });
  const body = el("div", { class: "decision-content" });
  const previewControls = el("div", { class: "review-preview-controls" });
  const controls = el("div", { class: "row wrap decision-choices" });
  const caption = el("p", { class: "decision-caption", role: "status" });
  const d = dialog(
    title,
    el(
      "div",
      { class: "decision-layout" },
      el("div", { class: "decision-position" }, slot, controls, previewControls, caption),
      body,
    ),
  );
  d.classList.add("decision-dialog");
  const appendReturn = () => {
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

  const views = el("div", {
    class: "row decision-tabs",
    "aria-label": "Review view",
  });
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
  let explicitView = false,
    hintResult = false;
  const narrow = matchMedia("(max-width: 700px)");
  const setView = (view) => {
    d.dataset.reviewView = view;
    if (view === "decision") queueMicrotask(() => {
      moveListResize();
      revealSelectedMove();
    });
    notes.hidden = view !== "notes";
    views
      .querySelectorAll("button")
      .forEach((b) => b.setAttribute("aria-pressed", b.dataset.view === view));
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

  let savedEngine = null,
    selectPreview = () => {},
    previewResult = null;
  const board = new Board(slot);
  const strip = new StudyStrip((candidate) => {
    const rank = previewResult?.candidates.indexOf(candidate) ?? -1;
    show(candidate?.steps || [], candidate
      ? rank >= 0 ? `Move ${rank + 1}` : opponent ? "Opponent’s move" : "Your move"
      : "Position", !!candidate);
  }, { container: previewControls, playedLabel: opponent ? "Opponent’s move" : "Your move" });
  strip.node.classList.add("review-preview-strip");
  const show = (steps, label, animate = false) => {
    const after = steps.reduce((s, step) => applyStep(s, step), source);
    board.render(after, {
      ...settings(),
      interactive: false,
      preview: true,
      usedDice: steps.map((s) => s.die),
    });
    if (animate) board.playTurn(source, steps);
    selectPreview(steps, label);
    strip.set(previewResult, label === "Position" ? null : after);
    caption.textContent = `${label} · ${steps.length ? notation(steps, source.turn) : label === "Position" ? "original roll" : "Pass"}`;
    controls
      .querySelectorAll("button")
      .forEach((b) => b.setAttribute("aria-pressed", b.textContent === label));
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
      strip.set(null);
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
      strip.set(null);
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
      moveListResize = () => {};
      revealSelectedMove = () => {};
      selectPreview = () => {};
      previewResult = result.type === "cube" ? null : result;
      strip.set(null);
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
              b.setAttribute("aria-pressed", b.textContent === label),
            );
        };
        controls.replaceChildren(
          ...[
            ["Position", null],
            ["Best decision", f.best],
            [opponent ? "Opponent’s decision" : "Your decision", f.actual],
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
          decisionValues(f, false, {
            opponent,
            onChoice: (choice) => {
              showCube(choice, choice.notation);
              if (narrow.matches) setView("board");
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
        showCube(null, "Position");
        return;
      }
      const best = result.candidates[0];
      const choices = [
        ["Position", null],
        ["Best move", best],
      ];
      if (result.actual)
        choices.push([
          opponent ? "Opponent’s move" : "Your move",
          result.actual,
        ]);
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
          `${freshReview ? "Fresh · " : ""}${result.settings.name} · ${result.settings.plies} ply · ${playerName(source.turn)}’s perspective`,
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
            title: "Replaces your draft. Review it, then confirm on the table.",
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
      // Ten real engine candidates, with pagination only when the viewport
      // cannot fit them. Selection previews this isolated board, never live play.
      const candidates = result.candidates.slice(0, 10);
      const ranked = el("section", {
        class: "review-moves",
        "aria-label": "Ranked moves",
      });
      const rows = el("div", { class: "review-move-rows" });
      const count = el("span", { class: "muted small", "aria-live": "polite" });
      let page = 0,
        selected = 0,
        pageSize = 10;
      const redraw = () => {
        const size = pageSize,
          pages = Math.ceil(candidates.length / size);
        page = Math.min(page, Math.max(0, pages - 1));
        rows.replaceChildren(
          ...candidates.slice(page * size, (page + 1) * size).map((c, i) => {
            const rank = page * size + i;
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
                show(c.steps, `Move ${rank + 1}`, true);
                redraw();
                if (narrow.matches || innerHeight < 500) {
                  setView("board");
                  strip.select.focus({ preventScroll: true });
                } else
                  rows
                    .querySelector(`[data-rank="${rank + 1}"]`)
                    ?.focus({ preventScroll: true });
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
                ...(played
                  ? [
                      el(
                        "small",
                        {},
                        opponent ? "Opponent’s choice" : "Your choice",
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
        count.textContent = `${page * size + 1}–${Math.min((page + 1) * size, candidates.length)} of ${candidates.length}`;
        prev.disabled = page === 0;
        next.disabled = page === pages - 1;
        pager.hidden = pages <= 1;
        if (
          d.dataset.reviewView === "decision" &&
          pageSize > 1 &&
          ranked.getBoundingClientRect().bottom >
            (footer.clientHeight
              ? footer.getBoundingClientRect().top
              : layout.getBoundingClientRect().bottom) -
              8
        ) {
          pageSize--;
          redraw();
        }
      };
      const prev = button("Previous moves", () => {
        page--;
        redraw();
      });
      const next = button("Next moves", () => {
        page++;
        redraw();
      });
      const pager = el(
        "div",
        { class: "row spread review-move-pages" },
        prev,
        count,
        next,
      );
      ranked.append(
        el(
          "div",
          { class: "review-move-heading" },
          el("strong", {}, `Top ${candidates.length} moves`),
          el("span", {}, "Equity"),
          el("span", {}, "Loss"),
        ),
        rows,
        pager,
      );
      body.append(ranked);
      moveListResize = () => {
        const anchor = page * pageSize;
        pageSize = 10;
        redraw();
        page = Math.floor(anchor / pageSize);
        redraw();
      };
      revealSelectedMove = () => {
        // A long move or a "Your choice" label can reduce the fitted page
        // size. Re-anchor after fitting so the selected move stays visible.
        for (let i = 0; i < candidates.length; i++) {
          if (selected >= 0) page = Math.floor(selected / pageSize);
          const size = pageSize;
          redraw();
          if (pageSize === size) break;
        }
      };
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
      };
      paginateNotes();
      redraw();
      show(best.steps, "Best move", true);
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
