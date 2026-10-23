/* The public collection uses the same catalog and images as the game. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const catalog = window.ScoundrelCatalog;
  const deck = new Map(window.Scoundrel.makeDeck().map(card => [card.id, card]));
  const cards = Object.values(catalog).map(entry => ({ ...deck.get(entry.id), ...entry }));
  const suits = { s: { symbol: "♠", name: "Spades", category: "Stonekin" }, c: { symbol: "♣", name: "Clubs", category: "Treefolk" }, d: { symbol: "♦", name: "Diamonds", category: "Weapons" }, h: { symbol: "♥", name: "Hearts", category: "Potions" } };
  const params = new URLSearchParams(location.search);
  let filter = Object.hasOwn(suits, params.get("suit")) ? params.get("suit") : "all";
  let query = params.get("q") || "", visible = [], selected = null, opener = null;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const grid = $("collection-grid"), viewer = $("card-viewer");
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const normalize = value => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const art = card => "../" + card.image + "?v=20261022-ash";
  const imageSet = card => "../" + card.image.replace("/cards/", "/cards/thumbs/") + "?v=20261022-ash 320w, " + art(card) + " 960w";
  function saveURL(cardId = selected, push = false) {
    const url = new URL(location.href);
    if (filter === "all") url.searchParams.delete("suit"); else url.searchParams.set("suit", filter);
    if (query) url.searchParams.set("q", query); else url.searchParams.delete("q");
    url.hash = cardId || "";
    if (url.href !== location.href) history[push ? "pushState" : "replaceState"](null, "", url);
  }
  grid.innerHTML = cards.map((card, index) => `<button type="button" class="collection-card" data-card="${card.id}" data-suit="${card.suit}" aria-label="Explore ${escape(card.name)}, ${suits[card.suit].category}, ${card.rank}${suits[card.suit].symbol}, value ${card.value}"><span class="card-plane"><img src="${art(card)}" srcset="${imageSet(card)}" sizes="(min-width: 1500px) 260px, (min-width: 1051px) 23vw, (min-width: 651px) 30vw, 45vw" width="960" height="1200" alt="" loading="${index < 4 ? "eager" : "lazy"}" decoding="async" draggable="false" /><span class="card-seal" aria-hidden="true"><strong>${card.rank}</strong><b>${suits[card.suit].symbol}</b></span></span><span class="card-caption"><strong>${escape(card.name)}</strong><small>${suits[card.suit].category}</small></span></button>`).join("");
  const buttons = new Map([...grid.querySelectorAll("[data-card]")].map(button => [button.dataset.card, button]));
  const cardMotion = ScoundrelCardMotion.attach(grid, { selector: ".collection-card" });
  function renderFilter(animate = true, writeURL = true) {
    cardMotion.reset();
    const needle = normalize(query.trim());
    visible = cards.filter(card => (filter === "all" || card.suit === filter) && normalize([card.name, card.role, card.race || "", suits[card.suit].name, suits[card.suit].category, card.rank, card.value].join(" ")).includes(needle));
    const ids = new Set(visible.map(card => card.id));
    for (const [id, button] of buttons) {
      button.hidden = !ids.has(id);
      button.classList.remove("is-entering");
      button.style.removeProperty("--tilt-x"); button.style.removeProperty("--tilt-y");
    }
    document.querySelectorAll("[data-filter]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.filter === filter)));
    $("result-count").textContent = visible.length + (visible.length === 1 ? " card" : " cards");
    $("empty-state").hidden = visible.length > 0;
    if (animate && !reduced.matches) requestAnimationFrame(() => visible.slice(0, 12).forEach((card, i) => { const button = buttons.get(card.id); button.style.setProperty("--entry-delay", Math.min(i * 25, 150) + "ms"); button.classList.add("is-entering"); }));
    if (writeURL) saveURL();
  }
  function showCard(id, fromHistory = false) {
    const card = cards.find(entry => entry.id === id); if (!card) return;
    if (!visible.some(entry => entry.id === id)) { filter = "all"; query = ""; $("card-search").value = ""; renderFilter(false, false); }
    const firstOpen = !viewer.open;
    if (firstOpen) opener = document.activeElement;
    selected = id; const suit = suits[card.suit]; viewer.dataset.suit = card.suit;
    $("viewer-image").src = art(card); $("viewer-image").alt = card.name + " — " + card.role;
    $("viewer-seal").textContent = card.rank + " " + suit.symbol;
    $("viewer-category").textContent = suit.category + " · " + card.rank + suit.symbol;
    $("viewer-name").textContent = card.name; $("viewer-role").textContent = card.role;
    $("viewer-lore").textContent = card.lore;
    $("viewer-value-label").textContent = card.type === "monster" ? "Strength" : card.type === "weapon" ? "Power" : "Healing";
    $("viewer-value").textContent = card.value; $("viewer-suit").textContent = suit.name + " " + suit.symbol;
    $("viewer-rule").textContent = card.type === "monster" ? "An encounter. Fight with your weapon or take its full strength in damage." : card.type === "weapon" ? "Equip to replace your weapon. Each next monster must be weaker than the last one defeated with it." : "Restore up to this much health, to a maximum of 20. Only the first potion in each room heals.";
    $("viewer-position").textContent = (visible.findIndex(entry => entry.id === id) + 1) + " / " + visible.length;
    $("download-art").href = art(card);
    $("previous-card").disabled = $("next-card").disabled = visible.length < 2;
    const panel = viewer.querySelector(".viewer-art"); panel.classList.remove("is-changing");
    if (!firstOpen && !reduced.matches) { void panel.offsetWidth; panel.classList.add("is-changing"); }
    if (firstOpen) { viewer.showModal(); document.body.style.overflow = "hidden"; }
    if (!fromHistory) saveURL(id, firstOpen);
    for (const step of [-1, 1]) { const next = visible[(visible.findIndex(entry => entry.id === id) + step + visible.length) % visible.length]; if (next && next.id !== id) { const image = new Image(); image.src = art(next); } }
  }
  function closeViewer() { if (viewer.open) viewer.close(); }
  viewer.addEventListener("close", () => { selected = null; document.body.style.overflow = ""; saveURL(null); if (opener?.isConnected && !opener.hidden) opener.focus({ preventScroll: true }); });
  function step(direction) { if (!selected || visible.length < 2) return; const index = visible.findIndex(card => card.id === selected); showCard(visible[(index + direction + visible.length) % visible.length].id); }
  $("previous-card").addEventListener("click", () => step(-1)); $("next-card").addEventListener("click", () => step(1));
  $("close-viewer").addEventListener("click", closeViewer);
  viewer.addEventListener("click", event => { if (event.target === viewer) { const r = viewer.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeViewer(); } });
  viewer.addEventListener("keydown", event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); step(event.key === "ArrowLeft" ? -1 : 1); } });
  let startTouch = null;
  viewer.querySelector(".viewer-art").addEventListener("touchstart", event => { if (event.touches.length === 1) startTouch = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }, { passive: true });
  viewer.querySelector(".viewer-art").addEventListener("touchend", event => { if (!startTouch) return; const touch = event.changedTouches[0], dx = touch.clientX - startTouch.x, dy = touch.clientY - startTouch.y; startTouch = null; if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1); }, { passive: true });
  grid.addEventListener("click", event => { const button = event.target.closest("[data-card]"); if (button) showCard(button.dataset.card); });
  document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => { filter = button.dataset.filter; renderFilter(); }));
  $("card-search").value = query;
  $("card-search").addEventListener("input", event => { query = event.target.value; renderFilter(); });
  $("reset-filters").addEventListener("click", () => { filter = "all"; query = ""; $("card-search").value = ""; renderFilter(); $("card-search").focus(); });
  window.addEventListener("popstate", () => { const p = new URLSearchParams(location.search); filter = Object.hasOwn(suits, p.get("suit")) ? p.get("suit") : "all"; query = p.get("q") || ""; $("card-search").value = query; const id = location.hash.slice(1); selected = null; renderFilter(false, false); if (cards.some(c => c.id === id)) showCard(id, true); else closeViewer(); });
  const initialCard = location.hash.slice(1); renderFilter(true, false); if (cards.some(card => card.id === initialCard)) showCard(initialCard, true);
})();
