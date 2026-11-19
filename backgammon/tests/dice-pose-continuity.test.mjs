import assert from "node:assert/strict";
import test from "node:test";
import { verifyDicePose } from "../vision/scripts/v4/dice-pose-continuity.mjs";

const roll = { start: 0, end: 19, centers: [[330, 227], [370, 113]] };
const [first, second] = roll.centers.map(center => [...center, 0.95]);
const seen = { diceLocations: [first, second] };

function framesBetween(initial, gap, resumed) {
  return [...Array(20).fill(initial), ...Array(50).fill(gap), ...Array(61).fill(resumed)];
}

test("both dice can return to the same positions after a longer hand occlusion", () => {
  const covered = { diceLocations: [], handRegions: [[310, 80, 390, 245]] };
  const frames = framesBetween(seen, covered, seen);
  assert.deepEqual(verifyDicePose(roll, frames, frames.length), { start: 0, end: 130, poseLastSeen: 130 });
  assert.deepEqual(verifyDicePose(roll, frames, 100), { start: 0, end: 99, poseLastSeen: 99 });
});

test("a remaining die supports a bridge but does not become a paired observation itself", () => {
  const one = { diceLocations: [first] };
  const frames = framesBetween(seen, one, seen);
  assert.deepEqual(verifyDicePose(roll, frames, frames.length), { start: 0, end: 130, poseLastSeen: 130 });
  assert.equal(verifyDicePose(roll, framesBetween(seen, one, one), frames.length), null);
});

test("a longer interval without either dice or hand evidence breaks the observation", () => {
  const frames = framesBetween(seen, { diceLocations: [] }, seen);
  assert.equal(verifyDicePose(roll, frames, frames.length), null);
});

test("after an extended occlusion both faces must agree with the earlier readings", () => {
  const read = (a, b) => ({ ...seen, dice: [a, b].map((candidateValue, index) =>
    ({ center: roll.centers[index], candidateValue, score: 0.95 })) });
  const before = Array(20).fill(read(4, 6));
  const gap = Array(115).fill({ diceLocations: [first], handRegions: [[350, 100, 385, 130]] });
  const limit = 175;
  const resumed = [...before, ...gap, ...Array(40).fill(read(4, 6))];
  const changed = [...before, ...gap, ...Array(40).fill(read(4, 5))];
  assert.deepEqual(verifyDicePose(roll, resumed, limit), { start: 0, end: 174, poseLastSeen: 174 });
  assert.equal(verifyDicePose(roll, changed, limit), null);
});
