/** Resolve a cube placed on the felt and later accepted into the responder's tray. */
export function resolveCubeTakes(observations, groups, candidates) {
  return candidates.flatMap(proof => {
    const { previous, previousSeen, start, lastSeen, take, offered, side, center, views, confidence } = proof;
    const prior = observations.cube.find(event => event.start === previous && event.end === previousSeen &&
      event.side !== 'playing-surface' && event.stake * 2 === offered);
    const responder = side === 'near-side' ? 'dark' : side === 'far-side' ? 'white' : null;
    const offerer = responder === 'dark' ? 'white' : 'dark';
    const taken = observations.cube.find(event => event.start === take && event.stake === offered &&
      event.side === side && event.visibleSamples >= 12);
    const group = groups.find(item => item.first <= previousSeen && take < item.last);
    if (!prior || !responder || !taken || !group || views < 4 || confidence < .90 ||
        !(previousSeen < start && start <= lastSeen && lastSeen < take) ||
        prior.side !== 'centered' && prior.side !== (offerer === 'white' ? 'far-side' : 'near-side')) return [];
    if (group.turns.some(turn => turn.steps && turn.resultFrame >= start && turn.start < take)) return [];
    const next = group.turns.find(turn => turn.start >= take && turn.before && turn.steps);
    if (!next || next.player !== offerer) return [];
    const before = group.runs.findLast(run => run.first <= start && run.last >= start - 150 && run.count >= 12);
    const after = before && group.runs.find(run => run.last >= take && run.first <= next.start &&
      run.key === before.key && run.count >= 12);
    if (!after || next.before.key !== before.key) return [];
    return [{ start, lastSeen, take, center, views, confidence, offerer, responder, offered,
      stake: prior.stake, previous, previousSeen, oldSide: prior.side, side, position: before.position,
      beforeFrame: Math.min(before.last, start), afterFrame: Math.max(after.first, take) }];
  });
}

export function suppressDuringTakes(groups, offers) {
  for (const offer of offers) {
    const group = groups.find(item => item.first <= offer.start && offer.take < item.last);
    group.turns = group.turns.flatMap(turn => {
      if (turn.start >= offer.take || turn.end < offer.start) return [turn];
      if (turn.start < offer.start) return [{ ...turn, end: offer.start - 1 }];
      group.suppressed.push({ frame: turn.start, end: turn.end, player: turn.player,
        dice: turn.dice, reason: 'accepted-cube-response' });
      return [];
    });
  }
}
