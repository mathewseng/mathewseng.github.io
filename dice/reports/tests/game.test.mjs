import test from "node:test";
import assert from "node:assert/strict";
import {
  rollDice,
  scoreRoll,
  playableSchedule,
  createSession,
} from "../game.mjs";
import { outcomes, enumerate, FEATURED } from "../engine.mjs";

test("unbiased die sampling rejects the four surplus uint32 values", () => {
  const queue = [
    4294967292, 4294967293, 4294967294, 4294967295, 0, 1, 2, 3, 4, 5,
  ];
  assert.deepEqual(
    rollDice(6, () => queue.shift()),
    [1, 2, 3, 4, 5, 6],
  );
  assert.equal(queue.length, 0);
  assert.throws(() => rollDice(2, () => -1));
  assert.throws(() => rollDice(2, () => 0.5));
});
test("every ordered roll maps to the exact payout distribution in all modes", () => {
  for (const mode of ["chosen", "single", "full"])
    for (let n = 2; n <= 6; n++) {
      const game = playableSchedule({
        n,
        mode,
        payouts: enumerate({ n, mode }).rows[0].payouts,
      });
      const categories = outcomes(n, mode),
        counts = categories.map(() => 0);
      let sum = 0n;
      for (let encoded = 0; encoded < 6 ** n; encoded++) {
        let code = encoded;
        const roll = Array.from({ length: n }, () => {
          const face = (code % 6) + 1;
          code = Math.floor(code / 6);
          return face;
        });
        const result = scoreRoll(game, roll, 6);
        counts[result.index]++;
        assert.equal(result.payout, game.payouts[result.index]);
        sum += BigInt(result.payout);
      }
      assert.deepEqual(
        counts,
        categories.map((c) => c.weight),
      );
      assert.equal(sum, 0n);
    }
});
test("requested reordered and grouped hands receive their shared payout", () => {
  const six = { n: 6, mode: "full", payouts: [-4, -3, -2, -1, 0, 1, 2, 3, 4] };
  for (const [roll, index] of [
    [[1, 1, 1, 2, 3, 4], 3],
    [[1, 1, 1, 2, 2, 3], 3],
    [[1, 1, 2, 2, 3, 3], 4],
    [[1, 1, 1, 1, 2, 3], 4],
    [[1, 1, 1, 1, 2, 2], 5],
    [[1, 1, 1, 2, 2, 2], 6],
  ])
    assert.equal(scoreRoll(six, roll).index, index);
  const four = { n: 4, mode: "full", payouts: [-1, 0, 1, 2, 10] };
  assert.equal(scoreRoll(four, [1, 1, 1, 2]).payout, 1);
  assert.equal(scoreRoll(four, [1, 1, 2, 2]).payout, 2);
  assert.throws(() => scoreRoll(four, [0, 1, 2, 3]));
  assert.throws(() => scoreRoll(four, [1, 2, 3]));
});
test("sessions lock roll rules, settle once, accumulate exact PnL and reset explicitly", () => {
  const session = createSession();
  const game = { n: 4, mode: "chosen", payouts: [...FEATURED[4]] };
  assert.ok(session.begin(game, 6, () => 5));
  game.payouts[4] = 999;
  assert.equal(
    session.begin(game, 1, () => 0),
    false,
  );
  assert.equal(session.reset(), false);
  assert.equal(session.state.pnl, 0n);
  const preview = session.pendingRoll;
  assert.deepEqual(preview, [6, 6, 6, 6]);
  preview.fill(1);
  assert.deepEqual(session.pendingRoll, [6, 6, 6, 6]);
  assert.equal(session.settle().payout, 60);
  assert.equal(session.pendingRoll, null);
  assert.equal(session.settle(), null);
  assert.equal(session.state.pnl, 60n);
  assert.equal(session.state.rounds, 1);
  assert.ok(
    session.begin({ n: 2, mode: "single", payouts: [-1, 5] }, 1, () => 2),
  );
  assert.equal(session.settle().payout, 5);
  assert.equal(session.state.pnl, 65n);
  assert.ok(session.reset());
  assert.deepEqual(session.state, {
    pnl: 0n,
    rounds: 0,
    rolling: false,
    history: [],
  });
  const huge = {
    n: 2,
    mode: "chosen",
    payouts: [-300000000000000, 1, 7499999999999990],
  };
  for (let i = 0; i < 2; i++) {
    session.begin(huge, 1, () => 0);
    session.settle();
  }
  assert.equal(session.state.pnl, 14999999999999980n);
});
test("effects reflect net loss, push, win, big win and top payout", () => {
  const game = { n: 4, mode: "full", payouts: [-1, 0, 1, 5, 45] };
  for (const [roll, effect] of [
    [[1, 2, 3, 4], "loss"],
    [[1, 1, 2, 3], "push"],
    [[1, 1, 1, 2], "win"],
    [[1, 1, 2, 2], "big-win"],
    [[1, 1, 1, 1], "jackpot"],
  ])
    assert.equal(scoreRoll(game, roll).effect, effect);
  assert.throws(() =>
    playableSchedule({ n: 2, mode: "full", payouts: [-2, 10] }),
  );
  assert.throws(() =>
    playableSchedule({ n: 2, mode: "full", payouts: [-1, 6] }),
  );
});
