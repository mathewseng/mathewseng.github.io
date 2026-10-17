// SPDX-License-Identifier: GPL-3.0-or-later
import { presentMove } from "../core/move-presentation.mjs";
import { keycap as shortcutBadge } from "../ui/keycap.mjs";
import { startUpdates, resumedAfterUpdate, isUpdateReload } from "../ui/updates.mjs";
import { readPageProgress, keepPageProgress } from "../ui/page-progress.mjs";
import {
  initialState,
  legalPaths,
  transition,
  cryptoDice,
  canDouble,
  notation,
  positionKey,
  boardKey as checkerKey,
  clone,
  playerName,
  decisionPlayer,
  ruleSummary,
  canImmediateRedouble,
  offerDepth,
  offerName,
} from "../core/rules.mjs";
import {
  get,
  put,
  itemRecord,
  settings,
  saveSettings,
  saveMatchHistory,
  download,
} from "../core/storage.mjs";
import {
  forcedTurn,
  blockedBarRoll,
  draftAutomation,
  takebackTarget,
  undoTurn,
} from "../core/table.mjs";
import {
  defaultPlayRules,
  localConfig,
  humanControls,
  changeControl,
  studyGame,
  lastMove,
} from "../core/play-session.mjs";
import { shareURL } from "../core/xgid.mjs";
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
import { AnalysisPanel } from "../ui/analysis.mjs";
import { decisionReview } from "../ui/decision-review.mjs";
import { gradeCube } from "../engine/cube-grade.mjs";
import {
  decisionHistory,
  groupDecisionTurns,
  compactEvaluation,
  sameDecisionPrefix,
} from "../core/decision-history.mjs";
import { sessionReview } from "../ui/session-review.mjs";
import { historyExplorer } from "../ui/history-tree.mjs";
import { returnToHistory } from "../core/history-tree.mjs";
import { AutoReview } from "../core/auto-review.mjs";
import { Prethink } from "../core/prethink.mjs";
import { certainBearoff } from "../core/certain-bearoff.mjs";
import { ensureLocalRolls, localPlayAction, futureLocalRoll } from "../core/local-rolls.mjs";
import { decisionValues } from "../ui/decision-values.mjs";
import { decisionFeedback, needsRevisionWarning } from "../core/decision-feedback.mjs";
import { PRESETS, SEARCH_OPTIONS, searchName, SEARCH_DESCRIPTION } from "../engine/metadata.mjs";
import { Online } from "./network.mjs";
import { ruleControls, ruleReference } from "../ui/rules.mjs";
import { OpeningRoll } from "../ui/opening-roll.mjs";
import { sound } from "../ui/sound.mjs";
import {
  practiceTarget,
  replacePracticeRoll,
  returnToDecision,
} from "../core/practice.mjs";
import { installPlayShortcuts, decorateShortcuts } from "../ui/shortcuts.mjs";
import { reducedMotion } from "../ui/motion.mjs";
import { preferences } from "../ui/shell.mjs";

