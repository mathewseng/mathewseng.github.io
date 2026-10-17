(function () {
  "use strict";

  const {
    PokerRushGame,
    PokerRushMultiplayerGame,
    createDeck,
  } = window.PokerRushCore;
  const PlayingCards = window.PlayingCards;
  const PeerRoom = window.PeerRoom;
  const Sheet = window.Sheet;

  const $ = (id) => document.getElementById(id);
  const els = {
    lobby: $("lobby"),
    roomView: $("roomView"),
    gameView: $("gameView"),
    optionsForm: $("optionsForm"),
    optionsDialog: $("optionsDialog"),
    optionsButton: $("optionsButton"),
    optionsCloseButton: $("optionsCloseButton"),
    optionsDoneButton: $("optionsDoneButton"),
    optionsSummary: $("optionsSummary"),
    roomOptionsButton: $("roomOptionsButton"),
    roomOptions: $("roomOptions"),
    dailyButton: $("dailyButton"),
    randomButton: $("randomButton"),
    multiplayerButton: $("multiplayerButton"),
    dailySeedBadge: $("dailySeedBadge"),
    dailyPlayedBadge: $("dailyPlayedBadge"),
    bestScoreValue: $("bestScoreValue"),
    todayScoreValue: $("todayScoreValue"),
    matrixToggleButton: $("matrixToggleButton"),
    newDailyButton: $("newDailyButton"),
    newRandomButton: $("newRandomButton"),
    instructionsButton: $("instructionsButton"),
    instructionsDialog: $("instructionsDialog"),
    scoreValue: $("scoreValue"),
    timeValue: $("timeValue"),
    seenValue: $("seenValue"),
    discardValue: $("discardValue"),
    deckValue: $("deckValue"),
    uniqueSeenValue: $("uniqueSeenValue"),
    scoreSummary: $("scoreSummary"),
    scoreStrip: $("scoreStrip"),
    playersPanel: $("playersPanel"),
    scoredHands: $("scoredHands"),
    scoreList: $("scoreList"),
    pointsBreakdown: $("pointsBreakdown"),
    hand: $("hand"),
    cardMatrix: $("cardMatrix"),
    statusLine: $("statusLine"),
    seedBadge: $("seedBadge"),
    modeBadge: $("modeBadge"),
    tableSurface: document.querySelector(".table-surface"),
    matrixPanel: $("matrixPanel"),
    soundButton: $("soundButton"),
    endGameButton: $("endGameButton"),
    gameBanner: $("gameBanner"),
    gameOver: $("gameOver"),
    gameOverKicker: $("gameOverKicker"),
    gameOverTitle: $("gameOverTitle"),
    gameOverSummary: $("gameOverSummary"),
    gameOverStats: $("gameOverStats"),
    gameOverWait: $("gameOverWait"),
    againButton: $("againButton"),
    backButton: $("backButton"),
    multiplayerDialog: $("multiplayerDialog"),
    multiplayerCloseButton: $("multiplayerCloseButton"),
    multiplayerHint: $("multiplayerHint"),
    playerNameInput: $("playerNameInput"),
    hostGameButton: $("hostGameButton"),
    joinGameButton: $("joinGameButton"),
    joinFields: $("joinFields"),
    joinInviteCode: $("joinInviteCode"),
    connectButton: $("connectButton"),
    connectionStatus: $("connectionStatus"),
    connection: $("connection"),
    inviteCode: $("inviteCode"),
    copyCodeButton: $("copyCodeButton"),
    copyInviteButton: $("copyInviteButton"),
    roomTitle: $("roomTitle"),
    roomLede: $("roomLede"),
    roomBanner: $("roomBanner"),
    roster: $("roster"),
    rosterCount: $("rosterCount"),
    startGameButton: $("startGameButton"),
    roomWait: $("roomWait"),
    roomError: $("roomError"),
    leaveRoomButton: $("leaveRoomButton"),
    alerts: $("alerts"),
  };

  const ICONS = "../../shared/icons.svg";
  const RECORDS_KEY = "poker.rush.records.v1";
  const NAME_KEY = "poker.player.name";

  const discardModeLabels = {
    bottom: "Bottom discard",
    pile: "Discard pile",
    random: "Random discard",
    infinite: "Infinite deck",
  };
  const endModeLabels = {
    discards: "52 discards",
    seen_count: "Seen limit",
    seen_all: "Every card",
    no_scores: "No-score end",
  };

  let game = null;
  let lastStartKind = "daily";
  let lastSeed = "";
  let timerId = null;
  let soundEnabled = true;
  let audioContext = null;
  let previousHandIds = [];
  let matrixCellsById = new Map();
  let matrixSignature = "";
  let matrixVisible = false;
  let renderedScoreIds = new Set();
  let isResolving = false;
  // "single" (solo run), "host" or "peer" (a race in progress), "room" (in a
  // room but not racing).
  let playMode = "single";
  let multiplayerGame = null;
  let localPlayerId = "solo";
  let hostActionQueue = [];
  let isProcessingHostActions = false;
  let setupMode = "create";
  let latestRoster = [];
  let remoteOptions = null;
  let records = loadRecords();
  let recordNote = "";

  // The room is created once; create()/join() reset its runtime. A missing
  // PeerRoom (the shared script failed to load) only disables multiplayer.
  const room = PeerRoom
    ? new PeerRoom({ namespace: "poker-rush", maxPlayers: 2, storageKey: "poker.rush.session.v1" })
    : null;

  /* ---------- Options ---------- */

  function selectedValue(name) {
    const checked = els.optionsForm.querySelector(`[name="${name}"]:checked`);
    return checked ? checked.value : "";
  }

  function readOptions(seed, multiplayer = false) {
    const formData = new FormData(els.optionsForm);
    let discardMode = String(formData.get("discardMode"));
    if (multiplayer && (discardMode === "bottom" || discardMode === "pile")) {
      discardMode = "random";
    }
    return {
      seed,
      handSize: Number(selectedValue("handSize")),
      jokers: Number(selectedValue("jokers")),
      timeLimit: Number(selectedValue("timeLimit")),
      discardMode,
      endMode: String(formData.get("endMode")),
    };
  }

  function optionFacts(options) {
    return [
      `${options.handSize} cards`,
      `${options.jokers} joker${options.jokers === 1 ? "" : "s"}`,
      options.timeLimit ? `${options.timeLimit}s` : "No time limit",
      discardModeLabels[options.discardMode] || options.discardMode,
      endModeLabels[options.endMode] || options.endMode,
    ];
  }

  function renderChips(container, facts) {
    container.replaceChildren(
      ...facts.map((fact) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = fact;
        return chip;
      }),
    );
  }

  function renderOptionsSummary() {
    renderChips(els.optionsSummary, optionFacts(readOptions("")));
  }

  function openOptions(opener) {
    if (Sheet) Sheet.open(els.optionsDialog, { dismissible: true, returnFocus: opener, onClose: onOptionsClosed });
    else if (typeof els.optionsDialog.showModal === "function") els.optionsDialog.showModal();
  }

  function onOptionsClosed() {
    renderOptionsSummary();
    if (playMode === "room" && room && room.isHost) publishLobby();
  }

  /* ---------- Seeds and records ---------- */

  function dailySeed(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  }

  function randomSeed() {
    const bytes = new Uint32Array(2);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      bytes[0] = Math.floor(Math.random() * 0xffffffff);
      bytes[1] = Date.now() >>> 0;
    }
    return `PR-${bytes[0].toString(36)}-${bytes[1].toString(36)}`;
  }

  // Best solo score and today's daily result live in localStorage so a
  // daily run leaves a "played today" marker behind.
  function loadRecords() {
    try {
      const value = JSON.parse(localStorage.getItem(RECORDS_KEY) || "null");
      return value && typeof value === "object" ? value : {};
    } catch (error) {
      return {};
    }
  }

  function saveRecords() {
    try {
      localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
    } catch (error) {
      // Storage may be unavailable; the run still ends normally.
    }
  }

  function recordSoloResult(finished) {
    recordNote = "";
    const entry = { score: finished.score, hands: finished.scoredHands.length, seed: finished.seed, kind: lastStartKind, at: Date.now() };
    if (lastStartKind === "daily" && finished.seed === dailySeed()) {
      const previous = records.daily && records.daily.seed === entry.seed ? records.daily : null;
      if (!previous || entry.score > previous.score) records.daily = entry;
    }
    if (entry.score > 0 && (!records.best || entry.score > records.best.score)) {
      recordNote = records.best ? `New best score (was ${records.best.score}).` : "First score on the board.";
      records.best = entry;
    }
    saveRecords();
    renderRecords();
  }

  function renderRecords() {
    const today = dailySeed();
    const daily = records.daily && records.daily.seed === today ? records.daily : null;
    els.bestScoreValue.textContent = records.best ? `${records.best.score} pts` : "–";
    els.todayScoreValue.textContent = daily ? `${daily.score} pts` : "Not played";
    els.dailySeedBadge.textContent = `Seed ${today}`;
    els.dailyPlayedBadge.hidden = !daily;
    els.dailyPlayedBadge.textContent = daily ? `Played today · ${daily.score} pt${daily.score === 1 ? "" : "s"}` : "Played today";
  }

  /* ---------- Sound ---------- */

  function ensureAudio() {
    if (!soundEnabled) return null;
    if (!audioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      audioContext = new AudioContext();
    }
    if (audioContext.state === "suspended") audioContext.resume();
    return audioContext;
  }

  function tone(frequency, duration, type = "sine", gain = 0.035, delay = 0) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const volume = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + delay);
    volume.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
    volume.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + delay + 0.012);
    volume.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);
    oscillator.connect(volume);
    volume.connect(ctx.destination);
    oscillator.start(ctx.currentTime + delay);
    oscillator.stop(ctx.currentTime + delay + duration + 0.02);
  }

  function noise(duration = 0.08, gain = 0.03) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const source = ctx.createBufferSource();
    const volume = ctx.createGain();
    volume.gain.value = gain;
    source.buffer = buffer;
    source.connect(volume);
    volume.connect(ctx.destination);
    source.start();
  }

  function playDiscardSound() {
    tone(148, 0.055, "triangle", 0.026);
    tone(92, 0.075, "sine", 0.018, 0.025);
  }

  function playScoreSound(rank) {
    const patterns = {
      straight: [392, 494],
      flush: [330, 440, 554],
      full_house: [262, 392, 523],
      four_kind: [220, 277, 330, 440],
      straight_flush: [330, 415, 523, 659],
      royal_flush: [523, 659, 784, 1046],
    };
    const notes = patterns[rank] || patterns.straight;
    notes.forEach((freq, index) => tone(freq, 0.11, index % 2 ? "triangle" : "sine", 0.035, index * 0.055));
    if (rank === "four_kind" || rank === "straight_flush" || rank === "royal_flush") noise(0.12, 0.018);
  }

  /* ---------- View state helpers ---------- */

  function cardLabel(card) {
    return card.isJoker ? `Joker ${card.jokerIndex}` : `${card.rank}${card.suit}`;
  }

  function displayDeckCount(snapshot) {
    if (snapshot.deckCount === Infinity) return "∞";
    if (snapshot.discardPileCount) return `${snapshot.deckCount}+${snapshot.discardPileCount}`;
    return String(snapshot.deckCount);
  }

  function resetRenderState() {
    previousHandIds = [];
    matrixCellsById = new Map();
    matrixSignature = "";
    renderedScoreIds = new Set();
    isResolving = false;
  }

  function setMatrixVisible(visible, { renderNow = true } = {}) {
    matrixVisible = Boolean(visible);
    els.gameView.classList.toggle("matrix-visible", matrixVisible);
    els.matrixPanel.hidden = !matrixVisible;
    els.matrixToggleButton.setAttribute("aria-pressed", String(matrixVisible));
    els.matrixToggleButton.classList.toggle("is-active", matrixVisible);
    if (matrixVisible && renderNow && game) renderMatrix({ force: true });
  }

  // A view as plain data: the room clones state with structuredClone, so the
  // engine view's methods and Maps are replaced by arrays and strings.
  function serializeView(view) {
    return {
      options: { ...view.options },
      seed: view.seed,
      hand: view.hand.slice(),
      deckCount: view.deckCount === Infinity ? "Infinity" : view.deckCount,
      discardPileCount: view.discardPileCount || 0,
      scoredHands: view.scoredHands.slice(),
      score: view.score,
      userDiscardCount: view.userDiscardCount,
      drawnCount: view.drawnCount,
      uniqueSeenCount: view.uniqueSeenCount,
      totalCards: view.totalCards,
      status: view.status,
      endReason: view.endReason,
      startedAt: view.startedAt,
      seenCounts: Array.from(view.seenCounts || []),
      discardedCounts: Array.from(view.discardedCounts || []),
      scoredCounts: Array.from(view.scoredCounts || []),
      lastEvents: (view.lastEvents || []).slice(),
      multiplayer: Boolean(view.multiplayer),
      localPlayerId: view.localPlayerId,
      players: (view.players || []).map((player) => ({ ...player })),
    };
  }

  function hydrateView(raw) {
    const view = {
      ...raw,
      deckCount: raw.deckCount === "Infinity" ? Infinity : raw.deckCount,
      seenCounts: new Map(raw.seenCounts || []),
      discardedCounts: new Map(raw.discardedCounts || []),
      scoredCounts: new Map(raw.scoredCounts || []),
      snapshot() {
        return {
          options: { ...this.options },
          seed: this.seed,
          hand: this.hand.slice(),
          deckCount: this.deckCount,
          discardPileCount: this.discardPileCount || 0,
          scoredHands: this.scoredHands.slice(),
          score: this.score,
          userDiscardCount: this.userDiscardCount,
          drawnCount: this.drawnCount,
          uniqueSeenCount: this.uniqueSeenCount,
          totalCards: this.totalCards,
          status: this.status,
          endReason: this.endReason,
          players: this.players || [],
        };
      },
      remainingSeconds(now = Date.now()) {
        if (!this.options.timeLimit) return null;
        return Math.max(0, this.options.timeLimit - (now - this.startedAt) / 1000);
      },
    };
    return view;
  }

  function setGameView(view, options = {}) {
    game = hydrateView(serializeView(view));
    render(options);
  }

  function playScoreEvents(events = []) {
    events
      .filter((event) => event.type === "score")
      .forEach((event, eventIndex) => {
        window.setTimeout(() => {
          animateScore(event.record.evaluation.key);
          playScoreSound(event.record.evaluation.key);
        }, eventIndex * 90);
      });
  }

  function showView(view) {
    els.lobby.hidden = view !== "lobby";
    els.roomView.hidden = view !== "room";
    els.gameView.hidden = view !== "game";
    if (view !== "game" && els.gameOver.open) els.gameOver.close();
    const inRoom = Boolean(room && room.connected);
    els.connection.hidden = !inRoom;
    els.newDailyButton.hidden = inRoom;
    els.newRandomButton.hidden = inRoom;
  }

  /* ---------- Solo runs ---------- */

  function startGame(kind) {
    if (room && room.connected) leaveRoom({ silent: true });
    playMode = "single";
    multiplayerGame = null;
    localPlayerId = "solo";
    lastStartKind = kind;
    lastSeed = kind === "daily" ? dailySeed() : randomSeed();
    game = new PokerRushGame(readOptions(lastSeed));
    beginRun({ animateHand: true, forceMatrix: true, forceScores: true });
    const scoreEvent = game.lastEvents.find((event) => event.type === "score");
    if (scoreEvent) {
      animateScore(scoreEvent.record.evaluation.key);
      playScoreSound(scoreEvent.record.evaluation.key);
    }
  }

  function beginRun(renderOptions) {
    resetRenderState();
    setMatrixVisible(false, { renderNow: false });
    recordNote = "";
    showView("game");
    hideGameBanner();
    ensureAudio();
    render(renderOptions);
    startTimer();
    const firstCard = slotCard(els.hand.firstElementChild);
    if (firstCard && !window.matchMedia("(pointer: coarse)").matches) firstCard.focus({ preventScroll: true });
  }

  function restartGame() {
    if (playMode === "host") {
      startHostedMultiplayer();
      return;
    }
    if (playMode === "peer") return;
    startGame(lastStartKind);
  }

  // Daily, Random and End during a run ask first; a run is lost otherwise.
  async function confirmThen(action, { title, text, verb }) {
    if (!game || game.status !== "playing") {
      action();
      return;
    }
    const ok = Sheet
      ? await Sheet.confirm({ title, text, verb, danger: true, sheet: true })
      : window.confirm(text);
    if (ok) action();
  }

  function runSummaryText() {
    if (!game) return "";
    const remaining = game.remainingSeconds();
    const clock = remaining === null ? "" : ` with ${remaining.toFixed(0)}s left`;
    return `The current run (${game.score} pt${game.score === 1 ? "" : "s"}${clock}) is discarded and does not count toward your records.`;
  }

  function startTimer() {
    if (timerId) window.clearInterval(timerId);
    timerId = window.setInterval(() => {
      if (!game) return;
      if (playMode === "host" && multiplayerGame) {
        const ended = multiplayerGame.checkTime();
        if (ended) broadcastMultiplayerState();
      } else if (typeof game.checkTime === "function") {
        game.checkTime();
      }
      renderMetrics();
      if (game.status !== "playing") {
        showGameOver();
        window.clearInterval(timerId);
      }
    }, 100);
  }

  /* ---------- Rendering ---------- */

  function render(options = {}) {
    if (!game) return;
    renderMetrics();
    renderHand({ animateAll: Boolean(options.animateHand) });
    renderScores({ force: Boolean(options.forceScores) });
    renderMatrix({ force: Boolean(options.forceMatrix) });
    renderPlayers();
    renderStatus();
    if (game.status !== "playing") showGameOver();
  }

  function renderMetrics() {
    if (!game) return;
    const snapshot = game.snapshot();
    els.scoreValue.textContent = String(snapshot.score);
    const remaining = game.remainingSeconds();
    els.timeValue.textContent = remaining === null ? "∞" : remaining.toFixed(1);
    els.seenValue.textContent = `${snapshot.drawnCount}/${snapshot.totalCards}`;
    els.discardValue.textContent = String(snapshot.userDiscardCount);
    els.deckValue.textContent = displayDeckCount(snapshot);
    els.uniqueSeenValue.textContent = `${snapshot.uniqueSeenCount} unique`;
    els.seedBadge.textContent = `Seed ${snapshot.seed}`;
    els.modeBadge.textContent = `${snapshot.options.handSize} cards · ${discardModeLabels[snapshot.options.discardMode]} · ${endModeLabels[snapshot.options.endMode]}`;
  }

  // Rush ids are "AH"/"TD" (suits S/H/D/C) and "X1"/"X2" for jokers; the
  // shared component takes the same rank + suit and "JK" for a joker.
  function cardCode(card) {
    return card.isJoker ? "JK" : `${card.rank}${card.suit}`;
  }

  // Hand slots are stable wrappers around the shared card: they keep the
  // deal/discard animations and the hotkey position while the card inside is
  // rebuilt whenever it changes.
  function createHandSlot(index) {
    const slot = document.createElement("div");
    slot.className = "hand-slot";
    slot.dataset.index = String(index);
    return slot;
  }

  function ensureHandSlots(size) {
    while (els.hand.children.length < size) {
      els.hand.append(createHandSlot(els.hand.children.length));
    }
    while (els.hand.children.length > size) {
      els.hand.lastElementChild.remove();
    }
    els.hand.style.setProperty("--hand-size", size);
  }

  function slotCard(slot) {
    return slot ? slot.querySelector("button.playing-card") : null;
  }

  function clearCardAnimation(slot) {
    slot.classList.remove("is-new", "is-discarding");
  }

  function updateCardSlot(slot, card, index) {
    slot.classList.toggle("is-empty", !card);
    if (!card) {
      slot.replaceChildren(PlayingCards.emptySlot());
      return;
    }
    const button = PlayingCards.element(cardCode(card), {
      tag: "button",
      interactive: true,
      badge: String(index + 1),
      label: `Discard ${cardLabel(card)} in slot ${index + 1}`,
      attrs: { "data-card-id": card.id, "data-index": String(index) },
    });
    slot.replaceChildren(button);
  }

  function animateCardSlot(slot, className) {
    window.clearTimeout(slot.animationTimer);
    clearCardAnimation(slot);
    slot.offsetHeight;
    slot.classList.add(className);
    slot.animationTimer = window.setTimeout(() => clearCardAnimation(slot), 300);
  }

  function renderHand({ changedIndex = null, animateAll = false } = {}) {
    const size = game.options.handSize;
    ensureHandSlots(size);
    const focused = document.activeElement && document.activeElement.closest(".hand-slot");
    const focusedIndex = focused ? Number(focused.dataset.index) : -1;
    for (let index = 0; index < size; index += 1) {
      const card = game.hand[index] || null;
      const slot = els.hand.children[index];
      const oldId = previousHandIds[index] || "";
      const nextId = card ? card.id : "";
      const changed = oldId !== nextId || !slot.firstElementChild;
      if (changed) updateCardSlot(slot, card, index);
      if (changed && card && (animateAll || changedIndex === index)) {
        animateCardSlot(slot, "is-new");
      }
    }
    previousHandIds = Array.from({ length: size }, (_, index) => (game.hand[index] ? game.hand[index].id : ""));
    // The discarded card's button is rebuilt; keep the keyboard on that slot.
    if (focusedIndex >= 0 && !els.hand.contains(document.activeElement)) {
      const next = slotCard(els.hand.children[focusedIndex]);
      if (next) next.focus({ preventScroll: true });
    }
  }

  function scoreCardsMarkup(record) {
    const wrapper = document.createElement("div");
    wrapper.className = "mini-cards";
    for (const card of record.cards) {
      wrapper.append(PlayingCards.element(cardCode(card), { title: cardLabel(card) }));
    }
    return wrapper;
  }

  function renderScores({ force = false } = {}) {
    const hands = game.scoredHands;
    const visibleHands = hands.slice(0, 4);
    const nextSignature = visibleHands.map((record) => record.id).join("|");
    if (!force && els.scoredHands.dataset.signature === nextSignature) return;

    els.scoreSummary.textContent = `${hands.length} ${hands.length === 1 ? "hand" : "hands"}`;
    els.pointsBreakdown.textContent = `${game.score} pts`;

    const stripFragment = document.createDocumentFragment();
    visibleHands.forEach((record) => {
      const card = document.createElement("article");
      card.className = "score-card";
      card.dataset.rank = record.evaluation.key;
      if (!renderedScoreIds.has(record.id)) card.classList.add("is-new");

      const meta = document.createElement("div");
      meta.className = "score-meta";
      const title = document.createElement("strong");
      title.textContent = record.evaluation.label;
      const points = document.createElement("span");
      points.textContent = `+${record.points}`;
      meta.append(title, points);

      card.append(meta, scoreCardsMarkup(record));
      stripFragment.append(card);
    });
    if (!hands.length) {
      const empty = document.createElement("div");
      empty.className = "score-empty";
      empty.textContent = "No scores yet";
      stripFragment.append(empty);
    }
    els.scoredHands.replaceChildren(stripFragment);
    els.scoredHands.dataset.signature = nextSignature;

    // The full run, newest first, as a scrolling list.
    const listFragment = document.createDocumentFragment();
    hands.forEach((record) => {
      const row = document.createElement("div");
      row.className = "score-row";
      const title = document.createElement("strong");
      title.textContent = `${record.sequence}. ${record.evaluation.label} · ${record.points} pt${record.points === 1 ? "" : "s"}`;
      const cards = document.createElement("span");
      cards.textContent = record.cards.map(cardLabel).join(" ");
      row.append(title, cards);
      listFragment.append(row);
    });
    if (!hands.length) {
      const empty = document.createElement("div");
      empty.className = "score-row";
      const title = document.createElement("strong");
      title.textContent = "No scores yet";
      empty.append(title);
      listFragment.append(empty);
    }
    els.scoreList.replaceChildren(listFragment);
    renderedScoreIds = new Set(hands.map((record) => record.id));
  }

  function initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    const text = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : String(name || "?").slice(0, 2);
    return text.toUpperCase();
  }

  function seatMarkup(player, { meta = [], status = "", tone = "", me = false, host = false, disconnected = false, classes = "" } = {}) {
    const seat = document.createElement("div");
    seat.className = ["seat", "seat--lobby", classes, me ? "seat--me" : "", host ? "seat--host" : "", disconnected ? "seat--disconnected" : ""].filter(Boolean).join(" ");
    const avatar = document.createElement("span");
    avatar.className = "seat-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = initials(player.name);
    const name = document.createElement("span");
    name.className = "seat-name";
    const nameText = document.createElement("strong");
    nameText.textContent = player.name;
    name.append(nameText);
    if (me) {
      const you = document.createElement("span");
      you.className = "seat-badge";
      you.textContent = "You";
      name.append(you);
    }
    const metaRow = document.createElement("span");
    metaRow.className = "seat-meta";
    meta.forEach((text) => {
      const item = document.createElement("span");
      item.textContent = text;
      metaRow.append(item);
    });
    if (status) {
      const badge = document.createElement("small");
      badge.className = `seat-badge${tone ? ` seat-badge--${tone}` : ""}`;
      badge.textContent = status;
      metaRow.append(badge);
    }
    seat.append(avatar, name, metaRow);
    return seat;
  }

  function renderPlayers() {
    const players = game && game.players ? game.players : [];
    els.playersPanel.hidden = !players.length;
    if (!players.length) {
      els.playersPanel.replaceChildren();
      return;
    }
    const fragment = document.createDocumentFragment();
    players.forEach((player) => {
      const record = latestRoster.find((entry) => entry.id === player.id);
      const disconnected = Boolean(record && record.connected === false);
      const seat = seatMarkup(player, {
        meta: [`${player.score} pts`, `${player.scoredHands} hand${player.scoredHands === 1 ? "" : "s"}`, `${player.discards} discard${player.discards === 1 ? "" : "s"}`],
        status: disconnected ? "Disconnected" : "",
        tone: disconnected ? "bad" : "",
        me: player.isLocal,
        host: Boolean(record && record.host),
        disconnected,
        classes: `player-chip${player.isLocal ? " is-local" : ""}`,
      });
      fragment.append(seat);
    });
    els.playersPanel.replaceChildren(fragment);
  }

  function renderMatrix({ force = false } = {}) {
    if (!matrixVisible) return;
    const baseDeck = createDeck(game.options.jokers);
    const nextSignature = baseDeck.map((card) => card.baseId).join("|");
    if (force || matrixSignature !== nextSignature) {
      buildMatrix(baseDeck);
      matrixSignature = nextSignature;
    }
    const activeIds = new Map();
    game.hand.forEach((card) => {
      if (card) activeIds.set(card.baseId, (activeIds.get(card.baseId) || 0) + 1);
    });
    baseDeck.forEach((card) => updateMatrixCell(card, activeIds));
  }

  // The deck in PlayingCards.deckMatrix() order (spades, hearts, diamonds,
  // clubs; A down to 2) inside the shared .deck-matrix grid; jokers follow in
  // a row of their own.
  function buildMatrix(baseDeck) {
    const byId = new Map(baseDeck.map((card) => [card.baseId, card]));
    const fragment = document.createDocumentFragment();
    matrixCellsById = new Map();

    const grid = document.createElement("div");
    grid.className = "deck-matrix";
    PlayingCards.deckMatrix().forEach((code) => {
      const card = byId.get(`${code[0]}${code[1].toUpperCase()}`);
      if (card) grid.append(createMatrixCell(card));
    });
    fragment.append(grid);

    if (game.options.jokers > 0) {
      const row = document.createElement("div");
      row.className = "deck-matrix matrix-row jokers";
      for (let i = 1; i <= game.options.jokers; i += 1) {
        row.append(createMatrixCell(byId.get(`X${i}`)));
      }
      fragment.append(row);
    }

    els.cardMatrix.replaceChildren(fragment);
  }

  function createMatrixCell(card) {
    const cell = document.createElement("div");
    cell.className = "matrix-cell";
    cell.dataset.suit = card.suit;

    // The cell is a wrapper around a shared playing card; states live on the wrapper.
    const face = card.isJoker
      ? PlayingCards.element("JK", { corner: `J${card.jokerIndex}` })
      : PlayingCards.element(`${card.rank}${card.suit.toLowerCase()}`);
    cell.append(face);

    const count = document.createElement("span");
    count.className = "count";
    cell.append(count);
    matrixCellsById.set(card.baseId, cell);
    return cell;
  }

  function updateMatrixCell(card, activeIds) {
    const cell = matrixCellsById.get(card.baseId);
    if (!cell) return;
    const seenCount = game.seenCounts.get(card.baseId) || 0;
    const discardCount = game.discardedCounts.get(card.baseId) || 0;
    const scoredCount = game.scoredCounts.get(card.baseId) || 0;
    const activeCount = activeIds.get(card.baseId) || 0;
    cell.classList.toggle("seen", Boolean(seenCount));
    cell.classList.toggle("discarded", Boolean(discardCount && !activeCount));
    cell.classList.toggle("scored", Boolean(scoredCount));
    cell.classList.toggle("active", Boolean(activeCount));
    cell.title = `${cardLabel(card)} · seen ${seenCount} · discarded ${discardCount}`;
    const count = Math.max(seenCount, discardCount, activeCount);
    const countEl = cell.querySelector(".count");
    countEl.textContent = count > 1 ? String(count) : "";
    countEl.hidden = count <= 1;
  }

  function renderStatus() {
    if (!game) return;
    const scoreEvent = game.lastEvents.find((event) => event.type === "score");
    const discardEvent = game.lastEvents.find((event) => event.type === "discard");
    const reshuffleEvent = game.lastEvents.find((event) => event.type === "reshuffle");
    if (game.status !== "playing") {
      els.statusLine.textContent = game.endReason;
      return;
    }
    if (scoreEvent) {
      const label = document.createElement("strong");
      label.textContent = scoreEvent.record.evaluation.label;
      els.statusLine.replaceChildren(label, ` scored for ${scoreEvent.record.points} pt${scoreEvent.record.points === 1 ? "" : "s"}`);
      return;
    }
    if (reshuffleEvent) {
      els.statusLine.textContent = "Discard pile reshuffled";
      return;
    }
    if (discardEvent && discardEvent.drawn) {
      els.statusLine.textContent = `${cardLabel(discardEvent.card)} out, ${cardLabel(discardEvent.drawn)} in`;
      return;
    }
    els.statusLine.textContent = "";
  }

  function showGameBanner(message, tone = "") {
    els.gameBanner.className = `table-banner${tone ? ` table-banner--${tone}` : ""}`;
    els.gameBanner.firstElementChild.textContent = message;
    els.gameBanner.hidden = false;
  }

  function hideGameBanner() {
    els.gameBanner.hidden = true;
  }

  /* ---------- Messages ---------- */

  // One polite live region (#statusLine, on the felt) and one assertive stack
  // (#alerts). Room feedback is written where the user is looking: the room
  // panel's status line, or the open dialog's error slot.
  function notify(message) {
    if (!message) return;
    if (!els.roomView.hidden) els.connectionStatus.textContent = message;
    else if (!els.gameView.hidden && (!game || game.status !== "playing")) els.statusLine.textContent = message;
  }

  function showError(message) {
    if (els.multiplayerDialog.open && Sheet) {
      Sheet.setError(els.multiplayerDialog, message);
      return;
    }
    if (!els.roomView.hidden) els.roomError.textContent = message;
    else if (!els.gameView.hidden) showGameBanner(message, "bad");
    showAlert(message);
  }

  function showAlert(message) {
    if (!els.alerts) return;
    const toast = document.createElement("div");
    toast.className = "toast toast--alert";
    const text = document.createElement("span");
    text.textContent = message;
    const dismiss = document.createElement("button");
    dismiss.className = "btn btn--ghost btn--icon btn--sm";
    dismiss.type = "button";
    dismiss.setAttribute("aria-label", "Dismiss");
    dismiss.innerHTML = `<svg class="icon" aria-hidden="true"><use href="${ICONS}#i-close" /></svg>`;
    toast.append(text, dismiss);
    let timer = 0;
    const remove = () => {
      window.clearTimeout(timer);
      toast.remove();
    };
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(remove, 6000);
    };
    dismiss.addEventListener("click", remove);
    toast.addEventListener("mouseenter", () => window.clearTimeout(timer));
    toast.addEventListener("focusin", () => window.clearTimeout(timer));
    toast.addEventListener("mouseleave", arm);
    toast.addEventListener("focusout", arm);
    while (els.alerts.children.length >= 3) els.alerts.firstElementChild.remove();
    els.alerts.append(toast);
    arm();
  }

  /* ---------- Multiplayer: the room ---------- */

  function cleanName(value) {
    return String(value || "Player").trim().replace(/\s+/g, " ").slice(0, 18) || "Player";
  }

  function cleanCode(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
  }

  function setSetupMode(mode) {
    setupMode = mode;
    els.hostGameButton.setAttribute("aria-pressed", String(mode === "create"));
    els.joinGameButton.setAttribute("aria-pressed", String(mode === "join"));
    els.joinFields.hidden = mode !== "join";
    els.connectButton.textContent = mode === "create" ? "Create room" : "Join room";
    els.multiplayerHint.textContent = mode === "create"
      ? "Both players draw from the same shuffled deck on one clock. Discards go back into the deck at random."
      : "Enter the six-character code from the host's invite. The host starts the race.";
  }

  function openMultiplayerDialog(opener) {
    if (Sheet) Sheet.setError(els.multiplayerDialog, "");
    if (!room) {
      showAlert("Multiplayer is unavailable: the room script did not load.");
      return;
    }
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (Sheet) Sheet.open(els.multiplayerDialog, { dismissible: true, returnFocus: opener, initialFocus: coarse ? null : els.playerNameInput });
    else if (typeof els.multiplayerDialog.showModal === "function") els.multiplayerDialog.showModal();
  }

  function setConnectBusy(busy) {
    els.connectButton.disabled = busy;
    els.connectButton.setAttribute("aria-busy", String(busy));
    if (busy) els.connectButton.textContent = "Connecting…";
    else setSetupMode(setupMode);
  }

  async function connect() {
    if (!room) return;
    const name = cleanName(els.playerNameInput.value);
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch (error) {
      // Storage may be unavailable.
    }
    if (Sheet) Sheet.setError(els.multiplayerDialog, "");
    setConnectBusy(true);
    try {
      if (setupMode === "create") {
        await room.create(name);
      } else {
        const code = cleanCode(els.joinInviteCode.value);
        if (!code) throw new Error("Enter the six-character room code.");
        await room.join(code, name);
      }
      history.replaceState(null, "", `#${room.roomCode}`);
      latestRoster = room.snapshot().players;
      playMode = "room";
      localPlayerId = room.clientId;
      remoteOptions = null;
      els.multiplayerDialog.close();
      showRoom();
      if (room.isHost) publishLobby();
      els.roomTitle.focus({ preventScroll: true });
    } catch (error) {
      showError(error.message);
    } finally {
      setConnectBusy(false);
    }
  }

  function bindRoom() {
    if (!room) return;
    room.onStatus = (status, message) => {
      const state = status === "connected" ? "connected" : status === "reconnecting" ? "reconnecting" : "offline";
      els.connection.dataset.state = state;
      const label = state === "connected" ? "Connected" : state === "reconnecting" ? "Recovering" : "Offline";
      els.connection.firstElementChild.textContent = label;
      els.connection.title = label;
      els.connection.className = `badge connection ${state === "connected" ? "badge--good" : "badge--warn"}`;
      if (state === "reconnecting") {
        if (!els.gameView.hidden) showGameBanner("The host disconnected; recovering the room.", "");
        else showRoomBanner("The host disconnected; recovering the room.");
      }
      notify(message);
    };
    room.onError = (error) => {
      if (/closed this room/.test(error.message)) {
        hostGone(error.message);
        return;
      }
      showError(error.message);
    };
    room.onRoster = (roster) => {
      latestRoster = roster;
      if (playMode === "room") showRoom();
      if (playMode === "host" || playMode === "peer") {
        renderPlayers();
        const gone = roster.filter((player) => player.connected === false);
        if (gone.length && game && game.status === "playing") {
          showGameBanner(`${gone.map((player) => player.name).join(", ")} disconnected. Their hand is frozen; keep racing or end the run.`, "");
        } else if (!gone.length && !els.gameBanner.hidden) {
          hideGameBanner();
        }
      }
    };
    room.onState = (state) => {
      if (!state || typeof state !== "object") return;
      if (state.kind === "rush-lobby") {
        if (!room.isHost) remoteOptions = state.options;
        // A lobby state while a race is still running is stale; once the
        // race is over it means the host went back to the room.
        if ((playMode === "host" || playMode === "peer") && game && game.status === "playing") return;
        showRoom();
        return;
      }
      if (state.kind === "rush" && state.view) {
        playMode = room.isHost ? "host" : "peer";
        localPlayerId = room.clientId;
        applyRemoteState(state.view);
      }
    };
    room.onAction = (clientId, action) => {
      if (!action || !multiplayerGame) return;
      if (action.type === "discard") enqueueHostAction(clientId, { action: "discard", index: action.index });
      if (action.type === "end") enqueueHostAction(clientId, { action: "end" });
    };
    room.onBecomeHost = (recovered) => {
      // The engine lives on the old host, so a run cannot continue here; the
      // room does, with this player as its host.
      multiplayerGame = null;
      if (game && game.status === "playing" && playMode === "peer") {
        game.status = "ended";
        game.endReason = "The host left the room";
        renderStatus();
        showGameOver();
      }
      playMode = "host";
      if (recovered && recovered.kind === "rush-lobby" && recovered.options) remoteOptions = recovered.options;
      if (els.gameView.hidden) {
        showRoom();
        publishLobby();
      }
      showAlert("You are now the host of this room.");
    };
  }

  function hostGone(message) {
    closeRoomQuietly();
    multiplayerGame = null;
    showAlert(message);
    if (els.gameView.hidden) {
      backToLobby();
      return;
    }
    // The race view stays up with the result; Play again starts a solo
    // random run and Options goes back to the lobby.
    playMode = "single";
    lastStartKind = "random";
    if (game && game.status === "playing") {
      game.status = "ended";
      game.endReason = "The host closed the room";
      renderStatus();
      showGameOver();
    }
    showView("game");
  }

  // leave() tells the host first; when the host is already gone that send
  // throws, so fall back to resetting the room's runtime.
  function closeRoomQuietly() {
    if (!room) return;
    try {
      room.leave();
    } catch (error) {
      room.resetRuntime();
    }
  }

  function publishLobby() {
    if (!room || !room.isHost) return;
    room.publishState({ kind: "rush-lobby", options: readOptions("", true) });
  }

  function currentRoomOptions() {
    return room && room.isHost ? readOptions("", true) : remoteOptions;
  }

  function showRoomBanner(message) {
    els.roomBanner.firstElementChild.textContent = message;
    els.roomBanner.hidden = false;
  }

  function showRoom() {
    if (!room) return;
    playMode = "room";
    multiplayerGame = null;
    showView("room");
    const roster = latestRoster.length ? latestRoster : room.snapshot().players;
    const host = roster.find((player) => player.host);
    const connected = roster.filter((player) => player.connected !== false);
    const full = roster.length >= 2;
    els.inviteCode.textContent = room.roomCode || "------";
    els.roomTitle.textContent = full ? "Ready to race" : "Waiting for a player";
    els.roomLede.textContent = room.isHost
      ? "Share the code or the invite link. Start the race once your opponent is in."
      : `${host ? host.name : "The host"} starts the race once both players are in. Keep this page open.`;
    els.rosterCount.textContent = `${roster.length} of 2`;
    const fragment = document.createDocumentFragment();
    for (let seat = 0; seat < 2; seat += 1) {
      const player = roster[seat];
      if (!player) {
        const empty = document.createElement("div");
        empty.className = "seat seat--lobby seat--empty";
        empty.innerHTML = '<span class="seat-avatar" aria-hidden="true"></span><span class="seat-name"><strong>Open seat</strong></span><span class="seat-meta"><small class="seat-badge">Waiting</small></span>';
        empty.querySelector(".seat-avatar").textContent = String(seat + 1);
        fragment.append(empty);
        continue;
      }
      const disconnected = player.connected === false;
      fragment.append(seatMarkup(player, {
        status: player.host ? "Host" : disconnected ? "Reconnecting" : "Ready",
        tone: disconnected ? "warn" : player.host ? "accent" : "good",
        me: player.id === room.clientId,
        host: Boolean(player.host),
        disconnected,
      }));
    }
    els.roster.replaceChildren(fragment);
    const options = currentRoomOptions();
    renderChips(els.roomOptions, options ? optionFacts(options) : ["Waiting for the host's options"]);
    els.roomOptionsButton.hidden = !room.isHost;
    els.startGameButton.hidden = !room.isHost;
    els.startGameButton.disabled = connected.length < 2;
    els.roomWait.hidden = room.isHost;
    if (room.isHost) {
      els.connectionStatus.textContent = connected.length >= 2 ? "Both players are connected." : "One more player to go.";
    }
    els.roomBanner.hidden = true;
    els.roomError.textContent = "";
  }

  async function confirmLeaveRoom() {
    if (!room) return;
    const racing = game && game.status === "playing" && (playMode === "host" || playMode === "peer");
    const text = room.isHost
      ? `${racing ? "The race ends for both players. " : ""}The room closes and your opponent is disconnected.`
      : `${racing ? "Your hand freezes and the host can finish alone. " : ""}You can rejoin with the room code while the host keeps the page open.`;
    const ok = Sheet
      ? await Sheet.confirm({ title: room.isHost ? "Close the room?" : "Leave the room?", text, verb: room.isHost ? "Close room" : "Leave", danger: true, sheet: true })
      : window.confirm(text);
    if (ok) {
      leaveRoom();
      backToLobby();
    }
  }

  function leaveRoom({ silent = false } = {}) {
    if (!room) return;
    if (room.connected || room.peer) closeRoomQuietly();
    history.replaceState(null, "", location.pathname);
    multiplayerGame = null;
    latestRoster = [];
    remoteOptions = null;
    hostActionQueue = [];
    isProcessingHostActions = false;
    playMode = "single";
    localPlayerId = "solo";
    if (!silent) els.connection.hidden = true;
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("aria-hidden", "true");
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (!ok) throw new Error("Copy failed.");
  }

  async function copyWithFeedback(text, message) {
    try {
      await copyText(text);
      notify(message);
    } catch (error) {
      showError("Copying failed. Select the room code and copy it by hand.");
    }
  }

  /* ---------- Multiplayer: the race ---------- */

  function startHostedMultiplayer() {
    if (!room || !room.isHost) return;
    const roster = latestRoster.length ? latestRoster : room.snapshot().players;
    const players = roster.filter((player) => player.connected !== false).slice(0, 2);
    if (players.length < 2) {
      showError("Wait for your opponent to connect before starting.");
      return;
    }
    const seed = randomSeed();
    multiplayerGame = new PokerRushMultiplayerGame(readOptions(seed, true), players.map((player) => ({ id: player.id, name: player.name })));
    playMode = "host";
    localPlayerId = room.clientId;
    lastSeed = seed;
    lastStartKind = "multiplayer";
    resetRenderState();
    setMatrixVisible(false, { renderNow: false });
    broadcastMultiplayerState({ animateHand: true });
  }

  let pendingRenderOptions = null;

  function applyRemoteState(view) {
    const fresh = !game || game.seed !== view.seed || els.gameView.hidden;
    if (fresh) {
      resetRenderState();
      setMatrixVisible(false, { renderNow: false });
      if (els.gameOver.open) els.gameOver.close();
      hideGameBanner();
    }
    isResolving = false;
    const options = pendingRenderOptions || { animateHand: fresh };
    pendingRenderOptions = null;
    if (els.gameView.hidden) {
      showView("game");
      hideGameBanner();
      ensureAudio();
    }
    setGameView(view, { ...options, forceMatrix: true, forceScores: true });
    playScoreEvents(game.lastEvents);
    if (fresh) {
      startTimer();
      const firstCard = slotCard(els.hand.firstElementChild);
      if (firstCard && !window.matchMedia("(pointer: coarse)").matches) firstCard.focus({ preventScroll: true });
    }
  }

  function broadcastMultiplayerState(renderOptions = null) {
    if (!multiplayerGame || !room) return;
    const views = {};
    for (const player of multiplayerGame.players) views[player.id] = serializeView(multiplayerGame.viewForPlayer(player.id));
    pendingRenderOptions = renderOptions;
    room.publishState({ kind: "rush", views }, (state, clientId) => ({ kind: "rush", view: state.views[clientId] || null }));
  }

  function enqueueHostAction(playerId, message) {
    if (!playerId || !multiplayerGame) return;
    hostActionQueue.push({ playerId, message, receivedAt: performance.now() });
    if (isProcessingHostActions) return;
    isProcessingHostActions = true;
    window.setTimeout(processHostActions, 0);
  }

  function processHostActions() {
    if (!multiplayerGame) {
      hostActionQueue = [];
      isProcessingHostActions = false;
      return;
    }
    hostActionQueue.sort((a, b) => {
      const timeDiff = a.receivedAt - b.receivedAt;
      if (timeDiff) return timeDiff;
      const leftPlayer = multiplayerGame.playerById(a.playerId)?.index || 0;
      const rightPlayer = multiplayerGame.playerById(b.playerId)?.index || 0;
      return leftPlayer - rightPlayer;
    });
    while (hostActionQueue.length) {
      const action = hostActionQueue.shift();
      if (action.message.action === "discard") {
        multiplayerGame.discardCard(action.playerId, action.message.index);
      } else if (action.message.action === "end") {
        multiplayerGame.endGame(action.playerId);
      }
    }
    isProcessingHostActions = false;
    broadcastMultiplayerState();
  }

  /* ---------- Actions ---------- */

  function discardAt(index) {
    if (!game || game.status !== "playing" || isResolving) return;
    const slot = els.hand.children[index];
    if (!slotCard(slot)) return;
    isResolving = true;
    playDiscardSound();
    animateCardSlot(slot, "is-discarding");
    if (playMode === "host" || playMode === "peer") {
      window.setTimeout(() => {
        try {
          room.sendAction({ type: "discard", index });
        } catch (error) {
          isResolving = false;
          showError(error.message);
        }
      }, 120);
      return;
    }
    window.setTimeout(() => {
      const result = game.discardCard(index);
      const scoreEvents = result.events ? result.events.filter((event) => event.type === "score") : [];
      renderMetrics();
      renderHand({ changedIndex: index });
      if (scoreEvents.length) renderScores();
      renderMatrix();
      renderStatus();
      if (game.status !== "playing") showGameOver();
      playScoreEvents(scoreEvents);
      isResolving = false;
    }, 120);
  }

  function endCurrentGame() {
    if (!game || game.status !== "playing") return;
    if (playMode === "host" || playMode === "peer") {
      try {
        room.sendAction({ type: "end" });
      } catch (error) {
        showError(error.message);
      }
      return;
    }
    game.endGame();
    renderMetrics();
    renderStatus();
    showGameOver();
  }

  function animateScore(rank) {
    els.tableSurface.classList.remove("score-pulse");
    window.requestAnimationFrame(() => {
      els.tableSurface.classList.add("score-pulse");
    });
    const count = rank === "royal_flush" ? 42 : rank === "straight_flush" ? 28 : rank === "four_kind" ? 22 : 14;
    for (let i = 0; i < count; i += 1) {
      const particle = document.createElement("span");
      particle.className = `particle ${rank}`;
      const angle = (Math.PI * 2 * i) / count;
      const distance = 72 + (i % 5) * 18;
      particle.style.left = `${48 + (i % 7)}%`;
      particle.style.top = `${42 + (i % 4)}%`;
      particle.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
      particle.style.setProperty("--y", `${Math.sin(angle) * distance}px`);
      els.tableSurface.append(particle);
      window.setTimeout(() => particle.remove(), 820);
    }
  }

  /* ---------- Game over ---------- */

  function statTile(label, value, extraClass = "") {
    const stat = document.createElement("div");
    stat.className = `stat${extraClass ? ` ${extraClass}` : ""}`;
    const labelEl = document.createElement("span");
    labelEl.className = "stat-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("strong");
    valueEl.className = "stat-value";
    valueEl.textContent = value;
    stat.append(labelEl, valueEl);
    return stat;
  }

  function showGameOver() {
    if (!game) return;
    if (timerId) window.clearInterval(timerId);
    const multiplayer = Boolean(game.multiplayer && game.players && game.players.length);
    if (!multiplayer && playMode === "single" && !game.recorded) {
      game.recorded = true;
      recordSoloResult(game);
    }
    const hands = game.scoredHands.length;
    els.gameOverTitle.textContent = game.endReason || "Game over";
    const stats = [];
    if (multiplayer) {
      const ranked = game.players.slice().sort((a, b) => b.score - a.score);
      const [first, second] = ranked;
      const tie = second && first.score === second.score;
      els.gameOverKicker.textContent = "Race over";
      els.gameOverSummary.textContent = tie
        ? `It's a tie at ${first.score} point${first.score === 1 ? "" : "s"} each.`
        : `${first.name} wins ${first.score}–${second ? second.score : 0}${first.isLocal ? ". That's you." : "."}`;
      game.players.forEach((player) => stats.push(statTile(player.isLocal ? "You" : player.name, `${player.score} pts`, !tie && player.id === first.id ? "is-good" : "")));
      stats.push(statTile("Seed", game.seed));
    } else {
      els.gameOverKicker.textContent = "Run over";
      els.gameOverSummary.textContent = `${game.score} point${game.score === 1 ? "" : "s"} from ${hands} scored hand${hands === 1 ? "" : "s"}.${recordNote ? ` ${recordNote}` : ""}`;
      stats.push(statTile("Score", String(game.score), recordNote ? "is-good" : ""));
      stats.push(statTile("Hands", String(hands)));
      stats.push(statTile("Discards", String(game.userDiscardCount)));
      stats.push(statTile("Seed", game.seed));
    }
    els.gameOverStats.replaceChildren(...stats);
    const guest = playMode === "peer";
    els.againButton.hidden = guest;
    els.gameOverWait.hidden = !guest;
    els.againButton.textContent = playMode === "host" ? "Race again" : "Play again";
    els.backButton.textContent = playMode === "host" || playMode === "peer" ? "Back to room" : "Options";
    if (els.gameOver.open) return;
    if (Sheet) Sheet.open(els.gameOver, { dismissible: true, returnFocus: els.endGameButton, initialFocus: guest ? els.backButton : els.againButton });
    else if (typeof els.gameOver.showModal === "function") els.gameOver.showModal();
  }

  function backToLobby() {
    if (timerId) window.clearInterval(timerId);
    if (els.gameOver.open) els.gameOver.close();
    if ((playMode === "host" || playMode === "peer") && room && room.connected) {
      // Back to the room: the peer stays connected for another race.
      multiplayerGame = null;
      game = null;
      setMatrixVisible(false, { renderNow: false });
      playMode = "room";
      showRoom();
      if (room.isHost) publishLobby();
      return;
    }
    leaveRoom({ silent: true });
    game = null;
    setMatrixVisible(false, { renderNow: false });
    showView("lobby");
    renderRecords();
    renderOptionsSummary();
  }

  /* ---------- Events ---------- */

  document.addEventListener("keydown", (event) => {
    if (!game || game.status !== "playing") return;
    if (document.querySelector("dialog[open]")) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
    if (/^[1-7]$/.test(event.key)) {
      const index = Number(event.key) - 1;
      if (index < game.hand.length) {
        event.preventDefault();
        discardAt(index);
      }
    }
  });

  els.hand.addEventListener("click", (event) => {
    const button = event.target.closest("button.playing-card");
    if (!button || !els.hand.contains(button)) return;
    discardAt(Number(button.dataset.index));
  });
  els.dailyButton.addEventListener("click", () => startGame("daily"));
  els.randomButton.addEventListener("click", () => startGame("random"));
  els.multiplayerButton.addEventListener("click", (event) => openMultiplayerDialog(event.currentTarget));
  els.optionsButton.addEventListener("click", (event) => openOptions(event.currentTarget));
  els.roomOptionsButton.addEventListener("click", (event) => openOptions(event.currentTarget));
  els.optionsCloseButton.addEventListener("click", () => els.optionsDialog.close());
  els.optionsDoneButton.addEventListener("click", () => els.optionsDialog.close());
  els.optionsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    els.optionsDialog.close();
  });
  els.newDailyButton.addEventListener("click", () =>
    confirmThen(() => startGame("daily"), { title: "Start today's daily?", text: runSummaryText(), verb: "Restart" }),
  );
  els.newRandomButton.addEventListener("click", () =>
    confirmThen(() => startGame("random"), { title: "Start a random run?", text: runSummaryText(), verb: "Restart" }),
  );
  els.endGameButton.addEventListener("click", () =>
    confirmThen(endCurrentGame, {
      title: playMode === "host" || playMode === "peer" ? "End the race?" : "End the run?",
      text: playMode === "host" || playMode === "peer" ? "The race ends for both players and the scores stand as they are." : "The run ends now and the score stands as it is.",
      verb: "End",
    }),
  );
  els.matrixToggleButton.addEventListener("click", () => setMatrixVisible(!matrixVisible));
  els.hostGameButton.addEventListener("click", () => setSetupMode("create"));
  els.joinGameButton.addEventListener("click", () => setSetupMode("join"));
  els.joinInviteCode.addEventListener("input", () => {
    els.joinInviteCode.value = cleanCode(els.joinInviteCode.value);
  });
  els.joinInviteCode.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      connect();
    }
  });
  els.playerNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      connect();
    }
  });
  els.connectButton.addEventListener("click", connect);
  els.multiplayerCloseButton.addEventListener("click", () => els.multiplayerDialog.close());
  els.startGameButton.addEventListener("click", startHostedMultiplayer);
  els.leaveRoomButton.addEventListener("click", confirmLeaveRoom);
  els.copyCodeButton.addEventListener("click", () => copyWithFeedback(room ? room.roomCode : "", "Room code copied."));
  els.copyInviteButton.addEventListener("click", () => {
    const url = `${location.origin}${location.pathname}#${room ? room.roomCode : ""}`;
    copyWithFeedback(`Race me at Poker Rush: ${url}\nRoom code: ${room ? room.roomCode : ""}`, "Invite copied.");
  });
  els.againButton.addEventListener("click", () => {
    els.gameOver.close();
    restartGame();
  });
  els.backButton.addEventListener("click", backToLobby);
  els.soundButton.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    els.soundButton.classList.toggle("is-muted", !soundEnabled);
    els.soundButton.setAttribute("aria-pressed", String(soundEnabled));
    els.soundButton.title = soundEnabled ? "Sound effects" : "Sound effects (off)";
  });
  els.instructionsButton.addEventListener("click", (event) => {
    if (Sheet) Sheet.open(els.instructionsDialog, { dismissible: true, returnFocus: event.currentTarget });
    else if (typeof els.instructionsDialog.showModal === "function") els.instructionsDialog.showModal();
    else window.alert("Score straights or better. Click or press 1-7 to discard.");
  });
  window.addEventListener("pagehide", () => {
    if (room && room.connected) closeRoomQuietly();
  });

  /* ---------- Boot ---------- */

  function initialize() {
    bindRoom();
    renderRecords();
    renderOptionsSummary();
    try {
      els.playerNameInput.value = localStorage.getItem(NAME_KEY) || "";
    } catch (error) {
      // Storage may be unavailable.
    }
    const code = cleanCode(location.hash.slice(1));
    setSetupMode(code ? "join" : "create");
    if (code) {
      els.joinInviteCode.value = code;
      openMultiplayerDialog(els.multiplayerButton);
    }
  }

  initialize();
})();
