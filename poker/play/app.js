(function () {
  "use strict";

  const Catalog = window.MixedPokerCatalog;
  const Eval = window.MixedPokerEvaluator;
  const Engine = window.MixedPokerEngine;
  const PeerRoom = window.PeerRoom;
  if (!Catalog || !Eval || !Engine || !PeerRoom) return;

  const $ = (id) => document.getElementById(id);
  const els = {
    setupView: $("setup-view"),
    roomView: $("room-view"),
    gameView: $("game-view"),
    connection: $("connection"),
    leaveButton: $("leave-button"),
    createMode: $("create-mode"),
    joinMode: $("join-mode"),
    joinFields: $("join-fields"),
    playerName: $("player-name"),
    roomCode: $("room-code"),
    connectButton: $("connect-button"),
    resumeButton: $("resume-button"),
    setupError: $("setup-error"),
    seats: $("seats"),
    startingStack: $("starting-stack"),
    smallBlind: $("small-blind"),
    bigBlind: $("big-blind"),
    smallBet: $("small-bet"),
    bigBet: $("big-bet"),
    ante: $("ante"),
    bringIn: $("bring-in"),
    handsPerGame: $("hands-per-game"),
    raiseCap: $("raise-cap"),
    straddle: $("straddle"),
    bombEvery: $("bomb-every"),
    bombAnte: $("bomb-ante"),
    actionClock: $("action-clock"),
    quickMixes: $("quick-mixes"),
    rotation: $("rotation"),
    clearMix: $("clear-mix"),
    mixCount: $("mix-count"),
    mixCap: $("mix-cap"),
    catalogTabs: $("catalog-tabs"),
    gameCatalog: $("game-catalog"),
    roomCodeDisplay: $("room-code-display"),
    copyInvite: $("copy-invite"),
    waitingTitle: $("waiting-title"),
    roster: $("roster"),
    lobbyMix: $("lobby-mix"),
    startGame: $("start-game"),
    roomError: $("room-error"),
    gameKicker: $("game-kicker"),
    gameTitle: $("game-title"),
    gameRoomCode: $("game-room-code"),
    streetLabel: $("street-label"),
    potLabel: $("pot-label"),
    callLabel: $("call-label"),
    nextGameLabel: $("next-game-label"),
    seatsView: $("seats-view"),
    boards: $("boards"),
    tableMessage: $("table-message"),
    heroName: $("hero-name"),
    heroStatus: $("hero-status"),
    heroCards: $("hero-cards"),
    handEvaluation: $("hand-evaluation"),
    decisionPanel: $("decision-panel"),
    decisionKicker: $("decision-kicker"),
    decisionTitle: $("decision-title"),
    betControls: $("bet-controls"),
    amountControl: $("amount-control"),
    betAmount: $("bet-amount"),
    foldButton: $("fold-button"),
    passButton: $("pass-button"),
    raiseButton: $("raise-button"),
    drawControls: $("draw-controls"),
    drawHelp: $("draw-help"),
    drawButton: $("draw-button"),
    forceFoldButton: $("force-fold-button"),
    resultsPanel: $("results-panel"),
    resultTitle: $("result-title"),
    resultsList: $("results-list"),
    nextHandButton: $("next-hand-button"),
    guideButton: $("guide-button"),
    guideModal: $("guide-modal"),
    guideTabs: $("guide-tabs"),
    guideList: $("guide-list"),
    ledgerButton: $("ledger-button"),
    ledgerModal: $("ledger-modal"),
    ledgerStacks: $("ledger-stacks"),
    ledgerEntries: $("ledger-entries"),
    copyLedger: $("copy-ledger"),
    exportLedger: $("export-ledger"),
    toast: $("toast"),
  };

  const QUICK_MIXES = [
    { label: "8 Game", games: ["lhe", "o8", "razz", "stud", "stud8", "27-td", "plo4", "nlh"] },
    { label: "H.O.R.S.E.", games: ["lhe", "o8", "razz", "stud", "stud8"] },
    { label: "Big bet", games: ["nlh", "plo4", "plo5", "big-o", "pl-27-td", "nl-27-sd", "dramaha", "zombie"] },
    { label: "Draw mix", games: ["a5-td", "27-td", "5cd", "badugi", "badacey", "badeucy", "archie", "ari"] },
    { label: "All 30", games: Catalog.GAMES.map((game) => game.id) },
  ];

  const room = new PeerRoom({
    namespace: "mixed-poker",
    maxPlayers: 8,
    storageKey: "poker.room.session.v1",
  });

  let setupMode = "create";
  let activeFamily = "holdem";
  let selectedGames = loadSelectedGames();
  let model = null;
  let latestRoster = [];
  let selectedDiscards = new Set();
  let selectionKey = "";
  let betKey = "";
  let toastTimer = 0;
  let clockTimer = 0;
  let clockRenderTimer = 0;
  let publishingRoster = false;

  initialize();

  function initialize() {
    for (let seats = 2; seats <= 8; seats += 1) {
      els.seats.insertAdjacentHTML("beforeend", '<option value="' + seats + '"' + (seats === 6 ? " selected" : "") + ">" + seats + "</option>");
    }
    els.playerName.value = localStorage.getItem("poker.player.name") || "";
    const code = cleanCode(location.hash.slice(1));
    if (code) {
      setupMode = "join";
      els.roomCode.value = code;
    }
    bindEvents();
    bindRoom();
    renderSetupMode();
    renderMixBuilder();
    renderGuide(activeFamily);
    renderResume();
  }

  function bindEvents() {
    els.createMode.addEventListener("click", () => { setupMode = "create"; renderSetupMode(); });
    els.joinMode.addEventListener("click", () => { setupMode = "join"; renderSetupMode(); });
    els.roomCode.addEventListener("input", () => { els.roomCode.value = cleanCode(els.roomCode.value); });
    els.connectButton.addEventListener("click", connect);
    els.resumeButton.addEventListener("click", resume);
    els.leaveButton.addEventListener("click", leave);
    els.copyInvite.addEventListener("click", copyInvite);
    els.startGame.addEventListener("click", () => room.sendAction({ type: "start" }));
    els.nextHandButton.addEventListener("click", () => room.sendAction({ type: "next" }));
    els.forceFoldButton.addEventListener("click", () => room.sendAction({ type: "force_fold" }));
    els.clearMix.addEventListener("click", () => { selectedGames = []; saveSelectedGames(); renderMixBuilder(); });
    els.rotation.addEventListener("click", handleRotationClick);
    els.gameCatalog.addEventListener("click", handleCatalogClick);
    els.heroCards.addEventListener("click", handleCardSelection);
    els.foldButton.addEventListener("click", () => sendBetAction("fold"));
    els.passButton.addEventListener("click", () => sendBetAction(els.passButton.dataset.action));
    els.raiseButton.addEventListener("click", () => sendBetAction("raise"));
    els.drawButton.addEventListener("click", submitCardSelection);
    els.amountControl.addEventListener("click", handleBetPreset);
    els.guideButton.addEventListener("click", () => {
      activeFamily = model?.gameId ? Catalog.getGame(model.gameId).family : activeFamily;
      renderGuide(activeFamily);
      els.guideModal.showModal();
    });
    els.ledgerButton.addEventListener("click", openLedger);
    els.copyLedger.addEventListener("click", copyLedger);
    els.exportLedger.addEventListener("click", exportLedger);
    document.querySelectorAll("[data-close]").forEach((button) => {
      button.addEventListener("click", () => $(button.dataset.close).close());
    });
  }

  function bindRoom() {
    room.onStatus = (status, message) => {
      els.connection.dataset.state = status;
      els.connection.querySelector("span").textContent = status === "connected" ? "Connected" : status === "reconnecting" ? "Recovering" : "Offline";
      if (message) showToast(message);
    };
    room.onError = (error) => {
      showError(error.message);
      showToast(error.message);
    };
    room.onRoster = (roster) => {
      latestRoster = roster;
      if (room.isHost && model && !publishingRoster) {
        if (model.kind === "poker-lobby") {
          model.players = roster.map(copyRosterPlayer);
          publishingRoster = true;
          publishModel();
          publishingRoster = false;
        } else if (model.kind === "poker") {
          let changed = false;
          model.players.forEach((player) => {
            const record = roster.find((entry) => entry.id === player.id);
            const disconnected = !record || record.connected === false;
            if (player.disconnected !== disconnected) {
              player.disconnected = disconnected;
              changed = true;
            }
          });
          if (changed) publishModel();
        }
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
    room.onBecomeHost = (recovered) => {
      model = recovered || loadHostState(room.roomCode);
      if (!model) model = { kind: "poker-lobby", settings: readSettings(), players: latestRoster.map(copyRosterPlayer) };
      publishModel();
      showToast("Table recovered. You are the host.");
    };
  }

  async function connect() {
    clearErrors();
    if (setupMode === "create" && !selectedGames.length) return showError("Add at least one game to the rotation.");
    const name = cleanName(els.playerName.value);
    localStorage.setItem("poker.player.name", name);
    setBusy(true);
    try {
      if (setupMode === "create") {
        const settings = readSettings();
        room.maxPlayers = settings.seats;
        await room.create(name);
        latestRoster = room.snapshot().players;
        model = { kind: "poker-lobby", settings, players: latestRoster.map(copyRosterPlayer) };
        history.replaceState(null, "", "#" + room.roomCode);
        publishModel();
      } else {
        room.maxPlayers = 8;
        await room.join(cleanCode(els.roomCode.value), name);
        history.replaceState(null, "", "#" + room.roomCode);
      }
      render();
    } catch (error) {
      showError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function resume() {
    clearErrors();
    setBusy(true);
    try {
      await room.resume();
      latestRoster = room.snapshot().players;
      if (room.isHost) {
        model = loadHostState(room.roomCode) || { kind: "poker-lobby", settings: readSettings(), players: latestRoster.map(copyRosterPlayer) };
        publishModel();
      }
      history.replaceState(null, "", "#" + room.roomCode);
    } catch (error) {
      showError(error.message);
    } finally {
      setBusy(false);
    }
  }

  function leave() {
    room.leave();
    clearTimeout(clockTimer);
    clearInterval(clockRenderTimer);
    model = null;
    latestRoster = [];
    history.replaceState(null, "", location.pathname);
    render();
    renderResume();
  }

  function handleHostAction(clientId, action) {
    try {
      if (!action || typeof action !== "object") return;
      if (action.type === "start") {
        requireHost(clientId);
        const players = latestRoster.filter((player) => player.connected !== false);
        if (players.length !== model.settings.seats) throw new Error("Fill every seat before dealing.");
        model = Engine.createTable(players, model.settings, room.roomCode + "-" + Date.now());
        model = Engine.startHand(model);
        publishModel();
      } else if (action.type === "bet") {
        model = Engine.act(model, clientId, action.action);
        publishModel();
      } else if (action.type === "draw") {
        model = Engine.submitDraw(model, clientId, action.cards);
        publishModel();
      } else if (action.type === "super_discard") {
        model = Engine.submitSuperDiscard(model, clientId, action.cards);
        publishModel();
      } else if (action.type === "next") {
        requireHost(clientId);
        model = Engine.startHand(model);
        publishModel();
      } else if (action.type === "force_fold") {
        requireHost(clientId);
        if (model.stage !== "betting") throw new Error("The current decision is not a betting action.");
        const active = model.players.find((player) => player.id === model.activePlayerId);
        if (!active?.disconnected) throw new Error("The active player is still connected.");
        model = Engine.act(model, active.id, { type: "fold" });
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

  function requireHost(clientId) {
    if (clientId !== room.clientId) throw new Error("Only the host can do that.");
  }

  function publishModel() {
    if (!room.isHost || !model) return;
    prepareActionClock();
    persistHostState();
    room.publishState(model, (state, clientId) => state.kind === "poker" ? Engine.filterStateForPlayer(state, clientId) : state);
    scheduleActionClock();
  }

  function prepareActionClock() {
    if (model.kind !== "poker") return;
    const seconds = Number(model.settings.actionClock || 0);
    const key = [model.handNumber, model.stage, model.street, model.activePlayerId].join(":");
    if (!seconds || !model.activePlayerId || model.phase === "showdown") {
      model.actionDeadline = null;
      model.actionClockKey = "";
    } else if (model.actionClockKey !== key) {
      model.actionClockKey = key;
      model.actionDeadline = Date.now() + seconds * 1000;
    }
  }

  function scheduleActionClock() {
    clearTimeout(clockTimer);
    if (!room.isHost || !model?.actionDeadline || !model.activePlayerId) return;
    clockTimer = setTimeout(runActionTimeout, Math.max(0, model.actionDeadline - Date.now()) + 30);
  }

  function runActionTimeout() {
    if (!room.isHost || !model?.activePlayerId || Date.now() < Number(model.actionDeadline || 0)) return scheduleActionClock();
    try {
      const playerId = model.activePlayerId;
      if (model.stage === "betting") {
        const legal = Engine.legalActions(model, playerId);
        model = Engine.act(model, playerId, { type: legal.canCheck ? "check" : "fold" });
      } else if (model.stage === "draw") {
        model = Engine.submitDraw(model, playerId, []);
      } else if (model.stage === "discard") {
        const player = model.players.find((entry) => entry.id === playerId);
        model = Engine.submitSuperDiscard(model, playerId, player.down.slice(0, 2));
      }
      publishModel();
    } catch (error) {
      showToast(error.message);
    }
  }

  function render() {
    const connected = room.connected;
    els.leaveButton.hidden = !connected;
    if (!connected) {
      els.setupView.hidden = false;
      els.roomView.hidden = true;
      els.gameView.hidden = true;
      stopClockRendering();
      return;
    }
    if (!model || model.kind === "poker-lobby") {
      renderRoom();
      stopClockRendering();
      return;
    }
    renderGame();
    startClockRendering();
  }

  function renderSetupMode() {
    const joining = setupMode === "join";
    els.createMode.classList.toggle("active", !joining);
    els.joinMode.classList.toggle("active", joining);
    els.joinFields.hidden = !joining;
    els.connectButton.textContent = joining ? "Join table" : "Create table";
  }

  function renderMixBuilder() {
    els.quickMixes.innerHTML = QUICK_MIXES.map((mix, index) => '<button type="button" data-quick="' + index + '">' + escapeHtml(mix.label) + "</button>").join("");
    els.quickMixes.querySelectorAll("[data-quick]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedGames = QUICK_MIXES[Number(button.dataset.quick)].games.slice();
        saveSelectedGames();
        renderMixBuilder();
      });
    });
    els.catalogTabs.innerHTML = Catalog.FAMILIES.map((family) => '<button type="button" data-family="' + family.id + '" class="' + (family.id === activeFamily ? "active" : "") + '">' + escapeHtml(family.label) + "</button>").join("");
    els.catalogTabs.querySelectorAll("[data-family]").forEach((button) => {
      button.addEventListener("click", () => {
        activeFamily = button.dataset.family;
        renderMixBuilder();
      });
    });
    const familyGames = Catalog.gamesByFamily(activeFamily);
    els.gameCatalog.innerHTML = familyGames.map((game) => '<button class="game-option' + (selectedGames.includes(game.id) ? " selected" : "") + '" type="button" data-game="' + game.id + '"><strong>' + escapeHtml(game.short) + "</strong><span>" + escapeHtml(game.name) + "</span></button>").join("");
    els.rotation.classList.toggle("empty", !selectedGames.length);
    els.rotation.innerHTML = selectedGames.map((id, index) => {
      const game = Catalog.getGame(id);
      return '<div class="rotation-item"><span>' + (index + 1) + " · " + escapeHtml(game.short) + '</span><button type="button" data-move="-1" data-index="' + index + '" aria-label="Move left">‹</button><button type="button" data-move="1" data-index="' + index + '" aria-label="Move right">›</button><button type="button" data-remove="' + index + '" aria-label="Remove">×</button></div>';
    }).join("");
    const cap = selectedGames.length ? Math.min(...selectedGames.map((id) => Catalog.getGame(id).maxPlayers)) : 8;
    els.mixCount.textContent = selectedGames.length + " game" + (selectedGames.length === 1 ? "" : "s");
    els.mixCap.textContent = cap + " seats max";
    Array.from(els.seats.options).forEach((option) => { option.disabled = Number(option.value) > cap; });
    if (Number(els.seats.value) > cap) els.seats.value = String(cap);
  }

  function handleRotationClick(event) {
    const remove = event.target.closest("[data-remove]");
    if (remove) {
      selectedGames.splice(Number(remove.dataset.remove), 1);
      saveSelectedGames();
      renderMixBuilder();
      return;
    }
    const move = event.target.closest("[data-move]");
    if (!move) return;
    const from = Number(move.dataset.index);
    const to = from + Number(move.dataset.move);
    if (to < 0 || to >= selectedGames.length) return;
    [selectedGames[from], selectedGames[to]] = [selectedGames[to], selectedGames[from]];
    saveSelectedGames();
    renderMixBuilder();
  }

  function handleCatalogClick(event) {
    const button = event.target.closest("[data-game]");
    if (!button) return;
    const id = button.dataset.game;
    const index = selectedGames.indexOf(id);
    if (index >= 0) selectedGames.splice(index, 1);
    else selectedGames.push(id);
    saveSelectedGames();
    renderMixBuilder();
  }

  function renderRoom() {
    els.setupView.hidden = true;
    els.roomView.hidden = false;
    els.gameView.hidden = true;
    const settings = model?.settings || readSettings();
    const roster = model?.players || latestRoster;
    els.roomCodeDisplay.textContent = room.roomCode;
    els.waitingTitle.textContent = roster.length >= settings.seats ? "Table ready" : "Waiting for players";
    els.roster.innerHTML = Array.from({ length: settings.seats }, (_, seat) => {
      const player = roster[seat];
      if (!player) return '<div class="roster-seat empty"><span class="avatar">' + (seat + 1) + '</span><strong>Open seat</strong></div>';
      return '<div class="roster-seat"><span class="avatar">' + initials(player.name) + '</span><strong>' + escapeHtml(player.name) + '</strong><small>' + (player.host ? "Host" : player.connected === false ? "Reconnecting" : "Ready") + "</small></div>";
    }).join("");
    els.lobbyMix.innerHTML = settings.games.map((id, index) => '<span class="mix-chip">' + (index + 1) + " · " + escapeHtml(Catalog.getGame(id).short) + "</span>").join("");
    els.startGame.hidden = !room.isHost;
    els.startGame.disabled = roster.filter((player) => player.connected !== false).length !== settings.seats;
    els.roomError.textContent = "";
  }

  function renderGame() {
    els.setupView.hidden = true;
    els.roomView.hidden = true;
    els.gameView.hidden = false;
    const state = currentViewState();
    const game = Catalog.getGame(state.gameId);
    const me = state.players.find((player) => player.id === room.clientId);
    if (!me) return showError("This table is already seated.");
    syncSelection(state, me);
    els.gameKicker.textContent = "Hand " + state.handNumber + " · Game " + (state.gameIndex + 1) + "/" + state.settings.games.length;
    els.gameTitle.textContent = game.name;
    els.gameRoomCode.textContent = room.roomCode;
    els.streetLabel.textContent = state.street || state.phase;
    els.potLabel.textContent = formatChips(Engine.potSize(state));
    const legal = Engine.legalActions(state, me.id);
    els.callLabel.textContent = legal ? formatChips(legal.toCall) : "—";
    els.nextGameLabel.textContent = nextGameText(state);
    renderSeats(state, me);
    renderBoards(state, game);
    renderHero(state, me, game);
    renderDecision(state, me, legal);
    renderResults(state, me);
    if (state.phase === "showdown") persistLedger(state);
  }

  function renderSeats(state, me) {
    const others = state.players.filter((player) => player.id !== me.id);
    els.seatsView.style.setProperty("--seat-columns", Math.max(1, others.length));
    els.seatsView.innerHTML = others.map((player) => {
      const active = state.activePlayerId === player.id;
      const badges = playerBadges(state, player).join(" · ");
      const cards = player.down.concat(player.up, player.hole);
      const status = player.disconnected ? "Disconnected" : player.folded ? "Folded" : player.allIn ? "All-in" : player.lastAction || badges;
      return '<article class="seat' + (active ? " active" : "") + (player.disconnected ? " disconnected" : "") + '"><div class="seat-head"><strong>' + escapeHtml(player.name) + '</strong><span>' + formatChips(player.stack) + '</span></div><div class="seat-meta"><span>' + escapeHtml(status) + '</span><span>' + formatChips(player.streetBet) + '</span></div><div class="seat-cards">' + cards.map((id) => cardHtml(id)).join("") + "</div></article>";
    }).join("");
  }

  function renderBoards(state, game) {
    const boards = state.boards.concat(state.zombieBoards);
    if (state.sharedStudCard) boards.push([state.sharedStudCard]);
    const expected = game.format === "ari" ? 1 : ["community", "dramaha", "zombie"].includes(game.format) ? 5 : state.sharedStudCard ? 1 : 0;
    if (!boards.some((board) => board.length) && !expected) {
      els.boards.innerHTML = "";
      els.tableMessage.textContent = game.format === "stud" || game.format === "super-stud" ? "Exposed cards are shown with each player" : "No community cards";
      return;
    }
    els.boards.innerHTML = boards.map((board, index) => {
      const slots = index >= state.boards.length ? 5 : expected || board.length;
      const label = boards.length > 1 ? (index >= state.boards.length ? "Zombie " + (index - state.boards.length + 1) : "Board " + (index + 1)) : "Board";
      return '<div class="board-line"><span>' + label + '</span><div class="board-cards">' + Array.from({ length: slots }, (_, cardIndex) => board[cardIndex] ? cardHtml(board[cardIndex]) : '<span class="card-slot"></span>').join("") + "</div></div>";
    }).join("");
    els.tableMessage.textContent = state.isBombPot ? "Bomb pot" : "";
  }

  function renderHero(state, me, game) {
    const cards = me.down.concat(me.up, me.hole);
    els.heroName.textContent = me.name;
    els.heroStatus.textContent = me.folded ? "Folded" : me.allIn ? "All-in" : state.activePlayerId === me.id ? "Your decision" : formatChips(me.stack) + " behind";
    els.heroCards.style.setProperty("--hero-count", Math.max(1, cards.length));
    const selectable = state.activePlayerId === me.id && ["draw", "discard"].includes(state.stage);
    els.heroCards.innerHTML = cards.map((id) => cardHtml(id, {
      selectable: selectable && (state.stage === "draw" ? me.hole.includes(id) : me.down.includes(id)),
      selected: selectedDiscards.has(id),
    })).join("");
    if (state.phase === "showdown" && !me.folded) {
      els.handEvaluation.innerHTML = me.evaluation.map((component) => '<span class="evaluation-chip">' + escapeHtml(component.label) + ' · <strong>' + escapeHtml(component.qualifies ? component.name : "No qualifier") + "</strong></span>").join("");
    } else {
      els.handEvaluation.innerHTML = '<span class="evaluation-chip">' + escapeHtml(game.short) + " · " + escapeHtml(game.summary) + "</span>";
    }
  }

  function renderDecision(state, me, legal) {
    const mine = state.activePlayerId === me.id;
    const active = state.players.find((player) => player.id === state.activePlayerId);
    const seconds = remainingSeconds(state);
    els.decisionKicker.textContent = state.stage === "draw" ? "Draw" : state.stage === "discard" ? "Discard" : "Action";
    els.decisionTitle.textContent = mine
      ? (state.stage === "draw" ? "Choose your discards" : state.stage === "discard" ? "Discard two down cards" : "Your action") + (seconds !== null ? " · " + seconds + "s" : "")
      : active ? active.name + " is acting" + (seconds !== null ? " · " + seconds + "s" : "") : "Waiting";
    els.betControls.hidden = !mine || state.stage !== "betting";
    els.drawControls.hidden = !mine || !["draw", "discard"].includes(state.stage);
    els.forceFoldButton.hidden = !(room.isHost && active?.disconnected && state.stage === "betting");
    if (mine && state.stage === "betting" && legal) renderBetControls(state, legal);
    if (mine && state.stage === "draw") {
      els.drawHelp.textContent = selectedDiscards.size ? selectedDiscards.size + " selected" : "Select cards to discard";
      els.drawButton.textContent = selectedDiscards.size ? "Draw " + selectedDiscards.size : "Pat";
      els.drawButton.disabled = false;
    }
    if (mine && state.stage === "discard") {
      els.drawHelp.textContent = selectedDiscards.size + " / 2 selected";
      els.drawButton.textContent = "Discard two";
      els.drawButton.disabled = selectedDiscards.size !== 2;
    }
  }

  function renderBetControls(state, legal) {
    els.foldButton.hidden = !legal.canFold;
    els.passButton.hidden = !legal.canCheck && !legal.canCall;
    els.passButton.dataset.action = legal.canCall ? "call" : "check";
    els.passButton.textContent = legal.canCall ? "Call " + formatChips(legal.toCall) : "Check";
    els.raiseButton.hidden = !legal.canRaise;
    els.raiseButton.textContent = state.currentBet ? "Raise" : "Bet";
    els.amountControl.hidden = !legal.canRaise || legal.structure === "limit";
    const key = [state.handNumber, state.street, state.activePlayerId, state.currentBet].join(":");
    if (key !== betKey) {
      betKey = key;
      els.betAmount.min = legal.minimumTarget;
      els.betAmount.max = legal.maximumTarget;
      els.betAmount.value = legal.minimumTarget;
    }
  }

  function handleBetPreset(event) {
    const button = event.target.closest("[data-bet-preset]");
    if (!button || !model) return;
    const state = currentViewState();
    const legal = Engine.legalActions(state, room.clientId);
    if (!legal) return;
    let amount = legal.minimumTarget;
    if (button.dataset.betPreset === "half") amount = state.currentBet + Math.floor((Engine.potSize(state) + legal.toCall) / 2);
    if (button.dataset.betPreset === "pot") amount = state.currentBet + Engine.potSize(state) + legal.toCall;
    if (button.dataset.betPreset === "max") amount = legal.maximumTarget;
    els.betAmount.value = Math.max(legal.minimumTarget, Math.min(legal.maximumTarget, amount));
  }

  function sendBetAction(type) {
    const action = { type };
    if (type === "raise") action.amount = Number(els.betAmount.value);
    room.sendAction({ type: "bet", action });
  }

  function handleCardSelection(event) {
    const card = event.target.closest("[data-card-id]");
    if (!card || !card.dataset.selectable) return;
    const id = card.dataset.cardId;
    if (selectedDiscards.has(id)) selectedDiscards.delete(id);
    else selectedDiscards.add(id);
    renderGame();
  }

  function submitCardSelection() {
    if (model.stage === "draw") room.sendAction({ type: "draw", cards: Array.from(selectedDiscards) });
    if (model.stage === "discard") room.sendAction({ type: "super_discard", cards: Array.from(selectedDiscards) });
  }

  function syncSelection(state, me) {
    const key = [state.handNumber, state.stage, state.street, state.activePlayerId, me.hole.join(","), me.down.join(",")].join(":");
    if (key === selectionKey) return;
    selectionKey = key;
    selectedDiscards = new Set();
  }

  function renderResults(state, me) {
    const showdown = state.phase === "showdown";
    els.resultsPanel.hidden = !showdown;
    if (!showdown) return;
    const myNet = Number(state.handResult?.net?.[me.id] || 0);
    els.resultTitle.textContent = state.handResult?.uncontestedWinnerId ? playerName(state.handResult.uncontestedWinnerId) + " won uncontested" : myNet > 0 ? "Won " + formatChips(myNet) : myNet < 0 ? "Lost " + formatChips(Math.abs(myNet)) : "Break even";
    els.resultsList.innerHTML = state.players.map((player) => {
      const net = Number(state.handResult?.net?.[player.id] || 0);
      const result = player.folded ? "Folded" : player.evaluation.map((entry) => entry.qualifies ? entry.label + ": " + entry.name : entry.label + ": no qualifier").join(" · ");
      return '<div class="result-row"><span>' + escapeHtml(player.name) + " · " + escapeHtml(result) + '</span><strong class="' + (net > 0 ? "positive" : net < 0 ? "negative" : "") + '">' + signed(net) + "</strong></div>";
    }).join("");
    els.nextHandButton.hidden = !room.isHost;
  }

  function renderGuide(familyId) {
    els.guideTabs.innerHTML = Catalog.FAMILIES.map((family) => '<button type="button" data-guide-family="' + family.id + '" class="' + (family.id === familyId ? "active" : "") + '">' + escapeHtml(family.label) + "</button>").join("");
    els.guideTabs.querySelectorAll("[data-guide-family]").forEach((button) => {
      button.addEventListener("click", () => {
        activeFamily = button.dataset.guideFamily;
        renderGuide(activeFamily);
      });
    });
    els.guideList.innerHTML = Catalog.gamesByFamily(familyId).map((game) => '<article class="guide-game"><h3>' + escapeHtml(game.short) + "<span>" + escapeHtml(structureLabel(game.structure)) + '</span></h3><p><strong>' + escapeHtml(game.name) + ".</strong> " + escapeHtml(game.summary) + "</p></article>").join("");
  }

  function openLedger() {
    if (!model || model.kind !== "poker") return;
    els.ledgerStacks.innerHTML = model.players.map((player) => '<div class="ledger-stack"><span>' + escapeHtml(player.name) + '</span><strong>' + formatChips(player.stack) + "</strong></div>").join("");
    els.ledgerEntries.innerHTML = model.ledger.length ? model.ledger.slice().reverse().map((entry) => {
      if (entry.adjustment) return '<div class="ledger-entry"><span>Adjustment</span><div>' + escapeHtml(entry.note) + " · " + signed(entry.amount) + "</div></div>";
      const game = Catalog.getGame(entry.gameId);
      const net = model.players.map((player) => '<span class="' + (entry.net[player.id] > 0 ? "positive" : entry.net[player.id] < 0 ? "negative" : "") + '">' + escapeHtml(player.name) + " " + signed(entry.net[player.id] || 0) + "</span>").join("");
      return '<div class="ledger-entry"><span>Hand ' + entry.handNumber + " · " + escapeHtml(game.short) + '</span><div class="ledger-net">' + net + "</div></div>";
    }).join("") : '<p class="error">No completed hands yet.</p>';
    els.ledgerModal.showModal();
  }

  async function copyLedger() {
    if (!model || model.kind !== "poker") return;
    await copyText(Engine.ledgerText(model));
    showToast("Ledger copied.");
  }

  function exportLedger() {
    if (!model || model.kind !== "poker") return;
    const blob = new Blob([JSON.stringify(Engine.exportLedger(model), null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "mixed-poker-" + room.roomCode.toLowerCase() + "-ledger.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 500);
  }

  async function copyInvite() {
    const url = location.origin + location.pathname + "#" + room.roomCode;
    await copyText("Join my mixed poker table: " + url + "\nRoom code: " + room.roomCode);
    showToast("Invite copied.");
  }

  function readSettings() {
    return Engine.normalizeSettings({
      seats: Number(els.seats.value),
      games: selectedGames,
      handsPerGame: els.handsPerGame.value,
      startingStack: Number(els.startingStack.value),
      smallBlind: Number(els.smallBlind.value),
      bigBlind: Number(els.bigBlind.value),
      ante: Number(els.ante.value),
      bringIn: Number(els.bringIn.value),
      smallBet: Number(els.smallBet.value),
      bigBet: Number(els.bigBet.value),
      raiseCap: Number(els.raiseCap.value),
      straddle: els.straddle.checked,
      bombEvery: Number(els.bombEvery.value),
      bombAnte: Number(els.bombAnte.value),
      actionClock: Number(els.actionClock.value),
    });
  }

  function nextGameText(state) {
    const remaining = state.settings.handsPerGame - state.gameHandCount;
    if (remaining > 0) return Catalog.getGame(state.gameId).short + " · " + remaining;
    const nextIndex = (state.gameIndex + 1) % state.settings.games.length;
    return Catalog.getGame(state.settings.games[nextIndex]).short;
  }

  function playerBadges(state, player) {
    const badges = [];
    if (state.players[state.buttonIndex]?.id === player.id) badges.push("BTN");
    if (state.smallBlindPlayerId === player.id) badges.push("SB");
    if (state.bigBlindPlayerId === player.id) badges.push("BB");
    if (state.straddlePlayerId === player.id) badges.push("STR");
    if (state.bringInPlayerId === player.id) badges.push("BI");
    return badges;
  }

  function cardHtml(id, options = {}) {
    if (id === "BACK") return '<span class="poker-card back" aria-label="Face-down card"></span>';
    const card = Eval.makeCard(id);
    const suit = { s: "♠", h: "♥", d: "♦", c: "♣" }[card.suit];
    const classes = "poker-card suit-" + card.suit + (options.selected ? " selected" : "");
    const attrs = options.selectable ? ' data-card-id="' + id + '" data-selectable="true"' : "";
    const tag = options.selectable ? "button" : "span";
    return "<" + tag + ' class="' + classes + '"' + attrs + (tag === "button" ? ' type="button"' : "") + '><span class="card-suit">' + suit + '</span><span class="card-rank">' + Eval.RANK_LABEL[card.rank] + "</span></" + tag + ">";
  }

  function currentViewState() {
    if (!model || !room.isHost || model.kind !== "poker") return model;
    return Engine.filterStateForPlayer(model, room.clientId);
  }

  function remainingSeconds(state) {
    if (!state.actionDeadline) return null;
    return Math.max(0, Math.ceil((state.actionDeadline - Date.now()) / 1000));
  }

  function startClockRendering() {
    if (clockRenderTimer) return;
    clockRenderTimer = setInterval(() => {
      if (model?.kind === "poker" && model.activePlayerId && model.actionDeadline) renderGame();
    }, 500);
  }

  function stopClockRendering() {
    clearInterval(clockRenderTimer);
    clockRenderTimer = 0;
  }

  function persistHostState() {
    if (!room.isHost || !room.roomCode || !model) return;
    localStorage.setItem("poker.host." + room.roomCode, JSON.stringify(model));
  }

  function loadHostState(code) {
    try {
      return JSON.parse(localStorage.getItem("poker.host." + code) || "null");
    } catch (_error) {
      return null;
    }
  }

  function persistLedger(state) {
    localStorage.setItem("poker.ledger." + room.roomCode, JSON.stringify(Engine.exportLedger(state)));
  }

  function loadSelectedGames() {
    try {
      const value = JSON.parse(localStorage.getItem("poker.selected.games") || "null");
      if (Array.isArray(value) && value.length && value.every((id) => Catalog.BY_ID[id])) return value;
    } catch (_error) {}
    return QUICK_MIXES[0].games.slice();
  }

  function saveSelectedGames() {
    localStorage.setItem("poker.selected.games", JSON.stringify(selectedGames));
  }

  function renderResume() {
    const saved = room.savedSession();
    els.resumeButton.hidden = !saved;
    if (saved) els.resumeButton.textContent = "Resume " + saved.roomCode;
  }

  function setBusy(busy) {
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
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2500);
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

  function copyRosterPlayer(player) {
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

  function playerName(id) {
    return currentViewState()?.players?.find((player) => player.id === id)?.name || "Player";
  }

  function structureLabel(value) {
    return value === "limit" ? "Fixed limit" : value === "pot-limit" ? "Pot limit" : "No limit";
  }

  function formatChips(value) {
    return Math.trunc(Number(value) || 0).toLocaleString();
  }

  function signed(value) {
    const number = Number(value) || 0;
    return number > 0 ? "+" + formatChips(number) : number < 0 ? "-" + formatChips(Math.abs(number)) : "0";
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
