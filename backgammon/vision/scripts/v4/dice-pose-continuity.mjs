const close = ([x, y], [px, py]) => Math.hypot(x - px, y - py) <= 8;
const supports = (location, center) => location[2] >= .38 && close(center, location);
const visible = (frame, center) => frame?.diceLocations?.some(location =>
  supports(location, center));
const covered = (frame, [x, y]) => frame?.handRegions?.some(
  ([left, top, right, bottom]) => x >= left - 8 && x <= right + 8 && y >= top - 8 && y <= bottom + 8);

export function pairVisible(frame, [first, second]) {
  const locations = frame?.diceLocations ?? [];
  return locations.some((location, index) => supports(location, first) &&
    locations.some((other, otherIndex) => otherIndex !== index && supports(other, second)));
}

export function stationaryPoseOnset(frames, centers, first, last) {
  // The locator reports on a two-pixel grid. Both dice must stay within
  // roughly one grid step of their tracked centers for six frames.
  let run = 0;
  for (let frame = first; frame <= last; frame++) {
    const locations = frames[frame]?.diceLocations ?? [];
    const hits = centers.map(([x, y]) => locations.findIndex(([px, py, score]) =>
      score >= .38 && Math.hypot(x - px, y - py) <= 3));
    run = hits.every(index => index >= 0) && hits[0] !== hits[1] ? run + 1 : 0;
    if (run === 6) return frame - run + 1;
  }
  return null;
}

function continuedTo(frames, centers, start, limit) {
  let end = start + 5, run = 6;
  for (let frame = end + 1; frame < limit && frame - end <= 150; frame++) {
    if (frame - end > 35) {
      // A longer gap needs ongoing evidence at one of the original positions.
      // The bridge itself never counts as seeing either die.
      const recent = frames.slice(frame - 12, frame);
      const supported = recent.filter(read => centers.some(center => visible(read, center) || covered(read, center)));
      if (supported.length < 8) break;
    }
    run = pairVisible(frames[frame], centers) ? run + 1 : 0;
    if (run < 6) continue;
    if (frame - end > 72 && !confirmedReturn(frames, centers, start, end, frame, limit)) break;
    end = frame;
  }
  return end;
}

function faceAt(frames, center) {
  const votes = new Map();
  for (const frame of frames) {
    const die = frame?.dice?.find(d => close(d.center, center));
    if (die?.candidateValue && die.score >= .70) {
      votes.set(die.candidateValue, (votes.get(die.candidateValue) ?? 0) + 1);
    }
  }
  const [first, second] = [...votes].sort((a, b) => b[1] - a[1]);
  return first?.[1] >= Math.max(4, (second?.[1] ?? 0) * 2) ? first[0] : null;
}

function confirmedReturn(frames, centers, start, end, frame, limit) {
  const before = frames.slice(Math.max(start, end - 24), end + 1);
  const after = frames.slice(frame - 5, Math.min(limit, frame + 16));
  const obscured = frames.slice(end + 1, frame).some(read => centers.some(center => covered(read, center)));
  return obscured && centers.every(center => {
    const face = faceAt(before, center);
    return face !== null && faceAt(after, center) === face;
  });
}

function relocatedPose(roll, frames, end, limit) {
  const earlier = frames.slice(Math.max(roll.start, end - 90), end + 1);
  const gap = frames.slice(end + 1, Math.min(end + 36, limit));
  for (const [fixed, moved] of [roll.centers, [...roll.centers].reverse()]) {
    if (!gap.some(frame => covered(frame, moved))) continue;
    const face = faceAt(earlier, moved);
    if (face === null) continue;
    const candidates = [];
    for (const [offset, frame] of gap.entries()) {
      if (!visible(frame, fixed) || visible(frame, moved)) continue;
      const transit = gap.slice(0, offset + 1);
      const start = end + 1 + offset;
      const subsequent = frames.slice(start, Math.min(start + 18, limit));
      if (subsequent.length < 6 ||
          !subsequent.slice(0, 6).every(read => visible(read, fixed) && !visible(read, moved))) continue;
      for (const die of frame.dice ?? []) {
        const center = die.center;
        if (close(center, fixed) || close(center, moved) || (center[0] < 280) !== (moved[0] < 280) ||
            candidates.some(item => close(item.center, center)) ||
            earlier.slice(-12).some(read => visible(read, center)) || !transit.some(read => covered(read, center)) ||
            !subsequent.slice(0, 6).every(read => pairVisible(read, [fixed, center])) ||
            faceAt(subsequent, center) !== face) continue;
        candidates.push({ center, start, fixed });
      }
    }
    if (candidates.length === 1) return candidates[0];
  }
  return null;
}

/** Extend two stationary tracks through intermittent or conflicting face reads. */
export function verifyDicePose(roll, frames, limit) {
  if (roll.opening || !roll.centers || roll.centers.length !== 2) return null;
  let run = 0, start = null;
  for (let frame = roll.start; frame <= Math.min(roll.end, roll.start + 25, limit - 1); frame++) {
    run = pairVisible(frames[frame], roll.centers) ? run + 1 : 0;
    if (run === 6) {
      start = frame - run + 1;
      break;
    }
  }
  if (start === null) return null;
  // The evidence can extend through a hand covering either die. It ends at
  // the last positive read and cannot independently verify a pickup.
  let end = continuedTo(frames, roll.centers, start, limit);
  const relocation = relocatedPose(roll, frames, end, limit);
  if (relocation) end = continuedTo(frames, [relocation.fixed, relocation.center], relocation.start, limit);
  return end >= roll.end + 50 ? { start, end, poseLastSeen: end,
    ...(relocation ? { relocatedAt: relocation.start } : {}) } : null;
}

