(() => {
  "use strict";
  const $ = id => document.getElementById(id), S = ScoundrelStatistics, E = Scoundrel;
  const f = (x, digits = 3) => x == null ? "—" : x.toLocaleString("en-US", { maximumFractionDigits: digits });
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let data, rows = [], activeScore = null, visible = 20, chartWidth = 0;
  function render() {
    const cohort = $("cohort").value;
    rows = data.rows.filter(r => cohort === "all" || (cohort === "below" ? r.score < 30 : cohort === "won" ? r.score > 0 : r.score <= 0));
    const overall = S.summarize(data.rows), selected = S.summarize(rows);
    $("study-summary").textContent = `The policy scored ${f(overall.sum)} points across ${f(overall.n)} deals. Every move history was replay-checked against the game rules.`;
    $("mean").textContent = f(overall.mean);
    $("mean-detail").textContent = `${f(overall.sum)} total points ÷ ${f(overall.n)} deals`;
    $("median").textContent = f(overall.median, 1);
    $("median-detail").textContent = "Middle of the 1,000 final scores";
    $("win-rate").textContent = f(overall.wins / overall.n * 100, 1) + "%";
    $("win-detail").textContent = `${f(overall.wins)} survived · ${f(overall.n - overall.wins)} defeated`;
    $("proof-rate").textContent = f(overall.n);
    $("proof-detail").textContent = "All 1,000 move histories verified";
    $("distribution-subtitle").textContent = `${f(rows.length)} deals · one thin bar per score`;
    $("score-detail").textContent = rows.length ? `Lowest ${selected.min} · Highest ${selected.max}` : "No matching deals";
    $("dispersion-detail").textContent = rows.length ? `Selection mean ${f(selected.mean)} · Median ${f(selected.median, 1)}` : "";
    $("proof-copy").textContent = `${f(data.policy.iterations)} tree simulations per decision, with both avoidance directions considered. Recommendations maximize estimated final score. The policy is approximate; stronger search may improve these results.`;
    $("score-picker").innerHTML = '<option value="">All scores</option>' + (rows.length ? Array.from({ length: selected.max - selected.min + 1 }, (_, i) => { const score = selected.min + i; return `<option value="${score}">${score}</option>`; }).join("") : "");
    $("score-picker").disabled = !rows.length;
    draw(); renderDeals();
  }
  const references = summary => [
    { key: "q1", label: "Q1 · 25%", value: summary.q1 },
    { key: "median", label: "Median · 50%", value: summary.median },
    { key: "q3", label: "Q3 · 75%", value: summary.q3 },
    { key: "mean", label: "Mean", value: summary.mean },
  ];
  function tickStep(span) {
    const power = 10 ** Math.floor(Math.log10(Math.max(1, span))), unit = span / power;
    return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
  }
  function draw() {
    const container = $("histogram");
    chartWidth = Math.floor(container.getBoundingClientRect().width);
    if (!rows.length) { container.textContent = "No deals to display."; $("chart-legend").innerHTML = ""; return; }
    const counts = new Map(), summary = S.summarize(rows), markers = references(summary);
    for (const row of rows) counts.set(row.score, (counts.get(row.score) || 0) + 1);
    const first = summary.min, last = summary.max;
    const scores = Array.from({ length: last - first + 1 }, (_, i) => first + i);
    $("distribution-subtitle").textContent = `${f(rows.length)} deals · one thin bar per score`;
    $("chart-legend").innerHTML = markers.map(marker => `<div class="chart-stat" data-stat="${marker.key}"><i class="chart-swatch chart-swatch-${marker.key}" aria-hidden="true"></i><span>${marker.label}<strong>${f(marker.value, marker.key === "mean" ? 3 : 2)}</strong></span></div>`).join("");
    const w = Math.max(240, chartWidth), h = w < 600 ? 300 : 340, left = 38, right = 12, top = 30, bottom = 50;
    const plotH = h - top - bottom, plotW = w - left - right, band = plotW / scores.length, barW = Math.min(3, band * .7);
    const yStep = tickStep(Math.max(...counts.values()) / 4), maximum = Math.ceil(Math.max(...counts.values()) / yStep) * yStep;
    const x = score => left + (score - first + .5) * band;
    let html = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="chart-title chart-desc" data-min="${first}" data-max="${last}"><title id="chart-title">Final score frequencies</title><desc id="chart-desc">${rows.length} hidden-deck games. One bar for each integer score from ${first} to ${last}, including zero counts. Bar height is the number of deals. ${markers.map(marker => marker.label + ": " + f(marker.value)).join(". ")}. Use the Score control to inspect an exact value.</desc>`;
    for (let count = 0; count <= maximum; count += yStep) {
      const y = h - bottom - count / maximum * plotH;
      html += `<line class="chart-axis" x1="${left}" x2="${w - right}" y1="${y}" y2="${y}"/><text class="chart-label" x="${left - 8}" y="${y + 4}" text-anchor="end">${count}</text>`;
    }
    for (const score of scores) {
      const count = counts.get(score) || 0, height = count / maximum * plotH, y = h - bottom - height;
      html += `<g class="chart-group${activeScore === score ? " is-active" : ""}" data-score="${score}" data-count="${count}"><title>Score ${score}: ${count} deals (${f(count / rows.length * 100, 2)}%)</title><rect class="chart-hit-area" x="${x(score) - band / 2}" y="${top}" width="${band}" height="${plotH}"/><rect class="chart-bar" x="${x(score) - barW / 2}" y="${y}" width="${barW}" height="${height}"/></g>`;
    }
    for (const marker of markers) html += `<line class="chart-reference chart-reference-${marker.key}" data-stat="${marker.key}" data-value="${marker.value}" x1="${x(marker.value)}" x2="${x(marker.value)}" y1="${top}" y2="${h - bottom}"/>`;
    const step = tickStep((last - first) / Math.max(2, Math.floor(plotW / 65)));
    const ticks = [first];
    for (let score = Math.ceil(first / step) * step; score < last; score += step) {
      if (x(score) - x(ticks.at(-1)) >= 28 && x(last) - x(score) >= 22) ticks.push(score);
    }
    if (last !== first) ticks.push(last);
    for (const score of ticks) html += `<text class="chart-label" x="${x(score)}" y="${h - bottom + 22}" text-anchor="middle">${score}</text>`;
    html += `<text class="chart-label" x="${left}" y="17">Deals</text><text class="chart-label" x="${left + plotW / 2}" y="${h - 4}" text-anchor="middle">Final score</text></svg>`;
    container.innerHTML = html;
  }
  function renderDeals() {
    const shown = rows.filter(r => activeScore == null || r.score === activeScore);
    $("deals-caption").textContent = `${f(shown.length)} deals${activeScore != null ? " · score " + activeScore : " · every run verified"}`;
    $("clear-filter").hidden = activeScore == null;
    $("deals-body").innerHTML = shown.slice(0, visible).map(r => `<tr><td>${String(r.index + 1).padStart(4, "0")}</td><td>${r.score}</td><td class="${r.score > 0 ? "proven" : "defeated"}">${r.score > 0 ? "Survived" : "Defeated"}</td><td class="deal-links"><button class="text-button" type="button" data-solution="${r.index}">History</button><a href="../?seed=${encodeURIComponent(r.seed)}">Play</a></td></tr>`).join("");
    $("load-more").hidden = visible >= shown.length;
  }
  function chooseScore(score) {
    activeScore = score; visible = 20;
    $("score-picker").value = score == null ? "" : String(score);
    $("chart-caption").textContent = score == null ? "Select a bar or choose a score to inspect its deals." : `${rows.filter(r => r.score === score).length} deals with score ${score}. The deal table is filtered.`;
    draw(); renderDeals();
  }
  $("cohort").addEventListener("change", () => { activeScore = null; visible = 20; render(); chooseScore(null); });
  $("histogram").addEventListener("click", event => {
    const bar = event.target.closest("[data-score]");
    if (bar) { const score = Number(bar.dataset.score); chooseScore(activeScore === score ? null : score); }
  });
  $("score-picker").addEventListener("change", event => chooseScore(event.target.value === "" ? null : Number(event.target.value)));
  $("clear-filter").addEventListener("click", () => chooseScore(null));
  new ResizeObserver(() => { if (data && Math.floor($("histogram").getBoundingClientRect().width) !== chartWidth) draw(); }).observe($("histogram"));
  $("load-more").addEventListener("click", () => { visible += 30; renderDeals(); });
  $("deals-body").addEventListener("click", event => {
    const button = event.target.closest("[data-solution]"); if (!button) return;
    const row = data.rows.find(r => r.index === Number(button.dataset.solution));
    let state = E.createGame({ seed: row.seed });
    $("solution-title").textContent = `Deal ${String(row.index + 1).padStart(4, "0")} · score ${row.score}`;
    $("solution-proof").textContent = "Played using revealed information only. This is the recorded policy run, not a hindsight solution.";
    $("solution-line").innerHTML = row.line.map(action => {
      const card = state.room.find(c => c?.id === action.id), room = state.roomNumber;
      const title = card ? (action.type === "fight" ? "Fight " : action.type === "equip" ? "Equip " : state.potionUsed ? "Discard " : "Drink ") + ScoundrelCatalog[card.id].name + (action.type === "fight" ? action.mode === "weapon" ? " · weapon" : " · barehanded" : "") : E.describe(state, action);
      state = E.transition(state, action);
      return `<li><div><small>Room ${action.type === "descend" ? state.roomNumber : room}</small><span>${esc(title)}</span></div><strong aria-label="${state.health} health">${state.health}<span aria-hidden="true"> ♥</span></strong></li>`;
    }).join("");
    $("solution-dialog").showModal();
  });
  $("close-solution").addEventListener("click", () => $("solution-dialog").close());
  $("download").addEventListener("click", () => {
    const csv = "deal,seed,final_score,outcome,simulations_per_decision\n" + rows.map(r => [r.index + 1, r.seed, r.score, r.score > 0 ? "survived" : "defeated", data.policy.iterations].join(",")).join("\n") + "\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), link = document.createElement("a");
    link.href = url; link.download = "scoundrel-hidden-deck-1000-deals.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  fetch("outcomes.json?v=20261022-5").then(response => { if (!response.ok) throw Error("Study data could not be loaded"); return response.json(); }).then(S.validate).then(study => {
    data = study;
    $("technical-method").textContent = `Seeds ${data.seedPrefix}0000 through ${data.seedPrefix}0999. The native Monte Carlo policy uses ${data.policy.iterations.toLocaleString()} simulations per decision and tree depth ${data.policy.treeDepth}. A room planner guides rollouts without seeing future draws. The generator checkpoints games and publishes only after all 1,000 move histories pass replay validation. Policy revision ${data.policy.revision.slice(0, 12)}.`;
    $("study-date").textContent = "Computed " + new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(new Date(data.generatedAt));
    $("loading").hidden = true; $("report-content").hidden = false; render();
  }).catch(error => { $("loading").textContent = error.message + ". Reload to try again."; });
})();
