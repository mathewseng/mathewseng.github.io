// SPDX-License-Identifier: GPL-3.0-or-later
import {
  initialState,
  legalPaths,
  transition,
  cryptoDice,
  canDouble,
  notation,
  positionKey,
  clone,
  playerName,
} from "../core/rules.mjs";
import { get, put, itemRecord, settings } from "../core/storage.mjs";
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
const ui = shell("play", "Play", "Your table. Your pace.");
let config = {
    mode: "computer",
    matchLength: 5,
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
  epoch = 0;
const analysis = new AnalysisPanel();
const draft = new DraftBoard(ui.board, () => {
  actions();
  detailDraft();
  persist();
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
$("toolbar").prepend(
  button(
    "New match",
    () =>
      confirmDialog(
        "Start another match?",
        "Your current local match stays recoverable in this browser.",
        () => {
          analysis.cancel();
          epoch++;
          online.model && online.leave();
          game = null;
          boardKey = "";
          feedback = null;
          render();
        },
      ),
    "ghost",
  ),
);
addEventListener("beforeunload", (e) => {
  if (online.room?.connected || draft.draft.length) {
    e.preventDefault();
    e.returnValue = "";
  }
});
addEventListener("pagehide", () => {
  analysis.cancel();
  persist();
});
document.querySelectorAll(".nav a,.brand,.site-link").forEach((a) =>
  a.addEventListener("click", (e) => {
    if (online.room?.connected || draft.draft.length) {
      e.preventDefault();
      confirmDialog(
        "Leave this view?",
        online.room?.connected
          ? "Leaving interrupts the live room. Reconnect here to resume."
          : "Your draft will be saved for local recovery.",
        () => {
          persist();
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
    game = {
      id: crypto.randomUUID(),
      state: study.state,
      initial: clone(study.state),
      events: [],
      config: { ...config, mode: "local" },
      names: ["Ivory", "Teal"],
      started: true,
    };
    config = game.config;
  }
} catch (e) {
  showError(e);
}
render();
function model() {
  return config.mode === "online" ? online.model : game;
}
function state() {
  return model()?.state || initialState({ matchLength: config.matchLength });
}
function myTurn(s) {
  if (config.mode === "online")
    return (
      online.ready &&
      !online.pending &&
      online.seat ===
        (["double", "resign"].includes(s.phase) ? 1 - s.turn : s.turn)
    );
  return (
    config.mode === "local" ||
    (["double", "resign"].includes(s.phase) ? 1 - s.turn : s.turn) === 0
  );
}
function render() {
  const m = model(),
    s = state(),
    key =
      (m?.id || "setup") +
      positionKey(s) +
      (online.ready ? "ready" : "") +
      (online.pending ? "pending" : "");
  if (key !== boardKey) {
    boardKey = key;
    draft.names = m?.names ||
      m?.players?.map((p) => p.name) || ["Ivory", "Teal"];
    draft.set(
      s,
      legalPaths(s),
      !!m?.started && myTurn(s) && !botBusy && s.phase === "move",
    );
  }
  $("subtitle").textContent = m?.started
    ? `${s.matchLength ? s.matchLength + "-point match" : "Unlimited points"} · ${s.crawford ? "Crawford game" : s.crawfordPlayed ? "Post-Crawford" : `Game ${s.gameNumber}`} · cube ${s.cube.value}`
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
        "Standard rules. No Jacoby or beavers. Draft moves can be undone until you confirm.",
      ),
    );
  if (saved && !game && config.mode !== "online")
    fields.append(
      button(
        "Resume saved match",
        () => {
          game = saved.game;
          config = game.config;
          boardKey = "";
          render();
          if (
            saved.draft?.length &&
            saved.positionKey === positionKey(game.state)
          ) {
            draft.draft = saved.draft;
            draft.render();
            actions();
          }
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
    else await online.create(config.name, { matchLength: config.matchLength });
    history.replaceState(null, "", `#room=${online.room.roomCode}`);
    render();
  } catch (e) {
    showError(e);
  }
}
function start() {
  game = {
    id: crypto.randomUUID(),
    state: initialState({ matchLength: config.matchLength }),
    initial: initialState({ matchLength: config.matchLength }),
    events: [],
    config: { ...config },
    names:
      config.mode === "computer"
        ? ["You", "GNUbg"]
        : [config.name || "Ivory", config.opponent || "Teal"],
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
  const mine = myTurn(s) && !botBusy;
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
        : s.bar[s.turn]
          ? "Enter from the bar first."
          : "Use all playable dice, then confirm."
      : `${names()[s.turn]} is moving`;
    a.append(
      button("Undo", () => draft.undo(), "", {
        disabled: !mine || !draft.draft.length,
        id: "undo",
      }),
      button(
        draft.complete() && !draft.draft.length
          ? "Confirm pass"
          : "Confirm turn",
        submit,
        "primary",
        { disabled: !mine || !draft.complete(), id: "confirm" },
      ),
    );
  } else if (s.phase === "double") {
    $("message").textContent =
      `${names()[s.turn]} offers ${s.cube.value * 2}. ${names()[1 - s.turn]} decides.`;
    a.append(
      button("Pass", () => commit({ type: "pass" }), "", { disabled: !mine }),
      button(
        `Take ${s.cube.value * 2}`,
        () => commit({ type: "take" }),
        "primary",
        { disabled: !mine },
      ),
    );
  } else if (s.phase === "resign") {
    $("message").textContent =
      `${names()[s.turn]} offers to resign ${s.pending.level * s.cube.value} points.`;
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
      `${names()[s.result.winner]} wins ${s.result.points} points${s.result.matchOver ? " · match complete" : ""}.`;
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
      analysis.status,
    );
  if (m.started && s.phase === "move" && myTurn(s)) {
    p.append(el("div", { id: "draft-controls" }));
    detailDraft();
  }
  if (m.started && myTurn(s) && ["roll", "move"].includes(s.phase))
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
            .filter((level) => !s.off[s.turn] || level === 1)
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
    config.mode !== "online" &&
    ["roll", "move", "double"].includes(s.phase)
  )
    p.append(
      button("Save position", () => saveDialog(s)),
      button("Open in Solver", () => {
        if (draft.draft.length)
          confirmDialog(
            "Open the committed position?",
            "Your unfinished draft is saved here.",
            () => (location.href = shareURL(s)),
          );
        else location.href = shareURL(s);
      }),
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
      el("h2", {}, "History"),
      el(
        "ol",
        { class: "history", id: "history" },
        ...m.events
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
          button("Reset turn", () => draft.reset(), "ghost", {
            disabled: !draft.draft.length,
          }),
          button(
            "Use other die first",
            () => {
              draft.preferred =
                state().dice.find((d) => d !== draft.preferred) ||
                state().dice[0];
              toast(`Prefer die ${draft.preferred} for ambiguous bearoffs.`);
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
  if (config.mode === "online") {
    online.send(action);
    return;
  }
  const s = game.state,
    actor = ["double", "resign"].includes(s.phase) ? 1 - s.turn : s.turn;
  const committed = ["opening", "roll"].includes(action.type)
    ? { ...action, dice: cryptoDice() }
    : action;
  game.state = transition(s, committed, actor);
  draft.draft = [];
  game.events.push({ actor, action: committed });
  boardKey = "";
  if (committed.type === "opening" && committed.dice[0] === committed.dice[1])
    toast(`Both rolled ${committed.dice[0]}. Roll again.`);
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
  render();
}
async function submit() {
  const source = clone(state()),
    steps = clone(draft.draft);
  if (config.tutor && config.mode === "computer") {
    $("confirm").disabled = true;
    try {
      const result = await analysis.run(source, {
        submitted: steps,
        preset: "quick",
      });
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
                commit({ type: "move", steps });
              },
              "primary",
            ),
          ],
        );
        return;
      }
    } catch (e) {
      if (e.name !== "AbortError") showError(e);
      actions();
      return;
    }
  }
  await commit({ type: "move", steps });
}
async function computerTurn() {
  const s = state();
  if (
    botBusy ||
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
        action = { type: result.action === "pass" ? "pass" : "take" };
      else
        action = {
          type: result.action === "double" && canDouble(s) ? "double" : "roll",
        };
    }
    if (token !== epoch || key !== positionKey(state())) return;
    botBusy = false;
    await commit(action);
  } catch (e) {
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
          config.mode = "local";
          game.config.mode = "local";
          boardKey = "";
          render();
        }),
      );
    }
  }
}
