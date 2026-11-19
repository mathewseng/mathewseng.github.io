/** Choose between several legal results using paired stationary camera evidence. */
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
