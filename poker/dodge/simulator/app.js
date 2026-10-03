import {
  Hand,
  CUBE,
  parseCards,
  CATEGORIES,
  RANKS,
  SUITS,
  SYMBOLS,
  cardName,
  firstDrawer,
  remainingDeck,
  shuffledDeck,
} from "./engine.mjs";

const $ = (id) => document.getElementById(id);
const PRECISION = {
  fast: { games: 40000, rollouts: 8000, exactDepth: 3, cubeRollouts: 1500, ply: 1 },
  standard: { games: 150000, rollouts: 20000, exactDepth: 3, cubeRollouts: 4000, ply: 1 },
  deep: { games: 400000, rollouts: 40000, exactDepth: 3, cubeRollouts: 700, ply: 2 },
};

/* ====================================================================
   Worker client
   ==================================================================== */
const worker = new Worker(new URL("./worker.js?v=20261003", import.meta.url), { type: "module" });
let requestId = 0;
const pending = new Map();
worker.onmessage = (event) => {
  const { id, result, error } = event.data;
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  if (error) p.reject(new Error(error));
  else p.resolve(result);
};
worker.onerror = (event) => {
  console.error(event);
  for (const p of pending.values()) p.reject(new Error("Worker failed"));
  pending.clear();
};
function request(type, payload) {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload });
  });
}
const analysisCache = new Map();
function cachedRequest(type, payload) {
  const key = type + JSON.stringify(payload);
  if (!analysisCache.has(key)) {
    if (analysisCache.size > 400) analysisCache.delete(analysisCache.keys().next().value);
    analysisCache.set(key, request(type, payload));
  }
  return analysisCache.get(key);
}

/* ====================================================================
   Helpers
   ==================================================================== */
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const pct = (x, digits = 1) => (x == null || Number.isNaN(x) ? "—" : `${(x * 100).toFixed(digits)}%`);
const signed = (x, digits = 3) => (x == null ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(digits)}`);
const fmtInt = (x) => Math.round(x).toLocaleString("en-US");
const seatLabel = (i) => `Seat ${i + 1}`;
// 0 = red, 0.5 = amber, 1 = green.
const scaleColor = (t) => `hsl(${4 + 146 * clamp01(t)} 66% 58%)`;
const heatColor = (t) => `hsl(${4 + 146 * clamp01(t)} 70% ${62 - 12 * clamp01(t)}%)`;
const equityT = (eq, n) => (eq <= 1 / n ? (eq / (1 / n)) * 0.5 : 0.5 + ((eq - 1 / n) / (1 - 1 / n)) * 0.5);
const drawsT = (x) => (x - 1) / 11;
const eqUnitsT = (eq, stake = 1) => (eq / stake + 1) / 2;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function button(label, className, onClick, disabled = false) {
  const b = el("button", className, label);
  b.type = "button";
  b.disabled = disabled;
  b.addEventListener("click", onClick);
  return b;
}
function cardEl(c, extra = "") {
  const r = RANKS[c >> 2],
    s = c & 3;
  const node = el("span", `playing-card ${SUITS[s]}${extra ? ` ${extra}` : ""}`);
  node.innerHTML = `<span class="suit">${SYMBOLS[s]}</span><span class="rank">${r === "T" ? "10" : r}</span>`;
  node.title = cardName(c);
  return node;
}
function metric(label, value, { big = false, pending: isPending = false, note, t } = {}) {
  const m = el("div", `metric${big ? " big" : ""}`);
  m.append(el("span", "stat-label", label));
  const v = el("span", `stat-value${isPending ? " pending" : ""}${t != null ? " scaled" : ""}`, value);
  if (t != null) v.style.setProperty("--scale", scaleColor(t));
  m.append(v);
  if (note) m.append(el("span", "pts", note));
  return m;
}
function sparkline(hist, median) {
  const wrap = el("div");
  const spark = el("div", "spark");
  const max = Math.max(...hist, 1e-9);
  hist.forEach((p, i) => {
    const bar = el("i", i + 1 === median ? "median" : "");
    bar.style.height = `${Math.max(2, (p / max) * 100)}%`;
    bar.title = `${i + 1} draw${i ? "s" : ""}: ${pct(p)}`;
    spark.append(bar);
  });
  const axis = el("div", "spark-axis");
  axis.append(el("span", "", "1 draw"), el("span", "", `${hist.length} draws`));
  wrap.append(spark, axis);
  return wrap;
}
const bustsWith = (cards, c) => new Hand(cards).add(c) >= 0;
function nextAlive(turn, alive) {
  const n = alive.length;
  if (!alive.some(Boolean)) return turn;
  let cur = (turn + 1) % n;
  while (!alive[cur]) cur = (cur + 1) % n;
  return cur;
}
function cubeRow(label, eq, { stake = 1, best = false, chosen = false, value = 1 } = {}) {
  const row = el("tr", `${best ? "best" : ""}${chosen ? " chosen" : ""}`);
  row.append(el("td", "", label));
  const units = el("td", "num scaled", signed(eq));
  units.style.setProperty("--scale", scaleColor(eqUnitsT(eq, stake)));
  row.append(units);
  const points = el("td", "num scaled", `${signed(eq * value, 2)} pts`);
  points.style.setProperty("--scale", scaleColor(eqUnitsT(eq, stake)));
  row.append(points);
  const win = el("td", "num scaled", pct(eqUnitsT(eq, stake)));
  win.style.setProperty("--scale", scaleColor(eqUnitsT(eq, stake)));
  row.append(win);
  return row;
}
function cubeHeader() {
  const row = el("tr");
  ["Action", "Equity (cube units)", "Points", "Equivalent win %"].forEach((h, i) => row.append(el("th", i ? "num" : "", h)));
  return row;
}
function sectionRow(text) {
  const row = el("tr", "section");
  const cell = el("td", "", text);
  cell.colSpan = 4;
  row.append(cell);
  return row;
}
// Full solver table for a position, from the on-turn player's view.
function cubeAnalysisRows(table, a, { mover, responder, value, best, chosen, preview, canDouble }) {
  table.append(cubeHeader());
  table.append(sectionRow(`${mover} on turn · cubeless win chance ${pct(a.winProb)} · busts next draw ${pct(a.bustNext)} · ${a.ply}-ply`));
  const doubleBest = preview ? a.bestAction === "double" : best === "double";
  const noBest = preview ? a.bestAction === "noDouble" : best === "noDouble";
  if (canDouble) {
    table.append(cubeRow("No double", a.noDouble, { best: noBest, chosen: chosen === "noDouble", value }));
    table.append(cubeRow("Double / take", a.doubleTake, { stake: 2, best: doubleBest && a.responder.best === "take", chosen: chosen === "double" && a.responder.best === "take", value }));
    table.append(cubeRow("Double / pass", a.doublePass, { best: doubleBest && a.responder.best === "pass", chosen: chosen === "double" && a.responder.best === "pass", value }));
  } else table.append(cubeRow("Draw (cannot double)", a.noDouble, { best: true, value }));
  table.append(sectionRow(`${responder} if doubled to ${value * 2}`));
  table.append(cubeRow("Take", a.responder.take, { stake: 2, best: a.responder.best === "take", chosen: chosen === "take", value }));
  table.append(cubeRow("Pass", a.responder.pass, { best: a.responder.best === "pass", chosen: chosen === "pass", value }));
}

/* ====================================================================
   Shared seat rendering
   view = { hands, names, alive, turn, first, status, result, cubeOn, cube,
            analysis, lastDrawn, editing, onEdit, onSetTurn, scores, meSeat }
   ==================================================================== */
function renderSeats(container, view) {
  const { hands, alive, status, result } = view;
  const n = hands.length;
  container.replaceChildren();
  hands.forEach((cards, i) => {
    const hand = new Hand(cards);
    const category = hand.category();
    const onTurn = !status.over && alive[i] && i === view.turn;
    const seat = el("div", `seat${onTurn ? " on-turn" : ""}${category >= 0 ? " busted" : ""}${view.editing === i ? " editing" : ""}${view.meSeat === i ? " me" : ""}`);
    const head = el("div", "seat-head");
    const name = el("div", "seat-name", view.names ? view.names[i] : seatLabel(i));
    const badges = el("div", "badges");
    if (onTurn) badges.append(el("span", "badge turn", view.cube?.offered ? "Doubling" : "Draws next"));
    if (view.first === i && cards.length) badges.append(el("span", "badge first", "Lowest card"));
    if (category >= 0) badges.append(el("span", "badge bust", `Bust · ${CATEGORIES[category]}`));
    if (status.over && status.winner === i) badges.append(el("span", "badge win", "Winner"));
    if (status.over && status.split && alive[i]) badges.append(el("span", "badge win", "Split"));
    if (view.cubeOn && view.cube.owner === i) badges.append(el("span", "badge", `Owns cube ${view.cube.value}`));
    name.append(badges);
    head.append(name);
    const tools = el("div", "seat-tools");
    if (view.scores) tools.append(el("span", "seat-score", `${view.scores[i]} pt${view.scores[i] === 1 ? "" : "s"}`));
    if (view.onEdit) tools.append(button(view.editing === i ? "Done" : "Edit", "quiet", () => view.onEdit(i)));
    if (view.onSetTurn && !status.over && alive[i] && i !== view.turn) tools.append(button("Draws next", "quiet", () => view.onSetTurn(i)));
    head.append(tools);
    seat.append(head);

    const row = el("div", "cards");
    if (!cards.length) row.append(el("span", "empty-hand", view.onEdit ? "No cards. Use Edit and click the deck." : "—"));
    cards.forEach((c) => row.append(cardEl(c, view.lastDrawn?.seat === i && view.lastDrawn?.card === c ? "new" : "")));
    seat.append(row);

    const metrics = el("div", "metrics");
    const player = result?.players?.[i];
    const pendingText = cards.length ? "…" : "—";
    const eq = status.over ? (status.winner === i ? 1 : status.split && alive[i] ? 1 / alive.filter(Boolean).length : 0) : result?.equity[i];
    if (category >= 0) {
      metrics.append(metric("Equity", eq != null ? pct(eq) : pendingText, { big: true, t: eq != null ? equityT(eq, n) : null }));
      metrics.append(metric("Result", `Out · ${CATEGORIES[category].toLowerCase()}`));
      metrics.append(metric("Cards", String(cards.length)));
    } else {
      let note;
      if (view.cubeOn && view.analysis && !status.over && alive.every(Boolean)) {
        const a = view.analysis;
        const onTurnValue = a.canDouble ? Math.max(a.noDouble, a.doubleValue) : a.noDouble;
        const mine = i === view.turn ? onTurnValue : -onTurnValue;
        note = `${signed(mine * view.cube.value, 2)} pts at cube ${view.cube.value}`;
      }
      metrics.append(metric("Equity", eq != null ? pct(eq) : pendingText, { big: true, pending: eq == null, note, t: eq != null ? equityT(eq, n) : null }));
      metrics.append(metric("Bust next", player ? pct(player.bust1) : pendingText, { pending: !player, t: player ? 1 - player.bust1 : null }));
      metrics.append(metric("Bust in 2", player ? pct(player.bust2) : pendingText, { pending: !player, t: player ? 1 - player.bust2 : null }));
      metrics.append(metric("Bust in 3", player ? pct(player.bust3) : pendingText, { pending: !player, t: player ? 1 - player.bust3 : null }));
      const beyond = player?.beyond > 0.0005 ? "+" : "";
      metrics.append(metric("Median draws to bust", player ? `${player.median}${beyond}` : pendingText, { pending: !player, t: player ? drawsT(player.median) : null }));
      metrics.append(metric("Mean draws to bust", player ? `${player.mean.toFixed(2)}${beyond}` : pendingText, { pending: !player, t: player ? drawsT(player.mean) : null }));
    }
    seat.append(metrics);
    if (player && !player.busted) seat.append(sparkline(player.hist, player.median));
    container.append(seat);
  });
}

/* ====================================================================
   Tabs & dialog
   ==================================================================== */
const TABS = ["sim", "trainer", "online", "reports"];
let activeTab = "sim";
function showTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tabs > button").forEach((x) => {
    x.classList.toggle("active", x.dataset.tab === tab);
    x.toggleAttribute("aria-current", x.dataset.tab === tab);
  });
  TABS.forEach((t) => ($(`view-${t}`).hidden = t !== tab));
  if (!location.hash.startsWith("#room=") && !(tab === "sim" && location.hash.startsWith("#spot="))) history.replaceState(null, "", `#${tab}`);
  if (tab === "reports") loadReports();
}
document.querySelectorAll(".tabs > button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
$("rules-button").addEventListener("click", () => $("rules-dialog").showModal());
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => $(b.dataset.close).close()));

