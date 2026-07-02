(function () {
  "use strict";

  const RANKS_DESC = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
  const RANKS_ASC = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
  const RANK_VALUE = new Map(RANKS_ASC.map((rank, index) => [rank, index + 2]));
  const RANK_LABEL = {
    2: "2",
    3: "3",
    4: "4",
    5: "5",
    6: "6",
    7: "7",
    8: "8",
    9: "9",
    10: "T",
    11: "J",
    12: "Q",
    13: "K",
    14: "A",
  };
  const RANK_NAME = {
    2: "twos",
    3: "threes",
    4: "fours",
    5: "fives",
    6: "sixes",
    7: "sevens",
    8: "eights",
    9: "nines",
    10: "tens",
    11: "jacks",
    12: "queens",
    13: "kings",
    14: "aces",
  };
  const SUITS = ["s", "h", "d", "c"];
  const SUIT_SYMBOL = { s: "♠", h: "♥", d: "♦", c: "♣" };
  const CATEGORY = {
    HIGH: 0,
    PAIR: 1,
    TWO_PAIR: 2,
    TRIPS: 3,
    STRAIGHT: 4,
    FLUSH: 5,
    FULL_HOUSE: 6,
    QUADS: 7,
    STRAIGHT_FLUSH: 8,
  };
  const SCENARIOS = [
    { cards: 14, jokers: 0 },
    { cards: 15, jokers: 0 },
    { cards: 16, jokers: 0 },
    { cards: 17, jokers: 0 },
    { cards: 14, jokers: 1 },
    { cards: 15, jokers: 1 },
    { cards: 16, jokers: 1 },
    { cards: 17, jokers: 1 },
    { cards: 14, jokers: 2 },
    { cards: 15, jokers: 2 },
    { cards: 16, jokers: 2 },
    { cards: 17, jokers: 2 },
  ];
  const TRAINER_CONFIGS = [
    { cards: 14, jokers: 0 },
    { cards: 15, jokers: 0 },
    { cards: 16, jokers: 0 },
    { cards: 17, jokers: 0 },
    { cards: 14, jokers: 1 },
    { cards: 15, jokers: 1 },
    { cards: 16, jokers: 1 },
    { cards: 17, jokers: 1 },
    { cards: 14, jokers: 2 },
    { cards: 15, jokers: 2 },
    { cards: 16, jokers: 2 },
    { cards: 17, jokers: 2 },
  ];
  const TRAINER_ROWS = [
    { key: "top", label: "Top", size: 3 },
    { key: "middle", label: "Middle", size: 5 },
    { key: "bottom", label: "Bottom", size: 5 },
  ];
  const TRAINER_ROW_CYCLE = ["bottom", "middle", "top"];
  const TRAINER_SHARE_URL = "https://mathewseng.github.io/ofc/fantasyland-trainer/";
  const TRAINER_DROP_ANIMATION_MS = 250;
  const TRAINER_STORAGE_KEY = "ofcFantasylandTrainerState.v1";

  const comboCache = new Map();
  const virtualDeck = buildVirtualDeck();
  const state = {
    cardCount: 14,
    jokerCount: 0,
    repeatRule: "pineapple",
    fiveKindRule: "none",
    selected: [],
    simAbort: false,
    suppressInput: false,
    trainer: {
      mode: "daily",
      scope: "single",
      cardCount: 14,
      jokerCount: 0,
      activeRow: "bottom",
      puzzles: [],
      puzzleIndex: 0,
      rows: createEmptyTrainerRows(),
      results: [],
      startedAt: 0,
      elapsedMs: 0,
      timerId: 0,
      confirmed: false,
      reportOpen: false,
      randomBase: "",
      sortMode: "rank",
      drag: null,
      dragClickBlock: null,
      dropAnimating: false,
    },
  };

  const els = {};

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
      cacheElements();
      bindEvents();
      if (!restoreTrainerState()) startTrainerSet();
      window.addEventListener("beforeunload", saveTrainerState);
      window.addEventListener("pagehide", saveTrainerState);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") saveTrainerState();
      });
    });
  }

  function cacheElements() {
    Object.assign(els, {
      metricPoints: document.querySelector("#metric-points"),
      metricRepeat: document.querySelector("#metric-repeat"),
      metricSpeed: document.querySelector("#metric-speed"),
      selectedCount: document.querySelector("#selected-count"),
      selectedCards: document.querySelector("#selected-cards"),
      deckGrid: document.querySelector("#deck-grid"),
      cardInput: document.querySelector("#card-input"),
      handMessage: document.querySelector("#hand-message"),
      solveHand: document.querySelector("#solve-hand"),
      randomHand: document.querySelector("#random-hand"),
      clearHand: document.querySelector("#clear-hand"),
      repeatRule: document.querySelector("#repeat-rule"),
      fiveKindRule: document.querySelector("#five-kind-rule"),
      repeatBadge: document.querySelector("#repeat-badge"),
      bestPoints: document.querySelector("#best-points"),
      repeatPoints: document.querySelector("#repeat-points"),
      legalBoards: document.querySelector("#legal-boards"),
      boardStack: document.querySelector("#board-stack"),
      solutionDrawer: document.querySelector("#solution-drawer"),
      solverMode: document.querySelector("#solver-mode"),
      sampleCount: document.querySelector("#sample-count"),
      runSim: document.querySelector("#run-sim"),
      stopSim: document.querySelector("#stop-sim"),
      simBody: document.querySelector("#sim-body"),
      simStatus: document.querySelector("#sim-status"),
      simProgress: document.querySelector("#sim-progress"),
      trainerTitle: document.querySelector("#trainer-title"),
      trainerConfig: document.querySelector("#trainer-config"),
      trainerCurrentConfig: document.querySelector("#trainer-current-config"),
      trainerCurrentConfigControl: document.querySelector(".trainer-current-config-control"),
      trainerPanel: document.querySelector(".trainer-panel"),
      trainerTime: document.querySelector("#trainer-time"),
      trainerCurrentPoints: document.querySelector("#trainer-current-points"),
      trainerProgressPill: document.querySelector("#trainer-progress-pill"),
      trainerProgress: document.querySelector("#trainer-progress"),
      trainerSortRank: document.querySelector("#trainer-sort-rank"),
      trainerSortSuit: document.querySelector("#trainer-sort-suit"),
      trainerTray: document.querySelector("#trainer-tray"),
      trainerRows: document.querySelector("#trainer-rows"),
      trainerClear: document.querySelector("#trainer-clear"),
      trainerConfirm: document.querySelector("#trainer-confirm"),
      trainerReportOpen: document.querySelector("#trainer-report-open"),
      trainerReportClose: document.querySelector("#trainer-report-close"),
      trainerNext: document.querySelector("#trainer-next"),
      trainerMessage: document.querySelector("#trainer-message"),
      trainerYourPoints: document.querySelector("#trainer-your-points"),
      trainerMaxPoints: document.querySelector("#trainer-max-points"),
      trainerResult: document.querySelector("#trainer-result"),
      trainerShare: document.querySelector("#trainer-share"),
      trainerCopy: document.querySelector("#trainer-copy"),
    });
  }

  function bindEvents() {
    document.querySelectorAll('input[name="card-count"]').forEach((input) => {
      input.addEventListener("change", () => {
        state.cardCount = Number(input.value);
        if (state.selected.length > state.cardCount) {
          state.selected = state.selected.slice(0, state.cardCount);
        }
        renderSelected();
      });
    });

    document.querySelectorAll('input[name="joker-count"]').forEach((input) => {
      input.addEventListener("change", () => {
        state.jokerCount = Number(input.value);
        trimUnavailableJokers();
        renderDeck();
        renderSelected();
      });
    });

    if (els.repeatRule) {
      els.repeatRule.addEventListener("change", () => {
        state.repeatRule = els.repeatRule.value;
        solveCurrentHand();
      });
    }

    if (els.fiveKindRule) {
      els.fiveKindRule.addEventListener("change", () => {
        state.fiveKindRule = els.fiveKindRule.value;
        solveCurrentHand();
      });
    }

    if (els.solveHand) els.solveHand.addEventListener("click", solveCurrentHand);
    if (els.randomHand) {
      els.randomHand.addEventListener("click", () => {
        dealRandomHand();
        solveCurrentHand();
      });
    }
    if (els.clearHand) {
      els.clearHand.addEventListener("click", () => {
        state.selected = [];
        renderSelected();
        clearSolution("Deal or paste a Fantasyland hand to solve it.");
      });
    }

    let inputTimer = 0;
    if (els.cardInput) {
      els.cardInput.addEventListener("input", () => {
        if (state.suppressInput) return;
        window.clearTimeout(inputTimer);
        inputTimer = window.setTimeout(parseInputCards, 260);
      });
    }

    if (els.runSim) els.runSim.addEventListener("click", runSimulationMatrix);
    if (els.stopSim) {
      els.stopSim.addEventListener("click", () => {
        state.simAbort = true;
        if (els.simStatus) els.simStatus.textContent = "Stopping after the current sample.";
      });
    }

    document.querySelectorAll('input[name="trainer-mode"]').forEach((input) => {
      input.addEventListener("change", () => {
        state.trainer.mode = input.value;
        startTrainerSet();
      });
    });

    document.querySelectorAll('input[name="trainer-scope"]').forEach((input) => {
      input.addEventListener("change", () => {
        state.trainer.scope = input.value;
        updateTrainerConfigControls();
        startTrainerSet();
      });
    });

    document.querySelectorAll('input[name="trainer-card-count"]').forEach((input) => {
      input.addEventListener("change", () => {
        state.trainer.cardCount = Number(input.value);
        if (state.trainer.scope === "single") startTrainerSet();
      });
    });

    document.querySelectorAll('input[name="trainer-joker-count"]').forEach((input) => {
      input.addEventListener("change", () => {
        state.trainer.jokerCount = Number(input.value);
        if (state.trainer.scope === "single") startTrainerSet();
      });
    });

    els.trainerClear.addEventListener("click", clearTrainerSet);
    els.trainerConfirm.addEventListener("click", confirmTrainerSet);
    els.trainerReportOpen.addEventListener("click", openTrainerReport);
    els.trainerReportClose.addEventListener("click", closeTrainerReport);
    els.trainerNext.addEventListener("click", loadNextTrainerPuzzle);
    els.trainerCopy.addEventListener("click", copyTrainerReport);
    els.trainerSortRank.addEventListener("click", () => setTrainerSortMode("rank"));
    els.trainerSortSuit.addEventListener("click", () => setTrainerSortMode("suit"));
    els.trainerTray.addEventListener("dragover", allowTrainerDrop);
    els.trainerTray.addEventListener("dragleave", clearTrainerDragOver);
    els.trainerTray.addEventListener("drop", dropTrainerCardToBank);
    document.addEventListener("keydown", handleTrainerHotkeys);
  }

  function trimUnavailableJokers() {
    const allowed = new Set(buildDeckIds(state.jokerCount));
    state.selected = state.selected.filter((id) => allowed.has(id));
  }

  function dealRandomHand() {
    state.selected = dealIds(state.cardCount, state.jokerCount);
    renderSelected();
  }

  function parseInputCards() {
    const parsed = parseCardList(els.cardInput.value, state.jokerCount);
    if (parsed.ids.length) {
      state.selected = parsed.ids.slice(0, state.cardCount);
      renderSelected({ keepInput: true });
    } else {
      state.selected = [];
      renderSelected({ keepInput: true });
    }
    if (parsed.errors.length) {
      setMessage(parsed.errors.slice(0, 2).join(" "));
    } else {
      setMessage("");
    }
  }

  function solveCurrentHand() {
    if (state.selected.length < 13) {
      setMessage("Select at least 13 cards.");
      clearSolution("The solver needs at least 13 cards.");
      return;
    }

    try {
      const result = solveHand(state.selected, {
        repeatRule: state.repeatRule,
        fiveKindRule: state.fiveKindRule,
      });
      renderSolution(result);
      setMessage(
        result.best
          ? `Solved ${state.selected.length} cards exactly.`
          : "No legal OFC board found for this hand."
      );
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Could not solve this hand.");
      clearSolution("Solver error.");
    }
  }

  function renderDeck() {
    if (!els.deckGrid) return;
    const selected = new Set(state.selected);
    const frag = document.createDocumentFragment();

    SUITS.forEach((suit) => {
      RANKS_DESC.forEach((rank) => {
        const id = `${rank}${suit}`;
        frag.appendChild(createCardButton(id, selected.has(id)));
      });
    });

    const jokerZone = document.createElement("div");
    jokerZone.className = "joker-zone";
    ["JK1", "JK2"].forEach((id, index) => {
      const button = createCardButton(id, selected.has(id));
      button.disabled = index >= state.jokerCount;
      jokerZone.appendChild(button);
    });
    frag.appendChild(jokerZone);

    els.deckGrid.replaceChildren(frag);
  }

  function createCardButton(id, isSelected) {
    const card = cardFromId(id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `card-button ${cardClass(card)}${isSelected ? " selected" : ""}`;
    button.dataset.cardId = id;
    button.innerHTML = cardFaceHtml(card);
    button.addEventListener("click", () => toggleCard(id));
    return button;
  }

  function toggleCard(id) {
    const existing = state.selected.indexOf(id);
    if (existing >= 0) {
      state.selected.splice(existing, 1);
    } else if (state.selected.length < state.cardCount) {
      state.selected.push(id);
    } else {
      setMessage(`Already at ${state.cardCount} cards.`);
    }
    renderDeck();
    renderSelected();
  }

  function renderSelected(options = {}) {
    const target = state.cardCount;
    if (els.selectedCount) {
      const jokerLabel = state.jokerCount === 1 ? "joker" : "jokers";
      els.selectedCount.textContent =
        state.selected.length === target
          ? `${target} cards / ${state.jokerCount} ${jokerLabel}`
          : `${state.selected.length} / ${target} selected`;
    }

    const frag = document.createDocumentFragment();
    const readOnly = options.readOnly || !els.solveHand;
    const displayIds = state.selected.slice().sort((left, right) => compareTrainerCards(left, right, "rank"));
    displayIds.forEach((id) => {
      const card = cardFromId(id);
      const item = document.createElement("div");
      item.className = `mini-card ${cardClass(card)}`;
      item.innerHTML = cardFaceHtml(card);
      if (!readOnly) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "×";
        remove.setAttribute("aria-label", `Remove ${id}`);
        remove.addEventListener("click", () => {
          state.selected = state.selected.filter((cardId) => cardId !== id);
          renderDeck();
          renderSelected();
        });
        item.appendChild(remove);
      }
      frag.appendChild(item);
    });
    if (els.selectedCards) els.selectedCards.replaceChildren(frag);
    renderDeck();

    if (!options.keepInput && els.cardInput) {
      state.suppressInput = true;
      els.cardInput.value = state.selected.join(" ");
      state.suppressInput = false;
    }
  }

  function renderSolution(result) {
    const best = result.best;
    const bestRepeat = result.bestRepeat;
    setOptionalText(els.metricPoints, best ? String(best.points) : "--");
    setOptionalText(els.metricRepeat, bestRepeat ? "Yes" : "No");
    setOptionalText(els.metricSpeed, `${result.elapsedMs.toFixed(0)} ms`);
    els.bestPoints.textContent = best ? String(best.points) : "--";
    els.legalBoards.textContent = formatInteger(result.legalBoards);
    els.repeatPoints.textContent = bestRepeat
      ? best && bestRepeat.points < best.points
        ? `${bestRepeat.points} (-${best.points - bestRepeat.points})`
        : String(bestRepeat.points)
      : "--";

    els.repeatBadge.className = `repeat-badge ${bestRepeat ? "yes" : "no"}`;
    els.repeatBadge.textContent = bestRepeat ? "Repeat" : "No repeat";

    if (!best) {
      clearSolution("No legal OFC board found.");
      return;
    }

    const rows = [
      { label: "Top", role: "top", candidate: best.top, className: "top-row" },
      { label: "Middle", role: "middle", candidate: best.middle, className: "" },
      { label: "Bottom", role: "back", candidate: best.back, className: "" },
    ];

    const frag = document.createDocumentFragment();
    rows.forEach((row) => {
      frag.appendChild(renderBoardRow(result.cards, row));
    });

    const discards = sortSolutionCards(
      result.cards.filter((card, index) => (best.usedMask & (1 << index)) === 0)
    );
    const discardRow = document.createElement("div");
    discardRow.className = "board-row";
    discardRow.innerHTML = `<div class="row-head"><strong>Discards</strong><div class="row-meta"><span>${discards.length}</span></div></div>`;
    const discardCards = document.createElement("div");
    discardCards.className = "row-cards discard-row";
    discards.forEach((card) => discardCards.appendChild(renderMiniCard(card, null)));
    discardRow.appendChild(discardCards);
    frag.appendChild(discardRow);

    els.boardStack.replaceChildren(frag);
  }

  function renderBoardRow(cards, row) {
    const wrapper = document.createElement("div");
    wrapper.className = "board-row";
    const royalty = row.role === "top" ? row.candidate.royalty : row.candidate[row.role === "middle" ? "middleRoyalty" : "backRoyalty"];
    wrapper.innerHTML = `
      <div class="row-head">
        <strong>${row.label}</strong>
        <div class="row-meta">
          <span>${row.candidate.eval.name}</span>
          <span>${royalty} pts</span>
        </div>
      </div>
    `;

    const cardGrid = document.createElement("div");
    cardGrid.className = `row-cards ${row.className}`;
    const rowCards = sortSolutionCards(
      cardsForMask(cards, row.candidate.mask),
      row.candidate.eval.assignments
    );
    rowCards.forEach((card) => {
      const assigned = row.candidate.eval.assignments ? row.candidate.eval.assignments.get(card.handIndex) : null;
      cardGrid.appendChild(renderMiniCard(card, assigned));
    });
    wrapper.appendChild(cardGrid);
    return wrapper;
  }

  function renderMiniCard(card, assigned) {
    const item = document.createElement("div");
    item.className = `mini-card ${cardClass(card)}`;
    item.innerHTML = cardFaceHtml(card.joker && assigned ? assigned : card, card.joker && assigned ? "JK" : "");
    return item;
  }

  function sortSolutionCards(cards, assignments = null) {
    return cards.slice().sort((left, right) => {
      const leftDisplay = solutionDisplayCard(left, assignments);
      const rightDisplay = solutionDisplayCard(right, assignments);
      const rankDiff = (rightDisplay.rank || 0) - (leftDisplay.rank || 0);
      if (rankDiff) return rankDiff;
      const suitDiff = SUITS.indexOf(leftDisplay.suit) - SUITS.indexOf(rightDisplay.suit);
      if (suitDiff) return suitDiff;
      return left.id.localeCompare(right.id);
    });
  }

  function solutionDisplayCard(card, assignments) {
    return card.joker && assignments ? assignments.get(card.handIndex) || card : card;
  }

  function clearSolution(message) {
    setOptionalText(els.metricPoints, "--");
    setOptionalText(els.metricRepeat, "--");
    setOptionalText(els.metricSpeed, "--");
    setOptionalText(els.bestPoints, "--");
    setOptionalText(els.repeatPoints, "--");
    setOptionalText(els.legalBoards, "--");
    if (els.repeatBadge) {
      els.repeatBadge.className = "repeat-badge";
      els.repeatBadge.textContent = "--";
    }
    if (els.boardStack) els.boardStack.innerHTML = `<div class="empty-state">${message}</div>`;
  }

  function setMessage(text) {
    if (els.handMessage) els.handMessage.textContent = text;
  }

  function setOptionalText(element, text) {
    if (element) element.textContent = text;
  }

  function startTrainerSet() {
    stopTrainerTimer();
    const trainer = state.trainer;
    trainer.mode = getCheckedValue("trainer-mode", trainer.mode);
    trainer.scope = getCheckedValue("trainer-scope", trainer.scope);
    trainer.cardCount = Number(getCheckedValue("trainer-card-count", String(trainer.cardCount)));
    trainer.jokerCount = Number(getCheckedValue("trainer-joker-count", String(trainer.jokerCount)));
    updateTrainerConfigControls();

    const configs =
      trainer.scope === "all"
        ? TRAINER_CONFIGS
        : [{ cards: trainer.cardCount, jokers: trainer.jokerCount }];

    trainer.randomBase =
      trainer.mode === "random"
        ? `R${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`
        : "";

    const dateKey = localDateKey();
    trainer.puzzles = configs.map((config) => {
      const seed =
        trainer.mode === "daily"
          ? `${dateKey}${config.cards}${config.jokers}`
          : `${trainer.randomBase}${config.cards}${config.jokers}`;
      return {
        ...config,
        seed,
        dateKey,
        ids: dealIdsSeeded(config.cards, config.jokers, seed),
      };
    });
    trainer.results = [];
    loadTrainerPuzzle(0);
  }

  function loadTrainerPuzzle(index) {
    const trainer = state.trainer;
    trainer.puzzleIndex = index;
    trainer.rows = createEmptyTrainerRows();
    trainer.activeRow = "bottom";
    trainer.confirmed = false;
    trainer.reportOpen = false;
    trainer.elapsedMs = 0;
    clearTrainerResult();
    startTrainerTimer();
    renderTrainer();
    saveTrainerState();
  }

  function loadNextTrainerPuzzle() {
    const next = state.trainer.puzzleIndex + 1;
    if (next < state.trainer.puzzles.length) {
      loadTrainerPuzzle(next);
    }
  }

  function saveTrainerState() {
    if (typeof window === "undefined") return;
    const trainer = state.trainer;
    if (!trainer.puzzles.length) return;

    const snapshot = {
      version: 1,
      savedAt: Date.now(),
      mode: trainer.mode,
      scope: trainer.scope,
      cardCount: trainer.cardCount,
      jokerCount: trainer.jokerCount,
      randomBase: trainer.randomBase,
      puzzleIndex: trainer.puzzleIndex,
      activeRow: trainer.activeRow,
      rows: cloneTrainerRows(trainer.rows),
      results: trainer.results.map((result) => (result ? clonePlainObject(result) : null)),
      puzzles: trainer.puzzles.map((puzzle) => ({
        cards: puzzle.cards,
        jokers: puzzle.jokers,
        seed: puzzle.seed,
        dateKey: puzzle.dateKey,
        ids: puzzle.ids.slice(),
      })),
      confirmed: trainer.confirmed,
      reportOpen: trainer.reportOpen,
      elapsedMs: currentTrainerElapsedMs(),
      sortMode: trainer.sortMode,
    };

    try {
      window.localStorage.setItem(TRAINER_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      // Private browsing or storage quotas can make persistence unavailable.
    }
  }

  function restoreTrainerState() {
    if (typeof window === "undefined") return false;
    let snapshot = null;
    try {
      snapshot = JSON.parse(window.localStorage.getItem(TRAINER_STORAGE_KEY) || "null");
    } catch (error) {
      return false;
    }
    if (!isTrainerSnapshotValid(snapshot)) return false;

    const trainer = state.trainer;
    trainer.mode = snapshot.mode;
    trainer.scope = snapshot.scope;
    trainer.cardCount = Number(snapshot.cardCount) || 14;
    trainer.jokerCount = Number(snapshot.jokerCount) || 0;
    trainer.randomBase = snapshot.randomBase || "";
    trainer.puzzles = snapshot.puzzles.map((puzzle) => ({
      cards: Number(puzzle.cards),
      jokers: Number(puzzle.jokers),
      seed: String(puzzle.seed || ""),
      dateKey: String(puzzle.dateKey || ""),
      ids: puzzle.ids.slice(),
    }));
    trainer.puzzleIndex = Math.min(Math.max(0, Number(snapshot.puzzleIndex) || 0), trainer.puzzles.length - 1);
    trainer.activeRow = TRAINER_ROWS.some((row) => row.key === snapshot.activeRow) ? snapshot.activeRow : "bottom";
    trainer.rows = sanitizeTrainerRows(snapshot.rows, getTrainerPuzzle());
    trainer.results = Array.isArray(snapshot.results) ? snapshot.results.map((result) => (result ? clonePlainObject(result) : null)) : [];
    trainer.confirmed = Boolean(snapshot.confirmed);
    trainer.reportOpen = Boolean(snapshot.reportOpen);
    trainer.elapsedMs = Math.max(0, Number(snapshot.elapsedMs) || 0);
    trainer.sortMode = snapshot.sortMode === "suit" ? "suit" : "rank";
    trainer.drag = null;
    trainer.dragClickBlock = null;
    trainer.dropAnimating = false;

    syncTrainerInputsFromState();
    if (trainer.confirmed) {
      stopTrainerTimer();
    } else {
      startTrainerTimer(trainer.elapsedMs);
    }
    renderTrainer();

    const result = trainer.results[trainer.puzzleIndex];
    if (trainer.confirmed && result) {
      renderTrainerResult(result);
    }
    return true;
  }

  function isTrainerSnapshotValid(snapshot) {
    if (!snapshot || snapshot.version !== 1) return false;
    if (snapshot.mode !== "daily" && snapshot.mode !== "random") return false;
    if (snapshot.scope !== "single" && snapshot.scope !== "all") return false;
    if (!Array.isArray(snapshot.puzzles) || !snapshot.puzzles.length) return false;
    if (!snapshot.puzzles.every((puzzle) => Array.isArray(puzzle.ids) && puzzle.ids.length >= 13)) return false;
    if (snapshot.mode === "daily") {
      const dateKey = localDateKey();
      if (!snapshot.puzzles.every((puzzle) => puzzle.dateKey === dateKey)) return false;
    }
    return true;
  }

  function syncTrainerInputsFromState() {
    const trainer = state.trainer;
    setCheckedValue("trainer-mode", trainer.mode);
    setCheckedValue("trainer-scope", trainer.scope);
    setCheckedValue("trainer-card-count", String(trainer.cardCount));
    setCheckedValue("trainer-joker-count", String(trainer.jokerCount));
    updateTrainerConfigControls();
  }

  function sanitizeTrainerRows(rows, puzzle) {
    const sanitized = createEmptyTrainerRows();
    if (!rows || typeof rows !== "object") return sanitized;
    const allowed = new Set(puzzle ? puzzle.ids : []);
    const used = new Set();
    TRAINER_ROWS.forEach((row) => {
      if (!Array.isArray(rows[row.key])) return;
      const size = puzzle ? trainerRowSize(row.key, puzzle) : row.size;
      rows[row.key].forEach((id) => {
        if (typeof id !== "string") return;
        if (allowed.size && !allowed.has(id)) return;
        if (used.has(id) || sanitized[row.key].length >= size) return;
        sanitized[row.key].push(id);
        used.add(id);
      });
    });
    return sanitized;
  }

  function clonePlainObject(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function currentTrainerElapsedMs() {
    const trainer = state.trainer;
    if (trainer.confirmed) return trainer.elapsedMs;
    if (!trainer.startedAt) return trainer.elapsedMs;
    return Math.max(0, now() - trainer.startedAt);
  }

  function renderTrainer() {
    const trainer = state.trainer;
    const puzzle = getTrainerPuzzle();
    if (!puzzle) return;

    updateTrainerHeader();
    updateTrainerHandSizing(puzzle);
    renderTrainerBoard();
    renderTrainerTray();
    updateTrainerControls();
    updateTrainerTimer();
    syncSolverToTrainerPuzzle(puzzle);
  }

  function updateTrainerHeader() {
    const trainer = state.trainer;
    const puzzle = getTrainerPuzzle();
    if (!puzzle) return;
    els.trainerTitle.textContent = trainer.mode === "daily" ? "Daily puzzle" : "Random puzzle";
    if (els.trainerConfig) els.trainerConfig.textContent = configShareLabel(puzzle);
    if (els.trainerCurrentPoints) els.trainerCurrentPoints.textContent = String(getTrainerCurrentPoints(puzzle));
    if (els.trainerProgress) els.trainerProgress.textContent = `${trainer.puzzleIndex + 1}/${trainer.puzzles.length}`;
    if (els.trainerProgressPill) els.trainerProgressPill.hidden = trainer.puzzles.length <= 1;
    updateTrainerConfigControls(puzzle);
  }

  function updateTrainerConfigControls(puzzle = getTrainerPuzzle()) {
    const isAll = state.trainer.scope === "all";
    document.querySelectorAll(".trainer-single-control").forEach((control) => {
      control.hidden = isAll;
    });
    if (els.trainerCurrentConfigControl) els.trainerCurrentConfigControl.hidden = !isAll;
    if (els.trainerCurrentConfig && puzzle) {
      els.trainerCurrentConfig.textContent = configControlLabel(puzzle);
    }
  }

  function syncSolverToTrainerPuzzle(puzzle) {
    state.cardCount = puzzle.cards;
    state.jokerCount = puzzle.jokers;
    state.selected = puzzle.ids.slice();
    renderSelected({ keepInput: true, readOnly: true });
    solveCurrentHand();
  }

  function renderTrainerTray() {
    const puzzle = getTrainerPuzzle();
    if (!puzzle) return;
    const placed = new Set(getPlacedTrainerIds());
    const frag = document.createDocumentFragment();
    const ordered = getTrainerOrderedIds(puzzle);
    ordered.forEach((id) => {
      if (placed.has(id)) {
        const slot = document.createElement("div");
        slot.className = "trainer-bank-slot empty";
        slot.dataset.cardId = id;
        slot.setAttribute("aria-label", `${id} is set`);
        frag.appendChild(slot);
        return;
      }

      const card = cardFromId(id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `card-button trainer-card ${cardClass(card)}`;
      button.disabled = state.trainer.confirmed;
      button.draggable = false;
      button.dataset.cardId = id;
      button.innerHTML = cardFaceHtml(card);
      button.addEventListener("click", (event) => {
        if (consumeTrainerDragClick(event, id)) return;
        addTrainerCard(id);
      });
      button.addEventListener("pointerdown", (event) => startTrainerPointerDrag(event, id, button));
      button.addEventListener("dragstart", (event) => event.preventDefault());
      frag.appendChild(button);
    });
    els.trainerTray.replaceChildren(frag);
    updateTrainerSortButtons();
  }

  function renderTrainerBoard() {
    const puzzle = getTrainerPuzzle();
    if (!puzzle) return;
    const frag = document.createDocumentFragment();
    TRAINER_ROWS.forEach((rowDef) => {
      const size = trainerRowSize(rowDef.key, puzzle);
      const row = document.createElement("section");
      row.className = `trainer-row ${state.trainer.activeRow === rowDef.key ? "active" : ""}`;
      row.dataset.row = rowDef.key;
      row.addEventListener("click", (event) => {
        if (state.trainer.confirmed || event.target.closest(".trainer-placed-card")) return;
        setTrainerActiveRow(rowDef.key);
      });

      const head = document.createElement("button");
      head.type = "button";
      head.className = "trainer-row-head";
      head.disabled = state.trainer.confirmed;
      head.setAttribute("aria-label", `${rowDef.label} row`);
      head.innerHTML = `<strong>${rowDef.label} <kbd>${trainerRowHotkey(rowDef.key)}</kbd></strong>`;
      head.addEventListener("click", () => setTrainerActiveRow(rowDef.key));
      row.appendChild(head);

      const slots = document.createElement("div");
      slots.className = `trainer-slots ${rowDef.key === "top" ? "top-row" : ""}`;
      for (let index = 0; index < size; index += 1) {
        const id = state.trainer.rows[rowDef.key][index];
        const slot = document.createElement("div");
        slot.className = `trainer-slot ${id ? "filled" : ""}`;
        slot.dataset.row = rowDef.key;
        slot.dataset.index = String(index);
        slot.addEventListener("dragover", allowTrainerDrop);
        slot.addEventListener("dragleave", clearTrainerDragOver);
        slot.addEventListener("drop", (event) => dropTrainerCardToSlot(event, rowDef.key, index));
        if (id) {
          const card = cardFromId(id);
          const button = document.createElement("button");
          button.type = "button";
          button.className = `mini-card trainer-placed-card ${cardClass(card)}`;
          button.disabled = state.trainer.confirmed;
          button.draggable = false;
          button.dataset.cardId = id;
          button.innerHTML = cardFaceHtml(card);
          button.addEventListener("click", (event) => {
            if (consumeTrainerDragClick(event, id)) return;
            removeTrainerCard(rowDef.key, id);
          });
          button.addEventListener("pointerdown", (event) => startTrainerPointerDrag(event, id, button));
          button.addEventListener("dragstart", (event) => event.preventDefault());
          slot.appendChild(button);
        }
        slots.appendChild(slot);
      }
      row.appendChild(slots);

      const summary = document.createElement("div");
      const rowSummary = getTrainerRowSummary(rowDef.key, puzzle);
      summary.className = `trainer-row-summary ${rowSummary.visible ? "" : "is-empty"}`;
      if (rowSummary.visible) {
        summary.innerHTML = `
          <span>${rowSummary.label}</span>
          <strong>${rowSummary.points} pts</strong>
        `;
      } else {
        summary.setAttribute("aria-hidden", "true");
      }
      row.appendChild(summary);
      frag.appendChild(row);
    });
    els.trainerRows.replaceChildren(frag);
    updateTrainerHeader();
  }

  function addTrainerCard(id) {
    const trainer = state.trainer;
    if (trainer.confirmed || trainer.dropAnimating || getPlacedTrainerIds().includes(id)) return;
    let rowKey = trainer.activeRow;
    if (trainer.rows[rowKey].length >= trainerRowSize(rowKey, getTrainerPuzzle())) {
      const nextRow = nextTrainerRowWithSpace(rowKey);
      if (!nextRow) {
        els.trainerMessage.textContent = "All rows are full.";
        return;
      }
      rowKey = nextRow;
      setTrainerActiveRow(rowKey, { render: false });
    }

    trainer.rows[rowKey].push(id);
    advanceTrainerActiveRowIfFilled(rowKey);
    els.trainerMessage.textContent = "";
    renderTrainerBoard();
    renderTrainerTray();
    updateTrainerControls();
    saveTrainerState();
  }

  function removeTrainerCard(rowKey, id) {
    const trainer = state.trainer;
    if (trainer.confirmed || trainer.dropAnimating) return;
    trainer.rows[rowKey] = trainer.rows[rowKey].filter((cardId) => cardId !== id);
    setTrainerActiveRow(rowKey, { render: false });
    els.trainerMessage.textContent = "";
    renderTrainerBoard();
    renderTrainerTray();
    updateTrainerControls();
    saveTrainerState();
  }

  function clearTrainerSet() {
    if (state.trainer.confirmed || state.trainer.dropAnimating) return;
    state.trainer.rows = createEmptyTrainerRows();
    setTrainerActiveRow("bottom", { render: false });
    els.trainerMessage.textContent = "";
    renderTrainerBoard();
    renderTrainerTray();
    updateTrainerControls();
    saveTrainerState();
  }

  function confirmTrainerSet() {
    const trainer = state.trainer;
    const puzzle = getTrainerPuzzle();
    if (!puzzle || trainer.confirmed || trainer.dropAnimating) return;
    if (!getPlacedTrainerIds().length) {
      els.trainerMessage.textContent = "Set at least one card first.";
      updateTrainerControls();
      return;
    }
    if (!trainerReady()) {
      fillTrainerSetFromBankOrder(puzzle);
    }
    if (!trainerReady()) {
      els.trainerMessage.textContent = "Not enough cards to fill the set.";
      renderTrainerBoard();
      renderTrainerTray();
      updateTrainerControls();
      return;
    }

    trainer.elapsedMs = now() - trainer.startedAt;
    stopTrainerTimer();
    trainer.confirmed = true;
    trainer.reportOpen = true;

    const user = scoreTrainerRows(puzzle.ids, trainer.rows, {
      fiveKindRule: state.fiveKindRule,
      repeatRule: state.repeatRule,
    });
    const optimal = solveHand(puzzle.ids, {
      repeatRule: state.repeatRule,
      fiveKindRule: state.fiveKindRule,
    });
    const maxPoints = optimal.best ? optimal.best.points : 0;
    const maxRepeat = Boolean(optimal.best && optimal.best.repeat);
    const correct = user.legal && user.points === maxPoints && user.repeat === maxRepeat;
    const result = {
      mode: trainer.mode,
      scope: trainer.scope,
      seed: puzzle.seed,
      dateKey: puzzle.dateKey,
      cards: puzzle.cards,
      jokers: puzzle.jokers,
      ids: puzzle.ids.slice(),
      rows: {
        ...cloneTrainerRows(trainer.rows),
        discard: getTrainerDiscardIds(puzzle),
      },
      timeMs: trainer.elapsedMs,
      points: user.points,
      maxPoints,
      repeat: user.repeat,
      maxRepeat,
      correct,
      legal: user.legal,
      rowNames: user.rowNames,
    };
    trainer.results[trainer.puzzleIndex] = result;
    renderTrainerResult(result);
    renderTrainerBoard();
    renderTrainerTray();
    updateTrainerControls();
    saveTrainerState();
  }

  function renderTrainerResult(result) {
    els.trainerYourPoints.textContent = String(result.points);
    els.trainerMaxPoints.textContent = String(result.maxPoints);
    els.trainerResult.textContent = trainerResultLabel(result);
    els.trainerMessage.textContent = `${trainerResultMessage(result)} in ${formatTime(result.timeMs)}.`;
    els.trainerShare.value = buildTrainerShare();
    els.trainerCopy.disabled = !els.trainerShare.value;
    updateTrainerControls();
  }

  function trainerResultLabel(result) {
    if (!result.legal) return "Foul";
    if (result.correct) return "Max";
    if (result.maxRepeat && !result.repeat) return "No repeat";
    return "Not max";
  }

  function trainerResultMessage(result) {
    if (!result.legal) return "Foul board";
    if (result.correct) return "Max royalties";
    if (result.maxRepeat && !result.repeat) return "no repeat fantasyland";
    return "Below max";
  }

  function clearTrainerResult() {
    state.trainer.reportOpen = false;
    els.trainerYourPoints.textContent = "--";
    els.trainerMaxPoints.textContent = "--";
    els.trainerResult.textContent = "--";
    els.trainerMessage.textContent = "";
    els.trainerShare.value = "";
    els.trainerCopy.disabled = true;
    els.trainerNext.hidden = true;
  }

  function updateTrainerControls() {
    const trainer = state.trainer;
    const hasPlacedCards = getPlacedTrainerIds().length > 0;
    els.trainerPanel.classList.toggle("is-confirmed", trainer.confirmed);
    els.trainerPanel.classList.toggle("is-report-open", trainer.confirmed && trainer.reportOpen);
    els.trainerConfirm.disabled = trainer.confirmed || !hasPlacedCards;
    els.trainerClear.disabled = trainer.confirmed;
    els.trainerConfirm.hidden = trainer.confirmed;
    els.trainerClear.hidden = trainer.confirmed;
    els.trainerReportOpen.hidden = !trainer.confirmed || trainer.reportOpen;
    els.trainerNext.hidden = !trainer.confirmed || trainer.reportOpen || trainer.puzzleIndex >= trainer.puzzles.length - 1;
    if (els.solutionDrawer) {
      els.solutionDrawer.hidden = !trainer.confirmed;
      if (!trainer.confirmed) els.solutionDrawer.open = false;
    }
  }

  function openTrainerReport() {
    if (!state.trainer.confirmed) return;
    state.trainer.reportOpen = true;
    updateTrainerControls();
    saveTrainerState();
  }

  function closeTrainerReport() {
    state.trainer.reportOpen = false;
    updateTrainerControls();
    saveTrainerState();
  }

  function updateTrainerHandSizing(puzzle) {
    if (!els.trainerPanel || !puzzle) return;
    els.trainerPanel.classList.remove("hand-cols-7", "hand-cols-8", "hand-cols-9");
    const columns = Math.min(9, Math.max(7, Math.ceil(puzzle.cards / 2)));
    els.trainerPanel.classList.add(`hand-cols-${columns}`);
  }

  function handleTrainerHotkeys(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (state.trainer.confirmed && state.trainer.reportOpen) {
      if (key === "c") {
        event.preventDefault();
        copyTrainerReport();
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        closeTrainerReport();
        return;
      }
    }

    if (shouldIgnoreTrainerHotkey(event)) return;
    if (key === "1") {
      event.preventDefault();
      setTrainerActiveRow("top");
    } else if (key === "2") {
      event.preventDefault();
      setTrainerActiveRow("middle");
    } else if (key === "3") {
      event.preventDefault();
      setTrainerActiveRow("bottom");
    } else if (key === "r") {
      event.preventDefault();
      setTrainerSortMode("rank");
    } else if (key === "s") {
      event.preventDefault();
      setTrainerSortMode("suit");
    } else if (key === "c") {
      event.preventDefault();
      clearTrainerSet();
    } else if (event.code === "Space" && state.trainer.confirmed && !els.trainerNext.hidden) {
      event.preventDefault();
      loadNextTrainerPuzzle();
    } else if (event.code === "Space" && !els.trainerConfirm.disabled) {
      event.preventDefault();
      confirmTrainerSet();
    }
  }

  function shouldIgnoreTrainerHotkey(event) {
    const target = event.target;
    if (!target) return false;
    return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
  }

  function trainerRowHotkey(key) {
    if (key === "top") return "1";
    if (key === "middle") return "2";
    return "3";
  }

  function setTrainerSortMode(mode) {
    state.trainer.sortMode = mode === "suit" ? "suit" : "rank";
    updateTrainerSortButtons();
    renderTrainerTray();
    saveTrainerState();
  }

  function updateTrainerSortButtons() {
    const isRank = state.trainer.sortMode !== "suit";
    els.trainerSortRank.classList.toggle("active", isRank);
    els.trainerSortSuit.classList.toggle("active", !isRank);
    els.trainerSortRank.setAttribute("aria-pressed", String(isRank));
    els.trainerSortSuit.setAttribute("aria-pressed", String(!isRank));
  }

  function compareTrainerCards(leftId, rightId, mode) {
    const left = cardFromId(leftId);
    const right = cardFromId(rightId);
    if (left.joker || right.joker) {
      if (left.joker && right.joker) return left.id.localeCompare(right.id);
      return left.joker ? -1 : 1;
    }

    const leftSuit = SUITS.indexOf(left.suit);
    const rightSuit = SUITS.indexOf(right.suit);
    if (mode === "suit") {
      return leftSuit - rightSuit || right.rank - left.rank || left.id.localeCompare(right.id);
    }
    return right.rank - left.rank || leftSuit - rightSuit || left.id.localeCompare(right.id);
  }

  function getTrainerOrderedIds(puzzle = getTrainerPuzzle()) {
    if (!puzzle) return [];
    return puzzle.ids.slice().sort((left, right) => compareTrainerCards(left, right, state.trainer.sortMode));
  }

  function fillTrainerSetFromBankOrder(puzzle = getTrainerPuzzle()) {
    if (!puzzle || state.trainer.confirmed) return;
    const placed = new Set(getPlacedTrainerIds());
    const remaining = getTrainerOrderedIds(puzzle).filter((id) => !placed.has(id));

    TRAINER_ROWS.forEach((row) => {
      const rowCards = state.trainer.rows[row.key];
      const size = trainerRowSize(row.key, puzzle);
      while (rowCards.length < size && remaining.length) {
        rowCards.push(remaining.shift());
      }
    });

    const nextRow = TRAINER_ROWS.find((row) => state.trainer.rows[row.key].length < trainerRowSize(row.key, puzzle));
    state.trainer.activeRow = nextRow ? nextRow.key : "bottom";
    els.trainerMessage.textContent = "";
  }

  function startTrainerDrag(event, id) {
    if (state.trainer.confirmed || state.trainer.dropAnimating || !event.dataTransfer) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  }

  function startTrainerPointerDrag(event, id, sourceEl) {
    if (state.trainer.confirmed || state.trainer.dropAnimating || (event.pointerType === "mouse" && event.button !== 0)) return;
    const point = getTrainerPointerViewportPoint(event);
    state.trainer.drag = {
      id,
      sourceEl,
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
      active: false,
      ghost: null,
      overEl: null,
    };
    if (sourceEl.setPointerCapture) {
      try {
        sourceEl.setPointerCapture(event.pointerId);
      } catch (error) {
        // Some browsers release capture during fast touch gestures; document listeners still handle the drag.
      }
    }
    document.addEventListener("pointermove", moveTrainerPointerDrag);
    document.addEventListener("pointerup", finishTrainerPointerDrag);
    document.addEventListener("pointercancel", cancelTrainerPointerDrag);
  }

  function moveTrainerPointerDrag(event) {
    const drag = state.trainer.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    const point = getTrainerPointerViewportPoint(event);
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    if (!drag.active && Math.hypot(dx, dy) < 5) return;

    drag.currentX = point.x;
    drag.currentY = point.y;
    if (!drag.active) activateTrainerPointerDrag(point);
    updateTrainerDragGhost(point);
    updateTrainerDragTarget(point);
    event.preventDefault();
  }

  function activateTrainerPointerDrag(point) {
    const drag = state.trainer.drag;
    if (!drag || drag.active) return;
    const ghost = createTrainerDragGhost(drag.id, drag.sourceEl, point);
    document.body.appendChild(ghost);
    drag.sourceEl.classList.add("drag-source-hidden");
    drag.active = true;
    drag.ghost = ghost;
    document.body.classList.add("trainer-dragging");
    updateTrainerDragGhost(point);
    window.requestAnimationFrame(() => {
      if (ghost.isConnected && !ghost.classList.contains("is-dropping")) {
        ghost.classList.add("is-lifted");
      }
    });
  }

  function createTrainerDragGhost(id, sourceEl, point) {
    const rect = sourceEl.getBoundingClientRect();
    const card = cardFromId(id);
    const ghost = document.createElement("div");
    ghost.className = `card-button trainer-card trainer-drag-ghost ${cardClass(card)}`;
    ghost.dataset.cardId = id;
    ghost.setAttribute("aria-hidden", "true");
    ghost.innerHTML = cardFaceHtml(card);
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left = `${point.x}px`;
    ghost.style.top = `${point.y}px`;
    return ghost;
  }

  function updateTrainerDragGhost(point) {
    const drag = state.trainer.drag;
    if (!drag || !drag.ghost) return;
    drag.currentX = point.x;
    drag.currentY = point.y;
    drag.ghost.style.left = `${point.x}px`;
    drag.ghost.style.top = `${point.y}px`;
  }

  function updateTrainerDragTarget(point) {
    const drag = state.trainer.drag;
    if (!drag || !drag.active) return;
    const target = document.elementFromPoint(point.x, point.y);
    const slot = resolveTrainerDropSlot(target, drag.id);
    const bank = target ? target.closest("#trainer-tray") : null;
    const row = slot && !target.closest(".trainer-slot") ? slot.closest(".trainer-row") : null;
    const overEl = bank || row || slot;
    if (drag.overEl === overEl) return;
    clearTrainerPointerDragTarget();
    drag.overEl = overEl;
    if (overEl) overEl.classList.add("drag-over");
  }

  function clearTrainerPointerDragTarget() {
    const drag = state.trainer.drag;
    if (drag && drag.overEl) {
      drag.overEl.classList.remove("drag-over");
      drag.overEl = null;
    }
  }

  function finishTrainerPointerDrag(event) {
    const drag = state.trainer.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    const wasActive = drag.active;
    if (wasActive) {
      const point = getTrainerPointerViewportPoint(event);
      const target = document.elementFromPoint(point.x, point.y);
      const slot = resolveTrainerDropSlot(target, drag.id);
      const bank = target ? target.closest("#trainer-tray") : null;
      const willMoveToSlot = !!(slot && slot.dataset.row && slot.dataset.index);
      const willMoveToBank = !!(bank && findTrainerCardLocation(drag.id));
      const ghost = drag.ghost;
      const sourceEl = drag.sourceEl;
      const sourceRect = sourceEl.getBoundingClientRect();
      let dropRect = sourceRect;
      let afterDrop = () => restoreTrainerDragSource(sourceEl, 0);
      let restoreTarget = () => {};

      if (willMoveToSlot) {
        const rowKey = slot.dataset.row;
        const index = Number(slot.dataset.index);
        const origin = findTrainerCardLocation(drag.id);
        const sameSlot = !!origin && origin.rowKey === rowKey && origin.index === index;
        dropRect = slot.getBoundingClientRect();
        restoreTarget = hideTrainerDropTargetCard(slot, sourceEl);
        afterDrop = () => {
          restoreTarget();
          if (sameSlot) {
            restoreTrainerDragSource(sourceEl, 0);
          } else {
            placeTrainerCardInSlot(drag.id, rowKey, index);
          }
        };
      } else if (willMoveToBank) {
        dropRect = getTrainerBankDropRect(drag.id, sourceRect);
        afterDrop = () => {
          removeTrainerCardFromRows(drag.id);
          els.trainerMessage.textContent = "";
          renderTrainerBoard();
          renderTrainerTray();
          updateTrainerControls();
          saveTrainerState();
        };
      }

      cleanupTrainerPointerDrag({
        suppressClick: true,
        restoreSource: false,
        releaseGhost: false,
      });
      animateTrainerDropGhost(ghost, dropRect, afterDrop);
      event.preventDefault();
      return;
    }

    cleanupTrainerPointerDrag({ suppressClick: false, restoreSource: true });
  }

  function getTrainerPointerViewportPoint(event) {
    const pageX = Number.isFinite(event.pageX) ? event.pageX : event.clientX + window.scrollX;
    const pageY = Number.isFinite(event.pageY) ? event.pageY : event.clientY + window.scrollY;
    return {
      x: pageX - window.scrollX,
      y: pageY - window.scrollY,
    };
  }

  function resolveTrainerDropSlot(target, id) {
    if (!target) return null;
    const directSlot = target.closest(".trainer-slot");
    const row = directSlot ? directSlot.closest(".trainer-row") : target.closest(".trainer-row");
    if (!row || !row.dataset.row) return null;
    const index = getTrainerResolvedRowDropIndex(row.dataset.row, id);
    if (index < 0) return null;
    return row.querySelector(`.trainer-slot[data-index="${index}"]`);
  }

  function getTrainerResolvedRowDropIndex(rowKey, id) {
    const puzzle = getTrainerPuzzle();
    if (!puzzle) return -1;
    const origin = findTrainerCardLocation(id);
    const rowCards = state.trainer.rows[rowKey];
    const rowSize = trainerRowSize(rowKey, puzzle);
    if (!rowCards) return -1;

    if (origin && origin.rowKey === rowKey) return origin.index;
    if (rowCards.length >= rowSize) return -1;
    return rowCards.length;
  }

  function getTrainerBankDropRect(id, fallbackRect) {
    const bankTarget = Array.from(els.trainerTray.children).find((child) => child.dataset.cardId === id);
    if (bankTarget) return bankTarget.getBoundingClientRect();

    const trayRect = els.trainerTray.getBoundingClientRect();
    return {
      left: trayRect.left + (trayRect.width - fallbackRect.width) / 2,
      top: trayRect.top + (trayRect.height - fallbackRect.height) / 2,
      width: fallbackRect.width,
      height: fallbackRect.height,
    };
  }

  function hideTrainerDropTargetCard(slot, sourceEl) {
    const targetCard = slot.querySelector(".trainer-placed-card");
    if (!targetCard || targetCard === sourceEl) return () => {};
    const wasHidden = targetCard.classList.contains("drag-source-hidden");
    targetCard.classList.add("drag-source-hidden");
    return () => {
      if (!wasHidden && targetCard.isConnected) targetCard.classList.remove("drag-source-hidden");
    };
  }

  function animateTrainerDropGhost(ghost, rect, afterDrop) {
    if (!ghost || !rect) {
      afterDrop();
      return;
    }

    state.trainer.dropAnimating = true;
    const targetX = rect.left + rect.width / 2;
    const targetY = rect.top + rect.height / 2;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      ghost.removeEventListener("transitionend", handleEnd);
      state.trainer.dropAnimating = false;
      try {
        afterDrop();
      } finally {
        ghost.remove();
      }
    };

    const handleEnd = (transitionEvent) => {
      if (transitionEvent.target !== ghost) return;
      if (!["left", "top"].includes(transitionEvent.propertyName)) return;
      finish();
    };

    ghost.addEventListener("transitionend", handleEnd);
    ghost.classList.add("is-drop-animating");
    ghost.getBoundingClientRect();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        ghost.classList.add("is-dropping");
        ghost.classList.remove("is-lifted");
        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
        ghost.style.left = `${targetX}px`;
        ghost.style.top = `${targetY}px`;
      });
    });
    window.setTimeout(finish, TRAINER_DROP_ANIMATION_MS + 120);
  }

  function cancelTrainerPointerDrag() {
    cleanupTrainerPointerDrag({ suppressClick: false, restoreSource: true });
  }

  function cleanupTrainerPointerDrag(options = {}) {
    const drag = state.trainer.drag;
    if (!drag) return;
    clearTrainerPointerDragTarget();
    if (drag.sourceEl && drag.sourceEl.releasePointerCapture) {
      try {
        drag.sourceEl.releasePointerCapture(drag.pointerId);
      } catch (error) {
        // Capture may already be released after pointercancel.
      }
    }
    if (drag.sourceEl && (!drag.ghost || options.restoreSource !== false)) {
      restoreTrainerDragSource(drag.sourceEl, drag.ghost ? 250 : 0);
    }
    if (drag.ghost && options.releaseGhost !== false) releaseTrainerDragGhost(drag.ghost);
    document.body.classList.remove("trainer-dragging");
    if (options.suppressClick) {
      state.trainer.dragClickBlock = { id: drag.id, until: now() + 450 };
    }
    document.removeEventListener("pointermove", moveTrainerPointerDrag);
    document.removeEventListener("pointerup", finishTrainerPointerDrag);
    document.removeEventListener("pointercancel", cancelTrainerPointerDrag);
    state.trainer.drag = null;
  }

  function releaseTrainerDragGhost(ghost) {
    ghost.classList.add("is-dropping");
    ghost.classList.remove("is-lifted");
    window.setTimeout(() => ghost.remove(), 260);
  }

  function restoreTrainerDragSource(sourceEl, delay) {
    window.setTimeout(() => {
      if (sourceEl.isConnected) sourceEl.classList.remove("drag-source-hidden");
    }, delay);
  }

  function consumeTrainerDragClick(event, id) {
    const block = state.trainer.dragClickBlock;
    if (!block || block.id !== id || now() > block.until) return false;
    state.trainer.dragClickBlock = null;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function allowTrainerDrop(event) {
    if (state.trainer.confirmed) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    event.currentTarget.classList.add("drag-over");
  }

  function clearTrainerDragOver(event) {
    event.currentTarget.classList.remove("drag-over");
  }

  function dropTrainerCardToBank(event) {
    event.preventDefault();
    clearTrainerDragOver(event);
    const id = getTrainerDragCardId(event);
    if (!id || state.trainer.confirmed) return;
    removeTrainerCardFromRows(id);
    els.trainerMessage.textContent = "";
    renderTrainerBoard();
    renderTrainerTray();
    updateTrainerControls();
    saveTrainerState();
  }

  function dropTrainerCardToSlot(event, rowKey, index) {
    event.preventDefault();
    clearTrainerDragOver(event);
    const id = getTrainerDragCardId(event);
    if (!id) return;
    const resolvedIndex = getTrainerResolvedRowDropIndex(rowKey, id);
    placeTrainerCardInSlot(id, rowKey, resolvedIndex >= 0 ? resolvedIndex : index);
  }

  function getTrainerDragCardId(event) {
    return event.dataTransfer ? event.dataTransfer.getData("text/plain") : "";
  }

  function placeTrainerCardInSlot(id, rowKey, index) {
    const trainer = state.trainer;
    const puzzle = getTrainerPuzzle();
    if (!puzzle || trainer.confirmed) return;
    const rowSize = trainerRowSize(rowKey, puzzle);
    if (index < 0 || index >= rowSize) return;

    const targetRow = trainer.rows[rowKey];
    const targetId = targetRow[index] || "";
    if (targetId === id) return;

    const origin = findTrainerCardLocation(id);
    if (targetId && !origin) return;
    if (targetId) {
      if (origin) trainer.rows[origin.rowKey][origin.index] = targetId;
      targetRow[index] = id;
    } else {
      if (origin) trainer.rows[origin.rowKey].splice(origin.index, 1);
      const adjustedIndex = origin && origin.rowKey === rowKey && origin.index < index ? index - 1 : index;
      trainer.rows[rowKey].splice(Math.min(adjustedIndex, trainer.rows[rowKey].length), 0, id);
    }

    setTrainerActiveRow(rowKey, { render: false });
    advanceTrainerActiveRowIfFilled(rowKey);
    els.trainerMessage.textContent = "";
    renderTrainerBoard();
    renderTrainerTray();
    updateTrainerControls();
    saveTrainerState();
  }

  function findTrainerCardLocation(id) {
    for (const row of TRAINER_ROWS) {
      const index = state.trainer.rows[row.key].indexOf(id);
      if (index >= 0) return { rowKey: row.key, index };
    }
    return null;
  }

  function removeTrainerCardFromRows(id) {
    TRAINER_ROWS.forEach((row) => {
      state.trainer.rows[row.key] = state.trainer.rows[row.key].filter((cardId) => cardId !== id);
    });
  }

  function getTrainerRowSummary(rowKey, puzzle) {
    const ids = state.trainer.rows[rowKey];
    const empty = { label: "", points: 0, visible: false };
    if (!ids.length) return empty;

    const cards = getTrainerCardsForIds(ids, puzzle);
    if (rowKey === "top") return getTrainerTopSummary(cards) || empty;
    return getTrainerFiveRowSummary(rowKey, cards) || empty;
  }

  function getTrainerCurrentPoints(puzzle = getTrainerPuzzle()) {
    if (!puzzle) return 0;
    return TRAINER_ROWS.reduce((total, row) => total + getTrainerRowSummary(row.key, puzzle).points, 0);
  }

  function getTrainerCardsForIds(ids, puzzle) {
    const handIndexById = new Map(puzzle.ids.map((id, index) => [id, index]));
    return ids.map((id) => ({ ...cardFromId(id), handIndex: handIndexById.get(id) })).filter(Boolean);
  }

  function getTrainerTopSummary(cards) {
    if (cards.length >= 3) {
      const evalResult = evaluateBestTop(cards);
      const points = topRoyalty(evalResult);
      return points ? { label: formatTrainerHandName(evalResult, "top"), points, visible: true } : null;
    }

    if (cards.length < 2) return null;
    const pairRank = bestRepeatRank(cards, 2, 6);
    if (!pairRank) return null;
    return royaltySummaryFromRepeat("top", CATEGORY.PAIR, pairRank);
  }

  function getTrainerFiveRowSummary(rowKey, cards) {
    if (cards.length < 5) {
      if (cards.length >= 4) {
        const quadRank = bestRepeatRank(cards, 4);
        if (quadRank) return royaltySummaryFromRepeat(rowKey, CATEGORY.QUADS, quadRank);
      }
      if (cards.length >= 3) {
        const tripRank = bestRepeatRank(cards, 3);
        if (tripRank) return royaltySummaryFromRepeat(rowKey, CATEGORY.TRIPS, tripRank);
      }
      return null;
    }

    const evalResult = evaluateBestFive(cards);
    const points = fiveRoyalty(evalResult, rowKey === "middle" ? "middle" : "back", state.fiveKindRule);
    if (!points) return null;
    return {
      label: formatTrainerHandName(evalResult, rowKey),
      points,
      visible: true,
    };
  }

  function bestRepeatRank(cards, targetCount, minRank = 2) {
    const jokerCount = cards.filter((card) => card.joker).length;
    const counts = rankCounts(cards.filter((card) => !card.joker));
    for (let rank = 14; rank >= minRank; rank -= 1) {
      if ((counts.get(rank) || 0) + jokerCount >= targetCount) return rank;
    }
    return 0;
  }

  function royaltySummaryFromRepeat(rowKey, category, rank) {
    const evalResult = { category, mainRank: rank, ranks: [rank] };
    const points =
      rowKey === "top"
        ? topRoyalty(evalResult)
        : fiveRoyalty(evalResult, rowKey === "middle" ? "middle" : "back", state.fiveKindRule);
    return points ? { label: formatTrainerHandName(evalResult, rowKey), points, visible: true } : null;
  }

  function formatTrainerHandName(evalResult, rowKey) {
    const rank = (index = 0) => RANK_LABEL[evalResult.ranks[index]] || "";
    const repeatRank = (index, count) => rank(index).repeat(count);

    if (rowKey === "top") {
      if (evalResult.category === CATEGORY.TRIPS) return `Trip ${repeatRank(0, 3)}`;
      if (evalResult.category === CATEGORY.PAIR) return `Pair ${repeatRank(0, 2)}`;
      return `High Card ${rank()}`;
    }

    switch (evalResult.category) {
      case CATEGORY.STRAIGHT_FLUSH:
        return evalResult.mainRank === 14 ? "Royal Flush" : "Straight Flush";
      case CATEGORY.QUADS:
        return "Quads";
      case CATEGORY.FULL_HOUSE:
        return "Boat";
      case CATEGORY.FLUSH:
        return "Flush";
      case CATEGORY.STRAIGHT:
        return "Straight";
      case CATEGORY.TRIPS:
        return "Trips";
      case CATEGORY.TWO_PAIR:
        return "Two Pair";
      case CATEGORY.PAIR:
        return "Pair";
      default:
        return "High Card";
    }
  }

  function scoreTrainerRows(cardIds, rows, options = {}) {
    const cardById = new Map(cardIds.map((id, index) => [id, { ...cardFromId(id), handIndex: index }]));
    const topCards = rows.top.map((id) => cardById.get(id));
    const middleCards = rows.middle.map((id) => cardById.get(id));
    const bottomCards = rows.bottom.map((id) => cardById.get(id));
    const fiveKindRule = options.fiveKindRule || "none";
    const topEval = evaluateBestTop(topCards);
    const middleEval = evaluateBestFive(middleCards);
    const bottomEval = evaluateBestFive(bottomCards);
    const legal =
      bottomEval.strength >= middleEval.strength &&
      isTopLegalAgainstMiddle(topEval, middleEval);
    const repeat =
      legal &&
      (rowRepeats("top", topEval, options.repeatRule || state.repeatRule) ||
        rowRepeats("middle", middleEval, options.repeatRule || state.repeatRule) ||
        rowRepeats("back", bottomEval, options.repeatRule || state.repeatRule));
    const points = legal
      ? topRoyalty(topEval) +
        fiveRoyalty(middleEval, "middle", fiveKindRule) +
        fiveRoyalty(bottomEval, "back", fiveKindRule)
      : 0;
    return {
      legal,
      points,
      repeat,
      rowNames: {
        top: topEval.name,
        middle: middleEval.name,
        bottom: bottomEval.name,
      },
    };
  }

  function isTopLegalAgainstMiddle(topEval, middleEval) {
    if (middleEval.category >= CATEGORY.STRAIGHT) return true;
    if (middleEval.category === CATEGORY.TRIPS) {
      return topEval.category < CATEGORY.TRIPS || topEval.mainRank <= middleEval.mainRank;
    }
    if (middleEval.category === CATEGORY.TWO_PAIR) {
      return topEval.category < CATEGORY.TRIPS;
    }
    if (middleEval.category === CATEGORY.PAIR) {
      if (topEval.category === CATEGORY.HIGH) return true;
      return topEval.category === CATEGORY.PAIR && topEval.mainRank <= middleEval.mainRank;
    }
    return topEval.category === CATEGORY.HIGH && topEval.strength <= middleEval.strength;
  }

  function buildTrainerShare() {
    const trainer = state.trainer;
    const results = trainer.results.filter(Boolean);
    if (!results.length) return "";
    const first = results[0];
    if (first.mode === "daily") {
      const title = `OFC Fantasyland Daily ${formatDateKey(first.dateKey)}`;
      return [title]
        .concat(results.map((result) => `${configShareLabel(result)} ${result.correct ? "✅" : "❌"} ${formatTime(result.timeMs)}`))
        .concat(TRAINER_SHARE_URL)
        .join("\n");
    }

    const title = "OFC Fantasyland Random";
    const blocks = results.map((result) =>
      [
        `${configShareLabel(result)} ${result.correct ? "✅" : "❌"} ${result.points}/${result.maxPoints} royalties${repeatMissShareSuffix(result)} ${formatTime(result.timeMs)}`,
        cardsToShare(result.rows.top),
        cardsToShare(result.rows.middle),
        cardsToShare(result.rows.bottom),
        cardsToShare(result.rows.discard),
      ].join("\n")
    );
    return [title].concat(blocks).concat(TRAINER_SHARE_URL).join("\n\n");
  }

  function formatDateKey(dateKey) {
    const text = String(dateKey || "");
    if (!/^\d{8}$/.test(text)) return text;
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }

  function configShareLabel(config) {
    return `${config.cards} cards / ${config.jokers} ${config.jokers === 1 ? "joker" : "jokers"}`;
  }

  function configControlLabel(config) {
    return `${config.cards} cards, ${config.jokers} ${config.jokers === 1 ? "joker" : "jokers"}`;
  }

  function repeatMissShareSuffix(result) {
    return result.maxRepeat && !result.repeat && !result.correct ? ", no repeat fantasyland" : "";
  }

  async function copyTrainerReport() {
    const text = els.trainerShare.value;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showTrainerCopySuccess();
    } catch (error) {
      els.trainerShare.focus();
      els.trainerShare.select();
      document.execCommand("copy");
      showTrainerCopySuccess();
    }
  }

  function showTrainerCopySuccess() {
    els.trainerCopy.textContent = "Copied";
    window.setTimeout(() => {
      els.trainerCopy.innerHTML = "Copy report <kbd>C</kbd>";
    }, 1200);
  }

  function startTrainerTimer(elapsedMs = 0) {
    stopTrainerTimer();
    state.trainer.startedAt = now() - Math.max(0, elapsedMs);
    state.trainer.timerId = window.setInterval(updateTrainerTimer, 10);
    updateTrainerTimer();
  }

  function stopTrainerTimer() {
    if (state.trainer.timerId) {
      window.clearInterval(state.trainer.timerId);
      state.trainer.timerId = 0;
    }
  }

  function updateTrainerTimer() {
    if (!els.trainerTime) return;
    const elapsed = state.trainer.confirmed
      ? state.trainer.elapsedMs
      : Math.max(0, now() - state.trainer.startedAt);
    els.trainerTime.textContent = formatTime(elapsed);
  }

  function trainerReady() {
    const puzzle = getTrainerPuzzle();
    if (!puzzle) return false;
    return TRAINER_ROWS.every((row) => state.trainer.rows[row.key].length === trainerRowSize(row.key, puzzle));
  }

  function getPlacedTrainerIds() {
    return TRAINER_ROWS.flatMap((row) => state.trainer.rows[row.key]);
  }

  function getTrainerDiscardIds(puzzle = getTrainerPuzzle()) {
    if (!puzzle) return [];
    const placed = new Set(getPlacedTrainerIds());
    return puzzle.ids.filter((id) => !placed.has(id));
  }

  function nextTrainerRowWithSpace(currentKey) {
    const puzzle = getTrainerPuzzle();
    const order = TRAINER_ROW_CYCLE;
    const start = Math.max(0, order.indexOf(currentKey));
    for (let step = 1; step <= order.length; step += 1) {
      const key = order[(start + step) % order.length];
      if (state.trainer.rows[key].length < trainerRowSize(key, puzzle)) return key;
    }
    return "";
  }

  function advanceTrainerActiveRowIfFilled(rowKey) {
    const puzzle = getTrainerPuzzle();
    if (!puzzle) return;
    if (state.trainer.rows[rowKey].length < trainerRowSize(rowKey, puzzle)) return;
    setTrainerActiveRow(nextTrainerRowInCycle(rowKey), { render: false });
  }

  function nextTrainerRowInCycle(currentKey) {
    const start = Math.max(0, TRAINER_ROW_CYCLE.indexOf(currentKey));
    return TRAINER_ROW_CYCLE[(start + 1) % TRAINER_ROW_CYCLE.length];
  }

  function setTrainerActiveRow(key, options = {}) {
    state.trainer.activeRow = key;
    if (options.render !== false) renderTrainerBoard();
  }

  function trainerRowSize(key, puzzle) {
    if (key === "discard") return Math.max(0, puzzle.cards - 13);
    const row = TRAINER_ROWS.find((entry) => entry.key === key);
    return row ? row.size : 0;
  }

  function getTrainerPuzzle() {
    return state.trainer.puzzles[state.trainer.puzzleIndex];
  }

  function createEmptyTrainerRows() {
    return { top: [], middle: [], bottom: [], discard: [] };
  }

  function cloneTrainerRows(rows) {
    return {
      top: rows.top.slice(),
      middle: rows.middle.slice(),
      bottom: rows.bottom.slice(),
      discard: rows.discard.slice(),
    };
  }

  function getCheckedValue(name, fallback) {
    const input = document.querySelector(`input[name="${name}"]:checked`);
    return input ? input.value : fallback;
  }

  function setCheckedValue(name, value) {
    const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  }

  function configShort(config) {
    return `${config.cards}/${config.jokers}`;
  }

  function localDateKey() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  }

  function dealIdsSeeded(count, jokers, seed) {
    const rng = seededRandom(seed);
    const naturals = buildDeckIds(0);
    shuffleWithRng(naturals, rng);
    const hand = naturals.slice(0, Math.max(0, count - jokers));
    for (let index = 1; index <= jokers; index += 1) {
      hand.push(`JK${index}`);
    }
    shuffleWithRng(hand, rng);
    return hand.slice(0, count);
  }

  function shuffleWithRng(items, rng) {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(rng() * (index + 1));
      [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }
    return items;
  }

  function seededRandom(seed) {
    return mulberry32(hashSeed(seed));
  }

  function hashSeed(seed) {
    let hash = 1779033703 ^ seed.length;
    for (let index = 0; index < seed.length; index += 1) {
      hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353);
      hash = (hash << 13) | (hash >>> 19);
    }
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  }

  function mulberry32(seed) {
    let value = seed >>> 0;
    return function nextRandom() {
      value += 0x6d2b79f5;
      let result = Math.imul(value ^ (value >>> 15), 1 | value);
      result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function formatTime(ms) {
    const totalHundredths = Math.max(0, Math.floor(ms / 10));
    const minutes = Math.floor(totalHundredths / 6000);
    const seconds = Math.floor((totalHundredths % 6000) / 100);
    const hundredths = totalHundredths % 100;
    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
  }

  function cardsToShare(ids) {
    return ids.map(cardIdToShare).join(" ");
  }

  function cardIdToShare(id) {
    if (id.startsWith("JK")) return "🃏";
    const rank = id[0] === "T" ? "10" : id[0];
    const suit = id[1].toLowerCase();
    const suits = { s: "♠️", h: "♥️", d: "♦️", c: "♣️" };
    return `${rank}${suits[suit]}`;
  }

  async function runSimulationMatrix() {
    if (!els.runSim || !els.stopSim || !els.simProgress || !els.simBody) return;
    state.simAbort = false;
    els.runSim.disabled = true;
    els.stopSim.disabled = false;
    els.simProgress.style.width = "0%";
    renderSimulationRows();

    const samples = Number(els.sampleCount.value);
    const options = {
      repeatRule: els.repeatRule ? els.repeatRule.value : state.repeatRule,
      fiveKindRule: els.fiveKindRule ? els.fiveKindRule.value : state.fiveKindRule,
    };
    const solver = els.solverMode.value === "exact" ? solveHand : solveHandFast;
    const modeLabel = els.solverMode.value === "exact" ? "exact" : "fast";
    const totalsByKey = new Map();
    const totalWork = SCENARIOS.length * samples;
    let completed = 0;
    const started = now();

    try {
      for (const scenario of SCENARIOS) {
        const key = scenarioKey(scenario);
        const totals = { points: 0, repeats: 0, repeatPoints: 0, samples: 0 };
        totalsByKey.set(key, totals);

        for (let i = 0; i < samples; i += 1) {
          if (state.simAbort) {
            els.simStatus.textContent = "Stopped.";
            return;
          }

          const ids = dealIds(scenario.cards, scenario.jokers);
          const result = solver(ids, options);
          totals.samples += 1;
          totals.points += result.best ? result.best.points : 0;
          if (result.bestRepeat) {
            totals.repeats += 1;
            totals.repeatPoints += result.bestRepeat.points;
          }

          completed += 1;
          if (i === samples - 1 || i % 2 === 1) {
            updateSimulationRow(scenario, totals);
            els.simProgress.style.width = `${Math.round((completed / totalWork) * 100)}%`;
            els.simStatus.textContent = `${completed} / ${totalWork} ${modeLabel} samples`;
            await yieldFrame();
          }
        }
      }

      const elapsed = ((now() - started) / 1000).toFixed(1);
      els.simProgress.style.width = "100%";
      els.simStatus.textContent = `Finished ${totalWork} ${modeLabel} samples in ${elapsed}s.`;
    } finally {
      els.runSim.disabled = false;
      els.stopSim.disabled = true;
      state.simAbort = false;
    }
  }

  function renderSimulationRows() {
    if (!els.simBody) return;
    const frag = document.createDocumentFragment();
    SCENARIOS.forEach((scenario) => {
      const jokerLabel =
        scenario.jokers === 0
          ? "No jokers"
          : `${scenario.jokers} ${scenario.jokers === 1 ? "joker" : "jokers"}`;
      const tr = document.createElement("tr");
      tr.dataset.scenario = scenarioKey(scenario);
      tr.innerHTML = `
        <td>${scenario.cards}</td>
        <td>${jokerLabel}</td>
        <td class="pending">--</td>
        <td class="pending">--</td>
        <td class="pending">--</td>
        <td class="pending">--</td>
        <td class="pending">0</td>
      `;
      frag.appendChild(tr);
    });
    els.simBody.replaceChildren(frag);
  }

  function updateSimulationRow(scenario, totals) {
    if (!els.simBody) return;
    const row = els.simBody.querySelector(`[data-scenario="${scenarioKey(scenario)}"]`);
    if (!row) return;
    const avg = totals.samples ? totals.points / totals.samples : 0;
    const repeatPct = totals.samples ? totals.repeats / totals.samples : 0;
    const repeatAvg = totals.repeats ? totals.repeatPoints / totals.repeats : 0;
    const recursive = repeatPct >= 0.999999 ? Infinity : avg / (1 - repeatPct);
    row.children[2].textContent = avg.toFixed(2);
    row.children[3].textContent = formatPct(repeatPct);
    row.children[4].textContent = Number.isFinite(recursive) ? recursive.toFixed(2) : "∞";
    row.children[5].textContent = totals.repeats ? repeatAvg.toFixed(2) : "--";
    row.children[6].textContent = String(totals.samples);
    Array.from(row.children).forEach((cell) => cell.classList.remove("pending"));
  }

  function scenarioKey(scenario) {
    return `${scenario.cards}-${scenario.jokers}`;
  }

  function solveHand(cardIds, options = {}) {
    const repeatRule = options.repeatRule || "pineapple";
    const fiveKindRule = options.fiveKindRule || "none";
    const started = now();
    const cards = cardIds.map((id, handIndex) => ({ ...cardFromId(id), handIndex }));
    const n = cards.length;
    if (n < 13 || n > 17) {
      throw new Error("OFC Fantasyland solver supports 13 to 17 cards.");
    }

    const combo = getComboCache(n);
    const five = buildFiveCandidates(cards, combo.fiveMasks, fiveKindRule);
    const top = buildTopCandidates(cards, combo.threeMasks);
    const fiveStrength = five.map((candidate) => candidate.eval.strength);
    const fiveMiddleRoyalty = five.map((candidate) => candidate.middleRoyalty);
    const fiveBackRoyalty = five.map((candidate) => candidate.backRoyalty);
    const topByMask = [];
    top.forEach((candidate) => {
      topByMask[candidate.mask] = candidate;
    });
    const topCache = [];
    const fullMask = (1 << n) - 1;
    let best = null;
    let bestRepeat = null;
    let legalBoards = 0;

    for (let backIndex = 0; backIndex < combo.fiveMasks.length; backIndex += 1) {
      const backStrength = fiveStrength[backIndex];
      const backRoyalty = fiveBackRoyalty[backIndex];
      const offsetStart = combo.disjointOffsets[backIndex];
      const offsetEnd = combo.disjointOffsets[backIndex + 1];

      for (let offset = offsetStart; offset < offsetEnd; offset += 1) {
        const middleIndex = combo.disjointFive[offset];
        const middleStrength = fiveStrength[middleIndex];
        if (backStrength < middleStrength) continue;

        const remainingMask = fullMask ^ combo.fiveMasks[backIndex] ^ combo.fiveMasks[middleIndex];
        const topCandidate = getBestTopForMiddle(
          remainingMask,
          five[middleIndex].eval,
          topByMask,
          topCache
        );
        if (!topCandidate) continue;

        legalBoards += 1;
        const points = backRoyalty + fiveMiddleRoyalty[middleIndex] + topCandidate.royalty;
        const repeats =
          rowRepeats("top", topCandidate.eval, repeatRule) ||
          rowRepeats("middle", five[middleIndex].eval, repeatRule) ||
          rowRepeats("back", five[backIndex].eval, repeatRule);

        const solution = {
          points,
          repeat: repeats,
          top: topCandidate,
          middle: five[middleIndex],
          back: five[backIndex],
          usedMask: topCandidate.mask | combo.fiveMasks[middleIndex] | combo.fiveMasks[backIndex],
          tieStrength: backStrength + middleStrength + topCandidate.eval.strength,
        };

        if (isBetterSolution(solution, best)) best = solution;
        if (repeats && isBetterSolution(solution, bestRepeat)) bestRepeat = solution;
      }
    }

    const preferred = bestRepeat || best;
    return {
      cards,
      best: preferred,
      bestRoyalty: best,
      bestRepeat,
      legalBoards,
      elapsedMs: now() - started,
      options: { repeatRule, fiveKindRule },
    };
  }

  function solveHandFast(cardIds, options = {}) {
    const repeatRule = options.repeatRule || "pineapple";
    const fiveKindRule = options.fiveKindRule || "none";
    const started = now();
    const cards = cardIds.map((id, handIndex) => ({ ...cardFromId(id), handIndex }));
    const n = cards.length;
    if (n < 13 || n > 17) {
      throw new Error("OFC Fantasyland solver supports 13 to 17 cards.");
    }

    const combo = getComboCache(n);
    const five = buildFiveCandidates(cards, combo.fiveMasks, fiveKindRule);
    const top = buildTopCandidates(cards, combo.threeMasks);
    const fiveStrength = five.map((candidate) => candidate.eval.strength);
    const fiveMiddleRoyalty = five.map((candidate) => candidate.middleRoyalty);
    const fiveBackRoyalty = five.map((candidate) => candidate.backRoyalty);
    const topByMask = [];
    top.forEach((candidate) => {
      topByMask[candidate.mask] = candidate;
    });
    const topCache = [];
    const fullMask = (1 << n) - 1;
    const backBeam = selectFiveBeam(five, "back", repeatRule);
    const middleBeam = selectFiveBeam(five, "middle", repeatRule);
    let best = null;
    let bestRepeat = null;
    let legalBoards = 0;

    for (const backIndex of backBeam) {
      const backMask = combo.fiveMasks[backIndex];
      const backStrength = fiveStrength[backIndex];
      const backRoyalty = fiveBackRoyalty[backIndex];

      for (const middleIndex of middleBeam) {
        const middleMask = combo.fiveMasks[middleIndex];
        if (backMask & middleMask) continue;

        const middleStrength = fiveStrength[middleIndex];
        if (backStrength < middleStrength) continue;

        const remainingMask = fullMask ^ backMask ^ middleMask;
        const topCandidate = getBestTopForMiddle(
          remainingMask,
          five[middleIndex].eval,
          topByMask,
          topCache
        );
        if (!topCandidate) continue;

        legalBoards += 1;
        const points = backRoyalty + fiveMiddleRoyalty[middleIndex] + topCandidate.royalty;
        const repeats =
          rowRepeats("top", topCandidate.eval, repeatRule) ||
          rowRepeats("middle", five[middleIndex].eval, repeatRule) ||
          rowRepeats("back", five[backIndex].eval, repeatRule);

        const solution = {
          points,
          repeat: repeats,
          top: topCandidate,
          middle: five[middleIndex],
          back: five[backIndex],
          usedMask: topCandidate.mask | middleMask | backMask,
          tieStrength: backStrength + middleStrength + topCandidate.eval.strength,
        };

        if (isBetterSolution(solution, best)) best = solution;
        if (repeats && isBetterSolution(solution, bestRepeat)) bestRepeat = solution;
      }
    }

    if (!best) return solveHand(cardIds, options);

    const preferred = bestRepeat || best;
    return {
      cards,
      best: preferred,
      bestRoyalty: best,
      bestRepeat,
      legalBoards,
      elapsedMs: now() - started,
      options: { repeatRule, fiveKindRule, mode: "fast" },
    };
  }

  function selectFiveBeam(five, row, repeatRule) {
    const limit = 320;
    const selected = new Set();
    const addTop = (scoreFn, count) => {
      five
        .map((candidate, index) => ({ index, score: scoreFn(candidate) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, count)
        .forEach((entry) => selected.add(entry.index));
    };

    const royaltyOf = (candidate) => (row === "middle" ? candidate.middleRoyalty : candidate.backRoyalty);
    addTop(
      (candidate) =>
        royaltyOf(candidate) * 100000 +
        (rowRepeats(row, candidate.eval, repeatRule) ? 25000 : 0) +
        candidate.eval.strength / 1e6,
      limit
    );
    addTop((candidate) => candidate.eval.strength, Math.ceil(limit / 3));
    addTop(
      (candidate) =>
        (rowRepeats(row, candidate.eval, repeatRule) ? 100000 : 0) +
        royaltyOf(candidate) * 1000 +
        candidate.eval.strength / 1e8,
      Math.ceil(limit / 2)
    );

    return Array.from(selected);
  }

  function buildFiveCandidates(cards, masks, fiveKindRule) {
    return masks.map((mask) => {
      const rowCards = cardsForMask(cards, mask);
      const evalResult = evaluateBestFive(rowCards);
      return {
        mask,
        eval: evalResult,
        middleRoyalty: fiveRoyalty(evalResult, "middle", fiveKindRule),
        backRoyalty: fiveRoyalty(evalResult, "back", fiveKindRule),
      };
    });
  }

  function buildTopCandidates(cards, masks) {
    return masks.map((mask) => {
      const rowCards = cardsForMask(cards, mask);
      const evalResult = evaluateBestTop(rowCards);
      return {
        mask,
        eval: evalResult,
        royalty: topRoyalty(evalResult),
      };
    });
  }

  function getBestTopForMiddle(remainingMask, middleEval, topByMask, topCache) {
    let cache = topCache[remainingMask];
    if (!cache) {
      cache = buildTopOptionCache(remainingMask, topByMask);
      topCache[remainingMask] = cache;
    }

    if (middleEval.category >= CATEGORY.STRAIGHT) return cache.any;
    if (middleEval.category === CATEGORY.TRIPS) return cache.tripLimit[middleEval.mainRank] || null;
    if (middleEval.category === CATEGORY.TWO_PAIR) return cache.noTrips || null;
    if (middleEval.category === CATEGORY.PAIR) return cache.pairLimit[middleEval.mainRank] || null;

    for (const candidate of cache.highs) {
      if (candidate.eval.strength <= middleEval.strength) return candidate;
    }
    return null;
  }

  function buildTopOptionCache(mask, topByMask) {
    const positions = bitPositions(mask);
    const cache = {
      any: null,
      noTrips: null,
      pairLimit: Array(15).fill(null),
      tripLimit: Array(15).fill(null),
      highs: [],
    };

    for (let a = 0; a < positions.length - 2; a += 1) {
      for (let b = a + 1; b < positions.length - 1; b += 1) {
        for (let c = b + 1; c < positions.length; c += 1) {
          const topMask = (1 << positions[a]) | (1 << positions[b]) | (1 << positions[c]);
          const candidate = topByMask[topMask];
          if (!candidate) continue;
          cache.any = betterTop(candidate, cache.any);

          if (candidate.eval.category < CATEGORY.TRIPS) {
            cache.noTrips = betterTop(candidate, cache.noTrips);
          }

          if (candidate.eval.category === CATEGORY.HIGH) {
            cache.highs.push(candidate);
            for (let rank = 2; rank <= 14; rank += 1) {
              cache.pairLimit[rank] = betterTop(candidate, cache.pairLimit[rank]);
              cache.tripLimit[rank] = betterTop(candidate, cache.tripLimit[rank]);
            }
          } else if (candidate.eval.category === CATEGORY.PAIR) {
            for (let rank = candidate.eval.mainRank; rank <= 14; rank += 1) {
              cache.pairLimit[rank] = betterTop(candidate, cache.pairLimit[rank]);
              cache.tripLimit[rank] = betterTop(candidate, cache.tripLimit[rank]);
            }
          } else if (candidate.eval.category === CATEGORY.TRIPS) {
            for (let rank = candidate.eval.mainRank; rank <= 14; rank += 1) {
              cache.tripLimit[rank] = betterTop(candidate, cache.tripLimit[rank]);
            }
          }
        }
      }
    }

    cache.highs.sort((a, b) => topSortValue(b) - topSortValue(a));
    return cache;
  }

  function betterTop(candidate, current) {
    if (!current) return candidate;
    return topSortValue(candidate) > topSortValue(current) ? candidate : current;
  }

  function topSortValue(candidate) {
    return candidate.royalty * 1e12 + candidate.eval.strength;
  }

  function isBetterSolution(candidate, current) {
    if (!current) return true;
    if (candidate.points !== current.points) return candidate.points > current.points;
    if (candidate.repeat !== current.repeat) return candidate.repeat;
    return candidate.tieStrength > current.tieStrength;
  }

  function rowRepeats(row, evalResult, rule) {
    if (row === "top") return evalResult.category === CATEGORY.TRIPS;
    if (row === "back") return evalResult.category >= CATEGORY.QUADS;
    if (rule === "topback") return false;
    if (rule === "tenpoint") return evalResult.category >= CATEGORY.FULL_HOUSE;
    return evalResult.category >= CATEGORY.QUADS;
  }

  function topRoyalty(evalResult) {
    if (evalResult.category === CATEGORY.PAIR && evalResult.mainRank >= 6) {
      return evalResult.mainRank - 5;
    }
    if (evalResult.category === CATEGORY.TRIPS) {
      return evalResult.mainRank + 8;
    }
    return 0;
  }

  function fiveRoyalty(evalResult, row, fiveKindRule) {
    const middle = row === "middle";
    switch (evalResult.category) {
      case CATEGORY.TRIPS:
        return middle ? 2 : 0;
      case CATEGORY.STRAIGHT:
        return middle ? 4 : 2;
      case CATEGORY.FLUSH:
        return middle ? 8 : 4;
      case CATEGORY.FULL_HOUSE:
        return middle ? 12 : 6;
      case CATEGORY.QUADS:
        return middle ? 20 : 10;
      case CATEGORY.STRAIGHT_FLUSH:
        if (evalResult.mainRank === 14) return middle ? 50 : 25;
        return middle ? 30 : 15;
      default:
        return 0;
    }
  }

  function evaluateBestFive(cards) {
    return evaluateWithJokers(cards, evaluateConcreteFive);
  }

  function evaluateBestTop(cards) {
    return evaluateWithJokers(cards, evaluateConcreteTop);
  }

  function evaluateWithJokers(cards, evaluator) {
    const jokers = cards.filter((card) => card.joker);
    const natural = cards.filter((card) => !card.joker);

    if (jokers.length === 0) {
      return evaluator(cards, null);
    }

    let best = null;
    const occupied = new Set(natural.map((card) => card.id));
    const available = virtualDeck.filter((card) => !occupied.has(card.id));
    const consider = (replacements) => {
      const concrete = natural.concat(replacements);
      const evaluated = evaluator(concrete, null);
      const assignments = new Map();
      jokers.forEach((joker, index) => assignments.set(joker.handIndex, replacements[index]));
      evaluated.assignments = assignments;
      if (!best || evaluated.strength > best.strength) {
        best = evaluated;
      }
    };

    if (jokers.length === 1) {
      for (const first of available) consider([first]);
    } else if (jokers.length === 2) {
      for (const first of available) {
        for (const second of available) {
          if (second.id === first.id) continue;
          consider([first, second]);
        }
      }
    } else {
      throw new Error("This solver supports up to two jokers.");
    }

    return best;
  }

  function evaluateConcreteFive(cards) {
    const counts = rankCounts(cards);
    const groups = Array.from(counts.entries())
      .map(([rank, count]) => ({ rank: Number(rank), count }))
      .sort((a, b) => b.count - a.count || b.rank - a.rank);
    const uniqueRanks = Array.from(counts.keys()).map(Number);
    const flush = cards.every((card) => card.suit === cards[0].suit);
    const straightHigh = straightHighRank(uniqueRanks);

    if (flush && straightHigh) {
      const name = straightHigh === 14 ? "Royal flush" : `${rankLong(straightHigh)}-high straight flush`;
      return makeEval(CATEGORY.STRAIGHT_FLUSH, [straightHigh], name);
    }

    if (groups[0].count === 4) {
      const kicker = groups.find((group) => group.count === 1).rank;
      return makeEval(CATEGORY.QUADS, [groups[0].rank, kicker], `Four ${RANK_NAME[groups[0].rank]}`);
    }

    if (groups[0].count === 3 && groups[1] && groups[1].count === 2) {
      return makeEval(
        CATEGORY.FULL_HOUSE,
        [groups[0].rank, groups[1].rank],
        `${rankLong(groups[0].rank)} full of ${RANK_NAME[groups[1].rank]}`
      );
    }

    if (flush) {
      const ranks = cards.map((card) => card.rank).sort(descNumber);
      return makeEval(CATEGORY.FLUSH, ranks, `${rankLong(ranks[0])}-high flush`);
    }

    if (straightHigh) {
      return makeEval(CATEGORY.STRAIGHT, [straightHigh], `${rankLong(straightHigh)}-high straight`);
    }

    if (groups[0].count === 3) {
      const kickers = groups
        .filter((group) => group.count === 1)
        .map((group) => group.rank)
        .sort(descNumber);
      return makeEval(CATEGORY.TRIPS, [groups[0].rank].concat(kickers), `Three ${RANK_NAME[groups[0].rank]}`);
    }

    if (groups[0].count === 2 && groups[1] && groups[1].count === 2) {
      const pairs = groups
        .filter((group) => group.count === 2)
        .map((group) => group.rank)
        .sort(descNumber);
      const kicker = groups.find((group) => group.count === 1).rank;
      return makeEval(CATEGORY.TWO_PAIR, pairs.concat(kicker), `${rankLong(pairs[0])} and ${RANK_NAME[pairs[1]]}`);
    }

    if (groups[0].count === 2) {
      const kickers = groups
        .filter((group) => group.count === 1)
        .map((group) => group.rank)
        .sort(descNumber);
      return makeEval(CATEGORY.PAIR, [groups[0].rank].concat(kickers), `Pair of ${RANK_NAME[groups[0].rank]}`);
    }

    const ranks = cards.map((card) => card.rank).sort(descNumber);
    return makeEval(CATEGORY.HIGH, ranks, `${rankLong(ranks[0])}-high`);
  }

  function evaluateConcreteTop(cards) {
    const counts = rankCounts(cards);
    const groups = Array.from(counts.entries())
      .map(([rank, count]) => ({ rank: Number(rank), count }))
      .sort((a, b) => b.count - a.count || b.rank - a.rank);

    if (groups[0].count === 3) {
      return makeEval(CATEGORY.TRIPS, [groups[0].rank], `Three ${RANK_NAME[groups[0].rank]}`);
    }

    if (groups[0].count === 2) {
      const kicker = groups.find((group) => group.count === 1).rank;
      return makeEval(CATEGORY.PAIR, [groups[0].rank, kicker], `Pair of ${RANK_NAME[groups[0].rank]}`);
    }

    const ranks = cards.map((card) => card.rank).sort(descNumber);
    return makeEval(CATEGORY.HIGH, ranks, `${rankLong(ranks[0])}-high`);
  }

  function makeEval(category, ranks, name) {
    return {
      category,
      mainRank: ranks[0] || 0,
      ranks,
      name,
      strength: encodeStrength(category, ranks),
      assignments: null,
    };
  }

  function encodeStrength(category, ranks) {
    let value = category * 1e10;
    const weights = [1e8, 1e6, 1e4, 1e2, 1];
    for (let index = 0; index < weights.length; index += 1) {
      value += (ranks[index] || 0) * weights[index];
    }
    return value;
  }

  function rankCounts(cards) {
    const counts = new Map();
    cards.forEach((card) => counts.set(card.rank, (counts.get(card.rank) || 0) + 1));
    return counts;
  }

  function straightHighRank(ranks) {
    const unique = Array.from(new Set(ranks)).sort(descNumber);
    if (unique.length < 5) return 0;
    const withWheel = unique.includes(14) ? unique.concat(1) : unique;
    for (let index = 0; index <= withWheel.length - 5; index += 1) {
      const high = withWheel[index];
      let ok = true;
      for (let step = 1; step < 5; step += 1) {
        if (withWheel[index + step] !== high - step) {
          ok = false;
          break;
        }
      }
      if (ok) return high === 5 ? 5 : high;
    }
    return 0;
  }

  function getComboCache(n) {
    if (comboCache.has(n)) return comboCache.get(n);
    const fiveMasks = generateMasks(n, 5);
    const threeMasks = generateMasks(n, 3);
    const disjointOffsets = new Uint32Array(fiveMasks.length + 1);
    let total = 0;

    for (let i = 0; i < fiveMasks.length; i += 1) {
      disjointOffsets[i] = total;
      for (let j = 0; j < fiveMasks.length; j += 1) {
        if ((fiveMasks[i] & fiveMasks[j]) === 0) total += 1;
      }
    }
    disjointOffsets[fiveMasks.length] = total;

    const disjointFive = new Uint16Array(total);
    let cursor = 0;
    for (let i = 0; i < fiveMasks.length; i += 1) {
      for (let j = 0; j < fiveMasks.length; j += 1) {
        if ((fiveMasks[i] & fiveMasks[j]) === 0) {
          disjointFive[cursor] = j;
          cursor += 1;
        }
      }
    }

    const cache = { fiveMasks, threeMasks, disjointOffsets, disjointFive };
    comboCache.set(n, cache);
    return cache;
  }

  function generateMasks(n, k) {
    const masks = [];
    const walk = (start, left, mask) => {
      if (left === 0) {
        masks.push(mask);
        return;
      }
      for (let index = start; index <= n - left; index += 1) {
        walk(index + 1, left - 1, mask | (1 << index));
      }
    };
    walk(0, k, 0);
    return masks;
  }

  function bitPositions(mask) {
    const positions = [];
    let index = 0;
    while (mask) {
      if (mask & 1) positions.push(index);
      mask >>= 1;
      index += 1;
    }
    return positions;
  }

  function cardsForMask(cards, mask) {
    const row = [];
    for (let index = 0; index < cards.length; index += 1) {
      if (mask & (1 << index)) row.push(cards[index]);
    }
    return row;
  }

  function parseCardList(text, jokerLimit) {
    const tokens = text
      .replace(/[,\n;]+/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
    const ids = [];
    const seen = new Set();
    const errors = [];
    let jokerSeen = 0;

    tokens.forEach((token) => {
      const id = parseCardToken(token, jokerSeen + 1);
      if (!id) {
        errors.push(`Skipped ${token}.`);
        return;
      }
      if (id.startsWith("JK")) {
        jokerSeen += 1;
        if (jokerSeen > jokerLimit) {
          errors.push(`Only ${jokerLimit} joker${jokerLimit === 1 ? "" : "s"} enabled.`);
          return;
        }
      }
      if (seen.has(id)) {
        errors.push(`Duplicate ${id}.`);
        return;
      }
      seen.add(id);
      ids.push(id);
    });

    return { ids, errors };
  }

  function parseCardToken(raw, nextJokerNumber) {
    const normalized = raw
      .trim()
      .toUpperCase()
      .replace(/10/g, "T")
      .replace(/[♠]/g, "S")
      .replace(/[♥]/g, "H")
      .replace(/[♦]/g, "D")
      .replace(/[♣]/g, "C")
      .replace(/[^A-Z0-9]/g, "");

    if (/^(JOKER|JOK|JK|X|WILD)([12])?$/.test(normalized)) {
      const explicit = normalized.match(/([12])$/);
      return `JK${explicit ? explicit[1] : Math.min(nextJokerNumber, 2)}`;
    }

    const match = normalized.match(/^([AKQJT2-9])([SHDC])$/) || normalized.match(/^([SHDC])([AKQJT2-9])$/);
    if (!match) return null;
    if (SUITS.includes(match[2].toLowerCase())) return `${match[1]}${match[2].toLowerCase()}`;
    return `${match[2]}${match[1].toLowerCase()}`;
  }

  function buildDeckIds(jokers) {
    const ids = [];
    SUITS.forEach((suit) => {
      RANKS_DESC.forEach((rank) => ids.push(`${rank}${suit}`));
    });
    if (jokers >= 1) ids.push("JK1");
    if (jokers >= 2) ids.push("JK2");
    return ids;
  }

  function dealIds(count, jokers) {
    const naturals = buildDeckIds(0);
    shuffle(naturals);
    const hand = naturals.slice(0, Math.max(0, count - jokers));
    for (let index = 1; index <= jokers; index += 1) {
      hand.push(`JK${index}`);
    }
    shuffle(hand);
    return hand.slice(0, count);
  }

  function buildVirtualDeck() {
    const deck = [];
    SUITS.forEach((suit) => {
      RANKS_ASC.forEach((rank) => {
        deck.push({
          id: `${rank}${suit}`,
          rank: RANK_VALUE.get(rank),
          suit,
          joker: false,
        });
      });
    });
    return deck;
  }

  function cardFromId(id) {
    if (id.startsWith("JK")) {
      return { id, rank: 0, suit: "", joker: true };
    }
    const rank = id[0].toUpperCase();
    const suit = id[1].toLowerCase();
    return {
      id: `${rank}${suit}`,
      rank: RANK_VALUE.get(rank),
      suit,
      joker: false,
    };
  }

  function cardLabel(card) {
    if (card.joker) return "JK";
    return `${RANK_LABEL[card.rank]}${SUIT_SYMBOL[card.suit]}`;
  }

  function cardFaceHtml(card, badge = "") {
    const rank = card.joker ? "JK" : RANK_LABEL[card.rank];
    const suit = card.joker ? "★" : SUIT_SYMBOL[card.suit];
    const badgeHtml = badge ? `<span class="card-badge">${badge}</span>` : "";
    return `<span class="card-corner" aria-hidden="true">${suit}</span><span class="card-rank">${rank}</span>${badgeHtml}`;
  }

  function cardSubLabel(card) {
    if (card.joker) return card.id;
    return card.id;
  }

  function cardClass(card) {
    if (card.joker) return "joker";
    return `suit-${card.suit}`;
  }

  function rankLong(rank) {
    if (rank === 14) return "Ace";
    if (rank === 13) return "King";
    if (rank === 12) return "Queen";
    if (rank === 11) return "Jack";
    if (rank === 10) return "Ten";
    return RANK_LABEL[rank];
  }

  function descNumber(a, b) {
    return b - a;
  }

  function shuffle(items) {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }
    return items;
  }

  function formatInteger(value) {
    return new Intl.NumberFormat("en-US").format(value);
  }

  function formatPct(value) {
    return `${(value * 100).toFixed(1)}%`;
  }

  function yieldFrame() {
    return new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  function now() {
    if (typeof performance !== "undefined" && performance.now) return performance.now();
    return Date.now();
  }

  if (typeof window !== "undefined") {
    window.OFCSolverCore = {
      solveHand,
      solveHandFast,
      parseCardList,
      cardFromId,
      evaluateBestFive,
      evaluateBestTop,
      topRoyalty,
      fiveRoyalty,
      dealIdsSeeded,
      scoreTrainerRows,
      isTopLegalAgainstMiddle,
      cardIdToShare,
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      solveHand,
      solveHandFast,
      parseCardList,
      cardFromId,
      evaluateBestFive,
      evaluateBestTop,
      topRoyalty,
      fiveRoyalty,
      dealIdsSeeded,
      scoreTrainerRows,
      isTopLegalAgainstMiddle,
      cardIdToShare,
    };
  }
})();
