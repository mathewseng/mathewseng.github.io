const close = ([x, y], [px, py]) => Math.hypot(x - px, y - py) <= 8;
const supports = (location, center) => location[2] >= .38 && close(center, location);
const visible = (frame, center) => frame?.diceLocations?.some(location =>
  supports(location, center));
const covered = (frame, [x, y]) => frame?.handRegions?.some(
  ([left, top, right, bottom]) => x >= left - 8 && x <= right + 8 && y >= top - 8 && y <= bottom + 8);

function pairVisible(frame, [first, second]) {
  const locations = frame?.diceLocations ?? [];
  return locations.some((location, index) => supports(location, first) &&
    locations.some((other, otherIndex) => otherIndex !== index && supports(other, second)));
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
