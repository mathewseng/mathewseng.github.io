const DATA_URL = "./data/probabilities.json";

const RANK_COLORS = [
  "#59636e",
  "#2f65b8",
  "#13795b",
  "#966b16",
  "#7c4d99",
  "#b3382e",
  "#0f766e",
  "#5b50b6",
  "#c45d12",
  "#111827",
];

const formatInteger = new Intl.NumberFormat("en-US");

const elements = {
  algorithmLabel: document.querySelector("#algorithmLabel"),
  cardControls: document.querySelector("#cardControls"),
  classificationNote: document.querySelector("#classificationNote"),
  detailMeta: document.querySelector("#detailMeta"),
  distributionList: document.querySelector("#distributionList"),
  exactThrough: document.querySelector("#exactThrough"),
  layerChart: document.querySelector("#layerChart"),
  metricsGrid: document.querySelector("#metricsGrid"),
  mobileCards: document.querySelector("#mobileCards"),
  peakStates: document.querySelector("#peakStates"),
  probabilityTable: document.querySelector("#probabilityTable"),
  rankControls: document.querySelector("#rankControls"),
  runMeta: document.querySelector("#runMeta"),
  stackedMap: document.querySelector("#stackedMap"),
  stackMeta: document.querySelector("#stackMeta"),
  totalSolve: document.querySelector("#totalSolve"),
  trendChart: document.querySelector("#trendChart"),
  trendMeta: document.querySelector("#trendMeta"),
};

let appData = null;
let selectedRankIndex = 6;
let selectedCards = 7;

fetch(DATA_URL)
  .then((response) => {
    if (!response.ok) throw new Error(`Could not load ${DATA_URL}`);
    return response.json();
  })
  .then((data) => {
    appData = data;
    selectedRankIndex = data.handRanks.findIndex((rank) => rank.key === "boat");
    if (selectedRankIndex < 0) selectedRankIndex = 0;
    selectedCards = data.rows.some((row) => row.cards === 7) ? 7 : data.rows[0].cards;
    renderStatic(data);
    renderDynamic();
  })
  .catch((error) => {
    elements.probabilityTable.querySelector("tbody").innerHTML =
      `<tr><td class="error-state" colspan="13">${error.message}</td></tr>`;
    elements.runMeta.textContent = "Data failed to load.";
  });

document.addEventListener("click", (event) => {
  const rankTarget = event.target.closest("[data-rank-index]");
  if (rankTarget && appData) {
    selectedRankIndex = Number(rankTarget.dataset.rankIndex);
  }

  const cardTarget = event.target.closest("[data-cards]");
  if (cardTarget && appData) {
    selectedCards = Number(cardTarget.dataset.cards);
  }

  if (rankTarget || cardTarget) {
    renderDynamic();
  }
});

function renderStatic(data) {
  elements.classificationNote.textContent = data.classification;
  elements.exactThrough.textContent = `${data.parameters.exactThrough} cards`;
  elements.algorithmLabel.textContent = data.parameters.algorithmLabel;
  elements.totalSolve.textContent = formatDuration(data.parameters.totalElapsedMs);
  elements.peakStates.textContent = compactNumber(data.parameters.peakStates);
  elements.runMeta.textContent =
    `${data.parameters.algorithmLabel}; ${compactNumber(data.parameters.coveredSubsets)} subsets covered.`;

  renderRankControls(data);
  renderCardControls(data);
  renderMetrics(data);
}

function renderDynamic() {
  renderControlState();
  renderTrendChart(appData);
  renderDistribution(appData);
  renderStackedMap(appData);
  renderMobileCards(appData);
  renderProbabilityTable(appData);
}

function renderRankControls(data) {
  elements.rankControls.innerHTML = "";
  data.handRanks.forEach((rank, index) => {
    const button = document.createElement("button");
    button.className = "rank-button";
    button.type = "button";
    button.dataset.rankIndex = index;
    button.style.setProperty("--rank-color", RANK_COLORS[index]);
    button.style.setProperty("--active-color", RANK_COLORS[index]);
    button.innerHTML = `<span class="rank-swatch" aria-hidden="true"></span><span>${rank.label}</span>`;
    elements.rankControls.append(button);
  });
}

function renderCardControls(data) {
  elements.cardControls.innerHTML = "";
  data.rows.forEach((row) => {
    const button = document.createElement("button");
    button.className = "card-button";
    button.type = "button";
    button.dataset.cards = row.cards;
    button.textContent = row.cards;
    elements.cardControls.append(button);
  });
}

function renderControlState() {
  document.querySelectorAll("[data-rank-index]").forEach((node) => {
    node.classList.toggle("active", Number(node.dataset.rankIndex) === selectedRankIndex);
  });
  document.querySelectorAll("[data-cards]").forEach((node) => {
    node.classList.toggle("active", Number(node.dataset.cards) === selectedCards);
  });
}

