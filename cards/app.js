(function () {
  "use strict";

  const E = window.CardEngine;
  const V = window.CardEvaluators;
  const P = window.CardPresets;

  // ------------------------------------------------------------ utilities
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SUIT_SYMBOL = { s: "♠", h: "♥", d: "♦", c: "♣", x: "★" };
  const RANK_SHOW = (rank) => (rank === "T" ? "10" : rank);
  const MARK_COLORS = [["#ff5c66", "Red"], ["#f4c95d", "Gold"], ["#45d6ff", "Cyan"], ["#bdf46b", "Green"], ["#9f7dff", "Violet"]];

  const STORE = { table: "ctw.table.v1", prefs: "ctw.prefs.v1", presets: "ctw.presets.v1", saves: "ctw.saves.v1", seen: "ctw.seen.v1", name: "ctw.name.v1" };
  function load(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (error) { return fallback; }
  }
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (error) { return false; }
  }

  const prefs = Object.assign({
    size: "m", felt: "green", back: "classic", four: false, motion: true, evals: true,
    tab: "play", side: window.innerWidth > 820, viewMode: "hands",
  }, load(STORE.prefs, {}));
  function savePrefs() { store(STORE.prefs, prefs); applyPrefs(); }
  function applyPrefs() {
    document.body.dataset.size = prefs.size;
    document.body.dataset.felt = prefs.felt;
    document.body.dataset.back = prefs.back;
    document.body.dataset.four = prefs.four ? "1" : "0";
    document.body.dataset.motion = prefs.motion ? "1" : "0";
    document.body.classList.toggle("side-collapsed", !prefs.side);
  }

  // ---------------------------------------------------------------- state
  let state = null; // full state (local/host) or the redacted view (client)
  let view = null; // what this screen renders
  let history = [];
  let future = [];
  let selection = new Set();
  let evalCache = new Map();
  let passRevealed = null;
  let saveTimer = null;
  const net = { room: null, mode: "local", roster: [], code: "" };
  const timer = { total: 60, left: 60, running: false, handle: null, autoNext: false };
  let equityResult = null;
  let hyper = { ranks: [], suits: [], draws: 1 };

  function toast(message, kind = "") {
    const el = document.createElement("div");
    el.className = "toast " + kind;
    el.textContent = message;
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), kind === "error" ? 4200 : 2400);
  }

  // ------------------------------------------------------------- viewer
  function mySeatId(source = state) {
    if (!source) return null;
    if (net.mode !== "local") {
      const id = net.room?.clientId;
      return source.players.find((player) => player.clientId && player.clientId === id)?.id || null;
    }
    if (prefs.viewMode.startsWith("seat:")) {
      const id = prefs.viewMode.slice(5);
      return source.players.some((player) => player.id === id) ? id : null;
    }
    if (prefs.viewMode === "pass") return source.players[source.turn.index]?.id || null;
    return null;
  }

  function computeView() {
    if (!state) return null;
    if (net.mode === "client") return state;
    if (net.mode === "host") return E.viewFor(state, mySeatId() || "__spectator");
    const mode = prefs.viewMode;
    if (mode === "xray") return E.viewFor(state, "*");
    if (mode === "hands") return E.viewFor(state, "*hands");
    if (mode === "pass") {
      const current = state.players[state.turn.index]?.id;
      return E.viewFor(state, passRevealed === current ? current : "__nobody");
    }
    const seat = mySeatId();
    return E.viewFor(state, seat || "*hands");
  }

  /** Where "draw" should land: my hand, else the current player's hand. */
  function myHandZone() {
    const v = view;
    if (!v) return null;
    const seat = mySeatId() || v.players[v.turn.index]?.id;
    if (!seat) return null;
    const zones = E.orderedZones(v, seat);
    return (zones.find((zone) => zone.key === "hand") || zones.find((zone) => zone.kind === "hand") || zones[0])?.id || null;
  }

  // ------------------------------------------------------------ dispatch
  function dispatch(action) {
    if (!state) return;
    if (net.mode === "client") {
      try { net.room.sendAction(action); } catch (error) { toast(error.message, "error"); }
      return;
    }
    applyLocal(action, mySeatId());
  }

  function applyLocal(action, actor) {
    try {
      const next = E.reduce(state, action, actor);
      history.push(state);
      if (history.length > 120) history.shift();
      future = [];
      state = next;
      afterChange();
      return true;
    } catch (error) {
      toast(error.message || String(error), "error");
      return false;
    }
  }

  function undo() {
    if (net.mode === "client") return dispatch({ type: "__undo" });
    if (!history.length) return toast("Nothing to undo");
    future.push(state);
    state = history.pop();
    state.rev = (future[future.length - 1].rev || 0) + 1;
    afterChange();
  }

  function redo() {
    if (net.mode === "client") return dispatch({ type: "__redo" });
    if (!future.length) return toast("Nothing to redo");
    history.push(state);
    state = future.pop();
    state.rev = (history[history.length - 1].rev || 0) + 1;
    afterChange();
  }

  function afterChange() {
    if (net.mode !== "client") {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => store(STORE.table, state), 250);
    }
    if (net.mode === "host") publish();
    pruneSelection();
    render();
  }

  function replaceState(next, message) {
    if (state) history.push(state);
    future = [];
    state = next;
    selection.clear();
    passRevealed = null;
    afterChange();
    if (message) toast(message, "good");
  }

  function pruneSelection() {
    const v = computeView();
    for (const id of Array.from(selection)) if (!v || !v.cards[id]) selection.delete(id);
  }

  // ----------------------------------------------------------- evaluation
  const EVAL_DEFS = Object.fromEntries(V.EVALUATORS.map((def) => [def.id, def]));
  const UNRANKED = new Set(["count", "set-summary"]);

  function parseSpec(spec) {
    const [id, board] = String(spec).split("@");
    return { id, board: board || null };
  }

  function cardsOf(v, zone) {
    return zone.cards.map((id) => {
      const card = v.cards[id] || {};
      return card.visible && !card.custom ? { rank: card.rank, suit: card.suit } : card.custom ? { rank: card.rank, suit: "x", custom: true } : { rank: null, suit: null };
    });
  }

  function zoneByRef(v, ref, area) {
    if (!ref) return null;
    if (v.zones[ref]) return v.zones[ref];
    const key = String(ref).toLowerCase();
    const match = (zone) => (zone.key || "").toLowerCase() === key || zone.name.toLowerCase() === key;
    return E.orderedZones(v, "table").find(match) || (area ? E.orderedZones(v, area).find(match) : null) || null;
  }

  function evaluateZone(v, zone) {
    const out = [];
    for (const spec of zone.evals || []) {
      const { id, board } = parseSpec(spec);
      const def = EVAL_DEFS[id];
      if (!def) continue;
      const ctx = { ...(zone.ctx || {}) };
      const boardZone = zoneByRef(v, board || ctx.board, zone.area);
      delete ctx.board;
      if (boardZone && boardZone.id !== zone.id) ctx.board = cardsOf(v, boardZone).filter((card) => card.rank);
      const starterZone = zoneByRef(v, ctx.starter, zone.area);
      delete ctx.starter;
      if (starterZone && starterZone.cards.length) {
        const top = cardsOf(v, starterZone).slice(-1)[0];
        if (top?.rank) ctx.starter = top;
      }
      let result = null;
      const own = cardsOf(v, zone);
      const anyVisible = own.some((card) => card.rank);
      try { result = anyVisible ? V.evaluate(id, own, ctx) : null; } catch (error) { result = null; }
      out.push({ spec, id, def, result, boardZone, place: 0, best: false });
    }
    return out;
  }

  function evaluateAll(v) {
    const map = new Map();
    const bySpec = new Map();
    for (const zone of Object.values(v.zones)) {
      const list = evaluateZone(v, zone);
      map.set(zone.id, list);
      for (const entry of list) {
        if (!entry.result || UNRANKED.has(entry.id)) continue;
        const key = entry.spec + "|" + (zone.key || zone.id) + "|" + (zone.area === "table" ? "t" : "s");
        if (!bySpec.has(key)) bySpec.set(key, []);
        bySpec.get(key).push(entry);
      }
    }
    for (const entries of bySpec.values()) {
      if (entries.length < 2) continue;
      const places = V.rankResults(entries[0].id, entries.map((entry) => entry.result));
      entries.forEach((entry, index) => {
        entry.place = places[index];
        entry.best = places[index] === 1 && !entry.result.partial && entries.filter((other) => other.result && !other.result.partial).length >= 2;
      });
    }
    return map;
  }

  // ------------------------------------------------------ deck knowledge
  function deckRanksFor(spec) {
    if (spec.ranks && spec.ranks.length) return spec.ranks;
    return (E.DECK_PRESETS[spec.preset] || E.DECK_PRESETS.standard).ranks;
  }

  /** Every standard card in the configured deck that this viewer can't see. */
  function unseenCards(v) {
    const spec = E.normalizeDeckSpec(v.deckSpec);
    const copies = (E.DECK_PRESETS[spec.preset]?.copies || 1) * spec.decks;
    const counts = new Map();
    for (const suit of spec.suits) for (const rank of deckRanksFor(spec)) counts.set(rank + suit, copies);
    if (spec.jokers) counts.set("JKx", spec.jokers);
    let removed = 0;
    for (const card of Object.values(v.cards)) {
      if (!card.visible || card.custom) continue;
      const key = card.rank + card.suit;
      if (counts.get(key) > 0) { counts.set(key, counts.get(key) - 1); removed += 1; }
    }
    // Cards removed from the game shrink the pool too.
    const inGame = Object.keys(v.cards).length - Object.values(v.cards).filter((card) => card.custom).length;
    const out = [];
    counts.forEach((count, key) => {
      for (let i = 0; i < count; i += 1) out.push(key === "JKx" ? { rank: "JK", suit: "x" } : { rank: key[0], suit: key[1] });
    });
    const hiddenCount = inGame - removed;
    return { cards: out, hiddenCount, counts };
  }

  function choose(n, k) {
    if (k < 0 || k > n) return 0;
    let result = 1;
    for (let i = 1; i <= k; i += 1) result = (result * (n - k + i)) / i;
    return result;
  }

  function hypergeomAtLeast(N, K, n, k) {
    let p = 0;
    for (let i = k; i <= Math.min(K, n); i += 1) p += (choose(K, i) * choose(N - K, n - i)) / choose(N, n);
    return Math.max(0, Math.min(1, p));
  }

  const pct = (x) => (x * 100 >= 99.95 || x === 0 ? (x * 100).toFixed(0) : (x * 100).toFixed(1)) + "%";

  // ============================================================ RENDERING
  const PIP_LAYOUT = {
    2: [[50, 20], [50, 80]],
    3: [[50, 20], [50, 50], [50, 80]],
    4: [[32, 20], [68, 20], [32, 80], [68, 80]],
    5: [[32, 20], [68, 20], [50, 50], [32, 80], [68, 80]],
    6: [[32, 20], [68, 20], [32, 50], [68, 50], [32, 80], [68, 80]],
    7: [[32, 20], [68, 20], [50, 35], [32, 50], [68, 50], [32, 80], [68, 80]],
    8: [[32, 20], [68, 20], [50, 35], [32, 50], [68, 50], [50, 65], [32, 80], [68, 80]],
    9: [[32, 18], [68, 18], [32, 39], [68, 39], [50, 50], [32, 61], [68, 61], [32, 82], [68, 82]],
    10: [[32, 18], [68, 18], [50, 29], [32, 39], [68, 39], [32, 61], [68, 61], [50, 71], [32, 82], [68, 82]],
  };

  function cardFace(card) {
    if (card.custom) {
      return `<div class="c-title">${esc(card.label || card.rank)}</div><div class="c-text">${esc(card.text || "")}</div>${card.value ? `<div class="c-val">${esc(card.value)}</div>` : ""}`;
    }
    if (card.rank === "JK") {
      return `<span class="corner tl"><b>★</b></span><span class="pip">JOKER</span><span class="corner br"><b>★</b></span>`;
    }
    const sym = SUIT_SYMBOL[card.suit] || "";
    const rank = RANK_SHOW(card.rank);
    const corners = `<span class="corner tl"><b>${rank}</b><i>${sym}</i></span><span class="corner br"><b>${rank}</b><i>${sym}</i></span>`;
    if (["J", "Q", "K"].includes(card.rank)) return corners + `<span class="face-art">${card.rank}<small>${sym}</small></span>`;
    if (card.rank === "A") return corners + `<span class="pip" style="font-size:calc(var(--cw)*.62)">${sym}</span>`;
    const layout = PIP_LAYOUT[Number(rank)];
    if (!layout) return corners + `<span class="pip">${sym}</span>`;
    const pips = layout.map(([x, y]) => `<span style="position:absolute;left:${x}%;top:${y}%;transform:translate(-50%,-50%)${y > 55 ? " rotate(180deg)" : ""};font-size:calc(var(--cw)*.2);line-height:1">${sym}</span>`).join("");
    return corners + pips;
  }

  function cardHTML(card, zone, index, extra = "") {
    const visible = card.visible && (card.rank != null || card.custom);
    const cls = ["card"];
    if (!visible) cls.push("back");
    if (!visible && card.custom) cls.push("custom-back");
    if (visible) {
      if (card.custom) cls.push("custom");
      else if (card.rank === "JK") cls.push("joker", card.jokerColor === "red" ? "red" : "");
      else {
        cls.push("suit-" + card.suit);
        if (card.suit === "h" || card.suit === "d") cls.push("red");
      }
      if (card.faceUp && zone.visibility === "owner") cls.push("exposed");
      if (!card.faceUp && zone.visibility !== "hidden") cls.push("private");
      if (!card.faceUp && zone.visibility === "hidden") cls.push("private");
    }
    if (selection.has(card.id)) cls.push("selected");
    if (card.rot) cls.push("rot" + card.rot);
    const mark = card.mark ? ` data-mark style="--mark:${esc(card.mark)};${extra}"` : extra ? ` style="${extra}"` : "";
    const custom = visible && card.custom ? ` style="--cc:${esc(card.color || "#9f7dff")};${extra}"` : "";
    const title = visible ? (card.custom ? card.label : E.cardName(card)) + (card.faceUp ? "" : " (hidden from others)") : "Face-down card";
    return `<div class="${cls.filter(Boolean).join(" ")}" data-card-id="${esc(card.id)}" data-index="${index}" data-zone="${zone.id}" title="${esc(title)}"${custom || mark}>${visible ? cardFace(card) : ""}</div>`;
  }

  function visIcon(zone) {
    if (zone.visibility === "owner") return `<span class="zone-vis" title="Private: only the owner sees face-down cards">🔒</span>`;
    if (zone.visibility === "hidden") return `<span class="zone-vis" title="Hidden: nobody sees face-down cards">▦</span>`;
    return "";
  }

  function zoneHTML(zone) {
    const v = view;
    const cards = zone.cards.map((id) => v.cards[id]).filter(Boolean);
    const layout = zone.layout || "spread";
    const inSel = selection.size && !Array.from(selection).every((id) => zone.cards.includes(id));
    const isStack = layout === "stack";
    const deckLike = zone.kind === "deck";
    let body = "";
    if (!cards.length) {
      body = `<div class="empty">${zone.kind === "deck" ? "Empty" : "Drop cards"}</div>`;
    } else if (isStack) {
      const top = cards.length - 1;
      body = (cards.length > 1 ? `<div class="stack-depth"></div>` : "") + cardHTML(cards[top], zone, zone.cards.length - 1) + `<span class="stack-count">${cards.length}</span>`;
    } else if (layout === "free") {
      body = cards.map((card, i) => cardHTML(card, zone, i, `left:calc(${(card.x ?? 0.1).toFixed(3)} * (100% - var(--cw)));top:calc(${(card.y ?? 0.1).toFixed(3)} * (100% - var(--ch)));z-index:${i + 1}`)).join("");
    } else if (layout === "fan") {
      const n = cards.length;
      const spread = Math.min(6, 44 / Math.max(1, n));
      body = cards.map((card, i) => {
        const off = i - (n - 1) / 2;
        return cardHTML(card, zone, i, `--fan:${(off * spread).toFixed(2)}deg;margin-top:${(Math.abs(off) * Math.abs(off) * 0.5).toFixed(1)}px`);
      }).join("");
    } else {
      body = cards.map((card, i) => cardHTML(card, zone, i)).join("");
    }
    const tools = [];
    if (inSel) tools.push(`<button class="btn sm zone-here" data-act="here" title="Move selected cards here">⤵ Here</button>`);
    if (deckLike) {
      tools.push(`<button class="btn sm" data-act="draw" title="Draw one to your hand (or the current player's)">Draw</button>`);
      tools.push(`<button class="btn sm" data-act="deal" title="Deal from here">Deal</button>`);
      tools.push(`<button class="btn sm icon" data-act="shuffle" title="Shuffle">⤮</button>`);
    } else if (cards.length) {
      tools.push(`<button class="btn sm icon" data-act="flip" title="Flip all">⟲</button>`);
    }
    tools.push(`<button class="btn sm icon" data-act="menu" title="Group options">⋯</button>`);
    const evals = prefs.evals && cards.length ? evalsHTML(zone) : "";
    const manyClass = layout === "fan" ? (cards.length > 9 ? " many" : cards.length <= 3 ? " few" : "") : "";
    // Tilted outer cards swing past their slot; pad the fan so they stay inside the group.
    const fanTilt = layout === "fan" ? (Math.min(6, 44 / Math.max(1, cards.length)) * (cards.length - 1) / 2) * Math.PI / 180 : 0;
    const fanStyle = layout === "fan" ? ` style="--fan-pad:${Math.max(0.1, 0.5 * Math.cos(fanTilt) + 1.68 * Math.sin(fanTilt) - 0.36).toFixed(3)}"` : "";
    return `<section class="zone kind-${zone.kind}${zone.wide || layout === "free" ? " wide" : ""}${inSel ? " can-drop" : ""}" data-zone-id="${zone.id}">
      <header class="zone-head">
        <span class="zone-name" title="${esc(zone.name)}">${esc(zone.name)}</span>
        <span class="zone-count">${cards.length}${zone.limit ? "/" + zone.limit : ""}</span>
        ${visIcon(zone)}
        <div class="zone-tools">${tools.join("")}</div>
      </header>
      ${zone.note ? `<div class="zone-note">${esc(zone.note)}</div>` : ""}
      <div class="cards layout-${layout}${manyClass}" data-drop="${zone.id}"${fanStyle}>${body}</div>
      ${evals}
    </section>`;
  }

  function evalsHTML(zone) {
    const list = evalCache.get(zone.id) || [];
    const rows = list.filter((entry) => entry.result).map((entry) => {
      const r = entry.result;
      const cls = ["eval", "tone-" + (r.tone || "neutral")];
      if (entry.best) cls.push("best");
      if (r.partial) cls.push("partial");
      const place = entry.best ? "🏆" : entry.place ? "#" + entry.place : "";
      const kind = entry.def.short + (parseSpec(entry.spec).board ? " · " + (entry.boardZone?.name || "") : "");
      const breakdown = r.breakdown && r.breakdown.length > 1 ? `<div class="breakdown">${r.breakdown.map((b) => `<span>${esc(b.label)} ${b.points}</span>`).join("")}</div>` : "";
      const detail = r.detail && !breakdown ? `<div class="detail">${esc(r.detail)}</div>` : "";
      const scoreable = Number.isFinite(r.value) && r.value !== 0 ? ` data-value="${r.value}" role="button" tabindex="0"` : "";
      if (scoreable) cls.push("scoreable");
      return `<div class="${cls.join(" ")}"${scoreable} data-used="${(r.used || []).join(",")}" data-used-board="${(r.usedBoard || []).join(",")}" data-zone="${zone.id}" data-board="${entry.boardZone?.id || ""}" title="${esc(entry.def.label + ": " + r.label + (r.detail ? " — " + r.detail : ""))}">
        <span class="kind">${esc(kind)}</span><strong>${esc(r.label)}</strong><span class="place">${place}</span>${detail}${breakdown}
      </div>`;
    });
    return rows.length ? `<div class="evals">${rows.join("")}</div>` : "";
  }

  function seatHTML(player, index) {
    const v = view;
    const zones = E.orderedZones(v, player.id);
    const current = index === v.turn.index;
    const dealer = index === v.turn.dealer;
    const me = mySeatId() === player.id;
    const total = E.totals(v)[player.id] || 0;
    const tags = [];
    if (current) tags.push(`<span class="turn-tag">TURN</span>`);
    if (v.scores.rounds.some((round) => player.id in round.scores) || v.scores.target) tags.push(`<span class="score-tag" title="${esc(v.scores.label)}">${E.fmt(total)} pts</span>`);
    if (v.chipStart || player.chips) tags.push(`<span class="chip-tag" title="Chips">● ${E.fmt(player.chips)}</span>`);
    for (const def of v.counterDefs) tags.push(`<span class="counter-tag" title="${esc(def.name)}">${esc(def.name)} ${E.fmt(player.counters[def.id] ?? 0)}</span>`);
    const net = player.clientId ? ` <span class="dim small" title="Seat claimed by a connected player">📶</span>` : "";
    return `<article class="seat${current ? " current" : ""}${me ? " me" : ""}${player.out ? " out" : ""}" style="--c:${esc(player.color)}" data-seat="${player.id}">
      <header class="seat-head">
        <span class="seat-dot"></span>
        <button class="seat-name" data-act="seat-menu" data-player="${player.id}" title="Player options">${esc(player.name)}</button>${net}
        ${dealer ? `<span class="dealer-btn" title="Dealer">D</span>` : ""}
        <div class="seat-tags">${tags.join("")}</div>
      </header>
      ${zones.length ? `<div class="seat-zones">${zones.map(zoneHTML).join("")}</div>` : ""}
    </article>`;
  }

  function renderTable() {
    const v = view;
    evalCache = evaluateAll(v);
    $("#tableZones").innerHTML = E.orderedZones(v, "table").map(zoneHTML).join("") || `<div class="muted small">No table groups yet.</div>`;
    const seats = $("#seats");
    seats.classList.toggle("wide-seats", v.seatTemplate.length > 2 || v.players.length <= 2);
    seats.innerHTML = v.players.map(seatHTML).join("") || `<div class="empty-state"><div>No players yet.</div><button class="btn primary" data-act="add-player">+ Add player</button></div>`;
  }

  function renderTop() {
    const v = view;
    const title = $("#titleInput");
    if (document.activeElement !== title) title.value = v.title;
    const current = v.players[v.turn.index];
    const dealer = v.players[v.turn.dealer];
    const parts = [];
    if (current) parts.push(`<span class="pill" style="--c:${esc(current.color)}"><span class="dot"></span>${esc(current.name)}</span>`);
    parts.push(`<button class="btn sm icon" data-act="prev-turn" title="Previous player">‹</button><button class="btn sm" data-act="next-turn" title="Next player (T)">Next ›</button>`);
    if (v.turn.phase || v.phases.length) parts.push(`<button class="pill phase" data-act="next-phase" title="Advance phase">${esc(v.turn.phase || "Phase")}</button>`);
    parts.push(`<span class="pill round">Round ${v.turn.round}</span>`);
    if (dealer) parts.push(`<span class="pill round" title="Dealer"><span class="dealer-btn">D</span>${esc(dealer.name)}</span>`);
    if (v.pot) parts.push(`<span class="pill" style="color:var(--gold)">Pot ${E.fmt(v.pot)}</span>`);
    if (timer.running || timer.left !== timer.total) parts.push(`<span class="pill${timer.left <= 10 ? " phase" : ""}" data-act="timer-toggle" title="Turn timer">⏱ ${fmtTime(timer.left)}</span>`);
    if (v.turn.dir < 0) parts.push(`<span class="pill round" title="Counter-clockwise">↺</span>`);
    $("#turnStrip").innerHTML = parts.join("");

    const select = $("#viewSelect");
    let options = [];
    if (net.mode === "local") {
      options = [["hands", "👥 All hands"], ["xray", "🔍 X-ray"], ["pass", "🔁 Pass & play"], ...v.players.map((player) => ["seat:" + player.id, "👤 " + player.name])];
      select.innerHTML = options.map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join("");
      select.value = options.some(([value]) => value === prefs.viewMode) ? prefs.viewMode : "hands";
    } else {
      const mine = mySeatId();
      options = [["spectate", "👁 Spectate"], ...v.players.map((player) => ["claim:" + player.id, (player.id === mine ? "👤 " : player.clientId ? "🔒 " : "🪑 ") + player.name])];
      select.innerHTML = options.map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join("");
      select.value = mine ? "claim:" + mine : "spectate";
    }
    $("#undoBtn").disabled = net.mode !== "client" && !history.length;
    $("#redoBtn").disabled = net.mode !== "client" && !future.length;
    const roomBtn = $("#roomBtn");
    roomBtn.classList.toggle("good", net.mode !== "local");
    $("#roomLabel").textContent = net.mode === "local" ? "Online" : net.code || "Room";
  }

  function renderSelectionBar() {
    const bar = $("#selectionBar");
    if (!selection.size) { bar.hidden = true; return; }
    const v = view;
    const ids = Array.from(selection);
    const anyHidden = ids.some((id) => !v.cards[id]?.visible);
    const discardZone = E.orderedZones(v, "table").find((zone) => zone.kind === "discard");
    bar.hidden = false;
    bar.innerHTML = `
      <span class="count">${ids.length} selected</span>
      <button class="btn sm" data-sel="flip" title="Flip (F)">Flip</button>
      <button class="btn sm" data-sel="move" title="Move to…">Move to ▾</button>
      <button class="btn sm" data-sel="group" title="Put these in a new group (G)">New group</button>
      ${anyHidden && mySeatId() ? `<button class="btn sm" data-sel="peek" title="Look without revealing">Peek</button>` : ""}
      <button class="btn sm" data-sel="sortsel" title="Order these cards by rank inside their group">Sort</button>
      <button class="btn sm icon" data-sel="rotate" title="Rotate 90°">↻</button>
      <button class="btn sm icon" data-sel="mark" title="Mark">●</button>
      ${discardZone ? `<button class="btn sm" data-sel="discard" title="Move to ${esc(discardZone.name)} (Del)">${esc(discardZone.name)}</button>` : ""}
      <button class="btn sm" data-sel="deck" title="Return to the deck">To deck</button>
      <button class="btn sm icon ghost" data-sel="clear" title="Clear selection (Esc)">✕</button>`;
  }

  function fmtTime(seconds) {
    const s = Math.max(0, Math.round(seconds));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  // FLIP animation: remember where each card was, then glide it to its new spot.
  function captureLayout() {
    const rects = new Map();
    $$(".card[data-card-id]").forEach((el) => rects.set(el.dataset.cardId, el.getBoundingClientRect()));
    const zones = new Map();
    $$("[data-drop]").forEach((el) => zones.set(el.dataset.drop, { rect: el.getBoundingClientRect(), count: el.parentElement.querySelector(".zone-count")?.textContent }));
    return { rects, zones };
  }

  function playLayout(before) {
    if (!before || !prefs.motion) return;
    const sources = [];
    $$("[data-drop]").forEach((el) => {
      const old = before.zones.get(el.dataset.drop);
      const now = el.parentElement.querySelector(".zone-count")?.textContent;
      if (old && parseInt(old, 10) > parseInt(now, 10)) sources.push(old.rect);
    });
    let n = 0;
    $$(".card[data-card-id]").forEach((el) => {
      let from = before.rects.get(el.dataset.cardId);
      const to = el.getBoundingClientRect();
      let fresh = false;
      if (!from && sources.length) { from = sources[0]; fresh = true; }
      if (!from) return;
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      const delay = fresh ? Math.min(n++ * 28, 500) : 0;
      el.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], { duration: 300, delay, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
    });
  }

  /** Tighten overlapping rows and fans so a long hand never grows wider than its seat. */
  function fitRows() {
    const els = $$(".cards.layout-fan, .cards.layout-overlap");
    els.forEach((el) => el.style.removeProperty("--overlap"));
    const rows = els.map((el) => {
      const cards = el.querySelectorAll(".card").length;
      const area = el.closest(".seat-zones, .table-zones");
      const zone = el.closest(".zone");
      if (cards < 2 || !area || !zone) return null;
      const zs = getComputedStyle(zone);
      const cs = getComputedStyle(el);
      const cw = el.querySelector(".card").offsetWidth;
      const room = area.clientWidth - parseFloat(zs.paddingLeft) - parseFloat(zs.paddingRight) - parseFloat(zs.borderLeftWidth) - parseFloat(zs.borderRightWidth) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const fan = el.classList.contains("layout-fan");
      const base = parseFloat(cs.getPropertyValue("--overlap")) || (fan ? -0.5 : -0.62);
      const fit = (room / cw - 1) / (cards - 1) - 1;
      return fit < base ? { el, overlap: Math.max(fan ? -0.88 : -0.92, fit) } : null;
    });
    for (const row of rows) if (row) row.el.style.setProperty("--overlap", row.overlap.toFixed(3));
  }

  function render() {
    if (!state) return;
    view = computeView();
    const before = captureLayout();
    renderTop();
    renderTable();
    fitRows();
    renderSelectionBar();
    renderPane();
    playLayout(before);
    const pass = $("#passScreen");
    if (net.mode === "local" && prefs.viewMode === "pass" && state.players.length) {
      const current = state.players[state.turn.index];
      const show = passRevealed !== current?.id;
      pass.hidden = !show;
      if (show) $("#passName").textContent = current?.name || "";
    } else pass.hidden = true;
  }

  // ======================================================== MENUS
  let openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }

  /** items: {label, run, danger, sw} | "-" | {heading} */
  function showMenu(anchor, items) {
    closeMenu();
    const menu = document.createElement("div");
    menu.className = "menu";
    menu.innerHTML = items.map((item, i) => {
      if (item === "-") return "<hr>";
      if (item.heading) return `<div class="menu-label">${esc(item.heading)}</div>`;
      return `<button data-i="${i}" class="${item.danger ? "danger" : ""}">${item.sw ? `<span class="sw" style="--c:${esc(item.sw)}"></span>` : ""}${esc(item.label)}</button>`;
    }).join("");
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    let left = Math.min(rect.left, window.innerWidth - mw - 8);
    let top = rect.bottom + 4;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, rect.top - mh - 4);
    menu.style.left = Math.max(8, left) + "px";
    menu.style.top = top + "px";
    menu.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-i]");
      if (!button) return;
      const item = items[Number(button.dataset.i)];
      closeMenu();
      item.run?.();
    });
    openMenu = menu;
  }

  function zoneTargets(excludeIds = []) {
    const v = view;
    const items = [{ heading: "Table" }];
    for (const zone of E.orderedZones(v, "table")) {
      if (excludeIds.includes(zone.id)) continue;
      items.push({ label: zone.name + ` (${zone.cards.length})`, zone: zone.id });
      if (zone.kind === "deck") items.push({ label: zone.name + " — bottom", zone: zone.id, index: 0 });
    }
    for (const player of v.players) {
      const zones = E.orderedZones(v, player.id).filter((zone) => !excludeIds.includes(zone.id));
      if (!zones.length) continue;
      items.push({ heading: player.name });
      for (const zone of zones) items.push({ label: zone.name + ` (${zone.cards.length})`, zone: zone.id, sw: player.color });
    }
    return items;
  }

  function moveMenu(anchor, cardIds, extra = {}) {
    const fromZone = cardIds.length ? view.cards[cardIds[0]] && E.zoneOf(view, cardIds[0])?.id : null;
    const items = zoneTargets(fromZone && cardIds.every((id) => E.zoneOf(view, id)?.id === fromZone) ? [fromZone] : []).map((item) => item.heading ? item : {
      label: item.label, sw: item.sw,
      run: () => { dispatch({ type: "move", cards: cardIds, to: item.zone, index: item.index, ...extra }); selection.clear(); render(); },
    });
    showMenu(anchor, items);
  }

  function zoneMenu(anchor, zoneId) {
    const zone = view.zones[zoneId];
    if (!zone) return;
    const has = zone.cards.length > 0;
    const hand = myHandZone();
    const items = [
      { label: "Edit group & scoring…", run: () => openZoneDialog(zoneId) },
      "-",
    ];
    if (has) {
      if (hand && hand !== zoneId) items.push({ label: "Draw 1 to hand", run: () => dispatch({ type: "draw", from: zoneId, to: hand, count: 1 }) });
      items.push({ label: "Deal from here…", run: () => openDealDialog(zoneId) });
      items.push({ label: "Select all", run: () => { zone.cards.forEach((id) => selection.add(id)); render(); } });
      items.push({ label: "Shuffle", run: () => dispatch({ type: "shuffle", zone: zoneId }) });
      items.push({ label: "Cut", run: () => dispatch({ type: "cut", zone: zoneId }) });
      items.push({ label: "Flip all face up", run: () => dispatch({ type: "flipZone", zone: zoneId, face: "up" }) });
      items.push({ label: "Flip all face down", run: () => dispatch({ type: "flipZone", zone: zoneId, face: "down" }) });
      items.push({ heading: "Sort" });
      items.push({ label: "By rank (high → low)", run: () => dispatch({ type: "sort", zone: zoneId, by: "rank" }) });
      items.push({ label: "By rank (ace low)", run: () => dispatch({ type: "sort", zone: zoneId, by: "aceLow" }) });
      items.push({ label: "By suit", run: () => dispatch({ type: "sort", zone: zoneId, by: "suit" }) });
      items.push({ label: "Reverse order", run: () => dispatch({ type: "sort", zone: zoneId, by: "reverse" }) });
      items.push({ heading: "Move everything" });
      items.push({ label: "Move all to…", run: () => moveMenu(anchor, zone.cards.slice()) });
    }
    items.push("-");
    items.push({ label: "Move group earlier", run: () => dispatch({ type: "reorderZone", zone: zoneId, dir: -1 }) });
    items.push({ label: "Move group later", run: () => dispatch({ type: "reorderZone", zone: zoneId, dir: 1 }) });
    items.push({ label: "Delete group", danger: true, run: () => {
      const all = zone.area !== "table" && zone.key && confirm(`Remove “${zone.name}” from every seat? (Cancel = only this seat)`);
      dispatch({ type: "removeZone", zone: zoneId, allSeats: Boolean(all) });
    } });
    showMenu(anchor, items);
  }

  function cardMenu(point, cardId) {
    const card = view.cards[cardId];
    if (!card) return;
    const ids = selection.has(cardId) ? Array.from(selection) : [cardId];
    const items = [
      { label: card.visible ? (card.faceUp ? "Turn face down" : "Reveal (face up)") : "Flip", run: () => dispatch({ type: "flip", cards: ids }) },
    ];
    if (!card.visible && mySeatId()) items.push({ label: "Peek (only you)", run: () => dispatch({ type: "peek", cards: ids }) });
    items.push({ label: "Move to…", run: () => moveMenu(point, ids) });
    items.push({ label: "Put in new group", run: () => openZoneDialog(null, { cards: ids }) });
    items.push({ label: "Rotate 90°", run: () => dispatch({ type: "rotate", cards: ids }) });
    items.push({ heading: "Mark" });
    for (const [color, name] of MARK_COLORS) items.push({ label: name, sw: color, run: () => dispatch({ type: "mark", cards: ids, color }) });
    items.push({ label: "Clear mark", run: () => dispatch({ type: "mark", cards: ids, color: null }) });
    items.push("-");
    items.push({ label: "Remove from game", danger: true, run: () => { if (confirm(`Remove ${ids.length} card(s) from the game? (Rebuild the deck to restore.)`)) dispatch({ type: "removeCards", cards: ids }); } });
    showMenu(point, items);
  }

  function seatMenu(anchor, playerId) {
    const v = view;
    const index = v.players.findIndex((player) => player.id === playerId);
    const player = v.players[index];
    if (!player) return;
    showMenu(anchor, [
      { label: "Make it their turn", run: () => dispatch({ type: "setTurn", index }) },
      { label: "Make them dealer", run: () => dispatch({ type: "setTurn", dealer: index }) },
      { label: "Rename…", run: () => { const name = prompt("Player name", player.name); if (name) dispatch({ type: "updatePlayer", player: playerId, patch: { name } }); } },
      { label: player.out ? "Bring back in" : "Sit out / eliminate", run: () => dispatch({ type: "updatePlayer", player: playerId, patch: { out: !player.out } }) },
      { label: "Reveal their cards", run: () => E.orderedZones(v, playerId).forEach((zone) => dispatch({ type: "flipZone", zone: zone.id, face: "up" })) },
      { label: "Add group to this seat…", run: () => openZoneDialog(null, { area: playerId }) },
      "-",
      { heading: "Score" },
      { label: "+1", run: () => dispatch({ type: "adjustScore", player: playerId, delta: 1 }) },
      { label: "+5", run: () => dispatch({ type: "adjustScore", player: playerId, delta: 5 }) },
      { label: "−1", run: () => dispatch({ type: "adjustScore", player: playerId, delta: -1 }) },
      { label: "Custom…", run: () => { const n = Number(prompt("Add points (negative to subtract)", "0")); if (n) dispatch({ type: "adjustScore", player: playerId, delta: n }); } },
      ...(v.pot ? [{ label: `Award pot (${E.fmt(v.pot)})`, run: () => dispatch({ type: "award", player: playerId }) }] : []),
      "-",
      { label: "Move seat left", run: () => dispatch({ type: "movePlayer", player: playerId, dir: -1 }) },
      { label: "Move seat right", run: () => dispatch({ type: "movePlayer", player: playerId, dir: 1 }) },
      { label: "Remove player", danger: true, run: () => { if (confirm(`Remove ${player.name}? Their cards return to the deck.`)) dispatch({ type: "removePlayer", player: playerId }); } },
    ]);
  }

  // ===================================================== DRAG AND DROP
  let drag = null;
  let suppressClick = 0;

  function orderedSelection() {
    const order = [];
    for (const zone of Object.values(view.zones)) for (const id of zone.cards) if (selection.has(id)) order.push(id);
    return order;
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    const el = event.target.closest(".card[data-card-id]");
    if (!el || !el.closest("#table")) return;
    drag = { el, id: el.dataset.cardId, x: event.clientX, y: event.clientY, pointerId: event.pointerId, started: false, offX: event.clientX - el.getBoundingClientRect().left, offY: event.clientY - el.getBoundingClientRect().top };
  }

  function startDrag(event) {
    const ids = selection.has(drag.id) ? orderedSelection() : [drag.id];
    drag.ids = ids;
    drag.started = true;
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    const shown = ids.slice(0, 6);
    shown.forEach((id, i) => {
      const src = document.querySelector(`.card[data-card-id="${CSS.escape(id)}"]`) || drag.el;
      const clone = src.cloneNode(true);
      clone.classList.remove("selected", "dragging");
      clone.style.cssText = (clone.getAttribute("style") || "") + `;left:${i * 14}px;margin:0;transform:none;--fan:0deg`;
      ghost.appendChild(clone);
    });
    if (ids.length > 1) ghost.insertAdjacentHTML("beforeend", `<span class="count">${ids.length}</span>`);
    document.body.appendChild(ghost);
    drag.ghost = ghost;
    ids.forEach((id) => document.querySelector(`.card[data-card-id="${CSS.escape(id)}"]`)?.classList.add("dragging"));
    moveGhost(event);
  }

  function moveGhost(event) {
    drag.ghost.style.left = event.clientX - drag.offX + "px";
    drag.ghost.style.top = event.clientY - drag.offY + "px";
    const target = dropTargetAt(event.clientX, event.clientY);
    $$(".zone.drop-hover").forEach((el) => { if (el !== target) el.classList.remove("drop-hover"); });
    if (target) target.classList.add("drop-hover");
    // Auto-scroll the table near edges.
    const table = $("#table");
    const rect = table.getBoundingClientRect();
    if (event.clientY > rect.bottom - 50) table.scrollTop += 12;
    else if (event.clientY < rect.top + 50) table.scrollTop -= 12;
  }

  function dropTargetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el?.closest(".zone[data-zone-id]") || null;
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.started) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7) return;
      startDrag(event);
    }
    event.preventDefault();
    moveGhost(event);
  }

  function insertIndex(zoneEl, x, y, dragIds) {
    const cardsEl = zoneEl.querySelector("[data-drop]");
    const layout = [...cardsEl.classList].find((c) => c.startsWith("layout-"))?.slice(7);
    const zone = view.zones[zoneEl.dataset.zoneId];
    if (layout === "stack" || !zone) return undefined;
    const els = $$(".card[data-card-id]", cardsEl).filter((el) => !dragIds.includes(el.dataset.cardId));
    if (!els.length) return undefined;
    let best = null;
    let bestDist = Infinity;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = Math.hypot((x - cx) * 1, (y - cy) * 1.6);
      if (d < bestDist) { bestDist = d; best = { el, cx }; }
    }
    const idx = Number(best.el.dataset.index);
    return x < best.cx ? idx : idx + 1;
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    if (!d.started) return;
    suppressClick = performance.now() + 250;
    d.ghost.remove();
    $$(".dragging").forEach((el) => el.classList.remove("dragging"));
    $$(".zone.drop-hover").forEach((el) => el.classList.remove("drop-hover"));
    const target = dropTargetAt(event.clientX, event.clientY);
    if (!target) return;
    const zoneId = target.dataset.zoneId;
    const zone = view.zones[zoneId];
    const action = { type: "move", cards: d.ids, to: zoneId };
    if (zone.layout === "free") {
      const box = target.querySelector("[data-drop]").getBoundingClientRect();
      const cw = d.el.offsetWidth;
      const ch = d.el.offsetHeight;
      action.x = Math.max(0, Math.min(1, (event.clientX - d.offX - box.left) / Math.max(1, box.width - cw)));
      action.y = Math.max(0, Math.min(1, (event.clientY - d.offY - box.top) / Math.max(1, box.height - ch)));
    } else {
      const index = insertIndex(target, event.clientX, event.clientY, d.ids);
      if (index !== undefined) action.index = index;
    }
    selection.clear();
    dispatch(action);
    render();
  }

  function onPointerCancel() {
    if (!drag) return;
    drag.ghost?.remove();
    $$(".dragging").forEach((el) => el.classList.remove("dragging"));
    $$(".zone.drop-hover").forEach((el) => el.classList.remove("drop-hover"));
    drag = null;
  }

  // ============================================================ PANES
  function renderPane() {
    const pane = $("#pane");
    const active = document.activeElement;
    const focusKey = active && pane.contains(active) ? active.dataset.fk : null;
    const selStart = focusKey && "selectionStart" in active ? active.selectionStart : null;
    const scroll = pane.scrollTop;
    $$("#tabs button").forEach((button) => button.classList.toggle("on", button.dataset.tab === prefs.tab));
    const renderer = PANES[prefs.tab] || PANES.play;
    pane.innerHTML = renderer();
    pane.scrollTop = scroll;
    if (focusKey) {
      const el = pane.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`);
      if (el) {
        el.focus();
        try { if (selStart !== null) el.setSelectionRange(selStart, selStart); } catch (error) { /* number inputs */ }
      }
    }
  }

  function block(title, body, actions = "") {
    return `<section class="card-block"><div class="block-head"><h3>${esc(title)}</h3><div class="row">${actions}</div></div>${body}</section>`;
  }

  function zoneOptions(selected, { includeSeatKeys = false, onlyTable = false } = {}) {
    const v = view;
    const opts = [];
    if (includeSeatKeys) {
      const keys = Array.from(new Set(v.seatTemplate.map((tpl) => tpl.key).filter(Boolean)));
      if (keys.length) {
        opts.push(`<optgroup label="Every seat">`);
        for (const key of keys) {
          const tpl = v.seatTemplate.find((entry) => entry.key === key);
          opts.push(`<option value="${esc(key)}"${selected === key ? " selected" : ""}>Each ${esc(tpl.name)}</option>`);
          opts.push(`<option value="${esc(key)}@current"${selected === key + "@current" ? " selected" : ""}>Current player's ${esc(tpl.name)}</option>`);
        }
        opts.push(`</optgroup>`);
      }
    }
    opts.push(`<optgroup label="Table">`);
    for (const zone of E.orderedZones(v, "table")) opts.push(`<option value="${zone.id}"${selected === zone.id ? " selected" : ""}>${esc(zone.name)} (${zone.cards.length})</option>`);
    opts.push(`</optgroup>`);
    if (!onlyTable) {
      for (const player of v.players) {
        const zones = E.orderedZones(v, player.id);
        if (!zones.length) continue;
        opts.push(`<optgroup label="${esc(player.name)}">`);
        for (const zone of zones) opts.push(`<option value="${zone.id}"${selected === zone.id ? " selected" : ""}>${esc(zone.name)} (${zone.cards.length})</option>`);
        opts.push(`</optgroup>`);
      }
    }
    return opts.join("");
  }

  // ----------------------------------------------------------- PLAY tab
  function standingsHTML() {
    const v = view;
    const groups = new Map();
    for (const player of v.players) {
      for (const zone of E.orderedZones(v, player.id)) {
        for (const entry of evalCache.get(zone.id) || []) {
          if (!entry.result || UNRANKED.has(entry.id)) continue;
          const key = entry.spec + "|" + zone.key;
          if (!groups.has(key)) groups.set(key, { label: `${zone.name} · ${entry.def.label}${parseSpec(entry.spec).board ? " (" + (entry.boardZone?.name || "") + ")" : ""}`, rows: [] });
          groups.get(key).rows.push({ player, entry });
        }
      }
    }
    if (!groups.size) return `<p class="hint">Attach an evaluator to a seat group (⋯ → Edit group) to rank hands here.</p>`;
    return Array.from(groups.values()).map((group) => {
      const rows = group.rows.slice().sort((a, b) => (a.entry.place || 99) - (b.entry.place || 99));
      const winners = rows.filter((row) => row.entry.place === 1).map((row) => row.player.id);
      return `<div class="list">
        <div class="row small muted"><span class="grow">${esc(group.label)}</span>${v.pot && winners.length ? `<button class="btn sm good" data-act="award-best" data-players="${winners.join(",")}">Award pot → ${winners.length > 1 ? "split" : esc(rows[0].player.name)}</button>` : ""}</div>
        ${rows.map(({ player, entry }) => `<div class="list-row" style="--c:${esc(player.color)}">
          <span class="swatch"></span><span class="small" style="width:22px;font-weight:800">${entry.place === 1 && entry.best ? "🏆" : entry.place || "–"}</span>
          <span class="grow small" style="font-weight:700">${esc(player.name)}</span>
          <span class="small" style="text-align:right">${esc(entry.result.label)}${entry.result.partial ? ' <span class="dim">(partial)</span>' : ""}</span>
        </div>`).join("")}
      </div>`;
    }).join("");
  }

  const PANES = {
    play() {
      const v = view;
      const current = v.players[v.turn.index];
      const turn = `
        <div class="row">
          ${current ? `<span class="pill" style="--c:${esc(current.color)};font-size:14px;min-height:32px"><span class="dot"></span>${esc(current.name)}'s turn</span>` : `<span class="muted">No players</span>`}
        </div>
        <div class="row tight">
          <button class="btn sm" data-act="prev-turn">‹ Prev</button>
          <button class="btn sm primary" data-act="next-turn">Next player › <kbd>T</kbd></button>
          <button class="btn sm" data-act="pass-deal" title="Button/dealer moves one seat">Pass deal</button>
          <button class="btn sm" data-act="reverse" title="Reverse play direction">⇄ Direction</button>
          <button class="btn sm" data-act="next-round">Next round</button>
        </div>
        <div class="phase-chips">${v.phases.map((phase) => `<button data-act="set-phase" data-phase="${esc(phase)}" class="${phase === v.turn.phase ? "on" : ""}">${esc(phase)}</button>`).join("")}
          <button data-act="edit-phases" title="Edit phases">✎ phases</button></div>`;
      const macros = v.macros.map((macro, i) => `<button class="macro" data-act="macro" data-id="${macro.id}" title="${esc(macro.hint || macro.steps.map(E.describeStep).join(" → "))}">
          ${esc(macro.label)}${i < 9 ? `<kbd>${i + 1}</kbd>` : ""}
          <small>${esc(macro.hint || macro.steps.map(E.describeStep).join(" → "))}</small>
          <span class="btn sm icon ghost edit" data-act="edit-macro" data-id="${macro.id}" title="Edit">✎</span>
        </button>`).join("");
      const quick = `
        <div class="grid-2">
          <label class="field"><span>From</span><select id="qdFrom" data-fk="qdFrom">${zoneOptions(quickDeal.from || E.findDeckZone(v)?.id)}</select></label>
          <label class="field"><span>To</span><select id="qdTo" data-fk="qdTo">${zoneOptions(quickDeal.to || v.seatTemplate[0]?.key || "", { includeSeatKeys: true })}</select></label>
          <label class="field"><span>Cards each</span><input id="qdCount" data-fk="qdCount" type="number" min="1" max="60" value="${quickDeal.count}"></label>
          <label class="field"><span>Face</span><select id="qdFace" data-fk="qdFace"><option value="">Group default</option><option value="down"${quickDeal.face === "down" ? " selected" : ""}>Face down</option><option value="up"${quickDeal.face === "up" ? " selected" : ""}>Face up</option></select></label>
        </div>
        <div class="row"><button class="btn primary" data-act="quick-deal">Deal</button>
          <button class="btn" data-act="collect">Collect all & shuffle</button>
          <button class="btn" data-act="reveal-all">Reveal hands</button></div>`;
      return block("Turn", turn)
        + block("Actions", `<div class="macro-grid">${macros}</div>${v.macros.length ? "" : `<p class="hint">Actions are one-tap macros: shuffle, deal, flip, collect, pass turn… Build your game's flow here.</p>`}`, `<button class="btn sm" data-act="new-macro">+ New action</button>`)
        + block("Deal", quick)
        + block("Standings", standingsHTML());
    },

    scores() {
      const v = view;
      const totals = E.totals(v);
      const leaders = new Set(E.leaders(v));
      const target = v.scores.target;
      const quick = v.players.map((player) => `<div class="quick-score" style="--c:${esc(player.color)}">
          <div class="name"><span class="swatch"></span><span>${esc(player.name)}</span></div>
          <div class="btns">
            <button class="btn sm" data-act="score" data-player="${player.id}" data-delta="-5">−5</button>
            <button class="btn sm" data-act="score" data-player="${player.id}" data-delta="-1">−1</button>
            <button class="btn sm" data-act="score" data-player="${player.id}" data-delta="1">+1</button>
            <button class="btn sm" data-act="score" data-player="${player.id}" data-delta="5">+5</button>
            <input type="number" style="min-height:26px" placeholder="± custom, Enter" data-score-custom="${player.id}" data-fk="sc-${player.id}" title="Type a number and press Enter">
          </div>
          <div class="total${leaders.has(player.id) && Object.values(totals).some(Boolean) ? " lead" : ""}" style="${leaders.has(player.id) && Object.values(totals).some(Boolean) ? "color:var(--gold)" : ""}">${E.fmt(totals[player.id])}</div>
        </div>`).join("");
      let race = "";
      if (target > 0) {
        const tick = v.pegTarget ? 5 : Math.max(1, Math.round(target / 20));
        race = `<div class="peg-track">${v.players.map((player) => {
          const value = totals[player.id] || 0;
          const frac = Math.max(0, Math.min(1, value / target));
          const lastRound = v.scores.rounds[v.scores.rounds.length - 1]?.scores[player.id] || 0;
          const prevFrac = Math.max(0, Math.min(1, (value - lastRound) / target));
          return `<div class="peg-lane" style="--c:${esc(player.color)};--tick:calc(100% / ${Math.ceil(target / tick)})" title="${esc(player.name)}: ${E.fmt(value)} / ${target}">
            <div class="ticks"></div><div class="fill" style="width:${frac * 100}%"></div>
            ${v.pegTarget ? `<div class="peg back" style="left:${prevFrac * 100}%"></div>` : ""}<div class="peg" style="left:${frac * 100}%"></div>
            <span class="label">${esc(player.name)}</span><span class="num">${E.fmt(value)}${value >= target ? " 🏁" : ""}</span></div>`;
        }).join("")}</div>`;
      }
      const sheet = `<div class="score-table-wrap"><table class="score-table">
        <thead><tr><th>Round</th>${v.players.map((player) => `<th title="${esc(player.name)}"><span class="swatch" style="--c:${esc(player.color)}"></span>${esc(player.name)}</th>`).join("")}<th></th></tr></thead>
        <tbody>${v.scores.rounds.map((round) => `<tr>
          <td class="round-label"><input type="text" value="${esc(round.label)}" data-round-label="${round.id}" data-fk="rl-${round.id}"></td>
          ${v.players.map((player) => `<td><input type="number" value="${round.scores[player.id] ?? ""}" data-round="${round.id}" data-player="${player.id}" data-fk="r-${round.id}-${player.id}"></td>`).join("")}
          <td><button class="btn sm icon ghost" data-act="del-round" data-round="${round.id}" title="Delete round">✕</button></td></tr>`).join("")}</tbody>
        <tfoot><tr><td>Total</td>${v.players.map((player) => `<td class="${leaders.has(player.id) ? "lead" : ""}">${E.fmt(totals[player.id])}</td>`).join("")}<td></td></tr></tfoot>
      </table></div>
      <div class="row"><button class="btn sm" data-act="add-round">+ Round</button><button class="btn sm" data-act="export-csv">Export CSV</button><button class="btn sm danger" data-act="reset-scores">Reset</button></div>`;
      const settings = `<div class="grid-3">
          <label class="field"><span>Label</span><input type="text" value="${esc(v.scores.label)}" data-cfg="label" data-fk="cfg-label"></label>
          <label class="field"><span>Target</span><input type="number" min="0" value="${target || ""}" placeholder="none" data-cfg="target" data-fk="cfg-target"></label>
          <label class="field"><span>Winner</span><select data-cfg="lowWins" data-fk="cfg-low"><option value="0">Highest</option><option value="1"${v.scores.lowWins ? " selected" : ""}>Lowest</option></select></label>
        </div>
        <label class="check"><input type="checkbox" data-cfg="peg"${v.pegTarget ? " checked" : ""}> Cribbage-style pegs (shows front & back peg)</label>`;
      const chips = `
        <div class="pot"><div><div class="small muted">Pot</div><strong>${E.fmt(v.pot)}</strong></div>
          <div class="row tight"><select id="awardTo" data-fk="awardTo" style="width:auto">${v.players.map((player) => `<option value="${player.id}">${esc(player.name)}</option>`).join("")}<option value="__split">Split: all active</option></select>
          <button class="btn sm good" data-act="award" ${v.pot ? "" : "disabled"}>Award</button></div></div>
        ${v.players.map((player) => `<div class="chip-row" style="--c:${esc(player.color)}">
          <div class="row tight"><span class="swatch"></span><span class="small" style="font-weight:700">${esc(player.name)}</span></div>
          <input type="number" value="${player.chips}" data-chips="${player.id}" data-fk="ch-${player.id}" title="Stack">
          <div class="row tight"><input type="number" min="0" placeholder="bet" style="width:64px;min-height:26px" data-bet-input="${player.id}" data-fk="bet-${player.id}"><button class="btn sm" data-act="bet" data-player="${player.id}">Bet</button></div>
        </div>`).join("")}
        <div class="row tight small"><span class="muted">Transfer</span>
          <select id="tfFrom" style="width:auto">${v.players.map((player) => `<option value="${player.id}">${esc(player.name)}</option>`).join("")}</select>→
          <select id="tfTo" style="width:auto">${v.players.map((player, i) => `<option value="${player.id}"${i === 1 ? " selected" : ""}>${esc(player.name)}</option>`).join("")}</select>
          <input id="tfAmount" type="number" min="0" placeholder="amt" style="width:64px;min-height:26px"><button class="btn sm" data-act="transfer">Pay</button></div>
        <div class="row tight small"><span class="muted">Starting stack</span><input id="chipStart" type="number" min="0" value="${v.chipStart || 0}" style="width:80px;min-height:26px"><button class="btn sm" data-act="reset-stacks">Reset all stacks</button></div>`;
      const counters = `
        ${v.tableCounters.map((tracker) => `<div class="list-row"><span class="grow small" style="font-weight:700">${esc(tracker.name)}</span>
          <button class="btn sm" data-act="counter" data-id="${tracker.id}" data-delta="-1">−</button><strong class="mono" style="min-width:34px;text-align:center">${E.fmt(tracker.value)}</strong><button class="btn sm" data-act="counter" data-id="${tracker.id}" data-delta="1">+</button>
          <button class="btn sm icon ghost" data-act="del-counter" data-id="${tracker.id}">✕</button></div>`).join("")}
        ${v.counterDefs.length ? `<div class="score-table-wrap"><table class="score-table"><thead><tr><th>Player</th>${v.counterDefs.map((def) => `<th>${esc(def.name)} <button class="btn sm icon ghost" data-act="del-counter" data-id="${def.id}" title="Remove">✕</button></th>`).join("")}</tr></thead><tbody>
          ${v.players.map((player) => `<tr><td><span class="swatch" style="--c:${esc(player.color)};display:inline-block;width:8px;height:8px"></span> ${esc(player.name)}</td>${v.counterDefs.map((def) => `<td><div class="row tight" style="justify-content:center;flex-wrap:nowrap"><button class="btn sm icon" data-act="counter" data-player="${player.id}" data-id="${def.id}" data-delta="-1">−</button><span class="mono" style="min-width:24px">${E.fmt(player.counters[def.id] ?? 0)}</span><button class="btn sm icon" data-act="counter" data-player="${player.id}" data-id="${def.id}" data-delta="1">+</button></div></td>`).join("")}</tr>`).join("")}
        </tbody></table></div>` : ""}
        <div class="row tight"><input id="counterName" type="text" placeholder="Counter name (Bid, Tricks, Lives…)" class="grow" style="width:auto;flex:1"><select id="counterScope" style="width:auto"><option value="player">Per player</option><option value="table">Table</option></select><button class="btn sm" data-act="add-counter">Add</button></div>`;
      return block("Quick score", quick + race)
        + block("Score sheet", sheet)
        + block("Scoring rules", settings)
        + block("Chips & pot", v.chipStart || v.pot || v.players.some((player) => player.chips) ? chips : `<p class="hint">No chips in this game. Give everyone a stack to track bets, antes and pots.</p>
          <div class="row tight"><input id="chipStart" type="number" min="1" value="100" style="width:90px"><button class="btn sm primary" data-act="enable-chips">Enable chips</button></div>`)
        + block("Counters & trackers", counters);
    },

    seats() {
      const v = view;
      const rows = v.players.map((player, i) => `<div class="list-row" style="--c:${esc(player.color)}">
          <input type="color" value="${esc(player.color)}" data-player-color="${player.id}" title="Color">
          <div class="grow"><input type="text" value="${esc(player.name)}" data-player-name="${player.id}" data-fk="pn-${player.id}"></div>
          <button class="btn sm icon${i === v.turn.dealer ? " primary" : ""}" data-act="set-dealer" data-index="${i}" title="Dealer">D</button>
          <button class="btn sm icon${i === v.turn.index ? " primary" : ""}" data-act="set-turn" data-index="${i}" title="Current turn">▶</button>
          <button class="btn sm icon" data-act="player-up" data-player="${player.id}" title="Move up" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="btn sm icon${player.out ? " danger" : ""}" data-act="player-out" data-player="${player.id}" title="${player.out ? "Sitting out" : "Sit out"}">⏸</button>
          <button class="btn sm icon ghost" data-act="remove-player" data-player="${player.id}" title="Remove">✕</button>
        </div>`).join("");
      const tpl = v.seatTemplate.map((entry) => `<div class="list-row">
          <span class="grow small"><b>${esc(entry.name)}</b> <span class="dim">· ${esc(entry.layout)} · ${esc(entry.visibility)}${entry.evals?.length ? " · " + entry.evals.map((spec) => EVAL_DEFS[parseSpec(spec).id]?.short || spec).join(", ") : ""}</span></span>
          <button class="btn sm" data-act="edit-template" data-key="${esc(entry.key)}">Edit</button>
        </div>`).join("") || `<p class="hint">No per-seat groups. Add a Hand so every player gets one.</p>`;
      return block("Players", `<div class="list">${rows}</div>
          <div class="row"><input id="newPlayerName" type="text" placeholder="Name" class="grow" style="width:auto;flex:1" data-fk="npn"><button class="btn primary" data-act="add-player">+ Add player</button></div>
          <div class="row tight"><button class="btn sm" data-act="random-player">🎲 Random first player</button><button class="btn sm" data-act="shuffle-seats">Shuffle seating</button></div>`)
        + block("Every seat gets", `<div class="list">${tpl}</div><div class="row"><button class="btn sm" data-add-zone="seats">+ Group per seat</button></div>
          <p class="hint">Seat groups share a key, so actions like <code>Deal 2 → hand</code> reach every player's copy, and <code>hand@current</code> targets the current player.</p>`);
    },

    deck() {
      const v = view;
      const spec = E.normalizeDeckSpec(v.deckSpec);
      const draft = deckDraft || (deckDraft = E.clone(spec));
      const ranks = draft.ranks && draft.ranks.length ? draft.ranks : deckRanksFor(draft);
      const size = E.deckSize(draft);
      const builder = `
        <div class="grid-3">
          <label class="field"><span>Base</span><select data-deck="preset">${Object.entries(E.DECK_PRESETS).map(([id, p]) => `<option value="${id}"${draft.preset === id ? " selected" : ""}>${esc(p.label)}</option>`).join("")}</select></label>
          <label class="field"><span>Decks</span><input type="number" min="1" max="8" value="${draft.decks}" data-deck="decks"></label>
          <label class="field"><span>Jokers</span><input type="number" min="0" max="8" value="${draft.jokers}" data-deck="jokers"></label>
        </div>
        <div class="field"><span>Suits</span><div class="row tight">${["s", "h", "d", "c"].map((suit) => `<label class="check"><input type="checkbox" data-deck-suit="${suit}"${draft.suits.includes(suit) ? " checked" : ""}> <span style="color:${suit === "h" || suit === "d" ? "#ff7b8e" : "inherit"};font-size:16px">${SUIT_SYMBOL[suit]}</span></label>`).join("")}</div></div>
        <div class="field"><span>Ranks <button class="btn sm ghost" data-act="deck-ranks-reset">reset to base</button></span><div class="row tight">${E.STD_RANKS.map((rank) => `<button class="btn sm${ranks.includes(rank) ? " primary" : ""}" data-deck-rank="${rank}" style="min-width:30px">${RANK_SHOW(rank)}</button>`).join("")}</div></div>
        <div class="field"><span>Custom cards (for new mechanics)</span>
          <div class="list">${draft.custom.map((item, i) => `<div class="list-row" style="flex-wrap:wrap">
              <input type="color" value="${esc(item.color)}" data-custom="${i}" data-k="color">
              <input type="text" value="${esc(item.label)}" placeholder="Name" style="width:110px" data-custom="${i}" data-k="label">
              <input type="number" value="${item.value}" title="Value" style="width:56px" data-custom="${i}" data-k="value">
              <input type="number" min="1" max="20" value="${item.count}" title="Copies" style="width:52px" data-custom="${i}" data-k="count">
              <button class="btn sm icon ghost" data-act="custom-del" data-i="${i}">✕</button>
              <input type="text" value="${esc(item.text)}" placeholder="Rules text" class="grow" style="flex-basis:100%" data-custom="${i}" data-k="text">
            </div>`).join("")}</div>
          <button class="btn sm" data-act="custom-add">+ Custom card</button></div>
        <div class="row"><span class="grow muted">${size} cards</span><button class="btn primary" data-act="rebuild-deck">Rebuild & shuffle</button></div>
        <p class="hint">Rebuilding collects every card from the table.</p>`;
      const unseen = unseenCards(v);
      const suits = spec.suits;
      const rankList = deckRanksFor(spec).slice().sort((a, b) => E.RANK_ORDER[b] - E.RANK_ORDER[a]);
      const grid = `<div class="unseen-grid" style="--cols:${rankList.length}"><div class="h"></div>${rankList.map((rank) => `<div class="h">${RANK_SHOW(rank)}</div>`).join("")}
        ${suits.map((suit) => `<div class="h s-${suit}">${SUIT_SYMBOL[suit]}</div>${rankList.map((rank) => { const n = unseen.counts.get(rank + suit) || 0; return `<div class="${n ? "s-" + suit : "z"}">${n || "·"}</div>`; }).join("")}`).join("")}</div>`;
      const N = unseen.cards.length;
      const rankOdds = rankList.map((rank) => {
        const k = unseen.cards.filter((card) => card.rank === rank).length;
        return [RANK_SHOW(rank), N ? k / N : 0];
      });
      const bars = rankOdds.map(([label, p]) => `<div class="row tight" style="flex-wrap:nowrap"><span class="small" style="width:22px;font-weight:800">${label}</span><div class="prob-bar grow"><span style="width:${p * 100}%"></span><em>${pct(p)}</em></div></div>`).join("");
      const K = unseen.cards.filter((card) => (hyper.ranks.length === 0 || hyper.ranks.includes(card.rank)) && (hyper.suits.length === 0 || hyper.suits.includes(card.suit))).length;
      const anyTarget = hyper.ranks.length || hyper.suits.length;
      const n = Math.max(1, Math.min(N, hyper.draws));
      const calc = `
        <div class="field"><span>Target ranks</span><div class="row tight">${rankList.map((rank) => `<button class="btn sm${hyper.ranks.includes(rank) ? " primary" : ""}" data-hyper-rank="${rank}" style="min-width:28px">${RANK_SHOW(rank)}</button>`).join("")}</div></div>
        <div class="field"><span>Target suits</span><div class="row tight">${suits.map((suit) => `<button class="btn sm${hyper.suits.includes(suit) ? " primary" : ""}" data-hyper-suit="${suit}">${SUIT_SYMBOL[suit]}</button>`).join("")}</div></div>
        <label class="field"><span>Cards drawn</span><input type="number" min="1" max="60" value="${hyper.draws}" data-hyper-draws data-fk="hyd"></label>
        ${anyTarget && N ? `<div class="list">
          <div class="small muted">${K} outs in ${N} unseen cards</div>
          ${[1, 2, 3].map((k) => { const p = hypergeomAtLeast(N, K, n, k); return `<div class="row tight" style="flex-wrap:nowrap"><span class="small" style="width:70px">≥ ${k} hit${k > 1 ? "s" : ""}</span><div class="prob-bar grow"><span style="width:${p * 100}%"></span><em>${pct(p)}</em></div></div>`; }).join("")}
          <div class="small muted">Expected hits: ${(n * K / N).toFixed(2)}</div></div>` : `<p class="hint">Pick ranks and/or suits to compute your outs.</p>`}`;
      const addCard = `<div class="row tight">
          <select id="acRank" style="width:auto">${[...E.STD_RANKS, "JK"].map((rank) => `<option value="${rank}">${rank === "JK" ? "Joker" : RANK_SHOW(rank)}</option>`).join("")}</select>
          <select id="acSuit" style="width:auto">${["s", "h", "d", "c"].map((suit) => `<option value="${suit}">${SUIT_SYMBOL[suit]}</option>`).join("")}</select>
          <select id="acTo" style="width:auto;max-width:150px">${zoneOptions(E.findDeckZone(v)?.id)}</select>
          <button class="btn sm" data-act="add-card">Add card</button></div>`;
      return block("Unseen cards", `<div class="small muted">From your point of view: ${N} unseen · ${Object.keys(v.cards).length} in play</div>${grid}`)
        + block("Next card odds", `<div class="list">${bars}</div>`)
        + block("Outs calculator", calc)
        + block("Deck builder", builder)
        + block("Add a single card", addCard);
    },

    tools() {
      const v = view;
      const roll = v.lastRoll;
      const dice = roll?.rolls ? roll.rolls.map((value) => `<span class="die">${value}</span>`).join("") + (roll.rolls.length > 1 ? `<strong style="font-size:18px;margin-left:6px">= ${roll.total}</strong>` : "") : roll?.coin ? `<span class="die" style="width:auto;padding:0 10px;border-radius:999px">${roll.coin}</span>` : `<span class="muted small">Roll something!</span>`;
      const diceBlock = `<div class="dice-out" data-roll="${roll?.t || 0}">${dice}</div>
        <div class="row tight"><input id="diceCount" type="number" min="1" max="20" value="${diceCfg.count}" style="width:60px"><span class="muted">×</span>
          ${[4, 6, 8, 10, 12, 20, 100].map((sides) => `<button class="btn sm${diceCfg.sides === sides ? " primary" : ""}" data-act="roll" data-sides="${sides}">d${sides}</button>`).join("")}</div>
        <div class="row tight"><button class="btn sm" data-act="coin">Flip coin</button><button class="btn sm" data-act="random-player">Random player</button></div>`;
      const timerBlock = `<div class="row"><div class="timer${timer.left <= 10 && timer.running ? " low" : ""}">${fmtTime(timer.left)}</div>
          <div class="row tight"><button class="btn sm${timer.running ? "" : " primary"}" data-act="timer-toggle">${timer.running ? "Pause" : "Start"}</button><button class="btn sm" data-act="timer-reset">Reset</button></div></div>
        <div class="row tight"><label class="field" style="width:110px"><span>Seconds</span><input id="timerSecs" type="number" min="5" max="3600" value="${timer.total}"></label>
          <label class="check"><input type="checkbox" id="timerAuto"${timer.autoNext ? " checked" : ""}> Next turn when time runs out</label></div>`;
      const evalChoices = ["poker-high", "poker-omaha", "low-a5", "low-27", "badugi"];
      const seatKeys = Array.from(new Set(v.seatTemplate.map((tpl) => tpl.key)));
      const eq = equityResult;
      const equityBlock = `<div class="grid-2">
          <label class="field"><span>Game</span><select id="eqEval">${evalChoices.map((id) => `<option value="${id}"${equityCfg.evaluator === id ? " selected" : ""}>${esc(EVAL_DEFS[id].label)}</option>`).join("")}</select></label>
          <label class="field"><span>Hands</span><select id="eqKey">${seatKeys.map((key) => `<option value="${esc(key)}"${equityCfg.key === key ? " selected" : ""}>${esc(v.seatTemplate.find((t) => t.key === key).name)}</option>`).join("")}</select></label>
          <label class="field"><span>Board</span><select id="eqBoard"><option value="">(none)</option>${E.orderedZones(v, "table").map((zone) => `<option value="${zone.id}"${equityCfg.board === zone.id || (!equityCfg.board && zone.key === "board") ? " selected" : ""}>${esc(zone.name)}</option>`).join("")}</select></label>
          <label class="field"><span>Board size</span><input id="eqSize" type="number" min="0" max="10" value="${equityCfg.size}"></label>
        </div>
        <div class="row"><button class="btn primary" data-act="equity">Run equity</button><span class="muted small">Monte Carlo over the cards you can't see. Hands must be visible to you.</span></div>
        ${eq ? `<div class="list">${eq.rows.map((row) => `<div class="equity-row" style="--c:${esc(row.color)}"><span class="nm"><span class="swatch"></span>${esc(row.name)}</span><div class="prob-bar"><span style="width:${row.share * 100}%;background:linear-gradient(90deg, color-mix(in srgb, ${row.color} 40%, transparent), ${row.color})"></span></div><strong class="small mono">${pct(row.share)}</strong></div>`).join("")}<div class="small dim">${eq.iterations} runs${eq.skipped ? ` · ${eq.skipped} hidden hand(s) skipped` : ""}</div></div>` : ""}`;
      const display = `
        <div class="field"><span>Card size</span><div class="seg">${[["s", "S"], ["m", "M"], ["l", "L"], ["xl", "XL"]].map(([id, label]) => `<button data-pref="size" data-val="${id}" class="${prefs.size === id ? "on" : ""}">${label}</button>`).join("")}</div></div>
        <div class="field"><span>Felt</span><div class="seg">${["green", "blue", "wine", "slate", "sand"].map((id) => `<button data-pref="felt" data-val="${id}" class="${prefs.felt === id ? "on" : ""}">${id}</button>`).join("")}</div></div>
        <div class="field"><span>Card back</span><div class="seg">${["classic", "crimson", "forest", "violet", "noir", "gold"].map((id) => `<button data-pref="back" data-val="${id}" class="${prefs.back === id ? "on" : ""}">${id}</button>`).join("")}</div></div>
        <label class="check"><input type="checkbox" data-pref-bool="four"${prefs.four ? " checked" : ""}> Four-color deck (blue ♦, green ♣)</label>
        <label class="check"><input type="checkbox" data-pref-bool="evals"${prefs.evals ? " checked" : ""}> Show scoring badges under groups</label>
        <label class="check"><input type="checkbox" data-pref-bool="motion"${prefs.motion ? " checked" : ""}> Animations</label>`;
      return block("Dice & randomness", diceBlock) + block("Turn timer", timerBlock) + block("Equity calculator", equityBlock) + block("Display", display);
    },

    log() {
      const v = view;
      const items = v.log.slice().reverse().map((entry) => {
        const t = new Date(entry.t);
        return `<div class="log-item k-${esc(entry.kind)}"><time>${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}</time><div>${entry.who ? `<b>${esc(entry.who)}</b> ` : ""}<span>${esc(entry.text)}</span></div></div>`;
      }).join("");
      return block("Table chat", `<div class="row tight"><input id="chatInput" type="text" placeholder="Say something or note a ruling…" class="grow" style="flex:1;width:auto" data-fk="chat"><button class="btn sm primary" data-act="chat">Send</button></div>`)
        + `<div class="log">${items}</div>`;
    },

    rules() {
      const v = view;
      const saves = load(STORE.saves, []);
      const customs = load(STORE.presets, []);
      return block("Rules & design notes", `<textarea class="rules-area" id="rulesText" data-fk="rules" placeholder="Write the rules of the game you're designing…">${esc(v.notes)}</textarea><p class="hint">Shared with everyone at the table. Saved when you click away.</p>`)
        + block("Game design", `<p class="hint">Save the whole setup — groups, seat template, deck, actions, phases, scoring and these rules — as a reusable game in the New game gallery.</p>
          <div class="row"><button class="btn primary" data-act="save-preset">Save as my game</button><button class="btn" data-act="export-preset">Export design</button><button class="btn" data-act="import">Import…</button></div>
          ${customs.length ? `<div class="small muted">${customs.length} saved design${customs.length > 1 ? "s" : ""} in this browser.</div>` : ""}`)
        + block("Saved tables", `<div class="list">${saves.map((entry, i) => `<div class="list-row"><span class="grow small"><b>${esc(entry.name)}</b> <span class="dim">${new Date(entry.t).toLocaleString()}</span></span><button class="btn sm" data-act="load-save" data-i="${i}">Load</button><button class="btn sm icon ghost" data-act="del-save" data-i="${i}">✕</button></div>`).join("") || `<p class="hint">Snapshots of the whole table (cards in place, scores and all).</p>`}</div>
          <div class="row"><button class="btn" data-act="save-table">Save snapshot</button><button class="btn" data-act="export-table">Export file</button></div>`);
    },
  };

  const quickDeal = { count: 1, face: "" };
  const diceCfg = { count: 1, sides: 6 };
  const equityCfg = { evaluator: "poker-high", key: "hand", board: "", size: 5 };
  let deckDraft = null;

  // ============================================================ DIALOGS
  const dialog = () => $("#dialog");
  function openDialog(html, { wide = false, onSubmit = null, bind = null } = {}) {
    const dlg = dialog();
    dlg.className = wide ? "wide" : "";
    dlg.innerHTML = `<form method="dialog" class="dlg">${html}</form>`;
    const form = dlg.querySelector("form");
    form.addEventListener("submit", (event) => {
      const submitter = event.submitter;
      if (submitter && submitter.value === "cancel") return;
      if (onSubmit) {
        const keep = onSubmit(form, submitter?.value);
        if (keep === false) event.preventDefault();
      }
    });
    if (bind) bind(form);
    if (!dlg.open) dlg.showModal();
    return form;
  }
  function closeDialog() { if (dialog().open) dialog().close(); }
  const head = (title) => `<div class="dlg-head"><h2>${esc(title)}</h2><button class="btn icon ghost" value="cancel" aria-label="Close">✕</button></div>`;

  // ----------------------------------------------------------- new game
  function presetCard(preset, selectedId) {
    const minis = { Poker: ["A♠", "K♥", "b"], Casino: ["A♦", "K♠", "b"], Cribbage: ["5♥", "5♣", "J♦"], Rummy: ["7♠", "8♠", "9♠"], "Trick-taking": ["Q♠", "A♥", "b"], Shedding: ["8♣", "8♥", "b"], Kids: ["K♣", "2♦", "b"], Solitaire: ["K♥", "Q♠", "J♥"], Freeform: ["b", "A♣", "b"], Custom: ["★", "b", "b"] }[preset.family] || ["b", "b"];
    return `<button type="button" class="preset${preset.id === selectedId ? " on" : ""}" data-preset="${esc(preset.id)}">
      <span class="fam">${esc(preset.family)}</span>
      <h3>${esc(preset.name)}</h3>
      <p>${esc(preset.tagline || preset.description)}</p>
      <div class="mini">${minis.map((m) => m === "b" ? `<span class="b"></span>` : `<span class="${/[♥♦]/.test(m) ? "r" : ""}">${esc(m)}</span>`).join("")}</div>
      ${preset.custom ? `<span class="btn sm ghost danger del" data-del-preset="${esc(preset.id)}">Delete</span>` : ""}
    </button>`;
  }

  function allPresets() {
    return [...P.PRESETS, ...load(STORE.presets, [])];
  }

  function openNewGame() {
    let selected = state?.presetId && allPresets().some((p) => p.id === state.presetId) ? state.presetId : "holdem";
    const draw = () => {
      const presets = allPresets();
      const families = Array.from(new Set(presets.map((p) => p.family)));
      const preset = presets.find((p) => p.id === selected) || presets[0];
      const range = preset.players || { min: 1, max: 12, default: 2 };
      const count = Math.max(range.min, Math.min(range.max, state?.players.length || range.default));
      return head("New game") + `<div class="dlg-body">
          ${families.map((family) => `<div><div class="area-label" style="color:var(--muted)">${esc(family)}</div><div class="preset-grid">${presets.filter((p) => p.family === family).map((p) => presetCard(p, selected)).join("")}</div></div>`).join("")}
        </div>
        <div class="dlg-foot">
          <span class="grow small muted">${esc(preset.description || "")}</span>
          <label class="row tight small">Players <input name="players" type="number" min="${range.min}" max="${range.max}" value="${count}" style="width:64px"></label>
          <label class="check small"><input type="checkbox" name="keepNames" ${state?.players.length ? "checked" : ""}> Keep names</label>
          <button class="btn" value="cancel">Cancel</button>
          <button class="btn primary" value="start">Start ${esc(preset.name)}</button>
        </div>`;
    };
    const bind = (form) => {
      form.addEventListener("click", (event) => {
        const del = event.target.closest("[data-del-preset]");
        if (del) {
          event.preventDefault();
          event.stopPropagation();
          const id = del.dataset.delPreset;
          store(STORE.presets, load(STORE.presets, []).filter((p) => p.id !== id));
          if (selected === id) selected = "holdem";
          form.innerHTML = draw();
          return;
        }
        const card = event.target.closest("[data-preset]");
        if (card) {
          selected = card.dataset.preset;
          const scroll = form.querySelector(".dlg-body").scrollTop;
          form.innerHTML = draw();
          form.querySelector(".dlg-body").scrollTop = scroll;
        }
      });
      form.addEventListener("dblclick", (event) => { if (event.target.closest("[data-preset]")) form.querySelector('button[value="start"]').click(); });
    };
    openDialog(draw(), {
      wide: true,
      bind,
      onSubmit(form) {
        const preset = allPresets().find((p) => p.id === selected);
        const n = Number(form.players.value) || 2;
        const names = Array.from({ length: n }, (_, i) => {
          const old = form.keepNames.checked ? state?.players[i] : null;
          return old ? { name: old.name, color: old.color, clientId: old.clientId } : { name: `Player ${i + 1}` };
        });
        if (net.mode === "client") { toast("Only the host can start a new game.", "error"); return; }
        const next = E.createTable(preset, { players: names });
        next.rev = (state?.rev || 0) + 1;
        replaceState(next, `${preset.name} ready — ${n} player${n > 1 ? "s" : ""}`);
        store(STORE.seen, true);
      },
    });
  }

  // ------------------------------------------------------- zone editor
  const LAYOUTS = [["fan", "Fan (hand)"], ["spread", "Row / spread"], ["overlap", "Overlapping row"], ["stack", "Stack / pile"], ["grid", "Grid"], ["free", "Free placement"]];
  const KINDS = [["hand", "Hand"], ["board", "Board / community"], ["pile", "Pile"], ["row", "Row"], ["deck", "Deck / stock"], ["discard", "Discard"], ["free", "Play area"]];
  const VIS = [["owner", "Private — owner sees, others see backs"], ["public", "Public — faces follow flips"], ["hidden", "Hidden — nobody sees face-down cards"]];
  const FACES = [["keep", "Keep as is"], ["down", "Face down"], ["up", "Face up"]];

  function openZoneDialog(zoneId, opts = {}) {
    const v = view;
    const zone = zoneId ? v.zones[zoneId] : null;
    const creating = !zone;
    const area = zone ? zone.area : opts.area || "table";
    const seatZone = zone && zone.area !== "table" && zone.key;
    const z = zone ? E.clone(zone) : {
      name: opts.cards?.length ? "New group" : area === "seats" ? "Group" : "Group",
      kind: area === "seats" ? "pile" : "pile", layout: "spread", visibility: "public", face: "keep", evals: [], ctx: {}, limit: 0, note: "", wide: false,
    };
    const selectedEvals = new Set(z.evals.map((spec) => parseSpec(spec).id));
    const specOverrides = z.evals.filter((spec) => spec.includes("@"));
    const groups = Array.from(new Set(V.EVALUATORS.map((def) => def.group)));
    const tableZones = E.orderedZones(v, "table");
    const sel = (name, list, value) => `<select name="${name}">${list.map(([id, label]) => `<option value="${id}"${value === id ? " selected" : ""}>${esc(label)}</option>`).join("")}</select>`;
    const areaSelect = creating ? `<label class="field"><span>Where</span><select name="area">
        <option value="table"${area === "table" ? " selected" : ""}>On the table (shared)</option>
        <option value="seats"${area === "seats" ? " selected" : ""}>At every seat</option>
        ${v.players.map((player) => `<option value="${player.id}"${area === player.id ? " selected" : ""}>Only ${esc(player.name)}'s seat</option>`).join("")}
      </select></label>` : "";
    const html = head(creating ? "New group" : `Edit “${z.name}”`) + `<div class="dlg-body">
        <div class="grid-2">
          <label class="field"><span>Name</span><input type="text" name="name" value="${esc(z.name)}" maxlength="32" required></label>
          ${areaSelect || `<label class="field"><span>Kind</span>${sel("kind", KINDS, z.kind)}</label>`}
          ${creating ? `<label class="field"><span>Kind</span>${sel("kind", KINDS, z.kind)}</label>` : ""}
          <label class="field"><span>Layout</span>${sel("layout", LAYOUTS, z.layout)}</label>
          <label class="field"><span>Visibility</span>${sel("visibility", VIS, z.visibility)}</label>
          <label class="field"><span>Cards arrive</span>${sel("face", FACES, z.face)}</label>
          <label class="field"><span>Max cards (0 = no limit)</span><input type="number" name="limit" min="0" max="200" value="${z.limit || 0}"></label>
          <label class="field"><span>Note / rule hint</span><input type="text" name="note" value="${esc(z.note)}" maxlength="140" placeholder="e.g. Discard 2 to the crib"></label>
        </div>
        <label class="check"><input type="checkbox" name="wide"${z.wide ? " checked" : ""}> Full width</label>
        <div class="field"><span>Scoring & ranking badges</span>
          <div class="eval-picker">${groups.map((group) => `<h4>${esc(group)}</h4>${V.EVALUATORS.filter((def) => def.group === group).map((def) => `<label><input type="checkbox" name="eval" value="${def.id}"${selectedEvals.has(def.id) ? " checked" : ""}><span>${esc(def.label)}<small>${esc(def.description || "")}</small></span></label>`).join("")}`).join("")}</div>
        </div>
        <div class="grid-3">
          <label class="field"><span>Board / community group</span><select name="board"><option value="">(none)</option>${tableZones.map((t) => `<option value="${esc(t.key || t.id)}"${z.ctx.board === (t.key || t.id) ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>
          <label class="field"><span>Starter / cut card group</span><select name="starter"><option value="">(none)</option>${tableZones.map((t) => `<option value="${esc(t.key || t.id)}"${z.ctx.starter === (t.key || t.id) ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>
          <label class="field"><span>Trump suit</span><select name="trump"><option value="">None</option>${["s", "h", "d", "c"].map((suit) => `<option value="${suit}"${z.ctx.trump === suit ? " selected" : ""}>${SUIT_SYMBOL[suit]}</option>`).join("")}</select></label>
          <label class="field"><span>Blackjack Charlie (cards)</span><input type="number" name="charlie" min="0" max="10" value="${z.ctx.charlie || 0}"></label>
        </div>
        <div class="row">
          <label class="check"><input type="checkbox" name="isCrib"${z.ctx.isCrib ? " checked" : ""}> Cribbage crib (5-card flush only)</label>
          <label class="check"><input type="checkbox" name="jokersWild"${z.ctx.jokersWild ? " checked" : ""}> Jokers wild</label>
          <label class="check"><input type="checkbox" name="faceTen"${z.ctx.faceTen ? " checked" : ""}> Face cards = 10 (sum)</label>
        </div>
        <label class="field"><span>Advanced: evaluator specs <span class="dim">id@boardKey to rank against a specific board</span></span><input type="text" name="specs" value="${esc(specOverrides.join(", "))}" placeholder="poker-omaha@board-2"></label>
        ${seatZone ? `<label class="check"><input type="checkbox" name="allSeats" checked> Apply to this group at every seat</label>` : ""}
      </div>
      <div class="dlg-foot">
        ${!creating ? `<button class="btn danger" value="delete" style="margin-right:auto">Delete group</button>` : ""}
        <button class="btn" value="cancel">Cancel</button>
        <button class="btn primary" value="save">${creating ? "Create" : "Save"}</button>
      </div>`;
    openDialog(html, {
      wide: true,
      onSubmit(form, value) {
        if (value === "delete") {
          dispatch({ type: "removeZone", zone: zoneId, allSeats: Boolean(form.allSeats?.checked) });
          return;
        }
        const evals = $$('input[name="eval"]:checked', form).map((el) => el.value);
        const extra = form.specs.value.split(",").map((s) => s.trim()).filter(Boolean);
        for (const spec of extra) if (EVAL_DEFS[parseSpec(spec).id] && !evals.includes(spec)) evals.push(spec);
        const ctx = {};
        if (form.board.value) ctx.board = form.board.value;
        if (form.starter.value) ctx.starter = form.starter.value;
        if (form.trump.value) ctx.trump = form.trump.value;
        if (Number(form.charlie.value)) ctx.charlie = Number(form.charlie.value);
        if (form.isCrib.checked) ctx.isCrib = true;
        if (form.jokersWild.checked) ctx.jokersWild = true;
        if (form.faceTen.checked) ctx.faceTen = true;
        const patch = {
          name: form.name.value, kind: form.kind.value, layout: form.layout.value, visibility: form.visibility.value, face: form.face.value,
          limit: Number(form.limit.value) || 0, note: form.note.value, wide: form.wide.checked, evals: evals.filter((spec, i) => !extra.includes(spec) || evals.indexOf(spec) === i), ctx,
        };
        // Plain ids covered by an @board override stay only if also ticked.
        if (creating) {
          const where = form.area.value;
          if (where === "seats") dispatch({ type: "addZone", perPlayer: true, zone: patch });
          else dispatch({ type: "addZone", area: where, zone: patch, cards: opts.cards || [] });
          selection.clear();
        } else {
          dispatch({ type: "updateZone", zone: zoneId, patch, allSeats: Boolean(form.allSeats?.checked) });
        }
      },
    });
  }

  // ---------------------------------------------------------- deal dialog
  function openDealDialog(fromId) {
    const v = view;
    const keys = Array.from(new Set(v.seatTemplate.map((t) => t.key)));
    const html = head("Deal") + `<div class="dlg-body">
        <div class="grid-2">
          <label class="field"><span>From</span><select name="from">${zoneOptions(fromId)}</select></label>
          <label class="field"><span>To</span><select name="to">${zoneOptions(keys[0] || "", { includeSeatKeys: true })}</select></label>
          <label class="field"><span>Cards each</span><input type="number" name="count" min="1" max="60" value="${quickDeal.count}"></label>
          <label class="field"><span>Face</span><select name="face"><option value="">Group default</option><option value="down">Face down</option><option value="up">Face up</option></select></label>
        </div>
        <p class="hint">Dealing to “Each …” goes one card at a time around the table starting left of the dealer.</p>
      </div>
      <div class="dlg-foot"><button class="btn" value="cancel">Cancel</button><button class="btn primary" value="deal">Deal</button></div>`;
    openDialog(html, {
      onSubmit(form) {
        quickDeal.count = Number(form.count.value) || 1;
        dispatch({ type: "deal", from: form.from.value, to: form.to.value, count: quickDeal.count, face: form.face.value || undefined });
      },
    });
  }

  // --------------------------------------------------------- macro editor
  function openMacroDialog(macroId) {
    const v = view;
    const existing = macroId ? v.macros.find((m) => m.id === macroId) : null;
    const draft = existing ? E.clone(existing) : { label: "New action", hint: "", steps: [{ op: "deal", from: "deck", to: v.seatTemplate[0]?.key || "hand", count: 1 }] };
    const refs = new Set(["deck"]);
    E.orderedZones(v, "table").forEach((zone) => refs.add(zone.key || zone.name.toLowerCase()));
    v.seatTemplate.forEach((tpl) => { refs.add(tpl.key); refs.add(tpl.key + "@current"); refs.add(tpl.key + "@dealer"); refs.add(tpl.key + "@me"); refs.add(tpl.key + "@next"); });
    const refList = `<datalist id="zoneRefs">${Array.from(refs).filter(Boolean).map((ref) => `<option value="${esc(ref)}">`).join("")}</datalist>`;
    const fieldHTML = (step, i, field) => {
      const val = step[field] ?? "";
      switch (field) {
        case "zone": case "from": case "to":
          return `<input type="text" list="zoneRefs" data-step="${i}" data-f="${field}" value="${esc(val)}" placeholder="${field}">`;
        case "count": return `<input type="number" min="1" max="60" data-step="${i}" data-f="count" value="${esc(val || (step.op === "flip" ? "" : 1))}" placeholder="${step.op === "flip" ? "all" : "1"}">`;
        case "amount": return `<input type="number" min="0" data-step="${i}" data-f="amount" value="${esc(val)}" placeholder="amount">`;
        case "face": return `<select data-step="${i}" data-f="face"><option value="">${step.op === "flip" ? "toggle" : "default"}</option><option value="up"${val === "up" ? " selected" : ""}>up</option><option value="down"${val === "down" ? " selected" : ""}>down</option></select>`;
        case "by": return `<select data-step="${i}" data-f="by">${["rank", "aceLow", "suit", "reverse"].map((b) => `<option${val === b ? " selected" : ""}>${b}</option>`).join("")}</select>`;
        case "who": return `<select data-step="${i}" data-f="who"><option value="next"${val === "next" ? " selected" : ""}>left of dealer</option><option value="dealer"${val === "dealer" ? " selected" : ""}>dealer</option></select>`;
        case "shuffle": return `<label class="check small"><input type="checkbox" data-step="${i}" data-f="shuffle"${step.shuffle !== false ? " checked" : ""}> shuffle</label>`;
        case "text": return `<input type="text" data-step="${i}" data-f="text" value="${esc(val)}" placeholder="text">`;
        default: return "";
      }
    };
    const draw = () => head(existing ? "Edit action" : "New action") + `<div class="dlg-body">
        ${refList}
        <div class="grid-2">
          <label class="field"><span>Button label</span><input type="text" name="label" value="${esc(draft.label)}" maxlength="28"></label>
          <label class="field"><span>Hint</span><input type="text" name="hint" value="${esc(draft.hint)}" maxlength="80" placeholder="Shown under the button"></label>
        </div>
        <div class="step-list">${draft.steps.map((step, i) => `<div class="step">
            <span class="n">${i + 1}</span>
            <div class="step-fields">
              <select data-step="${i}" data-f="op">${Object.entries(E.MACRO_OPS).map(([op, def]) => `<option value="${op}"${step.op === op ? " selected" : ""}>${esc(def.label)}</option>`).join("")}</select>
              ${E.MACRO_OPS[step.op].fields.map((field) => fieldHTML(step, i, field)).join("")}
              ${step.op === "deal" || step.op === "clear" ? `<label class="check small" title="Each player moves from their own group to their own group"><input type="checkbox" data-step="${i}" data-f="perSeat"${step.perSeat ? " checked" : ""}> per seat</label>` : ""}
            </div>
            <div class="row tight"><button type="button" class="btn sm icon" data-step-up="${i}" ${i === 0 ? "disabled" : ""}>↑</button><button type="button" class="btn sm icon ghost" data-step-del="${i}">✕</button></div>
          </div>`).join("")}</div>
        <div class="row"><button type="button" class="btn sm" data-step-add>+ Step</button></div>
        <p class="hint">Targets use group keys: <code>deck</code>, <code>board</code>, <code>hand</code> (every seat, left of dealer first), <code>hand@current</code>, <code>hand@dealer</code>, <code>hand@me</code>, <code>hand@next</code>.</p>
      </div>
      <div class="dlg-foot">
        ${existing ? `<button class="btn danger" value="delete" style="margin-right:auto">Delete</button><button type="button" class="btn sm icon" data-macro-move="-1" title="Earlier">←</button><button type="button" class="btn sm icon" data-macro-move="1" title="Later">→</button>` : ""}
        <button type="button" class="btn" data-test-run>Test run</button>
        <button class="btn" value="cancel">Cancel</button>
        <button class="btn primary" value="save">Save</button>
      </div>`;
    const sync = (form) => {
      draft.label = form.label.value;
      draft.hint = form.hint.value;
      $$("[data-step]", form).forEach((el) => {
        const step = draft.steps[Number(el.dataset.step)];
        if (!step) return;
        const f = el.dataset.f;
        let value = el.type === "checkbox" ? el.checked : el.value;
        if (["count", "amount"].includes(f)) value = value === "" ? undefined : Number(value);
        if (value === "" || value === undefined) delete step[f];
        else step[f] = value;
      });
    };
    const redraw = (form) => { form.innerHTML = draw(); };
    const bind = (form) => {
      form.addEventListener("change", (event) => {
        if (event.target.dataset.f === "op") {
          sync(form);
          const step = draft.steps[Number(event.target.dataset.step)];
          const keep = { op: step.op };
          for (const f of E.MACRO_OPS[step.op].fields) if (step[f] !== undefined) keep[f] = step[f];
          draft.steps[Number(event.target.dataset.step)] = keep;
          redraw(form);
        }
      });
      form.addEventListener("click", (event) => {
        const t = event.target.closest("button");
        if (!t) return;
        if (t.hasAttribute("data-step-add")) { sync(form); draft.steps.push({ op: "deal", from: "deck", to: v.seatTemplate[0]?.key || "hand", count: 1 }); redraw(form); }
        else if (t.dataset.stepDel !== undefined) { sync(form); draft.steps.splice(Number(t.dataset.stepDel), 1); redraw(form); }
        else if (t.dataset.stepUp !== undefined) { sync(form); const i = Number(t.dataset.stepUp); [draft.steps[i - 1], draft.steps[i]] = [draft.steps[i], draft.steps[i - 1]]; redraw(form); }
        else if (t.hasAttribute("data-test-run")) { sync(form); dispatch({ type: "runMacro", steps: draft.steps }); toast("Ran once — Undo to revert"); }
        else if (t.dataset.macroMove) { dispatch({ type: "moveMacro", id: macroId, dir: Number(t.dataset.macroMove) }); }
      });
    };
    openDialog(draw(), {
      wide: true,
      bind,
      onSubmit(form, value) {
        if (value === "delete") { dispatch({ type: "deleteMacro", id: macroId }); return; }
        sync(form);
        dispatch({ type: "saveMacro", macro: { ...draft, id: macroId || undefined } });
      },
    });
  }

  // -------------------------------------------------------------- room
  function openRoomDialog(prefillCode = "") {
    const name = load(STORE.name, "") || "";
    if (net.mode !== "local") {
      const link = location.origin + location.pathname + "?room=" + net.code;
      const html = head("Online table") + `<div class="dlg-body">
          <div><div class="small muted">Room code</div><div class="room-code">${esc(net.code)}</div></div>
          <div class="row"><input type="text" readonly value="${esc(link)}" class="grow" style="flex:1;width:auto" id="inviteLink"><button type="button" class="btn" data-copy>Copy invite</button></div>
          <div class="list">${net.roster.map((member) => {
            const seat = view.players.find((p) => p.clientId === member.id);
            return `<div class="list-row"><span class="swatch" style="--c:${esc(seat?.color || "#555")}"></span><span class="grow small"><b>${esc(member.name)}</b>${member.host ? " · host" : ""}${member.connected ? "" : " · reconnecting"}</span><span class="small muted">${seat ? esc(seat.name) : "spectating"}</span></div>`;
          }).join("")}</div>
          <p class="hint">You are ${net.mode === "host" ? "hosting — the table lives in your browser. If you leave, another player takes over." : "connected as a guest"}. Choose your seat with the view menu at the top.</p>
        </div>
        <div class="dlg-foot"><button class="btn danger" value="leave" style="margin-right:auto">Leave room</button><button class="btn primary" value="cancel">Done</button></div>`;
      openDialog(html, {
        bind(form) {
          form.querySelector("[data-copy]").addEventListener("click", () => {
            navigator.clipboard?.writeText(link).then(() => toast("Invite link copied", "good"), () => { $("#inviteLink").select(); });
          });
        },
        onSubmit(form, value) { if (value === "leave") leaveRoom(); },
      });
      return;
    }
    const html = head("Play online") + `<div class="dlg-body">
        <p class="hint">Peer-to-peer: the host's browser keeps the table and everyone sees only what they're allowed to — your hand stays private. No accounts.</p>
        <label class="field"><span>Your name</span><input type="text" name="name" maxlength="24" value="${esc(name)}" placeholder="Name" required></label>
        <div class="grid-2">
          <div class="card-block"><h3 style="margin:0;font-size:14px">Host this table</h3><p class="hint">Friends join your current table with its setup, cards and scores.</p><button class="btn primary" value="create">Create room</button></div>
          <div class="card-block"><h3 style="margin:0;font-size:14px">Join a room</h3><input type="text" name="code" maxlength="6" value="${esc(prefillCode)}" placeholder="CODE" style="text-transform:uppercase;letter-spacing:.15em;font-weight:800"><button class="btn" value="join">Join</button></div>
        </div>
      </div>`;
    openDialog(html, {
      onSubmit(form, value) {
        const player = form.name.value.trim() || "Player";
        store(STORE.name, player);
        if (value === "create") connectRoom(true, "", player);
        if (value === "join") {
          if (!form.code.value.trim()) { toast("Enter a room code", "error"); return false; }
          connectRoom(false, form.code.value, player);
        }
      },
    });
  }

  function openHelp() {
    const keys = [["1–9", "Run action 1–9"], ["T", "Next player"], ["Shift+T", "Previous player"], ["D", "Draw 1 to your / current hand"], ["S", "Shuffle the deck"], ["F", "Flip selected cards"], ["G", "Group selected cards"], ["M", "Move selected to…"], ["Del", "Discard selected"], ["A", "Select all in your hand"], ["Esc", "Clear selection / close"], ["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"], ["N", "New game"], ["\\", "Toggle side panel"], ["?", "This help"]];
    openDialog(head("How it works") + `<div class="dlg-body">
      <p class="hint"><b>Cards</b>: tap to select (tap several), drag to move — dragging a selected card moves the whole selection. Double-click flips. Right-click (or long-press menu ⋯) for more.</p>
      <p class="hint"><b>Groups</b> are any hand, board, pile or row. Each has a layout, visibility (private hands, public boards, hidden decks) and optional <b>scoring badges</b> — poker, Omaha, lowball, badugi, blackjack, baccarat, cribbage hand &amp; pegging, gin deadwood, OFC royalties, hearts, trick winner, sums. Comparable groups are ranked and the best gets a 🏆.</p>
      <p class="hint"><b>Actions</b> are macros built from steps (shuffle, deal, flip, collect, ante, next turn…) so you can script a game's flow and iterate on it.</p>
      <p class="hint"><b>View</b>: “All hands” for one shared screen, “Pass &amp; play” hides hands between turns, “X-ray” shows everything for design work, or pick a seat. Online rooms keep hands private per player.</p>
      <div class="kbd-list">${keys.map(([k, d]) => `<kbd>${esc(k)}</kbd><span>${esc(d)}</span>`).join("")}</div>
    </div><div class="dlg-foot"><button class="btn primary" value="cancel">Got it</button></div>`);
  }

  // ============================================================ NETWORK
  async function connectRoom(create, code, name) {
    if (typeof window.PeerRoom !== "function") { toast("Online play library failed to load.", "error"); return; }
    const room = new window.PeerRoom({ namespace: "mscards-workshop", maxPlayers: 12, storageKey: "ctw.room.session.v1" });
    net.room = room;
    room.onAction = (clientId, action) => hostHandle(clientId, action);
    room.onState = (next) => {
      if (net.mode !== "client") return;
      state = next;
      pruneSelection();
      render();
    };
    room.onRoster = (roster, snap) => {
      net.roster = roster;
      net.code = snap.roomCode;
      if (net.mode === "host") seatNewcomers();
      render();
    };
    room.onStatus = (status, message) => toast(message, status === "connected" ? "good" : "");
    room.onError = (error) => toast(error.message, "error");
    room.onBecomeHost = (full) => {
      net.mode = "host";
      if (full) { try { state = E.migrate(full); } catch (error) { /* keep view */ } }
      history = []; future = [];
      publish();
      render();
    };
    try {
      if (create) {
        await room.create(name);
        net.mode = "host";
        net.code = room.roomCode;
        // Host takes the current seat of their view (or the first seat).
        const want = mySeatFromLocal() || state.players.find((player) => !player.clientId)?.id;
        if (want) applyLocal({ type: "claimSeat", player: want, clientId: room.clientId, name }, null);
        else applyLocal({ type: "addPlayer", name, clientId: room.clientId }, null);
        history = []; future = [];
        publish();
        openRoomDialog();
      } else {
        net.mode = "client";
        await room.join(code, name);
        net.code = room.roomCode;
        history = []; future = [];
        toast("Joined " + net.code, "good");
      }
      render();
    } catch (error) {
      net.mode = "local";
      net.room = null;
      toast(error.message || "Connection failed", "error");
      restoreLocal();
    }
  }

  function mySeatFromLocal() {
    return prefs.viewMode.startsWith("seat:") ? prefs.viewMode.slice(5) : null;
  }

  function seatNewcomers() {
    for (const member of net.roster) {
      if (member.id === net.room.clientId) continue;
      if (state.players.some((player) => player.clientId === member.id)) continue;
      const open = state.players.find((player) => !player.clientId);
      if (open) applyLocal({ type: "claimSeat", player: open.id, clientId: member.id, name: member.name }, null);
      else if (state.players.length < 12) applyLocal({ type: "addPlayer", name: member.name, clientId: member.id }, null);
    }
  }

  function hostHandle(clientId, action) {
    if (!action || typeof action !== "object") return;
    const actor = state.players.find((player) => player.clientId === clientId)?.id || null;
    if (action.type === "__undo") return undo();
    if (action.type === "__redo") return redo();
    if (action.type === "load") return toast("A guest tried to replace the table — ignored.");
    if (action.type === "claimSeat") {
      const target = state.players.find((player) => player.id === action.player);
      if (target && target.clientId && target.clientId !== clientId && net.roster.some((m) => m.id === target.clientId && m.connected)) return;
      action = { ...action, clientId };
    }
    if (action.type === "releaseSeat") action = { ...action, clientId };
    applyLocal(action, actor);
  }

  function publish() {
    if (net.mode !== "host" || !net.room) return;
    net.room.publishState(state, (full, clientId) => {
      const seat = full.players.find((player) => player.clientId === clientId)?.id;
      return E.viewFor(full, seat || "__spectator");
    });
  }

  function leaveRoom() {
    try { net.room?.leave(); } catch (error) { /* ignore */ }
    const wasHost = net.mode === "host";
    net.room = null;
    net.mode = "local";
    net.roster = [];
    if (wasHost) {
      state.players.forEach((player) => { player.clientId = null; });
    } else restoreLocal();
    history = []; future = [];
    render();
    toast("Left the room");
  }

  function restoreLocal() {
    const saved = load(STORE.table, null);
    try { state = saved ? E.migrate(saved) : E.createTable(P.get("holdem"), {}); } catch (error) { state = E.createTable(P.get("holdem"), {}); }
    render();
  }

  // ============================================================ TIMER
  function timerTick() {
    timer.left -= 1;
    if (timer.left <= 0) {
      timer.left = 0;
      stopTimer();
      toast("⏱ Time!", "error");
      if (timer.autoNext) { dispatch({ type: "nextTurn" }); resetTimer(true); }
    }
    renderTop();
    if (prefs.tab === "tools") {
      const el = $(".timer");
      if (el) { el.textContent = fmtTime(timer.left); el.classList.toggle("low", timer.left <= 10); }
    }
  }
  function startTimer() { if (timer.running) return; timer.running = true; timer.handle = setInterval(timerTick, 1000); }
  function stopTimer() { timer.running = false; clearInterval(timer.handle); }
  function resetTimer(autostart = false) { stopTimer(); timer.left = timer.total; if (autostart) startTimer(); }

  // ============================================================ FILES
  function download(name, text, type = "application/json") {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const fileSafe = (text) => String(text || "table").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "table";

  function importFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (data.zones && data.cards) {
          if (net.mode === "client") return toast("Only the host can load a table.", "error");
          replaceState(E.migrate(data), "Table loaded");
        } else if (data.table || data.seat) {
          const presets = load(STORE.presets, []);
          data.id = data.id && !P.PRESETS.some((p) => p.id === data.id) ? data.id : "custom-" + Date.now().toString(36);
          data.custom = true;
          data.family = data.family || "Custom";
          store(STORE.presets, presets.filter((p) => p.id !== data.id).concat(data));
          toast(`Imported “${data.name}” — find it in New game`, "good");
        } else throw new Error("Unrecognised file");
      } catch (error) { toast("Couldn't import: " + error.message, "error"); }
    };
    input.click();
  }

  // ============================================================ EVENTS
  function runEquity() {
    const v = view;
    const zones = E.resolveZones(v, equityCfg.key);
    const hands = [];
    const rows = [];
    let skipped = 0;
    for (const zid of zones) {
      const zone = v.zones[zid];
      const cards = cardsOf(v, zone);
      if (!cards.length || cards.some((card) => !card.rank)) { skipped += 1; continue; }
      hands.push(cards);
      const player = E.playerById(v, zone.area);
      rows.push({ name: player?.name || zone.name, color: player?.color || "#45d6ff" });
    }
    if (hands.length < 2) { toast("Need at least two fully visible hands (try X-ray view or reveal).", "error"); return; }
    const boardZone = equityCfg.board ? v.zones[equityCfg.board] : null;
    const board = boardZone ? cardsOf(v, boardZone).filter((card) => card.rank) : [];
    const deck = unseenCards(v).cards;
    const t0 = performance.now();
    try {
      const result = V.equity({ evaluator: equityCfg.evaluator, hands, board, boardSize: Number(equityCfg.size) || 0, deck, iterations: equityCfg.evaluator === "poker-omaha" ? 1500 : 4000 });
      result.players.forEach((entry, i) => Object.assign(rows[i], entry));
      equityResult = { rows, iterations: result.iterations, skipped, ms: performance.now() - t0 };
    } catch (error) { toast(error.message, "error"); }
    renderPane();
  }

  function handleAct(el, event) {
    const act = el.dataset.act;
    const v = view;
    switch (act) {
      case "next-turn": dispatch({ type: "nextTurn" }); if (timer.running || timer.autoNext) resetTimer(timer.running); break;
      case "prev-turn": dispatch({ type: "nextTurn", back: true }); break;
      case "pass-deal": dispatch({ type: "passDeal" }); break;
      case "reverse": dispatch({ type: "reverseDirection" }); break;
      case "next-round": dispatch({ type: "nextRound" }); break;
      case "next-phase":
        if (v.phases.length) dispatch({ type: "nextPhase" });
        else { const text = prompt("Phase name", v.turn.phase || ""); if (text !== null) dispatch({ type: "setPhase", phase: text }); }
        break;
      case "set-phase": dispatch({ type: "setPhase", phase: el.dataset.phase }); break;
      case "edit-phases": {
        const text = prompt("Phases, separated by commas", v.phases.join(", "));
        if (text !== null) dispatch({ type: "setPhases", phases: text.split(",").map((s) => s.trim()) });
        break;
      }
      case "macro": if (!event.target.closest("[data-act='edit-macro']")) dispatch({ type: "runMacro", id: el.dataset.id }); break;
      case "edit-macro": event.stopPropagation(); openMacroDialog(el.dataset.id); break;
      case "new-macro": openMacroDialog(null); break;
      case "quick-deal": {
        quickDeal.from = $("#qdFrom").value;
        quickDeal.to = $("#qdTo").value;
        quickDeal.count = Number($("#qdCount").value) || 1;
        quickDeal.face = $("#qdFace").value;
        dispatch({ type: "deal", from: quickDeal.from, to: quickDeal.to, count: quickDeal.count, face: quickDeal.face || undefined });
        break;
      }
      case "collect": dispatch({ type: "collect", shuffle: true }); break;
      case "reveal-all": dispatch({ type: "revealAll" }); break;
      case "award-best": dispatch({ type: "award", players: el.dataset.players.split(",") }); break;

      // zone header tools
      case "here": {
        const zoneId = el.closest("[data-zone-id]").dataset.zoneId;
        dispatch({ type: "move", cards: orderedSelection(), to: zoneId });
        selection.clear(); render();
        break;
      }
      case "draw": {
        const zoneId = el.closest("[data-zone-id]").dataset.zoneId;
        const hand = myHandZone();
        if (!hand) return toast("Add a player with a hand first.", "error");
        dispatch({ type: "draw", from: zoneId, to: hand, count: 1 });
        break;
      }
      case "deal": openDealDialog(el.closest("[data-zone-id]").dataset.zoneId); break;
      case "shuffle": dispatch({ type: "shuffle", zone: el.closest("[data-zone-id]").dataset.zoneId }); break;
      case "flip": dispatch({ type: "flipZone", zone: el.closest("[data-zone-id]").dataset.zoneId }); break;
      case "menu": zoneMenu(el, el.closest("[data-zone-id]").dataset.zoneId); break;
      case "seat-menu": seatMenu(el, el.dataset.player); break;

      // scores
      case "score": dispatch({ type: "adjustScore", player: el.dataset.player, delta: Number(el.dataset.delta) }); break;
      case "add-round": dispatch({ type: "addRound" }); break;
      case "del-round": dispatch({ type: "deleteRound", round: el.dataset.round }); break;
      case "reset-scores": if (confirm("Clear the whole score sheet?")) dispatch({ type: "resetScores" }); break;
      case "export-csv": {
        const totals = E.totals(v);
        const lines = [["Round", ...v.players.map((p) => p.name)], ...v.scores.rounds.map((r) => [r.label, ...v.players.map((p) => r.scores[p.id] ?? "")]), ["Total", ...v.players.map((p) => totals[p.id])]];
        download(fileSafe(v.title) + "-scores.csv", lines.map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
        break;
      }
      case "award": {
        const to = $("#awardTo").value;
        dispatch({ type: "award", players: to === "__split" ? v.players.filter((p) => !p.out).map((p) => p.id) : [to] });
        break;
      }
      case "bet": {
        const input = $(`[data-bet-input="${el.dataset.player}"]`);
        dispatch({ type: "bet", player: el.dataset.player, amount: Number(input.value) });
        break;
      }
      case "transfer": dispatch({ type: "transfer", from: $("#tfFrom").value, to: $("#tfTo").value, amount: Number($("#tfAmount").value) }); break;
      case "reset-stacks": if (confirm("Reset every stack and clear the pot?")) dispatch({ type: "chipConfig", start: Number($("#chipStart").value), resetAll: true }); break;
      case "enable-chips": dispatch({ type: "chipConfig", start: Number($("#chipStart").value) || 100, resetAll: true }); break;
      case "counter": dispatch({ type: "counter", player: el.dataset.player, id: el.dataset.id, delta: Number(el.dataset.delta) }); break;
      case "del-counter": dispatch({ type: "removeCounter", id: el.dataset.id }); break;
      case "add-counter": {
        const name = $("#counterName").value.trim();
        if (!name) return toast("Name the counter first", "error");
        dispatch({ type: "addCounter", name, scope: $("#counterScope").value });
        break;
      }

      // players
      case "add-player": {
        const name = $("#newPlayerName")?.value.trim();
        dispatch({ type: "addPlayer", name: name || undefined });
        break;
      }
      case "remove-player": {
        const player = E.playerById(v, el.dataset.player);
        if (player && confirm(`Remove ${player.name}? Their cards return to the deck.`)) dispatch({ type: "removePlayer", player: player.id });
        break;
      }
      case "set-dealer": dispatch({ type: "setTurn", dealer: Number(el.dataset.index) }); break;
      case "set-turn": dispatch({ type: "setTurn", index: Number(el.dataset.index) }); break;
      case "player-up": dispatch({ type: "movePlayer", player: el.dataset.player, dir: -1 }); break;
      case "player-out": { const p = E.playerById(v, el.dataset.player); dispatch({ type: "updatePlayer", player: p.id, patch: { out: !p.out } }); break; }
      case "random-player": dispatch({ type: "randomPlayer" }); break;
      case "shuffle-seats": {
        const ids = v.players.map((p) => p.id);
        for (let i = ids.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        // Reach the shuffled order through adjacent seat swaps.
        const current = v.players.map((p) => p.id);
        const actions = [];
        ids.forEach((id, target) => {
          let at = current.indexOf(id);
          while (at > target) { actions.push({ type: "movePlayer", player: id, dir: -1 }); [current[at - 1], current[at]] = [current[at], current[at - 1]]; at -= 1; }
        });
        if (net.mode === "client") actions.forEach(dispatch);
        else {
          let next = state;
          try { for (const action of actions) next = E.reduce(next, action, null); history.push(state); future = []; state = next; afterChange(); } catch (error) { toast(error.message, "error"); }
        }
        toast("Seats shuffled");
        break;
      }
      case "edit-template": {
        const seat = v.players.find((p) => E.orderedZones(v, p.id).some((z) => z.key === el.dataset.key));
        const zone = seat && E.orderedZones(v, seat.id).find((z) => z.key === el.dataset.key);
        if (zone) openZoneDialog(zone.id);
        else toast("Add a player to edit seat groups.", "error");
        break;
      }

      // deck
      case "deck-ranks-reset": deckDraft.ranks = null; renderPane(); break;
      case "custom-add": deckDraft.custom.push({ label: "Wild", text: "", color: "#9f7dff", value: 0, count: 1 }); renderPane(); break;
      case "custom-del": deckDraft.custom.splice(Number(el.dataset.i), 1); renderPane(); break;
      case "rebuild-deck":
        if (confirm("Collect every card and rebuild the deck?")) { dispatch({ type: "rebuildDeck", spec: deckDraft }); deckDraft = null; }
        break;
      case "add-card": dispatch({ type: "addCards", to: $("#acTo").value, cards: [{ rank: $("#acRank").value, suit: $("#acSuit").value }] }); break;

      // tools
      case "roll": diceCfg.sides = Number(el.dataset.sides); diceCfg.count = Number($("#diceCount").value) || 1; dispatch({ type: "roll", sides: diceCfg.sides, count: diceCfg.count }); break;
      case "coin": dispatch({ type: "coin" }); break;
      case "timer-toggle": if (timer.running) stopTimer(); else { const secs = Number($("#timerSecs")?.value); if (secs && secs !== timer.total) { timer.total = secs; timer.left = secs; } startTimer(); } render(); break;
      case "timer-reset": { const secs = Number($("#timerSecs")?.value); if (secs) timer.total = secs; resetTimer(); render(); break; }
      case "equity":
        equityCfg.evaluator = $("#eqEval").value; equityCfg.key = $("#eqKey").value; equityCfg.board = $("#eqBoard").value; equityCfg.size = Number($("#eqSize").value);
        runEquity();
        break;

      // log & rules
      case "chat": { const input = $("#chatInput"); if (input.value.trim()) { dispatch({ type: "chat", text: input.value }); input.value = ""; } break; }
      case "save-preset": {
        const preset = E.toPreset(state || v);
        const name = prompt("Name this game design", preset.name);
        if (!name) return;
        preset.name = name;
        preset.tagline = "Your design";
        const presets = load(STORE.presets, []).filter((p) => p.name !== name);
        presets.push(preset);
        if (store(STORE.presets, presets)) toast(`Saved “${name}” to New game`, "good"); else toast("Browser storage is unavailable — use Export.", "error");
        renderPane();
        break;
      }
      case "export-preset": { const preset = E.toPreset(state || v); download(fileSafe(preset.name) + ".game.json", JSON.stringify(preset, null, 2)); break; }
      case "export-table": download(fileSafe(v.title) + ".table.json", JSON.stringify(net.mode === "client" ? v : state, null, 2)); break;
      case "import": importFile(); break;
      case "save-table": {
        if (net.mode === "client") return toast("Only the host can snapshot the full table.", "error");
        const saves = load(STORE.saves, []);
        saves.unshift({ name: state.title, t: Date.now(), state });
        if (store(STORE.saves, saves.slice(0, 12))) toast("Snapshot saved", "good"); else toast("Browser storage is full or unavailable.", "error");
        renderPane();
        break;
      }
      case "load-save": {
        const entry = load(STORE.saves, [])[Number(el.dataset.i)];
        if (entry && net.mode !== "client") replaceState(E.migrate(entry.state), "Loaded " + entry.name);
        break;
      }
      case "del-save": { const saves = load(STORE.saves, []); saves.splice(Number(el.dataset.i), 1); store(STORE.saves, saves); renderPane(); break; }
      default: break;
    }
  }

  function handleSelectionBar(el) {
    const ids = orderedSelection();
    const v = view;
    switch (el.dataset.sel) {
      case "flip": dispatch({ type: "flip", cards: ids }); break;
      case "move": moveMenu(el, ids); return;
      case "group": openZoneDialog(null, { cards: ids, area: E.zoneOf(v, ids[0])?.area || "table" }); return;
      case "peek": dispatch({ type: "peek", cards: ids }); break;
      case "rotate": dispatch({ type: "rotate", cards: ids }); return;
      case "sortsel": {
        const zone = E.zoneOf(v, ids[0]);
        if (!zone) break;
        const rank = (id) => (v.cards[id]?.rank ? E.RANK_ORDER[v.cards[id].rank] || 0 : -1);
        const sorted = ids.filter((id) => zone.cards.includes(id)).sort((a, b) => rank(b) - rank(a));
        const rest = zone.cards.filter((id) => !sorted.includes(id));
        const first = Math.min(...sorted.map((id) => zone.cards.indexOf(id)));
        rest.splice(Math.min(first, rest.length), 0, ...sorted);
        dispatch({ type: "arrange", zone: zone.id, cards: rest });
        return;
      }
      case "mark": showMenu(el, [...MARK_COLORS.map(([color, name]) => ({ label: name, sw: color, run: () => dispatch({ type: "mark", cards: ids, color }) })), { label: "Clear", run: () => dispatch({ type: "mark", cards: ids, color: null }) }]); return;
      case "discard": {
        const zone = E.orderedZones(v, "table").find((z) => z.kind === "discard");
        if (zone) dispatch({ type: "move", cards: ids, to: zone.id });
        break;
      }
      case "deck": { const deck = E.findDeckZone(v); if (deck) dispatch({ type: "move", cards: ids, to: deck.id, face: "down" }); break; }
      case "clear": break;
      default: return;
    }
    selection.clear();
    render();
  }

  function bindEvents() {
    const table = $("#table");
    table.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerCancel);
    table.addEventListener("dragstart", (event) => event.preventDefault());

    table.addEventListener("click", (event) => {
      if (performance.now() < suppressClick) return;
      const act = event.target.closest("[data-act]");
      if (act) return handleAct(act, event);
      const addZone = event.target.closest("[data-add-zone]");
      if (addZone) return openZoneDialog(null, { area: addZone.dataset.addZone === "seats" ? "seats" : "table", cards: addZone.dataset.addZone === "table" ? orderedSelection() : [] });
      const badge = event.target.closest(".eval[data-value]");
      if (badge) {
        const value = Number(badge.dataset.value);
        const zone = view.zones[badge.dataset.zone];
        const owner = zone && zone.area !== "table" ? E.playerById(view, zone.area) : view.players[view.turn.index];
        const items = [{ heading: `Score ${E.fmt(value)} from ${zone?.name || "group"}` }];
        if (owner) items.push({ label: `+${E.fmt(value)} to ${owner.name}`, sw: owner.color, run: () => dispatch({ type: "adjustScore", player: owner.id, delta: value, reason: zone.name }) });
        for (const player of view.players) if (player !== owner) items.push({ label: `+${E.fmt(value)} to ${player.name}`, sw: player.color, run: () => dispatch({ type: "adjustScore", player: player.id, delta: value, reason: zone.name }) });
        if (owner) items.push({ label: `−${E.fmt(value)} from ${owner.name}`, run: () => dispatch({ type: "adjustScore", player: owner.id, delta: -value, reason: zone.name }) });
        showMenu(badge, items);
        return;
      }
      const card = event.target.closest(".card[data-card-id]");
      if (card) {
        const id = card.dataset.cardId;
        if (selection.has(id)) selection.delete(id); else selection.add(id);
        render();
        return;
      }
      if (!event.target.closest(".zone") && selection.size) { selection.clear(); render(); }
    });
    table.addEventListener("dblclick", (event) => {
      const card = event.target.closest(".card[data-card-id]");
      if (!card) return;
      selection.delete(card.dataset.cardId);
      dispatch({ type: "flip", cards: [card.dataset.cardId] });
    });
    table.addEventListener("contextmenu", (event) => {
      const card = event.target.closest(".card[data-card-id]");
      const zone = event.target.closest("[data-zone-id]");
      if (!card && !zone) return;
      event.preventDefault();
      if (card) cardMenu({ x: event.clientX, y: event.clientY }, card.dataset.cardId);
      else zoneMenu({ x: event.clientX, y: event.clientY }, zone.dataset.zoneId);
    });
    // Highlight the cards an evaluator used.
    table.addEventListener("mouseover", (event) => {
      const badge = event.target.closest(".eval");
      $$(".card.used").forEach((el) => el.classList.remove("used"));
      if (!badge) return;
      const used = badge.dataset.used ? badge.dataset.used.split(",").map(Number) : [];
      const zone = view.zones[badge.dataset.zone];
      if (!zone) return;
      const own = zone.cards.length;
      used.forEach((i) => {
        if (i < own) $(`.card[data-zone="${zone.id}"][data-index="${i}"]`)?.classList.add("used");
      });
      const boardId = badge.dataset.board;
      const usedBoard = badge.dataset.usedBoard ? badge.dataset.usedBoard.split(",").map(Number) : [];
      if (boardId) usedBoard.forEach((i) => $(`.card[data-zone="${boardId}"][data-index="${i}"]`)?.classList.add("used"));
    });

    $("#pane").addEventListener("click", (event) => {
      const act = event.target.closest("[data-act]");
      if (act) return handleAct(act, event);
      const addZone = event.target.closest("[data-add-zone]");
      if (addZone) return openZoneDialog(null, { area: "seats" });
      const pref = event.target.closest("[data-pref]");
      if (pref) { prefs[pref.dataset.pref] = pref.dataset.val; savePrefs(); render(); return; }
      const rank = event.target.closest("[data-deck-rank]");
      if (rank) {
        const current = deckDraft.ranks && deckDraft.ranks.length ? deckDraft.ranks.slice() : deckRanksFor(deckDraft).slice();
        const r = rank.dataset.deckRank;
        deckDraft.ranks = current.includes(r) ? current.filter((x) => x !== r) : current.concat(r);
        if (!deckDraft.ranks.length) deckDraft.ranks = [r];
        renderPane();
        return;
      }
      const hr = event.target.closest("[data-hyper-rank]");
      if (hr) { const r = hr.dataset.hyperRank; hyper.ranks = hyper.ranks.includes(r) ? hyper.ranks.filter((x) => x !== r) : hyper.ranks.concat(r); renderPane(); return; }
      const hs = event.target.closest("[data-hyper-suit]");
      if (hs) { const s = hs.dataset.hyperSuit; hyper.suits = hyper.suits.includes(s) ? hyper.suits.filter((x) => x !== s) : hyper.suits.concat(s); renderPane(); }
    });

    $("#pane").addEventListener("change", (event) => {
      const el = event.target;
      const d = el.dataset;
      if (d.round && d.player) return dispatch({ type: "setRoundScore", round: d.round, player: d.player, value: el.value });
      if (d.roundLabel) return dispatch({ type: "renameRound", round: d.roundLabel, label: el.value });
      if (d.cfg === "label") return dispatch({ type: "scoreConfig", label: el.value });
      if (d.cfg === "target") return dispatch({ type: "scoreConfig", target: Number(el.value) });
      if (d.cfg === "lowWins") return dispatch({ type: "scoreConfig", lowWins: el.value === "1" });
      if (d.cfg === "peg") return dispatch({ type: "scoreConfig", pegTarget: el.checked ? (view.scores.target || 121) : 0 });
      if (d.chips) return dispatch({ type: "setChips", player: d.chips, value: Number(el.value) });
      if (d.playerName) return dispatch({ type: "updatePlayer", player: d.playerName, patch: { name: el.value } });
      if (d.playerColor) return dispatch({ type: "updatePlayer", player: d.playerColor, patch: { color: el.value } });
      if (d.deck) { deckDraft[d.deck] = d.deck === "preset" ? el.value : Number(el.value); if (d.deck === "preset") deckDraft.ranks = null; renderPane(); return; }
      if (d.deckSuit) { const s = d.deckSuit; deckDraft.suits = el.checked ? Array.from(new Set(deckDraft.suits.concat(s))) : deckDraft.suits.filter((x) => x !== s); if (!deckDraft.suits.length) deckDraft.suits = [s]; renderPane(); return; }
      if (d.custom !== undefined) { const item = deckDraft.custom[Number(d.custom)]; item[d.k] = ["value", "count"].includes(d.k) ? Number(el.value) : el.value; renderPane(); return; }
      if (d.hyperDraws !== undefined) { hyper.draws = Math.max(1, Number(el.value) || 1); renderPane(); return; }
      if (d.prefBool) { prefs[d.prefBool] = el.checked; savePrefs(); render(); return; }
      if (el.id === "rulesText") return dispatch({ type: "setNotes", notes: el.value });
      if (el.id === "timerAuto") { timer.autoNext = el.checked; return; }
      if (el.id === "timerSecs") { timer.total = Math.max(5, Number(el.value) || 60); if (!timer.running) timer.left = timer.total; renderTop(); return; }
      if (el.id === "qdFrom") quickDeal.from = el.value;
      if (el.id === "qdTo") quickDeal.to = el.value;
      if (el.id === "qdCount") quickDeal.count = Number(el.value) || 1;
      if (el.id === "qdFace") quickDeal.face = el.value;
    });

    $("#pane").addEventListener("keydown", (event) => {
      const el = event.target;
      if (event.key !== "Enter") return;
      if (el.dataset.scoreCustom) {
        const n = Number(el.value);
        if (n) dispatch({ type: "adjustScore", player: el.dataset.scoreCustom, delta: n });
        el.value = "";
        event.preventDefault();
      } else if (el.id === "chatInput") {
        handleAct({ dataset: { act: "chat" } }, event);
      } else if (el.id === "newPlayerName") {
        handleAct({ dataset: { act: "add-player" } }, event);
      } else if (el.dataset.betInput) {
        dispatch({ type: "bet", player: el.dataset.betInput, amount: Number(el.value) });
      } else if (el.id === "counterName") {
        handleAct({ dataset: { act: "add-counter" } }, event);
      }
    });

    $("#tabs").addEventListener("click", (event) => {
      const tab = event.target.closest("[data-tab]");
      if (!tab) return;
      if (prefs.tab === tab.dataset.tab && window.innerWidth <= 820 && prefs.side) { prefs.side = false; savePrefs(); return; }
      prefs.tab = tab.dataset.tab;
      prefs.side = true;
      if (prefs.tab === "deck") deckDraft = null;
      savePrefs();
      renderPane();
    });
    $(".sheet-handle").addEventListener("click", () => { prefs.side = false; savePrefs(); });

    $("#selectionBar").addEventListener("click", (event) => {
      const el = event.target.closest("[data-sel]");
      if (el) handleSelectionBar(el);
    });
    $("#turnStrip").addEventListener("click", (event) => {
      const act = event.target.closest("[data-act]");
      if (act) handleAct(act, event);
    });

    $("#titleInput").addEventListener("change", (event) => dispatch({ type: "setTitle", title: event.target.value }));
    $("#undoBtn").addEventListener("click", undo);
    $("#redoBtn").addEventListener("click", redo);
    $("#newBtn").addEventListener("click", openNewGame);
    $("#roomBtn").addEventListener("click", () => openRoomDialog());
    $("#addSeatBtn").addEventListener("click", () => dispatch({ type: "addPlayer" }));
    $("#sideToggle").addEventListener("click", () => { prefs.side = !prefs.side; savePrefs(); });
    $("#menuBtn").addEventListener("click", (event) => {
      showMenu(event.currentTarget, [
        { label: "How it works & shortcuts", run: openHelp },
        { label: "Collect all & shuffle", run: () => dispatch({ type: "collect", shuffle: true }) },
        { label: "Reveal every hand", run: () => dispatch({ type: "revealAll" }) },
        "-",
        { label: "Save table snapshot", run: () => handleAct({ dataset: { act: "save-table" } }) },
        { label: "Export table file", run: () => handleAct({ dataset: { act: "export-table" } }) },
        { label: "Export game design", run: () => handleAct({ dataset: { act: "export-preset" } }) },
        { label: "Import file…", run: importFile },
        "-",
        { label: "Reset this game (same setup)", danger: true, run: () => {
          if (net.mode === "client" || !confirm("Restart with the same setup, players and actions? Scores and cards reset.")) return;
          const preset = E.toPreset(state);
          const next = E.createTable(preset, { players: state.players.map((p) => ({ name: p.name, color: p.color, clientId: p.clientId })) });
          next.title = state.title;
          replaceState(next, "Fresh start");
        } },
      ]);
    });
    $("#viewSelect").addEventListener("change", (event) => {
      const value = event.target.value;
      if (net.mode === "local") {
        prefs.viewMode = value;
        passRevealed = null;
        savePrefs();
        selection.clear();
        render();
      } else if (value === "spectate") {
        dispatch({ type: "releaseSeat", clientId: net.room.clientId });
      } else if (value.startsWith("claim:")) {
        dispatch({ type: "claimSeat", player: value.slice(6), clientId: net.room.clientId });
      }
    });
    $("#passReady").addEventListener("click", () => {
      passRevealed = state.players[state.turn.index]?.id || null;
      render();
    });

    document.addEventListener("click", (event) => { if (openMenu && !openMenu.contains(event.target) && !event.target.closest("[data-act='menu'],#menuBtn,[data-sel='move'],[data-sel='mark'],[data-act='seat-menu'],.eval[data-value]")) closeMenu(); }, true);
    window.addEventListener("resize", closeMenu);
    if (typeof ResizeObserver === "function") new ResizeObserver(() => fitRows()).observe($("#table"));
    $("#table").addEventListener("scroll", closeMenu);

    document.addEventListener("keydown", (event) => {
      const typing = event.target.closest("input, textarea, select") || dialog().open;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "z" && !typing) { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
      if (mod && event.key.toLowerCase() === "y" && !typing) { event.preventDefault(); redo(); return; }
      if (typing || mod || event.altKey) return;
      const key = event.key;
      if (key === "Escape") { closeMenu(); if (selection.size) { selection.clear(); render(); } return; }
      if (/^[1-9]$/.test(key)) { const macro = view.macros[Number(key) - 1]; if (macro) dispatch({ type: "runMacro", id: macro.id }); return; }
      switch (key.toLowerCase()) {
        case "t": dispatch({ type: "nextTurn", back: event.shiftKey }); break;
        case "d": { const deck = E.findDeckZone(view); const hand = myHandZone(); if (deck && hand) dispatch({ type: "draw", from: deck.id, to: hand, count: 1 }); break; }
        case "s": { const deck = E.findDeckZone(view); if (deck) dispatch({ type: "shuffle", zone: deck.id }); break; }
        case "f": if (selection.size) { dispatch({ type: "flip", cards: orderedSelection() }); selection.clear(); render(); } break;
        case "g": if (selection.size) handleSelectionBar({ dataset: { sel: "group" } }); break;
        case "m": if (selection.size) moveMenu($("#selectionBar"), orderedSelection()); break;
        case "delete": case "backspace": if (selection.size) handleSelectionBar({ dataset: { sel: "discard" } }); break;
        case "a": { const hand = myHandZone(); if (hand) { view.zones[hand].cards.forEach((id) => selection.add(id)); render(); } break; }
        case "n": openNewGame(); break;
        case "\\": prefs.side = !prefs.side; savePrefs(); break;
        case "?": openHelp(); break;
        default: return;
      }
      event.preventDefault();
    });
  }

  // ============================================================== INIT
  function init() {
    applyPrefs();
    bindEvents();
    const saved = load(STORE.table, null);
    try { state = saved ? E.migrate(saved) : null; } catch (error) { state = null; }
    const firstVisit = !state;
    if (!state) state = E.createTable(P.get("holdem"), { players: 4 });
    render();
    const params = new URLSearchParams(location.search);
    const code = params.get("room");
    if (code) openRoomDialog(code.toUpperCase());
    else if (firstVisit && !load(STORE.seen, false)) openNewGame();
  }

  init();
})();
