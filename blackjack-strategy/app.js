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
const RANK_MULTIPLIER = { 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 4, 11: 1 };
const HI_LO_TAG = { 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 0, 8: 0, 9: 0, 10: -1, 11: -1 };
const HARD_ROWS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const SOFT_ROWS = [2, 3, 4, 5, 6, 7, 8, 9];
const PAIR_ROWS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const PROB_KEYS = ["4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "bust"];

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

const state = {
    wasm: null,
    chart: null,
    report: null,
    selected: null,
    hand: [10, 6],
    dealer: 10,
    runningCount: 0,
    seenCards: 0,
    countHistory: [],
    manualMode: true,
    wasmReady: false,
    applyingPreset: false,
    lastSolveMs: 0,
};

const analysisCache = new Map();

document.addEventListener("DOMContentLoaded", () => {
    wireControls();
    const sharedConfig = applyHashConfig();
    const initialPreset = $("preset-select").value;
    setConfig(PRESETS[initialPreset] || PRESETS.vegas);
    if (sharedConfig) {
        $("reverse-26-toggle").checked = Boolean(sharedConfig.reverse26);
        $("show-indices-toggle").checked = sharedConfig.showIndices !== false;
        if (sharedConfig.viewMode) $("view-mode").value = sharedConfig.viewMode;
        if (sharedConfig.indexRange) {
            $("index-min").value = String(sharedConfig.indexRange.min ?? -10);
            $("index-max").value = String(sharedConfig.indexRange.max ?? 10);
        }
        if (Number.isFinite(sharedConfig.trueCount)) {
            state.manualMode = true;
            $("manual-count").value = String(Math.max(-10, Math.min(10, sharedConfig.trueCount)));
        }
    }
    loadReport();
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

    document.querySelectorAll("input[name='decks'], input[name='soft17']").forEach((input) => {
        input.addEventListener("change", () => onRulesChanged());
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

    ["show-indices-toggle", "reverse-26-toggle", "compact-toggle", "colorblind-toggle"].forEach((id) => {
        $(id).addEventListener("change", () => {
            if (id === "compact-toggle") {
                $("strategy-table").classList.toggle("compact", $(id).checked);
            }
            if (id === "colorblind-toggle") {
                document.body.classList.toggle("colorblind", $(id).checked);
            }
            renderChart();
        });
    });

    ["view-mode", "index-min", "index-max"].forEach((id) => {
        $(id).addEventListener("input", () => {
            renderChart();
            refreshSelectedInspector();
        });
        $(id).addEventListener("change", () => {
            normalizeIndexRange();
            renderChart();
            refreshSelectedInspector();
        });
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
        state.runningCount += delta;
        state.seenCards += 1;
        state.countHistory.push(delta);
        state.manualMode = false;
        const config = collectConfig();
        const remaining = Math.max(0.25, (config.decks * 52 - state.seenCards) / 52);
        $("decks-remaining").value = Math.min(config.decks, remaining).toFixed(2);
        updateCountReadout();
        solveAndRender();
    });

    $("undo-count").addEventListener("click", () => {
        const last = state.countHistory.pop();
        if (last === undefined) return;
        state.runningCount -= last;
        state.seenCards = Math.max(0, state.seenCards - 1);
        state.manualMode = false;
        updateCountReadout();
        solveAndRender();
    });

    $("reset-count").addEventListener("click", () => {
        state.runningCount = 0;
        state.seenCards = 0;
        state.countHistory = [];
        state.manualMode = true;
        $("manual-count").value = "0";
        $("decks-remaining").value = collectConfig().decks;
        updateCountReadout();
        solveAndRender();
    });

    $("decks-remaining").addEventListener("input", () => {
        state.manualMode = false;
        updateCountReadout();
        solveAndRender();
    });

    $("manual-count").addEventListener("input", () => {
        state.manualMode = true;
        updateCountReadout();
        solveAndRender();
    });

    $("copy-config").addEventListener("click", copyConfig);

    document.querySelectorAll(".mobile-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".mobile-tab").forEach((item) => item.classList.remove("active"));
            tab.classList.add("active");
            $(tab.dataset.jump).scrollIntoView({ behavior: "smooth", block: "start" });
        });
    });
}

function onRulesChanged() {
    if (!state.applyingPreset) {
        $("preset-select").value = "custom";
    }
    clampDeckSlider();
    updateCountReadout();
    solveAndRender();
}

function setConfig(config) {
    state.applyingPreset = true;
    document.querySelector(`input[name='decks'][value='${config.decks}']`).checked = true;
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
    solveAndRender();
}

function collectConfig() {
    return {
        decks: Number(document.querySelector("input[name='decks']:checked").value),
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

function clampDeckSlider() {
    const decks = collectConfig().decks;
    const slider = $("decks-remaining");
    slider.max = String(decks);
    if (Number(slider.value) > decks || state.seenCards === 0) {
        slider.value = String(decks);
    }
}

async function loadWasm() {
    state.wasm = null;
    state.wasmReady = false;
}

async function loadReport() {
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

function solveAndRender() {
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

function chartRow(kind, value, config, trueCount, cacheKey) {
    return {
        id: `${kind}-${value}`,
        kind,
        label: rowLabel(kind, value),
        cells: DEALER_VALUES.map((dealer) => chartCell(kind, value, dealer, config, trueCount, cacheKey)),
    };
}

function chartCell(kind, value, dealer, config, trueCount, cacheKey) {
    const current = analyzeCell(kind, value, dealer, config, trueCount);
    const base = analyzeCell(kind, value, dealer, config, 0);
    const index = deriveIndex(kind, value, dealer, config, base.best.code, cacheKey);
    const action = current.best.code;
    const active = index && (index.idir === "gte" ? trueCount >= index.i : trueCount <= index.i);
    return {
        dealer: dealerLabel(dealer),
        a: action,
        b: base.best.code,
        m: Math.round(current.margin * 1000),
        x: Boolean(active),
        ev: round4(current.best.ev),
        gap: round4(current.margin),
        evs: Object.fromEntries(current.evs.map((item) => [item.code, round4(item.ev)])),
        probs: current.distribution,
        ...(index || {}),
    };
}

function rowLabel(kind, value) {
    if (kind === "hard") return String(value);
    if (kind === "soft") return `A${value}`;
    if (value === 11) return "AA";
    if (value === 10) return "TT";
    return `${value}${value}`;
}

function dealerLabel(value) {
    return value === 11 ? "A" : String(value);
}

function round4(value) {
    return Math.round(value * 10000) / 10000;
}

function roundCount(value) {
    return Math.round(value * 4) / 4;
}

function rankProbabilities(trueCount) {
    const tilt = 0.075;
    const weights = CARD_RANKS.map((rank) => {
        const tag = HI_LO_TAG[rank];
        return {
            rank,
            weight: RANK_MULTIPLIER[rank] * Math.exp(-tag * trueCount * tilt),
        };
    });
    const total = weights.reduce((sum, item) => sum + item.weight, 0);
    return weights.map((item) => ({ rank: item.rank, p: item.weight / total }));
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

    const probs = rankProbabilities(trueCount);
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

function deriveIndex(kind, value, dealer, config, baseCode, cacheKey) {
    const indexKey = `${cacheKey}|idx|${kind}|${value}|${dealer}|${baseCode}`;
    if (analysisCache.has(indexKey)) return analysisCache.get(indexKey);

    const baseAnalysis = analyzeCell(kind, value, dealer, config, 0);
    if (baseAnalysis.margin > 0.04) {
        analysisCache.set(indexKey, null);
        return null;
    }
    const candidates = baseAnalysis.evs.filter((item) => canonicalCode(item.code) !== canonicalCode(baseCode));
    const crossings = [];

    candidates.forEach((candidate) => {
        const lowDelta = actionDelta(kind, value, dealer, config, candidate.code, baseCode, -10);
        const highDelta = actionDelta(kind, value, dealer, config, candidate.code, baseCode, 10);

        if (highDelta > 0) {
            crossings.push({
                alt: candidate.code,
                idir: "gte",
                threshold: refineIndexThreshold(kind, value, dealer, config, baseCode, candidate.code, 10, "gte"),
            });
        }

        if (lowDelta > 0) {
            crossings.push({
                alt: candidate.code,
                idir: "lte",
                threshold: refineIndexThreshold(kind, value, dealer, config, baseCode, candidate.code, -10, "lte"),
            });
        }
    });

    if (!crossings.length) {
        analysisCache.set(indexKey, null);
        return null;
    }

    crossings.sort((a, b) => Math.abs(a.threshold) - Math.abs(b.threshold));
    const chosen = crossings[0];
    const result = {
        i: Number(chosen.threshold.toFixed(2)),
        ia: chosen.alt,
        idir: chosen.idir,
        if: "EV",
    };
    analysisCache.set(indexKey, result);
    return result;
}

function refineIndexThreshold(kind, value, dealer, config, baseCode, altCode, _tc, direction) {
    let low = -10;
    let high = 10;
    for (let i = 0; i < 12; i += 1) {
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
    const analysis = analyzeCell(kind, value, dealer, config, trueCount);
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
        `${config.decks}D`,
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
    table.classList.toggle("compact", $("compact-toggle").checked);
    table.classList.toggle("ev-mode", $("view-mode").value === "ev");
    document.body.classList.toggle("colorblind", $("colorblind-toggle").checked);
    $("chart-panel").classList.toggle("index-hidden", !$("show-indices-toggle").checked);

    const dealerOrder = $("reverse-26-toggle").checked
        ? ["6", "5", "4", "3", "2", "7", "8", "9", "10", "A"]
        : state.chart.dealer;

    let html = "<thead><tr><th class='row-head'>Hand</th>";
    dealerOrder.forEach((dealer) => {
        html += `<th>${dealer}</th>`;
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
            state.selected = {
                rowId: button.dataset.row,
                rowLabel: button.dataset.rowLabel,
                dealer: button.dataset.dealer,
            };
            showCellDetail(
                state.chart.rows.find((row) => row.id === button.dataset.row),
                JSON.parse(button.dataset.cell),
            );
            markSelectedCell();
        });
    });

    markSelectedCell();
}

function cellButton(row, cell) {
    const action = ACTIONS[cell.a] || ACTIONS.H;
    const evMode = $("view-mode").value === "ev";
    const active = cell.x ? " active-index" : "";
    const selected =
        state.selected && state.selected.rowId === row.id && state.selected.dealer === cell.dealer
            ? " selected-cell"
            : "";
    const badge =
        cell.i === undefined || !indexVisible(cell.i)
            ? ""
            : `<span class="index-badge">${cell.ia} ${cell.idir === "gte" ? "≥" : "≤"} ${formatCount(cell.i)}</span>`;
    const payload = JSON.stringify(cell).replaceAll('"', "&quot;");
    const title = `${row.label} vs ${cell.dealer}: ${action.label}`;
    const evMarkup = evMode
        ? `<span class="cell-ev">${formatSigned(cell.ev)}</span><span class="cell-gap">Δ ${cell.gap.toFixed(3)}</span>`
        : "";
    const style = evMode ? ` style="--cell-bg:${evColor(cell.ev, cell.gap)}"` : "";
    return `<button class="action-cell ${action.className}${active}${selected}${evMode ? " ev-cell" : ""}" type="button" data-row="${row.id}" data-row-label="${row.label}" data-dealer="${cell.dealer}" data-cell="${payload}" title="${title}"${style}>
        <span class="action-code">${cell.a}</span>${evMarkup}${badge}
    </button>`;
}

function renderLegend() {
    if (!state.chart?.legend) return;
    $("legend-bar").innerHTML = state.chart.legend
        .map((item) => {
            const action = ACTIONS[item.code] || ACTIONS.H;
            return `<div class="legend-item"><span class="legend-code ${action.className}">${item.code}</span><span class="legend-label">${item.label}</span></div>`;
        })
        .join("");
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

    const dealerLabel = state.dealer === 11 ? "A" : String(state.dealer);
    const row = state.chart.rows.find((item) => item.id === result.rowId);
    const cell = row?.cells.find((item) => item.dealer === dealerLabel);

    if (!row || !cell) return;

    const action = ACTIONS[cell.a] || ACTIONS.H;
    const code = decision.querySelector(".decision-code");
    decision.className = `decision-card ${action.className}`;
    code.textContent = cell.a;
    $("decision-label").textContent = action.label;

    const indexText =
        cell.i === undefined
            ? "No listed Hi-Lo deviation."
            : `${cell.ia} when TC ${cell.idir === "gte" ? ">=" : "<="} ${formatCount(cell.i)}${cell.x ? " (active)" : ""}.`;
    $("decision-detail").textContent = `${row.label} vs ${dealerLabel}. EV ${formatSigned(cell.ev)}. ${indexText}`;

    state.selected = { rowId: row.id, rowLabel: row.label, dealer: dealerLabel };
    showCellDetail(row, cell);
    markSelectedCell();
}

function showCellDetail(row, cell) {
    if (!row || !cell) return;
    const action = ACTIONS[cell.a] || ACTIONS.H;
    const base = ACTIONS[cell.b] || ACTIONS.H;
    const index =
        cell.i === undefined
            ? "No index"
            : `${cell.ia} ${cell.idir === "gte" ? ">=" : "<="} ${formatCount(cell.i)} (${cell.if}${cell.x ? ", active" : ""})`;
    $("cell-detail").innerHTML = `
        <strong>${row.label} vs ${cell.dealer}</strong><br>
        ${action.label}. Base: ${base.label}. EV ${formatSigned(cell.ev)}. Decision gap ${cell.gap.toFixed(4)}. ${index}.
        ${renderEvRows(cell)}
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

function refreshSelectedInspector() {
    if (!state.selected || !state.chart) return;
    const row = state.chart.rows.find((item) => item.id === state.selected.rowId);
    const cell = row?.cells.find((item) => item.dealer === state.selected.dealer);
    if (row && cell) showCellDetail(row, cell);
}

function normalizeIndexRange() {
    const min = Number($("index-min").value);
    const max = Number($("index-max").value);
    if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
        $("index-min").value = String(max);
        $("index-max").value = String(min);
    }
}

function getIndexRange() {
    const min = Number($("index-min").value);
    const max = Number($("index-max").value);
    return {
        min: Number.isFinite(min) ? min : -10,
        max: Number.isFinite(max) ? max : 10,
    };
}

function indexVisible(index) {
    const range = getIndexRange();
    return index >= range.min && index <= range.max;
}

function formatCount(value) {
    return Number(value).toFixed(2);
}

function formatSigned(value) {
    return `${value >= 0 ? "+" : ""}${Number(value).toFixed(3)}`;
}

function formatPercent(value) {
    return `${(value * 100).toFixed(1)}%`;
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
    return card === 11 ? "A" : String(card);
}

function renderMetrics() {
    if (!state.chart?.metrics) return;
    const metrics = state.chart.metrics;
    $("metric-edge").textContent = `${metrics.houseEdgePct.toFixed(3)}%`;
    $("metric-true-count").textContent = $("apply-count-toggle").checked ? String(computeTrueCount().applied) : "Off";
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
    const tc = computeTrueCount();
    $("running-count").textContent = String(state.runningCount);
    $("decks-left").textContent = Number($("decks-remaining").value).toFixed(2);
    $("applied-count").textContent = $("apply-count-toggle").checked ? String(tc.applied) : "Off";
    $("metric-true-count").textContent = $("apply-count-toggle").checked ? String(tc.applied) : "Off";
}

function computeTrueCount() {
    if (state.manualMode) {
        const manual = Number($("manual-count").value);
        return { exact: manual, applied: manual };
    }
    const decksLeft = Math.max(0.25, Number($("decks-remaining").value));
    const exact = state.runningCount / decksLeft;
    return { exact, applied: Math.trunc(exact) };
}

function copyConfig() {
    const config = {
        ...collectConfig(),
        trueCount: computeTrueCount().applied,
        reverse26: $("reverse-26-toggle").checked,
        showIndices: $("show-indices-toggle").checked,
        viewMode: $("view-mode").value,
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
