// Online multiplayer: peer-to-peer rooms on the shared PeerRoom module. The
// host owns the game state; every client computes its own equities locally
// because all hands are face up.
import { VARIANTS, variantOf, scoringOf, actorOn, dealTable, settle, cardName, STREETS } from "./engine.mjs";
import { offerRaise, reraise, canReraise, optionLabel, reraiseName } from "./cube-rules.mjs";
import { $, el, button, badge, cardEl, emptySlot, renderSeats, renderOptionTable, renderResultCard, replaceActions, cubeFace, signed, STREET_CARDS, streetName, toast } from "./ui.js";
import { fillVariantSelect, fillDropSelect, fillScoringSelect } from "./cube-view.js";
import { computeView, actionState, gradeHidden, cubeKey } from "./table-view.js";

// Auto-deal delays the host uses; clients count down from the same numbers.
const AUTO_DELAY = { preflop: 2500, street: 3500, over: 6000 };

const NAME_KEY = "222.player-name";
const hostKey = (code) => `222.host.${code}`;

export function initOnline({ pool }) {
  const PeerRoom = window.PeerRoom;
  const st = { model: null, view: null, viewKey: null, token: 0, timer: null, roster: [], countdown: null, countdownKey: null, countdownEnd: 0 };
  const lobby = $("online-lobby"),
    roomView = $("online-room");
  fillVariantSelect($("on-variant"), "fr");
  fillScoringSelect($("on-scoring"), "classic");
  fillDropSelect($("on-drop"), 6, "classic");
  $("on-scoring").addEventListener("change", () => fillDropSelect($("on-drop"), null, $("on-scoring").value));
  $("on-name").value = localStorage.getItem(NAME_KEY) || "";
  if (!PeerRoom) {
    $("on-error").textContent = "The peer connection library did not load.";
    $("on-error").hidden = false;
    return { shown() {}, prefillCode() {} };
  }
  const room = new PeerRoom({ namespace: "two22", maxPlayers: 7, storageKey: "222.room.session.v1" });

  /* ---------- lobby ---------- */
  // Errors render where the player is looking: the lobby's own line before a
  // room exists, else the room's error slot plus the assertive toast.
  const showError = (msg) => {
    const inRoom = !roomView.hidden;
    const slot = inRoom ? $("on-room-error") : $("on-error");
    slot.textContent = msg || "";
    slot.hidden = !msg;
    if (msg && inRoom) toast(msg, { alert: true });
  };
  const clearRoomError = () => {
    $("on-room-error").textContent = "";
    $("on-room-error").hidden = true;
  };
  const name = () => {
    const v = $("on-name").value.trim() || "Player";
    localStorage.setItem(NAME_KEY, v);
    return v;
  };
  $("on-create").addEventListener("click", async () => {
    showError("");
    try {
      await room.create(name());
      st.model = { kind: "lobby", settings: readSettings(), players: [], log: [] };
      syncPlayers();
      enterRoom();
      publish();
    } catch (error) {
      showError(error.message);
    }
  });
  $("on-join").addEventListener("click", async () => {
    showError("");
    try {
      await room.join($("on-code").value, name());
      enterRoom();
    } catch (error) {
      showError(error.message);
    }
  });
  $("on-resume").addEventListener("click", async () => {
    showError("");
    try {
      await room.resume();
      if (room.isHost) {
        st.model = loadHostState(room.roomCode) || { kind: "lobby", settings: readSettings(), players: [], log: [] };
        syncPlayers();
        publish();
      }
      enterRoom();
    } catch (error) {
      showError(error.message);
    }
  });
  $("on-leave").addEventListener("click", () => {
    clearTimeout(st.timer);
    stopCountdown();
    room.leave();
    st.model = null;
    clearRoomError();
    roomView.hidden = true;
    lobby.hidden = false;
    $("on-resume").hidden = !room.savedSession();
  });
  $("on-copy").addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}#${room.roomCode}`;
    try {
      await navigator.clipboard.writeText(`Join my 222 table: ${url}\nRoom code: ${room.roomCode}`);
      toast("Invite copied.");
    } catch {
      prompt("Copy this invite link", url);
    }
  });
  function enterRoom() {
    lobby.hidden = true;
    roomView.hidden = false;
    clearRoomError();
    $("on-room-code").textContent = room.roomCode;
    history.replaceState(null, "", `#${room.roomCode}`);
    render();
  }

  /* ---------- host settings ---------- */
  function readSettings() {
    return { cube: $("on-cube").checked, variant: $("on-variant").value, auto: $("on-auto").checked, scoring: $("on-scoring").value, dropUnit: Number($("on-drop").value) || scoringOf($("on-scoring").value).defaultDrop };
  }
  for (const id of ["on-cube", "on-variant", "on-auto", "on-drop", "on-scoring"])
    $(id).addEventListener("change", () => {
      if (!room.isHost || !st.model) return;
      st.model.settings = readSettings();
      publish();
    });
  $("on-start").addEventListener("click", () => room.sendAction({ type: "start" }));
  $("on-next").addEventListener("click", () => room.sendAction({ type: "next" }));

  /* ---------- room events ---------- */
  room.onStatus = (status, message) => {
    $("on-status").textContent = message;
    $("on-status").dataset.state = status;
  };
  room.onError = (error) => showError(error.message);
  room.onRoster = (roster) => {
    st.roster = roster;
    if (room.isHost && st.model) {
      syncPlayers();
      publish();
    }
    renderRoster();
  };
  room.onState = (state) => {
    if (!room.isHost) st.model = state;
    clearRoomError();
    render();
  };
  room.onAction = handleAction;
  room.onBecomeHost = (recovered) => {
    st.model = recovered || loadHostState(room.roomCode) || { kind: "lobby", settings: readSettings(), players: [], log: [] };
    syncPlayers();
    publish();
  };
  function syncPlayers() {
    const m = st.model;
    const byId = new Map(m.players.map((p) => [p.id, p]));
    const players = [];
    for (const r of st.roster) {
      const existing = byId.get(r.id);
      players.push(existing ? { ...existing, name: r.name, connected: r.connected } : { id: r.id, name: r.name, score: 0, connected: r.connected });
    }
    // Keep players who left mid-hand so the hand can finish.
    if (m.hand && m.hand.phase !== "over")
      for (const p of m.players) if (!players.some((q) => q.id === p.id) && m.hand.playerIds.includes(p.id)) players.push({ ...p, connected: false, left: true });
    m.players = players;
  }
  function publish() {
    if (!room.isHost || !st.model) return;
    try {
      localStorage.setItem(hostKey(room.roomCode), JSON.stringify(st.model));
    } catch {}
    updateTabled();
    room.publishState(st.model, (state, clientId) => clientView(state, clientId));
    scheduleAuto();
  }
  function loadHostState(code) {
    try {
      return JSON.parse(localStorage.getItem(hostKey(code)) || "null");
    } catch {
      return null;
    }
  }
  // Undealt board cards are never sent; other players' hands are hidden until tabled.
  function clientView(state, clientId) {
    if (!state.hand) return state;
    const h = state.hand;
    const hands = h.tabled ? h.hands : h.hands.map((cards, i) => (h.playerIds[i] === clientId ? cards : null));
    return { ...state, hand: { ...h, hands, board: h.board.slice(0, STREET_CARDS[h.street]) } };
  }
  function updateTabled() {
    const h = st.model?.hand;
    if (!h) return;
    h.tabled = actionState({ variant: h.variant, street: h.street, btn: h.btn, cube: h.cube, cubeEnabled: h.cubeEnabled, n: h.playerIds.length, history: h.history }).tabled;
  }
  function log(text, strong = false) {
    st.model.log.unshift({ text, strong });
    if (st.model.log.length > 60) st.model.log.pop();
  }

  /* ---------- host game logic ---------- */
  function handleAction(clientId, action) {
    const m = st.model;
    if (!m) return;
    try {
      if (action.type === "start" || (action.type === "next" && (!m.hand || m.hand.phase === "over"))) {
        if (clientId !== room.clientId) throw new Error("Only the host can deal.");
        startHand();
      } else if (action.type === "next") {
        if (clientId !== room.clientId) throw new Error("Only the host can deal.");
        advance();
      } else if (action.type === "cube") {
        cubeAction(clientId, action.choice);
      }
      publish();
    } catch (error) {
      if (clientId === room.clientId) showError(error.message);
      else room.broadcastEvent({ kind: "error", target: clientId, message: error.message });
    }
  }
  room.onEvent = (_c, event) => {
    if (event?.kind === "error" && (!event.target || event.target === room.clientId)) showError(event.message);
  };
  function startHand() {
    const m = st.model;
    const active = m.players.filter((p) => p.connected && !p.left);
    if (active.length < 2) throw new Error("Need at least two connected players.");
    m.players = active;
    const number = (m.hand?.number ?? 0) + 1;
    const t = dealTable(active.length);
    const btn = (number - 1) % active.length;
    m.kind = "game";
    m.hand = {
      number,
      playerIds: active.map((p) => p.id),
      btn,
      hands: t.hands,
      board: t.board,
      street: 0,
      cube: { level: 1, owner: null },
      cubeEnabled: m.settings.cube && active.length === 2,
      variant: variantOf(m.settings.variant)?.id ?? "fr",
      scoring: m.settings.scoring ?? "classic",
      dropUnit: m.settings.dropUnit ?? 6,
      phase: "street",
      actor: null,
      pending: null,
      result: null,
      lastDecision: null,
      history: {},
      tabled: false,
    };
    log(`Hand ${number}: ${active[btn].name} has the button.`, true);
    openAction();
  }
  // If the current street has a cube decision, open it.
  function openAction() {
    const h = hand();
    if (!h.cubeEnabled) return;
    const street = STREETS[h.street];
    if (h.history[street] != null) return;
    const actor = actorOn(h.variant, street, h.btn, h.cube);
    if (actor != null) {
      h.phase = "decision";
      h.actor = actor;
    }
  }
  function hand() {
    return st.model.hand;
  }
  function advance() {
    const h = hand();
    if (h.phase !== "street") throw new Error("A cube decision is pending.");
    if (h.street === 3) {
      showdown();
      return;
    }
    h.street++;
    const cards = h.board.slice(STREET_CARDS[h.street - 1], STREET_CARDS[h.street]);
    log(`${streetName(h.street)}: ${cards.map(cardName).join(" ")}.`);
    openAction();
  }
  function seatOf(clientId) {
    return hand().playerIds.indexOf(clientId);
  }
  function pname(seat) {
    const id = hand().playerIds[seat];
    return st.model.players.find((p) => p.id === id)?.name ?? `Seat ${seat + 1}`;
  }
  function cubeAction(clientId, choice) {
    const h = hand();
    if (!h || !h.cubeEnabled) throw new Error("No cube in this hand.");
    const seat = seatOf(clientId);
    const level = h.cube.level;
    const verb = level > 1 ? "redouble" : "double";
    if (h.phase === "decision") {
      if (seat !== h.actor) throw new Error("It is not your decision.");
      h.lastDecision = { street: h.street, k: 0, chooser: seat, choice, level, base: level };
      if (choice === "double") {
        h.pending = offerRaise(level, seat, 1 - seat, h.dropUnit);
        h.phase = "chain";
        log(`${pname(seat)} ${verb}s to ${h.pending.level}.`, true);
      } else if (choice === "noDouble") {
        h.cube = { level, owner: 1 - seat };
        log(`${pname(seat)} does not ${verb}; ${pname(1 - seat)} gets the option next.`);
        settleStreet(h);
      } else throw new Error("Choose double or no double.");
    } else if (h.phase === "chain") {
      const pd = h.pending;
      if (seat !== pd.responder) throw new Error("It is not your decision.");
      h.lastDecision = { street: h.street, k: pd.k, chooser: seat, choice, level, base: pd.base };
      if (choice === "drop") {
        log(`${pname(seat)} drops at ${pd.level}.`);
        finish(pd.raiser, pd.drop, `${pname(seat)} dropped`);
      } else if (choice === "take") {
        h.cube = { level: pd.level, owner: seat };
        h.pending = null;
        log(`${pname(seat)} takes. Cube at ${h.cube.level}, ${pname(seat)} holds it.`);
        settleStreet(h);
      } else if (choice === "reraise") {
        if (!canReraise(pd)) throw new Error("The cube cannot go higher.");
        const name = reraiseName(pd.k);
        h.pending = reraise(pd);
        log(`${pname(seat)} ${name.toLowerCase()}s to ${h.pending.level}!`, true);
      } else throw new Error("Choose drop, take or re-raise.");
    } else throw new Error("No cube decision is pending.");
  }
  function settleStreet(h) {
    h.history[STREETS[h.street]] = cubeKey(h.cube, h.btn);
    h.phase = "street";
    h.actor = null;
    h.pending = null;
  }
  function applyScores(nets) {
    const h = hand();
    h.playerIds.forEach((id, i) => {
      const p = st.model.players.find((q) => q.id === id);
      if (p) p.score += nets[i];
    });
  }
  function finish(winnerSeat, points, reason) {
    const h = hand();
    const nets = [0, 0];
    nets[winnerSeat] = points;
    nets[1 - winnerSeat] = -points;
    applyScores(nets);
    h.phase = "over";
    h.history.ended = true;
    h.result = { nets, reason };
    log(`${pname(winnerSeat)} wins ${points} points: ${reason}.`, true);
  }
  function showdown() {
    const h = hand();
    const r = settle(h.hands, h.board, scoringOf(h.scoring));
    const nets = r.net.map((x) => x * h.cube.level);
    applyScores(nets);
    h.phase = "over";
    h.history.ended = true;
    h.result = { nets, reason: "showdown", perHand: r.perHand, scoop: r.scoop, pairs: r.pairs };
    log(`Showdown: ${h.playerIds.map((_, i) => `${pname(i)} ${signed(nets[i], 0)}`).join(", ")}.`, true);
  }
  function scheduleAuto() {
    clearTimeout(st.timer);
    if (!room.isHost || !st.model?.hand || !st.model.settings.auto) return;
    const h = st.model.hand;
    if (h.phase === "street") st.timer = setTimeout(() => safeAct(() => advance()), h.street === 0 ? AUTO_DELAY.preflop : AUTO_DELAY.street);
    else if (h.phase === "over") st.timer = setTimeout(() => safeAct(() => startHand()), AUTO_DELAY.over);
  }
  function safeAct(fn) {
    try {
      fn();
      publish();
    } catch (error) {
      showError(error.message);
    }
  }

  /* ---------- rendering ---------- */
  function playersInHand() {
    const h = hand();
    return h.playerIds.map((id, i) => st.model.players.find((p) => p.id === id) ?? { id, name: `Seat ${i + 1}`, score: 0 });
  }
  // Auto-deal countdown beside the prompt (not inside the live region, so the
  // ticking is never announced). Runs on every peer from the same delays the
  // host's timer uses, restarted whenever the hand reaches a new phase.
  function stopCountdown() {
    clearInterval(st.countdown);
    st.countdown = null;
    st.countdownKey = null;
    $("on-timer").hidden = true;
  }
  function syncCountdown(m) {
    const h = m.hand;
    const auto = m.settings?.auto && h && (h.phase === "street" || h.phase === "over");
    if (!auto) return stopCountdown();
    const key = `${h.number}:${h.street}:${h.phase}`;
    if (st.countdownKey !== key) {
      st.countdownKey = key;
      st.countdownEnd = Date.now() + (h.phase === "over" ? AUTO_DELAY.over : h.street === 0 ? AUTO_DELAY.preflop : AUTO_DELAY.street);
      clearInterval(st.countdown);
      st.countdown = setInterval(tickCountdown, 250);
    }
    tickCountdown();
  }
  function tickCountdown() {
    const h = st.model?.hand;
    const timer = $("on-timer");
    if (!h || st.countdownKey == null) return stopCountdown();
    const left = Math.max(0, Math.ceil((st.countdownEnd - Date.now()) / 1000));
    const what = h.phase === "over" ? "Next hand" : h.street === 3 ? "Showdown" : streetName(h.street + 1);
    timer.textContent = left > 0 ? `${what} in ${left}s` : `${what}…`;
    timer.hidden = false;
  }
  function render() {
    const m = st.model;
    renderRoster();
    if (!m) return;
    const isHost = room.isHost;
    $("on-settings").hidden = !(isHost && (!m.hand || m.hand.phase === "over"));
    // Guests in a fresh room get a waiting state instead of an empty table.
    const waiting = !m.hand && !isHost;
    $("on-waiting").hidden = !waiting;
    if (waiting) {
      const n = (st.roster.length ? st.roster : m.players).length;
      $("on-waiting-text").textContent = `You are in with ${n} player${n === 1 ? "" : "s"} at the table. The host picks the settings and deals the first hand; cards and equities appear here.`;
    }
    syncCountdown(m);
    if (isHost) {
      $("on-cube").checked = m.settings.cube;
      $("on-variant").value = m.settings.variant;
      $("on-auto").checked = m.settings.auto;
      $("on-scoring").value = m.settings.scoring ?? "classic";
      fillDropSelect($("on-drop"), m.settings.dropUnit ?? 6, m.settings.scoring ?? "classic");
      $("on-start").textContent = m.hand ? "Deal next hand" : "Start game";
    }
    $("on-table").hidden = !m.hand;
    const logEl = $("on-log");
    logEl.replaceChildren();
    for (const e of m.log ?? []) logEl.append(el("li", e.strong ? "strong" : "", e.text));
    if (!m.hand) return;
    const h = m.hand;
    const names = playersInHand().map((p) => p.name);
    const me = h.playerIds.indexOf(room.clientId);
    const board = h.board.slice(0, STREET_CARDS[h.street]);
    const steps = $("on-streets");
    steps.replaceChildren();
    for (let s = 0; s < 4; s++) {
      const b = button(streetName(s), `btn--sm step${s === h.street ? " active" : s < h.street ? " done" : ""}`, null, true);
      b.setAttribute("aria-pressed", String(s === h.street));
      steps.append(b);
    }
    const nextBtn = $("on-next");
    nextBtn.hidden = !isHost;
    nextBtn.disabled = !(h.phase === "street" || h.phase === "over");
    nextBtn.textContent = h.phase === "over" ? "Next hand" : h.street === 3 ? "Showdown" : `Deal ${streetName(h.street + 1).toLowerCase()}`;
    const bc = $("on-board-cards");
    bc.replaceChildren();
    for (let i = 0; i < 5; i++) bc.append(i < board.length ? cardEl(board[i]) : emptySlot());
    const meta = $("on-meta");
    meta.replaceChildren();
    meta.append(el("span", "", `Hand ${h.number} · ${names.length} players · ${scoringOf(h.scoring).short} scoring${h.cubeEnabled ? ` · ${VARIANTS[h.variant].name}` : ""}`));
    meta.append(h.tabled ? badge("Tabled · perfect information", "info") : badge("Hidden · numbers vs range"));
    if (st.view?.mode === "perfect") meta.append(el("span", "", `${st.view.stats.exact ? "Exact" : "Sampled"}: ${st.view.stats.count.toLocaleString("en-US")} runouts`));
    const cp = $("on-cube-panel");
    cp.hidden = !h.cubeEnabled;
    if (h.cubeEnabled) {
      $("on-cube-face").replaceChildren(cubeFace(h.cube.level, h.cube.owner == null ? "Centered" : h.cube.level > 1 ? names[h.cube.owner] : `${names[h.cube.owner]} · option`));
      $("on-cube-title").textContent = `Cube at ${h.cube.level} · drop ${h.dropUnit ?? 6}`;
      $("on-cube-sub").textContent = VARIANTS[h.variant].blurb;
    }
    // prompt and actions
    const prompt = $("on-prompt");
    const actions = $("on-actions");
    const actionButtons = [];
    prompt.classList.remove("alert");
    const level = h.cube.level;
    const verb = level > 1 ? "Redouble" : "Double";
    const auto = Boolean(m.settings?.auto);
    const act = (choice) => () => room.sendAction({ type: "cube", choice });
    if (h.phase === "street") {
      const dealt = h.street === 3 ? "River dealt." : `${streetName(h.street)} dealt.`;
      const next = h.street === 3 ? "Showdown" : `The ${streetName(h.street + 1).toLowerCase()}`;
      prompt.textContent = auto ? `${dealt} ${next} deals automatically.` : isHost ? `${dealt} Deal the ${h.street === 3 ? "showdown" : streetName(h.street + 1).toLowerCase()} when ready.` : `${dealt} Waiting for the host to deal.`;
    }
    else if (h.phase === "decision") {
      if (me === h.actor) {
        prompt.textContent = `${streetName(h.street)}: your cube decision at ${level}.`;
        prompt.classList.add("alert");
        actionButtons.push(button(optionLabel("noDouble", 0, level, level, h.dropUnit), "", act("noDouble")), button(optionLabel("double", 0, level, level, h.dropUnit), "primary", act("double")));
      } else prompt.textContent = `${streetName(h.street)}: ${names[h.actor]} is deciding whether to ${verb.toLowerCase()}.`;
    } else if (h.phase === "chain") {
      const pd = h.pending;
      const raiseWord = pd.k === 1 ? verb.toLowerCase() : reraiseName(pd.k - 1).toLowerCase();
      if (me === pd.responder) {
        prompt.textContent = `${names[pd.raiser]} ${raiseWord}s to ${pd.level}. Drop (lose ${pd.drop}), take${canReraise(pd) ? `, or ${reraiseName(pd.k).toLowerCase()}` : ""}?`;
        prompt.classList.add("alert");
        actionButtons.push(button(optionLabel("drop", pd.k, pd.base, pd.base, pd.dropUnit), "", act("drop")), button(optionLabel("take", pd.k, pd.base, pd.base, pd.dropUnit), "primary", act("take")));
        if (canReraise(pd)) actionButtons.push(button(optionLabel("reraise", pd.k, pd.base, pd.base, pd.dropUnit), "", act("reraise")));
      } else prompt.textContent = `${names[pd.raiser]} ${raiseWord}s to ${pd.level}. ${names[pd.responder]} to reply.`;
    } else if (h.phase === "over") {
      const mine = me >= 0 ? ` You: ${signed(h.result.nets[me], 0)}.` : "";
      prompt.textContent = `Hand over (${h.result.reason}).${mine}${auto ? " The next hand deals automatically." : isHost ? " Deal the next hand when ready." : " Waiting for the host to deal the next hand."}`;
    }
    replaceActions(actions, actionButtons);
    // The shared result card above the seats, never inside the action row.
    if (h.phase === "over" && h.result) renderResultCard($("on-result"), { names, result: h.result, cube: h.cube, me: me >= 0 ? me : null });
    else $("on-result").replaceChildren();
    renderSeats($("on-seats"), { hands: h.hands, board, stats: st.view?.stats ?? null, names, btn: h.btn, highlight: me >= 0 ? me : undefined, pending: !st.view });
    computeStats();
    renderAnalysis();
  }
  function viewSpec(h, street = h.street) {
    return {
      hands: h.hands,
      board: h.board.slice(0, STREET_CARDS[street]),
      street,
      variant: h.variant,
      btn: h.btn,
      cube: h.cube,
      cubeEnabled: h.cubeEnabled,
      history: h.history,
      dropUnit: h.dropUnit ?? 6,
      scoring: h.scoring ?? "classic",
      precision: "standard",
    };
  }
  async function computeStats() {
    const h = st.model?.hand;
    if (!h) return;
    const key = JSON.stringify([h.number, h.hands, h.board.slice(0, STREET_CARDS[h.street]), h.cube, h.history, h.tabled]);
    if (st.viewKey === key) return;
    st.viewKey = key;
    st.view = null;
    const token = ++st.token;
    try {
      const view = await computeView(pool, viewSpec(h));
      if (token !== st.token) return;
      st.view = view;
      st.decisionViews = st.decisionViews || new Map();
      if (view.decision) st.decisionViews.set(`${h.number}:${h.street}`, view);
      render();
    } catch (error) {
      console.error(error);
    }
  }
  // Your own last cube decision, graded against the equilibrium.
  function renderAnalysis() {
    const h = st.model?.hand;
    const wrap = $("on-analysis-wrap");
    const body = $("on-analysis");
    const d = h?.lastDecision;
    const me = h ? h.playerIds.indexOf(room.clientId) : -1;
    if (!h || !d || !h.cubeEnabled || d.chooser !== me) {
      wrap.hidden = true;
      return;
    }
    const view = st.decisionViews?.get(`${h.number}:${d.street}`);
    if (!view?.decision) {
      wrap.hidden = true;
      return;
    }
    const grade = gradeHidden(view.decision.stage, d.k, d.choice);
    if (!grade) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    body.replaceChildren();
    renderOptionTable(body, grade, { level: d.level, preview: false, chooser: "your", note: `${streetName(d.street)}: you chose ${d.choice === "noDouble" ? "no double" : d.choice === "reraise" ? reraiseName(d.k).toLowerCase() : d.choice}` });
  }
  function renderRoster() {
    const list = $("on-roster");
    list.replaceChildren();
    const scores = new Map((st.model?.players ?? []).map((p) => [p.id, p.score]));
    const roster = st.roster.length ? st.roster : st.model?.players ?? [];
    for (const r of roster) {
      const li = el("li", r.connected === false ? "offline" : "");
      li.append(el("span", "dot"));
      const n = el("span", "name", r.name + (r.id === room.clientId ? " (you)" : "") + (r.host ? " · host" : ""));
      li.append(n);
      const sc = scores.get(r.id) ?? 0;
      const s = el("span", `score${sc > 0 ? " is-good" : sc < 0 ? " is-bad" : ""}`, signed(sc, 0));
      li.append(s);
      list.append(li);
    }
  }
  return {
    shown() {
      $("on-resume").hidden = !room.savedSession() || room.connected;
    },
    prefillCode(code) {
      $("on-code").value = code;
    },
  };
}
