/** Close the checker inventory using tray evidence and a learned tall-stack correction. */
const home = (point, side) => side ? point >= 18 : point < 6;

function adjoiningStackMember(reading, point, color, x, y) {
  const direction = point <= 12 ? 1 : -1;
  const aligned = reading.checkers.filter(({ zone, color: side, center: [cx] }) =>
    zone === point && side === color && Math.abs(x - cx) <= 9);
  const ordered = aligned.map(({ center: [, cy] }) => direction * cy).sort((a, b) => b - a);
  const at = direction * y;
  if (ordered.some(center => at - center >= 14 && at - center <= 35)) return true;
  const count = reading.points[point - 1][Number(color === 'dark')];
  if (count < 6) return false;
  // Estimate pitch from the centers already assigned to this point. The inner
  // checker can fall past the fixed 35 px rule when the warped discs are wider.
  const gaps = ordered.slice(1).map((center, i) => ordered[i] - center)
    .filter(gap => gap >= 14 && gap <= 40).sort((a, b) => a - b);
  const pitch = gaps[Math.floor(gaps.length / 2)];
  return gaps.length >= 2 && Math.abs(at - ordered[0] - pitch) <= 7;
}

export function observedBoard(reading, previousOff = [0, 0]) {
  if (reading?.position) return reading.position;
  if (reading?.checkerStatus !== 'partial' || reading.handRegions?.length ||
      reading.occludedPoints?.length || !reading.points || !reading.bar) return null;

  // A long stack can cross the detector's neutral band. Its end checker may
  // have both a loose detection and a learned count at the correct point.
  const corrections = (reading.stackReadings ?? []).map(entry => ({ ...entry }));
  for (const checker of reading.checkers.filter(({ zone }) => zone === 'loose')) {
    const [x, y] = checker.center;
    const stack = corrections.find(({ point, color, added, confidence }) => {
      if (!added || confidence < .9 || color !== checker.color) return false;
      return adjoiningStackMember(reading, point, color, x, y);
    });
    if (!stack) return null;
    stack.added--;
  }

  const { points, bar } = reading;
  if (points.some(([white, dark]) => white && dark)) return null;
  const borneOff = bar.map((count, side) => 15 - count - points.reduce((sum, point) => sum + point[side], 0));
  for (const [side, off] of borneOff.entries()) {
    if (off < previousOff[side] || off >= 15) return null;
    if (off === 0 || (off > 0 && off === previousOff[side])) continue;
    if (!reading.trayEvidence?.[side] || bar[side] || points.some((point, i) => point[side] && !home(i, side))) return null;
  }
  return { points, bar, borneOff };
}