/* ====================================================================
   TABLE SIMULATOR
   ==================================================================== */
const sim = {
  n: 4,
  hands: [[], [], [], []],
  turn: 0,
  first: null,
  aceHigh: true,
  cubeMode: false,
  cube: { owner: "center", value: 1, offered: false, result: null },
  editing: null,
  history: [],
  future: [],
  lastDrawn: null,
  result: null,
  cubeAnalysis: null,
  computeMs: null,
  token: 0,
};
const precision = () => PRECISION[$("precision").value];
const aliveSeats = () => sim.hands.map((h) => !new Hand(h).busted);
const simDeck = () => remainingDeck(sim.hands);
const dealt = () => sim.hands.some((h) => h.length);
const simSnapshot = () => JSON.stringify({ n: sim.n, hands: sim.hands, turn: sim.turn, first: sim.first, cube: sim.cube, lastDrawn: sim.lastDrawn });
function simLoad(snapshot) {
  const s = JSON.parse(snapshot);
  Object.assign(sim, s);
  sim.editing = null;
  document.querySelectorAll("#player-count > button").forEach((b) => b.classList.toggle("active", Number(b.dataset.n) === sim.n));
}
function simStatus() {
  const alive = aliveSeats();
  const count = alive.filter(Boolean).length;
  const deck = simDeck();
  if (!dealt()) return { over: false, text: "Press New deal, or click cards in the deck to build a position." };
  if (sim.cube.result) {
    const { winner, points, reason } = sim.cube.result;
    return { over: true, winner, text: `${seatLabel(winner)} wins ${points} point${points === 1 ? "" : "s"} (${reason}).` };
  }
  if (count === 1) {
    const winner = alive.indexOf(true);
    const pts = sim.cubeMode && sim.n === 2 ? ` ${sim.cube.value} point${sim.cube.value === 1 ? "" : "s"}` : "";
    return { over: true, winner, text: `${seatLabel(winner)} wins${pts}.` };
  }
  if (count === 0) return { over: true, text: "Everyone has busted." };
  if (deck.length === 0) {
    const survivors = alive.map((a, i) => (a ? seatLabel(i) : null)).filter(Boolean);
    return { over: true, split: true, text: `Deck exhausted. ${survivors.join(", ")} split the pot.` };
  }
  if (sim.cube.offered) return { over: false, text: `${seatLabel(sim.turn)} doubled to ${sim.cube.value * 2}. ${seatLabel(1 - sim.turn)} to respond.` };
  return { over: false, text: `${seatLabel(sim.turn)} to draw.` };
}
function pushHistory() {
  sim.history.push(simSnapshot());
  sim.future = [];
  if (sim.history.length > 300) sim.history.shift();
}
function stepBack() {
  const snap = sim.history.pop();
  if (!snap) return;
  sim.future.push(simSnapshot());
  simLoad(snap);
  recompute();
}
function stepForward() {
  const snap = sim.future.pop();
  if (!snap) return;
  sim.history.push(simSnapshot());
  simLoad(snap);
  recompute();
}
function resetCube() {
  sim.cube = { owner: "center", value: 1, offered: false, result: null };
}
function newDeal() {
  pushHistory();
  const deck = shuffledDeck();
  sim.hands = Array.from({ length: sim.n }, (_, i) => [deck[i]]);
  sim.turn = firstDrawer(sim.hands.map((h) => h[0]), sim.aceHigh);
  sim.first = sim.turn;
  sim.lastDrawn = null;
  sim.editing = null;
  resetCube();
  recompute();
}
function drawCard(card, { silent = false } = {}) {
  const status = simStatus();
  if (status.over || sim.cube.offered) return false;
  const alive = aliveSeats();
  if (!alive[sim.turn]) sim.turn = nextAlive(sim.turn, alive);
  const deck = simDeck();
  if (!deck.length) return false;
  if (card == null) card = deck[Math.floor(Math.random() * deck.length)];
  if (!silent) pushHistory();
  sim.hands[sim.turn].push(card);
  sim.lastDrawn = { seat: sim.turn, card };
  sim.turn = nextAlive(sim.turn, aliveSeats());
  return true;
}
function playOut() {
  if (!dealt()) newDeal();
  let guard = 0;
  while (!simStatus().over && guard++ < 80) {
    if (sim.cube.offered) sim.cube.offered = false;
    drawCard(null);
  }
  sim.editing = null;
  recompute();
}
const cubeStateFor = (seat) => (sim.cube.owner === "center" ? CUBE.CENTER : sim.cube.owner === seat ? CUBE.ON_TURN : CUBE.OTHER);
const canDoubleSim = (seat) => sim.cube.owner === "center" || sim.cube.owner === seat;
function simDouble() {
  if (!canDoubleSim(sim.turn) || sim.cube.offered) return;
  pushHistory();
  sim.cube.offered = true;
  recompute();
}
function simTake() {
  pushHistory();
  sim.cube.value *= 2;
  sim.cube.owner = 1 - sim.turn;
  sim.cube.offered = false;
  recompute();
}
function simPass() {
  pushHistory();
  sim.cube.result = { winner: sim.turn, points: sim.cube.value, reason: `${seatLabel(1 - sim.turn)} passed` };
  sim.cube.offered = false;
  recompute();
}
function setPlayers(n, { silent = false } = {}) {
  if (!silent) pushHistory();
  sim.n = n;
  sim.hands = Array.from({ length: n }, (_, i) => sim.hands[i] ?? []);
  if (sim.turn >= n) sim.turn = 0;
  if (n !== 2) {
    sim.cubeMode = false;
    $("cube-mode").checked = false;
  }
  resetCube();
  sim.editing = null;
  document.querySelectorAll("#player-count > button").forEach((b) => b.classList.toggle("active", Number(b.dataset.n) === n));
  if (!silent) recompute();
}
function deckClick(card) {
  const owner = sim.hands.findIndex((h) => h.includes(card));
  if (owner >= 0) {
    pushHistory();
    sim.hands[owner] = sim.hands[owner].filter((c) => c !== card);
    if (sim.lastDrawn?.card === card) sim.lastDrawn = null;
    sim.cube.result = null;
    recompute();
    return;
  }
  if (sim.editing != null || !dealt()) {
    pushHistory();
    sim.hands[sim.editing ?? sim.turn].push(card);
    recompute();
    return;
  }
  if (drawCard(card)) recompute();
}

async function recompute() {
  const token = ++sim.token;
  sim.result = null;
  sim.cubeAnalysis = null;
  sim.computeMs = null;
  renderSim();
  if (!dealt()) return;
  const p = precision();
  const deck = simDeck();
  const alive = aliveSeats();
  const status = simStatus();
  const turn = alive[sim.turn] ? sim.turn : Math.max(0, alive.indexOf(true));
  const t0 = performance.now();
  try {
    const tablePromise = cachedRequest("table", { hands: sim.hands, turn, deck, games: p.games, rollouts: p.rollouts, exactDepth: p.exactDepth });
    let cubePromise = null;
    if (sim.cubeMode && sim.n === 2 && !status.over && alive[0] && alive[1])
      cubePromise = cachedRequest("cube", {
        onTurn: sim.hands[sim.turn],
        other: sim.hands[1 - sim.turn],
        deck,
        cube: cubeStateFor(sim.turn),
        rollouts: p.cubeRollouts,
        exactDepth: 2,
        ply: p.ply,
        children: true,
      });
    const table = await tablePromise;
    if (token !== sim.token) return;
    sim.result = table;
    sim.computeMs = performance.now() - t0;
    renderSim();
    if (cubePromise) {
      const analysis = await cubePromise;
      if (token !== sim.token) return;
      sim.cubeAnalysis = analysis;
      sim.computeMs = performance.now() - t0;
      renderSim();
    }
  } catch (error) {
    console.error(error);
    $("sum-status").textContent = `Error: ${error.message}`;
  }
}

