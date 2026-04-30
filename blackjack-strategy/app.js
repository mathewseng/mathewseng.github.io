const $ = (id) => document.getElementById(id);

const ACTIONS = {
    H: { label: "Hit", className: "action-H" },
    S: { label: "Stand", className: "action-S" },
    D: { label: "Double, otherwise hit", className: "action-D" },
    Ds: { label: "Double, otherwise stand", className: "action-Ds" },
    P: { label: "Split", className: "action-P" },
    Rh: { label: "Surrender, otherwise hit", className: "action-Rh" },
    Rs: { label: "Surrender, otherwise stand", className: "action-Rs" },
};

const DEALER_VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const CARD_RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const CARDS_PER_DECK_BY_RANK = { 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4, 10: 16, 11: 4 };
const HI_LO_TAG = { 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 0, 8: 0, 9: 0, 10: -1, 11: -1 };
const COMPOSITION_SOLVER_MAX_DECKS = 1;
const COMPOSITION_RECHECK_MARGIN = 0.001;
const CONFIG_SOLVE_DEBOUNCE_MS = 1000;
const HARD_ROWS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const SOFT_ROWS = [2, 3, 4, 5, 6, 7, 8, 9];
const PAIR_ROWS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const PROB_KEYS = ["4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "bust"];
const INFINITE_DECKS = 99;

const PRESETS = {
    vegas: {
        decks: 6,
        h17: 0,
        doubleRule: 0,
        das: 1,
        surrender: 0,
        peek: 0,
        resplitHands: 0,
        rsa: 0,
        hsa: 0,
        charlie: 0,
        blackjackPay: 0,
        optimization: 0,
    },
    atlantic: {
        decks: 8,
        h17: 0,
        doubleRule: 0,
        das: 1,
        surrender: 1,
        peek: 0,
        resplitHands: 4,
        rsa: 0,
        hsa: 0,
        charlie: 0,
        blackjackPay: 0,
        optimization: 0,
    },
    downtown: {
        decks: 2,
        h17: 1,
        doubleRule: 0,
        das: 1,
        surrender: 0,
        peek: 0,
        resplitHands: 4,
        rsa: 0,
        hsa: 0,
        charlie: 0,
        blackjackPay: 0,
        optimization: 0,
    },
    single: {
        decks: 1,
        h17: 0,
        doubleRule: 0,
        das: 0,
        surrender: 0,
        peek: 0,
        resplitHands: 0,
        rsa: 0,
        hsa: 0,
        charlie: 0,
        blackjackPay: 0,
        optimization: 0,
    },
    european: {
        decks: 6,
        h17: 0,
        doubleRule: 1,
        das: 1,
        surrender: 0,
        peek: 1,
        resplitHands: 0,
        rsa: 0,
        hsa: 0,
        charlie: 0,
        blackjackPay: 0,
        optimization: 0,
    },
};

const STANDARD_INDEXES = [
    // Illustrious 18 / JackAce multi-deck S17 / BlackjackInfo text list.
    standardIndex("hard", 16, 10, "S", 0, "gte", ["illustrious18", "i18Fab4", "sweet16", "catch20", "catch22", "jackaceMdS17"]),
    standardIndex("hard", 15, 10, "S", 4, "gte", ["illustrious18", "i18Fab4", "sweet16", "catch20", "catch22", "jackaceMdS17"]),
    standardIndex("pair", 10, 5, "P", 5, "gte", ["illustrious18", "i18Fab4", "catch22", "jackaceMdS17"]),
    standardIndex("pair", 10, 6, "P", 4, "gte", ["illustrious18", "i18Fab4", "catch22", "jackaceMdS17"]),
    standardIndex("hard", 10, 10, "D", 4, "gte", ["illustrious18", "i18Fab4", "sweet16", "catch20", "catch22", "jackaceMdS17"]),
    standardIndex("hard", 12, 3, "S", 2, "gte", ["illustrious18", "i18Fab4", "sweet16", "catch20", "catch22", "jackaceMdS17"]),
    standardIndex("hard", 12, 2, "S", 3, "gte", ["illustrious18", "i18Fab4", "sweet16", "catch20", "catch22", "jackaceMdS17"]),
    standardIndex("hard", 11, 11, "D", 1, "gte", ["illustrious18", "i18Fab4", "sweet16", "catch20", "catch22", "jackaceMdS17"]),
    standardIndex("hard", 9, 2, "D", 1, "gte", ["illustrious18", "i18Fab4", "sweet16", "catch20", "catch22", "jackaceMdS17"]),
    standardIndex("hard", 10, 11, "D", 4, "gte", ["illustrious18", "i18Fab4", "sweet16", "catch20", "catch22", "jackaceMdS17"]),
    standardIndex("hard", 9, 7, "D", 3, "gte", ["illustrious18", "i18Fab4", "sweet16", "catch20", "catch22", "jackaceMdS17"]),
    standardIndex("hard", 16, 9, "S", 5, "gte", ["illustrious18", "i18Fab4", "sweet16", "catch20", "catch22", "jackaceMdS17"]),
    standardIndex("hard", 13, 2, "H", -1, "lte", ["illustrious18", "i18Fab4", "sweet16", "catch20", "catch22", "jackaceMdS17"]),
    standardIndex("hard", 12, 4, "H", 0, "lte", ["illustrious18", "i18Fab4", "sweet16", "catch20", "catch22", "jackaceMdS17"]),
    standardIndex("hard", 12, 5, "H", -2, "lte", ["illustrious18", "i18Fab4", "sweet16", "catch20", "catch22", "jackaceMdS17"]),
    standardIndex("hard", 12, 6, "H", -1, "lte", ["illustrious18", "i18Fab4", "sweet16", "catch20", "catch22", "jackaceMdS17"]),
    standardIndex("hard", 13, 3, "H", -2, "lte", ["illustrious18", "i18Fab4", "sweet16", "catch20", "catch22", "jackaceMdS17"]),

    // Common Catch 20 additions cited in counting discussions and Hi-Lo tables.
    standardIndex("soft", 8, 5, "D", 2, "gte", ["catch20", "catch22"]),
    standardIndex("soft", 8, 6, "D", 1, "gte", ["catch20", "catch22"]),
    standardIndex("hard", 8, 5, "D", 4, "gte", ["catch20", "catch22"]),
    standardIndex("hard", 8, 6, "D", 2, "gte", ["catch20", "catch22"]),

    // Fab 4 late-surrender indices from JackAce / BlackjackInfo.
    standardIndex("hard", 14, 10, "Rh", 3, "gte", ["fab4", "i18Fab4", "catch22", "jackaceMdS17"], { requiresSurrender: true }),
    standardIndex("hard", 15, 10, "Rh", 0, "gte", ["fab4", "i18Fab4", "catch22", "jackaceMdS17"], { requiresSurrender: true }),
    standardIndex("hard", 15, 9, "Rh", 2, "gte", ["fab4", "i18Fab4", "catch22", "jackaceMdS17"], { requiresSurrender: true }),
    standardIndex("hard", 15, 11, "Rh", 1, "gte", ["fab4", "i18Fab4", "catch22", "jackaceMdS17"], { requiresSurrender: true }),

    // Blackjack Apprenticeship S17/H17 public deviation PDFs.
    standardIndex("pair", 10, 4, "P", 6, "gte", ["bjaS17", "bjaH17"]),
    standardIndex("pair", 10, 5, "P", 5, "gte", ["bjaS17", "bjaH17"]),
    standardIndex("pair", 10, 6, "P", 4, "gte", ["bjaS17", "bjaH17"]),
    standardIndex("soft", 8, 4, "D", 3, "gte", ["bjaS17", "bjaH17"]),
    standardIndex("soft", 8, 5, "D", 1, "gte", ["bjaS17", "bjaH17"]),
    standardIndex("soft", 8, 6, "D", 1, "gte", ["bjaS17"]),
    standardIndex("soft", 8, 6, "S", 0, "lte", ["bjaH17"]),
    standardIndex("soft", 6, 2, "D", 1, "gte", ["bjaS17", "bjaH17"]),
    standardIndex("hard", 16, 9, "S", 4, "gte", ["bjaS17", "bjaH17"]),
    standardIndex("hard", 16, 10, "S", 0, "gte", ["bjaS17", "bjaH17"]),
    standardIndex("hard", 16, 11, "S", 3, "gte", ["bjaH17"]),
    standardIndex("hard", 15, 10, "S", 4, "gte", ["bjaS17", "bjaH17"]),
    standardIndex("hard", 15, 11, "S", 5, "gte", ["bjaH17"]),
    standardIndex("hard", 13, 2, "H", -1, "lte", ["bjaS17", "bjaH17"]),
    standardIndex("hard", 12, 2, "S", 3, "gte", ["bjaS17", "bjaH17"]),
    standardIndex("hard", 12, 3, "S", 2, "gte", ["bjaS17", "bjaH17"]),
    standardIndex("hard", 12, 4, "H", 0, "lte", ["bjaS17", "bjaH17"]),
    standardIndex("hard", 11, 11, "D", 1, "gte", ["bjaS17"]),
    standardIndex("hard", 10, 10, "D", 4, "gte", ["bjaS17", "bjaH17"]),
    standardIndex("hard", 10, 11, "D", 4, "gte", ["bjaS17"]),
    standardIndex("hard", 10, 11, "D", 3, "gte", ["bjaH17"]),
    standardIndex("hard", 9, 2, "D", 1, "gte", ["bjaS17", "bjaH17"]),
    standardIndex("hard", 9, 7, "D", 3, "gte", ["bjaS17", "bjaH17"]),
    standardIndex("hard", 8, 6, "D", 2, "gte", ["bjaS17", "bjaH17"]),
    standardIndex("hard", 16, 8, "Rh", 4, "gte", ["bjaS17", "bjaH17"], { requiresSurrender: true }),
    standardIndex("hard", 16, 9, "Rh", -1, "lte", ["bjaS17", "bjaH17"], { requiresSurrender: true }),
    standardIndex("hard", 15, 9, "Rh", 2, "gte", ["bjaS17", "bjaH17"], { requiresSurrender: true }),
    standardIndex("hard", 15, 10, "Rh", 0, "lte", ["bjaS17", "bjaH17"], { requiresSurrender: true }),
    standardIndex("hard", 15, 11, "Rh", 2, "gte", ["bjaS17"], { requiresSurrender: true }),
    standardIndex("hard", 15, 11, "Rh", -1, "gte", ["bjaH17"], { requiresSurrender: true }),
];

function standardIndex(kind, value, dealer, ia, i, idir, groups, options = {}) {
    return { kind, value, dealer, ia, i, idir, groups, ...options };
}

const state = {
    wasm: null,
    chart: null,
    report: null,
    selected: null,
    hand: [10, 6],
    dealer: 10,
    runningCount: 0,
    trueCount: 0,
    seenCards: 0,
    countHistory: [],
    countSource: "true",
    wasmReady: false,
    applyingPreset: false,
    lastSolveMs: 0,
    indexRange: { min: -5, max: 10 },
};

const analysisCache = new Map();
const indexCache = new Map();

document.addEventListener("DOMContentLoaded", () => {
    wireControls();
    const sharedConfig = applyHashConfig();
    const initialPreset = $("preset-select").value;
    setConfig(PRESETS[initialPreset] || PRESETS.vegas, { immediate: true });
    if (sharedConfig) {
        $("reverse-26-toggle").checked = Boolean(sharedConfig.reverse26);
        $("show-indices-toggle").checked = sharedConfig.showIndices !== false;
        if (sharedConfig.viewMode) $("view-mode").value = sharedConfig.viewMode;
        if (sharedConfig.indexGroup && $("index-group")) $("index-group").value = sharedConfig.indexGroup;
        if (sharedConfig.indexRange) {
            state.indexRange.min = Number(sharedConfig.indexRange.min ?? -5);
            state.indexRange.max = Number(sharedConfig.indexRange.max ?? 10);
        }
        if (Number.isFinite(sharedConfig.trueCount)) {
            state.countSource = "true";
            state.trueCount = clamp(sharedConfig.trueCount, -26, 26);
            setPairedControl("true-count-slider", "true-count-input", state.trueCount, countInputDecimals());
        }
    }
    loadReport();
    normalizeIndexRange();
    loadWasm().then(() => solveAndRender());
    renderHandTray();
    updateCountReadout();
});

function wireControls() {
    $("preset-select").addEventListener("change", (event) => {
        const value = event.target.value;
        if (value !== "custom" && PRESETS[value]) {
            setConfig(PRESETS[value]);
        }
    });

    document.querySelectorAll("input[name='soft17']").forEach((input) => {
        input.addEventListener("change", () => onRulesChanged());
    });

    ["decks-slider", "decks-input"].forEach((id) => {
        $(id).addEventListener("input", (event) => onDeckCountChanged(id, event.type));
        $(id).addEventListener("change", (event) => onDeckCountChanged(id, event.type));
    });

    [
        "double-rule",
        "peek-rule",
        "surrender-rule",
        "resplit-rule",
        "charlie-rule",
        "blackjack-pay",
        "optimization-rule",
    ].forEach((id) => $(id).addEventListener("change", () => onRulesChanged()));

    ["das-toggle", "hsa-toggle", "rsa-toggle", "apply-count-toggle"].forEach((id) => {
        $(id).addEventListener("change", () => onRulesChanged());
    });

    ["show-indices-toggle", "reverse-26-toggle", "colorblind-toggle"].forEach((id) => {
        $(id).addEventListener("change", () => {
            if (id === "colorblind-toggle") {
                document.body.classList.toggle("colorblind", $(id).checked);
            }
            renderChart();
        });
    });

    [
        "view-mode",
        "index-group",
        "index-min-range",
        "index-max-range",
        "index-min-input",
        "index-max-input",
        "index-decimals",
        "index-decimals-input",
    ].forEach((id) => {
        $(id).addEventListener("input", (event) => {
            if (!syncSourcePair(id, event.type)) return;
            normalizeIndexRange({ sourceId: id, editing: event.type === "input" });
            renderChart();
            refreshSelectedInspector();
            renderHandSolver();
            renderIndexAudit();
            updateCountReadout();
        });
        $(id).addEventListener("change", () => {
            if (!syncSourcePair(id, "change")) return;
            normalizeIndexRange();
            renderChart();
            refreshSelectedInspector();
            renderHandSolver();
            renderIndexAudit();
            updateCountReadout();
        });
    });

    document.querySelectorAll("[data-step-target]").forEach((button) => {
        button.addEventListener("click", () => stepRangeControl(button));
    });

    $("reset-rules").addEventListener("click", () => {
        $("preset-select").value = "vegas";
        setConfig(PRESETS.vegas);
        toast("Rules reset");
    });

    $("dealer-select").addEventListener("change", (event) => {
        state.dealer = Number(event.target.value);
        renderHandSolver();
    });

    $("card-pad").addEventListener("click", (event) => {
        const button = event.target.closest("button[data-card]");
        if (!button) return;
        if (state.hand.length >= 6) {
            toast("Hand limit reached");
            return;
        }
        state.hand.push(Number(button.dataset.card));
        renderHandTray();
        renderHandSolver();
    });

    $("clear-hand").addEventListener("click", () => {
        state.hand = [];
        state.selected = null;
        renderHandTray();
        renderHandSolver();
        markSelectedCell();
    });

    $("count-buttons").addEventListener("click", (event) => {
        const button = event.target.closest("button[data-delta]");
        if (!button) return;
        const delta = Number(button.dataset.delta);
        state.runningCount = clamp(state.runningCount + delta, -100, 100);
        state.seenCards += 1;
        state.countHistory.push(delta);
        state.countSource = "running";
        setPairedControl("running-count-slider", "running-count-input", state.runningCount, 0);
        const config = collectConfig();
        const deckCap = finiteDeckCount(config);
        const remaining = deckCap ? Math.max(0.01, (deckCap * 52 - state.seenCards) / 52) : Number($("decks-remaining").value);
        setPairedControl("decks-remaining", "decks-remaining-input", Math.min(deckCap || 8, remaining), 2);
        syncTrueFromRunning();
        updateCountReadout();
        scheduleSolveAndRender();
    });

    $("undo-count").addEventListener("click", () => {
        const last = state.countHistory.pop();
        if (last === undefined) return;
        state.runningCount -= last;
        state.seenCards = Math.max(0, state.seenCards - 1);
        state.countSource = "running";
        setPairedControl("running-count-slider", "running-count-input", state.runningCount, 0);
        syncTrueFromRunning();
        updateCountReadout();
        scheduleSolveAndRender();
    });

    $("reset-count").addEventListener("click", () => {
        state.runningCount = 0;
        state.trueCount = 0;
        state.seenCards = 0;
        state.countHistory = [];
        state.countSource = "true";
        setPairedControl("running-count-slider", "running-count-input", 0, 0);
        setPairedControl("true-count-slider", "true-count-input", 0, countInputDecimals());
        setPairedControl("decks-remaining", "decks-remaining-input", displayDeckCount(collectConfig().decks, 8), 2);
        updateCountReadout();
        scheduleSolveAndRender();
    });

    ["decks-remaining", "decks-remaining-input"].forEach((id) => {
        $(id).addEventListener("input", (event) => onDecksRemainingChanged(id, event.type));
        $(id).addEventListener("change", (event) => onDecksRemainingChanged(id, event.type));
    });

    ["running-count-slider", "running-count-input"].forEach((id) => {
        $(id).addEventListener("input", (event) => onRunningCountChanged(id, event.type));
        $(id).addEventListener("change", (event) => onRunningCountChanged(id, event.type));
    });

    ["true-count-slider", "true-count-input"].forEach((id) => {
        $(id).addEventListener("input", (event) => onTrueCountChanged(id, event.type));
        $(id).addEventListener("change", (event) => onTrueCountChanged(id, event.type));
    });

    $("copy-config").addEventListener("click", copyConfig);
    $("dealer-modal-close").addEventListener("click", closeDealerModal);
    $("dealer-modal").addEventListener("click", (event) => {
        if (event.target === $("dealer-modal")) closeDealerModal();
    });

    document.querySelectorAll(".mobile-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".mobile-tab").forEach((item) => item.classList.remove("active"));
            tab.classList.add("active");
            $(tab.dataset.jump).scrollIntoView({ behavior: "smooth", block: "start" });
        });
    });
}

