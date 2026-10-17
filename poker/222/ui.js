// Shared rendering helpers: cards (through shared/cards.js), colour scales
// mixed from the semantic tokens, seat panels, cube option rows, the showdown
// result card, toasts and focus-preserving action rows.
import {
  RANKS,
  SUITS,
  SCORINGS,
  scoringOf,
  MAX_NET,
  CATEGORIES,
  cardName,
  cardLabel,
  describeSplit,
  categoryOf,
} from "./engine.mjs";

const PlayingCards = window.PlayingCards;

export const $ = (id) => document.getElementById(id);
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
// Kit classes for the buttons the views build: "" / primary / quiet / danger,
// or any explicit list of kit classes.
const BUTTON_CLASS = { "": "btn", primary: "btn btn--primary", quiet: "btn btn--ghost", danger: "btn btn--danger" };
export function button(label, className = "", onClick, disabled = false) {
  const b = el("button", BUTTON_CLASS[className] ?? `btn ${className}`.trim(), label);
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

/* ---------- colour scales (mixed from the semantic tokens, no literals) ---------- */
const NONE = { color: "var(--muted)", background: "transparent" };
// Diverging scale for point equities: --bad below zero, --muted at zero, --good
// above. `max` is the magnitude that saturates the scale.
export function evColor(value, max = 3) {
  if (value == null || Number.isNaN(value)) return NONE;
  const r = Math.max(-1, Math.min(1, value / max));
  const t = Math.pow(Math.abs(r), 0.6);
  const tone = r >= 0 ? "var(--good)" : "var(--bad)";
  return {
    color: `color-mix(in oklab, ${tone} ${Math.round(t * 100)}%, var(--muted))`,
    background: `color-mix(in oklab, ${tone} ${Math.round(4 + 22 * t)}%, transparent)`,
  };
}
// Sequential scale for probabilities: faint to --good as p goes lo to hi.
export function pctColor(p, lo = 0, hi = 1) {
  if (p == null || Number.isNaN(p)) return NONE;
  const t = Math.max(0, Math.min(1, (p - lo) / (hi - lo)));
  return {
    color: `color-mix(in oklab, var(--good) ${Math.round(Math.pow(t, 0.8) * 100)}%, var(--muted))`,
    background: `color-mix(in oklab, var(--good) ${Math.round(3 + 24 * t)}%, transparent)`,
  };
}
export function paint(node, { color, background }) {
  node.style.color = color;
  node.style.background = background;
  return node;
}

/* ---------- cards ---------- */
// Engine card index (rank * 4 + suit, suits c d h s) <-> shared component id ("Ah").
export const cardStr = (c) => RANKS[c >> 2] + SUITS[c & 3];
export const cardIndex = (id) => RANKS.indexOf(id[0]) * 4 + SUITS.indexOf(id[1]);
// `extra` is a space-separated list: "selected" rings the card, "clickable"
// renders it as a <button>, anything else is passed through as a class.
export function cardEl(c, extra = "") {
  const flags = String(extra).split(/\s+/).filter(Boolean);
  const selected = flags.includes("selected");
  const clickable = flags.includes("clickable");
  const className = flags.filter((f) => f !== "selected" && f !== "clickable").join(" ");
  const node = PlayingCards.element(cardStr(c), {
    tag: clickable ? "button" : "span",
    className,
    selected,
    interactive: clickable,
    pressed: clickable ? selected : null,
    title: cardLabel(c),
    attrs: { "data-card": c },
  });
  return node;
}
export function cardBack(extra = "") {
  return PlayingCards.element("BACK", { className: extra, label: "Hidden card" });
}
export function emptySlot() {
  return PlayingCards.emptySlot();
}
export function cardsRow(cards, extra = "") {
  const row = el("div", "cards card-row");
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
export function badge(text, tone = "") {
  return el("span", `tag badge${tone ? ` badge--${tone} ${tone}` : ""}`, text);
}

/* ---------- toasts and live regions ---------- */
// One polite stack (#toast) and one assertive stack (#alerts) per page.
export function toast(text, { alert = false, duration = 3200 } = {}) {
  const stack = $(alert ? "alerts" : "toast");
  if (!stack) return;
  const node = el("div", `toast${alert ? " toast--alert" : ""}`);
  node.append(el("span", "", text));
  const close = el("button", "btn btn--ghost btn--icon btn--sm", "✕");
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss");
  close.addEventListener("click", () => node.remove());
  node.append(close);
  stack.replaceChildren(node);
  let timer = setTimeout(() => node.remove(), duration);
  node.addEventListener("mouseenter", () => clearTimeout(timer));
  node.addEventListener("mouseleave", () => (timer = setTimeout(() => node.remove(), 1500)));
}
// Rebuilds an action row while keeping keyboard focus on the same-labelled
// button (or the first enabled one) so a decision is not lost to a re-render.
export function replaceActions(row, buttons) {
  const focused = row.contains(document.activeElement) ? document.activeElement.textContent : null;
  row.replaceChildren(...buttons);
  if (focused == null) return;
  const next = buttons.find((b) => b.textContent === focused && !b.disabled) || buttons.find((b) => !b.disabled && b.tagName === "BUTTON");
  if (next) next.focus({ preventScroll: true });
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
    seat.setAttribute("aria-label", names?.[i] ?? `Seat ${i + 1}`);
    const head = el("div", "seat-head");
    const title = el("h3", "", names?.[i] ?? `Seat ${i + 1}`);
    head.append(title);
    const badges = el("div", "badges");
    if (btn === i) badges.append(badge("BTN", "warn"));
    if (!hand) {
      badges.append(badge("Hidden"));
      head.append(badges);
      seat.append(head);
      const row = el("div", "cards card-row");
      for (let k = 0; k < 6; k++) row.append(cardBack());
      seat.append(row);
      seat.append(el("p", "muted small", "Cards stay hidden until no cube action remains."));
      container.append(seat);
      return;
    }
    if (rangeMode) badges.append(badge(stats.conditioned ? "vs range after cube action" : "vs range", "info"));
    head.append(badges);
    const p = stats?.players?.[i];
    const total = el("div", "seat-total");
    const evNode = el("b", "", p ? signed(p.ev) : "…");
    if (p) paint(evNode, evColor(p.ev, scoring.maxNet * (n - 1) * 0.5));
    total.append(el("span", "stat-label", "EV"), evNode, el("span", "stat-note", "pts"));
    head.append(total);
    seat.append(head);
    const groups = el("div", "hand-groups");
    const sortedHand = hand.slice().sort((a, b) => b - a);
    const cardNode = (c) => {
      const isSelected = selected && selected.seat === i && selected.card === c;
      const node = cardEl(c, `${onCardClick ? "clickable" : ""} ${isSelected ? "selected" : ""}`);
      if (onCardClick) {
        node.setAttribute("aria-label", `${cardLabel(c)}${isSelected ? ", selected" : ""}: select to swap`);
        node.addEventListener("click", () => onCardClick({ seat: i, card: c }));
      }
      return node;
    };
    if (!flopOut) {
      const g = el("div", "hand-group whole");
      const row = el("div", "cards card-row");
      sortedHand.forEach((c) => row.append(cardNode(c)));
      g.append(row);
      const t = el("table", "preflop-table data-table");
      const thead = el("thead");
      const head = el("tr");
      head.append(el("th", "", "Hand"), el("th", "num", "EV"), el("th", "num", "Win"), el("th", "num", "Tie"));
      thead.append(head);
      t.append(thead);
      const tbody = el("tbody");
      [0, 1, 2].forEach((h) => {
        const tr = el("tr");
        tr.append(el("td", "", `Hand ${h + 1} · ${POINTS[h]} pt${POINTS[h] > 1 ? "s" : ""}`));
        const ev = el("td", "num");
        ev.append(paint(el("span", "stat-value", p ? signed(p.evHand[h]) : "…"), p ? evColor(p.evHand[h], maxHand[h] * 0.6) : NONE));
        const win = el("td", "num");
        win.append(paint(el("span", "stat-value", p ? pct(p.win[h]) : "…"), p ? pctColor(p.win[h], 0, n === 2 ? 1 : (1 / n) * 2.5) : NONE));
        const tie = el("td", "num");
        tie.append(paint(el("span", "stat-value", p ? pct(p.tie[h]) : "…"), p ? pctColor(p.tie[h], 0, 0.5) : NONE));
        tr.append(ev, win, tie);
        tbody.append(tr);
      });
      t.append(tbody);
      g.append(t);
      groups.append(g);
    } else {
      const split = describeSplit(hand, board);
      split.forEach((s, h) => {
        const g = el("div", `hand-group h${h + 1}`);
        const label = el("div", "hand-label");
        label.append(el("b", "", `Hand ${h + 1}`), el("span", "", `${POINTS[h]} pt${POINTS[h] > 1 ? "s" : ""}`));
        g.append(label);
        const row = el("div", "cards card-row");
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
  wrap.append(metric("Win", p ? pct(win) : "…", { heat: p ? pctColor(win, 0, n === 2 ? 1 : (1 / n) * 2.5) : null }));
  const tie = p ? p.tie[h] : null;
  wrap.append(metric("Tie", p ? pct(tie) : "…", { heat: p ? pctColor(tie, 0, 0.5) : null }));
  return wrap;
}

/* ---------- showdown result card ---------- */
// One card for the end of a hand, shared by the trainer and the online table:
// the headline (who won what and why), then the per-hand breakdown at showdown.
// result: { nets, reason, perHand?, scoop? }; me: the viewer's seat or null.
export function renderResultCard(container, { names, result, cube, me = null }) {
  container.replaceChildren();
  if (!result) return;
  const card = el("section", "result-card panel");
  card.setAttribute("aria-label", "Hand result");
  const nets = result.nets;
  const winners = nets.map((x, i) => (x > 0 ? i : -1)).filter((i) => i >= 0);
  const head = el("div", "result-head");
  const mine = me != null && me >= 0 ? nets[me] : null;
  const tone = mine == null ? "" : mine > 0 ? " is-good" : mine < 0 ? " is-bad" : "";
  const title = el("h2", `result-title${tone}`);
  if (mine != null) title.textContent = mine > 0 ? `You win ${Math.abs(mine)} point${Math.abs(mine) === 1 ? "" : "s"}` : mine < 0 ? `You lose ${Math.abs(mine)} point${Math.abs(mine) === 1 ? "" : "s"}` : "Push";
  else if (winners.length === 1) title.textContent = `${names[winners[0]]} wins ${nets[winners[0]]} point${nets[winners[0]] === 1 ? "" : "s"}`;
  else title.textContent = "Hand over";
  head.append(title);
  // The frame follows the viewer's outcome (good / bad), never the accent.
  if (mine) card.classList.add(mine > 0 ? "result-card--good" : "result-card--bad");
  const why = result.reason === "showdown" ? `Showdown at cube ${cube.level}` : result.reason;
  head.append(el("p", "muted small", why[0].toUpperCase() + why.slice(1)));
  card.append(head);
  if (result.perHand) {
    const wrap = el("div", "table-wrap");
    const t = el("table", "data-table result-table");
    const thead = el("thead");
    const tr = el("tr");
    tr.append(el("th", "", "Player"), el("th", "num", "Hand 1"), el("th", "num", "Hand 2"), el("th", "num", "Hand 3"), el("th", "num", "Scoop"), el("th", "num", `Net × ${cube.level}`));
    thead.append(tr);
    t.append(thead);
    const tbody = el("tbody");
    names.forEach((n, i) => {
      const row = el("tr", i === me ? "is-selected" : "");
      row.append(el("td", "", n + (i === me && !/^you$/i.test(n) ? " (you)" : "")));
      result.perHand[i].forEach((x) => row.append(el("td", `num${x > 0 ? " is-good" : x < 0 ? " is-bad" : ""}`, signed(x, 0))));
      const sc = result.scoop?.[i] ?? 0;
      row.append(el("td", `num${sc > 0 ? " is-good" : sc < 0 ? " is-bad" : ""}`, signed(sc, 0)));
      row.append(el("td", `num net${nets[i] > 0 ? " is-good" : nets[i] < 0 ? " is-bad" : ""}`, signed(nets[i], 0)));
      tbody.append(row);
    });
    t.append(tbody);
    wrap.append(t);
    card.append(wrap);
  } else {
    const list = el("div", "result-nets");
    names.forEach((n, i) => {
      const m = metric(n, signed(nets[i], 0), { heat: evColor(nets[i], Math.max(1, Math.abs(nets[i]))) });
      list.append(m);
    });
    card.append(list);
  }
  container.append(card);
}

/* ---------- cube ---------- */
export function cubeFace(level, ownerLabel, small = false) {
  const face = el("div", `cube-face${small ? " small" : ""}`);
  face.append(el("span", "cube-value", String(level)), el("span", "cube-owner", ownerLabel));
  return face;
}
// grade: { options: [{id, label, ev, prob}], best, chosen?, error? }.
// Rendered as option rows: label, mix, equity, a centred equity bar and the
// loss against the best option (the Dodge simulator's pattern).
export function renderOptionTable(container, grade, { preview = false, level = 1, note, chooser, faceUp = false } = {}) {
  container.replaceChildren();
  const list = el("div", "cube-options cube-table");
  const evOf = (o) => o.ev ?? o.eq;
  const bestEq = evOf(grade.options.find((o) => o.id === grade.best));
  const scaleMax = 10 * level;
  for (const o of grade.options) {
    const isBest = o.id === grade.best;
    const isChosen = !preview && o.id === grade.chosen;
    const row = el("div", `opt${isBest ? " best" : ""}${isChosen ? " chosen" : ""}`);
    const head = el("div", "opt-head");
    head.append(el("span", "opt-label", o.label));
    if (isBest) head.append(el("span", "opt-tag best", "Best"));
    if (isChosen) head.append(el("span", `opt-tag ${grade.error > 0.005 ? "bad" : "good"}`, grade.error > 0.005 ? `Chosen · −${grade.error.toFixed(2)}` : "Chosen ✓"));
    const value = el("span", "opt-value", signed(evOf(o)));
    value.style.color = evColor(evOf(o), scaleMax).color;
    head.append(value);
    row.append(head);
    const bar = el("div", "opt-bar");
    const fill = el("i");
    const t = Math.max(-1, Math.min(1, evOf(o) / scaleMax));
    fill.style.left = t < 0 ? `${50 + t * 50}%` : "50%";
    fill.style.width = `${Math.abs(t) * 50}%`;
    fill.style.setProperty("--scale", t >= 0 ? "var(--good)" : "var(--bad)");
    bar.append(fill);
    row.append(bar);
    const meta = el("div", "opt-meta-row");
    const mix = el("span", "opt-meta", `${faceUp ? "Play" : "Mix"} ${pct(o.prob, 0)}`);
    mix.style.color = pctColor(o.prob, 0, 1).color;
    meta.append(mix);
    meta.append(el("span", `opt-meta${isBest ? "" : " loss"}`, isBest ? "best equity" : `${signed(evOf(o) - bestEq)} vs best`));
    row.append(meta);
    list.append(row);
  }
  container.append(list);
  const notes = el("p", "muted cube-notes");
  const whose = !chooser ? "this" : chooser === "you" || chooser === "your" || chooser === "You" ? "your" : `${chooser}'s`;
  notes.textContent = [note, faceUp ? `Face-up minimax: equities for ${whose} hand against the opponent's actual hand, in points at cube ${level}.` : `Mix is how often the equilibrium takes each option with ${whose} hand; options in the mix have equal equity within the solve tolerance. Equities are against the opponent's equilibrium range at cube ${level}.`].filter(Boolean).join(" · ");
  container.append(notes);
}
export function categoryLabel(c) {
  return CATEGORIES[c];
}
export { cardName, cardLabel, categoryOf };
