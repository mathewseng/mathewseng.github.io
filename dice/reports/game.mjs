import { outcomes, classifyHand, validateGame } from "./outcomes.mjs";
import { isFair, payoutDivisor } from "./engine.mjs";

// Rejection sampling removes modulo bias: 2^32 isn't divisible by six.
export function rollDice(
  n,
  randomUint32 = () => crypto.getRandomValues(new Uint32Array(1))[0],
) {
  validateGame(n);
  return Array.from({ length: n }, () => {
    let value;
    do {
      value = randomUint32();
      if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
        throw new RangeError(
          "Random source must return an unsigned 32-bit integer.",
        );
    } while (value >= 4294967292);
    return (value % 6) + 1;
  });
}
export function playableSchedule({ n, mode, payouts }) {
  validateGame(n, mode);
  if (
    !Array.isArray(payouts) ||
    !payouts.every(Number.isSafeInteger) ||
    !isFair(n, payouts, mode)
  )
    throw new RangeError("Choose an exactly fair integer payout schedule.");
  if (payoutDivisor(payouts) > 1n)
    throw new RangeError("Use the smallest integer scale.");
  return Object.freeze({ n, mode, payouts: Object.freeze([...payouts]) });
}
export function scoreRoll(game, roll, chosenFace = 1) {
  if (
    roll.length !== game.n ||
    roll.some((v) => !Number.isInteger(v) || v < 1 || v > 6)
  )
    throw new RangeError(
      "Roll must contain the selected number of six-sided dice.",
    );
  if (!Number.isInteger(chosenFace) || chosenFace < 1 || chosenFace > 6)
    throw new RangeError("Choose a face from 1 through 6.");
  const key =
    game.mode === "chosen"
      ? `matches-${roll.filter((v) => v === chosenFace).length}`
      : classifyHand(roll, game.mode);
  const categories = outcomes(game.n, game.mode);
  const index = categories.findIndex((row) => row.members.includes(key));
  const category = categories[index];
  const payout = game.payouts[index];
  const effect =
    payout < 0
      ? "loss"
      : payout === 0
        ? "push"
        : payout === Math.max(...game.payouts)
          ? "jackpot"
          : payout >= Math.max(1, Math.abs(game.payouts[0])) * 5
            ? "big-win"
            : "win";
  return { index, key, label: category.label, payout, effect, roll: [...roll] };
}
// One pending roll at a time. Its rules and chosen face are captured before any
// animation begins; settling twice cannot award the same payout twice.
export function createSession() {
  let pnl = 0n,
    rounds = 0,
    pending = null,
    history = [];
  return {
    get state() {
      return { pnl, rounds, rolling: pending !== null, history: [...history] };
    },
    // Animation can reveal locked dice individually without settling the wager.
    get pendingRoll() {
      return pending ? [...pending.roll] : null;
    },
    begin(game, chosenFace = 1, randomUint32) {
      if (pending) return false;
      const locked = playableSchedule(game);
      pending = scoreRoll(locked, rollDice(locked.n, randomUint32), chosenFace);
      return true;
    },
    settle() {
      if (!pending) return null;
      const result = pending;
      pending = null;
      pnl += BigInt(result.payout);
      rounds++;
      history = [{ ...result, round: rounds }, ...history].slice(0, 12);
      return result;
    },
    reset() {
      if (pending) return false;
      pnl = 0n;
      rounds = 0;
      history = [];
      return true;
    },
  };
}
