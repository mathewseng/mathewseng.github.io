// SPDX-License-Identifier: GPL-3.0-or-later
import { el, field, select } from "./shell.mjs";
import { ruleGuide } from "../core/rule-guide.mjs";
import { rulesOf, ruleSummary } from "../core/rules.mjs";
export function ruleControls(matchLength, initial, change = () => {}) {
  let rules = rulesOf({ rules: initial });
  const summary = el("summary", {}, "Rules"),
    note = el("p", { class: "muted small" });
  const cube = el("input", { type: "checkbox", checked: rules.cube });
  const jacoby = el("input", { type: "checkbox", checked: rules.jacoby });
  const automatic = select(
    [
      [0, "Off"],
      [10, "Every opening tie · up to cube 1024"],
      ...Array.from({ length: 9 }, (_, i) => [i + 1,
        `At most ${i + 1} opening double${i ? "s" : ""}`]),
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

export function ruleReference(state) {
  return el("details", { class: "game-rules game-rule-reference", id: "game-rule-reference" },
    el("summary", {}, "All game rules"),
    el("dl", {}, ...ruleGuide(state).flatMap(([title, text]) => [
      el("dt", {}, title), el("dd", {}, text),
    ])),
  );
}