function renderSim() {
  const alive = aliveSeats();
  const deck = simDeck();
  const status = simStatus();
  const res = sim.result;
  const cubeOn = sim.cubeMode && sim.n === 2;
  $("cube-mode-control").hidden = sim.n !== 2;
  $("sum-status").textContent = status.text;
  $("sum-deck").textContent = `${deck.length} card${deck.length === 1 ? "" : "s"}`;
  const deckOut = $("sum-deckout");
  deckOut.textContent = res ? pct(res.deckOut, 2) : dealt() ? "…" : "—";
  deckOut.className = `stat-value${res ? " scaled" : ""}`;
  if (res) deckOut.style.setProperty("--scale", scaleColor(1 - Math.min(1, res.deckOut * 50)));
  $("sum-games").textContent = res ? fmtInt(res.games) : dealt() ? "…" : "—";
  $("sum-compute").textContent = sim.computeMs != null ? `${Math.round(sim.computeMs)} ms` : dealt() ? "running…" : "—";
  $("back-button").disabled = !sim.history.length;
  $("forward-button").disabled = !sim.future.length;
  $("draw-button").disabled = status.over || sim.cube.offered || !dealt();
  $("playout-button").disabled = status.over && dealt();

  renderSeats($("seats"), {
    hands: sim.hands,
    alive,
    turn: sim.turn,
    first: sim.first,
    status,
    result: res,
    cubeOn,
    cube: sim.cube,
    analysis: sim.cubeAnalysis,
    lastDrawn: sim.lastDrawn,
    editing: sim.editing,
    onEdit: (i) => {
      sim.editing = sim.editing === i ? null : i;
      renderSim();
    },
    onSetTurn: (i) => {
      pushHistory();
      sim.turn = i;
      sim.cube.offered = false;
      recompute();
    },
  });

  $("cube-panel").hidden = !cubeOn;
  if (cubeOn) renderCubePanel(status, alive);

  // deck grid with per-card shading
  const grid = $("deck-grid");
  grid.replaceChildren();
  const target = sim.editing ?? (alive[sim.turn] ? sim.turn : null);
  const dangerFor = !status.over && sim.editing == null && alive[sim.turn] ? sim.hands[sim.turn] : null;
  const children = new Map();
  if (cubeOn && sim.cubeAnalysis?.children && sim.editing == null && !status.over) for (const ch of sim.cubeAnalysis.children) children.set(ch.card, ch);
  for (let r = 0; r < 13; r++)
    for (let s = 0; s < 4; s++) {
      const c = r * 4 + s;
      const owner = sim.hands.findIndex((h) => h.includes(c));
      const b = el("button", "deck-card");
      b.type = "button";
      b.append(cardEl(c));
      if (owner >= 0) {
        b.classList.add("held");
        if (owner === sim.editing) b.classList.add("mine");
        b.append(el("span", "owner", String(owner + 1)));
        b.title = `${cardName(c)} · ${seatLabel(owner)} (click to remove)`;
      } else {
        const child = children.get(c);
        if (child) {
          if (child.bust) {
            b.classList.add("danger");
            b.title = `${cardName(c)} busts ${seatLabel(sim.turn)}`;
          } else {
            b.classList.add("shaded");
            b.style.setProperty("--shade", scaleColor(eqUnitsT(child.cubeless)));
            b.title = `${cardName(c)}: ${seatLabel(sim.turn)} would then win ${pct((child.cubeless + 1) / 2)}`;
          }
        } else {
          if (dangerFor && dangerFor.length >= 4 && bustsWith(dangerFor, c)) b.classList.add("danger");
          b.title = target != null ? `Deal ${cardName(c)} to ${seatLabel(target)}` : cardName(c);
        }
        b.disabled = target == null || (status.over && sim.editing == null) || (sim.cube.offered && sim.editing == null);
      }
      b.addEventListener("click", () => deckClick(c));
      grid.append(b);
    }
  $("deck-help").textContent =
    sim.editing != null
      ? `Editing ${seatLabel(sim.editing)}: click a card to add it, click a held card to remove it.`
      : status.over
        ? `${deck.length} cards left. Click a held card to remove it, or Edit a seat.`
        : children.size
          ? `${deck.length} cards left. Click a card to deal it to ${seatLabel(sim.turn)}. Outlines show ${seatLabel(sim.turn)}'s win chance after that card (red outlines bust).`
          : `${deck.length} cards left. Click a card to deal it to ${seatLabel(sim.turn)}; red outlines bust them.`;
}

function renderCubePanel(status, alive) {
  $("cube-value").textContent = String(sim.cube.value);
  $("cube-owner").textContent = sim.cube.owner === "center" ? "centered" : `${seatLabel(sim.cube.owner)} owns`;
  const actions = $("cube-actions");
  actions.replaceChildren();
  const table = $("cube-table");
  table.replaceChildren();
  if (status.over || !alive[0] || !alive[1]) {
    $("cube-title").textContent = "Game over";
    $("cube-subtitle").textContent = status.text;
    return;
  }
  const seat = sim.turn,
    other = 1 - seat;
  if (sim.cube.offered) {
    $("cube-title").textContent = `${seatLabel(seat)} doubles to ${sim.cube.value * 2}`;
    $("cube-subtitle").textContent = `${seatLabel(other)} must take or pass.`;
    actions.append(button("Take", "primary", simTake), button("Pass", "danger", simPass));
  } else if (canDoubleSim(seat)) {
    $("cube-title").textContent = `${seatLabel(seat)} to act`;
    $("cube-subtitle").textContent = `Double before drawing, or draw with the cube ${sim.cube.owner === "center" ? "centered" : "in hand"}.`;
    actions.append(button("Double", "primary", simDouble), button("Draw · no double", "", () => drawCard() && recompute()));
  } else {
    $("cube-title").textContent = `${seatLabel(seat)} to draw`;
    $("cube-subtitle").textContent = `${seatLabel(other)} owns the cube, so ${seatLabel(seat)} cannot double.`;
    actions.append(button("Draw", "primary", () => drawCard() && recompute()));
  }
  const a = sim.cubeAnalysis;
  if (!a) {
    const row = el("tr");
    row.append(el("td", "muted", "Solving…"));
    table.append(row);
    return;
  }
  cubeAnalysisRows(table, a, { mover: seatLabel(seat), responder: seatLabel(other), value: sim.cube.value, preview: true, canDouble: a.canDouble });
}

/* ---------- spot input ---------- */
(() => {
  const seatsBox = $("spot-seats");
  function renderSpotInputs() {
    const current = Array.from(seatsBox.querySelectorAll("input")).map((i) => i.value);
    seatsBox.replaceChildren();
    for (let i = 0; i < sim.n; i++) {
      const field = el("label", "field");
      field.append(el("span", "label", seatLabel(i)));
      const input = el("input");
      input.placeholder = i === 0 ? "e.g. As Kh 7d" : "e.g. 2c 9s";
      input.value = current[i] ?? sim.hands[i]?.map(cardName).join(" ") ?? "";
      input.dataset.seat = String(i);
      input.autocapitalize = "off";
      field.append(input);
      seatsBox.append(field);
    }
    const turn = $("spot-turn");
    turn.replaceChildren();
    for (let i = 0; i < sim.n; i++) {
      const opt = el("option", "", seatLabel(i));
      opt.value = String(i);
      turn.append(opt);
    }
    turn.value = String(Math.min(sim.turn, sim.n - 1));
    const owner = $("spot-cube-owner");
    owner.replaceChildren();
    [["off", "No cube"], ["center", "Centered"], ["0", "Seat 1 owns"], ["1", "Seat 2 owns"]].forEach(([v, label]) => {
      const opt = el("option", "", label);
      opt.value = v;
      owner.append(opt);
    });
    owner.value = sim.cubeMode && sim.n === 2 ? (sim.cube.owner === "center" ? "center" : String(sim.cube.owner)) : "off";
    $("spot-cube-value").value = String(sim.cube.value);
    $("spot-cube-owner").disabled = sim.n !== 2;
    $("spot-cube-value").disabled = sim.n !== 2;
  }
  function loadSpot() {
    const inputs = Array.from(seatsBox.querySelectorAll("input"));
    const hands = [];
    const seen = new Set();
    for (const input of inputs) {
      const text = input.value.trim();
      const cards = text ? parseCards(text) : [];
      if (cards == null) return spotError(`${seatLabel(Number(input.dataset.seat))}: could not read "${text}". Use ranks A K Q J T 9…2 with suits s h d c.`);
      for (const c of cards) {
        if (seen.has(c)) return spotError(`${cardName(c)} appears twice.`);
        seen.add(c);
      }
      if (cards.length > 17) return spotError("A hand cannot hold more than 17 cards.");
      hands.push(cards);
    }
    if (hands.every((h) => !h.length)) return spotError("Enter at least one card.");
    spotError("");
    pushHistory();
    sim.hands = hands;
    sim.turn = Number($("spot-turn").value);
    sim.first = null;
    sim.lastDrawn = null;
    sim.editing = null;
    const owner = $("spot-cube-owner").value;
    if (sim.n === 2 && owner !== "off") {
      sim.cubeMode = true;
      $("cube-mode").checked = true;
      sim.cube = { owner: owner === "center" ? "center" : Number(owner), value: Number($("spot-cube-value").value), offered: false, result: null };
    } else {
      sim.cubeMode = false;
      $("cube-mode").checked = false;
      resetCube();
    }
    history.replaceState(null, "", `#spot=${encodeURIComponent(spotString())}`);
    recompute();
  }
  function spotString() {
    const cube = sim.cubeMode && sim.n === 2 ? `;cube=${sim.cube.owner}:${sim.cube.value}` : "";
    return `${sim.hands.map((h) => h.map(cardName).join(" ")).join("|")};turn=${sim.turn + 1}${cube}`;
  }
  function spotError(message) {
    const node = $("spot-error");
    node.textContent = message;
    node.hidden = !message;
  }
  function applySpotHash(text) {
    const [handsPart, ...rest] = text.split(";");
    const hands = handsPart.split("|");
    if (hands.length < 2 || hands.length > 4) return;
    setPlayers(hands.length, { silent: true });
    renderSpotInputs();
    Array.from(seatsBox.querySelectorAll("input")).forEach((input, i) => (input.value = hands[i] ?? ""));
    for (const part of rest) {
      const [k, v] = part.split("=");
      if (k === "turn") $("spot-turn").value = String(Math.max(0, Math.min(hands.length - 1, Number(v) - 1)));
      if (k === "cube" && hands.length === 2) {
        const [owner, value] = v.split(":");
        $("spot-cube-owner").value = owner === "center" ? "center" : String(Number(owner));
        $("spot-cube-value").value = String([1, 2, 4, 8, 16, 32].includes(Number(value)) ? Number(value) : 1);
      }
    }
    loadSpot();
  }
  $("spot-load").addEventListener("click", loadSpot);
  seatsBox.addEventListener("keydown", (e) => e.key === "Enter" && loadSpot());
  $("spot-copy").addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}#spot=${encodeURIComponent(spotString())}`;
    try {
      await navigator.clipboard.writeText(url);
      spotError("Link copied.");
    } catch {
      spotError(url);
    }
  });
  $("spot-toggle").addEventListener("click", () => {
    const box = $("spot-panel");
    box.hidden = !box.hidden;
    if (!box.hidden) renderSpotInputs();
  });
  document.querySelectorAll("#player-count > button").forEach((b) => b.addEventListener("click", renderSpotInputs));
  renderSpotInputs();
  if (location.hash.startsWith("#spot=")) {
    $("spot-panel").hidden = false;
    applySpotHash(decodeURIComponent(location.hash.slice(6)));
  }
})();

$("deal-button").addEventListener("click", newDeal);
$("draw-button").addEventListener("click", () => drawCard() && recompute());
$("playout-button").addEventListener("click", playOut);
$("back-button").addEventListener("click", stepBack);
$("forward-button").addEventListener("click", stepForward);
$("ace-high").addEventListener("change", (e) => (sim.aceHigh = e.target.checked));
$("cube-mode").addEventListener("change", (e) => {
  sim.cubeMode = e.target.checked;
  resetCube();
  recompute();
});
$("precision").addEventListener("change", recompute);
document.querySelectorAll("#player-count > button").forEach((b) => b.addEventListener("click", () => setPlayers(Number(b.dataset.n))));

/* ====================================================================
   CUBE TRAINER
   ==================================================================== */
const YOU = 0,
  BOT = 1;