/** Rejoin a covered die relocation using a fixed die and its later pickup. */
export function rejoinDicePose(roll, followup, proof, frames, limit) {
  const shared = roll.centers.filter(center => proof.centers.some(point => close(center, point)));
  if (shared.length !== 1) return null;
  const fixed = shared[0];
  const before = frames.slice(Math.max(roll.start, roll.end - 28), roll.end + 1);
  const face = faceAt(before, fixed);
  const after = frames.slice(proof.firstTogether, proof.firstTogether + 32);
  if (face === null || !roll.dice.includes(face) || !followup.dice.includes(face) || faceAt(after, fixed) !== face) return null;

  const movedFrom = roll.centers.find(center => center !== fixed);
  const movedTo = proof.centers.find(center => !close(center, fixed));
  if (!movedTo) return null;
  const gap = frames.slice(roll.end + 1, proof.firstTogether + 6);
  if (!gap.some(frame => covered(frame, movedFrom)) || !gap.some(frame => covered(frame, movedTo))) return null;
  let unsupported = 0;
  for (const read of gap) {
    unsupported = visible(read, fixed) || covered(read, fixed) ? 0 : unsupported + 1;
    if (unsupported > 8) return null;
  }
  const pickup = confirmedPosePickup(frames, proof.centers, proof.lastTogether, limit);
  return pickup ? { start: roll.start, relocatedAt: proof.firstTogether, ...pickup, fixedFace: face } : null;
}

function confirmedPosePickup(frames, centers, after, limit) {
  const masked = centers.map(() => false);
  let run = 0, lastSeen = after;
  for (let frame = after + 1; frame < Math.min(limit, after + 50); frame++) {
    const read = frames[frame];
    const empty = read && centers.every(center => !visible(read, center) && !covered(read, center));
    if (pairVisible(read, centers)) lastSeen = frame;
    for (const [index, center] of centers.entries()) {
      if (covered(read, center)) masked[index] = true;
      else if (visible(read, center)) masked[index] = false;
    }
    run = empty && masked.every(Boolean) ? run + 1 : 0;
    if (run >= 8) return { pickupFrame: frame - run + 1, poseLastSeen: lastSeen };
  }
  return null;
}

export function pickupAfterPose(roll, frames, limit) {
  const from = Math.max(roll.start, roll.end - 15);
  const last = frames.slice(from, roll.end + 1).findLastIndex(read => pairVisible(read, roll.centers));
  return last < 0 ? null : confirmedPosePickup(frames, roll.centers, from + last, limit);
}

function firstVisible(frames, centers, last, lower) {
  let first = last;
  for (let frame = last - 1; frame >= lower && first - frame <= 8; frame--) {
    if (pairVisible(frames[frame], centers)) first = frame;
  }
  return first;
}

function linkedThroughHand(frames, earlier, later, first, stop) {
  return earlier.every((center, slot) => {
    const next = later[slot];
    let uncovered = 0, masked = false;
    for (let frame = first; frame < stop; frame++) {
      const read = frames[frame];
      const hand = covered(read, center) || covered(read, next);
      masked ||= hand;
      uncovered = hand || visible(read, center) || visible(read, next) ? 0 : uncovered + 1;
      if (uncovered > 8) return false;
    }
    return close(center, next) || masked;
  });
}

function earlierDicePose(frames, later, lower, face) {
  const minimum = Math.max(lower + 20, later.first - 90);
  const found = [];
  for (let frame = later.first - 1; frame >= minimum; frame -= 2) {
    const points = frames[frame]?.diceLocations?.filter(point => point[2] >= .38) ?? [];
    const nearby = later.centers.map(center => points.filter(point =>
      Math.hypot(point[0] - center[0], point[1] - center[1]) <= 65));
    const recent = frames.slice(frame - 20, frame + 1);
    for (const known of nearby[0]) {
      if (faceAt(recent, known) !== face) continue;
      for (const other of nearby[1]) {
        if (Math.hypot(known[0] - other[0], known[1] - other[1]) < 18 ||
            close(known, later.centers[0]) && close(other, later.centers[1])) continue;
        const centers = [known.slice(0, 2), other.slice(0, 2)];
        if (found.some(candidate => candidate.centers.every((center, index) => close(center, centers[index])))) continue;
        if (recent.filter(read => pairVisible(read, centers)).length < 15 ||
            !linkedThroughHand(frames, centers, later.centers, frame + 1, later.first + 1)) continue;
        const first = firstVisible(frames, centers, frame, lower);
        if (frame - first >= 25) found.push({ centers, first, last: frame });
      }
    }
  }
  return found.length === 1 ? found[0] : null;
}

/** Recover earlier settled positions of a long roll with one readable face. */
export function traceDicePoseHistory(roll, frames, lower, limit) {
  const face = roll.dice[0];
  const tail = frames.slice(Math.max(roll.start, roll.end - 40), roll.end + 1);
  const identified = roll.centers.filter(center => faceAt(tail, center) === face);
  if (identified.length !== 1) return null;
  const centers = [identified[0], roll.centers.find(center => center !== identified[0])];
  const pickup = pickupAfterPose({ ...roll, centers }, frames, limit);
  if (!pickup) return null;

  const history = [{ centers, first: firstVisible(frames, centers, pickup.poseLastSeen, lower), last: pickup.poseLastSeen }];
  for (let earlier = earlierDicePose(frames, history[0], lower, face); earlier;
    earlier = earlierDicePose(frames, history[0], lower, face)) history.unshift(earlier);
  if (history.length < 2) return null;
  const first = history[0].first;
  const start = stationaryPoseOnset(frames, history[0].centers, first, first + 25);
  return start !== null && start < roll.start - 25 ? { start, face, history, ...pickup } : null;
}
