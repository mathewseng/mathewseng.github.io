import { outcomes } from "./outcomes.mjs";

export const SUM_FAMILIES = Object.freeze({
  ranges: "Ranges",
  window: "Middle / edges",
  mirror: "Mirrored tiers",
  periodic: "Every nth total",
  bonus: "Ranges + bonus",
  multiplier: "Ranges × multiplier",
  steps: "Stair steps",
});
const signed = (v) => `${v > 0 ? "+" : ""}${v}`;
const range = (lo, hi) => (lo === hi ? String(lo) : `${lo}–${hi}`);
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));

export function sumBands(n, payouts) {
  const bands = [];
  payouts.forEach((payout, i) => {
    payout = payout || 0;
    if (bands.at(-1)?.payout === payout) bands.at(-1).to = n + i;
    else bands.push({ from: n + i, to: n + i, payout });
  });
  return bands;
}
export function sumPayoutGroups(n, payouts) {
  const groups = new Map(),
    categories = outcomes(n, "sum");
  for (const band of sumBands(n, payouts)) {
    if (!groups.has(band.payout))
      groups.set(band.payout, {
        payout: band.payout,
        ranges: [],
        indices: [],
        weight: 0,
      });
    const group = groups.get(band.payout);
    group.ranges.push(range(band.from, band.to));
    for (let total = band.from; total <= band.to; total++) {
      group.indices.push(total - n);
      group.weight += categories[total - n].weight;
    }
  }
  return [...groups.values()].map((group) => ({
    ...group,
    label: `Totals ${group.ranges.join(", ")}`,
  }));
}
export function evaluateSumRule(total, rule) {
  if (rule.steps)
    return (
      rule.steps.base +
      rule.steps.jump *
        Math.floor((total - rule.steps.origin) / rule.steps.width)
    );
  let payout = rule.bands.find((b) => total >= b.from && total <= b.to)?.payout;
  if (payout === undefined) throw new RangeError("Total is outside this rule.");
  const m = rule.modifier;
  if (m && total % m.period === m.offset)
    payout = m.type === "add" ? payout + m.amount : payout * m.amount;
  return payout || 0;
}
function marker(m, rule) {
  if (m.offset === 0)
    return m.period === 2 ? "even totals" : `multiples of ${m.period}`;
  if (m.period === 2) return "odd totals";
  const first = rule.bands[0].from,
    last = rule.bands.at(-1).to;
  const matches = Array.from(
    { length: last - first + 1 },
    (_, i) => i + first,
  ).filter((s) => s % m.period === m.offset);
  return `totals ${matches.slice(0, 4).join(", ")}${matches.length > 4 ? ", …" : ""}`;
}
export function describeSumRule(rule) {
  if (rule.steps) {
    const s = rule.steps;
    return `${signed(s.base)} + ${s.jump} × floor((total − ${s.origin}) / ${s.width}). One step every ${s.width} points.`;
  }
  if (rule.family === "periodic") {
    const m = rule.modifier,
      base = rule.bands[0].payout;
    return `${marker(m, rule)}: ${signed(base + m.amount)}; all other totals: ${signed(base)}.`;
  }
  let text = rule.bands
    .map((b) => `${range(b.from, b.to)}: ${signed(b.payout)}`)
    .join(" · ");
  if (rule.modifier) {
    const m = rule.modifier;
    text +=
      m.type === "add"
        ? `. Add ${signed(m.amount)} on ${marker(m, rule)}.`
        : `. Multiply by ${m.amount} on ${marker(m, rule)} (including losses).`;
  }
  return text;
}
export function sumRuleEase(rule) {
  const parts =
    rule.steps || rule.family === "periodic" ? 3 : rule.bands.length;
  const exception = rule.modifier && rule.family !== "periodic" ? 0.5 : 0;
  return 100 / (1 + 0.25 * Math.max(0, parts - 2) + exception);
}
export function plainSumRule(n, payouts) {
  return { family: "ranges", bands: sumBands(n, payouts) };
}
function candidate(n, payouts, family, extras = {}) {
  payouts = payouts.map((v) => v || 0);
  return { payouts, rule: { family, bands: sumBands(n, payouts), ...extras } };
}

