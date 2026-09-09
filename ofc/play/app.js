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
    discardsButton: $("discards-button"),
    discardsModal: $("discards-modal"),
    discardsContent: $("discards-content"),
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
  let selectedTarget = "bottom";
  let turnAssignments = {};
  const previewCache = new Map();
  let dragController;
  let draftKey = "";
  let toastTimer = 0;
  let publishingRoster = false;

  initialize();

  function initialize() {
    dragController = new window.OFCCardDrag(els.tableView, { canDrag: canMoveCard, resolve: resolveDrop, drop: assignCard });
    els.dealerOptionsList.innerHTML = Game.VARIANTS.filter((id) => id !== "dealerschoice").map((id) =>
      '<label class="toggle-row"><span><strong>' + escapeHtml(Game.VARIANT_LABELS[id]) + '</strong></span><input type="checkbox" name="dealerChoice" value="' + id + '" checked /><i aria-hidden="true"></i></label>').join("");
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
    els.dealerVariantButtons.addEventListener("click", (event) => {
      const variant = event.target.closest("[data-choice]")?.dataset.choice;
      if (variant) room.sendAction({ type: "choose_variant", variant });
    });
    els.connectButton.addEventListener("click", connect);
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
    document.addEventListener("keydown", handleKeyboard);
    window.addEventListener("resize", () => { if (els.ledgerModal.open) drawLedgerCharts(); });
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
    document.querySelectorAll("input[name='variant']").forEach((input) => input.addEventListener("change", () => {
      document.querySelector("input[name='fantasyMode'][value='" + (["high", "progressive"].includes(selectedVariant()) ? "none" : "super") + "']").checked = true;
    }));
    els.dealerOptionsList.addEventListener("change", renderVariantSettings);
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
      room.maxPlayers = model.settings.seats;
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
        room.maxPlayers = model.settings.seats;
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
      if (action.type === "choose_variant") {
        if (model?.kind !== "game") throw new Error("No hand is active.");
        model = Game.chooseVariant(model, clientId, action.variant);
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
      return '<div class="score-player' + (active ? " active" : "") + '"><span>' + escapeHtml(player.name) + (button ? " · BTN" : "") + '</span><strong>' + signed(player.score) + '</strong></div>';
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
    els.discardsButton.textContent = "Discards" + (state.players.filter((p) => Game.ownerId(p) === room.clientId).reduce((sum, p) => sum + p.discards.length, 0) ? " · " + state.players.filter((p) => Game.ownerId(p) === room.clientId).reduce((sum, p) => sum + p.discards.length, 0) : "");
    if (state.phase === "showdown") persistLedger(state);
  }

  function renderOpponent(player) {
    const status = model.phase === "showdown"
      ? (player.evaluation?.legal ? player.evaluation.points + " royalties" : "Fouled")
      : player.hiddenFantasy ? "Setting Fantasyland" : model.activePlayerId === player.id ? "Setting now" : "Waiting";
    const name = player.name + (!player.extraHand && Game.ownerId(player) === room.clientId && model.settings.twoOnButton ? " · Hand 1" : "");
    const evaluation = Object.values(player.board).flat().includes("BACK") ? null : boardPreview(currentViewState(), player.board);
    return '<section class="opponent-board"><div class="opponent-head"><strong>' + escapeHtml(name) + '</strong><span>' + escapeHtml(status) + '</span></div><div class="mini-board">' +
      ["top", "middle", "bottom"].map((row) => renderMiniRow(player, row, evaluation)).join("") +
      '</div></section>';
  }

  function renderMiniRow(player, row, evaluation = player.evaluation) {
    const limit = Game.ROW_LIMITS[row];
    const cards = player.board[row] || [];
    const assignments = evaluation?.assignments || {};
    return '<div class="mini-row-group"><div class="mini-row">' + Array.from({ length: limit }, (_, index) => cards[index]
      ? cardHtml(cards[index], { assignments, disabled: true, set: player.placedAt?.[cards[index]], latest: player.placedAt?.[cards[index]] === player.lastSet })
      : '<span class="empty-slot"></span>').join("") + '</div><div class="mini-score">' + rowScoreHtml(evaluation?.rowEvals?.[row], row) + '</div></div>';
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
    els.playerLabel.textContent = me.name + (!me.extraHand && state.settings.twoOnButton && state.players[state.buttonIndex].id === me.id ? " · Hand 1" : "") + (me.inFantasyland ? " · Fantasyland" : "");
    els.placementCounter.textContent = state.phase === "showdown"
      ? (me.evaluation?.legal ? me.evaluation.points + " royalties" : "Fouled")
      : (evaluation.previewPoints || 0) + " royalties" + (evaluation.complete && !evaluation.legal ? " · Foul" : "");
    els.placementCounter.classList.toggle("foul-text", Boolean(evaluation.complete && !evaluation.legal));
    els.playerBoard.innerHTML = ["top", "middle", "bottom"].map((row) => {
      const cards = board[row];
      const rowEvaluation = evaluation?.rowEvals?.[row];
      const selected = selectedTarget === row && myTurn;
      return '<div class="board-row' + (selected ? " target" : "") + '" data-row="' + row + '" aria-label="' + titleCase(row) + (selected ? ", selected" : "") + '"><div class="row-label"><strong>' + titleCase(row) + '</strong>' + (selected ? '<kbd class="row-keys">↑ ↓</kbd>' : '') + '</div><div class="board-cards">' +
        Array.from({ length: Game.ROW_LIMITS[row] }, (_, index) => {
          const cardId = cards[index];
          if (!cardId) return '<span class="empty-slot"></span>';
          return cardHtml(cardId, {
            assignments: evaluation?.assignments || {},
            staged: Object.prototype.hasOwnProperty.call(turnAssignments, cardId),
            set: turnAssignments[cardId] ? (action?.round || 0) + 1 : me.placedAt?.[cardId],
            latest: turnAssignments[cardId] ? true : !Object.keys(turnAssignments).length && me.placedAt?.[cardId] === me.lastSet,
            origin: Object.prototype.hasOwnProperty.call(turnAssignments, cardId) ? "board" : "fixed",
          });
        }).join("") +
        '</div><div class="row-score">' + rowScoreHtml(rowEvaluation, row) + '</div></div>';
    }).join("");
  }

  function renderDraw(state, me) {
    const action = currentAction(state);
    const myTurn = state.phase === "placement" && state.activePlayerId === me.id;
    els.drawArea.hidden = state.phase === "showdown";
    if (!myTurn) {
      els.drawLabel.textContent = state.phase === "choose-variant" ? "Your opening five" : "Waiting";
      els.drawInstruction.textContent = state.phase === "choose-variant" ? "Waiting for the variant selection" : state.activePlayerId ? playerName(state.activePlayerId) + " is setting" : "";
      els.drawCards.style.setProperty("--draw-columns", 5);
      els.drawCards.style.setProperty("--mobile-columns", 5);
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
    els.drawCards.style.setProperty("--mobile-columns", columns <= 5 ? columns : Math.ceil(columns / 2));
    els.drawCards.innerHTML = displayCards.map((cardId, index) => '<div class="hand-slot" data-hand-id="' + cardId + '">' + (turnAssignments[cardId] ? '<span class="empty-slot" aria-label="Card ' + (index + 1) + ', placed"></span>' : cardHtml(cardId, {
      origin: "hand",
      shortcut: index + 1,
    })) + (index < 9 ? '<kbd class="hand-key" title="Press ' + (index + 1) + ' to place or recall">' + (index + 1) + '</kbd>' : '') + '</div>').join("");
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
      return '<div class="showdown-result"><span>' + escapeHtml(player.name) + " · " + escapeHtml(result) + '</span><strong class="' + (points > 0 ? "delta-positive" : points < 0 ? "delta-negative" : "") + '">' + signed(points) + '</strong></div>';
    }).join("");
    els.nextHandButton.hidden = !room.isHost;
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

  function openLedger() {
    if (!model || model.kind !== "game") return;
    const state = currentViewState();
    const owners = state.players.filter((p) => !p.extraHand);
    els.ledgerTotals.innerHTML = owners.map((player) => '<div class="ledger-total"><span>' + escapeHtml(player.name) + '</span><strong>' + signed(player.score) + '</strong></div>').join("");
    els.ledgerList.innerHTML = state.ledger.length ? state.ledger.slice().reverse().map((hand) => {
      const displayBoards = (hand.boards || []).map((p) => ({ ...p, evaluation: Object.keys(p.evaluation.rowEvals || {}).length === 3 ? p.evaluation : { ...boardPreview({ ...state, handVariant: hand.variant }, p.board), legal: p.evaluation.legal, points: p.evaluation.points } }));
      const deltas = owners.map((player) => '<span class="' + (hand.deltas[player.id] > 0 ? "delta-positive" : hand.deltas[player.id] < 0 ? "delta-negative" : "") + '">' + escapeHtml(player.name) + " " + signed(hand.deltas[player.id] || 0) + '</span>').join("");
      const boards = displayBoards.map((p) => '<section class="history-board"><header><strong>' + escapeHtml(p.name) + '</strong><span>' + (p.evaluation.legal ? p.evaluation.points + ' royalties' : 'Foul') + '</span></header>' + ["top", "middle", "bottom"].map((row) => '<div class="history-row"><span>' + titleCase(row) + '</span><div class="history-cards">' + p.board[row].map((id) => cardHtml(id, { disabled: true, assignments: p.evaluation.assignments, set: p.placedAt?.[id] })).join("") + '</div><div class="history-score">' + rowScoreHtml(p.evaluation.rowEvals?.[row], row) + '</div></div>').join("") + (Game.ownerId(p) === room.clientId && p.discards.length ? '<div class="history-discard"><span>Discards</span><div class="history-cards">' + p.discards.map((id) => cardHtml(id, { disabled: true })).join("") + '</div></div>' : '') + '</section>').join("");
      return '<details class="ledger-hand"><summary><span>Hand ' + hand.handNumber + '<small>' + escapeHtml(Game.VARIANT_LABELS[hand.variant] || hand.variant) + '</small></span><div class="ledger-deltas">' + deltas + '</div></summary><div class="history-boards">' + (boards || '<p>Board history was not recorded for this older hand.</p>') + '</div></details>';
    }).join("") : '<p class="rule-intro">No completed hands yet.</p>';
    els.ledgerModal.showModal();
    drawLedgerCharts();
  }

  function openDiscards() {
    const state = currentViewState();
    const mine = state.players.filter((p) => Game.ownerId(p) === room.clientId);
    els.discardsContent.innerHTML = mine.map((p) => '<section class="discard-history"><h3>' + escapeHtml(p.name) + '</h3>' + ((p.discardHistory || []).length ? p.discardHistory.map((entry) => '<div class="discard-history-row"><span>Set ' + entry.set + '</span><div class="history-cards">' + entry.cards.map((id) => cardHtml(id, { disabled: true, set: entry.set })).join("") + '</div></div>').join("") : p.discards.length ? '<div class="history-cards">' + p.discards.map((id) => cardHtml(id, { disabled: true })).join("") + '</div>' : '<p>No discards yet.</p>') + '</section>').join("");
    els.discardsModal.showModal();
  }

  function drawLedgerCharts() {
    const state = currentViewState();
    const colors = ["#53b7ff", "#f0b85d", "#db8feb"];
    const owners = state.players.filter((p) => !p.extraHand);
    $("ledger-legend").innerHTML = owners.map((p, i) => '<span><i style="background:' + colors[i] + '"></i>' + escapeHtml(p.name) + '</span>').join("");
    for (const [id, cumulative] of [["ledger-chart", true], ["hand-chart", false]]) {
      const canvas = $(id);
      const width = canvas.getBoundingClientRect().width;
      const height = 210;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      const ctx = canvas.getContext("2d");
      ctx.scale(ratio, ratio);
      const series = owners.map((p) => cumulative ? [0, ...state.ledger.map((h) => Number(h.totals?.[p.id]) || 0)] : state.ledger.map((h) => Number(h.deltas?.[p.id]) || 0));
      const values = series.flat();
      const rawLow = Math.min(0, ...values), rawHigh = Math.max(0, ...values);
      const step = Math.max(1, Math.ceil((rawHigh - rawLow) / 4));
      const lo = rawHigh === rawLow ? -2 : Math.floor(rawLow / step) * step;
      const hi = rawHigh === rawLow ? 2 : Math.ceil(rawHigh / step) * step;
      const left = 42, right = Math.max(left + 1, width - 16), top = 16, bottom = height - 28;
      const y = (value) => bottom - (value - lo) / (hi - lo) * (bottom - top);
      ctx.font = "11px system-ui";
      for (let value = lo; value <= hi; value += step) {
        ctx.strokeStyle = "#30373e"; ctx.beginPath(); ctx.moveTo(left, y(value)); ctx.lineTo(right, y(value)); ctx.stroke();
        ctx.fillStyle = "#a7b2be"; ctx.textAlign = "right"; ctx.fillText(String(Math.round(value)), left - 7, y(value) + 4);
      }
      ctx.textAlign = "center";
      if (!state.ledger.length) { ctx.fillStyle = "#a7b2be"; ctx.fillText("Scores appear after the first hand", (left + right) / 2, height / 2); continue; }
      const count = series[0].length;
      const x = (index) => left + (right - left) * (cumulative ? index / Math.max(1, count - 1) : (index + 0.5) / count);
      series.forEach((points, index) => {
        ctx.strokeStyle = colors[index]; ctx.fillStyle = colors[index]; ctx.lineWidth = 2.5;
        if (cumulative) {
          ctx.beginPath(); points.forEach((value, i) => i ? ctx.lineTo(x(i), y(value)) : ctx.moveTo(x(i), y(value))); ctx.stroke();
          points.forEach((value, i) => { ctx.beginPath(); ctx.arc(x(i), y(value), 3, 0, Math.PI * 2); ctx.fill(); });
        } else {
          const bar = Math.min(18, (right - left) / count / (owners.length + 1));
          points.forEach((value, i) => ctx.fillRect(x(i) + (index - owners.length / 2) * bar, Math.min(y(0), y(value)), Math.max(1, bar - 2), Math.max(1, Math.abs(y(value) - y(0)))));
        }
      });
      ctx.fillStyle = "#a7b2be";
      for (let i = 0; i < count; i++) if (count < 9 || i === 0 || i === count - 1 || i % Math.ceil(count / 6) === 0) ctx.fillText(cumulative && i === 0 ? "Start" : String(state.ledger[cumulative ? i - 1 : i]?.handNumber), x(i), height - 9);
      canvas.setAttribute("aria-label", (cumulative ? "Running score" : "Points per hand") + ": " + owners.map((p, i) => p.name + " " + series[i].join(", ")).join("; "));
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
    const active = Game.VARIANTS;
    const rule = Core.RULE_SECTIONS.find((entry) => entry.id === variant) || Core.RULE_SECTIONS[0];
    els.rulesTabs.innerHTML = active.map((id) => '<button type="button" data-rule-variant="' + id + '" class="' + (id === variant ? "active" : "") + '">' + escapeHtml(Game.VARIANT_LABELS[id]) + '</button>').join("");
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
    if (variant === "progressive") sections.push(ruleSection("Progressive", listHtml(["High scoring. Natural QQ earns 14 cards; KK 15; AA 16; trips 17.", "Ultimate on: repeats keep the current card count. Off: repeats start at 14 before any Super FL bonus."])));
    if (variant === "dealerschoice") {
      els.rulesContent.innerHTML = ruleSection("Dealer's Choice", listHtml(["All opening five-card sets are dealt before BTN chooses an enabled variant. No placements are allowed until the choice is made.", "The chosen variant applies to every board for that hand. Fantasyland hands receive their remaining cards after the choice.", "Only the first BTN hand's opening cards are visible when choosing in 2 on the BTN."])) + tableRules();
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
  }

  function tableRules() {
    return ruleSection("2 on the BTN", listHtml(["Two players, three boards. BTN sets hand 1 then hand 2 on each natural draw. Hand 2's draw is hidden until its turn.", "Both BTN boards score against the opponent, never against each other. The ledger combines both results for BTN.", "When BTN moves, the new BTN gets the extra board. Any Fantasyland earned on a player's extra board is saved until their next BTN turn."])) + ruleSection("Multiple Fantasylands", listHtml(["None: one Fantasyland, no extra cards for multiple triggers. High repeats receive 14 cards.", "Stack: each trigger earns another Fantasyland hand in the queue.", "Super: each additional trigger adds a card, capped at 17."]));
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
    if (settings.progressive) values.push(settings.ultimate ? "Progressive · ultimate" : "Progressive");
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

  function rowScoreHtml(evaluation, row) {
    if (!evaluation) return "";
    if (evaluation.badugi && evaluation.low && evaluation.qualifies) return evaluation.scoreComponents.map((part) => '<span class="split-score"><span class="rank-description">' + escapeHtml(part.label + (part.key === "badugi" ? " Badugi" : " Low")) + '</span><strong class="royalty-value' + (part.points ? ' scoring' : '') + '">' + (part.points || 0) + ' pts</strong></span>').join("");
    const points = Number(evaluation.points || 0);
    const categoryNames = ["High card", "Pair", "Two pair", "Trips", "Straight", "Flush", "Boat", "Quads", "Straight flush"];
    let name = evaluation.name || "";
    if (Number.isInteger(evaluation.category)) {
      name = categoryNames[evaluation.category] || name;
      if (evaluation.category === Core.CATEGORY.STRAIGHT_FLUSH && evaluation.mainRank === 14) name = "Royal flush";
      if (row === "top" && [Core.CATEGORY.PAIR, Core.CATEGORY.TRIPS].includes(evaluation.category)) name += " " + (RANK_LABEL[evaluation.mainRank] || "").repeat(evaluation.category === Core.CATEGORY.PAIR ? 2 : 3);
    }
    const foul = evaluation.qualifies === false && evaluation.complete !== false;
    return '<span class="rank-description' + (foul ? ' foul-text' : '') + '">' + escapeHtml(name) + (foul ? " · Foul" : "") + '</span><strong class="royalty-value' + (points ? ' scoring' : '') + '">' + points + ' pts</strong>';
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
    const attrs = options.disabled ? ' tabindex="-1"' : ' data-card-id="' + escapeHtml(cardId) + '" data-origin="' + escapeHtml(options.origin || "hand") + '" draggable="false"';
    const badge = options.set ? '<span class="set-badge' + (options.latest ? ' latest' : '') + '" title="Placed in set ' + options.set + '">' + options.set + '</span>' : '';
    return '<button class="' + classes.join(" ") + '" type="button"' + attrs + ' aria-label="' + escapeHtml(cardLabel(cardId) + (options.set ? ', set ' + options.set : '')) + '"><span class="card-suit">' + suitSymbol + '</span><span class="card-rank">' + rank + '</span>' + badge + (originalJoker ? '<span class="card-jk">JK</span>' : "") + "</button>";
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
