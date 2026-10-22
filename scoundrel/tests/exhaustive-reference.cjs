// Independent oracle: only the public rules engine, no compact transitions,
// symmetry reduction, health dominance, beam, or score bound.
const E = require("../engine.js");
function exhaustive(initial, visit = () => {}) {
  const memo = new Map();
  function search(s) {
    if (!E.actions(s).length) return E.score(s);
    const key = JSON.stringify([s.room.map(c => c?.id), s.deck.map(c => c.id), s.health, s.weapon?.id, E.weaponLimit(s), s.potionUsed, s.resolved, s.fledPrevious, s.phase]);
    if (memo.has(key)) return memo.get(key);
    const score = Math.max(...E.actions(s).map(action => search(E.transition(s, action))));
    memo.set(key, score); visit(s, score); return score;
  }
  return search(initial);
}
function fixtures() {
  return Array.from({ length: 100 }, (_, i) => {
    const s = E.createGame({ seed: "native-check-" + i, deck: E.shuffled("native-check-" + i).slice(0, 4 + i % 5) });
    s.health = 1 + i % 20;
    if (i % 3 === 0) { s.weapon = E.card("6d"); s.slain = i % 2 ? [E.card("9c")] : []; }
    if (i % 4 === 0) s.potionUsed = true;
    return s;
  });
}
module.exports = { exhaustive, fixtures };
