// SPDX-License-Identifier: GPL-3.0-or-later
import { el } from "./shell.mjs";
import { gameLossSummary } from "../core/game-loss-summary.mjs";
import { lossTone } from "../core/decision-feedback.mjs";

export function gameLossTable(rows, state, names, visiblePlayers = [0, 1], { compact = false,
  summary = gameLossSummary(rows, state.gameNumber, state.matchLength) } = {}) {
  const number = value => value === null ? "—" : value.toFixed(3);
  const value = (tag, amount) => el(tag,
    amount === null ? {} : { "data-loss-tone": lossTone(amount).tone }, number(amount));
  const cell = (stats, checker, stage) => {
    const known = stats.evaluated > 0 || stats.count === 0;
    return el("td", { "data-stage": stage },
      value("strong", known ? stats.total : null),
      checker ? el("small", {}, value("span", stats.average), " / move")
        : el("small", {},
          known ? `${stats.mistakes} mistake${stats.mistakes === 1 ? "" : "s"}` : "— mistakes"),
      ...(stats.pending + stats.unavailable ? [el("small", { class: "loss-summary-pending" },
        [stats.pending ? `${stats.pending} pending` : "",
          stats.unavailable ? `${stats.unavailable} unrecorded` : ""].filter(Boolean).join(" · "))] : []),
    );
  };
  return el("section", { class: `game-loss-summary${compact ? " compact-loss-summary" : ""}`, "aria-label": "Game decision losses" },
    el("table", {},
      ...(!compact ? [el("caption", {}, summary.money ? "EV loss" : "EV loss · normalized equity")] : []),
      el("thead", {}, el("tr", {},
        el("th", { scope: "col" }, compact ? "EV loss" : "Total loss"),
        el("th", { scope: "col" }, "Initial"),
        el("th", { scope: "col" }, "Accepted"),
      )),
      ...summary.players.filter(player => visiblePlayers.includes(player.player)).map(player => el("tbody", { "data-summary-player": player.player },
        ...(!compact || visiblePlayers.length > 1 ? [el("tr", { class: "loss-summary-player" },
          el("th", { colspan: 3, scope: "rowgroup" }, names[player.player]))] : []),
        ...["checker", "cube"].map(kind => el("tr", { "data-loss-kind": kind },
          el("th", { scope: "row" }, kind === "checker" ? "Checkers" : "Cube",
            el("small", {}, `${player[kind].accepted.count} ${kind === "checker" ? "move" : "decision"}${player[kind].accepted.count === 1 ? "" : "s"}`)),
          cell(player[kind].initial, kind === "checker", "initial"),
          cell(player[kind].accepted, kind === "checker", "accepted"),
        )),
      )),
    ),
    ...(!compact ? [el("details", { class: "loss-summary-help" },
      el("summary", {}, "How losses are counted"),
      el("p", {}, "Initial is your first submitted choice, before any revision. Accepted is the final played choice. Totals include evaluated decisions only; pending values update here automatically in computer games. Older first choices may be unrecorded."),
      el("p", {}, `Checker averages are per evaluated turn, including forced turns at zero loss and excluding passes. Cube mistakes exceed 0.002 ${summary.money ? "equity" : "normalized equity"}. ${summary.money ? "Loss totals and averages exclude the cube multiplier." : "Losses use normalized match equity, not PR."}`),
    )] : []),
  );
}
