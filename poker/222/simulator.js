// Table simulator: 2–7 players, step through the streets, edit any card.
import { FULL_DECK, dealTable, shuffledDeck, remainingDeck, VARIANTS } from "./engine.mjs";
import { $, el, button, cardEl, renderSeats, fmtInt, signed, STREET_CARDS, streetName } from "./ui.js";
import { cubeSituation, renderCubePanel, fillVariantSelect, parseCubeState } from "./cube-view.js";

export function initSimulator({ pool }) {
  const sim = {
    n: 2,
    hands: [],
    board: [],
    street: 0,
    btn: 0,
    variant: "both",
    cube: { level: 1, owner: null },
    selected: null,
    stats: null,
    token: 0,
    cache: new Map(),
  };
  const names = () => sim.hands.map((_, i) => `Seat ${i + 1}`);
  const visibleBoard = () => sim.board.slice(0, STREET_CARDS[sim.street]);
  const precision = () => $("precision").value;

  const countEl = $("player-count");
  for (let k = 2; k <= 7; k++) {
    const b = button(String(k), k === sim.n ? "active" : "", () => {
      sim.n = k;
      countEl.querySelectorAll("button").forEach((x) => x.classList.toggle("active", Number(x.textContent) === k));
      newDeal();
    });
    countEl.append(b);
  }
  fillVariantSelect($("sim-variant"), sim.variant);
  $("sim-variant").addEventListener("change", () => {
    sim.variant = $("sim-variant").value;
    render();
  });
  $("sim-btn").addEventListener("change", () => {
    sim.btn = Number($("sim-btn").value);
    render();
  });
  $("sim-cube-state").addEventListener("change", () => {
    sim.cube = parseCubeState($("sim-cube-state").value);
    render();
  });
  $("precision").addEventListener("change", () => recompute());
  $("sim-deal").addEventListener("click", newDeal);
  $("sim-board").addEventListener("click", () => {
    const deck = shuffledDeck().filter((c) => !sim.hands.some((h) => h.includes(c)));
    sim.board = deck.slice(0, 5);
    sim.selected = null;
    recompute();
  });
  $("sim-back").addEventListener("click", () => setStreet(sim.street - 1));
  $("sim-next").addEventListener("click", () => setStreet(sim.street + 1));

  function newDeal() {
    const t = dealTable(sim.n);
    sim.hands = t.hands;
    sim.board = t.board;
    sim.street = 0;
    sim.selected = null;
    if (sim.btn >= sim.n) sim.btn = 0;
    recompute();
  }
  function setStreet(s) {
    sim.street = Math.max(0, Math.min(3, s));
    recompute();
  }
  function key() {
    return JSON.stringify([sim.hands, visibleBoard(), precision()]);
  }
  async function recompute() {
    const k = key();
    const token = ++sim.token;
    const cached = sim.cache.get(k);
    if (cached) {
      sim.stats = cached;
      render();
      return;
    }
    sim.stats = null;
    render();
    try {
      const stats = await pool.stats(sim.hands, visibleBoard(), { precision: precision() });
      if (token !== sim.token) return;
      if (sim.cache.size > 60) sim.cache.delete(sim.cache.keys().next().value);
      sim.cache.set(k, stats);
      sim.stats = stats;
      render();
    } catch (error) {
      console.error(error);
      $("sim-meta").textContent = `Computation failed: ${error.message}`;
    }
  }
  function onCardClick(slot) {
    if (sim.selected && sim.selected.card === slot.card) sim.selected = null;
    else sim.selected = slot;
    render();
  }
  function swapIn(card) {
    const sel = sim.selected;
    if (!sel) return;
    const where = locate(card);
    const from = locate(sel.card);
    // Place `card` where the selected card was, and the selected card where `card` was (if held).
    setAt(from, card);
    if (where) setAt(where, sel.card);
    sim.selected = null;
    recompute();
  }
  function locate(card) {
    for (let i = 0; i < sim.hands.length; i++) {
      const j = sim.hands[i].indexOf(card);
      if (j >= 0) return { seat: i, index: j };
    }
    const b = sim.board.indexOf(card);
    return b >= 0 ? { seat: -1, index: b } : null;
  }
  function setAt(pos, card) {
    if (pos.seat < 0) sim.board[pos.index] = card;
    else sim.hands[pos.seat][pos.index] = card;
  }
  function render() {
    const board = visibleBoard();
    // streets
    const steps = $("sim-streets");
    steps.replaceChildren();
    for (let s = 0; s < 4; s++)
      steps.append(button(streetName(s), `${s === sim.street ? "active" : s < sim.street ? "done" : ""}`, () => setStreet(s)));
    $("sim-back").disabled = sim.street === 0;
    $("sim-next").disabled = sim.street === 3;
    $("sim-next").textContent = sim.street < 3 ? `Deal ${streetName(sim.street + 1).toLowerCase()} ▶` : "River dealt";
    // board
    const bc = $("sim-board-cards");
    bc.replaceChildren();
    for (let i = 0; i < 5; i++) {
      if (i < board.length) {
        const c = board[i];
        const node = cardEl(c, sim.selected?.card === c ? "selected clickable" : "clickable");
        node.addEventListener("click", () => onCardClick({ seat: -1, card: c }));
        bc.append(node);
      } else bc.append(el("span", "slot"));
    }
    const meta = $("sim-meta");
    meta.replaceChildren();
    if (sim.stats) {
      const s = sim.stats;
      meta.append(spanb(`${s.exact ? "Exact" : "Sampled"}: `, `${fmtInt(s.count)} runouts`), spanb("Compute: ", `${s.ms.toFixed(0)} ms`));
      if (!s.exact) meta.append(spanb("Possible: ", `${fmtInt(s.total)}`));
    } else meta.append(el("span", "muted", "Computing…"));
    // cube panel (2 players)
    const panel = $("sim-cube");
    panel.hidden = sim.n !== 2;
    if (sim.n === 2) {
      const situation = cubeSituation({ stats: sim.stats, street: sim.street, btn: sim.btn, variant: sim.variant, cube: sim.cube });
      renderCubePanel(panel, { faceEl: $("sim-cube-face"), titleEl: $("sim-cube-title"), subEl: $("sim-cube-sub"), bodyEl: $("sim-cube-body") }, situation, {
        names: names(),
        cube: sim.cube,
        street: sim.street,
        btn: sim.btn,
      });
    }
    renderSeats($("sim-seats"), {
      hands: sim.hands,
      board,
      stats: sim.stats,
      names: names(),
      btn: sim.n === 2 ? sim.btn : undefined,
      onCardClick,
      selected: sim.selected,
      pending: !sim.stats,
    });
    renderDeck();
  }
  function spanb(label, value) {
    const s = el("span");
    s.append(label, el("b", "", value));
    return s;
  }
  function renderDeck() {
    const grid = $("sim-deck");
    grid.replaceChildren();
    const held = new Map();
    sim.hands.forEach((h, i) => h.forEach((c) => held.set(c, `S${i + 1}`)));
    sim.board.forEach((c, i) => held.set(c, i < STREET_CARDS[sim.street] ? "B" : "b"));
    $("sim-deck-help").textContent = sim.selected
      ? `Selected ${sim.selected.seat < 0 ? "a board card" : `a card from Seat ${sim.selected.seat + 1}`}. Click a deck card to swap it in, or click the card again to cancel.`
      : "Click a card in a hand or on the board, then click a deck card to swap it in. Undealt board cards are marked b.";
    for (let r = 12; r >= 0; r--)
      for (let s = 3; s >= 0; s--) {
        const c = r * 4 + s;
        const who = held.get(c);
        const b = el("button", `deck-card${who ? " held" : ""}`);
        b.type = "button";
        b.append(cardEl(c));
        if (who) b.append(el("span", "who", who));
        b.title = who ? `Held: ${who}` : "Free";
        b.disabled = !sim.selected || (who != null && c === sim.selected.card);
        b.addEventListener("click", () => swapIn(c));
        grid.append(b);
      }
  }
  newDeal();
  return {
    get state() {
      return { hands: sim.hands.map((h) => h.slice()), board: visibleBoard(), btn: sim.btn, variant: sim.variant, cube: { ...sim.cube } };
    },
    load({ hands, board, btn, variant, cube }) {
      sim.n = hands.length;
      countEl.querySelectorAll("button").forEach((x) => x.classList.toggle("active", Number(x.textContent) === sim.n));
      sim.hands = hands.map((h) => h.slice());
      const rest = remainingDeck(hands, [board]);
      sim.board = board.concat(rest.slice(0, 5 - board.length));
      sim.street = board.length === 0 ? 0 : board.length === 3 ? 1 : board.length === 4 ? 2 : 3;
      if (btn != null) sim.btn = btn;
      if (variant) sim.variant = variant;
      if (cube) sim.cube = { ...cube };
      $("sim-variant").value = sim.variant;
      $("sim-btn").value = String(sim.btn);
      $("sim-cube-state").value = `${sim.cube.level}:${sim.cube.owner ?? ""}`;
      recompute();
    },
  };
}
void FULL_DECK;
void VARIANTS;
void signed;
