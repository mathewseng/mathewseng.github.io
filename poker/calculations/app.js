const DATA_URL = "./data/probabilities.json";

const formatInteger = new Intl.NumberFormat("en-US");

const table = document.querySelector("#probabilityTable");
const tableHead = table.querySelector("thead");
const tableBody = table.querySelector("tbody");
const metricsGrid = document.querySelector("#metricsGrid");

fetch(DATA_URL)
  .then((response) => {
    if (!response.ok) {
      throw new Error(`Could not load ${DATA_URL}`);
    }
    return response.json();
  })
  .then(render)
  .catch((error) => {
    tableBody.innerHTML = `<tr><td class="error-state" colspan="14">${error.message}</td></tr>`;
    document.querySelector("#runMeta").textContent = "Data failed to load.";
  });

function render(data) {
  const monteCarloRows = data.rows.filter((row) => row.method === "monte_carlo");
  const maxMonteCarloError = monteCarloRows.reduce(
    (max, row) => Math.max(max, row.maxStandardError),
    0,
  );

  document.querySelector("#classificationNote").textContent = data.classification;
  document.querySelector("#exactThrough").textContent = `${data.parameters.exactThrough} cards`;
  document.querySelector("#monteCarloFrom").textContent = data.parameters.monteCarloFrom
    ? `${data.parameters.monteCarloFrom} cards`
    : "Never";
  document.querySelector("#totalSolve").textContent = formatDuration(data.parameters.totalElapsedMs);
  document.querySelector("#samplesPerRow").textContent = data.parameters.monteCarloFrom
    ? compactNumber(data.parameters.monteCarloSamplesPerRow)
    : "None";
  document.querySelector("#runMeta").textContent =
    `${data.parameters.threads} threads, seed ${data.parameters.seed}, max MC SE ${formatPercentagePoints(maxMonteCarloError)}.`;

  renderProbabilityTable(data);
  renderMetrics(data);
}

function renderProbabilityTable(data) {
  tableHead.innerHTML = "";
  tableBody.innerHTML = "";

  const headerRow = document.createElement("tr");
  [
    ["Cards", "sticky-one"],
    ["Method", "sticky-two"],
    ["Deals / samples", ""],
    ["Solve time", ""],
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
    const methodLabel = row.method === "exact" ? "Exact" : "Monte Carlo";
    const methodClass = row.method === "exact" ? "method-pill" : "method-pill mc";

    tr.append(
      cell(`${row.cards}`, "sticky-one"),
      htmlCell(`<span class="${methodClass}">${methodLabel}</span>`, "sticky-two"),
      cell(formatInteger.format(row.observations), "count-cell"),
      cell(formatDuration(row.elapsedMs), "time-cell"),
    );

    row.probabilities.forEach((probability, index) => {
      const td = cell(formatProbability(probability), `prob-cell ${row.method === "monte_carlo" ? "mc-row" : ""}`);
      td.style.setProperty("--p", `${(probability * 100).toFixed(6)}%`);
      td.title = `${data.handRanks[index].label}: ${formatInteger.format(row.counts[index])} of ${formatInteger.format(row.observations)}`;
      tr.append(td);
    });

    tableBody.append(tr);
  });
}

function renderMetrics(data) {
  metricsGrid.innerHTML = "";
  data.rows.forEach((row) => {
    const card = document.createElement("article");
    card.className = "metric-card";
    const method = row.method === "exact" ? "Exact" : "Monte Carlo";
    const detail =
      row.method === "exact"
        ? `${formatInteger.format(row.observations)} combinations enumerated`
        : `${formatInteger.format(row.observations)} sampled deals, max SE ${formatPercentagePoints(row.maxStandardError)}`;

    card.innerHTML = `
      <span>${method}</span>
      <strong>${row.cards} cards</strong>
      <p>${detail}<br>${formatDuration(row.elapsedMs)}</p>
    `;
    metricsGrid.append(card);
  });
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

function formatProbability(probability) {
  if (probability === 0) return "0";
  const percentage = probability * 100;
  if (percentage >= 10) return `${percentage.toFixed(2)}%`;
  if (percentage >= 1) return `${percentage.toFixed(3)}%`;
  if (percentage >= 0.01) return `${percentage.toFixed(4)}%`;
  return `${percentage.toFixed(6)}%`;
}

function formatPercentagePoints(probability) {
  if (!probability) return "0 pp";
  const points = probability * 100;
  if (points >= 0.01) return `±${points.toFixed(3)} pp`;
  return `±${points.toFixed(5)} pp`;
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
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}K`;
  return formatInteger.format(value);
}
