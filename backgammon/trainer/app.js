// SPDX-License-Identifier: GPL-3.0-or-later
import { presentAnalysis } from "../core/move-presentation.mjs";
import { startUpdates, resumedAfterUpdate, isUpdateReload } from "../ui/updates.mjs";
import { readPageProgress, keepPageProgress } from "../ui/page-progress.mjs";
import { moveTrace } from "../core/move-trace.mjs";
import {
  legalPaths,
  clone,
  applyStep,
  boardKey,
  commitTurn,
  canDouble,
  canImmediateRedouble,
  offerDepth,
  offerName,
  decisionPlayer,
  playerName,
  ruleSummary,
} from "../core/rules.mjs";
import {
  all,
  practiceItems,
  put,
  get,
  itemRecord,
  recordPractice,
} from "../core/storage.mjs";
import { sound } from "../ui/sound.mjs";
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
  hideCardButton,
} from "../ui/shell.mjs";
import { AnalysisPanel, resultView, equity } from "../ui/analysis.mjs";
import { StudyStrip, closeStudyPanel } from "../ui/study-strip.mjs";
import { decisionFeedback, lossTone } from "../core/decision-feedback.mjs";
import { decisionValues, lossLegend } from "../ui/decision-values.mjs";
import { gradeCube } from "../engine/cube-grade.mjs";

