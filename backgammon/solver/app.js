// SPDX-License-Identifier: GPL-3.0-or-later
import { presentAnalysis } from "../core/move-presentation.mjs";
import { startUpdates, resumedAfterUpdate } from "../ui/updates.mjs";
import { readPageProgress, keepPageProgress } from "../ui/page-progress.mjs";
import { moveTrace } from "../core/move-trace.mjs";
import {
  initialState,
  clone,
  errors,
  legalPaths,
  legalTurns,
  positionKey,
  applyStep,
  replay,
  notation,
  rulesOf,
  ruleSummary,
  offerName,
  pipCount,
} from "../core/rules.mjs";
import { fromXGID, toXGID, shareURL, sharedPosition } from "../core/xgid.mjs";
import { get, put, itemRecord, settings } from "../core/storage.mjs";
import {
  $,
  shell,
  el,
  button,
  field,
  DraftBoard,
  dialog,
  confirmDialog,
  saveDialog,
  showError,
  copy,
} from "../ui/shell.mjs";
import { AnalysisPanel, resultView, equity } from "../ui/analysis.mjs";
import { clearPosition, swapPositionColors } from "../core/position-editor.mjs";
import { PositionEditor } from "../ui/position-editor.mjs";
import { choiceButtons } from "../ui/choice-buttons.mjs";
import { StudyStrip, closeStudyPanel } from "../ui/study-strip.mjs";
import { ruleControls } from "../ui/rules.mjs";
import { PRESETS, ENGINE_VERSION, SEARCH_DESCRIPTION } from "../engine/metadata.mjs";
import {DEFAULT_ROLLOUT_POLICY, ROLLOUT_POLICIES} from "../engine/rollout-policy.mjs";
import { rolloutUnsupported } from "../engine/rollout.mjs";
import { gradeCube } from "../engine/cube-grade.mjs";
import { matchesPlayContext } from "../core/play-session.mjs";

