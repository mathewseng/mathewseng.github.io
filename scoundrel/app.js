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
  const same = (a, b) => a?.type === b?.type && a?.id === b?.id && a?.mode === b?.mode;
  let prefs = { sound: false, motion: true, atmosphere: "ember", oracle: false, ...read(PREFS, {}) };
  let stats = read(STATS, { played: 0, won: 0, best: null, recorded: [] });
  if (!Array.isArray(stats.recorded)) stats = { played: 0, won: 0, best: null, recorded: [] };
  const requestedSeed = new URLSearchParams(location.search).get("seed");
  const saved = E.restore(read(RUN, null));
  let state = requestedSeed && /^[a-zA-Z0-9-]{1,80}$/.test(requestedSeed) && saved?.seed !== requestedSeed ? E.createGame({ seed: requestedSeed }) : saved || E.createGame({ seed: seed() });
  let selected = null, worker = null, request = 0, analysis = [], incumbentLine = [], audio = null, known = new Set(), resultShown = false;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)"), motion = () => prefs.motion && !reduced.matches;
  const roman = (n) => n < 40 ? ["", "X", "XX", "XXX"][Math.floor(n / 10)] + ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"][n % 10] : String(n);
  const names = { monster: "Monster", weapon: "Weapon", potion: "Potion" };
  const catalog = window.ScoundrelCatalog;
  const name = (c) => catalog[c.id].name;
  const art = (c) => c.image + "?v=20261022";
  const sources = (c) => c.image.replace("/cards/", "/cards/thumbs/") + "?v=20261022 320w, " + art(c) + " 640w";

  function preferences() {
    document.documentElement.dataset.atmosphere = ["ember", "moon", "moss"].includes(prefs.atmosphere) ? prefs.atmosphere : "ember";
    document.documentElement.dataset.motion = prefs.motion ? "on" : "off";
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
    $("room-instruction").textContent = state.phase === "won" ? "Every encounter survived." : state.phase === "lost" ? "Your descent ends here." : final ? "The final room. Clear every remaining encounter." : state.phase === "ready" ? "Room cleared. Carry the last encounter forward." : "Resolve three encounters. Carry one forward.";
    $("room-pips").innerHTML = Array.from({ length: final ? state.room.filter(Boolean).length + state.resolved : 3 }, (_, i) => `<span class="${i < state.resolved ? "filled" : ""}"></span>`).join("");
    $("room-pips").setAttribute("aria-label", state.resolved + " encounters resolved");
    $("health-value").textContent = state.health; $("health-bar").setAttribute("aria-valuenow", state.health);
    $("health-bar").firstElementChild.style.width = state.health * 5 + "%";
    $("health-caption").textContent = state.health === 20 ? "Unharmed" : state.health > 12 ? "Still standing" : state.health > 5 ? "Wounded" : state.health > 0 ? "At death’s door" : "Fallen";
    $("weapon-display").innerHTML = (state.weapon ? seal(state.weapon) : '<span class="weapon-empty" aria-hidden="true">◇</span>') + `<div class="weapon-numbers"><strong>${state.weapon?.value || "—"}</strong><span>${state.weapon ? "Power" : "Unarmed"}</span></div>`;
    $("weapon-rule").textContent = !state.weapon ? "Find a weapon to arm yourself." : E.weaponLimit(state) === 15 ? "Power " + state.weapon.value + " · any monster" : "Power " + state.weapon.value + " · next below " + E.weaponLimit(state);
    $("weapon-chain").innerHTML = state.slain.map((c) => `<span class="chain-mark" title="${esc(E.label(c))}">${c.value}</span>`).join("");
    $("deck-count").textContent = state.deck.length; $("cleared-count").textContent = 44 - E.remaining(state);
    $("dungeon-progress").style.width = (44 - E.remaining(state)) / 44 * 100 + "%";
    $("run-label").textContent = "Descent " + state.seed.slice(0, 14).toUpperCase();
    const focused = document.activeElement?.dataset.card;
    $("room-cards").innerHTML = state.room.map((c, i) => !c ? '<div class="encounter-empty" aria-hidden="true"><span></span></div>' : `<button type="button" class="encounter${selected === c.id ? " is-selected" : ""}${!known.has(c.id) && motion() ? " is-new" : ""}" data-card="${c.id}" data-kind="${c.type}" data-suit="${c.suit}" style="--deal-index: ${i}" aria-label="${esc(name(c))}, ${catalog[c.id].race || names[c.type]}, value ${c.value}" aria-pressed="${selected === c.id}" ${state.phase !== "playing" ? "disabled" : ""}><span class="encounter-visual"><img class="encounter-art" src="${art(catalog[c.id])}" srcset="${sources(catalog[c.id])}" sizes="(max-width: 600px) calc((100vw - 58px) / 2), (max-width: 800px) calc((100vw - 100px) / 4), 240px" alt="" draggable="false" decoding="async" /><span class="encounter-top"><span>${catalog[c.id].race || names[c.type]}</span><span class="encounter-index" aria-hidden="true">${i + 1}</span></span></span><span class="encounter-bottom">${seal(c)}<span class="encounter-name"><strong>${esc(name(c))}</strong><small>${c.type === "monster" ? "Strength" : c.type === "weapon" ? "Power" : "Healing"}</small></span></span></button>`).join("");
    known = new Set(state.room.filter(Boolean).map((c) => c.id));
    if (focused) document.querySelector(`[data-card="${focused}"]`)?.focus({ preventScroll: true });
    $("flee-button").disabled = !E.canFlee(state);
    $("flee-button").title = state.resolved ? "You already faced an encounter in this room." : state.fledPrevious ? "You cannot avoid two rooms in a row." : "Return all four cards to the bottom of the dungeon.";
    $("room-message").textContent = state.phase === "ready" ? "The remaining encounter follows you into the next room." : state.phase === "lost" ? "The dungeon keeps its secrets. Try another descent." : state.phase === "won" ? "You found the way out." : state.potionUsed ? "Potion used this room. Additional potions will be discarded." : "Choose an encounter to see your options.";
    renderSelection(); renderAnalysis();
    $("save-status").textContent = write(RUN, state) ? "Progress saved on this device" : "Storage unavailable · keep this tab open";
    if (["won", "lost"].includes(state.phase) && !resultShown) finish();
  }

  const button = (action, title, detail, primary = false) => `<button type="button" class="game-button ${primary ? "primary" : "secondary"}" data-action='${esc(JSON.stringify(action))}'><span>${title}</span><small>${detail}</small></button>`;
  function renderSelection() {
    const c = state.room.find((c) => c?.id === selected);
    $("room-message").hidden = !!c && !state.potionUsed;
    let title = "Your next move", detail = "Weapons protect. Potions restore. Every choice matters.", buttons = "";
    if (state.phase === "ready") { title = "Deeper into the dungeon"; detail = "One encounter remains. Three more wait below."; buttons = button({ type: "descend" }, "Enter next room", "Carry one · reveal three", true); }
    else if (["won", "lost"].includes(state.phase)) { title = state.phase === "won" ? "Dungeon survived" : "The dungeon claimed you"; detail = "Final score: " + E.score(state); buttons = '<button class="game-button primary" id="review-result" type="button">View result</button>'; }
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
    $("selection-title").textContent = title; $("selection-detail").textContent = detail; $("encounter-actions").innerHTML = buttons;
  }
  function select(id) {
    if (state.phase !== "playing") return;
    selected = selected === id ? null : id;
    for (const el of document.querySelectorAll(".encounter")) { el.classList.toggle("is-selected", el.dataset.card === selected); el.setAttribute("aria-pressed", String(el.dataset.card === selected)); }
    renderSelection();
  }
  function depart(action) {
    if (!motion() || !action.id) return;
    const el = document.querySelector(`[data-card="${action.id}"]`); if (!el) return;
    const r = el.getBoundingClientRect(), clone = el.cloneNode(true), target = $(action.type === "equip" ? "weapon-display" : "health-block").getBoundingClientRect();
    clone.classList.remove("is-new"); clone.classList.add("departing-card"); clone.setAttribute("aria-hidden", "true"); clone.tabIndex = -1;
    Object.assign(clone.style, { left: r.x + "px", top: r.y + "px", width: r.width + "px", height: r.height + "px" }); document.body.append(clone);
    clone.animate([{ transform: "translate(0, 0)", opacity: 1 }, { transform: `translate(${(target.x - r.x) * .7}px, ${(target.y - r.y) * .7}px) rotate(-12deg) scale(.3)`, opacity: 0 }], { duration: 450, easing: "cubic-bezier(.2,.8,.2,1)" }).finished.catch(() => {}).finally(() => clone.remove());
  }
  function act(action) {
    if (!E.actions(state).some((a) => same(a, action))) return;
    const row = analysis.find((r) => same(r.action, action));
    incumbentLine = row?.line?.slice(1) || (same(incumbentLine[0], action) ? incumbentLine.slice(1) : []);
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
    const b = best();
    if (b?.action.id) { const el = document.querySelector(`[data-card="${b.action.id}"]`); if (el) { el.classList.add("is-best"); const ribbon = document.createElement("span"); ribbon.className = "best-ribbon"; ribbon.textContent = "Oracle"; ribbon.setAttribute("aria-hidden", "true"); el.append(ribbon); } }
    const proven = b && analysis.every((r) => r.ceiling != null && r.ceiling <= b.score);
    $("oracle-summary").textContent = !E.actions(state).length ? "Descent complete. Final score " + E.score(state) + "." : b ? `${proven ? "Proven best" : "Best found"}: ${E.describe(state, b.action)}. Achievable final score ${b.score}.${pending ? " Evaluating alternatives…" : ""}` : "Reading the dungeon…";
    $("action-values").innerHTML = E.actions(state).map((a) => {
      const r = analysis.find((r) => same(r.action, a)), c = state.room.find((c) => c?.id === a.id);
      const change = a.type === "fight" ? "−" + (a.mode === "weapon" ? Math.max(0, c.value - state.weapon.value) : c.value) + " health" : a.type === "drink" ? "+" + (state.potionUsed ? 0 : Math.min(c.value, 20 - state.health)) + " health" : "—";
      const val = r?.score == null ? "Searching…" : r.exact ? String(r.score) : `${r.score} to ${r.ceiling}`;
      return `<tr${same(b?.action, a) ? ' class="is-best"' : ""}><td><button class="oracle-action" type="button" data-preview='${esc(JSON.stringify(a))}'>${esc(E.describe(state, a))}</button></td><td data-label="Health">${change}</td><td class="value-cell" data-label="EV · final score">${val}</td><td data-label="Certainty"><span class="proof${r?.exact ? " exact" : ""}">${r?.score == null ? "Pending" : r.exact ? "Proven" : "Bounds"}</span></td></tr>`;
    }).join("");
  }
  function analyze(deep = false) {
    worker?.terminate(); worker = null; const requestId = ++request;
    if (!prefs.oracle || !E.actions(state).length) { renderAnalysis(); return; }
    if (!window.Worker) { $("oracle-summary").textContent = "This browser does not support the worker required for analysis."; return; }
    try {
      worker = new Worker("solver-worker.js?v=20261021");
      worker.onmessage = ({ data }) => { if (data.requestId !== requestId) return; if (data.error) { $("oracle-summary").textContent = "Analysis unavailable: " + data.error; return; } analysis = data.results; renderAnalysis(data.pending); if (best()?.line?.length) incumbentLine = best().line; };
      worker.onerror = () => { $("oracle-summary").textContent = "The analysis worker could not load. Try reloading the page."; };
      worker.postMessage({ requestId, state, deep, incumbentLine }); renderAnalysis(true);
    } catch { $("oracle-summary").textContent = "Analysis needs a browser that supports Web Workers."; }
  }
  function start() {
    for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
    state = E.createGame({ seed: seed() }); selected = null; resultShown = false; analysis = []; incumbentLine = []; known = new Set(); render(); analyze(); sound("room");
  }
  function finish() {
    resultShown = true; const won = state.phase === "won", score = E.score(state), runId = state.id;
    if (!stats.recorded.includes(runId)) { stats.played++; stats.won += Number(won); stats.best = Math.max(stats.best ?? -Infinity, score); stats.recorded = [...stats.recorded, runId].slice(-200); write(STATS, stats); }
    $("result-title").textContent = won ? "You found the way out." : "The dungeon claimed you.";
    $("result-copy").textContent = won ? "You survived every encounter. The light is yours again." : "Another descent. Another chance to find the light.";
    $("result-score").textContent = score; $("result-facts").textContent = `${state.monstersSlain} monsters defeated · ${state.roomsFled} rooms avoided${won && score > 20 ? " · final potion bonus +" + (score - 20) : ""}`;
    setTimeout(() => { if (state.id === runId && !$("result-dialog").open) $("result-dialog").showModal(); }, motion() ? 650 : 0);
  }
  $("room-cards").addEventListener("click", (event) => { const el = event.target.closest("[data-card]"); if (el) select(el.dataset.card); });
  $("encounter-actions").addEventListener("click", (event) => { const el = event.target.closest("[data-action]"); if (el) act(JSON.parse(el.dataset.action)); if (event.target.closest("#review-result")) $("result-dialog").showModal(); });
  $("action-values").addEventListener("click", (event) => { const el = event.target.closest("[data-preview]"); if (!el) return; const a = JSON.parse(el.dataset.preview); if (a.id) { selected = null; select(a.id); $("action-stage").scrollIntoView({ behavior: motion() ? "smooth" : "instant", block: "nearest" }); } else $(a.type === "flee" ? "flee-button" : "encounter-actions").querySelector("button")?.focus(); });
  $("flee-button").addEventListener("click", () => act({ type: "flee" }));
  $("new-run").addEventListener("click", () => state.steps ? $("new-dialog").showModal() : start());
  $("confirm-new").addEventListener("click", start); $("result-new").addEventListener("click", start);
  $("rules-button").addEventListener("click", () => $("rules-dialog").showModal());
  $("settings-button").addEventListener("click", () => { $("local-stats").textContent = `${stats.played} completed descents · ${stats.won} survived · Best score ${stats.best ?? "—"}`; $("settings-dialog").showModal(); });
  function showCatalog(filter = "all") {
    $("catalog-grid").innerHTML = Object.values(catalog).filter((c) => filter === "all" || c.id.endsWith(filter)).map((c) => `<figure data-suit="${c.id.slice(-1)}"><button type="button" class="catalog-art-button" data-art="${c.id}" aria-label="View ${esc(c.name)} artwork"><img src="${art(c)}" srcset="${sources(c)}" sizes="(max-width: 600px) calc((100vw - 100px) / 2), 240px" alt="" loading="lazy" decoding="async" /><span>View art</span></button><figcaption>${seal(E.card(c.id))}<div><strong>${esc(c.name)}</strong><span>${c.role}</span></div></figcaption></figure>`).join("");
    for (const b of document.querySelectorAll("[data-filter]")) b.setAttribute("aria-pressed", String(b.dataset.filter === filter));
  }
  $("catalog-button").addEventListener("click", () => { $("settings-dialog").close(); showCatalog(); $("catalog-dialog").showModal(); });
  $("catalog-dialog").addEventListener("click", (event) => {
    const b = event.target.closest("[data-filter]"); if (b) showCatalog(b.dataset.filter);
    const target = event.target.closest("[data-art]"); if (!target) return;
    const c = catalog[target.dataset.art], card = E.card(c.id);
    $("artwork-image").src = art(c); $("artwork-image").alt = c.subject;
    $("artwork-title").textContent = c.name; $("artwork-role").textContent = (c.race ? c.race + " · " : "") + c.role;
    $("artwork-lore").textContent = c.lore;
    $("artwork-value").textContent = (card.type === "monster" ? "Strength " : card.type === "weapon" ? "Power " : "Healing ") + card.value;
    $("artwork-dialog").showModal();
  });
  $("journal-button").addEventListener("click", () => { $("journal-list").innerHTML = state.history.length ? state.history.slice().reverse().map((h) => `<li><b>Room ${h.room}</b> · ${esc(h.message)}</li>`).join("") : "<li>Your journey has just begun.</li>"; $("journal-dialog").showModal(); });
  for (const dialog of document.querySelectorAll("dialog")) dialog.addEventListener("click", (event) => { if (event.target.closest("[data-close]")) dialog.close(); if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  $("sound-button").addEventListener("click", () => { prefs.sound = !prefs.sound; preferences(); sound("room"); });
  $("atmosphere").addEventListener("change", (event) => { prefs.atmosphere = event.target.value; preferences(); });
  $("motion-setting").addEventListener("change", (event) => { prefs.motion = event.target.checked; preferences(); });
  $("oracle-toggle").addEventListener("change", (event) => { prefs.oracle = event.target.checked; preferences(); analyze(); });
  $("deepen-button").addEventListener("click", () => analyze(true));
  document.addEventListener("keydown", (event) => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || document.querySelector("dialog[open]") || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
    const i = Number(event.key) - 1;
    if (i >= 0 && i < 4) { const c = state.room[i]; if (c) { event.preventDefault(); select(c.id); } }
    else if (event.key.toLowerCase() === "f" && E.canFlee(state)) { event.preventDefault(); act({ type: "flee" }); }
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