const tr = {
  hands: [[], []],
  turn: 0,
  first: 0,
  cube: { owner: "center", value: 1 },
  phase: "idle",
  score: { you: 0, bot: 0 },
  games: 0,
  decisions: 0,
  errors: 0,
  lost: 0,
  log: [],
  shown: null,
  shownYou: null,
  shownBot: null,
  lastDrawn: null,
  timeline: [],
  review: null,
  timer: null,
  token: 0,
};
const trPrecision = () => PRECISION[$("tr-precision").value];
const trName = (seat) => (seat === YOU ? "You" : "Bot");
const trCanDouble = (seat, cube = tr.cube) => cube.owner === "center" || cube.owner === seat;
const trCubeState = (seat, cube = tr.cube) => (cube.owner === "center" ? CUBE.CENTER : cube.owner === seat ? CUBE.ON_TURN : CUBE.OTHER);
function trLog(text, strong = false) {
  tr.log.unshift({ text, strong });
  if (tr.log.length > 80) tr.log.pop();
}
function trAnalysisFor(hands, turn, cube) {
  const p = trPrecision();
  return cachedRequest("cube", {
    onTurn: hands[turn],
    other: hands[1 - turn],
    deck: remainingDeck(hands),
    cube: trCubeState(turn, cube),
    rollouts: p.cubeRollouts,
    exactDepth: 2,
    ply: p.ply,
  });
}
const trAnalysis = () => trAnalysisFor(tr.hands, tr.turn, tr.cube);
function trRecord(note, decision = null) {
  tr.timeline.push({
    hands: tr.hands.map((h) => h.slice()),
    turn: tr.turn,
    first: tr.first,
    cube: { ...tr.cube },
    phase: tr.phase,
    lastDrawn: tr.lastDrawn,
    note,
    shown: decision,
  });
}
function trNewGame() {
  clearTimeout(tr.timer);
  tr.token++;
  const deck = shuffledDeck();
  tr.hands = [[deck[0]], [deck[1]]];
  tr.first = firstDrawer([deck[0], deck[1]], $("tr-ace-high").checked);
  tr.turn = tr.first;
  tr.cube = { owner: "center", value: 1 };
  tr.phase = "cubeDecision";
  tr.shown = null;
  tr.shownYou = null;
  tr.shownBot = null;
  tr.lastDrawn = null;
  tr.timeline = [];
  tr.review = null;
  const note = `New game. ${trName(tr.first)} hold${tr.first === YOU ? "" : "s"} the lowest card (${cardName(tr.hands[tr.first][0])}) and draw${tr.first === YOU ? "" : "s"} first.`;
  trLog(note, true);
  trRecord(note);
  trStep();
}
function trEnd(winner, points, reason) {
  tr.phase = "over";
  tr.games++;
  if (winner === YOU) tr.score.you += points;
  else tr.score.bot += points;
  const note = `${trName(winner)} win${winner === YOU ? "" : "s"} ${points} point${points === 1 ? "" : "s"}: ${reason}.`;
  trLog(note, true);
  trRecord(note);
  trRender();
}
function trDraw() {
  const seat = tr.turn;
  const deck = remainingDeck(tr.hands);
  const card = deck[Math.floor(Math.random() * deck.length)];
  tr.hands[seat].push(card);
  tr.lastDrawn = { seat, card };
  const category = new Hand(tr.hands[seat]).category();
  if (category >= 0) {
    trLog(`${trName(seat)} draw${seat === YOU ? "" : "s"} ${cardName(card)} and bust${seat === YOU ? "" : "s"} with a ${CATEGORIES[category].toLowerCase()}.`);
    trEnd(1 - seat, tr.cube.value, `${trName(seat).toLowerCase()} busted`);
    return;
  }
  const note = `${trName(seat)} draw${seat === YOU ? "" : "s"} ${cardName(card)}.`;
  trLog(note);
  tr.turn = 1 - seat;
  tr.phase = "cubeDecision";
  if (tr.shown?.preview) tr.shown = null;
  trRecord(note);
  trStep();
}
function trGrade(a, kind, chosen, actor) {
  let options;
  if (kind === "double")
    options = [
      { id: "noDouble", eq: a.noDouble },
      { id: "double", eq: a.doubleValue },
    ];
  else
    options = [
      { id: "take", eq: a.responder.take },
      { id: "pass", eq: a.responder.pass },
    ];
  const best = options.reduce((m, o) => (o.eq > m.eq ? o : m), options[0]);
  const pick = options.find((o) => o.id === chosen);
  const error = Math.max(0, best.eq - pick.eq);
  if (actor === YOU) {
    tr.decisions++;
    if (error > 0.0005) tr.errors++;
    tr.lost += error * tr.cube.value;
  }
  tr.shown = { a, kind, chosen, actor, best: best.id, error, value: tr.cube.value, seat: tr.turn, hands: tr.hands.map((h) => h.slice()) };
  if (actor === YOU) tr.shownYou = tr.shown;
  else tr.shownBot = tr.shown;
  return tr.shown;
}
function trStep() {
  const token = ++tr.token;
  clearTimeout(tr.timer);
  const seat = tr.turn;
  if (tr.phase === "cubeDecision") {
    if (!trCanDouble(seat)) tr.phase = "draw";
    else {
      const promise = trAnalysis();
      if (seat === BOT) {
        trRender();
        promise.then((a) => {
          if (token !== tr.token) return;
          tr.timer = setTimeout(() => {
            if (token !== tr.token) return;
            if (a.bestAction === "double") {
              trGrade(a, "double", "double", BOT);
              const note = `Bot doubles to ${tr.cube.value * 2}.`;
              trLog(note, true);
              tr.phase = "response";
              trRecord(note, tr.shown);
              trStep();
            } else {
              trGrade(a, "double", "noDouble", BOT);
              const note = "Bot draws without doubling.";
              trLog(note);
              tr.phase = "draw";
              trRecord(note, tr.shown);
              trStep();
            }
          }, 500);
        });
        return;
      }
      trRender();
      if ($("tr-peek").checked) promise.then((a) => token === tr.token && trPreview(a));
      return;
    }
  }
  if (tr.phase === "response") {
    const responder = 1 - seat;
    const promise = trAnalysis();
    if (responder === BOT) {
      trRender();
      promise.then((a) => {
        if (token !== tr.token) return;
        tr.timer = setTimeout(() => {
          if (token !== tr.token) return;
          if (a.responder.best === "take") {
            trGrade(a, "response", "take", BOT);
            const note = `Bot takes. Cube at ${tr.cube.value * 2}, bot owns it.`;
            trLog(note);
            trTakeApply(note);
          } else {
            trGrade(a, "response", "pass", BOT);
            trLog("Bot passes.");
            trRecord("Bot passes.", tr.shown);
            trEnd(seat, tr.cube.value, "bot passed the double");
          }
        }, 500);
      });
      return;
    }
    trRender();
    if ($("tr-peek").checked) promise.then((a) => token === tr.token && trPreview(a));
    return;
  }
  if (tr.phase === "draw") {
    trRender();
    if (seat === BOT) tr.timer = setTimeout(() => token === tr.token && trDraw(), 600);
    return;
  }
  trRender();
}
function trPreview(a) {
  tr.shown = { a, kind: tr.phase === "response" ? "response" : "double", chosen: null, actor: null, preview: true, value: tr.cube.value, seat: tr.turn, hands: tr.hands.map((h) => h.slice()) };
  trRender();
}
function trTakeApply(note) {
  tr.cube.value *= 2;
  tr.cube.owner = 1 - tr.turn;
  tr.phase = "draw";
  trRecord(note, tr.shown);
  trStep();
}
async function youDouble() {
  if (tr.phase !== "cubeDecision" || tr.turn !== YOU || tr.review != null) return;
  const promise = trAnalysis();
  tr.phase = "response";
  const note = `You double to ${tr.cube.value * 2}.`;
  trLog(note, true);
  trRender();
  const a = await promise;
  trGrade(a, "double", "double", YOU);
  trRecord(note, tr.shown);
  trStep();
}
async function youNoDouble() {
  if (tr.phase !== "cubeDecision" || tr.turn !== YOU || tr.review != null) return;
  const promise = trAnalysis();
  tr.phase = "draw";
  trRender();
  const a = await promise;
  trGrade(a, "double", "noDouble", YOU);
  const note = "You draw without doubling.";
  trLog(note);
  trRecord(note, tr.shown);
  trDraw();
}
async function youTake() {
  if (tr.phase !== "response" || tr.turn !== BOT || tr.review != null) return;
  const a = await trAnalysis();
  trGrade(a, "response", "take", YOU);
  const note = `You take. Cube at ${tr.cube.value * 2}, you own it.`;
  trLog(note);
  trTakeApply(note);
}
async function youPass() {
  if (tr.phase !== "response" || tr.turn !== BOT || tr.review != null) return;
  const a = await trAnalysis();
  trGrade(a, "response", "pass", YOU);
  trLog("You pass.");
  trRecord("You pass.", tr.shown);
  trEnd(BOT, tr.cube.value, "you passed the double");
}
function youDraw() {
  if (tr.phase !== "draw" || tr.turn !== YOU || tr.review != null) return;
  trDraw();
}
const trUserMoment = () =>
  tr.phase === "over" || tr.phase === "idle" || (tr.phase === "cubeDecision" && tr.turn === YOU) || (tr.phase === "response" && tr.turn === BOT) || (tr.phase === "draw" && tr.turn === YOU);
function trStepBack() {
  if (!trUserMoment() || !tr.timeline.length) return;
  const idx = tr.review == null ? tr.timeline.length - 2 : tr.review - 1;
  if (idx < 0) return;
  tr.review = idx;
  trRender();
}
function trStepForward() {
  if (tr.review == null) return;
  tr.review = tr.review + 1 >= tr.timeline.length - 1 ? null : tr.review + 1;
  trRender();
}
function trResume() {
  tr.review = null;
  trRender();
}

