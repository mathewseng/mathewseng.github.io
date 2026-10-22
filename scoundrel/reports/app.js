(() => {
  "use strict";
  const $ = (id) => document.getElementById(id), S = ScoundrelStatistics;
  const f = (x, digits = 2) => x == null ? "—" : x.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const range = (lo, hi, digits = 2) => lo === hi ? f(lo, digits) : f(lo, digits) + "–" + f(hi, digits);
  let data, rows = [], activeBin = null, visible = 20;
  const selection = () => data.rows.filter((r) => $("cohort").value === "all" || ($("cohort").value === "proven" ? r.exact : !r.exact));
  function render() {
    rows = selection(); const s = S.summarize(rows), overall = S.summarize(data.rows);
    $("study-summary").textContent = `Across ${overall.n} shuffled dungeons, the search achieved a mean score of ${f(overall.mean)} and a median of ${f(overall.median)}. It proved the optimal score in ${overall.exact} deals. For the complete sample, the optimal mean lies between ${f(overall.mean)} and ${f(overall.meanUpper)}; the optimal median lies between ${f(overall.median)} and ${f(overall.medianUpper)}.`;
    $("mean").textContent = s.n ? range(s.mean, s.meanUpper) : "—";
    $("mean-detail").textContent = s.n ? s.exact === s.n ? "Exact sample mean" : "Bounds on the sample optimum" : "No deals in this selection";
    $("median").textContent = s.n ? range(s.median, s.medianUpper, 1) : "—";
    $("median-detail").textContent = s.n ? s.median === s.medianUpper ? "Sample median proved" : "Bounds on the sample optimum" : "No deals in this selection";
    $("win-rate").textContent = s.n ? range(s.wins / s.n * 100, s.possibleWins / s.n * 100, 1) + "%" : "—";
    $("win-detail").textContent = `${s.wins} complete winning lines / ${s.n} deals`;
    $("proof-rate").textContent = s.n ? f(s.exact / s.n * 100, 1) + "%" : "—";
    $("proof-detail").textContent = `${s.exact} of ${s.n} deals solved exactly`;
    $("cohort-warning").hidden = $("cohort").value === "all";
    $("cohort-warning").textContent = "This is a selected subset. Deals that are easier to prove are overrepresented in the proven group; do not use its mean as an estimate for all dungeons.";
    $("bounds-copy").textContent = s.n ? `For these ${s.n} deals, optimal play has a mean score between ${f(s.mean)} and ${f(s.meanUpper)}, and a median between ${f(s.median)} and ${f(s.medianUpper)}. The lower endpoints are achieved by verified lines. The upper endpoints allow all remaining healing and assume no further damage, so they cannot understate the true optimum.` : "No deals match this selection.";
    $("sampling-note").textContent = s.n ? `Achieved-score standard deviation: ${f(s.sd)}. Standard error of the achieved sample mean: ${f(s.se)}. These describe the computed search outcomes; they do not establish an exact population mean under optimal play.` : "";
    $("range-detail").textContent = s.n ? `Achieved range ${s.min} to ${s.max} · ${s.n} deals` : "No deals";
    $("dispersion-detail").textContent = s.n ? `Mean ${f(s.mean)} · Median ${f(s.median, 1)} · SD ${f(s.sd)}` : "";
    draw(); renderDeals();
  }
  function draw() {
    const upper = $("distribution").value === "upper", metric = upper ? "upper" : "score";
    $("distribution-subtitle").textContent = upper ? "Best possible scores cannot exceed these bounds. This is not an achieved-outcome distribution." : "Verified final scores achieved by the search. Unsolved deals may have better outcomes.";
    if (!rows.length) { $("histogram").textContent = "No deals to display."; return; }
    const min = Math.min(0, ...rows.map((r) => r[metric])), max = 30, binWidth = max - min > 60 ? 5 : 1;
    const start = Math.floor(min / binWidth) * binWidth, bins = [];
    for (let lo = start; lo <= max; lo += binWidth) { const members = rows.filter((r) => r[metric] >= lo && r[metric] < lo + binWidth); bins.push({ lo, hi: lo + binWidth - 1, members, exact: members.filter((r) => r.exact).length }); }
    const w = 960, h = 340, left = 48, right = 20, top = 56, bottom = 48, plotH = h - top - bottom, plotW = w - left - right;
    const maximum = Math.max(1, ...bins.map((b) => b.members.length)), band = plotW / bins.length, barW = Math.max(3, band - 4);
    let content = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="chart-title chart-desc"><title id="chart-title">${upper ? "Upper bounds on optimal scores" : "Achieved final score distribution"}</title><desc id="chart-desc">${rows.length} deals. Gold bars indicate proven optimal outcomes. Outlined bars indicate scores not yet proved optimal. Select a bar to filter the inspectable deal table.</desc>`;
    for (let i = 0; i <= 4; i++) { const count = Math.ceil(maximum * i / 4), y = h - bottom - count / maximum * plotH; content += `<line class="chart-axis" x1="${left}" x2="${w - right}" y1="${y}" y2="${y}"/><text class="chart-label" x="${left - 10}" y="${y + 4}" text-anchor="end">${count}</text>`; }
    bins.forEach((b, i) => {
      const x = left + i * band + 2, height = b.members.length / maximum * plotH, provenH = b.exact / maximum * plotH, y = h - bottom - height;
      if (b.members.length) content += `<g class="chart-group${activeBin?.lo === b.lo ? " is-active" : ""}" tabindex="0" role="button" aria-pressed="${activeBin?.lo === b.lo}" aria-label="Score ${b.lo}${b.hi !== b.lo ? " to " + b.hi : ""}: ${b.members.length} deals, ${b.exact} proven" data-lo="${b.lo}" data-hi="${b.hi}"><title>Score ${b.lo}${b.hi !== b.lo ? "–" + b.hi : ""}: ${b.members.length} deals · ${b.exact} proven</title><rect class="chart-bar-bound" x="${x}" y="${y}" width="${barW}" height="${height}" rx="1"/><rect class="chart-bar-proven" x="${x}" y="${h - bottom - provenH}" width="${barW}" height="${provenH}" rx="1"/></g>`;
      if (i % Math.max(1, Math.ceil(bins.length / 16)) === 0 || i === bins.length - 1) content += `<text class="chart-label" x="${x + barW / 2}" y="${h - bottom + 22}" text-anchor="middle">${b.lo}</text>`;
    });
    const avg = S.mean(rows.map((r) => r[metric])), med = S.median(rows.map((r) => r[metric]));
    const xFor = (v) => Math.max(left, Math.min(w - right, left + ((v - start) / binWidth + .5) * band));
    content += `<line class="chart-mean" x1="${xFor(avg)}" x2="${xFor(avg)}" y1="${top - 10}" y2="${h - bottom}"/><text class="chart-mean-label" x="${xFor(avg) - 6}" y="18" text-anchor="end">Mean ${f(avg)}</text><line class="chart-median" x1="${xFor(med)}" x2="${xFor(med)}" y1="${top - 10}" y2="${h - bottom}"/><text class="chart-median-label" x="${xFor(med) - 6}" y="36" text-anchor="end">Median ${f(med, 1)}</text><text class="chart-label" x="${left}" y="22">Deals</text><text class="chart-label" x="${w / 2}" y="${h - 3}" text-anchor="middle">${upper ? "Optimal-score upper bound" : "Final score"}</text></svg>`;
    $("histogram").innerHTML = content;
  }
  function renderDeals() {
    const metric = $("distribution").value === "upper" ? "upper" : "score";
    const shown = rows.filter((r) => !activeBin || r[metric] >= activeBin.lo && r[metric] <= activeBin.hi);
    $("deals-caption").textContent = `${shown.length} deals${activeBin ? " with score " + activeBin.lo + (activeBin.hi !== activeBin.lo ? "–" + activeBin.hi : "") : " · every score has a verified replay"}`;
    $("clear-filter").hidden = !activeBin;
    $("deals-body").innerHTML = shown.slice(0, visible).map((r) => `<tr><td>${String(r.index + 1).padStart(3, "0")}</td><td>${r.score}</td><td>${r.score === r.upper ? r.score : r.score + " to " + r.upper}</td><td class="${r.exact ? "proven" : "bounded"}">${r.exact ? "Proven" : "Bounded"}</td><td><a href="../?seed=${encodeURIComponent(r.seed)}">Play this deal</a></td></tr>`).join("");
    $("load-more").hidden = visible >= shown.length;
  }
  function chooseBin(target) {
    const g = target.closest("[data-lo]"); if (!g) return;
    const lo = Number(g.dataset.lo), hi = Number(g.dataset.hi); activeBin = activeBin?.lo === lo ? null : { lo, hi }; visible = 20;
    const metric = $("distribution").value === "upper" ? "upper" : "score";
    const count = rows.filter((r) => r[metric] >= lo && r[metric] <= hi).length;
    $("chart-caption").textContent = activeBin ? `${count} deals at ${hi === lo ? "score " + lo : "scores " + lo + "–" + hi}. The deal table below is filtered.` : "Select a bar to inspect its deals.";
    draw(); renderDeals();
  }
  $("cohort").addEventListener("change", () => { activeBin = null; visible = 20; $("chart-caption").textContent = "Select a bar to inspect its deals."; render(); });
  $("distribution").addEventListener("change", () => { activeBin = null; visible = 20; $("chart-caption").textContent = "Select a bar to inspect its deals."; draw(); renderDeals(); });
  $("histogram").addEventListener("click", (e) => chooseBin(e.target));
  $("histogram").addEventListener("keydown", (e) => { if (["Enter", " "].includes(e.key)) { e.preventDefault(); chooseBin(e.target); } });
  $("clear-filter").addEventListener("click", () => { activeBin = null; draw(); renderDeals(); $("chart-caption").textContent = "Select a bar to inspect its deals."; });
  $("load-more").addEventListener("click", () => { visible += 30; renderDeals(); });
  $("download").addEventListener("click", () => { const csv = "seed,achieved_score,optimal_upper_bound,proven_optimal,nodes\n" + rows.map((r) => [r.seed, r.score, r.upper, r.exact, r.nodes].join(",")).join("\n") + "\n"; const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), a = document.createElement("a"); a.href = url; a.download = "scoundrel-oracle-outcomes.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
  fetch("outcomes.json").then((r) => { if (!r.ok) throw Error("Study data could not be loaded"); return r.json(); }).then((study) => {
    if (!Array.isArray(study.rows) || !study.rows.length || study.rows.some((r) => !Number.isFinite(r.score) || !Number.isFinite(r.upper) || r.upper < r.score)) throw Error("Study data failed validation");
    data = study;
    $("technical-method").textContent = `${data.rows.length} deals. Seed prefix: ${data.seedPrefix}. Search budget: ${data.settings.maxNodes.toLocaleString()} visited states, beam width ${data.settings.beamWidth}, ${data.settings.rollouts} complete initial rollouts. The beam phase may exceed the state budget before exhaustive refinement begins. A ten-minute emergency wall limit guards pathological runs; this study did not reach it. Terminal scores are verified by the independent rules transitions.`;
    $("study-date").textContent = "Computed " + new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(new Date(data.generatedAt));
    $("loading").hidden = true; $("report-content").hidden = false; render();
  }).catch((error) => { $("loading").textContent = error.message + ". Reload to try again."; });
})();
