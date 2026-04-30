import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP_SOURCE = new URL("../app.js", import.meta.url);

function nearly(actual, expected, tolerance = 1e-10) {
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        `expected ${actual} to be within ${tolerance} of ${expected}`,
    );
}

function loadSolver() {
    const elements = new Map();

    function element(id = "anonymous") {
        if (elements.has(id)) return elements.get(id);
        const node = {
            id,
            value: "",
            checked: false,
            textContent: "",
            innerHTML: "",
            dataset: {},
            style: {
                setProperty(name, value) {
                    this[name] = value;
                },
            },
            classList: {
                add() {},
                remove() {},
                toggle() {},
            },
            addEventListener() {},
            insertAdjacentHTML() {},
            querySelector() {
                return element(`${id}:query`);
            },
            querySelectorAll() {
                return [];
            },
        };
        elements.set(id, node);
        return node;
    }

    element("index-decimals").value = "0";
    element("index-min-range").value = "-5";
    element("index-max-range").value = "10";
    element("index-group").value = "custom";
    element("apply-count-toggle").checked = true;
    element("true-count-slider").value = "0";

    const document = {
        addEventListener() {},
        getElementById: element,
        querySelector(selector) {
            if (selector === ".dual-slider") return element("dual-slider");
            if (selector === "input[name='soft17']:checked") return { value: "0" };
            return element(selector);
        },
        querySelectorAll() {
            return [];
        },
    };

    const context = {
        CSS: { escape: (value) => String(value) },
        console,
        document,
        history: { replaceState() {} },
        location: { hash: "", protocol: "file:" },
        navigator: {},
        performance: { now: () => 0 },
        requestAnimationFrame(callback) {
            callback();
            return 1;
        },
        cancelAnimationFrame() {},
        setTimeout,
        clearTimeout,
    };
    vm.createContext(context);
    vm.runInContext(
        `${readFileSync(APP_SOURCE, "utf8")}
globalThis.__solverTest = {
    PRESETS,
    CARDS_PER_DECK_BY_RANK,
    HI_LO_TAG,
    analyzeActualHand,
    analyzeCell,
    buildIndexAudit,
    chartCell,
    deriveIndexes,
    displayActionForCell,
    evForCode,
    formatIndex,
    formatIndexBadge,
    indexesForCell,
    rankProbabilities,
    solveChartJS,
    sourceIndexesForGroup,
    STANDARD_INDEXES,
};`,
        context,
        { filename: APP_SOURCE.pathname },
    );

    return { ...context.__solverTest, elements };
}

test("rank probabilities use physical card counts when dead cards are removed", () => {
    const solver = loadSolver();
    const config = { ...solver.PRESETS.vegas };
    const probs = new Map(solver.rankProbabilities(config, 0, [10, 6, 10]).map((item) => [item.rank, item.p]));

    assert.equal(solver.CARDS_PER_DECK_BY_RANK[2], 4);
    assert.equal(solver.CARDS_PER_DECK_BY_RANK[10], 16);
    nearly([...probs.values()].reduce((sum, value) => sum + value, 0), 1);
    nearly(probs.get(10), 94 / 309);
    nearly(probs.get(6), 23 / 309);
    nearly(probs.get(2), 24 / 309);
});

test("hard 16 vs dealer 10 crosses from hit to stand just above true count zero", () => {
    const solver = loadSolver();
    const config = { ...solver.PRESETS.vegas };
    const base = solver.analyzeCell("hard", 16, 10, config, 0);
    const indices = solver.deriveIndexes("hard", 16, 10, config, base.best.code, "regression");
    const standIndex = indices.find((item) => item.ia === "S" && item.idir === "gte");

    assert.equal(base.best.code, "H");
    assert.ok(standIndex, "expected a stand deviation index");
    assert.ok(standIndex.i > 0, `expected positive threshold, got ${standIndex.i}`);
    assert.ok(standIndex.i < 1.25, `expected threshold near +1 with representative dead cards, got ${standIndex.i}`);

    const below = solver.analyzeCell("hard", 16, 10, config, 0.5);
    const above = solver.analyzeCell("hard", 16, 10, config, 1.25);
    assert.equal(below.best.code, "H");
    assert.equal(above.best.code, "S");
    assert.ok(solver.evForCode(below, "S") - solver.evForCode(below, "H") < 0);
    assert.ok(solver.evForCode(above, "S") - solver.evForCode(above, "H") > 0);
});

