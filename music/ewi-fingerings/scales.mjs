import { noteName } from './engine.mjs?v=20261118-layout';

// Semitone offsets within the starting octave. The closing tonic is added separately.
export const SCALE_GROUPS = [
  ['Common', [
    ['Major (Ionian)', [0, 2, 4, 5, 7, 9, 11]],
    ['Natural minor (Aeolian)', [0, 2, 3, 5, 7, 8, 10]],
    ['Harmonic minor', [0, 2, 3, 5, 7, 8, 11]],
    ['Melodic minor', [0, 2, 3, 5, 7, 9, 11]],
    ['Major pentatonic', [0, 2, 4, 7, 9]],
    ['Minor pentatonic', [0, 3, 5, 7, 10]],
    ['Major blues', [0, 2, 3, 4, 7, 9]],
    ['Minor blues', [0, 3, 5, 6, 7, 10]],
    ['Chromatic', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
  ]],
  ['Modes', [
    ['Dorian', [0, 2, 3, 5, 7, 9, 10]],
    ['Phrygian', [0, 1, 3, 5, 7, 8, 10]],
    ['Lydian', [0, 2, 4, 6, 7, 9, 11]],
    ['Mixolydian', [0, 2, 4, 5, 7, 9, 10]],
    ['Locrian', [0, 1, 3, 5, 6, 8, 10]],
    ['Phrygian dominant', [0, 1, 4, 5, 7, 8, 10]],
    ['Dorian ♭2', [0, 1, 3, 5, 7, 9, 10]],
    ['Lydian augmented', [0, 2, 4, 6, 8, 9, 11]],
    ['Lydian dominant', [0, 2, 4, 6, 7, 9, 10]],
    ['Mixolydian ♭6', [0, 2, 4, 5, 7, 8, 10]],
    ['Locrian ♮2', [0, 2, 3, 5, 6, 8, 10]],
    ['Altered', [0, 1, 3, 4, 6, 8, 10]],
  ]],
  ['Jazz', [
    ['Whole tone', [0, 2, 4, 6, 8, 10]],
    ['Whole–half diminished', [0, 2, 3, 5, 6, 8, 9, 11]],
    ['Half–whole diminished', [0, 1, 3, 4, 6, 7, 9, 10]],
    ['Augmented', [0, 3, 4, 7, 8, 11]],
    ['Dominant bebop', [0, 2, 4, 5, 7, 9, 10, 11]],
    ['Major bebop', [0, 2, 4, 5, 7, 8, 9, 11]],
    ['Minor bebop', [0, 2, 3, 5, 7, 8, 10, 11]],
  ]],
  ['More', [
    ['Harmonic major', [0, 2, 4, 5, 7, 8, 11]],
    ['Double harmonic major', [0, 1, 4, 5, 7, 8, 11]],
    ['Hungarian minor', [0, 2, 3, 6, 7, 8, 11]],
    ['Neapolitan major', [0, 1, 3, 5, 7, 9, 11]],
    ['Neapolitan minor', [0, 1, 3, 5, 7, 8, 11]],
    ['Hirajoshi', [0, 2, 3, 7, 8]],
    ['In sen', [0, 1, 5, 7, 10]],
    ['Iwato', [0, 1, 5, 6, 10]],
    ['Egyptian pentatonic', [0, 2, 5, 7, 10]],
    ['Prometheus', [0, 2, 4, 6, 9, 10]],
  ]],
];

export function scalePhrase(root, offsets, flats = true) {
  return [...offsets, 12].map(offset => noteName(60 + root + offset, flats)).join(' ');
}