// Let the document finish loading while the service-worker gate runs.
// Only start the tool after the gate has finished or allowed offline use.
async function boot() {
await startUpdates();
const updatedOnLoad = resumedAfterUpdate();
const pageProgress = readPageProgress();
const ui = shell("play", "Play", "Your table. Your pace.");
document.querySelector(".app").classList.add("play-page");
let setupStudyOpen;
let config = {
    rules: defaultPlayRules(0),
    mode: "computer",
    humanSide: 0,
    matchLength: 0,
    strength: "auto",
    reviewStrength: "auto",
    tutor: settings().moveFeedback === true,
    warning: true,
    name: "You",
    opponent: "Friend",
  },
  game = null,
  boardKey = "",
  botBusy = false,
  botPaused = false,
  feedback = null,
  renderedFeedback = null,
  netStatus = "Not connected",
  saved = null,
  persistedWork = null,
  committing = false,
  leaving = false,
  lastMotion = "",
  renderedGameId = null,
  assistanceJob = null,
  lastUndoNotice = null,
  epoch = 0;
const boardWorkspace = el("div", { class: "board-workspace" });
const draftKeys = el("div", { class: "draft-shortcuts", "aria-label": "Draft keyboard shortcuts" });
const boardActions = el("div", { class: "board-actions", "aria-label": "Turn confirmation" });
ui.board.container.before(boardWorkspace);
boardWorkspace.append(ui.board.container, boardActions);
let openingTimer = null, openingSchedule = "", forcedSchedule = "";
let acceptedCubeTimer = null, acceptedCubeKey = "";
let draftSaveFrame = null, draftSaveTimer = null;
const analysis = new AnalysisPanel();
const autoReview = new AutoReview({
  engine: analysis.engine,
  model: () => game,
  idle: () => !document.hidden && !leaving && !botBusy && !committing && !assistanceJob && !opening.active,
  save: () => persist(),
  changed: () => {
    renderedFeedback = null;
    renderFeedback();
    renderReviewStatus();
  },
});
const feedbackStrip = el("div", {
  class: "play-feedback",
  id: "move-feedback",
  role: "region",
  "aria-label": "Decision history",
  hidden: true,
});
document.querySelector(".action-area").append(feedbackStrip);
const desktopTable = matchMedia(
  "(min-width: 1025px) and (min-height: 501px)",
);
const reviewArea = el("section", {
  class: "play-review",
  id: "play-review",
  "aria-label": "Analysis and game details",
  hidden: true,
});
const reviewHeading = el("h2", { id: "review-heading", tabindex: "-1" }, "Analysis & history");
reviewArea.append(el("header", { class: "review-header" },
  reviewHeading,
  button("History tree", showHistoryTree, "", {id: "history-tree"}),
  button("Back to board ↑", () => {
    window.scrollTo({ top: 0 });
    $("panel-toggle").focus({ preventScroll: true });
  }, "ghost"),
));
document.querySelector(".app").after(reviewArea);
const analysisJump = button("Analysis ↓", () => {
  reviewHeading.scrollIntoView({ block: "start" });
  reviewHeading.focus({ preventScroll: true });
}, "ghost", { id: "analysis-jump", "aria-label": "Go to analysis and history" });
document.querySelector(".action-area").append(analysisJump);
const reviewStatus = el("div", { class: "row wrap muted small", id: "auto-review-status", role: "status", hidden: true });
reviewArea.append(reviewStatus);
let feedbackFilter = "self";
const feedbackFilters = el("div", {
  class: "history-filters", role: "group", "aria-label": "Filter decision history", hidden: true,
});
const feedbackFilterButtons = new Map(["all", "self", "opponent"].map(value => {
  const control = button("", () => {
    feedbackFilter = value;
    renderedFeedback = null;
    renderFeedback();
  }, "", { "data-history-filter": value, "aria-pressed": value === feedbackFilter });
  feedbackFilters.append(control);
  return [value, control];
}));
reviewArea.append(feedbackFilters);
function renderReviewStatus() {
  reviewStatus.hidden = !game?.started || config.mode !== "computer";
  if (reviewStatus.hidden) return;
  const pending = decisionHistory(game).filter(r => !r.feedback).length;
  reviewStatus.replaceChildren(
    el("span", {}, autoReview.error ? `Analysis paused: ${autoReview.error}` : pending
      ? `${autoReview.job ? "Analyzing" : "Queued for analysis"} · ${pending} decision${pending === 1 ? "" : "s"} remaining`
      : "Both players’ decisions are analyzed automatically."),
    ...(autoReview.error ? [button("Retry analysis", () => autoReview.retry(), "ghost")] : []),
  );
}
function placeReview() {
  if (!ui.board.container.isConnected) return;
  const started = !!model()?.started;
  analysisJump.hidden = !started;
  const app = document.querySelector(".app");
  app.classList.toggle("desktop-table", desktopTable.matches && started);
  app.classList.toggle("live-table", started);
  app.classList.toggle("setup-table", !started);
  app.dataset.mode = config.mode;
  reviewArea.hidden = !started;
  const feedbackHome = started ? reviewArea : document.querySelector(".action-area");
  const inspectorHome = started ? reviewArea : $("workspace");
  if (feedbackStrip.parentElement !== feedbackHome)
    feedbackHome.append(feedbackStrip);
  if ($("inspector").parentElement !== inspectorHome)
    inspectorHome.append($("inspector"));
}
desktopTable.addEventListener("change", placeReview);


document
  .querySelector(".action-area")
  .setAttribute("aria-label", "Turn controls and decision history");
const helpActions = el("div", {
  class: "action-help",
  id: "help-actions",
  "aria-label": "Help and practice controls",
  role: "group",
});
const allControls = button("All controls", () => {
  if (document.querySelector(".practice-controls-dialog")) return;
  const menu = el("div", {class:"stack"}, helpActions,
    button("Settings · playing style, board & shortcuts", () => { d.close(); preferences(); }),
    el("nav", {class:"controls-nav", "aria-label":"Backgammon navigation"},
      ...[["/backgammon/","Hub"],["/backgammon/trainer/","Trainer"],["/backgammon/solver/","Solver"],["/backgammon/library/","Library"]]
        .map(([href,label]) => el("a", {href, onclick: label === "Solver" ? (event) => { event.preventDefault(); d.close(); openSolver(); } : undefined}, label))));
  const d = dialog("Help & practice", menu, [], { sheet: true });
  d.classList.add("practice-controls-dialog");
  const closeOnAction = (event) => {
    if (event.target.closest("button:not(:disabled)")) d.close();
  };
  helpActions.addEventListener("click", closeOnAction, true);
  d.addEventListener("close", () => {
    helpActions.removeEventListener("click", closeOnAction, true);
    helpCluster.prepend(helpActions);
  }, { once: true });
}, "ghost", { id: "all-controls", hidden: true, "aria-haspopup": "dialog" });
const helpCluster = el("div", { class: "help-cluster" }, helpActions, allControls);
document.querySelector(".action-main").prepend(helpCluster);
helpCluster.insertBefore(draftKeys, allControls);
const draft = new DraftBoard(ui.board, (change) => {
  actions();
  detailDraft();
  saveDraftAfterPaint();
  autoDraft(change?.kind === "move");
  prethink.update();
});
draft.shortcutsEnabled = true;
const prethink = new Prethink({
  engine: analysis.engine,
  view: () => ({ game,
    enabled: config.mode === "computer" && settings().analysisAhead && !document.hidden && !leaving,
    idle: !committing && !botBusy && !assistanceJob,
    submitted: draft.state === game?.state && draft.complete() && draft.draft.length ? clone(draft.draft) : null,
  }),
});
addEventListener("bg-settings", () => prethink.update());
const opening = new OpeningRoll(ui.board.container, () => {
  boardKey = "";
  render();
});
ui.board.onRoll = () => {
  const control = $("roll");
  if (state().phase !== "roll" || opening.active || !control || control.disabled || ui.board.playbackTimer) return false;
  control.click(); return true;
};
ui.board.onCube = () => {
  const control = $("double-cube");
  if (control && !control.disabled && !opening.active && !ui.board.playbackTimer) control.click();
};
ui.board.container.addEventListener("click", e => {
  if (e.target === ui.board.container) ui.board.onRoll();
});
const online = new Online({
  onChange: () => {
    if (config.mode === "online") {
      const reply = online.model?.undoReply;
      if (reply?.id && reply.id !== lastUndoNotice) {
        lastUndoNotice = reply.id;
        toast(
          reply.accepted
            ? "Undo accepted. The original dice are kept."
            : "Undo declined.",
        );
      }
      render();
    }
  },
  onStatus: (_, message) => {
    netStatus = message;
  },
  onError: showError,
});

installPlayShortcuts({
  phase: () =>
    !ui.board.container.isConnected
      ? null
      : !model()?.started
        ? "setup"
        : opening.active
          ? "opening"
          : state().phase,
  point: (p, quick) => {
    if (!draft.enabled || draft.preview) return false;
    draft.point(p, {
      quick: quick || (draft.selected === null && !draft.sources().includes(p)),
    });
    return true;
  },
  run: (action) => {
    const selectors = {
      roll: "#roll,#begin-turn",
      confirm: "#confirm,#begin-turn,#start-match,#next-game",
      double: "#double-cube",
      drop: "#drop-cube",
      take: "#take-cube",
      redouble: "#immediate-redouble",
      hint: "#hint",
    };
    if (selectors[action]) {
      const control = [...document.querySelectorAll(selectors[action])].find(
        (n) => !n.disabled && !n.hidden,
      );
      if (!control) return false;
      control.click();
      return true;
    }
    if (action === "help") {
      preferences()
        .then(() =>
          document.querySelector('.settings-tabs button[aria-label="Keyboard"]')
            ?.click(),
        )
        .catch(showError);
      return true;
    }
    if (action === "flip") {
      saveSettings({ orientation: 1 - settings().orientation });
      dispatchEvent(new Event("bg-settings"));
      return true;
    }
    if (!draft.enabled || draft.preview) return false;
    if (action === "undo") draft.undo();
    else if (action === "reset") draft.reset();
    else if (action === "bar") {
      const current = draft.current();
      if (current.bar[current.turn])
        draft.point(`bar${current.turn}`, { checkerTap: true });
      else draft.point(`off${current.turn}`, { quick: true });
    } else if (action === "off")
      draft.point(`off${state().turn}`, { quick: draft.selected === null });
    else if (action === "cancel") {
      draft.selected = null;
      draft.hint = "Selection cleared.";
      draft.render();
    } else if (action === "swap") {
      draft.switchDice();
    } else return false;
    return true;
  },
});

const params = new URLSearchParams(location.hash.slice(1));
const roomCode = params.get("room");
if (roomCode) config.mode = "online";
const playersButton = button(
  "Players",
  () => {
    let d;
    d = dialog(
      "Who plays each side?",
      el(
        "div",
        { class: "stack" },
        playerControls(() => d.close(), "dialog-"),
        ...(config.mode === "computer"
          ? [computerStrengthControl(), feedbackToggle(), reviewStrengthControl(), warningControl(),
            el("p", {class:"muted small"}, SEARCH_DESCRIPTION)]
          : []),
      ),
    );
  },
  "ghost",
  { id: "players-control", hidden: true },
);
$("toolbar").prepend(
  playersButton,
  button(
    "New match",
    () =>
      confirmDialog(
        "Start another match?",
        "Your current local match stays recoverable in this browser.",
        () => {
          stopComputer();
          online.model && online.leave();
          game = null;
          boardKey = "";
          feedback = null;
          history.replaceState(null, "", location.pathname);
          resumeIntent(null);
          render();
        },
      ),
    "ghost",
  ),
);
addEventListener("beforeunload", (e) => {
  if (!isUpdateReload() && !leaving && (online.room?.connected || draft.draft.length)) {
    e.preventDefault();
    e.returnValue = "";
  }
});
addEventListener("pagehide", () => {
  autoReview.pause();
  prethink.pause();
  stopComputer();
  persist();
});
addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (draftSaveFrame !== null || draftSaveTimer !== null) persist(false);
    autoReview.pause();
    prethink.pause();
    analysis.engine.cancelWhere(job => job.priority < 0);
  } else { advanceOpening(); advanceAcceptedCube(); prethink.update(); autoReview.update(); }
});
addEventListener("pageshow", (e) => {
  if (e.persisted) {
    leaving = false;
    resumeIntent(null);
    if (game && config.mode !== "online") {
      restore({
        game,
        positionKey: positionKey(game.state),
        draft: draft.draft,
        feedback,
      });
      persist();
    } else {
      boardKey = "";
      render();
    }
  }
});
document.querySelectorAll(".nav a,.brand,.site-link").forEach((a) =>
  a.addEventListener("click", (e) => {
    if (
      a.pathname === "/backgammon/solver/" &&
      game?.started &&
      config.mode !== "online"
    ) {
      e.preventDefault();
      openSolver().catch(showError);
      return;
    }
    if (online.room?.connected || draft.draft.length) {
      e.preventDefault();
      confirmDialog(
        "Leave this view?",
        online.room?.connected
          ? "Leaving interrupts the live room. Reconnect here to resume."
          : "Your draft will be saved for local recovery.",
        () => {
          persist();
          leaving = true;
          location.href = a.href;
        },
      );
    }
  }),
);
try {
  saved = await get("work", "play");
  persistedWork = JSON.stringify(saved);
  // Recover an unfinished local write, but never overwrite a newer save from
  // another view/tab (or an explicitly imported recovery) with this tab's copy.
  if (pageProgress?.game && (!saved || pageProgress.base === persistedWork)) saved = pageProgress;
  const study = await get("work", "study");
  if (study && params.get("study") === "1") {
    game = studyGame(study.state, study.context, crypto.randomUUID());
    config = game.config;
    history.replaceState(null, "", `#resume=${game.id}`);
    resumeIntent(null);
  } else if (!roomCode) {
    const id = params.get("resume") || resumeIntent() || (updatedOnLoad && saved?.game?.id);
    if (id) {
      const original = await get("work", "solver-context");
      const recovery =
        saved?.game?.id === id
          ? saved
          : original?.game?.id === id
            ? original
            : null;
      if (recovery && recovery.game.config.mode !== "online") restore(recovery);
      resumeIntent(null);
    }
  }
} catch (e) {
  showError(e);
}
render();
if (game) await persist();
keepPageProgress(() =>
  game && config.mode !== "online"
    ? {
        base: persistedWork,
        game,
        positionKey: positionKey(game.state),
        draft: clone(draft.draft),
        feedback,
      }
    : null,
);

