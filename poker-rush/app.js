(function () {
  "use strict";

  const {
    PokerRushGame,
    PokerRushMultiplayerGame,
    RANKS,
    SUITS,
    createDeck,
  } = window.PokerRushCore;

  const els = {
    lobby: document.querySelector("#lobby"),
    gameView: document.querySelector("#gameView"),
    optionsForm: document.querySelector("#optionsForm"),
    dailyButton: document.querySelector("#dailyButton"),
    randomButton: document.querySelector("#randomButton"),
    multiplayerButton: document.querySelector("#multiplayerButton"),
    newDailyButton: document.querySelector("#newDailyButton"),
    newRandomButton: document.querySelector("#newRandomButton"),
    instructionsButton: document.querySelector("#instructionsButton"),
    instructionsDialog: document.querySelector("#instructionsDialog"),
    scoreValue: document.querySelector("#scoreValue"),
    timeValue: document.querySelector("#timeValue"),
    seenValue: document.querySelector("#seenValue"),
    discardValue: document.querySelector("#discardValue"),
    deckValue: document.querySelector("#deckValue"),
    uniqueSeenValue: document.querySelector("#uniqueSeenValue"),
    scoreSummary: document.querySelector("#scoreSummary"),
    scoreStrip: document.querySelector("#scoreStrip"),
    playersPanel: document.querySelector("#playersPanel"),
    scoredHands: document.querySelector("#scoredHands"),
    scoreList: document.querySelector("#scoreList"),
    pointsBreakdown: document.querySelector("#pointsBreakdown"),
    hand: document.querySelector("#hand"),
    cardMatrix: document.querySelector("#cardMatrix"),
    statusLine: document.querySelector("#statusLine"),
    seedBadge: document.querySelector("#seedBadge"),
    modeBadge: document.querySelector("#modeBadge"),
    tableSurface: document.querySelector(".table-surface"),
    soundButton: document.querySelector("#soundButton"),
    endGameButton: document.querySelector("#endGameButton"),
    gameOver: document.querySelector("#gameOver"),
    gameOverTitle: document.querySelector("#gameOverTitle"),
    gameOverSummary: document.querySelector("#gameOverSummary"),
    againButton: document.querySelector("#againButton"),
    backButton: document.querySelector("#backButton"),
    multiplayerDialog: document.querySelector("#multiplayerDialog"),
    playerNameInput: document.querySelector("#playerNameInput"),
    hostGameButton: document.querySelector("#hostGameButton"),
    inviteCode: document.querySelector("#inviteCode"),
    answerCodeInput: document.querySelector("#answerCodeInput"),
    acceptAnswerButton: document.querySelector("#acceptAnswerButton"),
    joinGameButton: document.querySelector("#joinGameButton"),
    joinInviteCode: document.querySelector("#joinInviteCode"),
    joinAnswerCode: document.querySelector("#joinAnswerCode"),
    connectionStatus: document.querySelector("#connectionStatus"),
  };

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
  let renderedScoreIds = new Set();
  let isResolving = false;
  let playMode = "single";
  let multiplayerGame = null;
  let localPlayerId = "host";
  let hostPeerConnection = null;
  let joinPeerConnection = null;
  let hostChannel = null;
  let joinChannel = null;
  let hostPeers = new Map();
  let pendingHostChannel = null;
  let hostActionQueue = [];
  let isProcessingHostActions = false;
  let networkSeq = 0;

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

  function serializeView(view) {
    return {
      ...view,
      seenCounts: Array.from(view.seenCounts || []),
      discardedCounts: Array.from(view.discardedCounts || []),
      scoredCounts: Array.from(view.scoredCounts || []),
      deckCount: view.deckCount === Infinity ? "Infinity" : view.deckCount,
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

  function startGame(kind) {
    closeMultiplayerConnections();
    playMode = "single";
    multiplayerGame = null;
    localPlayerId = "solo";
    lastStartKind = kind;
    lastSeed = kind === "daily" ? dailySeed() : randomSeed();
    game = new PokerRushGame(readOptions(lastSeed));
    resetRenderState();
    els.lobby.hidden = true;
    els.gameView.hidden = false;
    els.gameOver.hidden = true;
    ensureAudio();
    render({ animateHand: true, forceMatrix: true, forceScores: true });
    startTimer();
    const scoreEvent = game.lastEvents.find((event) => event.type === "score");
    if (scoreEvent) {
      animateScore(scoreEvent.record.evaluation.key);
      playScoreSound(scoreEvent.record.evaluation.key);
    }
  }

  function restartGame() {
    startGame(lastStartKind);
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

  function createCardSlot(index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "playing-card";
    button.addEventListener("click", () => discardAt(index));

    const rank = document.createElement("span");
    rank.className = "rank";

    const suit = document.createElement("span");
    suit.className = "suit";
    suit.setAttribute("aria-hidden", "true");

    const hotkey = document.createElement("span");
    hotkey.className = "hotkey";
    hotkey.textContent = String(index + 1);

    button.append(rank, suit, hotkey);
    return button;
  }

  function ensureHandSlots(size) {
    while (els.hand.children.length < size) {
      els.hand.append(createCardSlot(els.hand.children.length));
    }
    while (els.hand.children.length > size) {
      els.hand.lastElementChild.remove();
    }
    els.hand.style.setProperty("--hand-size", size);
  }

  function clearCardAnimation(button) {
    button.classList.remove("is-new", "is-discarding");
  }

  function updateCardSlot(button, card, index) {
    button.hidden = !card;
    if (!card) return;
    button.dataset.suit = card.suit;
    button.dataset.joker = String(card.isJoker);
    button.dataset.cardId = card.id;
    button.setAttribute("aria-label", `Discard ${cardLabel(card)} in slot ${index + 1}`);
    button.querySelector(".rank").textContent = card.isJoker ? "JK" : card.rank;
    button.querySelector(".hotkey").textContent = String(index + 1);
  }

  function animateCardSlot(button, className) {
    clearCardAnimation(button);
    button.offsetHeight;
    button.classList.add(className);
    window.setTimeout(() => clearCardAnimation(button), 300);
  }

  function renderHand({ changedIndex = null, animateAll = false } = {}) {
    const size = game.options.handSize;
    ensureHandSlots(size);
    for (let index = 0; index < size; index += 1) {
      const card = game.hand[index] || null;
      const button = els.hand.children[index];
      const oldId = previousHandIds[index] || "";
      const nextId = card ? card.id : "";
      const changed = oldId !== nextId;
      if (changed) updateCardSlot(button, card, index);
      if (changed && (animateAll || changedIndex === index)) {
        animateCardSlot(button, "is-new");
      }
    }
    previousHandIds = Array.from({ length: size }, (_, index) => (game.hand[index] ? game.hand[index].id : ""));
  }

  function scoreCardsMarkup(record) {
    const wrapper = document.createElement("div");
    wrapper.className = "mini-cards";
    for (const card of record.cards) {
      const mini = document.createElement("span");
      mini.className = "mini-card";
      mini.dataset.suit = card.suit;
      mini.textContent = card.isJoker ? "JK" : card.rank;
      mini.title = cardLabel(card);
      wrapper.append(mini);
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

    const listFragment = document.createDocumentFragment();
    visibleHands.forEach((record) => {
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
      const body = document.createElement("span");
      body.textContent = " ";
      empty.append(title, body);
      listFragment.append(empty);
    }
    els.scoreList.replaceChildren(listFragment);
    renderedScoreIds = new Set(hands.map((record) => record.id));
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
      const chip = document.createElement("div");
      chip.className = "player-chip";
      if (player.isLocal) chip.classList.add("is-local");
      const name = document.createElement("strong");
      name.textContent = player.name;
      const score = document.createElement("span");
      score.textContent = `${player.score} pts`;
      const meta = document.createElement("small");
      meta.textContent = `${player.scoredHands} hands · ${player.discards} discards`;
      chip.append(name, score, meta);
      fragment.append(chip);
    });
    els.playersPanel.replaceChildren(fragment);
  }

  function renderMatrix({ force = false } = {}) {
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

  function buildMatrix(baseDeck) {
    const byId = new Map(baseDeck.map((card) => [card.baseId, card]));
    const fragment = document.createDocumentFragment();
    matrixCellsById = new Map();

    SUITS.forEach((suit) => {
      const row = document.createElement("div");
      row.className = "matrix-row";
      const label = document.createElement("div");
      label.className = "matrix-label";
      label.textContent = suit;
      row.append(label);

      RANKS.forEach((rank) => {
        const card = byId.get(`${rank}${suit}`);
        row.append(createMatrixCell(card));
      });
      fragment.append(row);
    });

    if (game.options.jokers > 0) {
      const row = document.createElement("div");
      row.className = "matrix-row jokers";
      const label = document.createElement("div");
      label.className = "matrix-label";
      label.textContent = "J";
      row.append(label);
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

    const rank = document.createElement("span");
    rank.className = "matrix-rank";
    rank.textContent = card.isJoker ? `J${card.jokerIndex}` : card.rank;
    cell.append(rank);

    if (!card.isJoker) {
      const suitDot = document.createElement("span");
      suitDot.className = "suit-dot";
      cell.append(suitDot);
    }

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
      els.statusLine.innerHTML = `<strong>${scoreEvent.record.evaluation.label}</strong> scored for ${scoreEvent.record.points} pt${scoreEvent.record.points === 1 ? "" : "s"}`;
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

  function multiplayerName() {
    return (els.playerNameInput.value || "Player").trim().slice(0, 18) || "Player";
  }

  function setConnectionStatus(text) {
    els.connectionStatus.textContent = text;
  }

  function encodeSignal(value) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(value))));
  }

  function decodeSignal(value) {
    return JSON.parse(decodeURIComponent(escape(atob(value.trim()))));
  }

  function createPeerConnection() {
    return new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
  }

  function waitForIceGathering(peerConnection) {
    if (peerConnection.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve) => {
      const timeout = window.setTimeout(resolve, 1800);
      peerConnection.addEventListener("icegatheringstatechange", () => {
        if (peerConnection.iceGatheringState === "complete") {
          window.clearTimeout(timeout);
          resolve();
        }
      });
    });
  }

  function sendChannel(channel, payload) {
    if (channel && channel.readyState === "open") {
      channel.send(JSON.stringify(payload));
    }
  }

  function closeMultiplayerConnections() {
    for (const channel of hostPeers.values()) channel.close();
    hostPeers = new Map();
    if (pendingHostChannel) pendingHostChannel.close();
    if (hostChannel) hostChannel.close();
    if (joinChannel) joinChannel.close();
    if (hostPeerConnection) hostPeerConnection.close();
    if (joinPeerConnection) joinPeerConnection.close();
    hostPeerConnection = null;
    joinPeerConnection = null;
    hostChannel = null;
    joinChannel = null;
    pendingHostChannel = null;
    hostActionQueue = [];
    isProcessingHostActions = false;
  }

  function openMultiplayerDialog() {
    closeMultiplayerConnections();
    playMode = "setup";
    els.inviteCode.value = "";
    els.answerCodeInput.value = "";
    els.joinInviteCode.value = "";
    els.joinAnswerCode.value = "";
    setConnectionStatus("Idle");
    if (typeof els.multiplayerDialog.showModal === "function") {
      els.multiplayerDialog.showModal();
    }
  }

  async function createHostInvite() {
    closeMultiplayerConnections();
    setConnectionStatus("Creating invite");
    localPlayerId = "host";
    hostPeerConnection = createPeerConnection();
    pendingHostChannel = hostPeerConnection.createDataChannel("poker-rush", { ordered: true });
    setupHostChannel(pendingHostChannel);
    const offer = await hostPeerConnection.createOffer();
    await hostPeerConnection.setLocalDescription(offer);
    await waitForIceGathering(hostPeerConnection);
    els.inviteCode.value = encodeSignal(hostPeerConnection.localDescription);
    setConnectionStatus("Invite ready");
  }

  async function createJoinAnswer() {
    closeMultiplayerConnections();
    setConnectionStatus("Creating answer");
    localPlayerId = `p${randomSeed().slice(3, 9)}`;
    joinPeerConnection = createPeerConnection();
    joinPeerConnection.addEventListener("datachannel", (event) => {
      joinChannel = event.channel;
      setupJoinChannel(joinChannel);
    });
    await joinPeerConnection.setRemoteDescription(decodeSignal(els.joinInviteCode.value));
    const answer = await joinPeerConnection.createAnswer();
    await joinPeerConnection.setLocalDescription(answer);
    await waitForIceGathering(joinPeerConnection);
    els.joinAnswerCode.value = encodeSignal(joinPeerConnection.localDescription);
    setConnectionStatus("Answer ready");
  }

  async function acceptJoinAnswer() {
    if (!hostPeerConnection) return;
    setConnectionStatus("Connecting");
    await hostPeerConnection.setRemoteDescription(decodeSignal(els.answerCodeInput.value));
  }

  function setupHostChannel(channel) {
    channel.addEventListener("open", () => {
      setConnectionStatus("Peer connected");
    });
    channel.addEventListener("close", () => {
      setConnectionStatus("Peer disconnected");
    });
    channel.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "hello") {
        const peerId = message.playerId || `p${hostPeers.size + 2}`;
        channel.playerId = peerId;
        hostPeers.set(peerId, channel);
        sendChannel(channel, { type: "welcome", playerId: peerId });
        startHostedMultiplayer(peerId, message.name || "Player 2");
      } else if (message.type === "action") {
        enqueueHostAction(channel.playerId, message);
      }
    });
  }

  function setupJoinChannel(channel) {
    channel.addEventListener("open", () => {
      setConnectionStatus("Connected");
      sendChannel(channel, {
        type: "hello",
        playerId: localPlayerId,
        name: multiplayerName(),
      });
    });
    channel.addEventListener("close", () => {
      setConnectionStatus("Disconnected");
    });
    channel.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "welcome") {
        localPlayerId = message.playerId;
      } else if (message.type === "state") {
        playMode = "peer";
        applyRemoteState(message.view);
      }
    });
  }

  function startHostedMultiplayer(peerId, peerName) {
    if (multiplayerGame) {
      broadcastMultiplayerState();
      return;
    }
    const seed = randomSeed();
    const players = [
      { id: "host", name: multiplayerName() || "Host" },
      { id: peerId, name: peerName },
    ];
    multiplayerGame = new PokerRushMultiplayerGame(readOptions(seed, true), players);
    playMode = "host";
    localPlayerId = "host";
    lastSeed = seed;
    lastStartKind = "multiplayer";
    resetRenderState();
    els.lobby.hidden = true;
    els.gameView.hidden = false;
    els.gameOver.hidden = true;
    if (els.multiplayerDialog.open) els.multiplayerDialog.close();
    const hostView = multiplayerGame.viewForPlayer(localPlayerId);
    setGameView(hostView, {
      animateHand: true,
      forceMatrix: true,
      forceScores: true,
    });
    startTimer();
    broadcastMultiplayerState();
  }

  function applyRemoteState(view) {
    if (playMode !== "peer" || !game) resetRenderState();
    isResolving = false;
    els.lobby.hidden = true;
    els.gameView.hidden = false;
    els.gameOver.hidden = true;
    if (els.multiplayerDialog.open) els.multiplayerDialog.close();
    setGameView(view, { forceMatrix: true, forceScores: true });
    playScoreEvents(game.lastEvents);
    startTimer();
  }

  function broadcastMultiplayerState() {
    if (!multiplayerGame) return;
    const hostView = multiplayerGame.viewForPlayer(localPlayerId);
    setGameView(hostView, {
      forceMatrix: true,
      forceScores: true,
    });
    playScoreEvents(hostView.lastEvents);
    for (const [playerId, channel] of hostPeers.entries()) {
      sendChannel(channel, {
        type: "state",
        view: serializeView(multiplayerGame.viewForPlayer(playerId)),
      });
    }
  }

  function enqueueHostAction(playerId, message) {
    if (!playerId || !multiplayerGame) return;
    hostActionQueue.push({
      playerId,
      message,
      receivedAt: performance.now(),
    });
    if (isProcessingHostActions) return;
    isProcessingHostActions = true;
    window.setTimeout(processHostActions, 0);
  }

  function processHostActions() {
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

  function sendPeerAction(action) {
    sendChannel(joinChannel, {
      type: "action",
      action: action.action,
      index: action.index,
      seq: ++networkSeq,
      sentAt: performance.now(),
    });
  }

  function discardAt(index) {
    if (!game || game.status !== "playing" || isResolving) return;
    const button = els.hand.children[index];
    if (!button || button.hidden) return;
    isResolving = true;
    playDiscardSound();
    animateCardSlot(button, "is-discarding");
    if (playMode === "host") {
      window.setTimeout(() => {
        enqueueHostAction(localPlayerId, { action: "discard", index, seq: ++networkSeq });
        isResolving = false;
      }, 120);
      return;
    }
    if (playMode === "peer") {
      window.setTimeout(() => {
        sendPeerAction({ action: "discard", index });
      }, 120);
      return;
    }
    window.setTimeout(() => {
      const result = game.discardCard(index);
      const scoreEvents = result.events ? result.events.filter((event) => event.type === "score") : [];
      renderMetrics();
      renderHand();
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
    if (playMode === "host" && multiplayerGame) {
      enqueueHostAction(localPlayerId, { action: "end", seq: ++networkSeq });
      return;
    }
    if (playMode === "peer") {
      sendPeerAction({ action: "end" });
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

  function showGameOver() {
    if (!game) return;
    if (timerId) window.clearInterval(timerId);
    els.gameOver.hidden = false;
    els.gameOverTitle.textContent = game.endReason || "Game over";
    els.gameOverSummary.textContent = `${game.score} point${game.score === 1 ? "" : "s"} · ${game.scoredHands.length} scored hand${game.scoredHands.length === 1 ? "" : "s"} · seed ${game.seed}`;
  }

  function backToLobby() {
    if (timerId) window.clearInterval(timerId);
    closeMultiplayerConnections();
    multiplayerGame = null;
    playMode = "single";
    game = null;
    els.gameOver.hidden = true;
    els.gameView.hidden = true;
    els.lobby.hidden = false;
  }

  document.addEventListener("keydown", (event) => {
    if (!game || game.status !== "playing") return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (/^[1-7]$/.test(event.key)) {
      const index = Number(event.key) - 1;
      if (index < game.hand.length) {
        event.preventDefault();
        discardAt(index);
      }
    }
  });

  els.dailyButton.addEventListener("click", () => startGame("daily"));
  els.randomButton.addEventListener("click", () => startGame("random"));
  els.multiplayerButton.addEventListener("click", openMultiplayerDialog);
  els.newDailyButton.addEventListener("click", () => startGame("daily"));
  els.newRandomButton.addEventListener("click", () => startGame("random"));
  els.endGameButton.addEventListener("click", endCurrentGame);
  els.hostGameButton.addEventListener("click", () => {
    createHostInvite().catch((error) => setConnectionStatus(error.message));
  });
  els.joinGameButton.addEventListener("click", () => {
    createJoinAnswer().catch((error) => setConnectionStatus(error.message));
  });
  els.acceptAnswerButton.addEventListener("click", () => {
    acceptJoinAnswer().catch((error) => setConnectionStatus(error.message));
  });
  els.againButton.addEventListener("click", restartGame);
  els.backButton.addEventListener("click", backToLobby);
  els.soundButton.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    els.soundButton.classList.toggle("is-muted", !soundEnabled);
    els.soundButton.textContent = soundEnabled ? "SFX" : "Mute";
  });
  els.instructionsButton.addEventListener("click", () => {
    if (typeof els.instructionsDialog.showModal === "function") {
      els.instructionsDialog.showModal();
    } else {
      window.alert("Score straights or better. Click or press 1-7 to discard.");
    }
  });
})();