test("published index groups expose source-verified Hi-Lo deviations", () => {
    const solver = loadSolver();
    const config = { ...solver.PRESETS.vegas };
    solver.elements.get("index-group").value = "illustrious18";

    const hard16 = solver.indexesForCell("hard", 16, 10, config, []);
    assert.equal(JSON.stringify(hard16.map((item) => [item.ia, item.i, item.idir])), JSON.stringify([["S", 0, "gte"]]));
    assert.equal(solver.formatIndexBadge(hard16[0]), "S0");

    const hard12 = solver.indexesForCell("hard", 12, 4, config, []);
    assert.equal(JSON.stringify(hard12.map((item) => [item.ia, item.i, item.idir])), JSON.stringify([["H", 0, "lte"]]));
    assert.equal(solver.formatIndexBadge(hard12[0]), "H0");

    solver.elements.get("index-group").value = "bjaH17";
    const tenVsAce = solver.indexesForCell("hard", 10, 11, { ...config, h17: 1 }, []);
    assert.equal(JSON.stringify(tenVsAce.map((item) => [item.ia, item.i, item.idir])), JSON.stringify([["D", 3, "gte"]]));

    const soft19H17 = solver.indexesForCell("soft", 8, 6, { ...config, h17: 1 }, []);
    assert.equal(JSON.stringify(soft19H17.map((item) => [item.ia, item.i, item.idir])), JSON.stringify([["S", 0, "lte"]]));
});

test("custom index display uses generated EV crossovers, not source-group anchors", () => {
    const solver = loadSolver();
    const config = { ...solver.PRESETS.vegas };
    solver.elements.get("index-group").value = "custom";

    const tc4Probs = solver.rankProbabilities(config, 4, []);
    const tc4MeanTag = tc4Probs.reduce((sum, item) => sum + item.p * solver.HI_LO_TAG[item.rank], 0);
    nearly(tc4MeanTag, -4 / 52, 1e-10);

    const displayed15 = solver.chartCell("hard", 15, 10, config, 0, "custom-15").indices;
    const stand15 = displayed15.find((item) => item.ia === "S" && item.idir === "gte");
    assert.ok(stand15.i > 4 && stand15.i < 4.8, `expected generated 15vT crossover near +4, got ${stand15.i}`);
    assert.notEqual(stand15.i, 4, "Custom should not copy the published BJA/I18 integer anchor");
    assert.equal(stand15.raw, undefined);

    const displayed16 = solver.chartCell("hard", 16, 10, config, 0, "custom-16").indices;
    const stand16 = displayed16.find((item) => item.ia === "S" && item.idir === "gte");
    assert.ok(stand16.i > 0 && stand16.i < 1, `expected generated 16vT crossover below +1, got ${stand16.i}`);
    assert.notEqual(stand16.i, 0, "Custom should not copy the published BJA/I18 integer anchor");
    assert.equal(stand16.raw, undefined);

    const surrenderHidden = solver.indexesForCell("hard", 15, 9, config, []);
    assert.equal(surrenderHidden.some((item) => item.ia === "Rh"), false);

    const row15 = { id: "hard-15", kind: "hard", value: 15, label: "15" };
    const cell15T = solver.chartCell("hard", 15, 10, config, 0, "calculated-action");
    solver.elements.get("true-count-slider").value = "2";
    assert.equal(solver.displayActionForCell(row15, cell15T), "H");
    solver.elements.get("true-count-slider").value = "4.5";
    assert.equal(solver.displayActionForCell(row15, cell15T), "S");

    const row16 = { id: "hard-16", kind: "hard", value: 16, label: "16" };
    const cell16T = solver.chartCell("hard", 16, 10, config, 0, "calculated-action-16");
    solver.elements.get("true-count-slider").value = "0";
    assert.equal(solver.displayActionForCell(row16, cell16T), "H");
    solver.elements.get("true-count-slider").value = "1";
    assert.equal(solver.displayActionForCell(row16, cell16T), "S");
});

test("index decimals expose high-precision calculated crossovers", () => {
    const solver = loadSolver();
    const config = { ...solver.PRESETS.vegas };
    const base = solver.analyzeCell("hard", 15, 10, config, 0);
    const standIndex = solver
        .deriveIndexes("hard", 15, 10, config, base.best.code, "precision")
        .find((item) => item.ia === "S" && item.idir === "gte");

    solver.elements.get("index-decimals").value = "0";
    assert.equal(solver.formatIndex(standIndex.i), "+4");

    solver.elements.get("index-decimals").value = "2";
    assert.match(solver.formatIndex(standIndex.i), /^\+4\.[0-9]{2}$/);
});

