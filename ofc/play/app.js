(function () {
  "use strict";

  const Core = window.OFCFantasylandCore;
  const Game = window.OFCPineappleGame;
  const PeerRoom = window.PeerRoom;
  const PlayingCards = window.PlayingCards;
  const RANK_LABEL = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T", 9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2" };
  if (!Core || !Game || !PeerRoom || !PlayingCards) return;

  const $ = (id) => document.getElementById(id);
  const els = {
    setupView: $("setup-view"),
    roomView: $("room-view"),
    tableView: $("table-view"),
    networkState: $("network-state"),
    leaveButton: $("leave-button"),
    modeCreate: $("mode-create"),
    modeJoin: $("mode-join"),
    joinFields: $("join-fields"),
    playerName: $("player-name"),
    roomCode: $("room-code"),
    connectButton: $("connect-button"),
    cancelConnectButton: $("cancel-connect-button"),
    connectStatus: $("connect-status"),
    resumeButton: $("resume-button"),
    setupError: $("setup-error"),
    seatSummary: $("seat-summary"),
    variantNote: $("variant-note"),
    dealerOptions: $("dealer-options"),
    dealerOptionsList: $("dealer-options-list"),
    dealerSelection: $("dealer-selection"),
    dealerHeading: $("dealer-heading"),
    dealerVariantButtons: $("dealer-variant-buttons"),
    ultimateRow: $("ultimate-row"),
    jjjRow: $("jjj-row"),
    badeuceyRow: $("badeucey-row"),
    ultimate: $("ultimate"),
    jjjPlus: $("jjj-plus"),
    badeuceyCards: $("badeucey-cards"),
    roomCodeDisplay: $("room-code-display"),
    copyInviteButton: $("copy-invite-button"),
    waitingTitle: $("waiting-title"),
    waitingCopy: $("waiting-copy"),
    roomBanner: $("room-banner"),
    roomSeats: $("room-seats"),
    roster: $("roster"),
    roomConfig: $("room-config"),
    startButton: $("start-button"),
    roomError: $("room-error"),
    gameLabel: $("game-label"),
    turnLabel: $("turn-label"),
    tableRoomCode: $("table-room-code"),
    scoreStrip: $("score-strip"),
    connectionBanner: $("connection-banner"),
    seatBanner: $("seat-banner"),
    tableError: $("table-error"),
    opponents: $("opponents"),
    playerLabel: $("player-label"),
    placementCounter: $("placement-counter"),
    playerBoard: $("player-board"),
    drawArea: $("draw-area"),
    drawLabel: $("draw-label"),
    drawInstruction: $("draw-instruction"),
    drawCards: $("draw-cards"),
    turnActions: $("turn-actions"),
    discardsButton: $("discards-button"),
    discardsModal: $("discards-modal"),
    discardsContent: $("discards-content"),
    clearTurnButton: $("clear-turn-button"),
    confirmTurnButton: $("confirm-turn-button"),
    showdownPanel: $("showdown-panel"),
    showdownTitle: $("showdown-title"),
    showdownResults: $("showdown-results"),
    showdownWaiting: $("showdown-waiting"),
    nextHandButton: $("next-hand-button"),
    rulesButton: $("rules-button"),
    rulesModal: $("rules-modal"),
    rulesTabs: $("rules-tabs"),
    rulesContent: $("rules-content"),
    ledgerButton: $("ledger-button"),
    ledgerModal: $("ledger-modal"),
    ledgerTotals: $("ledger-totals"),
    ledgerLegend: $("ledger-legend"),
    ledgerChart: $("ledger-chart"),
    handChart: $("hand-chart"),
    ledgerList: $("ledger-list"),
    copyLedgerButton: $("copy-ledger-button"),
    exportLedgerButton: $("export-ledger-button"),
    toast: $("toast"),
    alerts: $("alerts"),
  };

  const room = new PeerRoom({
    namespace: "ofc-pineapple",
    maxPlayers: 3,
    storageKey: "ofc.play.session.v1",
  });

  const SERIES_COLORS = ["var(--cat-1)", "var(--cat-3)", "var(--cat-5)"];
  let setupMode = "create";
  let model = null;
  let latestRoster = [];
  let selectedRuleVariant = "high";
  let selectedTarget = "bottom";
  let turnAssignments = {};
  const previewCache = new Map();
  let dragController;
  let rulesTabs = null;
  let draftKey = "";
  let publishingRoster = false;
  let networkStatus = "offline";
  let connectAttempt = 0;
  let retrying = false;
  // Host-side liveness: guests ping the host every 2.5s, so a seat whose
  // connection has gone quiet for 9s (or closed) is treated as departed.
  const watchedConnections = new WeakSet();
  const lastSeen = new Map();
  let goneSeats = new Set();

  initialize();

  function initialize() {
    dragController = new window.CardDrag(els.tableView, { canDrag: canMoveCard, resolve: resolveDrop, drop: assignCard, targets: "[data-row], #draw-cards" });
    els.dealerOptionsList.innerHTML = Game.VARIANTS.filter((id) => id !== "dealerschoice").map((id) =>
      '<label class="check"><input type="checkbox" name="dealerChoice" value="' + id + '" checked /><span>' + escapeHtml(Game.VARIANT_LABELS[id]) + '</span></label>').join("");
    els.playerName.value = localStorage.getItem("ofc.play.name") || "";
    const codeFromHash = cleanCode(location.hash.slice(1));
    if (codeFromHash) {
      setupMode = "join";
      els.roomCode.value = codeFromHash;
    }
    if (window.Keycap) {
      els.clearTurnButton.append(window.Keycap.keycap("c"));
      els.confirmTurnButton.append(window.Keycap.keycap("Space"));
    }
    els.rulesTabs.innerHTML = Game.VARIANTS.map((id) => '<button type="button" role="tab" aria-selected="false" data-tab="' + id + '" data-rule-variant="' + id + '">' + escapeHtml(Game.VARIANT_LABELS[id]) + '</button>').join("");
    bindEvents();
    bindRoom();
    setInterval(watchSeats, 2500);
    renderSetupMode();
    renderVariantSettings();
    renderResume();
    // The rules tabs only change the rules article; they never touch the lobby's game setup.
    rulesTabs = window.Tabs ? window.Tabs.init(els.rulesTabs, { onChange: (id) => { selectedRuleVariant = id; renderRules(id); } }) : null;
    if (!rulesTabs) renderRules(selectedRuleVariant);
  }

  function bindEvents() {
    els.modeCreate.addEventListener("click", () => {
      setupMode = "create";
      renderSetupMode();
    });
    els.modeJoin.addEventListener("click", () => {
      setupMode = "join";
      renderSetupMode();
    });
    els.roomCode.addEventListener("input", () => {
      els.roomCode.value = cleanCode(els.roomCode.value);
    });
    els.dealerVariantButtons.addEventListener("click", (event) => {
      const variant = event.target.closest("[data-choice]")?.dataset.choice;
      if (variant) room.sendAction({ type: "choose_variant", variant });
    });
    els.connectButton.addEventListener("click", connect);
    els.cancelConnectButton.addEventListener("click", cancelConnect);
    els.resumeButton.addEventListener("click", resume);
    els.leaveButton.addEventListener("click", leaveTable);
    els.startButton.addEventListener("click", () => room.sendAction({ type: "start_game" }));
    els.copyInviteButton.addEventListener("click", copyInvite);
    els.nextHandButton.addEventListener("click", () => room.sendAction({ type: "next_hand" }));
    els.clearTurnButton.addEventListener("click", resetDraft);
    els.confirmTurnButton.addEventListener("click", confirmTurn);
    els.discardsButton.addEventListener("click", openDiscards);
    els.playerBoard.addEventListener("click", handleBoardClick);
    els.drawCards.addEventListener("click", handleDrawClick);
    els.connectionBanner.addEventListener("click", (event) => { if (event.target.closest("[data-retry]")) retryConnection(); });
    els.roomBanner.addEventListener("click", (event) => { if (event.target.closest("[data-retry]")) retryConnection(); });
    els.seatBanner.addEventListener("click", (event) => { if (event.target.closest("[data-auto-set]")) room.sendAction({ type: "auto_set" }); });
    document.addEventListener("keydown", handleKeyboard);
    els.rulesButton.addEventListener("click", () => {
      selectedRuleVariant = model?.settings?.variant || selectedVariant();
      if (rulesTabs) rulesTabs.activate(selectedRuleVariant);
      else renderRules(selectedRuleVariant);
      openDialog(els.rulesModal);
    });
    els.ledgerButton.addEventListener("click", openLedger);
    els.copyLedgerButton.addEventListener("click", copyLedger);
    els.exportLedgerButton.addEventListener("click", exportLedger);
    document.querySelectorAll("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", () => $(button.dataset.closeDialog).close());
    });
    document.querySelectorAll("input[name='variant'], input[name='seats']").forEach((input) => {
      input.addEventListener("change", renderVariantSettings);
    });
    document.querySelectorAll("input[name='variant']").forEach((input) => input.addEventListener("change", () => {
      document.querySelector("input[name='fantasyMode'][value='" + (["high", "progressive"].includes(selectedVariant()) ? "none" : "super") + "']").checked = true;
    }));
    els.dealerOptionsList.addEventListener("change", renderVariantSettings);
    window.addEventListener("beforeunload", () => persistHostState());
  }

  function bindRoom() {
    room.onStatus = (status, message) => {
      networkStatus = status;
      els.networkState.dataset.state = status;
      els.networkState.querySelector("span").textContent = status === "connected" ? "Connected" : status === "reconnecting" ? "Recovering" : "Offline";
      if (message) showToast(message);
      renderConnectionBanner();
    };
    room.onError = (error) => showError(error.message);
    room.onRoster = (roster) => {
      latestRoster = roster;
      if (room.isHost && model?.kind === "lobby" && !publishingRoster) {
        model.players = roster.map(copyPlayer);
        publishingRoster = true;
        publishModel();
        publishingRoster = false;
      }
      render();
    };
    room.onState = (state) => {
      if (!room.isHost) model = state;
      render();
    };
    room.onAction = handleHostAction;
    room.onEvent = (_clientId, event) => {
      if (event?.kind === "error" && (!event.target || event.target === room.clientId)) showError(event.message);
    };
    room.onBecomeHost = (recoveredState) => {
      model = recoveredState || loadHostState(room.roomCode);
      if (!model) {
        model = { kind: "lobby", settings: readSettings(), players: latestRoster.map(copyPlayer) };
      }
      room.maxPlayers = model.settings.seats;
      publishModel();
      showToast("Table recovered. You are the host.");
    };
  }

  async function connect() {
    clearErrors();
    const name = cleanName(els.playerName.value);
    localStorage.setItem("ofc.play.name", name);
    const attempt = ++connectAttempt;
    setConnectBusy(true, setupMode === "create" ? "Creating your table…" : "Connecting to " + cleanCode(els.roomCode.value) + "… this can take up to 20 seconds.");
    try {
      if (setupMode === "create") {
        const settings = readSettings();
        room.maxPlayers = settings.seats;
        await room.create(name);
        if (attempt !== connectAttempt) return;
        latestRoster = room.snapshot().players;
        model = { kind: "lobby", settings, players: latestRoster.map(copyPlayer) };
        history.replaceState(null, "", "#" + room.roomCode);
        publishModel();
      } else {
        room.maxPlayers = 3;
        await room.join(cleanCode(els.roomCode.value), name);
        if (attempt !== connectAttempt) return;
        history.replaceState(null, "", "#" + room.roomCode);
      }
      render();
    } catch (error) {
      if (attempt !== connectAttempt) return;
      showError(error.message);
    } finally {
      if (attempt === connectAttempt) setConnectBusy(false);
    }
  }

  // A pending create or join is abandoned: the peer is torn down and a late
  // result from that attempt is ignored.
  function cancelConnect() {
    connectAttempt += 1;
    room.resetRuntime();
    setConnectBusy(false);
    els.connectStatus.textContent = "Cancelled.";
  }

  async function resume() {
    clearErrors();
    const attempt = ++connectAttempt;
    setConnectBusy(true, "Reconnecting to your saved table…");
    try {
      await room.resume();
      if (attempt !== connectAttempt) return;
      latestRoster = room.snapshot().players;
      if (room.isHost) {
        model = loadHostState(room.roomCode) || {
          kind: "lobby",
          settings: readSettings(),
          players: latestRoster.map(copyPlayer),
        };
        room.maxPlayers = model.settings.seats;
        publishModel();
      }
      history.replaceState(null, "", "#" + room.roomCode);
      showToast("Saved table restored.");
    } catch (error) {
      if (attempt !== connectAttempt) return;
      showError(error.message);
    } finally {
      if (attempt === connectAttempt) setConnectBusy(false);
    }
  }

  // Retry from the reconnecting banner: rejoin the saved session by hand
  // instead of waiting for the automatic recovery.
  async function retryConnection() {
    if (retrying) return;
    retrying = true;
    clearErrors();
    renderConnectionBanner("Reconnecting…");
    try {
      await room.resume();
      latestRoster = room.snapshot().players;
      if (room.isHost && !model) {
        model = loadHostState(room.roomCode);
        if (model) publishModel();
      }
      showToast("Reconnected.");
    } catch (error) {
      networkStatus = "reconnecting";
      renderConnectionBanner(error.message);
    } finally {
      retrying = false;
      render();
    }
  }

  function leaveTable() {
    room.leave();
    model = null;
    latestRoster = [];
    draftKey = "";
    history.replaceState(null, "", location.pathname);
    render();
    renderResume();
  }

  function handleHostAction(clientId, action) {
    try {
      if (!action || typeof action !== "object") return;
      if (action.type === "start_game") {
        if (clientId !== room.clientId) throw new Error("Only the host can start the game.");
        if (model?.kind !== "lobby") throw new Error("This table has already started.");
        const players = latestRoster.filter((player) => player.connected);
        if (players.length !== model.settings.seats) {
          throw new Error("Fill every seat before starting.");
        }
        model = Game.createGame(players, model.settings, room.roomCode + "-" + Date.now());
        model.kind = "game";
        publishModel();
      }
      if (action.type === "place") {
        if (model?.kind !== "game") throw new Error("No hand is active.");
        model = Game.submitPlacement(model, clientId, action.payload);
        model.kind = "game";
        publishModel();
      }
      if (action.type === "choose_variant") {
        if (model?.kind !== "game") throw new Error("No hand is active.");
        model = Game.chooseVariant(model, clientId, action.variant);
        publishModel();
      }
      if (action.type === "auto_set") {
        // Recovery for a seat that left mid-hand (docs/redesign/notes.md §3.13):
        // the host may set the departed player's cards so the hand can finish.
        if (clientId !== room.clientId) throw new Error("Only the host can set a departed player's cards.");
        if (model?.kind !== "game") throw new Error("No hand is active.");
        const owner = activeOwnerId(model);
        if (!owner || !seatGone(owner)) throw new Error("That player is still connected.");
        const name = playerName(model.activePlayerId);
        model = Game.autoSetActive(model);
        model.kind = "game";
        publishModel();
        showToast(name + "'s cards were set automatically.");
      }
      if (action.type === "next_hand") {
        if (clientId !== room.clientId) throw new Error("Only the host can deal the next hand.");
        if (model?.phase !== "showdown") throw new Error("Finish this hand first.");
        model = Game.startHand(model);
        model.kind = "game";
        publishModel();
      }
    } catch (error) {
      if (clientId === room.clientId) {
        showError(error.message);
      } else {
        room.broadcastEvent({ kind: "error", target: clientId, message: error.message });
      }
    }
  }

  function publishModel() {
    if (!room.isHost || !model) return;
    persistHostState();
    room.publishState(model, (state, clientId) => state.kind === "game" ? Game.filterStateForPlayer(state, clientId) : state);
  }

  function render() {
    const connected = room.connected || networkStatus === "reconnecting";
    els.leaveButton.hidden = !connected;
    if (!connected) {
      els.setupView.hidden = false;
      els.roomView.hidden = true;
      els.tableView.hidden = true;
      els.turnActions.hidden = true;
      return;
    }
    if (!model || model.kind === "lobby") {
      els.turnActions.hidden = true;
      renderRoomLobby();
      return;
    }
    renderGame();
  }

  function renderSetupMode() {
    const joining = setupMode === "join";
    els.modeCreate.classList.toggle("active", !joining);
    els.modeJoin.classList.toggle("active", joining);
    els.modeCreate.setAttribute("aria-pressed", String(!joining));
    els.modeJoin.setAttribute("aria-pressed", String(joining));
    els.joinFields.hidden = !joining;
    document.querySelector(".settings-panel").hidden = joining;
    els.connectButton.textContent = joining ? "Join table" : "Create table";
  }

  function renderVariantSettings() {
    const variant = selectedVariant();
    els.variantNote.textContent = variant === "progressive" ? "High OFC. QQ: 14 cards, KK: 15, AA: 16, trips: 17." : variant === "dealerschoice" ? "BTN chooses after the opening five are dealt, before anyone sets." : Core.VARIANTS[variant].short;
    els.seatSummary.textContent = readRadio("seats") === "3" ? "3-way" : readRadio("seats") === "2btn" ? "2 on the BTN" : "Heads-up";
    els.ultimateRow.hidden = variant !== "progressive";
    els.dealerOptions.hidden = variant !== "dealerschoice";
    const available = variant === "dealerschoice" ? dealerChoices() : [variant];
    els.jjjRow.hidden = !available.some((id) => ["low", "badeucey", "cribbage"].includes(id));
    els.badeuceyRow.hidden = !available.includes("badeucey");
  }

  function renderResume() {
    const saved = room.savedSession();
    els.resumeButton.hidden = !saved;
    if (saved) els.resumeButton.textContent = "Resume " + saved.roomCode;
  }

  function renderRoomLobby() {
    els.setupView.hidden = true;
    els.roomView.hidden = false;
    els.tableView.hidden = true;
    const settings = model?.settings || readSettings();
    const roster = model?.players || latestRoster;
    els.roomCodeDisplay.textContent = room.roomCode;
    els.waitingTitle.textContent = roster.length >= settings.seats ? "Table ready" : "Waiting for players";
    els.roomSeats.textContent = roster.length + " of " + settings.seats + " seats";
    els.roster.innerHTML = Array.from({ length: settings.seats }, (_, seat) => {
      const player = roster[seat];
      if (!player) {
        return '<div class="ofc-seat ofc-seat--empty roster-player empty"><span class="ofc-seat-avatar roster-avatar">' + (seat + 1) + '</span><span class="ofc-seat-name">Open seat</span><span class="badge badge--plain">Share the code</span></div>';
      }
      const me = player.id === room.clientId;
      const status = player.host ? ["Host", "badge--accent"] : player.connected === false ? ["Reconnecting", "badge--warn"] : ["Ready", "badge--good"];
      return '<div class="ofc-seat roster-player' + (me ? " ofc-seat--me" : "") + '"><span class="ofc-seat-avatar roster-avatar">' + initials(player.name) + '</span><span class="ofc-seat-name">' + escapeHtml(player.name) + (me ? ' <small>(you)</small>' : "") + '</span><span class="badge ' + status[1] + '">' + status[0] + '</span></div>';
    }).join("");
    els.roomConfig.innerHTML = settingSummary(settings).map((item) => '<span class="chip config-chip">' + escapeHtml(item) + '</span>').join("");
    els.startButton.hidden = !room.isHost;
    els.waitingCopy.hidden = room.isHost;
    els.waitingCopy.textContent = roster.length >= settings.seats ? "Waiting for the host to start the game." : "Waiting for the host to start the game once every seat is filled.";
    els.startButton.disabled = roster.filter((player) => player.connected !== false).length !== settings.seats;
    els.roomError.textContent = "";
    renderConnectionBanner();
  }

  function renderGame() {
    dragController.cancel();
    els.setupView.hidden = true;
    els.roomView.hidden = true;
    els.tableView.hidden = false;
    const state = currentViewState();
    els.tableView.dataset.phase = state.phase;
    const me = myHand(state);
    if (!me) {
      showError("This game is already seated.");
      return;
    }
    els.gameLabel.textContent = Game.VARIANT_LABELS[state.handVariant || state.settings.variant] + " · Hand " + state.handNumber + (me.inFantasyland ? " · Fantasyland" : "");
    els.tableRoomCode.textContent = room.roomCode;
    els.turnLabel.textContent = turnText(state, me);
    els.scoreStrip.style.setProperty("--seat-count", state.settings.seats);
    els.scoreStrip.innerHTML = state.players.filter((p) => !p.extraHand).map((player) => {
      const active = state.players.some((p) => p.id === state.activePlayerId && Game.ownerId(p) === player.id);
      const button = state.players[state.buttonIndex]?.id === player.id;
      const gone = seatGone(player.id);
      return '<div class="stat score-player' + (active ? " active" : "") + '"><span class="stat-label">' + escapeHtml(player.name) + (button ? ' <b class="score-btn">BTN</b>' : "") + (gone ? ' <b class="score-gone">away</b>' : "") + '</span><strong class="stat-value">' + signed(player.score) + '</strong></div>';
    }).join("");

    const choosing = state.phase === "choose-variant";
    els.dealerSelection.hidden = !choosing;
    if (choosing) {
      const button = state.players[state.buttonIndex];
      const canChoose = Game.ownerId(button) === room.clientId;
      els.dealerHeading.textContent = canChoose ? "Choose this hand's variant" : button.name + " chooses the variant";
      els.dealerVariantButtons.innerHTML = state.settings.dealerChoices.map((id) => '<button type="button" data-choice="' + id + '"' + (canChoose ? "" : " disabled") + '>' + escapeHtml(Game.VARIANT_LABELS[id]) + '</button>').join("");
    }
    const opponents = state.players.filter((player) => player.id !== me.id);
    els.opponents.style.setProperty("--opponent-count", Math.max(1, opponents.length));
    els.opponents.innerHTML = opponents.map(renderOpponent).join("");
    syncDraft(state, me);
    renderPlayerBoard(state, me);
    renderDraw(state, me);
    renderShowdown(state, me);
    renderSeatBanner(state);
    renderConnectionBanner();
    const discardCount = state.players.filter((p) => Game.ownerId(p) === room.clientId).reduce((sum, p) => sum + p.discards.length, 0);
    els.discardsButton.textContent = "Discards" + (discardCount ? " · " + discardCount : "");
    if (state.phase === "showdown") persistLedger(state);
  }

  function renderOpponent(player) {
    const gone = seatGone(Game.ownerId(player));
    const status = model.phase === "showdown"
      ? (player.evaluation?.legal ? [player.evaluation.points + " royalties", player.evaluation.points ? "badge--good" : ""] : ["Fouled", "badge--bad"])
      : gone ? ["Disconnected", "badge--warn"] : player.hiddenFantasy ? ["Setting Fantasyland", "badge--info"] : model.activePlayerId === player.id ? ["Setting now", "badge--accent"] : ["Waiting", ""];
    const name = player.name + (!player.extraHand && Game.ownerId(player) === room.clientId && model.settings.twoOnButton ? " · Hand 1" : "");
    const evaluation = Object.values(player.board).flat().includes("BACK") ? null : boardPreview(currentViewState(), player.board);
    return '<section class="panel panel--quiet opponent-board' + (model.activePlayerId === player.id ? " is-active" : "") + '" aria-label="' + escapeHtml(player.name) + '"><div class="opponent-head"><strong>' + escapeHtml(name) + '</strong><span class="badge ' + status[1] + '">' + escapeHtml(status[0]) + '</span></div><div class="ofc-board ofc-board--mini mini-board">' +
      ["top", "middle", "bottom"].map((row) => renderMiniRow(player, row, evaluation)).join("") +
      '</div></section>';
  }

  function renderMiniRow(player, row, evaluation = player.evaluation) {
    const limit = Game.ROW_LIMITS[row];
    const cards = player.board[row] || [];
    const assignments = evaluation?.assignments || {};
    return '<div class="ofc-row mini-row-group"><div class="ofc-row-cards mini-row">' + Array.from({ length: limit }, (_, index) => cards[index]
      ? cardHtml(cards[index], { assignments, disabled: true, set: player.placedAt?.[cards[index]], latest: player.placedAt?.[cards[index]] === player.lastSet })
      : PlayingCards.emptySlotHtml()).join("") + '</div><div class="ofc-row-summary mini-score">' + rowScoreHtml(evaluation?.rowEvals?.[row], row) + '</div></div>';
  }

  function syncDraft(state, me) {
    const key = [state.handNumber, state.actionIndex, me.draw.join(",")].join(":");
    if (key === draftKey) return;
    draftKey = key;
    turnAssignments = {};
    selectedTarget = "bottom";
  }

  function renderPlayerBoard(state, me) {
    const action = currentAction(state);
    const myTurn = state.phase === "placement" && state.activePlayerId === me.id;
    const board = draftBoard(me);
    const evaluation = boardPreview(state, board);
    const hadFocus = Boolean(document.activeElement?.closest("#player-board .row-label"));
    els.playerLabel.textContent = me.name + (!me.extraHand && state.settings.twoOnButton && state.players[state.buttonIndex].id === me.id ? " · Hand 1" : "") + (me.inFantasyland ? " · Fantasyland" : "");
    const foul = Boolean(evaluation.complete && !evaluation.legal);
    const royalties = state.phase === "showdown" ? (me.evaluation?.legal ? me.evaluation.points : 0) : (evaluation.previewPoints || 0);
    const fouled = state.phase === "showdown" ? !me.evaluation?.legal : foul;
    els.placementCounter.innerHTML = '<span class="hand-chip-name">' + (fouled ? "Foul" : "Royalties") + '</span><b class="hand-chip-pts">' + (fouled ? "" : royalties) + '</b>';
    els.placementCounter.className = "hand-chip" + (fouled ? " hand-chip--bad foul-text" : royalties ? " hand-chip--good" : "");
    els.playerBoard.innerHTML = ["top", "middle", "bottom"].map((row) => {
      const cards = board[row];
      const rowEvaluation = evaluation?.rowEvals?.[row];
      const selected = selectedTarget === row && myTurn;
      return '<div class="ofc-row board-row' + (selected ? " target" : "") + '" data-row="' + row + '" aria-label="' + titleCase(row) + (selected ? ", selected" : "") + '">' +
        '<button type="button" class="ofc-row-head row-label" role="radio" aria-checked="' + (selected ? "true" : "false") + '" tabindex="' + (selected || (!myTurn && row === "bottom") ? "0" : "-1") + '"' + (myTurn ? "" : " disabled") + '><strong>' + titleCase(row) + '</strong><small>' + cards.length + ' of ' + Game.ROW_LIMITS[row] + '</small>' + (selected ? '<kbd class="ofc-row-key row-keys">↑ ↓</kbd>' : '') + '</button>' +
        '<div class="ofc-row-cards board-cards">' +
        Array.from({ length: Game.ROW_LIMITS[row] }, (_, index) => {
          const cardId = cards[index];
          if (!cardId) return PlayingCards.emptySlotHtml();
          return cardHtml(cardId, {
            assignments: evaluation?.assignments || {},
            staged: Object.prototype.hasOwnProperty.call(turnAssignments, cardId),
            set: turnAssignments[cardId] ? (action?.round || 0) + 1 : me.placedAt?.[cardId],
            latest: turnAssignments[cardId] ? true : !Object.keys(turnAssignments).length && me.placedAt?.[cardId] === me.lastSet,
            origin: Object.prototype.hasOwnProperty.call(turnAssignments, cardId) ? "board" : "fixed",
          });
        }).join("") +
        '</div><div class="ofc-row-summary row-score">' + rowScoreHtml(rowEvaluation, row) + '</div></div>';
    }).join("");
    if (hadFocus) els.playerBoard.querySelector('.row-label[aria-checked="true"]')?.focus({ preventScroll: true });
  }

  function renderDraw(state, me) {
    const action = currentAction(state);
    const myTurn = state.phase === "placement" && state.activePlayerId === me.id;
    els.drawArea.hidden = state.phase === "showdown";
    els.turnActions.hidden = state.phase === "showdown" || state.phase === "choose-variant";
    if (!myTurn) {
      els.drawLabel.textContent = state.phase === "choose-variant" ? "Your opening five" : "Waiting";
      els.drawInstruction.textContent = state.phase === "choose-variant" ? "Waiting for the variant selection" : state.activePlayerId ? playerName(state.activePlayerId) + " is setting" : "";
      els.drawCards.style.setProperty("--draw-columns", 5);
      els.drawCards.style.setProperty("--tray-columns", 5);
      els.drawCards.classList.remove("ofc-tray--grid");
      els.drawCards.innerHTML = state.phase === "choose-variant" ? me.draw.map((id) => cardHtml(id, { disabled: true })).join("") : "";
      els.confirmTurnButton.disabled = true;
      els.clearTurnButton.disabled = true;
      return;
    }
    const expected = expectedPlaced(action);
    const expectedDiscards = me.draw.length - expected;
    els.drawLabel.textContent = action.kind === "fantasy" ? "Fantasyland hand" : action.round === 0 ? "Opening five" : "Draw " + action.round;
    const remaining = expected - Object.keys(turnAssignments).length;
    els.drawInstruction.textContent = remaining > 0 ? "Set " + remaining + " more" : expectedDiscards ? "Ready · " + expectedDiscards + " left to discard" : "Ready to confirm";
    const displayCards = me.draw;
    const columns = Math.max(1, displayCards.length);
    els.drawCards.style.setProperty("--draw-columns", columns);
    // Phones: hands past five cards wrap into two rows so every card stays ≥ 36px wide.
    els.drawCards.style.setProperty("--tray-columns", columns <= 5 ? columns : Math.ceil(columns / 2));
    els.drawCards.classList.toggle("ofc-tray--grid", columns > 5);
    els.drawCards.innerHTML = displayCards.map((cardId, index) => {
      const placed = Boolean(turnAssignments[cardId]);
      return '<div class="ofc-tray-slot hand-slot" data-hand-id="' + cardId + '"' + (placed ? ' role="img" aria-label="Card ' + (index + 1) + ', placed"' : '') + '>' +
        (placed ? PlayingCards.emptySlotHtml() : cardHtml(cardId, { origin: "hand", shortcut: index + 1 })) +
        (index < 9 ? '<kbd class="ofc-tray-key hand-key" title="Press ' + (index + 1) + ' to place or recall">' + (index + 1) + '</kbd>' : '') + '</div>';
    }).join("");
    els.clearTurnButton.disabled = Object.keys(turnAssignments).length === 0;
    els.confirmTurnButton.disabled = !draftReady(action, me);
  }

  function renderShowdown(state, me) {
    const showdown = state.phase === "showdown";
    els.showdownPanel.hidden = !showdown;
    if (!showdown) return;
    const delta = state.players.filter((p) => Game.ownerId(p) === room.clientId).reduce((sum, p) => sum + Number(state.handResult?.deltas?.[p.id] || 0), 0);
    els.showdownTitle.textContent = delta > 0 ? "Won " + delta + " points" : delta < 0 ? "Lost " + Math.abs(delta) + " points" : "Push";
    els.showdownResults.innerHTML = state.players.map((player) => {
      const points = Number(state.handResult?.deltas?.[player.id] || 0);
      const result = player.evaluation?.legal ? player.evaluation.points + " royalties" : "Foul";
      const mine = Game.ownerId(player) === room.clientId;
      return '<div class="list-row showdown-result' + (mine ? " is-selected" : "") + '"><span class="list-row-label">' + escapeHtml(player.name) + '</span><span class="list-row-sub' + (player.evaluation?.legal ? "" : " is-bad") + '">' + escapeHtml(result) + '</span><strong class="list-row-value ' + (points > 0 ? "is-good delta-positive" : points < 0 ? "is-bad delta-negative" : "") + '">' + signed(points) + '</strong></div>';
    }).join("");
    els.nextHandButton.hidden = !room.isHost;
    els.showdownWaiting.hidden = room.isHost;
  }

  // A seat whose owner has dropped: the roster marks it disconnected, it left
  // the room entirely, or (on the host) its connection has gone quiet.
  function seatGone(ownerId) {
    if (goneSeats.has(ownerId)) return true;
    if (!latestRoster.length) return false;
    const player = latestRoster.find((entry) => entry.id === ownerId);
    return !player || player.connected === false;
  }

  function watchSeats() {
    const next = new Set();
    if (room.isHost && room.connected) {
      const now = Date.now();
      room.connections.forEach((connection, clientId) => {
        if (!watchedConnections.has(connection)) {
          watchedConnections.add(connection);
          lastSeen.set(clientId, now);
          connection.on("data", () => lastSeen.set(clientId, Date.now()));
        }
        if (!connection.open || now - (lastSeen.get(clientId) || now) > 9000) next.add(clientId);
      });
      latestRoster.forEach((player) => {
        if (player.id !== room.clientId && !room.connections.has(player.id)) next.add(player.id);
      });
    }
    if (next.size === goneSeats.size && Array.from(next).every((id) => goneSeats.has(id))) return;
    goneSeats = next;
    if (model?.kind === "game" && !els.tableView.hidden) render();
  }

  function activeOwnerId(state) {
    if (!state || state.kind !== "game") return null;
    if (state.phase === "choose-variant") return Game.ownerId(state.players[state.buttonIndex]);
    const active = state.players.find((p) => p.id === state.activePlayerId);
    return active ? Game.ownerId(active) : null;
  }

  function renderSeatBanner(state) {
    const owner = state.phase === "showdown" ? null : activeOwnerId(state);
    const gone = owner && owner !== room.clientId && seatGone(owner);
    els.seatBanner.hidden = !gone;
    if (!gone) return;
    const name = state.players.find((p) => Game.ownerId(p) === owner)?.name || "A player";
    const what = state.phase === "choose-variant" ? "choose the variant" : "set their cards";
    els.seatBanner.innerHTML = '<span><strong>' + escapeHtml(name) + '</strong> has disconnected while it is their turn. They can resume from the same browser; ' +
      (room.isHost ? 'or you can ' + what + ' for them so the hand can finish.</span><button class="btn btn--sm" type="button" data-auto-set>' + (state.phase === "choose-variant" ? "Choose for them" : "Set their cards") + '</button>'
        : 'otherwise the host can ' + what + ' for them.</span>');
  }

  function renderConnectionBanner(detail) {
    const reconnecting = networkStatus === "reconnecting";
    const text = detail || "Connection to the host was lost. Recovering the table…";
    for (const banner of [els.connectionBanner, els.roomBanner]) {
      banner.hidden = !reconnecting;
      if (reconnecting) banner.innerHTML = '<span>' + escapeHtml(text) + '</span><button class="btn btn--sm" type="button" data-retry' + (retrying ? " disabled" : "") + '>Retry</button>';
    }
  }

  function handleDrawClick(event) {
    const card = event.target.closest("[data-card-id]");
    if (!card) return;
    assignCard(card.dataset.cardId, selectedTarget);
  }

  function handleBoardClick(event) {
    const card = event.target.closest("[data-card-id]");
    if (card?.dataset.origin === "board") {
      assignCard(card.dataset.cardId, "hand");
      return;
    }
    const row = event.target.closest("[data-row]")?.dataset.row;
    if (!row) return;
    selectTarget(row);
  }

  function canMoveCard(id) {
    const state = model;
    const me = myHand(state);
    return state?.phase === "placement" && state.activePlayerId === me?.id && me.draw.includes(id);
  }

  function resolveDrop(element, id) {
    if (!canMoveCard(id) || !element) return null;
    if (element.closest("#draw-cards")) {
      return { target: "hand", rect: els.drawCards.querySelector('[data-hand-id="' + id + '"]').getBoundingClientRect() };
    }
    const row = element.closest("#player-board [data-row]");
    if (!row) return null;
    const key = row.dataset.row;
    const me = myHand(model);
    const cards = draftBoard(me)[key];
    const index = cards.includes(id) ? cards.indexOf(id) : cards.length;
    if (index >= Game.ROW_LIMITS[key] || (!turnAssignments[id] && Object.keys(turnAssignments).length >= expectedPlaced(currentAction(model)))) return null;
    return { target: key, rect: row.querySelector(".board-cards").children[index].getBoundingClientRect() };
  }

  function selectTarget(target) {
    selectedTarget = target;
    renderGame();
  }

  function assignCard(cardId, target) {
    const me = myHand(currentViewState());
    if (!canMoveCard(cardId)) return;
    if (target === "hand") delete turnAssignments[cardId];
    else {
      if (turnAssignments[cardId] === target) return;
      if (!turnAssignments[cardId] && Object.keys(turnAssignments).length >= expectedPlaced(currentAction(model))) return showToast("This set is ready. Return a card to change it.");
      if (draftBoard(me)[target].length >= Game.ROW_LIMITS[target]) return showToast(titleCase(target) + " is full.");
      turnAssignments[cardId] = target;
      selectedTarget = target;
      if (draftBoard(me)[target].length === Game.ROW_LIMITS[target]) {
        const rows = ["bottom", "middle", "top"];
        selectedTarget = rows[(rows.indexOf(target) + 1) % 3];
      }
    }
    renderGame();
  }

  function resetDraft() {
    turnAssignments = {};
    selectedTarget = "bottom";
    renderGame();
  }

  function confirmTurn() {
    if (dragController.drag) return;
    const me = myHand(currentViewState());
    const action = currentAction(model);
    if (!draftReady(action, me)) return;
    const placements = Object.entries(turnAssignments).map(([cardId, row]) => ({ cardId, row }));
    room.sendAction({ type: "place", payload: { placements } });
  }

  function handleKeyboard(event) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.target.closest("input, select, textarea, [contenteditable], dialog") || document.querySelector("dialog[open]") || dragController.drag) return;
    const state = currentViewState();
    const me = myHand(state);
    if (!me || state.phase !== "placement" || state.activePlayerId !== me.id) return;
    const rows = ["top", "middle", "bottom"];
    if (["ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      selectTarget(rows[(rows.indexOf(selectedTarget) + (event.key === "ArrowUp" ? 2 : 1)) % 3]);
    } else if (/^[1-9]$/.test(event.key)) {
      event.preventDefault();
      const id = me.draw[Number(event.key) - 1];
      if (id) assignCard(id, turnAssignments[id] ? "hand" : selectedTarget);
    } else if (event.code === "Space") { event.preventDefault(); confirmTurn(); }
    else if (event.key.toLowerCase() === "c") { event.preventDefault(); resetDraft(); }
  }

  function boardPreview(state, board) {
    const key = JSON.stringify([Game.scoringVariant(state), state.settings.topRepeatJacksPlus, board]);
    if (!previewCache.has(key)) {
      if (previewCache.size > 100) previewCache.clear();
      previewCache.set(key, Game.previewBoard(state, board));
    }
    return previewCache.get(key);
  }

  function openDialog(dialog) {
    if (window.Sheet) window.Sheet.open(dialog, { dismissible: true });
    else dialog.showModal();
  }

  function openLedger() {
    if (!model || model.kind !== "game") return;
    const state = currentViewState();
    const owners = state.players.filter((p) => !p.extraHand);
    els.ledgerTotals.innerHTML = owners.map((player, index) => '<div class="stat ledger-total"><span class="stat-label"><i class="ledger-swatch" style="--swatch: ' + SERIES_COLORS[index % SERIES_COLORS.length] + '" aria-hidden="true"></i>' + escapeHtml(player.name) + '</span><strong class="stat-value' + (player.score > 0 ? " is-good" : player.score < 0 ? " is-bad" : "") + '">' + signed(player.score) + '</strong></div>').join("");
    els.ledgerList.innerHTML = state.ledger.length ? state.ledger.slice().reverse().map((hand) => {
      const displayBoards = (hand.boards || []).map((p) => ({ ...p, evaluation: Object.keys(p.evaluation.rowEvals || {}).length === 3 ? p.evaluation : { ...boardPreview({ ...state, handVariant: hand.variant }, p.board), legal: p.evaluation.legal, points: p.evaluation.points } }));
      const deltas = owners.map((player) => '<span class="' + (hand.deltas[player.id] > 0 ? "is-good delta-positive" : hand.deltas[player.id] < 0 ? "is-bad delta-negative" : "") + '">' + escapeHtml(player.name) + " " + signed(hand.deltas[player.id] || 0) + '</span>').join("");
      const boards = displayBoards.map((p) => '<section class="history-board"><header><strong>' + escapeHtml(p.name) + '</strong><span class="hand-chip' + (p.evaluation.legal ? (p.evaluation.points ? " hand-chip--good" : "") : " hand-chip--bad") + '"><span class="hand-chip-name">' + (p.evaluation.legal ? 'Royalties' : 'Foul') + '</span>' + (p.evaluation.legal ? '<b class="hand-chip-pts">' + p.evaluation.points + '</b>' : '') + '</span></header>' + ["top", "middle", "bottom"].map((row) => '<div class="history-row"><span>' + titleCase(row) + '</span><div class="history-cards">' + p.board[row].map((id) => cardHtml(id, { disabled: true, assignments: p.evaluation.assignments, set: p.placedAt?.[id] })).join("") + '</div><div class="history-score">' + rowScoreHtml(p.evaluation.rowEvals?.[row], row) + '</div></div>').join("") + (Game.ownerId(p) === room.clientId && p.discards.length ? '<div class="history-discard"><span>Discards</span><div class="history-cards">' + p.discards.map((id) => cardHtml(id, { disabled: true })).join("") + '</div></div>' : '') + '</section>').join("");
      return '<details class="ledger-hand"><summary><span>Hand ' + hand.handNumber + '<small>' + escapeHtml(Game.VARIANT_LABELS[hand.variant] || hand.variant) + '</small></span><div class="ledger-deltas">' + deltas + '</div></summary><div class="history-boards">' + (boards || '<p class="field-hint">Board history was not recorded for this older hand.</p>') + '</div></details>';
    }).join("") : '<p class="field-hint ledger-empty">No completed hands yet.</p>';
    drawLedgerCharts();
    openDialog(els.ledgerModal);
  }

  function openDiscards() {
    const state = currentViewState();
    const mine = state.players.filter((p) => Game.ownerId(p) === room.clientId);
    els.discardsContent.innerHTML = mine.map((p) => '<section class="discard-history"><h3>' + escapeHtml(p.name) + '</h3>' + ((p.discardHistory || []).length ? p.discardHistory.map((entry) => '<div class="discard-history-row"><span>Set ' + entry.set + '</span><div class="history-cards">' + entry.cards.map((id) => cardHtml(id, { disabled: true, set: entry.set })).join("") + '</div></div>').join("") : p.discards.length ? '<div class="history-cards">' + p.discards.map((id) => cardHtml(id, { disabled: true })).join("") + '</div>' : '<p class="field-hint">No discards yet.</p>') + '</section>').join("");
    openDialog(els.discardsModal);
  }

  // The two ledger charts are HTML bar lists (shared .bar-list rows with the
  // family's diverging bar), so the series colours come from the chart tokens.
  function drawLedgerCharts() {
    const state = currentViewState();
    const owners = state.players.filter((p) => !p.extraHand);
    els.ledgerLegend.innerHTML = owners.map((p, i) => '<span class="chip"><i class="ledger-swatch" style="--swatch: ' + SERIES_COLORS[i % SERIES_COLORS.length] + '" aria-hidden="true"></i>' + escapeHtml(p.name) + '</span>').join("");
    for (const [element, cumulative] of [[els.ledgerChart, true], [els.handChart, false]]) {
      const series = owners.map((p) => cumulative ? state.ledger.map((h) => Number(h.totals?.[p.id]) || 0) : state.ledger.map((h) => Number(h.deltas?.[p.id]) || 0));
      const max = Math.max(1, ...series.flat().map((value) => Math.abs(value)));
      if (!state.ledger.length) {
        element.innerHTML = '<p class="field-hint ledger-empty">Scores appear after the first hand.</p>';
        element.setAttribute("aria-label", (cumulative ? "Running score" : "Points per hand") + ": no hands yet");
        continue;
      }
      element.innerHTML = '<ul class="bar-list ledger-bars">' + state.ledger.map((hand, handIndex) => owners.map((p, i) => {
        const value = series[i][handIndex];
        return '<li class="bar-row' + (i === 0 ? " is-first" : "") + '"><span class="bar-row-label">' + (i === 0 ? "Hand " + hand.handNumber : "") + '</span><span class="ofc-dbar' + (value < 0 ? " ofc-dbar--neg" : "") + '" style="--value: ' + (Math.abs(value) / max).toFixed(3) + '; --bar-color: ' + SERIES_COLORS[i % SERIES_COLORS.length] + '" title="' + escapeHtml(p.name + " " + signed(value)) + '"></span><span class="bar-row-value' + (value > 0 ? " is-good" : value < 0 ? " is-bad" : "") + '">' + signed(value) + '</span></li>';
      }).join("")).join("") + '</ul>';
      element.setAttribute("aria-label", (cumulative ? "Running score" : "Points per hand") + ": " + owners.map((p, i) => p.name + " " + series[i].map(signed).join(", ")).join("; "));
    }
  }

  async function copyLedger() {
    if (!model || model.kind !== "game") return;
    await copyText(Game.ledgerText(currentViewState()));
    showToast("Ledger copied.");
  }

  function exportLedger() {
    if (!model || model.kind !== "game") return;
    const blob = new Blob([JSON.stringify(Game.exportLedger(currentViewState()), null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "ofc-" + room.roomCode.toLowerCase() + "-ledger.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 500);
  }

  async function copyInvite() {
    const url = location.origin + location.pathname + "#" + room.roomCode;
    await copyText("Join my OFC table: " + url + "\nRoom code: " + room.roomCode);
    showToast("Invite copied.");
  }

  function renderRules(variant) {
    const rule = Core.RULE_SECTIONS.find((entry) => entry.id === variant) || Core.RULE_SECTIONS[0];
    const sections = [];
    if (variant === "progressive") sections.push(ruleSection("Progressive", listHtml(["High scoring. Natural QQ earns 14 cards; KK 15; AA 16; trips 17.", "Ultimate on: repeats keep the current card count. Off: repeats start at 14 before any Super FL bonus."])));
    if (variant === "dealerschoice") {
      els.rulesContent.innerHTML = ruleSection("Dealer's Choice", listHtml(["All opening five-card sets are dealt before BTN chooses an enabled variant. No placements are allowed until the choice is made.", "The chosen variant applies to every board for that hand. Fantasyland hands receive their remaining cards after the choice.", "Only the first BTN hand's opening cards are visible when choosing in 2 on the BTN."])) + tableRules();
      els.rulesContent.scrollTop = 0;
      return;
    }
    sections.push(ruleSection("Natural OFC", listHtml(rule.natural || [])));
    sections.push(ruleSection("Fantasyland board", "<p>" + escapeHtml(rule.qualification || "") + "</p>"));
    sections.push(ruleSection("Royalties", '<div class="royalty-groups">' + (rule.scoring || []).map((group) => '<div class="royalty-group"><h4>' + escapeHtml(group.label) + '</h4>' + listHtml(group.items) + '</div>').join("") + "</div>"));
    if (rule.fantasy) sections.push(ruleSection("Enter Fantasyland", "<p>" + escapeHtml(rule.fantasy) + "</p>"));
    if (rule.repeat) sections.push(ruleSection("Repeat Fantasyland", "<p>" + escapeHtml(rule.repeat) + "</p>"));
    if (rule.stacking) sections.push(ruleSection("Stacking / Super", "<p>" + escapeHtml(rule.stacking) + "</p>"));
    if (rule.superFantasy) sections.push(ruleSection("Super Fantasyland", "<p>" + escapeHtml(rule.superFantasy) + "</p>"));
    els.rulesContent.innerHTML = '<p class="rule-intro">' + escapeHtml(Core.VARIANTS[rule.id].short) + "</p>" + sections.join("") + tableRules();
    els.rulesContent.scrollTop = 0;
  }

  function tableRules() {
    return ruleSection("2 on the BTN", listHtml(["Two players, three boards. BTN sets hand 1 then hand 2 on each natural draw. Hand 2's draw is hidden until its turn.", "Both BTN boards score against the opponent, never against each other. The ledger combines both results for BTN.", "When BTN moves, the new BTN gets the extra board. Any Fantasyland earned on a player's extra board is saved until their next BTN turn."])) +
      ruleSection("Multiple Fantasylands", listHtml(["None: one Fantasyland, no extra cards for multiple triggers. High repeats receive 14 cards.", "Stack: each trigger earns another Fantasyland hand in the queue.", "Super: each additional trigger adds a card, capped at 17."])) +
      ruleSection("Controls", listHtml(["Click or tap a row, then a card, to set it; click a card you set this turn to take it back. Cards can also be dragged.", "Keyboard: ↑ and ↓ choose the row, 1–9 set or recall the first nine cards of the draw, Space confirms, C resets the turn.", "Fantasyland hands of ten or more cards: cards 10–17 are set with the mouse, touch or drag only."]));
  }

  function ruleSection(label, content) {
    return '<section class="rule-section"><strong>' + escapeHtml(label) + "</strong><div>" + content + "</div></section>";
  }

  function listHtml(items) {
    return "<ul>" + items.map((item) => "<li>" + escapeHtml(item) + "</li>").join("") + "</ul>";
  }

  function readSettings() {
    return Game.normalizeSettings({
      seats: readRadio("seats"),
      variant: selectedVariant(),
      jokers: readRadio("jokers") === "on",
      buttonRule: readRadio("buttonRule"),
      fantasyMode: readRadio("fantasyMode"),
      dealerChoices: dealerChoices(),
      ultimate: els.ultimate.checked,
      topRepeatJacksPlus: els.jjjPlus.checked,
      badeuceyFantasyCards: Number(els.badeuceyCards.value),
    });
  }

  function settingSummary(settings) {
    const values = [
      Game.VARIANT_LABELS[settings.variant],
      settings.twoOnButton ? "2 on the BTN" : settings.seats === 3 ? "3-way" : "Heads-up",
      settings.jokers ? "2 jokers" : "No jokers",
      settings.buttonRule === "move" ? "Moving BTN" : "BTN holds in FL",
      settings.fantasyMode === "stack" ? "FL stacking" : settings.fantasyMode === "none" ? "No multiple FLs" : "Super FL",
    ];
    if (settings.progressive) values.push(settings.ultimate ? "Ultimate repeat" : "Repeats from 14");
    if (settings.topRepeatJacksPlus) values.push("JJJ+ top repeat");
    if (settings.variant === "badeucey") values.push(settings.badeuceyFantasyCards + "-card FL");
    if (settings.variant === "dealerschoice") values.push("Choices: " + settings.dealerChoices.map((id) => Game.VARIANT_LABELS[id]).join(", "));
    return values;
  }

  function selectedVariant() {
    return readRadio("variant") || "high";
  }

  function readRadio(name) {
    return document.querySelector("input[name='" + name + "']:checked")?.value || "";
  }

  function currentAction(state) {
    return state.actionQueue?.[state.actionIndex] || null;
  }

  function expectedPlaced(action) {
    if (!action) return 0;
    return action.kind === "fantasy" ? 13 : action.round === 0 ? 5 : 2;
  }

  function draftReady(action, me) {
    if (!action || !me) return false;
    const expected = expectedPlaced(action);
    return model?.phase === "placement" && model.activePlayerId === me.id && Object.keys(turnAssignments).length === expected;
  }

  function draftBoard(me) {
    const board = {
      top: me.board.top.slice(),
      middle: me.board.middle.slice(),
      bottom: me.board.bottom.slice(),
    };
    Object.entries(turnAssignments).forEach(([cardId, row]) => { if (me.draw.includes(cardId)) board[row].push(cardId); });
    return board;
  }

  // One hand chip per row: hand name | points, toned good when it scores and
  // bad when the board fouls.
  function rowScoreHtml(evaluation, row) {
    if (!evaluation) return "";
    if (evaluation.badugi && evaluation.low && evaluation.qualifies) return evaluation.scoreComponents.map((part) => handChip(part.label + (part.key === "badugi" ? " Badugi" : " Low"), part.points || 0, part.points ? "good" : "")).join("");
    const points = Number(evaluation.points || 0);
    const categoryNames = ["High card", "Pair", "Two pair", "Trips", "Straight", "Flush", "Boat", "Quads", "Straight flush"];
    let name = evaluation.name || "";
    if (Number.isInteger(evaluation.category)) {
      name = categoryNames[evaluation.category] || name;
      if (evaluation.category === Core.CATEGORY.STRAIGHT_FLUSH && evaluation.mainRank === 14) name = "Royal flush";
      if (row === "top" && [Core.CATEGORY.PAIR, Core.CATEGORY.TRIPS].includes(evaluation.category)) name += " " + (RANK_LABEL[evaluation.mainRank] || "").repeat(evaluation.category === Core.CATEGORY.PAIR ? 2 : 3);
    }
    const foul = evaluation.qualifies === false && evaluation.complete !== false;
    return handChip(name + (foul ? " · Foul" : ""), points, foul ? "bad" : points ? "good" : "");
  }

  function handChip(name, points, tone) {
    return '<span class="hand-chip' + (tone ? " hand-chip--" + tone : "") + '"><span class="hand-chip-name">' + escapeHtml(name) + '</span><b class="hand-chip-pts">' + points + '</b></span>';
  }

  // Every card face comes from shared/cards.js. A joker standing in for a card
  // shows the card it represents on the joker's purple background with a JK corner
  // marker; the badge marks which draw placed the card ("latest" for the most recent).
  function cardHtml(cardId, options = {}) {
    if (cardId === "BACK") return PlayingCards.html("BACK");
    const transformedId = options.assignments?.[cardId] || cardId;
    const originalJoker = /^JK[12]$/i.test(cardId);
    const card = Core.makeCard(transformedId);
    const standIn = originalJoker && !card.joker;
    const origin = options.origin || "hand";
    return PlayingCards.html(card.joker ? "JK" : { rank: card.rank, suit: card.suit }, {
      tag: "button",
      className: standIn ? "joker" : "",
      staged: Boolean(options.staged),
      selected: Boolean(options.selected),
      interactive: !options.disabled && origin !== "fixed",
      corner: standIn ? "JK" : "",
      badge: options.set ? String(options.set) : "",
      badgeClass: options.set && options.latest ? "latest" : "",
      label: cardLabel(cardId) + (options.set ? ", set " + options.set : ""),
      title: options.set ? "Placed in set " + options.set : "",
      attrs: options.disabled
        ? { tabindex: "-1" }
        : { "data-card-id": cardId, "data-origin": origin, draggable: "false" },
    });
  }

  function cardLabel(cardId) {
    if (/^JK/.test(cardId)) return "Joker";
    const card = Core.makeCard(cardId);
    const suit = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" }[card.suit];
    return RANK_LABEL[card.rank] + " of " + suit;
  }

  function turnText(state, me) {
    if (state.phase === "choose-variant") return "Dealer's Choice";
    if (state.phase === "showdown") return "Showdown";
    if (state.activePlayerId === me.id) return me.inFantasyland ? "Set your Fantasyland" : "Your turn";
    return playerName(state.activePlayerId) + " is setting";
  }

  function playerName(id) {
    return currentViewState()?.players?.find((player) => player.id === id)?.name || "Player";
  }

  function currentViewState() {
    if (!model || !room.isHost || model.kind !== "game") return model;
    return Game.filterStateForPlayer(model, room.clientId);
  }

  function myHand(state) {
    const mine = state?.players?.filter((p) => Game.ownerId(p) === room.clientId) || [];
    return mine.find((p) => p.id === state.activePlayerId) || mine[0];
  }

  function dealerChoices() {
    return Array.from(document.querySelectorAll("input[name='dealerChoice']:checked"), (input) => input.value);
  }

  function persistHostState() {
    if (!room.isHost || !room.roomCode || !model) return;
    localStorage.setItem("ofc.play.host." + room.roomCode, JSON.stringify(model));
  }

  function loadHostState(code) {
    try {
      return JSON.parse(localStorage.getItem("ofc.play.host." + code) || "null");
    } catch (_error) {
      return null;
    }
  }

  function persistLedger(state) {
    const key = "ofc.play.ledger." + room.roomCode;
    localStorage.setItem(key, JSON.stringify(Game.exportLedger(state)));
  }

  function setConnectBusy(busy, status) {
    els.connectButton.disabled = busy;
    els.resumeButton.disabled = busy;
    els.cancelConnectButton.hidden = !busy;
    els.connectStatus.textContent = busy ? status || "Connecting…" : "";
    if (busy) els.connectButton.textContent = "Connecting…";
    else renderSetupMode();
  }

  // Errors render where the user is looking (the open view, never a hidden
  // one) and are announced once through the page's assertive region.
  function showError(message) {
    if (!els.tableView.hidden) els.tableError.textContent = message;
    else if (!els.roomView.hidden) els.roomError.textContent = message;
    else els.setupError.textContent = message;
    showToast(message, "alert");
  }

  function clearErrors() {
    els.setupError.textContent = "";
    els.roomError.textContent = "";
    els.tableError.textContent = "";
  }

  // One polite stack (#toast) and one assertive stack (#alerts); each toast
  // has a dismiss control and pauses its timer while hovered or focused.
  function showToast(message, kind) {
    const stack = kind === "alert" ? els.alerts : els.toast;
    const toast = document.createElement("div");
    toast.className = "toast" + (kind === "alert" ? " toast--alert" : "");
    toast.innerHTML = '<span></span><button class="btn btn--ghost btn--icon btn--sm" type="button" aria-label="Dismiss"><svg class="icon" aria-hidden="true"><use href="../../shared/icons.svg#i-close"/></svg></button>';
    toast.firstElementChild.textContent = message;
    const remove = () => { clearTimeout(timer); toast.remove(); };
    let timer = 0;
    const arm = () => { clearTimeout(timer); timer = setTimeout(remove, kind === "alert" ? 6000 : 3200); };
    toast.querySelector("button").addEventListener("click", remove);
    toast.addEventListener("mouseenter", () => clearTimeout(timer));
    toast.addEventListener("focusin", () => clearTimeout(timer));
    toast.addEventListener("mouseleave", arm);
    toast.addEventListener("focusout", arm);
    while (stack.children.length >= 3) stack.firstElementChild.remove();
    stack.append(toast);
    arm();
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard?.writeText) return await navigator.clipboard.writeText(text);
    } catch (_error) {
      // Fall through to the selection-based copy below.
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("aria-hidden", "true");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }

  function copyPlayer(player) {
    return { id: player.id, name: player.name, host: Boolean(player.host), connected: player.connected !== false };
  }

  function cleanName(value) {
    return String(value || "Player").trim().replace(/\s+/g, " ").slice(0, 24) || "Player";
  }

  function cleanCode(value) {
    return String(value || "").split("#").pop().toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
  }

  function initials(name) {
    return cleanName(name).split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  }

  function titleCase(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function signed(value) {
    const number = Number(value) || 0;
    return number > 0 ? "+" + number : String(number);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);
  }
})();