function resumeIntent(value) {
  try {
    const key = "backgammon.v1.resume-play";
    if (value === null) sessionStorage.removeItem(key);
    else if (value !== undefined) sessionStorage.setItem(key, value);
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function restore(recovery) {
  recovery = clone(recovery);
  game = clone(recovery.game);
  config = game.config = localConfig(game.config);
  botPaused = !!game.reviewingTurn;
  feedback = recovery.feedback || null;
  boardKey = "";
  render();
  if (
    recovery.draft?.length &&
    recovery.positionKey === positionKey(game.state)
  ) {
    if (opening.active) opening.dismiss();
    draft.draft = clone(recovery.draft);
    draft.render();
    actions();
    detailDraft();
    // Legacy autoCommit flags must not commit a turn that originally had choices.
    // Fully forced rolls are handled by autoPlay(), independently of draft data.
    autoDraft();
  }
}
function stopComputer() {
  prethink.pause();
  epoch++;
  releaseAssistance();
  analysis.cancel();
  analysis.status.textContent = "GNUbg loads when needed.";
  botBusy = false;
  botPaused = false;
}
async function openSolver() {
  const go = async () => {
    stopComputer();
    await persist();
    await put("work", { ...clone(saved), id: "solver-context" });
    resumeIntent(game.id);
    const url = new URL(shareURL(game.state));
    url.searchParams.set("fromPlay", game.id);
    leaving = true;
    location.href = url.href;
  };
  if (draft.draft.length)
    confirmDialog(
      "Open the committed position?",
      "Your unfinished draft will be saved for your return to Play.",
      go,
    );
  else await go();
}
function model() {
  return config.mode === "online" ? online.model : game;
}
function state() {
  return (
    model()?.state ||
    initialState({ matchLength: config.matchLength, rules: config.rules })
  );
}
function myTurn(s) {
  if (model()?.undoRequest) return false;
  if (config.mode === "online")
    return online.ready && !online.pending && online.seat === decisionPlayer(s);
  return humanControls(config, s);
}
function render() {
  if (game && config.mode !== "online") ensureLocalRolls(game);
  placeReview();
  const m = model(),
    s = state();
  if (config.mode !== "online") analysis.engine.book?.prepare(s);
  playersButton.hidden = !m?.started || config.mode === "online";
  playersButton.disabled = committing;
  draft.lastMove = lastMove(m);
  const previous = ui.board.state;
  const motionKey = `${m?.id}:${s.sequence}`;
  const freshEvent =
    previous &&
    renderedGameId === m?.id &&
    lastMotion !== motionKey &&
    previous.sequence + 1 === s.sequence;
  opening.sync(m, names(), freshEvent);
  draft.hideDice = opening.active;
  const key =
    (m?.id || "setup") +
    positionKey(s) +
    (online.ready ? "ready" : "") +
    (online.pending ? "pending" : "") +
    (opening.active ? "opening" : "") +
    config.mode +
    config.humanSide;
  const enabled =
    !!m?.started &&
    myTurn(s) &&
    !botBusy &&
    !committing &&
    !assistanceJob &&
    !opening.active &&
    s.phase === "move" &&
    (m.reviewingTurn || !forcedTurn(s));
  if (key !== boardKey) {
    const before = ui.board.state,
      event = m?.events?.at(-1);
    boardKey = key;
    draft.names = m?.names ||
      m?.players?.map((p) => p.name) || ["White", "Black"];
    draft.set(s, legalPaths(s), enabled);
    if (
      before &&
      renderedGameId === m?.id &&
      before.phase === "move" &&
      lastMotion !== motionKey &&
      event?.action.type === "move" &&
      before.sequence + 1 === s.sequence &&
      before.turn === event.actor &&
      checkerKey(before) !== checkerKey(s)
    )
      ui.board.playTurn(before, event.action.steps, { automatic: !!event.automatic });
    else if (
      before &&
      renderedGameId === m?.id &&
      event?.automatic &&
      m.events.at(-2)?.action.type === "roll" &&
      before.phase === "roll" &&
      before.sequence + 2 === s.sequence
    ) {
      const roll = m.events.at(-2);
      ui.board.playTurn(
        transition(before, roll.action, roll.actor),
        event.action.steps,
        { automatic: true, rolled: true },
      );
    }
    if (freshEvent) {
      if (["roll", "practice-roll"].includes(event?.action.type))
        ui.board.animateDice();
      else if (
        ["double", "take", "beaver", "raccoon"].includes(event?.action.type)
      )
        ui.board.animateCube(previous);
      else if (event?.action.type === "move" && s.phase !== "over")
        sound.play("confirm");
      if (s.phase === "over") sound.play("finish");
    }
    lastMotion = motionKey;
    renderedGameId = m?.id;
  } else if (draft.enabled !== enabled) {
    draft.enabled = enabled;
    draft.render();
  }
  if (opening.active)
    for (const id of ["player", "opponent"]) $(id).classList.remove("active");
  $("subtitle").textContent = m?.started
    ? `${s.matchLength ? s.matchLength + "-point match" : "Unlimited points"} · ${s.crawford ? "Crawford game" : s.crawfordPlayed ? "Post-Crawford" : `Game ${s.gameNumber}`} · cube ${s.cube.value}${!s.matchLength && s.rules.jacoby ? " · Jacoby" : ""}`
    : "Computer, same-device, or a private room";
  $("panel-toggle").textContent = m?.started ? "Details" : "Setup";
  actions();
  panel();
  advanceOpening();
  if (!opening.active && !advanceAcceptedCube() && !autoPlay()) {
    autoDraft();
    if (m?.started && config.mode === "computer") computerTurn();
  }
  renderReviewStatus();
  prethink.update();
  autoReview.update();
}
function advanceAcceptedCube() {
  const m = model(), s = state();
  if (!m?.started || m.reviewingTurn || s.phase !== "roll" || m.events.at(-1)?.action.type !== "take" ||
      !myTurn(s) || committing || assistanceJob || botBusy || document.hidden) return false;
  const key = `${m.id}:${m.events.length}:${positionKey(s)}`;
  if (acceptedCubeKey === key) return true;
  clearTimeout(acceptedCubeTimer);
  acceptedCubeKey = key;
  acceptedCubeTimer = setTimeout(() => {
    acceptedCubeKey = "";
    if (model()?.id !== m.id || model().events.length !== m.events.length || state().phase !== "roll" ||
        !myTurn(state()) || committing || assistanceJob || document.hidden) return;
    commit({ type: "roll" }).catch(showError);
  }, reducedMotion() ? 80 : 420);
  return true;
}
function advanceOpening() {
  const m = model();
  if (!m?.started || !opening.active || opening.busy || committing || document.hidden) return;
  const key = `${m.id}:${m.events.length}:${opening.key}`;
  if (openingSchedule === key) return;
  clearTimeout(openingTimer);
  openingSchedule = key;
  openingTimer = setTimeout(() => {
    openingSchedule = "";
    if (model()?.id !== m.id || model().events.length !== m.events.length || !opening.active || committing || document.hidden) return;
    if (opening.dice && !opening.tie) opening.dismiss();
    else if (myTurn(state())) commit({ type: "opening" }).catch(showError);
  }, reducedMotion() ? 80 : opening.dice ? 700 : 300);
}
function autoDraft(advance = false) {
  if (!ui.board.container.isConnected) return;
  if (
    !draft.enabled ||
    draft.preview ||
    opening.active ||
    committing ||
    assistanceJob ||
    botBusy ||
    !myTurn(state())
  )
    return;
  const source = state();
  const forced = draftAutomation(source, draft.draft, draft.paths,
    advance || (!!model()?.reviewingTurn && !draft.draft.length));
  draft.minDraft = model()?.reviewingTurn && forcedTurn(source)
    ? draft.paths[0].steps.length : forced.minDraft;
  if (!forced.steps.length && !forced.replacement) return;
  const signature = JSON.stringify(draft.draft),
    id = model()?.id;
  queueMicrotask(() => {
    if (
      model()?.id !== id ||
      state() !== source ||
      JSON.stringify(draft.draft) !== signature ||
      !draft.enabled ||
      draft.preview ||
      committing ||
      assistanceJob ||
      !myTurn(source)
    )
      return;
    const before = draft.current();
    draft.draft = [...(forced.replacement || draft.draft), ...forced.steps];
    draft.selected = null;
    draft.hint = forced.complete
      ? "Draft complete. Confirm or revise your move."
      : "Forced step played. Choose your next move.";
    draft.render();
    if (forced.replacement) ui.board.animateRestore(before, draft.current(), "move");
    else ui.board.playTurn(before, forced.steps);
    actions();
    detailDraft();
    persist();
  });
}
function autoPlay() {
  const m = model(),
    s = state(),
    certain = m?.started && certainBearoff(s),
    blocked = m?.started && blockedBarRoll(s),
    forced = m?.started && forcedTurn(s);
  if ((!certain && !forced && !blocked) || committing || assistanceJob || m.undoRequest || m.reviewingTurn || opening.busy)
    return false;
  if (opening.active) return false;
  const key = positionKey(s),
    id = m.id;
  if (config.mode === "online") {
    if (online.room?.isHost && online.ready && !online.pending)
      queueMicrotask(() => {
        if (
          model()?.id === id &&
          positionKey(state()) === key &&
          online.ready &&
          !online.pending &&
          !model().undoRequest && !model().reviewingTurn
        )
          online.send({ type: "auto" });
      });
  } else if (forcedSchedule !== `${id}:${key}`) {
    forcedSchedule = `${id}:${key}`;
    setTimeout(async () => {
      await ui.board.waitForPresentation();
      forcedSchedule = "";
      if (
        game?.id === id &&
        positionKey(state()) === key &&
        !committing &&
        !game.undoRequest && !game.reviewingTurn
      )
        commit(certain ? {type:"finish-race"} : blocked ? { type: "roll" } : { type: "move", steps: forced.steps }).catch(showError);
    }, reducedMotion() ? 0 : 650);
  }
  return true;
}
function setupFields() {
  const modes = el(
    "div",
    { class: "segmented" },
    ...[
      ["computer", "Computer"],
      ["local", "Same device"],
      ["online", "Online"],
    ].map(([value, label]) =>
      button(
        label,
        () => {
          config.mode = value;
          render();
        },
        "",
        { "aria-pressed": config.mode === value },
      ),
    ),
  );
  const fields = el(
    "div",
    { class: "stack" },
    el("h2", {}, "Set up your table"),
    modes,
    field(
      "Match length",
      select(
        [
          [1, "1 point"],
          [3, "3 points"],
          [5, "5 points"],
          [7, "7 points"],
          [9, "9 points"],
          [0, "Unlimited points"],
        ],
        String(config.matchLength),
        (v) => {
          config.matchLength = Number(v);
          config.rules = defaultPlayRules(config.matchLength);
          boardKey = "";
          render();
        },
      ),
    ),
  );
  if (config.mode === "computer")
    fields.append(
      field(
        "Computer strength",
        select(
          SEARCH_OPTIONS,
          config.strength,
          (v) => (config.strength = v),
        ),
      ),
      el("p", { class: "muted small search-description" }, SEARCH_DESCRIPTION),
      el(
        "details",
        {
          class: "setup-study",
          open: setupStudyOpen ?? !matchMedia("(max-width: 700px)").matches,
          onToggle: e => { setupStudyOpen = e.currentTarget.open; },
        },
        el("summary", {}, "Feedback & hints"),
        el("div", { class: "stack" },
          feedbackToggle(),
          reviewStrengthControl(),
          ...(config.tutor ? [el("label", { class: "check" },
            el("input", {
              type: "checkbox", checked: config.warning,
              onChange: e => { config.warning = e.target.checked; },
            }), "Warn before confirming a costly move", el("span", {class:"muted small"}, "Over 0.002 equity loss"))] : []),
        ),
      ),
    );
  if (config.mode === "local")
    fields.append(
      el("div", { class: "pair setup-names" },
      field(
        "White player",
        el("input", {
          value: config.name,
          maxlength: 24,
          onInput: (e) => (config.name = e.target.value),
        }),
      ),
      field(
        "Black player",
        el("input", {
          value: config.opponent,
          maxlength: 24,
          onInput: (e) => (config.opponent = e.target.value),
        }),
      ),
      ),
    );
  if (config.mode === "online") {
    fields.append(
      field(
        "Your name",
        el("input", {
          id: "player-name",
          value: config.name,
          maxlength: 24,
          onInput: (e) => (config.name = e.target.value),
        }),
      ),
      field(
        "Room code",
        el("input", {
          id: "room-code",
          value: roomCode || "",
          placeholder: "ABC234",
          maxlength: 6,
          autocapitalize: "characters",
        }),
      ),
      el(
        "div",
        { class: "row" },
        button("Create room", () => connect(false), "primary", {
          id: "create-room",
        }),
        button("Join room", () => connect(true), "", { id: "join-room" }),
      ),
      button("Reconnect saved room", async () => {
        await online.resume();
        render();
      }),
      el(
        "p",
        { class: "muted small" },
        "Two players. No engine assistance. Undo requests need the opponent's approval. Keep this page open; some networks block peer connections.",
      ),
    );
  } else
    fields.append(
      el(
        "p",
        { class: "muted small setup-note" },
        "You can revise your moves until you confirm.",
      ),
    );
  fields.append(
    ruleControls(config.matchLength, config.rules, (rules) => {
      config.rules = rules;
    }),
  );
  if (saved && !game && config.mode !== "online")
    fields.append(
      button(
        "Resume saved match",
        () => {
          stopComputer();
          restore(saved);
          persist();
          window.scrollTo({ top: 0, behavior: "instant" });
        },
        "",
        { id: "resume-match" },
      ),
    );
  return fields;
}
async function connect(join) {
  netStatus = "Connecting…";
  toast(netStatus);
  try {
    if (join) await online.join($("room-code").value, config.name);
    else
      await online.create(config.name, {
        matchLength: config.matchLength,
        rules: config.rules,
      });
    history.replaceState(null, "", `#room=${online.room.roomCode}`);
    render();
  } catch (e) {
    showError(e);
  }
}
function start() {
  stopComputer();
  history.replaceState(null, "", location.pathname);
  resumeIntent(null);
  game = {
    id: crypto.randomUUID(),
    state: initialState({
      matchLength: config.matchLength,
      rules: config.rules,
    }),
    initial: initialState({
      matchLength: config.matchLength,
      rules: config.rules,
    }),
    events: [],
    config: { ...config },
    names:
      config.mode === "computer"
        ? [0, 1].map((p) =>
            p === config.humanSide ? config.name || "You" : "GNUbg",
          )
        : [config.name || "White", config.opponent || "Black"],
    humanNames: [config.name || "White", config.opponent || "Black"],
    started: true,
  };
  feedback = null;
  botPaused = false;
  boardKey = "";
  persist();
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function actions() {
  const table = model();
  const hasDraft = draft.draft.length > 0;
  const ahead = settings().analysisAhead;
  ui.equityBar.set({
    state: state(),
    engine: ahead ? analysis.engine : undefined,
    preset: ahead ? config.reviewStrength || 'auto' : 'quick',
    auto: true,
    submitted: hasDraft && draft.complete() ? draft.draft : null,
    blocked:
      config.mode !== "computer"
        ? "Live equity is available against the computer; online and same-device games stay unassisted."
        : !table?.started || opening.active
          ? "Start a game and finish the opening roll to see equity."
          : hasDraft && !draft.complete()
            ? "Complete the draft to evaluate your choice."
            : "",
  });
  renderActions();
  try {
    const m = model(),
      target = undoTarget();
    const unavailable =
      target === null ||
      committing ||
      assistanceJob ||
      opening.active ||
      draft.draft.length ||
      forcedTurn(state()) ||
      m?.undoRequest ||
      (config.mode === "online" && (!online.ready || online.pending));
    $("actions").prepend(
      button("Undo last turn", requestTakeback, "", {
        id: "undo-turn",
        "aria-label": "Undo last turn",
        disabled: !!unavailable,
        title:
          "Restore the last chosen checker turn. Committed dice are kept.",
      }),
    );
    $("undo-turn").replaceChildren(
      el("span", { class: "undo-turn-label-wide" }, "Undo last turn"),
      el("span", { class: "undo-turn-label-phone", "aria-hidden": "true" }, "Undo turn"),
    );
  } finally {
    arrangeActions();
    decorateShortcuts(document.querySelector(".stage"));
    ui.board.cubeEnabled = !!$("double-cube") && !$("double-cube").disabled;
    const cube = ui.board.svg.querySelector(".board-cube");
    if (cube) {
      cube.querySelector(".cube-key")?.setAttribute("display", ui.board.cubeEnabled ? "inline" : "none");
      cube.setAttribute("role", ui.board.cubeEnabled ? "button" : "img");
      cube.setAttribute("tabindex", ui.board.cubeEnabled ? "0" : "-1");
      cube.setAttribute("aria-label", `Cube ${state().cube.value}${ui.board.cubeEnabled ? ". Offer double" : ""}`);
    }
    ui.board.container.classList.toggle("roll-ready", !!$("roll") && !$("roll").disabled && state().phase === "roll");
  }
}
function arrangeActions() {
  allControls.hidden = !model()?.started;
  helpActions.replaceChildren();
  for (const id of ["undo-turn", "hint", "roll", "double-cube"]) {
    const b = $(id);
    if (b) helpActions.append(b);
  }
  const prefs = settings();
  draftKeys.replaceChildren(...(prefs.keyboardEnabled ? [["undo", "Undo"], ["reset", "Reset"]].filter(([action]) => prefs.shortcuts[action]?.[0]).map(([action, label]) =>
    el("span", {}, shortcutBadge(prefs.shortcuts[action][0]), label)) : []));
  if ($("confirm")) boardActions.append($("confirm"));
  if (!model()?.started || config.mode === "online") return;
  const human =
    config.mode === "computer" ? config.humanSide : state().turn;
  for (const [id, label, player, choose] of [
    ["reroll", "Reroll", human, false],
    ...(config.mode === "computer"
      ? [["reroll-bot", "Reroll bot", 1 - human, false]]
      : []),
    ["set-roll", "Set roll", human, true],
    ...(config.mode === "computer"
      ? [["set-bot-roll", "Set bot’s roll", 1 - human, true]]
      : []),
  ])
    helpActions.append(
      button(
        label,
        () =>
          choose
            ? choosePracticeDice(player)
            : practiceRoll(player, cryptoDice()),
        "ghost",
        {
          id,
          disabled:
            committing ||
            !!assistanceJob ||
            !practiceTarget(model(), player),
          title:
            "Local practice: rewind this side’s latest turn and replace its dice. The previous line stays in history.",
          "data-practice-dice": "",
        },
      ),
    );
}
async function practiceRoll(player, dice) {
  if (config.mode === "online" || committing || assistanceJob) return;
  stopComputer();
  committing = true;
  try {
    game = replacePracticeRoll(game, player, dice);
    feedback = null;
    boardKey = "";
    draft.draft = [];
    if (opening.active) opening.dismiss();
    render();
    await persist();
    toast("Practice roll replaced. The previous line is saved in history.");
  } catch (e) {
    showError(e);
  } finally {
    committing = false;
    render();
  }
}
function choosePracticeDice(player) {
  const target = practiceTarget(game, player);
  if (!target) return;
  const wasPaused = botPaused;
  stopComputer();
  botPaused = true;
  let applying = false;
  render();
  const pair = [0, 1].map((i) =>
    select(
      [1, 2, 3, 4, 5, 6].map((n) => [String(n), String(n)]),
      String(target.state.dice[i] || 1),
      () => {},
    ),
  );
  let d;
  d = dialog(
    config.mode !== "computer"
      ? "Set roll"
      : player === config.humanSide
        ? "Set your roll"
        : "Set bot’s roll",
    el(
      "div",
      { class: "stack" },
      el(
        "p",
        {},
        "Local practice: rewind to this side’s latest roll and replace the dice. Later moves are undone and kept in history.",
      ),
      el(
        "div",
        { class: "row" },
        field("Die 1", pair[0]),
        field("Die 2", pair[1]),
      ),
    ),
    [
      button(
        "Set roll",
        () => {
          applying = true;
          d.close();
          practiceRoll(
            player,
            pair.map((n) => Number(n.value)),
          );
        },
        "primary",
      ),
    ],
  );
  d.addEventListener(
    "close",
    () => {
      if (!applying) {
        botPaused = wasPaused;
        render();
      }
    },
    { once: true },
  );
}
function undoTarget() {
  const m = model(),
    actor =
      config.mode === "online"
        ? online.seat
        : config.mode === "computer"
          ? config.humanSide
          : null;
  const target = takebackTarget(m, actor);
  return m?.undoReply?.accepted === false &&
    m.undoReply.by === actor &&
    m.undoReply.target === target &&
    m.undoReply.eventCount === m.events.length
    ? null
    : target;
}
async function requestTakeback() {
  const target = undoTarget(),
    m = model();
  if (target === null || committing || assistanceJob || draft.draft.length)
    return;
  if (config.mode === "online") {
    online.send({ type: "undo-request" });
    return;
  }
  committing = true;
  try {
    stopComputer();
    if (config.mode === "local") {
      game.undoRequest = {
        target,
        by: m.events[target].actor,
        id: crypto.randomUUID(),
      };
    } else {
      game = undoTurn(game, target, config.humanSide);
      if (game.reviewingTurn) botPaused = true;
      feedback = null;
      boardKey = "";
      sound.play("undo");
    }
    await persist();
  } finally {
    committing = false;
    render();
  }
}
async function respondTakeback(type, request) {
  if (config.mode === "online") {
    online.send({ type, requestId: request.id });
    return;
  }
  if (game?.undoRequest?.id !== request.id) return;
  if (committing) return;
  committing = true;
  try {
    if (type === "undo-accept") {
      game = undoTurn(game, request.target, request.by, 1 - request.by);
      feedback = null;
      draft.draft = [];
      boardKey = "";
      sound.play("undo");
    } else game.undoRequest = null;
    game.undoReply = {
      by: request.by,
      accepted: type === "undo-accept",
      target: request.target,
      eventCount: game.events.length,
    };
    await persist();
    toast(
      type === "undo-accept"
        ? "Undo accepted. The original dice are kept."
        : "Undo declined.",
    );
  } finally {
    committing = false;
    render();
  }
}
function renderActions() {
  boardActions.replaceChildren();
  helpActions.replaceChildren();
  const s = state(),
    m = model(),
    a = $("actions");
  $("message").classList.toggle("routine-status", !!m?.started &&
    ["roll", "move"].includes(s.phase) && !botBusy && !assistanceJob &&
    !m.undoRequest &&
    !(config.mode === "online" && (!online.ready || m.recovery)));
  const controls = $("table-player-controls");
  if (controls && m?.started && config.mode !== "online")
    controls.replaceChildren(playerControls());
  renderFeedback();
  a.replaceChildren();
  if (!m) {
    $("message").textContent = "Ready for a game?";
    a.append(
      button(
        config.mode === "online" ? "Room setup" : "Start match",
        () => (config.mode === "online" ? $("panel-toggle").click() : start()),
        "primary",
        { id: "start-match" },
      ),
    );
    return;
  }
  if (config.mode === "online" && !m.started) {
    $("message").textContent =
      `Room ${online.room.roomCode} · ${m.players.length}/2 players`;
    a.append(
      button("Copy invite", () =>
        copy(
          `${location.origin}/backgammon/play/#room=${online.room.roomCode}`,
        ),
      ),
      button("Start match", () => online.send({ type: "start" }), "primary", {
        disabled: !online.ready || !online.room.isHost,
        id: "start-room",
      }),
    );
    return;
  }
  if (config.mode === "online" && (!online.ready || m.recovery)) {
    $("message").textContent = m.recovery
      ? "Recovered match · confirmation required"
      : "Connection paused · waiting for the other player";
    if (m.recovery)
      a.append(
        button("Confirm recovery", () => online.confirmRecovery(), "primary", {
          disabled: m.recovery.confirmed.includes(online.room.clientId),
        }),
      );
    else
      a.append(button("Connection details", () => $("panel-toggle").click()));
    return;
  }
  if (m.undoRequest) {
    const request = m.undoRequest,
      waiting = config.mode === "online" && online.seat === request.by;
    $("message").textContent = waiting
      ? "Undo requested · waiting for your opponent"
      : `${names()[request.by]} requests an undo. Allow their last turn to be replayed?`;
    if (waiting)
      a.append(
        button(
          "Cancel request",
          () => respondTakeback("undo-cancel", request),
          "",
          { disabled: online.pending },
        ),
      );
    else
      a.append(
        button("Decline", () => respondTakeback("undo-decline", request), "", {
          id: "decline-undo",
          disabled: config.mode === "online" && online.pending,
        }),
        button(
          "Accept undo",
          () => respondTakeback("undo-accept", request),
          "primary",
          {
            id: "accept-undo",
            disabled: config.mode === "online" && online.pending,
          },
        ),
      );
    return;
  }
  const mine = myTurn(s) && !botBusy && !committing && !assistanceJob;
  if (assistanceJob?.kind === "submit") {
    $("message").textContent =
      `Checking your decision · ${searchName(config.reviewStrength || "auto")}…`;
    a.append(
      button(
        "Cancel evaluation",
        () => {
          releaseAssistance();
          unlockDraft();
          ($("confirm") || $("roll"))?.focus();
        },
        "",
        { id: "cancel-feedback" },
      ),
    );
    return;
  }
  if (opening.active) {
    $("message").textContent = opening.busy ? "Opening roll · one die each…"
      : opening.tie ? "Opening tie · rolling again…" : opening.dice ? "Beginning the first turn…" : "Rolling opening dice…";
    return;
  }
  if (!m.reviewingTurn && (blockedBarRoll(s) || forcedTurn(s))) {
    $("message").textContent = blockedBarRoll(s)
      ? "All six entries blocked · passing automatically"
      : "Forced turn · playing automatically";
    return;
  }
  if (botPaused && config.mode === "computer" && !myTurn(s)) {
    $("message").textContent = "Computer paused.";
    a.append(
      button(
        "Resume computer",
        () => {
          botPaused = false;
          computerTurn();
        },
        "primary",
      ),
    );
    return;
  }
  if (botBusy) {
    $("message").textContent = "GNUbg is evaluating…";
    a.append(
      button("Cancel", () => {
        analysis.cancel();
        epoch++;
        botBusy = false;
        botPaused = true;
        boardKey = "";
        render();
      }),
    );
    return;
  }
  if (s.phase === "opening") {
    $("message").textContent =
      "Opening roll · one die for each player; ties reroll.";
    a.append(
      button(
        "Roll opening dice",
        () => commit({ type: "opening" }),
        "primary",
        { disabled: !mine, id: "roll" },
      ),
    );
  } else if (s.phase === "roll") {
    const previous = m.events.at(-1);
    const prefs = settings();
    const keycap = action => prefs.keyboardEnabled && prefs.shortcuts[action]?.length
      ? shortcutBadge(prefs.shortcuts[action][0]) : "";
    $("message").replaceChildren(
      `${previous?.automatic ? (previous.action.steps.length ? "Forced turn played · " : "No legal move · automatic pass · ") : ""}${names()[s.turn]} · Tap board to roll`, keycap("roll"),
      ...(canDouble(s) ? [" · Cube to double", keycap("double")] : []),
    );
    a.append(
      button("Double", () => submitCube({ type: "double" }), "", {
        id: "double-cube",
        disabled: !mine || !canDouble(s),
      }),
      button("Roll dice", () => submitCube({ type: "roll" }), "primary", {
        disabled: !mine,
        id: "roll",
      }),
    );
  } else if (s.phase === "move") {
    const instruction = mine
      ? draft.complete()
        ? draft.draft.length
          ? "Turn ready to confirm."
          : "No legal move · passing automatically."
        : draft.current().bar[s.turn]
          ? "Enter from the bar first."
          : "Use all playable dice, then confirm."
      : `${names()[s.turn]} is moving`;
    $("message").replaceChildren(mine ? draft.progressMessage(instruction) : instruction);
    if (config.mode === "computer" && myTurn(s))
      a.append(button("Hint", showHint, "", { id: "hint", disabled: !mine }));
    if (myTurn(s)) a.append(
      button(
        el("span", {class:"confirm-content"},
          el("span", {class:"confirm-check", "aria-hidden":"true"}, "✓"),
          el("span", {class:"confirm-copy"},
            el("strong", {}, "Confirm"))),
        submit,
        `primary${draft.complete() && mine ? " turn-ready" : ""}`,
        { disabled: !mine || !draft.complete(), id: "confirm", "aria-label":"Confirm turn" },
      ),
    );
  } else if (s.phase === "double") {
    $("message").textContent =
      `${offerName(s)} to ${s.cube.value * 2} from ${names()[s.pending.by]}. ${names()[decisionPlayer(s)]} to decide.`;
    a.append(
      button("Pass", () => submitCube({ type: "pass" }), "", {
        id: "drop-cube",
        disabled: !mine,
      }),
      button(
        `Take ${s.cube.value * 2}`,
        () => submitCube({ type: "take" }),
        "primary",
        { disabled: !mine, id: "take-cube" },
      ),
    );
    if (canImmediateRedouble(s))
      a.append(
        button(
          `${offerDepth(s) ? "Raccoon" : "Beaver"} to ${s.cube.value * 4}`,
          () => submitCube({ type: offerDepth(s) ? "raccoon" : "beaver" }),
          "",
          { disabled: !mine, id: "immediate-redouble" },
        ),
      );
  } else if (s.phase === "resign") {
    $("message").textContent =
      `Resignation offer from ${names()[s.turn]}: ${s.pending.level * s.cube.value} points.`;
    a.append(
      button("Reject", () => commit({ type: "reject" }), "", {
        disabled: !mine,
      }),
      button("Accept", () => commit({ type: "accept" }), "primary", {
        disabled: !mine,
      }),
    );
  } else if (s.phase === "over") {
    $("message").textContent =
      `${names()[s.result.winner]} ${names()[s.result.winner] === "You" ? "win" : "wins"} ${s.result.points} points${s.result.matchOver ? " · match complete" : ""}${s.result.reason === "certain bearoff" ? " · certain result" : ""}.`;
    a.append(
      button(
        s.result.matchOver ? "Rematch" : "Next game",
        () =>
          s.result.matchOver
            ? config.mode === "online"
              ? online.send({ type: "rematch" })
              : start()
            : commit({ type: "next" }),
        "primary",
        { id: "next-game" },
      ),
      button("Game review", showSessionReview, "", { id: "game-review" }),
      el(
        "a",
        { href: "/backgammon/library/#games", class: "button ghost" },
        "Session Library",
      ),
    );
  }
}
function names() {
  return (
    model()?.names || model()?.players?.map((p) => p.name) || ["White", "Black"]
  );
}
function playerControls(close = () => {}, prefix = "") {
  const s = state();
  const choose = async (side) => {
    if (
      committing ||
      (draft.draft.length && side !== null && side !== decisionPlayer(state()))
    )
      return;
    const steps = clone(draft.draft);
    stopComputer();
    game = changeControl(game, side);
    config = game.config;
    feedback = null;
    close();
    if (side !== null) saveSettings({ orientation: side });
    boardKey = "";
    render();
    if (steps.length) {
      draft.draft = steps;
      draft.render();
      actions();
      detailDraft();
    }
    await persist();
  };
  const choice = (label, side, id) =>
    button(label, () => choose(side), "", {
      id: prefix + id,
      disabled:
        committing ||
        (draft.draft.length > 0 && side !== null && side !== decisionPlayer(s)),
    });
  return el(
    "div",
    { class: "stack player-controls" },
    el(
      "p",
      { class: "muted small" },
      config.mode === "computer"
        ? `You play ${playerName(config.humanSide)}. GNUbg plays ${playerName(1 - config.humanSide)}.`
        : "Both sides are controlled on this device.",
    ),
    el(
      "div",
      { class: "row wrap" },
      ...(config.mode === "computer"
        ? [
            choice("Switch sides", 1 - config.humanSide, "switch-sides"),
            choice("Play both sides", null, "play-both"),
          ]
        : [
            choice("Bot plays White", 1, "bot-ivory"),
            choice("Bot plays Black", 0, "bot-teal"),
          ]),
    ),
    ...(draft.draft.length
      ? [
          el(
            "p",
            { class: "muted small" },
            "Confirm or reset this draft before handing its side to GNUbg.",
          ),
        ]
      : []),
  );
}
function panel() {
  const m = model(),
    s = state(),
    p = $("panel");
  p.replaceChildren();
  if (!m) {
    p.append(setupFields());
    return;
  }
  if (config.mode === "online")
    p.append(
      el("h2", {}, `Room ${online.room.roomCode}`),
      el("p", { class: "muted", id: "connection-status" }, netStatus),
      el(
        "div",
        { class: "list" },
        ...m.players.map((v, i) =>
          el(
            "div",
            { class: "list-row" },
            `${i === 0 ? "White" : "Black"} · ${v.name} · ${online.roster.some((r) => r.id === v.id && r.connected) ? "connected" : "away"}`,
          ),
        ),
      ),
      button("Copy invite", () =>
        copy(
          `${location.origin}/backgammon/play/#room=${online.room.roomCode}`,
        ),
      ),
      button(
        "Leave room",
        () =>
          confirmDialog(
            "Leave room?",
            "The other player will be paused. Save the match before leaving.",
            () => {
              online.leave();
              history.replaceState(null, "", location.pathname);
              render();
            },
          ),
        "danger",
      ),
    );
  else
    p.append(
      el(
        "h2",
        {},
        config.mode === "computer" ? "Computer table" : "Same-device table",
      ),
      ...(config.mode === "computer"
        ? [computerStrengthControl(), feedbackToggle(), reviewStrengthControl(), warningControl(),
            el("p", {class:"muted small"}, SEARCH_DESCRIPTION)]
        : []),
      el(
        "p",
        { class: "muted small" },
        config.mode === "computer"
          ? `GNUbg · ${config.strength}`
          : "Take turns on this device. Committed undo requests need the other player's approval.",
      ),
      ...(config.mode === "computer" ? [analysis.status] : []),
    );
  p.append(
    el("p", { class: "muted small", id: "active-rules" }, ruleSummary(s)),
    ruleReference(s),
  );
  if (config.mode !== "online" && m.started)
    p.append(el("div", { id: "table-player-controls" }, playerControls()));
  if (m.started && s.phase === "move" && myTurn(s) && !opening.active) {
    p.append(el("div", { id: "draft-controls" }));
    detailDraft();
  }
  if (
    m.started &&
    !opening.active &&
    myTurn(s) &&
    ["roll", "move"].includes(s.phase)
  )
    p.append(
      button("Offer resignation", () => {
        let d;
        d = dialog(
          "Offer resignation",
          el(
            "p",
            {},
            "The other player must accept. Choose the number of points at the current cube.",
          ),
          [1, 2, 3]
            .filter(
              (level) =>
                level === 1 ||
                (!s.off[s.turn] && !(s.rules.jacoby && s.cube.owner === null)),
            )
            .map((level) =>
              button(`${level * s.cube.value} points`, () => {
                d.close();
                commit({ type: "resign", level });
              }),
            ),
        );
      }),
    );
  if (
    m.started &&
    !opening.active &&
    config.mode !== "online" &&
    ["roll", "move", "double"].includes(s.phase)
  )
    p.append(
      button("Save position", () => saveDialog(s)),
      button("Open in Solver", openSolver),
    );
  if (m.started)
    p.append(
      el(
        "p",
        { class: "muted small" },
        "Game history saves automatically in this browser, including unfinished games.",
      ),
      button("History tree", showHistoryTree),
      el("a", { href: "/backgammon/library/#games" }, "All game history"),
      button("Export this match", async () => {
        await saveMatchHistory(m, names(), config.mode);
        download(
          JSON.stringify(await get("items", m.id), null, 2),
          "backgammon-match.json",
        );
      }),
    );
  if (m.started)
    p.append(
      button(
        "How to play",
        () =>
          dialog(
            "Moving your checkers",
            el(
              "div",
              { class: "stack" },
              el(
                "p",
                {},
                "Tap a checker disc to select it; tap it again to deselect. Tap the open part of a highlighted point to move there, or drag the checker. With no selected route, the open point area plays the nearest checker; if nobody can land, it selects a movable checker on that point. Blocked checkers cannot be selected. Destination numbers show the dice used.",
              ),
              el(
                "p",
                {},
                "Use both dice whenever possible; doubles give four moves. You may move the same checker more than once. A point with two or more opposing checkers is blocked; landing on a single opposing checker sends it to the bar.",
              ),
              el(
                "p",
                {},
                "Checkers on the bar must enter first. Once all your checkers are home, move them into the OFF tray to bear off.",
              ),
              el(
                "p",
                {},
                "Moves with choices remain a draft until Confirm turn. Undo reverses one step; Reset restores the whole draft. Undo last turn restores a committed choice; human opponents must agree. Forced turns and blocked passes play automatically and cannot be undone. Details has a legal-move selector.",
              ),
              el("a", { href: "/backgammon/controls/", target: "_blank", rel: "noopener" }, "Clicks & highlights flowcharts ↗"),
            ),
          ),
        "ghost",
      ),
      el("h2", {}, "History"),
      el(
        "ol",
        { class: "history", id: "history" },
        ...m.events
          .slice(0, m.events.length - (opening.busy ? 1 : 0))
          .slice(-30)
          .reverse()
          .map((event) => el("li", {}, eventText(event))),
      ),
    );
}
function eventText(e) {
  const a = e.action;
  return `${names()[e.actor] || playerName(e.actor)} · ${a.type === "move" ? notation(a.steps, e.actor) : (a.type === "finish-race" ? "certain result" : a.type === "practice-roll" ? "practice roll" : a.type) + (a.dice ? " " + a.dice.join("–") : "")}${e.automatic ? " · automatic" : ""}`;
}
function detailDraft() {
  const p = $("draft-controls");
  if (p)
    p.replaceChildren(
      el(
        "div",
        { class: "stack" },
        field("Accessible move selection", draft.picker()),
        el(
          "div",
          { class: "row" },
          button(
            "Use other die first",
            () => {
              draft.preferDie(
                state().dice.find((d) => d !== draft.preferred) ||
                  state().dice[0],
              );
            },
            "ghost",
          ),
        ),
      ),
    );
}
function saveDraftAfterPaint() {
  if (draftSaveFrame !== null || draftSaveTimer !== null) return;
  draftSaveFrame = requestAnimationFrame(() => {
    draftSaveFrame = null;
    draftSaveTimer = setTimeout(() => { draftSaveTimer = null; persist(false); }, 0);
  });
}
async function persist(history = true) {
  cancelAnimationFrame(draftSaveFrame);
  clearTimeout(draftSaveTimer);
  draftSaveFrame = draftSaveTimer = null;
  if (game) {
    if (config.mode !== "online") ensureLocalRolls(game);
    const current = game;
    saved = {
      id: "play",
      game,
      positionKey: positionKey(game.state),
      draft: clone(draft.draft),
      feedback,
    };
    try {
      const snapshot = clone(saved);
      await put("work", snapshot);
      persistedWork = JSON.stringify(snapshot);
      if (history) await saveMatchHistory(current, current.names, current.config.mode);
    } catch (e) {
      showError(e);
    }
  }
}
async function commit(action, evaluation = null) {
  if (committing) return;
  if (config.mode === "online") {
    online.send(action);
    return;
  }
  releaseAssistance();
  committing = true;
  draft.enabled = false;
  try {
    const eventIndex = game.events.length;
    game = await localPlayAction(game, action);
    if (evaluation) {
      game.events[eventIndex].evaluation = compactEvaluation(
        evaluation.source,
        evaluation.result,
      );
    }
    if (action.type === "next") feedback = null;
    draft.draft = [];
    boardKey = "";
  } finally {
    committing = false;
    boardKey = "";
    render();
  }
  // The new state and its animation are visible before IndexedDB/history work.
  // Capture/save the exact committed snapshot now, without locking interaction
  // until the library transaction completes.
  await persist();
}
function computerStrengthControl() {
  return field("Computer strength", select(SEARCH_OPTIONS, config.strength, value => {
    stopComputer(); config.strength = value;
    if (game) { game.config.strength = value; persist(); }
    botPaused = false; boardKey = ""; render();
  }));
}
function warningControl() {
  return el("label", { class: "check" }, el("input", {type:"checkbox", checked: config.warning,
    onChange: e => { config.warning = e.target.checked; if (game) { game.config.warning = config.warning; persist(); } }
  }), "Warn before confirming a costly move", el("span", {class:"muted small"}, "Over 0.002 equity loss"));
}
function reviewStrengthControl() {
  return field(
    "Hint & review strength",
    select(
      SEARCH_OPTIONS,
      config.reviewStrength || "auto",
      (value) => {
        config.reviewStrength = value;
        if (game) {
          game.config.reviewStrength = value;
          persist();
        }
      },
    ),
  );
}
function feedbackToggle() {
  return el(
    "label",
    {
      class: "check feedback-toggle",
      title:
        "Show the decision comparison and evaluate before confirmation. Both players’ committed decisions are saved and analyzed even when this is off.",
    },
    el("input", {
      type: "checkbox",
      "data-move-feedback": true,
      checked: config.tutor,
      onChange: (e) => {
        config.tutor = e.target.checked;
        if (game) game.config.tutor = config.tutor;
        try {
          saveSettings({ moveFeedback: config.tutor });
        } catch (error) {
          showError(error);
        }
        if (!config.tutor && assistanceJob?.kind === "submit") {
          releaseAssistance();
          unlockDraft();
        }
        renderFeedback();
        panel();
        if (!e.target.isConnected)
          $("panel").querySelector("[data-move-feedback]")?.focus();
        persist();
      },
    }),
    "Show move feedback",
  );
}
async function restoreHistoryPath(path, id) {
  if (config.mode === "online" || game?.id !== id || committing || assistanceJob)
    throw new Error("The table is busy or has changed. Close history and try again.");
  const restored = returnToHistory(game, path);
  stopComputer();
  game = config.mode === "computer" ? changeControl(restored, decisionPlayer(restored.state)) : restored;
  config = {...game.config};
  feedback = null; draft.draft = []; boardKey = "";
  if (opening.active) opening.dismiss();
  await persist(); render();
  window.scrollTo({top: 0, behavior: "instant"});
  toast("Position restored. Both lines remain in the history tree.");
}
function showHistoryTree() {
  const m = model();
  if (!m?.started) return;
  try {
    historyExplorer({...m, names: names()}, {
      onReturn: config.mode === "online" ? undefined : path => restoreHistoryPath(path, m.id),
    });
  } catch (error) { showError(error); }
}

function showSessionReview() {
  const m = model();
  if (!m) return;
  sessionReview(
    { ...m, names: names() },
    {
      gameNumber: state().phase === "over" ? state().gameNumber : null,
      allowAnalysis: config.mode !== "online",
      onHistoryReturn: config.mode !== "online" ? path => restoreHistoryPath(path, m.id) : undefined,
      onReturn: config.mode !== "online"
        ? (row) => restoreDecision(row, m.id)
        : undefined,
      onSave: async (snapshot, index) => {
        if (
          game?.id !== snapshot.id ||
          !sameDecisionPrefix(game, snapshot, index)
        )
          return;
        game.events[index].evaluation = snapshot.events[index].evaluation;
        await persist();
        renderedFeedback = null;
        renderFeedback();
      },
    },
  );
}
function renderFeedback() {
  const m = model();
  feedbackStrip.hidden = !(
    m?.started &&
    ((config.mode === "computer" && config.tutor) ||
      state().phase === "over")
  );
  feedbackFilters.hidden = feedbackStrip.hidden;
  if (feedbackStrip.hidden) return;
  if (renderedFeedback === m.events) return;
  renderedFeedback = m.events;
  const rows = decisionHistory(m);
  const viewer = config.mode === "online" ? online.seat : config.humanSide;
  const sideOf = row => row.player === viewer ? "self" : "opponent";
  for (const [value, control] of feedbackFilterButtons) {
    const player = value === "self" ? viewer : 1 - viewer;
    const label = value === "all" ? "All" : config.mode === "local"
      ? names()[player] : value === "self" ? "You" : "Opponent";
    const count = value === "all" ? rows.length : rows.filter(row => sideOf(row) === value).length;
    control.setAttribute("aria-pressed", String(value === feedbackFilter));
    control.setAttribute("aria-label", `${label} · ${count} decision${count === 1 ? "" : "s"}`);
    control.title = label;
    if (value !== "all") control.dataset.player = player;
    control.replaceChildren(el("span", { class: "history-filter-label" }, label),
      el("span", { class: "history-filter-count", "aria-hidden": true }, count));
  }
  const reviewIndex = rows.filter(row => row.feedback && row.player === config.humanSide).at(-1)?.index;
  const shown = groupDecisionTurns(rows.filter(row => feedbackFilter === "all" || sideOf(row) === feedbackFilter)).reverse();
  feedbackStrip.replaceChildren(
    el("h2", { class: "sr-only" }, "Decision history"),
    el("p", { class: "history-context muted" },
      `Equity · ${state().matchLength ? "normalized match equity" : "current-cube points"} · each decision maker’s perspective. Select Cube or Move to review.`,
    ),
  );
  if (!shown.length) feedbackStrip.append(el("p", { class: "history-empty muted", role: "status" },
    rows.length ? "No decisions from this player yet." : "Decisions will appear here after play begins."));
  for (const group of shown) {
    const side = sideOf(group);
    const playerLabel = config.mode === "local" ? names()[group.player]
      : side === "self" ? "You" : "Opponent";
    const decisions = el("div", { class: "history-turn-decisions" });
    const identity = el("div", { class: "history-identity" },
      el("span", { class: "history-player" }, playerLabel),
      ...(config.mode !== "local" && names()[group.player] !== playerLabel
        ? [el("span", { class: "history-detail muted" }, names()[group.player])] : []),
      el("span", { class: "history-turn-label muted" },
        `Game ${group.game} · Turn ${group.turn}${group.response ? " · Response" : ""}`),
    );
    feedbackStrip.append(el("section", {
      class: "history-turn",
      "data-history-player": group.player,
      "data-history-side": side,
      "data-turn-key": group.key,
      "aria-label": `${playerLabel} · Game ${group.game} · Turn ${group.turn}${group.response ? " · Cube response" : ""}`,
    }, identity, decisions));
    for (const row of group.decisions) {
      const kind = row.action.type === "move" ? "Move" : "Cube";
      const detail = () => el("span", { class: "history-kind muted" },
        el("span", { class: "history-kind-label" }, kind),
        ...(row.result ? [el("span", {}, ` · ${row.result.settings.name}`)] : []),
      );
      if (!row.feedback) {
        decisions.append(
          el(
            "div",
            {
              class: "feedback-pending",
              "data-history-side": side,
              "data-history-player": row.player,
            },
            el("span", { class: "history-move" }, detail(), el("span", { class: "history-played" }, row.label)),
            ...(canReturnToDecision(row, m.id)
              ? [
                  button(
                    "Return",
                    () => restoreDecision(row, m.id),
                    "ghost",
                    { "aria-label": "Return to this position", title: "Return to this position" },
                  ),
                ]
              : []),
            el(
              "span",
              { class: "history-pending-status muted small" },
              config.mode === "computer"
                ? (autoReview.job?.row.index === row.index ? "Analyzing…" : autoReview.error ? "Analysis paused" : "Analysis queued")
                : row.forced ? "Forced · no choice" : "Not analyzed",
            ),
          ),
        );
        continue;
      }
      const f = row.feedback;
      const review = button(
        "",
        () =>
          decisionReview(row.source, {
            opponent: side === "opponent",
            title:
              row.result.type === "cube"
                ? "Cube decision"
                : "Checker decision",
            onReturn: canReturnToDecision(row, m.id)
              ? () => restoreDecision(row, m.id)
              : undefined,
            onReplay: canReplayBest(row, m.id)
              ? (steps, result) => replayBest(row, m.id, steps, result)
              : undefined,
          }).result(row.result),
        "feedback-review",
        {
          ...(row.index === reviewIndex
            ? { id: "review-feedback" }
            : {}),
          "data-loss-tone": f.tone,
          "data-history-side": side,
          "data-history-player": row.player,
          "data-decision-type": row.result.type,
          title: `${playerLabel} · ${kind}: ${row.label}. ${f.quality}. ${f.units}. Open equity and EV comparison.`,
        },
      );
      const bestPlayed = Math.abs(f.best.equity - f.actual.equity) <= 1e-7;
      review.append(
        el("span", { class: "history-move" },
          detail(),
          el("span", { class: "history-played" }, row.label),
          ...(!bestPlayed ? [el("span", { class: "feedback-best muted" },
            el("span", { class: "history-best-label" }, "Best "),
            row.result.type === "checker" ? presentMove(row.source, f.best.steps).notation : f.best.notation,
          )] : []),
        ),
        decisionValues(f, true, { opponent: side === "opponent" }),
        el("span", { class: "history-loss" },
          el("span", { class: "muted" }, f.label),
          el("strong", { class: "value" }, f.value),
        ),
      );
      decisions.append(review);
    }
  }
  feedbackStrip.append(
    button("Review session", showSessionReview, "ghost", {
      id: "review-session",
    }),
  );
}

function canReturnToDecision(row, id) {
  return (
    config.mode !== "online" && game?.id === id && !committing &&
    !assistanceJob && row.index < game.events.length
  );
}
async function restoreDecision(row, id) {
  if (!canReturnToDecision(row, id))
    throw new Error("This position is no longer available.");
  const restored = returnToDecision(game, row.index, row.source);
  stopComputer();
  game = config.mode === "computer"
    ? changeControl(restored, row.player)
    : restored;
  config = { ...game.config };
  feedback = null;
  draft.draft = [];
  boardKey = "";
  if (opening.active) opening.dismiss();
  await persist();
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
  toast("Position restored with its original dice. The previous line is saved in history.");
}

function canReplayBest(row, id) {
  return (
    config.mode === "computer" &&
    game?.id === id &&
    row.result.type === "checker" &&
    row.player === config.humanSide &&
    !committing &&
    !assistanceJob &&
    !draft.draft.length &&
    undoTarget() === row.index
  );
}
async function replayBest(row, id, steps, result = row.result) {
  if (!canReplayBest(row, id))
    throw new Error("This turn can no longer be taken back.");
  // Validate the original context before changing the live game.
  transition(row.source, { type: "move", steps }, row.player);
  stopComputer();
  const restored = undoTurn(game, row.index, config.humanSide);
  if (positionKey(restored.state) !== positionKey(row.source))
    throw new Error("This review belongs to a different position.");
  game = restored;
  feedback = {
    source: row.source,
    result: { ...result, actual: result.candidates[0], error: 0 },
  };
  draft.draft = [];
  boardKey = "";
  await commit({ type: "move", steps }, feedback);
}

function activeAssistance(job) {
  return (
    assistanceJob === job &&
    config.mode === "computer" &&
    game?.id === job.gameId &&
    positionKey(state()) === job.key
  );
}
function releaseAssistance() {
  const job = assistanceJob;
  if (!job) return;
  assistanceJob = null;
  if (!job.done) analysis.cancel();
  if (job.dialog?.open) job.dialog.close();
}
function unlockDraft() {
  draft.enabled =
    state().phase === "move" &&
    myTurn(state()) &&
    !botBusy &&
    !committing &&
    !opening.active &&
    !assistanceJob;
  draft.render();
  actions();
  detailDraft();
  prethink.update();
  autoReview.update();
}
function assistance(kind) {
  const job = {
    kind,
    gameId: game.id,
    key: positionKey(state()),
    source: clone(state()),
    done: false,
  };
  assistanceJob = job;
  draft.enabled = false;
  draft.render();
  actions();
  return job;
}
function showHint() {
  if (
    assistanceJob ||
    committing ||
    botBusy ||
    config.mode !== "computer" ||
    !myTurn(state()) ||
    state().phase !== "move"
  )
    return;
  const job = assistance("hint");
  const review = decisionReview(job.source, {
    onClose: () => {
      if (assistanceJob !== job) return;
      releaseAssistance();
      unlockDraft();
      panel();
      $("hint")?.focus();
    },
    replayDescription:
      "Clears your draft and immediately plays the best move using this roll.",
    onReplay: async (steps, result) => {
      if (!activeAssistance(job))
        throw new Error("This hint is no longer current.");
      releaseAssistance();
      draft.draft = [];
      feedback = {
        source: job.source,
        result: { ...result, actual: result.candidates[0], error: 0 },
      };
      await commit({ type: "move", steps }, feedback);
    },
    onUse: (steps) => {
      if (!activeAssistance(job)) return;
      releaseAssistance();
      draft.draft = clone(steps);
      draft.selected = null;
      draft.hint = "Hint added to your draft. Review it, then confirm.";
      unlockDraft();
      panel();
      persist();
      $("confirm").focus();
    },
  });
  job.dialog = review.dialog;
  const run = async () => {
    if (!activeAssistance(job)) return;
    job.done = false;
    review.loading(
      analysis.status,
      searchName(config.reviewStrength || "auto"),
    );
    try {
      const result = await analysis.run(job.source, {
        preset: config.reviewStrength || "auto",
        priority: 20,
      });
      if (!activeAssistance(job)) return;
      job.done = true;
      review.result(result);
    } catch (error) {
      if (!activeAssistance(job)) return;
      job.done = true;
      if (error.name !== "AbortError") review.error(error, run);
    }
  };
  run();
}
async function submit() {
  if (
    committing ||
    assistanceJob ||
    botBusy ||
    !myTurn(state()) ||
    state().phase !== "move" ||
    !draft.complete()
  )
    return;
  return evaluateDecision({ type: "move", steps: clone(draft.draft) });
}
async function submitCube(action) {
  if (committing || assistanceJob || botBusy || !myTurn(state())) return;
  if (
    config.mode !== "computer" ||
    !config.tutor ||
    (action.type === "roll" && !canDouble(state()))
  )
    return commit(action);
  return evaluateDecision(action);
}
async function evaluateDecision(action) {
  const checker = action.type === "move",
    steps = checker ? action.steps : null;
  if (!config.tutor || config.mode !== "computer") {
    await commit(action);
    return;
  }
  const job = assistance("submit");
  const finish = async (result = null) => {
    if (!activeAssistance(job)) return;
    releaseAssistance();
    feedback = result ? { source: job.source, result } : null;
    await commit(action, feedback);
    // Only committed decisions enter mistake review. Storage failure must not
    // prevent a legal turn, and the full original decision context is retained.
    if (result?.error > 0.02) {
      try {
        await put(
          "items",
          itemRecord("mistake", {
            title: checker
              ? "Checker decision to review"
              : "Cube decision to review",
            state: job.source,
            submitted: checker ? steps : action.type,
            analysis: result,
            tags: [checker ? "checker" : "cube", "mistake"],
          }),
        );
      } catch (error) {
        showError(error);
      }
    }
  };
  const onClose = () => {
    if (assistanceJob !== job) return;
    releaseAssistance();
    unlockDraft();
    ($("confirm") || $("roll"))?.focus();
  };
  let warningCopy = null, completedResult = null;
  const showPendingWarning = () => {
    if (!checker || !config.warning || !activeAssistance(job) || job.dialog) return;
    warningCopy = el("p", { role: "status", id: "pending-move-loss" },
      "Still calculating EV. This move is outside the evaluated alternatives; its loss is not known yet.");
    job.dialog = dialog("Review before confirming?", warningCopy, [
      button("Revise", () => job.dialog.close()),
      button("Confirm anyway", () => finish(completedResult), "primary"),
    ]);
    job.dialog.addEventListener("close", onClose, { once: true });
  };
  try {
    let result = await analysis.run(job.source, {
      submitted: steps,
      preset: config.reviewStrength || "auto",
      priority: 20,
      onUnlisted: showPendingWarning,
    });
    if (!activeAssistance(job)) return;
    if (!checker) result = gradeCube(job.source, result, action.type);
    job.done = true;
    completedResult = result;
    if (warningCopy) {
      const f = decisionFeedback(result, job.source);
      warningCopy.textContent = `${f.label} ${f.loss < 0.01 ? f.loss.toFixed(4) : f.value} ${f.units} at ${result.settings.name}. This is an estimate.`;
      return; // Keep the player's review open; never confirm behind the dialog.
    }
    if (config.warning && needsRevisionWarning(result.error)) {
      const f = decisionFeedback(result, job.source);
      job.dialog = dialog(
        "Review before confirming?",
        el(
          "p",
          {},
          `${f.label} ${f.loss < 0.01 ? f.loss.toFixed(4) : f.value} ${f.units} at ${result.settings.name}. This is an estimate. Revise your decision or confirm it.`,
        ),
        [
          button("Revise", () => job.dialog.close()),
          button("Confirm anyway", () => finish(result), "primary"),
        ],
      );
      job.dialog.addEventListener("close", onClose, { once: true });
    } else await finish(result);
  } catch (error) {
    if (!activeAssistance(job)) return;
    job.done = true;
    if (error.name === "AbortError") {
      onClose();
      return;
    }
    if (warningCopy) {
      warningCopy.textContent = `EV unavailable: ${error.message}. Revise or confirm without feedback.`;
      return;
    }
    job.dialog = dialog(
      "Move feedback unavailable",
      el(
        "div",
        { class: "stack" },
        el("p", { role: "alert" }, error.message),
        el(
          "p",
          {},
          "Your decision has not been played. You can continue without feedback or cancel and try again.",
        ),
      ),
      [
        button("Keep editing", () => job.dialog.close()),
        button("Confirm without feedback", () => finish(), "primary"),
      ],
    );
    job.dialog.addEventListener("close", onClose, { once: true });
  }
}
async function computerTurn() {
  const s = state();
  if (
    config.mode !== "computer" ||
    !game?.started ||
    committing ||
    botBusy ||
    opening.active ||
    botPaused ||
    s.phase === "over" ||
    s.phase === "opening" ||
    myTurn(s)
  )
    return;
  if (s.phase === "roll" && !s.pending && !canDouble(s)) {
    // Exact rule shortcut, not a heuristic recommendation.
    botBusy = true;
    const token = epoch;
    await ui.board.waitForPresentation();
    if (token !== epoch || s !== state()) return;
    const dice = await futureLocalRoll(game) || cryptoDice();
    if (token !== epoch || s !== state()) return;
    prethink.prepareAfter(s, {type:'roll', dice});
    botBusy = false;
    await commit({type:"roll"});
    return;
  }
  const token = epoch,
    key = positionKey(s);
  botBusy = true;
  draft.enabled = false;
  actions();
  try {
    let action,
      evaluation = null;
    if (s.phase === "resign") {
      const evalState = { ...s, phase: "roll", dice: [], pending: null };
      const result = await analysis.run(evalState, {
        preset: config.strength,
      });
      action = {
        type: (
          s.matchLength
            ? s.scores[1 - s.turn] + s.pending.level * s.cube.value >=
                s.matchLength || s.pending.level === 3
            : s.pending.level >= -result.equity
        )
          ? "accept"
          : "reject",
      };
    } else {
      const result = await analysis.run(s, { preset: config.strength });
      if (s.phase === "move")
        action = { type: "move", steps: result.candidates[0].steps };
      else if (s.phase === "double")
        action = {
          type: ["take", "pass", "beaver", "raccoon"].includes(result.action)
            ? result.action
            : "take",
        };
      else
        action = {
          type: result.action === "double" && canDouble(s) ? "double" : "roll",
        };
      if (result.type === "checker")
        evaluation = {
          source: clone(s),
          result: { ...result, actual: result.candidates[0], error: 0 },
        };
      else if (result.available)
        evaluation = {
          source: clone(s),
          result: gradeCube(s, result, action.type),
        };
    }
    prethink.prepareAfter(s,action.type === 'roll'
      ? {...action,dice:await futureLocalRoll(game) || cryptoDice()} : action);
    if (!reducedMotion()) {
      await new Promise(resolve => setTimeout(resolve, s.phase === "move" ? 650 : 300));
      await ui.board.waitForPresentation();
    }
    if (token !== epoch || key !== positionKey(state())) return;
    botBusy = false;
    await commit(action, evaluation);
  } catch (e) {
    if (token !== epoch) return;
    botBusy = false;
    if (e.name !== "AbortError") {
      showError(e);
      $("message").textContent =
        "Computer analysis failed. Retry or switch to same-device play.";
      $("actions").replaceChildren(
        button(
          "Retry engine",
          () => {
            analysis.engine.destroy();
            computerTurn();
          },
          "primary",
        ),
        button("Continue same-device", () => {
          stopComputer();
          game = changeControl(game, null);
          config = game.config;
          boardKey = "";
          render();
          persist();
        }),
      );
    }
  }
}

document.documentElement.dataset.appReady = "true";
}
boot();
