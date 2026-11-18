import { KEYS, supportsMidi } from './engine.mjs?v=20261118-layout';
import { isEligibleFingering, keyPitch } from './key-rules.mjs?v=20261118-layout';

const MAIN_KEYS = [0, 1, 2, 3, 7, 8, 9];
const SIDE_KEYS = [4, 5, 6, 10, 11, 12];

const byFinger = new Map();
KEYS.forEach(({ finger }, index) => {
  if (!byFinger.has(finger)) byFinger.set(finger, []);
  byFinger.get(finger).push(index);
});
const sharedFingers = [...byFinger.values()].filter(keys => keys.length > 1);
const countHeld = bits => [...bits].filter(bit => bit === '1').length;
const readGroup = (bits, keys) => keys.map(key => bits[key]).join('');

const byPitch = new Map();
for (let mask = 0; mask < 2 ** KEYS.length; mask++) {
  const bits = mask.toString(2).padStart(KEYS.length, '0');
  if (!isEligibleFingering(bits)) continue;
  const { midi } = keyPitch(bits);
  const mainBits = readGroup(bits, MAIN_KEYS);
  const sideBits = readGroup(bits, SIDE_KEYS);
  const heldCount = countHeld(bits);
  // The standalone K1 + bis roll is one index-finger gesture. Other
  // patterns pay for each extra sensor held by the same finger.
  const bisOnly = heldCount === 2 && bits.startsWith('11');
  const comfortCost = bisOnly ? 0 : sharedFingers.reduce((cost, keys) => cost + Math.max(0, countHeld(readGroup(bits, keys)) - 1), 0);
  const sideCount = countHeld(sideBits);
  if (!byPitch.has(midi)) byPitch.set(midi, []);
  byPitch.get(midi).push({
    bits, sideCount, comfortCost, heldCount,
    mainValue: parseInt(mainBits, 2), sideValue: parseInt(sideBits, 2),
  });
}

export function rankedFingerings(midi) {
  if (!supportsMidi(midi)) return [];
  const options = [];
  for (let shift = -2; shift <= 4; shift++) {
    for (const pattern of byPitch.get(midi - 12 * shift) ?? []) {
      options.push({ ...pattern, shift });
    }
  }
  options.sort((a, b) =>
    a.sideCount - b.sideCount
    || a.comfortCost - b.comfortCost
    || b.mainValue - a.mainValue
    || b.sideValue - a.sideValue);
  return options.map((pattern, index) => ({ ...pattern, rank: index + 1 }));
}
