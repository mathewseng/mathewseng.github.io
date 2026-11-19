/** Use reviewed ownership for analysis. A die face alone cannot establish a cube owner. */
export function cubeContext(game, row) {
  if (!row || row.phase === 'game-closed') return null;
  const offer = game.decisions.cube;
  if (offer?.reply === 'take' && row.frame >= offer.endFrame) {
    return { value: offer.offeredFace, owner: Number(offer.offerer === 'white') };
  }
  if (row.cube?.stake === 1 && (row.cube.side === 'centered' ||
      (row.cube.offered === 2 && offer?.preOfferStake === 1))) {
    return { value: 1, owner: null };
  }
  return null;
}
