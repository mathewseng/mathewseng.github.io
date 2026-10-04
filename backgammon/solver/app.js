// SPDX-License-Identifier: GPL-3.0-or-later
import {
  initialState,
  clone,
  errors,
  assertState,
  legalPaths,
  legalTurns,
  positionKey,
  applyStep,
  replay,
  notation,
} from "../core/rules.mjs";
import { fromXGID, toXGID, shareURL } from "../core/xgid.mjs";
import { get, put, itemRecord, settings } from "../core/storage.mjs";
import {
  $,
  shell,
  el,
  button,
  field,
  select,
  DraftBoard,
  dialog,
  confirmDialog,
  saveDialog,
  toast,
  showError,
  copy,
} from "../ui/shell.mjs";
import { AnalysisPanel, resultView, equity } from "../ui/analysis.mjs";
import { gradeCube } from "../engine/cube-grade.mjs";
const ui = shell("solver", "Solver", "Edit a position. Explore the decision.");
let source = initialState({ phase: "move", dice: [3, 1], matchLength: 0 }),
  editing = false,
  brush = "ivory",
  result = null,
  preview = null,
  review = null,
  index = 0,
  reviewResults = new Map(),
  busy = false;
const analysis = new AnalysisPanel(),
  draft = new DraftBoard(ui.board, () => {});
const normalPoint = draft.board.onPoint;
draft.board.onPoint = (p) => (editing ? paint(p) : normalPoint(p));
const hash = new URLSearchParams(location.hash.slice(1)),
  params = new URLSearchParams(location.search);
