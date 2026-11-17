// Nominal front-key locations measured from Akai EWI4000s Reference Manual,
// rev D, printed p.37 (PDF p.39). Coordinates are in the PDF's horizontal
// instrument drawing. One transform rotates every key into the upright view;
// heights use the same scale as the round-key diameter, not per-key UI sizing.
// The three lower pinky keys are physically adjustable: these are factory
// reference positions, not millimetre measurements of an individual unit.
export const KEY_ARTWORK = ['circle-key', 'left-index-key', 'circle-key', 'circle-key',
  'left-pinky-key-1', 'left-pinky-key-2', 'right-index-key', 'circle-key',
  'circle-key', 'circle-key', 'right-pinky-key-1', 'right-pinky-key-2', 'right-pinky-key-3'];
export const KEY_RATIOS = [1, 39 / 119, 1, 1, 75 / 175, 78 / 225, 75 / 175, 1, 1, 1, 63 / 161, 68 / 208, 86 / 275];
export const REFERENCE_KEYS = [
  [163.987, 152.681, 8.892], // K1, round
  [170.753, 152.683, 10.918], // K2, bis crescent directly below K1
  [177.929, 152.680, 8.892],
  [190.754, 152.680, 8.892],
  [199.709, 149.886, 16.228],
  [210.300, 148.044, 19.913],
  [229.000, 154.574, 11.651],
  [239.830, 152.680, 8.892],
  [252.654, 152.681, 8.892],
  [265.482, 153.788, 8.892], // K10 is slightly off the main axis
  [275.357, 156.006, 13.708],
  [282.482, 157.942, 17.514],
  [289.443, 159.795, 23.742],
];
export const REFERENCE_SCALE = 4.1;
export const INSTRUMENT_KEYS = REFERENCE_KEYS.map(([x, y, height], i) => ({
  x: 160 - (y - REFERENCE_KEYS[0][1]) * REFERENCE_SCALE,
  y: 190 + (x - REFERENCE_KEYS[0][0]) * REFERENCE_SCALE,
  height: height * REFERENCE_SCALE,
  width: height * REFERENCE_SCALE * KEY_RATIOS[i],
}));
// Numbered controls are outside the physical layout and deliberately larger.
export const KEY_CALLOUTS = [[50, 135], [270, 230], [50, 220], [50, 305], [270, 330], [270, 420],
  [50, 390], [270, 510], [50, 475], [50, 560], [50, 645], [270, 690], [50, 810]];