function trRender() {
  const live = tr.review == null;
  const snap = live ? null : tr.timeline[tr.review];
  const hands = live ? tr.hands : snap.hands;
  const turn = live ? tr.turn : snap.turn;
  const cube = live ? tr.cube : snap.cube;
  const phase = live ? tr.phase : snap.phase;
  const lastDrawn = live ? tr.lastDrawn : snap.lastDrawn;
  $("score-you").textContent = String(tr.score.you);
  $("score-bot").textContent = String(tr.score.bot);
  $("tr-cube-value").textContent = String(cube.value);
  $("tr-cube-owner").textContent = cube.owner === "center" ? "centered" : `${trName(cube.owner)} own${cube.owner === YOU ? "" : "s"}`;
  $("tr-back").disabled = !trUserMoment() || !tr.timeline.length || (live ? tr.timeline.length < 2 : tr.review === 0);
  $("tr-forward").disabled = live;
  $("tr-live").hidden = live;

  const seats = $("tr-seats");
  seats.replaceChildren();
  [YOU, BOT].forEach((i) => {
    const hand = new Hand(hands[i]);
    const category = hand.category();
    const onTurn = phase !== "over" && phase !== "idle" && turn === i;
    const seat = el("div", `seat${onTurn ? " on-turn" : ""}${category >= 0 ? " busted" : ""}`);
    const head = el("div", "seat-head");
    const name = el("div", "seat-name", trName(i));
    const badges = el("div", "badges");
    if (onTurn) badges.append(el("span", "badge turn", phase === "response" ? "Doubling" : "On turn"));
    if (phase !== "idle" && tr.first === i) badges.append(el("span", "badge first", "Lowest card"));
    if (category >= 0) badges.append(el("span", "badge bust", `Bust · ${CATEGORIES[category]}`));
    if (cube.owner === i) badges.append(el("span", "badge", `Owns cube ${cube.value}`));
    name.append(badges);
    head.append(name, el("span", "pts", `${hands[i].length} card${hands[i].length === 1 ? "" : "s"}`));
    seat.append(head);
    const row = el("div", "cards");
    hands[i].forEach((c) => row.append(cardEl(c, lastDrawn?.seat === i && lastDrawn?.card === c ? "new" : "")));
    if (!hands[i].length) row.append(el("span", "empty-hand", "—"));
    seat.append(row);
    seats.append(seat);
  });

  const prompt = $("tr-prompt");
  const actions = $("tr-actions");
  actions.replaceChildren();
  prompt.classList.remove("alert");
  if (!live) {
    prompt.textContent = `Reviewing step ${tr.review + 1} of ${tr.timeline.length}: ${snap.note}`;
    prompt.classList.add("alert");
    actions.append(button("◀ Back", "", trStepBack, tr.review === 0), button("Forward ▶", "", trStepForward), button("Resume live", "primary", trResume));
  } else if (tr.phase === "idle") prompt.textContent = "Press New game to deal.";
  else if (tr.phase === "over") {
    prompt.textContent = `Game over. ${tr.log[0]?.text ?? ""}`;
    actions.append(button("New game", "primary", trNewGame), button("◀ Review game", "", trStepBack));
  } else if (tr.phase === "cubeDecision") {
    if (tr.turn === YOU) {
      prompt.textContent = `Your turn. Double to ${tr.cube.value * 2} before drawing, or just draw?`;
      actions.append(button(`Double to ${tr.cube.value * 2}`, "primary", youDouble), button("No double · draw", "", youNoDouble));
    } else prompt.textContent = "Bot is thinking about the cube…";
  } else if (tr.phase === "response") {
    if (tr.turn === BOT) {
      prompt.textContent = `Bot doubles to ${tr.cube.value * 2}. Take or pass?`;
      prompt.classList.add("alert");
      actions.append(button("Take", "primary", youTake), button("Pass", "danger", youPass));
    } else prompt.textContent = `You doubled to ${tr.cube.value * 2}. Bot is deciding…`;
  } else if (tr.phase === "draw") {
    if (tr.turn === YOU) {
      prompt.textContent = trCanDouble(YOU) ? "Draw a card." : "Bot owns the cube. Draw a card.";
      actions.append(button("Draw", "primary", youDraw));
    } else prompt.textContent = "Bot is drawing…";
  }

  renderTrainerAnalysis(live ? (tr.shown?.preview ? tr.shown : tr.shownYou) : snap.shown, snap, live ? tr.shownBot : null);

  $("tr-session").replaceChildren(
    metric("Games", String(tr.games)),
    metric("Points", `${tr.score.you} – ${tr.score.bot}`, { t: tr.games ? clamp01(0.5 + (tr.score.you - tr.score.bot) / (4 * Math.max(1, tr.games))) : null }),
    metric("Your cube decisions", String(tr.decisions)),
    metric("Errors", String(tr.errors), { t: tr.decisions ? 1 - tr.errors / tr.decisions : null }),
    metric("Equity lost", `${tr.lost.toFixed(2)} pts`, { t: tr.decisions ? 1 - Math.min(1, tr.lost / tr.decisions / 0.3) : null }),
    metric("Avg. loss per decision", tr.decisions ? `${(tr.lost / tr.decisions).toFixed(3)} pts` : "—", { t: tr.decisions ? 1 - Math.min(1, tr.lost / tr.decisions / 0.3) : null }),
  );
  const log = $("tr-log");
  log.replaceChildren();
  tr.log.forEach((entry) => {
    const li = el("li");
    if (entry.strong) li.append(el("b", "", entry.text));
    else li.textContent = entry.text;
    log.append(li);
  });
}
function renderTrainerAnalysis(shown, snap, botShown = null) {
  const body = $("tr-analysis-body");
  const note = $("tr-analysis-note");
  const title = $("tr-analysis-title");
  body.replaceChildren();
  if (botShown && !shown?.preview) {
    const details = el("details", "bot-decision");
    const summary = el("summary");
    const a = botShown.a;
    const label = botShown.kind === "double" ? (botShown.chosen === "double" ? `doubled to ${botShown.value * 2}` : "did not double") : botShown.chosen === "take" ? "took" : "passed";
    summary.textContent = `Bot's last decision: ${label} (${botShown.error > 0.0005 ? `error ${(botShown.error * botShown.value).toFixed(3)} pts` : "correct"}, win chance ${pct(a.winProb)})`;
    details.append(summary);
    const table = el("table", "cube-table");
    cubeAnalysisRows(table, a, { mover: trName(botShown.seat), responder: trName(1 - botShown.seat), value: botShown.value, best: botShown.best, chosen: botShown.chosen, canDouble: a.canDouble });
    const wrap = el("div", "cube-table-wrap");
    wrap.append(table);
    details.append(wrap);
    body.append(details);
  }
  if (!shown && snap) {
    // Review of a position without a graded decision: show the live solver view.
    const alive = snap.hands.every((h) => !new Hand(h).busted);
    if (snap.phase === "over" || !alive) {
      note.hidden = true;
      title.textContent = "Position analysis";
      body.append(el("p", "muted", "The game is over at this step."));
      return;
    }
    const seat = snap.phase === "response" ? snap.turn : snap.turn;
    const key = JSON.stringify([snap.hands, seat, snap.cube]);
    title.textContent = "Position analysis";
    note.hidden = true;
    body.append(el("p", "muted", "Solving this position…"));
    trAnalysisFor(snap.hands, seat, snap.cube).then((a) => {
      if (tr.review == null || JSON.stringify([tr.timeline[tr.review]?.hands, tr.timeline[tr.review]?.turn, tr.timeline[tr.review]?.cube]) !== key) return;
      body.replaceChildren();
      const table = el("table", "cube-table");
      cubeAnalysisRows(table, a, { mover: trName(seat), responder: trName(1 - seat), value: snap.cube.value, preview: true, canDouble: a.canDouble });
      body.append(el("p", "muted", `${trName(seat)} to act with the cube at ${snap.cube.value}. Equities from ${seat === YOU ? "your" : "the bot's"} side.`));
      const wrap = el("div", "cube-table-wrap");
      wrap.append(table);
      body.append(wrap);
    });
    return;
  }
  if (!shown) {
    note.hidden = Boolean(botShown);
    title.textContent = botShown ? "Cube analysis" : "Cube analysis";
    return;
  }
  note.hidden = true;
  const { a, kind, chosen, actor, best, error, value, seat, preview } = shown;
  const mover = trName(seat);
  const responder = trName(1 - seat);
  title.textContent = preview ? "Live analysis" : actor === YOU ? "Your last decision" : "Last cube decision";
  const header = el("p", "muted");
  header.textContent = preview
    ? `Live analysis for ${mover === "You" ? "your" : "the bot's"} ${kind === "double" ? "cube decision" : "double"} · cube ${value}`
    : kind === "double"
      ? `${mover} on turn with the cube at ${value}`
      : `${responder} responding to ${mover === "You" ? "your" : "the bot's"} double to ${value * 2}`;
  body.append(header);
  const hands = el("div", "cards");
  shown.hands.forEach((h, i) => {
    const group = el("div", "cards");
    group.append(el("span", "pts", `${trName(i)}:`));
    h.forEach((c) => group.append(cardEl(c)));
    hands.append(group);
  });
  body.append(hands);
  const table = el("table", "cube-table");
  cubeAnalysisRows(table, a, { mover, responder, value, best, chosen, preview, canDouble: a.canDouble });
  body.append(el("p", "muted", `Equities from ${mover === "You" ? "your" : "the bot's"} side in the first block and from ${responder === "You" ? "your" : "the bot's"} side in the response block.`));
  const wrap = el("div", "cube-table-wrap");
  wrap.append(table);
  body.append(wrap);
  if (!preview && chosen != null) {
    const label = kind === "double" ? (best === "double" ? (a.responder.best === "take" ? "Double / take" : "Double / pass") : "No double") : best === "take" ? "Take" : "Pass";
    const who = actor === YOU ? "You" : "Bot";
    const verdict = el("div", `verdict ${error > 0.0005 ? "bad" : "good"}`);
    verdict.textContent =
      error > 0.0005
        ? `${who} chose ${chosen === "noDouble" ? "no double" : chosen}. Correct play: ${label}. Equity lost: ${(error * value).toFixed(3)} pts (${error.toFixed(3)} cube units).`
        : `${who} chose ${chosen === "noDouble" ? "no double" : chosen}. Correct: ${label}.`;
    body.append(verdict);
  }
}

$("tr-new").addEventListener("click", trNewGame);
$("tr-back").addEventListener("click", trStepBack);
$("tr-forward").addEventListener("click", trStepForward);
$("tr-live").addEventListener("click", trResume);
$("tr-reset").addEventListener("click", () => {
  tr.score = { you: 0, bot: 0 };
  tr.games = 0;
  tr.decisions = 0;
  tr.errors = 0;
  tr.lost = 0;
  tr.log = [];
  trRender();
});
$("tr-peek").addEventListener("change", () => {
  if ($("tr-peek").checked && tr.review == null && ((tr.phase === "cubeDecision" && tr.turn === YOU) || (tr.phase === "response" && tr.turn === BOT))) {
    const token = tr.token;
    trAnalysis().then((a) => token === tr.token && trPreview(a));
  }
});

/* ====================================================================
   ONLINE
   ==================================================================== */
