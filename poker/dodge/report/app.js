import {
  RANKS,
  SUITS,
  SYMBOLS,
  CATEGORIES,
  COLORS,
  PAIRINGS,
  SUIT_LABELS,
  cardName,
  handName,
  bustCategory,
  nextCards,
  decodeData,
  aggregate,
  filterRows,
  metricValue,
  csvForRows,
  targetProbability,
} from "./engine.mjs";
import {
  pct,
  num,
  esc,
  emptyChart,
  histogram,
  lineChart,
  outcomes,
  legend,
} from "./charts.mjs?v=mobile-20260919";

const $ = (id) => document.getElementById(id);
const count = (n) => n.toLocaleString("en-US");
const compact = (n) =>
  n >= 1e9 ? `${num(n / 1e9, 2)}B` : `${num(n / 1e6, 1)}M`;
const phoneLayout = window.matchMedia("(max-width: 700px)");
const state = {
  rows: [],
  filtered: [],
  sorted: [],
  stats: null,
  allStats: null,
  data: null,
  tab: "explorer",
  selected: 0,
  pins: [],
  page: 1,
  pageSize: 50,
  pageSizeChosen: false,
  columnsChosen: false,
  sort: [{ key: "mean", direction: -1 }],
  columns: [],
  numeric: [],
  nextRuleId: 0,
  runout: [],
  reportsDirty: true,
};
const columnDefs = [
  {
    key: "mean",
    label: "Mean draws",
    desc: "Mean additional draws including the bust card; Monte Carlo estimate.",
    format: (r) => num(r.mean, 3),
  },
  {
    key: "hist",
    label: "Bust distribution",
    desc: "Histogram of additional draws, 1–13; bars share a scale within each row.",
    format: (r) => spark(r.hist),
  },
  {
    key: "firstBust",
    label: "Bust next · exact",
    desc: "Exact chance of busting on the first draw: outs / 48.",
    format: (r) => pct(r.firstBust, 2),
  },
  {
    key: "bustBy2",
    label: "Bust ≤2 · exact",
    desc: "Exact chance of busting by the second draw, out of C(48,2) remaining pairs.",
    format: (r) => pct(r.bustBy2, 2),
  },
  {
    key: "median",
    label: "Median",
    desc: "Smallest draw number with cumulative bust probability at least 50%.",
    format: (r) => num(r.median, 0),
  },
  {
    key: "p10",
    label: "P10",
    desc: "10th percentile of additional draws.",
    format: (r) => num(r.p10, 0),
  },
  {
    key: "p90",
    label: "P90",
    desc: "90th percentile of additional draws.",
    format: (r) => num(r.p90, 0),
  },
  {
    key: "sd",
    label: "Std. dev.",
    desc: "Spread in the number of draws, not uncertainty in the mean.",
    format: (r) => num(r.sd, 3),
  },
  {
    key: "survive3",
    label: "Survive 3",
    desc: "P(T > 3): complete 3 draws without busting; Monte Carlo.",
    format: (r) => pct(r.survive3, 2),
  },
  {
    key: "survive5",
    label: "Survive 5",
    desc: "P(T > 5): complete 5 draws without busting; Monte Carlo.",
    format: (r) => pct(r.survive5, 2),
  },
  {
    key: "survive8",
    label: "Survive 8",
    desc: "P(T > 8): complete 8 draws without busting; Monte Carlo.",
    format: (r) => pct(r.survive8, 2),
  },
  ...CATEGORIES.map((c, i) => ({
    key: `cat${i}`,
    label: c,
    desc: `Probability the highest five-card hand at the first bust is ${c.toLowerCase()}. Royal flushes are separate from straight flushes.`,
    format: (r) => pct(r.categories[i], i >= 3 ? 3 : 2),
  })),
  {
    key: "mix",
    label: "Bust mix",
    desc: "Straight / flush / full house / quads / straight flush / royal flush.",
    format: (r) => stack(r.categories),
  },
  {
    key: "safeDraws",
    label: "Mean safe draws",
    desc: "E[T − 1]: successful draws before the bust card.",
    format: (r) => num(r.safeDraws, 3),
  },
  {
    key: "totalCards",
    label: "Mean total cards",
    desc: "E[T + 4]: total cards held including the four starting cards and bust card.",
    format: (r) => num(r.totalCards, 3),
  },
  {
    key: "firstOuts",
    label: "Initial bust outs",
    desc: "Exact number of remaining cards that bust on the next draw.",
    format: (r) => num(r.firstOuts, Number.isInteger(r.firstOuts) ? 0 : 2),
  },
  {
    key: "mode",
    label: "Most likely draw",
    desc: "Most frequent draw number; lowest draw number wins ties.",
    format: (r) => num(r.mode, 0),
  },
  {
    key: "combinations",
    label: "Combinations",
    desc: "Number of actual four-card deals represented by this suit-isomorphism class.",
    format: (r) => count(r.combinations),
  },
  {
    key: "meanSE",
    label: "Mean ±95%",
    desc: "Half-width of the approximate 95% Monte Carlo confidence interval for the mean.",
    format: (r) => `±${num(1.96 * r.meanSE, 4)}`,
  },
];
const numericDefs = columnDefs.filter((c) => !["hist", "mix"].includes(c.key));
const presets = {
  quick: ["mean", "survive5"],
  core: [
    "mean",
    "hist",
    "firstBust",
    "median",
    "p90",
    "sd",
    "survive5",
    "mix",
    "combinations",
  ],
  outcomes: [
    "mean",
    ...CATEGORIES.map((_, i) => `cat${i}`),
    "mix",
    "firstBust",
  ],
  survival: [
    "mean",
    "firstBust",
    "bustBy2",
    "survive3",
    "survive5",
    "survive8",
    "p10",
    "median",
    "p90",
  ],
  all: columnDefs.map((c) => c.key),
};
state.columns = [...presets.core];

