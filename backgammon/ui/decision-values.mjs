// SPDX-License-Identifier: GPL-3.0-or-later
import { el } from "./shell.mjs";
import { equity, percentage } from "./analysis.mjs";
export function decisionValues(f, compact = false) {
  const rows = [
    ["Before", f.before],
    ["Your choice", f.actual],
    ["Best choice", f.best],
  ];
  if (compact)
    return el(
      "span",
      { class: "decision-values-compact" },
      ...rows.map(([label, c]) =>
        el(
          "span",
          {},
          el("span", { class: "muted" }, label),
          el("strong", {}, equity(c.equity)),
        ),
      ),
    );
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
