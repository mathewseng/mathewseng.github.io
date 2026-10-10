import {
  SCORE_RULES,
  FEATURED_MATCHUPS,
  scoreRule,
  scoreDistribution,
  compareRules,
  conditionalRolls,
  handicapSeries,
  matchupCatalogue,
  twoDiceEvents,
  fourDiceEvents,
  marginDistribution,
  ruleAgreement,
  fraction,
} from "./matchups.mjs";

const pct = (count, total = 1296) => `${((100 * count) / total).toFixed(2)}%`;
const signed = (value) =>
  value > 0 ? `+${value}` : String(value).replace("-", "−");
const exact = (count, total = 1296) =>
  `${count.toLocaleString("en-US")} / ${total.toLocaleString("en-US")} = ${fraction(count, total)}`;
const swatch = (name, label) =>
  `<span class="match-legend-item"><i class="match-${name}"></i>${label}</span>`;
function outcomeBar(result, label = "") {
  return `<div class="match-outcome-bar" role="img" aria-label="${label} A wins ${pct(result.wins, result.total)}, ties ${pct(result.ties, result.total)}, B wins ${pct(result.losses, result.total)}">
    ${["wins", "ties", "losses"].map((key) => `<span class="match-${key}" style="width:${(100 * result[key]) / result.total}%"></span>`).join("")}
  </div>`;
}
function tableRows(rows) {
  return rows
    .map(
      (row) => `<tr>
    <th scope="row"><button class="match-pick" data-match-a="${row.a}" data-match-b="${row.b}">${scoreRule(row.a).name} <span>vs</span> ${scoreRule(row.b).name}</button>${row.note ? `<small>${row.note}</small>` : ""}</th>
    <td class="match-number match-win-text" title="${exact(row.wins)}">${pct(row.wins)}</td>
    <td class="match-number" title="${exact(row.ties)}">${pct(row.ties)}</td>
    <td class="match-number match-loss-text" title="${exact(row.losses)}">${pct(row.losses)}</td>
    <td class="match-bar-cell">${outcomeBar(row)}</td>
  </tr>`,
    )
    .join("");
}
function comparisonTable(id, rows, caption) {
  return `<div class="match-table-wrap" tabindex="0" role="region" aria-label="${caption}"><table class="match-table">
    <caption class="sr-only">${caption}. Each side rolls its own two dice; no added handicap. Select a matchup for exact counts.</caption>
    <thead><tr><th scope="col">A vs B</th><th scope="col">A wins</th><th scope="col">Tie</th><th scope="col">B wins</th><th scope="col" class="match-bar-cell">Outcome balance</th></tr></thead>
    <tbody id="${id}">${tableRows(rows)}</tbody></table></div>`;
}