function chartOptions() {
  return phoneLayout.matches
    ? {
        compact: true,
        width: Math.max(260, Math.min(620, window.innerWidth - 48)),
        height: 230,
      }
    : {};
}
function setFiltersOpen(open) {
  document
    .querySelector(".filter-panel")
    .classList.toggle("filters-open", open);
  $("filter-toggle").setAttribute("aria-expanded", String(open));
}
function renderFilterCount() {
  const active =
    ["pairing", "suits", "high", "connected"].filter((id) => $(id).value)
      .length +
    state.numeric.filter((rule) => rule.value !== "").length +
    Number($("pinned-only").checked);
  $("filter-count").textContent = active;
  $("filter-count").hidden = !active;
  $("filter-apply").textContent =
    `Show ${count(state.filtered.length)} matching hands`;
}
function syncResponsiveLayout() {
  const phone = phoneLayout.matches;
  const detail = $("hand-detail");
  const container = phone
    ? $("hand-dialog-content")
    : document.querySelector(".explorer-workspace");
  if (!phone && $("hand-dialog").open) $("hand-dialog").close();
  if (detail.parentElement !== container) container.append(detail);
  if (!state.columnsChosen) {
    $("column-preset").value = phone ? "quick" : "core";
    state.columns = [...presets[$("column-preset").value]];
  }
  if (!state.pageSizeChosen) {
    state.pageSize = phone ? 25 : 50;
    $("page-size").value = state.pageSize;
  }
}
function showHandReport() {
  if (!phoneLayout.matches) return;
  const dialog = $("hand-dialog");
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  dialog.querySelector("[data-close]").focus({ preventScroll: true });
}

