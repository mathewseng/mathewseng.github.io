// SPDX-License-Identifier: GPL-3.0-or-later
import {
  legalPaths,
  clone,
  applyStep,
  boardKey,
  commitTurn,
  canDouble,
} from "../core/rules.mjs";
import { all, put, get, itemRecord, recordPractice } from "../core/storage.mjs";
import {
  $,
  shell,
  el,
  button,
  field,
  select,
  DraftBoard,
  saveDialog,
  toast,
  showError,
  dialog,
  confirmDialog,
} from "../ui/shell.mjs";
import { AnalysisPanel, resultView, equity } from "../ui/analysis.mjs";
import { gradeCube } from "../engine/cube-grade.mjs";
const ui = shell("trainer", "Trainer", "One position. One decision.");
const analysis = new AnalysisPanel();
let catalog = [],
  pool = [],
  exercise = null,
  filter = location.hash === "#mistakes" ? "mistakes" : "mixed",
  count = 0,
  length = 5,
  revealed = false,
  hinted = false,
  result = null,
  answer = null,
  busy = false,
  preview = null;
const draft = new DraftBoard(ui.board, () => {
  actions();
  draftControls();
  savePractice();
});
try {
  const response = await fetch("../data/exercises.json");
  if (!response.ok)
    throw new Error("Practice positions could not load. Retry when connected.");
  catalog = (await response.json()).items;
  const groups = ["opening", "contact", "cube", "race", "bearoff"].map(
    (topic) => catalog.filter((i) => i.topic === topic),
  );
  catalog = [];
  while (groups.some((g) => g.length))
    for (const group of groups) if (group.length) catalog.push(group.shift());
  const saved = location.hash ? null : await get("work", "trainer");
  if (saved) {
    filter = saved.filter;
    length = saved.length;
  }
  await begin();
  if (saved && pool.some((i) => i.id === saved.exerciseId)) {
    count = saved.count;
    exercise = pool.find((i) => i.id === saved.exerciseId);
    revealed = !!saved.revealed;
    hinted = !!saved.hinted;
    result = saved.result;
    answer = saved.answer;
    draft.set(exercise.state, legalPaths(exercise.state), !revealed);
    draft.draft = saved.draft || [];
    render();
  }
} catch (e) {
  showError(e);
  $("message").textContent = e.message;
  $("actions").append(button("Retry", () => location.reload(), "primary"));
}
async function begin() {
  analysis.cancel();
  count = 0;
  const mistakes = (await all())
    .filter((i) => i.kind === "mistake" || i.tags.includes("exercise"))
    .map((i) => ({ ...i, topic: "mistakes" }));
  const progress = new Map((await all("progress")).map((p) => [p.id, p]));
  pool = (
    filter === "mistakes"
      ? mistakes
      : catalog.filter(
          (i) =>
            filter === "mixed" ||
            (filter === "checker" && i.state.phase === "move") ||
            i.topic === filter,
        )
  ).sort(
    (a, b) => (progress.get(a.id)?.due || 0) - (progress.get(b.id)?.due || 0),
  );
  if (!pool.length) {
    exercise = null;
    render();
    return;
  }
  await next();
}
async function next() {
  analysis.cancel();
  result = null;
  preview = null;
  revealed = false;
  hinted = false;
  answer = null;
  busy = false;
  exercise = pool[count % pool.length];
  draft.set(exercise.state, legalPaths(exercise.state), true);
  render();
}
function render() {
  if (!exercise) {
    $("message").textContent = "No saved exercises in this collection yet.";
    $("actions").replaceChildren(
      button(
        "Mixed practice",
        () => {
          filter = "mixed";
          begin();
        },
        "primary",
      ),
    );
    panel();
    return;
  }
  draft.preview = preview;
  draft.enabled = !revealed && !busy;
  draft.render();
  $("subtitle").textContent =
    `Decision ${count + 1} of ${length} · ${exercise.state.matchLength ? exercise.state.matchLength + "-point match" : "Unlimited points"} · ${exercise.state.phase === "double" ? "cube offered" : exercise.state.phase === "roll" ? "before roll" : "checker play"}`;
  actions();
  panel();
  savePractice();
}
function actions() {
  if (!exercise) return;
  const s = exercise.state,
    a = $("actions");
  a.replaceChildren();
  if (busy) {
    $("message").textContent = "Evaluating your decision with GNUbg…";
    a.append(
      button("Cancel", () => {
        analysis.cancel();
        busy = false;
        render();
      }),
    );
    return;
  }
  if (revealed) {
    $("message").textContent =
      `${hinted ? "Studied with a hint" : result.error < 0.005 ? "Equivalent at this setting" : `${equity(result.error)} equity below the best evaluated decision`}`;
    a.append(
      button("Save", () =>
        saveDialog(s, "mistake", {
          analysis: result,
          submitted: answer,
          tags: ["mistake", exercise.topic],
        }),
      ),
      button(
        count + 1 >= length ? "Finish session" : "Next decision",
        finishOrNext,
        "primary",
        { id: "next-exercise" },
      ),
    );
    return;
  }
  $("message").textContent =
    s.phase === "move"
      ? "Find your move, then submit."
      : s.phase === "double"
        ? "The cube is offered. Take or pass?"
        : "Would you double or roll?";
  if (s.phase === "move")
    a.append(
      button("Undo", () => draft.undo(), "", { disabled: !draft.draft.length }),
      button("Submit move", () => submit(clone(draft.draft)), "primary", {
        disabled: !draft.complete(),
        id: "submit-decision",
      }),
    );
  else if (s.phase === "double")
    a.append(
      button("Pass", () => submit("pass"), "", { id: "cube-pass" }),
      button("Take", () => submit("take"), "primary", { id: "cube-take" }),
    );
  else
    a.append(
      button("No double", () => submit("roll")),
      button("Double", () => submit("double"), "primary", {
        disabled: !canDouble(s),
      }),
    );
}
function panel() {
  const p = $("panel");
  p.replaceChildren(
    el("h2", {}, revealed ? "Decision review" : "Practice"),
    field(
      "Practice set",
      select(
        [
          ["mixed", "Mixed practice"],
          ["checker", "Checker play"],
          ["cube", "Cube decisions"],
          ["opening", "Opening play"],
          ["contact", "Contact"],
          ["race", "Race"],
          ["bearoff", "Bearoff"],
          ["mistakes", "Saved mistakes & exercises"],
        ],
        filter,
        (v) => {
          filter = v;
          begin();
        },
      ),
    ),
    field(
      "Session length",
      select(
        [
          [5, "5 decisions"],
          [10, "10 decisions"],
          [20, "20 decisions"],
        ],
        length,
        (v) => (length = Number(v)),
      ),
    ),
  );
  if (!exercise) {
    p.append(
      el(
        "p",
        { class: "muted" },
        "Save a mistake in Play or a position from Solver to build a personal review set.",
      ),
    );
    return;
  }
  if (!revealed) {
    p.append(
      el(
        "p",
        { class: "muted" },
        "Choose on the board. The answer stays hidden until you submit.",
      ),
      el("div", { id: "draft-controls" }),
      el(
        "div",
        { class: "row" },
        button("Hint", hint),
        button(
          "Skip",
          async () => {
            await recordPractice(exercise.id, { skip: true, hint: hinted });
            count++;
            count >= length ? finish() : next();
          },
          "ghost",
        ),
      ),
    );
    draftControls();
  }
  p.append(analysis.status);
  if (result && revealed) {
    p.append(
      resultView(result, {
        onPreview: (c) => {
          preview = c.steps.reduce(
            (s, step) => applyStep(s, step),
            exercise.state,
          );
          render();
        },
      }),
      button(
        "Original position",
        () => {
          preview = null;
          render();
        },
        "ghost",
      ),
      el(
        "p",
        { class: "muted small" },
        `Source: ${exercise.provenance?.kind || "your saved decision"}. Fresh on-device ${result.settings.name} analysis. ${exercise.reviewStatus || ""}`,
      ),
    );
    if (result.type === "checker")
      p.append(
        el("p", { class: "notice" }, observation(result.candidates[0].steps)),
      );
  }
}
function draftControls() {
  const p = $("draft-controls");
  if (p && exercise?.state.phase === "move")
    p.replaceChildren(field("Accessible move selection", draft.picker()));
}
function observation(steps) {
  const before = exercise.state,
    after = steps.reduce((s, st) => applyStep(s, st), before),
    hits = after.bar[1 - before.turn] - before.bar[1 - before.turn],
    off = after.off[before.turn] - before.off[before.turn];
  return hits
    ? `Observable result: the leading evaluated move hits ${hits} opposing checker${hits > 1 ? "s" : ""}. The equity comparison is the engine’s estimate.`
    : off
      ? `Observable result: the leading evaluated move bears off ${off} checker${off > 1 ? "s" : ""}.`
      : "Compare the resulting points and exposed blots on the board. The ranking is an engine estimate; no single strategic explanation is implied.";
}
async function submit(decision) {
  if (busy || revealed) return;
  busy = true;
  render();
  try {
    const s = exercise.state,
      answerResult = await analysis.run(s, {
        preset: "quick",
        submitted: Array.isArray(decision) ? decision : null,
      });
    if (answerResult.type === "cube") {
      Object.assign(answerResult, gradeCube(s, answerResult, decision));
    }
    result = answerResult;
    answer = decision;
    revealed = true;
    await recordPractice(exercise.id, { error: result.error, hint: hinted });
    if (!hinted && result.error > 0.04)
      await put(
        "items",
        itemRecord("mistake", {
          title: "Practice decision to revisit",
          state: clone(s),
          submitted: decision,
          analysis: result,
          tags: ["mistake", exercise.topic],
          provenance: exercise.provenance,
        }),
      );
  } catch (e) {
    if (e.name !== "AbortError") showError(e);
  } finally {
    busy = false;
    render();
  }
}
async function hint() {
  hinted = true;
  busy = true;
  render();
  try {
    const r = await analysis.run(exercise.state, { preset: "quick" });
    const clue = r.type === "checker" ? r.candidates[0].notation : r.action;
    toast(`GNUbg hint: ${clue}`);
    dialog(
      "Study hint",
      el(
        "p",
        {},
        `The leading Quick decision is ${clue}. This attempt will be recorded as assisted.`,
      ),
    );
  } catch (e) {
    if (e.name !== "AbortError") showError(e);
  } finally {
    busy = false;
    render();
  }
}
function finishOrNext() {
  count++;
  if (count >= length) finish();
  else next();
}
function finish() {
  analysis.cancel();
  $("message").textContent = `Session complete · ${count} decisions studied.`;
  $("actions").replaceChildren(button("Practice again", begin, "primary"));
  $("panel").replaceChildren(
    el("h2", {}, "Session complete"),
    el(
      "p",
      {},
      "Your actual attempts, hints, and skips are saved locally. Review due items in your next session.",
    ),
    button("Open Library", () => (location.href = "/backgammon/library/")),
  );
}

async function savePractice() {
  if (!exercise) return;
  try {
    await put("work", {
      id: "trainer",
      exerciseId: exercise.id,
      filter,
      length,
      count,
      draft: clone(draft.draft),
      revealed,
      hinted,
      answer,
      result,
    });
  } catch (e) {
    showError(e);
  }
}
addEventListener("beforeunload", (e) => {
  if (draft.draft.length && !revealed) {
    e.preventDefault();
    e.returnValue = "";
  }
});
document.querySelectorAll(".nav a,.brand,.site-link").forEach((a) =>
  a.addEventListener("click", (e) => {
    if (draft.draft.length && !revealed) {
      e.preventDefault();
      confirmDialog(
        "Leave this exercise?",
        "Your current practice draft is saved in this browser.",
        async () => {
          await savePractice();
          location.href = a.href;
        },
      );
    }
  }),
);
