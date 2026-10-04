// Shared rendering helpers: cards, color scales, seat panels, cube tables.
import {
  RANKS,
  SUITS,
  SYMBOLS,
  SCORINGS,
  scoringOf,
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
  const rangeMode = stats?.mode === "range";
  const scoring = scoringOf(stats?.scoring ?? SCORINGS.classic);
  const POINTS = scoring.points,
    SCOOP_BONUS = scoring.scoop;
  const maxHand = POINTS.map((p) => p * (n - 1));
  hands.forEach((hand, i) => {
    const seat = el("section", `seat${highlight === i ? " me" : ""}${pending ? " pending" : ""}`);
    const head = el("div", "seat-head");
    const title = el("h3", "", names?.[i] ?? `Seat ${i + 1}`);
    head.append(title);
    if (btn === i) head.append(el("span", "tag btn-tag", "BTN"));
    if (!hand) {
      head.append(el("span", "tag", "Hidden"));
      seat.append(head);
      const row = el("div", "cards");
      for (let k = 0; k < 6; k++) row.append(cardBack());
      seat.append(row);
      seat.append(el("p", "muted small", "Cards stay hidden until no cube action remains."));
      container.append(seat);
      return;
    }
    if (rangeMode) head.append(el("span", "tag range-tag", stats.conditioned ? "vs range after cube action" : "vs range"));
    const p = stats?.players?.[i];
    const total = el("div", "seat-total");
    const evNode = el("b", "", p ? signed(p.ev) : "…");
    if (p) paint(evNode, evColor(p.ev, scoring.maxNet * (n - 1) * 0.5));
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
    if (n === 2 && p?.hist) {
      const scooped = p.hist[MAX_NET - scoring.maxNet];
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
// grade: { options: [{id, label, ev, prob}], best, chosen?, error? }.
export function renderOptionTable(container, grade, { preview = false, level = 1, note, chooser, faceUp = false } = {}) {
  container.replaceChildren();
  const table = el("table", "cube-table");
  const head = el("tr");
  head.append(el("th", "", "Option"), el("th", "num", faceUp ? "Play" : "Mix"), el("th", "num", "Equity (pts)"), el("th", "num", "Loss"), el("th", "", ""));
  table.append(head);
  const evOf = (o) => (o.ev ?? o.eq);
  const bestEq = evOf(grade.options.find((o) => o.id === grade.best));
  for (const o of grade.options) {
    const tr = el("tr", `${o.id === grade.best ? "best" : ""}${!preview && o.id === grade.chosen ? " chosen" : ""}`);
    const mix = el("td", "num");
    const mixV = el("span", "stat-value", pct(o.prob, 0));
    paint(mixV, pctColor(o.prob, 0, 1));
    mix.append(mixV);
    const eq = el("td", "num");
    paint(eq, evColor(evOf(o), 10 * level));
    eq.textContent = signed(evOf(o));
    const loss = el("td", "num muted", o.id === grade.best ? "—" : signed(evOf(o) - bestEq));
    const flag = el("td", "flag");
    if (o.id === grade.best) flag.append(el("span", "tag good", "Best"));
    if (!preview && o.id === grade.chosen) flag.append(el("span", `tag ${grade.error > 0.005 ? "bad" : "good"}`, grade.error > 0.005 ? `Chosen · −${grade.error.toFixed(2)}` : "Chosen ✓"));
    tr.append(el("td", "", o.label), mix, eq, loss, flag);
    table.append(tr);
  }
  container.append(table);
  const notes = el("p", "muted cube-notes");
  const whose = !chooser ? "this" : chooser === "you" || chooser === "your" || chooser === "You" ? "your" : `${chooser}'s`;
  notes.textContent = [note, faceUp ? `Face-up minimax: equities for ${whose} hand against the opponent's actual hand, in points at cube ${level}.` : `Mix is how often the equilibrium takes each option with ${whose} hand; options in the mix have equal equity within the solve tolerance. Equities are against the opponent's equilibrium range at cube ${level}.`].filter(Boolean).join(" · ");
  container.append(notes);
}
export function categoryLabel(c) {
  return CATEGORIES[c];
}
export { cardName, cardLabel, categoryOf };
