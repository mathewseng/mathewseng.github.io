// Cube reports: how often each cube action is taken per variant, from the
// precomputed simulation in data/cube-report.json.
import { VARIANTS, MAX_NET } from "./engine.mjs";
import { $, el, pct, signed, fmtInt } from "./ui.js";

export function initReports() {
  let loaded = false;
  async function load() {
    if (loaded) return;
    loaded = true;
    const body = $("reports-body");
    try {
      const res = await fetch("./data/cube-report.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      render(body, await res.json());
    } catch (error) {
      body.replaceChildren(el("p", "error", `Could not load the report data: ${error.message}`));
    }
  }
  return { load };
}

function render(body, data) {
  body.replaceChildren();
  if (data.equilibrium) renderEquilibrium(body, data.equilibrium);
  const h = el("h2", "section-title", "Face-up play (hands tabled)");
  body.append(h);
  const intro = el("p", "muted");
  intro.textContent = `For comparison: ${fmtInt(data.meta.deals)} random two-player deals, each played with both hands face up under optimal cube strategy in all three variants (button on seat 1). Every flop decision enumerates all 666 turn-and-river runouts; river decisions are exact. Generated ${new Date(data.meta.generatedAt).toLocaleDateString()}.`;
  body.append(intro);
  const kpis = el("div", "report-grid");
  for (const id of ["flop", "river", "both"]) kpis.append(variantCard(id, data.variants[id], data.meta.deals));
  body.append(kpis);
  const windows = el("div", "report-grid");
  for (const id of ["flop", "both"]) windows.append(windowCard(`${VARIANTS[id].name}: flop doubling window`, data.variants[id].flopWindow, "Cubeless EV on the flop (pts)", "flop"));
  for (const id of ["river", "both"]) windows.append(windowCard(`${VARIANTS[id].name}: river decisions`, data.variants[id].riverWindow, "Net result known on the river (pts)", "river"));
  body.append(windows);
  const extra = el("div", "report-grid");
  extra.append(showdownCard(data.showdown));
  extra.append(comparisonCard(data));
  body.append(extra);
}
function renderEquilibrium(body, eq) {
  body.append(el("h2", "section-title", "Hidden-information equilibrium"));
  const intro = el("p", "muted");
  intro.textContent = `${fmtInt(eq.boards)} random boards, each solved with the sampled-hand CFR solver (${eq.precision} precision) with both hands hidden. Frequencies are averaged over the button's whole range on each board; the river rows of the flop-and-river variant are weighted by how often each cube state is reached.`;
  body.append(intro);
  const grid = el("div", "report-grid");
  for (const id of ["flop", "river", "both"]) {
    const v = eq.variants[id];
    const card = el("div", "report-card");
    card.append(el("h2", "", VARIANTS[id].name), el("p", "lede", VARIANTS[id].blurb));
    const k = el("div", "kpis");
    k.append(kpi("Button value", `${signed(v.value)} pts`, "equilibrium, per deal"));
    const f = v.flop ?? v.river;
    k.append(kpi(v.flop ? "Flop doubles" : "River doubles", pct(f.double, 1), "share of range"));
    k.append(kpi("Reply: drop / take / beaver", `${pct(f.drop, 0)} / ${pct(f.take, 0)} / ${pct(f.beaver, 0)}`, "given a double"));
    card.append(k);
    const t = el("table", "report-table");
    t.append(row(["Decision", "Frequency"], true));
    if (v.flop) {
      t.append(row(["Flop: button doubles", pct(v.flop.double)]));
      t.append(row(["   reply: drop / take / beaver", `${pct(v.flop.drop)} / ${pct(v.flop.take)} / ${pct(v.flop.beaver)}`]));
      t.append(row(["   beaver taken", pct(v.flop.beaverTake)]));
    }
    if (v.river && !v.river.c1) {
      t.append(row(["River: button doubles", pct(v.river.double)]));
      t.append(row(["   reply: drop / take / beaver", `${pct(v.river.drop)} / ${pct(v.river.take)} / ${pct(v.river.beaver)}`]));
    }
    if (v.river?.c1) {
      for (const [id2, label] of [["c1", "cube centered: non-button doubles"], ["o2", "non-button owns at 2: redoubles"], ["o4", "non-button owns at 4: redoubles"]]) {
        const r = v.river[id2];
        t.append(row([`River, ${label}`, `${pct(r.double)} (state reached ${pct(r.reach, 0)})`]));
        t.append(row(["   reply: drop / take / beaver", `${pct(r.drop)} / ${pct(r.take)} / ${pct(r.beaver)}`]));
      }
    }
    const wrap = el("div", "table-wrap");
    wrap.append(t);
    card.append(wrap);
    if (f.hist) card.append(freqHistogram(f.hist, v.flop ? "How often the button doubles, by board" : "How often the button doubles on the river, by board"));
    grid.append(card);
  }
  body.append(grid);
}
function freqHistogram(hist, title) {
  const wrap = el("div");
  wrap.append(el("h3", "", title));
  const t = el("table", "report-table");
  const max = Math.max(...hist, 1e-9);
  hist.forEach((p, i) => {
    const tr = el("tr");
    tr.append(el("td", "", `${i * 10}–${i * 10 + 10}% of range`), el("td", "num", pct(p, 0)));
    const bar = el("td");
    const b = el("div", "bar");
    const fill = el("i");
    fill.style.width = `${(p / max) * 100}%`;
    b.append(fill);
    bar.append(b);
    tr.append(bar);
    t.append(tr);
  });
  wrap.append(t);
  return wrap;
}
function kpi(label, value, note) {
  const k = el("div", "kpi");
  k.append(el("span", "stat-label", label), el("b", "", value));
  if (note) k.append(el("span", "stat-note", note));
  return k;
}
function share(n, d) {
  return d ? pct(n / d) : "—";
}
function variantCard(id, v, deals) {
  const card = el("div", "report-card");
  card.append(el("h2", "", VARIANTS[id].name));
  card.append(el("p", "lede", VARIANTS[id].blurb));
  const k = el("div", "kpis");
  k.append(kpi("Button EV", `${signed(v.outcome.btnMean)} pts`, "per deal, optimal play"));
  k.append(kpi("Avg. |result|", v.outcome.absMean.toFixed(2), "points swung"));
  k.append(kpi("Ends by drop", share(v.outcome.drops, deals)));
  k.append(kpi("Cube ≥ 2 at end", share(deals - (v.outcome.cubeLevels["1"] ?? 0), deals)));
  card.append(k);
  const t = el("table", "report-table");
  t.append(row(["Decision", "Taken", "Share"], true));
  if (v.flop) {
    const f = v.flop;
    t.append(row(["Flop: button doubles", fmtInt(f.double), share(f.double, f.n)]));
    t.append(row(["Flop: no double (not strong enough)", fmtInt(f.noDouble - f.tooGood), share(f.noDouble - f.tooGood, f.n)]));
    t.append(row(["Flop: no double (too good)", fmtInt(f.tooGood), share(f.tooGood, f.n)]));
    t.append(row(["   reply: drop", fmtInt(f.drop), share(f.drop, f.double)]));
    t.append(row(["   reply: take", fmtInt(f.take), share(f.take, f.double)]));
    t.append(row(["   reply: beaver", fmtInt(f.beaver), share(f.beaver, f.double)]));
  }
  if (v.river) {
    const states = v.riverByState ? Object.entries(v.riverByState) : [["all", v.river]];
    for (const [state, r] of states) {
      if (!r.n) continue;
      const tag = state === "all" ? "" : ` (${stateLabel(state)})`;
      const verb = state === "centered" || state === "all" ? "doubles" : "redoubles";
      t.append(row([`River${tag}: ${r.actor ?? "actor"} ${verb}`, fmtInt(r.double), share(r.double, r.n)]));
      t.append(row([`River${tag}: no double (too good)`, fmtInt(r.tooGood), share(r.tooGood, r.n)]));
      t.append(row([`   reply: drop / take / beaver`, `${fmtInt(r.drop)} / ${fmtInt(r.take)} / ${fmtInt(r.beaver)}`, `${share(r.drop, r.double)} / ${share(r.take, r.double)} / ${share(r.beaver, r.double)}`]));
    }
  }
  const levels = Object.entries(v.outcome.cubeLevels)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([l, n]) => `${l}: ${share(n, deals)}`)
    .join(" · ");
  t.append(row(["Final cube level", levels, ""]));
  const wrap = el("div", "table-wrap");
  wrap.append(t);
  card.append(wrap);
  return card;
}
function stateLabel(state) {
  return state === "centered" ? "cube centered, non-button" : state === "owned2" ? "non-button owns at 2" : state === "owned4" ? "non-button owns at 4" : state;
}
function row(cells, head = false) {
  const tr = el("tr");
  cells.forEach((c, i) => tr.append(el(head ? "th" : "td", i > 0 ? "num" : "", c)));
  return tr;
}
// Stacked-bar chart: per EV bin, share of double / no double / too good.
function windowCard(title, bins, xLabel, kind) {
  const card = el("div", "report-card");
  card.append(el("h2", "", title));
  card.append(el("p", "lede", kind === "flop" ? "Each bar is one point of cubeless EV for the player to act. Bar height is the share of deals landing in that bin that double; the gray remainder keeps the cube; amber marks spots that are too good to double." : "Each bar is one possible net result for the player to act. Height shows how often that result is doubled; amber marks results too good to double."));
  const W = 560,
    H = 190,
    padL = 34,
    padB = 30,
    padT = 12;
  const n = bins.length;
  const bw = (W - padL - 8) / n;
  const maxN = Math.max(...bins.map((b) => b.n), 1);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "chart");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", title);
  const ns = (tag, attrs) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, val);
    return node;
  };
  const plotH = H - padB - padT;
  svg.append(ns("line", { x1: padL, x2: W - 8, y1: padT + plotH, y2: padT + plotH, class: "axis" }));
  [0, 0.5, 1].forEach((f) => {
    const y = padT + plotH * (1 - f);
    const t = ns("text", { x: padL - 4, y: y + 3, "text-anchor": "end" });
    t.textContent = `${Math.round(f * 100)}%`;
    svg.append(t);
    if (f > 0) svg.append(ns("line", { x1: padL, x2: W - 8, y1: y, y2: y, class: "axis", "stroke-dasharray": "2 4" }));
  });
  bins.forEach((b, i) => {
    const x = padL + i * bw + 1;
    const w = Math.max(1, bw - 2);
    if (b.n) {
      const dbl = b.double / b.n,
        good = b.tooGood / b.n;
      const hD = plotH * dbl,
        hG = plotH * good;
      svg.append(ns("rect", { x, y: padT + plotH - hD, width: w, height: hD, fill: "#55d7b1", rx: 2 }));
      svg.append(ns("rect", { x, y: padT + plotH - hD - hG, width: w, height: hG, fill: "#eeac61", rx: 2 }));
      svg.append(ns("rect", { x, y: padT, width: w, height: plotH - hD - hG, fill: "#2a3036", rx: 2, opacity: 0.6 }));
      // density tick: how many deals sit in this bin
      const dens = ns("rect", { x, y: padT + plotH + 3, width: w, height: 4, fill: "#7fb5ff", opacity: 0.25 + 0.75 * (b.n / maxN), rx: 1 });
      svg.append(dens);
    }
    const g = ns("rect", { x, y: padT, width: w, height: plotH + 8, fill: "transparent" });
    g.append(ns("title", {}));
    g.querySelector("title").textContent = `${b.label}: ${fmtInt(b.n)} deals · double ${share(b.double, b.n)} · too good ${share(b.tooGood, b.n)}${b.double ? ` · replies drop ${share(b.drop, b.double)}, take ${share(b.take, b.double)}, beaver ${share(b.beaver, b.double)}` : ""}`;
    svg.append(g);
    if (i % 2 === 0 || n <= 12) {
      const t = ns("text", { x: x + w / 2, y: H - 10, "text-anchor": "middle" });
      t.textContent = b.label;
      svg.append(t);
    }
  });
  const xl = ns("text", { x: (W + padL) / 2, y: H - 0.5, "text-anchor": "middle" });
  xl.textContent = xLabel;
  svg.append(xl);
  card.append(svg);
  const legend = el("div", "legend");
  legend.innerHTML = `<span><i style="background:#55d7b1"></i>Double</span><span><i style="background:#eeac61"></i>Too good</span><span><i style="background:#2a3036"></i>No double</span><span><i style="background:#7fb5ff"></i>Deal density (bar under axis)</span>`;
  card.append(legend);
  return card;
}
function showdownCard(sd) {
  const card = el("div", "report-card");
  card.append(el("h2", "", "Showdown results without a cube"));
  card.append(el("p", "lede", "Net points for the button at cube 1 over all deals. The game is symmetric, so the mean is zero up to sampling noise."));
  const k = el("div", "kpis");
  k.append(kpi("Scoop rate", pct(sd.scoop), "either player"), kpi("Mean |net|", sd.meanAbs.toFixed(2), "points"), kpi("Draws (0)", pct(sd.hist[MAX_NET])));
  card.append(k);
  const t = el("table", "report-table");
  t.append(row(["Net for button", "Share", ""], true));
  const max = Math.max(...sd.hist);
  for (let i = sd.hist.length - 1; i >= 0; i--) {
    const x = i - MAX_NET;
    if (!sd.hist[i]) continue;
    const tr = el("tr");
    tr.append(el("td", "", signed(x, 0)), el("td", "num", pct(sd.hist[i])));
    const bar = el("td");
    const b = el("div", "bar alt");
    const fill = el("i");
    fill.style.width = `${(sd.hist[i] / max) * 100}%`;
    b.append(fill);
    bar.append(b);
    tr.append(bar);
    t.append(tr);
  }
  card.append(t);
  return card;
}
function comparisonCard(data) {
  const card = el("div", "report-card");
  card.append(el("h2", "", "Variants side by side"));
  card.append(el("p", "lede", "How much cube access is worth to the button, and how often the cube moves."));
  const t = el("table", "report-table");
  t.append(row(["Variant", "Button EV", "Flop double", "River double", "Drops", "Avg. cube"], true));
  for (const id of ["flop", "river", "both"]) {
    const v = data.variants[id];
    const f = v.flop ? share(v.flop.double, v.flop.n) : "—";
    const r = v.river ? share(v.river.double, v.river.n) : "—";
    const avgCube = Object.entries(v.outcome.cubeLevels).reduce((s, [l, n]) => s + Number(l) * n, 0) / data.meta.deals;
    t.append(row([VARIANTS[id].name, signed(v.outcome.btnMean), f, r, share(v.outcome.drops, data.meta.deals), avgCube.toFixed(2)]));
  }
  const wrap = el("div", "table-wrap");
  wrap.append(t);
  card.append(wrap);
  return card;
}
