import { createPlay } from "./play.js";
import { payoutDivisor } from "./engine.mjs";
import {
  plainSumRule,
  describeSumRule,
  sumPayoutGroups,
  SUM_FAMILIES,
} from "./sum-rules.mjs";
import {
  DEFAULTS,
  MODES,
  outcomes,
  sortDisplayed,
  FEATURED,
  weights,
  integer,
  evNumerator,
  solveFinal,
  normalizeOptions,
  filterReasons,
  metrics,
} from "./engine.mjs";

const $ = (id) => document.getElementById(id);
const form = $("filters");
let n = 4,
  mode = "chosen",
  tableSort = { key: "rank", direction: "asc" },
  rows = [],
  selected = null,
  worker = null,
  timer = 0,
  pendingRepair = null,
  customGame = null;
let handStrict = true,
  sumStrict = false;
let browseScrollTop = 0;
let activeOptions = { ...DEFAULTS };
const play = createPlay({
  onBusy(busy) {
    document
      .querySelectorAll("button[data-n], button[data-mode]")
      .forEach((el) => (el.disabled = busy));
    $("play-selected").disabled = busy || !selected;
    $("play-inspected").disabled = busy || !selected;
    const customButton = $("play-custom");
    if (customButton) customButton.disabled = busy;
  },
  onBrowse() {
    setView("explore");
  },
});
function setView(view) {
  if (view === "play" && !play.hasGame) {
    if (!selected || !useSelected(false)) return;
  }
  const wasInExplore = $("explore-workspace").contains(document.activeElement);
  const wasInPlay = $("play-workspace").contains(document.activeElement);
  const previousView = document.documentElement.dataset.view;
  if (view === "analysis" && previousView === "explore")
    browseScrollTop = $("results-scroll").scrollTop;
  document.documentElement.dataset.view = view;
  $("explore-workspace").hidden = view === "play";
  $("play-workspace").hidden = view !== "play";
  document.querySelectorAll("[data-view]").forEach((el) => {
    if (el.tagName === "BUTTON")
      el.setAttribute("aria-pressed", String(el.dataset.view === view));
  });
  if (view === "play" && wasInExplore)
    $("roll-button").focus({ preventScroll: true });
  if (view === "explore" && wasInPlay)
    $("results-title").focus({ preventScroll: true });
  if (view === "explore" && previousView === "analysis") {
    $("results-scroll").scrollTop = browseScrollTop;
    const index = rows.findIndex(
      (row) => row.payouts.join() === selected?.payouts.join(),
    );
    const button = document.querySelector(
      `#results-body [data-index="${index}"] .rank-button`,
    );
    (button || $("results-title")).focus({ preventScroll: true });
  }
}
$("back-to-schedules").addEventListener("click", () => setView("explore"));
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    document.documentElement.dataset.view === "analysis" &&
    !document.querySelector("dialog[open]")
  ) {
    event.preventDefault();
    setView("explore");
  }
});
function selectionState() {
  $("selection-name").textContent = selected
    ? selected.title
    : "Select a schedule";
  $("play-selected").disabled = $("play-inspected").disabled =
    !selected || play.busy;
}
function useSelected(switchView = true) {
  if (!selected || play.busy) return false;
  const choices = rows.map((row) => ({
    payouts: row.payouts,
    rule: row.rule,
    title: `Rank ${String(row.rank).padStart(2, "0")}`,
  }));
  const success = play.choose(
    { n, mode, payouts: selected.payouts, rule: selected.rule },
    selected.title,
    choices,
  );
  if (success && switchView) setView("play");
  return success;
}
$("play-selected").addEventListener("click", () => useSelected());
$("play-inspected").addEventListener("click", () => useSelected());
document
  .querySelectorAll("button[data-view]")
  .forEach((button) =>
    button.addEventListener("click", () => setView(button.dataset.view)),
  );
document
  .querySelectorAll("[data-open]")
  .forEach((button) =>
    button.addEventListener("click", () => $(button.dataset.open).showModal()),
  );
document
  .querySelectorAll("[data-close]")
  .forEach((button) =>
    button.addEventListener("click", () => $(button.dataset.close).close()),
  );
