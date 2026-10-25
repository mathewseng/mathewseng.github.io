// SPDX-License-Identifier: GPL-3.0-or-later
import { el, button } from './shell.mjs';
import { presentMove } from '../core/move-presentation.mjs';
import { presentCubeAction } from '../core/cube-presentation.mjs';
import { analysisDepthLabel } from '../core/analysis-insight.mjs';
import { cubeActionIcon } from './cube-action-icon.mjs';
import { decisionValues } from './decision-values.mjs';

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
    const played = () => {
      if (!cube) return el("span", { class: "history-played" }, row.label);
      if (!cube.displayLabel) return null;
      return el("span", { class: "history-played history-cube-action", title: cube.description },
        ...(cube.icon ? [cubeActionIcon(cube.icon)] : []), el("span", {}, cube.displayLabel));
    };
    const detail = () => el("span", { class: "history-kind muted" },
      el("span", { class: "history-kind-label" },
        ...(cube ? [el("span", { class: "history-cube-icon", role: "img",
          "aria-label": `Current cube ${cube.cubeValue}`, title: `Current cube: ${cube.cubeValue}` }, cube.cubeValue)] : []),
        kind,
      ),
      ...(row.result ? [" · ", el("span", {
        class: "history-depth", title: `Completed analysis · ${analysisDepthLabel(row.result)}`,
      }, analysisDepthLabel(row.result))] : []),
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
          el("span", { class: "history-move" }, detail(), played()),
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
        title: `${playerLabel} · ${kind}: ${cube?.label || row.label}. ${f.quality}. ${f.units}. Open equity and EV comparison.`,
      },
    );
    const bestPlayed = Math.abs(f.best.equity - f.actual.equity) <= 1e-7;
    review.append(
      el("span", { class: "history-move" },
        detail(),
        played(),
        ...(!bestPlayed ? [el("span", { class: "feedback-best muted" },
          el("span", { class: "history-best-label" }, "Best "),
          row.result.type === "checker" ? presentMove(row.source, f.best.steps).notation : presentCubeAction(row.source, f.best.action).label,
        )] : []),
      ),
      decisionValues(f, true, { opponent: side === "opponent" }),
      el("span", { class: "history-loss" },
        el("span", { class: "muted" }, f.label),
        el("strong", { class: "value" }, f.value),
      ),
    );
    decisions.append(review);
  }
  return node;
}
