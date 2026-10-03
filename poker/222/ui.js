// Shared rendering helpers: cards, color scales, seat panels, cube tables.
import {
  RANKS,
  SUITS,
  SYMBOLS,
  POINTS,
  SCOOP_BONUS,
  MAX_NET,
  CATEGORIES,
  cardName,
  cardLabel,
  describeSplit,
  categoryOf,
} from "./engine.mjs";

export const $ = (id) => document.getElementById(id);
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
export function button(label, className, onClick, disabled = false) {
  const b = el("button", className, label);
  b.type = "button";
  b.disabled = disabled;
  if (onClick) b.addEventListener("click", onClick);
  return b;
}
export const pct = (x, digits = 1) => (x == null || Number.isNaN(x) ? "—" : `${(x * 100).toFixed(digits)}%`);
export const signed = (x, digits = 2) =>
  x == null || Number.isNaN(x) ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(digits)}`;
export const fmtInt = (x) => Math.round(x).toLocaleString("en-US");
export const streetName = (s) => ["Preflop", "Flop", "Turn", "River"][s];
export const STREET_CARDS = [0, 3, 4, 5];

/* ---------- color scales ---------- */
// Diverging scale for point equities: red below zero, gray at zero, green above.
// `max` is the magnitude that saturates the scale.
function mix(a, b, t) {
  return a.map((x, i) => Math.round(x + (b[i] - x) * t));
}
const RED = [255, 125, 117],
  GREEN = [85, 215, 177],
  GRAY = [157, 167, 175],
  TEAL_DARK = [33, 62, 53],
  RED_DARK = [74, 36, 36];
export function evColor(value, max = 3) {
  if (value == null || Number.isNaN(value)) return { color: "var(--muted)", background: "transparent" };
  const r = Math.max(-1, Math.min(1, value / max));
  const t = Math.pow(Math.abs(r), 0.6);
  const fg = mix(GRAY, r >= 0 ? GREEN : RED, t);
  const bg = r >= 0 ? `rgba(85,215,177,${(0.04 + 0.22 * t).toFixed(3)})` : `rgba(255,125,117,${(0.04 + 0.22 * t).toFixed(3)})`;
  return { color: `rgb(${fg.join(",")})`, background: bg };
}
// Sequential scale for probabilities: faint to green as p goes 0 to 1.
export function pctColor(p, lo = 0, hi = 1) {
  if (p == null || Number.isNaN(p)) return { color: "var(--muted)", background: "transparent" };
  const t = Math.max(0, Math.min(1, (p - lo) / (hi - lo)));
  const fg = mix([120, 132, 142], GREEN, Math.pow(t, 0.8));
  return { color: `rgb(${fg.join(",")})`, background: `rgba(85,215,177,${(0.03 + 0.24 * t).toFixed(3)})` };
}
export function paint(node, { color, background }) {
  node.style.color = color;
  node.style.background = background;
  return node;
}

/* ---------- cards ---------- */
export function cardEl(c, extra = "") {
  const r = RANKS[c >> 2],
    s = c & 3;
  const node = el("span", `playing-card ${SUITS[s]}${extra ? ` ${extra}` : ""}`);
  node.innerHTML = `<span class="suit">${SYMBOLS[s]}</span><span class="rank">${r === "T" ? "10" : r}</span>`;
  node.title = cardName(c);
  node.dataset.card = c;
  return node;
}
export function cardBack(extra = "") {
  const node = el("span", `playing-card back${extra ? ` ${extra}` : ""}`);
  node.innerHTML = `<span class="rank">?</span>`;
  return node;
}
export function cardsRow(cards, extra = "") {
  const row = el("div", "cards");
  for (const c of cards) row.append(cardEl(c, extra));
  return row;
}
export function metric(label, value, { heat, note, big = false, title } = {}) {
  const m = el("div", `metric${big ? " big" : ""}`);
  m.append(el("span", "stat-label", label));
  const v = el("span", "stat-value", value);
  if (heat) paint(v, heat);
  m.append(v);
  if (note) m.append(el("span", "stat-note", note));
  if (title) m.title = title;
  return m;
}

/* ---------- seat panels ---------- */
// Renders every player's six cards, split into the three hands once a flop is
// out, with per-hand equities. stats is the finished pool result (or null while
// computing). opts: { names, btn, highlight, onCardClick, selected, pending }
export function renderSeats(container, { hands, board, stats, names, btn, highlight, onCardClick, selected, pending }) {
  container.replaceChildren();
  const n = hands.length;
  const flopOut = board.length >= 3;
  const maxHand = POINTS.map((p) => p * (n - 1));
  hands.forEach((hand, i) => {
    const seat = el("section", `seat${highlight === i ? " me" : ""}${pending ? " pending" : ""}`);
    const head = el("div", "seat-head");
    const title = el("h3", "", names?.[i] ?? `Seat ${i + 1}`);
    head.append(title);
    if (btn === i) head.append(el("span", "tag btn-tag", "BTN"));
    const p = stats?.players?.[i];
    const total = el("div", "seat-total");
    const evNode = el("b", "", p ? signed(p.ev) : "…");
    if (p) paint(evNode, evColor(p.ev, 10 * (n - 1) * 0.5));
    total.append(el("span", "stat-label", "EV"), evNode, el("span", "stat-note", "pts"));
    head.append(total);
    seat.append(head);
    const groups = el("div", "hand-groups");
    const sortedHand = hand.slice().sort((a, b) => b - a);
    const cardNode = (c, k) => {
      const node = cardEl(c, selected && selected.seat === i && selected.card === c ? "selected" : "");
      if (onCardClick) {
        node.classList.add("clickable");
        node.addEventListener("click", () => onCardClick({ seat: i, card: c }));
      }
      return node;
    };
    if (!flopOut) {
      const g = el("div", "hand-group whole");
      const row = el("div", "cards");
      sortedHand.forEach((c) => row.append(cardNode(c)));
      g.append(row);
      const t = el("table", "preflop-table");
      const head = el("tr");
      head.append(el("th", "", ""), el("th", "num", "EV"), el("th", "num", "Win"), el("th", "num", "Tie"));
      t.append(head);
      [0, 1, 2].forEach((h) => {
        const tr = el("tr");
        tr.append(el("td", "", `Hand ${h + 1} · ${POINTS[h]} pt${POINTS[h] > 1 ? "s" : ""}`));
        const ev = el("td", "num");
        ev.append(paint(el("span", "stat-value", p ? signed(p.evHand[h]) : "…"), p ? evColor(p.evHand[h], maxHand[h] * 0.6) : { color: "var(--muted)", background: "transparent" }));
        const win = el("td", "num");
        win.append(paint(el("span", "stat-value", p ? pct(p.win[h]) : "…"), p ? pctColor(p.win[h], 0, n === 2 ? 1 : (1 / n) * 2.5) : { color: "var(--muted)", background: "transparent" }));
        const tie = el("td", "num");
        tie.append(paint(el("span", "stat-value", p ? pct(p.tie[h]) : "…"), p ? pctColor(p.tie[h], 0, 0.5) : { color: "var(--muted)", background: "transparent" }));
        tr.append(ev, win, tie);
        t.append(tr);
      });
      g.append(t);
      groups.append(g);
    } else {
      const split = describeSplit(hand, board);
      split.forEach((s, h) => {
        const g = el("div", `hand-group h${h + 1}`);
        const label = el("div", "hand-label");
        label.append(el("b", "", `Hand ${h + 1}`), el("span", "", `${POINTS[h]} pt${POINTS[h] > 1 ? "s" : ""}`));
        g.append(label);
        const row = el("div", "cards");
        s.cards.forEach((c) => row.append(cardNode(c)));
        g.append(row);
        g.append(el("div", "made", s.label));
        g.append(handMetric(h, p, n, maxHand[h], true));
        groups.append(g);
      });
    }
    seat.append(groups);
    const foot = el("div", "seat-foot");
    const scoopEv = p ? p.evScoop : null;
    foot.append(
      metric("Scoop EV", p ? signed(scoopEv) : "…", { heat: p ? evColor(scoopEv, SCOOP_BONUS * (n - 1) * 0.5) : null, note: "pts" }),
      metric("Scoop", p ? pct(p.scoop) : "…", { heat: p ? pctColor(p.scoop, 0, 0.5) : null }),
    );
    if (n === 2 && p) {
      const hist = stats.hist;
      const scooped = hist ? hist[i === 0 ? 0 : 2 * MAX_NET] : null;
      foot.append(metric("Get scooped", pct(scooped), { heat: pctColor(1 - scooped, 0.5, 1) }));
    }
    seat.append(foot);
    container.append(seat);
  });
}
function handMetric(h, p, n, max, compact = false) {
  const wrap = el("div", `hand-metrics${compact ? " compact" : ""}`);
  const ev = p ? p.evHand[h] : null;
  wrap.append(metric(compact ? "EV" : `Hand ${h + 1} EV`, p ? signed(ev) : "…", { heat: p ? evColor(ev, max * 0.6) : null }));
  const win = p ? p.win[h] : null;
  wrap.append(metric("Win", p ? pct(win) : "…", { heat: p ? pctColor(win, 0, n === 2 ? 1 : 1 / n * 2.5) : null }));
  const tie = p ? p.tie[h] : null;
  wrap.append(metric("Tie", p ? pct(tie) : "…", { heat: p ? pctColor(tie, 0, 0.5) : null }));
  return wrap;
}

/* ---------- cube ---------- */
export function cubeFace(level, ownerLabel, small = false) {
  const face = el("div", `cube-face${small ? " small" : ""}`);
  face.append(el("span", "cube-value", String(level)), el("span", "cube-owner", ownerLabel));
  return face;
}
export const ACTION_LABELS = {
  noDouble: "No double",
  double: "Double",
  redouble: "Redouble",
  drop: "Drop",
  take: "Take",
  beaver: "Beaver",
};
// Renders the option table for one decision. kind: double | response | beaverReply.
// view: { options, best, chosen, error } from gradeChoice; a: the analysis.
export function renderDecisionTable(container, a, kind, grade, { chooser, level, preview = false, label } = {}) {
  container.replaceChildren();
  const table = el("table", "cube-table");
  const head = el("tr");
  head.append(el("th", "", "Option"), el("th", "num", "Equity (pts)"), el("th", "num", "Loss"), el("th", "", ""));
  table.append(head);
  const bestEq = grade.options.find((o) => o.id === grade.best).eq;
  for (const o of grade.options) {
    const tr = el("tr", `${o.id === grade.best ? "best" : ""}${!preview && o.id === grade.chosen ? " chosen" : ""}`);
    const name = el("td", "", labelFor(kind, o, a));
    const eq = el("td", "num");
    paint(eq, evColor(o.eq, 10 * level));
    eq.textContent = signed(o.eq);
    const loss = el("td", "num muted", o.id === grade.best ? "—" : signed(o.eq - bestEq));
    const flag = el("td", "flag");
    if (o.id === grade.best) flag.append(el("span", "tag good", "Best"));
    if (!preview && o.id === grade.chosen) flag.append(el("span", `tag ${grade.error > 1e-6 ? "bad" : "good"}`, grade.error > 1e-6 ? `Chosen · −${grade.error.toFixed(2)}` : "Chosen ✓"));
    tr.append(name, eq, loss, flag);
    table.append(tr);
  }
  container.append(table);
  const notes = el("p", "muted cube-notes");
  const parts = [];
  if (kind === "double") {
    parts.push(`Cubeless EV ${signed(a.cubeless)} pts · win ${pct(a.winProb)}`);
    parts.push(`If doubled, the correct reply is ${a.response}${a.response === "beaver" ? ` (then ${a.beaverReply})` : ""}`);
    if (a.tooGood) parts.push("Too good to double: play on for the bigger score");
  } else if (kind === "response") parts.push(`Drop costs ${a.drop.toFixed(0)}; a take plays on at ${2 * level}; a beaver plays on at ${4 * level} with the cube kept`);
  else parts.push(`Dropping the beaver costs ${(-a.beaverDrop).toFixed(0)}; taking plays on at ${4 * level}`);
  if (label) parts.unshift(label);
  notes.textContent = parts.join(" · ");
  container.append(notes);
}
function labelFor(kind, o, a) {
  if (kind === "double") {
    if (o.id === "noDouble") return a.level > 1 ? "No redouble" : "No double";
    const verb = a.level > 1 ? "Redouble" : "Double";
    return `${verb} → ${a.response === "drop" ? "they drop" : a.response === "take" ? "they take" : "they beaver"}`;
  }
  if (kind === "response") return o.id === "drop" ? "Drop" : o.id === "take" ? "Take" : `Beaver → they ${a.beaverReply}`;
  return o.label;
}
export function categoryLabel(c) {
  return CATEGORIES[c];
}
export { cardName, cardLabel, categoryOf };
