const assert = require("node:assert/strict");
const { test } = require("node:test");
const Core = require("../../fantasyland-core.js");
const Trainer = require("../app.js");
const Game = require("../../play/game.js");

const kingsTop = ["Ks", "Kh", "8s"];
const fullHouse = ["9h", "9d", "Jh", "Jd", "Jc"];
const fixtures = [
  { name: "KK432 loses to KK8", top: kingsTop, middle: ["Kc", "Kd", "4d", "3c", "2c"], bottom: fullHouse, legal: false },
  { name: "KK832 beats KK8 with extra kickers", top: kingsTop, middle: ["Kc", "Kd", "8d", "3c", "2c"], bottom: fullHouse, legal: true },
  { name: "KK932 beats KK8", top: kingsTop, middle: ["Kc", "Kd", "9c", "3c", "2c"], bottom: fullHouse, legal: true },
  { name: "QQA32 loses to KK8 despite its ace kicker", top: kingsTop, middle: ["Qc", "Qd", "Ac", "3c", "2c"], bottom: fullHouse, legal: false },
  { name: "AA432 beats KK8 despite its lower kicker", top: kingsTop, middle: ["Ac", "Ad", "4d", "3c", "2c"], bottom: fullHouse, legal: true },
  { name: "two pair beats KK8", top: kingsTop, middle: ["Qc", "Qd", "3d", "3c", "2c"], bottom: fullHouse, legal: true },
  { name: "76543 ties are legal", top: ["As", "Qh", "2c"], middle: ["7s", "6h", "5d", "4c", "3s"], bottom: ["7h", "6d", "5c", "4s", "3h"], legal: true },
  { name: "identical pair ranks and kickers tie legally", top: ["Qs", "Jh", "2c"], middle: ["Ks", "Kh", "8s", "4h", "3d"], bottom: ["Kd", "Kc", "8h", "4d", "3c"], legal: true },
  { name: "high-card kickers still matter", top: ["As", "Qh", "8s"], middle: ["Ac", "Qd", "7d", "3c", "2c"], bottom: fullHouse, legal: false },
  { name: "equal high-card prefix wins with extra kickers", top: ["As", "Qh", "8s"], middle: ["Ac", "Qd", "8d", "3c", "2c"], bottom: fullHouse, legal: true },
  { name: "joker cannot hide a fouling pair kicker", top: ["Ks", "JK1", "8s"], middle: ["Kc", "Kd", "4d", "3c", "2c"], bottom: fullHouse, legal: true },
];

for (const fixture of fixtures) {
  test(fixture.name, () => {
    const rows = { top: fixture.top, middle: fixture.middle, bottom: fixture.bottom };
    const ids = Object.values(rows).flat();
    assert.equal(new Set(ids).size, 13, "fixture must use distinct cards");
    const results = [
      Core.evaluateBoard(ids, rows, { variant: "high" }),
      Core.previewRows(ids, rows, { variant: "high" }),
      Trainer.scoreTrainerRows(ids, rows),
      ...["high", "progressive"].map((variant) => Game.previewBoard({ settings: { variant } }, rows)),
    ];
    for (const result of results) {
      assert.equal(result.legal, fixture.legal);
      if (!fixture.legal) {
        assert.equal(result.points, 0, "foul forfeits royalties");
        const player = { evaluation: result, inFantasyland: false, fantasyQueue: 0 };
        Game.awardFantasyland(Game.normalizeSettings({ variant: "progressive" }), player);
        assert.equal(player.fantasyQueue, 0, "foul cannot award Fantasyland");
      } else {
        assert.ok(result.rowEvals.top.strength <= result.rowEvals.middle.strength);
        assert.ok(result.rowEvals.middle.strength <= result.rowEvals.bottom.strength);
      }
    }
    if (ids.includes("JK1")) {
      for (const result of results) {
        assert.equal(result.rowEvals.top.mainRank, 8, "joker must make eights instead of kings with an illegal kicker");
      }
    }
  });
}

test("non-high variants compare the top kicker against the bottom", () => {
  const rows = { top: kingsTop, middle: ["7s", "5h", "4c", "3d", "2h"], bottom: ["Kc", "Kd", "4d", "3c", "2c"] };
  assert.equal(Core.evaluateBoard(Object.values(rows).flat(), rows, { variant: "low" }).legal, false);
  rows.bottom[2] = "8d";
  assert.equal(Core.evaluateBoard(Object.values(rows).flat(), rows, { variant: "low" }).legal, true);
});

function combinations(items, count) {
  if (!count) return [[]];
  return items.flatMap((item, index) => combinations(items.slice(index + 1), count - 1).map((rest) => [item, ...rest]));
}

test("exact solvers count only legal pair-kicker arrangements and retain tied rows", () => {
  for (const fixture of [fixtures[0], fixtures[6]]) {
    const ids = [...fixture.top, ...fixture.middle, ...fixture.bottom];
    const cards = ids.map(Core.makeCard);
    const fiveCache = new Map();
    const fiveStrength = (row) => {
      const key = row.map((card) => card.id).join(",");
      if (!fiveCache.has(key)) fiveCache.set(key, Core.evaluateHighFive(row).strength);
      return fiveCache.get(key);
    };
    let legalBoards = 0;
    for (const top of combinations(cards, 3)) {
      const rest = cards.filter((card) => !top.includes(card));
      const topStrength = Core.evaluateHighTop(top).strength;
      for (const middle of combinations(rest, 5)) {
        const bottom = rest.filter((card) => !middle.includes(card));
        if (topStrength <= fiveStrength(middle) && fiveStrength(middle) <= fiveStrength(bottom)) legalBoards += 1;
      }
    }
    const trainer = Trainer.solveHand(ids);
    const core = Core.solveHand(ids, { variant: "high", allowUnsupportedCardCount: true });
    assert.equal(trainer.legalBoards, legalBoards, `${fixture.name}: trainer exact search`);
    assert.equal(core.legalBoards, legalBoards, `${fixture.name}: shared exact search`);
    const fast = Trainer.solveHandFast(ids);
    for (const solved of [trainer, fast]) {
      for (const solution of [solved.best, solved.bestRoyalty, solved.bestRepeat].filter(Boolean)) {
        assert.ok(solution.top.eval.strength <= solution.middle.eval.strength);
        assert.ok(solution.middle.eval.strength <= solution.back.eval.strength);
      }
    }
  }
});
