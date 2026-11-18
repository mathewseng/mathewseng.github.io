function lever(width, length, hasScrew = false) {
  const radius = width / 2;
  const screw = hasScrew
    ? `<circle class="key-detail-line" cx="${radius}" cy="${radius}" r="${width * .28}"/>` : '';
  return [width, length, `<rect class="key-face" width="${width}" height="${length}" rx="${radius}"/>${screw}`];
}

const roundRadius = 27;
const artwork = {
  round: [56, 56, `<circle class="key-face" cx="28" cy="28" r="${roundRadius}"/><circle class="key-detail-line" cx="28" cy="28" r="16"/><circle class="key-detail-line" cx="28" cy="28" r="12"/>`],
  bis: [21, 68, '<path class="key-face" d="M2 10C-3 2 7-4 12 3C24 22 24 46 12 65C7 72-3 66 2 58C11 42 11 26 2 10Z"/>'],
  leftPinky1: lever(24, 94),
  leftPinky2: lever(24, 121),
  rightIndex: lever(23, 99),
  rightPinky1: lever(23, 83, true),
  rightPinky2: lever(24, 113, true),
  rightPinky3: lever(26, 145, true),
};

export const KEY_SYMBOLS = Object.entries(artwork).map(([shape, [width, length, paths]]) =>
  `<symbol id="ewi-key-${shape}" viewBox="0 0 ${width} ${length}" overflow="visible">${paths}</symbol>`
).join('');

// Centers and lever angles measured from a front-facing EWI4000s photograph.
// Akai's reference manual, rev D, p.37 identifies the keys. The three right
// pinky levers can be adjusted, so their angles vary between instruments.
const photo = [
  ['round', 48, 119],
  ['bis', 88, 119],
  ['round', 135, 119],
  ['round', 218, 119],
  ['leftPinky1', 284, 100, -11],
  ['leftPinky2', 330, 86, -8],
  ['rightIndex', 463, 137, 4],
  ['round', 532, 117],
  ['round', 615, 117],
  ['round', 698, 121],
  ['rightPinky1', 760, 139, 13],
  ['rightPinky2', 805, 152, 13],
  ['rightPinky3', 840, 164, 21],
];
const scale = 24.45 / 56;
export const KEY_LAYOUT = photo.map(([shape, along, across, tilt = 0]) => {
  const [width, length] = artwork[shape];
  return {
    shape,
    x: 165 - (across - 119) * scale,
    y: 34 + (along - 48) * scale,
    width: width * scale,
    height: length * scale,
    angle: 90 + tilt,
  };
});

export function keySideEdge({ shape, x, y, width, height, angle }, side) {
  if (shape === 'round') return { x: x + side * roundRadius * scale, y };
  // The endpoints of the bis curve reach y=0 and y=68 at about x=6.5 in its viewBox.
  if (shape === 'bis') return { x: x + side * height / 2, y: y - 4 * scale };

  // Each lever is a capsule. Find the center of the outer rounded end,
  // then move one radius horizontally to its leftmost or rightmost point.
  const radius = width / 2;
  const halfShaft = height / 2 - radius;
  const radians = angle * Math.PI / 180;
  return {
    x: x + side * (Math.sin(radians) * halfShaft + radius),
    y: y - side * Math.cos(radians) * halfShaft,
  };
}
