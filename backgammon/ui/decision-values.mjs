// SPDX-License-Identifier: GPL-3.0-or-later
import { el, button } from "./shell.mjs";
import { equity, percentage } from "./analysis.mjs";
export function decisionValues(
  f,
  compact = false,
  { opponent = false, onChoice } = {},
) {
  const bestPlayed = Math.abs(f.best.equity - f.actual.equity) <= 1e-7;
  const rows = [
    ["Before", f.before, "before"],
    ...(!bestPlayed
      ? [[opponent ? "Opponent’s choice" : "Your choice", f.actual, "actual"]]
      : []),
    ["Best choice", f.best, "best"],
  ];
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
          "Before assumes the best continuation with the known dice or cube decision. Values use the decision maker’s perspective and original cube.",
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
        ["Before", f.before, "before"],
        ...f.choices.map((c) => {
          const best = Math.abs(c.equity - f.best.equity) <= 1e-7;
          const played = c.action === f.actual.action;
          const status = [
            best ? "Best choice" : "",
            played && !best
              ? opponent
                ? "Opponent’s choice"
                : "Your choice"
              : "",
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
        ),
      ),
      el(
        "tbody",
        {},
        ...tableRows.map(([label, c, kind]) =>
          el(
            "tr",
            {},
            el(
              "th",
              { scope: "row" },
              onChoice && kind !== "before"
                ? (() => {
                    const b = button(
                      "",
                      () => onChoice(c),
                      "review-cube-choice",
                      {
                        "aria-label": `${c.notation}: preview decision`,
                        "data-action": c.action,
                        "aria-pressed": false,
                      },
                    );
                    b.append(label);
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
      "Before assumes the best continuation with the known dice/cube decision, so it equals Best choice. All values use the same player, settings and original cube context.",
    ),
  );
}
export function lossLegend() {
  return el(
    "p",
    { class: "muted small" },
    "Loss colors: blue = best evaluated; green < 0.020; yellow < 0.050; orange < 0.100; red ≥ 0.100 equity. Display bands are not statistical certainty.",
  );
}
