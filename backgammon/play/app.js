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
} from "../core/storage.mjs";
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
import { AnalysisPanel, resultView, equity } from "../ui/analysis.mjs";
import { Online } from "./network.mjs";
import { ruleControls } from "../ui/rules.mjs";
import { OpeningRoll } from "../ui/opening-roll.mjs";
import { sound } from "../ui/sound.mjs";
const ui = shell("play", "Play", "Your table. Your pace.");
let config = {
    rules: defaultPlayRules(0),
    mode: "computer",
    humanSide: 0,
    matchLength: 0,
    strength: "quick",
    tutor: false,
    warning: false,
    name: "You",
    opponent: "Friend",
  },
  game = null,
  boardKey = "",
  botBusy = false,
  botPaused = false,
  feedback = null,
  netStatus = "Not connected",
  saved = null,
  committing = false,
  leaving = false,
  lastMotion = "",
  renderedGameId = null,
  epoch = 0;
const analysis = new AnalysisPanel();
const draft = new DraftBoard(ui.board, () => {
  actions();
  detailDraft();
  persist();
});
const opening = new OpeningRoll(ui.board.container, () => {
  boardKey = "";
  render();
});
const online = new Online({
  onChange: () => {
    if (config.mode === "online") render();
  },
  onStatus: (_, message) => {
    netStatus = message;
  },
  onError: showError,
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
      playerControls(() => d.close(), "dialog-"),
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
  stopComputer();
  persist();
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
  }
}
function stopComputer() {
  epoch++;
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
  if (config.mode === "online")
    return online.ready && !online.pending && online.seat === decisionPlayer(s);
  return humanControls(config, s);
}
function render() {
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
  if (key !== boardKey) {
    const before = ui.board.state,
      event = m?.events?.at(-1);
    boardKey = key;
    draft.names = m?.names ||
      m?.players?.map((p) => p.name) || ["Ivory", "Teal"];
    draft.set(
      s,
      legalPaths(s),
      !!m?.started &&
        myTurn(s) &&
        !botBusy &&
        !opening.active &&
        s.phase === "move",
    );
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
    if (freshEvent) {
      if (event?.action.type === "roll") ui.board.animateDice();
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
  }
  if (opening.active)
    for (const id of ["player", "opponent"]) $(id).classList.remove("active");
  $("subtitle").textContent = m?.started
    ? `${s.matchLength ? s.matchLength + "-point match" : "Unlimited points"} · ${s.crawford ? "Crawford game" : s.crawfordPlayed ? "Post-Crawford" : `Game ${s.gameNumber}`} · cube ${s.cube.value}${!s.matchLength && s.rules.jacoby ? " · Jacoby" : ""}`
    : "Computer, same-device, or a private room";
  $("panel-toggle").textContent = m?.started ? "Details" : "Setup";
  actions();
  panel();
  if (m?.started && config.mode === "computer") computerTurn();
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
      el(
        "label",
        { class: "check" },
        el("input", {
          type: "checkbox",
          checked: config.tutor,
          onChange: (e) => {
            config.tutor = e.target.checked;
            render();
          },
        }),
        "Tutor feedback",
      ),
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
        "Two players. No engine assistance or committed takebacks. Keep this page open; some networks block peer connections.",
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
  const s = state(),
    m = model(),
    a = $("actions");
  const controls = $("table-player-controls");
  if (controls && m?.started && config.mode !== "online")
    controls.replaceChildren(playerControls());
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
  const mine = myTurn(s) && !botBusy && !committing;
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
    $("message").textContent = `${names()[s.turn]} to roll`;
    a.append(
      button("Double", () => commit({ type: "double" }), "", {
        disabled: !mine || !canDouble(s),
      }),
      button("Roll dice", () => commit({ type: "roll" }), "primary", {
        disabled: !mine,
        id: "roll",
      }),
    );
  } else if (s.phase === "move") {
    $("message").textContent = mine
      ? draft.complete()
        ? draft.draft.length
          ? "Turn ready to confirm."
          : "No legal move · confirm the pass."
        : draft.current().bar[s.turn]
          ? "Enter from the bar first."
          : "Use all playable dice, then confirm."
      : `${names()[s.turn]} is moving`;
    a.append(
      button("Undo", () => draft.undo(), "", {
        disabled: !mine || !draft.draft.length,
        id: "undo",
      }),
      button("Reset", () => draft.reset(), "", {
        disabled: !mine || !draft.draft.length,
        id: "reset-draft",
      }),
      button(
        draft.complete() && !draft.draft.length
          ? "Confirm pass"
          : "Confirm turn",
        submit,
        `primary${draft.complete() && mine ? " turn-ready" : ""}`,
        { disabled: !mine || !draft.complete(), id: "confirm" },
      ),
    );
  } else if (s.phase === "double") {
    $("message").textContent =
      `${offerName(s)} to ${s.cube.value * 2} from ${names()[s.pending.by]}. ${names()[decisionPlayer(s)]} to decide.`;
    a.append(
      button("Pass", () => commit({ type: "pass" }), "", { disabled: !mine }),
      button(
        `Take ${s.cube.value * 2}`,
        () => commit({ type: "take" }),
        "primary",
        { disabled: !mine },
      ),
    );
    if (canImmediateRedouble(s))
      a.append(
        button(
          `${offerDepth(s) ? "Raccoon" : "Beaver"} to ${s.cube.value * 4}`,
          () => commit({ type: offerDepth(s) ? "raccoon" : "beaver" }),
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
      el(
        "p",
        { class: "muted small" },
        config.mode === "computer"
          ? `GNUbg · ${config.strength} · ${config.tutor ? "tutor enabled" : "unassisted play"}`
          : "Take turns on this device. Only unconfirmed checker moves can be undone.",
      ),
      ...(config.mode === "computer" ? [analysis.status] : []),
    );
  p.append(
    el("p", { class: "muted small", id: "active-rules" }, ruleSummary(s)),
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
  if (feedback && config.mode !== "online")
    p.append(
      el(
        "div",
        { class: "notice" },
        `Last move: ${feedback.result.error < 0.005 ? "equivalent at this setting" : `${equity(feedback.result.error)} equity below the best evaluated move`}.`,
      ),
      button("Review decision", () => {
        dialog("Tutor review", resultView(feedback.result));
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
  if (config.mode === "online" && m.events.length)
    p.append(
      button("Save match history", async () => {
        await put(
          "items",
          itemRecord("match", {
            id: m.id,
            title: `${names().join(" vs ")} · online`,
            initial: m.initial,
            events: m.events,
            names: names(),
            tags: ["online"],
          }),
        );
        toast("Saved match history to Library.");
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
                "Tap a ringed checker, then a highlighted point. Or drag the checker there. The number on a destination tells you which die it uses.",
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
                "Moves remain a draft until Confirm turn. Undo reverses one step; Reset restores the whole turn. You can also select a moved checker and tap an arrow target, or drag it back. Details has a legal-move selector.",
              ),
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
  return `${names()[e.actor] || playerName(e.actor)} · ${a.type === "move" ? notation(a.steps, e.actor) : a.type + (a.dice ? " " + a.dice.join("–") : "")}`;
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
    saved = {
      id: "play",
      game,
      positionKey: positionKey(game.state),
      draft: clone(draft.draft),
    };
    try {
      await put("work", saved);
    } catch (e) {
      showError(e);
    }
  }
}
async function commit(action) {
  if (committing) return;
  if (config.mode === "online") {
    online.send(action);
    return;
  }
  committing = true;
  draft.enabled = false;
  draft.render();
  actions();
  try {
    const s = game.state,
      actor = decisionPlayer(s);
    const committed = ["opening", "roll"].includes(action.type)
      ? { ...action, dice: cryptoDice() }
      : action;
    game.state = transition(s, committed, actor);
    draft.draft = [];
    game.events.push({ actor, action: committed });
    boardKey = "";
    if (game.state.phase === "over")
      await put(
        "items",
        itemRecord("match", {
          id: game.id,
          title: `${names().join(" vs ")} · ${game.state.scores.join("–")}`,
          initial: game.initial,
          events: game.events,
          names: names(),
          tags: ["played"],
        }),
      );
    await persist();
  } finally {
    committing = false;
    boardKey = "";
    render();
  }
}
async function submit() {
  const source = clone(state()),
    steps = clone(draft.draft),
    token = epoch;
  if (config.tutor && config.mode === "computer") {
    $("confirm").disabled = true;
    try {
      const result = await analysis.run(source, {
        submitted: steps,
        preset: "quick",
      });
      if (token !== epoch) return;
      feedback = { source, result };
      if (result.error > 0.02)
        await put(
          "items",
          itemRecord("mistake", {
            title: "Checker decision to review",
            state: source,
            submitted: steps,
            analysis: result,
            tags: ["checker", "mistake"],
          }),
        );
      if (config.warning && result.error > 0.04) {
        if (token !== epoch) return;
        let d;
        d = dialog(
          "Review before confirming?",
          el(
            "p",
            {},
            `GNUbg evaluates this turn ${equity(result.error)} below its best move at Quick. This is an estimate.`,
          ),
          [
            button("Revise", () => {
              d.close();
              actions();
            }),
            button(
              "Confirm anyway",
              () => {
                d.close();
                if (token === epoch) commit({ type: "move", steps });
              },
              "primary",
            ),
          ],
        );
        return;
      }
    } catch (e) {
      if (token !== epoch) return;
      if (e.name !== "AbortError") showError(e);
      actions();
      return;
    }
  }
  if (token === epoch) await commit({ type: "move", steps });
}
async function computerTurn() {
  const s = state();
  if (
    config.mode !== "computer" ||
    !game?.started ||
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
    let action;
    if (s.phase === "resign") {
      const evalState = { ...s, phase: "roll", dice: [], pending: null };
      const result = await analysis.run(evalState, { preset: config.strength });
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
    }
    if (token !== epoch || key !== positionKey(state())) return;
    botBusy = false;
    await commit(action);
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