test("custom index audit compares generated EV indices to the active source group", () => {
    const solver = loadSolver();
    const config = { ...solver.PRESETS.vegas };
    solver.elements.get("index-group").value = "custom";

    const audit = solver.buildIndexAudit(config);
    assert.equal(audit.group, "bjaS17");
    assert.ok(audit.sourceCount >= 20, `expected a broad source set, got ${audit.sourceCount}`);
    assert.ok(audit.matchedCount >= 18, `expected most source entries to map to generated indices, got ${audit.matchedCount}`);
    assert.ok(audit.avgDelta < 1.25, `expected custom/source average delta under 1.25 TC, got ${audit.avgDelta}`);

    const hard15 = audit.rows.find((row) => row.source.kind === "hard" && row.source.value === 15 && row.source.dealer === 10 && row.source.ia === "S");
    assert.ok(hard15?.generated, "expected 15vT source row to have a generated comparison");
    assert.ok(hard15.delta < 0.75, `expected 15vT to stay close to published +4, got delta ${hard15.delta}`);
});

test("single deck 77 vs dealer 10 removes player and dealer cards throughout EV recursion", () => {
    const solver = loadSolver();
    const config = { ...solver.PRESETS.single };
    const actual = solver.analyzeActualHand([7, 7], 10, config, 0);
    const chart = solver.analyzeCell("pair", 7, 10, config, 0);

    assert.equal(actual.best.code, "S");
    assert.equal(chart.best.code, "S");
    assert.ok(solver.evForCode(actual, "S") > solver.evForCode(actual, "H"));
    assert.ok(solver.evForCode(chart, "S") > solver.evForCode(chart, "H"));
});

test("full chart emits finite EVs, normalized probabilities, and bounded indexes", () => {
    const solver = loadSolver();
    const chart = solver.solveChartJS({ ...solver.PRESETS.vegas }, 0);

    assert.equal(chart.rows.length, 28);
    assert.equal(chart.rows.reduce((sum, row) => sum + row.cells.length, 0), 280);

    for (const row of chart.rows) {
        for (const cell of row.cells) {
            assert.ok(Number.isFinite(cell.ev), `${row.id} vs ${cell.dealer} has non-finite EV`);
            assert.ok(cell.ev >= -2 && cell.ev <= 2, `${row.id} vs ${cell.dealer} EV out of bounds`);
            const probSum = Object.values(cell.probs || {}).reduce((sum, value) => sum + value, 0);
            nearly(probSum, 1, 1e-8);
            for (const index of cell.indices || []) {
                assert.ok(index.i >= -26 && index.i <= 26, `${row.id} vs ${cell.dealer} index out of range`);
                assert.ok(["gte", "lte"].includes(index.idir), `${row.id} vs ${cell.dealer} bad direction`);
                assert.ok(["H", "S", "D", "Ds", "P", "Rh", "Rs"].includes(index.ia), `${row.id} vs ${cell.dealer} bad action`);
            }
        }
    }
});

test("rules and count control matrix keeps representative EVs finite", () => {
    const solver = loadSolver();
    const base = { ...solver.PRESETS.vegas };
    const configs = [
        ...[1, 2, 3, 4, 5, 6, 7, 8, 99].map((decks) => ({ ...base, decks })),
        ...[0, 1].map((h17) => ({ ...base, h17 })),
        ...[0, 1, 2, 3].map((doubleRule) => ({ ...base, doubleRule })),
        ...[0, 1, 2, 3].map((peek) => ({ ...base, peek })),
        ...[0, 1, 2, 3].map((surrender) => ({ ...base, surrender })),
        ...[0, 3, 4].map((resplitHands) => ({ ...base, resplitHands })),
        ...[0, 1].map((das) => ({ ...base, das })),
        ...[0, 1].map((hsa) => ({ ...base, hsa })),
        ...[0, 1].map((rsa) => ({ ...base, rsa })),
        ...[0, 5, 6, 7].map((charlie) => ({ ...base, charlie })),
        ...[0, 1, 2, 3].map((blackjackPay) => ({ ...base, blackjackPay })),
        ...[0, 1, 2].map((optimization) => ({ ...base, optimization })),
    ];
    const cells = [
        ["hard", 8, 6],
        ["hard", 12, 4],
        ["hard", 16, 10],
        ["soft", 8, 6],
        ["pair", 7, 10],
        ["pair", 10, 6],
    ];

    for (const config of configs) {
        for (const trueCount of [-5, 0, 8]) {
            for (const [kind, value, dealer] of cells) {
                const result = solver.analyzeCell(kind, value, dealer, config, trueCount);
                assert.ok(Number.isFinite(result.best.ev), `${JSON.stringify(config)} ${kind}-${value}v${dealer} TC ${trueCount} non-finite`);
                assert.ok(result.best.ev >= -2 && result.best.ev <= 2, `${kind}-${value}v${dealer} EV out of bounds`);
                const sum = Object.values(result.distribution || {}).reduce((total, value) => total + value, 0);
                nearly(sum, 1, 1e-8);
            }
        }
    }
});
