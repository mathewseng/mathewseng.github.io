/** Close the checker inventory using tray evidence and a learned tall-stack correction. */
const home = (point, side) => side ? point >= 18 : point < 6;

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
      const members = reading.checkers.filter(other => other.zone === point && other.color === color);
      const direction = point <= 12 ? 1 : -1;
      return members.some(({ center: [mx, my] }) =>
        Math.abs(x - mx) <= 9 && direction * (y - my) >= 14 && direction * (y - my) <= 35);
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