setView("explore");
matchMedia("(max-width: 760px)").addEventListener("change", (event) => {
  if (!event.matches && document.documentElement.dataset.view === "analysis")
    setView("explore");
});

const signed = (v) => `${v > 0 ? "+" : ""}${v}`;
const tone = (v) => (v < 0 ? "negative" : v > 0 ? "positive" : "neutral");
const pct = (a, b) => `${((100 * a) / b).toFixed(a / b < 0.001 ? 4 : 2)}%`;
const count = (v) => v.toLocaleString("en-US");
function decimal(numerator, denominator, places = 6) {
  const scale = 10n ** BigInt(places),
    negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute * scale * 2n + denominator) / (2n * denominator);
  return `${negative && absolute ? "−" : ""}${rounded / scale}.${String(rounded % scale).padStart(places, "0")}`;
}
function options() {
  const values = new FormData(form);
  return normalizeOptions({
    n,
    mode,
    minP0: Number(values.get("minP0")),
    maxP0: Number(values.get("maxP0")),
    maxPayout: Number(values.get("maxPayout")),
    limit: Number(values.get("limit")),
    strict: values.has("strict"),
    allowZero: values.has("allowZero"),
    sort: $("ranking").value,
    sumFamily: values.get("sumFamily") || "all",
  });
}
function distribution() {
  const categories = outcomes(n, mode),
    total = 6 ** n;
  document.documentElement.dataset.mode = mode;
  document.querySelector('[data-n="1"]').hidden = mode !== "sum";
  $("loss-label").textContent =
    mode === "sum" ? "Worst payout" : "Initial payout";
  $("strict-label").textContent =
    mode === "sum" ? "Nondecreasing payouts" : "Strictly increasing";
  $("sum-family-label").hidden = $("sum-search-note").hidden = mode !== "sum";
  document
    .querySelectorAll(".sum-only")
    .forEach((el) => (el.hidden = mode !== "sum"));
  document
    .querySelectorAll(
      "#coverage-dialog .coverage-note > p:not(.sum-only), .ranking-note > details",
    )
    .forEach((el) => (el.hidden = mode === "sum"));
  $("bounds-hint").textContent =
    mode === "sum"
      ? "Loss bounds apply to the worst payout anywhere in the table. Payouts can repeat; zero is a push. Only primitive, exactly fair schedules are included."
      : "All payouts stay between the minimum p[0] and maximum payout. Negative = loss; zero = push. Scaled copies are excluded; schedules use their smallest integer scale.";
  document.querySelector('#ranking option[value="lowest-loss"]').textContent =
    mode === "sum" ? "Lowest worst loss" : "Lowest initial loss";
  $("distribution").style.setProperty(
    "--count",
    categories.length > 7 ? 6 : categories.length,
  );
  $("distribution").innerHTML = categories
    .map(
      (row) =>
        `<div class="outcome" title="${row.detail}"><div class="outcome-header"><b>${row.label}</b></div><span class="outcome-number">${pct(row.weight, total)}</span><span class="outcome-fraction">${count(row.weight)} / ${count(total)}</span><div class="probability-track" aria-hidden="true"><div class="probability-fill" style="--prob:${(100 * row.weight) / total}%"></div></div></div>`,
    )
    .join("");
  document
    .querySelectorAll("[data-n]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(Number(button.dataset.n) === n),
      ),
    );
  document.querySelectorAll("[data-mode]").forEach((button) => {
    if (button.tagName === "BUTTON")
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  });
  $("mode-description").textContent = {
    chosen: "Choose one face before rolling. Rank by how many dice match it.",
    sum: "Add every pip. Repeated ranges, stair steps, and recurring bonuses · exactly fair.",
    single:
      "No chosen face. Rank by the largest matching group; smaller sets do not affect the hand.",
    full:
      n === 6
        ? "Trips / boat and 3 pair / quads share payouts. A boat is a triple + pair + single."
        : n === 4
          ? "Score the complete hand. Trips rank before the rarer 2 pair; quads pay last."
          : "No chosen face. Score the complete hand pattern.",
  }[mode];
  $("initial-category").textContent =
    mode === "sum" ? "any total" : categories[0].label;
  $("weights-caption").textContent =
    `${MODES[mode]}: exact weights in ${mode === "sum" ? "total" : "hand-rank"} order`;
  $("all-weights").innerHTML = (
    mode === "sum" ? [1, 2, 3, 4, 5, 6] : [2, 3, 4, 5, 6]
  )
    .map(
      (dice) =>
        `<tr><th scope="row">${dice}</th><td>${weights(dice, mode).join(", ")}<small>${outcomes(
          dice,
          mode,
        )
          .map((row) => row.label)
          .join(" / ")}</small></td><td>${6 ** dice}</td></tr>`,
    )
    .join("");
}
function columns() {
  if (mode === "sum")
    return [
      { key: "rank", name: "Rank" },
      { key: "ruleEase", name: "Payout rule", sub: "sort by rule ease" },
      { key: "loss", name: "Max loss" },
      { key: "max", name: "Max payout" },
      { key: "stdev", name: "Std dev", sub: "net units / roll" },
      { key: "simplicity", name: "Simplicity", sub: "amounts / 100" },
      { key: "recommended", name: "Score", sub: "recommended / 100" },
    ];
  return [
    { key: "rank", name: "Rank" },
    ...outcomes(n, mode).map((row, k) => ({
      key: `payout:${k}`,
      name: mode === "chosen" ? row.short : row.label,
      sub: mode === "chosen" ? (k === 1 ? "match" : "matches") : "net units",
      payout: true,
    })),
    { key: "max", name: "Max payout" },
    { key: "range", name: "Range" },
    { key: "stdev", name: "Std dev", sub: "net units / roll" },
    { key: "simplicity", name: "Simplicity", sub: "factors / 100" },
    { key: "largestJump", name: "Largest jump" },
    { key: "smoothness", name: "Smoothness", sub: "higher = smoother" },
    { key: "steepness", name: "Steepness", sub: "higher = later" },
    { key: "recommended", name: "Score", sub: "recommended / 100" },
  ];
}
function header() {
  const focusedKey = document.activeElement?.closest(
    "#results-head [data-sort]",
  )?.dataset.sort;
  $("results-head").innerHTML = `<tr>${columns()
    .map((c) => {
      const active = tableSort.key === c.key,
        next =
          active && tableSort.direction === "asc" ? "descending" : "ascending";
      return `<th scope="col" class="${c.payout ? "payout-head" : ""}" aria-sort="${active ? (tableSort.direction === "asc" ? "ascending" : "descending") : "none"}"><button data-sort="${c.key}" aria-label="Sort ${c.payout ? outcomes(n, mode)[Number(c.key.slice(7))].label : c.name} ${next}">${c.name} <span aria-hidden="true">${active ? (tableSort.direction === "asc" ? "↑" : "↓") : "↕"}</span></button>${c.sub ? `<small>${c.sub}</small>` : ""}</th>`;
    })
    .join("")}</tr>`;
  if (focusedKey)
    $("results-head")
      .querySelector(`[data-sort="${focusedKey}"]`)
      ?.focus({ preventScroll: true });
}
function renderRows() {
  const focusedIndex = document.activeElement?.closest(
    "#results-body [data-index]",
  )?.dataset.index;
  $("results-body").innerHTML = sortDisplayed(
    rows,
    tableSort.key,
    tableSort.direction,
  )
    .map((row) =>
      mode === "sum"
        ? `<tr data-index="${row.index}" class="${selected && row.payouts.join() === selected.payouts.join() ? "selected" : ""}"><td class="rank-cell"><button class="rank-button" aria-label="Inspect schedule ${row.rank}" aria-pressed="${Boolean(selected && row.payouts.join() === selected.payouts.join())}">${String(row.rank).padStart(2, "0")}</button></td><td class="sum-rule-cell"><strong>${SUM_FAMILIES[row.rule.family]}</strong><span>${describeSumRule(row.rule)}</span></td><td class="negative">−${row.metrics.loss}</td><td class="positive">${signed(row.metrics.max)}</td><td class="stdev-cell">${row.metrics.stdev.toFixed(2)}</td><td class="simplicity-cell">${row.metrics.simplicity.toFixed(1)}</td><td>${row.metrics.recommended.toFixed(1)}</td></tr>`
        : `<tr data-index="${row.index}" class="${selected && row.payouts.join() === selected.payouts.join() ? "selected" : ""}"><td class="rank-cell"><button class="rank-button" aria-label="Inspect schedule ${row.rank}: ${row.payouts.map(signed).join(", ")}" aria-pressed="${Boolean(selected && row.payouts.join() === selected.payouts.join())}">${String(row.rank).padStart(2, "0")}</button></td>${row.payouts.map((v) => `<td class="payout ${tone(v)}">${signed(v)}</td>`).join("")}<td>${row.metrics.max}</td><td>${row.metrics.range}</td><td class="stdev-cell">${row.metrics.stdev.toFixed(2)}</td><td class="simplicity-cell">${row.metrics.simplicity.toFixed(1)}</td><td>${row.metrics.largestJump}</td><td>${row.metrics.smoothness.toFixed(1)}</td><td>${row.metrics.steepness.toFixed(1)}</td><td>${row.metrics.recommended.toFixed(1)}</td></tr>`,
    )
    .join("");
  if (focusedIndex !== undefined)
    $("results-body")
      .querySelector(`[data-index="${focusedIndex}"] button`)
      ?.focus({ preventScroll: true });
}
function feature() {
  const p = mode === "chosen" ? FEATURED[n] : null;
  const pass = p && filterReasons(p, activeOptions).length === 0;
  $("featured").hidden = !pass;
  if (pass)
    $("featured").innerHTML =
      `<div><p class="feature-name">${n === 4 ? "Favorite 4-Dice Schedule" : "Featured 3-Dice Schedule"} · unranked reference</p><p class="feature-payouts">${p.map((v) => `<span class="${tone(v)}">${signed(v)}</span>`).join("")}</p></div><button id="inspect-feature">Inspect <span aria-hidden="true">↗</span></button>`;
  return pass ? p : null;
}
function chart(values, label, units) {
  const categories = outcomes(n, mode);
  const min = Math.min(0, ...values),
    max = Math.max(0, ...values),
    range = max - min || 1;
  const width = Math.max(304, values.length * (mode === "sum" ? 14 : 44)),
    plot = 115,
    top = 28,
    xstep = width / values.length;
  const baseline = top + (max / range) * plot;
  return `<div class="chart-scroll" role="region" tabindex="0" aria-label="${label}, scroll for more categories"><svg class="payout-chart" style="min-width:${width + 16}px" viewBox="0 0 ${width + 16} 176" role="img" aria-label="${label}"><title>${label}: ${values.map((v, k) => `${categories[k].label}, ${signed(Number(v.toFixed(5)))} ${units}`).join("; ")}</title><line x1="8" x2="${width + 8}" y1="${baseline}" y2="${baseline}" stroke="#454b55" />${values
    .map((v, k) => {
      const x = 8 + k * xstep + xstep * 0.22,
        y = top + ((max - Math.max(0, v)) / range) * plot;
      const h = Math.max(v === 0 ? 0 : 1, (Math.abs(v) / range) * plot),
        textY = v < 0 ? y + h + 13 : y - 7;
      return `<rect x="${x}" y="${y}" width="${xstep * 0.56}" height="${h}" rx="2" fill="${v < 0 ? "#f0a29a" : "#e9c46b"}"/><text x="${x + xstep * 0.28}" y="${textY}" text-anchor="middle" style="fill:${v < 0 ? "#f0a29a" : "#e9c46b"}">${mode === "sum" && values.length > 11 ? "" : Math.abs(v) >= 1000 ? signed(Number((v / 1000).toFixed(1))) + "k" : signed(Number(v.toFixed(3)))}</text><text x="${x + xstep * 0.28}" y="170" text-anchor="middle">${mode === "sum" && values.length > 11 && k !== 0 && k !== values.length - 1 && (n + k) % 5 !== 0 ? "" : categories[k].key === "quads-pair" ? "4+2" : categories[k].short}</text>`;
    })
    .join("")}</svg></div>`;
}
function contributionTable(dice, payouts, visual = false, scoringMode = mode) {
  const categories = outcomes(dice, scoringMode),
    w = weights(dice, scoringMode),
    total = 6 ** dice,
    products = payouts.map((v, k) => integer(v) * BigInt(w[k]));
  const max = products.reduce((s, v) => {
    const a = v < 0n ? -v : v;
    return a > s ? a : s;
  }, 1n);
  return `<table class="contributions"><caption class="sr-only">Outcome probabilities and expected contribution per play, in net units</caption><thead><tr><th scope="col">${scoringMode === "chosen" ? "Matches" : scoringMode === "sum" ? "Total" : "Hand"}</th><th scope="col">Probability</th><th scope="col">EV contribution</th></tr></thead><tbody>${products.map((v, k) => `<tr><td>${scoringMode === "chosen" ? k : categories[k].label}</td><td>${w[k]} / ${total}<small>${pct(w[k], total)}</small></td><td class="${tone(v)}">${visual ? `<span class="contribution-bar" aria-hidden="true" style="--bar:${Number(((v < 0n ? -v : v) * 24n) / max)}px"></span>` : ""}${v} / ${total}<small>≈ ${decimal(v, BigInt(total))} units</small></td></tr>`).join("")}</tbody></table>`;
}
function inspect(p, title = "Selected schedule", shouldScroll = false) {
  const source = rows.find((row) => row.payouts.join() === p.join());
  const rule = mode === "sum" ? source?.rule || plainSumRule(n, p) : null;
  selected = {
    payouts: p,
    metrics: source?.metrics || metrics(n, p, mode, rule),
    title,
    rule,
  };
  selectionState();
  const m = selected.metrics,
    total = 6 ** n,
    w = weights(n, mode),
    categories = outcomes(n, mode);
  const expression = w.map((v, k) => `${v}(${p[k]})`).join(" + ");
  $("analysis").innerHTML = `<h2 class="analysis-title">${title}</h2>${
    mode === "sum"
      ? `<p class="sum-rule-detail"><strong>${SUM_FAMILIES[rule.family]}</strong>${describeSumRule(rule)}</p><div class="sum-paytable">${sumPayoutGroups(
          n,
          p,
        )
          .map(
            (group) =>
              `<div><span>${group.label}<small>${pct(group.weight, total)}</small></span><strong class="${tone(group.payout)}">${signed(group.payout)}</strong></div>`,
          )
          .join("")}</div>`
      : `<div class="schedule-strip">${p.map((v, k) => `<div class="schedule-value"><span class="${tone(v)}">${signed(v)}</span><small>${categories[k].label}</small></div>`).join("")}</div>`
  }<div class="proof-badge"><span>Expected value / play</span><strong>0 <small>EXACT</small></strong></div><div class="chart-head"><h3>Payout curve</h3><span>NET UNITS · ${mode === "sum" ? "TOTAL" : "HAND RANK"} →</span></div>${chart(p, "Payout by outcome", "units")}<dl class="metric-grid"><div><dt>Win anything</dt><dd>${pct(m.winWeight, total)}</dd><small>${m.winWeight} / ${total}</small></div><div><dt>${categories.at(-1).label}</dt><dd>${pct(w.at(-1), total)}</dd><small>${w.at(-1)} / ${total}</small></div><div><dt>Maximum / range</dt><dd>${signed(m.max)} / ${m.range}</dd></div><div><dt>Largest jump</dt><dd>${m.largestJump}</dd></div><div><dt>Std dev / roll</dt><dd id="inspector-stdev">${m.stdev.toFixed(2)} units</dd><small>Variance ${m.variance.toFixed(2)} units²</small></div><div><dt>Simplicity / 100</dt><dd id="inspector-simplicity">${m.simplicity.toFixed(1)}</dd><small>Amounts ${m.amountSimplicity.toFixed(1)} / 100<br />${m.sharedFactor ? `${m.sharedCount} of ${m.nonzeroCount} nonzero payouts share ${m.sharedFactor}` : "No shared factor above 1"}${m.primePayoutCount ? `<br />${m.primePayoutCount} prime payout${m.primePayoutCount > 1 ? "s" : ""} &gt; 5: ×${m.primeMultiplier.toPrecision(3)}` : ""}${m.unlistedPayoutCount ? `<br />${m.unlistedPayoutCount} amount${m.unlistedPayoutCount > 1 ? "s" : ""} outside preferred list: ×${m.unlistedMultiplier.toPrecision(3)} to Simplicity and Recommended` : ""}</small></div><div><dt>${mode === "sum" ? "Worst loss" : "Starting loss"} / 100</dt><dd id="inspector-starting-loss">${m.startingLossPreference.toFixed(1)}</dd><small>${(0.3 * m.startingLossPreference).toFixed(1)} of 30 points before any unlisted-amount penalty</small></div>${mode === "sum" ? `<div><dt>Rule ease / 100</dt><dd>${m.ruleEase.toFixed(1)}</dd></div>` : ""}<div><dt>Smoothness / 100</dt><dd>${m.smoothness.toFixed(1)}</dd></div><div><dt>Steepness / 100</dt><dd>${m.steepness.toFixed(1)}</dd></div></dl><p class="jumps">Adjacent jumps<br /><span>${m.jumps.map(signed).join(" → ")}</span></p><div class="ev-proof"><h3>The exact balance</h3><p class="formula">[${expression}] / ${total}</p><p class="ev-total">= ${evNumerator(n, p, mode)} / ${total} = 0</p><div class="chart-head"><h3>Expected contribution</h3><span>NET UNITS / PLAY</span></div>${chart(
    p.map((v, k) => (v * w[k]) / total),
    "Expected contribution by outcome",
    "units per play",
  )}${contributionTable(n, p, true)}</div>`;
  renderRows();
  if (shouldScroll && matchMedia("(max-width: 760px)").matches) {
    setView("analysis");
    $("inspector").scrollTop = 0;
    $("inspector").focus({ preventScroll: true });
  }
}
function failSearch(message) {
  worker?.terminate();
  worker = null;
  $("search-status").textContent = message;
  $("results-table").setAttribute("aria-busy", "false");
  $("empty-state").hidden = false;
  $("empty-state").textContent = "Adjust the filters and try again.";
}
function search() {
  clearTimeout(timer);
  worker?.terminate();
  worker = null;
  if (!form.checkValidity()) {
    $("filter-error").textContent =
      "Enter whole numbers within the bounds shown in each field.";
    clearResults();
    failSearch("Filters need attention.");
    return;
  }
  try {
    activeOptions = options();
  } catch (error) {
    $("filter-error").textContent = error.message;
    clearResults();
    failSearch("Filters need attention.");
    return;
  }
  $("filter-error").textContent = "";
  tableSort = { key: "rank", direction: "asc" };
  $("table-sort-status").textContent =
    "Headers sort the displayed shortlist. Rank by selects which schedules are shown.";
  distribution();
  header();
  const featured = feature();
  rows = [];
  selected = null;
  selectionState();
  renderRows();
  if (featured)
    inspect(
      featured,
      n === 4 ? "Favorite 4-Dice Schedule" : "Featured 3-Dice Schedule",
    );
  else
    $("analysis").innerHTML =
      '<p class="hint">Finding fair schedules for these filters…</p>';
  $("search-status").textContent = "Searching with exact integer bounds…";
  $("results-table").setAttribute("aria-busy", "true");
  $("empty-state").hidden = true;
  if ($("checker-dialog").open) checkCustom();
  try {
    worker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") {
        $("search-status").textContent =
          `${count(data.found)} fair schedules found · searching…`;
        return;
      }
      if (data.type === "error") {
        failSearch(data.message);
        return;
      }
      rows = data.rows.map((row, index) => ({
        ...row,
        index,
        rank: index + 1,
      }));
      $("results-table").setAttribute("aria-busy", "false");
      $("search-status").textContent =
        `${data.complete ? (data.scope === "sum-rules" ? "Complete search · rule catalogue" : "Complete search · within bounds") : "Partial search · limit reached"} · ${count(data.found)} fair schedules · ${rows.length} ${data.grouped ? (mode === "sum" ? "rule representatives" : "curve representatives") : "results"} shown${data.complete ? "" : " · best of explored candidates"}`;
      $("search-status").title =
        `${count(data.nodes)} candidate nodes in ${data.elapsedMs} ms. ${data.scope === "sum-rules" ? "A finite catalogue of simple rules, not every possible sum payout table." : data.complete ? "All schedules inside the configured bounds with an allowed starting loss were explored." : "Narrow the payout or initial-loss bounds for an exhaustive search."}`;
      $("empty-state").hidden = rows.length > 0;
      $("empty-state").textContent = data.complete
        ? "No fair schedules satisfy these filters. Try a larger maximum payout, allow zeros, or widen the initial payout range."
        : "No fair schedules found before the search limit. Narrow the bounds to explore them completely.";
      if (!selected && rows.length) inspect(rows[0].payouts, "Rank 01");
      else if (!selected)
        $("analysis").innerHTML =
          '<p class="hint">No schedule selected. Adjust your filters or open the custom checker.</p>';
      renderRows();
      worker?.terminate();
      worker = null;
    };
    worker.onerror = () =>
      failSearch(
        "The search worker could not load. Reload the page to try again.",
      );
    worker.postMessage({ options: activeOptions });
  } catch {
    failSearch(
      "This browser could not start the search worker. The custom checker is still available.",
    );
  }
}
function clearResults() {
  rows = [];
  selected = null;
  selectionState();
  renderRows();
  $("featured").hidden = true;
  $("analysis").innerHTML =
    '<p class="hint">Correct the filters to generate schedules.</p>';
}
function scheduleSearch() {
  worker?.terminate();
  worker = null;
  $("search-status").textContent = "Filters changed · updating…";
  clearTimeout(timer);
  timer = setTimeout(search, 250);
}
form.addEventListener("input", scheduleSearch);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  search();
});
$("ranking").addEventListener("change", search);
$("reset-filters").addEventListener("click", () => {
  form.reset();
  $("strict").checked = mode !== "sum";
  handStrict = true;
  sumStrict = false;
  $("ranking").value = DEFAULTS.sort;
  search();
});
document.querySelectorAll("[data-n]").forEach((button) =>
  button.addEventListener("click", () => {
    n = Number(button.dataset.n);
    search();
  }),
);
$("results-body").addEventListener("click", (event) => {
  const row = event.target.closest("[data-index]");
  if (row) {
    const i = Number(row.dataset.index);
    inspect(rows[i].payouts, `Rank ${String(i + 1).padStart(2, "0")}`, true);
  }
});
$("results-head").addEventListener("click", (event) => {
  const button = event.target.closest("[data-sort]");
  if (button) {
    const key = button.dataset.sort;
    tableSort = {
      key,
      direction:
        tableSort.key === key && tableSort.direction === "asc" ? "desc" : "asc",
    };
    header();
    renderRows();
    $("table-sort-status").textContent =
      `Displayed shortlist sorted by ${columns().find((c) => c.key === key).name}, ${tableSort.direction === "asc" ? "ascending" : "descending"}. Rank by determines which schedules enter the shortlist.`;
  }
});
$("featured").addEventListener("click", (event) => {
  if (event.target.closest("button"))
    inspect(
      FEATURED[n],
      n === 4 ? "Favorite 4-Dice Schedule" : "Featured 3-Dice Schedule",
      true,
    );
});
function customOptions(dice, scoringMode) {
  return { ...options(), n: dice, mode: scoringMode };
}
function checkCustom() {
  pendingRepair = null;
  customGame = null;
  const sumMode = $("checker-mode").value === "sum";
  document.querySelector('#checker-n option[value="1"]').disabled = !sumMode;
  if (!sumMode && $("checker-n").value === "1") $("checker-n").value = "2";
  const dice = Number($("checker-n").value),
    total = BigInt(6 ** dice),
    scoringMode = $("checker-mode").value,
    categories = outcomes(dice, scoringMode);
  $("checker-order").textContent =
    `Payout order: ${categories.map((row) => row.label).join(" → ")}.`;
  try {
    const p = $("checker-payouts")
      .value.split(",")
      .map((v) => integer(v.trim()));
    const numerator = evNumerator(dice, p, scoringMode),
      fair = numerator === 0n,
      required = solveFinal(dice, p.slice(0, -1), scoringMode);
    const repaired = [...p.slice(0, -1), required];
    let filterText;
    try {
      const reasons = filterReasons(
        fair ? p : repaired,
        customOptions(dice, scoringMode),
      );
      filterText = reasons.length
        ? `Outside current filters: ${reasons.join(" ")}`
        : "Satisfies all current reasonable filters.";
    } catch {
      filterText =
        "Correct the search filters to check whether this schedule satisfies them.";
    }
    const stake =
      scoringMode === "sum" ? p.reduce((a, b) => (a < b ? a : b)) : p[0];
    const edge =
      stake < 0n
        ? `${numerator === 0n ? "Player / house edge" : numerator > 0n ? "Player edge" : "House edge"} ≈ ${decimal((numerator < 0n ? -numerator : numerator) * 100n, total * -stake, 6)}%`
        : "Stake-based edge: undefined (p[0] is not negative).";
    $("checker-result").innerHTML =
      `<div class="checker-status ${fair ? "" : "unfair"}"><h3>${fair ? "Exactly fair · zero EV" : "Not zero EV"}</h3><p>Exact numerator: ${numerator}<br />EV = ${numerator} / ${total}${fair ? " = 0" : ` ≈ ${decimal(numerator, total)}`} units / play<br />${edge}</p></div>${contributionTable(dice, p, false, scoringMode)}${!fair ? `<div class="repair"><p>Keep the first ${categories.length - 1} payouts. For exactly zero EV, the payout for ${categories.at(-1).label} must be <strong>${signed(required)}</strong>.</p><p class="hint">${filterText}</p><button id="apply-repair">Use ${signed(required)} as final payout</button></div>` : `<p class="hint" style="margin-top:16px">${filterText}</p>`}`;
    if (!fair) pendingRepair = repaired;
    if (
      fair &&
      p.every(
        (v) =>
          v >= BigInt(Number.MIN_SAFE_INTEGER) &&
          v <= BigInt(Number.MAX_SAFE_INTEGER),
      ) &&
      payoutDivisor(p) <= 1n
    ) {
      customGame = { n: dice, mode: scoringMode, payouts: p.map(Number) };
      const button = document.createElement("button");
      button.id = "play-custom";
      button.className = "primary-button";
      button.textContent = "Play this custom schedule ↗";
      button.disabled = play.busy;
      $("checker-result").append(button);
    }
  } catch (error) {
    $("checker-result").innerHTML = "";
    const p = document.createElement("p");
    p.className = "error";
    p.textContent = error.message;
    $("checker-result").append(p);
  }
}
$("open-checker").addEventListener("click", () => {
  $("checker-n").value = String(n);
  $("checker-mode").value = mode;
  $("checker-payouts").value = (
    selected?.payouts ||
    (mode === "chosen" ? FEATURED[n] : null) ||
    outcomes(n, mode).map((row, k, all) =>
      k === 0 ? -1 : k === all.length - 1 ? all[0].weight / row.weight : 0,
    )
  ).join(", ");
  checkCustom();
  $("checker-dialog").showModal();
});
$("close-checker").addEventListener("click", () => $("checker-dialog").close());
$("checker-payouts").addEventListener("input", checkCustom);
$("checker-n").addEventListener("change", checkCustom);
$("checker-mode").addEventListener("change", checkCustom);
$("checker-result").addEventListener("click", (event) => {
  if (event.target.closest("#play-custom") && customGame && !play.busy) {
    play.choose(customGame, "Custom schedule");
    $("checker-dialog").close();
    setView("play");
  }
  if (event.target.closest("#apply-repair") && pendingRepair) {
    $("checker-payouts").value = pendingRepair.join(", ");
    checkCustom();
  }
});
document.querySelectorAll("button[data-mode]").forEach((button) =>
  button.addEventListener("click", () => {
    if (mode === "sum") sumStrict = $("strict").checked;
    else handStrict = $("strict").checked;
    mode = button.dataset.mode;
    if (mode !== "sum" && n === 1) n = 2;
    $("strict").checked = mode === "sum" ? sumStrict : handStrict;
    search();
  }),
);
search();
