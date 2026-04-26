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
    element("index-min-range").value = "-3";
    element("index-max-range").value = "8";

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
    analyzeActualHand,
    analyzeCell,
    chartCell,
    deriveIndexes,
    evForCode,
    formatIndex,
    rankProbabilities,
    solveChartJS,
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
    assert.ok(standIndex.i < 0.5, `expected threshold below +0.5, got ${standIndex.i}`);

    const below = solver.analyzeCell("hard", 16, 10, config, 0.25);
    const above = solver.analyzeCell("hard", 16, 10, config, 0.5);
    assert.equal(below.best.code, "H");
    assert.equal(above.best.code, "S");
    assert.ok(solver.evForCode(below, "S") - solver.evForCode(below, "H") < 0);
    assert.ok(solver.evForCode(above, "S") - solver.evForCode(above, "H") > 0);
});

test("default index rounding shows the 16v10 crossover as 0, not +1", () => {
    const solver = loadSolver();
    const config = { ...solver.PRESETS.vegas };
    const base = solver.analyzeCell("hard", 16, 10, config, 0);
    const standIndex = solver
        .deriveIndexes("hard", 16, 10, config, base.best.code, "rounding")
        .find((item) => item.ia === "S" && item.idir === "gte");

    solver.elements.get("index-decimals").value = "0";
    assert.equal(solver.formatIndex(standIndex.i), "0");

    solver.elements.get("index-decimals").value = "2";
    assert.match(solver.formatIndex(standIndex.i), /^\+0\.[0-4][0-9]$/);
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
