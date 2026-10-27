// Draw Dice uses independent fair d6 rolls, one optional draw, and practice units.
export const SCORING = { cribbage: 'Dice cribbage', poker: 'Dice poker', yahtzee: 'Yahtzee-style' };
export const PAYTABLE = [
  { key: 'pair', label: 'Pair', minimum: 2, value: 1 },
  { key: 'two-pair', label: 'Two pair', minimum: 4, value: 2 },
  { key: 'kind-3', label: 'Three of a kind', minimum: 3, value: 3 },
  { key: 'house', label: 'Full house', minimum: 5, value: 5 },
  ...[4, 5, 6, 7].map((n, i) => ({ key: `kind-${n}`, label: `${n} of a kind`, minimum: n, value: [8, 20, 50, 100][i] })),
  ...[3, 4, 5, 6].map((n, i) => ({ key: `run-${n}`, label: `${n}-long straight`, minimum: n, value: [2, 4, 8, 16][i] })),
];
export function settings(input = {}) {
  const config = {
    n: 5, scoring: 'cribbage', settlement: 'capped', fee: 10,
    doubling: false, runs: 'longest', payouts: {}, ...input,
  };
  if (!Number.isInteger(config.n) || config.n < 2 || config.n > 7) throw new RangeError('Choose 2 through 7 dice.');
  if (!Object.hasOwn(SCORING, config.scoring)) throw new RangeError('Choose a scoring system.');
  if (!['capped', 'net'].includes(config.settlement)) throw new RangeError('Choose a payout mode.');
  if (!['longest', 'all'].includes(config.runs)) throw new RangeError('Choose a run rule.');
  if (!Number.isInteger(config.fee) || config.fee < 0 || config.fee > 200) throw new RangeError('Fee must be a whole number from 0 to 200.');
  if (typeof config.doubling !== 'boolean') throw new RangeError('Doubling must be on or off.');
  config.payouts = Object.fromEntries(PAYTABLE.map(row => {
    const value = config.payouts?.[row.key] ?? row.value;
    if (!Number.isInteger(value) || value < 0 || value > 1000) throw new RangeError('Returns must be whole numbers from 0 to 1,000.');
    return [row.key, value];
  }));
  return config;
}
export function validateDice(dice, n = dice.length) {
  if (!Array.isArray(dice) || dice.length !== n || n < 2 || n > 7 || dice.some(x => !Number.isInteger(x) || x < 1 || x > 6))
    throw new RangeError('A hand must contain 2–7 six-sided dice.');
}
const sum = values => values.reduce((a, b) => a + b, 0);
function frequencies(dice) {
  const counts = Array(7).fill(0);
  for (const face of dice) counts[face]++;
  return counts;
}
function runsIn(counts) {
  const runs = [];
  for (let start = 1; start <= 4; start++) {
    let combinations = 1;
    for (let end = start; end <= 6 && counts[end]; end++) {
      combinations *= counts[end];
      if (end - start >= 2) runs.push({ start, end, length: end - start + 1, combinations });
    }
  }
  return runs;
}
export function cribbageScore(dice, runRule = 'longest', detail = true) {
  validateDice(dice);
  const counts = frequencies(dice), pairs = [], sixes = [];
  let pairPoints = 0, sixPoints = 0;
  for (let face = 1; face <= 6; face++) {
    const points = counts[face] * (counts[face] - 1) / 2;
    pairPoints += points;
    if (points && detail) pairs.push({ label: `${counts[face]} × ${face}: ${points} ${points === 1 ? 'pair' : 'pairs'}`, points });
  }
  // Each bit mask chooses physical dice, so repeated values remain distinct.
  for (let mask = 1; mask < 2 ** dice.length; mask++) {
    let total = 0;
    for (let i = 0; i < dice.length; i++) if (mask & (1 << i)) total += dice[i];
    if (total !== 6) continue;
    sixPoints++;
    if (detail) sixes.push({ label: dice.filter((_, i) => mask & (1 << i)).sort((a, b) => a - b).join(' + '), points: 1 });
  }
  let runs = runsIn(counts);
  if (runRule === 'longest' && runs.length) {
    const longest = Math.max(...runs.map(run => run.length));
    runs = runs.filter(run => run.length === longest);
  }
  const runPoints = sum(runs.map(run => run.length * run.combinations));
  return {
    points: pairPoints + sixPoints + runPoints,
    groups: [
      { label: 'Pairs', points: pairPoints, items: pairs },
      { label: 'Sums of six', points: sixPoints, items: sixes },
      { label: runRule === 'longest' ? 'Longest runs' : 'All runs', points: runPoints,
        items: detail ? runs.map(run => ({ label: `${Array.from({ length: run.length }, (_, i) => run.start + i).join('–')} × ${run.combinations}`, points: run.length * run.combinations })) : [] },
    ],
  };
}
function categories(dice) {
  const counts = frequencies(dice), groups = counts.filter(Boolean).sort((a, b) => b - a);
  const straight = Math.max(0, ...runsIn(counts).map(run => run.length));
  const keys = [];
  if (groups[0] >= 2) keys.push('pair');
  if (groups[1] >= 2) keys.push('two-pair');
  if (groups[0] >= 3 && groups[1] >= 2) keys.push('house');
  for (let n = 3; n <= groups[0]; n++) keys.push(`kind-${n}`);
  for (let n = 3; n <= straight; n++) keys.push(`run-${n}`);
  return keys;
}
export function scoreHand(dice, config, detail = true) {
  validateDice(dice, config.n);
  if (config.scoring === 'cribbage') return cribbageScore(dice, config.runs, detail);
  const eligible = categories(dice);
  let awards;
  if (config.scoring === 'poker') {
    awards = PAYTABLE.filter(row => eligible.includes(row.key)).map(row => ({ label: row.label, points: config.payouts[row.key] }));
    awards.push({ label: 'No paying category', points: 0 });
  } else {
    const total = sum(dice);
    awards = [{ label: 'Chance · sum of all dice', points: total }];
    const values = { 'kind-3': total, 'kind-4': total, house: 25, 'run-3': 20, 'run-4': 30, 'run-5': 40, 'run-6': 50, 'kind-5': 50, 'kind-6': 75, 'kind-7': 100 };
    awards.push(...PAYTABLE.filter(row => eligible.includes(row.key) && Object.hasOwn(values, row.key)).map(row => ({ label: row.label, points: values[row.key] })));
  }
  awards.sort((a, b) => b.points - a.points);
  return { points: awards[0].points, category: awards[0].label, groups: [{ label: 'Best category', points: awards[0].points, items: detail ? [awards[0]] : [] }] };
}
export function settlement(points, config, multiplier = 1) {
  if (![1, 2].includes(multiplier) || (multiplier === 2 && !config.doubling)) throw new RangeError('Doubling is unavailable.');
  const base = config.scoring === 'poker' ? points - 1
    : config.settlement === 'net' ? points - config.fee : Math.max(0, points - config.fee) - 1;
  return { net: base * multiplier, multiplier, points };
}
export function randomFace(randomUint32 = () => crypto.getRandomValues(new Uint32Array(1))[0]) {
  let value;
  do {
    value = randomUint32();
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError('Invalid random source.');
  } while (value >= 4294967292);
  return value % 6 + 1;
}
export function newRound(config, randomUint32) {
  const rules = settings(config);
  return { config: rules, dice: Array.from({ length: rules.n }, () => randomFace(randomUint32)), held: Array(rules.n).fill(false), phase: 'hold', result: null };
}
export function finishRound(round, { stand = false, double = false, randomUint32 } = {}) {
  if (round.phase !== 'hold') throw new Error('This hand is already settled.');
  if (double && (!round.config.doubling || stand || round.held.every(Boolean))) throw new Error('Double only when rerolling at least one die.');
  const dice = round.dice.map((face, i) => stand || round.held[i] ? face : randomFace(randomUint32));
  const score = scoreHand(dice, round.config);
  const decision = {
    dice: [...round.dice],
    mask: stand ? 2 ** round.dice.length - 1 : round.held.reduce((mask, held, i) => mask | (held ? 1 << i : 0), 0),
    multiplier: double ? 2 : 1,
  };
  return { ...round, dice, decision, phase: 'settled', result: { ...settlement(score.points, round.config, decision.multiplier), score } };
}

