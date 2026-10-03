// Spot solver: type any hands, board, button and cube state, then solve.
// In a two-player spot the second hand may be left blank: the first seat is
// then solved against the opponent's full range.
import { parseCards, cardName, dealTable } from "./engine.mjs";
import { $, el, button, cardEl, renderSeats, fmtInt } from "./ui.js";
import { cubeSituation, renderCubePanel, renderHiddenCubePanel, fillVariantSelect, parseCubeState } from "./cube-view.js";
import { computeView, historyFromCube, takenOnOptions } from "./table-view.js";

export function initSpot({ pool, sim }) {
  const st = { n: 2, token: 0, result: null };
  const countEl = $("spot-count");
  for (let k = 2; k <= 7; k++)
    countEl.append(
      button(String(k), k === st.n ? "active" : "", () => {
        st.n = k;
        countEl.querySelectorAll("button").forEach((x) => x.classList.toggle("active", Number(x.textContent) === k));
        buildInputs();
      }),
    );
  fillVariantSelect($("spot-variant"), "fr");
  const refreshTaken = () => {
    const cube = parseCubeState($("spot-cube-state").value);
    const board = (() => {
      try {
        return parseCards($("spot-board").value);
      } catch {
        return [];
      }
    })();
    const street = board.length === 0 ? 0 : board.length - 2;
    const opts = cube.owner != null ? takenOnOptions($("spot-variant").value, street) : [];
    const sel = $("spot-taken");
    sel.parentElement.hidden = opts.length < 2;
    if (opts.length >= 2) {
      const cur = sel.value;
      sel.replaceChildren();
      for (const o of opts) {
        const op = el("option", "", `Taken on the ${o}`);
        op.value = o;
        sel.append(op);
      }
      sel.value = opts.includes(cur) ? cur : opts[opts.length - 1];
    }
  };
  for (const id of ["spot-variant", "spot-cube-state", "spot-board"]) $(id).addEventListener("change", refreshTaken);
  function buildInputs(values = []) {
    const wrap = $("spot-hands");
    wrap.replaceChildren();
    for (let i = 0; i < st.n; i++) {
      const label = el("label", "field");
      label.append(el("span", "label", `Seat ${i + 1} (6 cards${st.n === 2 && i === 1 ? ", or blank for unknown" : ""})`));
      const input = el("input");
      input.id = `spot-hand-${i}`;
      input.placeholder = st.n === 2 && i === 1 ? "blank = unknown hand" : "e.g. As Ad Kh 9h 7c 2s";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.value = values[i] ?? "";
      label.append(input);
      wrap.append(label);
    }
    $("spot-cube-controls").hidden = st.n !== 2;
  }
  buildInputs();
  function fillRandom() {
    const t = dealTable(st.n);
    buildInputs(t.hands.map((h) => h.map(cardName).join(" ")));
    $("spot-board").value = t.board.slice(0, 3).map(cardName).join(" ");
  }
  $("spot-random").addEventListener("click", () => {
    fillRandom();
    solve();
  });
  $("spot-from-sim").addEventListener("click", () => {
    const s = sim.state;
    st.n = s.hands.length;
    countEl.querySelectorAll("button").forEach((x) => x.classList.toggle("active", Number(x.textContent) === st.n));
    buildInputs(s.hands.map((h) => h.map(cardName).join(" ")));
    $("spot-board").value = s.board.map(cardName).join(" ");
    $("spot-variant").value = s.variant;
    $("spot-btn").value = String(s.btn);
    $("spot-cube-state").value = `${s.cube.level}:${s.cube.owner ?? ""}`;
    solve();
  });
  $("spot-form").addEventListener("submit", (e) => {
    e.preventDefault();
    solve();
  });
  function readSpot() {
    const hands = [];
    const seen = new Set();
    for (let i = 0; i < st.n; i++) {
      const text = $(`spot-hand-${i}`).value.trim();
      if (!text && st.n === 2 && i === 1) {
        hands.push(null);
        continue;
      }
      const cards = parseCards(text);
      if (cards.length !== 6) throw new Error(`Seat ${i + 1} needs exactly 6 cards (got ${cards.length}).`);
      for (const c of cards) {
        if (seen.has(c)) throw new Error(`${cardName(c)} appears twice.`);
        seen.add(c);
      }
      hands.push(cards);
    }
    const board = parseCards($("spot-board").value);
    if (![0, 3, 4, 5].includes(board.length)) throw new Error("The board needs 0, 3, 4 or 5 cards.");
    for (const c of board) {
      if (seen.has(c)) throw new Error(`${cardName(c)} appears twice.`);
      seen.add(c);
    }
    const cube = parseCubeState($("spot-cube-state").value);
    const street = board.length === 0 ? 0 : board.length - 2;
    refreshTaken();
    return { hands, board, street, btn: Number($("spot-btn").value), variant: $("spot-variant").value, cube, takenOn: $("spot-taken").value || null, precision: $("spot-precision").value, tabled: $("spot-tabled").checked };
  }
  async function solve() {
    const err = $("spot-error");
    err.hidden = true;
    let spot;
    try {
      spot = readSpot();
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
      return;
    }
    const token = ++st.token;
    st.result = { spot, view: null };
    render();
    try {
      const view = await computeView(pool, {
        hands: spot.hands,
        board: spot.board,
        street: spot.street,
        variant: spot.variant,
        btn: spot.btn,
        cube: spot.cube,
        cubeEnabled: spot.hands.length === 2,
        history: historyFromCube(spot.cube, spot.variant, spot.street, spot.btn, spot.takenOn),
        onProgress: (f) => {
          if (!st.result?.view) $("spot-meta").replaceChildren(el("span", "muted", `Solving the equilibrium… ${Math.round(f * 100)}%`));
        },
        forceTabled: spot.tabled,
        precision: spot.precision,
      });
      if (token !== st.token) return;
      st.result.view = view;
      render();
    } catch (error) {
      err.textContent = `Computation failed: ${error.message}`;
      err.hidden = false;
    }
  }
  function render() {
    const r = st.result;
    $("spot-empty").hidden = Boolean(r);
    if (!r) return;
    const { spot, view } = r;
    const names = spot.hands.map((_, i) => `Seat ${i + 1}`);
    const bc = $("spot-board-cards");
    bc.replaceChildren();
    for (let i = 0; i < 5; i++) bc.append(i < spot.board.length ? cardEl(spot.board[i]) : el("span", "slot"));
    const meta = $("spot-meta");
    meta.replaceChildren();
    meta.append(el("span", "", ["Preflop", "Flop", "Turn", "River"][spot.street]));
    if (view) {
      meta.append(el("span", "tag info-tag", view.mode === "perfect" ? "Tabled · perfect information" : "Hidden hands · numbers vs range"));
      if (view.mode === "perfect") meta.append(el("span", "", `${view.stats.exact ? "exact" : "sampled"}, ${fmtInt(view.stats.count)} runouts, ${view.stats.ms.toFixed(0)} ms`));
      else if (view.decision) meta.append(el("span", "", `solver ${view.decision.solve.ms} ms`));
    } else meta.append(el("span", "muted", "computing…"));
    const panel = $("spot-cube");
    panel.hidden = spot.hands.length !== 2;
    if (spot.hands.length === 2) {
      const els = { faceEl: $("spot-cube-face"), titleEl: $("spot-cube-title"), subEl: $("spot-cube-sub"), bodyEl: $("spot-cube-body") };
      if (!view || view.mode === "hidden") renderHiddenCubePanel(panel, els, view, { names, cube: spot.cube, street: spot.street, btn: spot.btn, hands: spot.hands });
      else {
        const situation = cubeSituation({ stats: view.stats, street: spot.street, btn: spot.btn, variant: spot.variant, cube: spot.cube });
        renderCubePanel(panel, els, situation, { names, cube: spot.cube, street: spot.street, btn: spot.btn });
      }
    }
    renderSeats($("spot-seats"), { hands: spot.hands, board: spot.board, stats: view?.stats ?? null, names, btn: spot.hands.length === 2 ? spot.btn : undefined, pending: !view });
  }
  return {
    shown() {
      if (!st.result && !$("spot-hand-0").value) {
        fillRandom();
        solve();
      }
    },
  };
}
