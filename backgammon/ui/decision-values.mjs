// SPDX-License-Identifier: GPL-3.0-or-later
import { el } from "./shell.mjs";
import { equity, percentage } from "./analysis.mjs";
export function decisionValues(f, compact = false) {
  const bestPlayed = Math.abs(f.best.equity - f.actual.equity) <= 1e-7;
  const rows = [
    ["Before", f.before, "before"],
    ...(!bestPlayed ? [["Your choice", f.actual, "actual"]] : []),
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
  return el(
    "div",
    { class: "decision-values" },
    el(
      "table",
      {},
      el("caption", {}, "Decision comparison"),
      el(
        "thead",
        {},
        el(
          "tr",
          {},
          el("th", { scope: "col" }, "Position"),
          el("th", { scope: "col" }, "Equity"),
          el("th", { scope: "col" }, f.money ? "EV · points" : "Match win"),
        ),
      ),
      el(
        "tbody",
        {},
        ...rows.map(([label, c]) =>
          el(
            "tr",
            {},
            el("th", { scope: "row" }, label),
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