function onDeckCountChanged(sourceId, eventType = "input") {
    if (eventType === "input" && isPendingNumberInput(sourceId)) return;
    const value = Math.round(readControlNumber(sourceId, Number($("decks-slider").value) || 6, 1, 9));
    setPairedControl("decks-slider", "decks-input", value, 0, {
        preserveInputId: eventType === "input" ? sourceId : null,
    });
    onRulesChanged();
}

function stepRangeControl(button) {
    const target = $(button.dataset.stepTarget);
    if (!target) return;

    const direction = Number(button.dataset.stepDir) || 1;
    const step = Number(target.step) || 1;
    const min = Number(target.min);
    const max = Number(target.max);
    const current = Number(target.value) || 0;
    const precision = stepPrecision(step);
    const next = roundToDecimals(
        clamp(current + direction * step, Number.isFinite(min) ? min : -Infinity, Number.isFinite(max) ? max : Infinity),
        precision,
    );
    target.value = String(next);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
}

function stepPrecision(step) {
    const text = String(step);
    if (!text.includes(".")) return 0;
    return text.split(".")[1].length;
}

function onDecksRemainingChanged(sourceId, eventType = "input") {
    if (eventType === "input" && isPendingNumberInput(sourceId)) return;
    const max = Number($("decks-remaining").max || 8);
    const value = readControlNumber(sourceId, Number($("decks-remaining").value) || max, 0.01, max);
    setPairedControl("decks-remaining", "decks-remaining-input", value, 2, {
        preserveInputId: eventType === "input" ? sourceId : null,
    });
    if (state.countSource === "running") syncTrueFromRunning();
    updateCountReadout();
    scheduleSolveAndRender();
}

function onRunningCountChanged(sourceId, eventType = "input") {
    if (eventType === "input" && isPendingNumberInput(sourceId)) return;
    state.countSource = "running";
    state.runningCount = Math.round(readControlNumber(sourceId, state.runningCount, -100, 100));
    setPairedControl("running-count-slider", "running-count-input", state.runningCount, 0, {
        preserveInputId: eventType === "input" ? sourceId : null,
    });
    syncTrueFromRunning();
    updateCountReadout();
    scheduleSolveAndRender();
}

function onTrueCountChanged(sourceId, eventType = "input") {
    if (eventType === "input" && isPendingNumberInput(sourceId)) return;
    state.countSource = "true";
    state.trueCount = readControlNumber(sourceId, state.trueCount, -26, 26);
    setPairedControl("true-count-slider", "true-count-input", state.trueCount, countInputDecimals(), {
        preserveInputId: eventType === "input" ? sourceId : null,
    });
    updateCountReadout();
    scheduleSolveAndRender();
}

function syncSourcePair(sourceId, eventType = "input") {
    if (sourceId === "index-group") return true;

    if (sourceId.startsWith("index-min") || sourceId.startsWith("index-max")) {
        if (eventType === "input" && isPendingNumberInput(sourceId)) return false;
        const edge = sourceId.startsWith("index-min") ? "min" : "max";
        const fallback = state.indexRange[edge];
        const raw = $(sourceId)?.value?.trim() ?? "";
        const parsed = raw === "" ? NaN : Number(raw);
        if (!Number.isFinite(parsed)) return false;
        state.indexRange[edge] = sourceId.endsWith("-range") ? clamp(parsed, -5, 10) : parsed;
        if (state.indexRange.min > state.indexRange.max) {
            if (edge === "min") state.indexRange.max = state.indexRange.min;
            else state.indexRange.min = state.indexRange.max;
        }
        if (!Number.isFinite(state.indexRange[edge])) state.indexRange[edge] = fallback;
        syncIndexRangeControls({ preserveInputId: eventType === "input" ? sourceId : null });
        return true;
    }

    const pair = sourceId === "index-decimals" || sourceId === "index-decimals-input"
        ? ["index-decimals", "index-decimals-input"]
        : null;
    if (!pair) return true;
    if (eventType === "input" && isPendingNumberInput(sourceId)) return false;
    const decimals = 0;
    const fallback = Number($(pair[0]).value) || 0;
    const value = Math.round(readControlNumber(sourceId, fallback, 0, 3));
    setPairedControl(pair[0], pair[1], value, decimals, {
        preserveInputId: eventType === "input" ? sourceId : null,
    });
    normalizeIndexRange({ sourceId, editing: eventType === "input" });
    return true;
}

function onRulesChanged() {
    if (!state.applyingPreset) {
        $("preset-select").value = "custom";
    }
    clampDeckSlider();
    updateCountReadout();
    scheduleSolveAndRender();
}

function setConfig(config, options = {}) {
    state.applyingPreset = true;
    setPairedControl("decks-slider", "decks-input", config.decks >= INFINITE_DECKS ? 9 : clamp(config.decks, 1, 8), 0);
    document.querySelector(`input[name='soft17'][value='${config.h17}']`).checked = true;
    $("double-rule").value = String(config.doubleRule);
    $("peek-rule").value = String(config.peek);
    $("surrender-rule").value = String(config.surrender);
    $("resplit-rule").value = String(config.resplitHands);
    $("charlie-rule").value = String(config.charlie);
    $("blackjack-pay").value = String(config.blackjackPay);
    $("optimization-rule").value = String(config.optimization);
    $("das-toggle").checked = Boolean(config.das);
    $("hsa-toggle").checked = Boolean(config.hsa);
    $("rsa-toggle").checked = Boolean(config.rsa);
    clampDeckSlider();
    state.applyingPreset = false;
    if (options.immediate) solveAndRender();
    else scheduleSolveAndRender();
}

