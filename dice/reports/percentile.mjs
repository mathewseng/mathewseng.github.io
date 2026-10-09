import { outcomes } from "./outcomes.mjs";

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function addBin(map, lo, hi, mass) {
  if (!mass) return;
  const key = `${lo}:${hi}`,
    old = map.get(key);
  if (old) old.mass += mass;
  else map.set(key, { lo, hi, mass });
}

// Merge adjacent probability quantiles, retaining the entire support interval.
// Splitting a heavy atom across quantiles keeps almost all its mass exact;
// identical intervals are combined again afterward. No outcome is sampled.
function compress(bins, maxBins) {
  const target = bins.reduce((s, b) => s + b.mass, 0) / maxBins;
  const packed = new Map();
  let current = null,
    groups = 0;
  const flush = () => {
    if (current) addBin(packed, current.lo, current.hi, current.mass);
    current = null;
    groups++;
  };
  for (const bin of bins) {
    let remaining = bin.mass;
    while (remaining > 0) {
      if (!current) current = { lo: bin.lo, hi: bin.hi, mass: 0 };
      const take =
        groups === maxBins - 1
          ? remaining
          : Math.min(remaining, target - current.mass);
      current.hi = current.hi > bin.hi ? current.hi : bin.hi;
      current.mass += take;
      remaining -= take;
      if (groups < maxBins - 1 && current.mass >= target * (1 - 1e-12)) flush();
    }
  }
  if (current) flush();
  return [...packed.values()];
}

export function createPercentileTracker({ maxBins = 4096 } = {}) {
  if (!Number.isInteger(maxBins) || maxBins < 2)
    throw new RangeError("Use at least two distribution bins.");
  let bins = [{ lo: 0n, hi: 0n, mass: 1 }],
    rounds = 0;
  return {
    append({ n, mode, payouts }) {
      const categories = outcomes(n, mode);
      if (
        !Array.isArray(payouts) ||
        payouts.length !== categories.length ||
        !payouts.every(Number.isSafeInteger)
      )
        throw new RangeError(
          "Provide a safe integer payout for every outcome.",
        );
      const payoutsByValue = new Map();
      payouts.forEach((p, i) =>
        payoutsByValue.set(
          BigInt(p),
          (payoutsByValue.get(BigInt(p)) || 0) + categories[i].weight,
        ),
      );
      const next = new Map(),
        total = 6 ** n;
      for (const bin of bins)
        for (const [payout, weight] of payoutsByValue)
          addBin(
            next,
            bin.lo + payout,
            bin.hi + payout,
            (bin.mass * weight) / total,
          );
      let sorted = [...next.values()].sort(
        (a, b) => compare(a.lo, b.lo) || compare(a.hi, b.hi),
      );
      if (sorted.length > maxBins) sorted = compress(sorted, maxBins);
      const mass = sorted.reduce((s, b) => s + b.mass, 0);
      bins = sorted.map((bin) => ({ ...bin, mass: bin.mass / mass }));
      rounds++;
    },
    percentile(observed) {
      if (!rounds) return null;
      if (typeof observed !== "bigint")
        throw new TypeError("Session PnL must be a BigInt.");
      let lower = 0,
        upper = 0;
      for (const bin of bins) {
        if (bin.hi < observed) {
          lower += bin.mass;
          upper += bin.mass;
        } else if (bin.lo > observed) continue;
        else if (bin.lo === bin.hi) {
          lower += bin.mass / 2;
          upper += bin.mass / 2;
        } else {
          // Midrank = P(PnL < observed) + half P(PnL = observed).
          if (bin.hi === observed) lower += bin.mass / 2;
          upper += bin.lo === observed ? bin.mass / 2 : bin.mass;
        }
      }
      return {
        lower: Math.max(0, Math.min(100, lower * 100)),
        upper: Math.max(0, Math.min(100, upper * 100)),
        exact: Math.abs(upper - lower) < 1e-12,
        rounds,
        bins: bins.length,
      };
    },
  };
}

export function formatPercentile({ lower, upper, exact }) {
  if (exact) {
    if (lower < 0.05) return "<0.1%";
    if (lower > 99.95) return ">99.9%";
    return `${lower.toFixed(1)}%`;
  }
  // Outward rounding preserves the displayed bound.
  return `${(Math.floor(lower * 10) / 10).toFixed(1)}–${(Math.ceil(upper * 10) / 10).toFixed(1)}%`;
}
