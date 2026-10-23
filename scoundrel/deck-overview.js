/* Canonical inventory built exclusively from the public observation. */
(() => {
  "use strict";
  const E = Scoundrel, $ = id => document.getElementById(id), cards = E.makeDeck();
  const suits = [{ id: "s", name: "Stonekin", symbol: "♠" }, { id: "c", name: "Treefolk", symbol: "♣" }, { id: "d", name: "Weapons", symbol: "♦" }, { id: "h", name: "Potions", symbol: "♥" }];
  const values = Array.from({ length: 13 }, (_, i) => i + 2), portrait = matchMedia("(max-width: 900px) and (orientation: portrait)");
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function create({ onInspect }) {
    const dialog = $("deck-dialog"), matrix = $("deck-matrix");
    let observation = null, mode = "left";
    const motion = ScoundrelCardMotion.attach(matrix, { selector: ".deck-card", enabled: () => document.documentElement.dataset.motion !== "off" });
    function render() {
      if (!observation) return;
      motion.reset();
      const room = new Set(observation.room.filter(Boolean).map(c => c.id));
      const remaining = new Set([...observation.unknownCards, ...observation.bottom, ...observation.room.filter(Boolean)].map(c => c.id));
      $("deck-left-total").textContent = remaining.size; $("deck-resolved-total").textContent = cards.length - remaining.size;
      $("deck-summary").textContent = `${remaining.size - room.size} in deck · ${room.size} in room`;
      $("deck-dimmed-label").textContent = mode === "left" ? "Dimmed: resolved" : "Dimmed: cards left";
      for (const button of dialog.querySelectorAll("[data-deck-mode]")) button.setAttribute("aria-pressed", String(button.dataset.deckMode === mode));
      const suitLabel = suit => `<span aria-hidden="true">${suit.symbol}</span><span>${suit.name}</span>`;
      function cell(suit, value) {
        const card = cards.find(c => c.suit === suit.id && c.value === value);
        if (!card) return '<td class="deck-empty" aria-label="Not in the deck">—</td>';
        const entry = ScoundrelCatalog[card.id], resolved = !remaining.has(card.id), inRoom = room.has(card.id);
        const status = resolved ? "Resolved" : inRoom ? "In room" : "In deck", dimmed = mode === "left" ? resolved : !resolved;
        return `<td><button type="button" class="deck-card${dimmed ? " is-dimmed" : ""}" data-inventory-card="${card.id}" data-suit="${suit.id}" data-state="${resolved ? "resolved" : inRoom ? "room" : "deck"}" aria-label="${esc(entry.name)}, value ${value}, ${status.toLowerCase()}" title="${esc(entry.name)} · ${status}"><img src="${entry.image.replace('/cards/', '/cards/thumbs/')}?v=20261022-ash" alt="" draggable="false" decoding="async" /><span class="deck-card-value" aria-hidden="true">${value}</span>${inRoom ? '<span class="deck-room-marker" aria-hidden="true"></span>' : ""}</button></td>`;
      }
      matrix.dataset.orientation = portrait.matches ? "columns" : "rows";
      matrix.innerHTML = `<table class="deck-matrix"><caption class="deck-sr-only">All 44 cards by suit and value. ${mode === "left" ? "Resolved cards are dimmed." : "Cards left are dimmed."}</caption><thead><tr><th scope="col">${portrait.matches ? "Value" : "Suit"}</th>${portrait.matches ? suits.map(suit => `<th scope="col" data-suit="${suit.id}">${suitLabel(suit)}</th>`).join("") : values.map(value => `<th scope="col">${value}</th>`).join("")}</tr></thead><tbody>${portrait.matches ? values.map(value => `<tr><th scope="row">${value}</th>${suits.map(suit => cell(suit, value)).join("")}</tr>`).join("") : suits.map(suit => `<tr><th scope="row" data-suit="${suit.id}">${suitLabel(suit)}</th>${values.map(value => cell(suit, value)).join("")}</tr>`).join("")}</tbody></table>`;
    }
    dialog.addEventListener("click", event => {
      const toggle = event.target.closest("[data-deck-mode]");
      if (toggle) { mode = toggle.dataset.deckMode; render(); }
      const card = event.target.closest("[data-inventory-card]");
      if (card) onInspect(card.dataset.inventoryCard, card);
    });
    dialog.addEventListener("close", motion.reset);
    portrait.addEventListener("change", () => { if (dialog.open) render(); });
    return { open(nextMode, publicObservation) { mode = nextMode; observation = publicObservation; render(); dialog.showModal(); } };
  }
  window.ScoundrelDeckOverview = { create };
})();
