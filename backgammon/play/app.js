// SPDX-License-Identifier: GPL-3.0-or-later
import { ProgressWriter } from "../core/progress-writer.mjs";
import { nextGameTable, archivedTable } from '../core/game-archive.mjs';
import { clearHistoryStates } from '../core/history-states.mjs';
import { historyTurn } from "../ui/history-turn.mjs";
import { archivedGames } from "../ui/archived-games.mjs";
import { savedGames } from '../ui/saved-games.mjs';
import { presentMove } from "../core/move-presentation.mjs";
import { analysisDepthLabel } from "../core/analysis-insight.mjs";
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
  immediateRedoubleAction,
  offerName,
} from "../core/rules.mjs";
import {
  get,
  put,
  itemRecord,
  readSettings,
  saveSettings,
  saveMatchHistory,
  migratePlayHistory,
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
  hideCardButton,
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
import { BarAutoRoll, canAutoRollFromBar, canAutoRollAfterBarPass } from "../core/bar-auto-roll.mjs";
import { RaceAutoPlay, bearingOffRace, clearRaceCubeAction } from "../core/race-auto-play.mjs";
import { certainBearoff } from "../core/certain-bearoff.mjs";
import { shouldAutoPassClosedOut, closedOutCubeMargin } from '../core/closed-out.mjs';
import { ensureLocalRolls, localPlayAction, futureLocalRoll } from "../core/local-rolls.mjs";
import { decisionFeedback, needsRevisionWarning, lossTone } from "../core/decision-feedback.mjs";
import { beginDecisionAttempt, recordInitialEvaluation } from "../core/decision-attempt.mjs";
import { gameLossTable } from "../ui/game-loss-summary.mjs";
import { gameLossSummary } from "../core/game-loss-summary.mjs";
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
import { reducedMotion, motionDuration } from "../ui/motion.mjs";
import { preferences } from "../ui/shell.mjs";

// Let the document finish loading while the service-worker gate runs.
// Only start the tool after the gate has finished or allowed offline use.
async function boot() {
await startUpdates();
const updatedOnLoad = resumedAfterUpdate();
let pageProgress = readPageProgress();
const ui = shell("play", "Play");
document.querySelector(".app").classList.add("play-page");
const progressWriter = new ProgressWriter();

let setupStudyOpen;
let config = {
    rules: defaultPlayRules(0),
    mode: "computer",
    humanSide: 0,
    matchLength: 0,
    strength: "auto",
    reviewStrength: "auto",
    tutor: readSettings().moveFeedback === true,
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
  automaticDraft = null,
  lastUndoNotice = null,
  epoch = 0;
const barAutoRoll = new BarAutoRoll();
const raceAutoPlay = new RaceAutoPlay();
let raceAutoJob = null;
let barRollTimer = null, barRollSchedule = '', barRollAttempt = '', barTapTimer = null;
const presentationWaits = new Set();
const boardWorkspace = el("div", { class: "board-workspace" });
const draftKeys = el("div", { class: "draft-shortcuts", "aria-label": "Draft keyboard shortcuts" });
// Secondary tools keep a stable rail; the primary turn action sits on the board.
const boardActions = el("div", { class: "board-actions action-stage bg-action-stage", "aria-label": "Table actions" });
const turnTools = el("div", { class: "turn-tools", "aria-label": "Play tools" });
// The existing #message live region announces this; mobile also needs visible
// context for offers and waiting states beside their actions.
const tableActionStatus = el("p", { class: "table-action-status", "aria-hidden": "true" });
const boardConfirm = el("div", { class: "board-confirm" });
function confirmIcon() {
  const icon = el("span", { class: "confirm-check", "aria-hidden": "true" });
  icon.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="m5 12 5 5 9-10"/></svg>';
  return icon;
}
ui.board.container.append(boardConfirm);
ui.board.container.before(boardWorkspace);
boardWorkspace.append(ui.board.container, boardActions);
// Game result card: an overlay in the board slot (like the opening roll)
// naming the result level, the score change and the cube.
const resultCard = el("section", { class: "bg-result-card game-over-card", hidden: true, "aria-label": "Game result" });
ui.board.container.append(resultCard);
const cubeReplies = el("div", { class: "board-cube-replies", hidden: true, "aria-label": "Respond to cube offer" });
ui.board.container.append(cubeReplies);
function cubeReplyFace(label, value) {
  return el("span", {class:"cube-reply-face"},
    el("span", {class:"cube-reply-content"},
      el("span", {class:"cube-reply-label"}, label),
      el("span", {class:"cube-reply-value"}, String(value))));
}
function placeCubeReplies() {
  const matrix = ui.board.svg.getScreenCTM();
  if (!matrix) return;
  const box = ui.board.container.getBoundingClientRect();
  // Center the action in the left-hand open lane, opposite the local dice.
  const center = new DOMPoint(203, 330).matrixTransform(matrix);
  boardConfirm.style.left = `${center.x - box.left}px`;
  boardConfirm.style.top = `${center.y - box.top}px`;
  const dieWidth = ui.board.svg.querySelector('.board-die-face > rect')?.width.baseVal.value ?? 62;
  boardConfirm.style.setProperty('--confirm-size', `${1.5 * dieWidth * Math.hypot(matrix.a, matrix.b)}px`);
  if (cubeReplies.hidden) return;
  // Equal insets from the playing surface; Take lines up with the central bar.
  const left = new DOMPoint(48, 330).matrixTransform(matrix);
  const right = new DOMPoint(768, 330).matrixTransform(matrix);
  cubeReplies.style.left = `${left.x - box.left}px`;
  cubeReplies.style.top = `${left.y - box.top}px`;
  cubeReplies.style.width = `${right.x - left.x}px`;
  cubeReplies.style.setProperty("--cube-reply-font-size", `${Math.max(10, Math.min(16, 28 * matrix.a))}px`);
  // The centre lane gets shorter with a height-limited board. Scale only the
  // visible face; keep a full touch target while checker input is locked.
  cubeReplies.style.setProperty("--cube-reply-face-height", `${Math.max(24, Math.min(48, 144 * matrix.d - 6))}px`);
}
const cubeReplyResize = new ResizeObserver(placeCubeReplies);
cubeReplyResize.observe(ui.board.container);
cubeReplyResize.observe(ui.board.svg);

let hiddenResult = "";
let resultSignature = "";
function renderResultCard(s) {
  const r = s?.phase === "over" ? s.result : null;
  const key = r ? `${s.gameNumber}:${s.scores.join("-")}` : "";
  resultCard.hidden = !r || key === hiddenResult;
  if (resultCard.hidden) { resultSignature = ""; return; }
  const losses = gameLossTable(decisionHistory(model()), s, names(),
    config.mode === "computer" ? [config.humanSide] : [0, 1]);
  const signature = JSON.stringify([model()?.id, key, r, names(), losses.innerHTML]);
  if (resultSignature === signature) return;
  resultSignature = signature;
  const helpOpen = resultCard.querySelector("details")?.open;
  const scrollTop = resultCard.scrollTop;
  const winner = names()[r.winner];
  const level = { 1: "single game", 2: "gammon", 3: "backgammon" }[r.level] || "game";
  const stat = (label, value, extra) => el("div", { class: "stat" },
    el("span", { class: "stat-label" }, label),
    el("strong", { class: "stat-value" }, value, ...(extra ? [el("small", {}, extra)] : [])));
  resultCard.replaceChildren(
    hideCardButton(resultCard, "Hide the result to see the board", () => { hiddenResult = key; }),
    el("p", { class: "bg-result-kind" }, r.matchOver ? "Match complete" : `Game ${s.gameNumber} over`),
    el("h2", {}, `${winner} ${winner === "You" ? "win" : "wins"} a ${level}`),
    el("div", { class: "stat-strip game-over-stats" },
      stat("Points", `+${r.points}`, winner),
      stat("Score", `${s.scores[0]}–${s.scores[1]}`, s.matchLength ? `of ${s.matchLength}` : "unlimited"),
      stat("Cube", String(s.cube.value), s.cube.owner === null ? "centred" : names()[s.cube.owner]),
    ),
    losses,
  );
  if (helpOpen) losses.querySelector("details").open = true;
  resultCard.scrollTop = scrollTop;
}
let openingTimer = null, openingSchedule = "", forcedSchedule = "";
let acceptedCubeTimer = null, acceptedCubeKey = "";
let closedOutCheck = null;
let draftSaveFrame = null, draftSaveTimer = null;
const analysis = new AnalysisPanel();
const autoReview = new AutoReview({
  engine: analysis.engine,
  model: () => game,
  idle: () => !document.hidden && !leaving && !botBusy && !committing && !assistanceJob && !opening.active,
  save: () => persist(),
  changed: () => {
    renderMobileSummary(model(), true);
    renderedFeedback = null;
    renderFeedback();
    renderReviewStatus();
    renderResultCard(state());
  },
});
const feedbackStrip = el("div", {
  class: "play-feedback",
  id: "move-feedback",
  role: "region",
  "aria-label": "Decision history",
  hidden: true,
});
// Previous games retain their expanded loss summaries in the decision history.
function gameSummaryCard(game, rows, viewer) {
  const s = state();
  const visible = config.mode === "computer" ? [config.humanSide] : [0, 1];
  const summary = gameLossSummary(rows, game, s.matchLength);
  const players = summary.players.filter(player => visible.includes(player.player));
  const signature = JSON.stringify([game, s.matchLength, names(), players]);
  let card = feedbackView.cards.get(game);
  if (card?.dataset.signature === signature) return card;
  const label = player => config.mode === "local" ? names()[player.player]
    : player.player === viewer ? "You" : "Opponent";
  const total = player => {
    const checker = player.checker.accepted, cube = player.cube.accepted;
    const known = checker.evaluated + cube.evaluated > 0 || checker.count + cube.count === 0;
    const loss = checker.total + cube.total;
    const pending = checker.pending + cube.pending;
    return { known, loss, mistakes: checker.mistakes + cube.mistakes, pending };
  };
  const chips = players.map(player => {
    const t = total(player);
    return el("span", { class: "history-game-stat", "data-history-player": player.player },
      el("span", { class: "history-game-name" }, label(player)),
      el("strong", t.known ? { "data-loss-tone": lossTone(t.loss).tone } : {},
        t.known ? `−${t.loss.toFixed(3)} EV` : "—"),
      el("span", { class: "muted" },
        t.known ? `${t.mistakes} mistake${t.mistakes === 1 ? "" : "s"}` : "not analyzed",
        ...(t.pending ? [` · ${t.pending} pending`] : [])),
    );
  });
  const panel = el("div", { class: "history-game-detail" },
    gameLossTable(rows, { gameNumber: game, matchLength: s.matchLength }, names(), visible));
  const heading = el("div", { class: "history-game-heading" },
    el("span", { class: "history-game-title" }, "Game summary"), ...chips);
  card = el("section", { class: "history-game-card", "data-game": game, "aria-label": `Game ${game} summary` }, heading, panel);
  card.dataset.signature = signature;
  feedbackView.cards.set(game, card);
  return card;
}
const feedbackView = {
  context: null,
  turns: new Map(),
  games: new Map(),
  cards: new Map(),
  heading: el("h2", { class: "sr-only" }, "Decision history"),
  caption: el("p", { class: "history-context muted" }),
  empty: el("p", { class: "history-empty muted", role: "status" }),
  footer: button("Review session", showSessionReview, "ghost", { id: "review-session" }),
};
const previousGames = archivedGames({onReturn: async (item, row) => {
  if (committing || assistanceJob || game?.id !== (item.sessionId || item.id))
    throw Error('The table changed. Reopen this game.');
  await persist(true, true);
  const saved = await get('items', item.id);
  if (!saved) throw Error('This saved game is no longer available.');
  const source = archivedTable(saved, config);
  const restored = returnToDecision(source, row.index, row.source);
  stopComputer();
  game = config.mode === 'computer' ? changeControl(restored, row.player) : restored;
  config = {...game.config};
  feedback = null; draft.draft = []; boardKey = '';
  clearHistoryStates();
  if (opening.active) opening.dismiss();
  await persist(); render();
  window.scrollTo({top:0, behavior:'instant'});
}});
document.querySelector(".action-area").append(feedbackStrip);
const desktopTable = matchMedia(
  "(min-width: 1025px) and (min-height: 501px)",
);
const landscapeTable = matchMedia("(max-height: 500px) and (min-width: 650px)");
const landscapeDock = el("aside", {class:"landscape-dock", hidden:true, "aria-label":"Table controls"});
const dockNodes = [document.querySelector('.topbar'), document.querySelector('.tool-head'),
  $('opponent'), $('player'), boardActions, document.querySelector('.action-area')];
const dockHomes = dockNodes.map(node => {
  const anchor = document.createComment('landscape control home');
  node.before(anchor); return anchor;
});
document.querySelector('.app').append(landscapeDock);
const pagesButton = button('', () => {
  const links = document.querySelector('.topbar .tool-nav').cloneNode(true);
  links.className = 'landscape-pages';
  dialog('Backgammon pages', links, [], {sheet:true});
}, 'ghost btn--icon', {id:'landscape-pages', 'aria-label':'Backgammon pages', 'aria-haspopup':'dialog', title:'Pages'});
pagesButton.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
document.querySelector('.header-tools').prepend(pagesButton);
function placeLandscapeDock(started) {
  const active = started && landscapeTable.matches;
  document.querySelector('.app').classList.toggle('landscape-table', active);
  dockNodes.forEach((node, i) => {
    if (active) { if (node.parentElement !== landscapeDock) landscapeDock.append(node); }
    else if (node.parentElement !== dockHomes[i].parentElement) dockHomes[i].after(node);
  });
  landscapeDock.hidden = !active;
  // Setup has a scrolling form and a separate, always-visible Start row.
  // Keep both in the same rail instead of overlaying the form with the action.
  if (!started && landscapeTable.matches) $('inspector').append(dockNodes.at(-1));
}
const reviewArea = el("section", {
  class: "play-review",
  id: "play-review",
  "aria-label": "Analysis and game details",
  hidden: true,
});
const reviewHeading = el("h2", { id: "review-heading", tabindex: "-1" }, "Analysis & history");
reviewArea.append(el("header", { class: "review-header" },
  reviewHeading,
  button('Saved games', showSavedGames, '', {id:'saved-games'}),
  button("History tree", showHistoryTree, "", {id: "history-tree"}),
  button("Back to board ↑", () => {
    window.scrollTo({ top: 0 });
    $("panel-toggle").focus({ preventScroll: true });
  }, "ghost"),
));
// Portrait reserves the same footer height whether its summary is open or closed.
const phonePortrait = matchMedia("(max-width: 600px) and (orientation: portrait)");
const mobileSummary = el("details", { id: "mobile-game-summary", class: "mobile-game-summary", hidden: true, open: true });
const mobileSummaryHeading = el("summary", { "aria-label": "Game summary" });
const mobileSummaryBody = el("div", { class: "history-game-detail" });
mobileSummary.append(mobileSummaryHeading, mobileSummaryBody);
document.querySelector(".app").after(reviewArea);
document.querySelector(".action-main").before(mobileSummary);
let mobileSummaryData = null;
let mobileSummaryPlayer = null;
function fillMobileSummary() {
  if (!mobileSummary.open || !mobileSummaryData || mobileSummaryBody.childElementCount) return;
  const { rows, state: source, labels, visible } = mobileSummaryData;
  const table = gameLossTable(rows, source, labels, visible, { compact: true });
  if (config.mode !== "computer") table.querySelector("thead th").replaceChildren(button(
    el("span", {}, labels[visible[0]], el("span", { "aria-hidden": true }, " ↔")), () => {
    mobileSummaryPlayer = 1 - visible[0];
    renderMobileSummary(model(), true);
    mobileSummaryBody.querySelector(".mobile-summary-player").focus({ preventScroll: true });
  }, "ghost mobile-summary-player", { "aria-label": `Show ${labels[1-visible[0]]}’s game summary` }));
  mobileSummaryBody.append(table);
}
mobileSummary.addEventListener("toggle", () => {
  fillMobileSummary();
});
phonePortrait.addEventListener("change", () => {
  renderMobileSummary(model(), true);
  placeConfirm();
});
function renderMobileSummary(m, force = false) {
  mobileSummary.hidden = !m?.started || !phonePortrait.matches;
  if (mobileSummary.hidden) {
    mobileSummaryData = null;
    mobileSummaryBody.replaceChildren();
    return;
  }
  const source = state(), labels = names();
  const visible = [config.mode === "computer" ? config.humanSide : mobileSummaryPlayer ?? source.turn];
  const key = JSON.stringify([m.id, source.gameNumber, source.matchLength, labels, visible]);
  if (!force && mobileSummaryData?.events === m.events && mobileSummaryData.key === key) return;
  const rows = decisionHistory(m).filter(row => row.game === source.gameNumber);
  const summary = gameLossSummary(rows, source.gameNumber, source.matchLength);
  mobileSummaryData = { key, rows, state: source, labels, visible, events: m.events };
  mobileSummaryHeading.replaceChildren(
    el("span", {}, `Game ${source.gameNumber} summary`),
    ...summary.players.filter(player => visible.includes(player.player)).map(player => {
      const {checker, cube} = player;
      const loss = checker.accepted.total + cube.accepted.total;
      const pending = checker.accepted.pending + cube.accepted.pending;
      const known = checker.accepted.evaluated + cube.accepted.evaluated > 0 ||
        checker.accepted.count + cube.accepted.count === 0;
      return el("span", { class: "mobile-summary-loss" },
        ...(visible.length > 1 ? [el("span", {}, labels[player.player])] : []),
        el("strong", known ? {"data-loss-tone":lossTone(loss).tone} : {}, known ? loss.toFixed(3) : "—"),
        el("small", {}, pending ? "EV · pending" : "EV lost"));
    }),
    el("span", {class:"mobile-summary-controls"}, el("span", {class:"history-game-chevron", "aria-hidden":true})));
  mobileSummaryBody.replaceChildren();
  fillMobileSummary();
}
const analysisJump = button("Analysis ↓", () => {
  reviewHeading.scrollIntoView({ block: "start" });
  reviewHeading.focus({ preventScroll: true });
}, "ghost", { id: "analysis-jump", "aria-label": "Go to analysis and history" });
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
  const pending = decisionHistory(game).filter(r => !r.feedback ||
    (r.initialAction && !r.initialFeedback && !r.forced)).length;
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
  placeLandscapeDock(started);
  // Keep the visible board anchored to its top edge when turn controls change
  // the available height. Review boards retain their centered presentation.
  ui.board.svg.setAttribute('preserveAspectRatio', started ? 'xMidYMin meet' : 'xMidYMid meet');
  app.dataset.mode = config.mode;
  reviewArea.hidden = !started;
  const feedbackHome = started ? reviewArea : document.querySelector(".action-area");
  const inspectorHome = started ? reviewArea : $("workspace");
  if (feedbackStrip.parentElement !== feedbackHome)
    feedbackHome.append(feedbackStrip);
  if ($("inspector").parentElement !== inspectorHome)
    inspectorHome.append($("inspector"));
}
desktopTable.addEventListener("change", () => {
  placeReview();
  placeConfirm();
});
landscapeTable.addEventListener("change", () => {
  placeReview();
  placeConfirm();
});
// Confirmation is always on the board. Hint and Controls share its old rail.
// Exceptional actions get their own rows instead of shrinking the tool buttons.
function placeConfirm() {
  const actions = $("actions");
  tableActionStatus.remove();
  for (const child of [...boardActions.children])
    if (child !== turnTools) actions.append(child);
  const confirm = $("confirm");
  boardConfirm.replaceChildren(...(confirm ? [confirm] : []));
  if (!model()?.started) { turnTools.remove(); return; }
  const hint = $("hint") || button("Hint", showHint, "", {id:"hint", disabled:!myTurn(state()) || botBusy || committing || !!assistanceJob || !["roll","move","double"].includes(state().phase)});
  const ended = state().phase === "over";
  turnTools.classList.toggle("game-ended", ended);
  turnTools.replaceChildren(...(ended ? [] : [hint]), allControls);
  helpActions.append(analysisJump, draftKeys);
  if (desktopTable.matches) actions.append(turnTools);
  else {
    boardActions.append(turnTools);
    if ((phonePortrait.matches || landscapeTable.matches) && actions.childElementCount)
      boardActions.prepend(...actions.children);
    if ((phonePortrait.matches || landscapeTable.matches) &&
      (state().phase === "resign" || model()?.undoRequest || botBusy || assistanceJob?.kind === "submit" ||
       (config.mode === "online" && (!online.ready || model()?.recovery)))) {
      tableActionStatus.textContent = state().phase === "resign"
        ? `${names()[state().turn]} offers ${state().pending.level * state().cube.value} points.`
        : model()?.undoRequest ? `${names()[model().undoRequest.by]} requests an undo.`
        : $("message").textContent;
      boardActions.prepend(tableActionStatus);
    }
  }
  placeCubeReplies();
}


document
  .querySelector(".action-area")
  .setAttribute("aria-label", "Turn controls and decision history");
const helpActions = el("div", {
  class: "action-help",
  id: "help-actions",
  "aria-label": "Help and practice controls",
  role: "group",
});
const allControls = button("Controls", () => {
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
}, "ghost", { id: "all-controls", hidden: true, "aria-label": "All controls", "aria-haspopup": "dialog" });
const helpCluster = el("div", { class: "help-cluster" }, helpActions, analysisJump, allControls);
document.querySelector(".action-main").prepend(helpCluster);
helpCluster.insertBefore(draftKeys, allControls);
const draft = new DraftBoard(ui.board, () => {
  actions();
  detailDraft();
  saveDraftAfterPaint();
  autoDraft();
  prethink.update();
});
draft.shortcutsEnabled = true;
const prethink = new Prethink({
  engine: analysis.engine,
  view: () => ({ game,
    enabled: config.mode === "computer" && readSettings().analysisAhead && !document.hidden && !leaving,
    idle: !committing && !botBusy && !assistanceJob,
    submitted: draft.state === game?.state && draft.complete() && draft.draft.length ? clone(draft.draft) : null,
  }),
});
addEventListener("bg-settings", () => {
  prethink.update();
  if (model()?.started && blockedBarRoll(state())) {
    actions();
    autoPlay();
  }
});
const opening = new OpeningRoll(ui.board.container, () => {
  boardKey = "";
  render();
});
function repeatBarRoll(point) {
  if (!barAutoRoll.repeat(model(), point) && !raceAutoPlay.repeat(model(), point)) return false;
  clearTimeout(barTapTimer);
  clearTimeout(barRollTimer); barRollSchedule = ''; barRollAttempt = '';
  actions();
  if (barAutoRoll.skipping) {
    ui.board.finishPresentation();
    for (const finish of presentationWaits) finish();
  }
  return true;
}
ui.board.onRoll = (event = {}) => {
  const point = {x:event.clientX || 0,y:event.clientY || 0};
  if (repeatBarRoll(point)) return true;
  if (raceAutoPlay.active && (event.target?.closest('.board-caption') ||
      (state().phase === 'roll' && state().turn === raceAutoPlay.active.player))) {
    raceAutoPlay.reset(); actions(); return true;
  }
  if ((barAutoRoll.active || barAutoRoll.skipping) && (event.target?.closest('.board-caption') ||
      (state().phase === 'roll' && state().turn === (barAutoRoll.active || barAutoRoll.skip).player))) {
    if (barAutoRoll.skipping || event.clientX === undefined) {
      barAutoRoll.reset(); actions(); return true;
    }
    // Suspend the next roll immediately, but leave time for a second tap to
    // request skipping. A lone tap retains the existing stop behaviour.
    const gesture = barAutoRoll.noteSkip(model(), point);
    clearTimeout(barTapTimer);
    barTapTimer = setTimeout(() => {
      if (barAutoRoll.gesture !== gesture) return;
      barAutoRoll.reset(); actions();
    }, 450);
    actions(); return true;
  }
  const control = $("roll");
  if (state().phase !== "roll" || opening.active || !control || control.disabled || ui.board.playbackTimer) return false;
  barAutoRoll.noteRoll(model(), point);
  if (config.mode === 'computer') raceAutoPlay.noteRoll(model(), point);
  control.click(); return true;
};
ui.board.onCube = () => {
  raceAutoPlay.reset();
  const control = $("double-cube");
  if (control && !control.disabled && !opening.active && !ui.board.playbackTimer) control.click();
};
ui.board.container.addEventListener("click", e => {
  if (e.target === ui.board.container) ui.board.onRoll(e);
});
// The first tap rolls immediately. Recognize its second physical tap even if
// the dice redraw or a pending cube-warning dialog has replaced the target.
// Consume that one click so it cannot also activate a newly exposed control.
addEventListener('pointerdown', event => {
  if (event.button !== 0 || !event.isPrimary || !repeatBarRoll({x:event.clientX,y:event.clientY})) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const consume = new AbortController();
  const cleanup = setTimeout(() => consume.abort(), 600);
  addEventListener('pointerdown', next => {
    if (next === event) return;
    clearTimeout(cleanup); consume.abort();
  }, {capture:true,signal:consume.signal});
  addEventListener('click', click => {
    if (Math.hypot(click.clientX-event.clientX,click.clientY-event.clientY) > 44) return;
    click.preventDefault(); click.stopImmediatePropagation();
    clearTimeout(cleanup); consume.abort();
  }, {capture:true,signal:consume.signal});
}, true);
document.addEventListener('close', () => { scheduleBarAutoRoll(); scheduleRaceAutoPlay(); }, true);
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
      redouble: '#immediate-redouble[data-cube-action="beaver"]',
      raccoon: '#immediate-redouble[data-cube-action="raccoon"]',
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
      saveSettings({ orientation: 1 - readSettings().orientation });
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
            engineNotes()]
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
        config.mode === "online" && online.room
          ? `You leave room ${online.room.roomCode} and the other player is paused until you reconnect. The match stays in this browser’s game history.`
          : "Your current local match stays recoverable in this browser.",
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
        config.mode === "online" && online.room ? { verb: "Leave", danger: true } : {},
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
  barAutoRoll.reset(); clearTimeout(barRollTimer);
  raceAutoPlay.reset();
  autoReview.pause();
  prethink.pause();
  stopComputer();
  persist();
});
addEventListener("visibilitychange", () => {
  if (document.hidden) {
    barAutoRoll.skip = null; ui.board.motion = true;
    clearTimeout(barRollTimer); barRollSchedule = '';
    if (draftSaveFrame !== null || draftSaveTimer !== null) persist(false);
    autoReview.pause();
    prethink.pause();
    analysis.engine.cancelWhere(job => job.priority < 0);
  } else { advanceOpening(); if (!autoPlay()) advanceAcceptedCube(); scheduleBarAutoRoll(); scheduleRaceAutoPlay(); prethink.update(); autoReview.update(); }
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
        { verb: "Leave", danger: Boolean(online.room?.connected) },
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
  saved = await migratePlayHistory(saved);
  persistedWork = JSON.stringify(saved);
  const study = params.get('study') === '1' ? await get("work", "study") : null;
  if (study && params.get("study") === "1") {
    game = studyGame(study.state, study.context, crypto.randomUUID());
    config = game.config;
    history.replaceState(null, "", `#resume=${game.id}`);
    resumeIntent(null);
  } else if (!roomCode) {
    const id = params.get("resume") || resumeIntent() || (updatedOnLoad && saved?.game?.id);
    if (id) {
      const original = saved?.game?.id === id ? null : await migratePlayHistory(await get("work", "solver-context"));
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
pageProgress = null;
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
  raceAutoPlay.reset();
  prethink.pause();
  epoch++;
  releaseAssistance();
  analysis.cancel();
  analysis.status.hidden = false;
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
// Skipping only removes presentation waits. Rules, saved dice, engine depth
// and cube responses still follow the ordinary turn pipeline.
function syncBarAutoRoll(current = state()) {
  const m = model(), s = state();
  barAutoRoll.sync(m, current);
  const choice = document.querySelector('dialog[open]') || (myTurn(s) &&
    (s.pending || (s.phase === 'roll' && !barAutoRoll.active) ||
      (s.phase === 'move' && !forcedTurn(s))));
  const active = barAutoRoll.sync(m, current, !!choice);
  ui.board.motion = !barAutoRoll.skipping;
  return active;
}
function presentationPause(milliseconds) {
  if (barAutoRoll.skipping) return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); presentationWaits.delete(finish); resolve(); };
    const timer = setTimeout(finish, motionDuration(milliseconds));
    presentationWaits.add(finish);
  });
}
function scheduleBarAutoRoll() {
  const m = model(), s = state();
  const ready = () => (barAutoRoll.canRoll(model()) ||
      (!model()?.reviewingTurn && canAutoRollAfterBarPass(state(), model()?.events.at(-1)))) &&
    !barAutoRoll.waitingForRepeat && !certainBearoff(state()) && myTurn(state()) &&
    !document.hidden && !leaving && !committing && !botBusy && !assistanceJob &&
    !opening.active && !document.querySelector('dialog[open]') &&
    !!$('roll') && !$('roll').disabled;
  if (!ready()) { clearTimeout(barRollTimer); barRollSchedule = ''; return; }
  const key = `${m.id}:${s.gameNumber}:${s.sequence}:${epoch}`;
  if (barRollSchedule === key || barRollAttempt === key) return;
  clearTimeout(barRollTimer); barRollSchedule = key;
  // Give the opponent's last move time to land and remain readable.
  barRollTimer = setTimeout(async () => {
    await ui.board.waitForPresentation();
    if (barRollSchedule !== key) return;
    barRollSchedule = '';
    if (state() !== s || !ready()) return;
    barRollAttempt = key;
    try { await submitCube({type:'roll'}); }
    catch (error) { barAutoRoll.reset(); actions(); showError(error); }
  }, barAutoRoll.skipping ? 0 : motionDuration(900));
}
function syncRaceAutoPlay(current = state()) {
  const s = state();
  if (config.mode !== 'computer') raceAutoPlay.reset();
  return raceAutoPlay.sync(model(), current, myTurn(s) && s.phase === 'move' && !forcedTurn(s));
}
function scheduleRaceAutoPlay() {
  const active = raceAutoPlay.active, s = state(), token = epoch;
  const ready = () => raceAutoPlay.active === active && raceAutoPlay.valid(active,model()) &&
    state() === s && epoch === token && myTurn(s) && config.mode === 'computer' &&
    ['roll','double'].includes(s.phase) && !certainBearoff(s) &&
    !document.hidden && !leaving && !committing && !botBusy && !assistanceJob &&
    !opening.active && !document.querySelector('dialog[open]');
  if (raceAutoJob || !ready()) return;
  const job = raceAutoJob = {source:s};
  (async () => {
    try {
      await presentationPause(900);
      await ui.board.waitForPresentation();
      if (!ready()) return;
      let action = {type:'roll'}, evaluation = null;
      if (s.phase === 'double' || canDouble(s)) {
        let result = analysis.engine.peek(s,{preset:null});
        // Reuse warm analysis. A missing, shallow or noisy reading must finish
        // a real 3-ply cube search before it can authorize automatic play.
        if (result?.settings?.plies < 3 || result?.settings?.noise !== 0 || result?.settings?.cubeful !== true)
          result = await analysis.engine.analyze(s,{preset:'expert',priority:5});
        if (!ready()) return;
        action = clearRaceCubeAction(s,result);
        if (!action) { raceAutoPlay.reset(); return; }
        evaluation = {source:clone(s),result:gradeCube(s,result,action.type)};
      }
      if (ready()) await commit(action,evaluation);
    } catch (error) {
      if (raceAutoPlay.active === active) {
        raceAutoPlay.reset();
        if (error.name !== 'AbortError') toast('Auto play stopped. Choose your cube action.');
      }
    } finally {
      if (raceAutoJob === job) raceAutoJob = null;
      if (!leaving) actions();
    }
  })();
}
function render() {
  if (game && config.mode !== "online") ensureLocalRolls(game);
  placeReview();
  const m = model(),
    s = state();
  if (config.mode !== "online") analysis.engine.book?.prepare(s);
  syncBarAutoRoll();
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
  // Historical dice must not sit behind the on-board cube response controls.
  draft.hideDice = opening.active || s.phase === "double";
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
    automaticDraft?.source !== s &&
    !opening.active &&
    s.phase === "move" &&
    (m.reviewingTurn || (!certainBearoff(s) && !forcedTurn(s)));
  if (key !== boardKey) {
    const before = ui.board.state,
      event = m?.events?.at(-1);
    boardKey = key;
    draft.names = m?.names ||
      m?.players?.map((p) => p.name) || ["White", "Black"];
    let presentation = null;
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
      presentation = {before, steps:event.action.steps, automatic:!!event.automatic};
    else if (
      before &&
      renderedGameId === m?.id &&
      event?.automatic &&
      m.events.at(-2)?.action.type === "roll" &&
      before.phase === "roll" &&
      before.sequence + 2 === s.sequence
    ) {
      const roll = m.events.at(-2);
      presentation = {before:transition(before, roll.action, roll.actor),
        steps:event.action.steps, automatic:true, rolled:true};
    }
    if (freshEvent && ["roll", "practice-roll"].includes(event?.action.type))
      presentation = {roll:true};
    draft.set(s, legalPaths(s), enabled, presentation);
    if (freshEvent) {
      if (
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
    : "";
  $("panel-toggle").textContent = m?.started ? "Details" : "Setup";
  actions();
  panel();
  advanceOpening();
  if (!opening.active && !autoPlay() && !advanceAcceptedCube()) {
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
      (blockedBarRoll(s) && !automaticClosedOutPass(s)) ||
      !myTurn(s) || committing || assistanceJob || botBusy || document.hidden) return false;
  const key = `${m.id}:${m.events.length}:${positionKey(s)}`;
  if (acceptedCubeKey === key) return true;
  clearTimeout(acceptedCubeTimer);
  acceptedCubeKey = key;
  acceptedCubeTimer = setTimeout(() => {
    acceptedCubeKey = "";
    if (model()?.id !== m.id || model().events.length !== m.events.length || state().phase !== "roll" ||
        (blockedBarRoll(state()) && !automaticClosedOutPass(state())) ||
        !myTurn(state()) || committing || assistanceJob || document.hidden) return;
    commit({ type: "roll" }).catch(showError);
  }, motionDuration(420));
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
  }, motionDuration(opening.dice ? 700 : 300));
}
function autoDraft() {
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
    !!model()?.reviewingTurn && !draft.draft.length);
  draft.minDraft = model()?.reviewingTurn && forcedTurn(source)
    ? draft.paths[0].steps.length : forced.minDraft;
  if (!forced.steps.length && !forced.replacement) return;
  const signature = JSON.stringify(draft.draft),
    id = model()?.id;
  const job = automaticDraft = {source, id};
  // Let the rolled dice settle before moving compulsory checkers. Previously
  // three board renders ran in the roll's microtask, dropping animation frames.
  draft.enabled = false;
  ui.board.options.interactive = false;
  actions();
  queueMicrotask(async () => {
    try {
      await ui.board.waitForPresentation();
      if (!document.hidden) await new Promise(resolve =>
        requestAnimationFrame(() => setTimeout(resolve, 0)));
      if (
        automaticDraft !== job ||
        model()?.id !== id ||
        state() !== source ||
        JSON.stringify(draft.draft) !== signature ||
        draft.preview ||
        committing ||
        assistanceJob ||
        !myTurn(source)
      )
        return;
      automaticDraft = null;
      draft.enabled = true;
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
    } finally {
      // A reset, history jump or settings change may supersede this playback.
      if (automaticDraft === job) { automaticDraft = null; render(); }
    }
  });
}
function closedOutKey(s) {
  return `${model()?.id}:${epoch}:${s.sequence}:${positionKey(s)}:${config.mode}:${config.humanSide}`;
}
function closedOutEvaluation(s) {
  return config.mode === 'computer' && myTurn(s) && closedOutCheck?.key === closedOutKey(s)
    ? closedOutCheck.result : null;
}
function automaticClosedOutPass(s) {
  return myTurn(s) && shouldAutoPassClosedOut(s, readSettings().closedOutPassing, closedOutEvaluation(s));
}
function checkClosedOutCube(s) {
  if (readSettings().closedOutPassing !== 'bad-double' || !blockedBarRoll(s) || !canDouble(s) || config.mode !== 'computer' || !myTurn(s)) return;
  const key = closedOutKey(s);
  if (closedOutCheck?.key === key) return;
  // Reuse completed analysis in the exact score/cube/rule context, including
  // work prepared during the opponent's turn. Quick/1-ply cannot auto-decline.
  const cached = ['auto','research','expert','deep'].map(preset => analysis.engine.peek(s,{preset}))
    .filter(result => closedOutCubeMargin(s,result) !== null)
    .sort((a,b) => b.settings.plies-a.settings.plies)[0];
  const check = closedOutCheck = {key,result:cached || null,pending:!cached};
  if (cached) return;
  actions();
  analysis.engine.analyze(s,{preset:'deep',priority:10}).then(result => {
    check.result = result;
  }).catch(() => {
    // Failure leaves the legal cube controls available, without a retry loop.
  }).finally(() => {
    check.pending = false;
    if (closedOutCheck === check && closedOutKey(state()) === key && !leaving) render();
  });
}
function autoPlay() {
  const m = model(),
    s = state();
  if (!m?.started || m.reviewingTurn || document.hidden || committing || assistanceJob ||
      m.undoRequest || opening.busy || opening.active || botBusy) return false;
  checkClosedOutCube(s);
  const
    certain = m?.started && certainBearoff(s),
    blocked = automaticClosedOutPass(s),
    forced = m?.started && forcedTurn(s);
  if ((!certain && !forced && !blocked) || committing || assistanceJob || m.undoRequest || m.reviewingTurn || opening.busy)
    return false;
  if (opening.active) return false;
  const key = positionKey(s),
    id = m.id;
  if (config.mode === "online") {
    if ((blocked ? myTurn(s) : online.room?.isHost) && online.ready && !online.pending)
      queueMicrotask(() => {
        if (
          model()?.id === id &&
          positionKey(state()) === key &&
          online.ready &&
          !online.pending &&
          !model().undoRequest && !model().reviewingTurn &&
          (!blocked || automaticClosedOutPass(state()))
        )
          // Each player opts in on their own device; the host must not skip
          // another player's closed-out turn based on the host's preference.
          online.send({ type: blocked ? "skip-roll" : "auto" });
      });
  } else if (forcedSchedule !== `${id}:${key}`) {
    forcedSchedule = `${id}:${key}`;
    presentationPause(certain || blocked ? 0 : 650).then(async () => {
      await ui.board.waitForPresentation();
      forcedSchedule = "";
      if (
        game?.id === id &&
        positionKey(state()) === key &&
        !committing && !assistanceJob && !document.hidden &&
        !game.undoRequest && !game.reviewingTurn
      ) {
        const result = closedOutEvaluation(state());
        if (blocked && !automaticClosedOutPass(state())) return;
        commit(certain ? {type:"finish-race"} : blocked ? { type: "skip-roll" } : { type: "move", steps: forced.steps },
          null, blocked ? {autoPass:true,cubeEvaluation:result} : {}).catch(showError);
      }
    });
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
  const modeNote = {
    computer: "GNUbg plays the other side with hints, feedback and automatic analysis.",
    local: "Two players on this device, taking turns. No engine assistance.",
    online: "Two players in a private room. No engine assistance.",
  }[config.mode];
  const fields = el(
    "div",
    { class: "stack setup-panel" },
    el("h2", {}, "Set up your table"),
    modes,
    el("p", { class: "muted small setup-mode-note" }, modeNote),
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
      engineNotes(),
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
        "Undo requests need the opponent's approval. Keep this page open; some networks block peer connections.",
      ),
    );
  }
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
    historyVersion: 2,
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
  const ahead = readSettings().analysisAhead;
  ui.equityBar.set({
    state: state(),
    engine: ahead ? analysis.engine : undefined,
    auto: true,
    beforeDecision: true,
    blocked:
      config.mode !== "computer"
        ? "Live equity is available against the computer; online and same-device games stay unassisted."
        : !table?.started || opening.active
          ? "Start a game and finish the opening roll to see equity."
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
    placeCubeReplies();
    decorateShortcuts(document.querySelector(".stage"));
    ui.board.cubeEnabled = !!$("double-cube") && !$("double-cube").disabled;
    const cube = ui.board.svg.querySelector(".board-cube");
    if (cube) {
      cube.querySelector(".cube-key")?.setAttribute("display", ui.board.cubeEnabled ? "inline" : "none");
      cube.setAttribute("role", ui.board.cubeEnabled ? "button" : "img");
      cube.setAttribute("tabindex", ui.board.cubeEnabled ? "0" : "-1");
      cube.setAttribute("aria-label", `Cube ${state().cube.value}${ui.board.cubeEnabled ? ". Offer double" : ""}`);
    }
    const s = state(), rollReady = !!$("roll") && !$("roll").disabled && s.phase === "roll" && !opening.active;
    const current = draft.state === s && !draft.preview ? draft.current() : s;
    const active = syncBarAutoRoll(current);
    const race = syncRaceAutoPlay(current);
    // During automatic cube checking, the caption is the stop control. The
    // manual Take/Drop faces return as soon as it stops, without covering it.
    if (race && s.phase === 'double') cubeReplies.hidden = true;
    ui.board.setRollPrompt({ready:rollReady && !blockedBarRoll(s),canAutoRoll:canAutoRollFromBar(s) && !model().reviewingTurn,
      canAutoPlay:config.mode === 'computer' && bearingOffRace(s) && !model().reviewingTurn,
      auto:!!active,skipping:barAutoRoll.skipping,raceAuto:!!race});
    ui.board.container.classList.toggle("roll-ready", rollReady);
    scheduleBarAutoRoll();
    scheduleRaceAutoPlay();
  }
}
function arrangeActions() {
  allControls.hidden = !model()?.started;
  helpActions.replaceChildren();
  for (const id of ["undo-turn", "hint", "roll", "double-cube"]) {
    const b = $(id);
    // With no roll to make, expose the remaining cube choice directly.
    if (blockedBarRoll(state()) && ['roll','double-cube'].includes(id)) continue;
    if (b) helpActions.append(b);
  }
  const prefs = readSettings();
  draftKeys.replaceChildren(...(prefs.keyboardEnabled ? [["undo", "Undo"], ["reset", "Reset"]].filter(([action]) => prefs.shortcuts[action]?.[0]).map(([action, label]) =>
    el("span", {}, shortcutBadge(prefs.shortcuts[action][0]), label)) : []));
  placeConfirm();
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
  cubeReplies.hidden = true;
  cubeReplies.replaceChildren();
  boardActions.replaceChildren();
  boardConfirm.replaceChildren();
  turnTools.replaceChildren();
  helpActions.replaceChildren();
  const s = state(),
    m = model(),
    a = $("actions");
  renderResultCard(m?.started ? s : null);
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
    const host = online.room.isHost;
    $("message").textContent =
      `Room ${online.room.roomCode} · ${m.players.length}/2 players · ${
        host
          ? online.ready ? "Ready when you are" : "Share the invite; Start match unlocks when the second player joins"
          : "Waiting for the host to start"}`;
    a.append(
      button("Copy invite", () =>
        copy(
          `${location.origin}/backgammon/play/#room=${online.room.roomCode}`,
        ),
      ),
      ...(host
        ? [button("Start match", () => online.send({ type: "start" }), "primary", {
            disabled: !online.ready,
            id: "start-room",
          })]
        : []),
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
  const mine = myTurn(s) && !botBusy && !committing && !assistanceJob && automaticDraft?.source !== s;
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
  if (!m.reviewingTurn && (certainBearoff(s) || automaticClosedOutPass(s) || forcedTurn(s))) {
    $("message").textContent = certainBearoff(s) ? "Game decided"
      : blockedBarRoll(s)
      ? "All six entries blocked · passing without rolling"
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
    const closed = blockedBarRoll(s);
    const prefs = readSettings();
    const keycap = action => prefs.keyboardEnabled && prefs.shortcuts[action]?.length
      ? shortcutBadge(prefs.shortcuts[action][0]) : "";
    $("message").replaceChildren(
      closed ? `All six entries blocked · ${prefs.closedOutPassing === 'bad-double' && closedOutCheck?.key === closedOutKey(s) && closedOutCheck.pending ? 'checking cube…' : canDouble(s) ? 'Double or pass without rolling' : 'Pass without rolling'}`
        : `${previous?.automatic ? (previous.action.steps?.length ? "Forced turn played · " : "No legal move · automatic pass · ") : ""}${names()[s.turn]} · Tap board to roll`,
      ...(closed ? [] : [keycap("roll")]),
      ...(canDouble(s) ? [" · Cube to double", keycap("double")] : []),
    );
    a.append(
      button("Double", () => submitCube({ type: "double" }), "", {
        id: "double-cube",
        disabled: !mine || !canDouble(s),
      }),
      button(closed ? canDouble(s) ? "No double · pass" : "Pass without rolling" : "Roll dice", () => submitCube({ type: closed ? 'skip-roll' : "roll" }), "primary", {
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
    if (mine) a.append(
      button(
        confirmIcon(),
        submit,
        draft.complete() ? "turn-ready" : "",
        { disabled: !mine || !draft.complete(), id: "confirm", "aria-label":"Confirm turn", title:"Confirm turn (C)" },
      ),
    );
  } else if (s.phase === "double") {
    $("message").textContent =
      `${offerName(s)} to ${s.cube.value * 2} from ${names()[s.pending.by]}. ${names()[decisionPlayer(s)]} to decide.`;
    if (!mine) return;
    cubeReplies.hidden = false;
    cubeReplies.append(
      button(cubeReplyFace("Drop", `−${s.cube.value}`), () => submitCube({ type: "pass" }), "cube-reply", {
        id: "drop-cube",
        disabled: !mine,
        "aria-label": `Drop, lose ${s.cube.value} point${s.cube.value === 1 ? "" : "s"}`,
      }),
      button(
        cubeReplyFace("Take", s.cube.value * 2),
        () => submitCube({ type: "take" }),
        "cube-reply cube-reply-take",
        { disabled: !mine, id: "take-cube", "aria-label": `Take ${s.cube.value * 2}` },
      ),
    );
    if (canImmediateRedouble(s))
      cubeReplies.append(
        button(
          cubeReplyFace(immediateRedoubleAction(s) === "raccoon" ? "Raccoon" : "Beaver", s.cube.value * 4),
          () => submitCube({ type: immediateRedoubleAction(s) }),
          "cube-reply cube-reply-redouble",
          { disabled: !mine, id: "immediate-redouble", "data-cube-action": immediateRedoubleAction(s), "aria-label": `${immediateRedoubleAction(s) === "raccoon" ? "Raccoon" : "Beaver"} to ${s.cube.value * 4}` },
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
      `${names()[s.result.winner]} ${names()[s.result.winner] === "You" ? "win" : "wins"} ${s.result.points} point${s.result.points === 1 ? "" : "s"} · ${{ 1: "single game", 2: "gammon", 3: "backgammon" }[s.result.level] || "game"}${s.result.matchOver ? " · match complete" : ""}${s.result.reason === "certain bearoff" ? " · certain result" : ""}.`;
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
        { href: "/backgammon/library/#games", class: "btn btn--ghost button ghost" },
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
            "The other player is paused until you reconnect with the saved room. The match stays in this browser’s game history.",
            () => {
              online.leave();
              history.replaceState(null, "", location.pathname);
              render();
            },
            { verb: "Leave", danger: true },
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
            engineNotes()]
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
            "div",
            { class: "stack" },
            el(
              "p",
              {},
              `The other player must accept. Choose the level to concede at the current cube (${s.cube.value}).`,
            ),
            el(
              "div",
              { class: "list resign-options", role: "group", "aria-label": "Resignation level" },
              ...[[1, "Single game"], [2, "Gammon"], [3, "Backgammon"]]
                .filter(
                  ([level]) =>
                    level === 1 ||
                    (!s.off[s.turn] && !(s.rules.jacoby && s.cube.owner === null)),
                )
                .map(([level, label]) => {
                  const points = level * s.cube.value;
                  const row = button("", () => {
                    d.close();
                    commit({ type: "resign", level });
                  }, "list-row", { "aria-label": `${label} · ${points} point${points === 1 ? "" : "s"}` });
                  row.append(
                    el("span", { class: "list-row-label" }, label),
                    el("span", { class: "list-row-value" }, `${points} point${points === 1 ? "" : "s"}`),
                  );
                  return row;
                }),
            ),
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
  return `${names()[e.actor] || playerName(e.actor)} · ${a.type === "move" ? notation(a.steps, e.actor) : (a.type === 'skip-roll' ? 'closed out · pass without rolling' : a.type === "finish-race" ? "certain result" : a.type === "practice-roll" ? "practice roll" : a.type) + (a.dice ? " " + a.dice.join("–") : "")}${e.automatic ? " · automatic" : ""}`;
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
async function persist(history = true, required = false) {
  cancelAnimationFrame(draftSaveFrame);
  clearTimeout(draftSaveTimer);
  draftSaveFrame = draftSaveTimer = null;
  if (game) {
    if (config.mode !== "online") ensureLocalRolls(game);
    saved = {
      id: "play",
      game,
      positionKey: positionKey(game.state),
      draft: clone(draft.draft),
      feedback,
    };
    try {
      await progressWriter.save(saved, { history, stored: key => { persistedWork = key; } });
    } catch (e) {
      if (required) throw e;
      showError(e);
    }
  }
}
async function commit(action, evaluation = null, options = {}) {
  if (committing) return;
  if (action.type === 'roll' && blockedBarRoll(state())) action = {type:'skip-roll'};
  if (config.mode === "online") {
    online.send(action);
    return;
  }
  releaseAssistance();
  committing = true;
  draft.enabled = false;
  try {
    // Acknowledge the tap before replaying/serializing a long session. This is
    // also needed when warnings are off and there is no assistance paint.
    actions();
    if (!document.hidden) await new Promise(resolve =>
      requestAnimationFrame(() => setTimeout(resolve, 0)));
    // Do not release any completed game until its archive has committed.
    // A failed save leaves the result and its full history on the table.
    if (action.type === 'next') await persist(true, true);
    const eventIndex = game.events.length;
    game = await localPlayAction(game, action, options);
    if (evaluation) {
      game.events[eventIndex].evaluation = compactEvaluation(
        evaluation.source,
        evaluation.result,
      );
    }
    if (action.type === "next") {
      game = nextGameTable(game);
      feedback = null;
      clearHistoryStates();
    }
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
// The engine-strength explanation lives behind a disclosure, never above
// the primary action.
function engineNotes() {
  return el(
    "details",
    { class: "setup-engine" },
    el("summary", {}, "About engine strength"),
    el("p", { class: "muted small search-description" }, SEARCH_DESCRIPTION),
  );
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

function showSavedGames() {
  const sessionId = model()?.id;
  if (!sessionId) return;
  savedGames(sessionId, {
    onReturn: config.mode === 'online' ? undefined : async (item, path) => {
      if (committing || assistanceJob || game?.id !== sessionId) throw Error('The table changed. Reopen saved games.');
      await persist(true, true);
      // A bot or another review may have extended this game while the dialog
      // was open. Keep that newest line as the saved variation when returning.
      const source = (game.archiveId || game.id) === item.id ? game
        : archivedTable(await get('items', item.id) || item, config);
      const restored = returnToHistory(source, path);
      stopComputer();
      game = config.mode === 'computer' ? changeControl(restored, decisionPlayer(restored.state)) : restored;
      config = {...game.config};
      feedback = null; draft.draft = []; boardKey = '';
      clearHistoryStates();
      if (opening.active) opening.dismiss();
      await persist(); render();
      window.scrollTo({top:0, behavior:'instant'});
    },
  });
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
        renderResultCard(state());
      },
    },
  );
}
// Keep event handlers outside renderFeedback's scope. A retained row must not
// close over that render's entire match snapshot: every commit clones it, so
// older buttons otherwise keep an ever-growing series of histories alive.
function historyDecisionActions(entry, index, gameId, opponent) {
  const currentRow = () => entry.group.decisions.find(row => row.index === index);
  return {
    restore: canReturnToDecision(currentRow(), gameId) ? () => restoreDecision(currentRow(), gameId) : undefined,
    review: () => {
      const current = currentRow();
      return decisionReview(current.source, {
        beforeRoll: entry.group.decisions.find(row => row.result?.type === "cube" && row.source.phase === "roll" && row.source.cube.value === current.source.cube.value)?.result,
        opponent,
        title: current.result.type === "cube" ? "Cube decision" : "Checker decision",
        onReturn: canReturnToDecision(current, gameId)
          ? () => restoreDecision(current, gameId) : undefined,
        onReplay: canReplayBest(current, gameId)
          ? (steps, result) => replayBest(current, gameId, steps, result) : undefined,
      }).result(current.result);
    },
  };
}
function renderFeedback() {
  const m = model();
  renderMobileSummary(m);
  // Explicit history remains available in every mode, even when automatic
  // feedback is disabled. This does not start any additional analysis jobs.
  feedbackStrip.hidden = !m?.started;
  feedbackFilters.hidden = feedbackStrip.hidden;
  if (feedbackStrip.hidden) {
    previousGames.update(null);
    feedbackView.turns.clear(); feedbackView.games.clear();
    feedbackView.cards.clear();
    feedbackStrip.replaceChildren(); renderedFeedback = null;
    return;
  }
  if (renderedFeedback === m.events) return;
  renderedFeedback = m.events;
  const rows = decisionHistory(m);
  const viewer = config.mode === "online" ? online.seat : config.humanSide;
  previousGames.update({sessionId:m.id, currentId:m.archiveId || m.id,
    filter:feedbackFilter, viewer, mode:config.mode, names:names()});
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
  const context = JSON.stringify([m.id, m.initial, config.mode, viewer, names(), feedbackFilter]);
  if (feedbackView.context !== context) {
    feedbackView.context = context;
    feedbackView.turns.clear();
    feedbackView.games.clear();
    feedbackView.cards.clear();
  }
  const contextText = `Equity · ${state().matchLength ? "normalized match equity" : "current-cube points"} · each decision maker’s perspective. Select Cube or Move to review.`;
  if (feedbackView.caption.textContent !== contextText) feedbackView.caption.textContent = contextText;
  const children = [feedbackView.heading, feedbackView.caption];
  const retained = new Set(), retainedGames = new Set();
  const currentGame = state().gameNumber;
  const gameHeading = game => {
    retainedGames.add(game);
    if (!feedbackView.games.has(game))
      feedbackView.games.set(game, el("h3", { class: "history-game-divider" }, `Game ${game}`));
    children.push(feedbackView.games.get(game));
    if (game !== currentGame) children.push(gameSummaryCard(game, rows, viewer));
  };
  // The playing area already shows the current summary. Analysis starts with
  // its decisions, while older games keep their own summaries for context.
  if (currentGame && !shown.some(group => group.game === currentGame)) gameHeading(currentGame);
  if (!shown.length) {
    feedbackView.empty.textContent = rows.length ? "No decisions from this player yet." : "Decisions will appear here after play begins.";
    children.push(feedbackView.empty);
  }
  for (const group of shown) {
    if (!retainedGames.has(group.game)) gameHeading(group.game);
    retained.add(group.key);
    // Grades arrive independently and each commit clones the match. Keep
    // unchanged DOM in place, but refresh the click handlers' source data.
    let entry = feedbackView.turns.get(group.key);
    if (!entry) feedbackView.turns.set(group.key, entry = {});
    entry.group = group;
    const signature = JSON.stringify([group.turn, group.response, group.decisions.map(row => [
      row.index, row.label, row.source.dice, row.forced, row.result?.type, row.result?.positionKey,
      row.result?.settings?.name, analysisDepthLabel(row.result),
      row.feedback, row.initialAction, row.initialFeedback,
      row.index === reviewIndex, canReturnToDecision(row, m.id),
      !row.feedback && (autoReview.job?.row.index === row.index ? "active" : autoReview.error ? "error" : "queued"),
    ])]);
    if (entry.signature === signature) {
      children.push(entry.node);
      continue;
    }
    entry.signature = signature;
    entry.node = historyTurn(group, {
      names: names(), viewer, local: config.mode === "local", reviewIndex,
      actions: row => historyDecisionActions(entry, row.index, m.id, sideOf(group) === "opponent"),
      pending: row => config.mode === "computer"
        ? (autoReview.job?.row.index === row.index ? "Analyzing…" : autoReview.error ? "Analysis paused" : "Analysis queued")
        : row.forced ? "Forced · no choice" : "Not analyzed",
    });
    children.push(entry.node);
  }
  for (const key of feedbackView.turns.keys()) if (!retained.has(key)) feedbackView.turns.delete(key);
  for (const game of feedbackView.games.keys()) if (!retainedGames.has(game)) feedbackView.games.delete(game);
  for (const game of feedbackView.cards.keys()) if (game === currentGame || !retainedGames.has(game)) feedbackView.cards.delete(game);
  children.push(previousGames.node, feedbackView.footer);
  const wanted = new Set(children);
  for (const child of [...feedbackStrip.children]) if (!wanted.has(child)) child.remove();
  let cursor = feedbackStrip.firstChild;
  for (const child of children) {
    if (child === cursor) cursor = cursor.nextSibling;
    else feedbackStrip.insertBefore(child, cursor);
  }
}

function canReturnToDecision(row, id) {
  return (
    config.mode !== "online" && game?.id === id && !committing &&
    !assistanceJob && row.game === game.state.gameNumber && row.index < game.events.length
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
  await presentBestSource(row.source);
  boardKey = "";
  await commit({ type: "move", steps }, feedback);
}

// Restore the live board before commit/render starts the best-move playback.
// Keep all actions locked while the drafted checkers travel home.
async function presentBestSource(source) {
  committing = true;
  const before = ui.board.state;
  try {
    draft.set(source, legalPaths(source), false);
    actions();
    if (before && checkerKey(before) !== checkerKey(source))
      await ui.board.animateRestore(before, source, "undo");
  } finally {
    committing = false;
  }
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
  // Closing/revising a warning still leaves the table in use. Cancel obsolete
  // answers without throwing away a warm engine needed by the next action.
  if (!job.done) analysis.cancel({releaseWorker:false});
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
  if (automaticDraft?.source === state()) draft.enabled = false;
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
  // The submitted board is already painted. Lock its handlers while grading,
  // but keep the dice/checkers and their running animations mounted until the
  // decision changes. Rebuilding here used an entire slow-phone frame solely
  // to remove controls, immediately before the committed-state render.
  if (kind === "hint") draft.render();
  else {
    ui.board.options.interactive = false;
    ui.board.svg.querySelectorAll('[role="button"]').forEach(node => node.setAttribute('aria-disabled', 'true'));
  }
  actions();
  return job;
}
function showHint({ result: prepared = null, playBest = false } = {}) {
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
  const play = async (steps, result) => {
    if (!activeAssistance(job))
      throw new Error("This hint is no longer current.");
    committing = true;
    releaseAssistance();
    await presentBestSource(job.source);
    feedback = {
      source: job.source,
      result: { ...result, actual: result.candidates[0], error: 0 },
    };
    await commit({ type: "move", steps }, feedback);
  };
  const review = decisionReview(job.source, {
    beforeRoll: analysis.engine.peek({...job.source,phase:"roll",dice:[],pending:null},{preset:config.reviewStrength || "auto"}),
    replayLabel: "Play best",
    onClose: () => {
      if (assistanceJob !== job) return;
      releaseAssistance();
      unlockDraft();
      panel();
      $("hint")?.focus();
    },
    replayDescription:
      "Returns your checkers, then plays the best move using this roll.",
    onReplay: play,
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
      const result = prepared || await analysis.run(job.source, {
        preset: config.reviewStrength || "auto",
        priority: 20,
      });
      if (!activeAssistance(job)) return;
      job.done = true;
      if (playBest && result.candidates?.[0]) await play(result.candidates[0].steps, result);
      else review.result(result);
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
  if (raceAutoPlay.active) raceAutoPlay.reset();
  if (action.type === 'roll' && blockedBarRoll(state())) action = {type:'skip-roll'};
  if (
    config.mode !== "computer" ||
    !config.tutor ||
    (["roll", 'skip-roll'].includes(action.type) && !canDouble(state()))
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
  // Feedback is recorded by AutoReview after commit when warnings are off.
  // Never hold a legal action behind a solver whose result cannot stop it.
  if (!config.warning) {
    beginDecisionAttempt(game, action);
    await commit(action);
    return;
  }
  const job = assistance("submit");
  beginDecisionAttempt(game, action);
  // Persist the first submission even if the warning is revised or reloaded.
  // This is metadata only; the legal game history remains uncommitted.
  const finish = async (result = null) => {
    if (!activeAssistance(job)) return;
    if (!checker && !result && !job.done) return;
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
            submitted: checker ? steps : action.type === 'skip-roll' ? 'roll' : action.type,
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
  const openHint = (playBest = false) => {
    if (!activeAssistance(job)) return;
    const result = completedResult;
    releaseAssistance();
    // The old dialog's delayed close event cannot unlock this new hint job.
    showHint({ result, playBest });
  };
  const warningActions = () => checker ? [
    button("Hint", () => openHint()),
    button("Play Best", () => openHint(true)),
    button("Reset", () => {
      if (!activeAssistance(job)) return;
      releaseAssistance();
      unlockDraft();
      draft.reset();
    }),
    button("Play Anyway", () => finish(completedResult), "primary"),
  ] : [
    button("Revise", () => job.dialog.close()),
    button("Confirm anyway", () => finish(completedResult), "primary", {disabled: !completedResult}),
  ];
  const configureWarning = () => {
    if (checker) {
      job.dialog.classList.add("checker-warning");
      const close = job.dialog.querySelector(".close");
      close.setAttribute("aria-label", "Revise");
      close.title = "Revise your move";
      // Native dialog close events are queued. Cancel on this click so an
      // evaluation completing in the same task cannot accept after Revise.
      close.addEventListener("click", onClose);
    }
    job.dialog.addEventListener("close", onClose, { once: true });
  };
  const showPendingWarning = () => {
    if (!config.warning || !activeAssistance(job)) return;
    if (job.dialog) return;
    warningCopy = el("p", { role: "status", id: "pending-move-loss" },
      checker ? "Still calculating EV. Review your move or play it now."
        : "Checking the cube decision before rolling…");
    job.dialog = dialog("Review before confirming?", warningCopy, warningActions());
    configureWarning();
  };
  try {
    const preset = config.reviewStrength || 'auto';
    const ready = analysis.engine.readyResult(job.source, {preset,submitted:steps});
    // A cache miss must have a visible, usable response on this very tap.
    // No blank locked board while WASM calculates an unprepared decision.
    if (!ready) showPendingWarning();
    persist(false);
    // A cached grade can resolve in the same microtask as the tap. Give the
    // locked controls one paint before committing/rendering the next turn.
    // Keep the worker running while the browser acknowledges the interaction.
    const painted = document.hidden ? Promise.resolve() : new Promise(resolve =>
      requestAnimationFrame(() => setTimeout(resolve, 0)));
    const evaluation = analysis.run(job.source, {
      submitted: steps,
      preset,
      priority: 20,
      readyOnly: true,
      onUnlisted: () => showPendingWarning(),
    });
    let [result] = await Promise.all([evaluation, painted]);
    if (!activeAssistance(job) || (job.dialog && !job.dialog.open)) return;
    if (!checker) result = gradeCube(job.source, result, action.type);
    recordInitialEvaluation(game, action, compactEvaluation(job.source, result));
    persist(false);
    job.done = true;
    completedResult = result;
    if (warningCopy) {
      // Being outside the shortlist is not evidence of a mistake. Once the
      // same-depth grade arrives, only a real loss above the warning threshold
      // can keep this dialog open (including equal cube/drop outcomes).
      if (!needsRevisionWarning(result.error)) {
        await finish(result);
        return;
      }
      const f = decisionFeedback(result, job.source);
      warningCopy.textContent = `${f.label} ${f.loss < 0.01 ? f.loss.toFixed(4) : f.value} ${f.units} at ${result.settings.name}. This is an estimate.`;
      if (!checker) job.dialog.querySelector(".primary").disabled = false;
      return; // Keep the player's review open; never confirm behind the dialog.
    }
    if (config.warning && needsRevisionWarning(result.error)) {
      const f = decisionFeedback(result, job.source);
      job.dialog = dialog(
        "Review before confirming?",
        el(
          "p",
          {},
          `${f.label} ${f.loss < 0.01 ? f.loss.toFixed(4) : f.value} ${f.units} at ${result.settings.name}. This is an estimate.`,
        ),
        warningActions(),
      );
      configureWarning();
    } else await finish(result);
  } catch (error) {
    if (!activeAssistance(job)) return;
    job.done = true;
    if (error.name === "AbortError") {
      onClose();
      return;
    }
    if (warningCopy) {
      warningCopy.textContent = `EV unavailable: ${error.message}. ${checker ? "Play Anyway continues without feedback. Hint retries analysis." : "Revise or continue without feedback."}`;
      if (!checker) {
        const best = job.dialog.querySelector(".primary");
        best.replaceWith(button("Confirm without feedback", () => finish(), "primary"));
      }
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
    if (blockedBarRoll(s)) {
      prethink.prepareAfter(s,{type:'skip-roll'});
      botBusy = false;
      await commit({type:'skip-roll'},null,{autoPass:true});
      return;
    }
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
        readyOnly: true,
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
      const result = await analysis.run(s, { preset: config.strength, readyOnly: true });
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
      if (action.type === 'roll' && blockedBarRoll(s)) action = {type:'skip-roll'};
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
      await presentationPause(s.phase === "move" ? 650 : 300);
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