const online = {
  room: null,
  model: null,
  roster: [],
  seats: 4,
  result: null,
  analysis: null,
  token: 0,
  log: [],
};
function onError(message) {
  const node = $("on-error");
  node.textContent = message || "";
  node.hidden = !message;
}
function onName() {
  const value = $("on-name").value.trim().slice(0, 20) || "Player";
  localStorage.setItem("dodge.player.name", value);
  return value;
}
function newRoom() {
  if (!window.PeerRoom) throw new Error("The peer connection library did not load.");
  const room = new window.PeerRoom({ namespace: "dodge", maxPlayers: 4, storageKey: "dodge.room.session.v1" });
  room.onStatus = (status, message) => {
    const conn = $("on-connection");
    conn.dataset.state = status;
    conn.textContent = status === "connected" ? "Connected" : status === "reconnecting" ? "Recovering" : "Offline";
    if (message) onLog(message);
    renderOnline();
  };
  room.onError = (error) => {
    onError(error.message);
    onLog(error.message);
    renderOnline();
  };
  room.onRoster = (roster) => {
    online.roster = roster;
    if (room.isHost && online.model) {
      online.model.players = roster.map((p) => ({ id: p.id, name: p.name, connected: p.connected !== false }));
      publishModel();
    }
    renderOnline();
  };
  room.onState = (state) => {
    if (!room.isHost) {
      online.model = state;
      onlineRecompute();
    }
  };
  room.onAction = (clientId, action) => handleAction(clientId, action);
  room.onEvent = (_clientId, event) => {
    if (event?.kind === "log") onLog(event.text);
  };
  room.onBecomeHost = (recovered) => {
    online.model = recovered || online.model || blankModel();
    online.model.players = online.roster.map((p) => ({ id: p.id, name: p.name, connected: p.connected !== false }));
    publishModel();
    onLog("Table recovered. You are now the host.");
  };
  return room;
}
function blankModel() {
  return {
    kind: "lobby",
    settings: { seats: online.seats, cube: $("on-cube").checked && online.seats === 2, aceHigh: $("on-ace-high").checked },
    players: [],
    scores: {},
    games: 0,
    game: null,
    log: [],
  };
}
function publishModel() {
  if (!online.room?.isHost || !online.model) return;
  online.room.publishState(online.model);
  onlineRecompute();
}
function onLog(text) {
  online.log.unshift(text);
  if (online.log.length > 60) online.log.pop();
}
function hostLog(text) {
  online.model.log = [text, ...(online.model.log ?? [])].slice(0, 60);
}
function startGame() {
  const m = online.model;
  const players = m.players.filter((p) => p.connected !== false).slice(0, m.settings.seats);
  if (players.length < 2) {
    hostLog("Need at least two connected players to start.");
    publishModel();
    return;
  }
  const deck = shuffledDeck();
  const hands = players.map((_, i) => [deck[i]]);
  const first = firstDrawer(hands.map((h) => h[0]), m.settings.aceHigh);
  m.kind = "game";
  m.game = {
    seats: players.map((p) => p.id),
    hands,
    turn: first,
    first,
    cube: { owner: "center", value: 1, offered: false },
    result: null,
    lastDrawn: null,
  };
  hostLog(`Game ${m.games + 1}: ${players[first].name} holds the lowest card and draws first.`);
  publishModel();
}
function gameAlive(g) {
  return g.hands.map((h) => !new Hand(h).busted);
}
function finishGame(result) {
  const m = online.model;
  const g = m.game;
  g.result = result;
  m.games++;
  for (const [id, pts] of Object.entries(result.points)) m.scores[id] = (m.scores[id] ?? 0) + pts;
  hostLog(result.text);
}
function handleAction(clientId, action) {
  const m = online.model;
  if (!m) return;
  const isHost = clientId === online.room.clientId;
  if (action.type === "start") {
    if (!isHost) return;
    if (m.kind === "lobby" || m.game?.result) startGame();
    publishModel();
    return;
  }
  if (action.type === "lobby") {
    if (!isHost) return;
    m.kind = "lobby";
    m.game = null;
    publishModel();
    return;
  }
  const g = m.game;
  if (!g || g.result) return;
  const seat = g.seats.indexOf(clientId);
  const alive = gameAlive(g);
  const n = g.hands.length;
  const name = (i) => m.players.find((p) => p.id === g.seats[i])?.name ?? seatLabel(i);
  if (action.type === "draw") {
    if (seat !== g.turn || g.cube.offered) return;
    const deck = remainingDeck(g.hands);
    if (!deck.length) return;
    const card = deck[Math.floor(Math.random() * deck.length)];
    g.hands[seat].push(card);
    g.lastDrawn = { seat, card };
    const category = new Hand(g.hands[seat]).category();
    const nowAlive = gameAlive(g);
    const count = nowAlive.filter(Boolean).length;
    if (category >= 0) hostLog(`${name(seat)} draws ${cardName(card)} and busts with a ${CATEGORIES[category].toLowerCase()}.`);
    else hostLog(`${name(seat)} draws ${cardName(card)}.`);
    if (count === 1) {
      const winner = nowAlive.indexOf(true);
      const pts = m.settings.cube ? g.cube.value : 1;
      finishGame({ winner, points: { [g.seats[winner]]: pts }, text: `${name(winner)} wins ${pts} point${pts === 1 ? "" : "s"}.` });
    } else if (count === 0) finishGame({ points: {}, text: "Everyone busted." });
    else if (remainingDeck(g.hands).length === 0) {
      const survivors = nowAlive.map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
      const points = {};
      survivors.forEach((i) => (points[g.seats[i]] = Math.round((100 / survivors.length)) / 100));
      finishGame({ split: true, points, text: `Deck exhausted: ${survivors.map(name).join(", ")} split the pot.` });
    } else g.turn = nextAlive(seat, nowAlive);
    publishModel();
    return;
  }
  if (!m.settings.cube || n !== 2) return;
  if (action.type === "double") {
    if (seat !== g.turn || g.cube.offered || !(g.cube.owner === "center" || g.cube.owner === seat)) return;
    g.cube.offered = true;
    hostLog(`${name(seat)} doubles to ${g.cube.value * 2}.`);
    publishModel();
    return;
  }
  if (action.type === "take" || action.type === "pass") {
    if (!g.cube.offered || seat !== 1 - g.turn) return;
    g.cube.offered = false;
    if (action.type === "take") {
      g.cube.value *= 2;
      g.cube.owner = seat;
      hostLog(`${name(seat)} takes. Cube at ${g.cube.value}.`);
    } else {
      hostLog(`${name(seat)} passes.`);
      finishGame({ winner: g.turn, points: { [g.seats[g.turn]]: g.cube.value }, text: `${name(g.turn)} wins ${g.cube.value} point${g.cube.value === 1 ? "" : "s"} (${name(seat)} passed).` });
    }
    publishModel();
  }
}
async function onlineRecompute() {
  const token = ++online.token;
  online.result = null;
  online.analysis = null;
  renderOnline();
  const g = online.model?.game;
  if (!g) return;
  const p = PRECISION.standard;
  const deck = remainingDeck(g.hands);
  const alive = gameAlive(g);
  try {
    const table = await cachedRequest("table", { hands: g.hands, turn: alive[g.turn] ? g.turn : Math.max(0, alive.indexOf(true)), deck, games: p.games, rollouts: p.rollouts, exactDepth: p.exactDepth });
    if (token !== online.token) return;
    online.result = table;
    renderOnline();
    if (online.model.settings.cube && g.hands.length === 2 && !g.result && alive[0] && alive[1]) {
      const cubeState = g.cube.owner === "center" ? CUBE.CENTER : g.cube.owner === g.turn ? CUBE.ON_TURN : CUBE.OTHER;
      const a = await cachedRequest("cube", { onTurn: g.hands[g.turn], other: g.hands[1 - g.turn], deck, cube: cubeState, rollouts: p.cubeRollouts, exactDepth: 2, ply: p.ply });
      if (token !== online.token) return;
      online.analysis = a;
      renderOnline();
    }
  } catch (error) {
    console.error(error);
  }
}
function renderOnline() {
  const room = online.room;
  const connected = room?.connected || room?.isHost;
  $("online-lobby").hidden = Boolean(room && (connected || room.roomCode));
  $("online-room").hidden = !(room && (connected || room.roomCode));
  $("on-resume").hidden = !(!room && localStorage.getItem("dodge.room.session.v1"));
  if (!room) return;
  $("on-room-code").textContent = room.roomCode || "—";
  $("on-roster").textContent = online.roster.map((p) => `${p.name}${p.host ? " (host)" : ""}${p.connected === false ? " (away)" : ""}`).join(", ") || "—";
  const m = online.model;
  const me = room.clientId;
  $("on-start").hidden = !(room.isHost && m && (m.kind === "lobby" || m.game?.result));
  $("on-start").textContent = m?.games ? "Next game" : "Start game";
  const log = $("on-log");
  log.replaceChildren();
  [...(m?.log ?? []), ...online.log].slice(0, 40).forEach((text) => log.append(el("li", "", text)));
  const prompt = $("on-prompt");
  const actions = $("on-actions");
  actions.replaceChildren();
  prompt.classList.remove("alert");
  $("on-games").textContent = String(m?.games ?? 0);
  if (!m || !m.game) {
    $("on-status").textContent = m ? `Lobby · ${m.players.length} of ${m.settings.seats} seats` : "Connecting…";
    $("on-deck").textContent = "—";
    $("on-deckout").textContent = "—";
    $("on-cube-panel").hidden = true;
    prompt.textContent = room.isHost ? (m && m.players.filter((p) => p.connected !== false).length >= 2 ? "Everyone is here. Start the game when ready." : "Waiting for players. Share the room code or invite link.") : "Waiting for the host to start.";
    $("on-seats").replaceChildren();
    (m?.players ?? []).forEach((p, i) => {
      const seat = el("div", `seat${p.id === me ? " me" : ""}`);
      const head = el("div", "seat-head");
      head.append(el("div", "seat-name", `${seatLabel(i)} · ${p.name}${p.id === me ? " (you)" : ""}`));
      head.append(el("span", "seat-score", `${m.scores?.[p.id] ?? 0} pts`));
      seat.append(head);
      $("on-seats").append(seat);
    });
    return;
  }
  const g = m.game;
  const alive = gameAlive(g);
  const names = g.seats.map((id, i) => {
    const p = m.players.find((x) => x.id === id);
    return `${p?.name ?? seatLabel(i)}${id === me ? " (you)" : ""}`;
  });
  const meSeat = g.seats.indexOf(me);
  const cubeOn = m.settings.cube && g.hands.length === 2;
  const count = alive.filter(Boolean).length;
  const deck = remainingDeck(g.hands);
  const status = g.result
    ? { over: true, winner: g.result.winner, split: g.result.split, text: g.result.text }
    : g.cube.offered
      ? { over: false, text: `${names[g.turn]} doubled to ${g.cube.value * 2}. ${names[1 - g.turn]} to respond.` }
      : { over: false, text: `${names[g.turn]} to draw.` };
  $("on-status").textContent = status.text;
  $("on-deck").textContent = `${deck.length} cards`;
  const deckOut = $("on-deckout");
  deckOut.textContent = online.result ? pct(online.result.deckOut, 2) : "…";
  deckOut.className = `stat-value${online.result ? " scaled" : ""}`;
  if (online.result) deckOut.style.setProperty("--scale", scaleColor(1 - Math.min(1, online.result.deckOut * 50)));
  renderSeats($("on-seats"), {
    hands: g.hands,
    names,
    alive,
    turn: g.turn,
    first: g.first,
    status,
    result: online.result,
    cubeOn,
    cube: g.cube,
    analysis: online.analysis,
    lastDrawn: g.lastDrawn,
    scores: g.seats.map((id) => m.scores?.[id] ?? 0),
    meSeat,
  });
  // prompt & actions
  if (status.over) {
    prompt.textContent = room.isHost ? "Game over. Start the next game when ready." : "Game over. Waiting for the host.";
  } else if (g.cube.offered) {
    if (meSeat === 1 - g.turn) {
      prompt.textContent = `${names[g.turn]} doubles to ${g.cube.value * 2}. Take or pass?`;
      prompt.classList.add("alert");
      actions.append(button("Take", "primary", () => room.sendAction({ type: "take" })), button("Pass", "danger", () => room.sendAction({ type: "pass" })));
    } else prompt.textContent = `Waiting for ${names[1 - g.turn]} to take or pass.`;
  } else if (meSeat === g.turn) {
    const canDouble = cubeOn && (g.cube.owner === "center" || g.cube.owner === meSeat);
    prompt.textContent = canDouble ? `Your turn. Double to ${g.cube.value * 2} or draw.` : "Your turn. Draw a card.";
    prompt.classList.add("alert");
    if (canDouble) actions.append(button(`Double to ${g.cube.value * 2}`, "primary", () => room.sendAction({ type: "double" })));
    actions.append(button(canDouble ? "Draw · no double" : "Draw", canDouble ? "" : "primary", () => room.sendAction({ type: "draw" })));
  } else prompt.textContent = meSeat < 0 ? `Spectating. ${status.text}` : `Waiting for ${names[g.turn]}.`;
  // cube panel
  $("on-cube-panel").hidden = !cubeOn;
  if (cubeOn) {
    $("on-cube-value").textContent = String(g.cube.value);
    $("on-cube-owner").textContent = g.cube.owner === "center" ? "centered" : `${names[g.cube.owner]} owns`;
    const table = $("on-cube-table");
    table.replaceChildren();
    if (status.over || count < 2) {
      $("on-cube-title").textContent = "Game over";
      $("on-cube-subtitle").textContent = status.text;
    } else {
      $("on-cube-title").textContent = g.cube.offered ? `${names[g.turn]} doubles to ${g.cube.value * 2}` : `${names[g.turn]} to act`;
      $("on-cube-subtitle").textContent = "Solver view of the position, visible to everyone at the table.";
      if (online.analysis) cubeAnalysisRows(table, online.analysis, { mover: names[g.turn], responder: names[1 - g.turn], value: g.cube.value, preview: true, canDouble: online.analysis.canDouble });
      else {
        const row = el("tr");
        row.append(el("td", "muted", "Solving…"));
        table.append(row);
      }
    }
  }
}
async function createRoom() {
  onError("");
  try {
    online.room = newRoom();
    online.room.maxPlayers = online.seats;
    await online.room.create(onName());
    online.roster = online.room.snapshot().players;
    online.model = blankModel();
    online.model.players = online.roster.map((p) => ({ id: p.id, name: p.name, connected: true }));
    history.replaceState(null, "", `#room=${online.room.roomCode}`);
    publishModel();
    renderOnline();
  } catch (error) {
    online.room = null;
    onError(error.message);
    renderOnline();
  }
}
async function joinRoom(code) {
  onError("");
  try {
    online.room = newRoom();
    await online.room.join(code, onName());
    online.roster = online.room.snapshot().players;
    history.replaceState(null, "", `#room=${online.room.roomCode}`);
    renderOnline();
  } catch (error) {
    online.room = null;
    onError(error.message);
    renderOnline();
  }
}
async function resumeRoom() {
  onError("");
  try {
    online.room = newRoom();
    await online.room.resume();
    online.roster = online.room.snapshot().players;
    if (online.room.isHost) {
      online.model = online.model || blankModel();
      online.model.players = online.roster.map((p) => ({ id: p.id, name: p.name, connected: true }));
      publishModel();
    }
    history.replaceState(null, "", `#room=${online.room.roomCode}`);
    renderOnline();
  } catch (error) {
    online.room = null;
    onError(error.message);
    renderOnline();
  }
}
function leaveRoom() {
  online.room?.leave();
  online.room = null;
  online.model = null;
  online.roster = [];
  online.log = [];
  history.replaceState(null, "", "#online");
  renderOnline();
}
$("on-name").value = localStorage.getItem("dodge.player.name") || "";
document.querySelectorAll("#on-seat-count > button").forEach((b) =>
  b.addEventListener("click", () => {
    online.seats = Number(b.dataset.n);
    document.querySelectorAll("#on-seat-count > button").forEach((x) => x.classList.toggle("active", x === b));
    if (online.seats !== 2) $("on-cube").checked = false;
  }),
);
$("on-cube").addEventListener("change", () => {
  if ($("on-cube").checked && online.seats !== 2) {
    online.seats = 2;
    document.querySelectorAll("#on-seat-count > button").forEach((x) => x.classList.toggle("active", x.dataset.n === "2"));
  }
});
$("on-create").addEventListener("click", createRoom);
$("on-join").addEventListener("click", () => joinRoom($("on-code").value));
$("on-code").addEventListener("keydown", (e) => e.key === "Enter" && joinRoom($("on-code").value));
$("on-resume").addEventListener("click", resumeRoom);
$("on-leave").addEventListener("click", leaveRoom);
$("on-copy").addEventListener("click", async () => {
  const url = `${location.origin}${location.pathname}#room=${online.room?.roomCode ?? ""}`;
  try {
    await navigator.clipboard.writeText(`Join my Dodge table: ${url}\nRoom code: ${online.room?.roomCode ?? ""}`);
    onLog("Invite copied.");
  } catch {
    onLog(`Invite link: ${url}`);
  }
  renderOnline();
});
$("on-start").addEventListener("click", () => online.room?.sendAction({ type: "start" }));

