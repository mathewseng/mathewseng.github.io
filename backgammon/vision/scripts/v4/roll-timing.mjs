/** A paired view of the empty felt bounds the roll separately from the move. */
export function footprintPickup(turn, limit) {
  const frame = turn.pickupFrame;
  return Number.isInteger(frame) && frame === turn.footprint?.clear &&
    frame > turn.start && frame <= turn.end + 1 && frame < limit ? frame : null;
}
