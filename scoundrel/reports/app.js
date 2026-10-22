(() => {
  "use strict";
  const $ = id => document.getElementById(id), S = ScoundrelStatistics, E = Scoundrel;
  const f = (x, digits = 3) => x == null ? "—" : x.toLocaleString("en-US", { maximumFractionDigits: digits });
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let data, rows = [], activeScore = null, activeHigh = null, visible = 20;
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
    $("distribution-subtitle").textContent = `${f(rows.length)} deals · one bar per observed score`;
    $("score-detail").textContent = rows.length ? `Lowest ${selected.min} · Highest ${selected.max}` : "No matching deals";
    $("dispersion-detail").textContent = rows.length ? `Selection mean ${f(selected.mean)} · Median ${f(selected.median, 1)}` : "";
    $("proof-copy").textContent = `${f(data.policy.iterations)} tree simulations per decision, with both avoidance directions considered. Recommendations maximize estimated final score. The policy is approximate; stronger search may improve these results.`;
    draw(); renderDeals();
  }
  function draw() {
    const scrollTop = $("histogram").querySelector(".mobile-chart-bars")?.scrollTop || 0;
    if (!rows.length) { $("histogram").textContent = "No deals to display."; return; }
    const counts = new Map();
    const width = Math.max(...rows.map(r => r.score)) - Math.min(...rows.map(r => r.score)) > 60 ? 10 : 1;
    for (const row of rows) { const score = Math.floor(row.score / width) * width; counts.set(score, (counts.get(score) || 0) + 1); }
    $("distribution-subtitle").textContent = `${f(rows.length)} deals · ${width === 1 ? "one bar per score" : "10-point score bins"}`;
    const first = Math.min(...counts.keys()), last = Math.max(...counts.keys());
    const bins = Array.from({ length: (last - first) / width + 1 }, (_, i) => { const score = first + i * width; return [score, counts.get(score) || 0]; });
    const w = Math.max(620, bins.length * 44 + 68), h = 340, left = 48, right = 20, top = 44, bottom = 48;
    const plotH = h - top - bottom, maximum = Math.max(...counts.values()), band = (w - left - right) / bins.length, barW = Math.min(60, band - 8);
    let html = `<svg viewBox="0 0 ${w} ${h}" style="min-width:${w}px" role="img" aria-labelledby="chart-title chart-desc"><title id="chart-title">Final score frequencies</title><desc id="chart-desc">${rows.length} hidden-deck games. Each bar covers ${width} score points. Bar heights show the number of deals; select a score to filter the table.</desc>`;
    for (const count of [...new Set(Array.from({ length: 5 }, (_, i) => Math.ceil(maximum * i / 4)))]) {
      const y = h - bottom - count / maximum * plotH;
      html += `<line class="chart-axis" x1="${left}" x2="${w - right}" y1="${y}" y2="${y}"/><text class="chart-label" x="${left - 10}" y="${y + 4}" text-anchor="end">${count}</text>`;
    }
    bins.forEach(([score, count], i) => {
      const x = left + i * band + (band - barW) / 2, height = count / maximum * plotH, y = h - bottom - height;
      html += `<g class="chart-group${activeScore === score ? " is-active" : ""}" tabindex="0" role="button" aria-pressed="${activeScore === score}" aria-label="Scores ${score} to ${score + width - 1}: ${count} deals" data-score="${score}" data-high="${score + width - 1}"><title>Score ${score}${width > 1 ? " to " + (score + width - 1) : ""}: ${count} deals (${f(count / rows.length * 100, 2)}%)</title><rect class="chart-hit-area" x="${left + i * band}" y="${top}" width="${band}" height="${plotH}"/><rect class="chart-bar-proven" x="${x}" y="${y}" width="${barW}" height="${height}" rx="1"/><text class="chart-count" x="${x + barW / 2}" y="${y - 7}" text-anchor="middle">${count}</text></g><text class="chart-label" x="${x + barW / 2}" y="${h - bottom + 22}" text-anchor="middle">${score}</text>`;
    });
    html += `<text class="chart-label" x="${left}" y="20">Deals</text><text class="chart-label" x="${w / 2}" y="${h - 3}" text-anchor="middle">Final score (bin start)</text></svg>`;
    const mobile = `<div class="mobile-chart"><div class="mobile-chart-head"><span>Score</span><span>Deals</span></div><div class="mobile-chart-bars">${bins.slice().reverse().map(([score, count]) => `<button class="mobile-score-row${activeScore === score ? " is-active" : ""}" type="button" data-score="${score}" data-high="${score + width - 1}" aria-pressed="${activeScore === score}" aria-label="Scores ${score} to ${score + width - 1}: ${count} deals"><strong>${width === 1 ? score : score + " to " + (score + width - 1)}</strong><span class="mobile-bar-track" aria-hidden="true"><i style="width:${count / maximum * 100}%"></i></span><span>${count}</span></button>`).join("")}</div></div>`;
    $("histogram").innerHTML = html + mobile;
    $("histogram").querySelector(".mobile-chart-bars").scrollTop = scrollTop;
  }
  function renderDeals() {
    const shown = rows.filter(r => activeScore == null || r.score >= activeScore && r.score <= activeHigh);
    $("deals-caption").textContent = `${f(shown.length)} deals${activeScore != null ? " · scores " + activeScore + (activeHigh === activeScore ? "" : " to " + activeHigh) : " · every run verified"}`;
    $("clear-filter").hidden = activeScore == null;
    $("deals-body").innerHTML = shown.slice(0, visible).map(r => `<tr><td>${String(r.index + 1).padStart(4, "0")}</td><td>${r.score}</td><td class="${r.score > 0 ? "proven" : "defeated"}">${r.score > 0 ? "Survived" : "Defeated"}</td><td class="deal-links"><button class="text-button" type="button" data-solution="${r.index}">History</button><a href="../?seed=${encodeURIComponent(r.seed)}">Play</a></td></tr>`).join("");
    $("load-more").hidden = visible >= shown.length;
  }
  function chooseScore(target) {
    const bar = target.closest("[data-score]"); if (!bar) return;
    const score = Number(bar.dataset.score), high = Number(bar.dataset.high); activeScore = activeScore === score ? null : score; activeHigh = high; visible = 20;
    $("chart-caption").textContent = activeScore != null ? `${rows.filter(r => r.score >= score && r.score <= high).length} deals with ${score === high ? "score " + score : "scores " + score + " to " + high}. The deal table is filtered.` : "Select a score to inspect its deals.";
    draw(); renderDeals();
    // Keep keyboard focus on the updated bar after replacing the SVG.
    $("histogram").querySelector(`${matchMedia("(max-width: 650px)").matches ? ".mobile-score-row" : ".chart-group"}[data-score="${score}"]`)?.focus({ preventScroll: true });
  }
  $("cohort").addEventListener("change", () => { activeScore = null; visible = 20; $("chart-caption").textContent = "Select a score to inspect its deals."; render(); });
  $("histogram").addEventListener("click", event => chooseScore(event.target));
  $("histogram").addEventListener("keydown", event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); chooseScore(event.target); } });
  $("clear-filter").addEventListener("click", () => { activeScore = null; draw(); renderDeals(); $("chart-caption").textContent = "Select a score to inspect its deals."; });
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
