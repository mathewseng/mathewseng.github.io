(function () {
  "use strict";

  const {
    PokerRushGame,
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
    gameOver: document.querySelector("#gameOver"),
    gameOverTitle: document.querySelector("#gameOverTitle"),
    gameOverSummary: document.querySelector("#gameOverSummary"),
    againButton: document.querySelector("#againButton"),
    backButton: document.querySelector("#backButton"),
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

  function selectedValue(name) {
    const checked = els.optionsForm.querySelector(`[name="${name}"]:checked`);
    return checked ? checked.value : "";
  }

  function readOptions(seed) {
    const formData = new FormData(els.optionsForm);
    return {
      seed,
      handSize: Number(selectedValue("handSize")),
      jokers: Number(selectedValue("jokers")),
      timeLimit: Number(selectedValue("timeLimit")),
      discardMode: String(formData.get("discardMode")),
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

  function startGame(kind) {
    lastStartKind = kind;
    lastSeed = kind === "daily" ? dailySeed() : randomSeed();
    game = new PokerRushGame(readOptions(lastSeed));
    els.lobby.hidden = true;
    els.gameView.hidden = false;
    els.gameOver.hidden = true;
    ensureAudio();
    render();
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
      game.checkTime();
      renderMetrics();
      if (game.status !== "playing") {
        showGameOver();
        window.clearInterval(timerId);
      }
    }, 100);
  }

  function render() {
    if (!game) return;
    renderMetrics();
    renderHand();
    renderScores();
    renderMatrix();
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

  function renderHand() {
    const fragment = document.createDocumentFragment();
    game.hand.forEach((card, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "playing-card";
      button.dataset.suit = card.suit;
      button.dataset.joker = String(card.isJoker);
      button.setAttribute("aria-label", `Discard ${cardLabel(card)} in slot ${index + 1}`);
      button.addEventListener("click", () => discardAt(index));

      const rank = document.createElement("span");
      rank.className = "rank";
      rank.textContent = card.isJoker ? "JK" : card.rank;

      const suit = document.createElement("span");
      suit.className = "suit";
      suit.setAttribute("aria-hidden", "true");

      const hotkey = document.createElement("span");
      hotkey.className = "hotkey";
      hotkey.textContent = String(index + 1);

      button.append(rank, suit, hotkey);
      fragment.append(button);
    });
    els.hand.replaceChildren(fragment);
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

  function renderScores() {
    const hands = game.scoredHands;
    els.scoreSummary.textContent = `${hands.length} ${hands.length === 1 ? "hand" : "hands"}`;
    els.pointsBreakdown.textContent = `${game.score} pts`;

    const stripFragment = document.createDocumentFragment();
    hands.slice(0, 10).forEach((record) => {
      const card = document.createElement("article");
      card.className = "score-card";
      card.dataset.rank = record.evaluation.key;

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
    els.scoredHands.replaceChildren(stripFragment);

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
      const body = document.createElement("span");
      body.textContent = " ";
      empty.append(title, body);
      listFragment.append(empty);
    }
    els.scoreList.replaceChildren(listFragment);
  }

  function renderMatrix() {
    const baseDeck = createDeck(game.options.jokers);
    const activeIds = new Map();
    game.hand.forEach((card) => activeIds.set(card.baseId, (activeIds.get(card.baseId) || 0) + 1));
    const byId = new Map(baseDeck.map((card) => [card.baseId, card]));
    const fragment = document.createDocumentFragment();

    SUITS.forEach((suit) => {
      const row = document.createElement("div");
      row.className = "matrix-row";
      const label = document.createElement("div");
      label.className = "matrix-label";
      label.textContent = suit;
      row.append(label);

      RANKS.forEach((rank) => {
        const card = byId.get(`${rank}${suit}`);
        row.append(matrixCell(card, activeIds));
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
        row.append(matrixCell(byId.get(`X${i}`), activeIds));
      }
      fragment.append(row);
    }

    els.cardMatrix.replaceChildren(fragment);
  }

  function matrixCell(card, activeIds) {
    const cell = document.createElement("div");
    const seenCount = game.seenCounts.get(card.baseId) || 0;
    const discardCount = game.discardedCounts.get(card.baseId) || 0;
    const scoredCount = game.scoredCounts.get(card.baseId) || 0;
    const activeCount = activeIds.get(card.baseId) || 0;
    cell.className = "matrix-cell";
    cell.dataset.suit = card.suit;
    if (seenCount) cell.classList.add("seen");
    if (discardCount && !activeCount) cell.classList.add("discarded");
    if (scoredCount) cell.classList.add("scored");
    if (activeCount) cell.classList.add("active");
    cell.title = `${cardLabel(card)} · seen ${seenCount} · discarded ${discardCount}`;

    const rank = document.createElement("span");
    rank.textContent = card.isJoker ? `J${card.jokerIndex}` : card.rank;
    cell.append(rank);

    if (!card.isJoker) {
      const suitDot = document.createElement("span");
      suitDot.className = "suit-dot";
      cell.append(suitDot);
    }

    if (seenCount > 1 || discardCount > 1 || activeCount > 1) {
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = String(Math.max(seenCount, discardCount, activeCount));
      cell.append(count);
    }
    return cell;
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

  function discardAt(index) {
    if (!game || game.status !== "playing") return;
    playDiscardSound();
    const result = game.discardCard(index);
    const scoreEvent = result.events && result.events.find((event) => event.type === "score");
    render();
    if (scoreEvent) {
      animateScore(scoreEvent.record.evaluation.key);
      playScoreSound(scoreEvent.record.evaluation.key);
    }
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
  els.newDailyButton.addEventListener("click", () => startGame("daily"));
  els.newRandomButton.addEventListener("click", () => startGame("random"));
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
