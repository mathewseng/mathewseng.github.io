// Vector outlines and seams traced from the original transparent key images.
const artwork = {
  round: [99, 99, '<circle class="key-face" cx="49.5" cy="49.5" r="46"/><circle class="key-detail-line" cx="49.5" cy="49.5" r="29"/><circle class="key-detail-line" cx="49.5" cy="49.5" r="21"/>'],
  bis: [39, 119, '<path class="key-face" d="M2 18C-5 4 15-6 23 7C43 42 43 78 23 112C15 125-5 115 2 101C18 74 18 45 2 18Z"/>'],
  leftPinky1: [75, 175, '<path class="key-face" d="M1 30C-6 0 35-12 42 14L74 143C83 178 39 185 33 160Z"/><path class="key-detail-line" d="m7 55 41-11"/>'],
  leftPinky2: [78, 225, '<path class="key-face" d="M1 27C-3-5 40-9 42 22L45 71L77 195C85 230 43 236 36 206L4 77Z"/><path class="key-detail-line" d="m4 78 41-8"/>'],
  rightIndex: [75, 175, '<path class="key-face" d="M33 16C40-11 82-1 74 30L42 159C34 184-5 179 1 148Z"/><path class="key-detail-line" d="m2 147 46-12"/>'],
  rightPinky1: [63, 161, '<path class="key-face" d="M13 24C15-8 68-8 62 31L39 142C34 169-3 165 1 138Z"/><path class="key-detail-line" d="m9 69 43 8"/><circle class="key-detail-line" cx="37.5" cy="25" r="15"/>'],
  rightPinky2: [68, 208, '<path class="key-face" d="M18 24C21-9 72-7 67 31L40 187C35 217-3 212 1 184Z"/><path class="key-detail-line" d="m10 89 44 7"/><circle class="key-detail-line" cx="42.5" cy="25" r="15"/>'],
  rightPinky3: [86, 275, '<path class="key-face" d="M36 24C39-9 90-7 85 30L39 254C33 284-4 279 1 251Z"/><path class="key-detail-line" d="m26 90 46 8"/><circle class="key-detail-line" cx="60.5" cy="25" r="15"/>'],
};

export const KEY_ARTWORK = ['round', 'bis', 'round', 'round', 'leftPinky1', 'leftPinky2',
  'rightIndex', 'round', 'round', 'round', 'rightPinky1', 'rightPinky2', 'rightPinky3'];
export const KEY_RATIOS = KEY_ARTWORK.map(shape => artwork[shape][0] / artwork[shape][1]);
export const KEY_SYMBOLS = Object.entries(artwork).map(([shape, [width, height, paths]]) =>
  `<symbol id="ewi-key-${shape}" viewBox="0 0 ${width} ${height}" overflow="visible">${paths}</symbol>`
).join('');

// Akai EWI4000s Reference Manual, rev D, printed p.37. The drawing is horizontal.
// Apply the same upright transform and scale to every key. Pinky keys can be
// adjusted on the instrument; these are the nominal positions from the drawing.
const reference = [
  [163.987, 152.681, 8.892], [170.753, 152.683, 10.918], [177.929, 152.680, 8.892],
  [190.754, 152.680, 8.892], [199.709, 149.886, 16.228], [210.300, 148.044, 19.913],
  [229.000, 154.574, 11.651], [239.830, 152.680, 8.892], [252.654, 152.681, 8.892],
  [265.482, 153.788, 8.892], [275.357, 156.006, 13.708], [282.482, 157.942, 17.514],
  [289.443, 159.795, 23.742],
];
const scale = 2.75;
export const KEY_LAYOUT = reference.map(([length, offset, span]) => ({
  x: 165 - (offset - reference[0][1]) * scale,
  y: 34 + (length - reference[0][0]) * scale,
  height: span * scale,
}));
