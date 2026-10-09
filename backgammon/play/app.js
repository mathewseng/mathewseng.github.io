// SPDX-License-Identifier: GPL-3.0-or-later
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
  draftAutomation,
  playAction,
  tableDice,
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
  compactEvaluation,
  sameDecisionPrefix,
} from "../core/decision-history.mjs";
import { sessionReview } from "../ui/session-review.mjs";
import { historyExplorer } from "../ui/history-tree.mjs";
import { returnToHistory } from "../core/history-tree.mjs";
import { AutoReview } from "../core/auto-review.mjs";
import { decisionValues } from "../ui/decision-values.mjs";
import { decisionFeedback } from "../core/decision-feedback.mjs";
import { PRESETS } from "../engine/metadata.mjs";
import { Online } from "./network.mjs";
import { ruleControls, ruleReference } from "../ui/rules.mjs";
import { OpeningRoll } from "../ui/opening-roll.mjs";
import { sound } from "../ui/sound.mjs";
import {
  practiceTarget,
  replacePracticeRoll,
  returnToDecision,
} from "../core/practice.mjs";
import { installPlayShortcuts } from "../ui/shortcuts.mjs";
import { preferences } from "../ui/shell.mjs";
const ui = shell("play", "Play", "Your table. Your pace.");
document.querySelector(".app").classList.add("play-page");
let config = {
    rules: defaultPlayRules(0),
    mode: "computer",
    humanSide: 0,
    matchLength: 0,
    strength: "quick",
    reviewStrength: "deep",
    tutor: settings().moveFeedback === true,
    warning: false,
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
  committing = false,
  leaving = false,
  lastMotion = "",
  renderedGameId = null,
  assistanceJob = null,
  lastUndoNotice = null,
  epoch = 0;
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
  reviewArea.hidden = !started;
  const feedbackHome = started ? reviewArea : document.querySelector(".action-area");
  const inspectorHome = started ? reviewArea : $("workspace");
  if (feedbackStrip.parentElement !== feedbackHome)
    feedbackHome.append(feedbackStrip);
  if ($("inspector").parentElement !== inspectorHome)
    inspectorHome.append($("inspector"));
}
desktopTable.addEventListener("change", placeReview);

document.querySelector(".action-area").setAttribute("tabindex", "0");
document
  .querySelector(".action-area")
  .setAttribute("aria-label", "Turn controls and decision history");
