(function () {
  "use strict";

  const Core = window.OFCFantasylandCore;
  const Game = window.OFCPineappleGame;
  const PeerRoom = window.PeerRoom;
  const RANK_LABEL = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T", 9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2" };
  if (!Core || !Game || !PeerRoom) return;

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
    resumeButton: $("resume-button"),
    setupError: $("setup-error"),
    seatSummary: $("seat-summary"),
    variantNote: $("variant-note"),
    progressiveRow: $("progressive-row"),
    ultimateRow: $("ultimate-row"),
    jjjRow: $("jjj-row"),
    badeuceyRow: $("badeucey-row"),
    progressive: $("progressive"),
    ultimate: $("ultimate"),
    jjjPlus: $("jjj-plus"),
    badeuceyCards: $("badeucey-cards"),
    roomCodeDisplay: $("room-code-display"),
    copyInviteButton: $("copy-invite-button"),
    waitingTitle: $("waiting-title"),
    roster: $("roster"),
    roomConfig: $("room-config"),
    startButton: $("start-button"),
    roomError: $("room-error"),
    gameLabel: $("game-label"),
    turnLabel: $("turn-label"),
    tableRoomCode: $("table-room-code"),
    scoreStrip: $("score-strip"),
    opponents: $("opponents"),
    playerLabel: $("player-label"),
    placementCounter: $("placement-counter"),
    playerBoard: $("player-board"),
    drawArea: $("draw-area"),
    drawLabel: $("draw-label"),
    drawInstruction: $("draw-instruction"),
    drawCards: $("draw-cards"),
    discardTarget: $("discard-target"),
    discardCount: $("discard-count"),
    clearTurnButton: $("clear-turn-button"),
    confirmTurnButton: $("confirm-turn-button"),
    showdownPanel: $("showdown-panel"),
    showdownTitle: $("showdown-title"),
    showdownResults: $("showdown-results"),
    nextHandButton: $("next-hand-button"),
    rulesButton: $("rules-button"),
    rulesModal: $("rules-modal"),
    rulesTabs: $("rules-tabs"),
    rulesContent: $("rules-content"),
    ledgerButton: $("ledger-button"),
    ledgerModal: $("ledger-modal"),
    ledgerTotals: $("ledger-totals"),
    ledgerList: $("ledger-list"),
    copyLedgerButton: $("copy-ledger-button"),
    exportLedgerButton: $("export-ledger-button"),
    toast: $("toast"),
  };

  const room = new PeerRoom({
    namespace: "ofc-pineapple",
    maxPlayers: 3,
    storageKey: "ofc.play.session.v1",
  });

  let setupMode = "create";
  let model = null;
  let latestRoster = [];
  let selectedRuleVariant = "high";
  let selectedCard = null;
  let selectedTarget = "bottom";
  let turnAssignments = {};
  let turnDiscards = [];
  let draftKey = "";
  let toastTimer = 0;
  let publishingRoster = false;

  initialize();

  function initialize() {
    els.playerName.value = localStorage.getItem("ofc.play.name") || "";
    const codeFromHash = cleanCode(location.hash.slice(1));
    if (codeFromHash) {
      setupMode = "join";
      els.roomCode.value = codeFromHash;
    }
    bindEvents();
    bindRoom();
    renderSetupMode();
    renderVariantSettings();
    renderResume();
    renderRules(selectedRuleVariant);
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
    els.connectButton.addEventListener("click", connect);
    els.resumeButton.addEventListener("click", resume);
    els.leaveButton.addEventListener("click", leaveTable);
    els.startButton.addEventListener("click", () => room.sendAction({ type: "start_game" }));
    els.copyInviteButton.addEventListener("click", copyInvite);
    els.nextHandButton.addEventListener("click", () => room.sendAction({ type: "next_hand" }));
    els.clearTurnButton.addEventListener("click", resetDraft);
    els.confirmTurnButton.addEventListener("click", confirmTurn);
    els.discardTarget.addEventListener("click", () => selectTarget("discard"));
    els.playerBoard.addEventListener("click", handleBoardClick);
    els.drawCards.addEventListener("click", handleDrawClick);
    els.playerBoard.addEventListener("dragover", (event) => event.preventDefault());
    els.playerBoard.addEventListener("drop", handleBoardDrop);
    els.discardTarget.addEventListener("dragover", (event) => event.preventDefault());
    els.discardTarget.addEventListener("drop", (event) => {
      event.preventDefault();
      assignCard(event.dataTransfer.getData("text/plain"), "discard");
    });
    els.drawCards.addEventListener("dragstart", handleDragStart);
    els.playerBoard.addEventListener("dragstart", handleDragStart);
    els.rulesButton.addEventListener("click", () => {
      selectedRuleVariant = model?.settings?.variant || selectedVariant();
      renderRules(selectedRuleVariant);
      els.rulesModal.showModal();
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
    els.progressive.addEventListener("change", renderVariantSettings);
    window.addEventListener("beforeunload", () => persistHostState());
  }

  function bindRoom() {
    room.onStatus = (status, message) => {
      els.networkState.dataset.state = status;
      els.networkState.querySelector("span").textContent = status === "connected" ? "Connected" : status === "reconnecting" ? "Recovering" : "Offline";
      if (message) showToast(message);
    };
    room.onError = (error) => {
      showError(error.message);
      showToast(error.message);
    };
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
      if (event?.kind === "error" && (!event.target || event.target === room.clientId)) showToast(event.message);
    };
    room.onBecomeHost = (recoveredState) => {
      model = recoveredState || loadHostState(room.roomCode);
      if (!model) {
        model = { kind: "lobby", settings: readSettings(), players: latestRoster.map(copyPlayer) };
      }
      publishModel();
      showToast("Table recovered. You are the host.");
    };
  }

  async function connect() {
    clearErrors();
    const name = cleanName(els.playerName.value);
    localStorage.setItem("ofc.play.name", name);
    setConnectBusy(true);
    try {
      if (setupMode === "create") {
        const settings = readSettings();
        room.maxPlayers = settings.seats;
        await room.create(name);
        latestRoster = room.snapshot().players;
        model = { kind: "lobby", settings, players: latestRoster.map(copyPlayer) };
        history.replaceState(null, "", "#" + room.roomCode);
        publishModel();
      } else {
        room.maxPlayers = 3;
        await room.join(cleanCode(els.roomCode.value), name);
        history.replaceState(null, "", "#" + room.roomCode);
      }
      render();
    } catch (error) {
      showError(error.message);
    } finally {
      setConnectBusy(false);
    }
  }

  async function resume() {
    clearErrors();
    setConnectBusy(true);
    try {
      const session = room.savedSession();
      await room.resume();
      latestRoster = room.snapshot().players;
      if (room.isHost) {
        model = loadHostState(room.roomCode) || {
          kind: "lobby",
          settings: readSettings(),
          players: latestRoster.map(copyPlayer),
        };
        publishModel();
      }
      history.replaceState(null, "", "#" + room.roomCode);
      showToast("Saved table restored.");
    } catch (error) {
      showError(error.message);
    } finally {
      setConnectBusy(false);
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
        showToast(error.message);
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
    const connected = room.connected;
    els.leaveButton.hidden = !connected;
    if (!connected) {
      els.setupView.hidden = false;
      els.roomView.hidden = true;
      els.tableView.hidden = true;
      return;
    }
    if (!model || model.kind === "lobby") {
      renderRoomLobby();
      return;
    }
    renderGame();
  }

  function renderSetupMode() {
    const joining = setupMode === "join";
    els.modeCreate.classList.toggle("active", !joining);
    els.modeJoin.classList.toggle("active", joining);
    els.joinFields.hidden = !joining;
    els.connectButton.textContent = joining ? "Join table" : "Create table";
  }

  function renderVariantSettings() {
    const variant = selectedVariant();
    const config = Core.VARIANTS[variant];
    els.variantNote.textContent = config.short;
    els.seatSummary.textContent = readRadio("seats") === "3" ? "3-way" : "Heads-up";
    const high = variant === "high";
    els.progressiveRow.hidden = !high;
    els.ultimateRow.hidden = !high || !els.progressive.checked;
    els.jjjRow.hidden = !["low", "badeucey", "cribbage"].includes(variant);
    els.badeuceyRow.hidden = variant !== "badeucey";
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
    els.roster.innerHTML = Array.from({ length: settings.seats }, (_, seat) => {
      const player = roster[seat];
      if (!player) {
        return '<div class="roster-player empty"><span class="roster-avatar">' + (seat + 1) + '</span><strong>Open seat</strong></div>';
      }
      return '<div class="roster-player"><span class="roster-avatar">' + initials(player.name) + '</span><strong>' + escapeHtml(player.name) + '</strong><small>' + (player.host ? "Host" : player.connected === false ? "Reconnecting" : "Ready") + '</small></div>';
    }).join("");
    els.roomConfig.innerHTML = settingSummary(settings).map((item) => '<span class="config-chip">' + escapeHtml(item) + '</span>').join("");
    els.startButton.hidden = !room.isHost;
    els.startButton.disabled = roster.filter((player) => player.connected !== false).length !== settings.seats;
    els.roomError.textContent = "";
  }

  function renderGame() {
    els.setupView.hidden = true;
    els.roomView.hidden = true;
    els.tableView.hidden = false;
    const state = currentViewState();
    const me = state.players.find((player) => player.id === room.clientId);
    if (!me) {
      showError("This game is already seated.");
      return;
    }
    const variant = Core.VARIANTS[state.settings.variant];
    els.gameLabel.textContent = variant.label + " · Hand " + state.handNumber + (me.inFantasyland ? " · Fantasyland" : "");
    els.tableRoomCode.textContent = room.roomCode;
    els.turnLabel.textContent = turnText(state, me);
    els.scoreStrip.style.setProperty("--seat-count", state.players.length);
    els.scoreStrip.innerHTML = state.players.map((player) => {
      const active = state.activePlayerId === player.id;
      const button = state.players[state.buttonIndex]?.id === player.id;
      return '<div class="score-player' + (active ? " active" : "") + '"><span>' + escapeHtml(player.name) + (button ? " · BTN" : "") + '</span><strong>' + signed(player.score) + '</strong></div>';
    }).join("");

    const opponents = state.players.filter((player) => player.id !== room.clientId);
    els.opponents.style.setProperty("--opponent-count", Math.max(1, opponents.length));
    els.opponents.innerHTML = opponents.map(renderOpponent).join("");
    syncDraft(state, me);
    renderPlayerBoard(state, me);
    renderDraw(state, me);
    renderShowdown(state, me);
    if (state.phase === "showdown") persistLedger(state);
  }

  function renderOpponent(player) {
    const status = model.phase === "showdown"
      ? (player.evaluation?.legal ? player.evaluation.points + " royalties" : "Fouled")
      : player.hiddenFantasy ? "Setting Fantasyland" : model.activePlayerId === player.id ? "Setting now" : "Waiting";
    return '<section class="opponent-board"><div class="opponent-head"><strong>' + escapeHtml(player.name) + '</strong><span>' + escapeHtml(status) + '</span></div><div class="mini-board">' +
      ["top", "middle", "bottom"].map((row) => renderMiniRow(player, row)).join("") +
      '</div></section>';
  }

  function renderMiniRow(player, row) {
    const limit = Game.ROW_LIMITS[row];
    const cards = player.board[row] || [];
    const assignments = player.evaluation?.assignments || {};
    return '<div class="mini-row">' + Array.from({ length: limit }, (_, index) => cards[index]
      ? cardHtml(cards[index], { assignments, disabled: true })
      : '<span class="empty-slot"></span>').join("") + '</div>';
  }

  function syncDraft(state, me) {
    const key = [state.handNumber, state.actionIndex, me.draw.join(",")].join(":");
    if (key === draftKey) return;
    draftKey = key;
    turnAssignments = {};
    turnDiscards = [];
    selectedCard = null;
    selectedTarget = "bottom";
  }

  function renderPlayerBoard(state, me) {
    const action = currentAction(state);
    const myTurn = state.phase === "placement" && state.activePlayerId === me.id;
    const board = draftBoard(me);
    const provisional = boardIsComplete(board)
      ? Core.evaluateBoard(Object.values(board).flat(), board, evaluationOptions(state.settings))
      : null;
    const evaluation = state.phase === "showdown" ? me.evaluation : provisional;
    els.playerLabel.textContent = me.name + (me.inFantasyland ? " · Fantasyland" : "");
    const expected = myTurn ? expectedPlaced(action) : 0;
    els.placementCounter.textContent = state.phase === "showdown"
      ? (me.evaluation?.legal ? me.evaluation.points + " royalties" : "Fouled")
      : myTurn ? Object.keys(turnAssignments).length + " / " + expected + " set" : "Waiting";
    els.playerBoard.innerHTML = ["top", "middle", "bottom"].map((row) => {
      const cards = board[row];
      const rowEvaluation = evaluation?.rowEvals?.[row];
      const selected = selectedTarget === row && myTurn;
      return '<div class="board-row' + (selected ? " target" : "") + '" data-row="' + row + '"><div class="row-label"><strong>' + titleCase(row) + '</strong><small>' + cards.length + " / " + Game.ROW_LIMITS[row] + '</small></div><div class="board-cards">' +
        Array.from({ length: Game.ROW_LIMITS[row] }, (_, index) => {
          const cardId = cards[index];
          if (!cardId) return '<span class="empty-slot"></span>';
          return cardHtml(cardId, {
            assignments: evaluation?.assignments || {},
            staged: Object.prototype.hasOwnProperty.call(turnAssignments, cardId),
            origin: Object.prototype.hasOwnProperty.call(turnAssignments, cardId) ? "board" : "fixed",
          });
        }).join("") +
        '</div><div class="row-score">' + rowScoreHtml(rowEvaluation) + '</div></div>';
    }).join("");
  }

  function renderDraw(state, me) {
    const action = currentAction(state);
    const myTurn = state.phase === "placement" && state.activePlayerId === me.id;
    els.drawArea.hidden = state.phase === "showdown";
    if (!myTurn) {
      els.drawLabel.textContent = "Waiting";
      els.drawInstruction.textContent = state.activePlayerId ? playerName(state.activePlayerId) + " is setting" : "";
      els.drawCards.innerHTML = "";
      els.discardTarget.hidden = true;
      els.confirmTurnButton.disabled = true;
      els.clearTurnButton.disabled = true;
      return;
    }
    const expected = expectedPlaced(action);
    const expectedDiscards = me.draw.length - expected;
    const unassigned = me.draw.filter((card) => !turnAssignments[card] && !turnDiscards.includes(card));
    els.drawLabel.textContent = action.kind === "fantasy" ? "Fantasyland hand" : action.round === 0 ? "Opening five" : "Draw " + action.round;
    els.drawInstruction.textContent = expectedDiscards ? "Set " + expected + " · discard " + expectedDiscards : "Set all " + expected;
    const displayCards = unassigned.concat(turnDiscards);
    const columns = Math.max(1, displayCards.length);
    els.drawCards.style.setProperty("--draw-columns", columns);
    els.drawCards.style.setProperty("--mobile-columns", Math.max(1, Math.ceil(columns / 2)));
    els.drawCards.innerHTML = displayCards.map((cardId) => cardHtml(cardId, {
      selected: selectedCard === cardId,
      origin: turnDiscards.includes(cardId) ? "discard" : "hand",
    })).join("");
    els.discardTarget.hidden = expectedDiscards === 0;
    els.discardTarget.classList.toggle("active", selectedTarget === "discard");
    els.discardTarget.innerHTML = '<span>Discard</span><small>' + turnDiscards.length + " / " + expectedDiscards + '</small>';
    els.clearTurnButton.disabled = Object.keys(turnAssignments).length === 0 && turnDiscards.length === 0;
    els.confirmTurnButton.disabled = !draftReady(action, me);
  }

  function renderShowdown(state, me) {
    const showdown = state.phase === "showdown";
    els.showdownPanel.hidden = !showdown;
    if (!showdown) return;
    const delta = Number(state.handResult?.deltas?.[me.id] || 0);
    els.showdownTitle.textContent = delta > 0 ? "Won " + delta + " points" : delta < 0 ? "Lost " + Math.abs(delta) + " points" : "Push";
    els.showdownResults.innerHTML = state.players.map((player) => {
      const points = Number(state.handResult?.deltas?.[player.id] || 0);
      const result = player.evaluation?.legal ? player.evaluation.points + " royalties" : "Foul";
      return '<div class="showdown-result"><span>' + escapeHtml(player.name) + " · " + escapeHtml(result) + '</span><strong class="' + (points > 0 ? "delta-positive" : points < 0 ? "delta-negative" : "") + '">' + signed(points) + '</strong></div>';
    }).join("");
    els.nextHandButton.hidden = !room.isHost;
  }

  function handleDrawClick(event) {
    const card = event.target.closest("[data-card-id]");
    if (!card) return;
    const cardId = card.dataset.cardId;
    if (card.dataset.origin === "discard") {
      turnDiscards = turnDiscards.filter((id) => id !== cardId);
      selectedCard = cardId;
      renderGame();
      return;
    }
    if (selectedTarget) {
      assignCard(cardId, selectedTarget);
    } else {
      selectedCard = selectedCard === cardId ? null : cardId;
      renderGame();
    }
  }

  function handleBoardClick(event) {
    const card = event.target.closest("[data-card-id]");
    if (card?.dataset.origin === "board") {
      const cardId = card.dataset.cardId;
      delete turnAssignments[cardId];
      selectedCard = cardId;
      renderGame();
      return;
    }
    const row = event.target.closest("[data-row]")?.dataset.row;
    if (!row) return;
    if (selectedCard) assignCard(selectedCard, row);
    else selectTarget(row);
  }

  function handleDragStart(event) {
    const card = event.target.closest("[data-card-id]");
    if (!card || card.dataset.origin === "fixed") {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", card.dataset.cardId);
  }

  function handleBoardDrop(event) {
    event.preventDefault();
    const row = event.target.closest("[data-row]")?.dataset.row;
    if (row) assignCard(event.dataTransfer.getData("text/plain"), row);
  }

  function selectTarget(target) {
    selectedTarget = target;
    if (selectedCard) assignCard(selectedCard, target);
    else renderGame();
  }

  function assignCard(cardId, target) {
    const me = model?.players?.find((player) => player.id === room.clientId);
    if (!me || model.activePlayerId !== me.id || !me.draw.includes(cardId)) return;
    delete turnAssignments[cardId];
    turnDiscards = turnDiscards.filter((id) => id !== cardId);
    if (target === "discard") {
      const allowed = me.draw.length - expectedPlaced(currentAction(model));
      if (turnDiscards.length >= allowed) return showToast("The discard is full.");
      turnDiscards.push(cardId);
    } else {
      const board = draftBoard(me);
      if (board[target].length >= Game.ROW_LIMITS[target]) return showToast(titleCase(target) + " is full.");
      turnAssignments[cardId] = target;
    }
    selectedCard = null;
    selectedTarget = target;
    renderGame();
  }

  function resetDraft() {
    turnAssignments = {};
    turnDiscards = [];
    selectedCard = null;
    selectedTarget = "bottom";
    renderGame();
  }

  function confirmTurn() {
    const me = model.players.find((player) => player.id === room.clientId);
    const action = currentAction(model);
    if (!draftReady(action, me)) return;
    const placements = me.draw.filter((cardId) => turnAssignments[cardId]).map((cardId) => ({
      cardId,
      row: turnAssignments[cardId],
    }));
    room.sendAction({ type: "place", payload: { placements, discards: turnDiscards.slice() } });
  }

  function openLedger() {
    if (!model || model.kind !== "game") return;
    els.ledgerTotals.innerHTML = model.players.map((player) => '<div class="ledger-total"><span>' + escapeHtml(player.name) + '</span><strong>' + signed(player.score) + '</strong></div>').join("");
    els.ledgerList.innerHTML = model.ledger.length ? model.ledger.slice().reverse().map((hand) => {
      const deltas = model.players.map((player) => '<span class="' + (hand.deltas[player.id] > 0 ? "delta-positive" : hand.deltas[player.id] < 0 ? "delta-negative" : "") + '">' + escapeHtml(player.name) + " " + signed(hand.deltas[player.id] || 0) + '</span>').join("");
      return '<div class="ledger-hand"><span>Hand ' + hand.handNumber + '</span><div class="ledger-deltas">' + deltas + '</div></div>';
    }).join("") : '<p class="rule-intro">No completed hands yet.</p>';
    els.ledgerModal.showModal();
  }

  async function copyLedger() {
    if (!model || model.kind !== "game") return;
    await copyText(Game.ledgerText(model));
    showToast("Ledger copied.");
  }

  function exportLedger() {
    if (!model || model.kind !== "game") return;
    const blob = new Blob([JSON.stringify(Game.exportLedger(model), null, 2)], { type: "application/json" });
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
    const active = Core.ACTIVE_VARIANT_ORDER;
    const rule = Core.RULE_SECTIONS.find((entry) => entry.id === variant) || Core.RULE_SECTIONS[0];
    els.rulesTabs.innerHTML = active.map((id) => '<button type="button" data-rule-variant="' + id + '" class="' + (id === rule.id ? "active" : "") + '">' + escapeHtml(Core.VARIANTS[id].label) + '</button>').join("");
    els.rulesTabs.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        selectedRuleVariant = button.dataset.ruleVariant;
        if (!room.connected) {
          const radio = document.querySelector("input[name='variant'][value='" + selectedRuleVariant + "']");
          if (radio) {
            radio.checked = true;
            renderVariantSettings();
          }
        }
        renderRules(selectedRuleVariant);
      });
    });
    const sections = [];
    sections.push(ruleSection("Natural OFC", listHtml(rule.natural || [])));
    sections.push(ruleSection("Fantasyland board", "<p>" + escapeHtml(rule.qualification || "") + "</p>"));
    sections.push(ruleSection("Royalties", '<div class="royalty-groups">' + (rule.scoring || []).map((group) => '<div class="royalty-group"><h4>' + escapeHtml(group.label) + '</h4>' + listHtml(group.items) + '</div>').join("") + "</div>"));
    if (rule.fantasy) sections.push(ruleSection("Enter Fantasyland", "<p>" + escapeHtml(rule.fantasy) + "</p>"));
    if (rule.repeat) sections.push(ruleSection("Repeat Fantasyland", "<p>" + escapeHtml(rule.repeat) + "</p>"));
    if (rule.stacking) sections.push(ruleSection("Stacking / Super", "<p>" + escapeHtml(rule.stacking) + "</p>"));
    if (rule.superFantasy) sections.push(ruleSection("Super Fantasyland", "<p>" + escapeHtml(rule.superFantasy) + "</p>"));
    els.rulesContent.innerHTML = '<p class="rule-intro">' + escapeHtml(Core.VARIANTS[rule.id].short) + "</p>" + sections.join("");
  }

  function ruleSection(label, content) {
    return '<section class="rule-section"><strong>' + escapeHtml(label) + "</strong><div>" + content + "</div></section>";
  }

  function listHtml(items) {
    return "<ul>" + items.map((item) => "<li>" + escapeHtml(item) + "</li>").join("") + "</ul>";
  }

  function readSettings() {
    return Game.normalizeSettings({
      seats: Number(readRadio("seats")),
      variant: selectedVariant(),
      jokers: readRadio("jokers") === "on",
      buttonRule: readRadio("buttonRule"),
      fantasyMode: readRadio("fantasyMode"),
      progressive: els.progressive.checked,
      ultimate: els.ultimate.checked,
      topRepeatJacksPlus: els.jjjPlus.checked,
      badeuceyFantasyCards: Number(els.badeuceyCards.value),
    });
  }

  function settingSummary(settings) {
    const values = [
      Core.VARIANTS[settings.variant].label,
      settings.seats === 3 ? "3-way" : "Heads-up",
      settings.jokers ? "2 jokers" : "No jokers",
      settings.buttonRule === "move" ? "Moving BTN" : "BTN holds in FL",
      settings.fantasyMode === "stack" ? "FL stacking" : "Super FL",
    ];
    if (settings.progressive) values.push(settings.ultimate ? "Progressive · ultimate" : "Progressive");
    if (settings.topRepeatJacksPlus) values.push("JJJ+ top repeat");
    if (settings.variant === "badeucey") values.push(settings.badeuceyFantasyCards + "-card FL");
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
    return Object.keys(turnAssignments).length === expected && turnDiscards.length === me.draw.length - expected;
  }

  function draftBoard(me) {
    const board = {
      top: me.board.top.slice(),
      middle: me.board.middle.slice(),
      bottom: me.board.bottom.slice(),
    };
    me.draw.forEach((cardId) => {
      const row = turnAssignments[cardId];
      if (row) board[row].push(cardId);
    });
    return board;
  }

  function boardIsComplete(board) {
    return Object.keys(Game.ROW_LIMITS).every((row) => board[row].length === Game.ROW_LIMITS[row]);
  }

  function evaluationOptions(settings) {
    const options = { variant: settings.variant };
    if (settings.topRepeatJacksPlus) options.topRepeatMinRank = 11;
    return options;
  }

  function rowScoreHtml(evaluation) {
    if (!evaluation) return "";
    const points = Number(evaluation.points || 0);
    const name = evaluation.name || "";
    return "<strong>" + escapeHtml(name) + "</strong><span>" + points + " pts</span>";
  }

  function cardHtml(cardId, options = {}) {
    if (cardId === "BACK") return '<span class="playing-card back" aria-label="Face-down card"></span>';
    const transformedId = options.assignments?.[cardId] || cardId;
    const originalJoker = /^JK[12]$/i.test(cardId);
    const card = Core.makeCard(transformedId);
    const suitSymbol = { s: "♠", h: "♥", d: "♦", c: "♣" }[card.suit] || "★";
    const rank = card.joker ? "JK" : RANK_LABEL[card.rank];
    const classes = ["playing-card", originalJoker || card.joker ? "joker" : "suit-" + card.suit];
    if (options.staged) classes.push("staged");
    if (options.selected) classes.push("selected");
    const attrs = options.disabled ? "" : ' data-card-id="' + escapeHtml(cardId) + '" data-origin="' + escapeHtml(options.origin || "hand") + '" draggable="true"';
    return '<button class="' + classes.join(" ") + '" type="button"' + attrs + ' aria-label="' + escapeHtml(cardLabel(cardId)) + '"><span class="card-suit">' + suitSymbol + '</span><span class="card-rank">' + rank + '</span>' + (originalJoker ? '<span class="card-jk">JK</span>' : "") + "</button>";
  }

  function cardLabel(cardId) {
    if (/^JK/.test(cardId)) return "Joker";
    const card = Core.makeCard(cardId);
    const suit = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" }[card.suit];
    return RANK_LABEL[card.rank] + " of " + suit;
  }

  function turnText(state, me) {
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

  function setConnectBusy(busy) {
    els.connectButton.disabled = busy;
    els.resumeButton.disabled = busy;
    if (busy) els.connectButton.textContent = "Connecting…";
    else renderSetupMode();
  }

  function showError(message) {
    if (!els.setupView.hidden) els.setupError.textContent = message;
    else els.roomError.textContent = message;
  }

  function clearErrors() {
    els.setupError.textContent = "";
    els.roomError.textContent = "";
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("show");
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600);
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const area = document.createElement("textarea");
    area.value = text;
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
    return String(value || "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
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
