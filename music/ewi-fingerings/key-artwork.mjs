function outline(bounds, edgeY, face, detail = '') {
  return {
    bounds,
    edgeY,
    paths: `<path class="key-face" d="${face}"/>${detail}`,
  };
}

const screw = y => `<circle class="key-detail-line" cx="228" cy="${y}" r="7.5"/>`;
const seam = d => `<path class="key-detail-line" d="${d}"/>`;

// The outlines and positions are measured on the Top Panel drawing on p. 5
// of Akai's EWI4000s Reference Manual (rev D). P. 37 identifies K1–K13.
// Coordinates use the drawing's original pixels, with the mouthpiece up.
const artwork = {
  round: {
    bounds: [0, 0, 47, 48.5],
    edgeY: [24.25, 24.25],
    paths: `<ellipse class="key-face" cx="23.5" cy="24.25" rx="23.5" ry="24.25"/>
      <ellipse class="key-detail-line" cx="23.5" cy="24.25" rx="19" ry="19.5"/>
      <ellipse class="key-detail-line" cx="23.5" cy="24.25" rx="12.5" ry="13"/>`,
  },
  bis: outline([196, 759, 56, 22], [765.5, 765.5],
    'M207 760.5C218 767.5 229 770 241 760.5C246 757 252 760 252 765.5C252 773 238 781 224 781C210 781 196 773 196 765.5C196 760 202 757 207 760.5Z'),
  leftPinky1: outline([200, 920, 77, 33], [942, 930.5],
    'M208.5 931L264 920.5C271 919 277 923 277 930.5C277 936 273.5 940.5 268 941.5L213 952.5C206 954 200 949 200 942C200 937 203 932.5 208.5 931Z',
    seam('M251.5 922.9L255.5 944')),
  leftPinky2: outline([200, 958, 101, 35], [982, 969],
    'M209 971.5L263 960.5Q268 959.5 274 959L289 958C296 958 301 961.5 301 969C301 975 297 979.5 291 980.5L272 982Q267 982.5 263 983.5L213 992.5C206 994 200 989 200 982C200 977 204 972.5 209 971.5Z',
    seam('M266 960L269 982.7M275.5 958.9L277 981.6')),
  rightIndex: outline([168, 1072, 81, 28], [1083, 1089],
    'M180 1072L238.5 1078C244.5 1078.5 249 1083 249 1089C249 1095.5 244 1100.5 237 1100L178 1094C172 1093.5 168 1089 168 1083C168 1077 173 1071.5 180 1072Z',
    seam('M183.5 1072.4L185.5 1094.7')),
  rightPinky1: outline([172, 1317, 70, 40], [1327.5, 1342],
    'M183 1317L228 1327.5C236 1329 242 1334.5 242 1342C242 1351 234.5 1358.5 225 1356.5L180 1338.5C175 1337 172 1333 172 1327.5C172 1321.5 177 1316.5 183 1317Z',
    seam('M201.5 1321.4L196.3 1345M213 1324L207.5 1349.5') + screw(1342)),
  rightPinky2: outline([151, 1353, 91, 43], [1363.5, 1381.5],
    'M163 1353L228 1367.5C236 1369 242 1374 242 1381.5C242 1391 234.5 1398 225 1395.5L159 1374.5C154 1373 151 1369 151 1363.5C151 1357.5 156.5 1352.2 163 1353Z',
    seam('M188.5 1358.7L183.3 1382.3M201.5 1361.6L195.4 1386') + screw(1380.8)),
  rightPinky3: outline([125.5, 1384, 116.5, 52], [1395, 1420.5],
    'M138 1384L228 1406C236 1408 242 1413.5 242 1420.5C242 1430 234 1438 224.5 1435.5L134 1406.5C129 1405 125.5 1400.5 125.5 1395C125.5 1388.5 131 1383 138 1384Z',
    seam('M188 1396.2L181.9 1421.8M202 1399.6L195.8 1426.3') + screw(1420)),
};

export const KEY_SYMBOLS = Object.entries(artwork).map(([shape, { bounds, paths }]) =>
  `<symbol id="ewi-key-${shape}" viewBox="${bounds.join(' ')}" overflow="visible">${paths}</symbol>`
).join('');

const manualKeys = [
  ['round', 224, 733.1],
  ['bis'],
  ['round', 224, 809.1],
  ['round', 224, 878.5],
  ['leftPinky1'],
  ['leftPinky2'],
  ['rightIndex'],
  ['round', 224.1, 1144.6],
  ['round', 224, 1214],
  ['round', 218.1, 1283.6],
  ['rightPinky1'],
  ['rightPinky2'],
  ['rightPinky3'],
];
const scale = 0.52;
const mapX = x => 165 + (x - 224) * scale;
const mapY = y => 34 + (y - 733.1) * scale;

export const KEY_LAYOUT = manualKeys.map(([shape, centerX, centerY]) => {
  const { bounds: [left, top, width, height], edgeY } = artwork[shape];
  const y = centerY ?? top + height / 2;
  return {
    shape,
    x: mapX(centerX ?? left + width / 2),
    y: mapY(y),
    width: width * scale,
    height: height * scale,
    edgeY: edgeY.map(edge => mapY(y + edge - top - height / 2)),
  };
});

export function keySideEdge({ x, width, edgeY }, side) {
  return { x: x + side * width / 2, y: edgeY[side < 0 ? 0 : 1] };
}
