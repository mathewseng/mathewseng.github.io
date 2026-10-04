// Table simulator: 2–7 players, step through the streets, edit any card.
// Two-player tables follow the information model: numbers are against the
// opponent's range while a cube action remains, and perfect information once
// hands are tabled (or when "Table hands" is ticked).
import { dealTable, shuffledDeck, remainingDeck } from "./engine.mjs";
import { $, el, button, cardEl, renderSeats, fmtInt, STREET_CARDS, streetName } from "./ui.js";
import { cubeSituation, renderCubePanel, renderHiddenCubePanel, fillVariantSelect, fillDropSelect, parseCubeState } from "./cube-view.js";
import { computeView, historyFromCube, takenOnOptions } from "./table-view.js";

export function initSimulator({ pool }) {
  const sim = {
    n: 2,
    hands: [],
    board: [],
    street: 0,
    btn: 0,
    variant: "fr",
    dropUnit: 6,
    takenOn: null,
    cube: { level: 1, owner: null },
    selected: null,
    view: null,
    token: 0,
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
  fillDropSelect($("sim-drop"), sim.dropUnit);
  $("sim-drop").addEventListener("change", () => {
    sim.dropUnit = Number($("sim-drop").value);
    recompute();
  });
  $("sim-variant").addEventListener("change", () => {
    sim.variant = $("sim-variant").value;
    recompute();
  });
  $("sim-btn").addEventListener("change", () => {
    sim.btn = Number($("sim-btn").value);
    recompute();
  });
  $("sim-cube-state").addEventListener("change", () => {
    sim.cube = parseCubeState($("sim-cube-state").value);
    recompute();
  });
  $("sim-taken").addEventListener("change", () => {
    sim.takenOn = $("sim-taken").value || null;
    recompute();
  });
  $("sim-tabled").addEventListener("change", recompute);
  $("precision").addEventListener("change", recompute);
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
  function spec() {
    return {
      hands: sim.hands,
      board: visibleBoard(),
      street: sim.street,
      variant: sim.variant,
      btn: sim.btn,
      cube: sim.cube,
      cubeEnabled: sim.n === 2,
      history: historyFromCube(sim.cube, sim.variant, sim.street, sim.btn, sim.takenOn),
      forceTabled: $("sim-tabled").checked,
      dropUnit: sim.dropUnit,
      precision: precision(),
      onProgress: (f) => {
        const m = $("sim-meta");
        if (!sim.view) m.replaceChildren(el("span", "muted", `Solving the equilibrium… ${Math.round(f * 100)}%`));
      },
    };
  }
  async function recompute() {
    const token = ++sim.token;
    sim.view = null;
    render();
    try {
      const view = await computeView(pool, spec());
      if (token !== sim.token) return;
      sim.view = view;
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
    const view = sim.view;
    const steps = $("sim-streets");
    steps.replaceChildren();
    for (let s = 0; s < 4; s++) steps.append(button(streetName(s), `${s === sim.street ? "active" : s < sim.street ? "done" : ""}`, () => setStreet(s)));
    $("sim-back").disabled = sim.street === 0;
    $("sim-next").disabled = sim.street === 3;
    $("sim-next").textContent = sim.street < 3 ? `Deal ${streetName(sim.street + 1).toLowerCase()} ▶` : "River dealt";
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
    if (view) {
      if (view.mode === "perfect") {
        const s = view.stats;
        meta.append(el("span", "tag info-tag", "Tabled · perfect information"));
        meta.append(spanb(`${s.exact ? "Exact" : "Sampled"}: `, `${fmtInt(s.count)} runouts`), spanb("Compute: ", `${s.ms.toFixed(0)} ms`));
      } else {
        meta.append(el("span", "tag info-tag", "Hidden hands · numbers vs range"));
        const p0 = view.stats.players.find(Boolean);
        if (p0) meta.append(spanb(`${p0.exact ? "Exact" : "Sampled"}: `, `${fmtInt(p0.count)} opponent hands × runouts`));
        if (view.decision) meta.append(spanb("Solver: ", `${view.decision.solve.ms} ms`));
      }
    } else meta.append(el("span", "muted", "Computing…"));
    const panel = $("sim-cube");
    panel.hidden = sim.n !== 2;
    if (sim.n === 2) {
      const taken = $("sim-taken");
      const opts = sim.cube.owner != null ? takenOnOptions(sim.variant, sim.street) : [];
      taken.parentElement.hidden = opts.length < 2;
      if (opts.length >= 2) {
        const cur = taken.value;
        taken.replaceChildren();
        for (const o of opts) {
          const op = el("option", "", `Taken on the ${o}`);
          op.value = o;
          taken.append(op);
        }
        taken.value = opts.includes(cur) ? cur : opts[opts.length - 1];
        sim.takenOn = taken.value;
      }
      const els = { faceEl: $("sim-cube-face"), titleEl: $("sim-cube-title"), subEl: $("sim-cube-sub"), bodyEl: $("sim-cube-body") };
      if (!view || view.mode === "hidden") renderHiddenCubePanel(panel, els, view, { names: names(), cube: sim.cube, street: sim.street, btn: sim.btn, hands: sim.hands });
      else {
        const situation = cubeSituation({ stats: view.stats, street: sim.street, btn: sim.btn, variant: sim.variant, cube: { level: sim.cube.level, owner: view.action.holder ?? sim.cube.owner }, dropUnit: sim.dropUnit });
        renderCubePanel(panel, els, situation, { names: names(), cube: sim.cube, street: sim.street, btn: sim.btn });
        if (view.action.remaining) $("sim-cube-sub").textContent += " Hands are tabled by request: this is the face-up analysis, not the hidden-information equilibrium.";
      }
    }
    renderSeats($("sim-seats"), {
      hands: sim.hands,
      board,
      stats: view?.stats ?? null,
      names: names(),
      btn: sim.n === 2 ? sim.btn : undefined,
      onCardClick,
      selected: sim.selected,
      pending: !view,
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
