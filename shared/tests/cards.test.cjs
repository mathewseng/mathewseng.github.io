const test = require("node:test");
const assert = require("node:assert/strict");
const Cards = require("../cards.js");

test("normalizes strings, objects, tens, symbols, jokers and backs", () => {
  assert.deepEqual(Cards.normalize("Kh"), { back: false, joker: false, rank: "K", suit: "h", value: 13, label: "King of hearts", id: "Kh" });
  assert.equal(Cards.normalize("10d").rank, "T");
  assert.equal(Cards.normalize("td").rank, "T");
  assert.equal(Cards.normalize("A♣").suit, "c");
  assert.equal(Cards.normalize({ rank: 14, suit: "spades" }).id, "As");
  assert.equal(Cards.normalize({ rank: "10", suit: "♦" }).label, "Ten of diamonds");
  assert.equal(Cards.normalize("JK1").joker, true);
  assert.equal(Cards.normalize("BACK").back, true);
  assert.equal(Cards.normalize("Zz"), null);
  assert.equal(Cards.normalize("T").plain, true);
  assert.equal(Cards.normalize({ rank: 14 }).label, "Ace");
  assert.ok(Cards.html("A").includes('class="playing-card plain"'));
  assert.ok(Cards.html("A").includes('<span class="card-suit" aria-hidden="true"></span>'));
  assert.equal(Cards.normalize(""), null);
});

test("html uses the shared markup with suit class, suit mark and rank", () => {
  assert.equal(
    Cards.html("Kh"),
    '<span class="playing-card suit-h" aria-label="King of hearts"><span class="card-suit" aria-hidden="true">♥</span><span class="card-rank">K</span></span>',
  );
  const button = Cards.html("As", { tag: "button", selected: true, className: "deck-card", attrs: { "data-card": "As" }, badge: "2" });
  assert.ok(button.startsWith('<button class="playing-card suit-s selected deck-card" type="button" aria-label="Ace of spades" data-card="As">'));
  assert.ok(button.includes('<span class="card-badge">2</span>'));
  assert.ok(button.endsWith("</button>"));
  assert.equal(Cards.html("BACK"), '<span class="playing-card back" aria-label="Face-down card"></span>');
  assert.ok(Cards.html("JK").includes('class="playing-card joker"'));
  assert.ok(Cards.html("JK").includes('<span class="card-rank">JK</span>'));
  assert.ok(Cards.html("Td", { disabled: true }).includes('aria-disabled="true"'));
  assert.ok(Cards.html("Td", { tag: "button", disabled: true }).includes(" disabled "));
  assert.throws(() => Cards.html("nope"));
  const marked = Cards.html("Ah", { corner: "JK", badge: "3", interactive: true });
  assert.ok(marked.includes('<span class="card-corner">JK</span><span class="card-badge">3</span>'));
  assert.ok(marked.includes('class="playing-card suit-h interactive"'));
  assert.ok(Cards.html("BACK", { extra: '<i class="x"></i>' }).endsWith('<i class="x"></i></span>'));
});

test("escapes attribute values and joins rows", () => {
  const out = Cards.html("Qc", { title: 'a"b<c', label: "x<y" });
  assert.ok(out.includes('title="a&quot;b&lt;c"'));
  assert.ok(out.includes('aria-label="x&lt;y"'));
  assert.equal(Cards.rowHtml(["2s", "3s"]).match(/playing-card/g).length, 2);
  assert.equal(Cards.emptySlotHtml(), '<span class="empty-slot" aria-hidden="true"></span>');
  assert.ok(Cards.emptySlotHtml({ className: "big", style: "--card-width: 40px" }).includes('class="empty-slot big"'));
  assert.equal(Cards.RANKS_HIGH_TO_LOW.join(""), "AKQJT98765432");
});
