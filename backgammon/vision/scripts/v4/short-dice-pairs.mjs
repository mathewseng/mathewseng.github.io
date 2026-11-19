/** Detect short paired appearances even when the pip reader loses one or both dice. */
const near = (first, second, radius) => Math.hypot(first[0] - second[0], first[1] - second[1]) <= radius;
const half = x => x <= 262 ? 'white' : x >= 303 ? 'dark' : null;
const radius = 8;

export function shortDicePairs(states, breaks = []) {
  const detections = states.map(state => state?.diceLocations?.filter(([x, , score]) => score >= .4 && half(x)) ?? []);
  const active = [];
  const resting = [];
  const cuts = new Set(breaks);
  const continuous = new Array(states.length);
  for (let frame = 0, clipStart = 0; frame < states.length; frame++) {
    if (cuts.has(frame)) clipStart = frame;
    continuous[frame] = clipStart;
  }
  for (let frame = 0; frame < detections.length; frame++) {
    for (let index = active.length - 1; index >= 0; index--) {
      const track = active[index];
      if (!cuts.has(frame) && frame <= track.last + 6) continue;
      active.splice(index, 1);
      const duration = track.last - track.start + 1;
      if (track.frames.size >= 7 && duration >= 8 && duration <= 64) resting.push(track);
    }
    for (const point of detections[frame]) {
      let track = active.find(candidate => near(candidate.center, point, radius) && candidate.last !== frame);
      if (!track) {
        track = { center: point.slice(0, 2), start: frame, last: frame, frames: new Set(), faceWitnesses: 0 };
        active.push(track);
      }
      track.last = frame;
      track.frames.add(frame);
      if (states[frame].dice?.some(die => near(die.center, point, radius))) track.faceWitnesses++;
    }
  }
  function surroundingHits(track, first, last) {
    let hits = 0;
    for (let frame = first; frame < last; frame++) {
      if (detections[frame].some(point => near(track.center, point, radius))) hits++;
    }
    return hits;
  }
  const fresh = resting.filter(track => {
    const before = track.start - 22;
    const after = track.last + 22;
    return track.faceWitnesses >= 3 && before >= 0 && after < states.length &&
      continuous[before] === continuous[after] &&
      surroundingHits(track, before, track.start - 5) <= 4 &&
      surroundingHits(track, track.last + 6, after + 1) <= 4;
  }).sort((a, b) => a.start - b.start);
  const pairs = [];
  for (const [index, first] of fresh.entries()) {
    for (let i = index + 1; i < fresh.length && fresh[i].start <= first.start + 14; i++) {
      const second = fresh[i];
      const player = half(first.center[0]);
      if (player !== half(second.center[0]) || near(first.center, second.center, 18) ||
          Math.min(first.last, second.last) - second.start < 9 || Math.abs(first.last - second.last) > 18) continue;
      const shared = [...first.frames].filter(frame => second.frames.has(frame));
      if (shared.length >= 4) {
        pairs.push({ start: first.start, end: Math.max(first.last, second.last), player,
          centers: [first.center, second.center], jointlyObserved: shared.length,
          firstTogether: shared[0], lastTogether: shared.at(-1) });
      }
    }
  }
  // A detector can report one die at adjoining grid centers. Keep the
  // strongest joint witness for each physical pair before counting episodes.
  const distinct = [];
  for (const pair of pairs.sort((a, b) => b.jointlyObserved - a.jointlyObserved)) {
    const duplicate = distinct.some(other => pair.start <= other.end && other.start <= pair.end &&
      other.centers.every(center => pair.centers.some(location => near(center, location, 16))));
    if (!duplicate) distinct.push(pair);
  }
  return distinct.sort((a, b) => a.start - b.start);
}

export function refineIncompletePair(roll, recent) {
  if (!roll.centers || !roll.player || roll.opening || roll.dice.every(Number.isInteger)) return roll;
  const corroborated = recent.filter(pair => pair.player === roll.player &&
    Math.abs(pair.start - roll.start) <= 12 && Math.min(pair.end, roll.end) - Math.max(pair.start, roll.start) >= 10);
  const matches = pair => pair.centers.filter(center => roll.centers.some(point => near(center, point, 14))).length;
  if (corroborated.length !== 1 || matches(corroborated[0]) !== 1) return roll;
  // A face assigned before the location correction may have come from a
  // checker. Read the new physical pair again or leave the faces unresolved.
  return { ...roll, centers: corroborated[0].centers, dice: [null, null],
    shortPairEvidence: corroborated[0] };
}