function renderTrendChart(data) {
  const rank = data.handRanks[selectedRankIndex];
  const color = RANK_COLORS[selectedRankIndex];
  const values = data.rows.map((row) => ({
    cards: row.cards,
    probability: row.probabilities[selectedRankIndex],
  }));
  const peak = values.reduce((best, value) =>
    value.probability > best.probability ? value : best,
  values[0]);
  const current = values.find((value) => value.cards === selectedCards) ?? values[0];

  elements.trendMeta.textContent =
    `${rank.label}: ${formatProbability(current.probability)} at ${current.cards} cards; peak ${formatProbability(peak.probability)} at ${peak.cards}.`;
  elements.stackMeta.textContent = `${rank.label} highlighted across every card count.`;

  const width = 720;
  const height = 310;
  const margin = { top: 24, right: 18, bottom: 42, left: 62 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const maxProbability = Math.max(...values.map((value) => value.probability));
  const yMax = maxProbability === 0 ? 1 : maxProbability * 1.12;
  const xStep = innerWidth / (values.length - 1);
  const points = values.map((value, index) => {
    const x = margin.left + index * xStep;
    const y = margin.top + innerHeight - (value.probability / yMax) * innerHeight;
    return { ...value, x, y };
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const gridValues = [0, yMax / 2, yMax];

  elements.trendChart.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${rank.label} probability trend">
      <g>
        ${gridValues
          .map((value) => {
            const y = margin.top + innerHeight - (value / yMax) * innerHeight;
            return `
              <line class="grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>
              <text class="axis-label" x="${margin.left - 10}" y="${y + 4}" text-anchor="end">${formatProbability(value)}</text>
            `;
          })
          .join("")}
        <line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>
        <line class="axis-line" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>
        <path class="trend-path" style="--rank-color: ${color}" d="${path}"></path>
        ${points
          .map((point) => `
            <circle
              class="trend-point ${point.cards === selectedCards ? "active" : ""}"
              style="--rank-color: ${color}"
              cx="${point.x}"
              cy="${point.y}"
              r="${point.cards === selectedCards ? 6 : 4}"
              data-cards="${point.cards}"
            >
              <title>${point.cards} cards: ${formatProbability(point.probability)}</title>
            </circle>
            <text class="point-label" x="${point.x}" y="${height - 14}" text-anchor="middle">${point.cards}</text>
          `)
          .join("")}
      </g>
    </svg>
  `;
}

function renderDistribution(data) {
  const row = getSelectedRow(data);
  const ranked = data.handRanks
    .map((rank, index) => ({
      ...rank,
      index,
      probability: row.probabilities[index],
      count: row.counts[index],
    }))
    .sort((a, b) => b.probability - a.probability || a.index - b.index);
  const maxProbability = ranked[0]?.probability ?? 1;
  const top = ranked[0];

  elements.detailMeta.textContent =
    `${row.cards} cards: ${top.label} leads at ${formatProbability(top.probability)}.`;
  elements.distributionList.innerHTML = "";

  ranked.forEach((rank) => {
    const button = document.createElement("button");
    button.className = "distribution-row";
    button.type = "button";
    button.dataset.rankIndex = rank.index;
    button.dataset.cards = row.cards;
    button.style.setProperty("--rank-color", RANK_COLORS[rank.index]);
    button.innerHTML = `
      <span class="distribution-name">
        <span class="rank-swatch" aria-hidden="true"></span>
        <span>${rank.label}</span>
      </span>
      <span class="bar-track" aria-hidden="true">
        <span class="bar-fill" style="--bar-width: ${barWidth(rank.probability, maxProbability)}"></span>
      </span>
      <span class="distribution-value">${formatProbability(rank.probability)}</span>
    `;
    elements.distributionList.append(button);
  });
}

function renderStackedMap(data) {
  elements.stackedMap.innerHTML = "";

  data.rows.forEach((row) => {
    const topIndex = row.probabilities.reduce(
      (best, probability, index) => (probability > row.probabilities[best] ? index : best),
      0,
    );
    const rowEl = document.createElement("div");
    rowEl.className = "stack-row";
    rowEl.innerHTML = `
      <span class="stack-label">${row.cards} cards</span>
      <div class="stack-bar" aria-label="${row.cards} card distribution">
        ${row.probabilities
          .map((probability, index) => {
            if (probability === 0) return "";
            const active = index === selectedRankIndex ? " active" : "";
            return `
              <button
                class="stack-segment${active}"
                type="button"
                data-rank-index="${index}"
                data-cards="${row.cards}"
                style="--rank-color: ${RANK_COLORS[index]}; flex-basis: ${(probability * 100).toFixed(6)}%"
                aria-label="${row.cards} cards ${data.handRanks[index].label} ${formatProbability(probability)}"
              ></button>
            `;
          })
          .join("")}
      </div>
      <span class="stack-top">${data.handRanks[topIndex].label} ${formatProbability(row.probabilities[topIndex])}</span>
    `;
    elements.stackedMap.append(rowEl);
  });
}

function renderMobileCards(data) {
  elements.mobileCards.innerHTML = "";

  data.rows.forEach((row) => {
    const ranked = data.handRanks
      .map((rank, index) => ({ ...rank, index, probability: row.probabilities[index] }))
      .sort((a, b) => b.probability - a.probability || a.index - b.index);
    const top = ranked[0];
    const card = document.createElement("article");
    card.className = "mobile-hand-card";
    card.innerHTML = `
      <div class="mobile-hand-head">
        <strong>${row.cards} cards</strong>
        <span>${top.label} ${formatProbability(top.probability)}</span>
      </div>
      <div class="mobile-rank-list">
        ${ranked
          .slice(0, 4)
          .map((rank) => `
            <div class="mobile-rank-row" style="--rank-color: ${RANK_COLORS[rank.index]}">
              <button type="button" data-rank-index="${rank.index}" data-cards="${row.cards}">
                <span class="rank-swatch" aria-hidden="true"></span>
                <span>${rank.label}</span>
              </button>
              <span>${formatProbability(rank.probability)}</span>
            </div>
          `)
          .join("")}
      </div>
    `;
    elements.mobileCards.append(card);
  });
}

function renderProbabilityTable(data) {
  const tableHead = elements.probabilityTable.querySelector("thead");
  const tableBody = elements.probabilityTable.querySelector("tbody");
  tableHead.innerHTML = "";
  tableBody.innerHTML = "";

  const headerRow = document.createElement("tr");
  [
    ["Cards", "sticky-one"],
    ["Method", "sticky-two"],
    ["Deals", ""],
    ...data.handRanks.map((rank) => [rank.label, ""]),
  ].forEach(([label, className]) => {
    const th = document.createElement("th");
    th.textContent = label;
    if (className) th.className = className;
    headerRow.append(th);
  });
  tableHead.append(headerRow);

  data.rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.append(
      cell(`${row.cards}`, "sticky-one"),
      htmlCell('<span class="method-pill">Exact</span>', "sticky-two"),
      cell(formatInteger.format(row.observations), "count-cell"),
    );

    row.probabilities.forEach((probability, index) => {
      const active = index === selectedRankIndex ? " active" : "";
      const td = htmlCell(
        `<button class="prob-button" type="button" data-rank-index="${index}" data-cards="${row.cards}">${formatProbability(probability)}</button>`,
        `prob-cell${active}`,
      );
      td.style.setProperty("--rank-color", RANK_COLORS[index]);
      td.style.setProperty("--p", `${(probability * 100).toFixed(6)}%`);
      td.title = `${data.handRanks[index].label}: ${formatInteger.format(row.counts[index])} of ${formatInteger.format(row.observations)}`;
      tr.append(td);
    });

    tableBody.append(tr);
  });
}

function renderMetrics(data) {
  const metrics = [
    ["Algorithm", data.parameters.algorithmLabel, "Canonical suit lanes merge equivalent suit labels without sampling."],
    ["Covered", compactNumber(data.parameters.coveredSubsets), "All deck subsets with zero through thirteen cards represented exactly."],
    ["Peak states", formatInteger.format(data.parameters.peakStates), "Largest dynamic-programming layer after rank processing."],
    ["Final states", formatInteger.format(data.parameters.finalStates), `${formatDuration(data.parameters.totalElapsedMs)} total solve.`],
  ];

  elements.metricsGrid.innerHTML = metrics
    .map(([label, value, body]) => `
      <article class="metric-card">
        <span>${label}</span>
        <strong>${value}</strong>
        <p>${body}</p>
      </article>
    `)
    .join("");

  const maxStates = Math.max(...data.solverLayers.map((layer) => layer.states));
  elements.layerChart.innerHTML = data.solverLayers
    .map((layer) => `
      <div class="layer-row">
        <span>${layer.rank}</span>
        <div class="layer-track" aria-hidden="true">
          <div class="layer-fill" style="--bar-width: ${barWidth(layer.states, maxStates)}"></div>
        </div>
        <span>${compactNumber(layer.states)}</span>
      </div>
    `)
    .join("");
}

function getSelectedRow(data) {
  return data.rows.find((row) => row.cards === selectedCards) ?? data.rows[0];
}

function cell(text, className = "") {
  const td = document.createElement("td");
  td.textContent = text;
  td.className = className;
  return td;
}

function htmlCell(html, className = "") {
  const td = document.createElement("td");
  td.innerHTML = html;
  td.className = className;
  return td;
}

function barWidth(value, max) {
  if (!max) return "0%";
  return `${Math.max(0, Math.min(100, (value / max) * 100)).toFixed(4)}%`;
}

function formatProbability(probability) {
  if (probability === 0) return "0";
  const percentage = probability * 100;
  if (percentage >= 10) return `${percentage.toFixed(2)}%`;
  if (percentage >= 1) return `${percentage.toFixed(3)}%`;
  if (percentage >= 0.01) return `${percentage.toFixed(4)}%`;
  return `${percentage.toFixed(6)}%`;
}

function formatDuration(ms) {
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = ((ms % 60_000) / 1000).toFixed(1).padStart(4, "0");
  return `${minutes}:${seconds}`;
}

function compactNumber(value) {
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}K`;
  return formatInteger.format(value);
}