function card(c) {
  return `<span class="playing-card ${SUITS[c % 4]}" aria-label="${cardName(c)}"><span class="suit" aria-hidden="true">${SYMBOLS[c % 4]}</span><span class="rank" aria-hidden="true">${RANKS[Math.floor(c / 4)]}</span></span>`;
}
function cards(values, large = false) {
  return `<span class="cards${large ? " large" : ""}" aria-label="${handName(values)}">${values.map(card).join("")}</span>`;
}
function spark(hist) {
  const max = Math.max(...hist);
  return `<span class="spark-hist" role="img" aria-label="Draw distribution">${hist.map((p, i) => `<i style="height:${max ? (p / max) * 100 : 0}%" title="Draw ${i + 1}: ${pct(p, 3)}"></i>`).join("")}</span>`;
}
function stack(values) {
  return `<span class="mini-stack" role="img" aria-label="Bust rankings">${values.map((p, i) => `<i style="width:${p * 100}%;background:${COLORS[i]}" title="${CATEGORIES[i]}: ${pct(p, 3)}"></i>`).join("")}</span>`;
}
function toast(text) {
  $("toast").textContent = text;
  $("toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").hidden = true), 2800);
}
function filterState() {
  return {
    search: $("search").value,
    pairing: $("pairing").value,
    suits: $("suits").value,
    high: $("high").value,
    connected: $("connected").value,
    numeric: state.numeric,
    pinned: $("pinned-only").checked ? state.pins : null,
  };
}
function weight() {
  return $("weighting").value;
}
function selected() {
  return state.rows[state.selected];
}
function sortRows() {
  state.sorted = [...state.filtered].sort((a, b) => {
    for (const s of state.sort) {
      const d =
        s.key === "hand"
          ? a.id - b.id
          : metricValue(a, s.key) - metricValue(b, s.key);
      if (d) return d * s.direction;
    }
    return a.id - b.id;
  });
}
function applyFilters() {
  state.filtered = filterRows(state.rows, filterState());
  state.stats = aggregate(state.filtered, weight());
  state.allStats = aggregate(state.rows, weight());
  state.page = 1;
  state.reportsDirty = true;
  sortRows();
  renderSummary();
  renderActive();
  const combos = state.stats?.combinations || 0;
  $("population-label").innerHTML =
    `<strong>${count(state.filtered.length)}</strong> / 16,432 classes <span class="desktop-only">· ${count(combos)} deals </span>· ${pct(combos / 270725, 2)} of deals`;
  $("scope-weight").textContent =
    weight() === "deals"
      ? "Weighted by actual deals."
      : "Each suit-equivalent class has equal weight.";
  $("pin-count").textContent = state.pins.length;
  $("export-button").disabled = !state.filtered.length;
  renderFilterCount();
}
function renderSummary() {
  const s = state.stats;
  const items = [
    [
      "Mean draws to bust",
      s ? num(s.mean, 3) : "—",
      "cards",
      s
        ? `95% MC interval ${num(s.mean - 1.96 * s.meanSE, 4)}–${num(s.mean + 1.96 * s.meanSE, 4)}`
        : "No matching hands",
    ],
    [
      "Bust on the next draw",
      s ? pct(s.firstBust, 2) : "—",
      "",
      s
        ? `${num(s.firstOuts, 2)} average outs / 48 · exact`
        : "Exact enumeration",
    ],
    [
      "Survive five draws",
      s ? pct(s.survive5, 2) : "—",
      "",
      s ? "Finish 5 draws safely · estimated P(T > 5)" : "Monte Carlo estimate",
    ],
    [
      "Middle 80% of runouts",
      s ? `${s.p10}–${s.p90}` : "—",
      "draws",
      s
        ? `Median ${s.median} · ${num(s.safeDraws, 2)} safe draws on average`
        : "P10 to P90 of the distribution",
    ],
  ];
  $("summary").innerHTML = items
    .map(
      ([label, value, unit, caption]) =>
        `<div class="summary-item" title="${esc(caption)}"><p class="metric-label">${label}</p><p class="metric-value">${value}<small>${unit}</small></p><p class="metric-caption">${caption}</p></div>`,
    )
    .join("");
}
function renderActive() {
  if (state.tab === "explorer") {
    $("overview-hist").innerHTML = histogram(state.stats, chartOptions());
    $("overview-outcomes").innerHTML = outcomes(state.stats);
    renderTable();
    renderDetail();
    renderComparison();
  } else if (state.tab === "reports") renderReports();
  else renderLab();
}
function changeTab(tab) {
  const returnToTop =
    phoneLayout.matches &&
    document.querySelector(".tabs").getBoundingClientRect().top <= 1;
  state.tab = tab;
  for (const name of ["explorer", "reports", "lab"])
    $(`${name}-view`).hidden = name !== tab;
  document.querySelectorAll("[data-tab]").forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle("active", on);
    if (on) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  renderActive();
  if (returnToTop) $(`${tab}-view`).scrollIntoView({ block: "start" });
}
function renderTable() {
  const cols = state.columns.map((key) =>
    columnDefs.find((c) => c.key === key),
  );
  const pages = Math.max(1, Math.ceil(state.sorted.length / state.pageSize));
  state.page = Math.min(pages, Math.max(1, state.page));
  const header = (key, label, desc = "") => {
    const s = state.sort.find((x) => x.key === key),
      sortable = !["hist", "mix"].includes(key);
    const order = s ? (s.direction === 1 ? "ascending" : "descending") : "none";
    return `<th scope="col"${sortable ? ` aria-sort="${order}"` : ""} title="${esc(desc)}">${sortable ? `<button data-sort="${key}">${label} <span aria-hidden="true">${s ? (s.direction === 1 ? "↑" : "↓") : "↕"}</span>${s && state.sort.length > 1 ? `<sup>${state.sort.indexOf(s) + 1}</sup>` : ""}</button>` : label}</th>`;
  };
  $("hand-table").querySelector("thead").innerHTML =
    `<tr>${header("hand", "Starting hand", "Cards are sorted A–2, then spades, hearts, diamonds, clubs. Suit labels maximize spades, then hearts, diamonds and clubs.")}${cols.map((c) => header(c.key, phoneLayout.matches && c.key === "mean" ? "Mean" : c.label, c.desc)).join("")}</tr>`;
  const metricCells = (r, agg = false) =>
    cols
      .map((c) => {
        let style = "";
        if (!agg && c.key === "mean")
          style = ` style="background:rgba(62,159,118,${Math.max(0, (r.mean - 2) / 6) * 0.23})"`;
        return `<td class="metric-cell"${style}>${c.format(r)}</td>`;
      })
      .join("");
  let html = "";
  if (state.stats) {
    html += `<tr class="aggregate-row"><td><span class="aggregate-label">FILTERED POPULATION<small>${count(state.filtered.length)}<span class="desktop-only"> hand classes</span> · ${weight() === "deals" ? "deal weighted" : "class weighted"}</small></span></td>${metricCells(state.stats, true)}</tr>`;
    if (state.filtered.length !== state.rows.length)
      html += `<tr class="baseline-row"><td><span class="aggregate-label">All starting hands<small>Unfiltered reference</small></span></td>${metricCells(state.allStats, true)}</tr>`;
  }
  const start = (state.page - 1) * state.pageSize;
  html += state.sorted
    .slice(start, start + state.pageSize)
    .map(
      (r) =>
        `<tr data-row="${r.id}" class="${r.id === state.selected ? "selected" : ""}"><td><span class="hand-cell"><button class="pin-button ${state.pins.includes(r.id) ? "pinned" : ""}" data-pin="${r.id}" aria-label="${state.pins.includes(r.id) ? "Unpin" : "Pin"} ${r.name}" aria-pressed="${state.pins.includes(r.id)}">${state.pins.includes(r.id) ? "●" : "○"}</button><button class="hand-button" data-hand="${r.id}" aria-label="Inspect ${r.name}">${cards(r.cards)}</button></span></td>${metricCells(r)}</tr>`,
    )
    .join("");
  if (!state.sorted.length)
    html = `<tr><td colspan="${cols.length + 1}" class="empty-cell">No matching hands. Try fewer filters or a rank pattern such as AKQJ.</td></tr>`;
  $("hand-table").querySelector("tbody").innerHTML = html;
  $("page-status").textContent = state.sorted.length
    ? `${count(start + 1)}–${count(Math.min(start + state.pageSize, state.sorted.length))} of ${count(state.sorted.length)} hands`
    : "0 hands";
  $("page-total").textContent = `of ${count(pages)}`;
  $("page-number").value = state.page;
  $("page-number").max = pages;
  $("previous-page").disabled = state.page === 1;
  $("next-page").disabled = state.page === pages;
}
function selectHand(id, scroll = false) {
  state.selected = id;
  state.runout = [];
  history.replaceState(
    null,
    "",
    `${location.pathname}${location.search}#hand=${id}`,
  );
  if (state.tab === "explorer") {
    renderTable();
    renderDetail();
    if (scroll && phoneLayout.matches) showHandReport();
    else if (scroll)
      $("hand-detail").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  if (state.tab === "lab") renderLive();
}
function togglePin(id) {
  if (state.pins.includes(id)) state.pins = state.pins.filter((x) => x !== id);
  else if (state.pins.length < 4) state.pins.push(id);
  else {
    toast("Pin up to four hands to compare. Unpin one first.");
    return;
  }
  $("pin-count").textContent = state.pins.length;
  if ($("pinned-only").checked) applyFilters();
  else {
    renderTable();
    renderDetail();
    renderComparison();
  }
}
function renderDetail() {
  const r = selected();
  if (!r) return;
  const inFilter = state.filtered.some((h) => h.id === r.id);
  $("hand-detail").innerHTML = `
    <div class="detail-head"><div class="detail-eyebrow"><span>HAND INSPECTOR</span><span>${inFilter ? "IN CURRENT FILTER" : "OUTSIDE CURRENT FILTER"}</span></div>
    <div class="detail-title">${cards(r.cards, true)}<button class="pin-button ${state.pins.includes(r.id) ? "pinned" : ""}" data-pin="${r.id}" aria-label="${state.pins.includes(r.id) ? "Unpin" : "Pin"} selected hand" aria-pressed="${state.pins.includes(r.id)}"><span class="desktop-only">${state.pins.includes(r.id) ? "●" : "○"}</span><span class="mobile-only">${state.pins.includes(r.id) ? "Pinned ●" : "Pin +"}</span></button></div>
    <p class="detail-subtitle">${r.pairing} · ${r.suitedness}<br>${r.combinations} combinations · ${pct(r.combinations / 270725, 4)} of all deals</p></div>
    <dl class="detail-metrics"><div><dt>MEAN DRAWS</dt><dd>${num(r.mean, 3)} <small>±${num(1.96 * r.meanSE, 3)}</small></dd></div><div><dt>EXACT NEXT BUST</dt><dd>${pct(r.firstBust, 2)}</dd></div><div><dt>10TH–90TH PERCENTILE</dt><dd>${r.p10}–${r.p90} <small>draws</small></dd></div><div><dt>STANDARD DEVIATION</dt><dd>${num(r.sd, 3)}</dd></div></dl>
    <div class="detail-histogram"><div class="detail-divider"></div><h3>Draws to bust</h3><div class="chart">${histogram(r, phoneLayout.matches ? chartOptions() : { small: true })}</div></div>
    <div class="detail-outcomes"><div class="detail-divider"></div><h3>Ranking at the first bust</h3><div class="outcome-list">${outcomes(r, true)}</div></div>
    <p class="detail-note">${count(r.trials)} simulated runouts. Mean ± approximate 95% MC interval. Outcome tooltips show 95% Wilson intervals; zero observations do not prove impossibility.</p>
    <details class="detail-draw-table"><summary>All draw probabilities & conditional risk</summary><table class="detail-table"><thead><tr><th>Draw</th><th>Bust here</th><th>Survive</th><th>Risk if reached</th></tr></thead><tbody>${r.hist.map((p, i) => `<tr><td>${i + 1}</td><td>${pct(p, 3)}</td><td>${pct(r.survival[i + 1], 3)}</td><td>${pct(r.hazard[i], 2)}</td></tr>`).join("")}</tbody></table><p class="detail-note">Survive = P(T &gt; k). Risk if reached = P(T = k | T ≥ k). All values in this table are Monte Carlo estimates.</p></details>
    <div class="detail-actions"><button class="primary" data-use-lab>Explore live outs ↗</button><button class="quiet" data-copy-hand>Copy hand link</button></div>`;
  $("reopen-hand-cards").innerHTML = cards(r.cards);
  $("reopen-hand").setAttribute(
    "aria-label",
    `Open selected hand report: ${r.name}`,
  );
}
function renderComparison() {
  $("comparison-panel").hidden = state.pins.length < 2;
  if (state.pins.length < 2) return;
  $("comparison-panel").innerHTML =
    `<h2>Pinned hand comparison</h2><p class="detail-note">Fixed hands across all filters. Estimates that differ by less than their uncertainty may be effectively tied.</p><div class="comparison-cards">${state.pins
      .map((id) => {
        const r = state.rows[id];
        return `<article class="comparison-entry"><button class="hand-button" data-hand="${id}">${cards(r.cards)}</button><div class="compare-numbers"><span>Mean <strong>${num(r.mean, 3)}</strong></span><span>95% ±${num(1.96 * r.meanSE, 3)}</span></div><div class="chart">${histogram(r, { small: true })}</div><div class="compare-numbers"><span>Survive 5 <strong>${pct(r.survive5, 2)}</strong></span><span>Next <strong>${pct(r.firstBust, 2)}</strong></span></div></article>`;
      })
      .join("")}</div>`;
}
function renderReports() {
  const s = state.stats;
  $("survival-chart").innerHTML = s
    ? lineChart(
        [
          { values: s.survival, color: "#55d7b1", label: "Filtered survival" },
          {
            values: state.allStats.survival,
            color: "#6c7b88",
            label: "All starting hands",
            dashed: true,
          },
        ],
        chartOptions(),
      )
    : emptyChart();
  $("hazard-chart").innerHTML = s
    ? lineChart(
        [
          {
            values: s.hazard,
            color: "#eeac61",
            label: "Conditional bust risk",
          },
        ],
        {
          ...chartOptions(),
          start: 1,
          xLabel: phoneLayout.matches
            ? "Draw number, if reached"
            : "Draw number, conditional on reaching it",
        },
      )
    : emptyChart();
  $("survival-chart").innerHTML +=
    '<div class="legend"><span><i class="swatch" style="background:#55d7b1"></i>Filtered population</span><span><i class="swatch" style="background:#6c7b88"></i>All hands (dashed)</span><span>Monte Carlo estimates</span></div>';
  $("joint-chart").innerHTML = histogram(s, {
    ...chartOptions(),
    stacked: true,
  });
  $("joint-legend").innerHTML = legend();
  renderTextures();
  renderHeatmap();
  requestAnimationFrame(renderScatter);
  state.reportsDirty = false;
}
function renderTextures() {
  const field = $("group-by").value,
    groups = new Map();
  state.filtered.forEach((r) => {
    const key = r[field];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });
  const entries = [...groups.entries()].map(([label, rows]) => ({
    label,
    rows,
    stats: aggregate(rows, weight()),
  }));
  entries.sort((a, b) =>
    field === "highCard"
      ? RANKS.indexOf(a.label) - RANKS.indexOf(b.label)
      : field === "connectivity"
        ? b.label - a.label
        : b.stats.mean - a.stats.mean,
  );
  if (!entries.length) {
    $("texture-chart").innerHTML = emptyChart();
    return;
  }
  $("texture-chart").innerHTML =
    `<div class="texture-row texture-head"><span>Starting texture</span><span>Mean draws · 0–8 scale</span><span>Draws</span><span>Finish ranking</span><span>Share</span></div>${entries
      .map((e) => {
        const s = e.stats,
          share = s.weight / state.stats.weight;
        return `<div class="texture-row"><button class="texture-name" data-group="${field}" data-group-value="${esc(e.label)}">${field === "connectivity" ? `${e.label} ranks in window` : field === "highCard" ? `${e.label}-high` : e.label}<small>${count(e.rows.length)} classes</small></button><span class="bar-track"><i class="bar-fill" style="width:${(s.mean / 8) * 100}%;background:#55bd99"></i></span><span class="texture-value" title="95% MC interval ±${num(s.meanSE * 1.96, 4)}">${num(s.mean, 3)}</span>${stack(s.categories)}<span class="texture-value">${pct(share, 1)}</span></div>`;
      })
      .join("")}<div class="legend">${legend()}</div>`;
}
const textureColors = {
  4: "#de7797",
  31: "#eeac61",
  22: "#5b9fea",
  211: "#a294ed",
  1111: "#55d7b1",
};
let scatterPoints = [];
function renderScatter() {
  if (state.tab !== "reports") return;
  const canvas = $("scatter"),
    rect = canvas.getBoundingClientRect(),
    dpr = window.devicePixelRatio || 1;
  if (!rect.width) return;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const w = rect.width,
    h = rect.height,
    left = 38,
    right = 12,
    top = 10,
    bottom = 35;
  ctx.font = phoneLayout.matches ? "12px system-ui" : "9px system-ui";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#9da7af";
  ctx.strokeStyle = "#30363c";
  for (let y = 0; y <= 3; y += 0.5) {
    const py = top + ((3 - y) / 3) * (h - top - bottom);
    ctx.beginPath();
    ctx.moveTo(left, py);
    ctx.lineTo(w - right, py);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(y.toFixed(1), left - 7, py + 3);
  }
  for (let x = 1; x <= 8; x++) {
    const px = left + ((x - 1) / 7) * (w - left - right);
    ctx.textAlign = "center";
    ctx.fillText(x, px, h - bottom + 15);
  }
  ctx.fillText("Mean additional draws", w / 2, h - 3);
  ctx.save();
  ctx.translate(10, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Standard deviation", 0, 0);
  ctx.restore();
  scatterPoints = state.filtered.map((r) => ({
    r,
    x: left + ((r.mean - 1) / 7) * (w - left - right),
    y: top + ((3 - r.sd) / 3) * (h - top - bottom),
  }));
  ctx.globalAlpha = 0.35;
  scatterPoints.forEach((p) => {
    ctx.fillStyle = textureColors[p.r.suitPattern];
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, 2 * Math.PI);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  if (!scatterPoints.length) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#9da7af";
    ctx.fillText("No matching hands", w / 2, h / 2);
  }
  $("scatter-legend").innerHTML = Object.entries(SUIT_LABELS)
    .map(
      ([key, label]) =>
        `<span><i class="swatch" style="background:${textureColors[key]}"></i>${label}</span>`,
    )
    .join("");
}
function nearestPoint(event) {
  const rect = $("scatter").getBoundingClientRect(),
    x = event.clientX - rect.left,
    y = event.clientY - rect.top;
  let nearest = null,
    distance = 144;
  scatterPoints.forEach((p) => {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < distance) {
      distance = d;
      nearest = p;
    }
  });
  return nearest;
}
function renderHeatmap() {
  const cells = Array.from({ length: 169 }, () => ({ sum: 0, w: 0, n: 0 }));
  for (const r of state.filtered) {
    const counts = Array(13).fill(0);
    r.cards.forEach((c) => counts[Math.floor(c / 4)]++);
    const w = weight() === "deals" ? r.combinations : 1;
    for (let a = 0; a < 13; a++)
      if (counts[a])
        for (let b = 0; b < 13; b++)
          if (counts[b] && (a !== b || counts[a] >= 2)) {
            const cell = cells[a * 13 + b];
            cell.sum += r.mean * w;
            cell.w += w;
            cell.n++;
          }
  }
  const values = cells.filter((c) => c.w).map((c) => c.sum / c.w),
    lo = Math.min(...values),
    hi = Math.max(...values);
  let html =
    "<span></span>" +
    [...RANKS].map((r) => `<span class="heatmap-label">${r}</span>`).join("");
  for (let a = 0; a < 13; a++) {
    html += `<span class="heatmap-label">${RANKS[a]}</span>`;
    for (let b = 0; b < 13; b++) {
      const c = cells[a * 13 + b],
        v = c.w ? c.sum / c.w : null,
        t = v === null ? 0 : (v - lo) / (hi - lo || 1);
      const color =
        v === null
          ? "#20262b"
          : `rgb(${Math.round(35 + t * 32)},${Math.round(54 + t * 132)},${Math.round(46 + t * 100)})`;
      html += `<button class="heatmap-cell" style="background:${color}" data-ranks="${RANKS[a]}${RANKS[b]}" ${v === null ? "disabled" : ""} title="${RANKS[a]}${RANKS[b]}: ${v === null ? "no matching hands" : `${num(v, 3)} mean draws; ${count(c.n)} classes`}" aria-label="Filter hands containing ${RANKS[a]} and ${RANKS[b]}">${v === null ? "·" : num(v, 1)}</button>`;
    }
  }
  $("rank-heatmap").innerHTML = html;
}
function renderLab() {
  renderPayout();
  renderLive();
}
function renderPayout() {
  const s = state.stats,
    target = Number($("target").value),
    edge = Math.min(50, Math.max(0, Number($("house-edge").value) || 0)) / 100;
  $("target-label").textContent = target;
  if (!s) {
    $("payout-summary").innerHTML = emptyChart();
    $("payout-chart").innerHTML = "";
    $("payout-table").innerHTML = "";
    return;
  }
  const p = targetProbability(s, target),
    fair = p > 0 ? 1 / p : null,
    payout = p > 0 ? (1 - edge) / p : null;
  const mult = (x) => (x === null ? "—" : `${num(x, x > 100 ? 1 : 3)}×`);
  $("payout-summary").innerHTML =
    `<div class="payout-stat"><span>Win probability${target <= 2 ? " · exact" : " · estimated"}</span><strong>${pct(p, 3)}</strong></div><div class="payout-stat"><span>Fair return</span><strong>${mult(fair)}</strong></div><div class="payout-stat"><span>Return at ${pct(edge, 1)} edge</span><strong>${mult(payout)}</strong></div>`;
  $("payout-chart").innerHTML = lineChart(
    [
      {
        values: Array.from({ length: 13 }, (_, k) =>
          k ? targetProbability(s, k) : 1,
        ),
        color: "#55d7b1",
        label: "Chance of surviving target",
      },
    ],
    { height: 210, ...chartOptions(), xLabel: "Target safe draws" },
  );
  $("payout-table").innerHTML =
    `<table><thead><tr><th>Safe draws</th><th>Win chance</th><th>Fair return</th><th>At ${pct(edge, 1)} edge</th></tr></thead><tbody>${Array.from(
      { length: 12 },
      (_, i) => {
        const k = i + 1,
          prob = targetProbability(s, k);
        return `<tr class="${target === k ? "target-row" : ""}"><td>${k}${k <= 2 ? " · exact" : ""}</td><td>${pct(prob, 3)}</td><td>${mult(prob ? 1 / prob : null)}</td><td>${mult(prob ? (1 - edge) / prob : null)}</td></tr>`;
      },
    ).join(
      "",
    )}</tbody></table><p class="detail-note">Targets 1–2 use exact enumeration; later targets use Monte Carlo. A displayed 0% may mean no observed wins. These fixed-target payouts assume random dealing from this population and commitment before drawing. Choosing starting hands or cashing out early changes the value.</p>`;
}
function renderLive() {
  const r = selected(),
    held = [...r.cards, ...state.runout],
    bust = bustCategory(held),
    deck = nextCards(held),
    available = deck.filter((c) => !c.held),
    danger = available.filter((c) => c.category >= 0),
    odds = danger.length / available.length;
  $("live-hand").innerHTML =
    `<span class="cards large live-cards" aria-label="All held cards, sorted by rank and suit">${[
      ...held,
    ]
      .sort((a, b) => a - b)
      .map(
        (c) =>
          `<span class="${state.runout.includes(c) ? "drawn-card" : ""}">${card(c)}</span>`,
      )
      .join("")}</span>`;
  $("live-stats").classList.toggle("busted", bust >= 0);
  $("live-stats").innerHTML =
    bust >= 0
      ? `<div><strong>Bust · ${CATEGORIES[bust]}</strong><p>Stopped on draw ${state.runout.length} · ${held.length} cards held</p></div><span class="risk">${state.runout.length}</span>`
      : `<div><strong>${danger.length} bust outs / ${available.length} cards</strong><p>${state.runout.length} safe draws so far · ${available.length - danger.length} cards keep you alive</p></div><span class="risk">${pct(odds, 2)}</span>`;
  $("draw-random").disabled = bust >= 0;
  $("undo-draw").disabled = !state.runout.length;
  // DOM order remains rank first, then spades/hearts/diamonds/clubs; the visual grid flows down each rank column.
  $("outs-grid").innerHTML = deck
    .map(
      ({ card: c, held: used, category }) =>
        `<button class="outs-card ${used ? "held" : category >= 0 ? "danger" : ""}" style="grid-column:${Math.floor(c / 4) + 1};grid-row:${(c % 4) + 1};${category >= 0 ? `--outcome:${COLORS[category]}` : ""}" data-draw="${c}" ${used || bust >= 0 ? "disabled" : ""} aria-label="Draw ${cardName(c)}: ${used ? "already held" : category >= 0 ? `bust, ${CATEGORIES[category]}` : "safe"}" title="${cardName(c)} · ${used ? "already held" : category >= 0 ? `bust: ${CATEGORIES[category]}` : "safe"}">${card(c)}</button>`,
    )
    .join("");
  const counts = Array(6).fill(0);
  danger.forEach((c) => counts[c.category]++);
  $("outs-legend").innerHTML =
    bust >= 0
      ? "<span>Undo a card or reset to explore another runout.</span>"
      : `<span>Safe: ${available.length - danger.length}</span>` +
        counts
          .map((n, i) =>
            n
              ? `<span><i class="swatch" style="background:${COLORS[i]}"></i>${CATEGORIES[i]}: ${n}</span>`
              : "",
          )
          .join("");
}
function drawCard(c) {
  if (
    ![...selected().cards, ...state.runout].includes(c) &&
    bustCategory([...selected().cards, ...state.runout]) < 0
  ) {
    state.runout.push(c);
    renderLive();
  }
}
function randomDraw() {
  const held = new Set([...selected().cards, ...state.runout]),
    remaining = Array.from({ length: 52 }, (_, c) => c).filter(
      (c) => !held.has(c),
    );
  const n = remaining.length,
    limit = Math.floor(4294967296 / n) * n,
    a = new Uint32Array(1);
  do {
    crypto.getRandomValues(a);
  } while (a[0] >= limit);
  drawCard(remaining[a[0] % n]);
}
function renderRules() {
  $("numeric-rules").innerHTML = state.numeric
    .map(
      (r) =>
        `<div class="numeric-rule" data-rule="${r.id}"><select data-rule-field="metric" aria-label="Filter metric">${numericDefs.map((c) => `<option value="${c.key}" ${c.key === r.metric ? "selected" : ""}>${c.label}${c.key.startsWith("cat") || c.key.startsWith("survive") || ["firstBust", "bustBy2"].includes(c.key) ? " (%)" : ""}</option>`).join("")}</select><select data-rule-field="op" aria-label="Comparison"><option value="gte" ${r.op === "gte" ? "selected" : ""}>≥</option><option value="lte" ${r.op === "lte" ? "selected" : ""}>≤</option><option value="eq" ${r.op === "eq" ? "selected" : ""}>=</option></select><input data-rule-field="value" type="number" step="any" value="${esc(r.value)}" placeholder="Value" aria-label="Filter value"><button data-remove-rule="${r.id}" aria-label="Remove metric filter">×</button></div>`,
    )
    .join("");
}
function renderColumns() {
  $("column-choices").innerHTML = columnDefs
    .map(
      (c) =>
        `<label><input type="checkbox" data-column="${c.key}" ${state.columns.includes(c.key) ? "checked" : ""}>${c.label}</label>`,
    )
    .join("");
}
function renderMethod() {
  const d = state.data;
  $("method-content").innerHTML =
    `<h3>One deck. Four starting cards. Best five wins—and busts.</h3><p>Deal four distinct cards from a standard 52-card deck. Draw uniformly from the remaining cards without replacement. After each draw, evaluate the best five-card poker hand among <strong>all cards held</strong>. Stop at the first straight, flush, full house, four of a kind, or straight flush. Aces play high or low in A2345; wraparound straights do not count.</p><p>The four starting cards do not themselves trigger a bust. A starting four-of-a-kind therefore busts on the first draw. Royal flushes are displayed separately from other straight flushes. When several categories are present, record only the highest; probabilities sum to 100%.</p>
  <h3>What a draw number means</h3><p><strong>T</strong> is the number of additional cards drawn <strong>including the bust card</strong>. Safe draws = T − 1. Total cards at bust = T + 4. Surviving k draws means T &gt; k. Conditional risk on draw k means P(T = k | T ≥ k). After 13 additional draws, 17 cards guarantee at least five in one suit, so every runout must have busted.</p>
  <h3>The complete starting-hand universe</h3><p>Exhaustive enumeration of C(52,4) = <strong>270,725</strong> deals produces exactly <strong>16,432</strong> classes under all 24 suit relabelings. Each representative maximizes the number of spades, then hearts, diamonds, clubs. Ties assign higher-rank suit masks first. Cards are then sorted A, K, Q, J, T, 9…2, subsorted ♠ ♥ ♦ ♣. Rank identities are preserved.</p><p><strong>Actual deal frequency</strong> weights each class by its orbit size (combinations). <strong>Equal hand classes</strong> assigns each class the same weight, answering a different question. Filtered aggregates renormalize within the selected population; quantiles come from the pooled distribution, never averaged row quantiles. The rank-pair heatmap has overlapping groups and its cells must not be summed.</p>
  <h3>Simulation and exact checks</h3><p><strong>${count(d.trialsPerHand)} independent runouts per class</strong>, ${count(d.totalTrials)} total. SplitMix64 produces independent deterministic per-class streams from base seed <code>${d.seed}</code>; rejection sampling removes modulo bias and rejects already-held cards. Generation is reproducible regardless of thread scheduling.</p><p>First-draw probabilities enumerate all 48 remaining cards. Bust-by-two probabilities enumerate all 1,128 unordered pairs. Because a straight-or-better hand cannot disappear when cards are added, the two-card endpoint gives exact P(T ≤ 2). Histograms, finishing categories, moments and later survival probabilities use simulation. These estimates can differ slightly from the exact early probabilities.</p>
  <h3>Precision and rare outcomes</h3><p>Mean intervals are approximate 95% Monte Carlo intervals, ±1.96 standard errors. For deal-weighted aggregates, independent per-class mean variances are multiplied by squared normalized weights. A selected hand’s outcome tooltips use 95% Wilson intervals. At ${count(d.trialsPerHand)} trials, worst-case per-hand probability error is about ±${num(((1.96 * 0.5) / Math.sqrt(d.trialsPerHand)) * 100, 3)} percentage points (95%). This describes sampling uncertainty, not the variability of actual runouts.</p><p>Zero observations do not prove zero probability. Rare events need more samples for small relative errors. Sorting thousands of estimates can overstate differences between near-tied hands. Conditional risk in the far tail has fewer observations; a dash means the condition was not observed. The fixed-target payout model does not include strategic hand selection, cash-out decisions, or rounded payout schedules.</p>
  <h3>Reproducibility</h3><p>Generated ${new Date(d.generatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC. The C++ generator, documented schema, raw counts and validation tests are included with this page. The evaluator is checked against every five-card combination and suit canonicalization against every class under every suit permutation.</p><div class="method-links"><a href="./data/hands.json" download>Raw simulation counts ↓</a><a href="./simulation/generate.cpp">Generator source ↗</a><a href="./README.md">Data & regeneration guide ↗</a><a href="https://help.gtowizard.com/aggregate-reports-guide/" target="_blank" rel="noopener">GTO Wizard design reference ↗</a></div>`;
}
function resetFilters() {
  for (const id of ["search", "pairing", "suits", "high", "connected"])
    $(id).value = "";
  $("pinned-only").checked = false;
  state.numeric = [];
  renderRules();
  applyFilters();
}

function wireEvents() {
  $("filter-toggle").addEventListener("click", () => {
    setFiltersOpen($("filter-toggle").getAttribute("aria-expanded") !== "true");
  });
  $("filter-apply").addEventListener("click", () => {
    setFiltersOpen(false);
    $("filter-toggle").focus({ preventScroll: true });
  });
  $("reopen-hand").addEventListener("click", showHandReport);
  $("hand-dialog").addEventListener("close", () => {
    if (phoneLayout.matches && state.tab === "explorer") {
      const hand = document.querySelector(
        `#hand-table [data-hand="${state.selected}"]`,
      );
      (hand || $("reopen-hand")).focus({ preventScroll: true });
    }
  });
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) =>
      b.addEventListener("click", () => changeTab(b.dataset.tab)),
    );
  for (const id of [
    "pairing",
    "suits",
    "high",
    "connected",
    "weighting",
    "pinned-only",
  ])
    $(id).addEventListener("change", applyFilters);
  let searchTimer;
  $("search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, 120);
  });
  $("reset-filters").addEventListener("click", resetFilters);
  $("add-rule").addEventListener("click", () => {
    state.numeric.push({
      id: state.nextRuleId++,
      metric: "mean",
      op: "gte",
      value: "",
    });
    renderRules();
  });
  $("numeric-rules").addEventListener("input", (e) => {
    const el = e.target;
    if (!el.dataset.ruleField) return;
    const r = state.numeric.find(
      (r) => r.id === Number(el.closest("[data-rule]").dataset.rule),
    );
    r[el.dataset.ruleField] = el.value;
    applyFilters();
  });
  $("numeric-rules").addEventListener("click", (e) => {
    const el = e.target.closest("[data-remove-rule]");
    if (!el) return;
    state.numeric = state.numeric.filter(
      (r) => r.id !== Number(el.dataset.removeRule),
    );
    renderRules();
    applyFilters();
  });
  $("hand-table").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sort]");
    if (!b) return;
    const key = b.dataset.sort,
      existing = state.sort.find((s) => s.key === key),
      direction = existing ? -existing.direction : key === "hand" ? 1 : -1;
    state.sort = e.shiftKey
      ? existing
        ? state.sort.map((s) => (s.key === key ? { key, direction } : s))
        : [...state.sort, { key, direction }]
      : [{ key, direction }];
    state.page = 1;
    sortRows();
    renderTable();
  });
  document.addEventListener("click", async (e) => {
    const pin = e.target.closest("[data-pin]");
    if (pin) {
      togglePin(Number(pin.dataset.pin));
      return;
    }
    const hand = e.target.closest("[data-hand]");
    if (hand) {
      selectHand(Number(hand.dataset.hand), window.innerWidth < 850);
      return;
    }
    const row = e.target.closest("#hand-table [data-row]");
    if (row && phoneLayout.matches) {
      selectHand(Number(row.dataset.row), true);
      return;
    }
    const draw = e.target.closest("[data-draw]");
    if (draw) {
      drawCard(Number(draw.dataset.draw));
      return;
    }
    if (e.target.closest("[data-use-lab]")) {
      changeTab("lab");
      $("hand-dialog").close();
      $("lab-view").scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    if (e.target.closest("[data-copy-hand]")) {
      try {
        await navigator.clipboard.writeText(
          `${location.origin}${location.pathname}#hand=${state.selected}`,
        );
        toast("Hand link copied.");
      } catch {
        toast("Select and copy the URL in your browser.");
      }
      return;
    }
    const close = e.target.closest("[data-close]");
    if (close) $(close.dataset.close).close();
    const group = e.target.closest("[data-group]");
    if (group) {
      const f = group.dataset.group,
        v = group.dataset.groupValue;
      if (f === "suitedness")
        $("suits").value = Object.keys(SUIT_LABELS).find(
          (k) => SUIT_LABELS[k] === v,
        );
      else
        $(
          f === "pairing" ? "pairing" : f === "highCard" ? "high" : "connected",
        ).value = v;
      applyFilters();
    }
    const ranks = e.target.closest("[data-ranks]");
    if (ranks) {
      $("search").value = ranks.dataset.ranks;
      applyFilters();
    }
  });
  $("previous-page").addEventListener("click", () => {
    state.page--;
    renderTable();
  });
  $("next-page").addEventListener("click", () => {
    state.page++;
    renderTable();
  });
  $("page-number").addEventListener("change", () => {
    state.page = Math.max(1, Math.floor(Number($("page-number").value) || 1));
    renderTable();
  });
  $("page-size").addEventListener("change", () => {
    state.pageSizeChosen = true;
    state.pageSize = Number($("page-size").value);
    state.page = 1;
    renderTable();
  });
  $("column-preset").addEventListener("change", () => {
    state.columnsChosen = true;
    state.columns = [...presets[$("column-preset").value]];
    renderTable();
  });
  $("columns-button").addEventListener("click", () => {
    renderColumns();
    $("columns-dialog").showModal();
  });
  $("column-choices").addEventListener("change", (e) => {
    const key = e.target.dataset.column;
    if (!key) return;
    state.columnsChosen = true;
    if (e.target.checked) state.columns.push(key);
    else state.columns = state.columns.filter((k) => k !== key);
    $("column-preset").value = "custom";
    renderTable();
  });
  for (const id of ["method-button", "footer-method"])
    $(id).addEventListener("click", () => $("method-dialog").showModal());
  document.querySelectorAll("dialog").forEach((d) =>
    d.addEventListener("click", (e) => {
      if (e.target === d) {
        const r = d.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          d.close();
      }
    }),
  );
  $("export-button").addEventListener("click", () => {
    const blob = new Blob([csvForRows(state.sorted)], {
        type: "text/csv;charset=utf-8;",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `dodge-${state.sorted.length}-hands.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast(`Exported ${count(state.sorted.length)} hands and all metrics.`);
  });
  $("group-by").addEventListener("change", renderTextures);
  for (const id of ["target", "house-edge"])
    $(id).addEventListener("input", renderPayout);
  $("draw-random").addEventListener("click", randomDraw);
  $("undo-draw").addEventListener("click", () => {
    state.runout.pop();
    renderLive();
  });
  $("reset-runout").addEventListener("click", () => {
    state.runout = [];
    renderLive();
  });
  $("scatter").addEventListener("mousemove", (e) => {
    const p = nearestPoint(e),
      tip = $("scatter-tooltip");
    tip.hidden = !p;
    if (!p) return;
    tip.innerHTML = `${cards(p.r.cards)}<p>${num(p.r.mean, 3)} mean · ${num(p.r.sd, 3)} SD</p>`;
    const rect = $("scatter").getBoundingClientRect();
    tip.style.left = `${Math.min(rect.width - 170, p.x + 24)}px`;
    tip.style.top = `${Math.max(0, p.y - 65)}px`;
  });
  $("scatter").addEventListener(
    "mouseleave",
    () => ($("scatter-tooltip").hidden = true),
  );
  $("scatter").addEventListener("click", (e) => {
    const p = nearestPoint(e);
    if (p) {
      selectHand(p.r.id);
      changeTab("explorer");
      if (phoneLayout.matches) showHandReport();
      else
        $("hand-detail").scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
    }
  });
  let resizeTimer;
  let viewportWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    if (viewportWidth === window.innerWidth) return;
    viewportWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      syncResponsiveLayout();
      renderActive();
    }, 120);
  });
  window.addEventListener("hashchange", () => {
    const id = Number(new URLSearchParams(location.hash.slice(1)).get("hand"));
    if (Number.isInteger(id) && state.rows[id])
      selectHand(id, phoneLayout.matches);
  });
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "/" &&
      !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)
    ) {
      e.preventDefault();
      $("search").focus();
    }
  });
}
async function init() {
  try {
    const response = await fetch("./data/hands.json");
    if (!response.ok)
      throw new Error(`Dataset request returned HTTP ${response.status}.`);
    state.data = await response.json();
    state.rows = decodeData(state.data);
    const comboCount = state.rows.reduce((n, r) => n + r.combinations, 0);
    if (comboCount !== 270725)
      throw new Error("Incomplete starting-hand coverage.");
    PAIRINGS.forEach((p) => $("pairing").add(new Option(p, p)));
    Object.entries(SUIT_LABELS).forEach(([v, label]) =>
      $("suits").add(new Option(label, v)),
    );
    [...RANKS].forEach((r) => $("high").add(new Option(r, r)));
    const hash = new URLSearchParams(location.hash.slice(1)),
      id = hash.has("hand") ? Number(hash.get("hand")) : NaN;
    state.selected =
      Number.isInteger(id) && state.rows[id]
        ? id
        : state.rows.find((r) => r.name === "As Kh 8d 3c").id;
    $("dataset-status").textContent =
      `${compact(state.data.totalTrials)} simulated runouts`;
    $("footer-provenance").textContent =
      `${count(state.data.trialsPerHand)} runouts / class · ${count(state.data.classCount)} classes · ${count(state.data.dealCount)} deals · Seed ${state.data.seed}`;
    renderMethod();
    wireEvents();
    syncResponsiveLayout();
    $("loading").hidden = true;
    $("app").hidden = false;
    applyFilters();
  } catch (error) {
    console.error(error);
    $("loading").hidden = true;
    $("load-error").hidden = false;
    $("load-error").textContent =
      `The simulation data could not be loaded. ${error.message} Serve this page over HTTP and reload.`;
    $("dataset-status").textContent = "Dataset unavailable";
  }
}
init();
