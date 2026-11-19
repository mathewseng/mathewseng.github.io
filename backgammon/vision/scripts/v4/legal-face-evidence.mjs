/** Choose between several legal results using paired stationary camera evidence. */
const pairs = Array.from({ length: 6 }, (_, low) =>
  Array.from({ length: 6 - low }, (_, high) => [low + 1, low + high + 1])).flat();

export function dicePairsIncluding(faces) {
  const known = faces.filter(Number.isInteger);
  return pairs.filter(pair => known.every((face, index) =>
    pair.filter(value => value === face).length >= known.slice(0, index + 1).filter(value => value === face).length));
}

export function rankLegalDice(pairs, observation) {
  const [left, right] = observation?.odds ?? [];
  const frames = observation?.frames ?? [];
  const validOdds = row => row?.length === 7 && row.every(value => Number.isFinite(value) && value >= 0 && value <= 1);
  if (!validOdds(left) || !validOdds(right) || frames.length < 4 ||
      !frames.every((frame, i) => Number.isInteger(frame) && (!i || frame - frames[i - 1] >= 6))) return [];

  return pairs.map(dice => {
    const [a, b] = dice;
    const direct = left[a] * right[b];
    const swapped = a === b ? 0 : left[b] * right[a];
    // The dice are unordered. Add the two mutually exclusive assignments
    // for unlike faces. A double has only one assignment.
    const support = direct >= swapped ? Math.min(left[a], right[b]) : Math.min(left[b], right[a]);
    return { dice, weight: direct + swapped, support };
  }).sort((a, b) => b.weight - a.weight);
}

export function chooseLegalDice(pairs, observation) {
  const [best, alternative] = rankLegalDice(pairs, observation);
  if (best && alternative && best.support >= .15 &&
      best.weight >= 6 * alternative.weight && best.weight > 0) return best.dice;
  return null;
}
