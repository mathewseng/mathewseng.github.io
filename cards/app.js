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
  const RANK_WORD = (rank) => ({ A: "Aces", J: "Jacks", Q: "Queens", K: "Kings" }[rank] || RANK_SHOW(rank) + "s");
  const MARK_COLORS = [["#ff5c66", "Red"], ["#f4c95d", "Gold"], ["#45d6ff", "Cyan"], ["#bdf46b", "Green"], ["#9f7dff", "Violet"]];

  const STORE = { table: "ctw.table.v1", prefs: "ctw.prefs.v1", presets: "ctw.presets.v1", saves: "ctw.saves.v1", seen: "ctw.seen.v1", name: "ctw.name.v1", results: "ctw.results.v1", toured: "ctw.toured.v1" };
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
  function savePrefs() { store(STORE.prefs, prefs); applyPrefs(); if (view) renderDock(); }
  function applyPrefs() {
    document.body.dataset.size = prefs.size;
    document.body.dataset.felt = prefs.felt;
    document.body.dataset.back = prefs.back;
    document.body.dataset.four = prefs.four ? "1" : "0";
    document.body.dataset.motion = prefs.motion ? "1" : "0";
    document.body.dataset.jumbo = prefs.jumbo ? "1" : "0";
    document.body.dataset.contrast = prefs.contrast ? "1" : "0";
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
    if (replay.active) {
      const frame = replay.frames[replay.index] || state;
      return E.viewFor(frame, prefs.viewMode === "xray" ? "*" : "*hands");
    }
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

  /**
   * Who is acting for play rules. Locally that's your seat, or the current
   * player on a shared screen; X-ray is referee mode (no rules). A host who
   * hasn't taken a seat referees too.
   */
  function actingId() {
    if (net.mode === "host") return mySeatId();
    if (prefs.viewMode === "xray") return null;
    return mySeatId() || state?.players[state.turn.index]?.id || null;
  }

  // ------------------------------------------------------------ dispatch
  function dispatch(action) {
    if (!state) return;
    if (replay.active) { toast("Exit the replay to keep playing."); return; }
    bots.streak = 0;
    if (net.mode === "client") {
      try { net.room.sendAction(action); } catch (error) { toast(error.message, "error"); }
      return;
    }
    const before = state;
    const error = applyLocal(action, actingId());
    if (!error && recorder.on) { recordAction(before, action); renderTop(); }
  }

  /** Apply an action to the local/host state. Returns an error message, or "" on success. */
  function applyLocal(action, actor, opts = {}) {
    try {
      const next = E.reduce(state, action, actor, opts);
      history.push(state);
      if (history.length > 120) history.shift();
      future = [];
      state = next;
      afterChange();
      return "";
    } catch (error) {
      const message = error.message || String(error);
      if (!opts.quiet) toast(message, "error");
      return message;
    }
  }

  function undo() {
    if (net.mode === "client") return dispatch({ type: "__undo" });
    if (recorder.on && recorder.groups.length) recorder.steps.splice(recorder.steps.length - recorder.groups.pop());
    if (!history.length) return toast("Nothing to undo");
    future.push(state);
    state = history.pop();
    state.rev = (future[future.length - 1].rev || 0) + 1;
    lastLogKey = logKey(state.log[state.log.length - 1]);
    afterChange();
  }

  function redo() {
    if (net.mode === "client") return dispatch({ type: "__redo" });
    if (!future.length) return toast("Nothing to redo");
    history.push(state);
    state = future.pop();
    state.rev = (history[history.length - 1].rev || 0) + 1;
    lastLogKey = logKey(state.log[state.log.length - 1]);
    afterChange();
  }

  function afterChange() {
    if (net.mode !== "client" && !saveTimer) {
      // Throttled, not debounced, so a stream of bot moves still gets saved.
      saveTimer = setTimeout(() => { saveTimer = null; store(STORE.table, state); }, 250);
    }
    if (net.mode === "host") publish();
    announceNewLog(state);
    announceTurn(state);
    trackPacing(state);
    pruneSelection();
    render();
  }

  // Toast rule warnings and other people's chat as they land in the log.
  let lastLogKey = null;
  const logKey = (entry) => (entry ? `${entry.t}|${entry.who}|${entry.text}` : "");
  function announceNewLog(source) {
    const log = source?.log || [];
    const lastKey = logKey(log[log.length - 1]);
    if (lastLogKey === null) { lastLogKey = lastKey; return; }
    let i = log.length - 1;
    while (i >= 0 && logKey(log[i]) !== lastLogKey) i -= 1;
    lastLogKey = lastKey;
    if (i < 0) return; // a different table or room: nothing new to announce
    const sound = soundForLog(log.slice(i + 1));
    if (sound) playSound(sound);
    if (sound === "shuffle" && prefs.motion) {
      requestAnimationFrame(() => $$(".zone.kind-deck .cards, .cards.layout-stack").forEach((el) => {
        el.classList.remove("shuffling");
        void el.offsetWidth;
        el.classList.add("shuffling");
        setTimeout(() => el.classList.remove("shuffling"), 650);
      }));
    }
    const myName = mySeat(source)?.name;
    for (const entry of log.slice(i + 1).slice(-6)) {
      if (entry.kind === "warn") toast(entry.text, "warn");
      else if (entry.kind === "chat" && net.mode !== "local" && entry.who !== myName && prefs.tab !== "log") toast(`💬 ${entry.who}: ${entry.text}`);
      else if (entry.kind === "round" && /Game over/.test(entry.text)) toast(entry.text, "good");
    }
  }

  // Online: tell a player when the turn comes to them, in a toast and the tab title.
  let wasMyTurn = false;
  const baseTitle = document.title;
  function announceTurn(source) {
    if (net.mode === "local" || !source) { wasMyTurn = false; document.title = baseTitle; return; }
    const mine = mySeatId(source);
    const now = Boolean(mine) && source.players[source.turn.index]?.id === mine;
    if (now && !wasMyTurn) { toast("Your turn", "good"); playSound("turn"); }
    document.title = now ? "● Your turn · " + baseTitle : baseTitle;
    wasMyTurn = now;
  }

  function mySeat(source = state) {
    const id = mySeatId(source);
    return id ? source.players.find((player) => player.id === id) : null;
  }

  function replaceState(next, message) {
    if (!state || next.title !== state.title || next.players.length !== state.players.length) {
      botGames.result = null;
      botGames.compare = null;
    }
    if (state) history.push(state);
    future = [];
    state = next;
    bots.paused = false;
    bots.idleRev = -1;
    lastLogKey = logKey(next.log[next.log.length - 1]);
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
      if (!card.visible || card.rank == null) return { rank: null, suit: null };
      return card.custom ? { rank: card.rank, suit: "x", custom: true, value: Number(card.value) || 0, label: card.label } : { rank: card.rank, suit: card.suit };
    });
  }

  /** Evaluator definition for a spec id, including the table's own scoring schemes ("points:<id>"). */
  function evalDef(id, source = view || state) {
    if (String(id).startsWith("points:")) {
      const scheme = (source?.schemes || []).find((entry) => entry.id === id.slice(7));
      return scheme ? { id, label: scheme.name, short: scheme.name, group: "Your scoring", description: E.describeScheme(scheme) } : null;
    }
    return EVAL_DEFS[id] || null;
  }

  function evaluateZone(v, zone) {
    const out = [];
    for (const spec of zone.evals || []) {
      const { id } = parseSpec(spec);
      const def = evalDef(id, v);
      if (!def) continue;
      const input = E.evalInput(v, zone, spec, true);
      let result = null;
      const anyVisible = input.cards.some((card) => card.rank);
      try { result = anyVisible ? V.evaluate(input.id, input.cards, input.ctx) : null; } catch (error) { result = null; }
      out.push({ spec, id, def, result, boardZone: input.boardZone, place: 0, best: false });
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
      const glyph = card.icon || (String(card.label || "").length <= 3 ? card.label : "");
      const suit = card.suit && card.suit !== "x" ? `<div class="c-suit">${esc(card.suit)}</div>` : "";
      const art = card.image && /^https:\/\/[^\s"'()<>\\]+$/i.test(card.image) ? `<div class="c-art" style="background-image:url('${esc(card.image)}')"></div>` : "";
      return `<div class="c-title">${esc(card.label || card.rank)}</div>${art || (glyph ? `<div class="c-glyph">${esc(glyph)}</div>` : "")}<div class="c-text">${esc(card.text || "")}</div>${suit}${card.value ? `<div class="c-val">${esc(card.value)}</div>` : ""}`;
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
    const pips = layout.map(([x, y]) => `<span class="p" style="position:absolute;left:${x}%;top:${y}%;transform:translate(-50%,-50%)${y > 55 ? " rotate(180deg)" : ""};font-size:calc(var(--cw)*.2);line-height:1">${sym}</span>`).join("");
    return corners + pips + `<span class="jumbo-suit">${sym}</span>`;
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
    if (kbdFocus === card.id) cls.push("kbd-focus");
    if (card.rot) cls.push("rot" + card.rot);
    const mark = card.mark ? ` data-mark style="--mark:${esc(card.mark)};${extra}"` : extra ? ` style="${extra}"` : "";
    const custom = visible && card.custom ? ` style="--cc:${esc(card.color || "#9f7dff")};${extra}"` : "";
    const title = visible ? (card.custom ? card.label : E.cardName(card)) + (card.faceUp ? "" : " (hidden from others)") : "Face-down card";
    return `<div class="${cls.filter(Boolean).join(" ")}" data-card-id="${esc(card.id)}" data-index="${index}" data-zone="${zone.id}" title="${esc(title)}"${custom || mark}>${visible ? cardFace(card) : ""}</div>`;
  }

  function ruleIcon(zone) {
    const text = E.describeRule(zone.rule || {}, zone);
    if (!text) return "";
    const mode = view?.rulesMode || "warn";
    return `<span class="zone-rule${mode === "off" ? " off" : ""}" title="${esc("Play rules (" + mode + "): " + text)}">§</span>`;
  }

  function visIcon(zone) {
    if (zone.visibility === "owner") return `<span class="zone-vis" title="Private: only the owner sees face-down cards">🔒</span>`;
    if (zone.visibility === "hidden") return `<span class="zone-vis" title="Hidden: nobody sees face-down cards">▦</span>`;
    return "";
  }

  // ------------------------------------------------------- legal targets
  let legalMap = new Map();

  /** For the cards in hand (selected or dragged): which ruled groups would accept them, and why not. */
  function computeLegal(ids) {
    const map = new Map();
    const source = net.mode === "client" ? view : state;
    const actor = net.mode === "client" ? mySeatId() : actingId();
    if (!ids.length || !source || !actor || source.rulesMode === "off" || replay.active) return map;
    const real = ids.map((id) => E.resolveCard(source, id)).filter(Boolean);
    if (!real.length) return map;
    for (const zone of Object.values(source.zones)) {
      if (!zone.rule || !Object.keys(zone.rule).length || real.every((id) => zone.cards.includes(id))) continue;
      const result = E.checkMove(source, real, zone.id, actor, { force: true });
      map.set(zone.id, { ok: !result.hard.length && !result.soft.length, why: result.hard[0] || result.soft[0] || "" });
    }
    return map;
  }

  function applyLegalClasses(map) {
    $$(".zone[data-zone-id]").forEach((el) => {
      const verdict = map.get(el.dataset.zoneId);
      el.classList.toggle("legal", Boolean(verdict?.ok));
      el.classList.toggle("illegal", Boolean(verdict && !verdict.ok));
      if (verdict && !verdict.ok) el.dataset.why = verdict.why; else delete el.dataset.why;
    });
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
    } else if (cards.length && !zone.rule?.slap) {
      tools.push(`<button class="btn sm icon" data-act="flip" title="Flip all">⟲</button>`);
    }
    if (zone.rule?.slap) tools.unshift(`<button class="btn sm slap-btn" data-act="slap" title="Slap the pile (Space)">👋 Slap</button>`);
    if (zone.claim && zone.claim.by !== mySeatId()) tools.unshift(`<button class="btn sm slap-btn" data-act="call-bluff" title="Call the last claim: reveal it, and whoever is wrong takes the pile">🔍 Call!</button>`);
    const challenged = zone.challenge ? view.players[view.turn.index] : null;
    const challengeBar = zone.challenge ? `<div class="claim-bar">👑 <b>${esc(E.playerById(view, zone.challenge.by)?.name || "?")}</b> challenges: ${challenged ? `<b>${esc(challenged.name)}</b> has` : ""} <b>${zone.challenge.left}</b> flip${zone.challenge.left === 1 ? "" : "s"} to answer with a face card</div>` : "";
    const claimBar = challengeBar + (zone.rule?.claim ? `<div class="claim-bar">${zone.claim ? `<b>${esc(E.playerById(view, zone.claim.by)?.name || "?")}</b> claims <b>${zone.claim.count} × ${esc(RANK_WORD(zone.claim.rank))}</b>` : "No claim yet"} <span class="dim">· next: ${esc(RANK_WORD(E.nextClaimRank(zone)))}</span></div>` : "");
    tools.push(`<button class="btn sm icon" data-act="menu" title="Group options">⋯</button>`);
    const evals = prefs.evals && cards.length ? evalsHTML(zone) : "";
    const manyClass = layout === "fan" ? (cards.length > 9 ? " many" : cards.length <= 3 ? " few" : "") : "";
    // Tilted outer cards swing past their slot; pad the fan so they stay inside the group.
    const fanTilt = layout === "fan" ? (Math.min(6, 44 / Math.max(1, cards.length)) * (cards.length - 1) / 2) * Math.PI / 180 : 0;
    const fanStyle = layout === "fan" ? ` style="--fan-pad:${Math.max(0.1, 0.5 * Math.cos(fanTilt) + 1.68 * Math.sin(fanTilt) - 0.36).toFixed(3)}"` : "";
    const verdict = legalMap.get(zone.id);
    const legalClass = verdict ? (verdict.ok ? " legal" : " illegal") : "";
    return `<section class="zone kind-${zone.kind}${zone.wide || layout === "free" ? " wide" : ""}${inSel ? " can-drop" : ""}${legalClass}" data-zone-id="${zone.id}"${verdict && !verdict.ok ? ` data-why="${esc(verdict.why)}"` : ""}>
      <header class="zone-head">
        <span class="zone-name" title="${esc(zone.name)}">${esc(zone.name)}</span>
        <span class="zone-count">${cards.length}${zone.limit ? "/" + zone.limit : ""}</span>
        ${visIcon(zone)}${ruleIcon(zone)}
        <div class="zone-tools">${tools.join("")}</div>
      </header>
      ${zone.note ? `<div class="zone-note">${esc(zone.note)}</div>` : ""}${claimBar}
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
    // Real-time games have no turns to highlight.
    const current = index === v.turn.index && !v.realtime;
    const dealer = index === v.turn.dealer;
    const me = mySeatId() === player.id;
    const total = E.totals(v)[player.id] || 0;
    const tags = [];
    if (current) tags.push(`<span class="turn-tag">TURN</span>`);
    if (v.scores.rounds.some((round) => player.id in round.scores) || v.scores.target) tags.push(`<span class="score-tag" title="${esc(v.scores.label)}">${E.fmt(total)} pts</span>`);
    if (v.chipStart || player.chips) tags.push(`<span class="chip-tag" title="Chips">● ${E.fmt(player.chips)}</span>`);
    for (const def of v.counterDefs) tags.push(`<span class="counter-tag" title="${esc(def.name)}">${esc(def.name)} ${E.fmt(player.counters[def.id] ?? 0)}</span>`);
    if (player.team) tags.unshift(`<span class="team-tag" title="Team">${esc(player.team)}</span>`);
    if (player.bot) tags.unshift(`<span class="bot-tag" title="Bot: plays random legal cards on its turn">🤖</span>`);
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

  /** Seats around a central felt: you at the bottom, everyone else clockwise from your left. */
  function aroundHTML(v) {
    const players = v.players;
    const mine = mySeatId();
    const bottomIndex = Math.max(0, players.findIndex((player) => player.id === mine));
    const others = [...players.slice(bottomIndex + 1), ...players.slice(0, bottomIndex)];
    const k = others.length;
    const side = k >= 2 ? Math.max(1, Math.floor(k / 4)) : 0;
    const left = others.slice(0, side).reverse();
    const top = others.slice(side, k - side);
    const right = others.slice(k - side);
    const seat = (player) => seatHTML(player, players.indexOf(player));
    return `<div class="around">
        <div class="ar-top">${top.map(seat).join("")}</div>
        <div class="ar-left">${left.map(seat).join("")}</div>
        <div class="ar-center"><div class="ar-felt">
          <div class="area-label"><span>Table</span><button class="btn sm ghost" data-add-zone="table">+ Group</button><button class="btn sm ghost" data-act="add-player">+ Player</button></div>
          <div class="table-zones">${E.orderedZones(v, "table").map(zoneHTML).join("") || `<div class="muted small">No table groups yet.</div>`}</div>
        </div></div>
        <div class="ar-right">${right.map(seat).join("")}</div>
        <div class="ar-bottom">${players.length ? seat(players[bottomIndex]) : `<button class="btn primary" data-act="add-player">+ Add player</button>`}</div>
      </div>`;
  }

  function renderTable() {
    legalMap = computeLegal(orderedSelection());
    const v = view;
    evalCache = evaluateAll(v);
    const around = prefs.layout === "around" && window.innerWidth > 900 && v.players.length > 1;
    $("#around").hidden = !around;
    $$("#table > .table-section").forEach((el) => { el.hidden = around; });
    if (around) {
      $("#around").innerHTML = aroundHTML(v);
      $("#tableZones").innerHTML = "";
      $("#seats").innerHTML = "";
      return;
    }
    $("#around").innerHTML = "";
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
    const hasRules = Object.values(v.zones).some((zone) => zone.rule && Object.keys(zone.rule).length);
    if (hasRules) parts.push(`<button class="pill rules-pill mode-${esc(v.rulesMode)}" data-act="cycle-rules" title="Rule checks: ${esc(v.rulesMode)} (click to change)">§ ${esc(E.RULES_MODES[v.rulesMode] || "Warn")}</button>`);
    if (prefs.seed) parts.push(`<span class="pill round" title="Seeded shuffles: ${esc(prefs.seed)}">🌱</span>`);
    if (recorder.on) parts.unshift(`<button class="pill rec" data-act="rec-stop" title="Stop and save as an action">● Rec ${recorder.steps.length} · Stop</button>`);
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
    $("#reactBtn").hidden = net.mode === "local";
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
      ${tradeOwner(ids) ? `<button class="btn sm" data-sel="offer" title="Offer these cards to another player in a trade">🤝 Offer</button>` : ""}
      <button class="btn sm icon ghost" data-sel="clear" title="Clear selection (Esc)">✕</button>`;
    const plays = [...legalMap.entries()].filter(([, verdict]) => verdict.ok).slice(0, 3);
    bar.querySelector(".count").insertAdjacentHTML("afterend", plays.map(([zoneId], i) => `<button class="btn sm good" data-sel="play" data-to="${zoneId}" title="${i === 0 ? "Play (P or Enter)" : "Play"}">Play ▸ ${esc(v.zones[zoneId]?.name || "")}</button>`).join(""));
  }

  /** The seat that owns every selected card, if this screen may trade for it. */
  function tradeOwner(ids) {
    const v = view;
    if (!v || v.players.length < 2) return null;
    const owners = new Set(ids.map((id) => Object.values(v.zones).find((zone) => zone.cards.includes(id))?.area));
    if (owners.size !== 1) return null;
    const owner = [...owners][0];
    if (!v.players.some((player) => player.id === owner)) return null;
    return net.mode === "local" || owner === mySeatId() ? owner : null;
  }

  function openOfferDialog(ids) {
    const v = view;
    const owner = tradeOwner(ids);
    if (!owner) return;
    const others = v.players.filter((player) => player.id !== owner);
    openDialog(head(`Offer ${ids.length} card${ids.length === 1 ? "" : "s"}`) + `<div class="dlg-body">
        <div class="offer-cards">${ids.map((id) => cardHTML(v.cards[id], Object.values(v.zones).find((zone) => zone.cards.includes(id)), 0)).join("")}</div>
        <div class="grid-2">
          <label class="field"><span>To</span><select name="to">${others.map((player) => `<option value="${player.id}">${esc(player.name)}${player.bot ? " (bot)" : ""}</option>`).join("")}</select></label>
          <label class="field"><span>Cards they give back</span><input type="number" name="want" min="0" max="20" value="${Math.min(ids.length, 1)}"></label>
          <label class="field"><span>Chips <span class="dim">+ you add, − you ask for</span></span><input type="number" name="chips" value="0" step="10"></label>
          <label class="field"><span>Note <span class="dim">optional</span></span><input type="text" name="note" maxlength="80" placeholder="e.g. for any heart"></label>
        </div>
        <p class="hint">They see your cards and choose whether to accept. Nothing moves until they do; you can withdraw any time.</p>
      </div>
      <div class="dlg-foot"><button class="btn" value="cancel">Cancel</button><button class="btn primary" value="send">Send offer</button></div>`, {
      onSubmit(form) {
        dispatch({ type: "offerTrade", player: owner, to: form.to.value, cards: ids, want: Number(form.want.value) || 0, chips: Number(form.chips.value) || 0, note: form.note.value });
        selection.clear();
        render();
      },
    });
  }

  /** Open trade offers: the two traders (or everyone on a shared screen) can answer. */
  function renderOffers() {
    const box = $("#offers");
    const v = view;
    const me = mySeatId();
    const offers = (v?.offers || []).filter((offer) => net.mode === "local" || offer.from === me || offer.to === me);
    box.hidden = !offers.length;
    if (!offers.length) { box.innerHTML = ""; return; }
    const name = (id) => esc(v.players.find((player) => player.id === id)?.name || "?");
    box.innerHTML = offers.map((offer) => {
      const gives = [offer.show ? offer.show.map((text) => `<b class="mono">${esc(text)}</b>`).join(" ") : offer.count ? `${offer.count} card${offer.count === 1 ? "" : "s"}` : "", offer.chips > 0 ? `${E.fmt(offer.chips)} chips` : ""].filter(Boolean).join(" + ");
      const asks = [offer.want ? `${offer.want} card${offer.want === 1 ? "" : "s"}` : "", offer.chips < 0 ? `${E.fmt(-offer.chips)} chips` : ""].filter(Boolean).join(" + ") || "nothing";
      const canAnswer = net.mode === "local" || offer.to === me;
      const canWithdraw = net.mode === "local" || offer.from === me;
      return `<div class="offer" data-offer="${esc(offer.id)}"><span class="grow">🤝 <b>${name(offer.from)}</b> offers <b>${name(offer.to)}</b> ${gives} for ${asks}${offer.note ? ` <span class="dim">“${esc(offer.note)}”</span>` : ""}${canAnswer && offer.want ? ` <span class="dim">· select ${offer.want} of ${name(offer.to)}'s cards, then accept</span>` : ""}</span>
        ${canAnswer ? `<button class="btn sm good" data-offer-act="accept">Accept</button><button class="btn sm" data-offer-act="decline">Decline</button>` : ""}
        ${canWithdraw && !canAnswer ? `<button class="btn sm" data-offer-act="withdraw">Withdraw</button>` : ""}
        ${canWithdraw && net.mode === "local" ? `<button class="btn sm icon ghost" data-offer-act="withdraw" title="Withdraw">✕</button>` : ""}</div>`;
    }).join("");
  }

  function answerOffer(el) {
    const id = el.closest("[data-offer]").dataset.offer;
    const offer = view.offers?.find((entry) => entry.id === id);
    if (!offer) return;
    const act = el.dataset.offerAct;
    if (act === "decline") return dispatch({ type: "answerTrade", id, accept: false, player: offer.to });
    if (act === "withdraw") return dispatch({ type: "answerTrade", id, accept: false, player: offer.from });
    const back = orderedSelection().filter((cardId) => Object.values(view.zones).find((zone) => zone.cards.includes(cardId))?.area === offer.to);
    if (back.length !== offer.want) return toast(`Select ${offer.want} of ${view.players.find((player) => player.id === offer.to)?.name}'s cards to give back, then Accept.`, "warn");
    dispatch({ type: "answerTrade", id, accept: true, cards: back, player: offer.to });
    selection.clear();
    render();
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
    const backsBefore = new Map($$(".card[data-card-id]").map((el) => [el.dataset.cardId, el.classList.contains("back")]));
    applyDesignBack(view);
    renderTop();
    renderTable();
    if (prefs.motion && backsBefore.size) {
      // Hidden cards carry placeholder ids, so a card that just turned up face-up is new here too.
      $$(".card[data-card-id]").forEach((el) => {
        const was = backsBefore.get(el.dataset.cardId);
        const back = el.classList.contains("back");
        if ((was !== undefined && was !== back) || (was === undefined && !back)) el.classList.add("flip-in");
      });
    }
    fitRows();
    renderGameOver();
    renderOffers();
    renderSelectionBar();
    renderDock();
    if (scoreboardOpen && dialog().open && dialog().classList.contains("scoreboard-dialog")) {
      const body = dialog().querySelector(".scoreboard");
      if (body) { const scroll = body.scrollTop; openScoreboard(); dialog().querySelector(".scoreboard").scrollTop = scroll; }
    } else scoreboardOpen = false;
    renderPane();
    playLayout(before);
    scheduleBots();
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
    // A modal dialog sits in the top layer, so menus opened from one must live inside it.
    (dialog().open ? dialog() : document.body).appendChild(menu);
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
      { label: "Edit group, rules & scoring…", run: () => openZoneDialog(zoneId) },
      { label: "Browse cards…", run: () => openBrowseDialog(zoneId) },
      ...(net.mode !== "local" ? [{ label: "📍 Ping for everyone", run: () => emit({ kind: "ping", zone: zoneId }) }] : []),
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
    if (card.visible) items.push({ label: "Inspect (I)", run: () => inspectCard(cardId) });
    if (card.visible && !card.faceUp) {
      const others = view.players.filter((player) => player.id !== mySeatId());
      if (others.length) items.push({ label: "Show to…", run: () => showMenu(point, [{ heading: "Show only to" }, ...others.map((player) => ({ label: player.name, sw: player.color, run: () => dispatch({ type: "showTo", cards: ids, player: player.id }) }))]) });
    }
    if (net.mode !== "local") items.push({ label: "📍 Ping for everyone", run: () => emit({ kind: "ping", card: cardId, zone: E.zoneOf(view, cardId)?.id || null }) });
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
      { label: player.bot ? "Make human" : "🤖 Make a bot", run: () => dispatch({ type: "updatePlayer", player: playerId, patch: { bot: !player.bot } }) },
      { label: "Set team…", run: () => { const team = prompt("Team name (blank for none)", player.team || ""); if (team !== null) dispatch({ type: "updatePlayer", player: playerId, patch: { team } }); } },
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
  let hoverCard = null;
  let kbdFocus = null;
  let lastClicked = null;

  /** Arrow keys walk through your hand (or the current player's); Space selects. */
  function moveKbdFocus(step) {
    const zoneId = myHandZone();
    const cards = zoneId ? view.zones[zoneId]?.cards || [] : [];
    if (!cards.length) return;
    const at = cards.indexOf(kbdFocus);
    kbdFocus = cards[at < 0 ? (step > 0 ? 0 : cards.length - 1) : (at + step + cards.length) % cards.length];
    render();
    document.querySelector(`.card[data-card-id="${CSS.escape(kbdFocus)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

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
    if (event.pointerType === "touch") {
      // Long-press a card to inspect it.
      const pending = drag;
      pending.press = setTimeout(() => {
        if (drag !== pending || pending.started) return;
        drag = null;
        suppressClick = performance.now() + 500;
        inspectCard(pending.id);
      }, 520);
    }
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
    applyLegalClasses(computeLegal(ids));
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
      clearTimeout(drag.press);
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
    clearTimeout(d.press);
    if (!d.started) return;
    suppressClick = performance.now() + 250;
    d.ghost.remove();
    applyLegalClasses(legalMap);
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
    clearTimeout(drag.press);
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

  function botsHTML(v) {
    const count = v.players.filter((player) => player.bot).length;
    const speed = prefs.botSpeed || "normal";
    const style = prefs.botStyle || "random";
    return `<div class="row tight">
        <button class="btn sm" data-act="bot-turn" title="Make a legal play for whoever's turn it is">🤖 Auto-play this turn</button>
        <button class="btn sm" data-act="hint" title="What would the smart bot play? (H)">💡 Hint</button>
        ${count ? `<button class="btn sm${bots.paused ? " primary" : ""}" data-act="bots-pause">${bots.paused ? "Resume bots" : "Pause bots"}</button>` : ""}
      </div>
      <div class="grid-2">
        <label class="field"><span>If a bot can't play</span><select data-bot-fallback>${[["", "Pass the turn"], ...v.macros.map((macro) => [macro.id, macro.label])].map(([id, label]) => `<option value="${esc(id)}"${(v.botFallback || "") === id ? " selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
        <label class="check" style="grid-column:1/-1"><input type="checkbox" data-must-play${v.mustPlay ? " checked" : ""}> Players must play if they can before using the “can't play” action</label>
        <label class="check" style="grid-column:1/-1" title="No turns: bots play whenever they can, and when nobody can move a bot runs the “can't play” action. Give piles the play rule “Any player, any time”."><input type="checkbox" data-realtime${v.realtime ? " checked" : ""}> Real time: everyone plays at once (Speed, Spit, Nertz)</label>
        <label class="field"><span>Each turn a bot plays</span><select data-plays-per-turn><option value="1"${v.playsPerTurn !== 0 ? " selected" : ""}>One card</option><option value="0"${v.playsPerTurn === 0 ? " selected" : ""}>Until it's stuck</option></select></label>
        <label class="field"><span>Bots play</span><select data-bot-style>${Object.entries(E.BOT_STYLES).map(([id, label]) => `<option value="${id}"${style === id ? " selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
      </div>
      <div class="field"><span>Speed</span><div class="seg">${["slow", "normal", "fast"].map((id) => `<button data-act="bot-speed" data-speed="${id}" class="${speed === id ? "on" : ""}">${id}</button>`).join("")}</div></div>
      <p class="hint">${count ? `${count} bot${count === 1 ? "" : "s"} at the table.` : "Make any seat a bot from the Players tab or its name menu."} Bots play legal cards from their hand to groups with play rules. Smart bots duck or win tricks, shed their most costly cards and build the best hand; give seats different styles in the Players tab and compare them with Tools → Bot games.</p>`;
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
      const macros = v.macros.map((macro, i) => `<button class="macro" data-act="macro" data-id="${macro.id}" title="${esc(macro.hint || macro.steps.map((step) => E.describeStep(step, v)).join(" → "))}">
          ${esc(macro.label)}${i < 9 ? `<kbd>${i + 1}</kbd>` : ""}
          <small>${esc(macro.hint || macro.steps.map((step) => E.describeStep(step, v)).join(" → "))}</small>
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
        + block("Actions", `<div class="macro-grid">${macros}</div>${v.macros.length ? "" : `<p class="hint">Actions are one-tap macros: shuffle, deal, flip, collect, pass turn… Build your game's flow here.</p>`}`, `<button class="btn sm" data-act="${recorder.on ? "rec-stop" : "rec-start"}" title="Record moves you make as a new action">${recorder.on ? "■ Stop" : "● Record"}</button><button class="btn sm" data-act="new-macro">+ New action</button>`)
        + block("Deal", quick)
        + block("Bots", botsHTML(v))
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
      const settings = `<div class="grid-2">
          <label class="field"><span>Label</span><input type="text" value="${esc(v.scores.label)}" data-cfg="label" data-fk="cfg-label"></label>
          <label class="field"><span>Winner</span><select data-cfg="lowWins" data-fk="cfg-low"><option value="0">Highest total</option><option value="1"${v.scores.lowWins ? " selected" : ""}>Lowest total</option></select></label>
          <label class="field"><span>Game ends at</span><input type="number" min="0" value="${target || ""}" placeholder="no target" data-cfg="target" data-fk="cfg-target"></label>
          <label class="field"><span>Or after rounds</span><input type="number" min="0" value="${v.scores.maxRounds || ""}" placeholder="no limit" data-cfg="maxRounds" data-fk="cfg-rounds"></label>
        </div>
        <p class="hint">When either end condition is met, the game ends and the result is recorded for playtest stats.</p>
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
      const custom = `<div class="list">${v.schemes.map((scheme) => `<div class="list-row"><span class="grow small"><b>${esc(scheme.name)}</b><br><span class="muted">${esc(E.describeScheme(scheme))}</span></span><button class="btn sm" data-act="edit-scheme" data-id="${scheme.id}">Edit</button></div>`).join("") || `<p class="hint">Define card values, suit bonuses, specific cards (Q♠ = 13), and set, run and flush bonuses. Attach them to groups as badges, and add them up with the “Score groups” action step.</p>`}</div>
        <div class="row"><button class="btn sm" data-act="new-scheme">+ New scoring rule</button></div>`;
      const teamNames = Array.from(new Set(v.players.map((player) => player.team).filter(Boolean)));
      const teamTotals = teamNames.map((team) => [team, v.players.filter((player) => player.team === team).reduce((sum, player) => sum + (totals[player.id] || 0), 0), v.players.filter((player) => player.team === team)]);
      const bestTeam = teamTotals.length ? (v.scores.lowWins ? Math.min : Math.max)(...teamTotals.map(([, total]) => total)) : null;
      const teams = teamTotals.map(([team, total, members]) => `<div class="list-row"><span class="grow small"><b>${esc(team)}</b> <span class="muted">${members.map((member) => esc(member.name)).join(" & ")}</span></span><strong class="mono" style="${total === bestTeam ? "color:var(--gold)" : ""}">${E.fmt(total)}</strong></div>`).join("");
      return block("Quick score", quick + race, `<button class="btn sm" data-act="scoreboard" title="Big scoreboard for the table">⛶ Scoreboard</button>`)
        + (teams ? block("Teams", `<div class="list">${teams}</div><p class="hint">Team totals add up each member's score. Set teams in the Players tab.</p>`) : "")
        + tableTalkHTML(v)
        + block("Score sheet", scoreChartHTML(v) + sheet)
        + block("End of game", settings)
        + block("Custom scoring", custom)
        + block("Playtest results", resultsHTML(v))
        + block("Chips & pot", v.chipStart || v.pot || v.players.some((player) => player.chips) ? chips : `<p class="hint">No chips in this game. Give everyone a stack to track bets, antes and pots.</p>
          <div class="row tight"><input id="chipStart" type="number" min="1" value="100" style="width:90px"><button class="btn sm primary" data-act="enable-chips">Enable chips</button></div>`)
        + block("Counters & trackers", counters);
    },

    seats() {
      const v = view;
      const rows = v.players.map((player, i) => `<div class="list-row" style="--c:${esc(player.color)}">
          <input type="color" value="${esc(player.color)}" data-player-color="${player.id}" title="Color">
          <div class="grow player-fields"><input type="text" value="${esc(player.name)}" data-player-name="${player.id}" data-fk="pn-${player.id}"><input type="text" value="${esc(player.team || "")}" data-player-team="${player.id}" data-fk="pt-${player.id}" placeholder="team" title="Team" maxlength="16"></div>
          <button class="btn sm icon${i === v.turn.dealer ? " primary" : ""}" data-act="set-dealer" data-index="${i}" title="Dealer">D</button>
          <button class="btn sm icon${i === v.turn.index ? " primary" : ""}" data-act="set-turn" data-index="${i}" title="Current turn">▶</button>
          <button class="btn sm icon" data-act="player-up" data-player="${player.id}" title="Move up" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="btn sm icon${player.out ? " danger" : ""}" data-act="player-out" data-player="${player.id}" title="${player.out ? "Sitting out" : "Sit out"}">⏸</button>
          <button class="btn sm icon${player.bot ? " primary" : ""}" data-act="toggle-bot" data-player="${player.id}" title="${player.bot ? "Bot (click for human)" : "Make a bot"}">🤖</button>
          ${player.bot ? `<select class="bot-style" data-bot-seat="${player.id}" title="How this bot plays"><option value="">Table default</option>${Object.entries(E.BOT_STYLES).map(([id, label]) => `<option value="${id}"${player.botStyle === id ? " selected" : ""}>${esc(label)}</option>`).join("")}</select>` : ""}
          <button class="btn sm icon ghost" data-act="remove-player" data-player="${player.id}" title="Remove">✕</button>
        </div>`).join("");
      const tpl = v.seatTemplate.map((entry) => `<div class="list-row">
          <span class="grow small"><b>${esc(entry.name)}</b> <span class="dim">· ${esc(entry.layout)} · ${esc(entry.visibility)}${entry.evals?.length ? " · " + entry.evals.map((spec) => evalDef(parseSpec(spec).id, v)?.short || spec).join(", ") : ""}</span></span>
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
        <div class="field"><span>Card back <span class="dim">blank = your display setting</span></span>
          <div class="row tight"><input type="color" value="${esc(draft.back?.color || "#2b57c2")}" data-deck-back="color" title="Back color"${draft.back?.color ? "" : ' style="opacity:.5"'}><input type="text" value="${esc(draft.back?.text || "")}" maxlength="14" placeholder="Name on the back" data-deck-back="text" class="grow" style="flex:1;width:auto">${draft.back?.color || draft.back?.text ? `<button class="btn sm ghost" data-act="back-clear">Clear</button>` : ""}</div></div>
        <datalist id="homeGroups">${E.orderedZones(v, "table").map((zone) => `<option value="${esc(zone.key || zone.name)}">`).join("")}</datalist>
        <details class="field custom-cards"${draft.custom.length <= 6 || customOpen ? " open" : ""}><summary><span>Custom cards <span class="dim">${draft.custom.length} type${draft.custom.length === 1 ? "" : "s"}, ${draft.custom.reduce((sum, item) => sum + item.count, 0)} cards</span></span></summary>
          <p class="hint">Suit and rank drive play rules (match suit or rank; numeric ranks can build up or down). Points feed custom scoring.</p>
          <div class="list">${draft.custom.map((item, i) => `<div class="custom-row">
              <div class="card-preview">${cardHTML({ id: "preview-" + i, custom: true, visible: true, faceUp: true, label: item.label, text: item.text, color: item.color, value: item.value, icon: item.icon, image: item.image, suit: item.suit || "x", rank: item.rank || item.label }, { id: "preview", visibility: "public" }, i)}</div>
              <input type="color" value="${esc(item.color)}" data-custom="${i}" data-k="color" title="Card color">
              <input type="text" value="${esc(item.label)}" placeholder="Name" class="grow" data-custom="${i}" data-k="label" title="Printed name">
              <input type="text" value="${esc(item.icon || "")}" placeholder="Icon" maxlength="4" style="width:54px" data-custom="${i}" data-k="icon" title="Emoji or symbol shown large">
              <input type="number" min="1" max="20" value="${item.count}" style="width:54px" data-custom="${i}" data-k="count" title="Copies">
              <button class="btn sm icon ghost" data-act="custom-del" data-i="${i}" title="Remove">✕</button>
              <input type="text" value="${esc(item.suit || "")}" placeholder="Suit / color" style="width:100px" data-custom="${i}" data-k="suit" title="Suit, used by rules">
              <input type="text" value="${esc(item.rank || "")}" placeholder="Rank" style="width:70px" data-custom="${i}" data-k="rank" title="Rank, used by rules (numbers can be ordered)">
              <input type="number" value="${item.value}" placeholder="pts" style="width:62px" data-custom="${i}" data-k="value" title="Points">
              <input type="text" value="${esc(item.text)}" placeholder="Rules text" style="flex:1 1 60%" data-custom="${i}" data-k="text">
              <input type="url" value="${esc(item.image || "")}" placeholder="Art image https://… (optional)" style="flex:1 1 30%" data-custom="${i}" data-k="image" title="An https link to card art">
              <input type="text" value="${esc(item.home || "")}" list="homeGroups" placeholder="Starts in (deck)" style="width:120px" data-custom="${i}" data-k="home" title="A table group these cards start in, e.g. a market pile">
            </div>`).join("")}</div>
          <div class="row tight"><button class="btn sm" data-act="custom-add">+ Custom card</button><button class="btn sm" data-act="custom-import">Import from spreadsheet…</button>${draft.custom.length ? `<button class="btn sm" data-act="custom-export">Export CSV</button>` : ""}</div>
        </details>
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
      const scenario = `<div class="row tight"><input id="pullSpecs" type="text" placeholder="As Kd 10h, or custom card names" class="grow" style="flex:1;width:auto" data-fk="pull"></div>
        <div class="row tight"><select id="pullTo" style="width:auto;max-width:160px">${zoneOptions(E.orderedZones(v, "table").find((zone) => zone.kind === "board")?.id || "")}</select>
          <select id="pullFace" style="width:auto"><option value="">Group default</option><option value="up">Face up</option><option value="down">Face down</option></select>
          <button class="btn sm primary" data-act="pull-cards">Put them there</button></div>
        <p class="hint">Pulls those exact cards from the deck (or wherever they are), so you can test a specific situation.</p>`;
      const printBlock = `<div class="row tight"><button class="btn sm" data-act="print-cards">${spec.custom.length ? "Print custom cards & rules" : "Print deck & rules"}</button>${spec.custom.length ? `<button class="btn sm" data-act="print-all">Include standard cards</button>` : ""}</div>
        <p class="hint">Opens a printable sheet at poker size (63 × 88 mm), with the rules document on its own page, for paper playtests.</p>`;
      const customUnseen = new Map();
      const typeKey = (label, suit) => `${label}|${suit && suit !== "x" ? suit : ""}`;
      for (const item of spec.custom) {
        const entry = customUnseen.get(typeKey(item.label, item.suit)) || { item, total: 0, seen: 0 };
        entry.total += item.count;
        customUnseen.set(typeKey(item.label, item.suit), entry);
      }
      for (const card of Object.values(v.cards)) {
        const entry = card.custom && card.visible ? customUnseen.get(typeKey(card.label, card.suit)) : null;
        if (entry) entry.seen += 1;
      }
      const customRows = Array.from(customUnseen.values()).map(({ item, total, seen }) => `<span class="unseen-chip" style="--cc:${esc(item.color)}" title="${esc(item.suit || "")}">${esc(item.label)}${item.suit ? ` <i>${esc(item.suit)}</i>` : ""} <b>${total - seen}</b>/${total}</span>`).join("");
      return block("Deck builder", builder)
        + (customRows ? block("Unseen custom cards", `<div class="unseen-chips">${customRows}</div><p class="hint">Copies you can't see from your seat, out of each type's total.</p>`) : "")
        + block("Set up a scenario", scenario)
        + block("Print & play", printBlock)
        + block("Unseen cards", `<div class="small muted">From your point of view: ${N} unseen · ${Object.keys(v.cards).length} in play</div>${grid}`)
        + block("Next card odds", `<div class="list">${bars}</div>`)
        + block("Outs calculator", calc)
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
        <label class="check"><input type="checkbox" data-pref-bool="motion"${prefs.motion ? " checked" : ""}> Animations</label>
        <label class="check"><input type="checkbox" data-pref-bool="jumbo"${prefs.jumbo ? " checked" : ""}> Jumbo indexes (easier to read on phones)</label>
        <label class="check"><input type="checkbox" data-pref-bool="sound"${prefs.sound ? " checked" : ""}> Sound effects</label>
        <label class="check"><input type="checkbox" data-pref-bool="contrast"${prefs.contrast ? " checked" : ""}> High contrast</label>
        <div class="field"><span>Seats</span><div class="seg">${[["grid", "Grid"], ["around", "Around the table"]].map(([id, label]) => `<button data-pref="layout" data-val="${id}" class="${(prefs.layout || "grid") === id ? "on" : ""}">${label}</button>`).join("")}</div></div>`;
      const seedBlock = `<div class="row tight"><input id="seedInput" type="text" value="${esc(prefs.seed || "")}" placeholder="any word or number" class="grow" style="flex:1;width:auto" data-fk="seed"><button class="btn sm primary" data-act="seed-apply">Use seed</button>${prefs.seed ? `<button class="btn sm" data-act="seed-clear">Random</button>` : ""}</div>
        <p class="hint">${prefs.seed ? `Shuffles follow seed <b>${esc(prefs.seed)}</b>. The same actions in the same order give the same deals, so a tricky situation can be replayed.` : "Set a seed to make shuffles repeatable, so a deal can be replayed exactly."}</p>`;
      return block("Deal simulator", simulatorHTML(v))
        + block("Bot games", botGamesHTML(v))
        + block("Dice & randomness", diceBlock)
        + block("Seeded shuffles", seedBlock)
        + block("Pacing", pacingHTML(v))
        + block("Turn timer", timerBlock)
        + block("Equity calculator", equityBlock)
        + block("Display", display)
        + block("Developer", `<p class="hint">The whole table is one JSON object. Copy it for bug reports or version control, or paste a table or game design to load it.</p>
            <div class="row tight"><button class="btn sm" data-act="dev-copy">Copy table JSON</button><span class="small dim">${Object.keys(v.cards).length} cards · ${Object.keys(v.zones).length} groups · ${JSON.stringify(v).length.toLocaleString()} bytes</span></div>
            <textarea id="devJson" data-fk="dev" placeholder="Paste table or design JSON here" style="min-height:80px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px"></textarea>
            <div class="row"><button class="btn sm" data-act="dev-load">Load pasted JSON</button></div>`);
    },

    log() {
      const v = view;
      const filters = [["all", "All"], ["chat", "Chat"], ["feedback", "Feedback"], ["warn", "Rules"], ["score", "Scores"], ["macro", "Actions"]];
      const keep = (entry) => logFilter === "all" || entry.kind === logFilter || (logFilter === "score" && entry.kind === "chips") || (logFilter === "macro" && entry.kind === "round");
      const items = v.log.slice().reverse().filter(keep).map((entry) => {
        const t = new Date(entry.t);
        return `<div class="log-item k-${esc(entry.kind)}"><time>${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}</time><div>${entry.who ? `<b>${esc(entry.who)}</b> ` : ""}<span>${esc(entry.text)}</span></div></div>`;
      }).join("");
      const rewind = net.mode !== "client" && history.length ? history.slice(-12).map((snap, i, list) => {
        const steps = list.length - i;
        const last = snap.log[snap.log.length - 1];
        return `<div class="list-row"><span class="grow small">${last ? `${last.who ? `<b>${esc(last.who)}</b> ` : ""}${esc(last.text)}` : "Start"}</span><button class="btn sm" data-act="rewind" data-steps="${steps}" title="Undo ${steps} step${steps === 1 ? "" : "s"}">↶ ${steps}</button></div>`;
      }).reverse().join("") : "";
      return block("Table chat", `<div class="row tight"><input id="chatInput" type="text" placeholder="Say something or note a ruling…" class="grow" style="flex:1;width:auto" data-fk="chat"><button class="btn sm primary" data-act="chat">Send</button></div>`)
        + (rewind ? block("Rewind & replay", `<div class="row tight"><button class="btn sm primary" data-act="replay">⏵ Replay the last ${history.length} step${history.length === 1 ? "" : "s"}</button></div><details><summary class="small muted" style="cursor:pointer">Or jump straight back to a moment</summary><div class="list" style="margin-top:8px">${rewind}</div></details>`) : "")
        + block("Playtest feedback", `<div class="row tight"><input id="feedbackInput" type="text" placeholder="What felt slow, confusing or fun?" class="grow" style="flex:1;width:auto" data-fk="feedback"><button class="btn sm" data-act="feedback">Add</button></div><p class="hint">Feedback notes go in the log for everyone, and export with it.</p>`)
        + `<div class="row tight"><div class="phase-chips">${filters.map(([id, label]) => `<button data-act="log-filter" data-filter="${id}" class="${logFilter === id ? "on" : ""}">${label}</button>`).join("")}</div><span class="grow"></span><button class="btn sm" data-act="export-log">Export</button></div>
          <div class="log">${items || `<p class="hint">Nothing here yet.</p>`}</div>`;
    },

    rules() {
      const v = view;
      const saves = load(STORE.saves, []);
      const library = loadLibrary();
      const linked = v.designId ? library.find((entry) => entry.id === v.designId) : null;
      const mode = v.rulesMode || "warn";
      const preview = prefs.rulesView === "preview";
      const doc = `<div class="row tight">
          <div class="seg"><button data-act="rules-view" data-view="edit" class="${preview ? "" : "on"}">Edit</button><button data-act="rules-view" data-view="preview" class="${preview ? "on" : ""}">Preview</button></div>
          <span class="grow"></span>
          <button class="btn sm" data-act="rules-template" title="Insert an outline for a rules document">Template</button>
          <button class="btn sm" data-act="rules-generate" title="Write the rules from this table's setup">Generate from table</button>
          <button class="btn sm icon" data-act="rules-copy" title="Copy the rules document">⧉</button>
          <button class="btn sm icon" data-act="rules-download" title="Download as Markdown">⤓</button>
        </div>
        ${preview ? `<div class="rules-preview">${renderMarkdown(v.notes)}</div>` : `<textarea class="rules-area" id="rulesText" data-fk="rules" placeholder="Write the rules of the game you're designing. Markdown works: # headings, - lists, **bold**.">${esc(v.notes)}</textarea>`}
        <p class="hint">Shared with everyone at the table and saved with the design. Saved when you click away.</p>`;
      const ruled = [...E.orderedZones(v, "table"), ...v.seatTemplate.map((tpl) => ({ ...tpl, seat: true }))].filter((zone) => E.describeRule(zone.rule || {}, zone));
      const checks = `<div class="seg">${Object.entries(E.RULES_MODES).map(([id, label]) => `<button data-act="rules-mode" data-mode="${id}" class="${mode === id ? "on" : ""}">${label}</button>`).join("")}</div>
        <p class="hint">${{ off: "Rules are ignored: move anything anywhere.", warn: "Illegal plays go through but are flagged, which is ideal for playtesting.", enforce: "Illegal plays are refused." }[mode]} X-ray view is referee mode and skips checks.</p>
        <div class="list">${ruled.map((zone) => `<div class="list-row"><span class="grow small"><b>${esc(zone.name)}</b>${zone.seat ? ' <span class="dim">(every seat)</span>' : ""}<br><span class="muted">${esc(E.describeRule(zone.rule, zone))}</span></span><button class="btn sm" data-act="edit-zone-rules" data-zone="${esc(zone.seat ? "seat:" + zone.key : zone.id)}">Edit</button></div>`).join("") || `<p class="hint">No group has play rules yet. Open a group's ⋯ → Edit group, rules & scoring to add them: whose turn, follow suit, match suit or rank, build up or down, wild cards…</p>`}</div>`;
      const triggers = `<div class="list">${v.triggers.map((trigger) => `<div class="list-row${trigger.off ? " is-off" : ""}">
          <input type="checkbox" data-trigger-toggle="${trigger.id}"${trigger.off ? "" : " checked"} title="Enabled" aria-label="Enabled">
          <span class="grow small">${esc(trigger.label || E.describeTrigger(trigger, v))} <span class="muted">→ ${esc(E.findMacro(v, trigger.macro)?.label || "missing action")}</span></span>
          <button class="btn sm" data-act="edit-trigger" data-id="${trigger.id}">Edit</button>
        </div>`).join("") || `<p class="hint">Triggers run an action on their own: take the trick when everyone has played, reshuffle when the deck runs out, score when a hand empties.</p>`}</div>
        <div class="row"><button class="btn sm" data-act="new-trigger">+ New trigger</button></div>`;
      const meta = v.meta || {};
      const info = `<div class="grid-2">
          <label class="field"><span>Family</span><input type="text" data-meta="family" data-fk="meta-family" value="${esc(meta.family || "")}" maxlength="24" placeholder="e.g. Trick-taking"></label>
          <label class="field"><span>Tagline</span><input type="text" data-meta="tagline" data-fk="meta-tagline" value="${esc(meta.tagline || "")}" maxlength="90" placeholder="A one-line pitch"></label>
          <label class="field"><span>Fewest players</span><input type="number" data-meta="min" data-fk="meta-min" min="1" max="12" value="${meta.players?.min || 1}"></label>
          <label class="field"><span>Most players</span><input type="number" data-meta="max" data-fk="meta-max" min="1" max="12" value="${meta.players?.max || 12}"></label>
        </div>
        <label class="field"><span>Description</span><textarea data-meta="description" data-fk="meta-desc" style="min-height:64px" maxlength="400">${esc(meta.description || "")}</textarea></label>`;
      const design = `<p class="hint">${linked ? `This table is <b>${esc(linked.name)}</b> from My games${linked.versions?.length ? `, with ${linked.versions.length} earlier version${linked.versions.length === 1 ? "" : "s"}` : ""}.` : "Save everything (groups, rules, actions, triggers, scoring, deck and the rules document) as a reusable game."}</p>
        <div class="row">
          <button class="btn primary" data-act="save-preset">${linked ? "Save changes" : "Save to My games"}</button>
          ${linked ? `<button class="btn" data-act="save-preset-new">Save as new</button><button class="btn" data-act="design-diff">What changed?</button>` : ""}
          <button class="btn" data-act="open-library">My games (${library.length})</button>
        </div>
        <div class="row tight"><button class="btn sm" data-act="share-design">Share link</button><button class="btn sm" data-act="export-preset">Export file</button><button class="btn sm" data-act="import">Import…</button></div>`;
      const snapshots = `<div class="list">${saves.map((entry, i) => `<div class="list-row"><span class="grow small"><b>${esc(entry.name)}</b> <span class="dim">${new Date(entry.t).toLocaleString()}</span></span><button class="btn sm" data-act="load-save" data-i="${i}">Load</button><button class="btn sm icon ghost" data-act="del-save" data-i="${i}">✕</button></div>`).join("") || `<p class="hint">Snapshots of the whole table (cards in place, scores and all).</p>`}</div>
          <div class="row"><button class="btn" data-act="save-table">Save snapshot</button><button class="btn" data-act="export-table">Export file</button><button class="btn" data-act="share-table" title="A link holding the whole table, hidden cards included">Share link</button></div>`;
      return block("Design check", designCheckHTML(v))
        + block("Rules document", doc)
        + block("Rule checks", checks)
        + block("Automation", triggers)
        + block("Game design", design)
        + block("Game info", info)
        + block("Saved tables", snapshots);
    },
  };

  const quickDeal = { count: 1, face: "" };
  let logFilter = "all";
  let customOpen = false;
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
    const minis = { Poker: ["A♠", "K♥", "b"], Casino: ["A♦", "K♠", "b"], Cribbage: ["5♥", "5♣", "J♦"], Rummy: ["7♠", "8♠", "9♠"], "Trick-taking": ["Q♠", "A♥", "b"], Shedding: ["8♣", "8♥", "b"], Kids: ["K♣", "2♦", "b"], Solitaire: ["K♥", "Q♠", "J♥"], Freeform: ["b", "A♣", "b"], Drafting: ["b", "Q♥", "b"], "Draw & discard": ["b", "K♣", "2♥"], "Deck-building": ["●", "🏰", "b"], Climbing: ["9♠", "9♥", "K♣"], Custom: ["★", "b", "b"] }[preset.family] || ["★", "b", "b"];
    return `<button type="button" class="preset${preset.id === selectedId ? " on" : ""}" data-preset="${esc(preset.id)}" data-search="${esc(`${preset.name} ${preset.family} ${preset.tagline || ""} ${preset.description || ""}`.toLowerCase())}">
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

  let presetQuery = "";
  function openNewGame() {
    let selected = state?.presetId && allPresets().some((p) => p.id === state.presetId) ? state.presetId : "holdem";
    const draw = () => {
      const presets = allPresets();
      const families = Array.from(new Set(presets.map((p) => p.family)));
      const preset = presets.find((p) => p.id === selected) || presets[0];
      const range = preset.players || { min: 1, max: 12, default: 2 };
      const count = Math.max(range.min, Math.min(range.max, state?.players.length || range.default));
      return head("New game") + `<div class="dlg-body">
          <input type="search" class="preset-search" placeholder="Search ${presets.length} games: name, family, idea…" aria-label="Search games" value="${esc(presetQuery)}">
          ${families.map((family) => `<div class="preset-family"><div class="area-label" style="color:var(--muted)">${esc(family)}</div><div class="preset-grid">${presets.filter((p) => p.family === family).map((p) => presetCard(p, selected)).join("")}</div></div>`).join("")}
        </div>
        <div class="dlg-foot">
          <span class="grow small muted">${esc(preset.description || "")}</span>
          <label class="row tight small">Players <input name="players" type="number" min="${range.min}" max="${range.max}" value="${count}" style="width:64px"></label>
          <label class="check small"><input type="checkbox" name="keepNames" ${state?.players.length ? "checked" : ""}> Keep names</label>
          <button type="button" class="btn" data-wizard>✨ Design your own…</button>
          <button class="btn" value="cancel">Cancel</button>
          <button class="btn primary" value="start">Start ${esc(preset.name)}</button>
        </div>`;
    };
    const filter = (form) => {
      const words = presetQuery.toLowerCase().split(/\s+/).filter(Boolean);
      $$("[data-preset]", form).forEach((el) => { el.hidden = !words.every((word) => el.dataset.search.includes(word)); });
      $$(".preset-family", form).forEach((el) => { el.hidden = !$$("[data-preset]:not([hidden])", el).length; });
    };
    const bind = (form) => {
      filter(form);
      form.addEventListener("input", (event) => {
        if (!event.target.classList.contains("preset-search")) return;
        presetQuery = event.target.value;
        filter(form);
      });
      form.addEventListener("click", (event) => {
        if (event.target.closest("[data-wizard]")) { openWizard(); return; }
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
          filter(form);
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
        if (!load(STORE.toured, false) && !navigator.webdriver) setTimeout(startTour, 450);
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
    const pickable = V.EVALUATORS.filter((def) => !def.hidden);
    const groups = Array.from(new Set(pickable.map((def) => def.group)));
    const schemes = v.schemes || [];
    const rule = z.rule || {};
    const optionList = (map, value) => Object.entries(map).map(([id, label]) => `<option value="${id}"${(value || "") === id || (!value && (id === "any" || id === "anyone" || id === "none")) ? " selected" : ""}>${esc(label)}</option>`).join("");
    const tableZones = E.orderedZones(v, "table");
    const sel = (name, list, value) => `<select name="${name}">${list.map(([id, label]) => `<option value="${id}"${value === id ? " selected" : ""}>${esc(label)}</option>`).join("")}</select>`;
    const areaSelect = creating ? `<label class="field"><span>Where</span><select name="area">
        <option value="table"${area === "table" ? " selected" : ""}>On the table (shared)</option>
        <option value="seats"${area === "seats" ? " selected" : ""}>At every seat</option>
        ${v.players.map((player) => `<option value="${player.id}"${area === player.id ? " selected" : ""}>Only ${esc(player.name)}'s seat</option>`).join("")}
      </select></label>` : "";
    const html = head(creating ? "New group" : `Edit “${z.name}”`) + `<div class="dlg-body">
        ${creating ? `<div class="tpl-chips"><span class="small muted">Start from</span>${Object.entries(ZONE_TEMPLATES).map(([id, tpl]) => `<button type="button" class="chip" data-ztpl="${id}">${esc(tpl.label)}</button>`).join("")}</div>` : ""}
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
          <div class="eval-picker">${groups.map((group) => `<h4>${esc(group)}</h4>${pickable.filter((def) => def.group === group).map((def) => `<label><input type="checkbox" name="eval" value="${def.id}"${selectedEvals.has(def.id) ? " checked" : ""}><span>${esc(def.label)}<small>${esc(def.description || "")}</small></span></label>`).join("")}`).join("")}
            <h4>Your scoring rules</h4>
            ${schemes.map((scheme) => `<label><input type="checkbox" name="eval" value="points:${esc(scheme.id)}"${selectedEvals.has("points:" + scheme.id) ? " checked" : ""}><span>${esc(scheme.name)}<small>${esc(E.describeScheme(scheme))}</small></span></label>`).join("") || `<p class="hint" style="grid-column:1/-1">Build point values, set and run bonuses in Scores → Custom scoring, then attach them here.</p>`}
          </div>
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
          <label class="check"><input type="checkbox" name="topOnly"${z.ctx.topOnly ? " checked" : ""}> Score only the top card</label>
        </div>
        <div class="field rules-box"><span>Play rules <span class="dim">judged when a player moves cards here; the Rules tab switches checks off, to warnings, or enforced</span></span>
          <div class="grid-3">
            <label class="field"><span>Who may play here</span><select name="rPlace">${optionList(E.RULE_WHO, rule.place)}</select></label>
            <label class="field"><span>Who may take from here</span><select name="rTake">${optionList(E.RULE_WHO, rule.take)}</select></label>
            <label class="field"><span>A card played must</span><select name="rAccept">${optionList(E.RULE_ACCEPT, rule.accept)}</select></label>
            <label class="field"><span>Rank order</span><select name="rOrder">${optionList(E.RULE_ORDER, rule.order)}</select></label>
            <label class="field"><span>Empty group starts with</span><input type="text" name="rFirst" value="${esc(rule.first || "")}" maxlength="8" placeholder="any card (e.g. A, K)"></label>
            <label class="field"><span>Wild ranks</span><input type="text" name="rWild" value="${esc((rule.wild || []).join(", "))}" placeholder="e.g. 8, or Wild"></label>
            <label class="field"><span>The group must form</span><select name="rMeld">${optionList(E.RULE_MELD, rule.meld)}</select></label>
            <label class="field"><span>Taking a card costs <span class="dim">its value in a counter</span></span><input type="text" name="rCost" list="ruleCounters" value="${esc(rule.cost || "")}" placeholder="e.g. Coins"><datalist id="ruleCounters">${[...v.counterDefs, ...v.tableCounters].map((def) => `<option value="${esc(def.name)}">`).join("")}</datalist></label>
            <label class="field"><span>Bluffing <span class="dim">claims anyone can call</span></span><select name="rClaim">${optionList(E.RULE_CLAIM, rule.claim)}</select></label>
            <label class="field"><span>Slap the pile when <span class="dim">real-time, first slap wins it</span></span><select name="rSlap">${optionList(E.RULE_SLAP, rule.slap)}</select></label>
            <label class="field"><span>Slapped pile goes to <span class="dim">the slapper's group</span></span><input type="text" name="rSlapTo" value="${esc(rule.slapTo || "")}" maxlength="40" placeholder="hand"></label>
            <label class="field"><span>Only during phase</span><input type="text" name="rPhase" list="rulePhases" value="${esc(rule.phase || "")}" placeholder="any phase"><datalist id="rulePhases">${v.phases.map((phase) => `<option value="${esc(phase)}">`).join("")}</datalist></label>
          </div>
          <div class="row">
            <label class="check"><input type="checkbox" name="rFollow"${rule.follow ? " checked" : ""}> Must follow the led suit</label>
            <label class="check"><input type="checkbox" name="rOnce"${rule.once ? " checked" : ""}> One card per player</label>
            <label class="check"><input type="checkbox" name="rAdvance"${rule.advance ? " checked" : ""}> Turn passes after playing here</label>
            <label class="check"><input type="checkbox" name="rFlipTop"${rule.flipTop ? " checked" : ""}> Reveal the new top card</label>
            <label class="check"><input type="checkbox" name="rAceHigh"${rule.aceHigh ? " checked" : ""}> Aces high</label>
            <label class="check" title="Singles, pairs, triples…: same size as the last play, higher rank"><input type="checkbox" name="rClimb"${rule.climb ? " checked" : ""}> Climbing sets</label>
            <label class="check" title="A J/Q/K/A gives the next player 1/2/3/4 flips to answer with a face card, or the challenger wins the pile"><input type="checkbox" name="rChallenge"${rule.challenge ? " checked" : ""}> Face-card challenges</label>
          </div>
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
      bind(form) {
        form.addEventListener("click", (event) => {
          const chip = event.target.closest("[data-ztpl]");
          if (!chip) return;
          applyZoneTemplate(form, ZONE_TEMPLATES[chip.dataset.ztpl]);
          $$("[data-ztpl]", form).forEach((el) => el.classList.toggle("on", el === chip));
        });
      },
      onSubmit(form, value) {
        if (value === "delete") {
          dispatch({ type: "removeZone", zone: zoneId, allSeats: Boolean(form.allSeats?.checked) });
          return;
        }
        const evals = $$('input[name="eval"]:checked', form).map((el) => el.value);
        const extra = form.specs.value.split(",").map((s) => s.trim()).filter(Boolean);
        for (const spec of extra) if (evalDef(parseSpec(spec).id, v) && !evals.includes(spec)) evals.push(spec);
        const ctx = {};
        if (form.board.value) ctx.board = form.board.value;
        if (form.starter.value) ctx.starter = form.starter.value;
        if (form.trump.value) ctx.trump = form.trump.value;
        if (Number(form.charlie.value)) ctx.charlie = Number(form.charlie.value);
        if (form.isCrib.checked) ctx.isCrib = true;
        if (form.jokersWild.checked) ctx.jokersWild = true;
        if (form.faceTen.checked) ctx.faceTen = true;
        if (form.topOnly.checked) ctx.topOnly = true;
        const rule = {
          place: form.rPlace.value, take: form.rTake.value, accept: form.rAccept.value, order: form.rOrder.value,
          first: form.rFirst.value.trim(), wild: form.rWild.value, meld: form.rMeld.value, phase: form.rPhase.value.trim(), cost: form.rCost.value.trim(),
          follow: form.rFollow.checked, once: form.rOnce.checked, advance: form.rAdvance.checked, flipTop: form.rFlipTop.checked, aceHigh: form.rAceHigh.checked, climb: form.rClimb.checked, challenge: form.rChallenge.checked,
          slap: form.rSlap.value, slapTo: form.rSlapTo.value.trim(), claim: form.rClaim.value, claimTo: z.rule?.claimTo || "",
        };
        const patch = {
          name: form.name.value, kind: form.kind.value, layout: form.layout.value, visibility: form.visibility.value, face: form.face.value,
          limit: Number(form.limit.value) || 0, note: form.note.value, wide: form.wide.checked, evals: evals.filter((spec, i) => !extra.includes(spec) || evals.indexOf(spec) === i), ctx, rule,
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
  function openMacroDialog(macroId, initial = null) {
    const v = view;
    const existing = macroId ? v.macros.find((m) => m.id === macroId) : null;
    const draft = existing ? E.clone(existing) : initial ? E.clone(initial) : { label: "New action", hint: "", steps: [{ op: "deal", from: "deck", to: v.seatTemplate[0]?.key || "hand", count: 1 }] };
    const refs = new Set(["deck"]);
    E.orderedZones(v, "table").forEach((zone) => refs.add(zone.key || zone.name.toLowerCase()));
    v.seatTemplate.forEach((tpl) => { for (const scope of ["", "@current", "@after", "@dealer", "@me", "@next", "@winner", "@subject", "@others"]) refs.add(tpl.key + scope); });
    const refList = `<datalist id="zoneRefs">${Array.from(refs).filter(Boolean).map((ref) => `<option value="${esc(ref)}">`).join("")}</datalist>
      <datalist id="counterNames">${[...v.counterDefs, ...v.tableCounters].map((def) => `<option value="${esc(def.name)}">`).join("")}</datalist>`;
    const selectOf = (i, field, map, val, blank) => `<select data-step="${i}" data-f="${field}">${blank ? `<option value="">${esc(blank)}</option>` : ""}${Object.entries(map).map(([id, label]) => `<option value="${esc(id)}"${String(val) === id ? " selected" : ""}>${esc(label)}</option>`).join("")}</select>`;
    const evalChoices = () => Object.fromEntries([...V.EVALUATORS.filter((def) => !def.hidden).map((def) => [def.id, def.label]), ...v.schemes.map((scheme) => ["points:" + scheme.id, "★ " + scheme.name])]);
    const fieldHTML = (step, i, field) => {
      const val = step[field] ?? "";
      switch (field) {
        case "zone": case "from": case "to":
          return `<input type="text" list="zoneRefs" data-step="${i}" data-f="${field}" value="${esc(val)}" placeholder="${field}">`;
        case "count": return `<input type="number" min="1" max="60" data-step="${i}" data-f="count" value="${esc(val || (step.op === "flip" ? "" : 1))}" placeholder="${step.op === "flip" ? "all" : "1"}">`;
        case "amount": return `<input type="number" ${step.op === "ante" ? 'min="0"' : ""} data-step="${i}" data-f="amount" value="${esc(val)}" placeholder="${step.op === "ante" ? "amount" : "±points"}">`;
        case "keep": return `<input type="number" min="0" max="99" data-step="${i}" data-f="keep" value="${esc(val)}" placeholder="keep top" title="Leave this many cards on top">`;
        case "dir": return selectOf(i, "dir", { left: "to the left", right: "to the right" }, val || "left");
        case "evaluator": return selectOf(i, "evaluator", evalChoices(), val, step.op === "stopIf" ? "count cards" : "group's own scoring");
        case "low": return `<label class="check small"><input type="checkbox" data-step="${i}" data-f="low"${step.low ? " checked" : ""}> lowest wins</label>`;
        case "sign": return selectOf(i, "sign", { "+": "add", "-": "subtract" }, val || "+");
        case "target": return selectOf(i, "target", { owner: "to each owner", winner: "all to the winner" }, val || "owner");
        case "name": return `<input type="text" list="counterNames" data-step="${i}" data-f="name" value="${esc(val)}" placeholder="counter">`;
        case "cmp": return selectOf(i, "cmp", E.STOP_CMP, val || (step.op === "dealUntil" ? ">=" : "=="));
        case "n": return `<input type="number" data-step="${i}" data-f="n" value="${esc(val ?? 0)}" placeholder="${step.evaluator || step.op === "dealUntil" ? "value" : "cards"}">`;
        case "macro": return selectOf(i, "macro", Object.fromEntries(v.macros.map((m) => [m.id, m.label])), val, "choose an action");
        case "times": return `<input type="number" min="1" max="100" data-step="${i}" data-f="times" value="${esc(val || 1)}" title="Times">`;
        case "formula": return `<input type="text" class="formula-input" data-step="${i}" data-f="formula" value="${esc(val)}" placeholder="e.g. tricks >= bid ? 10 * bid : -10 * bid" spellcheck="false">`;
        case "face": return `<select data-step="${i}" data-f="face"><option value="">${step.op === "flip" ? "toggle" : "default"}</option><option value="up"${val === "up" ? " selected" : ""}>up</option><option value="down"${val === "down" ? " selected" : ""}>down</option></select>`;
        case "by": return `<select data-step="${i}" data-f="by">${["rank", "aceLow", "suit", "reverse"].map((b) => `<option${val === b ? " selected" : ""}>${b}</option>`).join("")}</select>`;
        case "who": return step.op === "setTurn" ? selectOf(i, "who", E.TURN_OPTIONS, val || "next") : selectOf(i, "who", E.WHO_OPTIONS, val || (step.op === "awardPot" ? "winner" : /Formula$/.test(step.op) ? "all" : "current"));
        case "shuffle": return `<label class="check small"><input type="checkbox" data-step="${i}" data-f="shuffle"${step.shuffle !== false ? " checked" : ""}> shuffle</label>`;
        case "text": return `<input type="text" data-step="${i}" data-f="text" value="${esc(val)}" placeholder="${step.op === "endGame" ? "reason (optional), e.g. the deck ran out" : "text"}">`;
        default: return "";
      }
    };
    const templates = actionTemplates(v);
    const draw = () => head(existing ? "Edit action" : "New action") + `<div class="dlg-body">
        ${refList}
        ${existing ? "" : `<div class="tpl-chips"><span class="small muted">Start from</span>${Object.entries(templates).map(([id, tpl]) => `<button type="button" class="chip" data-atpl="${id}">${esc(tpl.label)}</button>`).join("")}</div>`}
        <div class="grid-2">
          <label class="field"><span>Button label</span><input type="text" name="label" value="${esc(draft.label)}" maxlength="28"></label>
          <label class="field"><span>Hint</span><input type="text" name="hint" value="${esc(draft.hint)}" maxlength="80" placeholder="Shown under the button"></label>
        </div>
        <div class="step-list">${draft.steps.map((step, i) => `<div class="step">
            <span class="n">${i + 1}</span>
            <div class="step-fields">
              <select data-step="${i}" data-f="op">${Object.entries(E.MACRO_OPS).map(([op, def]) => `<option value="${op}"${step.op === op ? " selected" : ""}>${esc(def.label)}</option>`).join("")}</select>
              ${E.MACRO_OPS[step.op].fields.map((field) => fieldHTML(step, i, field)).join("")}
              ${step.op === "deal" || step.op === "clear" || step.op === "refill" ? `<label class="check small" title="Each player moves from their own group to their own group"><input type="checkbox" data-step="${i}" data-f="perSeat"${step.perSeat ? " checked" : ""}> per seat</label>` : ""}
            </div>
            <div class="row tight"><button type="button" class="btn sm icon" data-step-up="${i}" ${i === 0 ? "disabled" : ""}>↑</button><button type="button" class="btn sm icon ghost" data-step-del="${i}">✕</button></div>
          </div>`).join("")}</div>
        <div class="row"><button type="button" class="btn sm" data-step-add>+ Step</button></div>
        <p class="hint">Targets use group keys: <code>deck</code>, <code>board</code>, <code>hand</code> (every seat, left of dealer first), <code>hand@current</code>, <code>hand@after</code> (the next player), <code>hand@dealer</code>, <code>hand@me</code>, <code>hand@next</code> (left of dealer), <code>hand@winner</code> (set by Find winner), <code>hand@subject</code> (the player a trigger fired for), <code>hand@others</code>.</p>
        ${draft.steps.some((step) => /Formula$/.test(step.op)) ? `<p class="hint">Formulas can use ${Object.keys(v.players.length ? E.formulaVars(v, v.players[0].id) : { score: 0, round: 0 }).map((name) => `<code>${esc(name)}</code>`).join(" ")}, numbers, <code>+ - * / %</code>, comparisons, <code>&amp;&amp; || !</code>, <code>a ? b : c</code> and <code>min max abs floor ceil round</code>.</p>` : ""}
        <p class="hint">Announcements can say <code>{winner}</code>, <code>{current}</code>, <code>{next}</code>, <code>{dealer}</code>, <code>{subject}</code>, <code>{round}</code>, <code>{phase}</code> and <code>{pot}</code>. “Stop if” ends the action early; “Run another action” reuses one you've built.</p>
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
        if (["count", "amount", "keep", "n", "times"].includes(f)) value = value === "" ? undefined : Number(value);
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
        else if (t.dataset.atpl) { const tpl = templates[t.dataset.atpl]; draft.label = tpl.label; draft.hint = tpl.hint || ""; draft.steps = E.clone(tpl.steps); redraw(form); }
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
          <div class="qr-box" id="roomQr" hidden title="Scan to join from a phone"></div>
          <div class="list">${net.roster.map((member) => {
            const seat = view.players.find((p) => p.clientId === member.id);
            const canFree = net.mode === "host" && seat && member.id !== net.room?.clientId;
            return `<div class="list-row"><span class="swatch" style="--c:${esc(seat?.color || "#555")}"></span><span class="grow small"><b>${esc(member.name)}</b>${member.host ? " · host" : ""}${member.connected ? "" : " · reconnecting"}</span><span class="small muted">${seat ? esc(seat.name) : "spectating"}</span>${canFree ? `<button type="button" class="btn sm ghost" data-free-seat="${esc(member.id)}" title="Free this seat for someone else">Free seat</button>` : ""}</div>`;
          }).join("")}</div>
          <p class="hint">You are ${net.mode === "host" ? "hosting — the table lives in your browser. If you leave, another player takes over" : "connected as a guest"}. Choose your seat with the view menu at the top.</p>
          ${net.mode === "host" ? `<label class="field"><span>Guests can</span><select name="guestMode">
              <option value="play"${view.guestMode !== "full" ? " selected" : ""}>Play only: move cards, run actions, score</option>
              <option value="full"${view.guestMode === "full" ? " selected" : ""}>Co-design: also edit groups, rules, actions and players</option>
            </select></label>` : `<p class="hint">Room permissions: <b>${view.guestMode === "full" ? "co-design" : "play only"}</b>.</p>`}
          <p class="hint">Hands stay private in the app: nobody can take, flip or peek at another player's private cards. Alt-click a card or group (or use its menu) to ping it for everyone, and 😀 in the top bar to react.</p>
          <p class="hint">So a game survives the host leaving, every browser in the room keeps a backup copy of the whole table, which someone could read with developer tools. Rooms are for friendly playtests, not stakes.</p>
        </div>
        <div class="dlg-foot"><button class="btn danger" value="leave" style="margin-right:auto">Leave room</button><button class="btn primary" value="cancel">Done</button></div>`;
      openDialog(html, {
        bind(form) {
          showQr(form.querySelector("#roomQr"), link);
          form.guestMode?.addEventListener("change", () => dispatch({ type: "setGuestMode", mode: form.guestMode.value }));
          form.addEventListener("click", (event) => {
            const free = event.target.closest("[data-free-seat]");
            if (!free) return;
            dispatch({ type: "releaseSeat", clientId: free.dataset.freeSeat });
            free.closest(".list-row").querySelector(".muted").textContent = "spectating";
            free.remove();
          });
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
    const keys = [["Shift+click", "Select a run of cards"], ["Ctrl/⌘+K or /", "Command palette: run anything"], ["H", "Hint: what would the smart bot play?"], ["← → then Space", "Walk through your hand and select cards"], ["P or Enter", "Play the selection to the first legal group"], ["1–9", "Run action 1–9"], ["T", "Next player"], ["Shift+T", "Previous player"], ["D", "Draw 1 to your / current hand"], ["S", "Shuffle the deck"], ["F", "Flip selected cards"], ["G", "Group selected cards"], ["M", "Move selected to…"], ["I", "Inspect the card under the pointer (long-press on touch)"], ["Del", "Discard selected"], ["A", "Select all in your hand"], ["Space", "Slap the pile (games with slapping)"], ["C", "Call the last bluff (games with claims)"], ["Alt+click", "Ping a card or group (online)"], ["Esc", "Clear selection / close"], ["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"], ["N", "New game"], ["\\", "Toggle side panel"], ["?", "This help"]];
    openDialog(head("How it works") + `<div class="dlg-body">
      <p class="hint"><b>Cards</b>: tap to select (tap several), drag to move — dragging a selected card moves the whole selection. Double-click flips. Right-click (or long-press menu ⋯) for more.</p>
      <p class="hint"><b>Groups</b> are any hand, board, pile or row. Each has a layout, visibility (private hands, public boards, hidden decks) and optional <b>scoring badges</b> — poker, Omaha, lowball, badugi, blackjack, baccarat, cribbage hand &amp; pegging, gin deadwood, OFC royalties, hearts, trick winner, sums. Comparable groups are ranked and the best gets a 🏆.</p>
      <p class="hint"><b>Actions</b> are macros built from steps (shuffle, deal, flip, collect, pass groups around, find the winner, score groups, change counters, stop if…) so you can script a game's flow and iterate on it.</p>
      <p class="hint"><b>Play rules</b> live on groups: whose turn it is, follow suit, match suit or rank, build up or down, wild ranks, one card each, pass the turn after playing. The Rules tab switches checks off, to warnings (great for playtests) or enforced.</p>
      <p class="hint"><b>Triggers</b> fire actions by themselves: when a trick is full, when the deck runs out, when a hand empties, when a phase starts, when the game ends. <b>Custom scoring</b> (Scores tab) defines card values and bonuses you can attach to any group.</p>
      <p class="hint"><b>Design tools</b>: save games to My games with version history, share them as links, generate a rules document from the table, simulate deals thousands of times, replay deals with seeded shuffles, and track playtest results by seat.</p>
      <p class="hint"><b>Start fast</b>: New game → ✨ Design your own builds a playable table from a few answers, and new groups and actions have one-click templates (hand, discard, trick, foundation, meld… deal, draw, take trick, reshuffle, showdown…).</p>
      <p class="hint"><b>Bots</b> (Players tab, 🤖) make random legal plays under your rules, so a table full of bots playtests whole hands; set what they do when stuck in Play → Bots. Seats can have <b>teams</b>, groups can require <b>sets or runs</b>, Log → Rewind jumps back in time, and Deck → Print & play makes a paper prototype.</p>
      <p class="hint"><b>Social mechanics</b>: piles can be <b>slapped</b> in real time (Jacks, pairs, sandwiches…: first slap wins the pile), take <b>bluffs</b> (play face down, claim a rank, anyone can call it), run <b>face-card challenges</b> (Egyptian Ratscrew), or be <b>climbed</b> with bigger sets. Select your cards and 🤝 <b>Offer</b> them to trade with another player. Bots slap, bluff, call and trade too.</p>
      <p class="hint"><b>Balance</b>: Tools → Bot games plays hundreds of games to show seat fairness, game length and which cards the winners played; Rules → What changed? diffs your edits against any saved version.</p>
      <p class="hint"><b>View</b>: “All hands” for one shared screen, “Pass &amp; play” hides hands between turns, “X-ray” shows everything for design work, or pick a seat. Online rooms keep hands private per player.</p>
      <div class="kbd-list">${keys.map(([k, d]) => `<kbd>${esc(k)}</kbd><span>${esc(d)}</span>`).join("")}</div>
    </div><div class="dlg-foot"><button type="button" class="btn" data-start-tour>Take the tour</button><button class="btn primary" value="cancel">Got it</button></div>`, {
      bind(form) { form.querySelector("[data-start-tour]").addEventListener("click", startTour); },
    });
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
      announceNewLog(state);
      announceTurn(state);
      trackPacing(state);
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
    room.onEvent = (from, event) => handleRoomEvent(from, event);
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

  // What guests may do. "Play only" rooms keep the design in the host's hands.
  const GUEST_PLAY = new Set(["move", "flip", "flipZone", "peek", "rotate", "mark", "shuffle", "cut", "draw", "drawBottom", "deal", "sort", "arrange", "clearZone", "revealAll", "runMacro", "nextTurn", "passDeal", "nextRound", "setPhase", "nextPhase", "setTurn", "adjustScore", "bet", "award", "transfer", "counter", "chat", "roll", "coin", "randomPlayer", "claimSeat", "releaseSeat", "dismissGameOver", "feedback", "showTo", "slap", "callBluff", "offerTrade", "answerTrade"]);
  const GUEST_SPECTATE = new Set(["chat", "feedback", "claimSeat", "releaseSeat"]);

  function hostHandle(clientId, action) {
    if (!action || typeof action !== "object" || typeof action.type !== "string") return;
    const actor = state.players.find((player) => player.clientId === clientId)?.id || null;
    const reject = (message) => net.room?.broadcastEvent({ kind: "reject", to: clientId, message });
    if (action.type === "__undo" || action.type === "__redo") {
      if (state.guestMode !== "full") return reject("Only the host can undo in this room.");
      return action.type === "__undo" ? undo() : redo();
    }
    if (action.type === "load") return reject("Only the host can replace the table.");
    if (!actor && !GUEST_SPECTATE.has(action.type)) return reject("Take a seat from the view menu to play.");
    if (state.guestMode !== "full" && !GUEST_PLAY.has(action.type)) return reject("The host has limited guests to playing. Ask them to open the room to co-designers.");
    if (action.type === "claimSeat") {
      const target = state.players.find((player) => player.id === action.player);
      if (target && target.clientId && target.clientId !== clientId && net.roster.some((m) => m.id === target.clientId && m.connected)) return reject(`${target.name}'s seat is taken.`);
      action = { ...action, clientId };
    }
    if (action.type === "releaseSeat") action = { ...action, clientId };
    const error = applyLocal(action, actor, { strict: true, quiet: true });
    if (error) reject(error);
  }

  // ---------------------------------------------------------- room events
  const REACTIONS = ["👍", "👎", "😂", "😮", "🤔", "🎉", "🔥", "⏳"];

  /** Send an ephemeral event (ping, reaction) to everyone in the room, including yourself. */
  function emit(event) {
    if (!net.room || net.mode === "local") return;
    const me = mySeat();
    const full = { ...event, name: me?.name || load(STORE.name, "") || "Someone", color: me?.color || "#45d6ff", seat: me?.id || null };
    try { net.room.sendEvent(full); } catch (error) { toast(error.message, "error"); return; }
    if (net.mode === "client") handleRoomEvent(net.room.clientId, full);
  }

  function handleRoomEvent(from, event) {
    if (!event || typeof event !== "object") return;
    if (event.kind === "reject") {
      if (event.to === net.room?.clientId && from === net.room?.hostClientId) toast(String(event.message || "Not allowed"), "error");
      return;
    }
    if (event.kind === "ping") return showPing(event);
    if (event.kind === "react" && REACTIONS.includes(event.emoji)) return showReaction(event);
  }

  function safeColor(color) {
    return /^#[0-9a-f]{6}$/i.test(color || "") ? color : "#45d6ff";
  }

  function showPing(event) {
    const card = event.card ? document.querySelector(`.card[data-card-id="${CSS.escape(String(event.card))}"]`) : null;
    const target = card || (event.zone ? document.querySelector(`.zone[data-zone-id="${CSS.escape(String(event.zone))}"]`) : null);
    if (!target) return;
    target.style.setProperty("--ping", safeColor(event.color));
    target.classList.remove("pinged");
    void target.offsetWidth;
    target.classList.add("pinged");
    setTimeout(() => target.classList.remove("pinged"), 1800);
    const rect = target.getBoundingClientRect();
    floatLabel(`📍 ${event.name || ""}`, rect.left + rect.width / 2, rect.top, event.color);
  }

  function showReaction(event) {
    const seat = event.seat ? document.querySelector(`.seat[data-seat="${CSS.escape(String(event.seat))}"]`) : null;
    const rect = seat ? seat.getBoundingClientRect() : { left: window.innerWidth / 2 - 20, width: 40, top: 80 };
    floatLabel(`${event.emoji} ${event.name || ""}`, rect.left + rect.width / 2, Math.max(60, rect.top + 10), event.color, true);
  }

  function floatLabel(text, x, y, color, big = false) {
    const el = document.createElement("div");
    el.className = "float-label" + (big ? " big" : "");
    el.textContent = text;
    el.style.left = Math.max(10, Math.min(window.innerWidth - 10, x)) + "px";
    el.style.top = Math.max(10, y) + "px";
    el.style.setProperty("--c", safeColor(color));
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  function pingTarget(el) {
    const card = el.closest(".card[data-card-id]");
    const zone = el.closest("[data-zone-id]") || (card ? document.querySelector(`.zone[data-zone-id="${CSS.escape(card.dataset.zone)}"]`) : null);
    emit({ kind: "ping", card: card?.dataset.cardId || null, zone: zone?.dataset.zoneId || card?.dataset.zone || null });
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

  function importFile(onDone) {
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
        } else if (Array.isArray(data.designs) || data.table || data.seat) {
          const list = (Array.isArray(data.designs) ? data.designs : [data]).filter((entry) => entry && (entry.table || entry.seat));
          const now = Date.now();
          const added = list.map((entry, i) => ({ ...entry, id: "custom-" + now.toString(36) + i, custom: true, family: entry.family || "Custom", createdAt: entry.createdAt || now, updatedAt: now, versions: Array.isArray(entry.versions) ? entry.versions : [] }));
          if (!added.length) throw new Error("No game designs in that file");
          store(STORE.presets, loadLibrary().concat(added));
          toast(added.length === 1 ? `Imported “${added[0].name}” into My games` : `Imported ${added.length} games into My games`, "good");
          onDone?.();
          renderPane();
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
      case "slap": slapPile(el.closest("[data-zone-id]").dataset.zoneId); break;
      case "call-bluff": callBluff(el.closest("[data-zone-id]").dataset.zoneId, el); break;
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
      case "custom-add": customOpen = true; deckDraft.custom.push({ label: "New card", text: "", color: "#9f7dff", value: 0, count: 1, suit: "", rank: "", icon: "" }); renderPane(); break;
      case "custom-import": openCustomImport(); break;
      case "back-clear": deckDraft.back = { color: "", text: "" }; renderPane(); break;
      case "custom-export": download(fileSafe(v.title) + "-cards.csv", customCardsCsv(deckDraft.custom), "text/csv"); break;
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
      case "save-preset":
      case "save-preset-new": {
        const asNew = act === "save-preset-new";
        const linked = !asNew && v.designId && loadLibrary().some((entry) => entry.id === v.designId);
        if (linked) {
          const note = prompt("What changed? (optional, kept in the version history)", "");
          if (note === null) return;
          saveDesign({ note });
        } else {
          const name = prompt("Name this game", v.title);
          if (!name) return;
          if (name !== v.title && net.mode !== "client") dispatch({ type: "setTitle", title: name });
          saveDesign({ asNew: true });
        }
        break;
      }
      case "rules-view": prefs.rulesView = el.dataset.view; savePrefs(); renderPane(); break;
      case "rules-template": dispatch({ type: "setNotes", notes: v.notes && v.notes.trim() ? v.notes + "\n\n" + rulesTemplate(v) : rulesTemplate(v) }); break;
      case "rules-generate": generateRules(); break;
      case "rules-copy": navigator.clipboard?.writeText(v.notes || "").then(() => toast("Rules copied", "good"), () => toast("Couldn't copy", "error")); break;
      case "rules-download": download(fileSafe(v.title) + "-rules.md", v.notes || E.describeGame(v), "text/markdown"); break;
      case "dev-copy": navigator.clipboard?.writeText(JSON.stringify(net.mode === "client" ? v : state, null, 2)).then(() => toast("Table JSON copied", "good"), () => toast("Couldn't copy", "error")); break;
      case "dev-load": {
        const text = $("#devJson").value.trim();
        if (!text) return toast("Paste a table or design JSON first.", "error");
        try {
          const data = JSON.parse(text);
          if (data.zones && data.cards) { if (net.mode === "client") return toast("Only the host can load a table.", "error"); replaceState(E.migrate(data), "Table loaded from JSON"); }
          else if (data.table || data.seat) startFromDesign({ ...data, id: data.id || "pasted" });
          else throw new Error("That JSON isn't a table or a design");
        } catch (error) { toast("Couldn't load: " + error.message, "error"); }
        break;
      }
      case "rules-mode": dispatch({ type: "setRules", mode: el.dataset.mode }); break;
      case "cycle-rules": dispatch({ type: "setRules", mode: { off: "warn", warn: "enforce", enforce: "off" }[v.rulesMode] || "warn" }); break;
      case "edit-zone-rules": {
        const ref = el.dataset.zone;
        if (!ref.startsWith("seat:")) { openZoneDialog(ref); break; }
        const key = ref.slice(5);
        const seat = v.players.find((player) => E.orderedZones(v, player.id).some((zone) => zone.key === key));
        const zone = seat && E.orderedZones(v, seat.id).find((entry) => entry.key === key);
        if (zone) openZoneDialog(zone.id); else toast("Add a player to edit seat groups.", "error");
        break;
      }
      case "new-trigger": openTriggerDialog(null); break;
      case "edit-trigger": openTriggerDialog(el.dataset.id); break;
      case "open-library": openLibrary(); break;
      case "share-design": shareLink("design", stripDesign(E.toPreset(net.mode === "client" ? v : state))); break;
      case "share-table": shareLink("table", net.mode === "client" ? v : state); break;
      case "new-scheme": openSchemeDialog(null); break;
      case "edit-scheme": openSchemeDialog(el.dataset.id); break;
      case "record-result": if (recordResult(net.mode === "client" ? v : state)) renderPane(); break;
      case "export-results": {
        const rows = [["date", "game", "rounds", "minutes", "player", "seat", "total", "won"]];
        for (const entry of loadResults()) for (const player of entry.players) rows.push([new Date(entry.t).toISOString(), entry.title, entry.rounds, Math.round((entry.durationMs || 0) / 60000), player.name, player.seat + 1, player.total, player.won ? 1 : 0]);
        download("card-table-results.csv", rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
        break;
      }
      case "clear-results":
        if (confirm("Delete every recorded result for this game?")) {
          store(STORE.results, loadResults().filter((entry) => !((v.designId && entry.designId === v.designId) || entry.title === v.title)));
          renderPane();
        }
        break;
      case "simulate": readSimCfg(); runSimulation(); break;
      case "scoreboard": openScoreboard(); break;
      case "design-diff": { const linked = loadLibrary().find((entry) => entry.id === v.designId); if (linked) openDiffDialog(linked, "saved", "table"); break; }
      case "bot-games-csv": {
        const r = botGames.result;
        if (!r) break;
        const header = ["game", "finished", "moves", "rounds", "winning seats", ...r.names.map((name) => `score: ${name}`)];
        const lines = [header, ...r.rows.map((row) => [row.game, row.finished ? 1 : 0, row.moves, row.rounds, row.winners, ...row.scores])];
        download(fileSafe(v.title) + "-bot-games.csv", lines.map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
        break;
      }
      case "bot-games":
        botGames.cfg.deal = $("#bgDeal")?.value || botGames.cfg.deal;
        botGames.cfg.games = Number($("#bgGames")?.value) || botGames.cfg.games;
        botGames.cfg.against = $("#bgAgainst")?.value || "";
        runBotGames();
        break;
      case "seed-apply": setSeed($("#seedInput").value); render(); break;
      case "seed-clear": setSeed(""); render(); break;
      case "pull-cards": {
        const specs = $("#pullSpecs").value.trim();
        if (!specs) return toast("List the cards, e.g. As Kd 10h", "error");
        dispatch({ type: "pullCards", specs, to: $("#pullTo").value, face: $("#pullFace").value || undefined });
        break;
      }
      case "feedback": {
        const input = $("#feedbackInput");
        if (input.value.trim()) { dispatch({ type: "feedback", text: input.value }); input.value = ""; }
        break;
      }
      case "export-log": download(fileSafe(v.title) + "-log.txt", v.log.map((entry) => `${new Date(entry.t).toLocaleString()}\t${entry.kind}\t${entry.who || ""}\t${entry.text}`).join("\n"), "text/plain"); break;
      case "log-filter": logFilter = el.dataset.filter; renderPane(); break;
      case "play-again": restartSameSetup(); break;
      case "bot-turn": {
        const current = state?.players[state.turn.index];
        if (net.mode === "client") return toast("Only the host runs bots.", "error");
        if (current) botTurn(current.id, true);
        break;
      }
      case "bots-pause": bots.paused = !bots.paused; bots.idleRev = -1; renderPane(); scheduleBots(); break;
      case "bot-speed": prefs.botSpeed = el.dataset.speed; savePrefs(); renderPane(); break;
      case "toggle-bot": { const p = E.playerById(v, el.dataset.player); if (p) dispatch({ type: "updatePlayer", player: p.id, patch: { bot: !p.bot } }); break; }
      case "print-cards": printSheet(false); break;
      case "print-all": printSheet(true); break;
      case "replay": startReplay(); break;
      case "hint": showHint(); break;
      case "rec-start": startRecording(); break;
      case "rec-stop": stopRecording(); break;
      case "reset-pacing": Object.assign(pacing, { game: null }); trackPacing(net.mode === "client" ? view : state); renderPane(); break;
      case "rewind": { const steps = Number(el.dataset.steps) || 1; for (let i = 0; i < steps; i += 1) undo(); break; }
      case "dismiss-over": dispatch({ type: "dismissGameOver" }); break;
      case "open-tab": openTab(el.dataset.tab); break;
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
      case "play": if (el.dataset.to) dispatch({ type: "move", cards: ids, to: el.dataset.to }); break;
      case "flip": dispatch({ type: "flip", cards: ids }); break;
      case "offer": openOfferDialog(ids); return;
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
      if (event.altKey && net.mode !== "local" && event.target.closest(".card[data-card-id], [data-zone-id]")) { pingTarget(event.target); return; }
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
        const zone = E.zoneOf(view, id);
        if (event.shiftKey && lastClicked && zone && zone.cards.includes(lastClicked)) {
          // Shift-click selects the run of cards between the last click and this one.
          const [a, b] = [zone.cards.indexOf(lastClicked), zone.cards.indexOf(id)].sort((x, y) => x - y);
          zone.cards.slice(a, b + 1).forEach((cid) => selection.add(cid));
        } else if (selection.has(id)) selection.delete(id);
        else selection.add(id);
        lastClicked = id;
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
      hoverCard = event.target.closest(".card[data-card-id]")?.dataset.cardId || null;
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
      if (d.meta) {
        const meta = d.meta === "min" || d.meta === "max" ? { players: { ...(view.meta?.players || {}), [d.meta]: Number(el.value) } } : { [d.meta]: el.value };
        return dispatch({ type: "setMeta", meta });
      }
      if (d.triggerToggle) {
        const trigger = view.triggers.find((entry) => entry.id === d.triggerToggle);
        if (trigger) dispatch({ type: "saveTrigger", trigger: { ...trigger, off: !el.checked } });
        return;
      }
      if (d.cfg === "maxRounds") return dispatch({ type: "scoreConfig", maxRounds: Number(el.value) || 0 });
      if (["simMacro", "simTarget", "simEval", "simTrials"].includes(el.id)) return readSimCfg();
      if (el.id === "bgDeal") { botGames.cfg.deal = el.value; return; }
      if (el.id === "bgGames") { botGames.cfg.games = Number(el.value) || 30; return; }
      if (el.id === "bgAgainst") { botGames.cfg.against = el.value; return; }
      if (d.roundLabel) return dispatch({ type: "renameRound", round: d.roundLabel, label: el.value });
      if (d.cfg === "label") return dispatch({ type: "scoreConfig", label: el.value });
      if (d.cfg === "target") return dispatch({ type: "scoreConfig", target: Number(el.value) });
      if (d.cfg === "lowWins") return dispatch({ type: "scoreConfig", lowWins: el.value === "1" });
      if (d.cfg === "peg") return dispatch({ type: "scoreConfig", pegTarget: el.checked ? (view.scores.target || 121) : 0 });
      if (d.chips) return dispatch({ type: "setChips", player: d.chips, value: Number(el.value) });
      if (d.playerName) return dispatch({ type: "updatePlayer", player: d.playerName, patch: { name: el.value } });
      if (d.playerTeam) return dispatch({ type: "updatePlayer", player: d.playerTeam, patch: { team: el.value } });
      if (d.botFallback !== undefined) return dispatch({ type: "setBotFallback", macro: el.value });
      if (d.playsPerTurn !== undefined) return dispatch({ type: "setBotFallback", macro: view.botFallback || "", playsPerTurn: Number(el.value) });
      if (d.mustPlay !== undefined) return dispatch({ type: "setBotFallback", macro: view.botFallback || "", mustPlay: el.checked });
      if (d.realtime !== undefined) return dispatch({ type: "setBotFallback", macro: view.botFallback || "", realtime: el.checked });
      if (d.botStyle !== undefined) { prefs.botStyle = el.value; savePrefs(); return; }
      if (d.botSeat) return dispatch({ type: "updatePlayer", player: d.botSeat, patch: { botStyle: el.value } });
      if (d.playerColor) return dispatch({ type: "updatePlayer", player: d.playerColor, patch: { color: el.value } });
      if (d.deckBack) { deckDraft.back = { ...(deckDraft.back || {}), [d.deckBack]: el.value }; renderPane(); return; }
      if (d.deck) { deckDraft[d.deck] = d.deck === "preset" ? el.value : Number(el.value); if (d.deck === "preset") deckDraft.ranks = null; renderPane(); return; }
      if (d.deckSuit) { const s = d.deckSuit; deckDraft.suits = el.checked ? Array.from(new Set(deckDraft.suits.concat(s))) : deckDraft.suits.filter((x) => x !== s); if (!deckDraft.suits.length) deckDraft.suits = [s]; renderPane(); return; }
      if (d.custom !== undefined) { const item = deckDraft.custom[Number(d.custom)]; item[d.k] = ["value", "count"].includes(d.k) ? Number(el.value) : el.value; renderPane(); return; }
      if (d.hyperDraws !== undefined) { hyper.draws = Math.max(1, Number(el.value) || 1); renderPane(); return; }
      if (d.prefBool) { prefs[d.prefBool] = el.checked; savePrefs(); if (d.prefBool === "sound" && el.checked) playSound("turn"); render(); return; }
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
      } else if (el.id === "feedbackInput") {
        handleAct({ dataset: { act: "feedback" } }, event);
      } else if (el.id === "pullSpecs") {
        handleAct({ dataset: { act: "pull-cards" } }, event);
      } else if (el.id === "seedInput") {
        handleAct({ dataset: { act: "seed-apply" } }, event);
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

    $("#tour").addEventListener("click", (event) => {
      const button = event.target.closest("[data-tour]");
      if (!button) return;
      if (button.dataset.tour === "skip") endTour();
      else { tour.step += button.dataset.tour === "back" ? -1 : 1; showTourStep(); }
    });
    window.addEventListener("resize", () => { if (tour.step >= 0) showTourStep(); });
    $("#replayBar").addEventListener("click", (event) => {
      const el = event.target.closest("[data-rp]");
      if (el && el.dataset.rp !== "seek") handleReplay(el);
    });
    $("#replayBar").addEventListener("input", (event) => {
      if (event.target.dataset.rp === "seek") replayTo(Number(event.target.value));
    });
    $("#selectionBar").addEventListener("click", (event) => {
      const el = event.target.closest("[data-sel]");
      if (el) handleSelectionBar(el);
    });
    $("#offers").addEventListener("click", (event) => {
      event.stopPropagation();
      const el = event.target.closest("[data-offer-act]");
      if (el) answerOffer(el);
    });
    $("#dock").addEventListener("click", (event) => {
      const act = event.target.closest("[data-act]");
      if (act) handleAct(act, event);
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
    $("#reactBtn").addEventListener("click", (event) => showMenu(event.currentTarget, REACTIONS.map((emoji) => ({ label: emoji, run: () => emit({ kind: "react", emoji }) }))));
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
    let wasWide = window.innerWidth > 900;
    window.addEventListener("resize", () => {
      const wide = window.innerWidth > 900;
      if (wide !== wasWide && prefs.layout === "around") render();
      wasWide = wide;
    });
    if (typeof ResizeObserver === "function") new ResizeObserver(() => fitRows()).observe($("#table"));
    $("#table").addEventListener("scroll", closeMenu);

    document.addEventListener("keydown", (event) => {
      const typing = event.target.closest("input, textarea, select") || dialog().open;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "z" && !typing) { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
      if (mod && event.key.toLowerCase() === "y" && !typing) { event.preventDefault(); redo(); return; }
      if (mod && event.key.toLowerCase() === "k" && !dialog().open) { event.preventDefault(); openPalette(); return; }
      if (typing || mod || event.altKey) return;
      const key = event.key;
      if (tour.step >= 0) {
        if (key === "Escape") endTour();
        else if (key === "ArrowRight" || key === "Enter") { tour.step += 1; showTourStep(); }
        else if (key === "ArrowLeft") { tour.step = Math.max(0, tour.step - 1); showTourStep(); }
        else return;
        event.preventDefault();
        return;
      }
      if (replay.active) {
        if (key === "ArrowLeft") replayTo(replay.index - 1);
        else if (key === "ArrowRight") replayTo(replay.index + 1);
        else if (key === " ") handleReplay({ dataset: { rp: "play" } });
        else if (key === "Escape") stopReplay();
        else return;
        event.preventDefault();
        return;
      }
      if (key === "Escape") { closeMenu(); if (selection.size) { selection.clear(); render(); } return; }
      if (/^[1-9]$/.test(key)) { const macro = view.macros[Number(key) - 1]; if (macro) dispatch({ type: "runMacro", id: macro.id }); return; }
      switch (key.toLowerCase()) {
        case "t": dispatch({ type: "nextTurn", back: event.shiftKey }); break;
        case "d": { const deck = E.findDeckZone(view); const hand = myHandZone(); if (deck && hand) dispatch({ type: "draw", from: deck.id, to: hand, count: 1 }); break; }
        case "s": { const deck = E.findDeckZone(view); if (deck) dispatch({ type: "shuffle", zone: deck.id }); break; }
        case "c": { const pile = E.orderedZones(view, "table").find((zone) => zone.claim); if (pile) callBluff(pile.id, document.querySelector(`[data-zone-id="${pile.id}"] [data-act="call-bluff"]`) || document.body); break; }
        case "f": if (selection.size) { dispatch({ type: "flip", cards: orderedSelection() }); selection.clear(); render(); } break;
        case "g": if (selection.size) handleSelectionBar({ dataset: { sel: "group" } }); break;
        case "m": if (selection.size) moveMenu($("#selectionBar"), orderedSelection()); break;
        case "delete": case "backspace": if (selection.size) handleSelectionBar({ dataset: { sel: "discard" } }); break;
        case "a": { const hand = myHandZone(); if (hand) { view.zones[hand].cards.forEach((id) => selection.add(id)); render(); } break; }
        case "h": showHint(); break;
        case "arrowright": moveKbdFocus(1); break;
        case "arrowleft": moveKbdFocus(-1); break;
        case " ": {
          if (!kbdFocus && E.orderedZones(view, "table").some((zone) => zone.rule?.slap)) { event.preventDefault(); slapPile(); break; }
          if (!kbdFocus || !view.cards[kbdFocus]) return;
          if (selection.has(kbdFocus)) selection.delete(kbdFocus); else selection.add(kbdFocus);
          render();
          break;
        }
        case "p":
        case "enter": {
          const first = [...legalMap.entries()].find(([, verdict]) => verdict.ok);
          if (!selection.size || !first) return;
          dispatch({ type: "move", cards: orderedSelection(), to: first[0] });
          selection.clear();
          render();
          break;
        }
        case "n": openNewGame(); break;
        case "\\": prefs.side = !prefs.side; savePrefs(); break;
        case "?": openHelp(); break;
        case "/": openPalette(); break;
        case "i": if (hoverCard && view.cards[hoverCard]) inspectCard(hoverCard); else return; break;
        default: return;
      }
      event.preventDefault();
    });
  }

  // ======================================================= RULES DOCUMENT
  function inlineMarkdown(text) {
    return esc(text)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/(^|[\s(])_(.+?)_(?=$|[\s).,;:!?])/g, "$1<i>$2</i>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
  }

  /** A small, safe Markdown renderer for rules documents (headings, lists, bold, italics, code). */
  function renderMarkdown(text) {
    let html = "";
    let list = null;
    const close = () => { if (list) { html += `</${list}>`; list = null; } };
    for (const raw of String(text || "").split("\n")) {
      const line = raw.replace(/\s+$/, "");
      let m;
      if (!line.trim()) { close(); continue; }
      if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) {
        close();
        const level = m[1].length + 1;
        html += `<h${level}>${inlineMarkdown(m[2])}</h${level}>`;
      } else if ((m = /^\s*[-*•]\s+(.*)$/.exec(line))) {
        if (list !== "ul") { close(); html += "<ul>"; list = "ul"; }
        html += `<li>${inlineMarkdown(m[1])}</li>`;
      } else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
        if (list !== "ol") { close(); html += "<ol>"; list = "ol"; }
        html += `<li>${inlineMarkdown(m[1])}</li>`;
      } else {
        close();
        html += `<p>${inlineMarkdown(line)}</p>`;
      }
    }
    close();
    return html || `<p class="muted">Nothing written yet. Try “Template” or “Generate from table”.</p>`;
  }

  function rulesTemplate(v) {
    const players = v.meta?.players;
    return [
      `# ${v.title}`,
      "",
      "## Overview",
      "What is the goal of the game, in one or two sentences?",
      "",
      "## Players & components",
      `- ${players ? `${players.min}–${players.max}` : v.players.length} players`,
      `- ${E.deckSize(v.deckSpec)} cards`,
      "",
      "## Setup",
      "1. Shuffle and deal…",
      "",
      "## On your turn",
      "1. …",
      "",
      "## Scoring",
      "- …",
      "",
      "## End of the game",
      "- …",
      "",
      "## Playtest questions",
      "- What felt slow or confusing?",
    ].join("\n");
  }

  // ============================================================= LIBRARY
  function loadLibrary() {
    const list = load(STORE.presets, []);
    return Array.isArray(list) ? list.filter((entry) => entry && entry.id && entry.name) : [];
  }

  /** Compare two versions of a saved design (or the live table) and list what changed. */
  function openDiffDialog(design, fromKey, toKey) {
    const sources = [
      ...(design.id === view.designId ? [["table", "This table, unsaved", () => E.toPreset(state || view)]] : []),
      ["saved", `Saved ${design.updatedAt ? new Date(design.updatedAt).toLocaleString() : ""}${design.note ? " · " + design.note : ""}`, () => stripDesign(design)],
      ...(design.versions || []).map((version, i) => [`v${i}`, `${new Date(version.t).toLocaleString()}${version.note ? " · " + version.note : ""}`, () => version.design]),
    ];
    const pick = (key) => sources.find(([id]) => id === key) || sources[0];
    let from = pick(fromKey)[0];
    let to = pick(toKey)[0];
    const options = (value) => sources.map(([id, label]) => `<option value="${id}"${id === value ? " selected" : ""}>${esc(label)}</option>`).join("");
    const draw = () => {
      const changes = E.diffDesigns(pick(from)[2](), pick(to)[2]());
      const areas = [...new Set(changes.map((change) => change.area))];
      const mark = { added: "+", removed: "−", changed: "~" };
      return head(`What changed in ${design.name}`) + `<div class="dlg-body">
          <div class="grid-2">
            <label class="field"><span>From</span><select name="from">${options(from)}</select></label>
            <label class="field"><span>To</span><select name="to">${options(to)}</select></label>
          </div>
          ${changes.length ? areas.map((area) => `<div class="diff-area"><h3 class="small">${esc(area)}</h3>${changes.filter((change) => change.area === area).map((change) => `<div class="diff-line ${change.kind}"><b>${mark[change.kind]}</b><span>${esc(change.text)}</span></div>`).join("")}</div>`).join("") : `<p class="hint">No design changes between these two. (Cards on the table, scores and players aren't part of a design.)</p>`}
        </div>
        <div class="dlg-foot"><button class="btn" value="cancel">Close</button></div>`;
    };
    openDialog(draw(), {
      wide: true,
      bind(form) {
        form.addEventListener("change", (event) => {
          if (event.target.name === "from") from = event.target.value;
          else if (event.target.name === "to") to = event.target.value;
          else return;
          form.innerHTML = draw();
        });
      },
    });
  }

  function stripDesign(design) {
    const { versions, ...rest } = design;
    return E.clone(rest);
  }

  /** Save the current table's design into "My games". Updating keeps the old one as a version. */
  function saveDesign({ asNew = false, note = "" } = {}) {
    const source = net.mode === "client" ? view : state;
    const library = loadLibrary();
    const design = E.toPreset(source);
    const now = Date.now();
    const existing = !asNew && source.designId ? library.find((entry) => entry.id === source.designId) : null;
    design.tagline = source.meta?.tagline || design.tagline || "Your design";
    if (existing) {
      design.id = existing.id;
      design.createdAt = existing.createdAt || now;
      design.versions = [{ t: existing.updatedAt || existing.createdAt || now, note: existing.note || "", design: stripDesign(existing) }, ...(existing.versions || [])].slice(0, 12);
    } else {
      design.id = "custom-" + now.toString(36) + Math.floor(Math.random() * 1296).toString(36);
      design.createdAt = now;
      design.versions = [];
    }
    design.updatedAt = now;
    design.note = String(note || "").slice(0, 140);
    const next = existing ? library.map((entry) => (entry.id === design.id ? design : entry)) : library.concat(design);
    if (!store(STORE.presets, next)) {
      toast("Browser storage is full or unavailable. Use Export instead.", "error");
      return null;
    }
    if (net.mode !== "client") dispatch({ type: "linkDesign", id: design.id });
    toast(existing ? `Saved “${design.name}” (version ${design.versions.length + 1})` : `Saved “${design.name}” to My games`, "good");
    renderPane();
    return design;
  }

  function startFromDesign(design, players) {
    if (net.mode === "client") return toast("Only the host can start a new game.", "error");
    const range = design.players || { min: 1, max: 12, default: 2 };
    const count = players || Math.max(range.min || 1, Math.min(range.max || 12, state?.players.length || range.default || 2));
    const names = Array.from({ length: count }, (_, i) => {
      const old = state?.players[i];
      return old ? { name: old.name, color: old.color, clientId: old.clientId } : { name: `Player ${i + 1}` };
    });
    const next = E.createTable(design, { players: names });
    next.rev = (state?.rev || 0) + 1;
    replaceState(next, `${design.name} ready`);
    store(STORE.seen, true);
  }

  function openLibrary() {
    const draw = () => {
      const library = loadLibrary().slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      const current = (net.mode === "client" ? view : state)?.designId;
      const rows = library.map((design) => `<div class="lib-row${design.id === current ? " on" : ""}">
          <div class="grow">
            <div class="row tight"><b>${esc(design.name)}</b><span class="pill small-pill">${esc(design.family || "Custom")}</span>${design.id === current ? `<span class="pill small-pill good-pill">This table</span>` : ""}</div>
            <div class="small muted">${esc(design.tagline || design.description || "")}</div>
            <div class="small dim">${design.updatedAt ? "Updated " + new Date(design.updatedAt).toLocaleString() : ""}${design.versions?.length ? ` · ${design.versions.length} earlier version${design.versions.length === 1 ? "" : "s"}` : ""}${design.note ? ` · “${esc(design.note)}”` : ""}</div>
          </div>
          <div class="row tight lib-actions">
            <button type="button" class="btn sm primary" data-lib="play" data-id="${esc(design.id)}">Play</button>
            <button type="button" class="btn sm" data-lib="more" data-id="${esc(design.id)}">More ▾</button>
          </div>
        </div>`).join("");
      return head("My games") + `<div class="dlg-body">
          <p class="hint">Designs saved in this browser: groups, rules, actions, triggers, scoring, deck and the rules document. Saving over a design keeps the previous one as a version you can restore.</p>
          <div class="list">${rows || `<div class="empty-state"><div>No saved games yet.</div><div class="small">Build a table, then Rules → Save to My games.</div></div>`}</div>
        </div>
        <div class="dlg-foot">
          <button type="button" class="btn" data-lib="import">Import file…</button>
          <button type="button" class="btn" data-lib="export-all" ${library.length ? "" : "disabled"}>Export all</button>
          <span class="grow"></span>
          <button type="button" class="btn primary" data-lib="save">${current && library.some((d) => d.id === current) ? "Save changes to this game" : "Save this table as a game"}</button>
          <button class="btn" value="cancel">Close</button>
        </div>`;
    };
    const bind = (form) => {
      form.addEventListener("click", (event) => {
        const el = event.target.closest("[data-lib]");
        if (!el) return;
        const library = loadLibrary();
        const design = library.find((entry) => entry.id === el.dataset.id);
        const redraw = () => { form.innerHTML = draw(); };
        switch (el.dataset.lib) {
          case "play": closeDialog(); startFromDesign(design); break;
          case "save": saveDesign(); redraw(); break;
          case "import": importFile(redraw); break;
          case "export-all": download("card-table-designs.json", JSON.stringify({ designs: library.map(stripDesign) }, null, 2)); break;
          case "more": {
            const versions = (design.versions || []).map((version, i) => ({
              label: `Restore ${new Date(version.t).toLocaleString()}${version.note ? " · " + version.note : ""}`,
              run: () => {
                const restored = { ...version.design, id: design.id, createdAt: design.createdAt, updatedAt: Date.now(), note: `Restored ${new Date(version.t).toLocaleDateString()}` };
                restored.versions = [{ t: design.updatedAt || Date.now(), note: design.note || "", design: stripDesign(design) }, ...design.versions.filter((_, j) => j !== i)].slice(0, 12);
                store(STORE.presets, library.map((entry) => (entry.id === design.id ? restored : entry)));
                toast("Version restored", "good");
                redraw();
              },
            }));
            showMenu(el, [
              { label: "Share link…", run: () => shareLink("design", stripDesign(design)) },
              { label: "Export file", run: () => download(fileSafe(design.name) + ".game.json", JSON.stringify(stripDesign(design), null, 2)) },
              { label: "Duplicate", run: () => {
                const now = Date.now();
                store(STORE.presets, library.concat({ ...stripDesign(design), id: "custom-" + now.toString(36), name: design.name + " copy", createdAt: now, updatedAt: now, versions: [] }));
                redraw();
              } },
              { label: "Rename…", run: () => {
                const name = prompt("Game name", design.name);
                if (!name) return;
                store(STORE.presets, library.map((entry) => (entry.id === design.id ? { ...entry, name: name.slice(0, 48) } : entry)));
                redraw();
              } },
              ...(versions.length || design.id === view.designId ? [{ label: "What changed…", run: () => openDiffDialog(design, versions.length ? "v0" : "saved", design.id === view.designId ? "table" : "saved") }] : []),
              ...(versions.length ? [{ heading: "Versions" }, ...versions] : []),
              "-",
              { label: "Delete", danger: true, run: () => {
                if (!confirm(`Delete “${design.name}” and its versions from this browser?`)) return;
                store(STORE.presets, library.filter((entry) => entry.id !== design.id));
                redraw();
              } },
            ]);
            break;
          }
          default: break;
        }
      });
    };
    openDialog(draw(), { wide: true, bind });
  }

  // --------------------------------------------------------- share links
  function toBase64Url(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function fromBase64Url(text) {
    const binary = atob(String(text).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  }

  async function encodePayload(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    if (typeof CompressionStream === "function") {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
      return "z" + toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
    }
    return "j" + toBase64Url(bytes);
  }

  async function decodePayload(text) {
    const kind = text[0];
    const bytes = fromBase64Url(text.slice(1));
    if (kind === "z") {
      if (typeof DecompressionStream !== "function") throw new Error("This browser can't open compressed links.");
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return JSON.parse(await new Response(stream).text());
    }
    if (kind === "j") return JSON.parse(new TextDecoder().decode(bytes));
    throw new Error("Unrecognised link.");
  }

  async function shareLink(kind, payload) {
    try {
      const link = `${location.origin}${location.pathname}#${kind}=${await encodePayload(payload)}`;
      const title = kind === "design" ? "Share this game design" : "Share this table";
      const note = kind === "design"
        ? "Anyone with the link can add this design to their games: groups, rules, actions, triggers, scoring and deck. No cards in play are included."
        : "The link holds the whole table, including every hidden card. Share it with co-designers, not opponents.";
      openDialog(head(title) + `<div class="dlg-body">
          <p class="hint">${note}</p>
          <textarea readonly id="shareLinkText" style="min-height:90px;font-size:12px">${esc(link)}</textarea>
          <div class="small dim">${link.length.toLocaleString()} characters</div>
        </div>
        <div class="dlg-foot"><button type="button" class="btn primary" data-copy-link>Copy link</button><button class="btn" value="cancel">Done</button></div>`, {
        bind(form) {
          form.querySelector("[data-copy-link]").addEventListener("click", () => {
            navigator.clipboard?.writeText(link).then(() => toast("Link copied", "good"), () => { $("#shareLinkText").select(); toast("Select the text and copy it"); });
          });
        },
      });
    } catch (error) {
      toast("Couldn't make a link: " + error.message, "error");
    }
  }

  async function openLinkFromHash() {
    const match = /^#(design|table)=(.+)$/.exec(location.hash || "");
    if (!match) return false;
    const clear = () => window.history.replaceState(null, "", location.pathname + location.search);
    let payload;
    try { payload = await decodePayload(match[2]); } catch (error) { clear(); toast("That link couldn't be opened: " + error.message, "error"); return false; }
    if (match[1] === "design") {
      if (!payload || !(payload.table || payload.seat)) { clear(); toast("That link isn't a game design.", "error"); return false; }
      openDialog(head("Game design from a link") + `<div class="dlg-body">
          <div><div class="small muted">${esc(payload.family || "Custom")}</div><h3 style="margin:2px 0 6px">${esc(payload.name || "Untitled")}</h3><p class="hint">${esc(payload.tagline || payload.description || "")}</p></div>
          <p class="hint">Adds it to My games in this browser. Nothing is uploaded anywhere.</p>
        </div>
        <div class="dlg-foot"><button class="btn" value="cancel">Ignore</button><button class="btn" value="add">Add to My games</button><button class="btn primary" value="play">Add & play</button></div>`, {
        onSubmit(form, value) {
          const library = loadLibrary();
          const now = Date.now();
          const design = { ...payload, id: "custom-" + now.toString(36), custom: true, createdAt: now, updatedAt: now, versions: [], note: "From a shared link" };
          store(STORE.presets, library.concat(design));
          toast(`Added “${design.name}” to My games`, "good");
          if (value === "play") startFromDesign(design);
        },
      });
    } else {
      openDialog(head("Table from a link") + `<div class="dlg-body"><p class="hint">Open the shared table “${esc(payload?.title || "Untitled")}”? Your current table stays in Undo.</p></div>
        <div class="dlg-foot"><button class="btn" value="cancel">Ignore</button><button class="btn primary" value="open">Open table</button></div>`, {
        onSubmit() {
          try { replaceState(E.migrate(payload), "Shared table opened"); } catch (error) { toast(error.message, "error"); }
        },
      });
    }
    clear();
    return true;
  }

  // ============================================================ TRIGGERS
  function openTriggerDialog(triggerId) {
    const v = view;
    const existing = triggerId ? v.triggers.find((entry) => entry.id === triggerId) : null;
    const draft = existing ? E.clone(existing) : { event: "played", zone: E.orderedZones(v, "table").find((zone) => zone.rule?.place)?.key || E.orderedZones(v, "table")[0]?.key || "", n: 0, phase: v.phases[0] || "", card: "", during: "", macro: v.macros[0]?.id || "", label: "", off: false };
    const refs = new Set();
    E.orderedZones(v, "table").forEach((zone) => refs.add(zone.key || zone.name.toLowerCase()));
    v.seatTemplate.forEach((tpl) => refs.add(tpl.key));
    const draw = () => {
      const fields = E.TRIGGER_EVENTS[draft.event].fields;
      return head(existing ? "Edit trigger" : "New trigger") + `<div class="dlg-body">
          <datalist id="triggerRefs">${Array.from(refs).filter(Boolean).map((ref) => `<option value="${esc(ref)}">`).join("")}</datalist>
          <div class="grid-2">
            <label class="field"><span>When</span><select name="event">${Object.entries(E.TRIGGER_EVENTS).map(([id, def]) => `<option value="${id}"${draft.event === id ? " selected" : ""}>${esc(def.label)}</option>`).join("")}</select></label>
            ${fields.includes("zone") ? `<label class="field"><span>Group <span class="dim">a table group, or a seat group for every player</span></span><input type="text" name="zone" list="triggerRefs" value="${esc(draft.zone)}" required></label>` : ""}
            ${fields.includes("n") ? (draft.event === "allFull" ? `<label class="field"><span>Cards in each</span><input type="number" name="n" min="1" max="500" value="${draft.n || 1}"></label>` : draft.event === "score" || draft.event === "counter" ? `<label class="field"><span>${draft.event === "counter" ? "Reaches" : "Score"}</span><input type="number" name="n" min="0" max="100000" value="${draft.n || 0}"></label>` : `<label class="field"><span>Cards <span class="dim">0 = one per active player</span></span><input type="number" name="n" min="0" max="500" value="${draft.n || 0}"></label>`) : ""}
            ${fields.includes("counter") ? `<label class="field"><span>Counter</span><select name="counter">${[...v.counterDefs.map((def) => [def.name, "per player"]), ...v.tableCounters.map((def) => [def.name, "table"])].map(([name, where]) => `<option value="${esc(name)}"${String(draft.counter || "").toLowerCase() === name.toLowerCase() ? " selected" : ""}>${esc(name)} (${where})</option>`).join("") || `<option value="">Add a counter first (Scores tab)</option>`}</select></label>` : ""}
            ${fields.includes("card") ? `<label class="field"><span>Card <span class="dim">rank, name or card like Qs; blank = any</span></span><input type="text" name="card" maxlength="24" value="${esc(draft.card || "")}" placeholder="e.g. Skip, 8, Qs"></label>` : ""}
            ${fields.includes("phase") ? `<label class="field"><span>Phase</span><input type="text" name="phase" list="phaseNames" value="${esc(draft.phase)}"></label>` : ""}
            <label class="field"><span>Only during phase <span class="dim">optional</span></span><input type="text" name="during" list="phaseNames" value="${esc(draft.during || "")}" placeholder="any phase"></label>
            <datalist id="phaseNames">${v.phases.map((phase) => `<option value="${esc(phase)}">`).join("")}</datalist>
            <label class="field"><span>Run action</span><select name="macro">${v.macros.map((macro) => `<option value="${macro.id}"${draft.macro === macro.id ? " selected" : ""}>${esc(macro.label)}</option>`).join("")}</select></label>
            <label class="field"><span>Label <span class="dim">optional</span></span><input type="text" name="label" maxlength="60" value="${esc(draft.label)}" placeholder="${esc(E.describeTrigger(draft, v))}"></label>
          </div>
          <label class="check"><input type="checkbox" name="on"${draft.off ? "" : " checked"}> Enabled</label>
          <p class="hint">Triggers fire after play (moves, draws, actions, turns), never while you set up or collect. Inside the action, <code>@subject</code> and <code>@winner</code> mean the player it fired for: whoever played the card, emptied their hand, played the last card, or won the game. “A card is played” is how you give cards effects, e.g. Skip → next turn.</p>
          ${v.macros.length ? "" : `<p class="hint" style="color:var(--gold)">Build an action first (Play → + New action). A trigger runs one.</p>`}
        </div>
        <div class="dlg-foot">${existing ? `<button class="btn danger" value="delete" style="margin-right:auto">Delete</button>` : ""}<button class="btn" value="cancel">Cancel</button><button class="btn primary" value="save" ${v.macros.length ? "" : "disabled"}>Save</button></div>`;
    };
    const sync = (form) => {
      draft.event = form.event.value;
      if (form.zone) draft.zone = form.zone.value;
      if (form.n) draft.n = Number(form.n.value) || 0;
      if (form.phase) draft.phase = form.phase.value;
      if (form.card) draft.card = form.card.value;
      if (form.counter) draft.counter = form.counter.value;
      draft.during = form.during.value;
      if (form.macro) draft.macro = form.macro.value;
      draft.label = form.label.value;
      draft.off = !form.on.checked;
    };
    openDialog(draw(), {
      bind(form) {
        form.addEventListener("change", (event) => {
          if (event.target.name !== "event") return;
          sync(form);
          form.innerHTML = draw();
        });
      },
      onSubmit(form, value) {
        if (value === "delete") return dispatch({ type: "deleteTrigger", id: triggerId });
        sync(form);
        dispatch({ type: "saveTrigger", trigger: { ...draft, id: existing?.id } });
      },
    });
  }

  // ====================================================== SCORING RULES
  const RANK_LABELS = E.STD_RANKS.map((rank) => [rank, RANK_SHOW(rank)]);

  function openSchemeDialog(schemeId, opts = {}) {
    const v = view;
    const existing = schemeId ? v.schemes.find((entry) => entry.id === schemeId) : null;
    const scheme = existing ? E.clone(existing) : E.sanitizeScheme(E.emptyState(), { name: "Card points" });
    if (!existing) scheme.id = "s" + Date.now().toString(36);
    const sample = opts.sample || selectionText() || "A♠ K♠ Q♠ 5♥ 5♦ 7♣";
    const zones = [...E.orderedZones(v, "table"), ...v.seatTemplate.map((tpl) => ({ ...tpl, seat: true }))];
    const num = (name, value, extra = "") => `<input type="number" name="${name}" value="${esc(value)}" step="any" ${extra}>`;
    const html = head(existing ? `Edit “${scheme.name}”` : "New scoring rule") + `<div class="dlg-body">
        <div class="grid-2">
          <label class="field"><span>Name</span><input type="text" name="name" maxlength="28" value="${esc(scheme.name)}" required></label>
          <label class="check" style="align-self:end;min-height:32px"><input type="checkbox" name="low"${scheme.low ? " checked" : ""}> Lower totals are better (penalty points)</label>
        </div>
        <div class="field"><span>Card values</span>
          <div class="value-grid">${RANK_LABELS.map(([rank, label]) => `<label><span>${label}</span>${num("rank-" + rank, scheme.ranks[rank])}</label>`).join("")}<label><span>Joker</span>${num("joker", scheme.joker)}</label></div>
          <div class="row tight"><button type="button" class="btn sm" data-preset-values="pip">Pips (faces 10)</button><button type="button" class="btn sm" data-preset-values="rank">Rank (J11 Q12 K13 A14)</button><button type="button" class="btn sm" data-preset-values="zero">All zero</button></div>
        </div>
        <div class="field"><span>Suit bonus <span class="dim">added to every card of the suit</span></span>
          <div class="value-grid four">${E.STD_SUITS.map((suit) => `<label><span class="${suit === "h" || suit === "d" ? "red-text" : ""}">${SUIT_SYMBOL[suit]}</span>${num("suit-" + suit, scheme.suits[suit])}</label>`).join("")}</div>
        </div>
        <label class="field"><span>Specific cards <span class="dim">override values: <code>Qs=13, 8=50, hearts=1, Wild=50</code></span></span><input type="text" name="cards" value="${esc(scheme.cards)}" placeholder="Qs=13, 8=50"></label>
        <label class="check"><input type="checkbox" name="customValues"${scheme.customValues ? " checked" : ""}> Custom cards score their printed value</label>
        <div class="field"><span>Combination bonuses</span>
          <div class="grid-3">
            <label class="field"><span>Each pair</span>${num("pair", scheme.pair)}</label>
            <label class="field"><span>Three of a kind</span>${num("trips", scheme.trips)}</label>
            <label class="field"><span>Four of a kind</span>${num("quads", scheme.quads)}</label>
            <label class="field"><span>Run, per card</span>${num("run", scheme.run)}</label>
            <label class="field"><span>Shortest run</span>${num("runMin", scheme.runMin, 'min="2" max="13"')}</label>
            <label class="check" style="align-self:end"><input type="checkbox" name="runSuited"${scheme.runSuited ? " checked" : ""}> Runs must share a suit</label>
            <label class="field"><span>Flush bonus</span>${num("flush", scheme.flush)}</label>
            <label class="field"><span>Cards for a flush</span>${num("flushMin", scheme.flushMin, 'min="2" max="13"')}</label>
          </div>
        </div>
        <div class="card-block">
          <label class="field"><span>Try it <span class="dim">cards like “As Kd 10h”, custom card names, or Joker</span></span><input type="text" name="sample" value="${esc(sample)}"></label>
          <div id="schemePreview" class="scheme-preview"></div>
        </div>
        <label class="field"><span>Attach to a group <span class="dim">shows as a badge and can be scored by actions</span></span><select name="attach"><option value="">(don't attach)</option>${zones.map((zone) => `<option value="${esc(zone.seat ? "seat:" + zone.key : zone.id)}">${esc(zone.name)}${zone.seat ? " (every seat)" : ""}${(zone.evals || []).includes("points:" + scheme.id) ? " ✓" : ""}</option>`).join("")}</select></label>
      </div>
      <div class="dlg-foot">${existing ? `<button class="btn danger" value="delete" style="margin-right:auto">Delete</button>` : ""}<button class="btn" value="cancel">Cancel</button><button class="btn primary" value="save">Save</button></div>`;
    const read = (form) => {
      const out = { id: scheme.id, name: form.name.value, low: form.low.checked, ranks: {}, suits: {}, joker: form.joker.value, cards: form.cards.value, customValues: form.customValues.checked };
      for (const rank of E.STD_RANKS) out.ranks[rank] = form["rank-" + rank].value;
      for (const suit of E.STD_SUITS) out.suits[suit] = form["suit-" + suit].value;
      for (const key of ["pair", "trips", "quads", "run", "runMin", "flush", "flushMin"]) out[key] = form[key].value;
      out.runSuited = form.runSuited.checked;
      return E.sanitizeScheme(E.emptyState(), out);
    };
    const preview = (form) => {
      const clean = read(form);
      const cards = parseSampleCards(form.sample.value);
      const result = cards.length ? V.evaluate("custom-points", cards, { scheme: clean }) : null;
      $("#schemePreview").innerHTML = result
        ? `<strong>${esc(result.label)}</strong>${result.breakdown?.length ? `<div class="breakdown-row">${result.breakdown.map((part) => `<span>${esc(part.label)} ${esc(E.fmt(part.points))}</span>`).join("")}</div>` : ""}`
        : `<span class="muted small">Type some cards to see how they score.</span>`;
    };
    openDialog(html, {
      wide: true,
      bind(form) {
        preview(form);
        form.addEventListener("input", () => preview(form));
        form.addEventListener("click", (event) => {
          const button = event.target.closest("[data-preset-values]");
          if (!button) return;
          const kind = button.dataset.presetValues;
          for (const rank of E.STD_RANKS) {
            form["rank-" + rank].value = kind === "zero" ? 0 : kind === "rank" ? E.RANK_ORDER[rank] : E.PIP_DEFAULT[rank];
          }
          preview(form);
        });
      },
      onSubmit(form, value) {
        if (value === "delete") {
          if (confirm(`Delete “${scheme.name}”? Groups using it lose that badge.`)) dispatch({ type: "deleteScheme", id: scheme.id });
          return;
        }
        const clean = read(form);
        dispatch({ type: "saveScheme", scheme: clean });
        const attach = form.attach.value;
        if (attach) {
          const spec = "points:" + clean.id;
          const zone = attach.startsWith("seat:")
            ? E.orderedZones(view, view.players.find((player) => E.orderedZones(view, player.id).some((z) => z.key === attach.slice(5)))?.id || "").find((z) => z.key === attach.slice(5))
            : view.zones[attach];
          if (zone && !(zone.evals || []).includes(spec)) dispatch({ type: "updateZone", zone: zone.id, patch: { evals: [...(zone.evals || []), spec].slice(0, 6) }, allSeats: attach.startsWith("seat:") });
        }
      },
    });
  }

  /** Cards typed by a designer: "As Kd 10h", "Joker", or custom card names. */
  function parseSampleCards(text) {
    const out = [];
    const customs = [...(view?.deckSpec?.custom || [])];
    for (const token of String(text || "").split(/[,\s]+/).filter(Boolean)) {
      const std = V.parseCard(token);
      if (std) { out.push(std); continue; }
      const custom = customs.find((item) => item.label.toLowerCase() === token.toLowerCase() || (item.rank || "").toLowerCase() === token.toLowerCase());
      if (custom) out.push({ rank: custom.rank || custom.label, suit: "x", custom: true, label: custom.label, value: custom.value });
    }
    return out;
  }

  function selectionText() {
    if (!view || !selection.size) return "";
    return Array.from(selection).map((id) => view.cards[id]).filter((card) => card?.visible).map((card) => (card.custom ? card.label : RANK_SHOW(card.rank) + card.suit)).join(" ");
  }

  // ============================================================ GAME OVER
  function renderGameOver() {
    const el = $("#gameOver");
    const v = view;
    const over = v?.gameOver;
    if (!over || over.dismissed) { el.hidden = true; return; }
    const totals = E.totals(v);
    const names = over.winners.map((id) => E.playerById(v, id)?.name).filter(Boolean);
    const standings = v.players.slice().sort((a, b) => (v.scores.lowWins ? totals[a.id] - totals[b.id] : totals[b.id] - totals[a.id]));
    el.hidden = false;
    if (confettiFor !== over.t) { confettiFor = over.t; confetti(); playSound("win"); }
    el.innerHTML = `<div class="go-title">🏁 ${esc(names.join(" & "))} win${names.length > 1 ? "" : "s"}!</div>
      <div class="small muted">${esc(over.reason)}</div>
      <div class="go-standings">${standings.map((player, i) => `<span style="--c:${esc(player.color)}"><i class="swatch"></i>${i + 1}. ${esc(player.name)} <b>${E.fmt(totals[player.id])}</b></span>`).join("")}</div>
      <div class="row">
        ${net.mode !== "client" ? `<button class="btn sm primary" data-act="play-again">Play again</button>` : ""}
        <button class="btn sm" data-act="open-tab" data-tab="scores">Results & stats</button>
        <button class="btn sm ghost" data-act="dismiss-over">Keep playing</button>
      </div>`;
    if (net.mode !== "client") recordResult(state, true);
  }

  function restartSameSetup() {
    if (net.mode === "client") return toast("Only the host can restart.", "error");
    const preset = E.toPreset(state);
    const next = E.createTable(preset, { players: state.players.map((p) => ({ name: p.name, color: p.color, clientId: p.clientId })) });
    next.title = state.title;
    next.designId = state.designId || null;
    replaceState(next, "Fresh start");
  }

  // ============================================================= RESULTS
  function loadResults() {
    const list = load(STORE.results, []);
    return Array.isArray(list) ? list : [];
  }

  /** Record a finished (or abandoned) game for playtest stats. Auto-records each game-over once. */
  function recordResult(source, auto = false) {
    if (!source || !source.players.length) return false;
    const key = auto ? `over:${source.startedAt || 0}:${source.gameOver?.t || 0}` : `manual:${Date.now()}`;
    const results = loadResults();
    if (results.some((entry) => entry.key === key)) return false;
    const totals = E.totals(source);
    const best = source.gameOver?.winners || E.leaders(source);
    results.unshift({
      key,
      title: source.title,
      designId: source.designId || null,
      t: Date.now(),
      rounds: source.turn.round,
      durationMs: source.startedAt ? Date.now() - source.startedAt : 0,
      lowWins: Boolean(source.scores.lowWins),
      players: source.players.map((player, seat) => ({ name: player.name, seat, total: totals[player.id] || 0, won: best.includes(player.id) })),
    });
    store(STORE.results, results.slice(0, 500));
    if (!auto) toast("Result recorded", "good");
    return true;
  }

  function resultsHTML(v) {
    const all = loadResults();
    const mine = all.filter((entry) => (v.designId && entry.designId === v.designId) || entry.title === v.title);
    if (!mine.length) return `<p class="hint">Finished games are recorded automatically when someone hits the target or the round limit. For other games, record the result yourself.</p>
      <div class="row"><button class="btn sm" data-act="record-result">Record current result</button></div>`;
    const seats = Math.max(...mine.map((entry) => entry.players.length));
    const wins = Array.from({ length: seats }, () => 0);
    const played = Array.from({ length: seats }, () => 0);
    let rounds = 0;
    let duration = 0;
    for (const entry of mine) {
      rounds += entry.rounds || 0;
      duration += entry.durationMs || 0;
      entry.players.forEach((player) => { played[player.seat] += 1; if (player.won) wins[player.seat] += 1; });
    }
    const minutes = Math.round(duration / mine.length / 60000);
    const seatRows = wins.map((count, seat) => {
      const rate = played[seat] ? count / played[seat] : 0;
      return `<div class="row tight" style="flex-wrap:nowrap"><span class="small" style="width:52px">Seat ${seat + 1}</span><div class="prob-bar grow"><span style="width:${rate * 100}%"></span><em>${pct(rate)} · ${count}/${played[seat]}</em></div></div>`;
    }).join("");
    const recent = mine.slice(0, 8).map((entry) => `<div class="log-item"><time>${new Date(entry.t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time><div>${entry.players.filter((player) => player.won).map((player) => `<b>${esc(player.name)}</b>`).join(" & ") || "—"} <span class="muted small">${entry.players.map((player) => `${esc(player.name)} ${E.fmt(player.total)}`).join(" · ")}</span></div></div>`).join("");
    return `<div class="stat-row"><div><b>${mine.length}</b><span>games</span></div><div><b>${(rounds / mine.length).toFixed(1)}</b><span>avg rounds</span></div><div><b>${minutes || "<1"}</b><span>avg minutes</span></div></div>
      <div class="small muted">Win rate by seat (seat 1 is first at the table)</div>
      <div class="list">${seatRows}</div>
      <div class="log">${recent}</div>
      <div class="row"><button class="btn sm" data-act="record-result">Record current result</button><button class="btn sm" data-act="export-results">Export CSV</button><button class="btn sm danger" data-act="clear-results">Clear</button></div>`;
  }

  // =========================================================== SIMULATOR
  const sim = { running: false, progress: 0, result: null, cfg: { macro: "", target: "", evaluator: "", trials: 1000 } };
  let seededFn = null;

  function simTargets(v) {
    const out = [];
    for (const tpl of v.seatTemplate) out.push(["seat:" + tpl.key, `Every ${tpl.name} (compare seats)`]);
    for (const zone of E.orderedZones(v, "table")) if (zone.kind !== "deck") out.push(["zone:" + zone.id, zone.name]);
    return out;
  }

  function runSimulation() {
    if (net.mode === "client") return toast("Only the host can simulate: it needs every card.", "error");
    if (sim.running) return;
    const base = E.clone(state);
    base.log = [];
    base.gameOver = null;
    const macro = base.macros.find((entry) => entry.id === sim.cfg.macro) || base.macros[0];
    if (!macro) return toast("Build an action (e.g. a deal) to simulate.", "error");
    const target = sim.cfg.target || simTargets(base)[0]?.[0];
    if (!target) return toast("Add a group to measure.", "error");
    const trials = Math.max(50, Math.min(20000, Number(sim.cfg.trials) || 1000));
    const counts = new Map();
    const seatWins = [];
    let valueSum = 0;
    let valueN = 0;
    let ties = 0;
    let failures = 0;
    let done = 0;
    const started = performance.now();
    const previousRng = E.getRng();
    E.setRng(Math.random);
    sim.running = true;
    sim.progress = 0;
    const [kind, ref] = [target.slice(0, target.indexOf(":")), target.slice(target.indexOf(":") + 1)];
    const chunk = () => {
      const end = Math.min(trials, done + 200);
      for (; done < end; done += 1) {
        let s;
        try { s = E.reduce(base, { type: "runMacro", id: macro.id }, null); } catch (error) { failures += 1; continue; }
        const zones = kind === "seat" ? s.players.map((player) => E.orderedZones(s, player.id).find((zone) => zone.key === ref) || null) : [s.zones[ref]];
        let best = null;
        let bestSeat = -1;
        let tied = false;
        zones.forEach((zone, seat) => {
          if (!zone) return;
          const spec = sim.cfg.evaluator || zone.evals?.[0];
          if (!spec) return;
          const result = E.evaluateSpec(s, zone, spec);
          if (!result) return;
          const label = result.short || result.label;
          counts.set(label, (counts.get(label) || 0) + 1);
          if (Number.isFinite(Number(result.value))) { valueSum += Number(result.value); valueN += 1; }
          if (best === null || result.score > best) { best = result.score; bestSeat = seat; tied = false; }
          else if (result.score === best) tied = true;
          seatWins[seat] = seatWins[seat] || 0;
        });
        if (zones.length > 1 && bestSeat >= 0) { if (tied) ties += 1; else seatWins[bestSeat] = (seatWins[bestSeat] || 0) + 1; }
      }
      sim.progress = done / trials;
      if (done < trials && sim.running) {
        if (prefs.tab === "tools") renderPane();
        setTimeout(chunk, 0);
        return;
      }
      E.setRng(previousRng);
      sim.running = false;
      const samples = Array.from(counts.values()).reduce((a, b) => a + b, 0);
      sim.result = {
        macro: macro.label,
        target: simTargets(base).find(([value]) => value === target)?.[1] || target,
        trials: done,
        failures,
        ms: performance.now() - started,
        samples,
        rows: Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([label, count]) => [label, count / Math.max(1, samples)]),
        average: valueN ? valueSum / valueN : null,
        seats: kind === "seat" ? { wins: seatWins.map((count) => (count || 0) / Math.max(1, done)), ties: ties / Math.max(1, done) } : null,
      };
      renderPane();
    };
    renderPane();
    setTimeout(chunk, 0);
  }

  function simulatorHTML(v) {
    const targets = simTargets(v);
    const evaluators = [["", "Group's own scoring"], ...V.EVALUATORS.filter((def) => !def.hidden).map((def) => [def.id, def.label]), ...v.schemes.map((scheme) => ["points:" + scheme.id, "★ " + scheme.name])];
    const r = sim.result;
    const rows = r ? r.rows.slice(0, 14).map(([label, p]) => `<div class="row tight" style="flex-wrap:nowrap"><span class="small sim-label" title="${esc(label)}">${esc(label)}</span><div class="prob-bar grow"><span style="width:${p * 100}%"></span><em>${pct(p)}</em></div></div>`).join("") : "";
    const seats = r?.seats ? r.seats.wins.map((p, i) => `<div class="row tight" style="flex-wrap:nowrap"><span class="small sim-label">${esc(v.players[i]?.name || "Seat " + (i + 1))}</span><div class="prob-bar grow"><span style="width:${p * 100}%"></span><em>${pct(p)}</em></div></div>`).join("") : "";
    return `<div class="grid-2">
        <label class="field"><span>Run action</span><select id="simMacro">${v.macros.map((macro) => `<option value="${macro.id}"${sim.cfg.macro === macro.id ? " selected" : ""}>${esc(macro.label)}</option>`).join("")}</select></label>
        <label class="field"><span>Then measure</span><select id="simTarget">${targets.map(([value, label]) => `<option value="${esc(value)}"${sim.cfg.target === value ? " selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
        <label class="field"><span>Scored by</span><select id="simEval">${evaluators.map(([value, label]) => `<option value="${esc(value)}"${sim.cfg.evaluator === value ? " selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
        <label class="field"><span>Trials</span><input id="simTrials" type="number" min="50" max="20000" step="50" value="${sim.cfg.trials}"></label>
      </div>
      <div class="row"><button class="btn primary" data-act="simulate" ${sim.running ? "disabled" : ""}>${sim.running ? `Running… ${Math.round(sim.progress * 100)}%` : "Simulate"}</button><span class="muted small">Runs the action on a copy of the table: your game isn't touched.</span></div>
      ${r ? `<div class="small dim">${r.trials.toLocaleString()} × “${esc(r.macro)}” → ${esc(r.target)} in ${Math.round(r.ms)} ms${r.failures ? ` · ${r.failures} failed` : ""}${r.average !== null ? ` · average value ${r.average.toFixed(2)}` : ""}</div>
        <div class="list">${rows || `<p class="hint">Nothing to score. Is an evaluator attached to that group?</p>`}</div>
        ${seats ? `<div class="small muted">Best hand by seat${r.seats.ties ? ` (ties ${pct(r.seats.ties)})` : ""}</div><div class="list">${seats}</div>` : ""}` : ""}`;
  }

  function setSeed(seed) {
    const clean = String(seed || "").trim().slice(0, 40);
    prefs.seed = clean;
    savePrefs();
    if (clean) {
      seededFn = E.seededRng(clean);
      E.setRng(seededFn);
      toast(`Shuffles now follow seed “${clean}”`, "good");
    } else {
      seededFn = null;
      E.setRng(() => {
        const buffer = new Uint32Array(1);
        crypto.getRandomValues(buffer);
        return buffer[0] / 4294967296;
      });
      toast("Shuffles are random again");
    }
  }

  // ====================================================== BROWSE / INSPECT
  let browseQuery = "";
  function openBrowseDialog(zoneId) {
    const picked = new Set();
    browseQuery = "";
    const draw = () => {
      const v = view;
      const zone = v.zones[zoneId];
      if (!zone) return head("Browse") + `<div class="dlg-body"><p class="hint">That group is gone.</p></div><div class="dlg-foot"><button class="btn" value="cancel">Close</button></div>`;
      const cards = zone.cards.map((id, index) => ({ card: v.cards[id], index })).filter((entry) => entry.card).reverse();
      const hand = myHandZone();
      return head(`${zone.name} · ${zone.cards.length} card${zone.cards.length === 1 ? "" : "s"}`) + `<div class="dlg-body">
          <p class="hint">${zone.layout === "stack" ? "Top of the pile first. " : "Last card first. "}Tap cards to pick them, then move them anywhere.${cards.some((entry) => !entry.card.visible) ? " Face-down cards stay hidden unless you're in X-ray view." : ""}</p>
          ${cards.filter((entry) => entry.card.visible).length > 8 ? `<input type="search" class="browse-search" placeholder="Find cards: rank, suit or name" value="${esc(browseQuery)}">` : ""}
          <div class="browse-grid">${cards.map(({ card, index }) => `<button type="button" class="browse-card${picked.has(card.id) ? " on" : ""}" data-pick="${esc(card.id)}" data-find="${esc(card.visible ? (card.custom ? `${card.label} ${card.suit} ${card.rank}` : `${E.cardName(card)} ${RANK_SHOW(card.rank)} ${E.SUIT_INFO[card.suit]?.name || ""}`).toLowerCase() : "hidden")}">${cardHTML(card, zone, index)}</button>`).join("") || `<p class="muted">Empty.</p>`}</div>
        </div>
        <div class="dlg-foot">
          <span class="grow small muted">${picked.size} picked</span>
          <button type="button" class="btn sm" data-browse="all">Pick all</button>
          ${hand && hand !== zoneId ? `<button type="button" class="btn sm" data-browse="hand" ${picked.size ? "" : "disabled"}>To my hand</button>` : ""}
          <select id="browseTo" style="width:auto;max-width:180px">${zoneOptions("", {})}</select>
          <button type="button" class="btn sm primary" data-browse="move" ${picked.size ? "" : "disabled"}>Move</button>
          <button class="btn" value="cancel">Done</button>
        </div>`;
    };
    const filterBrowse = (form) => {
      const words = browseQuery.toLowerCase().split(/\s+/).filter(Boolean);
      $$("[data-find]", form).forEach((el) => { el.hidden = !words.every((word) => el.dataset.find.includes(word)); });
    };
    const redraw = (form) => {
      form.innerHTML = draw();
      filterBrowse(form);
    };
    openDialog(draw(), {
      wide: true,
      bind(form) {
        filterBrowse(form);
        form.addEventListener("input", (event) => {
          if (!event.target.classList.contains("browse-search")) return;
          browseQuery = event.target.value;
          filterBrowse(form);
        });
        form.addEventListener("click", (event) => {
          const pick = event.target.closest("[data-pick]");
          if (pick) {
            const id = pick.dataset.pick;
            if (picked.has(id)) picked.delete(id); else picked.add(id);
            redraw(form);
            return;
          }
          const button = event.target.closest("[data-browse]");
          if (!button) return;
          const zone = view.zones[zoneId];
          if (button.dataset.browse === "all") { zone?.cards.forEach((id) => picked.add(id)); redraw(form); return; }
          const to = button.dataset.browse === "hand" ? myHandZone() : $("#browseTo").value;
          const ids = (zone?.cards || []).filter((id) => picked.has(id));
          if (!to || !ids.length) return;
          dispatch({ type: "move", cards: ids, to });
          picked.clear();
          redraw(form);
        });
      },
    });
  }

  function inspectCard(cardId) {
    const v = view;
    const card = v?.cards[cardId];
    if (!card) return;
    const zone = E.zoneOf(v, cardId);
    const index = zone ? zone.cards.indexOf(cardId) : 0;
    const facts = [];
    if (card.visible) facts.push(card.custom ? `<b>${esc(card.label)}</b>` : `<b>${esc(E.cardName(card))}</b>`);
    else facts.push("<b>Face-down card</b>");
    if (card.custom && card.visible) {
      if (card.suit && card.suit !== "x") facts.push(`Suit: ${esc(card.suit)}`);
      if (card.rank && card.rank !== card.label) facts.push(`Rank: ${esc(card.rank)}`);
      if (card.value) facts.push(`Value: ${esc(card.value)}`);
      if (card.text) facts.push(esc(card.text));
    }
    if (zone) facts.push(`In ${esc(E.zoneLabel(v, zone))}`);
    if (card.playedBy) facts.push(`Played by ${esc(E.playerById(v, card.playedBy)?.name || "?")}`);
    openDialog(head("Card") + `<div class="dlg-body inspect-body"><div class="inspect-card" style="--cw:min(220px, 56vw)">${cardHTML({ ...card }, zone || { visibility: "public" }, index)}</div><div class="list">${facts.map((fact) => `<div class="small">${fact}</div>`).join("")}</div></div>
      <div class="dlg-foot"><button class="btn primary" value="cancel">Close</button></div>`);
  }

  // ====================================================== COMMAND PALETTE
  function paletteCommands() {
    const v = view;
    const list = [];
    const add = (group, label, run, hint = "") => list.push({ group, label, run, hint });
    v.macros.forEach((macro, i) => add("Actions", macro.label, () => dispatch({ type: "runMacro", id: macro.id }), (i < 9 ? `${i + 1} · ` : "") + (macro.hint || macro.steps.map((step) => E.describeStep(step, v)).join(" → "))));
    add("Turn", "Next player", () => dispatch({ type: "nextTurn" }), "T");
    add("Turn", "Previous player", () => dispatch({ type: "nextTurn", back: true }), "Shift+T");
    add("Turn", "Next phase", () => dispatch({ type: "nextPhase" }));
    add("Turn", "Next round", () => dispatch({ type: "nextRound" }));
    add("Turn", "Pass the deal", () => dispatch({ type: "passDeal" }));
    add("Table", "Collect all & shuffle", () => dispatch({ type: "collect", shuffle: true }));
    add("Table", "Reveal every hand", () => dispatch({ type: "revealAll" }));
    add("Table", "Undo", undo, "Ctrl+Z");
    add("Table", "Redo", redo, "Ctrl+Shift+Z");
    add("Table", "New group on the table", () => openZoneDialog(null, { area: "table" }));
    add("Table", "New group at every seat", () => openZoneDialog(null, { area: "seats" }));
    add("Table", "Add player", () => dispatch({ type: "addPlayer" }));
    for (const zone of E.orderedZones(v, "table")) {
      add("Groups", `Browse ${zone.name}`, () => openBrowseDialog(zone.id));
      add("Groups", `Edit ${zone.name}`, () => openZoneDialog(zone.id));
      add("Groups", `Shuffle ${zone.name}`, () => dispatch({ type: "shuffle", zone: zone.id }));
    }
    const mySeat = mySeatId() || v.players[v.turn.index]?.id;
    if (mySeat) for (const zone of E.orderedZones(v, mySeat)) add("Groups", `Browse my ${zone.name}`, () => openBrowseDialog(zone.id));
    add("Design", "Design a new game (wizard)", openWizard);
    add("Design", "New action", () => openMacroDialog(null));
    add("Design", recorder.on ? "Stop recording" : "Record an action", recorder.on ? stopRecording : startRecording);
    add("Design", "Check design", () => { openTab("rules"); document.querySelector("#pane")?.scrollTo({ top: 0 }); });
    add("Design", "New trigger", () => openTriggerDialog(null));
    add("Design", "New scoring rule", () => openSchemeDialog(null));
    add("Design", "Save to My games", () => saveDesign());
    add("Design", "My games…", openLibrary);
    add("Design", "Share design link", () => shareLink("design", stripDesign(E.toPreset(state || v))));
    add("Design", "Share table link (includes hidden cards)", () => shareLink("table", net.mode === "client" ? v : state));
    add("Design", "Generate rules from table", () => { prefs.tab = "rules"; prefs.side = true; savePrefs(); dispatch({ type: "setNotes", notes: E.describeGame(state || v) }); });
    for (const [mode, label] of Object.entries(E.RULES_MODES)) add("Rules", `Rule checks: ${label}`, () => dispatch({ type: "setRules", mode }));
    add("Tools", "Simulate an action", () => openTab("tools"));
    add("Tools", "Record result", () => recordResult(state || v));
    add("Tools", "Replay recent moves", startReplay);
    add("Tools", "Big scoreboard", openScoreboard);
    add("Tools", "Hint: suggest a play", showHint, "H");
    add("Tools", "Roll a die", () => dispatch({ type: "roll", sides: 6, count: 1 }));
    add("Tools", "Flip a coin", () => dispatch({ type: "coin" }));
    for (const tab of ["play", "scores", "seats", "deck", "tools", "log", "rules"]) add("Panels", `Open ${tab[0].toUpperCase() + tab.slice(1)}`, () => openTab(tab));
    add("Panels", "How it works & shortcuts", openHelp, "?");
    add("Panels", "Take the tour", startTour);
    add("Display", prefs.sound ? "Turn sound effects off" : "Turn sound effects on", () => { prefs.sound = !prefs.sound; savePrefs(); playSound("turn"); renderPane(); });
    add("Display", prefs.layout === "around" ? "Seats: grid" : "Seats: around the table", () => { prefs.layout = prefs.layout === "around" ? "grid" : "around"; savePrefs(); render(); });
    add("Display", prefs.jumbo ? "Normal card indexes" : "Jumbo card indexes", () => { prefs.jumbo = !prefs.jumbo; savePrefs(); render(); });
    if (net.mode === "local") {
      for (const [mode, label] of [["hands", "All hands"], ["xray", "X-ray (referee)"], ["pass", "Pass & play"]]) add("View", `View: ${label}`, () => setViewMode(mode));
      for (const player of v.players) add("View", `View as ${player.name}`, () => setViewMode("seat:" + player.id));
    }
    for (const preset of allPresets()) add("New game", preset.name, () => startFromDesign(preset), preset.family);
    return list;
  }

  function openTab(tab) {
    prefs.tab = tab;
    prefs.side = true;
    savePrefs();
    renderPane();
  }

  function setViewMode(mode) {
    prefs.viewMode = mode;
    passRevealed = null;
    savePrefs();
    selection.clear();
    render();
  }

  function openPalette() {
    const commands = paletteCommands();
    let query = "";
    let active = 0;
    const matches = () => {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      return commands.filter((command) => words.every((word) => `${command.group} ${command.label} ${command.hint}`.toLowerCase().includes(word))).slice(0, 60);
    };
    const list = () => {
      const found = matches();
      active = Math.min(active, Math.max(0, found.length - 1));
      return found.map((command, i) => `<button type="button" class="pal-item${i === active ? " on" : ""}" data-i="${i}"><span class="pal-group">${esc(command.group)}</span><span class="grow">${esc(command.label)}</span><span class="pal-hint">${esc(command.hint)}</span></button>`).join("") || `<div class="muted small" style="padding:10px">No matches</div>`;
    };
    openDialog(`<div class="dlg-body palette"><input type="search" id="palInput" placeholder="Type a command, action, group or game…" autocomplete="off"><div class="pal-list" id="palList">${list()}</div></div>`, {
      bind(form) {
        const input = form.querySelector("#palInput");
        const refresh = () => { form.querySelector("#palList").innerHTML = list(); form.querySelector(".pal-item.on")?.scrollIntoView({ block: "nearest" }); };
        const runAt = (i) => {
          const command = matches()[i];
          if (!command) return;
          closeDialog();
          command.run();
        };
        input.addEventListener("input", () => { query = input.value; active = 0; refresh(); });
        input.addEventListener("keydown", (event) => {
          const count = matches().length;
          if (event.key === "ArrowDown") { active = (active + 1) % Math.max(1, count); refresh(); event.preventDefault(); }
          else if (event.key === "ArrowUp") { active = (active - 1 + count) % Math.max(1, count); refresh(); event.preventDefault(); }
          else if (event.key === "Enter") { event.preventDefault(); runAt(active); }
        });
        form.addEventListener("click", (event) => {
          const item = event.target.closest(".pal-item");
          if (item) runAt(Number(item.dataset.i));
        });
        setTimeout(() => input.focus(), 0);
      },
    });
    dialog().classList.add("palette-dialog");
  }

  // ====================================================== CUSTOM CARD CSV
  const COLOR_NAMES = { red: "#d9434b", yellow: "#b98a00", green: "#23915a", blue: "#3b63d9", black: "#2a2d36", purple: "#7a52e0", violet: "#7a52e0", orange: "#e07b28", pink: "#d6488f", teal: "#159a9c", gray: "#6b7280", grey: "#6b7280", white: "#9ca3af", gold: "#c9a227", brown: "#8b5a2b" };
  const CUSTOM_COLUMNS = ["label", "count", "color", "value", "suit", "rank", "icon", "text", "image", "home"];
  const COLUMN_ALIASES = { name: "label", title: "label", label: "label", card: "label", copies: "count", count: "count", qty: "count", quantity: "count", color: "color", colour: "color", points: "value", value: "value", score: "value", suit: "suit", group: "suit", rank: "rank", number: "rank", icon: "icon", symbol: "icon", emoji: "icon", text: "text", rules: "text", effect: "text", description: "text", image: "image", art: "image", picture: "image", url: "image", home: "home", pile: "home", starts: "home" };

  function splitRow(line, delimiter) {
    const out = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cell += '"'; i += 1; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === delimiter) { out.push(cell); cell = ""; }
      else cell += ch;
    }
    out.push(cell);
    return out.map((value) => value.trim());
  }

  /** Rows pasted from a spreadsheet → custom card types. A header row may name/reorder the columns. */
  function parseCustomRows(text) {
    const lines = String(text || "").split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) return [];
    const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
    let columns = CUSTOM_COLUMNS;
    const first = splitRow(lines[0], delimiter).map((cell) => cell.toLowerCase());
    if (first.some((cell) => COLUMN_ALIASES[cell]) && !first.some((cell) => /^\d+$/.test(cell))) {
      columns = first.map((cell) => COLUMN_ALIASES[cell] || "");
      lines.shift();
    }
    return lines.map((line) => {
      const cells = splitRow(line, delimiter);
      const item = {};
      columns.forEach((key, i) => { if (key && cells[i]) item[key] = cells[i]; });
      if (!item.label) return null;
      const named = COLOR_NAMES[String(item.color || "").toLowerCase()] || COLOR_NAMES[String(item.suit || "").toLowerCase()];
      return {
        label: item.label.slice(0, 24),
        count: Math.max(1, Math.min(20, Number(item.count) || 1)),
        color: /^#[0-9a-f]{6}$/i.test(item.color || "") ? item.color : named || "#9f7dff",
        value: Number(item.value) || 0,
        suit: item.suit || "",
        rank: item.rank || "",
        icon: item.icon || "",
        text: item.text || "",
        image: item.image || "",
        home: item.home || "",
      };
    }).filter(Boolean);
  }

  function customCardsCsv(items) {
    const quote = (cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`;
    const header = ["name", "copies", "color", "points", "suit", "rank", "icon", "text", "image", "home"];
    return [header.join(","), ...items.map((item) => CUSTOM_COLUMNS.map((key) => quote(item[key])).join(","))].join("\n");
  }

  function openCustomImport() {
    openDialog(head("Import custom cards") + `<div class="dlg-body">
        <p class="hint">Paste rows from a spreadsheet (tab or comma separated). Columns in order: <code>name, copies, color, points, suit, rank, icon, text, image</code>, or give a header row naming them in any order. Colors can be hex (#d9434b) or names (red, blue…); image is an optional https link to card art.</p>
        <textarea name="rows" style="min-height:200px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px" placeholder="name,copies,color,points,suit,rank,icon,text&#10;Skip,2,red,20,Red,Skip,⊘,The next player loses a turn&#10;7,2,blue,7,Blue,7"></textarea>
        <label class="check"><input type="checkbox" name="replace"> Replace the existing custom cards</label>
        <label class="check"><input type="checkbox" name="none"> Custom cards only (drop the standard 52)</label>
      </div>
      <div class="dlg-foot"><button class="btn" value="cancel">Cancel</button><button class="btn primary" value="import">Add to deck builder</button></div>`, {
      onSubmit(form) {
        const items = parseCustomRows(form.rows.value);
        if (!items.length) { toast("No rows with a name were found.", "error"); return false; }
        if (!deckDraft) deckDraft = E.clone(E.normalizeDeckSpec(view.deckSpec));
        deckDraft.custom = (form.replace.checked ? [] : deckDraft.custom).concat(items).slice(0, 120);
        if (form.none.checked) { deckDraft.preset = "none"; deckDraft.ranks = null; }
        customOpen = true;
        prefs.tab = "deck";
        savePrefs();
        renderPane();
        toast(`${items.length} card type${items.length === 1 ? "" : "s"} added. Press Rebuild & shuffle to use them.`, "good");
      },
    });
  }

  function generateRules() {
    const source = net.mode === "client" ? view : state;
    if (source.notes && source.notes.trim() && !confirm("Replace the rules document with one generated from the table? Undo brings yours back.")) return;
    dispatch({ type: "setNotes", notes: E.describeGame(source) });
    prefs.rulesView = "preview";
    savePrefs();
    renderPane();
  }

  function readSimCfg() {
    if ($("#simMacro")) sim.cfg.macro = $("#simMacro").value;
    if ($("#simTarget")) sim.cfg.target = $("#simTarget").value;
    if ($("#simEval")) sim.cfg.evaluator = $("#simEval").value;
    if ($("#simTrials")) sim.cfg.trials = Number($("#simTrials").value) || 1000;
  }

  // ================================================================ SLAPS
  /** Who slaps from this screen: your seat, else the first human seat, else whoever's turn it is. */
  function slapperId() {
    if (net.mode !== "local") return mySeatId();
    return mySeatId() || state.players.find((player) => !player.bot)?.id || state.players[state.turn.index]?.id || null;
  }
  function slapPile(zoneId) {
    const zone = zoneId ? view.zones[zoneId] : E.orderedZones(view, "table").find((entry) => entry.rule?.slap);
    if (!zone) return;
    const who = slapperId();
    if (!who) return toast("Take a seat to slap.", "error");
    if (view.gameOver && !view.gameOver.dismissed) return;
    flashSlap(zone.id);
    dispatch({ type: "slap", zone: zone.id, top: zone.cards[zone.cards.length - 1], player: who });
  }
  function flashSlap(zoneId) {
    const el = document.querySelector(`[data-zone-id="${zoneId}"] .cards`);
    if (!el || !prefs.motion) return;
    el.classList.remove("slapped");
    void el.offsetWidth;
    el.classList.add("slapped");
    setTimeout(() => el.classList.remove("slapped"), 400);
  }
  /** Call the standing claim. On a shared screen with several humans, pick who's calling. */
  function callBluff(zoneId, anchor) {
    const zone = view.zones[zoneId];
    if (!zone?.claim) return;
    const send = (player) => dispatch({ type: "callBluff", zone: zoneId, player });
    if (net.mode !== "local" || mySeatId()) return send(mySeatId());
    const humans = state.players.filter((player) => !player.bot && player.id !== zone.claim.by);
    if (humans.length === 1) return send(humans[0].id);
    const callers = humans.length ? humans : state.players.filter((player) => player.id !== zone.claim.by);
    showMenu(anchor, callers.map((player) => ({ label: `${player.name} calls`, run: () => send(player.id) })));
  }
  const CLAIM_WINDOW = { slow: 2200, normal: 1300, fast: 450 };
  const claimWatch = { timer: null, key: "", done: "" };
  /** After each claim, bots think it over before anyone plays on, giving humans time to call too. */
  function scheduleBotCall() {
    if (net.mode === "client" || !state || bots.paused || replay.active) return;
    const zone = E.orderedZones(state, "table").find((entry) => entry.claim);
    const key = zone ? `${zone.id}:${zone.claimSeq}:${zone.cards.length}` : "";
    if (key === claimWatch.key) return;
    clearTimeout(claimWatch.timer);
    claimWatch.key = key;
    const botSeats = state.players.filter((player) => player.bot);
    if (!zone || !botSeats.length) { claimWatch.done = key; return; }
    claimWatch.timer = setTimeout(() => {
      claimWatch.done = key;
      const live = state.zones[zone.id];
      if (live?.claim && `${zone.id}:${live.claimSeq}:${live.cards.length}` === key && !(state.gameOver && !state.gameOver.dismissed)) {
        const caller = E.dealOrder(state).find((player) => player.bot && E.botCalls(state, player.id, live));
        if (caller) {
          history.push(state);
          future = [];
          state = E.reduce(state, { type: "callBluff", zone: zone.id, player: caller.id }, caller.id);
          afterChange();
          return;
        }
      }
      scheduleBots();
    }, CLAIM_WINDOW[prefs.botSpeed || "normal"] ?? 1300);
  }
  const tradeWatch = { timer: null, key: "" };
  /** Bots answer offers made to them: a fair-or-better card count (and no chips asked) gets a yes. */
  function scheduleBotTrade() {
    if (net.mode === "client" || !state || bots.paused) return;
    const offer = (state.offers || []).find((entry) => E.playerById(state, entry.to)?.bot);
    const key = offer ? offer.id : "";
    if (key === tradeWatch.key) return;
    clearTimeout(tradeWatch.timer);
    tradeWatch.key = key;
    if (!offer) return;
    tradeWatch.timer = setTimeout(() => {
      tradeWatch.key = "";
      const live = (state.offers || []).find((entry) => entry.id === offer.id);
      if (!live) return;
      const hand = E.orderedZones(state, live.to).find((zone) => zone.kind === "hand") || E.orderedZones(state, live.to)[0];
      const fair = live.cards.length >= live.want && live.chips >= 0 && (hand?.cards.length || 0) >= live.want;
      const back = fair ? hand.cards.slice().sort(() => Math.random() - 0.5).slice(0, live.want) : [];
      try {
        history.push(state);
        future = [];
        state = E.reduce(state, { type: "answerTrade", id: live.id, accept: fair, cards: back, player: live.to }, live.to);
        afterChange();
      } catch (error) { history.pop(); toast(error.message, "warn"); }
    }, 900 + Math.random() * 700);
  }
  const SLAP_DELAY = { slow: [900, 1600], normal: [550, 1050], fast: [260, 520] };
  const slapWatch = { timer: null, key: "" };
  /** Bots react to a slappable pile after a human-ish delay, so you can beat them to it. */
  function scheduleBotSlap() {
    if (net.mode === "client" || !state || bots.paused || replay.active || (state.gameOver && !state.gameOver.dismissed)) return;
    const zone = E.orderedZones(state, "table").find((entry) => E.slapReason(state, entry));
    const key = zone ? `${zone.id}:${zone.cards[zone.cards.length - 1]}:${zone.cards.length}` : "";
    if (key === slapWatch.key) return;
    clearTimeout(slapWatch.timer);
    slapWatch.key = key;
    const botSeats = state.players.filter((player) => player.bot);
    if (!zone || !botSeats.length) return;
    const [low, high] = SLAP_DELAY[prefs.botSpeed || "normal"] || SLAP_DELAY.normal;
    slapWatch.timer = setTimeout(() => {
      const live = state.zones[zone.id];
      if (!live || `${zone.id}:${live.cards[live.cards.length - 1]}:${live.cards.length}` !== key || !E.slapReason(state, live)) return;
      const bot = botSeats[Math.floor(Math.random() * botSeats.length)];
      history.push(state);
      future = [];
      state = E.reduce(state, { type: "slap", zone: zone.id, top: live.cards[live.cards.length - 1], player: bot.id }, bot.id);
      flashSlap(zone.id);
      afterChange();
    }, low + Math.random() * (high - low));
  }

  // ============================================================ REAL TIME
  const realtime = { timers: new Map(), stuck: null };
  const REALTIME_PACE = { slow: 1900, normal: 1100, fast: 420 };
  function stopRealtime() {
    realtime.timers.forEach((timer) => clearTimeout(timer));
    realtime.timers.clear();
    clearTimeout(realtime.stuck);
    realtime.stuck = null;
  }
  /** Real-time designs: every bot plays on its own clock, and when nobody can move a bot runs the "can't play" action. */
  function scheduleRealtime() {
    if (!state?.realtime || net.mode === "client" || bots.paused || replay.active || (state.gameOver && !state.gameOver.dismissed)) { stopRealtime(); return; }
    const pace = REALTIME_PACE[prefs.botSpeed || "normal"] || 1100;
    for (const bot of state.players.filter((player) => player.bot && !player.out)) {
      if (realtime.timers.has(bot.id)) continue;
      realtime.timers.set(bot.id, setTimeout(() => {
        realtime.timers.delete(bot.id);
        if (!state?.realtime || bots.paused) return;
        const play = E.pickPlay(state, bot.id, bot.botStyle || prefs.botStyle || "random");
        if (play) {
          const before = state;
          try {
            state = E.reduce(state, { type: "move", cards: play.cards || [play.card], to: play.to }, bot.id);
            history.push(before);
            future = [];
            afterChange();
            return;
          } catch (error) { state = before; }
        }
        scheduleRealtime();
      }, pace * (0.6 + Math.random() * 0.9)));
    }
    const fallback = state.botFallback && state.players.some((player) => player.bot);
    if (!fallback || realtime.stuck) return;
    const stuck = () => state.players.every((player) => player.out || !E.legalPlays(state, player.id).length);
    if (!stuck()) return;
    realtime.stuck = setTimeout(() => {
      realtime.stuck = null;
      if (!state?.realtime || bots.paused || !stuck()) return scheduleRealtime();
      const bot = state.players.find((player) => player.bot && !player.out) || state.players.find((player) => player.bot);
      history.push(state);
      future = [];
      state = E.reduce(state, { type: "runMacro", id: state.botFallback }, bot.id);
      afterChange();
    }, pace + 600);
  }

  // ================================================================ BOTS
  const bots = { timer: null, paused: false, streak: 0, idleRev: -1 };
  const BOT_DELAY = { slow: 1100, normal: 480, fast: 60 };

  /** Let a bot take its turn when it's up (local and host only). */
  function scheduleBots() {
    clearTimeout(bots.timer);
    bots.timer = null;
    scheduleBotSlap();
    scheduleBotCall();
    scheduleBotTrade();
    if (state?.realtime) { scheduleRealtime(); return; }
    stopRealtime();
    if (net.mode === "client" || bots.paused || !state || drag || replay.active) return;
    const player = state.players[state.turn.index];
    if (!player?.bot || player.out || (state.gameOver && !state.gameOver.dismissed) || state.rev === bots.idleRev) return;
    // Everyone freezes while a pile is up for grabs; the slap (a bot's, if nobody beats it) moves play on.
    if (E.orderedZones(state, "table").some((zone) => E.slapReason(state, zone))) return;
    if (claimWatch.key && claimWatch.done !== claimWatch.key) return;
    bots.timer = setTimeout(() => botTurn(player.id), BOT_DELAY[prefs.botSpeed || "normal"] ?? 480);
  }

  /** One bot move, computed by the engine and applied as a single undoable step. */
  function botTurn(playerId, manual = false) {
    bots.timer = null;
    if (!state || state.players[state.turn.index]?.id !== playerId) return;
    if (!manual) {
      bots.streak += 1;
      if (bots.streak > 800) {
        bots.paused = true;
        bots.streak = 0;
        toast("Bots paused after 800 moves in a row.", "warn");
        renderPane();
        return;
      }
    }
    let result;
    try {
      result = E.botStep(state, playerId, { style: prefs.botStyle || "random" });
    } catch (error) {
      bots.paused = true;
      toast("Bots paused: " + (error.message || error), "error");
      renderPane();
      return;
    }
    if (result.did === "idle") {
      bots.idleRev = state.rev;
      if (manual) toast("Nothing to play: no cards, and no “can't play” action is set.", "warn");
      return;
    }
    history.push(state);
    if (history.length > 120) history.shift();
    future = [];
    state = result.state;
    afterChange();
  }

  // ========================================================= BOT GAMES
  const botGames = { running: false, progress: 0, result: null, compare: null, cfg: { deal: "", games: 30, maxSteps: 6000, against: "" } };

  /** Autoplay `games` whole games from `base` in small time slices; resolves with the tally. */
  function playBatch(base, dealId, games, onProgress) {
    return new Promise((resolve) => {
      const seats = base.players.length;
      const tally = { games: 0, finished: 0, steps: 0, rounds: 0, wins: Array(seats).fill(0), ties: 0, scores: Array(seats).fill(0), longest: 0, rows: [], cards: {} };
      const next = () => {
        const budget = performance.now() + 40;
        while (tally.games < games && performance.now() < budget) {
          let out;
          try { out = E.playOut(base, { deal: dealId, maxSteps: botGames.cfg.maxSteps, style: prefs.botStyle || "random", trackCards: true }); } catch (error) { out = null; }
          tally.games += 1;
          if (!out) continue;
          tally.steps += out.steps;
          tally.longest = Math.max(tally.longest, out.steps);
          tally.rounds += out.state.turn.round;
          const totals = E.totals(out.state);
          out.state.players.forEach((player, seat) => { tally.scores[seat] += totals[player.id] || 0; });
          if (out.finished) {
            tally.finished += 1;
            const winners = out.state.gameOver.winners;
            if (winners.length > 1) tally.ties += 1;
            else tally.wins[out.state.players.findIndex((player) => player.id === winners[0])] += 1;
            // Card balance: what share of each card's plays came from the eventual winner.
            for (const [playerId, counts] of Object.entries(out.cardsPlayed || {})) {
              const share = winners.includes(playerId) ? 1 / winners.length : 0;
              for (const [key, n] of Object.entries(counts)) {
                const entry = tally.cards[key] || (tally.cards[key] = { seen: 0, won: 0 });
                entry.seen += n;
                entry.won += n * share;
              }
            }
          }
          tally.rows.push({ game: tally.games, finished: out.finished, moves: out.steps, rounds: out.state.turn.round, winners: (out.state.gameOver?.winners || []).map((id) => out.state.players.findIndex((player) => player.id === id) + 1).join(" "), scores: out.state.players.map((player) => totals[player.id] || 0) });
        }
        onProgress(tally.games / games);
        if (tally.games < games && botGames.running) setTimeout(next, 0);
        else resolve(tally);
      };
      setTimeout(next, 0);
    });
  }

  function batchSummary(tally) {
    const rates = tally.wins.map((wins) => (tally.finished ? wins / tally.finished : 0));
    return {
      ...tally,
      rates,
      spread: rates.length ? Math.max(...rates) - Math.min(...rates) : 0,
      avgSteps: tally.steps / Math.max(1, tally.games),
      avgRounds: tally.rounds / Math.max(1, tally.games),
    };
  }

  async function runBotGames() {
    if (net.mode === "client") return toast("Only the host can run bot games.", "error");
    if (botGames.running) return;
    const base = E.clone(state);
    const deal = base.macros.find((macro) => macro.id === botGames.cfg.deal) || base.macros[0];
    if (!deal) return toast("Build a deal action first.", "error");
    const endsByAction = base.macros.some((macro) => macro.steps.some((step) => step.op === "endGame"));
    if (!base.scores.target && !base.scores.maxRounds && !endsByAction) return toast("Set how the game ends first (Scores → End of game), or games never finish.", "error");
    let other = null;
    if (botGames.cfg.against) {
      const [designId, version] = botGames.cfg.against.split("#");
      const design = loadLibrary().find((entry) => entry.id === designId);
      const source = version !== undefined ? design?.versions?.[Number(version)]?.design : design;
      if (!source) return toast("That saved design is gone.", "error");
      const table = E.createTable(source, { players: base.players.map((player) => ({ name: player.name, botStyle: player.botStyle })) });
      const otherDeal = table.macros.find((macro) => macro.label === deal.label) || table.macros[0];
      if (!otherDeal || (!table.scores.target && !table.scores.maxRounds && !table.macros.some((macro) => macro.steps.some((step) => step.op === "endGame")))) return toast("The comparison design needs a deal action and an end condition.", "error");
      other = { table, deal: otherDeal, name: (source.name || "Saved design") + (version !== undefined ? ` (version ${new Date(design.versions[Number(version)].t).toLocaleDateString()})` : "") };
    }
    const games = Math.max(1, Math.min(500, Number(botGames.cfg.games) || 30));
    const previousRng = E.getRng();
    E.setRng(Math.random);
    botGames.running = true;
    botGames.progress = 0;
    botGames.compare = null;
    renderPane();
    const started = performance.now();
    const progress = (offset, share) => (fraction) => {
      botGames.progress = offset + fraction * share;
      if (prefs.tab === "tools") renderPane();
    };
    const mine = await playBatch(base, deal.id, games, progress(0, other ? 0.5 : 1));
    const theirs = other && botGames.running ? await playBatch(other.table, other.deal.id, games, progress(0.5, 0.5)) : null;
    E.setRng(previousRng);
    botGames.running = false;
    botGames.result = { ...batchSummary(mine), deal: deal.label, ms: performance.now() - started, names: base.players.map((player) => `${player.name} · ${player.botStyle || prefs.botStyle || "random"}`) };
    botGames.compare = theirs ? { ...batchSummary(theirs), name: other.name } : null;
    renderPane();
  }

  /** How long games ran, in moves: spot designs that drag on or end too fast. */
  function lengthHistogramHTML(r) {
    const moves = r.rows.map((row) => row.moves).sort((a, b) => a - b);
    if (moves.length < 5) return "";
    const lo = moves[0];
    const hi = moves[moves.length - 1];
    const bins = 12;
    const width = Math.max(1, Math.ceil((hi - lo + 1) / bins));
    const counts = Array(bins).fill(0);
    const capped = Array(bins).fill(0);
    r.rows.forEach((row) => {
      const bin = Math.min(bins - 1, Math.floor((row.moves - lo) / width));
      counts[bin] += 1;
      if (!row.finished) capped[bin] += 1;
    });
    const peak = Math.max(...counts);
    const median = moves[Math.floor(moves.length / 2)];
    const p90 = moves[Math.floor(moves.length * 0.9)];
    return `<div class="histo-box"><div class="small"><b>Game length</b> <span class="muted">· moves per game: median ${median}, 90% within ${p90}, range ${lo}–${hi}</span></div>
      <div class="histo" role="img" aria-label="Histogram of game lengths">${counts.map((count, i) => `<span style="height:${peak ? Math.max(count ? 6 : 0, (count / peak) * 100) : 0}%" class="${capped[i] ? "capped" : ""}" title="${lo + i * width}–${lo + (i + 1) * width - 1} moves: ${count} game${count === 1 ? "" : "s"}${capped[i] ? `, ${capped[i]} hit the move limit` : ""}"></span>`).join("")}</div>
      <div class="histo-axis small dim"><span>${lo}</span><span>${hi}</span></div></div>`;
  }

  /**
   * Which cards the winners played: each card's share of plays made by the
   * eventual winner, against the winners' share of all plays (the line).
   */
  function cardBalanceHTML(r) {
    const all = Object.values(r.cards).reduce((sum, entry) => ({ seen: sum.seen + entry.seen, won: sum.won + entry.won }), { seen: 0, won: 0 });
    if (!all.seen) return "";
    const baseline = all.won / all.seen;
    const minSeen = Math.max(10, Math.round(r.finished * 0.5));
    const rows = Object.entries(r.cards).filter(([, entry]) => entry.seen >= minSeen).map(([key, entry]) => ({ key, rate: entry.won / entry.seen, seen: entry.seen }));
    if (rows.length < 3) return "";
    rows.sort((a, b) => b.rate - a.rate);
    const pick = rows.length > 10 ? [...rows.slice(0, 5), null, ...rows.slice(-5)] : rows;
    const label = (key) => (E.STD_RANKS.includes(key) ? RANK_SHOW(key) : key);
    const line = (row) => {
      if (!row) return `<div class="small dim" style="text-align:center">⋯</div>`;
      const lift = row.rate / baseline - 1;
      return `<div class="row tight" style="flex-wrap:nowrap" title="${pct(row.rate)} of ${row.seen} plays"><span class="small sim-label">${esc(label(row.key))}</span><div class="prob-bar grow balance${lift > 0.1 ? " hot" : lift < -0.1 ? " cold" : ""}"><span style="width:${Math.min(100, (row.rate / baseline) * 50)}%"></span><i style="left:50%"></i></div><span class="small balance-val">${lift >= 0 ? "+" : "−"}${Math.abs(Math.round(lift * 100))}%</span></div>`;
    };
    return `<details class="balance-box" open><summary class="small"><b>Card balance</b> <span class="muted">· share of each card's plays made by the eventual winner (centre line = winners' share of all plays, ${pct(baseline)})</span></summary><div class="list">${pick.map(line).join("")}</div><p class="hint">Cards well above the line show up in winning hands more than their share: maybe too strong. Well below: too weak, or the card losing players get stuck with. Needs a decent sample; run 100+ games.</p></details>`;
  }

  function botGamesHTML(v) {
    const r = botGames.result;
    const c = botGames.compare;
    const ends = v.scores.target ? `first to ${E.fmt(v.scores.target)}` : v.scores.maxRounds ? `${v.scores.maxRounds} rounds` : v.macros.some((macro) => macro.steps.some((step) => step.op === "endGame")) ? "until an action ends it" : "no end condition";
    const library = loadLibrary();
    const againstOptions = library.flatMap((design) => [[design.id, design.name], ...(design.versions || []).map((version, i) => [`${design.id}#${i}`, `${design.name}, version from ${new Date(version.t).toLocaleString()}`])]);
    const seatRows = r ? r.wins.map((wins, seat) => {
      const rate = r.rates[seat];
      return `<div class="row tight" style="flex-wrap:nowrap"><span class="small sim-label">${esc(r.names[seat] || "Seat " + (seat + 1))}</span><div class="prob-bar grow"><span style="width:${rate * 100}%"></span><em>${pct(rate)} · avg ${E.fmt(Math.round((r.scores[seat] / Math.max(1, r.games)) * 10) / 10)}</em></div></div>`;
    }).join("") : "";
    const fairness = (sum) => sum.spread <= 0.1 ? "balanced" : sum.spread <= 0.25 ? "slightly uneven" : "uneven";
    const compareTable = r && c ? `<table class="compare"><thead><tr><th></th><th>This table</th><th>${esc(c.name)}</th></tr></thead><tbody>
        <tr><td>Finished</td><td>${r.finished}/${r.games}</td><td>${c.finished}/${c.games}</td></tr>
        <tr><td>Avg moves</td><td>${Math.round(r.avgSteps)}</td><td>${Math.round(c.avgSteps)}</td></tr>
        <tr><td>Avg rounds</td><td>${r.avgRounds.toFixed(1)}</td><td>${c.avgRounds.toFixed(1)}</td></tr>
        <tr><td>Seat spread</td><td>${pct(r.spread)}</td><td>${pct(c.spread)}</td></tr>
        <tr><td>Ties</td><td>${r.ties}</td><td>${c.ties}</td></tr>
      </tbody></table>` : "";
    return `<div class="grid-2">
        <label class="field"><span>Start each round with</span><select id="bgDeal">${v.macros.map((macro) => `<option value="${macro.id}"${botGames.cfg.deal === macro.id ? " selected" : ""}>${esc(macro.label)}</option>`).join("")}</select></label>
        <label class="field"><span>Games</span><input id="bgGames" type="number" min="1" max="500" value="${botGames.cfg.games}"></label>
      </div>
      ${againstOptions.length ? `<label class="field"><span>Compare with <span class="dim">A/B test against a saved design or version</span></span><select id="bgAgainst"><option value="">Nothing</option>${againstOptions.map(([id, label]) => `<option value="${esc(id)}"${botGames.cfg.against === id ? " selected" : ""}>${esc(label)}</option>`).join("")}</select></label>` : ""}
      <div class="row"><button class="btn primary" data-act="bot-games" ${botGames.running ? "disabled" : ""}>${botGames.running ? `Playing… ${Math.round(botGames.progress * 100)}%` : "Play bot games"}</button><span class="muted small">Every seat plays legal cards to the end (${esc(ends)}).</span></div>
      ${r ? `<div class="small dim">${r.games} games in ${(r.ms / 1000).toFixed(1)} s · ${r.finished} finished${r.games - r.finished ? `, ${r.games - r.finished} hit the move limit` : ""} · avg ${Math.round(r.avgSteps)} moves, ${r.avgRounds.toFixed(1)} rounds${r.ties ? ` · ${r.ties} ties` : ""}</div>
        <div class="small muted">Win rate and average final score by seat: <b>${fairness(r)}</b> (spread ${pct(r.spread)}${r.finished < 40 ? "; small sample, run more games for a clearer picture" : ""})</div><div class="list">${seatRows}</div>${compareTable}` : ""}
      ${r ? lengthHistogramHTML(r) : ""}
      ${r ? cardBalanceHTML(r) : ""}
      ${r ? `<div class="row"><button class="btn sm" data-act="bot-games-csv">Export games CSV</button></div>` : ""}
      <p class="hint">Needs play rules where cards are played and an end condition. Use it to spot seat-order advantages, games that drag on, or whether a rule change helps (save a version, change the rule, then compare).</p>`;
  }

  // ======================================================== PRINT & PLAY
  function printSheet(includeStandard) {
    const v = view;
    const spec = E.normalizeDeckSpec(v.deckSpec);
    const cards = [];
    for (const item of spec.custom) {
      for (let i = 0; i < item.count; i += 1) cards.push({ id: "p" + cards.length, custom: true, visible: true, faceUp: true, label: item.label, text: item.text, color: item.color, value: item.value, icon: item.icon, image: item.image, suit: item.suit || "x", rank: item.rank || item.label });
    }
    if (includeStandard || !cards.length) {
      const copies = (E.DECK_PRESETS[spec.preset]?.copies || 1) * spec.decks;
      for (let c = 0; c < copies; c += 1) for (const suit of spec.suits) for (const rank of deckRanksFor(spec)) cards.push({ id: "p" + cards.length, visible: true, faceUp: true, rank, suit });
      for (let j = 0; j < spec.jokers; j += 1) cards.push({ id: "p" + cards.length, visible: true, faceUp: true, rank: "JK", suit: "x", jokerColor: j % 2 ? "red" : "black" });
    }
    const zone = { id: "print", visibility: "public" };
    const faces = cards.map((card, i) => cardHTML(card, zone, i)).join("");
    const win = window.open("", "_blank");
    if (!win) return toast("Allow pop-ups to open the print sheet.", "error");
    const css = new URL("./styles.css", location.href).href;
    win.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(v.title)}: print & play</title><link rel="stylesheet" href="${esc(css)}">
      <style>
        html, body { height: auto; overflow: visible; background: #fff; color: #111; }
        body { padding: 10mm; font-family: system-ui, sans-serif; --cw: 63mm; --ch: 88mm; }
        h1 { font-size: 20pt; margin: 0 0 2mm; } .meta { color: #555; margin: 0 0 6mm; }
        .sheet { display: grid; grid-template-columns: repeat(auto-fill, 63mm); gap: 3mm; }
        .card { box-shadow: none; outline: 0; border: 0.3mm solid #999; break-inside: avoid; cursor: default; }
        .card.red { color: #c81e35; }
        .print-rules { break-before: page; max-width: 170mm; font-size: 11pt; line-height: 1.5; }
        .print-rules h3 { text-transform: uppercase; letter-spacing: 0.05em; font-size: 10pt; margin-top: 6mm; }
        @page { margin: 8mm; }
        @media print { body { padding: 0; } .no-print { display: none; } }
      </style></head><body>
      <div class="no-print" style="margin-bottom:6mm"><button onclick="print()">Print</button></div>
      <h1>${esc(v.title)}</h1><p class="meta">${cards.length} cards · poker size (63 × 88 mm)</p>
      <div class="sheet">${faces}</div>
      ${v.notes && v.notes.trim() ? `<section class="print-rules">${renderMarkdown(v.notes)}</section>` : ""}
      </body></html>`);
    win.document.close();
  }

  // ============================================================== WIZARD
  function openWizard() {
    if (net.mode === "client") return toast("Only the host can start a new game.", "error");
    const draft = { name: "", style: "shedding", min: 2, max: 6, players: 4, deck: "standard", decks: 1, jokers: 0, handSize: "", openHands: false, match: "suitOrRank", wild: "", trickScoring: "tricks", trump: "", slap: "pair", target: 100, rounds: 0, lowWins: false, rulesMode: "warn" };
    const styleFields = () => {
      if (draft.style === "shedding") return `<div class="grid-2">
          <label class="field"><span>A card played must</span><select name="match">${[["suitOrRank", "Match suit or rank"], ["suit", "Match suit"], ["rank", "Match rank"], ["color", "Match color"]].map(([id, label]) => `<option value="${id}"${draft.match === id ? " selected" : ""}>${label}</option>`).join("")}</select></label>
          <label class="field"><span>Wild ranks <span class="dim">optional</span></span><input type="text" name="wild" value="${esc(draft.wild)}" placeholder="e.g. 8"></label>
          <label class="check" style="grid-column:1/-1"><input type="checkbox" name="realtime"${draft.realtime ? " checked" : ""}> Real time: no turns, everyone plays at once</label></div>`;
      if (draft.style === "tricks") return `<div class="grid-2">
          <label class="field"><span>Scoring</span><select name="trickScoring"><option value="tricks"${draft.trickScoring === "tricks" ? " selected" : ""}>1 point per trick</option><option value="hearts"${draft.trickScoring === "hearts" ? " selected" : ""}>Hearts points, lowest wins</option></select></label>
          <label class="field"><span>Trump suit</span><select name="trump"><option value="">None</option>${["s", "h", "d", "c"].map((suit) => `<option value="${suit}"${draft.trump === suit ? " selected" : ""}>${SUIT_SYMBOL[suit]}</option>`).join("")}</select></label></div>`;
      if (draft.style === "slap") return `<div class="grid-2">
          <label class="field"><span>Slap the pile when</span><select name="slap">${["jack", "pair", "sandwich", "ratscrew"].map((id) => `<option value="${id}"${draft.slap === id ? " selected" : ""}>${esc(E.RULE_SLAP[id])}</option>`).join("")}</select></label></div>`;
      return "";
    };
    const draw = () => head("Design a new game") + `<div class="dlg-body">
        <p class="hint">Answer a few questions and get a playable table: groups with play rules, one-tap actions, automatic triggers, scoring and a rules draft. Everything stays editable.</p>
        <div class="grid-2">
          <label class="field"><span>Name</span><input type="text" name="name" maxlength="48" value="${esc(draft.name)}" placeholder="My game" required></label>
          <label class="field"><span>Style</span><select name="style">${Object.entries(P.WIZARD_STYLES).map(([id, def]) => `<option value="${id}"${draft.style === id ? " selected" : ""}>${esc(def.label)}</option>`).join("")}</select></label>
        </div>
        <p class="hint" style="margin-top:-6px">${esc(P.WIZARD_STYLES[draft.style].hint)}</p>
        <div class="grid-3">
          <label class="field"><span>Fewest players</span><input type="number" name="min" min="1" max="12" value="${draft.min}"></label>
          <label class="field"><span>Most players</span><input type="number" name="max" min="1" max="12" value="${draft.max}"></label>
          <label class="field"><span>Start with</span><input type="number" name="players" min="1" max="12" value="${draft.players}"></label>
          <label class="field"><span>Deck</span><select name="deck">${Object.entries(E.DECK_PRESETS).filter(([id]) => id !== "none").map(([id, deck]) => `<option value="${id}"${draft.deck === id ? " selected" : ""}>${esc(deck.label)}</option>`).join("")}</select></label>
          <label class="field"><span>Decks</span><input type="number" name="decks" min="1" max="8" value="${draft.decks}"></label>
          <label class="field"><span>Jokers</span><input type="number" name="jokers" min="0" max="8" value="${draft.jokers}"></label>
          <label class="field"><span>Cards per hand</span><input type="number" name="handSize" min="0" max="30" value="${esc(draft.handSize)}" placeholder="${draft.style === "tricks" ? "13" : draft.style === "poker" ? "2" : draft.style === "draft" ? "5" : "7"}"></label>
          <label class="field"><span>Hands are</span><select name="openHands"><option value="0">Private</option><option value="1"${draft.openHands ? " selected" : ""}>Open (face up)</option></select></label>
          <label class="field"><span>Rule checks</span><select name="rulesMode">${Object.entries(E.RULES_MODES).map(([id, label]) => `<option value="${id}"${draft.rulesMode === id ? " selected" : ""}>${label}</option>`).join("")}</select></label>
        </div>
        ${styleFields()}
        <div class="grid-3">
          <label class="field"><span>Game ends at</span><input type="number" name="target" min="0" value="${draft.target || ""}" placeholder="no target"></label>
          <label class="field"><span>Or after rounds</span><input type="number" name="rounds" min="0" value="${draft.rounds || ""}" placeholder="no limit"></label>
          <label class="check" style="align-self:end;min-height:32px"><input type="checkbox" name="lowWins"${draft.lowWins ? " checked" : ""}> Lowest total wins</label>
        </div>
      </div>
      <div class="dlg-foot"><button class="btn" value="cancel">Cancel</button><button class="btn primary" value="create">Create game</button></div>`;
    const sync = (form) => {
      for (const key of ["name", "style", "deck", "match", "wild", "trickScoring", "trump", "slap", "rulesMode"]) if (form[key]) draft[key] = form[key].value;
      for (const key of ["min", "max", "players", "decks", "jokers", "target", "rounds"]) if (form[key]) draft[key] = Number(form[key].value) || 0;
      draft.handSize = form.handSize.value;
      draft.openHands = form.openHands.value === "1";
      draft.lowWins = form.lowWins.checked;
      if (form.realtime) draft.realtime = form.realtime.checked;
    };
    openDialog(draw(), {
      wide: true,
      bind(form) {
        form.addEventListener("change", (event) => {
          if (event.target.name !== "style") return;
          sync(form);
          form.innerHTML = draw();
        });
      },
      onSubmit(form) {
        sync(form);
        const design = P.fromWizard(draft);
        const count = Math.max(design.players.min, Math.min(design.players.max, draft.players || design.players.default));
        const next = E.createTable(design, { players: Array.from({ length: count }, (_, i) => state?.players[i] ? { name: state.players[i].name, color: state.players[i].color, clientId: state.players[i].clientId } : { name: `Player ${i + 1}` }) });
        next.notes = E.describeGame(next);
        next.rev = (state?.rev || 0) + 1;
        replaceState(next, `Designed “${design.name}”. Press ${design.macros[0].label} to play, and save it from Rules when you like it.`);
        prefs.tab = "rules";
        prefs.rulesView = "preview";
        prefs.side = true;
        savePrefs();
        store(STORE.seen, true);
        renderPane();
      },
    });
  }

  // ============================================================ TEMPLATES
  const ZONE_TEMPLATES = {
    hand: { label: "Hand", name: "Hand", area: "seats", kind: "hand", layout: "fan", visibility: "owner", face: "down" },
    draw: { label: "Draw pile", name: "Draw pile", area: "table", kind: "deck", layout: "stack", visibility: "hidden", face: "down", rule: { place: "nobody" } },
    discard: { label: "Discard (match)", name: "Discard", area: "table", kind: "discard", layout: "stack", visibility: "public", face: "up", rule: { place: "turn", accept: "suitOrRank", advance: true } },
    trick: { label: "Trick", name: "Trick", area: "table", kind: "board", layout: "spread", visibility: "public", face: "up", evals: ["trick"], rule: { place: "turn", follow: true, once: true, advance: true } },
    board: { label: "Board", name: "Board", area: "table", kind: "board", layout: "spread", visibility: "public", face: "up", evals: ["poker-high"] },
    foundation: { label: "Foundation", name: "Foundation", area: "table", kind: "pile", layout: "stack", visibility: "public", face: "up", rule: { first: "A", accept: "suit", order: "upOne" } },
    column: { label: "Tableau column", name: "Column", area: "table", kind: "pile", layout: "overlap", visibility: "public", face: "keep", rule: { first: "K", accept: "altColor", order: "downOne", flipTop: true } },
    meld: { label: "Meld", name: "Meld", area: "seats", kind: "pile", layout: "overlap", visibility: "public", face: "up", rule: { place: "owner", meld: "setOrRun" } },
    felt: { label: "Play area", name: "Play area", area: "table", kind: "free", layout: "free", visibility: "public", face: "up", wide: true },
    won: { label: "Won pile", name: "Won", area: "seats", kind: "pile", layout: "stack", visibility: "public", face: "down", evals: ["count"] },
    slap: { label: "Slap pile", name: "Pile", area: "table", kind: "pile", layout: "overlap", visibility: "public", face: "up", rule: { slap: "pair", slapTo: "stack" } },
  };

  function applyZoneTemplate(form, tpl) {
    form.name.value = tpl.name;
    if (form.area && tpl.area && [...form.area.options].some((option) => option.value === tpl.area)) form.area.value = tpl.area;
    form.kind.value = tpl.kind;
    form.layout.value = tpl.layout;
    form.visibility.value = tpl.visibility;
    form.face.value = tpl.face;
    form.limit.value = tpl.limit || 0;
    form.wide.checked = Boolean(tpl.wide);
    $$('input[name="eval"]', form).forEach((box) => { box.checked = (tpl.evals || []).includes(box.value); });
    const rule = tpl.rule || {};
    form.rPlace.value = rule.place || "anyone";
    form.rTake.value = rule.take || "anyone";
    form.rAccept.value = rule.accept || "any";
    form.rOrder.value = rule.order || "any";
    form.rMeld.value = rule.meld || "none";
    form.rPhase.value = rule.phase || "";
    form.rCost.value = rule.cost || "";
    form.rFirst.value = rule.first || "";
    form.rWild.value = (rule.wild || []).join(", ");
    form.rSlap.value = rule.slap || "none";
    form.rClaim.value = rule.claim || "none";
    form.rSlapTo.value = rule.slapTo || "";
    for (const [field, key] of [["rFollow", "follow"], ["rOnce", "once"], ["rAdvance", "advance"], ["rFlipTop", "flipTop"], ["rAceHigh", "aceHigh"], ["rClimb", "climb"], ["rChallenge", "challenge"]]) form[field].checked = Boolean(rule[key]);
  }

  function actionTemplates(v) {
    const handKey = v.seatTemplate.find((tpl) => tpl.kind === "hand")?.key || v.seatTemplate[0]?.key || "hand";
    const deckKey = E.findDeckZone(v)?.key || "deck";
    const tableZones = E.orderedZones(v, "table");
    const discardKey = tableZones.find((zone) => zone.kind === "discard")?.key || "discard";
    const trickKey = tableZones.find((zone) => (zone.evals || []).includes("trick"))?.key || "trick";
    const wonKey = v.seatTemplate.find((tpl) => tpl.kind === "pile")?.key || "tricks";
    return {
      deal: { label: "Deal", hint: "Shuffle and deal five each", steps: [{ op: "collect", to: deckKey, shuffle: true }, { op: "nextDealer" }, { op: "deal", from: deckKey, to: handKey, count: 5 }, { op: "setTurn", who: "next" }] },
      draw: { label: "Draw 1", hint: "Current player draws", steps: [{ op: "deal", from: deckKey, to: handKey + "@current", count: 1 }] },
      refill: { label: "Refill hands", hint: "Everyone draws back up to five", steps: [{ op: "refill", from: deckKey, to: handKey, count: 5 }] },
      pass: { label: "Pass", steps: [{ op: "nextTurn" }] },
      trick: { label: "Take trick", hint: "Winner takes the trick and leads", steps: [{ op: "findWinner", zone: trickKey }, { op: "clear", from: trickKey, to: wonKey + "@winner" }, { op: "setTurn", who: "winner" }] },
      reshuffle: { label: "Reshuffle", hint: "Discards except the top become the deck", steps: [{ op: "clear", from: discardKey, to: deckKey, face: "down", keep: 1 }, { op: "shuffle", zone: deckKey }] },
      score: { label: "Score hands", hint: "Each player scores their hand, then a new round", steps: [{ op: "scoreZones", zone: handKey }, { op: "nextRound" }] },
      showdown: { label: "Showdown", hint: "Reveal, find the best hand, award the pot", steps: [{ op: "flip", zone: handKey, face: "up" }, { op: "findWinner", zone: handKey }, { op: "awardPot", who: "winner" }] },
      draft: { label: "Pass hands left", steps: [{ op: "passZones", zone: handKey, dir: "left" }] },
      mulligan: { label: "Mulligan", hint: "Shuffle your hand back and draw one fewer", steps: [{ op: "clear", from: handKey + "@current", to: deckKey, face: "down" }, { op: "shuffle", zone: deckKey }, { op: "deal", from: deckKey, to: handKey + "@current", count: 4 }] },
      peek: { label: "See the future", hint: "Current player looks at the top three cards", steps: [{ op: "peekTop", zone: deckKey, count: 3, who: "current" }] },
    };
  }

  // ============================================================== REPLAY
  const replay = { active: false, frames: [], index: 0, timer: null };

  function startReplay() {
    if (net.mode === "client") return toast("Replays use the host's history.", "error");
    if (!history.length) return toast("Nothing to replay yet: make some moves first.");
    replay.frames = [...history, state];
    replay.index = 0;
    replay.active = true;
    selection.clear();
    closeDialog();
    render();
    renderReplayBar();
  }

  function stopReplay() {
    clearInterval(replay.timer);
    replay.timer = null;
    replay.active = false;
    replay.frames = [];
    $("#replayBar").hidden = true;
    render();
  }

  function replayTo(index) {
    replay.index = Math.max(0, Math.min(replay.frames.length - 1, index));
    render();
    renderReplayBar();
  }

  function renderReplayBar() {
    const bar = $("#replayBar");
    if (!replay.active) { bar.hidden = true; return; }
    const frame = replay.frames[replay.index];
    const last = frame.log[frame.log.length - 1];
    bar.hidden = false;
    bar.innerHTML = `<span class="replay-tag">Replay</span>
      <button class="btn sm icon" data-rp="first" title="First">⏮</button>
      <button class="btn sm icon" data-rp="prev" title="Back (←)">◀</button>
      <button class="btn sm icon${replay.timer ? " primary" : ""}" data-rp="play" title="Play / pause (space)">${replay.timer ? "⏸" : "⏵"}</button>
      <button class="btn sm icon" data-rp="next" title="Forward (→)">▶</button>
      <input type="range" min="0" max="${replay.frames.length - 1}" value="${replay.index}" data-rp="seek" aria-label="Replay position">
      <span class="replay-step small mono">${replay.index + 1}/${replay.frames.length}</span>
      <span class="replay-text small grow">${last ? `${last.who ? `<b>${esc(last.who)}</b> ` : ""}${esc(last.text)}` : ""}</span>
      ${replay.index < replay.frames.length - 1 ? `<button class="btn sm" data-rp="resume" title="Undo back to this moment and keep playing from here">Play from here</button>` : ""}
      <button class="btn sm primary" data-rp="exit">Exit</button>`;
  }

  function handleReplay(el) {
    const action = el.dataset.rp;
    if (action === "first") replayTo(0);
    else if (action === "prev") replayTo(replay.index - 1);
    else if (action === "next") replayTo(replay.index + 1);
    else if (action === "exit") stopReplay();
    else if (action === "resume") {
      const steps = replay.frames.length - 1 - replay.index;
      stopReplay();
      for (let i = 0; i < steps; i += 1) undo();
      toast(`Back ${steps} step${steps === 1 ? "" : "s"}: carry on from here (Redo still works)`, "good");
    } else if (action === "play") {
      if (replay.timer) { clearInterval(replay.timer); replay.timer = null; renderReplayBar(); return; }
      if (replay.index >= replay.frames.length - 1) replay.index = 0;
      replay.timer = setInterval(() => {
        if (replay.index >= replay.frames.length - 1) { clearInterval(replay.timer); replay.timer = null; renderReplayBar(); return; }
        replayTo(replay.index + 1);
      }, 650);
      renderReplayBar();
    }
  }

  // =============================================================== SOUND
  const sfx = { ctx: null, noise: null };

  /** Tiny synthesized sound effects (no audio files). Off unless turned on in Tools → Display. */
  function playSound(kind) {
    if (!prefs.sound) return;
    try {
      const ctx = sfx.ctx || (sfx.ctx = new (window.AudioContext || window.webkitAudioContext)());
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;
      const tone = (freq, start, dur, type = "sine", level = 0.05) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(level, now + start);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + start);
        osc.stop(now + start + dur + 0.02);
      };
      const hiss = (start, dur, level = 0.05, cutoff = 2500) => {
        if (!sfx.noise) {
          sfx.noise = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
          const data = sfx.noise.getChannelData(0);
          for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
        }
        const src = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        src.buffer = sfx.noise;
        filter.type = "highpass";
        filter.frequency.value = cutoff;
        gain.gain.setValueAtTime(level, now + start);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
        src.connect(filter).connect(gain).connect(ctx.destination);
        src.start(now + start);
        src.stop(now + start + dur + 0.02);
      };
      switch (kind) {
        case "card": hiss(0, 0.07, 0.08, 2600); break;
        case "flip": hiss(0, 0.05, 0.06, 4200); tone(1500, 0, 0.04, "triangle", 0.015); break;
        case "shuffle": for (let i = 0; i < 8; i += 1) hiss(i * 0.04, 0.05, 0.05, 1800 + i * 150); break;
        case "turn": tone(660, 0, 0.16); tone(880, 0.12, 0.26); break;
        case "win": [523, 659, 784, 1047].forEach((freq, i) => tone(freq, i * 0.11, 0.32, "triangle", 0.05)); break;
        case "warn": tone(196, 0, 0.2, "square", 0.025); break;
        case "slap": hiss(0, 0.12, 0.16, 900); tone(140, 0, 0.1, "triangle", 0.06); break;
        case "chat": tone(988, 0, 0.12, "sine", 0.035); break;
        default: break;
      }
    } catch (error) { /* audio unavailable */ }
  }

  function soundForLog(entries) {
    const kinds = entries.map((entry) => {
      if (entry.kind === "round" && /Game over/.test(entry.text)) return "win";
      if (/^[👋✋🔍]/u.test(entry.text)) return "slap";
      if (entry.kind === "warn") return "warn";
      if (entry.kind === "chat" || entry.kind === "feedback") return "chat";
      if (/^(Shuffled|Collected)/.test(entry.text)) return "shuffle";
      if (/^Revealed/.test(entry.text)) return "flip";
      if (/→|Dealt|drew|Refilled/.test(entry.text)) return "card";
      return "";
    });
    return ["win", "slap", "warn", "shuffle", "flip", "card", "chat"].find((kind) => kinds.includes(kind)) || "";
  }

  // ============================================================ CHARTS
  function scoreChartHTML(v) {
    const rounds = v.scores.rounds;
    const hasScores = rounds.some((round) => Object.keys(round.scores).length);
    if (!hasScores || !v.players.length) return "";
    const series = v.players.map((player) => {
      let total = 0;
      return [0, ...rounds.map((round) => (total += Number(round.scores[player.id]) || 0))];
    });
    const values = series.flat();
    const max = Math.max(1, v.scores.target || 0, ...values);
    const min = Math.min(0, ...values);
    const W = 300;
    const H = 110;
    const n = Math.max(1, rounds.length);
    const x = (i) => ((i / n) * W).toFixed(1);
    const y = (value) => (H - ((value - min) / (max - min || 1)) * H).toFixed(1);
    const lines = series.map((points, i) => {
      const color = esc(v.players[i].color);
      const last = points.length - 1;
      return `<polyline fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" points="${points.map((value, j) => `${x(j)},${y(value)}`).join(" ")}"/><circle cx="${x(last)}" cy="${y(points[last])}" r="3" fill="${color}"/>`;
    }).join("");
    const target = v.scores.target ? `<line x1="0" x2="${W}" y1="${y(v.scores.target)}" y2="${y(v.scores.target)}" stroke="rgba(244,201,93,.7)" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>` : "";
    const zero = min < 0 ? `<line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="rgba(255,255,255,.18)" vector-effect="non-scaling-stroke"/>` : "";
    return `<div class="score-chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Running totals by round">${zero}${target}${lines}</svg>
      <div class="chart-legend">${v.players.map((player, i) => `<span style="--c:${esc(player.color)}"><i class="swatch"></i>${esc(player.name)} ${E.fmt(series[i][series[i].length - 1])}</span>`).join("")}${v.scores.target ? `<span class="dim">- - target ${E.fmt(v.scores.target)}</span>` : ""}</div></div>`;
  }

  // ============================================================ PACING
  const pacing = { game: null, current: null, since: 0, byPlayer: {}, turns: 0, longest: null };

  /** Time each turn locally, so designers can see how long turns take. */
  function trackPacing(source) {
    if (!source) return;
    const game = source.startedAt || 0;
    const current = source.players[source.turn.index]?.id || null;
    const now = Date.now();
    if (pacing.game !== game) {
      Object.assign(pacing, { game, current, since: now, byPlayer: {}, turns: 0, longest: null });
      return;
    }
    if (current === pacing.current) return;
    if (pacing.current) {
      const ms = now - pacing.since;
      const entry = pacing.byPlayer[pacing.current] || (pacing.byPlayer[pacing.current] = { ms: 0, turns: 0 });
      entry.ms += ms;
      entry.turns += 1;
      pacing.turns += 1;
      if (!pacing.longest || ms > pacing.longest.ms) pacing.longest = { ms, player: pacing.current };
    }
    pacing.current = current;
    pacing.since = now;
  }

  const seconds = (ms) => (ms < 60000 ? `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s` : `${Math.floor(ms / 60000)} m ${Math.round((ms % 60000) / 1000)} s`);

  function pacingHTML(v) {
    if (!pacing.turns) return `<p class="hint">Turn times appear here once the turn has passed a few times. Timing is local to this browser.</p>`;
    const entries = v.players.map((player) => ({ player, stat: pacing.byPlayer[player.id] })).filter((entry) => entry.stat);
    const slowest = Math.max(...entries.map((entry) => entry.stat.ms / entry.stat.turns));
    const total = entries.reduce((sum, entry) => sum + entry.stat.ms, 0);
    return `<div class="stat-row"><div><b>${pacing.turns}</b><span>turns</span></div><div><b>${seconds(total / pacing.turns)}</b><span>avg turn</span></div><div><b>${seconds(pacing.longest.ms)}</b><span>longest (${esc(E.playerById(v, pacing.longest.player)?.name || "?")})</span></div></div>
      <div class="list">${entries.map(({ player, stat }) => {
        const avg = stat.ms / stat.turns;
        return `<div class="row tight" style="flex-wrap:nowrap"><span class="small sim-label">${player.bot ? "🤖 " : ""}${esc(player.name)}</span><div class="prob-bar grow"><span style="width:${(avg / slowest) * 100}%;background:linear-gradient(90deg, color-mix(in srgb, ${esc(player.color)} 35%, transparent), ${esc(player.color)})"></span><em>${seconds(avg)} × ${stat.turns}</em></div></div>`;
      }).join("")}</div>
      <div class="row"><button class="btn sm" data-act="reset-pacing">Reset timing</button></div>`;
  }

  // ========================================================== CONFETTI
  let confettiFor = null;
  function confetti() {
    if (!prefs.motion) return;
    const colors = ["#45d6ff", "#ff5c92", "#bdf46b", "#f4c95d", "#9f7dff", "#ff9f43"];
    const layer = document.createElement("div");
    layer.className = "confetti";
    layer.innerHTML = Array.from({ length: 90 }, (_, i) => `<i style="left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${(Math.random() * 0.6).toFixed(2)}s;animation-duration:${(1.6 + Math.random() * 1.2).toFixed(2)}s;--drift:${(Math.random() * 160 - 80).toFixed(0)}px;--spin:${(Math.random() * 720 - 360).toFixed(0)}deg"></i>`).join("");
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 3200);
  }

  // ======================================================== DESIGN BACK
  function applyDesignBack(v) {
    const back = v?.deckSpec?.back || {};
    const style = document.body.style;
    if (back.color) {
      style.setProperty("--back-a", `color-mix(in srgb, ${back.color} 72%, #000)`);
      style.setProperty("--back-b", back.color);
    } else {
      style.removeProperty("--back-a");
      style.removeProperty("--back-b");
    }
    if (back.text) {
      style.setProperty("--back-label", JSON.stringify(back.text));
      document.body.dataset.backLabel = "1";
    } else {
      style.removeProperty("--back-label");
      delete document.body.dataset.backLabel;
    }
  }

  // ============================================================ RECORDER
  const recorder = { on: false, steps: [], groups: [], skipped: 0 };

  /** How a recorded move names a group: table groups by key, seat groups relative to whose turn it is. */
  function recordRef(source, zoneId) {
    const zone = source.zones[zoneId];
    if (!zone) return String(zoneId || "");
    const key = zone.key || zone.name.toLowerCase();
    if (zone.area === "table") return key;
    if (zone.area === source.players[source.turn.index]?.id) return key + "@current";
    if (zone.area === source.players[source.turn.dealer]?.id) return key + "@dealer";
    if (zone.area === E.playerAfter(source)?.id) return key + "@after";
    return key + "@p:" + zone.area;
  }

  function recordAction(before, action) {
    const ref = (id) => recordRef(before, id);
    const deckId = E.findDeckZone(before)?.id;
    const steps = [];
    const face = action.face ? { face: action.face } : {};
    switch (action.type) {
      case "move": {
        const ids = (action.cards || []).map((id) => E.resolveCard(before, id)).filter(Boolean);
        const from = ids.length ? E.zoneOf(before, ids[0]) : null;
        const to = before.zones[action.to];
        if (!from || !to || from.id === to.id) break;
        steps.push(from.cards.length === ids.length ? { op: "clear", from: ref(from.id), to: ref(to.id), ...face } : { op: "deal", from: ref(from.id), to: ref(to.id), count: ids.length, ...face });
        break;
      }
      case "draw": steps.push({ op: "deal", from: ref(action.from || deckId), to: ref(action.to), count: action.count || 1, ...face }); break;
      case "deal": steps.push({ op: "deal", from: ref(action.from), to: before.zones[action.to] ? ref(action.to) : String(action.to), count: action.count || 1, ...face }); break;
      case "shuffle": steps.push({ op: "shuffle", zone: ref(action.zone) }); break;
      case "cut": steps.push({ op: "cut", zone: ref(action.zone) }); break;
      case "flipZone": steps.push({ op: "flip", zone: ref(action.zone), face: action.face || "up" }); break;
      case "flip": {
        const ids = (action.cards || []).map((id) => E.resolveCard(before, id)).filter(Boolean);
        const zone = ids.length ? E.zoneOf(before, ids[0]) : null;
        if (zone) steps.push({ op: "flip", zone: ref(zone.id), face: action.face || "up", count: ids.length });
        break;
      }
      case "collect": steps.push({ op: "collect", to: ref(action.to || deckId), shuffle: action.shuffle !== false }); break;
      case "clearZone": steps.push({ op: "clear", from: ref(action.zone), to: ref(action.to || deckId), ...face }); break;
      case "sort": steps.push({ op: "sort", zone: ref(action.zone), by: action.by || "rank" }); break;
      case "nextTurn": if (!action.back) steps.push({ op: "nextTurn" }); break;
      case "passDeal": steps.push({ op: "nextDealer" }, { op: "setTurn", who: "next" }); break;
      case "setTurn": if (action.who) steps.push({ op: "setTurn", who: action.who }); break;
      case "nextRound": steps.push({ op: "nextRound" }); break;
      case "setPhase": steps.push({ op: "phase", text: action.phase }); break;
      case "nextPhase": steps.push({ op: "nextPhase" }); break;
      case "reverseDirection": steps.push({ op: "reverse" }); break;
      case "runMacro": if (action.id) steps.push({ op: "runAction", macro: action.id }); else steps.push(...E.clone(action.steps || [])); break;
      case "adjustScore": steps.push({ op: "score", who: action.player === before.players[before.turn.index]?.id ? "current" : "all", amount: action.delta }); break;
      case "revealAll": steps.push(...before.seatTemplate.filter((tpl) => tpl.visibility !== "public").map((tpl) => ({ op: "flip", zone: tpl.key, face: "up" }))); break;
      case "ante": steps.push({ op: "ante", amount: action.amount }); break;
      default: break;
    }
    if (!steps.length) { recorder.skipped += 1; return; }
    recorder.steps.push(...steps);
    recorder.groups.push(steps.length);
  }

  function startRecording() {
    if (net.mode === "client") return toast("Only the host can record actions.", "error");
    Object.assign(recorder, { on: true, steps: [], groups: [], skipped: 0 });
    toast("Recording: deal, move, flip, shuffle and pass turns as usual, then press Stop.", "good");
    render();
  }

  function stopRecording() {
    const steps = recorder.steps.slice(0, 40);
    const skipped = recorder.skipped;
    Object.assign(recorder, { on: false, steps: [], groups: [], skipped: 0 });
    render();
    if (!steps.length) return toast("Nothing was recorded.");
    openMacroDialog(null, { label: "Recorded action", hint: skipped ? `${skipped} move${skipped === 1 ? "" : "s"} couldn't be recorded` : "", steps });
  }

  function designCheckHTML(v) {
    const issues = E.lintDesign(v);
    if (!issues.length) return `<p class="check-ok">✓ No problems found: references, turn passing, deal sizes and the end of the game all check out.</p>`;
    const icon = { error: "⛔", warn: "⚠️", info: "ℹ️" };
    return `<div class="list">${issues.map((issue) => `<div class="issue issue-${issue.level}"><span>${icon[issue.level]}</span><span>${esc(issue.message)}</span></div>`).join("")}</div>`;
  }

  // ================================================================ HINT
  /** Ask the smart bot what it would play for you, and point at it. */
  function showHint() {
    const source = net.mode === "client" ? view : state;
    const me = net.mode === "client" ? mySeatId() : actingId();
    if (!source || !me) return toast("Take a seat (or leave X-ray) to get a hint.");
    if (source.players[source.turn.index]?.id !== me && Object.values(source.zones).some((zone) => zone.rule?.place === "turn")) return toast("It isn't your turn.");
    let play = null;
    try { play = E.pickPlay(source, me, "smart"); } catch (error) { play = null; }
    if (!play) return toast("No legal play right now: draw or pass.", "warn");
    selection.clear();
    (play.cards || [play.card]).forEach((id) => selection.add(id));
    render();
    const card = view.cards[play.card];
    showPing({ zone: play.to, name: "Hint", color: "#f4c95d" });
    const what = card?.visible ? (card.custom ? card.label : E.cardName(card)) : "That card";
    const claim = view.zones[play.to]?.rule?.claim ? ` as ${RANK_WORD(E.nextClaimRank(view.zones[play.to]))}${play.bluff ? ", a bluff: you have none" : ""}` : "";
    toast(`💡 ${play.cards?.length > 1 ? `${play.cards.length} × ${what.replace(/[♠♥♦♣]/g, "")}` : what}${play.buy ? " (buy)" : ""} → ${view.zones[play.to]?.name || "?"}${claim} (press P to play it)`);
  }

  // ================================================================== QR
  let qrLoading = null;
  function loadQr() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (!qrLoading) {
      qrLoading = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js";
        script.onload = () => (window.qrcode ? resolve(window.qrcode) : reject(new Error("QR unavailable")));
        script.onerror = () => { qrLoading = null; reject(new Error("QR unavailable")); };
        document.head.appendChild(script);
      });
    }
    return qrLoading;
  }

  function showQr(el, text) {
    if (!el) return;
    loadQr().then((qrcode) => {
      const qr = qrcode(0, "M");
      qr.addData(text);
      qr.make();
      el.innerHTML = qr.createSvgTag(4, 2);
      el.hidden = false;
    }).catch(() => { el.hidden = true; });
  }

  // ================================================================ TOUR
  const TOUR = [
    { target: "#newBtn", title: "Start or design a game", text: "Pick one of the ready-made games, or ✨ Design your own from a few answers. Everything is editable afterwards.", tab: null },
    { target: ".macro-grid", title: "One-tap actions", text: "Actions script the flow: deal, flip, find the winner, score… Press 1–9 or click. ● Record turns what you do by hand into a new action.", tab: "play" },
    { target: "#seats .zone, #around .zone", title: "Cards and groups", text: "Tap cards to select, drag to move, double-click to flip. Places a card can legally go glow green; H asks the smart bot for a hint.", tab: null },
    { target: '#tabs [data-tab="rules"]', title: "Rules and automation", text: "Give groups play rules, add triggers and scoring formulas, generate the rules document, and run the design check.", tab: null },
    { target: '#tabs [data-tab="tools"]', title: "Playtest like a lab", text: "Bots, whole-game simulations with A/B comparisons, deal odds, seeded replays, pacing and results by seat.", tab: null },
    { target: "#roomBtn", title: "Play together", text: "Open an online room: hands stay private and friends join by link or QR code. Ctrl/⌘+K finds any command.", tab: null },
  ];
  const tour = { step: -1 };

  function startTour() {
    closeDialog();
    tour.step = 0;
    showTourStep();
  }

  function endTour() {
    tour.step = -1;
    $("#tour").hidden = true;
    store(STORE.toured, true);
  }

  function showTourStep() {
    const step = TOUR[tour.step];
    if (!step) return endTour();
    if (step.tab || step.target.startsWith("#tabs") || step.target === ".macro-grid") {
      prefs.side = true;
      if (step.tab) prefs.tab = step.tab;
      savePrefs();
      render();
    }
    const target = $$(step.target).find((el) => el.getBoundingClientRect().width > 0);
    if (!target) { tour.step += 1; return showTourStep(); }
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
    const rect = target.getBoundingClientRect();
    const layer = $("#tour");
    layer.hidden = false;
    const pad = 6;
    const spot = layer.querySelector(".tour-spot");
    spot.style.left = rect.left - pad + "px";
    spot.style.top = rect.top - pad + "px";
    spot.style.width = rect.width + pad * 2 + "px";
    spot.style.height = rect.height + pad * 2 + "px";
    const bubble = layer.querySelector(".tour-bubble");
    bubble.innerHTML = `<div class="small muted">${tour.step + 1} of ${TOUR.length}</div><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p>
      <div class="row tight"><button class="btn sm ghost" data-tour="skip">Skip</button><span class="grow"></span>${tour.step ? `<button class="btn sm" data-tour="back">Back</button>` : ""}<button class="btn sm primary" data-tour="next">${tour.step === TOUR.length - 1 ? "Done" : "Next"}</button></div>`;
    const width = Math.min(320, window.innerWidth - 24);
    bubble.style.width = width + "px";
    const below = rect.bottom + 14 + 170 < window.innerHeight;
    bubble.style.top = (below ? rect.bottom + 14 : Math.max(12, rect.top - 14 - bubble.offsetHeight)) + "px";
    bubble.style.left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2)) + "px";
  }

  // ================================================================ DOCK
  /** On phones, keep the main actions one tap away while the panel is closed. */
  function renderDock() {
    const dock = $("#dock");
    const show = window.innerWidth <= 820 && !prefs.side && !selection.size && !replay.active && view && view.macros.length > 0;
    dock.hidden = !show;
    if (!show) return;
    dock.innerHTML = view.macros.slice(0, 3).map((macro) => `<button class="btn sm" data-act="macro" data-id="${macro.id}">${esc(macro.label)}</button>`).join("")
      + `<button class="btn sm" data-act="hint" title="Hint">💡</button><button class="btn sm primary" data-act="next-turn">Next ›</button>`;
  }

  /** Slaps, calls, challenges and trades per player, once any have happened. */
  function tableTalkHTML(v) {
    const stats = v.stats || {};
    const rows = v.players.filter((player) => stats[player.id]);
    if (!rows.length) return "";
    const cell = (value, title) => `<span title="${esc(title)}">${value}</span>`;
    const line = (player) => {
      const s = stats[player.id];
      const bits = [];
      if (s.slaps || s.wrongSlaps) bits.push(cell(`👋 ${s.slaps || 0}/${(s.slaps || 0) + (s.wrongSlaps || 0)}`, "Good slaps / all slaps"));
      if (s.calls) bits.push(cell(`🔍 ${s.rightCalls || 0}/${s.calls}`, "Calls that caught a bluff / all calls"));
      if (s.caught) bits.push(cell(`🤥 ${s.caught}`, "Times caught bluffing"));
      if (s.challenges) bits.push(cell(`👑 ${s.challenges}`, "Challenges won"));
      if (s.trades) bits.push(cell(`🤝 ${s.trades}`, "Trades made"));
      return `<div class="list-row talk-row" style="--c:${esc(player.color)}"><span class="grow small"><i class="swatch"></i> <b>${esc(player.name)}</b></span><span class="talk-stats small">${bits.join("")}</span></div>`;
    };
    return block("Table talk", `<div class="list">${rows.map(line).join("")}</div><p class="hint">Playtest reflexes and reads: who slaps well, who calls right, who gets caught.</p>`);
  }

  // ========================================================== SCOREBOARD
  function openScoreboard() {
    const draw = () => {
      const v = view;
      const totals = E.totals(v);
      const ranked = v.players.slice().sort((a, b) => (v.scores.lowWins ? totals[a.id] - totals[b.id] : totals[b.id] - totals[a.id]));
      const top = ranked.length ? totals[ranked[0].id] : 0;
      return head(`${v.title} · round ${v.turn.round}`) + `<div class="dlg-body scoreboard">
          <div class="sb-grid">${ranked.map((player, i) => `<div class="sb-row${totals[player.id] === top ? " lead" : ""}" style="--c:${esc(player.color)}"><span class="sb-place">${i + 1}</span><span class="sb-name"><i class="swatch"></i>${esc(player.name)}${player.team ? `<small>${esc(player.team)}</small>` : ""}</span><span class="sb-score">${E.fmt(totals[player.id])}</span></div>`).join("")}</div>
          ${scoreChartHTML(v)}
          <p class="small muted">${v.scores.target ? `Playing to ${E.fmt(v.scores.target)}${v.scores.lowWins ? ", lowest wins" : ""}.` : v.scores.maxRounds ? `${v.scores.maxRounds} rounds${v.scores.lowWins ? ", lowest wins" : ""}.` : ""} This board updates live.</p>
        </div>
        <div class="dlg-foot"><button class="btn primary" value="cancel">Close</button></div>`;
    };
    openDialog(draw(), { wide: true });
    dialog().classList.add("scoreboard-dialog");
    scoreboardOpen = true;
  }
  let scoreboardOpen = false;

  // ============================================================== INIT
  function init() {
    applyPrefs();
    bindEvents();
    if (prefs.seed) {
      seededFn = E.seededRng(prefs.seed);
      E.setRng(seededFn);
    }
    const saved = load(STORE.table, null);
    try { state = saved ? E.migrate(saved) : null; } catch (error) { state = null; }
    const firstVisit = !state;
    if (!state) state = E.createTable(P.get("holdem"), { players: 4 });
    lastLogKey = logKey(state.log[state.log.length - 1]);
    render();
    openLinkFromHash().then((opened) => {
      if (opened) return;
      const code = new URLSearchParams(location.search).get("room");
      if (code) openRoomDialog(code.toUpperCase());
      else if (firstVisit && !load(STORE.seen, false)) openNewGame();
    });
    window.addEventListener("hashchange", () => openLinkFromHash());
    // Offline support and "install as an app" (served over https or localhost only).
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }

  init();
})();
