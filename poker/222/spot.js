// Spot solver: type any hands, board, button and cube state, then solve.
// In a two-player spot the second hand may be left blank: the first seat is
// then solved against the opponent's full range.
import { parseCards, cardName, dealTable, scoringOf } from "./engine.mjs";
import { $, el, badge, cardEl, emptySlot, renderSeats, fmtInt, signed, evColor, paint, toast } from "./ui.js";
import { cubeSituation, renderCubePanel, renderHiddenCubePanel, fillVariantSelect, fillDropSelect, fillScoringSelect, parseCubeState } from "./cube-view.js";
import { computeView, historyFromCube, takenOnOptions } from "./table-view.js";

const phone = matchMedia("(max-width: 700px)");

export function initSpot({ pool, sim }) {
  const st = { n: 2, token: 0, result: null, progress: null };
  const countEl = $("spot-count");
  for (let k = 2; k <= 7; k++) {
    const b = el("button", k === st.n ? "active" : "", String(k));
    b.type = "button";
    b.setAttribute("aria-pressed", String(k === st.n));
    b.addEventListener("click", () => {
      st.n = k;
      syncCount();
      buildInputs();
    });
    countEl.append(b);
  }
  function syncCount() {
    countEl.querySelectorAll("button").forEach((x) => {
      const on = Number(x.textContent) === st.n;
      x.classList.toggle("active", on);
      x.setAttribute("aria-pressed", String(on));
    });
  }
  fillVariantSelect($("spot-variant"), "fr");
  fillScoringSelect($("spot-scoring"), "classic");
  fillDropSelect($("spot-drop"), 6, "classic");
  $("spot-scoring").addEventListener("change", () => fillDropSelect($("spot-drop"), null, $("spot-scoring").value));
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
      const field = el("div", "field");
      const label = el("label", "", `Seat ${i + 1} (6 cards${st.n === 2 && i === 1 ? ", or blank for unknown" : ""})`);
      label.htmlFor = `spot-hand-${i}`;
      const input = el("input", "cards-input");
      input.id = `spot-hand-${i}`;
      input.placeholder = st.n === 2 && i === 1 ? "blank = unknown hand" : "e.g. As Ad Kh 9h 7c 2s";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.value = values[i] ?? "";
      field.append(label, input);
      wrap.append(field);
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
    solve({ reveal: true });
  });
  $("spot-from-sim").addEventListener("click", () => {
    const s = sim.state;
    st.n = s.hands.length;
    syncCount();
    buildInputs(s.hands.map((h) => h.map(cardName).join(" ")));
    $("spot-board").value = s.board.map(cardName).join(" ");
    $("spot-variant").value = s.variant;
    $("spot-btn").value = String(s.btn);
    $("spot-cube-state").value = `${s.cube.level}:${s.cube.owner ?? ""}`;
    solve({ reveal: true });
  });
  $("spot-form").addEventListener("submit", (e) => {
    e.preventDefault();
    solve({ reveal: true });
  });
  function showError(message) {
    const err = $("spot-error");
    err.textContent = message || "";
    err.hidden = !message;
    if (message) toast(message, { alert: true });
  }
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
    return { hands, board, street, btn: Number($("spot-btn").value), variant: $("spot-variant").value, cube, takenOn: $("spot-taken").value || null, dropUnit: Number($("spot-drop").value) || 6, scoring: $("spot-scoring").value, precision: $("spot-precision").value, tabled: $("spot-tabled").checked };
  }
  // After Solve the result takes focus, and on phones it scrolls into view so
  // the solve has a visible response above the fold.
  function revealResult() {
    const result = $("spot-result");
    if (phone.matches) result.scrollIntoView({ behavior: "smooth", block: "start" });
    result.focus({ preventScroll: !phone.matches });
  }
  async function solve({ reveal = false } = {}) {
    showError("");
    let spot;
    try {
      spot = readSpot();
    } catch (error) {
      showError(error.message);
      return;
    }
    const token = ++st.token;
    st.result = { spot, view: null };
    st.progress = null;
    render();
    if (reveal) revealResult();
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
          if (token === st.token && !st.result?.view) {
            st.progress = f;
            renderSummary();
          }
        },
        forceTabled: spot.tabled,
        dropUnit: spot.dropUnit,
        scoring: spot.scoring,
        precision: spot.precision,
      });
      if (token !== st.token) return;
      st.result.view = view;
      st.progress = null;
      render();
    } catch (error) {
      if (token !== st.token) return;
      st.progress = null;
      renderSummary();
      showError(`Computation failed: ${error.message}`);
    }
  }
  // The sticky summary: one tile per seat with its EV, or the solve progress.
  function renderSummary() {
    const box = $("spot-summary");
    const r = st.result;
    box.hidden = !r;
    if (!r) return;
    box.replaceChildren();
    const { spot, view } = r;
    const names = spot.hands.map((_, i) => `Seat ${i + 1}`);
    const scoring = scoringOf(spot.scoring);
    if (!view) {
      const bar = el("div", "progress");
      bar.setAttribute("aria-busy", "true");
      const label = el("div", "progress-label");
      label.append(el("span", "", st.progress == null ? "Computing equities…" : "Solving the equilibrium…"), el("span", "", st.progress == null ? "" : `${Math.round(st.progress * 100)}%`));
      const track = el("div", `bar${st.progress == null ? " bar--indeterminate" : ""}`);
      if (st.progress != null) track.style.setProperty("--value", String(st.progress));
      bar.append(label, track);
      box.append(bar);
      return;
    }
    const strip = el("div", "stat-strip spot-strip");
    strip.append(statTile("Street", ["Preflop", "Flop", "Turn", "River"][spot.street]));
    names.forEach((n, i) => {
      const p = view.stats?.players?.[i];
      const tile = statTile(`${n} EV`, p ? signed(p.ev) : "—");
      if (p) paint(tile.querySelector(".stat-value"), { ...evColor(p.ev, scoring.maxNet * (names.length - 1) * 0.5), background: "transparent" });
      strip.append(tile);
    });
    box.append(strip);
  }
  function statTile(label, value) {
    const tile = el("div", "stat");
    tile.append(el("span", "stat-label", label), el("span", "stat-value", value));
    return tile;
  }
  function render() {
    const r = st.result;
    $("spot-empty").hidden = Boolean(r);
    renderSummary();
    if (!r) return;
    const { spot, view } = r;
    const names = spot.hands.map((_, i) => `Seat ${i + 1}`);
    const bc = $("spot-board-cards");
    bc.replaceChildren();
    for (let i = 0; i < 5; i++) bc.append(i < spot.board.length ? cardEl(spot.board[i]) : emptySlot());
    const meta = $("spot-meta");
    meta.replaceChildren();
    meta.append(el("span", "", ["Preflop", "Flop", "Turn", "River"][spot.street]));
    if (view) {
      meta.append(view.mode === "perfect" ? badge("Tabled · perfect information", "info") : badge("Hidden hands · numbers vs range"));
      if (view.mode === "perfect") meta.append(el("span", "", `${view.stats.exact ? "exact" : "sampled"}, ${fmtInt(view.stats.count)} runouts, ${view.stats.ms.toFixed(0)} ms`));
      else if (view.decision) meta.append(el("span", "", `solver ${view.decision.solve.ms} ms`));
    } else meta.append(el("span", "muted", "computing…"));
    const panel = $("spot-cube");
    panel.hidden = spot.hands.length !== 2;
    if (spot.hands.length === 2) {
      const els = { faceEl: $("spot-cube-face"), titleEl: $("spot-cube-title"), subEl: $("spot-cube-sub"), bodyEl: $("spot-cube-body") };
      if (!view || view.mode === "hidden") renderHiddenCubePanel(panel, els, view, { names, cube: spot.cube, street: spot.street, btn: spot.btn, hands: spot.hands });
      else {
        const situation = cubeSituation({ stats: view.stats, street: spot.street, btn: spot.btn, variant: spot.variant, cube: { level: spot.cube.level, owner: view.action.holder ?? spot.cube.owner }, dropUnit: spot.dropUnit });
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
