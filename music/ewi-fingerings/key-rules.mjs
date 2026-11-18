// Standard Ei mode. Fixed contributions are cross-checked against the Akai / OneWatt
// fingering set; conditional logic and the K5/K7 shared sensor are documented in
// Ingo Scherzinger, DynaSample EWI Basics (2020–2023), page 4.
export const KEY_RULES = [
  [-2, 'Fixed', 'None.', []],
  [-1, 'Conditional', 'K2 works by itself. Holding K1 and K3 together cancels K2.', ['K1+K3: 0']],
  [-1, 'Conditional', 'Contributes −2 when K1 is held.', ['K1: −2']],
  [-2, 'Fixed', 'None.', []],
  [1, 'Fixed', 'None.', []],
  [-1, 'Fixed', 'None; independent of the other note keys.', []],
  [1, 'Linked', 'Contributes 0 when K5 is held. The pair shares one +1 raise.', ['K5: 0']],
  [-1, 'Conditional', 'Contributes −2 when K4 is held.', ['K4: −2']],
  [-1, 'Fixed', 'None; independent of the other note keys.', []],
  [-2, 'Fixed', 'None; independent of the other note keys.', []],
  [1, 'Fixed', 'None; independent of the other note keys, including K5 and K7.', []],
  [-1, 'Fixed', 'None; independent of the other note keys.', []],
  [-2, 'Fixed', 'None; independent of the other note keys.', []],
].map(([usual, kind, exceptions, badges]) => ({
  usual, kind, exceptions, badges,
  color: usual > 0 ? 'up-one' : usual === -1 ? 'down-one' : 'down-two',
  usualText: `${usual > 0 ? 'Raises' : 'Lowers'} ${Math.abs(usual)} semitone${Math.abs(usual) === 1 ? ' (half step)' : 's (whole step)'}.`,
}));

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
// Ranked fingering suggestions use bis with K1 as a playing preference.
export function isEligibleFingering(bits) {
  return bits[1] !== '1' || (bits[0] === '1' && bits[2] !== '1');
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