// A finite, inspectable rule catalogue, interleaved so a budgeted run samples
// every family. Each yield is one attempted rule, including rejected balances.
export function* sumCandidates(o, preferredAmounts) {
  const n = o.n,
    last = 6 * n,
    w = outcomes(n, "sum").map((c) => c.weight),
    total = 6 ** n;
  const sums = w.map((_, i) => n + i),
    prefix = [0];
  w.forEach((v) => prefix.push(prefix.at(-1) + v));
  const amounts = [0, ...preferredAmounts.flatMap((v) => [-v, v])].filter(
    (v) => v >= o.minP0 && v <= o.maxPayout && (o.allowZero || v !== 0),
  );
  const losses = preferredAmounts.filter((v) => -v >= o.minP0 && -v <= o.maxP0);
  const inside = (v) => Number.isInteger(v) && v >= o.minP0 && v <= o.maxPayout;
  function* ranges() {
    for (let cut = 1; cut < w.length; cut++) {
      const a = prefix[cut],
        b = total - a;
      for (const low of amounts) {
        const high = (-a * low) / b;
        yield inside(high) && low !== high
          ? candidate(
              n,
              sums.map((s) => (s < n + cut ? low : high)),
              "ranges",
            )
          : null;
      }
    }
    for (let left = 1; left < w.length - 1; left++)
      for (let right = left + 1; right < w.length; right++) {
        const a = prefix[left],
          b = prefix[right] - a,
          c = total - prefix[right];
        for (const low of amounts)
          for (const middle of amounts) {
            const high = -(a * low + b * middle) / c;
            yield low !== middle && high !== middle && inside(high)
              ? candidate(
                  n,
                  sums.map((s) =>
                    s < n + left ? low : s < n + right ? middle : high,
                  ),
                  "ranges",
                )
              : null;
          }
      }
  }
  function* windows() {
    for (let left = 0; left < w.length; left++)
      for (let right = left; right < w.length; right++) {
        const center = prefix[right + 1] - prefix[left],
          outer = total - center;
        if (!outer) continue;
        const divisor = gcd(center, outer);
        for (const sign of [-1, 1]) {
          const innerPay = (sign * outer) / divisor,
            outerPay = (-sign * center) / divisor;
          yield candidate(
            n,
            sums.map((s) =>
              s >= n + left && s <= n + right ? innerPay : outerPay,
            ),
            "window",
          );
        }
      }
  }
  function* mirrors() {
    const half = Math.floor(w.length / 2);
    for (let outer = 1; outer <= half; outer++)
      for (let inner = outer; inner <= half; inner++)
        for (const big of losses)
          for (const small of [0, ...losses.filter((v) => v < big)])
            for (const sign of [-1, 1]) {
              const payouts = w.map((_, i) => {
                const distance = Math.min(i, w.length - 1 - i);
                const value =
                  distance < outer ? big : distance < inner ? small : 0;
                return (
                  sign * (i < half ? -value : i >= w.length - half ? value : 0)
                );
              });
              yield candidate(n, payouts, "mirror");
            }
  }
  function* periodic() {
    for (let period = 2; period <= 6; period++)
      for (let offset = 0; offset < period; offset++) {
        const marked = sums.reduce(
            (s, v, i) => s + (v % period === offset ? w[i] : 0),
            0,
          ),
          other = total - marked;
        if (!marked || !other) continue;
        const divisor = gcd(marked, other);
        for (const sign of [-1, 1]) {
          const base = (-sign * marked) / divisor,
            bonus = (sign * total) / divisor;
          const modifier = { type: "add", period, offset, amount: bonus };
          yield candidate(
            n,
            sums.map((s) => base + (s % period === offset ? bonus : 0)),
            "periodic",
            {
              bands: [{ from: n, to: last, payout: base }],
              modifier,
            },
          );
        }
      }
  }
  function* exceptions(type) {
    for (let period = 2; period <= 6; period++)
      for (let offset = 0; offset < period; offset++)
        for (let cut = 1; cut < w.length; cut++) {
          const markedLow = sums.reduce(
            (s, v, i) => s + (i < cut && v % period === offset ? w[i] : 0),
            0,
          );
          const markedHigh = sums.reduce(
            (s, v, i) => s + (i >= cut && v % period === offset ? w[i] : 0),
            0,
          );
          for (const amount of type === "add"
            ? [-5, -3, -2, -1, 1, 2, 3, 5, 10]
            : [2, 3, 5])
            for (const low of amounts) {
              const a =
                prefix[cut] +
                (type === "multiply" ? (amount - 1) * markedLow : 0);
              const b =
                total -
                prefix[cut] +
                (type === "multiply" ? (amount - 1) * markedHigh : 0);
              const extra =
                type === "add" ? amount * (markedLow + markedHigh) : 0;
              const high = -(a * low + extra) / b;
              if (!inside(high) || low === high) {
                yield null;
                continue;
              }
              const rule = {
                family: type === "add" ? "bonus" : "multiplier",
                bands: [
                  { from: n, to: n + cut - 1, payout: low },
                  { from: n + cut, to: last, payout: high },
                ],
                modifier: { type, period, offset, amount },
              };
              yield {
                payouts: sums.map((s) => evaluateSumRule(s, rule)),
                rule,
              };
            }
        }
    // A central push band preserves mirror symmetry. Combining it with a fair
    // periodic bet gives three-range bonuses; symmetric markers also support
    // multipliers for even dice counts, where a two-range split cannot balance.
    for (let cut = 1; cut <= Math.floor(w.length / 2); cut++) {
      const mirror = w.map((_, i) =>
        i < cut ? -1 : i >= w.length - cut ? 1 : 0,
      );
      for (const periodicRule of periodic()) {
        const m = periodicRule.rule.modifier;
        for (const factor of type === "multiply" ? [2, 3, 5] : [1]) {
          const base = type === "add" ? periodicRule.rule.bands[0].payout : 0;
          const rule = {
            family: type === "add" ? "bonus" : "multiplier",
            bands: sumBands(
              n,
              mirror.map((v) => v + base),
            ),
            modifier: {
              ...m,
              type,
              amount: type === "add" ? m.amount : factor,
            },
          };
          yield { payouts: sums.map((s) => evaluateSumRule(s, rule)), rule };
        }
      }
    }
  }
  function* steps() {
    for (let width = 1; width <= 6; width++)
      for (let shift = 0; shift < width; shift++) {
        const raw = sums.map((s) => Math.floor((s - n + shift) / width));
        const meanNumerator = raw.reduce((s, v, i) => s + v * w[i], 0);
        const centered = raw.map((v) => total * v - meanNumerator),
          divisor = centered.reduce(gcd, 0);
        if (!divisor) continue;
        for (const sign of [-1, 1])
          yield candidate(
            n,
            centered.map((v) => (sign * v) / divisor),
            "steps",
            {
              steps: {
                origin: n - shift,
                width,
                base: (-sign * meanNumerator) / divisor,
                jump: (sign * total) / divisor,
              },
            },
          );
      }
  }
  const active = [
    ranges(),
    windows(),
    mirrors(),
    periodic(),
    exceptions("add"),
    exceptions("multiply"),
    steps(),
  ];
  while (active.length)
    for (let i = 0; i < active.length;) {
      const next = active[i].next();
      if (next.done) active.splice(i, 1);
      else {
        yield next.value;
        i++;
      }
    }
}