function collectConfig() {
    const rawDecks = Number($("decks-slider").value);
    return {
        decks: rawDecks >= 9 ? INFINITE_DECKS : rawDecks,
        h17: Number(document.querySelector("input[name='soft17']:checked").value),
        doubleRule: Number($("double-rule").value),
        das: $("das-toggle").checked ? 1 : 0,
        surrender: Number($("surrender-rule").value),
        peek: Number($("peek-rule").value),
        resplitHands: Number($("resplit-rule").value),
        rsa: $("rsa-toggle").checked ? 1 : 0,
        hsa: $("hsa-toggle").checked ? 1 : 0,
        charlie: Number($("charlie-rule").value),
        blackjackPay: Number($("blackjack-pay").value),
        optimization: Number($("optimization-rule").value),
    };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value)));
}

function clampNumberFrom(id, fallback, min, max) {
    return readControlNumber(id, fallback, min, max);
}

function readControlNumber(id, fallback, min, max) {
    const control = $(id);
    const raw = control?.value?.trim() ?? "";
    const parsed = raw === "" ? NaN : Number(raw);
    return clamp(Number.isFinite(parsed) ? parsed : fallback, min, max);
}

function isPendingNumberInput(id) {
    const control = $(id);
    if (!control || control.type !== "number") return false;
    const raw = control.value.trim();
    return ["", "-", "+", ".", "-.", "+."].includes(raw) || !Number.isFinite(Number(raw));
}

function setPairedControl(rangeId, inputId, value, decimals = null, options = {}) {
    const range = $(rangeId);
    const input = $(inputId);
    const numeric = Number(value);
    const formatted = decimals === null ? String(numeric) : numeric.toFixed(decimals);
    if (range && options.preserveInputId !== rangeId) range.value = formatted;
    if (input && options.preserveInputId !== inputId) input.value = formatted;
}

function precisionStep(decimals) {
    return decimals <= 0 ? 1 : Number(`0.${"0".repeat(decimals - 1)}1`);
}

function updatePrecisionSteps() {
    const decimals = indexDecimals();
    const step = precisionStep(decimals);
    ["index-min-range", "index-max-range", "index-min-input", "index-max-input", "true-count-slider", "true-count-input"].forEach((id) => {
        const control = $(id);
        if (control) control.step = String(step);
    });
}

function finiteDeckCount(config) {
    return config.decks >= INFINITE_DECKS ? null : config.decks;
}

function deckLabel(decks) {
    return decks >= INFINITE_DECKS ? "∞" : String(decks);
}

function deckValueLabel(decks) {
    return decks >= INFINITE_DECKS ? "Infinity decks" : String(decks);
}

function displayDeckCount(decks, fallback = 6) {
    return (decks >= INFINITE_DECKS ? fallback : decks).toFixed(2);
}

function syncTrueFromRunning() {
    const decksLeft = Math.max(0.01, Number($("decks-remaining").value));
    state.trueCount = clamp(state.runningCount / decksLeft, -26, 26);
    setPairedControl("true-count-slider", "true-count-input", state.trueCount, countInputDecimals(), {
        preserveInputId: document.activeElement?.id,
    });
}

function clampDeckSlider() {
    const decks = collectConfig().decks;
    const deckCap = finiteDeckCount({ decks });
    const slider = $("decks-remaining");
    const input = $("decks-remaining-input");
    const activeId = document.activeElement?.id;
    slider.max = String(deckCap || 8);
    input.max = String(deckCap || 8);
    if (Number(slider.value) > Number(slider.max) || state.seenCards === 0) {
        setPairedControl("decks-remaining", "decks-remaining-input", displayDeckCount(decks, 8), 2, { preserveInputId: activeId });
    }
    $("decks-value").textContent = deckValueLabel(decks);
    setPairedControl("decks-slider", "decks-input", decks >= INFINITE_DECKS ? 9 : decks, 0, { preserveInputId: activeId });
    if (state.countSource === "running") syncTrueFromRunning();
}

async function loadWasm() {
    state.wasm = null;
    state.wasmReady = false;
}

async function loadReport() {
    if (location.protocol === "file:") return;
    try {
        const response = await fetch("data/solver-report.json", { cache: "no-cache" });
        if (response.ok) {
            state.report = await response.json();
            renderMetrics();
        }
    } catch (error) {
        console.warn("Report JSON unavailable", error);
    }
}

let solveFrame = 0;
let solveTimer = 0;

function scheduleSolveAndRender(delay = CONFIG_SOLVE_DEBOUNCE_MS) {
    clearTimeout(solveTimer);
    $("metric-speed").textContent = "Queued";
    solveTimer = setTimeout(() => {
        solveTimer = 0;
        solveAndRender();
    }, delay);
}

function solveAndRender() {
    clearTimeout(solveTimer);
    solveTimer = 0;
    cancelAnimationFrame(solveFrame);
    solveFrame = requestAnimationFrame(() => {
        const config = collectConfig();
        const count = $("apply-count-toggle").checked ? computeTrueCount().exact : 0;
        const start = performance.now();
        state.chart = solveChartJS(config, count);
        state.lastSolveMs = performance.now() - start;
        renderAll();
    });
}

function renderAll() {
    updateCountReadout();
    renderChartTitle();
    renderChart();
    renderLegend();
    renderHandSolver();
    renderIndexAudit();
    renderMetrics();
}

function solveChartJS(config, trueCount) {
    const cacheKey = `${JSON.stringify(config)}|${roundCount(trueCount)}`;
    analysisCache.clear();
    const rows = [
        ...HARD_ROWS.map((value) => chartRow("hard", value, config, trueCount, cacheKey)),
        ...SOFT_ROWS.map((value) => chartRow("soft", value, config, trueCount, cacheKey)),
        ...PAIR_ROWS.map((value) => chartRow("pair", value, config, trueCount, cacheKey)),
    ];

    return {
        version: "0.2.0-ev",
        rules: { ...config, trueCount },
        dealer: DEALER_VALUES.map(dealerLabel),
        dealerBust: dealerBustModel(config, trueCount),
        rows,
        metrics: metricModel(config),
        legend: [
            { code: "H", label: "Hit" },
            { code: "S", label: "Stand" },
            { code: "D", label: "Double if possible, otherwise hit" },
            { code: "Ds", label: "Double if possible, otherwise stand" },
            { code: "P", label: "Split pair" },
            { code: "Rh", label: "Surrender if possible, otherwise hit" },
            { code: "Rs", label: "Surrender if possible, otherwise stand" },
        ],
    };
}

function dealerBustModel(config, trueCount) {
    return DEALER_VALUES.map((dealer) => {
        const probs = rankProbabilities(config, trueCount, [dealer]);
        const dist = dealerDistribution(dealer, config, probs);
        return {
            dealer: dealerLabel(dealer),
            bust: dist.bust || 0,
        };
    });
}

function chartRow(kind, value, config, trueCount, cacheKey) {
    return {
        id: `${kind}-${value}`,
        kind,
        value,
        label: rowLabel(kind, value),
        cells: DEALER_VALUES.map((dealer) => chartCell(kind, value, dealer, config, trueCount, cacheKey)),
    };
}

function chartCell(kind, value, dealer, config, trueCount, cacheKey) {
    const current = analyzeCell(kind, value, dealer, config, trueCount);
    const base = analyzeCell(kind, value, dealer, config, 0);
    const generatedIndices = deriveIndexes(kind, value, dealer, config, base.best.code, cacheKey);
    const indices = indexesForCell(kind, value, dealer, config, generatedIndices);
    const action = current.best.code;
    const activeIndex = indices.find((index) => index.idir === "gte" ? trueCount >= index.i : trueCount <= index.i);
    const primaryIndex = activeIndex || indices.find((index) => indexVisible(index.i)) || indices[0];
    return {
        dealer: dealerLabel(dealer),
        a: action,
        b: base.best.code,
        m: Math.round(current.margin * 1000),
        x: Boolean(activeIndex),
        ev: round4(current.best.ev),
        gap: round4(current.margin),
        evs: Object.fromEntries(current.evs.map((item) => [item.code, round4(item.ev)])),
        probs: current.distribution,
        generatedIndices,
        indices,
        ...(primaryIndex || {}),
    };
}

function displayIndicesForCell(row, cell) {
    if (!row || !cell) return [];
    return indexesForCell(
        row.kind,
        row.value,
        dealerValueFromLabel(cell.dealer),
        collectConfig(),
        cell.generatedIndices || cell.indices || [],
    );
}

function activeDisplayIndex(indices) {
    const trueCount = $("apply-count-toggle").checked ? computeTrueCount().exact : 0;
    return indices
        .filter((index) => (index.idir === "gte" ? trueCount >= index.i : trueCount <= index.i))
        .sort((a, b) => indexActionPriority(a.ia) - indexActionPriority(b.ia))[0];
}

function indexActionPriority(code) {
    const canonical = canonicalCode(code);
    if (canonical === "R") return 0;
    if (canonical === "P") return 1;
    if (canonical === "D") return 2;
    return 3;
}

function displayActionForCell(row, cell, indices = displayIndicesForCell(row, cell), options = {}) {
    const active = activeDisplayIndex(indices);
    if (active) return active.ia;
    if (indices.length || options.fallback !== "current") return cell.b || cell.a;
    return cell.a;
}

function evForCellAction(cell, code) {
    if (!cell.evs) return cell.ev;
    const match = Object.entries(cell.evs).find(([action]) => canonicalCode(action) === canonicalCode(code));
    return match ? Number(match[1]) : cell.ev;
}

function indexesForCell(kind, value, dealer, config, generatedIndices) {
    const group = currentIndexGroup();
    if (group === "custom") return generatedIndices;

    return sourceIndexesForGroup(group, config)
        .filter((item) => item.kind === kind && item.value === value && item.dealer === dealer)
        .map((item) => ({
            i: item.i,
            ia: item.ia,
            idir: item.idir,
            if: groupLabel(group),
        }));
}

function currentIndexGroup() {
    return $("index-group")?.value || "custom";
}

