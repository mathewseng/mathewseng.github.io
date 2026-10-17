// Cube reports: equilibrium cube play per variant from the precomputed solves
// in data/cube-report.json, plus face-up play for comparison.
import { VARIANTS, VARIANT_ORDER } from "./engine.mjs";
import { reraiseName } from "./cube-rules.mjs";
import { $, el, pct, signed, fmtInt } from "./ui.js";

export function initReports() {
  let loaded = false;
  async function load() {
    if (loaded) return;
    loaded = true;
    const body = $("reports-body");
    const loading = $("reports-loading");
    try {
      const res = await fetch("./data/cube-report.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      render(body, await res.json());
    } catch (error) {
      body.replaceChildren(el("div", "error", `Could not load the report data: ${error.message}`));
    }
    loading.hidden = true;
    body.hidden = false;
  }
  return { load };
}
const seatName = (side, owner) => (side === 0 ? "button" : "non-button");
const stateLabel = (st) => (st.owner == null ? `cube centered at ${st.level}` : `${seatName(st.owner)} owns at ${st.level}`);
function nodeRows(nodes, actorSide, base, minReach = 0.001) {
  const rows = [];
  nodes.forEach((nd, k) => {
    if (k > 0 && nd.reach < minReach) return;
    const who = seatName(nd.side);
    if (k === 0) rows.push([`${who} ${base > 1 ? "redoubles" : "doubles"}`, pct(nd.freq.double), `reached ${pct(nd.reach, 1)}`]);
    else {
      const name = k === 1 ? "reply to the double" : `reply to the ${reraiseName(k - 1).toLowerCase()}`;
      const re = nd.freq.reraise != null ? ` / ${reraiseName(k).toLowerCase()} ${pct(nd.freq.reraise)}` : "";
      rows.push([`   ${who}: ${name} (to ${nd.offerLevel})`, `drop ${pct(nd.freq.drop)} / take ${pct(nd.freq.take)}${re}`, `reached ${pct(nd.reach, 1)}`]);
    }
  });
  return rows;
}
function render(body, data) {
  body.replaceChildren();
  if (data.sweep) renderSweep(body, data.sweep);
  const eq = data.equilibrium;
  body.append(el("h2", "section-title", `Hidden-information equilibrium, drop cost ${data.meta.dropUnit}`));
  const intro = el("p", "muted section-intro");
  intro.textContent = `Every variant solved with the sampled-hand CFR+ solver with both hands hidden (drop costs ${data.meta.dropUnit} per unit of the cube, cube capped at ${data.meta.maxCube}). Flop and river variants are averaged over ${eq.variants.f.boards} random boards; preflop variants are one game each, solved over sampled flops and runouts. Frequencies are over the acting player's whole range; later streets are weighted by how often each cube state is reached. Generated ${new Date(data.meta.generatedAt).toLocaleDateString()}.`;
  body.append(intro);
  const grid = el("div", "report-grid");
  for (const id of VARIANT_ORDER) {
    const v = eq.variants[id];
    if (!v) continue;
    const card = el("div", "report-card panel");
    card.append(el("h2", "", VARIANTS[id].name), el("p", "lede", VARIANTS[id].blurb));
    const k = el("div", "kpis stat-strip");
    const n0 = v.entry?.nodes[0];
    k.append(kpi("Button value", `${signed(v.value)} pts`, "equilibrium, per deal"));
    if (n0) k.append(kpi(`${v.entryStreet[0].toUpperCase() + v.entryStreet.slice(1)} doubles`, pct(n0.freq.double, 1), "share of range"));
    const n1 = v.entry?.nodes[1];
    if (n1) k.append(kpi("Reply: drop / take / beaver", `${pct(n1.freq.drop, 0)} / ${pct(n1.freq.take, 0)} / ${pct(n1.freq.reraise ?? 0, 0)}`, "given a double"));
    k.append(kpi("Solve accuracy", `±${v.exploitability.toFixed(3)}`, "exploitability bound, pts"));
    card.append(k);
    const t = el("table", "report-table data-table");
    t.append(thead(["Decision", "Frequency", ""]));
    const tb = el("tbody");
    t.append(tb);
    if (v.entry) for (const r of nodeRows(v.entry.nodes, 0, 1)) tb.append(row(r));
    for (const street of ["flop", "river"]) {
      const states = v.later?.[street];
      if (!states) continue;
      const keys = Object.keys(states).sort((a, b) => states[b].entry - states[a].entry);
      for (const key of keys) {
        const st = states[key];
        if (st.entry < 0.005) continue;
        tb.append(row([`${street[0].toUpperCase() + street.slice(1)}, ${stateLabel(st)} (reached ${pct(st.entry, 1)})`, "", ""], true));
        for (const r of nodeRows(st.nodes, st.actorSide, st.level, 0.002)) tb.append(row(r));
      }
    }
    const wrap = el("div", "table-wrap");
    wrap.append(t);
    card.append(wrap);
    if (v.boards > 1 && v.doubleHist) card.append(freqHistogram(v.doubleHist, `How often the ${v.entryStreet} double is made, by board`));
    grid.append(card);
  }
  body.append(grid);
  if (data.faceUp) renderFaceUp(body, data.faceUp, data.meta);
}
// Drop-cost sweep: how the cube game changes as dropping gets more expensive.
function renderSweep(body, sweep) {
  const systems = sweep.systems ?? [{ id: "classic", name: "3-2-1, scoop +4", dropUnits: sweep.dropUnits, variants: sweep.variants }];
  for (const system of systems) renderSweepSystem(body, sweep, system);
}
function renderSweepSystem(body, sweep, system) {
  body.append(el("h2", "section-title", `Drop cost sweep · ${system.name}`));
  const intro = el("p", "muted section-intro");
  intro.textContent = `Hands worth ${system.points ? system.points.join("-") : "3-2-1"} with a ${system.scoop ?? 4}-point scoop bonus. Each variant solved at every drop cost from ${system.dropUnits[0]} to ${system.dropUnits[system.dropUnits.length - 1]} points per unit of the cube (${sweep.precision} precision; flop and river variants averaged over ${sweep.boards} random boards, preflop variants one game each). "Doubles" is the share of the acting range that doubles on the first cube street, the reply shares are given a double, and "ends by drop" is how often the whole hand ends with somebody dropping.`;
  body.append(intro);
  const grid = el("div", "report-grid report-grid--wide");
  for (const id of VARIANT_ORDER) {
    const rows = system.variants[id];
    if (!rows) continue;
    const card = el("div", "report-card panel");
    card.append(el("h2", "", VARIANTS[id].name));
    const t = el("table", "report-table data-table");
    t.append(thead(["Drop cost", "Button value", "Doubles", "Drop / take / beaver", "Ends by drop", ""]));
    const tb = el("tbody");
    t.append(tb);
    const maxEnd = Math.max(...system.dropUnits.map((d) => rows[d]?.endsByDrop ?? 0), 1e-9);
    for (const d of system.dropUnits) {
      const r = rows[d];
      if (!r) continue;
      const tr = el("tr");
      tr.append(el("td", "", `${d}`), el("td", "num", signed(r.value)), el("td", "num", pct(r.doubles, 0)), el("td", "num", r.reply ? `${pct(r.reply.drop, 0)} / ${pct(r.reply.take, 0)} / ${pct(r.reply.reraise, 0)}` : "—"), el("td", "num", pct(r.endsByDrop, 1)));
      const bar = el("td", "bar-cell");
      const b = el("div", "bar");
      b.style.setProperty("--value", String(r.endsByDrop / maxEnd));
      b.style.setProperty("--bar-color", "var(--warn)");
      b.setAttribute("aria-hidden", "true");
      bar.append(b);
      tr.append(bar);
      tb.append(tr);
    }
    const wrap = el("div", "table-wrap");
    wrap.append(t);
    card.append(wrap);
    grid.append(card);
  }
  body.append(grid);
}
function renderFaceUp(body, fu, meta) {
  body.append(el("h2", "section-title", "Face-up play (hands tabled)"));
  const intro = el("p", "muted section-intro");
  intro.textContent = `For comparison: ${fmtInt(fu.deals)} random deals played with both hands open under minimax cube play (same ${fu.dropUnit ?? meta.dropUnit}-point drop and raise chain) for the variants without a preflop cube. Every flop decision enumerates all 666 turn-and-river runouts; river decisions are exact.`;
  body.append(intro);
  const grid = el("div", "report-grid");
  for (const id of ["f", "r", "fr"]) {
    const v = fu.variants[id];
    const card = el("div", "report-card panel");
    card.append(el("h2", "", VARIANTS[id].name));
    const k = el("div", "kpis stat-strip");
    k.append(kpi("Button EV", `${signed(v.outcome.btnMean)} pts`, "per deal, face up"), kpi("Avg. |result|", v.outcome.absMean.toFixed(2), "points swung"), kpi("Ends by drop", pct(v.outcome.drops / fu.deals)));
    card.append(k);
    const t = el("table", "report-table data-table");
    t.append(thead(["Decision", "Share"]));
    const tb = el("tbody");
    t.append(tb);
    for (const [street, d] of [["flop", v.flop], ["river", v.river]]) {
      if (!d) continue;
      tb.append(row([`${street[0].toUpperCase() + street.slice(1)}: doubles`, pct(d.double / d.n)]));
      tb.append(row([`   no double (too good)`, pct(d.tooGood / d.n)]));
      tb.append(row([`   reply: drop / take / beaver`, `${pct(d.drop / Math.max(1, d.double))} / ${pct(d.take / Math.max(1, d.double))} / ${pct(d.reraise / Math.max(1, d.double))}`]));
      tb.append(row([`   chains past the beaver`, pct(d.deeper / Math.max(1, d.double))]));
    }
    const levels = Object.entries(v.outcome.cubeLevels)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([l, n]) => `${l}: ${pct(n / fu.deals, 0)}`)
      .join(" · ");
    tb.append(row(["Final cube level", levels]));
    const wrap = el("div", "table-wrap");
    wrap.append(t);
    card.append(wrap);
    grid.append(card);
  }
  body.append(grid);
}
function kpi(label, value, note) {
  const k = el("div", "kpi stat");
  k.append(el("span", "stat-label", label), el("b", "stat-value", value));
  if (note) k.append(el("span", "stat-delta", note));
  return k;
}
function thead(cells) {
  const head = el("thead");
  head.append(row(cells, true));
  return head;
}
// A leading run of spaces in the first cell marks an indented sub-row; a head
// row whose only text is in the first cell is a group label spanning the table.
function row(cells, head = false) {
  const tr = el("tr");
  const group = head && cells.length > 1 && cells.slice(1).every((x) => x === "");
  if (group) {
    const cell = el("th", "group", cells[0]);
    cell.colSpan = cells.length;
    cell.scope = "colgroup";
    tr.append(cell);
    return tr;
  }
  cells.forEach((c, i) => {
    const indented = typeof c === "string" && /^\s/.test(c);
    const cell = el(head ? "th" : "td", i > 0 ? "num" : indented ? "sub" : "", typeof c === "string" ? c.trim() : c);
    if (head) cell.scope = "col";
    tr.append(cell);
  });
  return tr;
}
function freqHistogram(hist, title) {
  const wrap = el("div");
  wrap.append(el("h3", "", title));
  const t = el("table", "report-table data-table");
  const tb = el("tbody");
  t.append(tb);
  const max = Math.max(...hist, 1e-9);
  hist.forEach((p, i) => {
    const tr = el("tr");
    tr.append(el("td", "", `${i * 10}–${i * 10 + 10}% of range`), el("td", "num", pct(p, 0)));
    const bar = el("td", "bar-cell");
    const b = el("div", "bar");
    b.style.setProperty("--value", String(p / max));
    b.style.setProperty("--bar-color", "var(--good)");
    b.setAttribute("aria-hidden", "true");
    bar.append(b);
    tr.append(bar);
    tb.append(tr);
  });
  const tw = el("div", "table-wrap");
  tw.append(t);
  wrap.append(tw);
  return wrap;
}
