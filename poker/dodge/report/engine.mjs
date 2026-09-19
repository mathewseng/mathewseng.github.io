export const RANKS = "AKQJT98765432";
export const SUITS = "shdc";
export const SYMBOLS = ["♠", "♥", "♦", "♣"];
export const CATEGORIES = [
  "Straight",
  "Flush",
  "Full house",
  "Four of a kind",
  "Straight flush",
  "Royal flush",
];
export const COLORS = [
  "#45c7aa",
  "#5b9fea",
  "#eeac61",
  "#de7797",
  "#a294ed",
  "#e4d875",
];
export const PAIRINGS = [
  "Unpaired",
  "One pair",
  "Two pair",
  "Three of a kind",
  "Four of a kind",
];
export const SUIT_LABELS = {
  4: "Monotone",
  31: "Three to a suit",
  22: "Double suited",
  211: "Single suited",
  1111: "Rainbow",
};
export const MAX_DRAWS = 13;
export const cardName = (c) => RANKS[Math.floor(c / 4)] + SUITS[c % 4];
export const handName = (cards) => cards.map(cardName).join(" ");
export function canonicalize(cards) {
  const masks = [0, 0, 0, 0],
    counts = [0, 0, 0, 0];
  cards.forEach((c) => {
    masks[c % 4] |= 1 << (12 - Math.floor(c / 4));
    counts[c % 4]++;
  });
  const order = [0, 1, 2, 3].sort(
    (a, b) => counts[b] - counts[a] || masks[b] - masks[a],
  );
  return cards
    .map((c) => Math.floor(c / 4) * 4 + order.indexOf(c % 4))
    .sort((a, b) => a - b);
}
export function parseCards(text) {
  const normalized = text
    .replace(/10/g, "T")
    .replace(/♠/g, "s")
    .replace(/♥/g, "h")
    .replace(/♦/g, "d")
    .replace(/♣/g, "c")
    .replace(/[\s,]/g, "");
  if (!/^(?:[AKQJT2-9][shdc])+$/i.test(normalized)) return null;
  const cards = normalized
    .match(/.{2}/g)
    .map(
      (c) =>
        RANKS.indexOf(c[0].toUpperCase()) * 4 +
        SUITS.indexOf(c[1].toLowerCase()),
    );
  return new Set(cards).size === cards.length ? cards : null;
}
function straightHigh(mask) {
  for (let top = 12; top >= 4; top--)
    if ((mask & (31 << (top - 4))) === 31 << (top - 4)) return top + 2;
  return (mask & 0x100f) === 0x100f ? 5 : 0;
}
export function bustCategory(cards) {
  if (cards.length < 5) return -1;
  const ranks = Array(13).fill(0),
    suits = Array(4).fill(0),
    masks = Array(4).fill(0);
  let mask = 0;
  for (const c of cards) {
    const r = Math.floor(c / 4),
      b = 1 << (12 - r);
    ranks[r]++;
    suits[c % 4]++;
    masks[c % 4] |= b;
    mask |= b;
  }
  let sf = 0;
  masks.forEach((m, s) => {
    if (suits[s] >= 5) sf = Math.max(sf, straightHigh(m));
  });
  if (sf) return sf === 14 ? 5 : 4;
  if (ranks.includes(4)) return 3;
  if (ranks.some((c) => c >= 3) && ranks.filter((c) => c >= 2).length >= 2)
    return 2;
  if (suits.some((c) => c >= 5)) return 1;
  return straightHigh(mask) ? 0 : -1;
}
export function nextCards(cards) {
  const held = new Set(cards);
  return Array.from({ length: 52 }, (_, c) => ({
    card: c,
    held: held.has(c),
    category: held.has(c) ? -2 : bustCategory([...cards, c]),
  }));
}
export function texture(cards) {
  const ranks = Array(13).fill(0),
    suits = Array(4).fill(0);
  cards.forEach((c) => {
    ranks[Math.floor(c / 4)]++;
    suits[c % 4]++;
  });
  const pattern = ranks
    .filter(Boolean)
    .sort((a, b) => b - a)
    .join("");
  const pairing = {
    1111: "Unpaired",
    211: "One pair",
    22: "Two pair",
    31: "Three of a kind",
    4: "Four of a kind",
  }[pattern];
  const suitPattern = suits
    .filter(Boolean)
    .sort((a, b) => b - a)
    .join("");
  // The maximum number of distinct starting ranks inside any valid straight window.
  const mask = ranks.reduce((m, n, r) => (n ? m | (1 << (12 - r)) : m), 0);
  const bitCount = (x) => x.toString(2).replace(/0/g, "").length;
  let connectivity = bitCount(mask & 0x100f);
  for (let top = 4; top < 13; top++)
    connectivity = Math.max(connectivity, bitCount(mask & (31 << (top - 4))));
  return {
    pairing,
    suitPattern,
    suitedness: SUIT_LABELS[suitPattern],
    highCard: RANKS[Math.floor(cards[0] / 4)],
    connectivity,
  };
}
export function quantile(hist, q) {
  let cumulative = 0;
  for (let i = 0; i < hist.length; i++) {
    cumulative += hist[i];
    if (cumulative + 1e-12 >= q) return i + 1;
  }
  return hist.length;
}
export function summarize(hist, categories) {
  const mean = hist.reduce((s, p, i) => s + p * (i + 1), 0);
  const variance = Math.max(
    0,
    hist.reduce((s, p, i) => s + p * (i + 1 - mean) ** 2, 0),
  );
  let cumulative = 0;
  const survival = [
    1,
    ...hist.map((p) => {
      cumulative += p;
      return Math.max(0, 1 - cumulative);
    }),
  ];
  const hazard = hist.map((p, i) =>
    survival[i] > 1e-12 ? p / survival[i] : null,
  );
  return {
    hist,
    categories,
    mean,
    variance,
    sd: Math.sqrt(variance),
    median: quantile(hist, 0.5),
    p10: quantile(hist, 0.1),
    p90: quantile(hist, 0.9),
    mode: hist.indexOf(Math.max(...hist)) + 1,
    survival,
    hazard,
    safeDraws: mean - 1,
    totalCards: mean + 4,
    survive3: survival[3],
    survive5: survival[5],
    survive8: survival[8],
  };
}
export function decodeData(data) {
  if (
    data.schemaVersion !== 1 ||
    data.classCount !== 16432 ||
    data.hands.length !== 16432 ||
    data.trialsPerHand < 2
  )
    throw new Error("Unsupported or incomplete Dodge dataset.");
  return data.hands.map((raw, id) => {
    const [cards, combinations, exact1, exact2, joint] = raw;
    if (
      joint.length !== 78 ||
      joint.reduce((a, b) => a + b, 0) !== data.trialsPerHand
    )
      throw new Error(`Invalid simulation counts for hand ${id}.`);
    const hist = Array(13).fill(0),
      categories = Array(6).fill(0);
    joint.forEach((n, i) => {
      hist[Math.floor(i / 6)] += n / data.trialsPerHand;
      categories[i % 6] += n / data.trialsPerHand;
    });
    const stats = summarize(hist, categories);
    return {
      id,
      cards,
      name: handName(cards),
      combinations,
      firstOuts: exact1,
      firstBust: exact1 / 48,
      bustBy2: exact2 / 1128,
      joint,
      trials: data.trialsPerHand,
      ...texture(cards),
      ...stats,
      meanSE: Math.sqrt(stats.variance / (data.trialsPerHand - 1)),
    };
  });
}
export function aggregate(rows, weighting = "deals") {
  if (!rows.length) return null;
  const hist = Array(13).fill(0),
    categories = Array(6).fill(0),
    joint = Array(78).fill(0);
  let weight = 0,
    combinations = 0,
    firstBust = 0,
    bustBy2 = 0,
    errorVariance = 0;
  for (const row of rows) {
    const w = weighting === "deals" ? row.combinations : 1;
    weight += w;
    combinations += row.combinations;
    firstBust += row.firstBust * w;
    bustBy2 += row.bustBy2 * w;
    errorVariance += row.meanSE ** 2 * w ** 2;
    row.hist.forEach((p, i) => {
      hist[i] += p * w;
    });
    row.categories.forEach((p, i) => {
      categories[i] += p * w;
    });
    row.joint.forEach((n, i) => {
      joint[i] += (n / row.trials) * w;
    });
  }
  return {
    ...summarize(
      hist.map((p) => p / weight),
      categories.map((p) => p / weight),
    ),
    joint: joint.map((p) => p / weight),
    firstBust: firstBust / weight,
    bustBy2: bustBy2 / weight,
    firstOuts: (firstBust / weight) * 48,
    meanSE: Math.sqrt(errorVariance) / weight,
    weight,
    combinations,
    count: rows.length,
  };
}
export function filterRows(rows, filters) {
  const query = (filters.search || "").trim();
  let exact = null,
    rankQuery = null,
    invalid = false;
  if (query) {
    const cards = parseCards(query);
    if (cards?.length === 4) exact = handName(canonicalize(cards));
    else {
      const rankText = query
        .toUpperCase()
        .replace(/10/g, "T")
        .replace(/[\s,]/g, "");
      if (/^[AKQJT2-9]{1,4}$/.test(rankText)) rankQuery = rankText;
      else invalid = true;
    }
  }
  return rows.filter((r) => {
    if (invalid || (exact && r.name !== exact)) return false;
    if (rankQuery) {
      let available = r.cards.map((c) => RANKS[Math.floor(c / 4)]).join("");
      for (const rank of rankQuery) {
        if (!available.includes(rank)) return false;
        available = available.replace(rank, "");
      }
    }
    if (filters.pairing && r.pairing !== filters.pairing) return false;
    if (filters.suits && r.suitPattern !== filters.suits) return false;
    if (filters.high && r.highCard !== filters.high) return false;
    if (filters.connected && r.connectivity !== Number(filters.connected))
      return false;
    if (filters.pinned && !filters.pinned.includes(r.id)) return false;
    for (const f of filters.numeric || []) {
      const value = metricValue(r, f.metric),
        bound = Number(f.value);
      if (!Number.isFinite(bound) || f.value === "") continue;
      if (
        (f.op === "gte" && value < bound) ||
        (f.op === "lte" && value > bound) ||
        (f.op === "eq" && Math.abs(value - bound) > 1e-9)
      )
        return false;
    }
    return true;
  });
}
export function metricValue(row, key) {
  return key.startsWith("cat")
    ? row.categories[Number(key.slice(3))] * 100
    : key.startsWith("survive")
      ? row[key] * 100
      : key === "firstBust" || key === "bustBy2"
        ? row[key] * 100
        : key === "meanSE"
          ? row.meanSE * 1.96
          : row[key];
}
export function wilson(p, n, z = 1.96) {
  const scale = 1 + (z * z) / n,
    center = (p + (z * z) / (2 * n)) / scale;
  const half =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / scale;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}