/* ====================================================================
   REPORTS
   ==================================================================== */
let reportsLoaded = false;
async function loadReports() {
  if (reportsLoaded) return;
  reportsLoaded = true;
  const root = $("reports");
  try {
    const [table, cube] = await Promise.all([
      fetch("./data/table-report.json").then((r) => (r.ok ? r.json() : null)),
      fetch("./data/cube-report.json").then((r) => (r.ok ? r.json() : null)),
    ]);
    root.replaceChildren();
    if (cube) renderCubeReport(root, cube);
    if (table) renderTableReport(root, table);
    if (!cube && !table) root.append(el("p", "muted", "No precomputed reports were found."));
    $("reports-loading").hidden = true;
    root.hidden = false;
  } catch (error) {
    $("reports-loading").textContent = `Could not load reports: ${error.message}`;
  }
}
function tile(label, value, note, t) {
  const s = el("div", "stat");
  s.append(el("span", "stat-label", label));
  const v = el("span", `stat-value${t != null ? " scaled" : ""}`, value);
  if (t != null) v.style.setProperty("--scale", scaleColor(t));
  s.append(v);
  if (note) s.append(el("span", "stat-note", note));
  return s;
}
function card(title, text, { wide = false } = {}) {
  const c = el("div", `report-card${wide ? " wide" : ""}`);
  c.append(el("h2", "", title));
  if (text) c.append(el("p", "", text));
  return c;
}
function bars(rows, { format = (v) => pct(v), max = null, alt = false } = {}) {
  const wrap = el("div", "bars");
  const top = max ?? Math.max(...rows.map((r) => r.value), 1e-9);
  rows.forEach((r) => {
    wrap.append(el("span", "bar-label", r.label));
    const bar = el("span", "bar");
    const fill = el("i", alt ? "alt" : "");
    fill.style.width = `${Math.max(0, Math.min(100, (r.value / top) * 100))}%`;
    if (r.t != null) fill.style.background = scaleColor(r.t);
    bar.append(fill);
    wrap.append(bar);
    wrap.append(el("span", "bar-value", format(r.value)));
  });
  return wrap;
}
function histRows(arr, { from = 0, label = (i) => String(i), total = null, collapseBelow = 0.002 } = {}) {
  const sum = total ?? arr.reduce((a, b) => a + (b ?? 0), 0);
  const rows = [];
  let tail = 0,
    tailFrom = null;
  arr.forEach((v, i) => {
    if (i < from) return;
    const p = (v ?? 0) / sum;
    const remaining = arr.slice(i).reduce((a, b) => a + (b ?? 0), 0) / sum;
    if (rows.length && remaining < collapseBelow) {
      if (tailFrom == null) tailFrom = i;
      tail += p;
    } else rows.push({ label: label(i), value: p });
  });
  if (tailFrom != null && tail > 0) rows.push({ label: `${label(tailFrom)}+`, value: tail });
  return rows;
}
function meanOf(arr) {
  let s = 0,
    n = 0;
  arr.forEach((v, i) => {
    s += (v ?? 0) * i;
    n += v ?? 0;
  });
  return n ? s / n : 0;
}
function section(root, title, text) {
  const h = el("div", "report-section");
  h.append(el("h2", "", title));
  if (text) h.append(el("p", "", text));
  root.append(h);
}
function renderCubeReport(root, r) {
  const g = r.games;
  section(root, "Doubling cube under optimal play", `${fmtInt(g)} two-player money games with both sides following the solver (${r.policy}). First drawer is the player holding the lower card.`);
  const tiles = el("div", "tiles-row");
  const firstPts = r.firstPoints / g;
  const gamesWithDouble = r.firstDoubleAt.reduce((a, b) => a + (b ?? 0), 0);
  tiles.append(
    tile("Games with a double", pct(gamesWithDouble / g), "at least one double offered", gamesWithDouble / g),
    tile("Cube turned", pct(r.cubeTurnedGames / g), "at least one take"),
    tile("Ended by a pass", pct(r.endedByPass / g), `${pct(r.endedByBust / g)} ended by a bust`),
    tile("Take rate", pct(r.doublesTaken / Math.max(1, r.doublesOffered)), `${fmtInt(r.doublesOffered)} doubles offered`),
    tile("Redoubled games", pct(r.redoubleGames / g), "cube reached 4 or more"),
    tile("Doubles per game", (r.doublesOffered / g).toFixed(2)),
    tile("First drawer wins", pct(r.firstWins / g), "cubeless record under cube play", r.firstWins / g),
    tile("First drawer points", `${signed(firstPts, 3)} / game`, `sd ${Math.sqrt(r.firstPointsSq / g - firstPts ** 2).toFixed(2)}`, 0.5 + firstPts),
    tile("Mean final cube", (Object.entries(r.finalCube).reduce((s, [k, v]) => s + Number(k) * v, 0) / g).toFixed(2), "stake at the end of the game"),
    tile("Doubler's win chance", pct(r.doublerPSum / Math.max(1, r.doublesOffered)), "cubeless, when doubling"),
    tile("Lowest double seen", pct(r.minDoubleP), "cubeless win chance"),
    tile("Doubler busts next draw", pct(r.doublerBustNextSum / Math.max(1, r.doublesOffered)), "average when doubling"),
  );
  root.append(tiles);
  const grid = el("div", "report-grid");
  grid.style.marginTop = "14px";

  const strategy = card("Doubling window", "How often the solver doubles as a function of the doubler's cubeless win chance, over every decision where doubling was allowed.");
  const stratTable = el("table", "mini-table");
  const head = el("tr");
  ["Win chance", "Decisions", "Doubles", "Double rate", "Taken", "Passed"].forEach((h) => head.append(el("th", "", h)));
  stratTable.append(head);
  for (let b = 0; b < 20; b++) {
    const nd = r.noDoubleP[b] ?? 0,
      d = r.doublerP[b] ?? 0;
    if (!nd && !d) continue;
    const row = el("tr");
    row.append(el("td", "", `${b * 5}–${b * 5 + 5}%`));
    row.append(el("td", "", fmtInt(nd + d)));
    row.append(el("td", "", fmtInt(d)));
    const rate = d / (nd + d);
    const rateCell = el("td", "");
    const heat = el("span", "heat", pct(rate));
    heat.style.setProperty("--heat", heatColor(rate));
    rateCell.append(heat);
    row.append(rateCell);
    // responder bins are indexed by responder win chance = 1 - p → bin 19 - b (approximately)
    const rb = 19 - b;
    row.append(el("td", "", fmtInt(r.takeP[rb] ?? 0)));
    row.append(el("td", "", fmtInt(r.passP[rb] ?? 0)));
    stratTable.append(row);
  }
  strategy.append(stratTable);
  strategy.append(el("p", "", "Taken and Passed count the responder's answers in the matching bin (responder win chance = 1 − doubler win chance). The effective take point is where passes overtake takes."));
  grid.append(strategy);

  const takeCard = card("Take point", "Responder's cubeless win chance when taking versus passing.");
  const takeRows = [];
  for (let b = 0; b < 20; b++) {
    const t = r.takeP[b] ?? 0,
      p = r.passP[b] ?? 0;
    if (!t && !p) continue;
    takeRows.push({ label: `${b * 5}–${b * 5 + 5}%`, value: t / (t + p), t: t / (t + p) });
  }
  takeCard.append(bars(takeRows, { format: (v) => `take ${pct(v, 0)}` }));
  takeCard.append(el("p", "", `Mean responder win chance: ${pct(r.takePSum / Math.max(1, r.doublesTaken))} when taking, ${pct(r.passPSum / Math.max(1, r.doublesPassed))} when passing. Highest win chance that was still passed: ${pct(r.maxTakeLossP)}.`));
  grid.append(takeCard);

  const finalCard = card("Final cube value", "Stake at the end of the game. A pass ends the game at the cube value before the refused double.");
  const finalRows = Object.entries(r.finalCube)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([k, v]) => ({ label: k, value: v / g }));
  finalCard.append(bars(finalRows));
  grid.append(finalCard);

  const pointsCard = card("Points for the first drawer", "Distribution of the game result from the first drawer's side.");
  const pointRows = Object.entries(r.pointsDist)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([k, v]) => ({ label: signed(Number(k), 0), value: v / g, t: Number(k) > 0 ? 0.75 : 0.25 }));
  pointsCard.append(bars(pointRows));
  grid.append(pointsCard);

  const levelCard = card("Doubles by cube level", "Offers, takes and passes at each cube value before the double.");
  const levelTable = el("table", "mini-table");
  const lh = el("tr");
  ["Cube before", "Offered", "Taken", "Passed", "Take rate"].forEach((h) => lh.append(el("th", "", h)));
  levelTable.append(lh);
  Object.entries(r.byLevel)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .forEach(([k, v]) => {
      const row = el("tr");
      row.append(el("td", "", `${k} → ${Number(k) * 2}`), el("td", "", fmtInt(v.offered)), el("td", "", fmtInt(v.taken)), el("td", "", fmtInt(v.passed)));
      const cell = el("td", "");
      const heat = el("span", "heat", pct(v.taken / Math.max(1, v.offered)));
      heat.style.setProperty("--heat", heatColor(v.taken / Math.max(1, v.offered)));
      cell.append(heat);
      row.append(cell);
      levelTable.append(row);
    });
  levelCard.append(levelTable);
  levelCard.append(el("p", "", `Of the doubles that were taken, the doubler went on to win ${pct(r.takenDoublesWonByDoubler / Math.max(1, r.takenDoubles))} of those games.`));
  grid.append(levelCard);

  const whenCard = card("When the first double comes", "Total cards drawn at the table when the first double is offered.");
  whenCard.append(bars(histRows(r.firstDoubleAt, { label: (i) => `after ${i} draw${i === 1 ? "" : "s"}` }), { alt: true }));
  whenCard.append(el("p", "", `The first double comes from the first drawer ${pct(r.firstDoubleBy.first / Math.max(1, gamesWithDouble))} of the time and from the second drawer ${pct(r.firstDoubleBy.second / Math.max(1, gamesWithDouble))}. Mean draws before the first double: ${meanOf(r.firstDoubleAt).toFixed(1)}.`));
  grid.append(whenCard);

  const handCard = card("Hand sizes at the double", "Cards held by the doubler and the responder when a double is offered.");
  const sizeTable = el("table", "mini-table");
  const sh = el("tr");
  ["Cards", "Doubler", "Responder"].forEach((h) => sh.append(el("th", "", h)));
  sizeTable.append(sh);
  const maxLen = Math.max(r.doublerHand.length, r.responderHand.length);
  for (let i = 1; i < maxLen; i++) {
    const d = r.doublerHand[i] ?? 0,
      s = r.responderHand[i] ?? 0;
    if (!d && !s) continue;
    const row = el("tr");
    row.append(el("td", "", String(i)), el("td", "", pct(d / r.doublesOffered)), el("td", "", pct(s / r.doublesOffered)));
    sizeTable.append(row);
  }
  handCard.append(sizeTable);
  handCard.append(el("p", "", `Mean hand size: doubler ${meanOf(r.doublerHand).toFixed(2)}, responder ${meanOf(r.responderHand).toFixed(2)}.`));
  grid.append(handCard);

  const bustCard = card("Doubler's bust risk on the next draw", "When the solver doubles, how likely is the doubler to bust on the very next card?");
  bustCard.append(bars(histRows(r.doublerBustNextHist, { label: (i) => `${i * 5}–${i * 5 + 5}%`, collapseBelow: 0 }), { alt: true }));
  grid.append(bustCard);

  const lengthCard = card("Game length", "Total cards drawn per game (bust card included; passes end games early).");
  lengthCard.append(bars(histRows(r.gameLength, { label: (i) => `${i} draws` })));
  lengthCard.append(el("p", "", `Mean ${meanOf(r.gameLength).toFixed(2)} draws. Winner holds ${meanOf(r.winnerCards).toFixed(2)} cards on average, loser ${meanOf(r.loserCards).toFixed(2)}.`));
  grid.append(lengthCard);

  const catCard = card("How games end by a bust", "Category of the busting hand when the game ends by a bust.");
  const busts = r.bustCategory.reduce((a, b) => a + b, 0);
  catCard.append(bars(r.categories.map((c, i) => ({ label: c, value: r.bustCategory[i] / Math.max(1, busts) }))));
  grid.append(catCard);
  root.append(grid);
}
function renderTableReport(root, r) {
  const ranks = r.ranks;
  section(root, "Cubeless tables", `Monte Carlo games for two, three and four players, each dealt one card, lowest card first with ace high and clubs lowest. ${fmtInt(r.players[2].games)} games per player count.`);
  const tiles = el("div", "tiles-row");
  [2, 3, 4].forEach((n) => {
    const s = r.players[n];
    tiles.append(tile(`${n} players · first drawer wins`, pct(s.byOrder[0] / s.games), `fair share ${pct(1 / n, 0)}`, equityT(s.byOrder[0] / s.games, n)));
  });
  tiles.append(tile("4 players · deck runs out", pct(r.players[4].deckOut / r.players[4].games, 3), `${fmtInt(r.players[4].deckOut)} of ${fmtInt(r.players[4].games)} games`));
  tiles.append(tile("3 players · deck runs out", pct(r.players[3].deckOut / r.players[3].games, 3), "impossible: 17 + 17 + 17 > 52"));
  root.append(tiles);
  const grid = el("div", "report-grid");
  grid.style.marginTop = "14px";
  [2, 3, 4].forEach((n) => {
    const s = r.players[n];
    const c = card(`${n} players · equity by draw order`, "Who wins depending on when they draw in the rotation. The first drawer holds the lowest card.");
    c.append(bars(s.byOrder.map((v, i) => ({ label: i === 0 ? "Draws first" : `Draws ${["second", "third", "fourth"][i - 1]}`, value: v / s.games, t: equityT(v / s.games, n) })), { max: 1 }));
    c.append(el("p", "", `First to bust: ${s.bustOrderFirst.map((v, i) => `${["1st", "2nd", "3rd", "4th"][i]} drawer ${pct(v / s.games)}`).join(", ")}. Mean game length ${meanOf(s.gameLength).toFixed(1)} draws; the winner never needed a fifth card in ${pct(s.winnerNeverFive / s.games)} of games.`));
    grid.append(c);
  });
  [2, 3, 4].forEach((n) => {
    const s = r.players[n];
    const c = card(`${n} players · equity by starting card`, "Win chance of a player whose first card has this rank, averaged over seats.");
    c.append(bars(ranks.map((rank, i) => ({ label: rank === "T" ? "10" : rank, value: s.byRank[i] / Math.max(1, s.rankCount[i]), t: equityT(s.byRank[i] / Math.max(1, s.rankCount[i]), n) })), { max: 1 }));
    grid.append(c);
  });
  const two = r.players[2];
  const heat = card("2 players · first drawer's equity by both starting ranks", "Rows: the first drawer's card (the lower one). Columns: the opponent's card. Cells are the first drawer's win chance.", { wide: true });
  const wrap = el("div", "heatmap-wrap");
  const map = el("div", "heatmap");
  map.style.gridTemplateColumns = `repeat(14, minmax(28px, 1fr))`;
  map.append(el("span", "head", ""));
  ranks.forEach((rank) => map.append(el("span", "head", rank === "T" ? "10" : rank)));
  for (let a = 0; a < 13; a++) {
    map.append(el("span", "head", ranks[a] === "T" ? "10" : ranks[a]));
    for (let b = 0; b < 13; b++) {
      const cnt = two.matrixCount[a][b];
      if (!cnt) {
        map.append(el("span", "empty", ""));
        continue;
      }
      const v = two.matrix[a][b] / cnt;
      const cell = el("span", "", pct(v, 0));
      cell.style.setProperty("--heat", heatColor(v));
      cell.title = `First drawer ${ranks[a]} vs ${ranks[b]}: ${pct(v)} over ${fmtInt(cnt)} games`;
      map.append(cell);
    }
  }
  wrap.append(map);
  heat.append(wrap);
  grid.append(heat);
  [2, 3, 4].forEach((n) => {
    const s = r.players[n];
    const c = card(`${n} players · game length and busts`, "Total cards drawn per game and the category that busted each eliminated player.");
    c.append(bars(histRows(s.gameLength, { label: (i) => `${i} draws` })));
    c.append(el("p", "", `Busts: ${r.categories.map((cat, i) => `${cat.toLowerCase()} ${pct(s.bustCategory[i] / Math.max(1, s.totalBusts))}`).join(", ")}. Largest hand at the table averages ${meanOf(s.maxHand).toFixed(1)} cards.`));
    grid.append(c);
  });
  root.append(grid);
}

/* ====================================================================
   Keyboard stepping & boot
   ==================================================================== */
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
  if (activeTab === "sim") {
    if (e.key === "ArrowLeft") stepBack();
    else if (e.key === "ArrowRight") stepForward();
    else if (e.key === " " || e.key === "d") {
      e.preventDefault();
      drawCard() && recompute();
    }
  } else if (activeTab === "trainer") {
    if (e.key === "ArrowLeft") trStepBack();
    else if (e.key === "ArrowRight") trStepForward();
  }
});
renderSim();
trRender();
renderOnline();
window.addEventListener("hashchange", () => {
  const tab = location.hash.slice(1);
  if (TABS.includes(tab) && tab !== activeTab) showTab(tab);
});
const hash = location.hash;
if (hash.startsWith("#spot=")) showTab("sim");
else if (hash.startsWith("#room=")) {
  showTab("online");
  $("on-code").value = hash.slice(6).toUpperCase();
} else if (TABS.includes(hash.slice(1))) showTab(hash.slice(1));