export function createMatchups(root) {
  const catalogue = matchupCatalogue();
  const featured = FEATURED_MATCHUPS.map(([a, b, note]) => ({
    a,
    b,
    note,
    ...compareRules(a, b),
  }));
  const events = twoDiceEvents();
  const fourEvents = fourDiceEvents();
  const options = SCORE_RULES.map(
    (rule) => `<option value="${rule.id}">${rule.name}</option>`,
  ).join("");
  root.innerHTML = `
    <div class="match-shell">
      <header class="match-heading">
        <div><p class="eyebrow">EXACT TWO-DICE PROBABILITIES</p><h2 id="match-title" tabindex="-1">Two dice against two dice</h2>
        <p class="hint">Four independent fair d6. Higher score wins; equal scores tie. Every one of the 1,296 ordered outcomes counts equally.</p></div>
        <span class="exact-tag">36 × 36 OUTCOMES</span>
      </header>
      <nav class="match-tabs" aria-label="Probability reports">
        <button data-match-tab="compare" aria-pressed="true">Compare rules</button>
        <button data-match-tab="catalogue" aria-pressed="false">All ${catalogue.length.toLocaleString("en-US")} matchups</button>
        <button data-match-tab="events" aria-pressed="false">Two-dice odds</button>
        <button data-match-tab="four" aria-pressed="false">Four-dice odds</button>
      </nav>
      <section data-match-panel="compare" aria-label="Compare scoring rules">
        <div class="match-section-head"><span class="hint">${SCORE_RULES.length} scoring rules · choose different rules for A and B</span><button id="match-jump-featured" class="match-text-button">Browse ${featured.length} featured matchups ↓</button></div>
        <div class="match-controls">
          <label>Side A<select id="match-a">${options}</select><small id="match-a-formula"></small></label>
          <button id="match-swap" class="quiet-button" aria-label="Swap sides and reverse the handicap">⇄ <span>Swap</span></button>
          <label>Side B<select id="match-b">${options}</select><small id="match-b-formula"></small></label>
          <label class="match-handicap-label">Add to A’s score<input id="match-handicap" type="number" min="-36" max="36" step="0.5" value="0" aria-describedby="match-handicap-help" /><small id="match-handicap-help">−36 to +36, in half-points</small></label>
          <button id="match-reset" class="quiet-button">Reset</button>
        </div>
        <p id="match-error" class="error" role="alert" hidden></p>
        <div class="match-result" id="match-result" aria-live="polite"></div>
        <div class="match-chart-pair">
          <section class="match-chart-section"><div class="match-section-head"><h3>Score distributions</h3><span class="hint">Same score axis · probability per roll</span></div>
            <div class="match-legend">${swatch("wins", "A, including handicap")}${swatch("losses", "B")}</div>
            <div id="match-distribution"></div><p id="match-distribution-note" class="hint"></p>
            <details class="match-details"><summary>Exact score probabilities</summary><div id="match-distribution-table" class="match-table-wrap"></div></details>
          </section>
          <section class="match-chart-section"><div class="match-section-head"><h3>What a head start changes</h3><span class="hint">Points added to A</span></div>
            <div class="match-legend">${swatch("wins", "A wins")}${swatch("ties", "Tie")}${swatch("losses", "B wins")}</div>
            <div id="match-handicap-chart"></div>
            <label class="match-slider-label" for="match-handicap-slider">Adjust A’s handicap <output id="match-handicap-value">0</output></label>
            <input id="match-handicap-slider" type="range" min="-12" max="12" step="0.5" value="0" />
            <p id="match-handicap-note" class="hint"></p>
            <button id="match-balance" class="match-text-button">Use closest balance</button>
            <details class="match-details"><summary>Exact handicap probabilities</summary><div id="match-handicap-table" class="match-table-wrap"></div></details>
          </section>
        </div>
        <section class="match-margin-section">
          <div class="match-section-head"><div><h3>How much does A win or lose by?</h3><p class="hint">A’s score minus B’s, including the selected handicap. Negative margins are losses; zero is a tie.</p></div></div>
          <div class="match-chart-pair">
            <div><div class="match-legend">${swatch("losses", "A loses")}${swatch("ties", "Tie")}${swatch("wins", "A wins")}</div><div id="match-margin-chart"></div><p id="match-margin-note" class="hint"></p></div>
            <div><div id="match-margin-thresholds" class="match-table-wrap"></div><p class="hint">“By ≥” includes the boundary. All probabilities are per contest, including contests that tie.</p></div>
          </div>
          <details class="match-details"><summary>Every exact score margin</summary><div id="match-margin-table" class="match-table-wrap"></div></details>
        </section>
        <div class="match-roll-section">
          <div><p class="eyebrow">AFTER A ROLLS</p><h3>How strong is your roll?</h3><p class="hint">Each cell shows A’s chance of beating B’s 36 possible rolls. Rows are A’s first die; columns are A’s second die. Select a cell for ties and exact counts.</p>
          <p id="match-roll-detail" class="match-roll-detail" role="status"></p>
          <div class="match-heat-legend"><span>0% wins</span><i></i><span>100% wins</span></div></div>
          <div id="match-roll-grid" class="match-roll-grid"></div>
        </div>
        <section class="match-featured" id="match-featured"><div class="match-section-head"><div><p class="eyebrow">START EXPLORING</p><h3 tabindex="-1" id="match-featured-title">${featured.length} interesting matchups</h3></div><span class="hint">First seven: the essentials · no added handicap</span></div>
          ${comparisonTable("match-featured-body", featured, "Interesting two-dice matchups")}
        </section>
      </section>
      <section data-match-panel="catalogue" aria-label="All scoring rule matchups" hidden>
        <div class="match-section-head"><div><h3>The matchup map</h3><p class="hint">A is the row, B is the column. Select a cell to inspect its win, tie, and loss probabilities. No added handicap.</p></div></div>
        <div class="match-map-controls"><label>Cell probability<select id="match-matrix-metric"><option value="wins">A wins</option><option value="ties">Tie</option><option value="losses">B wins</option></select></label><label>Rules in map<select id="match-matrix-scope"><option value="core">12 core rules</option><option value="all">All ${SCORE_RULES.length} rules</option></select></label><div class="match-heat-legend"><span>0%</span><i></i><span>100%</span></div></div>
        <div id="match-matrix" class="match-matrix-wrap" tabindex="0" role="region" aria-label="Matchup probability matrix, scroll for all rules"></div>
        <div class="match-catalogue-controls">
          <label>Find a rule<input id="match-search" type="search" placeholder="e.g. sum, max, product" /></label>
          <label>Show<select id="match-filter"><option value="all">All matchups</option><option value="balanced">Balanced (win/loss gap ≤ 5 points)</option><option value="ties">Frequent ties (≥ 15%)</option><option value="favorites">A favored (&gt; 50% wins)</option><option value="underdogs">A underdog (&lt; 25% wins)</option></select></label>
          <label>Sort by<select id="match-sort"><option value="rules">Rule order</option><option value="wins">A wins, high to low</option><option value="ties">Ties, high to low</option><option value="balance">Most balanced</option></select></label>
          <button id="match-download" class="quiet-button">Download all CSV</button>
        </div>
        <p id="match-catalogue-status" class="hint" role="status"></p>
        ${comparisonTable("match-catalogue-body", catalogue, "All two-dice scoring rule matchups")}
      </section>
      <section data-match-panel="four" aria-label="Four-dice event probabilities" hidden>
        <div class="match-section-head"><div><h3>One contest, two ways to score</h3><p class="hint">A and B each roll two dice. First, both players use rule X; then both use rule Y on the same rolls. Does changing the rule change the winner?</p></div></div>
        <div class="match-agreement-layout">
          <div><div class="match-map-controls"><label>Rule X (rows)<select id="match-agreement-x">${options}</select></label><label>Rule Y (columns)<select id="match-agreement-y">${options}</select></label></div><div id="match-agreement-summary" class="match-agreement-summary" aria-live="polite"></div><p class="hint">Each cell is a joint probability out of 1,296 contests. A tie becoming a win or loss is counted separately from a winner flipping.</p></div>
          <div><div id="match-agreement-grid" class="match-table-wrap"></div><div class="match-legend">${swatch("wins", "Same result")}${swatch("ties", "Tie changes")}${swatch("losses", "Winner flips")}</div></div>
        </div>
        <div class="match-events-toolbar"><label>Find a four-dice event<input id="match-four-search" type="search" placeholder="e.g. shared, doubles, sum, product" /></label><span id="match-four-status" class="hint" role="status"></span></div>
        <p class="hint">A = (a, b), B = (c, d). These overlapping events always use the original die faces, without a handicap.</p>
        <div id="match-four-events"></div>
      </section>
      <section data-match-panel="events" aria-label="Single pair event probabilities" hidden>
        <div class="match-section-head"><div><h3>One pair, 36 equally likely rolls</h3><p class="hint">These events describe a single pair of dice. Events can overlap; their probabilities are not meant to sum to 100%.</p></div></div>
        <div class="match-event-intro"><div><p class="eyebrow">SUM DISTRIBUTION</p><div id="match-sum-chart"></div></div><div><h3>The middle is more likely</h3><p>A seven has six ways to happen. A two or twelve has only one. An unordered pair such as 2 and 5 has two ordered outcomes; doubles have one.</p><p>“At least one 6” is 11/36, while “exactly one 6” is 10/36. Double six belongs only to the first event.</p><p class="hint">All rules assume fair six-sided dice and independent rolls. Percentages are rounded; counts and fractions are exact.</p></div></div>
        <div class="match-events-toolbar"><label>Find an event<input id="match-event-search" type="search" placeholder="e.g. doubles, prime, sum" /></label><span id="match-event-status" class="hint" role="status"></span></div>
        <div id="match-events"></div>
      </section>
      <footer class="match-method"><strong>Exact enumeration.</strong> Each side independently rolls (a, b) from {1,…,6}². We compare all 36 × 36 pairs after applying the rules and adding A’s handicap. A win means strictly greater; ties are separate. Average keeps half-points. Modulo is the remainder, so sum mod 10 turns 10, 11, 12 into 0, 1, 2. No rerolls or tie breakers. “Win if ties reroll” conditions on a decisive outcome. The catalogue covers every ordered pairing of the ${SCORE_RULES.length} listed rules, not every possible dice game.</footer>
    </div>`;
  const $ = (id) => root.querySelector(`#${id}`);
  let a = "sum",
    b = "sum",
    handicap = 0,
    selectedRoll = 20;

  function panel(name) {
    root
      .querySelectorAll("[data-match-tab]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.matchTab === name),
        ),
      );
    root
      .querySelectorAll("[data-match-panel]")
      .forEach(
        (section) => (section.hidden = section.dataset.matchPanel !== name),
      );
  }
  function render(syncHandicapInput = true) {
    const result = compareRules(a, b, handicap),
      decisive = result.wins + result.losses;
    $("match-a").value = a;
    $("match-b").value = b;
    if (syncHandicapInput) {
      $("match-handicap").value = handicap;
      $("match-error").hidden = true;
    }
    // The numeric field offers a wider range than the chart's −12…+12 window.
    $("match-handicap-slider").value = Math.max(-12, Math.min(12, handicap));
    $("match-handicap-value").textContent = signed(handicap);
    $("match-a-formula").textContent = scoreRule(a).formula;
    $("match-b-formula").textContent = scoreRule(b).formula;
    $("match-result").innerHTML =
      `<div class="match-result-heading"><h3>${scoreRule(a).name}${handicap ? ` ${signed(handicap)}` : ""} <span>vs</span> ${scoreRule(b).name}</h3><span class="hint">A’s perspective</span></div>
      <div class="match-metrics">${[
        ["wins", "A wins"],
        ["ties", "Tie"],
        ["losses", "B wins"],
      ]
        .map(
          ([key, label]) =>
            `<div><span>${label}</span><strong class="match-${key}-value">${pct(result[key])}</strong><small>${exact(result[key])}</small></div>`,
        )
        .join("")}</div>
      ${outcomeBar(result)}
      <p class="match-result-note"><span>Win if ties reroll: <strong>${decisive ? pct(result.wins, decisive) : "undefined (always ties)"}</strong></span><span>Win/loss edge: <strong>${signed(Number(((100 * (result.wins - result.losses)) / result.total).toFixed(2)))} percentage points</strong></span></p>`;
    renderDistribution();
    renderHandicaps();
    renderMargins();
    renderRolls();
  }
  function renderDistribution() {
    const left = scoreDistribution(a, handicap),
      right = scoreDistribution(b);
    $("match-distribution").innerHTML = distributionChart(
      left,
      right,
      "Score distributions for A and B",
    );
    const summary = (rows) =>
      `${rows[0].score}–${rows.at(-1).score}; mean ${(rows.reduce((sum, row) => sum + row.score * row.count, 0) / 36).toFixed(2)}`;
    $("match-distribution-note").textContent =
      `A range ${summary(left)}. B range ${summary(right)}. Each distribution totals 36 rolls.`;
    const leftMap = new Map(left.map((row) => [row.score, row.count])),
      rightMap = new Map(right.map((row) => [row.score, row.count]));
    $("match-distribution-table").innerHTML =
      `<table class="match-table"><caption class="sr-only">Exact probability of each score, out of 36 rolls per side</caption><thead><tr><th>Score</th><th>A probability</th><th>B probability</th></tr></thead><tbody>${[
        ...new Set([...leftMap.keys(), ...rightMap.keys()]),
      ]
        .sort((x, y) => x - y)
        .map(
          (value) =>
            `<tr><th scope="row">${value}</th><td>${exact(leftMap.get(value) || 0, 36)} · ${pct(leftMap.get(value) || 0, 36)}</td><td>${exact(rightMap.get(value) || 0, 36)} · ${pct(rightMap.get(value) || 0, 36)}</td></tr>`,
        )
        .join("")}</tbody></table>`;
  }
  function renderHandicaps() {
    const series = handicapSeries(a, b),
      x = (h) => 42 + ((h + 12) / 24) * 532,
      y = (count) => 156 - (count / 1296) * 134;
    const closest = [...series].sort(
      (p, q) =>
        Math.abs(p.wins - p.losses) - Math.abs(q.wins - q.losses) ||
        Math.abs(p.handicap) - Math.abs(q.handicap),
    )[0];
    $("match-handicap-chart").innerHTML =
      `<svg class="match-chart" viewBox="0 0 600 195" role="img" aria-label="Win, tie, and loss probability as A’s handicap increases from minus 12 to plus 12 in half-points">
      ${[0, 50, 100].map((value) => `<line class="match-gridline" x1="42" x2="574" y1="${y(value * 12.96)}" y2="${y(value * 12.96)}"/><text x="34" y="${y(value * 12.96) + 4}" text-anchor="end">${value}%</text>`).join("")}
      ${[-12, -6, 0, 6, 12].map((h) => `<text x="${x(h)}" y="177" text-anchor="middle">${signed(h)}</text>`).join("")}
      ${["losses", "ties", "wins"].map((key) => `<path class="match-line-${key}" d="${series.map((row, i) => `${i ? "L" : "M"}${x(row.handicap)},${y(row[key])}`).join(" ")}" fill="none" stroke-width="2.5"/>`).join("")}
      ${Math.abs(handicap) <= 12 ? `<line class="match-current-line" x1="${x(handicap)}" x2="${x(handicap)}" y1="18" y2="157"/>` : ""}</svg>`;
    $("match-handicap-note").textContent =
      `Closest win/loss balance in this chart: A ${signed(closest.handicap)} (${pct(closest.wins)} wins, ${pct(closest.ties)} ties, ${pct(closest.losses)} losses).${Math.abs(handicap) > 12 ? " Current handicap is outside the chart and slider range." : ""}`;
    $("match-balance").dataset.handicap = closest.handicap;
    $("match-balance").textContent =
      `Use A ${signed(closest.handicap)} · closest balance in ±12`;
    $("match-handicap-table").innerHTML =
      `<table class="match-table"><caption class="sr-only">Exact probabilities at each half-point handicap</caption><thead><tr><th>Added to A</th><th>A wins</th><th>Tie</th><th>B wins</th></tr></thead><tbody>${series.map((row) => `<tr><th scope="row">${signed(row.handicap)}</th>${["wins", "ties", "losses"].map((key) => `<td>${pct(row[key])}<small class="match-exact">${fraction(row[key], 1296)}</small></td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }
  function renderMargins() {
    const rows = marginDistribution(a, b, handicap);
    $("match-margin-chart").innerHTML = marginChart(rows);
    const mean =
      rows.reduce((sum, row) => sum + row.margin * row.count, 0) / 1296;
    $("match-margin-note").textContent =
      `Margin range ${signed(rows[0].margin)} to ${signed(rows.at(-1).margin)}. Average margin ${signed(Number(mean.toFixed(2)))} points; a higher average score does not by itself determine the win probability.`;
    $("match-margin-thresholds").innerHTML =
      `<table class="match-table"><caption>Chances of a win or loss by at least…</caption><thead><tr><th>Points</th><th>A wins by ≥</th><th>A loses by ≥</th></tr></thead><tbody>${[
        0.5, 1, 2, 3, 5, 10,
      ]
        .map((n) => {
          const wins = rows
            .filter((row) => row.margin >= n)
            .reduce((sum, row) => sum + row.count, 0);
          const losses = rows
            .filter((row) => row.margin <= -n)
            .reduce((sum, row) => sum + row.count, 0);
          return `<tr><th scope="row">${n}</th><td class="match-win-text">${pct(wins)}<small class="match-exact">${fraction(wins, 1296)}</small></td><td class="match-loss-text">${pct(losses)}<small class="match-exact">${fraction(losses, 1296)}</small></td></tr>`;
        })
        .join("")}</tbody></table>`;
    $("match-margin-table").innerHTML =
      `<table class="match-table"><caption class="sr-only">Exact score margins, A minus B</caption><thead><tr><th>Margin</th><th>Probability</th><th>Exact outcomes</th></tr></thead><tbody>${rows.map((row) => `<tr><th scope="row">${signed(row.margin)}</th><td>${pct(row.count)}</td><td>${exact(row.count)}</td></tr>`).join("")}</tbody></table>`;
  }
  function renderRolls() {
    const rows = conditionalRolls(a, b, handicap);
    $("match-roll-grid").innerHTML =
      `<span class="match-axis-corner" aria-label="Die one by die two">d1 / d2</span>${[1, 2, 3, 4, 5, 6].map((n) => `<span class="match-axis">${n}</span>`).join("")}${rows.map((row, index) => `${index % 6 === 0 ? `<span class="match-axis">${row.a}</span>` : ""}<button data-match-roll="${index}" aria-pressed="${selectedRoll === index}" style="--heat:${row.wins / 36};--heat-ink:${row.wins >= 18 ? "#000" : "#fff"}" aria-label="A rolls ${row.a} and ${row.b}, score ${row.score}: ${pct(row.wins, 36)} wins, ${pct(row.ties, 36)} ties, ${pct(row.losses, 36)} losses"><strong>${pct(row.wins, 36).replace(".00", "")}</strong><small>score ${row.score}</small></button>`).join("")}`;
    renderRollDetail(rows);
  }
  function renderRollDetail(rows = conditionalRolls(a, b, handicap)) {
    const row = rows[selectedRoll];
    $("match-roll-detail").textContent =
      `A rolls ${row.a} + ${row.b} → score ${row.score}. Against B: ${row.wins}/36 wins (${pct(row.wins, 36)}), ${row.ties}/36 ties (${pct(row.ties, 36)}), ${row.losses}/36 losses (${pct(row.losses, 36)}).`;
  }
  function renderCatalogue() {
    const search = $("match-search").value.trim().toLowerCase(),
      filter = $("match-filter").value;
    const rows = catalogue.filter((row) => {
      if (
        !`${scoreRule(row.a).name} ${scoreRule(row.b).name}`
          .toLowerCase()
          .includes(search)
      )
        return false;
      if (filter === "balanced")
        return Math.abs(row.wins - row.losses) / 1296 <= 0.05;
      if (filter === "ties") return row.ties / 1296 >= 0.15;
      if (filter === "favorites") return row.wins > 648;
      if (filter === "underdogs") return row.wins < 324;
      return true;
    });
    const sort = $("match-sort").value;
    if (sort === "balance")
      rows.sort(
        (p, q) => Math.abs(p.wins - p.losses) - Math.abs(q.wins - q.losses),
      );
    else if (sort !== "rules") rows.sort((p, q) => q[sort] - p[sort]);
    $("match-catalogue-body").innerHTML = tableRows(rows);
    $("match-catalogue-status").textContent =
      `${rows.length} of ${catalogue.length} matchups. All use zero added handicap. ${rows.length ? "Select a row to compare." : "No matches. Try another rule or filter."}`;
  }
  function renderEvents(
    items = events,
    searchId = "match-event-search",
    statusId = "match-event-status",
    targetId = "match-events",
  ) {
    const query = $(searchId).value.trim().toLowerCase();
    const filtered = items.filter((item) =>
      `${item.group} ${item.label}`.toLowerCase().includes(query),
    );
    $(statusId).textContent = `${filtered.length} of ${items.length} events`;
    $(targetId).innerHTML =
      [...new Set(filtered.map((item) => item.group))]
        .map(
          (group) =>
            `<section class="match-event-group"><h4>${group}</h4><ul>${filtered
              .filter((item) => item.group === group)
              .map(
                (item) =>
                  `<li><span>${item.label}</span><span class="match-event-track" aria-hidden="true"><i style="width:${(item.count / item.total) * 100}%"></i></span><strong>${pct(item.count, item.total)}</strong><small>${fraction(item.count, item.total)}<span class="match-exact">${item.count.toLocaleString("en-US")} / ${item.total.toLocaleString("en-US")}</span></small></li>`,
              )
              .join("")}</ul></section>`,
        )
        .join("") ||
      `<p class="hint">No events match. Try “sum”, “prime”, or “doubles”.</p>`;
  }
  function renderMatrix() {
    const matrixRules =
      $("match-matrix-scope").value === "all"
        ? SCORE_RULES
        : SCORE_RULES.slice(0, 12);
    const metric = $("match-matrix-metric").value;
    const metricName = { wins: "A wins", ties: "Tie", losses: "B wins" }[
      metric
    ];
    $("match-matrix").setAttribute(
      "aria-label",
      `${metricName} probability matrix, scroll for all rules`,
    );
    $("match-matrix").innerHTML =
      `<table class="match-matrix" style="min-width:${matrixRules.length * 64 + 95}px"><caption>${matrixRules.length} rules · P(${metricName}), % · full ${SCORE_RULES.length}-rule catalogue below</caption><thead><tr><th scope="col">A ↓ / B →</th>${matrixRules.map((rule) => `<th scope="col">${rule.name}</th>`).join("")}</tr></thead><tbody>${matrixRules
        .map(
          (left) =>
            `<tr><th scope="row">${left.name}</th>${matrixRules
              .map((right) => {
                const row = compareRules(left.id, right.id);
                return `<td><button data-match-a="${left.id}" data-match-b="${right.id}" style="--heat:${row[metric] / 1296};--heat-ink:${row[metric] >= 648 ? "#000" : "#fff"}" aria-label="${left.name} vs ${right.name}: ${pct(row.wins)} A wins, ${pct(row.ties)} ties, ${pct(row.losses)} B wins">${((100 * row[metric]) / 1296).toFixed(1)}</button></td>`;
              })
              .join("")}</tr>`,
        )
        .join("")}</tbody></table>`;
  }
  function renderAgreement() {
    const xId = $("match-agreement-x").value,
      yId = $("match-agreement-y").value;
    const counts = ruleAgreement(xId, yId);
    const labels = ["A wins", "Tie", "B wins"];
    const same = counts[0][0] + counts[1][1] + counts[2][2];
    const flips = counts[0][2] + counts[2][0];
    const changes = 1296 - same - flips;
    $("match-agreement-summary").innerHTML = [
      [same, "same result", "wins"],
      [flips, "winner flips", "losses"],
      [changes, "tie becomes decisive, or vice versa", "ties"],
    ]
      .map(
        ([count, label, kind]) =>
          `<p><strong class="match-${kind}-value">${pct(count)}</strong><span>${label}<small class="match-exact">${exact(count)}</small></span></p>`,
      )
      .join("");
    $("match-agreement-grid").innerHTML =
      `<table class="match-agreement-table"><caption>Rows: ${scoreRule(xId).name} · columns: ${scoreRule(yId).name}</caption><thead><tr><th scope="col">X ↓ / Y →</th>${labels.map((label) => `<th scope="col">${label}</th>`).join("")}</tr></thead><tbody>${counts
        .map(
          (row, i) =>
            `<tr><th scope="row">${labels[i]}</th>${row
              .map((count, j) => {
                const kind =
                  i === j ? "wins" : i === 1 || j === 1 ? "ties" : "losses";
                return `<td class="match-agreement-${kind}" style="--joint:${count / 1296}"><strong>${pct(count)}</strong><small>${fraction(count, 1296)}</small><span class="sr-only">${count} of 1296 contests</span></td>`;
              })
              .join("")}</tr>`,
        )
        .join("")}</tbody></table>`;
  }
  $("match-sum-chart").innerHTML = distributionChart(
    scoreDistribution("sum"),
    [],
    "Sum probabilities for two fair dice, from 2 through 12",
  );
  root.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-match-tab]");
    if (tab) panel(tab.dataset.matchTab);
    const picked = event.target.closest("[data-match-a]");
    if (picked) {
      a = picked.dataset.matchA;
      b = picked.dataset.matchB;
      handicap = 0;
      $("match-error").hidden = true;
      panel("compare");
      render();
      root.scrollTop = 0;
      $("match-a").focus({ preventScroll: true });
    }
    const roll = event.target.closest("[data-match-roll]");
    if (roll) {
      selectedRoll = Number(roll.dataset.matchRoll);
      root
        .querySelectorAll("[data-match-roll]")
        .forEach((button) =>
          button.setAttribute("aria-pressed", String(button === roll)),
        );
      renderRollDetail();
    }
  });
  ["match-a", "match-b"].forEach((id) =>
    $(id).addEventListener("change", () => {
      a = $("match-a").value;
      b = $("match-b").value;
      render();
    }),
  );
  $("match-handicap").addEventListener("input", () => {
    const input = $("match-handicap");
    const valid = input.value !== "" && input.checkValidity();
    $("match-error").hidden = valid;
    $("match-error").textContent = valid
      ? ""
      : "Enter a handicap from −36 to +36 in half-points. Results still show the last valid value.";
    if (valid) {
      handicap = Number(input.value);
      render(false);
    }
  });
  $("match-handicap-slider").addEventListener("input", () => {
    handicap = Number($("match-handicap-slider").value);
    $("match-error").hidden = true;
    render();
  });
  $("match-swap").addEventListener("click", () => {
    [a, b] = [b, a];
    handicap = -handicap;
    $("match-error").hidden = true;
    render();
  });
  $("match-reset").addEventListener("click", () => {
    a = b = "sum";
    handicap = 0;
    $("match-error").hidden = true;
    render();
  });
  $("match-balance").addEventListener("click", () => {
    handicap = Number($("match-balance").dataset.handicap);
    render();
  });
  $("match-jump-featured").addEventListener("click", () => {
    $("match-featured").scrollIntoView({ block: "start" });
    $("match-featured-title").focus({ preventScroll: true });
  });
  ["match-matrix-metric", "match-matrix-scope"].forEach((id) =>
    $(id).addEventListener("change", renderMatrix),
  );
  ["match-agreement-x", "match-agreement-y"].forEach((id) =>
    $(id).addEventListener("change", renderAgreement),
  );
  ["match-search", "match-filter", "match-sort"].forEach((id) =>
    $(id).addEventListener(
      id === "match-search" ? "input" : "change",
      renderCatalogue,
    ),
  );
  $("match-event-search").addEventListener("input", () => renderEvents());
  $("match-four-search").addEventListener("input", () =>
    renderEvents(
      fourEvents,
      "match-four-search",
      "match-four-status",
      "match-four-events",
    ),
  );
  $("match-download").addEventListener("click", () => {
    const csv = [
      [
        "A rule",
        "B rule",
        "A handicap",
        "A wins",
        "Ties",
        "B wins",
        "Total",
        "P(A wins)",
        "P(tie)",
        "P(B wins)",
      ],
      ...catalogue.map((row) => [
        scoreRule(row.a).name,
        scoreRule(row.b).name,
        0,
        row.wins,
        row.ties,
        row.losses,
        row.total,
        row.wins / row.total,
        row.ties / row.total,
        row.losses / row.total,
      ]),
    ]
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "two-dice-matchups.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  render();
  renderCatalogue();
  renderEvents();
  renderMatrix();
  $("match-agreement-y").value = "product";
  renderAgreement();
  renderEvents(
    fourEvents,
    "match-four-search",
    "match-four-status",
    "match-four-events",
  );
}

function marginChart(rows) {
  const min = Math.min(0, rows[0].margin),
    max = Math.max(0, rows.at(-1).margin);
  const step = rows.some((row) => !Number.isInteger(row.margin)) ? 0.5 : 1;
  const slots = (max - min) / step + 1,
    width = 532 / slots;
  const peak = Math.max(...rows.map((row) => row.count));
  const x = (value) => 42 + ((value - min) / step) * width + width / 2;
  const y = (count) => 156 - (count / peak) * 124;
  const tickStep =
    [0.5, 1, 2, 5, 10, 20].find((value) => value >= (max - min) / 6) || 20;
  const ticks = [];
  for (
    let value = Math.ceil(min / tickStep) * tickStep;
    value <= max;
    value += tickStep
  )
    ticks.push(value);
  return `<svg class="match-chart" viewBox="0 0 600 195" role="img" aria-label="Probability of each score margin for A minus B. Negative is a loss, zero a tie, positive a win. Exact values in the table below.">
    ${[0, peak / 2, peak].map((count) => `<line class="match-gridline" x1="42" x2="574" y1="${y(count)}" y2="${y(count)}"/><text x="34" y="${y(count) + 4}" text-anchor="end">${((100 * count) / 1296).toFixed(1)}%</text>`).join("")}
    <line class="match-current-line" x1="${x(0)}" x2="${x(0)}" y1="22" y2="156"/>
    ${rows.map((row) => `<rect class="match-fill-${row.margin > 0 ? "wins" : row.margin < 0 ? "losses" : "ties"}" x="${x(row.margin) - width * 0.38}" y="${y(row.count)}" width="${Math.max(1, width * 0.76)}" height="${156 - y(row.count)}" rx="1"><title>Margin ${signed(row.margin)}: ${pct(row.count)} (${fraction(row.count, 1296)})</title></rect>`).join("")}
    ${ticks.map((value) => `<text x="${x(value)}" y="177" text-anchor="middle">${signed(value)}</text>`).join("")}<text x="574" y="193" text-anchor="end">A − B, points</text></svg>`;
}

function distributionChart(left, right, label) {
  const all = [...left, ...right],
    min = Math.min(...all.map((row) => row.score)),
    max = Math.max(...all.map((row) => row.score));
  const peak = Math.max(...all.map((row) => row.count)),
    halfSteps = all.some((row) => !Number.isInteger(row.score));
  const step = halfSteps ? 0.5 : 1,
    slots = Math.round((max - min) / step) + 1;
  const width = 532 / slots,
    x = (score) => 42 + ((score - min) / step) * width + width / 2,
    y = (count) => 156 - (count / peak) * 124;
  const tickStride = Math.max(1, Math.ceil(slots / 12));
  const ticks = Array.from({ length: slots }, (_, i) => min + i * step).filter(
    (_, i) => i % tickStride === 0,
  );
  if (ticks.at(-1) !== max) {
    if (max - ticks.at(-1) < tickStride * step * 0.7) ticks.pop();
    ticks.push(max);
  }
  return `<svg class="match-chart" viewBox="0 0 600 195" role="img" aria-label="${label}. Exact probabilities are listed below.">
    ${[0, peak / 2, peak].map((value) => `<line class="match-gridline" x1="42" x2="574" y1="${y(value)}" y2="${y(value)}"/><text x="34" y="${y(value) + 4}" text-anchor="end">${((100 * value) / 36).toFixed(1)}%</text>`).join("")}
    ${[left, right].map((rows, side) => rows.map((row) => `<rect class="match-fill-${side ? "losses" : "wins"}" x="${x(row.score) + (right.length ? (side ? 1 : -width * 0.4) : -width * 0.35)}" y="${y(row.count)}" width="${Math.max(1, width * (right.length ? 0.36 : 0.7))}" height="${156 - y(row.count)}" rx="1"><title>${side ? "B" : "A"} score ${row.score}: ${row.count}/36 (${pct(row.count, 36)})</title></rect>`).join("")).join("")}
    ${ticks.map((value) => `<text x="${x(value)}" y="177" text-anchor="middle">${value}</text>`).join("")}<text x="574" y="193" text-anchor="end">score</text></svg>`;
}
