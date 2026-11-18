import { PATTERNS } from './fingerings.mjs';
import { isEligibleFingering, keyPitch } from './key-rules.mjs?v=20261117-ranking';

export const SHARPS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const FLATS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
export const KEYS = [
  ['K1', 'Left index', 'Main key', 'B → A when you add K3. K1 alone gives B.'],
  ['K2', 'Left index', 'Bis B♭', 'Touch with K1 for B♭ instead of B; roll your index onto both.'],
  ['K3', 'Left middle', 'Main key', 'K3 alone gives upper C. Add it to K1 for A.'],
  ['K4', 'Left ring', 'Main key', 'Add to the K1 + K3 A fingering for G.'],
  ['K5', 'Left pinky', 'Raise key', 'Add to the main G fingering for G♯, or low C for C♯.'],
  ['K6', 'Left pinky', 'Lower key', 'Add to the main G fingering for F♯. Both left pinky keys can be touched together.'],
  ['K7', 'Right index', 'Side raise key', 'Add to the main G fingering for G♯. On its own, it gives upper D.'],
  ['K8', 'Right index', 'Main key', 'Add to the main G fingering for F. On its own, it gives upper C.'],
  ['K9', 'Right middle', 'Main key', 'Add to the main F fingering for E; add to G for F♯.'],
  ['K10', 'Right ring', 'Main key', 'Add to the main E fingering for D.'],
  ['K11', 'Right pinky', 'Raise key', 'Add to the main D fingering for E♭, or G for G♯.'],
  ['K12', 'Right pinky', 'Lower key', 'Add to the main G fingering for F♯. Low B with K12 + K13 gives B♭.'],
  ['K13', 'Right pinky', 'Low extension', 'Add to the main D fingering for low C. Add K6 as well for low B.'],
].map(([id, finger, name, detail]) => ({ id, finger, name, detail }));

// The main chromatic set follows Akai's standard EWI chart, with high C/C#.
const MAIN = ['0010000000000', '0000000000000', '1011000111000', '1011000111100',
  '1011000110000', '1011000100000', '1011000010000', '1011000000000',
  '1011001000000', '1010000000000', '0011000000000', '1000000000000'];
export const FINGERINGS = PATTERNS.flatMap((patterns, i) => patterns.map((bits, index) => ({
  id: `${i + 58}-${index}`, base: i + 58, bits, main: bits === MAIN[(i + 58) % 12],
})));

export function noteName(midi, flats = false) {
  return `${(flats ? FLATS : SHARPS)[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
export function registerName(shift) { return shift > 0 ? `+${shift}` : String(shift); }
export function supportsMidi(midi) { return Number.isInteger(midi) && midi >= 34 && midi <= 111; }
export function candidates(midi, chartBits) {
  if (!supportsMidi(midi)) return [];
  const choices = FINGERINGS.filter(f => isEligibleFingering(f.bits) && (midi - f.base) % 12 === 0).map(f => ({ ...f, shift: (midi - f.base) / 12 }))
    .filter(f => f.shift >= -2 && f.shift <= 4)
    .sort((a, b) => Number(b.main) - Number(a.main) || Math.abs(a.shift) - Math.abs(b.shift) || a.id.localeCompare(b.id));
  if (!/^[01]{13}$/.test(chartBits) || !isEligibleFingering(chartBits) || choices.some(f => f.bits === chartBits)) return choices;
  const base = keyPitch(chartBits).midi;
  const shift = (midi - base) / 12;
  if (Number.isInteger(shift) && shift >= -2 && shift <= 4) {
    choices.push({ id: `chart-${chartBits}`, base, bits: chartBits, shift, main: false, fromChart: true });
  }
  return choices;
}
export function changes(a, b) {
  const touch = [], release = [], keep = [];
  KEYS.forEach((key, i) => {
    if (a.bits[i] !== b.bits[i]) (b.bits[i] === '1' ? touch : release).push(key.id);
    else if (b.bits[i] === '1') keep.push(key.id);
  });
  return { touch, release, keep, keys: touch.length + release.length, rollers: Math.abs(b.shift - a.shift), direction: Math.sign(b.shift - a.shift) };
}
export const DEFAULT_WEIGHTS = { roller: 4, pinky: 1, unfamiliar: 0.25 };
export function transitionCost(a, b, weights = DEFAULT_WEIGHTS) {
  const diff = changes(a, b);
  const pinkies = [4, 5, 10, 11, 12].filter(i => a.bits[i] !== b.bits[i]).length;
  return diff.keys + diff.rollers * weights.roller + pinkies * weights.pinky;
}
export function preferenceCost(f, weights = DEFAULT_WEIGHTS) { return f.main ? 0 : weights.unfamiliar; }

// Dynamic programming: minimize the complete phrase, not a greedy next-note choice.
// A lock pins a chosen fingering by ID at a given phrase index.
export function optimize(melody, weights = DEFAULT_WEIGHTS, locks = {}, chartChoices = {}) {
  if (!melody.length) return { path: [], cost: 0 };
  const sets = melody.map((midi, i) => candidates(midi, chartChoices[i]).filter(f => !locks[i] || locks[i] === f.id));
  if (sets.some(s => !s.length)) return null;
  const layers = [sets[0].map(f => ({ cost: preferenceCost(f, weights), previous: -1 }))];
  for (let i = 1; i < sets.length; i++) {
    layers.push(sets[i].map(to => {
      let best = { cost: Infinity, previous: -1 };
      sets[i - 1].forEach((from, j) => {
        const cost = layers[i - 1][j].cost + transitionCost(from, to, weights) + preferenceCost(to, weights);
        if (cost < best.cost) best = { cost, previous: j };
      });
      return best;
    }));
  }
  const last = layers.at(-1);
  let index = last.reduce((best, item, i) => item.cost < last[best].cost ? i : best, 0);
  const cost = last[index].cost, path = [];
  for (let i = sets.length - 1; i >= 0; i--) {
    path.unshift(sets[i][index]); index = layers[i][index].previous;
  }
  return { path, cost };
}
export function routeCost(path, weights = DEFAULT_WEIGHTS) {
  return path.reduce((sum, f, i) => sum + preferenceCost(f, weights) + (i ? transitionCost(path[i - 1], f, weights) : 0), 0);
}
export function parseMelody(input) {
  const tokens = input.trim().split(/[\s,;|]+/).filter(Boolean);
  if (!tokens.length) throw new Error('Enter at least two notes, for example B4 C5 D5.');
  if (tokens.length > 64) throw new Error('Use up to 64 notes per phrase.');
  const pitch = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return tokens.map(token => {
    const match = /^([A-Ga-g])([#♯b♭]?)(-?\d)$/.exec(token);
    if (!match) throw new Error(`“${token}” needs a note and octave, such as F#4 or Bb3.`);
    const midi = (Number(match[3]) + 1) * 12 + pitch[match[1].toUpperCase()] + (['#', '♯'].includes(match[2]) ? 1 : ['b', '♭'].includes(match[2]) ? -1 : 0);
    if (!candidates(midi).length) throw new Error(`“${token}” is outside this chart's supported register range (B♭1–E♭8, MIDI 34–111).`);
    return midi;
  });
}
