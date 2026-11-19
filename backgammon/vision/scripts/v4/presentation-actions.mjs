import { bestCubeReply } from './cube-options.mjs';

/** Completed decisions shared by the replay overlay and the seekable viewer. */
export function presentationActions(game) {
  const { rolls, cubeRolls } = game.presentation;
  const cube = game.decisions.cube;
  const byDecision = new Map(rolls.filter(roll => roll.decision).map(roll => [roll.decision, roll]));
  const byRoll = new Set();
  const actions = [];
  for (const event of game.losses) {
    if (event.kind !== 'checker') continue;
    const roll = byDecision.get(event.decision);
    if (!roll) continue;
    const moves = game.decisions[event.decision].actions;
    const rank = moves.findIndex(move => move.isPlayed);
    const played = moves[rank];
    const notation = ['Pass', 'Pass — no legal move'].includes(played.notation)
      ? (roll.fan ? 'No legal entry' : 'No legal move') : played.notation;
    actions.push({ ...event, frame: Math.max(event.frame, roll.pickup ?? 0), rollStart: roll.start,
      fan: Boolean(roll.fan), label: roll.fan ? 'fanned' : `played ${notation}`,
      notation, rank: rank + 1, played: played.key, equity: played.equity4 });
    byRoll.add(roll.start);
  }
  for (const roll of rolls) {
    if (byRoll.has(roll.start)) continue;
    const turn = game.turns[(roll.decision ?? roll.sourceTurns[0]) - 1];
    const confirmedBoard = ['reviewed-roll-with-confirmed-board', 'reviewed-blocked-entry'].includes(roll.evidence);
    if (confirmedBoard && Number.isInteger(turn.resultFrame)) {
      const event = { frame: Math.max(turn.resultFrame, roll.pickup ?? 0), rollStart: roll.start,
        kind: 'board-result', player: roll.player, label: roll.fan ? 'fanned' : 'finished moving',
        fan: Boolean(roll.fan) };
      if (roll.forcedPlay) {
        event.label = `played ${roll.forcedPlay.notation}`;
        event.loss = roll.forcedPlay.evLoss;
        event.forcedPlay = roll.forcedPlay;
      } else if (roll.evidence === 'reviewed-blocked-entry') {
        event.loss = 0;
      }
      actions.push(event);
    } else if (roll.pickup != null) {
      actions.push({ frame: roll.pickup, rollStart: roll.start, kind: 'roll', player: roll.player,
        label: `rolled ${roll.dice.map(die => die ?? '?').join('–')}` });
    }
  }
  for (const item of cubeRolls) {
    actions.push({ frame: item.frame, kind: 'no-double', player: item.player, label: 'rolls without doubling',
      loss: item.evLoss, equity: item.options.noDouble });
  }
  if (cube) {
    actions.push({ frame: cube.startFrame, kind: 'cube-offer', player: cube.offerer,
      label: `doubles to ${cube.offeredFace}`, loss: cube.offerEvLoss, equity: bestCubeReply(cube.options)[1] });
    if (cube.reply && cube.reply in cube.options) {
      const label = { take: `takes · cube at ${cube.offeredFace}`, pass: 'passes', beaver: 'beavers' }[cube.reply];
      const loss = game.losses.find(event => event.action === cube.reply)?.loss;
      actions.push({ frame: cube.endFrame, kind: `cube-${cube.reply}`, player: cube.responder,
        label, loss, equity: -cube.options[cube.reply] });
    }
  }
  return actions.filter(event => event.frame < game.frames).sort((a, b) => a.frame - b.frame);
}
