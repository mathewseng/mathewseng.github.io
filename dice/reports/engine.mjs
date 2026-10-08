import { outcomes, validateGame } from "./outcomes.mjs";
export { outcomes, MODES, classifyHand } from "./outcomes.mjs";

// User preference order, shared by the starting-loss filter and amount scoring.
export const PREFERRED_AMOUNTS = Object.freeze([
  1, 2, 3, 5, 4, 10, 6, 8, 12, 15, 20, 25, 30, 40, 50, 60, 75, 100,
]);
export const STARTING_LOSSES = Object.freeze(PREFERRED_AMOUNTS.map((v) => -v));
const startingLossSet = new Set(STARTING_LOSSES.map(BigInt));
export function startingLossPreference(value) {
  const rank = STARTING_LOSSES.indexOf(value);
  return rank < 0 ? 0 : 300 / (rank + 3);
}

// Fairness is an integer identity. BigInt is used for public/checker arithmetic;
// the bounded search uses safe integer Numbers (largest sum <= 6^6 * 1,000,000).
export const DEFAULTS = Object.freeze({
  n: 4,
  mode: "chosen",
  minP0: -5,
  maxP0: -1,
  maxPayout: 100,
  strict: true,
  allowZero: true,
  limit: 40,
  sort: "recommended",
});
export const FEATURED = Object.freeze({
  3: [-2, 1, 8, 55],
  4: [-2, 1, 3, 12, 60],
});
export const SORTS = [
  "recommended",
  "smoothest",
  "steepest",
  "lowest-max",
  "jackpot",
  "lowest-loss",
  "largest-jump",
  "range",
  "lowest-stdev",
  "highest-stdev",
  "simplest",
];
export function weights(n, mode = "chosen") {
  return outcomes(n, mode).map((row) => row.weight);
}
export function integer(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value))
    return BigInt(value);
  if (typeof value === "string" && /^[+-]?\d{1,100}$/.test(value.trim()))
    return BigInt(value.trim());
  throw new TypeError(
    "Use whole numbers (up to 100 digits), with no decimals.",
  );
}
export function evNumerator(n, payouts, mode = "chosen") {
  const w = weights(n, mode);
  if (payouts.length !== w.length)
    throw new RangeError(`Enter exactly ${w.length} payouts.`);
  return w.reduce((sum, w, k) => sum + BigInt(w) * integer(payouts[k]), 0n);
}
export function isFair(n, payouts, mode = "chosen") {
  return evNumerator(n, payouts, mode) === 0n;
}
export function solveFinal(n, earlier, mode = "chosen") {
  const w = weights(n, mode),
    last = w.length - 1;
  if (earlier.length !== last)
    throw new RangeError(`Enter exactly ${last} earlier payouts.`);
  const numerator = -w
    .slice(0, last)
    .reduce((sum, weight, k) => sum + BigInt(weight) * integer(earlier[k]), 0n);
  if (numerator % BigInt(w[last]) !== 0n)
    throw new RangeError(
      "No integer final payout can balance these earlier payouts.",
    );
  return numerator / BigInt(w[last]);
}
export function payoutDivisor(payouts) {
  return payouts.reduce((divisor, value) => {
    const v = integer(value);
    return gcd(divisor, v < 0n ? -v : v);
  }, 0n);
}
export function normalizeOptions(input = {}) {
  const o = { ...DEFAULTS, ...input };
  validateGame(o.n, o.mode);
  for (const key of ["minP0", "maxP0", "maxPayout", "limit"]) {
    if (!Number.isSafeInteger(o[key]))
      throw new RangeError("All filter values must be whole numbers.");
  }
  if (o.minP0 < -10000 || o.maxP0 > 10000 || o.minP0 > o.maxP0)
    throw new RangeError(
      "Use a p[0] range between −10,000 and 10,000, with minimum ≤ maximum.",
    );
  if (o.maxPayout < 1 || o.maxPayout > 1000000 || o.minP0 > o.maxPayout)
    throw new RangeError(
      "Maximum payout must be 1–1,000,000 and at least the minimum p[0].",
    );
  if (o.limit < 1 || o.limit > 200)
    throw new RangeError("Choose between 1 and 200 results.");
  if (!SORTS.includes(o.sort)) throw new RangeError("Unknown ranking method.");
  o.strict = Boolean(o.strict);
  o.allowZero = Boolean(o.allowZero);
  return o;
}
export function filterReasons(payouts, input = {}) {
  const o = normalizeOptions(input);
  const length = outcomes(o.n, o.mode).length;
  if (payouts.length !== length) return [`Needs ${length} payouts.`];
  let p;
  try {
    p = payouts.map(integer);
  } catch (error) {
    return [error.message];
  }
  const reasons = [];
  if (!startingLossSet.has(p[0]))
    reasons.push("Initial payout is not in the allowed starting-loss list.");
  if (p[0] < BigInt(o.minP0) || p[0] > BigInt(o.maxP0))
    reasons.push("Initial payout is outside the p[0] range.");
  if (p.some((v) => v < BigInt(o.minP0) || v > BigInt(o.maxPayout)))
    reasons.push("A payout is outside the minimum p[0]–maximum payout bounds.");
  if (o.strict && p.some((v, k) => k > 0 && v <= p[k - 1]))
    reasons.push("Payouts are not strictly increasing.");
  if (!o.allowZero && p.includes(0n))
    reasons.push("Zero payouts are disabled.");
  const divisor = payoutDivisor(p);
  if (divisor > 1n)
    reasons.push(
      `Schedule is a ${divisor}× scaled copy of smaller integer payouts.`,
    );
  if (!isFair(o.n, p, o.mode))
    reasons.push("Expected value is not exactly zero.");
  return reasons;
}
const factorCache = new Map();
function factorInfo(value) {
  if (!Number.isSafeInteger(value))
    throw new TypeError("Simplicity requires safe integer payouts.");
  const amount = Math.abs(value);
  if (factorCache.has(amount)) return factorCache.get(amount);
  let remainder = amount,
    factorCount = 0,
    penalty = 0;
  const factors = [];
  const factorCost = (prime) =>
    prime === 2
      ? 0.05
      : prime === 3
        ? 0.075
        : prime === 5
          ? 0.09
          : 0.09 + Math.log2(prime / 5);
  for (
    let prime = 2;
    prime * prime <= remainder;
    prime += prime === 2 ? 1 : 2
  ) {
    if (remainder % prime !== 0) continue;
    factors.push(prime);
    do {
      factorCount++;
      penalty += factorCost(prime);
      remainder /= prime;
    } while (remainder % prime === 0);
  }
  if (remainder > 1) {
    factors.push(remainder);
    factorCount++;
    penalty += factorCost(remainder);
  }
  penalty += 0.025 * Math.max(0, factorCount - 1);
  const preferredRank = PREFERRED_AMOUNTS.indexOf(amount);
  const info = {
    score:
      amount === 0
        ? 100
        : preferredRank >= 0
          ? 98 - 2 * preferredRank
          : 70 / (1 + penalty),
    factors,
  };
  // Search amounts are bounded by one million. Cache repeat amounts without
  // letting wide searches grow memory without limit.
  if (factorCache.size >= 8192) factorCache.clear();
  factorCache.set(amount, info);
  return info;
}
export function amountSimplicity(value) {
  return factorInfo(value).score;
}
export function scheduleSimplicity(p) {
  if (!p.length) throw new RangeError("Provide at least one payout.");
  const counts = new Map();
  let amountTotal = 0,
    nonzeroCount = 0,
    sharedFactor = null,
    sharedCount = 0;
  let primeMultiplier = 1,
    primePayoutCount = 0;
  for (const value of p) {
    const info = factorInfo(value);
    amountTotal += info.score;
    const amount = Math.abs(value);
    if (amount > 5 && info.factors.length === 1 && info.factors[0] === amount) {
      primePayoutCount++;
      primeMultiplier *= 7 / (4 * amount);
    }
    // Zero is a simple push, but does not manufacture a shared-factor bonus.
    if (value === 0) continue;
    nonzeroCount++;
    for (const prime of info.factors)
      counts.set(prime, (counts.get(prime) || 0) + 1);
  }
  for (const [prime, count] of counts) {
    if (
      count >= 2 &&
      (count > sharedCount || (count === sharedCount && prime < sharedFactor))
    ) {
      sharedFactor = prime;
      sharedCount = count;
    }
  }
  const amountScore = amountTotal / p.length;
  const sharedScore = nonzeroCount ? (100 * sharedCount) / nonzeroCount : 0;
  const baseSimplicity = 0.75 * amountScore + 0.25 * sharedScore;
  return {
    simplicity: baseSimplicity * primeMultiplier,
    baseSimplicity,
    primeMultiplier,
    primePayoutCount,
    amountSimplicity: amountScore,
    sharedFactorScore: sharedScore,
    sharedFactor,
    sharedCount,
    nonzeroCount,
  };
}
export function metrics(n, p, mode = "chosen") {
  const w = weights(n, mode),
    steps = p.length - 1,
    total = 6 ** n;
  const jumps = p.slice(1).map((v, i) => v - p[i]);
  const mean = jumps.reduce((s, d) => s + d, 0) / steps;
  const meanAbs = jumps.reduce((s, d) => s + Math.abs(d), 0) / steps;
  const jumpVariance = jumps.reduce((s, d) => s + (d - mean) ** 2, 0) / steps;
  const smoothness =
    100 / (1 + (meanAbs ? Math.sqrt(jumpVariance) / meanAbs : 0));
  // Population payout volatility per roll, weighted by the actual outcomes.
  // These display metrics are approximate; fairness still uses the integer identity.
  const expectedPayout =
    w.reduce((sum, weight, k) => sum + weight * p[k], 0) / total;
  const variance = w.reduce(
    (sum, weight, k) => sum + (weight / total) * (p[k] - expectedPayout) ** 2,
    0,
  );
  const stdev = Math.sqrt(variance);
  const rise = jumps.reduce((s, d) => s + Math.max(0, d), 0);
  const steepness = rise
    ? steps === 1
      ? 100
      : (100 *
          jumps.reduce(
            (s, d, i) => s + (Math.max(0, d) * i) / Math.max(1, steps - 1),
            0,
          )) /
        rise
    : 0;
  const max = Math.max(...p),
    range = max - Math.min(...p);
  const simple = scheduleSimplicity(p);
  const bend =
    jumps
      .slice(1)
      .reduce(
        (s, d, i) =>
          s +
          Math.abs(
            Math.log2((Math.abs(d) + 1) / (Math.abs(jumps[i]) + 1)) - 1,
          ) +
          (d < jumps[i] ? 1 : 0),
        0,
      ) / Math.max(1, steps - 1);
  const recommended =
    0.5 * simple.simplicity +
    0.3 * startingLossPreference(p[0]) +
    0.1 * smoothness +
    5 / (1 + Math.max(0, max) / 50) +
    2.5 / (1 + bend) +
    (2.5 * jumps.filter((d) => d > 0).length) / steps;
  return {
    max,
    range,
    jumps,
    largestJump: Math.max(...jumps.map(Math.abs)),
    smoothness,
    steepness,
    variance,
    stdev,
    startingLossPreference: startingLossPreference(p[0]),
    ...simple,
    recommended,
    winWeight: w.reduce((s, v, k) => s + (p[k] > 0 ? v : 0), 0),
    total,
    maxMatchWeight: w.at(-1),
  };
}
export function compareSchedules(sort) {
  return (a, b) => {
    const m = a.metrics,
      q = b.metrics;
    const differences = {
      recommended: q.recommended - m.recommended,
      smoothest: q.smoothness - m.smoothness,
      steepest: q.steepness - m.steepness,
      "lowest-max": m.max - q.max,
      jackpot: q.max - m.max,
      "lowest-loss": Math.max(0, -a.payouts[0]) - Math.max(0, -b.payouts[0]),
      "largest-jump": m.largestJump - q.largestJump,
      range: m.range - q.range,
      "lowest-stdev": m.stdev - q.stdev,
      "highest-stdev": q.stdev - m.stdev,
      simplest: q.simplicity - m.simplicity,
    };
    return (
      differences[sort] ||
      q.recommended - m.recommended ||
      a.payouts.reduce((d, v, k) => d || v - b.payouts[k], 0)
    );
  };
}
function shapeKey(p, m) {
  // Eight subdivisions of the normalized curve; loss and jackpot bands keep
  // distinct stakes visible. Only Recommended uses this representative grouping.
  return [
    p[0],
    Math.floor(Math.log2(Math.max(1, m.max))),
    ...p
      .slice(1, -1)
      .map((v) => Math.floor((8 * (v - Math.min(...p))) / (m.range || 1))),
  ].join(":");
}
function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}
function* spread(lo, hi) {
  const length = hi - lo + 1;
  if (length <= 0) return;
  let step = Math.max(1, Math.floor(length * 0.618));
  while (gcd(step, length) !== 1) step++;
  // Coprime traversal visits every integer once; partial runs span the interval.
  for (
    let j = 0, offset = 0;
    j < length;
    j++, offset = (offset + step) % length
  )
    yield lo + offset;
}
export function enumerate(
  input = {},
  { maxNodes = 600000, maxMs = 2500, onProgress = () => {} } = {},
) {
  const o = normalizeOptions(input),
    rawWeights = weights(o.n, o.mode),
    divisor = rawWeights.reduce((d, v) => gcd(d, v), 0),
    w = rawWeights.map((v) => v / divisor),
    last = w.length - 1,
    started = performance.now();
  const compare = compareSchedules(o.sort),
    pool = new Map();
  const suffix = w.map((_, i) => w.slice(i).reduce((s, v) => s + v, 0));
  let nodes = 0,
    found = 0,
    lastProgress = started,
    stopped = false;
  function add(payouts) {
    // Remove scaled copies before counting or ranking, even if the smaller
    // integer schedule falls outside the current initial-payout bounds.
    if (payouts.reduce((divisor, v) => gcd(divisor, Math.abs(v)), 0) > 1)
      return;
    found++;
    const m = metrics(o.n, payouts, o.mode),
      row = { payouts, metrics: m };
    const key =
      o.sort === "recommended" ? shapeKey(payouts, m) : payouts.join(",");
    if (!pool.has(key) || compare(row, pool.get(key)) < 0) pool.set(key, row);
    if (pool.size > 1600) {
      const best = [...pool.entries()]
        .sort((a, b) => compare(a[1], b[1]))
        .slice(0, 800);
      pool.clear();
      best.forEach(([k, v]) => pool.set(k, v));
    }
  }
  function* visit(p, sum, i) {
    if (i === last) {
      const final = sum === 0 ? 0 : -sum / w[last];
      yield Number.isInteger(final) &&
      final >= o.minP0 &&
      final <= o.maxPayout &&
      (!o.strict || final > p.at(-1)) &&
      (o.allowZero || final !== 0)
        ? [...p, final]
        : null;
      return;
    }
    let lo = o.strict ? p[i - 1] + 1 : o.minP0;
    let hi = o.strict ? o.maxPayout - (last - i) : o.maxPayout;
    if (o.strict) {
      const offset = w.slice(i + 1).reduce((s, v, j) => s + v * (j + 1), 0);
      const maxTail = w
        .slice(i + 1)
        .reduce((s, v, j) => s + v * (o.maxPayout - (last - (i + j + 1))), 0);
      lo = Math.max(lo, Math.ceil((-sum - maxTail) / w[i]));
      hi = Math.min(hi, Math.floor((-sum - offset) / suffix[i]));
    } else {
      lo = Math.max(lo, Math.ceil((-sum - o.maxPayout * suffix[i + 1]) / w[i]));
      hi = Math.min(hi, Math.floor((-sum - o.minP0 * suffix[i + 1]) / w[i]));
    }
    for (const v of spread(lo, hi)) {
      // A yield per visited candidate gives the outer loop a strict work budget.
      if (!o.allowZero && v === 0) {
        yield null;
        continue;
      }
      const next = sum + w[i] * v;
      if (i === last - 1) {
        const final = next === 0 ? 0 : -next / w[last];
        const valid =
          Number.isInteger(final) &&
          final >= o.minP0 &&
          final <= o.maxPayout &&
          (!o.strict || final > v) &&
          (o.allowZero || final !== 0);
        yield valid ? [...p, v, final] : null;
      } else {
        yield null;
        yield* visit([...p, v], next, i + 1);
      }
    }
  }
  const active = [];
  for (const p0 of STARTING_LOSSES) {
    if (p0 >= o.minP0 && p0 <= Math.min(o.maxP0, o.maxPayout))
      active.push(visit([p0], w[0] * p0, 1));
  }
  // Round-robin starting losses avoids exhausting the budget on only one stake.
  while (active.length && !stopped) {
    for (let i = 0; i < active.length && !stopped;) {
      let done = false;
      for (let batch = 0; batch < 64; batch++) {
        if (
          nodes >= maxNodes ||
          (nodes % 1024 === 0 && performance.now() - started >= maxMs)
        ) {
          stopped = true;
          break;
        }
        const item = active[i].next();
        if (item.done) {
          done = true;
          break;
        }
        nodes++;
        if (item.value) add(item.value);
      }
      if (done) active.splice(i, 1);
      else i++;
      const now = performance.now();
      if (now - lastProgress > 200) {
        onProgress({ nodes, found });
        lastProgress = now;
      }
    }
  }
  return {
    rows: [...pool.values()].sort(compare).slice(0, o.limit),
    found,
    nodes,
    complete: !stopped,
    elapsedMs: Math.round(performance.now() - started),
    grouped: o.sort === "recommended",
  };
}

export function sortDisplayed(rows, key = "rank", direction = "asc") {
  if (!["asc", "desc"].includes(direction))
    throw new RangeError("Unknown sort direction.");
  const value = (row) =>
    key === "rank"
      ? row.rank
      : key.startsWith("payout:")
        ? row.payouts[Number(key.slice(7))]
        : row.metrics[key];
  if (rows.some((row) => !Number.isFinite(value(row))))
    throw new RangeError("Unknown table column.");
  return [...rows].sort(
    (a, b) =>
      (direction === "asc" ? 1 : -1) * (value(a) - value(b)) || a.rank - b.rank,
  );
}