const helpActions = el("div", {
  class: "action-help",
  id: "help-actions",
  "aria-label": "Help and practice controls",
  role: "group",
  tabindex: "0",
});
const allControls = button("All controls", () => {
  if (document.querySelector(".practice-controls-dialog")) return;
  const d = dialog("Help & practice", helpActions);
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
const draft = new DraftBoard(ui.board, (change) => {
  actions();
  detailDraft();
  persist();
  autoDraft(change?.kind === "move");
});
const opening = new OpeningRoll(ui.board.container, () => {
  boardKey = "";
  render();
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
      undo: "#undo",
      reset: "#reset-draft",
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
          [...document.querySelectorAll(".settings-tabs button")]
            .find((b) => b.textContent === "Keyboard")
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
    if (action === "bar") {
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
      const dice = draft.candidates().map((s) => s.die);
      if (!dice.length) return false;
      draft.preferDie(dice.find((d) => d !== draft.preferred) || dice[0]);
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
          ? [feedbackToggle(), reviewStrengthControl()]
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
  if (!leaving && (online.room?.connected || draft.draft.length)) {
    e.preventDefault();
    e.returnValue = "";
  }
});
addEventListener("pagehide", () => {
  autoReview.pause();
  stopComputer();
  persist();
});
addEventListener("visibilitychange", () => {
  if (document.hidden) {
    autoReview.pause();
    if (analysis.engine.active?.priority === -10) analysis.engine.cancelActive();
  } else autoReview.update();
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
  const study = await get("work", "study");
  if (study && params.get("study") === "1") {
    game = studyGame(study.state, study.context, crypto.randomUUID());
    config = game.config;
    history.replaceState(null, "", `#resume=${game.id}`);
    resumeIntent(null);
  } else if (!roomCode) {
    const id = params.get("resume") || resumeIntent();
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
  placeReview();
  const m = model(),
    s = state();
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
    !forcedTurn(s);
  if (key !== boardKey) {
    const before = ui.board.state,
      event = m?.events?.at(-1);
    boardKey = key;
    draft.names = m?.names ||
      m?.players?.map((p) => p.name) || ["Ivory", "Teal"];
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
      ui.board.playTurn(before, event.action.steps);
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
  if (!autoPlay()) {
    autoDraft();
    if (m?.started && config.mode === "computer") computerTurn();
  }
  renderReviewStatus();
  autoReview.update();
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
  const forced = draftAutomation(source, draft.draft, draft.paths, advance);
  draft.minDraft = forced.minDraft;
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
    forced = m?.started && forcedTurn(s);
  if (!forced || committing || assistanceJob || m.undoRequest || opening.busy)
    return false;
  if (opening.active) {
    opening.dismiss();
    return true;
  }
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
          !model().undoRequest
        )
          online.send({ type: "auto" });
      });
  } else
    queueMicrotask(() => {
      if (
        game?.id === id &&
        positionKey(state()) === key &&
        !committing &&
        !game.undoRequest
      )
        commit({ type: "move", steps: forced.steps }).catch(showError);
    });
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
          [
            ["quick", "Quick · 0 ply"],
            ["standard", "Standard · 1 ply"],
            ["deep", "Deep · 2 ply"],
          ],
          config.strength,
          (v) => (config.strength = v),
        ),
      ),
      feedbackToggle(),
      reviewStrengthControl(),
    );
  if (config.mode === "computer" && config.tutor)
    fields.append(
      el(
        "label",
        { class: "check" },
        el("input", {
          type: "checkbox",
          checked: config.warning,
          onChange: (e) => (config.warning = e.target.checked),
        }),
        "Warn before confirming a costly move",
      ),
    );
  if (config.mode === "local")
    fields.append(
      field(
        "Ivory player",
        el("input", {
          value: config.name,
          maxlength: 24,
          onInput: (e) => (config.name = e.target.value),
        }),
      ),
      field(
        "Teal player",
        el("input", {
          value: config.opponent,
          maxlength: 24,
          onInput: (e) => (config.opponent = e.target.value),
        }),
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
        { class: "muted small" },
        "Draft moves can be revised until you confirm. Rules remain fixed for the match or session.",
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
        : [config.name || "Ivory", config.opponent || "Teal"],
    humanNames: [config.name || "Ivory", config.opponent || "Teal"],
    started: true,
  };
  feedback = null;
  botPaused = false;
  boardKey = "";
  persist();
  render();
}
function actions() {
  const table = model();
  const hasDraft = draft.draft.length > 0;
  ui.equityBar.set({
    state: state(),
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
    if (!unavailable)
      for (const id of ["undo", "reset-draft"])
        if ($(id)) $(id).hidden = true;
    $("actions").prepend(
      button("Undo last turn", requestTakeback, "", {
        id: "undo-turn",
        disabled: !!unavailable,
        title:
          "Restore the last chosen checker turn. Committed dice are kept.",
      }),
    );
  } finally {
    arrangeActions();
  }
}
function arrangeActions() {
  allControls.hidden = !model()?.started;
  helpActions.replaceChildren();
  for (const id of ["undo-turn", "hint", "undo", "reset-draft"]) {
    const b = $(id);
    if (b) helpActions.append(b);
  }
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
  helpActions.replaceChildren();
  const s = state(),
    m = model(),
    a = $("actions");
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
      `Checking your decision · ${PRESETS[config.reviewStrength || "deep"].name}…`;
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
    $("message").textContent = opening.busy
      ? "One die each…"
      : opening.dice
        ? opening.tie
          ? "Same roll. Neither player starts yet."
          : "The winner plays both opening dice."
        : "The higher opening die goes first.";
    a.append(
      button(
        opening.busy
          ? "Rolling…"
          : !opening.dice
            ? "Roll opening dice"
            : opening.tie
              ? "Roll again"
              : "Begin turn",
        () =>
          opening.dice && !opening.tie
            ? opening.dismiss()
            : commit({ type: "opening" }),
        "primary",
        {
          id: opening.dice && !opening.tie ? "begin-turn" : "roll",
          disabled:
            opening.busy ||
            committing ||
            ((!opening.dice || opening.tie) && !mine),
        },
      ),
    );
    if (opening.busy)
      a.append(
        button("Show dice", () => opening.finish(), "ghost", {
          id: "show-opening",
        }),
      );
    return;
  }
  if (forcedTurn(s)) {
    $("message").textContent = "Forced turn · playing automatically";
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
    $("message").textContent =
      `${previous?.automatic ? (previous.action.steps.length ? "Forced turn played · " : "No legal move · automatic pass · ") : ""}${names()[s.turn]} to roll`;
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
    $("message").textContent = mine
      ? draft.complete()
        ? draft.draft.length
          ? "Turn ready to confirm."
          : "No legal move · passing automatically."
        : draft.current().bar[s.turn]
          ? "Enter from the bar first."
          : "Use all playable dice, then confirm."
      : `${names()[s.turn]} is moving`;
    if (config.mode === "computer" && myTurn(s))
      a.append(button("Hint", showHint, "", { id: "hint", disabled: !mine }));
    a.append(
      button("Undo", () => draft.undo(), "", {
        disabled: !mine || draft.draft.length <= draft.minDraft,
        id: "undo",
      }),
      button("Reset", () => draft.reset(), "", {
        disabled: !mine || draft.draft.length <= draft.minDraft,
        id: "reset-draft",
      }),
      button(
        "Confirm turn",
        submit,
        `primary${draft.complete() && mine ? " turn-ready" : ""}`,
        { disabled: !mine || !draft.complete(), id: "confirm" },
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
      `${names()[s.result.winner]} ${names()[s.result.winner] === "You" ? "win" : "wins"} ${s.result.points} points${s.result.matchOver ? " · match complete" : ""}.`;
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
    model()?.names || model()?.players?.map((p) => p.name) || ["Ivory", "Teal"]
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
            choice("Bot plays Ivory", 1, "bot-ivory"),
            choice("Bot plays Teal", 0, "bot-teal"),
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
            `${i === 0 ? "Ivory" : "Teal"} · ${v.name} · ${online.roster.some((r) => r.id === v.id && r.connected) ? "connected" : "away"}`,
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
        ? [feedbackToggle(), reviewStrengthControl()]
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
  return `${names()[e.actor] || playerName(e.actor)} · ${a.type === "move" ? notation(a.steps, e.actor) : (a.type === "practice-roll" ? "practice roll" : a.type) + (a.dice ? " " + a.dice.join("–") : "")}${e.automatic ? " · automatic" : ""}`;
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
async function persist() {
  if (game) {
    const current = game;
    saved = {
      id: "play",
      game,
      positionKey: positionKey(game.state),
      draft: clone(draft.draft),
      feedback,
    };
    try {
      await put("work", saved);
      await saveMatchHistory(current, current.names, current.config.mode);
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
  draft.render();
  actions();
  try {
    const s = game.state,
      actor = decisionPlayer(s);
    const committed = ["opening", "roll"].includes(action.type)
      ? {
          ...action,
          dice:
            action.type === "roll"
              ? tableDice(game, actor, cryptoDice)
              : cryptoDice(),
        }
      : action;
    const eventIndex = game.events.length;
    game = playAction(game, committed, actor);
    if (evaluation) {
      game.events[eventIndex].evaluation = compactEvaluation(
        evaluation.source,
        evaluation.result,
      );
    }
    if (action.type === "next") feedback = null;
    draft.draft = [];
    boardKey = "";
    await persist();
  } finally {
    committing = false;
    boardKey = "";
    render();
  }
}
function reviewStrengthControl() {
  return field(
    "Hint & review strength",
    select(
      Object.entries(PRESETS).map(([key, p]) => [
        key,
        `${p.name} · ${p.plies} ply`,
      ]),
      config.reviewStrength || "deep",
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
  if (feedbackStrip.hidden) return;
  if (renderedFeedback === m.events) return;
  renderedFeedback = m.events;
  const rows = decisionHistory(m).reverse();
  feedbackStrip.replaceChildren(
    el("h2", { class: "sr-only" }, "Decision history"),
    el("p", { class: "history-context muted" },
      `Equity · ${state().matchLength ? "normalized match equity" : "current-cube points"} · each mover’s perspective. Select a row to review.`,
    ),
  );
  for (const row of rows) {
    const viewer =
      config.mode === "online" ? online.seat : config.humanSide;
    const side = row.player === viewer ? "self" : "opponent";
    const playerLabel =
      config.mode === "local"
        ? names()[row.player]
        : side === "self" ? "You" : "Opponent";
    const detail = [
      ...(config.mode !== "local" && names()[row.player] !== playerLabel
        ? [names()[row.player]] : []),
      row.action.type === "move" ? "Move" : "Cube",
      ...(row.result ? [row.result.settings.name] : []),
    ].join(" · ");
    const identity = () => el("span", { class: "history-identity" },
      el("span", { class: "history-player" }, playerLabel),
      el("span", { class: "history-detail muted" }, detail),
    );
    if (!row.feedback) {
      feedbackStrip.append(
        el(
          "div",
          {
            class: "feedback-pending",
            "data-history-side": side,
            "data-history-player": row.player,
          },
          identity(),
          el("span", { class: "history-move" }, row.label),
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
        ...(row.player === config.humanSide &&
        !feedbackStrip.querySelector("#review-feedback")
          ? { id: "review-feedback" }
          : {}),
        "data-loss-tone": f.tone,
        "data-history-side": side,
        "data-history-player": row.player,
        "data-decision-type": row.result.type,
        title: `${f.quality}. ${f.units}. Open equity and EV comparison.`,
      },
    );
    const bestPlayed = Math.abs(f.best.equity - f.actual.equity) <= 1e-7;
    review.append(
      identity(),
      el("span", { class: "history-move" },
        el("span", { class: "history-played" }, row.label),
        ...(!bestPlayed ? [el("span", { class: "feedback-best muted" },
          el("span", { class: "history-best-label" }, "Best "),
          f.best.notation,
        )] : []),
      ),
      decisionValues(f, true, { opponent: side === "opponent" }),
      el("span", { class: "history-loss" },
        el("span", { class: "muted" }, f.label),
        el("strong", { class: "value" }, f.value),
      ),
    );
    feedbackStrip.append(review);
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
      PRESETS[config.reviewStrength || "deep"].name,
    );
    try {
      const result = await analysis.run(job.source, {
        preset: config.reviewStrength || "deep",
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
  try {
    let result = await analysis.run(job.source, {
      submitted: steps,
      preset: config.reviewStrength || "deep",
      priority: 20,
    });
    if (!activeAssistance(job)) return;
    if (!checker) result = gradeCube(job.source, result, action.type);
    job.done = true;
    if (config.warning && result.error > 0.04) {
      const f = decisionFeedback(result, job.source);
      job.dialog = dialog(
        "Review before confirming?",
        el(
          "p",
          {},
          `${f.label} ${f.value} ${f.units} at ${result.settings.name}. This is an estimate. Revise your decision or confirm it.`,
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