const factorial = [1, 1, 2, 6, 24, 120, 720, 5040], drawCache = new Map();
export function drawOutcomes(n) {
  if (drawCache.has(n)) return drawCache.get(n);
  const result = [];
  function visit(face, remaining, dice, divisor) {
    if (face === 6) {
      result.push({ dice: [...dice, ...Array(remaining).fill(6)], weight: factorial[n] / (divisor * factorial[remaining]) });
      return;
    }
    for (let count = 0; count <= remaining; count++) visit(face + 1, remaining - count, [...dice, ...Array(count).fill(face)], divisor * factorial[count]);
  }
  visit(1, n, [], 1);
  drawCache.set(n, result);
  return result;
}
// Exhaust every hold and every possible replacement roll. Permutations with
// equal faces share a weighted outcome; this is exact enumeration, not sampling.
export function solveHand(dice, input) {
  const config = settings(input);
  validateDice(dice, config.n);
  const scores = new Map(), holds = new Map(), decisions = [];
  const getNet = hand => {
    const key = [...hand].sort().join('');
    if (!scores.has(key)) scores.set(key, settlement(scoreHand(hand, config, false).points, config).net);
    return scores.get(key);
  };
  for (let mask = 0; mask < 2 ** dice.length; mask++) {
    const kept = dice.filter((_, i) => mask & (1 << i)), key = [...kept].sort().join('');
    let ev = holds.get(key);
    if (ev === undefined) {
      const count = dice.length - kept.length;
      ev = sum(drawOutcomes(count).map(draw => draw.weight * getNet([...kept, ...draw.dice]))) / 6 ** count;
      holds.set(key, ev);
    }
    decisions.push({ mask, multiplier: 1, ev });
    if (config.doubling && kept.length < dice.length) decisions.push({ mask, multiplier: 2, ev: ev * 2 });
  }
  decisions.sort((a, b) => b.ev - a.ev || a.multiplier - b.multiplier || b.mask.toString(2).replaceAll('0', '').length - a.mask.toString(2).replaceAll('0', '').length || a.mask - b.mask);
  return { best: decisions[0], decisions };
}