export function targetProbability(row, target) {
  // Win means completing target draws without busting: P(T > target), not P(T >= target).
  if (target === 1) return 1 - row.firstBust;
  if (target === 2) return 1 - row.bustBy2;
  return row.survival[target] || 0;
}
export function csvForRows(rows) {
  const columns = [
    "hand",
    "combinations",
    "trials",
    "pairing",
    "suit_pattern",
    "straight_window_ranks",
    "mean_draws",
    "mean_95ci_low",
    "mean_95ci_high",
    "mean_safe_draws",
    "mean_total_cards",
    "sd",
    "p10",
    "median",
    "p90",
    "mode",
    "first_bust_outs_exact",
    "first_bust_probability_exact",
    "bust_by_two_probability_exact",
    ...CATEGORIES.map(
      (c) => c.toLowerCase().replaceAll(" ", "_") + "_probability",
    ),
    ...Array.from(
      { length: 13 },
      (_, i) => `bust_on_draw_${i + 1}_probability`,
    ),
    ...Array.from({ length: 13 }, (_, i) => `survive_${i + 1}_probability_mc`),
    ...Array.from(
      { length: 13 },
      (_, i) => `hazard_draw_${i + 1}_probability_mc`,
    ),
  ];
  const lines = [columns.join(",")];
  rows.forEach((r) => {
    lines.push(
      [
        r.name,
        r.combinations,
        r.trials,
        r.pairing,
        r.suitPattern,
        r.connectivity,
        r.mean,
        Math.max(1, r.mean - 1.96 * r.meanSE),
        Math.min(13, r.mean + 1.96 * r.meanSE),
        r.safeDraws,
        r.totalCards,
        r.sd,
        r.p10,
        r.median,
        r.p90,
        r.mode,
        r.firstOuts,
        r.firstBust,
        r.bustBy2,
        ...r.categories,
        ...r.hist,
        ...r.survival.slice(1),
        ...r.hazard.map((p) => (p === null ? "" : p)),
      ].join(","),
    );
  });
  return lines.join("\n");
}
