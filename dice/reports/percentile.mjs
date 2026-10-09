import { outcomes } from "./outcomes.mjs";

const clamp = (value) => Math.max(0, Math.min(1, value));
const MOMENT_SCALE = 46656n; // Every 6^n denominator for n=1…6 divides this.
function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}
// Standard-normal CDF approximation. Used only by the explicit
// fallback for distributions that exceed both exact representation budgets.
function normalCDF(z) {
  const x = Math.abs(z),
    t = 1 / (1 + 0.2316419 * x);
  const tail =
    (Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI)) *
    t *
    (0.31938153 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - tail : tail;
}

export function createPercentileTracker({
  maxDenseStates = 262144,
  maxSparseStates = 65536,
} = {}) {
  if (
    ![maxDenseStates, maxSparseStates].every(
      (value) => Number.isInteger(value) && value >= 2,
    )
  )
    throw new RangeError(
      "Use at least two states for each distribution budget.",
    );
  let dense = new Float64Array([1]),
    sparse = null,
    minimum = 0n,
    maximum = 0n,
    step = 0n,
    minimumMass = 1,
    maximumMass = 1,
    mean = 0,
    variance = 0,
    meanNumerator = 0n,
    varianceNumerator = 0n,
    rounds = 0,
    exact = true;

  function* entries() {
    if (sparse) yield* sparse;
    else
      for (let i = 0; i < dense.length; i++)
        if (dense[i]) yield [minimum + BigInt(i) * step, dense[i]];
  }

  return {
    append({ n, mode, payouts }) {
      const categories = outcomes(n, mode),
        total = 6 ** n;
      if (
        !Array.isArray(payouts) ||
        payouts.length !== categories.length ||
        !payouts.every(Number.isSafeInteger)
      )
        throw new RangeError(
          "Provide a safe integer payout for every outcome.",
        );
      const weights = new Map();
      payouts.forEach((p, i) =>
        weights.set(
          BigInt(p),
          (weights.get(BigInt(p)) || 0) + categories[i].weight,
        ),
      );
      const atoms = [...weights]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([p, w]) => [p, w / total]);
      const low = atoms[0][0],
        high = atoms.at(-1)[0],
        newMinimum = minimum + low,
        newMaximum = maximum + high,
        newStep = atoms.reduce((s, [p]) => gcd(s, p - low), step),
        width = newStep ? (newMaximum - newMinimum) / newStep + 1n : 1n;
      const scale = MOMENT_SCALE / BigInt(total),
        rollMeanNumerator =
          [...weights].reduce((sum, [p, w]) => sum + p * BigInt(w), 0n) * scale,
        rollSecondNumerator =
          [...weights].reduce((sum, [p, w]) => sum + p * p * BigInt(w), 0n) *
          scale;
      meanNumerator += rollMeanNumerator;
      varianceNumerator +=
        rollSecondNumerator * MOMENT_SCALE - rollMeanNumerator ** 2n;
      mean = Number(meanNumerator) / Number(MOMENT_SCALE);
      variance = Number(varianceNumerator) / Number(MOMENT_SCALE ** 2n);
      minimumMass *= atoms[0][1];
      maximumMass *= atoms.at(-1)[1];

      if (exact && width <= BigInt(maxDenseStates)) {
        const next = new Float64Array(Number(width));
        const shifts = atoms.map(([p, probability]) => [
          newStep ? Number((p - low) / newStep) : 0,
          probability,
        ]);
        if (dense) {
          // Only array indexes use Numbers. The lattice origin and spacing
          // remain BigInts, even for totals above Number.MAX_SAFE_INTEGER.
          const stride = newStep ? Number(step / newStep) : 0;
          for (let i = 0; i < dense.length; i++) {
            const mass = dense[i];
            if (mass)
              for (const [shift, probability] of shifts)
                next[i * stride + shift] += mass * probability;
          }
        } else {
          for (const [p, mass] of sparse) {
            const base = newStep ? Number((p - minimum) / newStep) : 0;
            for (const [shift, probability] of shifts)
              next[base + shift] += mass * probability;
          }
        }
        const mass = next.reduce((sum, value) => sum + value, 0);
        for (let i = 0; i < next.length; i++) next[i] /= mass;
        dense = next;
        sparse = null;
      } else if (exact) {
        const next = new Map();
        accumulate: for (const [p, mass] of entries()) {
          for (const [payout, probability] of atoms) {
            const value = p + payout;
            next.set(value, (next.get(value) || 0) + mass * probability);
            if (next.size > maxSparseStates) {
              exact = false;
              break accumulate;
            }
          }
        }
        if (exact) {
          const mass = [...next.values()].reduce(
            (sum, value) => sum + value,
            0,
          );
          for (const [p, value] of next) next.set(p, value / mass);
          sparse = next;
        } else sparse = null;
        dense = null;
      }
      minimum = newMinimum;
      maximum = newMaximum;
      step = newStep;
      rounds++;
    },
    percentile(observed) {
      if (!rounds) return null;
      if (typeof observed !== "bigint")
        throw new TypeError("Session PnL must be a BigInt.");
      const stdev = Math.sqrt(variance);
      let prefix;
      if (exact && dense) {
        prefix = new Float64Array(dense.length);
        for (let i = 0, sum = 0; i < dense.length; i++)
          prefix[i] = sum += dense[i];
      }
      function cdf(value) {
        if (value < minimum) return 0;
        if (value >= maximum) return 1;
        if (prefix) return clamp(prefix[Number((value - minimum) / step)]);
        if (sparse) {
          let mass = 0;
          for (const [p, probability] of sparse)
            if (p <= value) mass += probability;
          return clamp(mass);
        }
        const latticeValue = minimum + ((value - minimum) / step) * step;
        return clamp(
          normalCDF((Number(latticeValue) + Number(step) / 2 - mean) / stdev),
        );
      }
      let probability;
      if (observed < minimum) probability = 0;
      else if (observed > maximum) probability = 1;
      else if (minimum === maximum) probability = 0.5;
      else if (observed === minimum) probability = minimumMass / 2;
      else if (observed === maximum) probability = 1 - maximumMass / 2;
      else if (exact) probability = (cdf(observed - 1n) + cdf(observed)) / 2;
      else if ((observed - minimum) % step) probability = cdf(observed);
      else probability = normalCDF((Number(observed) - mean) / stdev);
      return {
        value: 100 * clamp(probability),
        exact,
        rounds,
        states: dense?.length || sparse?.size || 0,
        mean,
        variance,
        stdev,
        zScore: stdev ? (Number(observed) - mean) / stdev : null,
        minimum: minimum.toString(),
        maximum: maximum.toString(),
        bands: [1, 2, 3].map((sigma) => {
          const lower = mean - sigma * stdev,
            upper = mean + sigma * stdev;
          return {
            sigma,
            lower,
            upper,
            probability:
              100 *
              clamp(
                cdf(BigInt(Math.floor(upper))) -
                  cdf(BigInt(Math.ceil(lower)) - 1n),
              ),
          };
        }),
      };
    },
  };
}

export function formatPercentile({ value }) {
  return `${value.toFixed(1)}%`;
}