try {
  if (hash.has("xgid")) source = fromXGID(hash.get("xgid"));
  else if (params.has("item")) {
    const item = await get("items", params.get("item"));
    if (!item) throw new Error("This item is not in this browser’s Library.");
    if (item.kind === "match") {
      review = item;
      index = 0;
      source = replay(item.initial, item.events)[0];
    } else source = clone(item.state);
  } else {
    const saved = await get("work", "solver");
    if (saved?.state) source = saved.state;
  }
} catch (e) {
  showError(e);
}
$("toolbar").prepend(
  button("Share", () => copy(shareURL(source)), "ghost"),
  button(
    "Save",
    () => saveDialog(source, "position", { analysis: result }),
    "ghost",
  ),
);
render();
function changed() {
  analysis.cancel();
  busy = false;
  result = null;
  preview = null;
  saveDraft();
  render();
}
async function saveDraft() {
  try {
    await put("work", { id: "solver", state: source });
  } catch (e) {
    showError(e);
  }
}
function render() {
  const problems = errors(source);
  draft.set(source, problems.length ? [] : legalPaths(source), false);
  draft.preview = preview;
  draft.render();
  if (editing) ui.board.render(source, { ...settings(), editor: true });
  $("subtitle").textContent = review
    ? `${review.title} · event ${index}/${review.events.length}`
    : preview
      ? "Alternative preview · source position preserved"
      : `${source.matchLength ? source.matchLength + "-point match" : "Unlimited points"} · ${source.dice.length ? source.dice.join("–") : "pre-roll"} · cube ${source.cube.value}`;
  $("message").textContent = problems.length
    ? problems.join(" ")
    : editing
      ? "Tap to place from off or return a checker to off."
      : preview
        ? "Preview only. Return to the source to edit."
        : result?.type === "checker"
          ? `Best evaluated: ${result.candidates[0].notation} · ${result.settings.name}`
          : result?.type === "cube"
            ? `GNUbg: ${result.action} · ${result.settings.name}`
            : "Analyze from the player-on-roll perspective.";
  $("message").classList.toggle("error", !!problems.length);
  $("actions").replaceChildren(
    button(
      editing ? "Done editing" : "Edit position",
      () => {
        editing = !editing;
        preview = null;
        render();
      },
      "",
      { id: "edit-position", disabled: !!review },
    ),
    button(
      busy ? "Cancel" : "Analyze",
      () => (busy ? cancel() : analyze()),
      "primary",
      {
        disabled:
          !!problems.length ||
          !["move", "roll", "double"].includes(source.phase),
        id: "analyze",
      },
    ),
  );
  if (preview)
    $("actions").prepend(
      button("Source", () => {
        preview = null;
        render();
      }),
    );
  $("panel-toggle").textContent = result ? "Results" : "Details";
  panel(problems);
}
function panel(problems) {
  const p = $("panel");
  p.replaceChildren(
    el(
      "div",
      { class: "segmented" },
      button(
        "Position",
        () => {
          if (review) {
            review = null;
            source = initialState({
              phase: "move",
              dice: [3, 1],
              matchLength: 0,
            });
            changed();
          }
        },
        "",
        { "aria-pressed": !review },
      ),
      button("Match review", () => importMatch(), "", {
        "aria-pressed": !!review,
      }),
    ),
  );
  if (review) {
    const timeline = select(
      replay(review.initial, review.events).map((s, i) => [
        String(i),
        i
          ? `${i}. ${review.events[i - 1].action.type} · ${s.phase}`
          : "Initial position",
      ]),
      String(index),
      (v) => seek(Number(v)),
    );
    p.append(
      field("Timeline", timeline),
      el(
        "div",
        { class: "row" },
        button("Previous", () => seek(Math.max(0, index - 1)), "", {
          disabled: index === 0,
        }),
        button(
          "Next",
          () => seek(Math.min(review.events.length, index + 1)),
          "",
          { disabled: index === review.events.length },
        ),
      ),
      button("Analyze remaining decisions", progressive),
      button("Show evaluated errors", showReviewErrors),
      el(
        "p",
        { class: "muted small" },
        "Errors use the chosen GNUbg settings. No XG performance-rating claim.",
      ),
    );
  }
  if (editing) {
    p.append(
      el("h2", {}, "Checker placement"),
      field(
        "Board tool",
        select(
          [
            ["ivory", "Place Ivory from off"],
            ["teal", "Place Teal from off"],
            ["remove", "Return checker to off"],
          ],
          brush,
          (v) => (brush = v),
        ),
      ),
      button("Edit exact point counts", pointDialog),
      button("Dice, cube & match context", contextDialog),
      el(
        "div",
        { class: "row" },
        button("Starting position", () =>
          confirmDialog(
            "Reset position?",
            "The current editable draft will be replaced.",
            () => {
              source = initialState({
                phase: "move",
                dice: [3, 1],
                matchLength: 0,
              });
              changed();
            },
          ),
        ),
        button("Clear board", () =>
          confirmDialog(
            "Clear board?",
            "Both sets of checkers move to their off trays. Place checkers to make a valid position.",
            () => {
              source.points = Array(24).fill(0);
              source.bar = [0, 0];
              source.off = [15, 15];
              changed();
            },
          ),
        ),
      ),
    );
  } else if (!review)
    p.append(button("Dice, cube & match context", contextDialog));
  p.append(
    el(
      "details",
      {},
      el("summary", {}, "Analysis settings"),
      analysis.controls(),
      el(
        "p",
        { class: "muted small" },
        "Deterministic cubeful evaluation; pruning enabled; no noise. Every legal result is evaluated at the same depth. Deeper work is a separate completed evaluation.",
      ),
    ),
    analysis.status,
  );
  if (result)
    p.append(
      resultView(result, {
        onPreview: (c) => {
          preview = c.steps.reduce((s, st) => applyStep(s, st), source);
          render();
        },
      }),
      button("Save as exercise", () =>
        saveDialog(source, "position", {
          analysis: result,
          tags: ["exercise"],
        }),
      ),
    );
  if (result?.actual || result?.actualDecision)
    p.append(
      el(
        "div",
        { class: "notice" },
        `Played move loss: ${equity(result.error)} normalized equity.`,
      ),
      button("Save this mistake", () =>
        saveDialog(source, "mistake", {
          analysis: result,
          submitted:
            review.events[index]?.action.steps ||
            review.events[index]?.action.type,
          tags: ["mistake"],
        }),
      ),
    );
  if (!review) p.append(button("Import / export XGID", xgidDialog));
  if (!problems.length && ["move", "roll", "double"].includes(source.phase))
    p.append(
      button("Play from this position", async () => {
        await put("work", { id: "study", state: clone(source) });
        location.href = "/backgammon/play/#study=1";
      }),
    );
}
function paint(raw) {
  let p = raw;
  const selected = brush === "ivory" ? 0 : 1,
    sg = selected === 0 ? 1 : -1;
  if (typeof p === "string") {
    if (!p.startsWith("bar"))
      return toast(
        "Use the bar or a board point; off checkers are the placement supply.",
      );
    const owner = Number(p.at(-1));
    if (brush === "remove") {
      if (source.bar[owner]) {
        source.bar[owner]--;
        source.off[owner]++;
      }
    } else if (owner === selected && source.off[selected] > 0) {
      source.bar[selected]++;
      source.off[selected]--;
    }
  } else if (brush === "remove") {
    if (source.points[p]) {
      const owner = source.points[p] > 0 ? 0 : 1;
      source.points[p] -= source.points[p] > 0 ? 1 : -1;
      source.off[owner]++;
    }
  } else if (source.points[p] * sg < 0)
    toast("Remove the opposing checkers first.");
  else if (source.off[selected] > 0) {
    source.points[p] += sg;
    source.off[selected]--;
  } else toast("No checkers in that off tray. Return one first.");
  changed();
}
function pointDialog() {
  const points = source.points.map((n, i) =>
    field(
      String(i + 1),
      el("input", {
        type: "number",
        min: -15,
        max: 15,
        value: n,
        "aria-label": `Canonical point ${i + 1}; positive Ivory, negative Teal`,
      }),
    ),
  );
  let d;
  d = dialog(
    "Exact checker counts",
    el(
      "div",
      { class: "stack" },
      el(
        "p",
        { class: "muted" },
        "Positive counts are Ivory; negative counts are Teal. Off counts are edited separately in context.",
      ),
      el("div", { class: "editor-grid" }, ...points),
    ),
    [
      button(
        "Apply draft",
        () => {
          source.points = points.map((l) =>
            Number(l.querySelector("input").value),
          );
          d.close();
          changed();
        },
        "primary",
      ),
    ],
  );
}
function contextDialog() {
  const input = (v, min, max) =>
    el("input", { type: "number", value: v, min, max });
  const turn = select(
      [
        ["0", "Ivory"],
        ["1", "Teal"],
      ],
      source.turn,
    ),
    phase = select(
      [
        ["move", "Rolled dice"],
        ["roll", "Before roll"],
        ["double", "Respond to double"],
      ],
      source.phase,
    );
  const d1 = input(source.dice[0] || 3, 1, 6),
    d2 = input(source.dice[1] || 1, 1, 6),
    cube = input(source.cube.value, 1, 1024),
    owner = select(
      [
        ["center", "Centered"],
        ["0", "Ivory"],
        ["1", "Teal"],
      ],
      source.cube.owner === null ? "center" : source.cube.owner,
    ),
    len = input(source.matchLength, 0, 25),
    score = source.scores.map((v) => input(v, 0, 100000)),
    bar = source.bar.map((v) => input(v, 0, 15)),
    off = source.off.map((v) => input(v, 0, 15));
  const crawford = el("input", { type: "checkbox", checked: source.crawford }),
    played = el("input", { type: "checkbox", checked: source.crawfordPlayed }),
    useCube = el("input", { type: "checkbox", checked: source.rules.cube });
  let d;
  d = dialog(
    "Decision context",
    el(
      "div",
      { class: "stack" },
      el(
        "div",
        { class: "pair" },
        field("Player on roll / doubler", turn),
        field("Decision", phase),
      ),
      el(
        "div",
        { class: "pair" },
        field("First die", d1),
        field("Second die", d2),
      ),
      el(
        "div",
        { class: "pair" },
        field("Cube value", cube),
        field("Cube owner", owner),
      ),
      field("Match length (0 = unlimited)", len),
      el(
        "div",
        { class: "pair" },
        ...score.map((n, i) => field(`${i ? "Teal" : "Ivory"} score`, n)),
      ),
      el(
        "div",
        { class: "pair" },
        ...bar.map((n, i) => field(`${i ? "Teal" : "Ivory"} on bar`, n)),
      ),
      el(
        "div",
        { class: "pair" },
        ...off.map((n, i) => field(`${i ? "Teal" : "Ivory"} off`, n)),
      ),
      el("label", { class: "check" }, crawford, "Crawford game"),
      el("label", { class: "check" }, played, "Crawford already played"),
      el("label", { class: "check" }, useCube, "Use doubling cube"),
    ),
    [
      button(
        "Apply context",
        () => {
          source = {
            ...source,
            turn: Number(turn.value),
            phase: phase.value,
            dice: phase.value === "move" ? [+d1.value, +d2.value] : [],
            cube: {
              value: +cube.value,
              owner: owner.value === "center" ? null : +owner.value,
            },
            matchLength: +len.value,
            scores: score.map((n) => +n.value),
            bar: bar.map((n) => +n.value),
            off: off.map((n) => +n.value),
            crawford: crawford.checked,
            crawfordPlayed: played.checked,
            rules: { cube: useCube.checked, jacoby: false },
            pending:
              phase.value === "double"
                ? { type: "double", by: Number(turn.value) }
                : null,
          };
          d.close();
          changed();
        },
        "primary",
      ),
    ],
  );
}
function xgidDialog() {
  let value = "";
  try {
    value = toXGID(source);
  } catch {}
  const text = el("textarea", {
    value,
    spellcheck: false,
    "aria-label": "XGID",
  });
  let d;
  d = dialog(
    "XGID position",
    el(
      "div",
      { class: "stack" },
      text,
      el(
        "p",
        { class: "muted small" },
        "Verified standard XGID: board, dice, turn, cube, scores and Crawford. Jacoby and beavers are rejected.",
      ),
    ),
    [
      button("Copy XGID", () => copy(toXGID(source))),
      button(
        "Import",
        () => {
          source = fromXGID(text.value);
          d.close();
          changed();
        },
        "primary",
      ),
    ],
  );
}
async function analyze() {
  busy = true;
  preview = null;
  render();
  const key = positionKey(source);
  try {
    const event = review?.events[index];
    const answer = await analysis.run(source, {
      submitted: event?.action.type === "move" ? event.action.steps : null,
    });
    if (key !== positionKey(source)) return;
    if (
      answer.type === "cube" &&
      event &&
      ["roll", "double", "take", "pass"].includes(event.action.type)
    )
      Object.assign(answer, gradeCube(source, answer, event.action.type));
    result = answer;
    if (review) reviewResults.set(index, answer);
  } catch (e) {
    if (e.name !== "AbortError") showError(e);
  } finally {
    busy = false;
    render();
  }
}
function cancel() {
  analysis.cancel();
  busy = false;
  render();
}
function seek(i) {
  analysis.cancel();
  index = i;
  source = clone(replay(review.initial, review.events)[i]);
  result = reviewResults.get(i) || null;
  preview = null;
  busy = false;
  render();
}
function importMatch() {
  const input = el("input", {
    type: "file",
    accept: ".json,.mat,text/plain,application/json",
  });
  let d;
  d = dialog(
    "Open a match",
    el(
      "div",
      { class: "stack" },
      el(
        "p",
        {},
        "Choose an app match JSON or a standard text .mat file. Saved matches also open from the Library.",
      ),
      input,
    ),
    [
      button(
        "Import match",
        async () => {
          const file = input.files[0];
          if (!file) throw new Error("Choose a file.");
          if (file.size > 2 * 1024 * 1024)
            throw new Error("Match file exceeds 2 MB.");
          const text = await file.text();
          if (file.name.toLowerCase().endsWith(".mat")) {
            const { parseMAT } = await import("../core/mat.mjs");
            review = parseMAT(text);
          } else {
            const parsed = JSON.parse(text);
            if (parsed.kind !== "match")
              throw new Error("Expected a single app match record.");
            replay(parsed.initial, parsed.events);
            review = parsed;
          }
          index = 0;
          source = clone(review.initial);
          d.close();
          changed();
        },
        "primary",
      ),
    ],
  );
}
async function progressive() {
  if (!review) return;
  busy = true;
  render();
  const states = replay(review.initial, review.events);
  try {
    for (let i = index; i < review.events.length; i++) {
      if (!["move", "roll", "double"].includes(states[i].phase)) continue;
      const event = review.events[i];
      if (
        !["move", "double", "roll", "take", "pass"].includes(event.action.type)
      )
        continue;
      const answer = await analysis.engine.analyze(states[i], {
        preset: analysis.preset,
        submitted: event.action.type === "move" ? event.action.steps : null,
        priority: 0,
      });
      if (answer.type === "cube")
        Object.assign(answer, gradeCube(states[i], answer, event.action.type));
      reviewResults.set(i, answer);
      analysis.status.textContent = `Completed ${reviewResults.size} decisions · event ${i + 1}/${review.events.length}`;
      if (!busy) break;
    }
  } catch (e) {
    if (e.name !== "AbortError") showError(e);
  }
  busy = false;
  render();
}
function showReviewErrors() {
  const rows = [...reviewResults.entries()]
    .filter(([, r]) => r.error > 0.005)
    .map(([i, r]) =>
      button(
        `Event ${i + 1} · ${r.type === "cube" ? "cube" : "checker"} loss ${equity(r.error)}`,
        () => {
          d.close();
          seek(i);
        },
        "list-row",
      ),
    );
  const d = dialog(
    "Evaluated decision errors",
    el(
      "div",
      { class: "stack" },
      ...(rows.length
        ? rows
        : [
            el(
              "p",
              {},
              "No evaluated errors above 0.005. Analyze decisions to populate this view.",
            ),
          ]),
    ),
  );
}
