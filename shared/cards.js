// Shared playing-card component. Pairs with shared/cards.css.
//
// Classic script: exposes window.PlayingCards (and module.exports in Node).
//
//   PlayingCards.html("Kh")                         -> '<span class="playing-card suit-h" ...>'
//   PlayingCards.html({ rank: 14, suit: "s" }, { tag: "button", selected: true })
//   Options: tag, className, selected, staged, dim, danger, interactive, disabled,
//   badge (+ badgeClass, bottom-right), corner (small marker, top-right), attrs,
//   label, title, style, extra (trusted overlay markup appended inside the card).
//   PlayingCards.element("Td", { className: "new" }) -> HTMLElement
//   PlayingCards.normalize("10h")                   -> { rank: "T", suit: "h", label: "Ten of hearts", ... }
//
// Accepted card inputs: "As", "10h", "th", "A♥", "JK", "JK1", "BACK", or an
// object { rank, suit, joker, back } where rank is 2–14, "2".."9", "T", "10",
// "J", "Q", "K", "A" and suit is "s"/"h"/"d"/"c", a suit symbol, or a name.
// A rank alone ("T", { rank: 10 }) is a plain suit-less card (class "plain").
(function (root) {
  "use strict";

  const SUIT_SYMBOL = { s: "♠", h: "♥", d: "♦", c: "♣" };
  const SUIT_NAME = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" };
  const SUIT_FROM = {
    s: "s", h: "h", d: "d", c: "c",
    "♠": "s", "♥": "h", "♦": "d", "♣": "c",
    "♤": "s", "♡": "h", "♢": "d", "♧": "c",
    spades: "s", hearts: "h", diamonds: "d", clubs: "c",
    spade: "s", heart: "h", diamond: "d", club: "c",
  };
  const RANK_LABEL = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T", 9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2" };
  const RANK_VALUE = { A: 14, K: 13, Q: 12, J: 11, T: 10, 10: 10, 9: 9, 8: 8, 7: 7, 6: 6, 5: 5, 4: 4, 3: 3, 2: 2 };
  const RANK_NAME = { 14: "Ace", 13: "King", 12: "Queen", 11: "Jack", 10: "Ten", 9: "Nine", 8: "Eight", 7: "Seven", 6: "Six", 5: "Five", 4: "Four", 3: "Three", 2: "Two" };
  const RANKS_HIGH_TO_LOW = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
  const SUITS = ["s", "h", "d", "c"];

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  }

  function rankLabel(rank) {
    if (rank == null) return null;
    if (typeof rank === "number") return RANK_LABEL[rank] || null;
    const text = String(rank).trim().toUpperCase();
    if (text === "10") return "T";
    return RANK_VALUE[text] ? (text === "10" ? "T" : text) : null;
  }

  function suitKey(suit) {
    if (suit == null) return null;
    const text = String(suit).trim();
    return SUIT_FROM[text] || SUIT_FROM[text.toLowerCase()] || null;
  }

  // Returns { rank, suit, value, joker, back, label, id } or null.
  function normalize(card) {
    if (card == null) return null;
    if (typeof card === "object") {
      if (card.back) return { back: true, joker: false, rank: null, suit: null, value: 0, label: "Face-down card", id: "BACK" };
      if (card.joker) return { back: false, joker: true, rank: "JK", suit: null, value: 0, label: "Joker", id: card.id || "JK" };
      const rank = rankLabel(card.rank);
      const suit = suitKey(card.suit);
      if (!rank) return null;
      // A rank with no suit is a "plain" card (blackjack-style, suit-agnostic).
      if (!suit) return card.suit == null ? { back: false, joker: false, plain: true, rank, suit: null, value: RANK_VALUE[rank], label: RANK_NAME[RANK_VALUE[rank]], id: rank } : null;
      return { back: false, joker: false, rank, suit, value: RANK_VALUE[rank], label: RANK_NAME[RANK_VALUE[rank]] + " of " + SUIT_NAME[suit], id: rank + suit };
    }
    const text = String(card).trim();
    if (!text) return null;
    const upper = text.toUpperCase();
    if (upper === "BACK" || upper === "?" || upper === "XX") return normalize({ back: true });
    if (/^(JK|JOKER)\d*$/.test(upper) || upper === "★") return { back: false, joker: true, rank: "JK", suit: null, value: 0, label: "Joker", id: upper === "★" ? "JK" : upper };
    const match = text.match(/^(10|[2-9TJQKA])\s*(.*)$/i);
    if (!match) return null;
    return normalize({ rank: match[1], suit: match[2] || null });
  }

  function classesFor(info, options) {
    const classes = ["playing-card"];
    if (info.back) classes.push("back");
    else if (info.joker) classes.push("joker");
    else if (info.plain) classes.push("plain");
    else classes.push("suit-" + info.suit);
    if (options.selected) classes.push("selected");
    if (options.staged) classes.push("staged");
    if (options.dim) classes.push("dim");
    if (options.danger) classes.push("danger");
    if (options.interactive) classes.push("interactive");
    if (options.className) classes.push(String(options.className).trim());
    return classes.filter(Boolean).join(" ");
  }

  function attributesFor(info, options) {
    const tag = options.tag || "span";
    const attrs = [];
    if (tag === "button") attrs.push('type="button"');
    if (options.disabled) attrs.push(tag === "button" ? "disabled" : 'aria-disabled="true"');
    attrs.push('aria-label="' + escapeHtml(options.label || info.label) + '"');
    if (options.title) attrs.push('title="' + escapeHtml(options.title) + '"');
    if (options.attrs) {
      for (const [name, value] of Object.entries(options.attrs)) {
        if (value === false || value == null) continue;
        attrs.push(value === true ? escapeHtml(name) : escapeHtml(name) + '="' + escapeHtml(value) + '"');
      }
    }
    if (options.style) attrs.push('style="' + escapeHtml(options.style) + '"');
    return attrs.join(" ");
  }

  function faceHtml(info, options) {
    if (info.back) return "";
    const suit = info.joker ? "★" : info.plain ? "" : SUIT_SYMBOL[info.suit];
    const rank = info.joker ? "JK" : info.rank;
    const badge = options.badge
      ? '<span class="card-badge' + (options.badgeClass ? " " + escapeHtml(options.badgeClass) : "") + '">' + escapeHtml(options.badge) + "</span>"
      : "";
    const corner = options.corner ? '<span class="card-corner">' + escapeHtml(options.corner) + "</span>" : "";
    return '<span class="card-suit" aria-hidden="true">' + suit + '</span><span class="card-rank">' + rank + "</span>" + corner + badge;
  }

  // Page-provided overlay markup placed inside the card after the face.
  // Not escaped: pages pass trusted markup only.
  function extraHtml(options) {
    return options.extra ? String(options.extra) : "";
  }

  // Full card markup as a string.
  function html(card, options = {}) {
    const info = normalize(card);
    if (!info) throw new Error("Unknown card: " + JSON.stringify(card));
    const tag = options.tag || "span";
    return "<" + tag + ' class="' + classesFor(info, options) + '" ' + attributesFor(info, options) + ">" + faceHtml(info, options) + extraHtml(options) + "</" + tag + ">";
  }

  // Full card markup as a DOM element (browser only).
  function element(card, options = {}) {
    const template = root.document.createElement("template");
    template.innerHTML = html(card, options);
    return template.content.firstElementChild;
  }

  // Markup for several cards at once.
  function rowHtml(cards, options = {}) {
    return cards.map((card) => html(card, options)).join("");
  }

  // A dashed empty slot the size of a card.
  function emptySlotHtml(options = {}) {
    const classes = ["empty-slot", options.className].filter(Boolean).join(" ");
    const attrs = options.style ? ' style="' + escapeHtml(options.style) + '"' : "";
    return '<span class="' + classes + '" aria-hidden="true"' + attrs + "></span>";
  }

  function emptySlot(options = {}) {
    const template = root.document.createElement("template");
    template.innerHTML = emptySlotHtml(options);
    return template.content.firstElementChild;
  }

  const api = {
    SUIT_SYMBOL,
    SUIT_NAME,
    RANK_LABEL,
    RANK_VALUE,
    RANK_NAME,
    RANKS_HIGH_TO_LOW,
    SUITS,
    normalize,
    rankLabel,
    suitKey,
    html,
    element,
    rowHtml,
    emptySlotHtml,
    emptySlot,
    escapeHtml,
  };

  root.PlayingCards = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