// Let the document finish loading while the service-worker gate runs.
// Only start the tool after the gate has finished or allowed offline use.
async function boot() {
await startUpdates();
resumedAfterUpdate();
const pageProgress = readPageProgress();
const ui = shell("trainer", "Trainer");
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
  preview = null,
  previewIndex = -1;
// Per-decision results of this visit, for the progress stepper and the
// session summary (in memory only: the stored practice record is unchanged).
let sessionLog = [];
const LOSS_THRESHOLD = 0.02;
const steps = el("ol", { class: "trainer-steps", "aria-label": "Session progress" });
$("subtitle").after(steps);
const summaryCard = el("section", { class: "bg-result-card trainer-summary", hidden: true, "aria-label": "Session summary" });
ui.board.container.append(summaryCard);
const draft = new DraftBoard(ui.board, () => {
  actions();
  draftControls();
  savePractice();
});
const study = new StudyStrip(previewCandidate);
const practiceHelp = el("div", { class: "trainer-help", role: "group", hidden: true, "aria-label": "Practice help" });
document.querySelector(".action-main").prepend(practiceHelp);
function previewCandidate(candidate) {
  previewIndex = candidate && result?.candidates
    ? result.candidates.findIndex((c) => JSON.stringify(c.steps) === JSON.stringify(candidate.steps))
    : -1;
  preview = candidate
    ? candidate.steps.reduce((s, st) => applyStep(s, st), exercise.state)
    : clone(exercise.state);
  draft.previewTrace = candidate ? { state: preview, trace: moveTrace(preview, exercise.state.turn, candidate.steps, exercise.state.dice) } : null;
  render();
  closeStudyPanel();
}
try {
  const response = await fetch("../data/exercises.json");
  if (!response.ok)
    throw new Error(
      "Practice positions could not load. Retry when connected.",
    );
  catalog = (await response.json()).items;
  const groups = ["opening", "contact", "cube", "race", "bearoff"].map(
    (topic) => catalog.filter((i) => i.topic === topic),
  );
  catalog = [];
  while (groups.some((g) => g.length))
    for (const group of groups)
      if (group.length) catalog.push(group.shift());
  const saved = pageProgress || (location.hash ? null : await get("work", "trainer"));
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
    result = presentAnalysis(exercise.state, saved.result);
    answer = saved.answer;
    if (result?.type === "cube" && answer)
      result = gradeCube(exercise.state, result, answer);
    draft.set(exercise.state, legalPaths(exercise.state), !revealed);
    draft.draft = saved.draft || [];
    render();
  }
} catch (e) {
  showError(e);
  $("message").textContent = e.message;
  $("actions").append(button("Retry", () => location.reload(), "primary"));
}
keepPageProgress(() =>
  exercise
    ? {
        exerciseId: exercise.id,
        filter,
        length,
        count,
        draft: clone(draft.draft),
        revealed,
        hinted,
        answer,
        result,
      }
    : null,
);
async function begin() {
  analysis.cancel();
  count = 0;
  sessionLog = [];
  summaryCard.hidden = true;
  const mistakes = (await practiceItems())
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
    (a, b) =>
      (progress.get(a.id)?.due || 0) - (progress.get(b.id)?.due || 0),
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
  previewIndex = -1;
  revealed = false;
  hinted = false;
  answer = null;
  busy = false;
  summaryCard.hidden = true;
  exercise = pool[count % pool.length];
  draft.set(exercise.state, legalPaths(exercise.state), true);
  render();
}
function render() {
  study.set(exercise && revealed ? result : null, preview || (revealed ? draft.current() : null));
  $("panel-toggle").textContent = revealed ? "Results" : "Practice";
  ui.equityBar.set({
    state: exercise?.state,
    result: revealed ? result : null,
    blocked: !revealed
      ? "Equity stays hidden until you submit or reveal the answer."
      : preview && exercise && boardKey(preview) !== boardKey(exercise.state)
        ? "Return to the original position to see decision equity."
        : "",
  });
  if (!exercise) {
    practiceHelp.hidden = true;
    draft.enabled = false;
    draft.render();
    $("subtitle").textContent = "Saved practice";
    steps.replaceChildren();
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
    `${count + 1} of ${length} · ${exercise.state.matchLength ? exercise.state.matchLength + "-point match" : "Unlimited points"}`;
  renderSteps();
  actions();
  panel();
  savePractice();
}
function draftLine() {
  // #message already says when the move is ready; the shell line would repeat
  // it. Keep it for the undo lesson and the shell's own hints, and clear it
  // once the decision is revealed.
  const line = $("draft-line");
  if (!exercise || busy || revealed || exercise.state.phase !== "move") line.textContent = "";
  else if (!draft.hint && draft.draft.length && draft.complete())
    line.textContent = "Tap a used die to undo its move.";
}
function actions() {
  draftLine();
  practiceHelp.replaceChildren();
  practiceHelp.hidden = !exercise || busy || revealed;
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
  const instruction =
    s.phase === "move"
      ? "Find your move, then submit."
      : s.phase === "double"
        ? `${offerName(s)} to ${s.cube.value * 2}. ${playerName(decisionPlayer(s))} to decide.`
        : "Would you double or roll?";
  $("message").replaceChildren(s.phase === "move"
    ? draft.progressMessage(instruction, "Ready to submit") : instruction);
  practiceHelp.append(button("Hint", hint, "ghost"));
  if (s.phase === "move")
    practiceHelp.append(
      button("Undo", () => draft.undo(), "", {
        disabled: !draft.draft.length,
      }),
      button("Reset", () => draft.reset(), "", {
        disabled: !draft.draft.length,
        id: "reset-draft",
      }),
    );
  practiceHelp.append(button("Skip", skip, "ghost"));
  if (s.phase === "move")
    a.append(
      button("Submit move", () => submit(clone(draft.draft)), "primary", {
        disabled: !draft.complete(),
        id: "submit-decision",
      }),
    );
  else if (s.phase === "double")
    a.append(
      button("Pass", () => submit("pass"), "", { id: "cube-pass" }),
      button("Take", () => submit("take"), "primary", { id: "cube-take" }),
      ...(canImmediateRedouble(s)
        ? [
            button(offerDepth(s) ? "Raccoon" : "Beaver", () =>
              submit(offerDepth(s) ? "raccoon" : "beaver"),
            ),
          ]
        : []),
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
  const resultSlot = el("div", { class: "trainer-result-slot" });
  p.replaceChildren(
    el("h2", {}, revealed ? "Decision review" : "Practice"),
    resultSlot,
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
    resultSlot.remove();
    p.append(
      el(
        "p",
        { class: "muted" },
        "Save a mistake in Play or a position from Solver to build a personal review set.",
      ),
    );
    return;
  }
  p.append(
    el(
      "p",
      { class: "muted small", id: "practice-rules" },
      ruleSummary(exercise.state),
    ),
  );
  if (!revealed) {
    p.append(el("div", { id: "draft-controls" }));
    draftControls();
  }
  // The engine status matters while it runs or once a result is shown; before
  // a submission it would only echo a cancelled prefetch.
  if (busy || revealed) p.append(analysis.status);
  if (!(result && revealed)) resultSlot.remove();
  if (result && revealed) {
    const f = decisionFeedback(result, exercise.state);
    const bestPlayed = Math.abs(f.best.equity - f.actual.equity) <= 1e-7;
    const row = (label, name, value, extra = null) =>
      el(
        "div",
        { class: "list-row" },
        el("span", { class: "list-row-label" }, label),
        el("span", { class: "list-row-value" }, value),
        el("span", { class: "list-row-sub" }, name),
        ...(extra ? [extra] : []),
      );
    // The result card: best, yours and the loss, then the full comparison.
    resultSlot.replaceWith(
      el(
        "section",
        { class: "trainer-result", "aria-label": "Your result" },
        el(
          "p",
          { class: "decision-loss", "data-loss-tone": f.tone },
          `${f.label} ${f.value} · ${f.quality}${hinted ? " · with a hint" : ""}`,
        ),
        el(
          "div",
          { class: "list trainer-result-rows", "data-loss-tone": f.tone },
          row("Best", f.best.notation || "", equity(f.best.equity)),
          row(
            "Yours",
            bestPlayed ? "Same as the best evaluated decision" : f.actual.notation || "",
            equity(f.actual.equity),
          ),
        ),
        el(
          "details",
          { class: "trainer-equity-details" },
          el("summary", {}, "Equity & EV details"),
          decisionValues(f, true),
          decisionValues(f),
          lossLegend(),
        ),
      ),
    );
    p.append(
      resultView(result, {
        onPreview: previewCandidate,
        selected: previewIndex,
      }),
      button(
        "Original position",
        () => {
          preview = clone(exercise.state);
          previewIndex = -1;
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
        el(
          "p",
          { class: "notice" },
          observation(result.candidates[0].steps),
        ),
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
    sound.play("confirm");
    await recordPractice(exercise.id, {
      error: result.error,
      hint: hinted,
    });
    const savedMistake = !hinted && result.error > 0.04;
    sessionLog[count] = { topic: exercise.topic, error: result.error, hinted, saved: savedMistake };
    if (savedMistake)
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
async function skip() {
  if (busy || revealed || !exercise) return;
  await recordPractice(exercise.id, { skip: true, hint: hinted });
  sessionLog[count] = { topic: exercise.topic, skipped: true, hinted };
  count++;
  count >= length ? finish() : next();
}
async function hint() {
  if (busy || revealed || !exercise) return;
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
  study.set(null);
  practiceHelp.hidden = true;
  draft.enabled = false;
  draft.render();
  $("message").textContent =
    `Session complete · ${count} decisions studied.`;
  $("actions").replaceChildren(button("Practice again", begin, "primary"));
  renderSteps(true);
  const s = sessionSummary();
  const stat = (label, value) =>
    el("div", { class: "stat" }, el("span", { class: "stat-label" }, label), el("strong", { class: "stat-value" }, value));
  const stats = () =>
    el(
      "div",
      { class: "stat-strip trainer-summary-stats" },
      stat("Average loss", s.answered ? s.average.toFixed(3) : "—"),
      stat(`Within ${LOSS_THRESHOLD.toFixed(3)}`, `${s.within} of ${s.answered}`),
      stat("Hints", String(s.hints)),
      stat("Skips", String(s.skips)),
      stat("Mistakes saved", String(s.saved)),
    );
  summaryCard.replaceChildren(
    hideCardButton(summaryCard, "Hide the summary to see the board"),
    el("p", { class: "bg-result-kind" }, "Session complete"),
    el("h2", {}, `${count} decision${count === 1 ? "" : "s"} studied`),
    stats(),
    ...(s.recorded < count
      ? [el("p", { class: "muted small" }, `${count - s.recorded} earlier decision${count - s.recorded === 1 ? " was" : "s were"} answered before this page loaded and ${count - s.recorded === 1 ? "is" : "are"} not in this summary.`)]
      : []),
  );
  summaryCard.hidden = false;
  $("panel").replaceChildren(
    el("h2", {}, "Session complete"),
    stats(),
    el(
      "div",
      { class: "list trainer-summary-rows", "aria-label": "Decisions this session" },
      ...sessionLog.flatMap((entry, i) =>
        entry
          ? [el(
              "div",
              { class: "list-row", "data-loss-tone": entry.skipped ? "skipped" : lossTone(entry.error).tone },
              el("span", { class: "list-row-label" }, `${i + 1} · ${TOPICS[entry.topic] || entry.topic || "Decision"}`),
              el("span", { class: "list-row-value" }, entry.skipped ? "Skipped" : entry.error.toFixed(3)),
              el("span", { class: "list-row-sub" }, entry.skipped ? (entry.hinted ? "After a hint" : "No answer") : `${lossTone(entry.error).label}${entry.hinted ? " · hint" : ""}${entry.saved ? " · saved to Library" : ""}`),
            )]
          : [],
      ),
    ),
    el(
      "p",
      { class: "muted small" },
      "Your actual attempts, hints, and skips are saved locally. Review due items in your next session.",
    ),
    button("Open Library", () => (location.href = "/backgammon/library/")),
  );
}
const TOPICS = {
  opening: "Opening", contact: "Contact", cube: "Cube", race: "Race",
  bearoff: "Bearoff", mistakes: "Saved decision",
};
function sessionSummary() {
  const entries = sessionLog.filter(Boolean),
    answered = entries.filter((e) => !e.skipped);
  return {
    recorded: entries.length,
    answered: answered.length,
    average: answered.reduce((n, e) => n + e.error, 0) / (answered.length || 1),
    within: answered.filter((e) => e.error < LOSS_THRESHOLD).length,
    hints: entries.filter((e) => e.hinted).length,
    skips: entries.filter((e) => e.skipped).length,
    saved: entries.filter((e) => e.saved).length,
  };
}
// The progress stepper in the tool head: one step per decision, toned by
// the recorded result (with a text label, never colour alone).
function renderSteps(done = false) {
  steps.replaceChildren(
    ...Array.from({ length }, (_, i) => {
      const entry = sessionLog[i],
        current = !done && i === count,
        state = entry
          ? entry.skipped ? "skipped" : lossTone(entry.error).tone
          : i < count || done ? "done" : current ? "current" : "upcoming";
      const label = entry
        ? entry.skipped ? "skipped" : `${lossTone(entry.error).label.toLowerCase()}, ${entry.error.toFixed(3)} lost`
        : i < count ? "answered" : current ? "current decision" : "not started";
      return el(
        "li",
        { "data-step": state, ...(current ? { "aria-current": "step" } : {}) },
        el("span", { class: "sr-only" }, `Decision ${i + 1}: ${label}`),
      );
    }),
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
  if (!isUpdateReload() && draft.draft.length && !revealed) {
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
        { verb: "Leave" },
      );
    }
  }),
);

document.documentElement.dataset.appReady = "true";
}
boot();
