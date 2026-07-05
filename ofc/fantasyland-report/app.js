(function () {
  "use strict";

  const BANDS = ["0-9", "10-19", "20-29", "30-39", "40+"];
  const DATASET = {
    generatedAt: "2026-07-05",
    samplesPerConfig: 24,
    method: "Fixed-seed Monte Carlo using solveHandFast, pineapple repeat rule, no five-of-kind royalty",
    data: [
      { cards: 14, jokers: 0, samples: 24, mean: 11.58, median: 11, p25: 8.75, p75: 14, p90: 18, min: 2, max: 19, stdev: 4.14, repeatPct: 0.0833, repeatAvg: 11.5, recursiveEV: 12.64, rowAvg: { top: 3.92, middle: 3.25, bottom: 4.42 }, distribution: { "0-9": 0.2917, "10-19": 0.7083, "20-29": 0, "30-39": 0, "40+": 0 }, pointCounts: { 2: 1, 6: 1, 8: 4, 9: 1, 10: 4, 11: 2, 12: 2, 13: 2, 14: 2, 15: 1, 18: 2, 19: 2 } },
      { cards: 15, jokers: 0, samples: 24, mean: 16.13, median: 15, p25: 12.75, p75: 18.25, p90: 20.7, min: 8, max: 33, stdev: 5.78, repeatPct: 0.25, repeatAvg: 22.67, recursiveEV: 21.5, rowAvg: { top: 6.5, middle: 4.08, bottom: 5.54 }, distribution: { "0-9": 0.0833, "10-19": 0.75, "20-29": 0.0833, "30-39": 0.0833, "40+": 0 }, pointCounts: { 8: 1, 9: 1, 10: 1, 11: 2, 12: 1, 13: 2, 14: 3, 15: 2, 16: 1, 17: 2, 18: 2, 19: 2, 20: 1, 21: 1, 30: 1, 33: 1 } },
      { cards: 16, jokers: 0, samples: 24, mean: 19.67, median: 17.5, p25: 14, p75: 25.25, p90: 27.7, min: 8, max: 43, stdev: 8.04, repeatPct: 0.3333, repeatAvg: 26.75, recursiveEV: 29.5, rowAvg: { top: 9.38, middle: 5.42, bottom: 4.88 }, distribution: { "0-9": 0.0833, "10-19": 0.5, "20-29": 0.3333, "30-39": 0.0417, "40+": 0.0417 }, pointCounts: { 8: 1, 9: 1, 10: 1, 11: 1, 13: 1, 14: 2, 15: 2, 17: 3, 18: 1, 19: 1, 22: 1, 23: 2, 25: 1, 26: 2, 27: 1, 28: 1, 32: 1, 43: 1 } },
      { cards: 17, jokers: 0, samples: 24, mean: 22.38, median: 22, p25: 16.5, p75: 26, p90: 29.7, min: 11, max: 45, stdev: 7.27, repeatPct: 0.4583, repeatAvg: 27.91, recursiveEV: 41.31, rowAvg: { top: 9.33, middle: 6.83, bottom: 6.21 }, distribution: { "0-9": 0, "10-19": 0.375, "20-29": 0.5, "30-39": 0.0833, "40+": 0.0417 }, pointCounts: { 11: 1, 13: 1, 15: 4, 17: 1, 18: 1, 19: 1, 21: 1, 22: 3, 23: 1, 24: 2, 25: 1, 26: 2, 29: 2, 30: 1, 31: 1, 45: 1 } },
      { cards: 14, jokers: 1, samples: 24, mean: 20.46, median: 20, p25: 14.75, p75: 26.25, p90: 27.7, min: 10, max: 37, stdev: 7.52, repeatPct: 0.5833, repeatAvg: 24.93, recursiveEV: 49.1, rowAvg: { top: 4.42, middle: 7.17, bottom: 8.88 }, distribution: { "0-9": 0, "10-19": 0.5, "20-29": 0.4167, "30-39": 0.0833, "40+": 0 }, pointCounts: { 10: 3, 12: 2, 14: 1, 15: 1, 17: 2, 18: 2, 19: 1, 21: 1, 22: 3, 23: 1, 26: 1, 27: 3, 28: 1, 37: 2 } },
      { cards: 15, jokers: 1, samples: 24, mean: 20.67, median: 20, p25: 17, p75: 24.25, p90: 29, min: 8, max: 34, stdev: 6.37, repeatPct: 0.4583, repeatAvg: 25.73, recursiveEV: 38.15, rowAvg: { top: 7.33, middle: 6.33, bottom: 7 }, distribution: { "0-9": 0.0417, "10-19": 0.4583, "20-29": 0.4167, "30-39": 0.0833, "40+": 0 }, pointCounts: { 8: 1, 10: 1, 14: 2, 15: 1, 17: 3, 18: 2, 19: 2, 21: 2, 22: 1, 23: 2, 24: 1, 25: 1, 28: 1, 29: 2, 31: 1, 34: 1 } },
      { cards: 16, jokers: 1, samples: 24, mean: 30.08, median: 29.5, p25: 25.75, p75: 32.25, p90: 38.8, min: 21, max: 45, stdev: 5.98, repeatPct: 0.875, repeatAvg: 31.1, recursiveEV: 240.67, rowAvg: { top: 13.38, middle: 7.17, bottom: 9.54 }, distribution: { "0-9": 0, "10-19": 0, "20-29": 0.5, "30-39": 0.375, "40+": 0.125 }, pointCounts: { 21: 1, 22: 1, 23: 1, 24: 2, 25: 1, 26: 1, 27: 1, 28: 3, 29: 1, 30: 2, 31: 1, 32: 3, 33: 1, 35: 1, 36: 1, 40: 1, 41: 1, 45: 1 } },
      { cards: 17, jokers: 1, samples: 24, mean: 34.96, median: 33.5, p25: 30.75, p75: 39.25, p90: 42.4, min: 22, max: 49, stdev: 6.09, repeatPct: 1, repeatAvg: 34.96, recursiveEV: null, rowAvg: { top: 18.96, middle: 8.17, bottom: 7.83 }, distribution: { "0-9": 0, "10-19": 0, "20-29": 0.125, "30-39": 0.625, "40+": 0.25 }, pointCounts: { 22: 1, 27: 1, 29: 1, 30: 3, 31: 1, 32: 4, 33: 1, 34: 1, 35: 1, 36: 1, 38: 1, 39: 2, 40: 2, 41: 1, 43: 1, 45: 1, 49: 1 } },
      { cards: 14, jokers: 2, samples: 24, mean: 24.79, median: 24, p25: 19, p75: 27.5, p90: 36.4, min: 14, max: 42, stdev: 7.42, repeatPct: 0.9167, repeatAvg: 25.59, recursiveEV: 297.5, rowAvg: { top: 6, middle: 6.67, bottom: 12.13 }, distribution: { "0-9": 0, "10-19": 0.375, "20-29": 0.4167, "30-39": 0.1667, "40+": 0.0417 }, pointCounts: { 14: 2, 18: 3, 19: 4, 22: 3, 26: 2, 27: 4, 29: 1, 30: 1, 35: 1, 37: 1, 38: 1, 42: 1 } },
      { cards: 15, jokers: 2, samples: 24, mean: 31.04, median: 30, p25: 27.75, p75: 35.25, p90: 39.8, min: 18, max: 45, stdev: 6.68, repeatPct: 0.9583, repeatAvg: 31.61, recursiveEV: 745, rowAvg: { top: 9.42, middle: 9.92, bottom: 11.71 }, distribution: { "0-9": 0, "10-19": 0.0833, "20-29": 0.2917, "30-39": 0.5, "40+": 0.125 }, pointCounts: { 18: 1, 19: 1, 23: 1, 26: 1, 27: 2, 28: 2, 29: 1, 30: 6, 31: 1, 33: 1, 35: 1, 36: 1, 37: 2, 41: 1, 45: 2 } },
      { cards: 16, jokers: 2, samples: 24, mean: 37, median: 36, p25: 32, p75: 39.25, p90: 44.7, min: 22, max: 62, stdev: 7.53, repeatPct: 1, repeatAvg: 37, recursiveEV: null, rowAvg: { top: 15.83, middle: 9.67, bottom: 11.5 }, distribution: { "0-9": 0, "10-19": 0, "20-29": 0.0833, "30-39": 0.6667, "40+": 0.25 }, pointCounts: { 22: 1, 29: 1, 31: 3, 32: 2, 33: 1, 34: 2, 36: 3, 37: 2, 39: 3, 40: 1, 43: 1, 44: 1, 45: 1, 46: 1, 62: 1 } },
      { cards: 17, jokers: 2, samples: 24, mean: 42.46, median: 42, p25: 37.5, p75: 45, p90: 47, min: 32, max: 65, stdev: 7.67, repeatPct: 1, repeatAvg: 42.46, recursiveEV: null, rowAvg: { top: 13.79, middle: 11.58, bottom: 17.08 }, distribution: { "0-9": 0, "10-19": 0, "20-29": 0, "30-39": 0.2917, "40+": 0.7083 }, pointCounts: { 32: 2, 34: 1, 35: 2, 36: 1, 38: 1, 40: 3, 41: 1, 42: 2, 44: 4, 45: 2, 46: 1, 47: 2, 61: 1, 65: 1 } },
    ],
  };

  let activeMetric = "mean";
  let activeConfig = DATASET.data[0];

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelector("#method-samples").textContent = `${DATASET.samplesPerConfig} samples per config`;
    bindTabs();
    renderSummary();
    renderMatrix();
    renderDistributionBars();
    renderConfigSelector();
    renderDetail(activeConfig);
    renderJokerTable();
    renderRowContributionChart();
    renderInsights();
  });

  function bindTabs() {
    document.querySelectorAll(".metric-tabs button").forEach((button) => {
      button.addEventListener("click", () => {
        activeMetric = button.dataset.metric;
        document.querySelectorAll(".metric-tabs button").forEach((item) => item.classList.toggle("active", item === button));
        renderMatrix();
      });
    });
  }

  function renderSummary() {
    const bestMean = maxBy(DATASET.data, (row) => row.mean);
    const bestNoJoker = maxBy(DATASET.data.filter((row) => row.jokers === 0), (row) => row.mean);
    const weighted17 = weightedByCards(17);
    const biggestJokerLift = maxBy([14, 15, 16, 17].map((cards) => {
      const zero = findConfig(cards, 0).mean;
      const two = findConfig(cards, 2).mean;
      return { cards, lift: two - zero };
    }), (row) => row.lift);

    const cards = [
      ["Top EV", evText(bestMean.mean), configLabel(bestMean)],
      ["Best no-joker EV", evText(bestNoJoker.mean), configLabel(bestNoJoker)],
      ["Weighted 17-card EV", evText(weighted17.mean), `${pct(weighted17.repeat)} repeat`],
      ["Largest joker lift", `+${biggestJokerLift.lift.toFixed(2)}`, `${biggestJokerLift.cards} cards: 0 to 2 jokers`],
    ];

    document.querySelector("#summary-grid").replaceChildren(
      ...cards.map(([label, value, note]) => {
        const card = document.createElement("article");
        card.className = "metric-card";
        card.innerHTML = `<span>${label}</span><strong>${value}</strong><p>${note}</p>`;
        return card;
      })
    );
  }

  function renderMatrix() {
    const matrix = document.querySelector("#metric-matrix");
    const values = DATASET.data.map((row) => metricValue(row, activeMetric)).filter((value) => Number.isFinite(value));
    const max = Math.max(...values);
    const frag = document.createDocumentFragment();
    ["Cards", "0 jokers", "1 joker", "2 jokers"].forEach((label) => {
      const cell = document.createElement("div");
      cell.className = "matrix-cell header";
      cell.textContent = label;
      frag.appendChild(cell);
    });

    [14, 15, 16, 17].forEach((cards) => {
      const label = document.createElement("div");
      label.className = "matrix-cell row-label";
      label.textContent = `${cards} cards`;
      frag.appendChild(label);
      [0, 1, 2].forEach((jokers) => {
        const row = findConfig(cards, jokers);
        const value = metricValue(row, activeMetric);
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "matrix-cell";
        cell.addEventListener("click", () => {
          activeConfig = row;
          renderConfigSelector();
          renderDetail(row);
        });
        cell.innerHTML = `
          <div class="matrix-value">${formatMetric(row, activeMetric)}</div>
          <div class="cell-bar"><span style="width:${barWidth(value, max)}%"></span></div>
          <div class="matrix-meta">${evText(row.mean)} immediate / ${pct(row.repeatPct)} repeat</div>
        `;
        frag.appendChild(cell);
      });
    });

    matrix.replaceChildren(frag);
  }

  function renderDistributionBars() {
    const list = document.querySelector("#distribution-bars");
    list.replaceChildren(
      ...DATASET.data.map((row) => {
        const item = document.createElement("div");
        item.className = "dist-row";
        item.innerHTML = `
          <div class="dist-label">${configShort(row)}</div>
          <div class="dist-bar" title="${configLabel(row)} royalty distribution">
            ${BANDS.map((band) => `<span class="dist-segment" style="width:${(row.distribution[band] || 0) * 100}%"></span>`).join("")}
          </div>
          <div class="dist-repeat">${pct(row.repeatPct)}</div>
        `;
        return item;
      })
    );
  }

  function renderConfigSelector() {
    const selector = document.querySelector("#config-selector");
    selector.replaceChildren(
      ...DATASET.data.map((row) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = row === activeConfig ? "active" : "";
        button.textContent = configShort(row);
        button.addEventListener("click", () => {
          activeConfig = row;
          renderConfigSelector();
          renderDetail(row);
        });
        return button;
      })
    );
  }

  function renderDetail(row) {
    document.querySelector("#detail-title").textContent = configLabel(row);
    const panel = document.querySelector("#detail-panel");
    const points = Object.entries(row.pointCounts).map(([point, count]) => ({ point: Number(point), count }));
    const maxCount = Math.max(...points.map((item) => item.count));
    panel.innerHTML = `
      <div class="detail-grid">
        ${detailStat("Immediate EV", evText(row.mean))}
        ${detailStat("Recursive EV", formatRecursive(row))}
        ${detailStat("Repeat rate", pct(row.repeatPct))}
        ${detailStat("IQR", `${row.p25} to ${row.p75}`)}
      </div>
      <div class="histogram" style="--count:${points.length}">
        ${points.map((item) => `<div class="hist-bar" style="height:${Math.max(4, (item.count / maxCount) * 100)}%" title="${item.point} points: ${item.count} hands"></div>`).join("")}
      </div>
      <div class="hist-axis"><span>${row.min} pts</span><span>${row.max} pts</span></div>
    `;
  }

  function renderJokerTable() {
    const body = document.querySelector("#joker-probability-table tbody");
    body.replaceChildren(
      ...[14, 15, 16, 17].map((cards) => {
        const probs = jokerProbabilities(cards);
        const weighted = weightedByCards(cards);
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${cards}</td>
          <td>${pct(probs[0])}</td>
          <td>${pct(probs[1])}</td>
          <td>${pct(probs[2])}</td>
          <td>${evText(weighted.mean)}</td>
          <td>${pct(weighted.repeat)}</td>
        `;
        return row;
      })
    );
  }

  function renderRowContributionChart() {
    const chart = document.querySelector("#row-contribution-chart");
    chart.replaceChildren(
      ...DATASET.data.map((row) => {
        const total = row.rowAvg.top + row.rowAvg.middle + row.rowAvg.bottom || 1;
        const item = document.createElement("div");
        item.className = "row-contrib";
        item.innerHTML = `
          <div class="dist-label">${configShort(row)}</div>
          <div class="row-stack">
            <span style="width:${(row.rowAvg.top / total) * 100}%"></span>
            <span style="width:${(row.rowAvg.middle / total) * 100}%"></span>
            <span style="width:${(row.rowAvg.bottom / total) * 100}%"></span>
          </div>
          <div class="dist-repeat">${evText(row.mean)}</div>
        `;
        return item;
      }),
      legend()
    );
  }

  function renderInsights() {
    const best = maxBy(DATASET.data, (row) => row.mean);
    const weighted14 = weightedByCards(14);
    const weighted17 = weightedByCards(17);
    const noJokerGrowth = findConfig(17, 0).mean - findConfig(14, 0).mean;
    const twoJokerGrowth = findConfig(17, 2).mean - findConfig(14, 2).mean;
    const insights = [
      ["Jokers dominate repeat equity", `Two-joker configs repeat in ${pct(findConfig(14, 2).repeatPct)} to ${pct(findConfig(17, 2).repeatPct)} of sampled hands.`],
      ["Card count still matters", `Going from 14 to 17 cards adds ${noJokerGrowth.toFixed(2)} EV with no jokers and ${twoJokerGrowth.toFixed(2)} EV with two jokers.`],
      ["Best sampled config", `${configLabel(best)} leads the snapshot at ${evText(best.mean)} immediate EV and ${pct(best.repeatPct)} repeat.`],
      ["Real-deck joker mix", `A random 17-card hand is ${pct(jokerProbabilities(17)[2])} to include both jokers, producing a weighted estimate of ${evText(weighted17.mean)} versus ${evText(weighted14.mean)} for 14 cards.`],
    ];

    document.querySelector("#insight-list").replaceChildren(
      ...insights.map(([title, body]) => {
        const card = document.createElement("article");
        card.className = "insight-card";
        card.innerHTML = `<strong>${title}</strong><p>${body}</p>`;
        return card;
      })
    );
  }

  function metricValue(row, metric) {
    if (metric === "recursiveEV") return Number.isFinite(row.recursiveEV) ? row.recursiveEV : row.mean / Math.max(0.02, 1 - row.repeatPct);
    return row[metric];
  }

  function formatMetric(row, metric) {
    if (metric === "repeatPct") return pct(row.repeatPct);
    if (metric === "recursiveEV") return formatRecursive(row);
    return evText(row.mean);
  }

  function formatRecursive(row) {
    return Number.isFinite(row.recursiveEV) ? evText(row.recursiveEV) : "sample 100%";
  }

  function weightedByCards(cards) {
    const probs = jokerProbabilities(cards);
    const rows = [0, 1, 2].map((jokers) => findConfig(cards, jokers));
    return {
      mean: rows.reduce((sum, row) => sum + probs[row.jokers] * row.mean, 0),
      repeat: rows.reduce((sum, row) => sum + probs[row.jokers] * row.repeatPct, 0),
    };
  }

  function jokerProbabilities(cards) {
    const denominator = choose(54, cards);
    return [0, 1, 2].map((jokers) => (choose(2, jokers) * choose(52, cards - jokers)) / denominator);
  }

  function choose(n, k) {
    if (k < 0 || k > n) return 0;
    let result = 1;
    for (let i = 1; i <= k; i += 1) {
      result = (result * (n - k + i)) / i;
    }
    return result;
  }

  function findConfig(cards, jokers) {
    return DATASET.data.find((row) => row.cards === cards && row.jokers === jokers);
  }

  function maxBy(rows, getValue) {
    return rows.reduce((best, row) => (getValue(row) > getValue(best) ? row : best), rows[0]);
  }

  function barWidth(value, max) {
    if (!Number.isFinite(value) || !max) return 0;
    return Math.max(3, Math.min(100, (value / max) * 100));
  }

  function detailStat(label, value) {
    return `<div class="detail-stat"><span>${label}</span><strong>${value}</strong></div>`;
  }

  function legend() {
    const item = document.createElement("div");
    item.className = "legend";
    item.innerHTML = `
      <span style="--color:var(--purple)">Top</span>
      <span style="--color:var(--green)">Middle</span>
      <span style="--color:var(--blue)">Bottom</span>
    `;
    return item;
  }

  function configLabel(row) {
    return `${row.cards} cards / ${row.jokers} ${row.jokers === 1 ? "joker" : "jokers"}`;
  }

  function configShort(row) {
    return `${row.cards}/${row.jokers}`;
  }

  function evText(value) {
    return Number(value).toFixed(2);
  }

  function pct(value) {
    return `${(value * 100).toFixed(1)}%`;
  }
})();
