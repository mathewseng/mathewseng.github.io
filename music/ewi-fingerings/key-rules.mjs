// Standard Ei mode. Fixed contributions are cross-checked against the Akai / OneWatt
// fingering set; conditional logic and the K5/K7 shared sensor are documented in
// Ingo Scherzinger, DynaSample EWI Basics (2020–2023), page 4.
export const KEY_RULES = [
  ['−2 / −3', 'Conditional', '−3 with K3 held and K2 clear; otherwise −2.', 'K3 changes its contribution when K1 changes.'],
  ['−1 / 0', 'Conditional', '0 when K1 and K3 are both held; otherwise −1.', 'The bis key is ignored with K1 + K3.'],
  ['−1 / −2', 'Conditional', '−2 with K1 held and K2 clear; otherwise −1.', 'K1 changes K3; K2 can offset part of the change.'],
  ['−2 / −3', 'Conditional', '−3 with K8 held; otherwise −2.', 'K8 contributes an extra −1 when K4 is held.'],
  ['+1 / 0', 'Linked', '0 when K7 is held; otherwise +1.', 'K5 and K7 share one raise input; together they add +1, not +2.'],
  ['−1', 'Fixed', 'Always −1.', 'Independent of the other note keys.'],
  ['+1 / 0', 'Linked', '0 when K5 is held; otherwise +1.', 'K7 and K5 share one raise input; together they add +1, not +2.'],
  ['−1 / −2', 'Conditional', '−2 with K4 held; otherwise −1.', 'The right index key changes its contribution with K4.'],
  ['−1', 'Fixed', 'Always −1.', 'Independent of the other note keys.'],
  ['−2', 'Fixed', 'Always −2.', 'Independent of the other note keys.'],
  ['+1', 'Fixed', 'Always +1.', 'Independent of the other note keys, including K5 + K7.'],
  ['−1', 'Fixed', 'Always −1.', 'Independent of the other note keys.'],
  ['−2', 'Fixed', 'Always −2.', 'Independent of the other note keys.'],
].map(([effect, kind, condition, why]) => ({ effect, kind, condition, why }));

export function keyPitch(bits, register = 0) {
  if (!/^[01]{13}$/.test(bits)) throw new Error('A fingering needs 13 touch states.');
  if (!Number.isInteger(register) || register < -2 || register > 4) throw new Error('Choose register −2 through +4.');
  const k = [...bits].map(Number);
  // No front keys = C#5 in the chart register. K1 and K4 are fixed
  // contributions, but toggling them also changes K3 / K8 respectively.
  const contributions = [
    -2 * k[0], (k[0] && k[2]) ? 0 : -k[1], -(k[0] ? 2 : 1) * k[2],
    -2 * k[3], k[4], -k[5], (!k[4] && k[6]) ? 1 : 0,
    -(k[3] ? 2 : 1) * k[7], -k[8], -2 * k[9], k[10], -k[11], -2 * k[12],
  ];
  return { midi: 73 + contributions.reduce((sum, n) => sum + n, 0) + register * 12, contributions };
}
export function toggleKey(bits, index) {
  if (!/^[01]{13}$/.test(bits) || !Number.isInteger(index) || index < 0 || index > 12) throw new Error('Choose a note key K1–K13.');
  return bits.slice(0, index) + (bits[index] === '1' ? '0' : '1') + bits.slice(index + 1);
}
export function keyEffect(bits, index, register = 0) {
  const off = bits.slice(0, index) + '0' + bits.slice(index + 1);
  const on = bits.slice(0, index) + '1' + bits.slice(index + 1);
  const from = keyPitch(off, register).midi, to = keyPitch(on, register).midi;
  return { from, to, delta: to - from };
}
export function signedSteps(value) { return value < 0 ? `−${-value}` : value > 0 ? `+${value}` : '0'; }
