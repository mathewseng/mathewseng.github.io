// SPDX-License-Identifier: GPL-3.0-or-later
import { el, button } from "./shell.mjs";
import { equity, percentage } from "./analysis.mjs";
import { lossTone } from "../core/decision-feedback.mjs";
export function decisionValues(
  f,
  compact = false,
  { opponent = false, onChoice, onPosition, showLoss = false } = {},
) {
  const bestPlayed = Math.abs(f.best.equity - f.actual.equity) <= 1e-7;
  const seen = new Set();
  const rows = [
    ["Best equity", f.before, "before"],
    ...(!bestPlayed
      ? [[opponent ? "Opponent’s choice" : "Your choice", f.actual, "actual"]]
      : []),
    ["Best choice", f.best, "best"],
  ].filter(([, choice]) => {
    // Compare the visible precision, not raw engine floats: two evaluations
    // that both print +0.123 should never occupy duplicate summary columns.
    const value = equity(choice.equity);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
  if (compact) {
    const grid = el(
      "span",
      { class: "decision-value-grid" },
      ...rows.map(([label, c, kind]) =>
        el(
          "span",
          { class: "decision-value", "data-value-kind": kind },
          el("span", { class: "muted" }, label),
          el("strong", {}, equity(c.equity)),
        ),
      ),
    );
    grid.style.setProperty("--value-columns", rows.length);
    return el(
      "span",
      {
        class: "decision-values-compact",
        role: "group",
        "aria-label": "Decision equity comparison",
        "data-loss-tone": f.tone,
        "data-best-played": bestPlayed ? "true" : "false",
        title:
          "Best equity is the best evaluated continuation with the known dice or cube decision. Values use the decision maker’s perspective and original cube.",
      },
      el(
        "span",
        { class: "decision-value-caption muted" },
        `Equity · ${f.money ? "current-cube points" : "normalized match equity"}`,
      ),
      grid,
    );
  }
  const tableRows = f.choices
    ? [
        ["Best equity", f.before, "before"],
        ...f.choices.map((c) => {
          const best = Math.abs(c.equity - f.best.equity) <= 1e-7;
          const played = c.action === f.actual.action;
          const playedLabel = showLoss ? "Played" : opponent ? "Opponent’s choice" : "Your choice";
          const status = [
            played && (showLoss || !best) ? playedLabel : "",
            best ? (showLoss ? "Best" : "Best choice") : "",
          ].filter(Boolean);
          return [
            el(
              "span",
              {},
              c.notation,
              ...(status.length
                ? [
                    el(
                      "span",
                      { class: "cube-option-status muted small" },
                      status.join(" · "),
                    ),
                  ]
                : []),
            ),
            c,
            played ? "actual" : "alternative",
          ];
        }),
      ]
    : rows;
  return el(
    "div",
    {
      class: "decision-values",
      ...(f.choices ? { "data-cube-options": "" } : {}),
      ...(showLoss ? { "data-cube-loss": "" } : {}),
    },
    el(
      "table",
      {},
      el("caption", {}, f.choices ? "Cube options" : "Decision comparison"),
      el(
        "thead",
        {},
        el(
          "tr",
          {},
          el("th", { scope: "col" }, f.choices ? "Decision" : "Position"),
          el("th", { scope: "col" }, "Equity"),
          el("th", { scope: "col" }, f.money ? "EV · points" : "Match win"),
          ...(showLoss ? [el("th", { scope: "col" }, "EV Loss")] : []),
        ),
      ),
      el(
        "tbody",
        {},
        ...tableRows.map(([label, c, kind]) =>
          el(
            "tr",
            showLoss && kind === "actual" ? { "data-played": "" } : {},
            el(
              "th",
              { scope: "row" },
              onChoice && (kind !== "before" || onPosition)
                ? (() => {
                    const b = button(
                      "",
                      () => kind === "before" ? onPosition() : onChoice(c),
                      "review-cube-choice",
                      {
                        "aria-label": kind === "before" ? "Position" : `${c.notation}: preview decision`,
                        "data-action": kind === "before" ? "position" : c.action,
                        "aria-pressed": false,
                      },
                    );
                    b.append(kind === "before" ? "Position" : label);
                    return b;
                  })()
                : label,
            ),
            el("td", {}, equity(c.equity)),
            el(
              "td",
              {},
              f.money
                ? equity(c.ev)
                : Number.isFinite(c.mwc)
                  ? percentage(c.mwc)
                  : "—",
            ),
            ...(showLoss ? [el("td", { "data-loss-tone": lossTone(Math.max(0, f.best.equity - c.equity)).tone },
              kind === "before" ? "—" : Math.max(0, f.best.equity - c.equity).toFixed(3))] : []),
          ),
        ),
      ),
    ),
    el(
      "p",
      { class: "muted small" },
      f.money
        ? `Equity uses the original cube (${f.cube}). EV is expected session points: equity × ${f.cube}, including cube changes.`
        : "Equity is normalized match equity. Match win is a probability; money EV does not apply.",
    ),
    el(
      "p",
      { class: "muted small" },
      "Best equity is the best evaluated continuation with the known dice or cube decision. Repeated summary values are shown once. All values use the same player, settings and original cube context.",
    ),
  );
}
export function lossLegend(recordingReview = false) {
  return el(
    "p",
    { class: "muted small" },
    recordingReview
      ? "Loss colors run from green at zero through teal, gold, orange and red at 0.100 equity or more."
      : "Loss colors: blue = best evaluated; green < 0.020; yellow < 0.050; orange < 0.100; red ≥ 0.100 equity. Display bands are not statistical certainty.",
  );
}
