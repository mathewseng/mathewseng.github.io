// SPDX-License-Identifier: GPL-3.0-or-later
import { presentAnalysis, compactNotation } from "../core/move-presentation.mjs";
import { el, button, dialog, saveDialog, dieFace } from "./shell.mjs";
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
import { equity, percentage, chanceLines } from "./analysis.mjs";
import { reviewSearch } from "./review-search.mjs";
import { returnIcon } from "./return-icon.mjs";

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
const possessive = (name) => (name === "You" ? "Your" : `${name}’s`);
export function decisionReview(
  source,
  {
    title = "Move hint",
    opponent = false,
    beforeRoll = null,
    onClose = () => {},
    replayLabel = "Undo & play best",
    onReplay,
    onReturn,
    replayDescription = "Rewinds this turn and any bot reply, then plays the best move. Already rolled dice are preserved.",
    names = null,
    rankedMoveLimit = 10,
    includePlayedInRanking = true,
    recordingReview = false,
  } = {},
) {
  const slot = el("div", { class: "decision-board" });
  const body = el("div", { class: "decision-content" });
  const caption = el("p", { class: "decision-caption sr-only", role: "status" });
  const d = dialog(
    title,
    el(
      "div",
      { class: "decision-layout" },
      el("div", { class: "decision-position" }, slot, caption),
      body,
    ),
  );
  d.classList.add("decision-dialog");
  if (recordingReview) d.classList.add("recording-review");
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
  let moveRowsObserver;
  const resizeMoves = () => moveListResize();
  window.addEventListener("resize", resizeMoves);
  // Short notes read as one stack; a viewport too small for them pages them.
  let notePages = [], noteIndex = 0;
  const layoutNotes = () => {
    const heading = el("h3", {}, "How to read this result");
    const shown = notePages.length ? notePages : [el("p", {}, "No additional details.")];
    for (const note of shown) if (note.tagName === "DETAILS") note.open = true;
    notes.replaceChildren(heading, ...shown);
    const frame = d.querySelector(".dialog-body");
    if (notes.hidden || shown.length < 2 || frame.scrollHeight <= frame.clientHeight + 1) return;
    noteIndex = Math.min(noteIndex, shown.length - 1);
    const content = el("div", { class: "review-note" });
    const count = el("span", {
      class: "muted small",
      "aria-live": "polite",
    });
    const update = () => {
      content.replaceChildren(shown[noteIndex]);
      count.textContent = `${noteIndex + 1} / ${shown.length}`;
      prev.disabled = noteIndex === 0;
      next.disabled = noteIndex >= shown.length - 1;
    };
    const prev = button("Previous", () => {
      noteIndex--;
      update();
    });
    const next = button("Next", () => {
      noteIndex++;
      update();
    });
    notes.replaceChildren(
      heading,
      content,
      el("div", { class: "row spread" }, prev, count, next),
    );
    update();
  };
  const notesObserver = new ResizeObserver(() => layoutNotes());
  notesObserver.observe(d.querySelector(".dialog-body"));
  d.addEventListener(
    "close",
    () => {
      window.removeEventListener("resize", resizeMoves);
      moveRowsObserver?.disconnect();
      notesObserver.disconnect();
    },
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
    else layoutNotes();
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
    notePages = pages;
    noteIndex = 0;
    layoutNotes();
  };

  let selectPreview = () => {},
    previewResult = null,
    bestPreviewLabel = "Best move";
  const board = new Board(slot);
  const boardSettings = () => ({
    ...settings(),
    ...(recordingReview ? { cubeOneAsOne: true } : {}),
    interactive: false,
    preview: true,
  });
  const displayDice = recordingReview ? [...source.dice].sort((a, b) => b - a) : source.dice;
  board.svg.setAttribute("preserveAspectRatio", "xMidYMin meet");
  const show = (steps, label) => {
    const after = steps.reduce((s, step) => applyStep(s, step), source);
    board.showPreview(recordingReview ? { ...after, dice: displayDice } : after, {
      ...boardSettings(),
      usedDice: steps.map((s) => s.die),
      lastMove: label === "Position" ? null : moveTrace(after, source.turn, steps, source.dice),
    });
    selectPreview(steps, label);
    caption.textContent = `${label} · ${steps.length ? compactNotation(source, steps).notation : label === "Position" ? "original roll" : "Pass"}`;

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
  const search = recordingReview ? null : reviewSearch(source, d, (...args) => api.result(...args), beforeRoll);
  const api = {
    dialog: d,
    preview(steps = [], label = "Played move") {
      show(steps, label);
      body.replaceChildren(el("p", {class:"muted"}, "This decision has not been analyzed."));
      if (search) body.append(search.node);
    },
    loading(status, preset) {
      previewResult = null;
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
          board.render(state, boardSettings());
          body
            .querySelectorAll(".review-cube-choice")
            .forEach((b) =>
              b.setAttribute(
                "aria-pressed",
                b.dataset.action === (choice?.action || "position"),
              ),
            );
          caption.textContent = `${label}${choice ? ` · ${choice.notation}` : " · original cube position"}`;

        };
        const sameDecision = f.actual?.action === f.best.action;
        const bestDecisionLabel = sameDecision
          ? opponent ? "Best/their decision" : "Best/your decision"
          : "Best decision";
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
            recordingReview ? `${names?.[f.perspective] ?? playerName(f.perspective)}’s perspective` :
              `${result.settings.name} · ${result.method === "reference" ? "published XG book" : `${result.settings.plies} ply`} · ${playerName(f.perspective)}`,
          ),
          lossSummary(f),
          decisionValues(f, false, {
            opponent,
            showLoss: recordingReview,
            onPosition: () => showCube(null, "Position"),
            onChoice: (choice) => {
              showCube(choice, choice.notation);
            },
          }),
          el("div", { class: "review-chances" }, chanceLines(f.positionChances, f.chancePlayer, { table: true, names })),
          lossLegend(recordingReview),
          el(
            "p",
            { class: "muted small" },
            "Chances are for the position played to the end without the cube; gammon includes backgammon.",
          ),
          el(
            "p",
            { class: "muted small" },
            recordingReview ? "Cube offers use the opponent’s best evaluated reply. EV is shown in the original cube units." :
              "Cube offers use the opponent’s best evaluated reply. Values stay in the original cube units, even after a take or immediate redouble.",
          ),
          el(
            "p",
            { class: "muted small" },
            `${result.engine}${Number.isFinite(result.elapsedMs) ? ` · ${(result.elapsedMs / 1000).toFixed(2)} s` : ""}. Evaluation estimates, not rollouts.`,
          ),
        );
        paginateNotes();
        showCube(recordingReview ? f.actual : f.best, recordingReview ? "Played decision" : bestDecisionLabel);
        if (search) {
          body.append(search.node);
          search.setResult(result);
        }
        return;
      }
      const best = result.candidates[0];
      const sameMove = result.actual &&
        boardKey(best.steps.reduce((s, st) => applyStep(s, st), source)) ===
        boardKey(result.actual.steps.reduce((s, st) => applyStep(s, st), source));
      bestPreviewLabel = sameMove
        ? opponent ? "Best/their move" : "Best/your move"
        : "Best move";
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
          recordingReview ? `${possessive(names?.[source.turn] ?? playerName(source.turn))} perspective` :
            `${freshReview ? "Fresh · " : ""}${result.settings.name} · ${result.method === "reference" ? "published XG book" : `${result.settings.plies} ply`} · ${possessive(names?.[source.turn] ?? playerName(source.turn))} perspective`,
        ),
      );
      if (result.actual) {
        const f = decisionFeedback(result, source);
        body.append(
          lossSummary(f),
          decisionValues(f, true, { opponent }),
          lossLegend(recordingReview),
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
            `${result.engine}${Number.isFinite(result.elapsedMs) ? ` · ${(result.elapsedMs / 1000).toFixed(2)} s computation` : ""}${result.cached ? " · cached" : ""}. ${result.evaluatedCount ?? result.candidates.length} ${result.method === "reference" ? "source-listed positions; imported XG values, Jacoby, beavers and raccoons on" : "legal resulting positions evaluated"}; small differences are estimates.`,
          ),
        ),
      );
      // Preview ranked alternatives on the isolated board.
      const candidates = result.candidates.slice(0, rankedMoveLimit);
      const keyOf = c => boardKey(c.steps.reduce((s, st) => applyStep(s, st), source));
      const actualKey = result.actual ? keyOf(result.actual) : null;
      const outsideRanking = actualKey !== null && !candidates.some(c => keyOf(c) === actualKey);
      // The standard review keeps the played choice available below the ranking cutoff.
      if (includePlayedInRanking && outsideRanking) {
        candidates.push(result.actual);candidates.sort((a,b) => b.equity-a.equity);
      }
      const ranked = el("section", {
        class: "review-moves",
        "aria-label": "Ranked moves",
      });
      const rows = el("div", { class: "review-move-rows" });
      let selected = 0;
      const position = button('', () => {show([], 'Position');search?.loadPosition();}, 'review-move review-position', {
        'aria-label':'Position', 'aria-pressed':false, 'data-preview':'position',
      });
      position.append(el('span',{class:'review-rank','aria-hidden':'true'},returnIcon()),
        el('span',{class:'review-notation'},'Position',el('small',{},'Before roll')),
        search?.positionEquity ?? el('span', {class:'review-number'}, '—'),
        el('span',{class:'review-position-dice','aria-label':`Rolled ${displayDice.join('–')}`},...displayDice.map(value=>dieFace(value,{player:source.turn}))));
      let playedOutside;
      if (recordingReview && !includePlayedInRanking && outsideRanking) {
        const actual = result.actual;
        const loss = Math.max(0, best.equity - actual.equity);
        playedOutside = button("", () => show(actual.steps, "Played move"), "review-move vision-played-move", {
          "aria-label": `Played move: ${actual.notation}. Equity ${equity(actual.equity)}. Loss ${loss.toFixed(3)}.`,
          "aria-pressed": "false",
        });
        playedOutside.append(
          el("span", { class: "review-rank" }, Number.isInteger(actual.rank) ? actual.rank : "—"),
          el("span", { class: "review-notation" }, actual.notation, el("small", {}, "Played")),
          el("span", { class: "review-number" }, equity(actual.equity)),
          el("span", { class: "review-number review-loss", "data-loss-tone": lossTone(loss).tone }, loss.toFixed(3)),
        );
      }
      // Size to the actual first six rows, including wrapped notation/source
      // credits. Extra candidates scroll inside this fixed-height list.
      const sizeMoves = () => {
        const visible = [...rows.children].slice(0, 6);
        if (!visible.length || !rows.getClientRects().length) return;
        const height = visible.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0) + 4;
        rows.style.height = `${height}px`;
      };
      moveRowsObserver?.disconnect();
      moveRowsObserver = new ResizeObserver(sizeMoves);
      // Chances follow the previewed move; the bare position shows the best one.
      const chances = el("div", { class: "review-chances", "aria-live": "polite" });
      const redraw = () => {
        moveRowsObserver.disconnect();
        const previewed = playedOutside && selected === candidates.length ? result.actual : candidates[selected] || best;
        chances.replaceChildren(...[chanceLines(previewed.probabilities, result.perspective, { table: true, names })].filter(Boolean));
        chances.hidden = !chances.childElementCount;
        position.setAttribute("aria-pressed",String(selected === -1));
        playedOutside?.setAttribute("aria-pressed", String(selected === candidates.length));
        const scrollTop = rows.scrollTop;
        rows.replaceChildren(
          ...candidates.map((c, rank) => {
            const played = keyOf(c) === actualKey;
            const loss = Math.max(0, best.equity - c.equity);
            const status = recordingReview
              ? [played ? "Played" : "", rank === 0 ? "Best" : ""].filter(Boolean).join(" · ")
              : played ? (rank === 0 ? bestPreviewLabel : opponent ? "Opponent’s choice" : "Your choice") : "";
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
                ...(status ? [el("small", {}, status)] : []),
              ),
              el("span", { class: "review-number" }, equity(c.equity)),
              el(
                "span",
                {
                  class: "review-number review-loss",
                  "data-loss-tone": lossTone(loss).tone,
                },
                rank === 0 && !recordingReview ? "Best" : loss.toFixed(3),
              ),
            );
            return row;
          }),
        );
        for (const row of [...rows.children].slice(0, 6)) moveRowsObserver.observe(row);
        sizeMoves();
        rows.scrollTop = scrollTop;
      };
      ranked.append(
        el(
          "div",
          { class: "review-move-heading" },
          el("strong", {}, `Top ${Math.min(rankedMoveLimit, candidates.length)} moves`),
          el("span", {}, recordingReview ? "EV" : "Equity"),
          el("span", {}, recordingReview ? "EV loss" : "Loss"),
        ),
        position, rows,
      );
      if (playedOutside) ranked.append(playedOutside);
      body.append(chances, ranked);
      if (search) body.append(search.node);
      revealSelectedMove = () => {
        const row = rows.querySelector('[aria-pressed="true"]');
        if (!row || !rows.clientHeight) return;
        const top = row.getBoundingClientRect().top - rows.getBoundingClientRect().top;
        if (top < 0) rows.scrollTop += top;
        else if (top + row.offsetHeight > rows.clientHeight)
          rows.scrollTop += top + row.offsetHeight - rows.clientHeight;
      };
      moveListResize = () => { sizeMoves(); revealSelectedMove(); };
      selectPreview = (steps, label) => {
        const key = boardKey(steps.reduce((s, st) => applyStep(s, st), source));
        let next = label === "Position" ? -1 : candidates.findIndex(c => keyOf(c) === key);
        if (label === "Played move" && playedOutside && key === actualKey) next = candidates.length;
        if (next !== selected) {
          selected = next;
          redraw();
        }
        revealSelectedMove();
      };
      paginateNotes();
      redraw();
      show(best.steps, bestPreviewLabel);
      search?.setResult(result);
      // Older saved reviews retained only one candidate. Re-evaluate the entire
      // comparison together; never mix old equities with new candidate scores.
      const preset = ({0:'quick',1:'standard',2:'deep',3:'expert',4:'research'})[result.settings.plies];
      if (search && expandSaved && preset && !result.book && result.method !== 'reference' &&
          result.candidates.length < Math.min(10, result.evaluatedCount || 0)) {
        search.run(preset, {expand:true});
      }
    },
  };
  return api;
}
