// Pure helpers shared by every dice table engine. No DOM: engines and their
// tests import this file directly in Node.

// A seeded generator for tests and replays; the table itself passes cryptoRng.
export function seededRng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cryptoRng() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] / 4294967296;
  }
  return Math.random();
}

export const rollDie = (rng) => 1 + Math.floor(rng() * 6);
export const rollDice = (count, rng) => Array.from({ length: count }, () => rollDie(rng));

// counts[f] = how many dice show face f (index 0 unused).
export function faceCounts(dice) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const face of dice) counts[face] += 1;
  return counts;
}

export const sum = (values) => values.reduce((total, value) => total + value, 0);

export function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function pick(rng, values) {
  return values[Math.floor(rng() * values.length)];
}

// P(X >= k) for X ~ Binomial(n, p).
export function binomialAtLeast(n, p, k) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let total = 0;
  let term = (1 - p) ** n; // P(X = 0)
  for (let x = 0; x <= n; x += 1) {
    if (x >= k) total += term;
    term = term * ((n - x) / (x + 1)) * (p / (1 - p));
  }
  return Math.min(1, Math.max(0, total));
}

// Every multiset of `count` dice as sorted face arrays with its probability.
const outcomeCache = new Map();
export function diceOutcomes(count) {
  if (outcomeCache.has(count)) return outcomeCache.get(count);
  const results = [];
  const factorial = (n) => (n <= 1 ? 1 : n * factorial(n - 1));
  const total = 6 ** count;
  const walk = (start, dice) => {
    if (dice.length === count) {
      const counts = faceCounts(dice);
      let ways = factorial(count);
      for (let face = 1; face <= 6; face += 1) ways /= factorial(counts[face]);
      results.push({ dice: dice.slice(), p: ways / total });
      return;
    }
    for (let face = start; face <= 6; face += 1) {
      dice.push(face);
      walk(face, dice);
      dice.pop();
    }
  };
  walk(1, []);
  outcomeCache.set(count, results);
  return results;
}

// Appends a log line. seat -1 is the table itself.
export function log(state, seat, text) {
  state.log = (state.log || []).concat({ seat, text });
  if (state.log.length > 120) state.log = state.log.slice(-120);
  return state;
}

// Probability pioneers seat the bots.
export const BOT_NAMES = ['Pascal', 'Fermat', 'Cardano', 'Huygens', 'Bernoulli', 'Laplace', 'Moivre', 'Galileo'];

export const LEVELS = [
  { value: 'easy', label: 'Easy' },
  { value: 'normal', label: 'Normal' },
  { value: 'hard', label: 'Hard' },
];

export function nextSeat(state, seat, alive = () => true) {
  for (let step = 1; step <= state.names.length; step += 1) {
    const candidate = (seat + step) % state.names.length;
    if (alive(candidate)) return candidate;
  }
  return seat;
}

export function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}
