/** Recover both faces from repeated co-reads at an already tracked dice pose. */
function readPair(state, centers) {
  if (!state) return null;
  const faces = centers.map(([x, y]) => {
    if (state.handRegions?.some(([left, top, right, bottom]) =>
      x >= left - 8 && x <= right + 8 && y >= top - 8 && y <= bottom + 8)) return null;
    const reads = (state.dice ?? []).filter(die =>
      Number.isInteger(die.value) && die.value >= 1 && die.value <= 6 &&
      die.score >= .80 && Number.isFinite(die.locationScore) &&
      Math.hypot(die.center[0] - x, die.center[1] - y) <= 8);
    return reads.length === 1 ? reads[0] : null;
  });
  return faces.every(Boolean) ? faces : null;
}

function poseVotes(frames, centers, start, stop, readState) {
  const votes = new Map();
  for (let frame = start; frame < stop; frame++) {
    const reads = readPair(readState(frames[frame]), centers);
    if (!reads) continue;
    const faces = reads.map(read => read.value);
    const key = faces.join(',');
    if (!votes.has(key)) votes.set(key, { key, dice: faces, observations: [] });
    votes.get(key).observations.push({ frame, reads });
  }
  return [...votes.values()].sort((a, b) => b.observations.length - a.observations.length);
}

const median = values => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];

function stable(votes) {
  const [first, second] = votes;
  if (!first) return null;
  const { observations, dice } = first;
  if (observations.length < 5 || observations.at(-1).frame - observations[0].frame < 8 ||
      observations.length < 3 * (second?.observations.length ?? 0)) return null;
  for (const [index, face] of dice.entries()) {
    const scores = observations.map(({ reads }) => reads[index].score);
    if (median(scores) < .865) return null;
    const typicalLocation = median(observations.map(({ reads }) => reads[index].locationScore));
    // A less frequent read with better localization may come from the die
    // itself while the dominant crop is offset or shows neighboring marks.
    if (votes.slice(1).some(vote => vote.dice[index] !== face && vote.observations.some(({ reads }) =>
      reads[index].locationScore >= typicalLocation + .12))) return null;
  }
  return first;
}

export function recoverStationaryFaces(roll, rows, poseFrames, first, last) {
  if (roll.reviewedPose || roll.opening || !roll.player || roll.centers?.length !== 2 ||
      roll.dice.every(Number.isInteger)) return roll;
  const [a, b] = roll.centers;
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= 18) return roll;
  const start = Math.max(first, roll.start);
  const stop = Math.min(last, roll.end + 1, start + 64);
  const camera = stable(poseVotes(rows, roll.centers, start, stop, row => row?.state));
  if (!camera || roll.dice.some(face => face !== null && !camera.dice.includes(face))) return roll;
  const pose = poseFrames ? stable(poseVotes(poseFrames, roll.centers, start, stop, state => state)) : null;
  if (poseFrames && pose?.key !== camera.key) return roll;
  const samples = camera.observations;
  return { ...roll, dice: [...camera.dice].sort((x, y) => x - y),
    stationaryFaces: { samples: samples.length, first: samples[0].frame, last: samples.at(-1).frame,
      ...(pose ? { corroboratingSamples: pose.observations.length } : {}) } };
}
