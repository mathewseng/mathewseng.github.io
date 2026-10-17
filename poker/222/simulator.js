// Table simulator: 2–7 players, step through the streets, edit any card.
// Two-player tables follow the information model: numbers are against the
// opponent's range while a cube action remains, and perfect information once
// hands are tabled (or when "Table hands" is ticked).
import { dealTable, shuffledDeck, remainingDeck, cardLabel } from "./engine.mjs";
import { $, el, button, badge, cardEl, cardIndex, emptySlot, renderSeats, fmtInt, STREET_CARDS, streetName } from "./ui.js";
import { cubeSituation, renderCubePanel, renderHiddenCubePanel, fillVariantSelect, fillDropSelect, fillScoringSelect, parseCubeState } from "./cube-view.js";
import { computeView, historyFromCube, takenOnOptions } from "./table-view.js";

const PlayingCards = window.PlayingCards;
const Sheet = window.Sheet;
const phone = matchMedia("(max-width: 700px)");

export function initSimulator({ pool }) {
  const sim = {
    n: 2,
    hands: [],
    board: [],
    street: 0,
    btn: 0,
    variant: "fr",
    scoring: "classic",
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
    const b = el("button", k === sim.n ? "active" : "", String(k));
    b.type = "button";
    b.setAttribute("aria-pressed", String(k === sim.n));
    b.addEventListener("click", () => {
      sim.n = k;
      syncCount();
      newDeal();
    });
    countEl.append(b);
  }
  function syncCount() {
    countEl.querySelectorAll("button").forEach((x) => {
      const on = Number(x.textContent) === sim.n;
      x.classList.toggle("active", on);
      x.setAttribute("aria-pressed", String(on));
    });
  }
  fillVariantSelect($("sim-variant"), sim.variant);
  fillScoringSelect($("sim-scoring"), sim.scoring);
  fillDropSelect($("sim-drop"), sim.dropUnit, sim.scoring);
  $("sim-scoring").addEventListener("change", () => {
    sim.scoring = $("sim-scoring").value;
    fillDropSelect($("sim-drop"), null, sim.scoring);
    sim.dropUnit = Number($("sim-drop").value);
    recompute();
  });
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
  $("sim-selection-cancel").addEventListener("click", () => {
    sim.selected = null;
    render();
  });
  $("sim-selection-deck").addEventListener("click", () => openDeckSheet());

  /* ---------- the deck: a side panel on desktop, a sheet on phones ---------- */
  const deckPanel = $("sim-deck-panel");
  const deckHome = deckPanel.parentElement;
  const deckDialog = $("sim-deck-dialog");
  let swapped = false;
  function placeDeck() {
    const target = phone.matches ? $("sim-deck-dialog-body") : deckHome;
    if (deckPanel.parentElement !== target) target.append(deckPanel);
  }
  function openDeckSheet() {
    if (!phone.matches || deckDialog.open) return;
    placeDeck();
    swapped = false;
    const card = sim.selected?.card;
    Sheet.open(deckDialog, {
      dismissible: true,
      returnFocus: false,
      onClose: () => {
        // Closing the sheet without swapping cancels the selection; focus goes
        // back to the card that was selected.
        if (!swapped && sim.selected) {
          sim.selected = null;
          render();
        }
        const back = card != null ? document.querySelector(`#view-sim button.playing-card[data-card="${card}"]`) : null;
        (back || $("sim-board-cards").querySelector("button") || $("main")).focus({ preventScroll: true });
      },
    });
  }
  phone.addEventListener("change", () => {
    if (deckDialog.open) deckDialog.close();
    placeDeck();
  });
  placeDeck();

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
      scoring: sim.scoring,
      precision: precision(),
      onProgress: (f) => {
        if (!sim.view) renderProgress(f);
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
      const meta = $("sim-meta");
      meta.replaceChildren(el("span", "error-text", `Computation failed: ${error.message}`));
    }
  }
  function onCardClick(slot) {
    if (sim.selected && sim.selected.card === slot.card) sim.selected = null;
    else sim.selected = slot;
    render();
    if (sim.selected) openDeckSheet();
  }
  function swapIn(card) {
    const sel = sim.selected;
    if (!sel) return;
    const where = locate(card);
    const from = locate(sel.card);
    setAt(from, card);
    if (where) setAt(where, sel.card);
    sim.selected = null;
    swapped = true;
    if (deckDialog.open) deckDialog.close();
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
  function renderProgress(f) {
    const meta = $("sim-meta");
    const bar = el("div", "progress progress--inline");
    bar.setAttribute("aria-busy", "true");
    const label = el("div", "progress-label");
    label.append(el("span", "", "Solving the equilibrium…"), el("span", "", `${Math.round(f * 100)}%`));
    const track = el("div", "bar");
    track.style.setProperty("--value", String(f));
    bar.append(label, track);
    meta.replaceChildren(bar);
  }
  function render() {
    const board = visibleBoard();
    const view = sim.view;
    const steps = $("sim-streets");
    steps.replaceChildren();
    for (let s = 0; s < 4; s++) {
      const b = button(streetName(s), `btn--sm step${s === sim.street ? " active" : s < sim.street ? " done" : ""}`, () => setStreet(s));
      b.setAttribute("aria-pressed", String(s === sim.street));
      steps.append(b);
    }
    $("sim-back").disabled = sim.street === 0;
    $("sim-next").disabled = sim.street === 3;
    $("sim-next").querySelector(".btn-label").textContent = sim.street < 3 ? `Deal ${streetName(sim.street + 1).toLowerCase()}` : "River dealt";
    const bc = $("sim-board-cards");
    bc.replaceChildren();
    for (let i = 0; i < 5; i++) {
      if (i < board.length) {
        const c = board[i];
        const isSelected = sim.selected?.card === c;
        const node = cardEl(c, `clickable${isSelected ? " selected" : ""}`);
        node.setAttribute("aria-label", `${cardLabel(c)} on the board${isSelected ? ", selected" : ""}: select to swap`);
        node.addEventListener("click", () => onCardClick({ seat: -1, card: c }));
        bc.append(node);
      } else bc.append(emptySlot());
    }
    const meta = $("sim-meta");
    meta.replaceChildren();
    if (view) {
      if (view.mode === "perfect") {
        const s = view.stats;
        meta.append(badge("Tabled · perfect information", "info"));
        meta.append(spanb(`${s.exact ? "Exact" : "Sampled"}: `, `${fmtInt(s.count)} runouts`), spanb("Compute: ", `${s.ms.toFixed(0)} ms`));
      } else {
        meta.append(badge("Hidden hands · numbers vs range"));
        const p0 = view.stats.players.find(Boolean);
        if (p0) meta.append(spanb(`${p0.exact ? "Exact" : "Sampled"}: `, `${fmtInt(p0.count)} opponent hands × runouts`));
        if (view.decision) meta.append(spanb("Solver: ", `${view.decision.solve.ms} ms`));
      }
    } else meta.append(el("span", "muted", "Computing…"));
    // The selection message lives in the board strip, next to the cards.
    const selection = $("sim-selection");
    if (sim.selected) {
      const what = sim.selected.seat < 0 ? `${cardLabel(sim.selected.card)} from the board` : `${cardLabel(sim.selected.card)} from Seat ${sim.selected.seat + 1}`;
      $("sim-selection-text").textContent = `Selected ${what}. Pick a deck card to swap it in, or select the card again to cancel.`;
      selection.hidden = false;
    } else selection.hidden = true;
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
    // held: card -> { mark (what the deck card shows), who (full description) }
    const held = new Map();
    sim.hands.forEach((h, i) => h.forEach((c) => held.set(c, { mark: String(i + 1), who: `held by Seat ${i + 1}` })));
    sim.board.forEach((c, i) => {
      const dealt = i < STREET_CARDS[sim.street];
      held.set(c, { mark: "B", who: dealt ? "on the board" : "an undealt board card", undealt: !dealt });
    });
    $("sim-deck-help").textContent = sim.selected
      ? `Pick a card to swap in for ${cardLabel(sim.selected.card)}.`
      : "Select a card in a hand or on the board, then pick a deck card to swap it in. Numbers mark the seat holding a card, B the board; undealt board cards are dimmed.";
    for (const id of PlayingCards.deckMatrix()) {
      const c = cardIndex(id);
      const who = held.get(c);
      const b = el("button", `deck-card${who ? " held" : ""}${who?.undealt ? " undealt" : ""}`);
      b.type = "button";
      b.append(cardEl(c));
      if (who) b.append(el("span", "owner", who.mark));
      const state = who ? who.who : "free";
      b.title = `${cardLabel(c)}: ${state}`;
      b.setAttribute("aria-label", `${cardLabel(c)}, ${state}`);
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
      syncCount();
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
