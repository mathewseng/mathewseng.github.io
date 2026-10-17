(function () {
  "use strict";

  const Catalog = window.MixedPokerCatalog;
  const Eval = window.MixedPokerEvaluator;
  const Engine = window.MixedPokerEngine;
  const PeerRoom = window.PeerRoom;
  const Cards = window.PlayingCards;
  const Sheet = window.Sheet;
  const Tabs = window.Tabs;
  if (!Catalog || !Eval || !Engine || !PeerRoom || !Cards) return;

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
    rotationEmpty: $("rotation-empty"),
    clearMix: $("clear-mix"),
    mixCount: $("mix-count"),
    mixCap: $("mix-cap"),
    catalogTabs: $("catalog-tabs"),
    gameCatalog: $("game-catalog"),
    setupTabs: $("setup-tabs"),
    setupGrid: $("setup-grid"),
    rotationTab: $("rotation-tab"),
    roomCodeDisplay: $("room-code-display"),
    copyCode: $("copy-code"),
    copyInvite: $("copy-invite"),
    waitingTitle: $("waiting-title"),
    roomLede: $("room-lede"),
    roomBanner: $("room-banner"),
    roster: $("roster"),
    rosterCount: $("roster-count"),
    lobbyMix: $("lobby-mix"),
    lobbySettings: $("lobby-settings"),
    lobbyWait: $("lobby-wait"),
    startGame: $("start-game"),
    startHint: $("start-hint"),
    roomError: $("room-error"),
    gameKicker: $("game-kicker"),
    gameTitle: $("game-title"),
    gameRoomCode: $("game-room-code"),
    gameBanner: $("game-banner"),
    streetLabel: $("street-label"),
    potLabel: $("pot-label"),
    callLabel: $("call-label"),
    nextGameLabel: $("next-game-label"),
    feltStreet: $("felt-street"),
    feltPot: $("felt-pot"),
    seatsView: $("seats-view"),
    boards: $("boards"),
    tableMessage: $("table-message"),
    tableNotice: $("table-notice"),
    tableNoticeTitle: $("table-notice-title"),
    tableNoticeText: $("table-notice-text"),
    heroSeat: $("hero-seat"),
    heroAvatar: $("hero-avatar"),
    heroDealer: $("hero-dealer"),
    heroName: $("hero-name"),
    heroStatus: $("hero-status"),
    heroClock: $("hero-clock"),
    heroBet: $("hero-bet"),
    heroCards: $("hero-cards"),
    handEvaluation: $("hand-evaluation"),
    decisionPanel: $("decision-panel"),
    decisionKicker: $("decision-kicker"),
    decisionTitle: $("decision-title"),
    decisionClock: $("decision-clock"),
    gameError: $("game-error"),
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
    resultKicker: $("result-kicker"),
    resultTitle: $("result-title"),
    resultsList: $("results-list"),
    resultsWait: $("results-wait"),
    resultsHint: $("results-hint"),
    nextHandButton: $("next-hand-button"),
    addChips: $("add-chips"),
    addChipsToggle: $("add-chips-toggle"),
    addChipsPlayer: $("add-chips-player"),
    addChipsAmount: $("add-chips-amount"),
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
    alerts: $("alerts"),
  };

  const QUICK_MIXES = [
    { label: "8 Game", games: ["lhe", "o8", "razz", "stud", "stud8", "27-td", "plo4", "nlh"] },
    { label: "H.O.R.S.E.", games: ["lhe", "o8", "razz", "stud", "stud8"] },
    { label: "Big bet", games: ["nlh", "plo4", "plo5", "big-o", "pl-27-td", "nl-27-sd", "dramaha", "zombie"] },
    { label: "Draw mix", games: ["a5-td", "27-td", "5cd", "badugi", "badacey", "badeucy", "archie", "ari"] },
    { label: "All 30", games: Catalog.GAMES.map((game) => game.id) },
  ];

  const ICONS = "../../shared/icons.svg";
  const icon = (name) => '<svg class="icon" aria-hidden="true"><use href="' + ICONS + "#" + name + '" /></svg>';

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
  let clockTimer = 0;
  let clockRenderTimer = 0;
  let publishingRoster = false;
  let connectionState = "offline";
  let rotationFocus = null;
  let addChipsOpen = false;

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
    els.leaveButton.addEventListener("click", confirmLeave);
    els.copyInvite.addEventListener("click", copyInvite);
    if (els.copyCode) els.copyCode.addEventListener("click", copyCode);
    els.startGame.addEventListener("click", () => room.sendAction({ type: "start" }));
    els.nextHandButton.addEventListener("click", () => room.sendAction({ type: "next" }));
    els.forceFoldButton.addEventListener("click", () => room.sendAction({ type: "force_fold" }));
    if (els.addChips) els.addChips.addEventListener("submit", submitAddChips);
    if (els.addChipsToggle) {
      els.addChipsToggle.addEventListener("click", () => {
        addChipsOpen = !addChipsOpen;
        renderAddChips(currentViewState());
        if (addChipsOpen) els.addChipsPlayer.focus();
      });
    }
    els.clearMix.addEventListener("click", () => { selectedGames = []; saveSelectedGames(); renderMixBuilder(); });
    els.rotation.addEventListener("click", handleRotationClick);
    els.gameCatalog.addEventListener("click", handleCatalogClick);
    // Phone layout only: the three setup panels become tabs (shared/tabs.js
    // drives aria-selected, arrow keys and the underline; the grid's
    // data-setup-tab shows one panel at a time).
    if (Tabs) {
      Tabs.init(els.setupTabs, {
        onChange(id) {
          els.setupGrid.dataset.setupTab = id;
          els.setupTabs.querySelectorAll("[data-setup-tab]").forEach((tab) => tab.classList.toggle("active", tab.dataset.setupTab === id));
        },
      });
    } else {
      els.setupTabs.addEventListener("click", handleSetupTab);
    }
    els.heroCards.addEventListener("click", handleCardSelection);
    els.foldButton.addEventListener("click", () => sendBetAction("fold"));
    els.passButton.addEventListener("click", () => sendBetAction(els.passButton.dataset.action));
    els.raiseButton.addEventListener("click", () => sendBetAction("raise"));
    els.drawButton.addEventListener("click", submitCardSelection);
    els.amountControl.addEventListener("click", handleBetPreset);
    els.guideButton.addEventListener("click", () => {
      activeFamily = model?.gameId ? Catalog.getGame(model.gameId).family : activeFamily;
      renderGuide(activeFamily);
      openDialog(els.guideModal);
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
      connectionState = status === "connected" ? "connected" : status === "reconnecting" ? "reconnecting" : "offline";
      els.connection.dataset.state = connectionState;
      const label = connectionState === "connected" ? "Connected" : connectionState === "reconnecting" ? "Recovering" : "Offline";
      els.connection.querySelector("span").textContent = label;
      els.connection.title = label;
      renderBanners();
      if (message) showToast(message);
    };
    room.onError = (error) => showError(error.message);
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
      if (event?.kind === "error" && (!event.target || event.target === room.clientId)) showError(event.message);
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

  // Leave takes a confirm that says what happens to the room and the saved
  // session: PeerRoom.leave() closes the room for everyone when the host
  // leaves and removes the saved session on this device either way.
  async function confirmLeave() {
    const host = room.isHost;
    const inHand = model?.kind === "poker" && !["showdown", "between"].includes(model.phase);
    const text = host
      ? "Everyone is disconnected and the room closes. The saved session on this device is removed, so Resume will not bring it back; the hand ledger stays in this browser's storage."
      : (inHand ? "The hand is still running: your seat is marked disconnected and the host can force-fold it. " : "Your seat is released. ") +
        "The saved session on this device is removed; you can rejoin with the room code while the table is open.";
    const ok = Sheet
      ? await Sheet.confirm({ title: host ? "Close the table?" : "Leave the table?", text, verb: host ? "Close table" : "Leave", danger: true, sheet: true })
      : window.confirm(text);
    if (ok) leave();
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
      } else if (action.type === "adjust") {
        // Add-on between hands: the host tops up a busted (or any) stack through
        // the engine's existing adjustStack, which records it in the ledger.
        requireHost(clientId);
        model = Engine.adjustStack(model, String(action.playerId), action.amount, "Add-on");
        publishModel();
        showToast(playerName(action.playerId) + " +" + formatChips(action.amount) + " added to the ledger.");
      } else if (action.type === "force_fold") {
        requireHost(clientId);
        if (model.stage !== "betting") throw new Error("The current decision is not a betting action.");
        const active = model.players.find((player) => player.id === model.activePlayerId);
        if (!active?.disconnected) throw new Error("The active player is still connected.");
        model = Engine.act(model, active.id, { type: "fold" });
        publishModel();
      }
    } catch (error) {
      if (clientId === room.clientId) showError(error.message);
      else room.broadcastEvent({ kind: "error", target: clientId, message: error.message });
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
      showToast(error.message, { alert: true });
    }
  }

  // The sticky action stage's height is published as --stage-h so toasts
  // stack above it instead of covering the primary action.
  const stageObserver = typeof ResizeObserver === "function" ? new ResizeObserver(measureStage) : null;
  if (stageObserver) [els.decisionPanel, els.resultsPanel].forEach((stage) => stageObserver.observe(stage));

  function measureStage() {
    const stage = els.gameView.hidden ? null : [els.decisionPanel, els.resultsPanel].find((panel) => !panel.hidden);
    document.documentElement.style.setProperty("--stage-h", (stage ? stage.offsetHeight : 0) + "px");
  }

  function render() {
    const connected = room.connected || connectionState === "reconnecting";
    els.leaveButton.hidden = !connected;
    if (!connected) {
      els.setupView.hidden = false;
      els.roomView.hidden = true;
      els.gameView.hidden = true;
      stopClockRendering();
      measureStage();
      return;
    }
    if (!model || model.kind === "poker-lobby") {
      renderRoom();
      stopClockRendering();
      measureStage();
      return;
    }
    renderGame();
    startClockRendering();
    renderBanners();
    measureStage();
  }

  function renderSetupMode() {
    const joining = setupMode === "join";
    els.createMode.classList.toggle("active", !joining);
    els.joinMode.classList.toggle("active", joining);
    els.createMode.setAttribute("aria-pressed", String(!joining));
    els.joinMode.setAttribute("aria-pressed", String(joining));
    els.joinFields.hidden = !joining;
    els.connectButton.textContent = joining ? "Join table" : "Create table";
  }

  function renderMixBuilder() {
    els.quickMixes.innerHTML = QUICK_MIXES.map((mix, index) => '<button class="btn btn--sm" type="button" data-quick="' + index + '">' + escapeHtml(mix.label) + "</button>").join("");
    els.quickMixes.querySelectorAll("[data-quick]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedGames = QUICK_MIXES[Number(button.dataset.quick)].games.slice();
        saveSelectedGames();
        renderMixBuilder();
      });
    });
    els.catalogTabs.innerHTML = Catalog.FAMILIES.map((family) => '<button type="button" data-family="' + family.id + '" class="' + (family.id === activeFamily ? "active" : "") + '" aria-pressed="' + (family.id === activeFamily) + '">' + escapeHtml(family.label) + "</button>").join("");
    els.catalogTabs.querySelectorAll("[data-family]").forEach((button) => {
      button.addEventListener("click", () => {
        activeFamily = button.dataset.family;
        renderMixBuilder();
        els.catalogTabs.querySelector('[data-family="' + activeFamily + '"]')?.focus();
      });
    });
    const familyGames = Catalog.gamesByFamily(activeFamily);
    els.gameCatalog.innerHTML = familyGames.map((game) => '<button class="game-option' + (selectedGames.includes(game.id) ? " selected" : "") + '" type="button" data-game="' + game.id + '" aria-pressed="' + selectedGames.includes(game.id) + '"><strong>' + escapeHtml(game.short) + "</strong><span>" + escapeHtml(game.name) + "</span></button>").join("");
    els.rotation.classList.toggle("empty", !selectedGames.length);
    if (els.rotationEmpty) els.rotationEmpty.hidden = Boolean(selectedGames.length);
    els.rotation.innerHTML = selectedGames.map((id, index) => {
      const game = Catalog.getGame(id);
      const label = escapeHtml(game.short);
      return '<div class="rotation-item"><span>' + (index + 1) + " · " + label + '</span>' +
        '<button class="btn btn--ghost btn--icon btn--sm" type="button" data-move="-1" data-index="' + index + '" aria-label="Move ' + label + ' earlier"' + (index === 0 ? " disabled" : "") + ">" + icon("i-chevron-left") + "</button>" +
        '<button class="btn btn--ghost btn--icon btn--sm" type="button" data-move="1" data-index="' + index + '" aria-label="Move ' + label + ' later"' + (index === selectedGames.length - 1 ? " disabled" : "") + ">" + icon("i-chevron-right") + "</button>" +
        '<button class="btn btn--ghost btn--icon btn--sm" type="button" data-remove="' + index + '" aria-label="Remove ' + label + '">' + icon("i-close") + "</button></div>";
    }).join("");
    if (rotationFocus) {
      const target = els.rotation.querySelector(rotationFocus.remove ? '[data-remove="' + rotationFocus.index + '"]' : '[data-move="' + rotationFocus.move + '"][data-index="' + rotationFocus.index + '"]');
      (target && !target.disabled ? target : els.rotation.querySelector("button:not(:disabled)") || els.clearMix).focus();
      rotationFocus = null;
    }
    const cap = selectedGames.length ? Math.min(...selectedGames.map((id) => Catalog.getGame(id).maxPlayers)) : 8;
    els.mixCount.textContent = selectedGames.length + " game" + (selectedGames.length === 1 ? "" : "s");
    els.rotationTab.textContent = "Rotation · " + selectedGames.length;
    els.mixCap.textContent = cap + " seats max";
    Array.from(els.seats.options).forEach((option) => { option.disabled = Number(option.value) > cap; });
    if (Number(els.seats.value) > cap) els.seats.value = String(cap);
  }

  function handleRotationClick(event) {
    const remove = event.target.closest("[data-remove]");
    if (remove) {
      const index = Number(remove.dataset.remove);
      selectedGames.splice(index, 1);
      rotationFocus = { remove: true, index: Math.min(index, selectedGames.length - 1) };
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
    rotationFocus = { move: move.dataset.move, index: to };
    saveSelectedGames();
    renderMixBuilder();
  }

  // Fallback when shared/tabs.js is unavailable.
  function handleSetupTab(event) {
    const button = event.target.closest("[data-setup-tab]");
    if (!button) return;
    els.setupGrid.dataset.setupTab = button.dataset.setupTab;
    els.setupTabs.querySelectorAll("[data-setup-tab]").forEach((tab) => {
      tab.classList.toggle("active", tab === button);
      tab.setAttribute("aria-selected", String(tab === button));
    });
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
    els.gameCatalog.querySelector('[data-game="' + id + '"]')?.focus();
  }

  function renderRoom() {
    els.setupView.hidden = true;
    els.roomView.hidden = false;
    els.gameView.hidden = true;
    const settings = model?.settings || readSettings();
    const roster = model?.players || latestRoster;
    const host = roster.find((player) => player.host) || latestRoster.find((player) => player.host);
    const ready = roster.filter((player) => player.connected !== false).length;
    const full = roster.length >= settings.seats;
    els.roomCodeDisplay.textContent = room.roomCode;
    els.waitingTitle.textContent = full ? "Table ready" : "Waiting for players";
    if (els.roomLede) {
      els.roomLede.textContent = room.isHost
        ? "Share the code or the invite link. Deal once every seat is filled."
        : (host ? String(host.name ?? "") : "The host") + " deals the first hand once every seat is filled. Keep this page open.";
    }
    if (els.rosterCount) els.rosterCount.textContent = roster.length + " of " + settings.seats + " seats";
    els.roster.innerHTML = Array.from({ length: settings.seats }, (_, seat) => {
      const player = roster[seat];
      if (!player) return '<div class="seat seat--lobby seat--empty roster-seat empty"><span class="avatar seat-avatar">' + (seat + 1) + '</span><span class="seat-head seat-name"><strong>Open seat</strong></span><span class="seat-meta"><small class="seat-badge">Waiting</small></span></div>';
      const me = player.id === room.clientId;
      const status = player.host ? "Host" : player.connected === false ? "Reconnecting" : "Ready";
      const tone = player.connected === false ? " seat-badge--warn" : player.host ? " seat-badge--accent" : " seat-badge--good";
      return '<div class="seat seat--lobby roster-seat' + (player.host ? " seat--host" : "") + (me ? " seat--me" : "") + (player.connected === false ? " seat--disconnected" : "") + '"><span class="avatar seat-avatar">' + initials(player.name) + '</span><span class="seat-head seat-name"><strong>' + escapeHtml(player.name) + "</strong>" + (me ? '<span class="seat-badge">You</span>' : "") + '</span><span class="seat-meta"><small class="seat-badge' + tone + '">' + status + "</small></span></div>";
    }).join("");
    els.lobbyMix.innerHTML = settings.games.map((id, index) => '<span class="mix-chip chip">' + (index + 1) + " · " + escapeHtml(Catalog.getGame(id).short) + "</span>").join("");
    if (els.lobbySettings) {
      const facts = [
        settings.seats + " seats",
        "Stack " + formatChips(settings.startingStack),
        "Blinds " + formatChips(settings.smallBlind) + "/" + formatChips(settings.bigBlind),
        "Bets " + formatChips(settings.smallBet) + "/" + formatChips(settings.bigBet),
        "Ante " + formatChips(settings.ante) + " · bring-in " + formatChips(settings.bringIn),
        "Change every " + settings.handsPerGame + " hand" + (settings.handsPerGame === 1 ? "" : "s"),
        "Raise cap " + settings.raiseCap,
      ];
      if (settings.straddle) facts.push("Live straddle");
      if (settings.bombEvery) facts.push("Bomb pot every " + settings.bombEvery + " · ante " + formatChips(settings.bombAnte));
      if (settings.actionClock) facts.push("Clock " + settings.actionClock + "s");
      els.lobbySettings.innerHTML = facts.map((fact) => '<span class="chip">' + escapeHtml(fact) + "</span>").join("");
    }
    els.startGame.hidden = !room.isHost;
    els.startGame.disabled = ready !== settings.seats;
    if (els.lobbyWait) els.lobbyWait.hidden = room.isHost;
    if (els.startHint) {
      els.startHint.textContent = !room.isHost ? "" : ready === settings.seats ? "Every seat is filled and connected." : full ? "Waiting for a reconnecting player." : (settings.seats - roster.length) + " more player" + (settings.seats - roster.length === 1 ? "" : "s") + " to go.";
    }
    els.roomError.textContent = "";
  }

  function renderGame() {
    els.setupView.hidden = true;
    els.roomView.hidden = true;
    els.gameView.hidden = false;
    const state = currentViewState();
    const game = Catalog.getGame(state.gameId);
    const me = state.players.find((player) => player.id === room.clientId);
    syncSelection(state, me);
    els.gameKicker.textContent = "Hand " + state.handNumber + " · Game " + (state.gameIndex + 1) + "/" + state.settings.games.length;
    els.gameTitle.textContent = game.name;
    els.gameRoomCode.textContent = room.roomCode;
    const street = streetLabel(state);
    els.streetLabel.textContent = street;
    els.potLabel.textContent = formatChips(Engine.potSize(state));
    if (els.feltStreet) els.feltStreet.textContent = street;
    if (els.feltPot) els.feltPot.textContent = formatChips(Engine.potSize(state));
    const legal = me ? Engine.legalActions(state, me.id) : null;
    els.callLabel.textContent = legal ? formatChips(legal.toCall) : "—";
    els.nextGameLabel.textContent = nextGameText(state);
    renderSeats(state, me);
    renderBoards(state, game);
    renderHero(state, me, game);
    renderDecision(state, me, legal);
    renderResults(state, me);
    renderTableNotice(state, me);
    tickClock();
    if (state.phase === "showdown") persistLedger(state);
  }

  function streetLabel(state) {
    const value = state.street || state.phase || "";
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
  }

  // Opponents sit on three rails around the felt centre, clockwise from the
  // hero's left: left rail (bottom to top), top rail, right rail (top to
  // bottom). Phones collapse the rails into one wrapped grid (styles.css).
  function renderSeats(state, me) {
    const index = me ? state.players.indexOf(me) : -1;
    const others = index >= 0 ? state.players.slice(index + 1).concat(state.players.slice(0, index)) : state.players.slice();
    const count = others.length;
    const sideEach = count >= 6 ? 2 : count >= 3 ? 1 : 0;
    const topCount = count - sideEach * 2;
    els.seatsView.style.setProperty("--seat-columns", Math.max(1, count));
    const rails = { left: [], top: [], right: [] };
    others.forEach((player, position) => {
      const rail = position < sideEach ? "left" : position < sideEach + topCount ? "top" : "right";
      rails[rail].push(seatHtml(state, player));
    });
    rails.left.reverse();
    els.seatsView.innerHTML = ["left", "top", "right"].map((rail) => '<div class="seat-rail" data-rail="' + rail + '">' + rails[rail].join("") + "</div>").join("");
  }

  function seatHtml(state, player) {
    const active = state.activePlayerId === player.id;
    const dealer = state.players[state.buttonIndex]?.id === player.id;
    const badges = playerBadges(state, player);
    const cards = player.down.concat(player.up, player.hole);
    const busted = player.stack <= 0 && !player.allIn && state.phase === "showdown";
    const won = state.phase === "showdown" && Number(state.handResult?.net?.[player.id] || 0) > 0;
    const status = player.disconnected ? ["Disconnected", "bad"]
      : player.folded ? ["Folded", ""]
      : player.allIn ? ["All-in", "warn"]
      : state.phase === "showdown" ? [signed(Number(state.handResult?.net?.[player.id] || 0)), won ? "good" : Number(state.handResult?.net?.[player.id] || 0) < 0 ? "bad" : ""]
      : active ? ["To act", "accent"]
      : player.lastAction ? [player.lastAction, "info"]
      : ["Waiting", ""];
    const classes = ["seat",
      active ? "seat--active active" : "",
      player.folded ? "seat--folded" : "",
      player.disconnected ? "seat--disconnected disconnected" : "",
      busted ? "seat--busted" : "",
      won ? "seat--winner" : "",
    ].filter(Boolean).join(" ");
    return '<article class="' + classes + '" data-player-id="' + escapeHtml(player.id) + '" aria-label="' + escapeHtml(player.name) + '">' +
      '<span class="seat-avatar" aria-hidden="true">' + initials(player.name) + "</span>" +
      (dealer ? '<span class="seat-dealer" title="Dealer" aria-label="Dealer">D</span>' : "") +
      '<span class="seat-head seat-name"><strong>' + escapeHtml(player.name) + "</strong></span>" +
      '<span class="seat-meta"><span class="seat-stack">' + formatChips(player.stack) + "</span>" + badges.map((badge) => '<span class="seat-badge">' + badge + "</span>").join("") + '<span class="seat-badge' + (status[1] ? " seat-badge--" + status[1] : "") + '">' + escapeHtml(status[0]) + "</span>" + (active ? '<span class="seat-clock" data-clock></span>' : "") + "</span>" +
      (player.streetBet > 0 ? '<span class="seat-bet" aria-label="Bet ' + formatChips(player.streetBet) + '">' + formatChips(player.streetBet) + "</span>" : "") +
      '<div class="seat-cards">' + cards.map((id) => cardHtml(id)).join("") + "</div></article>";
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
      return '<div class="board-line"><span class="felt-label">' + label + '</span><div class="board-cards">' + Array.from({ length: slots }, (_, cardIndex) => board[cardIndex] ? cardHtml(board[cardIndex]) : Cards.emptySlotHtml()).join("") + "</div></div>";
    }).join("");
    els.tableMessage.textContent = state.isBombPot ? "Bomb pot" : "";
  }

  function renderHero(state, me, game) {
    els.heroSeat.hidden = !me;
    if (!me) return;
    const cards = me.down.concat(me.up, me.hole);
    const mine = state.activePlayerId === me.id;
    const net = Number(state.handResult?.net?.[me.id] || 0);
    els.heroName.textContent = me.name;
    if (els.heroAvatar) els.heroAvatar.textContent = initials(me.name);
    if (els.heroDealer) els.heroDealer.hidden = state.players[state.buttonIndex]?.id !== me.id;
    const status = me.disconnected ? ["Disconnected", "bad"]
      : me.folded ? ["Folded", ""]
      : state.phase === "showdown" ? [me.stack <= 0 ? "Busted" : net > 0 ? "Won " + formatChips(net) : net < 0 ? "Lost " + formatChips(-net) : "Break even", me.stack <= 0 ? "bad" : net > 0 ? "good" : ""]
      : me.allIn ? ["All-in", "warn"]
      : mine ? ["Your decision", "accent"]
      : [formatChips(me.stack) + " behind", ""];
    els.heroStatus.textContent = status[0];
    els.heroStatus.className = "seat-badge" + (status[1] ? " seat-badge--" + status[1] : "");
    els.heroSeat.classList.toggle("seat--active", mine);
    els.heroSeat.classList.toggle("active", mine);
    els.heroSeat.classList.toggle("seat--folded", Boolean(me.folded));
    els.heroSeat.classList.toggle("seat--winner", state.phase === "showdown" && net > 0);
    if (els.heroBet) {
      els.heroBet.hidden = !(me.streetBet > 0);
      els.heroBet.textContent = me.streetBet > 0 ? formatChips(me.streetBet) : "";
    }
    if (els.heroClock) els.heroClock.hidden = !mine;
    els.heroCards.style.setProperty("--hero-count", Math.max(1, cards.length));
    const selectable = mine && ["draw", "discard"].includes(state.stage);
    renderCardRow(els.heroCards, cards, (id) => ({
      selectable: selectable && (state.stage === "draw" ? me.hole.includes(id) : me.down.includes(id)),
      selected: selectedDiscards.has(id),
    }));
    if (state.phase === "showdown" && !me.folded) {
      els.handEvaluation.innerHTML = me.evaluation.map((component) => '<span class="evaluation-chip hand-chip' + (component.qualifies ? " hand-chip--good" : " hand-chip--bad") + '">' + escapeHtml(component.label) + ' · <strong>' + escapeHtml(component.qualifies ? component.name : "No qualifier") + "</strong></span>").join("");
    } else {
      els.handEvaluation.innerHTML = '<span class="evaluation-chip hand-chip">' + escapeHtml(game.short) + " · " + escapeHtml(game.summary) + "</span>";
    }
  }

  // Renders a card row by diffing: when the cards and their selectability are
  // unchanged only the selected state is toggled, so a tap or keypress never
  // loses focus. When the row really changes, focus is restored to the card
  // with the same data-card-id.
  function renderCardRow(container, cards, optionsFor) {
    const options = cards.map((id) => optionsFor(id));
    const keys = cards.map((id, index) => id + ":" + (options[index].selectable ? "s" : "n"));
    const existing = Array.from(container.children);
    if (existing.length === keys.length && existing.every((child, index) => child.dataset.key === keys[index])) {
      existing.forEach((child, index) => {
        const selected = Boolean(options[index].selected);
        child.classList.toggle("selected", selected);
        if (child.tagName === "BUTTON") child.setAttribute("aria-pressed", String(selected));
      });
      return;
    }
    const focused = container.contains(document.activeElement) ? document.activeElement.dataset.cardId : null;
    container.innerHTML = cards.map((id, index) => cardHtml(id, { ...options[index], key: keys[index] })).join("");
    if (focused) {
      const target = container.querySelector('[data-card-id="' + focused + '"]') || container.querySelector("button");
      if (target) target.focus();
    }
  }

  function renderDecision(state, me, legal) {
    const mine = Boolean(me) && state.activePlayerId === me.id;
    const active = state.players.find((player) => player.id === state.activePlayerId);
    // At showdown the results panel takes this slot; the decision panel has nothing to offer.
    els.decisionPanel.hidden = state.phase === "showdown";
    els.decisionPanel.classList.toggle("action-stage--host", room.isHost);
    els.decisionKicker.textContent = state.stage === "draw" ? "Draw" : state.stage === "discard" ? "Discard" : "Action";
    els.decisionTitle.textContent = mine
      ? state.stage === "draw" ? "Choose your discards" : state.stage === "discard" ? "Discard two down cards" : "Your action"
      : active ? active.name + " is acting" + (active.disconnected ? " (disconnected)" : "") : me ? "Waiting" : "Watching the hand";
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

  // Toggling a discard updates the card in place (renderCardRow diffs), so the
  // tapped card keeps focus; only the draw controls are re-rendered.
  function handleCardSelection(event) {
    const card = event.target.closest("[data-card-id]");
    if (!card || !card.dataset.selectable || !model) return;
    const id = card.dataset.cardId;
    if (selectedDiscards.has(id)) selectedDiscards.delete(id);
    else selectedDiscards.add(id);
    const state = currentViewState();
    const me = state.players.find((player) => player.id === room.clientId);
    if (!me) return;
    renderHero(state, me, Catalog.getGame(state.gameId));
    renderDecision(state, me, Engine.legalActions(state, me.id));
  }

  function submitCardSelection() {
    if (model.stage === "draw") room.sendAction({ type: "draw", cards: Array.from(selectedDiscards) });
    if (model.stage === "discard") room.sendAction({ type: "super_discard", cards: Array.from(selectedDiscards) });
  }

  function syncSelection(state, me) {
    const key = me ? [state.handNumber, state.stage, state.street, state.activePlayerId, me.hole.join(","), me.down.join(",")].join(":") : "";
    if (key === selectionKey) return;
    selectionKey = key;
    selectedDiscards = new Set();
  }

  function renderResults(state, me) {
    const showdown = state.phase === "showdown";
    els.resultsPanel.hidden = !showdown;
    if (!showdown) return;
    const funded = state.players.filter((player) => player.stack > 0);
    const tableOver = funded.length < 2;
    const myNet = me ? Number(state.handResult?.net?.[me.id] || 0) : 0;
    els.resultsPanel.classList.toggle("action-stage--host", room.isHost);
    if (els.resultKicker) els.resultKicker.textContent = tableOver ? "Table over" : "Hand complete";
    els.resultTitle.textContent = tableOver
      ? funded.length === 1 ? playerName(funded[0].id) + " has every chip" : "Nobody has chips left"
      : state.handResult?.uncontestedWinnerId ? playerName(state.handResult.uncontestedWinnerId) + " won uncontested"
      : !me ? "Showdown"
      : myNet > 0 ? "Won " + formatChips(myNet) : myNet < 0 ? "Lost " + formatChips(Math.abs(myNet)) : "Break even";
    if (tableOver) {
      // Final ledger: closing stacks and the session net per player.
      els.resultsList.innerHTML = state.players.map((player) => {
        const net = sessionNet(state, player.id);
        return '<div class="result-row"><span><b>' + escapeHtml(player.name) + "</b> · stack " + formatChips(player.stack) + (player.stack <= 0 ? ' · <span class="seat-badge seat-badge--bad">Busted</span>' : "") + '</span><strong class="' + (net > 0 ? "positive" : net < 0 ? "negative" : "") + '">' + signed(net) + "</strong></div>";
      }).join("");
    } else {
      els.resultsList.innerHTML = state.players.map((player) => {
        const net = Number(state.handResult?.net?.[player.id] || 0);
        const result = player.folded ? "Folded" : player.evaluation.map((entry) => entry.qualifies ? entry.label + ": " + entry.name : entry.label + ": no qualifier").join(" · ");
        return '<div class="result-row"><span><b>' + escapeHtml(player.name) + "</b> · " + escapeHtml(result) + (player.stack <= 0 ? ' · <span class="seat-badge seat-badge--bad">Busted</span>' : "") + '</span><strong class="' + (net > 0 ? "positive" : net < 0 ? "negative" : "") + '">' + signed(net) + "</strong></div>";
      }).join("");
    }
    els.nextHandButton.hidden = !room.isHost;
    els.nextHandButton.disabled = tableOver;
    if (els.resultsWait) els.resultsWait.hidden = room.isHost;
    if (els.resultsHint) {
      els.resultsHint.textContent = room.isHost
        ? tableOver ? "Add chips to a busted player to keep playing, or close the table from Leave." : ""
        : tableOver ? "The table is over until the host adds chips." : me && me.stack <= 0 ? "You are out of chips. Ask the host for an add-on." : "";
    }
    renderAddChips(state);
  }

  // The host's add-on form sits behind a toggle unless the table is over.
  function renderAddChips(state) {
    if (!els.addChips || !state || state.kind !== "poker") return;
    const tableOver = state.players.filter((player) => player.stack > 0).length < 2;
    const open = room.isHost && (tableOver || addChipsOpen);
    els.addChips.hidden = !open;
    if (els.addChipsToggle) {
      els.addChipsToggle.hidden = !room.isHost || tableOver;
      els.addChipsToggle.setAttribute("aria-expanded", String(open));
      els.addChipsToggle.textContent = open ? "Hide add chips" : "Add chips…";
    }
    if (!open) return;
    const current = els.addChipsPlayer.value;
    const players = state.players.slice().sort((a, b) => (a.stack <= 0 ? 0 : 1) - (b.stack <= 0 ? 0 : 1));
    els.addChipsPlayer.innerHTML = players.map((player) => '<option value="' + escapeHtml(player.id) + '">' + escapeHtml(player.name) + " · " + formatChips(player.stack) + "</option>").join("");
    if (players.some((player) => player.id === current)) els.addChipsPlayer.value = current;
    if (!els.addChipsAmount.value) els.addChipsAmount.value = state.settings.startingStack;
  }

  function submitAddChips(event) {
    event.preventDefault();
    const amount = Math.trunc(Number(els.addChipsAmount.value));
    if (!amount || amount < 1) return showError("Enter the number of chips to add.");
    room.sendAction({ type: "adjust", playerId: els.addChipsPlayer.value, amount });
    addChipsOpen = false;
  }

  function sessionNet(state, playerId) {
    return state.ledger.reduce((sum, entry) => sum + (entry.adjustment ? 0 : Number(entry.net?.[playerId] || 0)), 0);
  }

  // Designed states on the felt: a late joiner watches the hand, a host
  // without a seat is told so, and a table with fewer than two funded
  // players is over until chips are added.
  function renderTableNotice(state, me) {
    if (!els.tableNotice) return;
    let title = "";
    let text = "";
    if (!me) {
      title = "You're watching this table";
      text = "The hand was dealt to " + state.players.length + " seats before you joined, so you can't be seated at this table. Watch the action; the host can start a new table with you in it.";
    } else if (state.phase === "showdown" && state.players.filter((player) => player.stack > 0).length < 2) {
      title = "Table over";
      text = room.isHost ? "Fewer than two players have chips. Add chips below to keep playing." : "Fewer than two players have chips. The host can add chips to continue.";
    }
    els.tableNotice.hidden = !title;
    els.tableNoticeTitle.textContent = title;
    els.tableNoticeText.textContent = text;
  }

  function renderBanners() {
    const reconnecting = connectionState === "reconnecting";
    const text = reconnecting ? "Connection lost. Recovering the table; keep this page open." : "";
    [els.roomBanner, els.gameBanner].forEach((banner) => {
      if (!banner) return;
      banner.hidden = !text;
      banner.querySelector("span").textContent = text;
    });
  }

  function renderGuide(familyId) {
    els.guideTabs.innerHTML = Catalog.FAMILIES.map((family) => '<button type="button" data-guide-family="' + family.id + '" class="' + (family.id === familyId ? "active" : "") + '" aria-pressed="' + (family.id === familyId) + '">' + escapeHtml(family.label) + "</button>").join("");
    els.guideTabs.querySelectorAll("[data-guide-family]").forEach((button) => {
      button.addEventListener("click", () => {
        activeFamily = button.dataset.guideFamily;
        renderGuide(activeFamily);
        els.guideTabs.querySelector('[data-guide-family="' + activeFamily + '"]')?.focus();
      });
    });
    els.guideList.innerHTML = Catalog.gamesByFamily(familyId).map((game) => '<article class="guide-game"><h3>' + escapeHtml(game.short) + "<span>" + escapeHtml(structureLabel(game.structure)) + '</span></h3><p><strong>' + escapeHtml(game.name) + ".</strong> " + escapeHtml(game.summary) + "</p></article>").join("");
  }

  function openDialog(dialog) {
    if (Sheet) Sheet.open(dialog, { dismissible: true });
    else dialog.showModal();
  }

  function openLedger() {
    if (!model || model.kind !== "poker") return;
    els.ledgerStacks.innerHTML = model.players.map((player) => '<div class="ledger-stack stat"><span class="stat-label">' + escapeHtml(player.name) + '</span><strong class="stat-value">' + formatChips(player.stack) + "</strong></div>").join("");
    els.ledgerEntries.innerHTML = model.ledger.length ? model.ledger.slice().reverse().map((entry) => {
      if (entry.adjustment) return '<div class="ledger-entry"><span>Adjustment</span><div>' + escapeHtml(entry.note) + " · " + escapeHtml(playerName(entry.playerId)) + " " + signed(entry.amount) + "</div></div>";
      const game = Catalog.getGame(entry.gameId);
      const net = model.players.map((player) => '<span class="' + (entry.net[player.id] > 0 ? "positive" : entry.net[player.id] < 0 ? "negative" : "") + '">' + escapeHtml(player.name) + " " + signed(entry.net[player.id] || 0) + "</span>").join("");
      return '<div class="ledger-entry"><span>Hand ' + entry.handNumber + " · " + escapeHtml(game.short) + '</span><div class="ledger-net">' + net + "</div></div>";
    }).join("") : '<p class="ledger-empty error">No completed hands yet.</p>';
    openDialog(els.ledgerModal);
  }

  async function copyLedger() {
    if (!model || model.kind !== "poker") return;
    await copyWithToast(Engine.ledgerText(model), "Ledger copied.");
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
    await copyWithToast("Join my mixed poker table: " + url + "\nRoom code: " + room.roomCode, "Invite copied.");
  }

  async function copyCode() {
    await copyWithToast(room.roomCode, "Room code " + room.roomCode + " copied.");
  }

  async function copyWithToast(text, message) {
    try {
      await copyText(text);
      showToast(message);
    } catch (_error) {
      showToast("Copying failed. Select the room code and copy it by hand.", { alert: true });
    }
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
    if (state.smallBlindPlayerId === player.id) badges.push("SB");
    if (state.bigBlindPlayerId === player.id) badges.push("BB");
    if (state.straddlePlayerId === player.id) badges.push("STR");
    if (state.bringInPlayerId === player.id) badges.push("BI");
    return badges;
  }

  // Every card face comes from the shared component (shared/cards.js). Ids are
  // "As"/"Td" from the engine or "BACK" for a hidden card.
  function cardHtml(id, options = {}) {
    const attrs = options.key ? { "data-key": options.key } : {};
    if (!options.selectable) return Cards.html(id, { selected: options.selected, attrs });
    return Cards.html(id, {
      tag: "button",
      interactive: true,
      selected: options.selected,
      pressed: Boolean(options.selected),
      attrs: { ...attrs, "data-card-id": id, "data-selectable": "true" },
    });
  }

  function currentViewState() {
    if (!model || !room.isHost || model.kind !== "poker") return model;
    return Engine.filterStateForPlayer(model, room.clientId);
  }

  function remainingSeconds(state) {
    if (!state.actionDeadline) return null;
    return Math.max(0, Math.ceil((state.actionDeadline - Date.now()) / 1000));
  }

  // The action clock only rewrites the clock badges ([data-clock]), never the
  // whole view, so focus and selection survive the twice-a-second tick.
  function tickClock() {
    const state = currentViewState();
    const clocks = els.gameView.querySelectorAll("[data-clock]");
    if (!state || state.kind !== "poker" || !state.activePlayerId || !state.actionDeadline) {
      clocks.forEach((clock) => { clock.textContent = ""; clock.classList.remove("is-out"); });
      return;
    }
    const seconds = remainingSeconds(state);
    const out = seconds <= 0;
    clocks.forEach((clock) => {
      clock.textContent = out ? "Timed out" : seconds + "s";
      clock.classList.toggle("is-out", out);
    });
  }

  function startClockRendering() {
    if (clockRenderTimer) return;
    clockRenderTimer = setInterval(() => {
      if (model?.kind === "poker" && model.activePlayerId && model.actionDeadline) tickClock();
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
    els.connectButton.setAttribute("aria-busy", String(busy));
    if (busy) els.connectButton.textContent = "Connecting…";
    else renderSetupMode();
  }

  // Errors render where the user is looking (the visible view's error slot)
  // and are announced once through the page's assertive live region.
  function showError(message) {
    if (!els.setupView.hidden) els.setupError.textContent = message;
    else if (!els.roomView.hidden) els.roomError.textContent = message;
    else if (els.gameError) els.gameError.textContent = message;
    showToast(message, { alert: true });
  }

  function clearErrors() {
    els.setupError.textContent = "";
    els.roomError.textContent = "";
    if (els.gameError) els.gameError.textContent = "";
  }

  // One polite stack (#toast) and one assertive stack (#alerts); each toast
  // has a dismiss control and pauses its timer while hovered or focused.
  function showToast(message, { alert = false } = {}) {
    const stack = alert && els.alerts ? els.alerts : els.toast;
    if (!stack) return;
    const toast = document.createElement("div");
    toast.className = "toast" + (alert ? " toast--alert" : "");
    toast.innerHTML = "<span></span>" + '<button class="btn btn--ghost btn--icon btn--sm" type="button" aria-label="Dismiss">' + icon("i-close") + "</button>";
    toast.firstChild.textContent = message;
    let timer = 0;
    const remove = () => { clearTimeout(timer); toast.remove(); };
    const arm = () => { clearTimeout(timer); timer = setTimeout(remove, alert ? 6000 : 3500); };
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
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("aria-hidden", "true");
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (!ok) throw new Error("Copy failed.");
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
