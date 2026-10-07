import {
  DEFAULTS,
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
  rows = [],
  selected = null,
  worker = null,
  timer = 0,
  pendingRepair = null;
let activeOptions = { ...DEFAULTS };
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
    minP0: Number(values.get("minP0")),
    maxP0: Number(values.get("maxP0")),
    maxPayout: Number(values.get("maxPayout")),
    limit: Number(values.get("limit")),
    strict: values.has("strict"),
    allowZero: values.has("allowZero"),
    sort: $("ranking").value,
  });
}
function distribution() {
  const w = weights(n),
    total = 6 ** n;
  $("distribution").style.setProperty("--count", n + 1);
  $("distribution").innerHTML = w
    .map(
      (v, k) =>
        `<div class="outcome"><div class="outcome-header"><b>${k} ${k === 1 ? "match" : "matches"}</b>${k === n ? "<span>ALL</span>" : ""}</div><span class="outcome-number">${pct(v, total)}</span><span class="outcome-fraction">${count(v)} / ${count(total)}</span><div class="probability-track" aria-hidden="true"><div class="probability-fill" style="--prob:${(100 * v) / total}%"></div></div></div>`,
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
}
function header() {
  const columns = [
    { name: "Max payout", sort: "lowest-max", dir: "ascending" },
    { name: "Largest jump", sort: "largest-jump", dir: "ascending" },
    {
      name: "Smoothness",
      sort: "smoothest",
      dir: "descending",
      sub: "higher = smoother",
    },
    {
      name: "Steepness",
      sort: "steepest",
      dir: "descending",
      sub: "higher = later",
    },
  ];
  $("results-head").innerHTML = `<tr><th scope="col">Rank</th>${weights(n)
    .map(
      (_, k) =>
        `<th scope="col" class="payout-head">${k}<small>${k === 1 ? "match" : "matches"}</small></th>`,
    )
    .join(
      "",
    )}${columns.map((c) => `<th scope="col"${activeOptions.sort === c.sort ? ` aria-sort="${c.dir}"` : ""}><button data-sort="${c.sort}" title="Rank by ${c.name.toLowerCase()}">${c.name}${activeOptions.sort === c.sort ? (c.dir === "ascending" ? " ↑" : " ↓") : ""}</button>${c.sub ? `<small>${c.sub}</small>` : ""}</th>`).join("")}</tr>`;
}
function renderRows() {
  const focusedIndex = document.activeElement?.closest(
    "#results-body [data-index]",
  )?.dataset.index;
  $("results-body").innerHTML = rows
    .map(
      (row, i) =>
        `<tr data-index="${i}" class="${selected && row.payouts.join() === selected.payouts.join() ? "selected" : ""}"><td class="rank-cell"><button class="rank-button" aria-label="Inspect schedule ${i + 1}: ${row.payouts.map(signed).join(", ")}" aria-pressed="${Boolean(selected && row.payouts.join() === selected.payouts.join())}">${String(i + 1).padStart(2, "0")}</button></td>${row.payouts.map((v) => `<td class="payout ${tone(v)}">${signed(v)}</td>`).join("")}<td>${row.metrics.max}</td><td>${row.metrics.largestJump}</td><td>${row.metrics.smoothness.toFixed(1)}</td><td>${row.metrics.steepness.toFixed(1)}</td></tr>`,
    )
    .join("");
  if (focusedIndex !== undefined)
    $("results-body")
      .querySelector(`[data-index="${focusedIndex}"] button`)
      ?.focus({ preventScroll: true });
}
function feature() {
  const p = FEATURED[n];
  const pass = p && filterReasons(p, activeOptions).length === 0;
  $("featured").hidden = !pass;
  if (pass)
    $("featured").innerHTML =
      `<div><p class="feature-name">${n === 4 ? "Favorite 4-Dice Schedule" : "Featured 3-Dice Schedule"} · unranked reference</p><p class="feature-payouts">${p.map((v) => `<span class="${tone(v)}">${signed(v)}</span>`).join("")}</p></div><button id="inspect-feature">Inspect <span aria-hidden="true">↗</span></button>`;
  return pass ? p : null;
}
function chart(values, label, units) {
  const min = Math.min(0, ...values),
    max = Math.max(0, ...values),
    range = max - min || 1;
  const width = 304,
    plot = 115,
    top = 28,
    xstep = width / values.length;
  const baseline = top + (max / range) * plot;
  return `<svg class="payout-chart" viewBox="0 0 320 176" role="img" aria-label="${label}"><title>${label}: ${values.map((v, k) => `${k} matches, ${signed(Number(v.toFixed(5)))} ${units}`).join("; ")}</title><line x1="8" x2="312" y1="${baseline}" y2="${baseline}" stroke="#454b55" />${values
    .map((v, k) => {
      const x = 8 + k * xstep + xstep * 0.22,
        y = top + ((max - Math.max(0, v)) / range) * plot;
      const h = Math.max(v === 0 ? 0 : 1, (Math.abs(v) / range) * plot),
        textY = v < 0 ? y + h + 13 : y - 7;
      return `<rect x="${x}" y="${y}" width="${xstep * 0.56}" height="${h}" rx="2" fill="${v < 0 ? "#f0a29a" : "#e9c46b"}"/><text x="${x + xstep * 0.28}" y="${textY}" text-anchor="middle" style="fill:${v < 0 ? "#f0a29a" : "#e9c46b"}">${Math.abs(v) >= 1000 ? signed(Number((v / 1000).toFixed(1))) + "k" : signed(Number(v.toFixed(3)))}</text><text x="${x + xstep * 0.28}" y="170" text-anchor="middle">${k}</text>`;
    })
    .join("")}</svg>`;
}
function contributionTable(dice, payouts, visual = false) {
  const w = weights(dice),
    total = 6 ** dice,
    products = payouts.map((v, k) => integer(v) * BigInt(w[k]));
  const max = products.reduce((s, v) => {
    const a = v < 0n ? -v : v;
    return a > s ? a : s;
  }, 1n);
  return `<table class="contributions"><caption class="sr-only">Outcome probabilities and expected contribution per play, in net units</caption><thead><tr><th scope="col">Matches</th><th scope="col">Probability</th><th scope="col">EV contribution</th></tr></thead><tbody>${products.map((v, k) => `<tr><td>${k}</td><td>${w[k]} / ${total}<small>${pct(w[k], total)}</small></td><td class="${tone(v)}">${visual ? `<span class="contribution-bar" aria-hidden="true" style="--bar:${Number(((v < 0n ? -v : v) * 24n) / max)}px"></span>` : ""}${v} / ${total}<small>≈ ${decimal(v, BigInt(total))} units</small></td></tr>`).join("")}</tbody></table>`;
}
function inspect(p, title = "Selected schedule", shouldScroll = false) {
  selected = { payouts: p, metrics: metrics(n, p) };
  const m = selected.metrics,
    total = 6 ** n,
    w = weights(n);
  const expression = w.map((v, k) => `${v}(${p[k]})`).join(" + ");
  $("analysis").innerHTML =
    `<h2 class="analysis-title">${title}</h2><div class="schedule-strip">${p.map((v, k) => `<div class="schedule-value"><span class="${tone(v)}">${signed(v)}</span><small>${k} ${k === 1 ? "match" : "matches"}</small></div>`).join("")}</div><div class="proof-badge"><span>Expected value / play</span><strong>0 <small>EXACT</small></strong></div><div class="chart-head"><h3>Payout curve</h3><span>NET UNITS · MATCH COUNT →</span></div>${chart(p, "Payout versus number of matches", "units")}<dl class="metric-grid"><div><dt>Win anything</dt><dd>${pct(m.winWeight, total)}</dd><small>${m.winWeight} / ${total}</small></div><div><dt>All ${n} match</dt><dd>${pct(1, total)}</dd><small>1 / ${total}</small></div><div><dt>Maximum / range</dt><dd>${signed(m.max)} / ${m.range}</dd></div><div><dt>Largest jump</dt><dd>${m.largestJump}</dd></div><div><dt>Smoothness / 100</dt><dd>${m.smoothness.toFixed(1)}</dd></div><div><dt>Steepness / 100</dt><dd>${m.steepness.toFixed(1)}</dd></div></dl><p class="jumps">Adjacent jumps<br /><span>${m.jumps.map(signed).join(" → ")}</span></p><div class="ev-proof"><h3>The exact balance</h3><p class="formula">[${expression}] / ${total}</p><p class="ev-total">= ${evNumerator(n, p)} / ${total} = 0</p><div class="chart-head"><h3>Expected contribution</h3><span>NET UNITS / PLAY</span></div>${chart(
      p.map((v, k) => (v * w[k]) / total),
      "Expected contribution by match count",
      "units per play",
    )}${contributionTable(n, p, true)}</div>`;
  renderRows();
  if (shouldScroll && matchMedia("(max-width: 980px)").matches) {
    $("inspector").scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
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
  distribution();
  header();
  const featured = feature();
  rows = [];
  selected = null;
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
      rows = data.rows;
      $("results-table").setAttribute("aria-busy", "false");
      $("search-status").textContent =
        `${data.complete ? "Complete search" : "Partial search · limit reached"} · ${count(data.found)} fair schedules · ${rows.length} ${data.grouped ? "distinct curves" : "results"} shown${data.complete ? "" : " · best of explored candidates"}`;
      $("search-status").title =
        `${count(data.nodes)} candidate nodes in ${data.elapsedMs} ms. ${data.complete ? "All schedules inside the configured bounds were explored." : "Narrow the payout or initial-loss bounds for an exhaustive search."}`;
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
    $("ranking").value = button.dataset.sort;
    search();
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
function customOptions(dice) {
  return { ...options(), n: dice };
}
function checkCustom() {
  pendingRepair = null;
  const dice = Number($("checker-n").value),
    total = BigInt(6 ** dice);
  try {
    const p = $("checker-payouts")
      .value.split(",")
      .map((v) => integer(v.trim()));
    const numerator = evNumerator(dice, p),
      fair = numerator === 0n,
      required = solveFinal(dice, p.slice(0, -1));
    const repaired = [...p.slice(0, -1), required];
    let filterText;
    try {
      const reasons = filterReasons(fair ? p : repaired, customOptions(dice));
      filterText = reasons.length
        ? `Outside current filters: ${reasons.join(" ")}`
        : "Satisfies all current reasonable filters.";
    } catch {
      filterText =
        "Correct the search filters to check whether this schedule satisfies them.";
    }
    const edge =
      p[0] < 0n
        ? `${numerator === 0n ? "Player / house edge" : numerator > 0n ? "Player edge" : "House edge"} ≈ ${decimal((numerator < 0n ? -numerator : numerator) * 100n, total * -p[0], 6)}%`
        : "Stake-based edge: undefined (p[0] is not negative).";
    $("checker-result").innerHTML =
      `<div class="checker-status ${fair ? "" : "unfair"}"><h3>${fair ? "Exactly fair · zero EV" : "Not zero EV"}</h3><p>Exact numerator: ${numerator}<br />EV = ${numerator} / ${total}${fair ? " = 0" : ` ≈ ${decimal(numerator, total)}`} units / play<br />${edge}</p></div>${contributionTable(dice, p)}${!fair ? `<div class="repair"><p>Keep the first ${dice} payouts. For exactly zero EV, the ${dice}-match payout must be <strong>${signed(required)}</strong>.</p><p class="hint">${filterText}</p><button id="apply-repair">Use ${signed(required)} as final payout</button></div>` : `<p class="hint" style="margin-top:16px">${filterText}</p>`}`;
    if (!fair) pendingRepair = repaired;
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
  $("checker-payouts").value = (
    selected?.payouts ||
    FEATURED[n] ||
    Array.from({ length: n + 1 }, (_, k) => 6 * k - n)
  ).join(", ");
  checkCustom();
  $("checker-dialog").showModal();
});
$("close-checker").addEventListener("click", () => $("checker-dialog").close());
$("checker-payouts").addEventListener("input", checkCustom);
$("checker-n").addEventListener("change", checkCustom);
$("checker-result").addEventListener("click", (event) => {
  if (event.target.closest("#apply-repair") && pendingRepair) {
    $("checker-payouts").value = pendingRepair.join(", ");
    checkCustom();
  }
});
$("all-weights").innerHTML = [2, 3, 4, 5, 6]
  .map(
    (dice) =>
      `<tr><th scope="row">${dice}</th><td>${weights(dice).join(", ")}</td><td>${6 ** dice}</td></tr>`,
  )
  .join("");
if (matchMedia("(max-width: 640px)").matches)
  $("filters-disclosure").open = false;
search();
