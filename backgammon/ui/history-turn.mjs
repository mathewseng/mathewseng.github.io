// SPDX-License-Identifier: GPL-3.0-or-later
import { el, button, dieFace } from './shell.mjs';
import { presentMove } from '../core/move-presentation.mjs';
import { presentCubeAction } from '../core/cube-presentation.mjs';
import { cubeActionIcon } from './cube-action-icon.mjs';
import { equity } from './analysis.mjs';
import { applyStep, boardKey } from '../core/rules.mjs';

// Shared by the active game and one lazily opened archived game.
export function historyTurn(group, {names, viewer, local, actions, reviewIndex,
  pending = row => row.forced ? 'Forced · no choice' : 'Not analyzed'} = {}) {
  const side = group.player === viewer ? "self" : "opponent";
  const playerLabel = local ? names[group.player]
    : side === "self" ? "You" : "Opponent";
  const cubeCount = group.decisions.filter(row => row.action.type !== "move").length;
  const decisions = el("div", {
    class: "history-turn-decisions",
    "data-paired": cubeCount > 0 && group.decisions.some(row => row.action.type === "move") ? "true" : "false",
  });
  decisions.style.setProperty("--cube-decisions", cubeCount);
  const identity = el("div", { class: "history-identity" },
    el("span", { class: "history-player" }, playerLabel),
    ...(!local && names[group.player] !== playerLabel
      ? [el("span", { class: "history-detail muted" }, names[group.player])] : []),
    el("span", { class: "history-turn-label muted" },
      `Game ${group.game} · Turn ${group.turn}${group.response ? " · Response" : ""}`),
  );
  const node = el("section", {
    class: "history-turn",
    "data-history-player": group.player,
    "data-history-side": side,
    "data-turn-key": group.key,
    "aria-label": `${playerLabel} · Game ${group.game} · Turn ${group.turn}${group.response ? " · Cube response" : ""}`,
  }, identity, decisions);

  for (const row of group.decisions) {
    const handlers = actions(row);
    const kind = row.action.type === "move" ? "Move" : "Cube";
    const cube = kind === "Cube" ? presentCubeAction(row.source, row.action.type) : null;
    const bestPlayed = !!row.feedback && Math.abs(row.feedback.best.equity - row.feedback.actual.equity) <= 1e-7;
    const attempts = (local || side === "self") ? row.attempts ?? (row.initialAction
      ? [{action:row.initialAction, feedback:row.initialFeedback}] : []) : [];
    // Equivalent move orders need only one line. Keep separate grades when
    // the original and accepted analyses differ, even for the same board.
    const revised = attempts.filter(attempt => (
      (cube ? attempt.action.type !== row.action.type :
        boardKey(attempt.action.steps.reduce((s, step) => applyStep(s, step), row.source)) !==
          boardKey(row.action.steps.reduce((s, step) => applyStep(s, step), row.source))) ||
      attempt.feedback?.value !== row.feedback?.value
    ));
    const choice = (action, label) => {
      if (!cube) return el("span", { class: "history-played" }, label);
      const c = presentCubeAction(row.source, action.type);
      if (!c.displayLabel) return null;
      return el("span", { class: "history-played history-cube-action", title: c.description },
        ...(c.icon ? [cubeActionIcon(c.icon)] : []), el("span", {}, c.displayLabel));
    };
    const initialChoices = () => revised.map((attempt, index) => {
      const f = attempt.feedback;
      return el("span", { class: "history-initial", "data-initial-status": f ? "evaluated" : "pending" },
        el("span", { class: "history-attempt-label muted" }, revised.length > 1 ? `Attempt ${index + 1}` : "Initial"),
        choice(attempt.action, cube ? null : presentMove(row.source, attempt.action.steps).notation),
        ...(!cube || !f || f.loss > 1e-7 ? [el("span", { class: "history-initial-loss", ...(f ? { "data-loss-tone": f.tone } : {}) },
          ...(f ? [el("strong", {}, f.value), el("span", { class: "muted" }, ` ${f.label}`)]
            : [el("span", { class: "muted" }, "EV loss pending")]),
        )] : []),
      );
    });
    const played = () => {
      // A correct no-double has no action to repeat beneath its equity.
      if (cube && !cube.displayLabel && bestPlayed) return null;
      return el("span", { class: "history-accepted" },
        el("span", {class:"history-choice-heading"},
          el("span", {
            class: `history-attempt-label ${bestPlayed ? "history-played-best" : "muted"}`,
          }, bestPlayed ? "Played best" : "Played"),
          ...(!cube && bestPlayed && row.choiceMethod ? [el("span", {
            class:"history-choice-method muted",
            "data-choice-method":row.choiceMethod,
            title:row.choiceMethod === "manual" ? "Best move found without viewing a hint"
              : row.choiceMethod === "play-best" ? "Played using the Play Best button" : "Best move played after viewing a hint",
          }, row.choiceMethod === "manual" ? "Found" : "Hint")] : []),
          ...(row.feedback && equity(row.feedback.actual.equity) !== equity(row.feedback.best.equity)
            ? [el("span", {class:"history-choice-equity", "aria-label":`Played equity ${equity(row.feedback.actual.equity)}`}, equity(row.feedback.actual.equity))] : []),
        ),
        choice(row.action, row.label),
        ...(row.feedback && !bestPlayed ? [el("span", { class: "history-loss" },
          el("strong", { class: "value" }, row.feedback.value),
          el("span", { class: "muted" }, row.feedback.label),
        )] : []),
      );
    };
    const detail = () => el("span", { class: "history-kind muted" },
      el("span", { class: "history-kind-text" },
        el("span", { class: "history-kind-label" },
          ...(cube ? [el("span", { class: "history-cube-icon", role: "img",
            "aria-label": `Current cube ${cube.cubeValue}`, title: `Current cube: ${cube.cubeValue}` }, cube.cubeValue)] : []),
          kind,
        ),
        ...(row.feedback ? [el("strong", {
          class: "history-equity", "aria-label": `Best equity ${equity(row.feedback.best.equity)}`,
          title: `Best evaluated equity · ${row.feedback.units} · decision maker’s perspective`,
        }, equity(row.feedback.best.equity))] : []),
      ),
      ...(!cube && row.source.dice?.length === 2 ? [el("span", {
        class: "history-roll", role: "img", "aria-label": `Rolled ${[...row.source.dice].sort((a,b) => b-a).join('–')}`,
      }, ...[...row.source.dice].sort((a,b) => b-a).map(value => dieFace(value, {player:row.player})))] : []),
    );
    if (!row.feedback) {
      decisions.append(
        el(
          "div",
          {
            class: "feedback-pending",
            "data-history-side": side,
            "data-history-player": row.player,
            "data-decision-type": row.action.type === "move" ? "checker" : "cube",
          },
          el("span", { class: "history-move" }, detail(), played(), ...initialChoices()),
          ...(handlers.preview ? [button("Review", handlers.preview, "ghost")] : []),
          ...(handlers.restore
            ? [
                button(
                  "Return",
                  handlers.restore,
                  "ghost",
                  { "aria-label": "Return to this position", title: "Return to this position" },
                ),
              ]
            : []),
          el(
            "span",
            { class: "history-pending-status muted small" },
            pending(row),
          ),
        ),
      );
      continue;
    }
    const f = row.feedback;
    const review = button(
      "",
      handlers.review,
      "feedback-review",
      {
        ...(row.index === reviewIndex
          ? { id: "review-feedback" }
          : {}),
        "data-loss-tone": f.tone,
        "data-history-side": side,
        "data-history-player": row.player,
        "data-decision-type": row.result.type,
        "data-played-best": bestPlayed ? "true" : "false",
        title: `${playerLabel} · ${kind}: ${cube?.label || row.label}. ${f.quality}. ${f.units}. Open equity and EV comparison.`,
      },
    );
    review.append(
      el("span", { class: "history-move" },
        detail(),
        played(),
        ...initialChoices(),
        ...(!bestPlayed ? [el("span", { class: "feedback-best muted" },
          el("span", { class: "history-best-label" }, "Best "),
          row.result.type === "checker" ? presentMove(row.source, f.best.steps).notation : presentCubeAction(row.source, f.best.action).label,
        )] : []),
      ),
    );
    decisions.append(review);
  }
  return node;
}