function sourceIndexesForGroup(group, config) {
    const seen = new Set();
    return STANDARD_INDEXES
        .filter((item) => item.groups.includes(group))
        .filter((item) => !item.requiresSurrender || config.surrender !== 0)
        .filter((item) => {
            const key = `${item.kind}|${item.value}|${item.dealer}|${canonicalCode(item.ia)}|${item.idir}|${item.i}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function auditGroupForConfig(config) {
    const selected = currentIndexGroup();
    if (selected !== "custom") return selected;
    return config.h17 ? "bjaH17" : "bjaS17";
}

function buildIndexAudit(config = collectConfig()) {
    const group = auditGroupForConfig(config);
    const sources = sourceIndexesForGroup(group, config);
    const rows = sources.map((source) => {
        const base = analyzeCellApproximate(source.kind, source.value, source.dealer, config, 0).best.code;
        const generated = deriveIndexes(source.kind, source.value, source.dealer, config, base, `audit-${group}`);
        const match = findComparableGeneratedIndex(source, generated);
        return {
            source,
            generated: match,
            delta: match ? Math.abs(match.i - source.i) : Infinity,
        };
    });
    const matched = rows.filter((row) => Number.isFinite(row.delta));
    const avgDelta = matched.length
        ? matched.reduce((sum, row) => sum + row.delta, 0) / matched.length
        : Infinity;
    const worst = matched.reduce((current, row) => (row.delta > (current?.delta ?? -1) ? row : current), null);
    return {
        group,
        sourceCount: sources.length,
        matchedCount: matched.length,
        avgDelta,
        worst,
        rows,
    };
}

function findComparableGeneratedIndex(source, generated) {
    const sourceAction = canonicalCode(source.ia);
    const same = generated.find(
        (item) => canonicalCode(item.ia) === sourceAction && item.idir === source.idir,
    );
    if (same) return same;

    const oppositeDirection = source.idir === "gte" ? "lte" : "gte";
    return generated.find(
        (item) => item.idir === oppositeDirection && canonicalCode(item.ia) !== sourceAction,
    );
}

function groupLabel(group) {
    return {
        custom: "EV",
        illustrious18: "I18",
        fab4: "Fab 4",
        i18Fab4: "I18 + Fab 4",
        sweet16: "Sweet 16",
        catch20: "Catch 20",
        catch22: "Catch 22",
        bjaS17: "BJA S17",
        bjaH17: "BJA H17",
        jackaceMdS17: "JackAce MD S17",
    }[group] || "Index";
}

function rowLabel(kind, value) {
    if (kind === "hard") return String(value);
    if (kind === "soft") return `A${value}`;
    if (value === 11) return "AA";
    if (value === 10) return "TT";
    return `${value}${value}`;
}

function dealerLabel(value) {
    if (value === 10) return "T";
    return value === 11 ? "A" : String(value);
}

function dealerValueFromLabel(label) {
    if (label === "T") return 10;
    return label === "A" ? 11 : Number(label);
}

function round4(value) {
    return Math.round(value * 10000) / 10000;
}

function roundCount(value) {
    return Math.round(Number(value) * 1000) / 1000;
}

function rankProbabilities(config, trueCount, deadCards = []) {
    const finiteDecks = finiteDeckCount(config);
    const dead = deadCards.reduce((counts, rank) => {
        const normalized = normalizeCardRank(rank);
        counts[normalized] = (counts[normalized] || 0) + 1;
        return counts;
    }, {});
    const counts = {};
    CARD_RANKS.forEach((rank) => {
        counts[rank] = finiteDecks
            ? Math.max(0, finiteDecks * CARDS_PER_DECK_BY_RANK[rank] - (dead[rank] || 0))
            : CARDS_PER_DECK_BY_RANK[rank];
    });
    return probabilitiesFromCounts(counts, trueCount);
}

function probabilitiesFromCounts(counts, trueCount) {
    const weights = hiLoWeightedRanks(counts, trueCount);
    const total = weights.reduce((sum, item) => sum + item.weight, 0);
    if (!total) return [];
    return weights.map((item) => ({ rank: item.rank, p: item.weight / total }));
}

function hiLoWeightedRanks(counts, trueCount) {
    const totalCards = countTotal(counts);
    if (!totalCards) return [];
    const baseMean = CARD_RANKS.reduce((sum, rank) => sum + (counts[rank] || 0) * HI_LO_TAG[rank], 0) / totalCards;
    const targetMean = clampTagMean(baseMean - Number(trueCount || 0) / 52, counts);
    const lambda = solveHiLoLambda(counts, targetMean);
    return CARD_RANKS
        .filter((rank) => (counts[rank] || 0) > 0)
        .map((rank) => ({
            rank,
            weight: counts[rank] * Math.exp(lambda * HI_LO_TAG[rank]),
        }));
}

function clampTagMean(targetMean, counts) {
    const availableTags = CARD_RANKS.filter((rank) => (counts[rank] || 0) > 0).map((rank) => HI_LO_TAG[rank]);
    const min = Math.min(...availableTags);
    const max = Math.max(...availableTags);
    return clamp(targetMean, min + 1e-9, max - 1e-9);
}

function solveHiLoLambda(counts, targetMean) {
    const naturalMean = weightedTagMean(counts, 0);
    if (Math.abs(naturalMean - targetMean) < 1e-12) return 0;
    let low = -30;
    let high = 30;
    for (let i = 0; i < 80; i += 1) {
        const mid = (low + high) / 2;
        const mean = weightedTagMean(counts, mid);
        if (mean < targetMean) low = mid;
        else high = mid;
    }
    return (low + high) / 2;
}

function weightedTagMean(counts, lambda) {
    let weightedTag = 0;
    let total = 0;
    CARD_RANKS.forEach((rank) => {
        const count = counts[rank] || 0;
        if (count <= 0) return;
        const weight = count * Math.exp(lambda * HI_LO_TAG[rank]);
        weightedTag += weight * HI_LO_TAG[rank];
        total += weight;
    });
    return total ? weightedTag / total : 0;
}

function canDoubleJS(config, kind, hardTotal, lowTotal) {
    if (config.doubleRule === 0) return true;
    if (config.doubleRule === 1) return kind !== "soft" && hardTotal >= 9 && hardTotal <= 11;
    if (config.doubleRule === 2) return kind !== "soft" && hardTotal >= 10 && hardTotal <= 11;
    const constrained = kind === "soft" ? lowTotal : hardTotal;
    return constrained >= 9 && constrained <= 11;
}

function doubleHit(config, kind, hardTotal, lowTotal) {
    return canDoubleJS(config, kind, hardTotal, lowTotal) ? "D" : "H";
}

function doubleStand(config, kind, hardTotal, lowTotal) {
    return canDoubleJS(config, kind, hardTotal, lowTotal) ? "Ds" : "S";
}

function analyzeCell(kind, value, dealer, config, trueCount) {
    const key = `${JSON.stringify(config)}|${roundCount(trueCount)}|${kind}|${value}|${dealer}`;
    if (analysisCache.has(key)) return analysisCache.get(key);

    const approximate = analyzeCellApproximate(kind, value, dealer, config, trueCount);
    if (!usesCompositionSolver(config) || approximate.margin > COMPOSITION_RECHECK_MARGIN) {
        analysisCache.set(key, approximate);
        return approximate;
    }

    const startingCards = representativeHand(kind, value);
    const exact = analyzeCompositionHand(startingCards, dealer, config, trueCount);
    if (exact) {
        analysisCache.set(key, exact);
        return exact;
    }

    analysisCache.set(key, approximate);
    return approximate;
}

function analyzeCellApproximate(kind, value, dealer, config, trueCount) {
    const key = `${JSON.stringify(config)}|approx|${roundCount(trueCount)}|${kind}|${value}|${dealer}`;
    if (analysisCache.has(key)) return analysisCache.get(key);

    const startingCards = representativeHand(kind, value);
    const deadCards = [...startingCards, dealer];
    const probs = rankProbabilities(config, trueCount, deadCards);
    const dealerDist = dealerDistribution(dealer, config, probs);
    const initial = stateForRow(kind, value);
    const memo = new Map();
    const evs = [];

    const stand = standEv(initial, dealerDist);
    evs.push({ code: "S", ev: stand, label: ACTIONS.S.label, distribution: standDistribution(initial) });

    const hit = hitEv(initial, dealerDist, config, probs, memo);
    evs.push({ code: "H", ev: hit.ev, label: ACTIONS.H.label, distribution: hit.distribution });

    const hardTotal = hardEquivalent(kind, value);
    const lowTotal = kind === "soft" ? value + 1 : hardTotal;
    if (canDoubleJS(config, kind, hardTotal, lowTotal)) {
        const doubled = doubleEv(initial, dealerDist, config, probs);
        const code = stand > hit.ev ? "Ds" : "D";
        evs.push({ code, ev: doubled.ev, label: ACTIONS[code].label, distribution: doubled.distribution });
    }

    if (config.surrender !== 0 && surrenderAllowed(kind, value, dealer, config)) {
        const code = stand > hit.ev ? "Rs" : "Rh";
        evs.push({ code, ev: -0.5, label: ACTIONS[code].label, distribution: { surrender: 1 } });
    }

    if (kind === "pair") {
        const split = splitEv(value, dealerDist, config, probs, memo);
        evs.push({ code: "P", ev: split.ev, label: ACTIONS.P.label, distribution: split.distribution });
    }

    evs.sort((a, b) => b.ev - a.ev);
    const best = evs[0];
    const second = evs[1] || best;
    const result = {
        best,
        evs,
        margin: Math.max(0, best.ev - second.ev),
        distribution: normalizeDistribution(best.distribution),
    };
    analysisCache.set(key, result);
    return result;
}

function representativeHand(kind, value) {
    if (kind === "soft") return [11, value];
    if (kind === "pair") return [value, value];
    const hardHands = {
        8: [5, 3],
        9: [5, 4],
        10: [6, 4],
        11: [6, 5],
        12: [10, 2],
        13: [10, 3],
        14: [10, 4],
        15: [10, 5],
        16: [10, 6],
        17: [10, 7],
    };
    return hardHands[value] || [10, Math.max(2, value - 10)];
}

function analyzeActualHand(cards, dealer, config, trueCount) {
    const normalizedCards = cards.map(normalizeCardRank);
    const key = `${JSON.stringify(config)}|actual|${roundCount(trueCount)}|${normalizedCards.join("-")}|${dealer}`;
    if (analysisCache.has(key)) return analysisCache.get(key);

    const exact = analyzeCompositionHand(normalizedCards, dealer, config, trueCount);
    if (exact) {
        analysisCache.set(key, exact);
        return exact;
    }

    const probs = rankProbabilities(config, trueCount, [...normalizedCards, dealer]);
    const dealerDist = dealerDistribution(dealer, config, probs);
    const initial = handStateFromCards(normalizedCards);
    const memo = new Map();
    const evs = [];

    const stand = standEv(initial, dealerDist);
    evs.push({ code: "S", ev: stand, label: ACTIONS.S.label, distribution: standDistribution(initial) });

    const hit = hitEv(initial, dealerDist, config, probs, memo);
    evs.push({ code: "H", ev: hit.ev, label: ACTIONS.H.label, distribution: hit.distribution });

    const hardTotal = initial.total;
    const lowTotal = normalizedCards.reduce((sum, card) => sum + (card === 11 ? 1 : card), 0);
    const handKind = initial.soft > 0 ? "soft" : "hard";
    if (normalizedCards.length === 2 && canDoubleJS(config, handKind, hardTotal, lowTotal)) {
        const doubled = doubleEv(initial, dealerDist, config, probs);
        const code = stand > hit.ev ? "Ds" : "D";
        evs.push({ code, ev: doubled.ev, label: ACTIONS[code].label, distribution: doubled.distribution });
    }

    if (config.surrender !== 0 && normalizedCards.length === 2 && surrenderAllowedActual(initial, dealer, config)) {
        const code = stand > hit.ev ? "Rs" : "Rh";
        evs.push({ code, ev: -0.5, label: ACTIONS[code].label, distribution: { surrender: 1 } });
    }

    if (normalizedCards.length === 2 && normalizedCards[0] === normalizedCards[1]) {
        const split = splitEv(normalizedCards[0], dealerDist, config, probs, memo);
        evs.push({ code: "P", ev: split.ev, label: ACTIONS.P.label, distribution: split.distribution });
    }

    evs.sort((a, b) => b.ev - a.ev);
    const best = evs[0];
    const second = evs[1] || best;
    const result = {
        best,
        evs,
        margin: Math.max(0, best.ev - second.ev),
        distribution: normalizeDistribution(best.distribution),
    };
    analysisCache.set(key, result);
    return result;
}

function analyzeCompositionHand(cards, dealer, config, trueCount) {
    if (!usesCompositionSolver(config)) return null;

    const normalizedCards = cards.map(normalizeCardRank);
    const counts = visibleDeckCounts(config, [...normalizedCards, dealer]);
    if (!counts) return null;

    const scenarios = initialDealerScenarios(counts, dealer, config, trueCount);
    if (!scenarios.length) return null;

    const initial = handStateFromCards(normalizedCards);
    const memo = { dealer: new Map(), player: new Map() };
    const evs = [];

    const stand = standEvExact(initial, dealer, scenarios, config, trueCount, memo);
    evs.push({ code: "S", ev: stand, label: ACTIONS.S.label, distribution: standDistribution(initial) });

    const hit = hitEvExact(initial, dealer, scenarios, config, trueCount, memo);
    evs.push({ code: "H", ev: hit.ev, label: ACTIONS.H.label, distribution: hit.distribution });

    const hardTotal = initial.total;
    const lowTotal = normalizedCards.reduce((sum, card) => sum + (card === 11 ? 1 : card), 0);
    const handKind = initial.soft > 0 ? "soft" : "hard";
    if (normalizedCards.length === 2 && canDoubleJS(config, handKind, hardTotal, lowTotal)) {
        const doubled = doubleEvExact(initial, dealer, scenarios, config, trueCount, memo);
        const code = stand > hit.ev ? "Ds" : "D";
        evs.push({ code, ev: doubled.ev, label: ACTIONS[code].label, distribution: doubled.distribution });
    }

    if (config.surrender !== 0 && normalizedCards.length === 2 && surrenderAllowedActual(initial, dealer, config)) {
        const code = stand > hit.ev ? "Rs" : "Rh";
        evs.push({ code, ev: -0.5, label: ACTIONS[code].label, distribution: { surrender: 1 } });
    }

    if (normalizedCards.length === 2 && normalizedCards[0] === normalizedCards[1]) {
        const split = splitEvExact(normalizedCards[0], dealer, scenarios, config, trueCount, memo);
        evs.push({ code: "P", ev: split.ev, label: ACTIONS.P.label, distribution: split.distribution });
    }

    evs.sort((a, b) => b.ev - a.ev);
    const best = evs[0];
    const second = evs[1] || best;
    return {
        best,
        evs,
        margin: Math.max(0, best.ev - second.ev),
        distribution: normalizeDistribution(best.distribution),
    };
}

function usesCompositionSolver(config) {
    const decks = finiteDeckCount(config);
    return Boolean(decks && decks <= COMPOSITION_SOLVER_MAX_DECKS);
}

function normalizeCardRank(rank) {
    return rank === 11 ? 11 : Math.min(10, Number(rank));
}

function visibleDeckCounts(config, visibleCards) {
    const decks = finiteDeckCount(config);
    if (!decks) return null;
    const counts = {};
    CARD_RANKS.forEach((rank) => {
        counts[rank] = decks * CARDS_PER_DECK_BY_RANK[rank];
    });
    for (const card of visibleCards) {
        const rank = normalizeCardRank(card);
        counts[rank] -= 1;
        if (counts[rank] < 0) return null;
    }
    return counts;
}

function initialDealerScenarios(counts, dealer, config, trueCount) {
    const blockedRank = blockedDealerHoleRank(dealer, config);
    const draws = weightedDraws(counts, trueCount, (rank) => rank !== blockedRank);
    return normalizeScenarios(
        draws.map(({ rank, p }) => ({
            w: p,
            hole: rank,
            counts: removeCountRank(counts, rank),
        })),
    );
}

function blockedDealerHoleRank(dealer, config) {
    const shouldPeek =
        config.peek === 0 ||
        config.peek === 3 ||
        (config.peek === 2 && dealer === 11);
    if (!shouldPeek) return null;
    if (dealer === 10) return 11;
    if (dealer === 11) return 10;
    return null;
}

function weightedDraws(counts, trueCount, filter = () => true) {
    const filteredCounts = {};
    CARD_RANKS.forEach((rank) => {
        filteredCounts[rank] = counts[rank] > 0 && filter(rank) ? counts[rank] : 0;
    });
    const draws = hiLoWeightedRanks(filteredCounts, trueCount);
    const total = draws.reduce((sum, item) => sum + item.weight, 0);
    if (!total) return [];
    return draws.map((item) => ({ rank: item.rank, p: item.weight / total }));
}

function removeCountRank(counts, rank) {
    const next = { ...counts };
    next[rank] = Math.max(0, next[rank] - 1);
    return next;
}

function countTotal(counts) {
    return CARD_RANKS.reduce((sum, rank) => sum + counts[rank], 0);
}

function countKey(counts) {
    return CARD_RANKS.map((rank) => counts[rank]).join(",");
}

function normalizeScenarios(scenarios) {
    const merged = new Map();
    scenarios.forEach((scenario) => {
        if (!scenario || scenario.w <= 0) return;
        const key = `${scenario.hole}|${countKey(scenario.counts)}`;
        const current = merged.get(key);
        if (current) current.w += scenario.w;
        else merged.set(key, { ...scenario, counts: { ...scenario.counts } });
    });
    const total = [...merged.values()].reduce((sum, scenario) => sum + scenario.w, 0);
    if (!total) return [];
    return [...merged.values()]
        .sort((a, b) => a.hole - b.hole || countKey(a.counts).localeCompare(countKey(b.counts)))
        .map((scenario) => ({ ...scenario, w: scenario.w / total }));
}

function scenarioKey(scenarios) {
    return scenarios
        .map((scenario) => `${scenario.hole}:${scenario.w.toFixed(8)}:${countKey(scenario.counts)}`)
        .join("|");
}

function drawTransitionsFromScenarios(scenarios, trueCount) {
    const buckets = new Map();
    scenarios.forEach((scenario) => {
        if (countTotal(scenario.counts) <= 0) return;
        weightedDraws(scenario.counts, trueCount).forEach(({ rank, p }) => {
            const bucket = buckets.get(rank) || [];
            bucket.push({
                w: scenario.w * p,
                hole: scenario.hole,
                counts: removeCountRank(scenario.counts, rank),
            });
            buckets.set(rank, bucket);
        });
    });

    return [...buckets.entries()]
        .map(([rank, bucket]) => {
            const p = bucket.reduce((sum, scenario) => sum + scenario.w, 0);
            return { rank, p, scenarios: normalizeScenarios(bucket) };
        })
        .filter((item) => item.p > 0 && item.scenarios.length)
        .sort((a, b) => a.rank - b.rank);
}

function standEvExact(hand, dealer, scenarios, config, trueCount, memo) {
    if (hand.bust) return -1;
    return scenarios.reduce((ev, scenario) => {
        const start = dealer === 11 ? { total: 11, soft: 1 } : { total: dealer, soft: 0 };
        const afterHole = addDealerRank(start, scenario.hole);
        const dist = dealerDrawDistributionExact(afterHole.total, afterHole.soft, scenario.counts, config, trueCount, memo.dealer);
        return ev + scenario.w * standEv(hand, dist);
    }, 0);
}

function hitEvExact(hand, dealer, scenarios, config, trueCount, memo) {
    const distribution = {};
    let ev = 0;
    drawTransitionsFromScenarios(scenarios, trueCount).forEach(({ rank, p, scenarios: nextScenarios }) => {
        const next = addRank(hand, rank);
        const branch = continuationExact(next, dealer, nextScenarios, config, trueCount, memo, false);
        ev += p * branch.ev;
        mergeDistribution(distribution, branch.distribution, p);
    });
    return { ev, distribution: normalizeDistribution(distribution) };
}

function doubleEvExact(hand, dealer, scenarios, config, trueCount, memo) {
    const distribution = {};
    let ev = 0;
    drawTransitionsFromScenarios(scenarios, trueCount).forEach(({ rank, p, scenarios: nextScenarios }) => {
        const next = addRank(hand, rank);
        const stand = next.bust ? -2 : 2 * standEvExact(next, dealer, nextScenarios, config, trueCount, memo);
        ev += p * stand;
        mergeDistribution(distribution, next.bust ? { bust: 1 } : standDistribution(next), p);
    });
    return { ev, distribution: normalizeDistribution(distribution) };
}

function splitEvExact(pairRank, dealer, scenarios, config, trueCount, memo) {
    const distribution = {};
    let perHandEv = 0;
    drawTransitionsFromScenarios(scenarios, trueCount).forEach(({ rank, p, scenarios: nextScenarios }) => {
        const starting = addRank(splitSeed(pairRank), rank);
        const branch =
            pairRank === 11 && !config.hsa
                ? {
                    ev: standEvExact(starting, dealer, nextScenarios, config, trueCount, memo),
                    distribution: standDistribution(starting),
                }
                : continuationExact(starting, dealer, nextScenarios, config, trueCount, memo, Boolean(config.das));
        perHandEv += p * branch.ev;
        mergeDistribution(distribution, branch.distribution, p);
    });
    return { ev: perHandEv * 2, distribution: normalizeDistribution(distribution) };
}

function continuationExact(hand, dealer, scenarios, config, trueCount, memo, canDouble) {
    if (hand.bust) return { ev: -1, distribution: { bust: 1 } };
    if (config.charlie && hand.cards >= config.charlie) {
        return { ev: 1, distribution: standDistribution(hand) };
    }
    const key = `${hand.total}|${hand.soft}|${hand.cards}|${canDouble ? 1 : 0}|${scenarioKey(scenarios)}`;
    if (memo.player.has(key)) return memo.player.get(key);

    const stand = {
        code: "S",
        ev: standEvExact(hand, dealer, scenarios, config, trueCount, memo),
        distribution: standDistribution(hand),
    };
    const hit = hitEvExact(hand, dealer, scenarios, config, trueCount, memo);
    const choices = [{ code: "H", ev: hit.ev, distribution: hit.distribution }, stand];
    if (canDouble && hand.cards === 2) {
        const doubled = doubleEvExact(hand, dealer, scenarios, config, trueCount, memo);
        choices.push({ code: stand.ev > hit.ev ? "Ds" : "D", ev: doubled.ev, distribution: doubled.distribution });
    }

    choices.sort((a, b) => b.ev - a.ev);
    const best = choices[0];
    memo.player.set(key, best);
    return best;
}

function dealerDrawDistributionExact(total, soft, counts, config, trueCount, memo) {
    if (total > 21) return { bust: 1 };
    const shouldStand = total > 17 || (total === 17 && !(config.h17 && soft > 0));
    if (shouldStand) return { [String(total)]: 1 };
    const key = `${total}|${soft}|${countKey(counts)}`;
    if (memo.has(key)) return memo.get(key);
    const dist = emptyDealerDistribution();
    weightedDraws(counts, trueCount).forEach(({ rank, p }) => {
        const next = addDealerRank({ total, soft }, rank);
        mergeDistribution(
            dist,
            dealerDrawDistributionExact(next.total, next.soft, removeCountRank(counts, rank), config, trueCount, memo),
            p,
        );
    });
    const normalized = normalizeDistribution(dist);
    memo.set(key, normalized);
    return normalized;
}

function handStateFromCards(cards) {
    let total = 0;
    let soft = 0;
    cards.forEach((card) => {
        if (card === 11) {
            total += 11;
            soft += 1;
        } else {
            total += card;
        }
    });
    return normalizeHand(total, soft, cards.length);
}

function surrenderAllowedActual(hand, dealer, config) {
    if (config.surrender === 3) return dealer === 10 || dealer === 11;
    if (config.surrender === 2) return dealer === 10;
    if (config.surrender !== 1) return false;
    return hand.total >= 14 && hand.total <= 17 && (dealer === 9 || dealer === 10 || dealer === 11);
}

function hardEquivalent(kind, value) {
    if (kind === "hard") return value;
    if (kind === "soft") return value + 11;
    return value * 2;
}

function stateForRow(kind, value) {
    if (kind === "soft") return normalizeHand(value + 11, 1, 2);
    if (kind === "pair") {
        if (value === 11) return normalizeHand(12, 1, 2);
        return normalizeHand(value * 2, 0, 2);
    }
    return normalizeHand(value, 0, 2);
}

function normalizeHand(total, softAces, cards) {
    let adjustedTotal = total;
    let adjustedSoft = softAces;
    while (adjustedTotal > 21 && adjustedSoft > 0) {
        adjustedTotal -= 10;
        adjustedSoft -= 1;
    }
    return { total: adjustedTotal, soft: adjustedSoft, cards, bust: adjustedTotal > 21 };
}

function addRank(hand, rank) {
    if (rank === 11) return normalizeHand(hand.total + 11, hand.soft + 1, hand.cards + 1);
    return normalizeHand(hand.total + rank, hand.soft, hand.cards + 1);
}

function dealerDistribution(upcard, config, probs) {
    const start = upcard === 11 ? { total: 11, soft: 1 } : { total: upcard, soft: 0 };
    const conditioned = conditionHoleCards(upcard, config, probs);
    const memo = new Map();
    const dist = emptyDealerDistribution();

    conditioned.forEach(({ rank, p }) => {
        const afterHole = addDealerRank(start, rank);
        mergeDistribution(dist, dealerDrawDistribution(afterHole.total, afterHole.soft, config, probs, memo), p);
    });

    return normalizeDistribution(dist);
}

function conditionHoleCards(upcard, config, probs) {
    const shouldPeek =
        config.peek === 0 ||
        config.peek === 3 ||
        (config.peek === 2 && upcard === 11);
    if (!shouldPeek || (upcard !== 10 && upcard !== 11)) return probs;
    const blockedRank = upcard === 11 ? 10 : 11;
    const filtered = probs.filter((item) => item.rank !== blockedRank);
    const total = filtered.reduce((sum, item) => sum + item.p, 0);
    return filtered.map((item) => ({ rank: item.rank, p: item.p / total }));
}

function addDealerRank(hand, rank) {
    let total = hand.total + (rank === 11 ? 11 : rank);
    let soft = hand.soft + (rank === 11 ? 1 : 0);
    while (total > 21 && soft > 0) {
        total -= 10;
        soft -= 1;
    }
    return { total, soft };
}

function dealerDrawDistribution(total, soft, config, probs, memo) {
    if (total > 21) return { bust: 1 };
    const shouldStand = total > 17 || (total === 17 && !(config.h17 && soft > 0));
    if (shouldStand) return { [String(total)]: 1 };
    const key = `${total}|${soft}`;
    if (memo.has(key)) return memo.get(key);
    const dist = emptyDealerDistribution();
    probs.forEach(({ rank, p }) => {
        const next = addDealerRank({ total, soft }, rank);
        mergeDistribution(dist, dealerDrawDistribution(next.total, next.soft, config, probs, memo), p);
    });
    const normalized = normalizeDistribution(dist);
    memo.set(key, normalized);
    return normalized;
}

function standEv(hand, dealerDist) {
    if (hand.bust) return -1;
    let ev = 0;
    Object.entries(dealerDist).forEach(([outcome, p]) => {
        if (outcome === "bust") ev += p;
        else {
            const dealerTotal = Number(outcome);
            ev += p * (hand.total > dealerTotal ? 1 : hand.total < dealerTotal ? -1 : 0);
        }
    });
    return ev;
}

function hitEv(hand, dealerDist, config, probs, memo) {
    const distribution = {};
    let ev = 0;
    probs.forEach(({ rank, p }) => {
        const next = addRank(hand, rank);
        const branch = continuation(next, dealerDist, config, probs, memo, false);
        ev += p * branch.ev;
        mergeDistribution(distribution, branch.distribution, p);
    });
    return { ev, distribution: normalizeDistribution(distribution) };
}

function doubleEv(hand, dealerDist, config, probs) {
    const distribution = {};
    let ev = 0;
    probs.forEach(({ rank, p }) => {
        const next = addRank(hand, rank);
        const stand = next.bust ? -2 : 2 * standEv(next, dealerDist);
        ev += p * stand;
        mergeDistribution(distribution, next.bust ? { bust: 1 } : standDistribution(next), p);
    });
    return { ev, distribution: normalizeDistribution(distribution) };
}

function splitEv(pairRank, dealerDist, config, probs, memo) {
    const distribution = {};
    let perHandEv = 0;
    probs.forEach(({ rank, p }) => {
        const starting = addRank(splitSeed(pairRank), rank);
        const branch =
            pairRank === 11 && !config.hsa
                ? { ev: standEv(starting, dealerDist), distribution: standDistribution(starting) }
                : continuation(starting, dealerDist, config, probs, memo, Boolean(config.das));
        perHandEv += p * branch.ev;
        mergeDistribution(distribution, branch.distribution, p);
    });
    return { ev: perHandEv * 2, distribution: normalizeDistribution(distribution) };
}

function splitSeed(pairRank) {
    if (pairRank === 11) return normalizeHand(11, 1, 1);
    return normalizeHand(pairRank, 0, 1);
}

function continuation(hand, dealerDist, config, probs, memo, canDouble) {
    if (hand.bust) return { ev: -1, distribution: { bust: 1 } };
    if (config.charlie && hand.cards >= config.charlie) {
        return { ev: 1, distribution: standDistribution(hand) };
    }
    const key = `${hand.total}|${hand.soft}|${hand.cards}|${canDouble ? 1 : 0}`;
    if (memo.has(key)) return memo.get(key);

    const stand = { code: "S", ev: standEv(hand, dealerDist), distribution: standDistribution(hand) };
    const hit = hitEv(hand, dealerDist, config, probs, memo);
    const choices = [{ code: "H", ev: hit.ev, distribution: hit.distribution }, stand];
    if (canDouble && hand.cards === 2) {
        const doubled = doubleEv(hand, dealerDist, config, probs);
        choices.push({ code: stand.ev > hit.ev ? "Ds" : "D", ev: doubled.ev, distribution: doubled.distribution });
    }

    choices.sort((a, b) => b.ev - a.ev);
    const best = choices[0];
    memo.set(key, best);
    return best;
}

function standDistribution(hand) {
    if (hand.bust) return { bust: 1 };
    return { [String(hand.total)]: 1 };
}

function emptyDealerDistribution() {
    return { "17": 0, "18": 0, "19": 0, "20": 0, "21": 0, bust: 0 };
}

function mergeDistribution(target, source, weight = 1) {
    Object.entries(source).forEach(([key, value]) => {
        target[key] = (target[key] || 0) + value * weight;
    });
}

function normalizeDistribution(dist) {
    const total = Object.values(dist).reduce((sum, value) => sum + value, 0);
    if (!total) return dist;
    const normalized = {};
    Object.entries(dist).forEach(([key, value]) => {
        if (value > 0.000001) normalized[key] = value / total;
    });
    return normalized;
}

function surrenderAllowed(kind, value, dealer, config) {
    if (config.surrender === 3) return dealer === 10 || dealer === 11;
    if (config.surrender === 2) return dealer === 10;
    if (config.surrender !== 1) return false;
    const total = hardEquivalent(kind, value);
    return total >= 14 && total <= 17 && (dealer === 9 || dealer === 10 || dealer === 11);
}

function deriveIndexes(kind, value, dealer, config, baseCode, cacheKey) {
    const indexKey = `${JSON.stringify(config)}|idx|${kind}|${value}|${dealer}|${baseCode}`;
    if (indexCache.has(indexKey)) return indexCache.get(indexKey);

    const baseAnalysis = analyzeCellApproximate(kind, value, dealer, config, 0);
    const candidates = baseAnalysis.evs.filter((item) => canonicalCode(item.code) !== canonicalCode(baseCode));
    const crossings = [];

    candidates.forEach((candidate) => {
        const lowDelta = actionDelta(kind, value, dealer, config, candidate.code, baseCode, -26);
        const highDelta = actionDelta(kind, value, dealer, config, candidate.code, baseCode, 26);

        if (highDelta > 0) {
            crossings.push({
                alt: candidate.code,
                idir: "gte",
                threshold: refineIndexThreshold(kind, value, dealer, config, baseCode, candidate.code, "gte", 0, 26),
            });
        }

        if (lowDelta > 0) {
            crossings.push({
                alt: candidate.code,
                idir: "lte",
                threshold: refineIndexThreshold(kind, value, dealer, config, baseCode, candidate.code, "lte", -26, 0),
            });
        }
    });

    if (!crossings.length) {
        indexCache.set(indexKey, []);
        return [];
    }

    crossings.sort((a, b) => Math.abs(a.threshold) - Math.abs(b.threshold));
    const seen = new Set();
    const result = crossings
        .map((chosen) => ({
            i: Number(chosen.threshold.toFixed(3)),
            ia: chosen.alt,
            idir: chosen.idir,
            if: "EV",
        }))
        .filter((item) => {
            const key = `${canonicalCode(item.ia)}|${item.idir}|${item.i.toFixed(2)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    indexCache.set(indexKey, result);
    return result;
}

function refineIndexThreshold(kind, value, dealer, config, baseCode, altCode, direction, lowCount, highCount) {
    let low = lowCount;
    let high = highCount;
    for (let i = 0; i < 14; i += 1) {
        const mid = (low + high) / 2;
        const delta = actionDelta(kind, value, dealer, config, altCode, baseCode, mid);
        if (direction === "gte") {
            if (delta >= 0) high = mid;
            else low = mid;
        } else if (delta >= 0) low = mid;
        else high = mid;
    }
    return direction === "gte" ? high : low;
}

function actionDelta(kind, value, dealer, config, altCode, baseCode, trueCount) {
    const analysis = analyzeCellApproximate(kind, value, dealer, config, trueCount);
    return evForCode(analysis, altCode) - evForCode(analysis, baseCode);
}

function evForCode(analysis, code) {
    const match = analysis.evs.find((item) => canonicalCode(item.code) === canonicalCode(code));
    return match ? match.ev : -Infinity;
}

function canonicalCode(code) {
    if (code === "D" || code === "Ds") return "D";
    if (code === "Rh" || code === "Rs") return "R";
    return code;
}

function metricModel(config) {
    let edge = { 1: 0.11, 2: -0.24, 4: -0.4, 5: -0.44, 6: -0.46, 8: -0.49 }[config.decks] ?? -0.46;
    if (config.h17) edge -= 0.21;
    edge += [0, -0.09, -0.18, -0.06][config.doubleRule] ?? 0;
    if (!config.das) edge -= 0.12;
    edge += [0, -0.11, -0.1, -0.03][config.peek] ?? 0;
    edge += config.surrender === 1 ? (config.h17 ? 0.1 : 0.07) : config.surrender === 2 ? 0.23 : config.surrender === 3 ? (config.h17 ? 0.72 : 0.63) : 0;
    edge += config.resplitHands === 3 ? 0.04 : config.resplitHands === 4 ? 0.06 : 0;
    if (config.rsa) edge += 0.04;
    if (config.hsa) edge += 0.18;
    edge += config.charlie === 5 ? 0.3 : config.charlie === 6 ? 0.16 : config.charlie === 7 ? 0.01 : 0;
    edge += [0, -1.36, 2.27, -2.27][config.blackjackPay] ?? 0;
    edge += config.optimization === 1 ? 0.006 : config.optimization === 2 ? 0.02 : 0;
    let stdev = config.decks === 1 ? 1.151 : config.decks === 2 ? 1.144 : 1.14;
    if (config.blackjackPay === 2) stdev += 0.034;
    if (config.surrender !== 0) stdev -= 0.012;
    if (!config.das) stdev -= 0.014;
    if (config.peek === 1) stdev -= 0.02;
    if (config.doubleRule === 2) stdev -= 0.04;
    return {
        playerEdgePct: Number(edge.toFixed(3)),
        houseEdgePct: Number((-edge).toFixed(3)),
        stdevPerHand: Number(stdev.toFixed(3)),
        stdevPerWager: Number((stdev / 1.065).toFixed(3)),
        combosSupported: 884736,
        cellsPerChart: 280,
    };
}

function renderChartTitle() {
    const config = collectConfig();
    const parts = [
        `${deckLabel(config.decks)}D`,
        config.h17 ? "H17" : "S17",
        config.das ? "DAS" : "NDAS",
        ["Peek", "No peek", "Ace peek", "Playtech"][config.peek],
        ["No surrender", "Late surrender", "Early 10", "Full early"][config.surrender],
    ];
    $("chart-title").textContent = parts.join(", ");
}

function renderChart() {
    if (!state.chart) return;

    const table = $("strategy-table");
    table.classList.add("compact");
    table.classList.toggle("ev-mode", $("view-mode").value === "ev");
    document.body.classList.toggle("colorblind", $("colorblind-toggle").checked);
    $("chart-panel").classList.toggle("index-hidden", !$("show-indices-toggle").checked);

    const dealerOrder = $("reverse-26-toggle").checked
        ? ["6", "5", "4", "3", "2", "7", "8", "9", "T", "A"]
        : state.chart.dealer;

    const bustByDealer = new Map((state.chart.dealerBust || []).map((item) => [item.dealer, item.bust]));
    let html = "<thead><tr><th class='row-head'>Hand</th>";
    dealerOrder.forEach((dealer) => {
        const bust = bustByDealer.get(dealer) || 0;
        html += `<th><button class="dealer-head" type="button" data-dealer="${dealer}" title="Dealer outcome distribution for ${dealer}"><span class="dealer-card">${dealer}</span><span class="dealer-bust">${formatHeaderPercent(bust)}</span></button></th>`;
    });
    html += "</tr></thead><tbody>";

    let previousKind = "";
    state.chart.rows.forEach((row) => {
        const groupStart = previousKind && previousKind !== row.kind ? " group-start" : "";
        previousKind = row.kind;
        html += `<tr class="${groupStart}"><th class="row-head">${row.label}</th>`;
        dealerOrder.forEach((dealer) => {
            const cell = row.cells.find((item) => item.dealer === dealer);
            html += `<td>${cellButton(row, cell)}</td>`;
        });
        html += "</tr>";
    });
    html += "</tbody>";
    table.innerHTML = html;

    table.querySelectorAll(".action-cell").forEach((button) => {
        button.addEventListener("click", () => {
            const row = state.chart.rows.find((item) => item.id === button.dataset.row);
            const cell = JSON.parse(button.dataset.cell);
            selectChartHand(row, cell);
        });
    });
    table.querySelectorAll(".dealer-head").forEach((button) => {
        button.addEventListener("click", () => showDealerModal(button.dataset.dealer));
    });

    markSelectedCell();
}

function selectChartHand(row, cell) {
    if (!row || !cell) return;
    state.hand = representativeHand(row.kind, row.value);
    state.dealer = dealerValueFromLabel(cell.dealer);
    $("dealer-select").value = String(state.dealer);
    state.selected = {
        rowId: row.id,
        rowLabel: row.label,
        dealer: cell.dealer,
    };
    renderHandTray();
    renderHandSolver();
    markSelectedCell();
}

function cellButton(row, cell) {
    const evMode = $("view-mode").value === "ev";
    const displayIndices = displayIndicesForCell(row, cell);
    const displayAction = displayActionForCell(row, cell, displayIndices);
    const action = ACTIONS[displayAction] || ACTIONS.H;
    const active = activeDisplayIndex(displayIndices) ? " active-index" : "";
    const selected =
        state.selected && state.selected.rowId === row.id && state.selected.dealer === cell.dealer
            ? " selected-cell"
            : "";
    const visibleIndices = displayIndices.filter((index) => indexVisible(index.i));
    const badge = visibleIndices.length
        ? `<span class="index-badge">${visibleIndices
            .map((index) => `<span>${formatIndexBadge(index)}</span>`)
            .join(" ")}</span>`
        : "";
    const displayEv = round4(evForCellAction(cell, displayAction));
    const payload = JSON.stringify({ ...cell, a: displayAction, ev: displayEv, indices: displayIndices, x: Boolean(active) }).replaceAll('"', "&quot;");
    const title = `${row.label} vs ${cell.dealer}: ${action.label}`;
    const evMarkup = evMode
        ? `<span class="cell-ev">${formatSigned(displayEv)}</span><span class="cell-gap">Δ ${cell.gap.toFixed(3)}</span>`
        : "";
    const style = evMode ? ` style="--cell-bg:${evColor(displayEv, cell.gap)}"` : "";
    return `<button class="action-cell ${action.className}${active}${selected}${evMode ? " ev-cell" : ""}" type="button" data-row="${row.id}" data-row-label="${row.label}" data-dealer="${cell.dealer}" data-cell="${payload}" title="${title}"${style}>
        <span class="action-code">${displayAction}</span>${evMarkup}${badge}
    </button>`;
}

function renderLegend() {
    if (!state.chart?.legend) return;
    const visibleActions = new Set(state.chart.rows.flatMap((row) => row.cells.map((cell) => displayActionForCell(row, cell))));
    $("legend-bar").innerHTML = state.chart.legend
        .filter((item) => visibleActions.has(item.code))
        .map((item) => {
            const action = ACTIONS[item.code] || ACTIONS.H;
            return `<div class="legend-item"><span class="legend-code ${action.className}">${item.code}</span><span class="legend-label">${legendLabel(item.code, item.label)}</span></div>`;
        })
        .join("");
}

function legendLabel(code, fallback) {
    return {
        H: "Hit",
        S: "Stand",
        D: "Double/H",
        Ds: "Double/S",
        P: "Split",
        Rh: "Surrender/H",
        Rs: "Surrender/S",
    }[code] || fallback;
}

function renderIndexAudit() {
    if (!$("audit-group") || !state.chart) return;
    const audit = buildIndexAudit(collectConfig());
    const finiteAvg = Number.isFinite(audit.avgDelta);
    const worst = audit.worst;
    const worstLabel = worst
        ? `${rowLabel(worst.source.kind, worst.source.value)}v${dealerLabel(worst.source.dealer)} ${formatDelta(worst.delta)}`
        : "--";
    const status = !finiteAvg ? "bad" : audit.avgDelta <= 0.75 ? "good" : audit.avgDelta <= 1.25 ? "warn" : "bad";
    $("index-audit").dataset.status = status;
    $("audit-group").textContent = groupLabel(audit.group);
    $("audit-matched").textContent = `${audit.matchedCount}/${audit.sourceCount}`;
    $("audit-average").textContent = finiteAvg ? formatDelta(audit.avgDelta) : "--";
    $("audit-worst").textContent = worstLabel;
}

function formatDelta(value) {
    if (!Number.isFinite(value)) return "--";
    return `Δ${Number(value).toFixed(value >= 10 ? 0 : 2)}`;
}

function renderHandTray() {
    const tray = $("hand-tray");
    if (state.hand.length === 0) {
        tray.innerHTML = "<span class='muted-slot'>No cards</span>";
        return;
    }
    tray.innerHTML = state.hand
        .map((card, index) => `<button class="hand-card" type="button" data-index="${index}" title="Remove card">${cardLabel(card)}</button>`)
        .join("");
    tray.querySelectorAll(".hand-card").forEach((button) => {
        button.addEventListener("click", () => {
            state.hand.splice(Number(button.dataset.index), 1);
            renderHandTray();
            renderHandSolver();
        });
    });
}

function renderHandSolver() {
    if (!state.chart) return;
    const result = classifyHand(state.hand);
    const decision = $("decision-card");

    if (!result || result.bust) {
        state.selected = null;
        decision.className = "decision-card";
        $("decision-label").textContent = result?.bust ? "Bust" : "Add cards";
        $("decision-detail").textContent = result?.bust ? "Total is over 21." : "Select a dealer card and player hand.";
        decision.querySelector(".decision-code").textContent = result?.bust ? "X" : "--";
        markSelectedCell();
        return;
    }

    const dealerLabelText = dealerLabel(state.dealer);
    const row = state.chart.rows.find((item) => item.id === result.rowId);
    const cell = row?.cells.find((item) => item.dealer === dealerLabelText);

    if (!row || !cell) return;

    const config = collectConfig();
    const trueCount = $("apply-count-toggle").checked ? computeTrueCount().exact : 0;
    const actual = analyzeActualHand(state.hand, state.dealer, config, trueCount);
    const displayIndices = displayIndicesForCell(row, cell);
    const indexedAction = displayIndices.length
        ? displayActionForCell(row, cell, displayIndices)
        : actual.best.code;
    const actualCell = {
        ...cell,
        a: indexedAction,
        ev: round4(evForCode(actual, indexedAction)),
        gap: round4(actual.margin),
        evs: Object.fromEntries(actual.evs.map((item) => [item.code, round4(item.ev)])),
        probs: actual.distribution,
        indices: displayIndices,
    };
    const action = ACTIONS[actualCell.a] || ACTIONS.H;
    const code = decision.querySelector(".decision-code");
    decision.className = `decision-card ${action.className}`;
    code.textContent = actualCell.a;
    $("decision-label").textContent = action.label;

    const visibleIndices = (actualCell.indices || []).filter((index) => indexVisible(index.i));
    const indexText = visibleIndices.length
        ? visibleIndices
            .map((index) => {
                const active = index.idir === "gte" ? trueCount >= index.i : trueCount <= index.i;
                return `${formatIndexBadge(index)} ${index.idir === "gte" ? "and up" : "and below"}${active ? " (active)" : ""}`;
            })
            .join("; ")
        : "No listed Hi-Lo deviation.";
    $("decision-detail").textContent = `${state.hand.map(cardLabel).join("")} vs ${dealerLabelText}. EV ${formatSigned(actualCell.ev)} at TC ${trueCount.toFixed(2)}. ${indexText}`;

    state.selected = { rowId: row.id, rowLabel: row.label, dealer: dealerLabelText };
    showCellDetail({ ...row, label: state.hand.map(cardLabel).join("") }, actualCell);
    markSelectedCell();
}

function showCellDetail(row, cell) {
    if (!row || !cell) return;
    const displayIndices = displayIndicesForCell(row, cell);
    const displayAction = displayActionForCell(row, cell, displayIndices);
    const displayEv = round4(evForCellAction(cell, displayAction));
    const action = ACTIONS[displayAction] || ACTIONS.H;
    const base = ACTIONS[cell.b] || ACTIONS.H;
    const visibleIndices = displayIndices.filter((index) => indexVisible(index.i));
    const index = visibleIndices.length
        ? visibleIndices
            .map((item) => `${formatIndexBadge(item)} ${item.idir === "gte" ? "and up" : "and below"} (${item.if})`)
            .join("; ")
        : "No index in selected range";
    $("cell-detail").innerHTML = `
        <strong>${row.label} vs ${cell.dealer}</strong><br>
        ${action.label}. Base: ${base.label}. EV ${formatSigned(displayEv)}. Decision gap ${cell.gap.toFixed(4)}. ${index}.
        ${renderEvRows({ ...cell, a: displayAction, ev: displayEv })}
        ${renderProbabilityRows(cell)}
    `;
}

function renderEvRows(cell) {
    if (!cell.evs) return "";
    const entries = Object.entries(cell.evs)
        .map(([code, ev]) => ({ code, ev, label: ACTIONS[code]?.label || code }))
        .sort((a, b) => b.ev - a.ev);
    const best = entries[0]?.ev ?? 0;
    const worst = entries[entries.length - 1]?.ev ?? best;
    const range = Math.max(0.001, best - worst);
    return `<div class="ev-breakdown">${entries
        .map((item) => {
            const width = 18 + ((item.ev - worst) / range) * 82;
            return `<div class="ev-row">
                <span class="ev-code">${item.code}</span>
                <span class="ev-bar"><i style="width:${width.toFixed(1)}%;background:${evColor(item.ev, best - item.ev)}"></i></span>
                <span class="ev-value">${formatSigned(item.ev)}</span>
            </div>`;
        })
        .join("")}</div>`;
}

function renderProbabilityRows(cell) {
    if (!cell.probs) return "";
    const entries = PROB_KEYS
        .filter((key) => (cell.probs[key] || 0) >= 0.002)
        .map((key) => ({ key, value: cell.probs[key] || 0 }));
    if (cell.probs.surrender) entries.push({ key: "surrender", value: cell.probs.surrender });
    if (!entries.length) return "";

    return `<div class="prob-breakdown">
        <div class="prob-title">Final total distribution with perfect strategy</div>
        ${entries
            .map((item) => `<div class="prob-row">
                <span>${item.key === "bust" ? "Bust" : item.key === "surrender" ? "Surrender" : item.key}</span>
                <span class="prob-track"><i style="width:${(item.value * 100).toFixed(1)}%"></i></span>
                <strong>${formatPercent(item.value)}</strong>
            </div>`)
            .join("")}
    </div>`;
}

function showDealerModal(dealerLabelValue) {
    const dealer = dealerValueFromLabel(dealerLabelValue);
    const config = collectConfig();
    const trueCount = $("apply-count-toggle").checked ? computeTrueCount().exact : 0;
    const probs = rankProbabilities(config, trueCount, [dealer]);
    const dist = dealerDistribution(dealer, config, probs);
    const outcomes = ["17", "18", "19", "20", "21", "bust"].map((key) => ({
        key,
        value: dist[key] || 0,
    }));
    const best = Math.max(...outcomes.map((item) => item.value), 0.001);

    $("dealer-modal-title").textContent = `Dealer ${dealerLabelValue}`;
    $("dealer-modal-meta").textContent = `TC ${trueCount.toFixed(2)} · ${deckLabel(config.decks)}D · ${config.h17 ? "H17" : "S17"}`;
    $("dealer-modal-detail").innerHTML = outcomes
        .map((item) => `<div class="dealer-outcome-row">
            <span>${item.key === "bust" ? "Bust" : item.key}</span>
            <span class="prob-track"><i style="width:${Math.max(2, (item.value / best) * 100).toFixed(1)}%"></i></span>
            <strong>${formatPercent(item.value)}</strong>
        </div>`)
        .join("");

    const dialog = $("dealer-modal");
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute("open", "");
}

function closeDealerModal() {
    const dialog = $("dealer-modal");
    if (dialog.close) dialog.close();
    else dialog.removeAttribute("open");
}

function refreshSelectedInspector() {
    if (!state.selected || !state.chart) return;
    const row = state.chart.rows.find((item) => item.id === state.selected.rowId);
    const cell = row?.cells.find((item) => item.dealer === state.selected.dealer);
    if (row && cell) showCellDetail(row, cell);
}

function normalizeIndexRange(options = {}) {
    updatePrecisionSteps();
    const decimals = indexDecimals();
    let min = roundToDecimals(state.indexRange.min, decimals);
    let max = roundToDecimals(state.indexRange.max, decimals);
    if (min > max) [min, max] = [max, min];
    state.indexRange = { min, max };
    const preserveInputId = options.editing ? options.sourceId : null;
    syncIndexRangeControls({ preserveInputId });
    setPairedControl("index-decimals", "index-decimals-input", decimals, 0, { preserveInputId });
    $("index-range-value").textContent = `${formatIndex(min)} to ${formatIndex(max)}`;
    setTextIfPresent("index-decimals-value", String(indexDecimals()));
}

function syncIndexRangeControls(options = {}) {
    const decimals = indexDecimals();
    const min = roundToDecimals(state.indexRange.min, decimals);
    const max = roundToDecimals(state.indexRange.max, decimals);
    const preserveInputId = options.preserveInputId;
    const sliderMin = clamp(min, -5, 10);
    const sliderMax = clamp(max, -5, 10);
    if (preserveInputId !== "index-min-range") $("index-min-range").value = String(sliderMin);
    if (preserveInputId !== "index-max-range") $("index-max-range").value = String(sliderMax);
    if (preserveInputId !== "index-min-input") $("index-min-input").value = min.toFixed(decimals);
    if (preserveInputId !== "index-max-input") $("index-max-input").value = max.toFixed(decimals);
    $("index-range-value").textContent = `${formatIndex(min)} to ${formatIndex(max)}`;
    setTextIfPresent("index-decimals-value", String(decimals));
    const low = ((sliderMin + 5) / 15) * 100;
    const high = ((sliderMax + 5) / 15) * 100;
    const slider = document.querySelector(".dual-slider");
    if (slider) {
        slider.style.setProperty("--range-min", `${low}%`);
        slider.style.setProperty("--range-max", `${high}%`);
    }
    $("index-min-range").style.zIndex = sliderMin > 7 ? "4" : "3";
    $("index-max-range").style.zIndex = sliderMin > 7 ? "3" : "4";
}

function getIndexRange() {
    const min = Number(state.indexRange.min);
    const max = Number(state.indexRange.max);
    return {
        min: Number.isFinite(min) ? Math.min(min, max) : -5,
        max: Number.isFinite(max) ? Math.max(min, max) : 10,
    };
}

function indexVisible(index) {
    const range = getIndexRange();
    return index >= range.min && index <= range.max;
}

function indexDecimals() {
    return Math.round(clamp($("index-decimals").value, 0, 3));
}

function countDecimals() {
    return indexDecimals();
}

function countInputDecimals() {
    return countDecimals();
}

function roundToDecimals(value, decimals) {
    const factor = 10 ** decimals;
    return Math.round(Number(value) * factor) / factor;
}

function formatIndex(value) {
    const decimals = indexDecimals();
    const epsilon = 0.5 / (10 ** decimals);
    const normalized = Math.abs(Number(value)) < epsilon ? 0 : Number(value);
    const formatted = normalized.toFixed(decimals);
    return normalized > 0 ? `+${formatted}` : formatted;
}

function formatIndexBadge(index) {
    return `${displayIndexAction(index.ia)}${formatIndex(index.i)}`;
}

function displayIndexAction(code) {
    if (code === "D" || code === "Ds") return "D";
    if (code === "Rh" || code === "Rs") return "R";
    return code;
}

function formatCount(value) {
    return Number(value).toFixed(countDecimals());
}

function formatSigned(value) {
    return `${value >= 0 ? "+" : ""}${Number(value).toFixed(3)}`;
}

function formatPercent(value) {
    return `${(value * 100).toFixed(1)}%`;
}

function formatHeaderPercent(value) {
    const pct = value * 100;
    return `${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

function evColor(ev, gap) {
    const confidence = Math.min(1, Math.max(0, gap / 0.08));
    if (Math.abs(ev) < 0.015) return `hsl(220 16% ${26 + confidence * 7}%)`;
    if (ev > 0) return `hsl(158 70% ${22 + confidence * 10}%)`;
    return `hsl(356 72% ${24 + confidence * 8}%)`;
}

function markSelectedCell() {
    document.querySelectorAll(".selected-cell").forEach((cell) => cell.classList.remove("selected-cell"));
    if (!state.selected) return;
    const selector = `.action-cell[data-row="${CSS.escape(state.selected.rowId)}"][data-dealer="${CSS.escape(
        state.selected.dealer,
    )}"]`;
    const button = document.querySelector(selector);
    if (button) button.classList.add("selected-cell");
}

function classifyHand(cards) {
    if (cards.length < 2) return null;
    const aces = cards.filter((card) => card === 11).length;
    const lowTotal = cards.reduce((sum, card) => sum + (card === 11 ? 1 : card), 0);
    const total = aces > 0 && lowTotal + 10 <= 21 ? lowTotal + 10 : lowTotal;
    const soft = aces > 0 && lowTotal + 10 <= 21;

    if (lowTotal > 21) return { bust: true };

    if (cards.length === 2) {
        const normalized = cards.map((card) => (card === 11 ? 11 : Math.min(card, 10)));
        if (normalized[0] === normalized[1]) {
            return { rowId: `pair-${normalized[0]}`, total, soft };
        }
    }

    if (soft && total >= 13 && total <= 20) {
        const softCard = total - 11;
        if (softCard >= 2 && softCard <= 9) {
            return { rowId: `soft-${softCard}`, total, soft };
        }
    }

    const hardRow = total <= 8 ? 8 : total >= 17 ? 17 : total;
    return { rowId: `hard-${hardRow}`, total, soft: false };
}

function cardLabel(card) {
    if (card === 10) return "T";
    return card === 11 ? "A" : String(card);
}

function renderMetrics() {
    if (!state.chart?.metrics) return;
    const metrics = state.chart.metrics;
    $("metric-edge").textContent = `${metrics.houseEdgePct.toFixed(3)}%`;
    $("metric-true-count").textContent = $("apply-count-toggle").checked ? formatCount(computeTrueCount().exact) : "Off";
    $("metric-speed").textContent = state.lastSolveMs ? `${state.lastSolveMs.toFixed(2)} ms` : "--";
    $("report-player-edge").textContent = `${metrics.playerEdgePct.toFixed(3)}%`;
    $("report-stdev").textContent = metrics.stdevPerHand.toFixed(3);
    $("report-combos").textContent = metrics.combosSupported.toLocaleString();
    $("report-cells").textContent = metrics.cellsPerChart.toLocaleString();

    if (state.report && state.lastSolveMs < 1) {
        $("metric-speed").textContent = `${state.lastSolveMs.toFixed(2)} ms / ${Math.round(
            state.report.chartsPerSecond,
        ).toLocaleString()} cps`;
    }
}

function updateCountReadout() {
    updatePrecisionSteps();
    const tc = computeTrueCount();
    const activeId = document.activeElement?.id;
    $("running-count").textContent = String(state.runningCount);
    $("decks-left").textContent = Number($("decks-remaining").value).toFixed(2);
    if (activeId !== "decks-remaining-input") {
        $("decks-remaining-input").value = Number($("decks-remaining").value).toFixed(2);
    }
    $("running-count-value").textContent = String(state.runningCount);
    $("true-count-value").textContent = formatCount(tc.exact);
    $("applied-count").textContent = $("apply-count-toggle").checked ? formatCount(tc.exact) : "Off";
    $("metric-true-count").textContent = $("apply-count-toggle").checked ? formatCount(tc.exact) : "Off";
    setPairedControl("running-count-slider", "running-count-input", state.runningCount, 0, { preserveInputId: activeId });
    setPairedControl("true-count-slider", "true-count-input", state.trueCount, countInputDecimals(), { preserveInputId: activeId });
    setTextIfPresent("index-decimals-value", String(indexDecimals()));
    setPairedControl("index-decimals", "index-decimals-input", indexDecimals(), 0, { preserveInputId: activeId });
    $("index-range-value").textContent = `${formatIndex(getIndexRange().min)} to ${formatIndex(getIndexRange().max)}`;
}

function setTextIfPresent(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
}

function computeTrueCount() {
    state.trueCount = clamp(Number($("true-count-slider").value || state.trueCount), -26, 26);
    return { exact: state.trueCount, applied: state.trueCount };
}

function copyConfig() {
    const config = {
        ...collectConfig(),
        trueCount: computeTrueCount().applied,
        reverse26: $("reverse-26-toggle").checked,
        showIndices: $("show-indices-toggle").checked,
        viewMode: $("view-mode").value,
        indexGroup: currentIndexGroup(),
        indexRange: getIndexRange(),
    };
    const text = JSON.stringify(config, null, 2);
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => toast("Config copied"));
    } else {
        toast(text);
    }
    history.replaceState(null, "", `#${encodeURIComponent(JSON.stringify(config))}`);
}

function applyHashConfig() {
    if (!location.hash || location.hash.length < 3) return null;
    try {
        const config = JSON.parse(decodeURIComponent(location.hash.slice(1)));
        if (config && typeof config === "object") {
            PRESETS.hash = { ...PRESETS.vegas, ...config };
            $("preset-select").insertAdjacentHTML("beforeend", '<option value="hash">Shared config</option>');
            $("preset-select").value = "hash";
            return config;
        }
    } catch (error) {
        console.warn("Invalid config hash", error);
    }
    return null;
}

function toast(message) {
    const toastEl = $("toast");
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastEl.hideTimer);
    toastEl.hideTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
}
