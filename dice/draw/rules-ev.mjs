import { settings, PAYTABLE, drawOutcomes, scoreHand, settlement } from './engine.mjs';

// Settlement mode and doubling are compared together. Ignore inactive fields.
export function rulesEVKey(input) {
  const c = settings(input);
  return JSON.stringify([c.n, c.scoring, c.scoring === 'cribbage' ? c.runs : null,
    c.scoring === 'poker' ? PAYTABLE.filter(row => row.minimum <= c.n).map(row => c.payouts[row.key]) : c.fee]);
}

// Average the optimal decision over every opening hand, with exact integer
// weights. Partial-hand expectations are shared across all opening hands.
export function rulesEV(input) {
  const config = settings(input), scale = 6 ** config.n;
  const modes = config.scoring === 'poker' ? ['paytable'] : ['capped', 'net'];
  const rules = modes.map(mode => ({ ...config, settlement: mode === 'paytable' ? 'capped' : mode }));
  const powers = [1, 8, 64, 512, 4096, 32768];
  const keyOf = dice => dice.reduce((key, face) => key + powers[face - 1], 0);
  const expectations = new Map();
  const openings = drawOutcomes(config.n).map(({ dice, weight }) => {
    const key = keyOf(dice), points = scoreHand(dice, config, false).points;
    expectations.set(key, rules.map(c => settlement(points, c).net * scale));
    const counts = Array(6).fill(0);
    dice.forEach(face => counts[face - 1]++);
    return { key, weight, counts };
  });
  function expected(key, held) {
    if (expectations.has(key)) return expectations.get(key);
    const totals = modes.map(() => 0);
    for (const increment of powers) {
      const next = expected(key + increment, held + 1);
      next.forEach((value, i) => { totals[i] += value; });
    }
    // Each remaining replacement contributes a factor of six. Using 6^N as
    // the common denominator keeps every intermediate value an integer.
    const values = totals.map(total => total / 6);
    expectations.set(key, values);
    return values;
  }
  const noDraw = expected(0, 0), single = modes.map(() => 0), doubled = modes.map(() => 0);
  for (const opening of openings) {
    const best = modes.map(() => -Infinity), bestDouble = modes.map(() => -Infinity);
    function visit(face, key, held) {
      if (face === 6) {
        const values = expected(key, held);
        values.forEach((value, i) => {
          best[i] = Math.max(best[i], value);
          // Keeping every die may never be doubled, even when profitable.
          bestDouble[i] = Math.max(bestDouble[i], value, held < config.n ? 2 * value : -Infinity);
        });
        return;
      }
      for (let count = 0; count <= opening.counts[face]; count++) visit(face + 1, key + count * powers[face], held + count);
    }
    visit(0, 0, 0);
    modes.forEach((_, i) => {
      single[i] += opening.weight * best[i];
      doubled[i] += opening.weight * bestDouble[i];
    });
  }
  // With at most seven dice and a maximum return of 1000, even the doubled
  // weighted total is below 2^53. All comparisons and numerators are exact.
  const denominator = scale * scale;
  return { key: rulesEVKey(config), openings: scale, profiles: modes.map((mode, i) => ({
    mode, oneRollEV: noDraw[i] / scale,
    singleEV: single[i] / denominator, doubleEV: doubled[i] / denominator,
    singleNumerator: single[i], doubleNumerator: doubled[i], denominator,
  })) };
}
