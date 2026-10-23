/* Static, browser-local Scoundrel client. */
(() => {
  "use strict";
  const E = window.Scoundrel, $ = (id) => document.getElementById(id);
  const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const seal = (c) => `<span class="value-seal" aria-hidden="true"><span>${c.value}</span></span>`;
  const RUN = "scoundrel-run-v1", PREFS = "scoundrel-preferences-v1", STATS = "scoundrel-stats-v1";
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
  const seed = () => Array.from(crypto.getRandomValues(new Uint32Array(2)), (n) => n.toString(36)).join("");
  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="../shared/icons.svg#i-${name}" /></svg>`;
  const same = E.sameAction;
  const ev = value => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let prefs = { sound: false, motion: true, atmosphere: "ember", oracle: false, ...read(PREFS, {}) };
  let stats = read(STATS, { played: 0, won: 0, best: null, recorded: [] });
  if (!Array.isArray(stats.recorded)) stats = { played: 0, won: 0, best: null, recorded: [] };
  const requestedSeed = new URLSearchParams(location.search).get("seed");
  let saved = E.restore(read(RUN, null));
  const keepSlots = new URLSearchParams(location.search).get("layout") !== "legacy";
  if (saved && !keepSlots && saved.keepSlots !== false) saved = null;
  if (saved) saved.keepSlots = keepSlots;
  let state = requestedSeed && /^[a-zA-Z0-9-]{1,80}$/.test(requestedSeed) && saved?.seed !== requestedSeed ? E.createGame({ seed: requestedSeed, keepSlots }) : saved || E.createGame({ seed: seed(), keepSlots });
  let selected = null, worker = null, request = 0, analysis = [], audio = null, known = new Set(), resultShown = false, searchStatus = null, analysisError = null;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)"), motion = () => prefs.motion && !reduced.matches;
  const roman = (n) => n < 40 ? ["", "X", "XX", "XXX"][Math.floor(n / 10)] + ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"][n % 10] : String(n);
  const names = { monster: "Monster", weapon: "Weapon", potion: "Potion" };
  const catalog = window.ScoundrelCatalog;
  const name = (c) => catalog[c.id].name;
  const art = (c) => c.image + "?v=20261022-ash";
  const sources = (c) => c.image.replace("/cards/", "/cards/thumbs/") + "?v=20261022-ash 320w, " + art(c) + " 960w";
  const deckOverview = ScoundrelDeckOverview.create({ onInspect: openArtwork });
  let artworkOpener = null, artworkCard = null;
  ScoundrelCardMotion.attach($("room-cards"), { selector: ".encounter", enabled: motion });
  ScoundrelCardMotion.attach($("catalog-grid"), { selector: ".catalog-art-button", enabled: motion });

  function preferences() {
    document.documentElement.dataset.atmosphere = ["ember", "moon", "moss"].includes(prefs.atmosphere) ? prefs.atmosphere : "ember";
    document.documentElement.dataset.motion = prefs.motion ? "on" : "off";
    if (!motion()) ScoundrelCardMotion.resetAll();
    $("sound-button").setAttribute("aria-pressed", String(!!prefs.sound));
    $("sound-button").setAttribute("aria-label", prefs.sound ? "Mute sound" : "Enable sound");
    $("sound-button").innerHTML = icon(prefs.sound ? "sound" : "sound-off");
    $("atmosphere").value = document.documentElement.dataset.atmosphere;
    $("motion-setting").checked = !!prefs.motion; $("oracle-toggle").checked = !!prefs.oracle;
    $("oracle-panel").hidden = !prefs.oracle; write(PREFS, prefs);
  }

  function sound(kind) {
    if (!prefs.sound) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume().catch(() => {});
      const notes = kind === "potion" ? [392, 523, 659] : kind === "weapon" ? [220, 440] : kind === "monster" ? [90, 55] : [180, 240];
      notes.forEach((frequency, i) => {
        const osc = audio.createOscillator(), gain = audio.createGain(), t = audio.currentTime + i * .075;
        osc.type = kind === "monster" ? "triangle" : "sine"; osc.frequency.setValueAtTime(frequency, t);
        if (kind === "monster") osc.frequency.exponentialRampToValueAtTime(frequency / 2, t + .18);
        gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(.055, t + .008); gain.gain.exponentialRampToValueAtTime(.0001, t + .28);
        osc.connect(gain); gain.connect(audio.destination); osc.start(t); osc.stop(t + .3);
      });
    } catch { /* Sound is optional. */ }
  }

  function render() {
    const final = state.deck.length === 0;
    $("room-title").textContent = "Room " + roman(state.roomNumber);
    $("room-instruction").textContent = state.phase === "won" ? "All cards cleared" : state.phase === "lost" ? "Game over" : final ? "Final room · clear all cards" : state.phase === "ready" ? "Carry the remaining card into the next room" : "Resolve 3 cards · carry 1 forward";
    $("room-pips").innerHTML = Array.from({ length: final ? state.room.filter(Boolean).length + state.resolved : 3 }, (_, i) => `<span class="${i < state.resolved ? "filled" : ""}"></span>`).join("");
    $("room-pips").setAttribute("aria-label", state.resolved + " encounters resolved");
    $("health-value").textContent = state.health; $("health-bar").setAttribute("aria-valuenow", state.health);
    $("health-bar").firstElementChild.style.width = state.health * 5 + "%";
    $("weapon-display").innerHTML = (state.weapon ? seal(state.weapon) : '<span class="weapon-empty" aria-hidden="true">◇</span>') + `<div class="weapon-numbers"><strong>${state.weapon?.value || "—"}</strong><span>${state.weapon ? "Power" : "Unarmed"}</span></div>`;
    $("weapon-rule").textContent = !state.weapon ? "Unarmed" : E.weaponLimit(state) === 15 ? "Power " + state.weapon.value + " · any monster" : "Power " + state.weapon.value + " · next below " + E.weaponLimit(state);
    $("weapon-chain").innerHTML = state.slain.map((c) => `<span class="chain-mark" title="${esc(E.label(c))}">${c.value}</span>`).join("");
    $("deck-count").textContent = E.remaining(state); $("cleared-count").textContent = 44 - E.remaining(state);
    $("dungeon-progress").style.width = (44 - E.remaining(state)) / 44 * 100 + "%";
    $("run-label").textContent = "Descent " + state.seed.slice(0, 14).toUpperCase();
    const focused = document.activeElement?.dataset.card;
    $("room-cards").innerHTML = state.room.map((c, i) => !c ? '<div class="encounter-empty" aria-hidden="true"><span></span></div>' : `<button type="button" class="encounter${selected === c.id ? " is-selected" : ""}${!known.has(c.id) && motion() ? " is-new" : ""}" data-card="${c.id}" data-kind="${c.type}" data-suit="${c.suit}" style="--deal-index: ${i}" aria-label="${esc(name(c))}, ${catalog[c.id].race || names[c.type]}, value ${c.value}" aria-pressed="${selected === c.id}" ${state.phase !== "playing" ? "disabled" : ""}><span class="encounter-visual"><img class="encounter-art" src="${art(catalog[c.id])}" srcset="${sources(catalog[c.id])}" sizes="(max-width: 600px) calc((100vw - 58px) / 2), (max-width: 800px) calc((100vw - 100px) / 4), 240px" alt="" draggable="false" decoding="async" /><span class="encounter-top"><span>${catalog[c.id].race || names[c.type]}</span><span class="encounter-index" aria-hidden="true">${i + 1}</span></span></span><span class="encounter-bottom">${seal(c)}<span class="encounter-name"><strong>${esc(name(c))}</strong><small>${c.type === "monster" ? "Strength" : c.type === "weapon" ? "Power" : "Healing"}</small></span></span></button>`).join("");
    known = new Set(state.room.filter(Boolean).map((c) => c.id));
    if (focused) document.querySelector(`[data-card="${focused}"]`)?.focus({ preventScroll: true });
    $("flee-button").disabled = !E.canFlee(state);
    $("flee-button").title = state.resolved ? "You already faced an encounter in this room." : state.fledPrevious ? "You cannot avoid two rooms in a row." : "Return all four cards to the bottom of the dungeon.";
    $("room-message").textContent = state.potionUsed && state.phase === "playing" ? "Potion used · additional potions will be discarded" : "";
    renderSelection(); renderAnalysis();
    $("save-status").textContent = write(RUN, state) ? "Saved locally" : "Storage unavailable · keep this tab open";
    if (["won", "lost"].includes(state.phase) && !resultShown) finish();
  }

  const button = (action, title, detail, primary = false) => `<button type="button" class="game-button ${primary ? "primary" : "secondary"}" data-kind="${action.type === "drink" ? "potion" : action.type === "equip" || action.mode === "weapon" ? "weapon" : "other"}" data-action='${esc(JSON.stringify(action))}'><span>${title}</span><small>${detail}</small></button>`;
  function renderSelection() {
    const c = state.room.find((c) => c?.id === selected);
    $("room-message").hidden = !$("room-message").textContent;
    let title = "Select a card", detail = "", buttons = "";
    if (state.phase === "ready") { title = "Room cleared"; buttons = button({ type: "descend" }, "Enter next room", "Carry one · reveal three", true); }
    else if (["won", "lost"].includes(state.phase)) { title = state.phase === "won" ? "Victory" : "Defeat"; detail = "Final score: " + E.score(state); buttons = '<button class="game-button primary" id="review-result" type="button">View result</button>'; }
    else if (c) {
      title = name(c);
      if (c.type === "monster") {
        const armed = E.canUseWeapon(state, c), damage = armed ? Math.max(0, c.value - state.weapon.value) : c.value;
        detail = armed ? "Weapon power " + state.weapon.value + ". Your next weapon target must be below " + c.value + "." : state.weapon ? "This monster is too strong for your weapon’s current chain." : "You are unarmed. You will take the monster’s full damage.";
        if (armed) buttons += button({ type: "fight", id: c.id, mode: "weapon" }, "Use weapon", damage + " damage" + (damage >= state.health ? " · fatal" : ""), true);
        buttons += button({ type: "fight", id: c.id, mode: "bare" }, "Fight barehanded", c.value + " damage" + (c.value >= state.health ? " · fatal" : ""), !armed);
      } else if (c.type === "weapon") { detail = state.weapon ? "Replaces your " + state.weapon.value + "-power weapon and resets its chain." : "Reduce incoming damage by " + c.value + ". Any monster can start your chain."; buttons = button({ type: "equip", id: c.id }, "Equip weapon", c.value + " power · fresh chain", true); }
      else { const heal = state.potionUsed ? 0 : Math.min(c.value, 20 - state.health); detail = state.potionUsed ? "You already used a potion this room. This one will be discarded." : "Restore up to " + c.value + " health. Maximum health is 20."; buttons = button({ type: "drink", id: c.id }, state.potionUsed ? "Discard potion" : "Drink potion", "+" + heal + " health", true); }
    }
    $("selection-title").textContent = title; $("selection-detail").textContent = detail; $("selection-detail").hidden = !detail; $("encounter-actions").innerHTML = buttons;
  }
  function select(id) {
    if (state.phase !== "playing") return;
    selected = selected === id ? null : id;
    for (const el of document.querySelectorAll(".encounter")) { el.classList.toggle("is-selected", el.dataset.card === selected); el.setAttribute("aria-pressed", String(el.dataset.card === selected)); }
    renderSelection();
  }
  function depart(action) {
    if (!motion()) return;
    if (action.type === "flee") {
      for (const el of $("room-cards").querySelectorAll(".encounter")) {
        const r = el.getBoundingClientRect(), clone = el.cloneNode(true);
        clone.classList.remove("is-new"); clone.classList.add("departing-card"); clone.setAttribute("aria-hidden", "true"); clone.tabIndex = -1;
        Object.assign(clone.style, { left: r.x + "px", top: r.y + "px", width: r.width + "px", height: r.height + "px" }); document.body.append(clone);
        const direction = action.direction === "right" ? 1 : -1;
        clone.animate([{ transform: "translateX(0)", opacity: 1 }, { transform: `translateX(${direction * Math.min(innerWidth, 650)}px) rotate(${direction * 12}deg) scale(.8)`, opacity: 0 }], { duration: 400, easing: "cubic-bezier(.2,.8,.2,1)" }).finished.catch(() => {}).finally(() => clone.remove());
      }
      known.clear();
      return;
    }
    if (!action.id) return;
    const el = document.querySelector(`[data-card="${action.id}"]`); if (!el) return;
    const r = el.getBoundingClientRect(), clone = el.cloneNode(true), target = $(action.type === "equip" ? "weapon-display" : "health-block").getBoundingClientRect();
    clone.classList.remove("is-new"); clone.classList.add("departing-card"); clone.setAttribute("aria-hidden", "true"); clone.tabIndex = -1;
    Object.assign(clone.style, { left: r.x + "px", top: r.y + "px", width: r.width + "px", height: r.height + "px" }); document.body.append(clone);
    clone.animate([{ transform: "translate(0, 0)", opacity: 1 }, { transform: `translate(${(target.x - r.x) * .7}px, ${(target.y - r.y) * .7}px) rotate(-12deg) scale(.3)`, opacity: 0 }], { duration: 450, easing: "cubic-bezier(.2,.8,.2,1)" }).finished.catch(() => {}).finally(() => clone.remove());
  }
  function act(action) {
    if (!E.actions(state).some((a) => same(a, action))) return;
    depart(action); const oldHealth = state.health;
    state = E.transition(state, action); selected = null; analysis = [];
    const event = state.history.at(-1); sound(event.kind); render();
    if (event.delta) {
      $("combat-flash").className = "combat-flash"; $("floating-number").className = "floating-number"; void $("combat-flash").offsetWidth;
      $("combat-flash").classList.add(event.delta < 0 ? "hit" : "heal"); $("floating-number").textContent = event.delta > 0 ? "+" + event.delta : "−" + (oldHealth - state.health);
      $("floating-number").classList.toggle("positive", event.delta > 0); $("floating-number").classList.add("show");
    }
    if (["descend", "flee"].includes(action.type)) $("room-cards").querySelector("button")?.focus({ preventScroll: true });
    else if (state.phase === "ready") $("encounter-actions").querySelector("button")?.focus({ preventScroll: true });
    analyze();
  }
  const best = () => analysis.filter((r) => r.score != null).sort((a, b) => b.score - a.score || Number(b.exact) - Number(a.exact))[0];
  function renderAnalysis(pending = false) {
    for (const el of document.querySelectorAll(".encounter.is-best")) { el.classList.remove("is-best"); el.querySelector(".best-ribbon")?.remove(); }
    if (!prefs.oracle) return;
    updateAvoidValues();
    if (analysisError) { $("oracle-summary").textContent = analysisError; $("search-progress").textContent = ""; $("action-values").innerHTML = ""; $("extend-button").disabled = true; return; }
    const b = best();
    const isBest = row => row?.score != null && b && row.score === b.score && (row.equivalence === b.equivalence || row.exact && b.exact);
    const winners = analysis.filter(isBest);
    for (const winner of winners) if (winner.action.id) { const el = document.querySelector(`[data-card="${winner.action.id}"]`); if (el && !el.classList.contains("is-best")) { el.classList.add("is-best"); const ribbon = document.createElement("span"); ribbon.className = "best-ribbon"; ribbon.textContent = winners.length > 1 ? "Equal best EV" : "Best EV"; ribbon.setAttribute("aria-hidden", "true"); el.append(ribbon); } }
    const proven = b && analysis.every(r => r.exact);
    $("oracle-summary").textContent = !E.actions(state).length ? "Game over. Final score " + ev(E.score(state)) + "." : b ? `${proven ? "Exact best" : "Recommended"}: ${winners.map(row => E.describe(state, row.action)).join(" or ")}. ${proven ? "Final score" : "Estimated final score"} ${ev(b.score)}.${pending ? " Evaluating alternatives…" : ""}` : "Calculating moves…";
    const progress = $("search-progress");
    progress.textContent = searchStatus ? `${searchStatus.simulations.toLocaleString()}${searchStatus.pending ? " / " + searchStatus.target.toLocaleString() : ""} simulations · ${searchStatus.pending ? "searching" : analysis.every(row => row.exact) ? "solved exactly" : "complete"}` : "";
    $("extend-button").disabled = !worker || searchStatus?.target === 1000000 || !pending && analysis.length > 0 && analysis.every(row => row.exact);
    $("extend-button").textContent = searchStatus?.target === 1000000 && searchStatus.pending ? "Searching to 1M…" : "Search to 1M";
    const rows = E.actions(state).map(action => ({ action, row: analysis.find(row => same(row.action, action)) }));
    rows.sort((a, b) => (a.row?.score == null) - (b.row?.score == null) || (b.row?.score ?? -Infinity) - (a.row?.score ?? -Infinity) || Number(b.row?.exact || false) - Number(a.row?.exact || false));
    $("action-values").innerHTML = rows.map(({ action: a, row: r }) => {
      const c = state.room.find((c) => c?.id === a.id);
      const shared = r && analysis.filter(row => row.equivalence === r.equivalence).length > 1;
      const change = a.type === "fight" ? "−" + (a.mode === "weapon" ? Math.max(0, c.value - state.weapon.value) : c.value) + " health" : a.type === "drink" ? "+" + (state.potionUsed ? 0 : Math.min(c.value, 20 - state.health)) + " health" : "—";
      const val = r?.score == null ? "Searching…" : ev(r.score);
      return `<tr${isBest(r) ? ' class="is-best"' : ""}><td><button class="oracle-action" type="button" data-preview='${esc(JSON.stringify(a))}'>${esc(E.describe(state, a))}</button></td><td data-label="Health">${change}</td><td class="value-cell" data-label="EV · final score">${val}</td><td data-label="Analysis"><span class="proof${r?.exact ? " exact" : ""}">${r?.score == null ? "Pending" : r.exact ? "Exact" : r.samples.toLocaleString() + (shared ? " shared samples" : " samples")}</span></td></tr>`;
    }).join("");
  }
  function analyze() {
    worker?.terminate(); worker = null; searchStatus = null; analysisError = null; const requestId = ++request;
    if (!E.actions(state).length) { renderAnalysis(); return; }
    if (!window.Worker) { analysisError = "This browser does not support the worker required for analysis."; renderAnalysis(); return; }
    try {
      worker = new Worker("solver-worker.js?v=20261022-slots");
      worker.onmessage = ({ data }) => { if (data.requestId !== request) return; if (data.error) { analysisError = "Analysis unavailable: " + data.error; renderAnalysis(); return; } analysis = data.results; searchStatus = { pending: data.pending, simulations: data.simulations, target: data.target }; renderAnalysis(data.pending); };
      worker.onerror = () => { analysisError = "The analysis worker could not load. Try reloading the page."; renderAnalysis(); };
      searchStatus = { pending: true, simulations: 0, target: 100000 };
      worker.postMessage({ requestId, observation: E.observe(state), target: 100000 }); renderAnalysis(true);
    } catch { analysisError = "Analysis needs a browser that supports Web Workers."; renderAnalysis(); }
  }
  $("extend-button").addEventListener("click", () => {
    if (!worker || searchStatus?.target === 1000000) return;
    searchStatus = { ...searchStatus, pending: true, target: 1000000 };
    worker.postMessage({ requestId: ++request, observation: E.observe(state), target: 1000000 });
    renderAnalysis(true);
  });
  function start() {
    for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
    state = E.createGame({ seed: seed(), keepSlots }); selected = null; resultShown = false; analysis = []; known = new Set(); render(); analyze(); sound("room");
  }
  function finish() {
    resultShown = true; const won = state.phase === "won", score = E.score(state), runId = state.id;
    if (!stats.recorded.includes(runId)) { stats.played++; stats.won += Number(won); stats.best = Math.max(stats.best ?? -Infinity, score); stats.recorded = [...stats.recorded, runId].slice(-200); write(STATS, stats); }
    $("result-title").textContent = won ? "Victory" : "Defeat";
    $("result-score").textContent = score; $("result-facts").textContent = `${state.monstersSlain} monsters defeated · ${state.roomsFled} rooms avoided${won && score > 20 ? " · final potion bonus +" + (score - 20) : ""}`;
    setTimeout(() => { if (state.id === runId && !$("result-dialog").open) $("result-dialog").showModal(); }, motion() ? 650 : 0);
  }
  function updateAvoidValues() {
    for (const el of document.querySelectorAll("[data-avoid-ev]")) {
      const row = analysis.find(r => same(r.action, { type: "flee", direction: el.dataset.avoidEv }));
      el.hidden = !prefs.oracle;
      el.textContent = row?.score == null ? "EV: calculating…" : row.exact ? `EV ${ev(row.score)} · exact` : `EV ${ev(row.score)} · ${row.samples.toLocaleString()} samples`;
    }
  }
  function openAvoid(direction = "left") {
    if (!E.canFlee(state)) return;
    $("avoid-description").textContent = state.deck.length ? `These cards go after the ${state.deck.length} cards already in the deck. Then you’ll draw them in this order:` : "The deck is empty. These cards will be drawn again immediately, in this order:";
    $("avoid-choices").innerHTML = ["left", "right"].map(dir => {
      const cards = E.fleeOrder(state, dir);
      return `<button class="avoid-choice" type="button" data-avoid="${dir}" aria-label="Avoid ${dir}. After ${state.deck.length} cards already in the deck, draw ${cards.map((c, i) => `${i + 1}: ${esc(name(c))}, value ${c.value}`).join('; ')}. Last card is at the bottom of the deck."><span class="avoid-choice-title"><strong>${dir === "left" ? "←" : "→"} Avoid ${dir}</strong><span>${dir === "left" ? "Keep room order" : "Reverse room order"}</span></span><span class="avoid-order" aria-hidden="true"><span>Drawn first</span><span>Last · deck bottom</span></span><span class="avoid-preview" aria-hidden="true">${cards.map((c, i) => `<span class="avoid-position"><span class="avoid-card" data-suit="${c.suit}"><img src="${catalog[c.id].image.replace('/cards/', '/cards/thumbs/')}" alt="" /><strong>${c.value}</strong></span><span class="avoid-draw-order">${["1st", "2nd", "3rd", "4th"][i]}</span></span>`).join('<i>→</i>')}</span><span class="avoid-value" data-avoid-ev="${dir}"></span></button>`;
    }).join("");
    updateAvoidValues();
    $("avoid-dialog").showModal();
    $("avoid-choices").querySelector(`[data-avoid="${direction}"]`).focus();
  }
  $("avoid-choices").addEventListener("click", event => {
    const choice = event.target.closest("[data-avoid]");
    if (choice) { $("avoid-dialog").close(); act({ type: "flee", direction: choice.dataset.avoid }); }
  });
  // Horizontal touch gestures open the matching choice. The preview keeps an
  // incidental swipe from committing a turn; vertical scrolling remains native.
  let swipe = null, suppressClickUntil = 0;
  $("room-cards").addEventListener("pointerdown", event => {
    if (event.isPrimary && event.pointerType !== "mouse" && E.canFlee(state)) swipe = { x: event.clientX, y: event.clientY, id: event.pointerId, step: state.steps };
  });
  $("room-cards").addEventListener("pointerup", event => {
    const start = swipe; swipe = null;
    if (!start || start.id !== event.pointerId || start.step !== state.steps) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) >= 65 && Math.abs(dx) > Math.abs(dy) * 1.8 && E.canFlee(state)) {
      suppressClickUntil = Date.now() + 500; openAvoid(dx < 0 ? "left" : "right");
    }
  });
  $("room-cards").addEventListener("pointercancel", () => { swipe = null; });
  $("room-cards").addEventListener("click", (event) => { if (Date.now() < suppressClickUntil) return; const el = event.target.closest("[data-card]"); if (el) select(el.dataset.card); });
  $("encounter-actions").addEventListener("click", (event) => { const el = event.target.closest("[data-action]"); if (el) act(JSON.parse(el.dataset.action)); if (event.target.closest("#review-result")) $("result-dialog").showModal(); });
  $("action-values").addEventListener("click", (event) => { const el = event.target.closest("[data-preview]"); if (!el) return; const a = JSON.parse(el.dataset.preview); if (a.id) { selected = null; select(a.id); $("action-stage").scrollIntoView({ behavior: motion() ? "smooth" : "instant", block: "nearest" }); } else if (a.type === "flee") openAvoid(a.direction); else $("encounter-actions").querySelector("button")?.focus(); });
  $("flee-button").addEventListener("click", () => openAvoid());
  $("new-run").addEventListener("click", () => state.steps ? $("new-dialog").showModal() : start());
  $("confirm-new").addEventListener("click", start); $("result-new").addEventListener("click", start);
  $("rules-button").addEventListener("click", () => $("rules-dialog").showModal());
  $("settings-button").addEventListener("click", () => { $("local-stats").textContent = `${stats.played} completed descents · ${stats.won} survived · Best score ${stats.best ?? "—"}`; $("settings-dialog").showModal(); });
  $("cards-left-button").addEventListener("click", () => deckOverview.open("left", E.observe(state)));
  $("cards-resolved-button").addEventListener("click", () => deckOverview.open("resolved", E.observe(state)));
  function showCatalog(filter = "all") {
    $("catalog-grid").innerHTML = Object.values(catalog).filter((c) => filter === "all" || c.id.endsWith(filter)).map((c) => `<figure data-suit="${c.id.slice(-1)}"><button type="button" class="catalog-art-button" data-art="${c.id}" aria-label="View ${esc(c.name)} artwork"><img src="${art(c)}" srcset="${sources(c)}" sizes="(max-width: 600px) calc((100vw - 100px) / 2), 240px" alt="" loading="lazy" decoding="async" /></button><figcaption>${seal(E.card(c.id))}<div><strong>${esc(c.name)}</strong><span>${c.race || names[E.card(c.id).type]}</span></div></figcaption></figure>`).join("");
    for (const b of document.querySelectorAll("[data-filter]")) b.setAttribute("aria-pressed", String(b.dataset.filter === filter));
  }
  $("catalog-button").addEventListener("click", () => { $("settings-dialog").close(); showCatalog(); $("catalog-dialog").showModal(); });
  $("catalog-dialog").addEventListener("click", (event) => {
    const b = event.target.closest("[data-filter]"); if (b) showCatalog(b.dataset.filter);
    const target = event.target.closest("[data-art]"); if (target) openArtwork(target.dataset.art, target);
  });
  function openArtwork(id, opener = document.activeElement) {
    artworkOpener = opener; artworkCard = id;
    const c = catalog[id], card = E.card(c.id);
    $("artwork-image").src = art(c); $("artwork-image").alt = c.subject;
    $("artwork-title").textContent = c.name; $("artwork-role").textContent = c.race || names[card.type];
    $("artwork-dialog").dataset.suit = card.suit;
    $("artwork-value").textContent = (card.type === "monster" ? "Strength " : card.type === "weapon" ? "Power " : "Healing ") + card.value;
    $("artwork-dialog").showModal();
  }
  $("artwork-dialog").addEventListener("close", () => {
    const target = artworkOpener?.isConnected ? artworkOpener : $("deck-dialog").open ? $("deck-matrix").querySelector(`[data-inventory-card="${artworkCard}"]`) : null;
    target?.focus({ preventScroll: true });
  });
  $("journal-button").addEventListener("click", () => { $("journal-list").innerHTML = state.history.length ? state.history.slice().reverse().map((h) => `<li><b>Room ${h.room}</b> · ${esc(h.message)}</li>`).join("") : "<li>No moves yet.</li>"; $("journal-dialog").showModal(); });
  for (const dialog of document.querySelectorAll("dialog")) dialog.addEventListener("click", (event) => { if (event.target.closest("[data-close]")) dialog.close(); if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  $("sound-button").addEventListener("click", () => { prefs.sound = !prefs.sound; preferences(); sound("room"); });
  $("atmosphere").addEventListener("change", (event) => { prefs.atmosphere = event.target.value; preferences(); });
  $("motion-setting").addEventListener("change", (event) => { prefs.motion = event.target.checked; preferences(); });
  $("oracle-toggle").addEventListener("change", (event) => { prefs.oracle = event.target.checked; preferences(); renderAnalysis(!!searchStatus?.pending); });
  document.addEventListener("keydown", (event) => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || document.querySelector("dialog[open]") || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
    const i = Number(event.key) - 1;
    if (i >= 0 && i < 4) { const c = state.room[i]; if (c) { event.preventDefault(); select(c.id); } }
    else if (event.key.toLowerCase() === "f" && E.canFlee(state)) { event.preventDefault(); openAvoid(); }
    else if (event.key === "Enter" && (!event.target.closest("button, a") || (event.target.closest(".encounter")?.dataset.card === selected && selected))) { const el = $("encounter-actions").querySelector("[data-action]"); if (el) { event.preventDefault(); act(JSON.parse(el.dataset.action)); } }
    else if (event.key === "Escape") { selected = null; renderSelection(); for (const el of document.querySelectorAll(".encounter")) { el.classList.remove("is-selected"); el.setAttribute("aria-pressed", "false"); } }
  });
  function atmosphere() {
    const canvas = $("embers"), ctx = canvas.getContext("2d"); if (!ctx) return;
    let width, height, frame = null, last = 0, particles = [];
    const resize = () => { const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2); width = r.width; height = r.height; canvas.width = width * dpr; canvas.height = height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); particles = Array.from({ length: 27 }, () => ({ x: Math.random() * width, y: Math.random() * height, life: Math.random(), speed: 5 + Math.random() * 16, size: .5 + Math.random() })); };
    const draw = (time) => { frame = null; if (document.hidden || !motion()) return; const dt = Math.min((time - last) / 1000 || .016, .05); last = time; ctx.clearRect(0, 0, width, height); ctx.fillStyle = getComputedStyle($("room-title")).color; for (const p of particles) { p.y -= p.speed * dt; p.x += Math.sin(p.life * 7 + time * .0003) * dt * 3; if (p.y < height * .15) { p.y = height; p.x = Math.random() * width; } ctx.globalAlpha = Math.sin(p.y / height * Math.PI) * .55; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; frame = requestAnimationFrame(draw); };
    const resume = () => { if (!frame && !document.hidden && motion()) { last = 0; frame = requestAnimationFrame(draw); } };
    new ResizeObserver(resize).observe(canvas); document.addEventListener("visibilitychange", resume); reduced.addEventListener("change", resume); $("motion-setting").addEventListener("change", resume); resize(); resume();
  }
  preferences(); render(); analyze(); atmosphere();
})();
