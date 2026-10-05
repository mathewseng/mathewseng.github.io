// SPDX-License-Identifier: GPL-3.0-or-later
import { el, field, select } from "./shell.mjs";
import { rulesOf, ruleSummary } from "../core/rules.mjs";
export function ruleControls(matchLength, initial, change = () => {}) {
  let rules = rulesOf({ rules: initial });
  const summary = el("summary", {}, "Rules"),
    note = el("p", { class: "muted small" });
  const cube = el("input", { type: "checkbox", checked: rules.cube });
  const jacoby = el("input", { type: "checkbox", checked: rules.jacoby });
  const automatic = select(
    [
      [0, "Off · usual setting"],
      [1, "At most one opening double"],
      [2, "At most two opening doubles"],
      [3, "At most three opening doubles"],
    ],
    rules.automaticDoubles,
  );
  const immediate = select(
    [
      [0, "Off · usual setting"],
      [1, "Beavers"],
      [2, "Beavers and raccoons"],
    ],
    rules.immediateRedoubles,
  );
  const details = el(
    "details",
    { class: "game-rules" },
    summary,
    el(
      "div",
      { class: "stack" },
      el("label", { class: "check" }, cube, "Use doubling cube"),
      note,
      el("label", { class: "check" }, jacoby, "Jacoby rule"),
      el(
        "p",
        { class: "muted small" },
        "With Jacoby, gammons and backgammons count only after a double is accepted. Opening-tie doubles leave the cube centered.",
      ),
      field("Automatic opening doubles", automatic),
      field("Immediate redoubles", immediate),
      el(
        "p",
        { class: "muted small" },
        "A beaver accepts and immediately redoubles, retaining the cube. A raccoon is the original doubler's immediate redouble; the beaverer keeps ownership. Declining costs the stake already accepted.",
      ),
    ),
  );
  const sync = () => {
    const money = !matchLength && rules.cube;
    for (const input of [jacoby, automatic, immediate]) input.disabled = !money;
    cube.checked = rules.cube;
    jacoby.checked = rules.jacoby;
    automatic.value = rules.automaticDoubles;
    immediate.value = rules.immediateRedoubles;
    summary.textContent = "Rules · " + ruleSummary({ matchLength, rules });
    note.textContent = matchLength
      ? "Match play uses Crawford. Money-session options below are unavailable in matches."
      : "Unlimited session. Optional rules apply to both players and remain fixed for this session.";
  };
  for (const input of [cube, jacoby, automatic, immediate])
    input.addEventListener("change", () => {
      const money = !matchLength && cube.checked;
      rules = {
        cube: cube.checked,
        jacoby: money && jacoby.checked,
        automaticDoubles: money ? Number(automatic.value) : 0,
        immediateRedoubles: money ? Number(immediate.value) : 0,
      };
      sync();
      change(rules);
    });
  sync();
  return details;
}
