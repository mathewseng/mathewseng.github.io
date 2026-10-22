const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../engine.js");
const game = (deck, extras = {}) => Object.assign(E.createGame({ deck, seed: "fixture" }), extras);
const act = (s, type, id, mode) => E.transition(s, { type, ...(id ? { id } : {}), ...(mode ? { mode } : {}) });

test("the dungeon has exactly 26 monsters, nine weapons, nine potions and no red faces", () => {
  const d = E.makeDeck(); assert.equal(d.length, 44); assert.equal(new Set(d.map(c => c.id)).size, 44);
  for (const [type, count] of [["monster",26],["weapon",9],["potion",9]]) assert.equal(d.filter(c=>c.type===type).length,count);
  assert.equal(E.card("As").value,14); assert.equal(E.card("Td").value,10); assert.throws(()=>E.card("Ah"));
  assert.deepEqual(E.shuffled("a"),E.shuffled("a")); assert.notDeepEqual(E.shuffled("a"),E.shuffled("b"));
});
test("avoiding preserves room order, queues cards at the bottom and prevents consecutive avoidance", () => {
  let s=game(["2s","3s","4s","5s","6s","7s","8s","9s"]); const before=JSON.stringify(s);
  const n=act(s,"flee"); assert.equal(JSON.stringify(s),before); assert.deepEqual(n.deck.map(c=>c.id),["2s","3s","4s","5s"]);
  assert.deepEqual(n.room.map(c=>c.id),["6s","7s","8s","9s"]); assert.equal(E.canFlee(n),false); assert.throws(()=>act(n,"flee"));
});
test("a room resolves exactly three cards before carrying its fourth to the next room", () => {
  let s=game(["2d","3d","4d","5d","6h","7h","8h"]);
  for(const id of ["2d","3d","4d"])s=act(s,"equip",id);
  assert.equal(s.phase,"ready"); assert.deepEqual(E.actions(s),[{type:"descend"}]);
  s=act(s,"descend"); assert.deepEqual(s.room.map(c=>c.id),["5d","6h","7h","8h"]); assert.equal(s.resolved,0); assert.equal(s.potionUsed,false);
});
test("only the first potion per room heals, even when the first was taken at full health", () => {
  let s=game(["2h","4s","9h","3d"]); s=act(s,"drink","2h"); s=act(s,"fight","4s","bare"); s=act(s,"drink","9h"); assert.equal(s.health,16);
  let n=game(["9h","3h","2d","4d"],{health:18}); n=act(n,"drink","9h"); assert.equal(n.health,20); n=act(n,"drink","3h"); assert.equal(n.health,20);
});
test("weapon chains strictly decrease and barehanded combat preserves the chain", () => {
  let s=game(["8d","Qs","Qc","5s"]); s=act(s,"equip","8d"); s=act(s,"fight","Qs","weapon");
  assert.equal(s.health,16); assert.equal(E.canUseWeapon(s,E.card("Qc")),false); assert.throws(()=>act(s,"fight","Qc","weapon"));
  s=act(s,"fight","5s","bare"); assert.equal(E.weaponLimit(s),12);
});
test("equipping replaces the weapon and all attached monsters, with a fresh chain", () => {
  let s=game(["8d","5s","2d","3s"]); s=act(s,"equip","8d"); s=act(s,"fight","5s","weapon"); s=act(s,"equip","2d");
  assert.equal(s.weapon.id,"2d"); assert.equal(E.weaponLimit(s),15); assert.deepEqual(s.discard.map(c=>c.id),["8d","5s"]); assert.equal(s.slain.length,0);
});
test("the final room must be fully cleared, with the final-potion score bonus", () => {
  let s=game(["2d","3d","4d","Th"]); for(const id of ["2d","3d","4d"])s=act(s,"equip",id);
  assert.equal(s.phase,"playing"); s=act(s,"drink","Th"); assert.equal(s.phase,"won"); assert.equal(E.score(s),30); assert.throws(()=>act(s,"drink","Th"));
});
test("loss score retains overkill and includes monsters in the room and dungeon", () => {
  let s=game(["As","2c","3h","4d","Ks"],{health:3}); s=act(s,"fight","As","bare");
  assert.equal(s.health,0); assert.equal(s.deathHealth,-11); assert.equal(E.score(s),-26);
});
test("saved runs round-trip, reject corrupt or duplicate cards, and retain all 44 cards", () => {
  let s=E.createGame({seed:"saved"}); s=E.transition(s,E.actions(s)[0]); assert.deepEqual(E.restore(JSON.stringify(s)),s);
  const corrupt=JSON.parse(JSON.stringify(s)); corrupt.deck[0]=corrupt.deck[1]; assert.equal(E.restore(corrupt),null);
  assert.equal(E.restore(null),null); assert.equal(E.restore('{"version":1}'),null);
});
