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

const decoder = new TextDecoder();

document.addEventListener("DOMContentLoaded", () => {
    wireControls();
    const sharedConfig = applyHashConfig();
    const initialPreset = $("preset-select").value;
    setConfig(PRESETS[initialPreset] || PRESETS.vegas);
    if (sharedConfig) {
        $("reverse-26-toggle").checked = Boolean(sharedConfig.reverse26);
        $("show-indices-toggle").checked = sharedConfig.showIndices !== false;
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
    try {
        const response = await fetch("assets/blackjack_solver.wasm", { cache: "no-cache" });
        if (!response.ok) throw new Error(`WASM ${response.status}`);
        const bytes = await response.arrayBuffer();
        const instance = await WebAssembly.instantiate(bytes, {});
        state.wasm = instance.instance;
        state.wasmReady = true;
    } catch (error) {
        console.info("WASM unavailable; JS fallback active", error);
        state.wasmReady = false;
        toast("WASM unavailable; JS fallback active");
    }
}

async function loadFallbackChart() {
    try {
        const response = await fetch("data/fallback-chart.json");
        state.chart = await response.json();
        renderAll();
    } catch (error) {
        console.error(error);
    }
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
        const count = $("apply-count-toggle").checked ? computeTrueCount().applied : 0;
        const start = performance.now();

        if (!state.wasmReady || !state.wasm) {
            state.chart = solveChartJS(config, count);
            state.lastSolveMs = performance.now() - start;
            renderAll();
            return;
        }

        try {
            const exports = state.wasm.exports;
            const ptr = exports.solve_chart(
                config.decks,
                config.h17,
                config.doubleRule,
                config.das,
                config.surrender,
                config.peek,
                config.resplitHands,
                config.rsa,
                config.hsa,
                config.charlie,
                config.blackjackPay,
                config.optimization,
                count,
            );
            const len = exports.last_result_len();
            const bytes = new Uint8Array(exports.memory.buffer, ptr, len);
            const json = decoder.decode(bytes);
            exports.free_result(ptr, len);
            state.chart = JSON.parse(json);
            state.lastSolveMs = performance.now() - start;
            renderAll();
        } catch (error) {
            console.info("WASM solve unavailable; JS fallback active", error);
            state.wasmReady = false;
            state.chart = solveChartJS(config, count);
            state.lastSolveMs = performance.now() - start;
            renderAll();
        }
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
    const dealerValues = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const rows = [
        ...[8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((value) => chartRow("hard", value, config, trueCount)),
        ...[2, 3, 4, 5, 6, 7, 8, 9].map((value) => chartRow("soft", value, config, trueCount)),
        ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((value) => chartRow("pair", value, config, trueCount)),
    ];

    return {
        version: "0.1.0-js",
        rules: { ...config, trueCount },
        dealer: dealerValues.map(dealerLabel),
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

function chartRow(kind, value, config, trueCount) {
    const dealerValues = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    return {
        id: `${kind}-${value}`,
        kind,
        label: rowLabel(kind, value),
        cells: dealerValues.map((dealer) => chartCell(kind, value, dealer, config, trueCount)),
    };
}

function chartCell(kind, value, dealer, config, trueCount) {
    const base = baseDecision(kind, value, dealer, config);
    const index = indexPlay(kind, value, dealer, config);
    const active =
        index &&
        (index.idir === "gte" ? trueCount >= index.i : trueCount <= index.i);
    const action = active ? index.ia : base;
    return {
        dealer: dealerLabel(dealer),
        a: action,
        b: base,
        m: estimateMargin(action, kind, value, dealer, trueCount),
        x: Boolean(active),
        ...(index || {}),
    };
}

function rowLabel(kind, value) {
    if (kind === "hard") return value === 8 ? "5-8" : value === 17 ? "17+" : String(value);
    if (kind === "soft") return `A,${value}`;
    return value === 11 ? "A,A" : `${value},${value}`;
}

function dealerLabel(value) {
    return value === 11 ? "A" : String(value);
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

function baseDecision(kind, value, dealer, config) {
    let action;
    if (kind === "hard") action = baseHard(value, dealer, config);
    if (kind === "soft") action = baseSoft(value, dealer, config);
    if (kind === "pair") action = basePair(value, dealer, config);
    action = applySurrenderJS(action, kind, value, dealer, config);
    return applyPeekTaxJS(action, kind, value, dealer, config);
}

function baseHard(total, dealer, config) {
    if (total <= 8) return "H";
    if (total === 9) {
        return dealer >= 3 && dealer <= 6 ? doubleHit(config, "hard", 9, 9) : "H";
    }
    if (total === 10) {
        return dealer >= 2 && dealer <= 9 ? doubleHit(config, "hard", 10, 10) : "H";
    }
    if (total === 11) {
        return dealer <= 10 || (config.h17 && dealer === 11) ? doubleHit(config, "hard", 11, 11) : "H";
    }
    if (total === 12) return dealer >= 4 && dealer <= 6 ? "S" : "H";
    if (total <= 16) return dealer >= 2 && dealer <= 6 ? "S" : "H";
    return "S";
}

function baseSoft(card, dealer, config) {
    const low = card + 1;
    const soft = card + 11;
    if (card <= 3) return dealer >= 5 && dealer <= 6 ? doubleHit(config, "soft", soft, low) : "H";
    if (card <= 5) return dealer >= 4 && dealer <= 6 ? doubleHit(config, "soft", soft, low) : "H";
    if (card === 6) return dealer >= 3 && dealer <= 6 ? doubleHit(config, "soft", soft, low) : "H";
    if (card === 7) {
        if ((dealer >= 3 && dealer <= 6) || (config.optimization > 0 && dealer === 2)) {
            return doubleStand(config, "soft", soft, low);
        }
        return dealer === 2 || dealer === 7 || dealer === 8 ? "S" : "H";
    }
    if (card === 8 && config.h17 && dealer === 6) return doubleStand(config, "soft", soft, low);
    return "S";
}

function basePair(card, dealer, config) {
    if (card === 11) return "P";
    if (card === 10) return "S";
    if (card === 9) return (dealer >= 2 && dealer <= 6) || dealer === 8 || dealer === 9 ? "P" : "S";
    if (card === 8) return "P";
    if (card === 7) return dealer >= 2 && dealer <= 7 ? "P" : "H";
    if (card === 6) return (dealer >= 3 && dealer <= 6) || (config.das && dealer === 2) ? "P" : "H";
    if (card === 5) return dealer >= 2 && dealer <= 9 ? doubleHit(config, "hard", 10, 10) : "H";
    if (card === 4) return config.das && dealer >= 5 && dealer <= 6 ? "P" : "H";
    if (card === 2 || card === 3) {
        return (dealer >= 4 && dealer <= 7) || (config.das && dealer >= 2 && dealer <= 3) ? "P" : "H";
    }
    return "H";
}

function applySurrenderJS(action, kind, value, dealer, config) {
    if (config.surrender === 0) return action;
    const hardTotal = kind === "hard" ? value : kind === "pair" ? value * 2 : 0;
    const late =
        (hardTotal === 16 && [9, 10, 11].includes(dealer)) ||
        (hardTotal === 15 && (dealer === 10 || (config.h17 && dealer === 11))) ||
        (config.h17 && hardTotal === 17 && dealer === 11) ||
        (config.h17 && kind === "pair" && value === 8 && dealer === 11);
    const earlyTen = hardTotal >= 14 && hardTotal <= 16 && dealer === 10;
    const earlyFull = hardTotal >= 14 && hardTotal <= 17 && (dealer === 10 || dealer === 11);
    const wants = config.surrender === 1 ? late : config.surrender === 2 ? earlyTen : earlyFull;
    if (!wants) return action;
    return action === "S" || action === "Ds" || action === "Rs" ? "Rs" : "Rh";
}

function applyPeekTaxJS(action, kind, value, dealer, config) {
    const risk =
        config.peek === 1
            ? dealer === 10 || dealer === 11
            : config.peek === 2
              ? dealer === 10
              : config.peek === 3
                ? dealer === 10 || dealer === 11
                : false;
    if (!risk) return action;
    if (action === "D") return "H";
    if (action === "Ds") return "S";
    if (action === "P" && config.peek !== 3 && kind === "pair" && value === 8 && dealer >= 10) {
        return config.surrender === 0 ? "H" : "Rh";
    }
    if (action === "P" && config.peek !== 3 && kind === "pair" && value !== 11 && dealer >= 10) {
        return value === 10 ? "S" : "H";
    }
    return action;
}

function indexPlay(kind, value, dealer, config) {
    const index = (i, ia, idir = "gte", family = "I18") => ({ i, ia, idir, if: family });
    if (kind === "hard") {
        if (value === 16 && dealer === 10 && config.surrender === 0) return index(0, "S");
        if (value === 15 && dealer === 10 && config.surrender === 0) return index(4, "S");
        if (value === 10 && dealer === 10 && canDoubleJS(config, "hard", 10, 10)) return index(4, "D");
        if (value === 10 && dealer === 11 && canDoubleJS(config, "hard", 10, 10)) return index(4, "D");
        if (value === 11 && dealer === 11 && canDoubleJS(config, "hard", 11, 11)) return index(1, "D");
        if (value === 9 && dealer === 2 && canDoubleJS(config, "hard", 9, 9)) return index(1, "D");
        if (value === 9 && dealer === 7 && canDoubleJS(config, "hard", 9, 9)) return index(3, "D");
        if (value === 12 && dealer === 2) return index(3, "S");
        if (value === 12 && dealer === 3) return index(2, "S");
        if (value === 12 && dealer === 4) return index(-1, "H", "lte");
        if (value === 12 && dealer === 5) return index(-2, "H", "lte");
        if (value === 12 && dealer === 6) return index(-1, "H", "lte");
        if (value === 13 && dealer === 2) return index(-1, "H", "lte");
        if (value === 13 && dealer === 3) return index(-2, "H", "lte");
        if (value === 14 && dealer === 10 && config.surrender !== 0) return index(3, "Rh", "gte", "Fab4");
        if (value === 15 && dealer === 9 && config.surrender !== 0) return index(2, "Rh", "gte", "Fab4");
        if (value === 15 && dealer === 11 && config.surrender !== 0 && config.h17) return index(1, "Rh", "gte", "Fab4");
        if (value === 16 && dealer === 8 && config.surrender !== 0) return index(4, "Rh", "gte", "Fab4");
    }
    if (kind === "soft") {
        if (value === 8 && dealer === 6 && canDoubleJS(config, "soft", 19, 9)) return index(1, "Ds", "gte", "Soft");
        if (value === 7 && dealer === 2 && canDoubleJS(config, "soft", 18, 8)) return index(1, "Ds", "gte", "Soft");
    }
    if (kind === "pair") {
        if (value === 10 && dealer === 5) return index(5, "P");
        if (value === 10 && dealer === 6) return index(4, "P");
        if (value === 9 && dealer === 7 && config.optimization === 2) return index(3, "P", "gte", "Risk");
    }
    return null;
}

function estimateMargin(action, kind, value, dealer, trueCount) {
    let score = 0;
    const total = kind === "soft" ? value + 11 : kind === "pair" ? value * 2 : value;
    if (action === "S" || action === "Rs") score = (total - Math.min(dealer, 10)) * 16;
    if (action === "H" || action === "Rh") score = (17 - total) * 10 - Math.min(dealer, 10) * 3;
    if (action === "D" || action === "Ds") score = 62 - Math.min(dealer, 10) * 4;
    if (action === "P") {
        const cardScore = value === 11 || value === 8 ? 84 : value === 9 || value === 7 ? 48 : [2, 3, 6].includes(value) ? 26 : 12;
        score = cardScore - Math.min(dealer, 10) * 2;
    }
    return Math.max(-220, Math.min(220, score + trueCount * 4));
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
    const active = cell.x ? " active-index" : "";
    const selected =
        state.selected && state.selected.rowId === row.id && state.selected.dealer === cell.dealer
            ? " selected-cell"
            : "";
    const badge =
        cell.i === undefined
            ? ""
            : `<span class="index-badge">${cell.ia} ${cell.idir === "gte" ? "≥" : "≤"} ${cell.i}</span>`;
    const payload = JSON.stringify(cell).replaceAll('"', "&quot;");
    const title = `${row.label} vs ${cell.dealer}: ${action.label}`;
    return `<button class="action-cell ${action.className}${active}${selected}" type="button" data-row="${row.id}" data-row-label="${row.label}" data-dealer="${cell.dealer}" data-cell="${payload}" title="${title}">
        <span class="action-code">${cell.a}</span>${badge}
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
            : `${cell.ia} when TC ${cell.idir === "gte" ? ">=" : "<="} ${cell.i}${cell.x ? " (active)" : ""}.`;
    $("decision-detail").textContent = `${row.label} vs ${dealerLabel}. ${indexText}`;

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
            : `${cell.ia} ${cell.idir === "gte" ? ">=" : "<="} ${cell.i} (${cell.if}${cell.x ? ", active" : ""})`;
    $("cell-detail").innerHTML = `<strong>${row.label} vs ${cell.dealer}</strong><br>${action.label}. Base: ${base.label}. ${index}. Margin score: ${cell.m}.`;
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

    if (state.report) {
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