// Let the document finish loading while the service-worker gate runs.
// Only start the tool after the gate has finished or allowed offline use.
async function boot() {
await startUpdates();
resumedAfterUpdate();
const pageProgress = readPageProgress();
const ui = shell("solver", "Solver");
// Editing, draft moves and alternative previews all settle in the same frame.
ui.board.motion = false;
let source = initialState({ phase: "move", dice: [3, 1], matchLength: 0 }),
  editing = false,
  result = null,
  previousResult = null,
  checkpoint = null,
  rolloutTrials = 256,
  rolloutPolicyId = DEFAULT_ROLLOUT_POLICY,
  preview = null,
  review = null,
  index = 0,
  reviewResults = new Map(),
  busy = false,
  analysisEpoch = 0,
  sourceContext = null,
  openedPosition = false,
  previewIndex = -1,
  solverView = {orientation:null, mirrored:false};
const analysis = new AnalysisPanel(),
  draft = new DraftBoard(ui.board, () => {});
const study = new StudyStrip(previewCandidate, {dropdown:false});
const editor = new PositionEditor(ui.board, next => { source = next; changed(); });
// Keep setup view changes local to Solver. Safari drops the reflection from
// getScreenCTM(), so map mirrored pointer coordinates from the visible viewport.
const renderBoard = ui.board.render.bind(ui.board);
const boardCoordinates = ui.board.coordinates.bind(ui.board);
function reflectLabels() {
  if (!solverView.mirrored) return;
  // Native SVG transforms keep labels legible in WebKit too. Read boxes
  // before writing; the marker prevents retained animation clones flipping twice.
  const labels = [...ui.board.svg.querySelectorAll('text:not([data-solver-reflected])')]
    .map(n=>({n,box:n.getBBox()}));
  for (const {n,box} of labels) {
    n.setAttribute('transform', `${n.getAttribute('transform') || ''} translate(${2 * box.x + box.width} 0) scale(-1 1)`);
    n.dataset.solverReflected = '';
  }
}
for (const name of ['pickUpChecker','showDragLanding','animateEdit']) {
  const original = ui.board[name].bind(ui.board);
  ui.board[name] = (...args) => { const result = original(...args); reflectLabels(); return result; };
}
ui.board.coordinates = (x, y) => {
  if (!solverView.mirrored) return boardCoordinates(x, y);
  const r = ui.board.svg.getBoundingClientRect();
  const scale = Math.min(r.width / 876, r.height / 660);
  return new DOMPoint((r.right - x - (r.width - 876 * scale) / 2) / scale,
    (y - r.top - (r.height - 660 * scale) / 2) / scale);
};
ui.board.render = (state, options = {}) => {
  ui.board.svg.classList.toggle('solver-mirrored', solverView.mirrored);
  renderBoard(state, {...options, orientation:solverView.orientation ?? options.orientation});
  reflectLabels();
};
const renderDraft = draft.render.bind(draft);
draft.render = () => { renderDraft(); if (editing) editor.sync(source, true); };
editor.onDice = () => diceDialog();
editor.onContext = () => contextDialog('cube');
const sectionIcons = {
  position: '<circle cx="7" cy="7" r="3"/><circle cx="17" cy="17" r="3"/><path d="M14 4h6v6M4 14v6h6"/>',
  analysis: '<path d="M4 19V5m0 14h16M8 15l4-5 4 2 4-7"/>',
  save: '<path d="M5 4h14v17l-7-4-7 4z"/>',
};
function sectionTitle(title, icon) {
  const symbol = el('span', {class:'solver-section-icon', 'aria-hidden':true});
  symbol.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${sectionIcons[icon]}</svg>`;
  return el('h3', {class:'solver-group-title'}, symbol, el('span',{},title));
}
const editorContext = button("Settings", contextDialog, "", {id:"editor-context"});
const setupTools = el('div', {class:'solver-setup-tools'},
  button('Clear', () => editor.commit(clearPosition(source)), '', {id:'editor-clear'}),
  button('Start', () => editor.commit({...clone(source), points:initialState().points, bar:[0,0], off:[0,0]}), '', {id:'editor-start', title:'Restore the starting checkers; keep dice, cube and score'}),
  button('Swap colors', () => editor.commit(swapPositionColors(source)), '', {id:'editor-swap'}),
  button('Flip board', () => changeView('orientation'), '', {id:'editor-flip'}),
  button('Direction', () => changeView('mirrored'), '', {id:'editor-direction','aria-pressed':false}),
  editorContext);
const setupDisclosure = el('details', {id:'editor-tools',open:innerWidth>700},
  el('summary',{},'Board tools'),setupTools);
editor.node.append(setupDisclosure);
function changeView(key) {
  ui.board.endDrag(); editor.selected = null; editor.dragging = false;
  if (key === 'orientation') solverView.orientation = 1 - (solverView.orientation ?? settings().orientation);
  else solverView.mirrored = !solverView.mirrored;
  saveDraft(); render();
}
const decisionChoices = choiceButtons([['move','Checker move'],['roll','Cube decision'],['double','Cube response']],source.phase,value=>{
  const turn = value==='double' ? (source.cube.owner ?? source.turn) : source.turn;
  const next = {...clone(source),turn,phase:value,pending:value==='double'?{type:'double',by:turn}:null,
    dice:value==='move'?(source.dice.length?source.dice:[3,1]):[]};
  editor.commit(next);
});
decisionChoices.id='editor-decision'; decisionChoices.setAttribute('aria-label','Decision to analyze');
editor.node.append(el('span',{class:'solver-control-label'},'Decision to analyze'), decisionChoices);
study.node.after(editor.node);
// The same controls live beside the board on desktop, and below it on phones.
const contextStrip = el("section", { class: "solver-context", "aria-label": "Position context" });
const setupDock = el('section',{class:'solver-setup-dock','aria-label':'Position setup'},sectionTitle('Position setup','position'),contextStrip,editor.node);
study.node.after(setupDock);
const wideSetup = matchMedia('(min-width: 1025px) and (min-height: 501px)');
wideSetup.addEventListener('change',()=>{setupDisclosure.open=wideSetup.matches;render();});
// One progress component for analysis: indeterminate while GNUbg searches,
// determinate for rollouts and match review. The text stays in #message and
// the inspector's engine status (the page's polite regions).
const progressBar = el("div", { class: "bar bar--indeterminate", role: "progressbar", "aria-label": "Analysis progress" });
const progress = el("div", { class: "progress solver-progress", hidden: true }, progressBar);
$("message").after(progress);
function setProgress(value = null) {
  progress.hidden = !busy;
  progressBar.classList.toggle("bar--indeterminate", value === null);
  progressBar.style.setProperty("--value", value === null ? 0 : Math.min(1, value));
  if (value === null) progressBar.removeAttribute("aria-valuenow");
  else {
    progressBar.setAttribute("aria-valuemin", "0");
    progressBar.setAttribute("aria-valuemax", "100");
    progressBar.setAttribute("aria-valuenow", String(Math.round(Math.min(1, value) * 100)));
  }
}
function renderContext() {
  const s = source, names = ['White','Black'];
  const item = (label, value, action, id) => {
    const control = button('', action, 'solver-context-item', {id,'aria-label':`${label}: ${value}`});
    control.append(el('span',{class:'solver-context-label'},label),el('strong',{},value));
    control.disabled = !!review;
    return control;
  };
  contextStrip.replaceChildren(
    item('Turn',names[s.turn],()=>editor.commit({...clone(source),turn:1-source.turn,
      pending:source.pending?{...source.pending,by:1-source.pending.by}:null}), 'solver-turn'),
    item('Dice',s.dice.length?s.dice.join('–'):'Set dice',diceDialog,'solver-dice'),
    item('Cube',`${s.cube.value} · ${s.cube.owner===null?'Center':names[s.cube.owner]}`,()=>contextDialog('cube'),'solver-cube'),
    item('Match',s.matchLength?`${s.scores[0]}–${s.scores[1]} / ${s.matchLength}${s.crawford?' · Crawford':''}`:'Unlimited',()=>contextDialog('match'),'solver-match'),
  );
  for (const [id,player] of [['opponent',1-(solverView.orientation??settings().orientation)],['player',solverView.orientation??settings().orientation]]) {
    $(id).replaceChildren(el('span',{},names[player]),el('span',{class:'muted'},`${pipCount(preview || s,player)} pips`));
  }
  decisionChoices.value=s.phase;
  $('editor-direction').setAttribute('aria-pressed',String(solverView.mirrored));
  $('editor-flip').setAttribute('aria-pressed',String((solverView.orientation??settings().orientation)===1));
}
function previewCandidate(candidate) {
  previewIndex = candidate && result?.candidates
    ? result.candidates.findIndex((c) => JSON.stringify(c.steps) === JSON.stringify(candidate.steps))
    : -1;
  preview = candidate ? candidate.steps.reduce((s, st) => applyStep(s, st), source) : null;
  draft.previewTrace = candidate ? { state: preview, trace: moveTrace(preview, source.turn, candidate.steps, source.dice) } : null;
  render();
  closeStudyPanel();
}
// Analysis can finish between pointerdown and pointerup. Keep these controls
// connected so a completed-result repaint cannot swallow a click or focus.
const editControl = button(
  "Edit position",
  () => {
    if (!editing) {
      analysisEpoch++;
      analysis.cancel();
      busy = false;
    }
    editing = !editing;
    preview = null;
    render();
    if (!editing) autoAnalyze();
  },
  "",
  { id: "edit-position" },
);
const analyzeControl = button(
  "Analyze",
  () => (busy ? cancel() : analyze()),
  "primary",
  { id: "analyze" },
);
const sourceControl = button("Source", () => {
  preview = null;
  previewIndex = -1;
  render();
}, "source-preview-control");
const quickAnalysis = el('div',{class:'solver-quick-analysis','aria-label':'Analyze position'},
  ...[['auto','Auto'],['deep','2 ply'],['research','4 ply']].map(([preset,label])=>button(label,()=>{
    if(busy)cancel(); analysis.preset=preset; analyze();
  },'',{'data-analyze-preset':preset})),
  button('Rollout',()=>{
    if (busy) cancel();
    editing=false; render();
    const controls=$('rollout-controls');
    controls.open=true;
    if (getComputedStyle($('inspector')).display==='none') $('panel-toggle').click();
    controls.scrollIntoView({block:'start',behavior:'smooth'});
  },'',{id:'solver-rollout'}));
$('actions').after(quickAnalysis);
const actionArea = document.querySelector('.action-area');
actionArea.classList.add('solver-controls');
const actionsAnchor = document.createComment('Solver controls below the board on phones');
actionArea.before(actionsAnchor);
const analysisControls = el('section', {class:'solver-analysis-controls', 'aria-label':'Analyze position'},
  sectionTitle('Analyze position','analysis'), document.querySelector('.action-main'), $('message'), progress, study.node);
actionArea.prepend(analysisControls);
analysis.preset = "auto";
const hash = new URLSearchParams(location.hash.slice(1)),
  params = new URLSearchParams(location.search);
try {
  if (hash.has("state") || hash.has("xgid")) {
    source = sharedPosition(hash);
    openedPosition = true;
    const context = await get("work", "solver-context");
    if (matchesPlayContext(context, params.get("fromPlay"), source))
      sourceContext = context;
  } else if (params.has("item")) {
    const item = await get("items", params.get("item"));
    if (!item) throw new Error("This item is not in this browser’s Library.");
    openedPosition = true;
    if (item.kind === "match") {
      review = item;
      index = 0;
      source = replay(item.initial, item.events)[0];
    } else {
      source = clone(item.state);
      openedPosition = true;
    }
  } else {
    const saved = await get("work", "solver");
    if (saved?.state) {
      source = saved.state;
      sourceContext = saved.context || null;
      solverView = saved.view || solverView;
      openedPosition = true;
    }
  }
} catch (e) {
  showError(e);
}
if (pageProgress?.source) {
  source = pageProgress.source;
  sourceContext = pageProgress.sourceContext;
  editing = pageProgress.editing;
  solverView = pageProgress.solverView || solverView;
  result = presentAnalysis(source, pageProgress.result);
  review = pageProgress.review;
  index = pageProgress.index;
  openedPosition = true;
}
keepPageProgress(() => ({
  source,
  sourceContext,
  editing,
  solverView,
  result,
  review,
  index,
}));
if (sourceContext)
  document.querySelector('.nav a[href="/backgammon/play/"]').href =
    `/backgammon/play/#resume=${encodeURIComponent(sourceContext.game.id)}`;
try {
  const savedRollout = await get("work", "solver-rollout");
  if (
    savedRollout?.checkpoint?.engine === ENGINE_VERSION &&
    savedRollout.checkpoint.positionKey === positionKey(source)
  )
    { checkpoint = savedRollout.checkpoint; rolloutPolicyId = checkpoint.policy || DEFAULT_ROLLOUT_POLICY; }
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
if (openedPosition) {
  saveDraft();
  autoAnalyze();
}
addEventListener("pagehide", () => {
  analysisEpoch++;
  analysis.cancel();
  busy = false;
});
addEventListener("pageshow", (e) => {
  if (e.persisted) {
    render();
    if (!result) autoAnalyze();
  }
});
function autoAnalyze() {
  const token = analysisEpoch,
    key = positionKey(source);
  requestAnimationFrame(() => {
    if (
      token === analysisEpoch &&
      key === positionKey(source) &&
      !editing &&
      !busy &&
      !result &&
      !errors(source).length &&
      ["move", "roll", "double"].includes(source.phase)
    )
      analyze();
  });
}
function changed() {
  analysisEpoch++;
  analysis.cancel();
  busy = false;
  result = null;
  previousResult = null;
  checkpoint = null;
  preview = null;
  saveDraft();
  render();
}
async function saveDraft() {
  try {
    await put("work", {
      id: "solver",
      state: source,
      context: sourceContext,
      view: solverView,
    });
  } catch (e) {
    showError(e);
  }
}
function render() {
  const problems = errors(source);
  const emptySetup = editing && source.off.every(n=>n===15);
  study.set(editing || problems.length ? null : result, preview);
  ui.equityBar.set({
    state: source,
    result,
    blocked:
      editing || problems.length
        ? "Finish editing a valid position to see equity."
        : preview
          ? "Return to Source to see its equity."
          : "",
  });
  draft.set(source, editing || problems.length ? [] : legalPaths(source), false);
  draft.preview = preview;
  draft.render();
  editor.sync(source, editing);
  document.querySelector(".app").classList.toggle("editing-position", editing);
  if (!preview) previewIndex = -1;
  renderContext();
  if (!busy || progress.hidden) setProgress();
  $("subtitle").textContent = review
    ? `${review.title} · event ${index}/${review.events.length}`
    : preview
      ? "Alternative preview · source position preserved"
      : `${source.matchLength ? source.matchLength + "-point match" : "Unlimited points"} · ${source.phase === "double" ? `${offerName(source)} to ${source.cube.value * 2}` : source.dice.length ? source.dice.join("–") : "pre-roll"} · cube ${source.cube.value}`;
  $("message").textContent = emptySetup ? "Choose a color, then tap points to place checkers." : problems.length
    ? problems.join(" ")
    : editing
      ? ""
      : preview
        ? "Preview only. Return to the source to edit."
        : busy
          ? "Analyzing this position with GNUbg…"
          : result?.type === "checker"
            ? `Best evaluated: ${result.candidates[0].notation} · ${result.settings.name}`
            : result?.type === "cube"
              ? `GNUbg: ${result.action} · ${result.settings.name}`
              : "";
  $("message").classList.toggle("error", !!problems.length && !emptySetup);
  const editLabel = editing ? "Done editing" : "Edit position";
  if (editControl.textContent !== editLabel)
    editControl.textContent = editLabel;
  editControl.disabled = !!review;
  const analyzeLabel = busy ? "Cancel" : "Analyze";
  if (analyzeControl.textContent !== analyzeLabel)
    analyzeControl.textContent = analyzeLabel;
  analyzeControl.disabled =
    !!problems.length || !["move", "roll", "double"].includes(source.phase);
  if (!editControl.isConnected)
    $("actions").append(editControl, analyzeControl);
  if (preview) {
    if (!sourceControl.isConnected) $("actions").prepend(sourceControl);
  } else sourceControl.remove();
  $("panel-toggle").textContent = result ? "Results" : "Details";
  for(const control of quickAnalysis.querySelectorAll('button')) control.disabled=!!problems.length||!!review;
  for(const control of quickAnalysis.querySelectorAll('[data-analyze-preset]'))
    control.setAttribute('aria-pressed',String(control.dataset.analyzePreset===analysis.preset));
  quickAnalysis.title = `Current analysis: ${analysis.preset === 'auto' ? 'Auto' : analysis.preset === 'puretd' ? 'PureTD money' : analysis.preset === 'puretd-wide' ? 'PureTD wide' : PRESETS[analysis.preset]?.name}`;
  panel(problems);
  const docked = wideSetup.matches;
  document.querySelector('.app').classList.toggle('setup-docked',docked);
  document.querySelector('.app').classList.toggle('solver-actions-docked',docked);
  // Reparent only when crossing the layout breakpoint. Even moving an
  // already-positioned node can interrupt a pointer gesture during analysis.
  if (docked) {
    if (actionArea.parentElement !== $('inspector')) $('inspector').prepend(actionArea);
  } else if (actionsAnchor.nextSibling !== actionArea) actionsAnchor.after(actionArea);
}
function panel(problems) {
  const p = $("panel");
  const rolloutOpen = p.querySelector("#rollout-controls")?.open || false;
  p.replaceChildren(
    el(
      "div",
      { class: "segmented" },
      button(
        "Position",
        () => {
          if (review) {
            review = null;
            sourceContext = null;
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
  // The inspector reads as three groups (Position · Analysis · Save); the
  // section buttons jump between them and every control stays mounted.
  const group = (id, title) =>
    el("section", { class: "solver-group", id: `solver-${id}`, "aria-labelledby": `solver-${id}-title` },
      Object.assign(sectionTitle(title, id === 'save' ? 'save' : id === 'analysis' ? 'analysis' : 'position'), {id:`solver-${id}-title`}));
  const positionGroup = group("position", "Position tools"),
    analysisGroup = group("analysis", "Analysis & results"),
    saveGroup = group("save", "Save to Library");
  p.append(
    el(
      "nav",
      { class: "solver-sections", "aria-label": "Inspector sections" },
      el("span", { class: "solver-sections-label", "aria-hidden": "true" }, "Jump to"),
      ...[[positionGroup, "Position"], [analysisGroup, "Analysis"], [saveGroup, "Save"]].map(([node, label]) =>
        button(label, () => node.scrollIntoView({ block: "start", behavior: "instant" }), "ghost", {
          "aria-label": `${label} section`, "aria-controls": node.id,
        })),
    ),
    positionGroup,
    analysisGroup,
    saveGroup,
  );
  let into = positionGroup;
  const add = (...nodes) => into.append(...nodes);
  add(
    el(
      "p",
      { class: "muted small", id: "position-rules" },
      ruleSummary(source),
    ),
  );
  if (review) {
    const timeline = el("input", {type:"range", min:0, max:review.events.length, value:index,
      "aria-label":"Match event", onInput:e => seek(Number(e.target.value))});
    add(
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
  if (!review && !editing) add(button('Dice, cube & match context', contextDialog));
  if (!review) add(button("Import / export XGID", xgidDialog));
  if (!problems.length && ["move", "roll", "double"].includes(source.phase))
    add(
      button("Play from this position", async () => {
        await put("work", {
          id: "study",
          state: clone(source),
          context: sourceContext,
        });
        location.href = "/backgammon/play/#study=1";
      }),
    );
  into = analysisGroup;
  add(
    el(
      "details",
      {},
      el("summary", {}, "Analysis settings"),
      field(
        "Analysis strength",
        choiceButtons(
          [
            ["auto", "Auto · adaptive, 3–4 ply"],
            ...Object.entries(PRESETS).map(([key, value]) => [
              key,
              `Fixed ${value.plies} ply · ${value.name}`,
            ]),
            ['puretd', 'PureTD money · 1 ply · experimental'],
            ['puretd-wide', 'PureTD wide · 1 ply · experimental'],
          ],
          analysis.preset,
          (value) => {
            analysis.preset = value;
            for(const control of quickAnalysis.querySelectorAll('[data-analyze-preset]'))
              control.setAttribute('aria-pressed',String(control.dataset.analyzePreset===value));
          },
        ),
      ),
      el(
        "p",
        { class: "muted small" },
        SEARCH_DESCRIPTION + ' PureTD money and PureTD wide are separate learned evaluators for checker moves in money/Jacoby games without beavers or raccoons. They report cubeful equity only and evaluate all legal root moves at one ply. Wide uses a larger, slower model with closer EVs in the published opening comparison. Cube decisions and rollout controls run GNUbg.',
      ),
    ),
    analysis.status,
  );
  if (result)
    add(
      resultView(result, {
        source,
        previous: previousResult,
        onPreview: previewCandidate,
        selected: previewIndex,
      }),
    );
  if (!editing)
    add(
      el(
        "details",
        { id: "rollout-controls", open: rolloutOpen },
        el("summary", {}, "Roll out this decision"),
        el(
          "p",
          { class: "muted small" },
          "Simulate games with GNUbg. Short/deep stops after five turns and evaluates the remaining position. More trials reduce sampling noise, not policy bias. Completed batches survive cancellation and reload.",
        ),
        field(
          "Rollout playing strength",
          choiceButtons(Object.values(ROLLOUT_POLICIES).map(p=>[p.id,p.truncationPlies ? `${p.name} · 5-turn simulation` : `${p.name} · checker ${p.checkerPlies} / cube ${p.cubePlies} ply`]),
            rolloutPolicyId, v=>{rolloutPolicyId=v;render();}),
        ),
        el("p",{class:"muted small"},"Balanced and Strong search before future checker and cube decisions. Strong can take substantially longer. Discard the saved rollout before changing its policy."),
        field(
          "Rollout trials per alternative",
          choiceButtons(
            [64, 256, 1024, 4096].map((n) => [String(n), String(n)]),
            String(rolloutTrials),
            (v) => (rolloutTrials = Number(v)),
          ),
        ),
        ...(rolloutUnsupported(source)
          ? [el("p", { class: "notice" }, rolloutUnsupported(source))]
          : [
              button(
                checkpoint
                  ? `Resume / extend · ${checkpoint.completed} saved trials`
                  : "Start rollout",
                rollOut,
                "",
                { id: "start-rollout", disabled: busy || !!(checkpoint && checkpoint.policy !== rolloutPolicyId) },
              ),
            ]),
        checkpoint
          ? button(
              "Discard saved rollout",
              () =>
                confirmDialog(
                  "Discard rollout?",
                  "Completed simulation samples for this position will be removed.",
                  async () => {
                    checkpoint = null;
                    await put("work", {
                      id: "solver-rollout",
                      checkpoint: null,
                    });
                    render();
                  },
                ),
              "ghost",
            )
          : null,
      ),
      el(
        "a",
        { href: "/backgammon/reports/" },
        "Engine accuracy & speed report",
      ),
    );
  if (result?.actual || result?.actualDecision)
    add(
      el(
        "div",
        { class: "notice" },
        `Played move loss: ${equity(result.error)} normalized equity.`,
      ),
    );
  into = saveGroup;
  add(
    button("Save position to Library", () =>
      saveDialog(source, "position", { analysis: result }),
    ),
  );
  if (result)
    add(
      button("Save as exercise", () =>
        saveDialog(source, "position", {
          analysis: result,
          tags: ["exercise"],
        }),
      ),
    );
  if (result?.actual || result?.actualDecision)
    add(
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
}
function diceChoices(value) {
  const group = choiceButtons([1,2,3,4,5,6].map(n=>[n,String(n)]), value);
  group.classList.add('dice-choices');
  const pips = [[4],[0,8],[0,4,8],[0,2,6,8],[0,2,4,6,8],[0,2,3,5,6,8]];
  for (const b of group.children) {
    const n = Number(b.dataset.choice);
    b.setAttribute('aria-label',String(n));
    b.replaceChildren(...Array.from({length:9}, (_,i)=>el('span', {class:pips[n-1].includes(i)?'pip':'', 'aria-hidden':true})));
  }
  return group;
}
function diceDialog() {
  const turn = choiceButtons([[0,'White'],[1,'Black']],source.turn);
  const first = diceChoices(source.dice[0]||3), second = diceChoices(source.dice[1]||1);
  const d = dialog('Set dice', el('div',{class:'dice-editor-fields'},field('Player on roll',turn),field('First die',first),field('Second die',second)),[
    button('Apply dice',()=>{const next={...source,turn:Number(turn.value),phase:'move',pending:null,dice:[+first.value,+second.value]};
      d.close();editor.commit(next);},'primary')]);
  d.classList.add('dice-editor-dialog');
}
function contextDialog(focus) {
  let contextRules = rulesOf(source);
  const input = (v, min, max) =>
    el("input", { type: "number", value: v, min, max });
  const turn = choiceButtons(
      [
        ["0", "White"],
        ["1", "Black"],
      ],
      source.turn,
    ),
    phase = choiceButtons(
      [
        ["move", "Rolled dice"],
        ["roll", "Before roll"],
        ["double", "Respond to double"],
        ["beaver", "Respond to beaver"],
        ["raccoon", "Respond to raccoon"],
      ],
      source.phase === "double" && source.pending?.depth
        ? ["double", "beaver", "raccoon"][source.pending.depth]
        : source.phase,
    );
  const d1 = diceChoices(source.dice[0] || 3),
    d2 = diceChoices(source.dice[1] || 1),
    cube = choiceButtons([1,2,4,8,16,32,64,128,256,512,1024].map(n=>[n,String(n)]),source.cube.value),
    owner = choiceButtons(
      [
        ["center", "Centered"],
        ["0", "White"],
        ["1", "Black"],
      ],
      source.cube.owner === null ? "center" : source.cube.owner,
    ),
    len = input(source.matchLength, 0, 25),
    score = source.scores.map((v) => input(v, 0, 100000)),
    bar = source.bar.map((v) => input(v, 0, 15)),
    off = source.off.map((v) => input(v, 0, 15));
  const crawford = el("input", {
      type: "checkbox",
      checked: source.crawford,
    }),
    played = el("input", {
      type: "checkbox",
      checked: source.crawfordPlayed,
    });
  const rulesPanel = el("div");
  const setRules = () =>
    rulesPanel.replaceChildren(
      ruleControls(Number(len.value), contextRules, (rules) => {
        contextRules = rules;
      }, choiceButtons),
    );
  len.addEventListener("input", setRules);
  setRules();
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
        field("Cube value (accepted stake)", cube),
        field("Cube owner", owner),
      ),
      field("Match length (0 = unlimited)", len),
      el(
        "div",
        { class: "pair" },
        ...score.map((n, i) => field(`${i ? "Black" : "White"} score`, n)),
      ),
      el(
        "div",
        { class: "pair" },
        ...bar.map((n, i) => field(`${i ? "Black" : "White"} on bar`, n)),
      ),
      el(
        "div",
        { class: "pair" },
        ...off.map((n, i) => field(`${i ? "Black" : "White"} off`, n)),
      ),
      el("label", { class: "check" }, crawford, "Crawford game"),
      el("label", { class: "check" }, played, "Crawford already played"),
      rulesPanel,
    ),
    [
      button(
        "Apply context",
        () => {
          const next = {
            ...source,
            turn: Number(turn.value),
            phase: ["beaver", "raccoon"].includes(phase.value)
              ? "double"
              : phase.value,
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
            rules: contextRules,
            pending: ["double", "beaver", "raccoon"].includes(phase.value)
              ? {
                  type: "double",
                  by:
                    phase.value === "beaver"
                      ? 1 - Number(turn.value)
                      : Number(turn.value),
                  ...(phase.value !== "double"
                    ? { depth: phase.value === "beaver" ? 1 : 2 }
                    : {}),
                }
              : null,
          };
          const problems = errors(next).filter(problem =>
            !(editing && source.off.every(n=>n===15) && problem === 'Both players cannot have finished.'));
          if (problems.length) throw new Error(problems.join(' '));
          d.close();
          editor.commit(next);
        },
        "primary",
      ),
    ],
  );
  d.classList.add('solver-context-dialog');
  if (focus === 'cube' || focus === 'match') requestAnimationFrame(()=>
    (focus==='cube'?cube:len).closest('.field').scrollIntoView({block:'start'}));
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
          editor.reset();
          d.close();
          changed();
          autoAnalyze();
        },
        "primary",
      ),
    ],
  );
}
async function analyze() {
  if (busy) return;
  const token = ++analysisEpoch;
  editing = false;
  busy = true;
  preview = null;
  render();
  const key = positionKey(source);
  try {
    const event = review?.events[index];
    const show = (answer) => {
      if (token !== analysisEpoch || key !== positionKey(source)) return;
      if (
        answer.type === "cube" &&
        answer.available !== false &&
        event &&
        ["roll", "double", "take", "pass", "beaver", "raccoon"].includes(
          event.action.type,
        )
      )
        Object.assign(answer, gradeCube(source, answer, event.action.type));
      if (result?.positionKey !== answer.positionKey) previousResult = null;
      else if (result.settings.plies !== answer.settings.plies) previousResult = result;
      result = answer;
      if (review) reviewResults.set(index, answer);
      render();
    };
    const answer = await analysis.run(source, {
      submitted: event?.action.type === "move" ? event.action.steps : null,
      onEvaluation: show,
    });
    show(answer);
  } catch (e) {
    if (token === analysisEpoch && e.name !== "AbortError") showError(e);
  } finally {
    if (token === analysisEpoch) {
      busy = false;
      render();
    }
  }
}
async function rollOut() {
  if (busy) return;
  const reason = rolloutUnsupported(source);
  if (reason) throw new Error(reason);
  const token = ++analysisEpoch,
    key = positionKey(source);
  busy = true;
  preview = null;
  render();
  const seed =
    checkpoint?.seed ?? crypto.getRandomValues(new Uint32Array(1))[0];
  try {
    const answer = await analysis.run(source, {
      rollout: { trials: rolloutTrials, seed, resume: checkpoint, policy: rolloutPolicyId },
      submitted:
        review?.events[index]?.action.type === "move"
          ? review.events[index].action.steps
          : null,
      onProgress: (cp) => {
        if (token !== analysisEpoch || key !== positionKey(source)) return;
        checkpoint = cp;
        setProgress(cp.completed / Math.max(rolloutTrials, cp.completed || 1));
        analysis.status.textContent = `${cp.completed} / ${Math.max(rolloutTrials, cp.completed)} trials per alternative completed · ${(cp.elapsedMs / 1000).toFixed(1)} s`;
        put("work", { id: "solver-rollout", checkpoint: cp }).catch(showError);
      },
    });
    if (token !== analysisEpoch || key !== positionKey(source)) return;
    previousResult = result;
    result = answer;
    checkpoint = answer.checkpoint;
    const action = review?.events[index]?.action;
    if (action && result.type === "cube" && ["roll", "double", "take", "pass", "beaver", "raccoon"].includes(action.type))
      Object.assign(result, gradeCube(source, result, action.type));
    if (review) reviewResults.set(index, result);
  } catch (e) {
    if (token === analysisEpoch && e.name !== "AbortError") showError(e);
  } finally {
    if (token === analysisEpoch) {
      busy = false;
      render();
      if (result?.method === "rollout") $("panel").parentElement.scrollTop = 0;
    }
  }
}
function cancel() {
  analysisEpoch++;
  analysis.cancel();
  busy = false;
  render();
}
function seek(i) {
  analysisEpoch++;
  analysis.cancel();
  index = i;
  source = clone(replay(review.initial, review.events)[i]);
  checkpoint = null;
  previousResult = null;
  result = presentAnalysis(source, reviewResults.get(i) || null);
  preview = null;
  busy = false;
  render();
  if (!result) autoAnalyze();
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
          sourceContext = null;
          reviewResults.clear();
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
  analysis.cancel();
  const token = ++analysisEpoch;
  busy = true;
  render();
  const states = replay(review.initial, review.events);
  try {
    for (let i = index; i < review.events.length; i++) {
      if (!["move", "roll", "double"].includes(states[i].phase)) continue;
      const event = review.events[i];
      if (
        ![
          "move",
          "double",
          "roll",
          "take",
          "pass",
          "beaver",
          "raccoon",
        ].includes(event.action.type)
      )
        continue;
      const answer = await analysis.analyzeRaw(states[i], {
        submitted: event.action.type === "move" ? event.action.steps : null,
        priority: 0,
      });
      if (token !== analysisEpoch) return;
      if (answer.type === "cube" && answer.available !== false)
        Object.assign(answer, gradeCube(states[i], answer, event.action.type));
      reviewResults.set(i, answer);
      setProgress((i + 1 - index) / Math.max(1, review.events.length - index));
      analysis.status.textContent = `Completed ${reviewResults.size} decisions · event ${i + 1}/${review.events.length}`;
      if (!busy) break;
    }
  } catch (e) {
    if (token === analysisEpoch && e.name !== "AbortError") showError(e);
  }
  if (token === analysisEpoch) {
    busy = false;
    render();
  }
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

document.documentElement.dataset.appReady = "true";
}
boot();
