#!/usr/bin/env bun
/**
 * Build each game's timeline and score it with the site's GNUbg engine at four ply.
 *
 * usage: bun analyze.mjs <decode.json> <dice-evidence.json> <cube-scan.json> <out-dir> <game...>
 *
 * Rolls: unique from the legal move when only one roll reproduces it,
 * otherwise the dice reader's most likely legal roll ("dice"), otherwise
 * marked "ambiguous". Cube actions come from the tracked cube: holder ->
 * board is an offer by the player on roll, board -> a side tray is a take by
 * that side (top-left White, bottom-left Black), board -> holder is a pass.
 *
 * An optional session.json next to the decode file describes a session that
 * differs: {"cubeRail": "right"} when the cube's holder and trays are on the
 * right rail, {"initialCube": {"value": 2, "owner": "white"}} for a recording
 * that begins mid-game with the cube already turned, {"result": {...}} for a game
 * whose last rolls were not played out ({winner, level, reason: "conceded", frame}; the
 * points are the level times the cube, and the game's video runs to that frame).
 * {"danceWindow": true}: see prevFrame below.
 */
import fs from 'node:fs';
import path from 'node:path';
import { initialState, canDouble } from '../../../core/rules.mjs';
import { createScorer, RULES, PRESET } from './scoring.mjs';

const [decodeFile, diceFile, cubeFile, outDir, ...gameArgs] = process.argv.slice(2);
const decode = JSON.parse(fs.readFileSync(decodeFile, 'utf8'));
const dice = JSON.parse(fs.readFileSync(diceFile, 'utf8'));
const cubeScan = JSON.parse(fs.readFileSync(cubeFile, 'utf8'));
const SIDE = { white: 0, dark: 1 };
const sessionFile = path.join(path.dirname(decodeFile), 'session.json');
const session = fs.existsSync(sessionFile) ? JSON.parse(fs.readFileSync(sessionFile, 'utf8')) : {};
const right = session.cubeRail === 'right';
// session.json "cubeThresh": the cube peak score that places the cube (0.5; 0.15 where the detector sees the cube
// faintly, Nov 24 15:31: per frame 137/155 zones right at 0.15 against 85 at 0.5, and no loss on the older sessions)
const CUBE_THRESH = session.cubeThresh ?? 0.5;
// session.json "cubeRailX": where the cube's rail starts (710 on the right, 90 on the left); 690 on Nov 24 15:31,
// where the cube in White's tray peaks at x 698-724 in the rectified view
const RAIL_X = session.cubeRailX ?? (right ? 710 : 90);
const onRail = right ? x => x > RAIL_X : x => x < RAIL_X, onBoard = right ? x => x >= 90 : x => x < 700;

fs.mkdirSync(outDir, { recursive: true });

function cubeZones() {
  const zone = ([, score, x, y]) => {
    if (score < CUBE_THRESH) return null;
    if (onRail(x)) return y < 250 ? 'white' : y > 350 ? 'dark' : 'holder';
    if (onBoard(x)) return 'board';
    return null;
  };
  const runs = [];
  for (const s of cubeScan) {
    const z = zone(s); if (!z) continue;
    const last = runs.at(-1);
    if (last && last.zone === z) { last.f1 = s[0]; last.n++; } else runs.push({ zone: z, f0: s[0], f1: s[0], n: 1 });
  }
  // at least three sightings spanning 1.6 s (the scan is every 5th frame)
  const stable = runs.filter(r => r.n >= 3 && r.f1 - r.f0 >= 40);
  const merged = [];
  for (const r of stable) { const l = merged.at(-1); if (l && l.zone === r.zone) l.f1 = r.f1; else merged.push({ ...r }); }
  return merged;
}

const scorer = await createScorer(), evaluator = scorer.evaluator;
const zones = cubeZones();

for (const g of gameArgs.map(Number)) {
  const game = decode.games[g - 1], ev = dice[g - 1];
  const turns = [];
  const start = game.fragment && session.initialCube;
  let cube = start ? { value: start.value, owner: start.owner == null ? null : SIDE[start.owner] } : { value: 1, owner: null };
  const initialCube = { ...cube };
  const events = [];
  // cube events inside this game
  for (let i = 1; i < zones.length; i++) {
    const a = zones[i - 1], b = zones[i];
    if (b.f0 < game.startFrame || b.f0 > game.endFrame + 1500) continue;
    if (b.zone === 'board' && a.zone !== 'board') events.push({ type: 'offer', frame: b.f0 });
    if (a.zone === 'board' && (b.zone === 'white' || b.zone === 'dark')) events.push({ type: 'take', frame: b.f0, player: b.zone });
    if (a.zone === 'board' && b.zone === 'holder') events.push({ type: 'pass', frame: b.f0 });
    // A quick double and take: the cube goes straight from the holder (or the
    // owner's tray) to the other side's tray without a stable view on the board.
    if (a.zone !== 'board' && (b.zone === 'white' || b.zone === 'dark') && a.zone !== b.zone) {
      events.push({ type: 'offer', frame: Math.max(a.f1 + 1, b.f0 - 50), quick: true });
      events.push({ type: 'take', frame: b.f0, player: b.zone });
    }
  }
  let result = null;
  const decodeTurns = [...game.turns];
  const last = game.final;
  // session.json "finalBearOff": [game, ...]: games whose winner bore off the last two to four checkers in
  // one unseen roll (a double) before the board was cleared (Nov 24 15:31 game 1). Cube moves after it
  // (back to the holder for the next game) are then not a pass.
  const unseenEnd = (session.finalBearOff ?? []).includes(g);
  for (const p of ['white', 'dark']) {
    const s = SIDE[p], left = 15 - last.off[s];
    const home = last.points.every((v, i) => !(p === 'white' ? v > 0 : v < 0) || (p === 'white' ? i < 6 : i > 17)) && !last.bar[s];
    if ((last.off[s] === 14 || (unseenEnd && left <= 4 && home)) && (unseenEnd || !events.some(e => e.type === 'pass'))) {
      decodeTurns.push({ player: p, inferred: 'final-bear-off', frame: game.endFrame, before: last,
        after: { ...last, off: last.off.map((v, i) => i === s ? 15 : v), points: last.points.map(v => (p === 'white' ? v > 0 : v < 0) ? 0 : v) }, plays: [], rolls: [] });
    }
  }
  // A game over by bear-off has no later cube actions: the cube going back to the holder for the next game
  // is not a pass.
  const over = decodeTurns.find(t => t.after.off.includes(15));
  if (over) for (let i = events.length - 1; i >= 0; i--) if (events[i].frame > over.frame) events.splice(i, 1);
  for (const [i, t] of decodeTurns.entries()) {
    const evidence = ev?.[i] ?? {};
    const s = SIDE[t.player];
    const out = { player: t.player, resultFrame: t.frame, fromFrame: t.fromFrame ?? null, before: t.before, after: t.after,
      inferred: t.inferred ?? null, dance: !!t.dance, rollFrame: evidence.rollFrame ?? null, pickupFrame: evidence.pickupFrame ?? null,
      ...(t.gapBefore ? { gapBefore: t.gapBefore } : {}) };
    // cube offers between the previous result and this roll belong to this player's pre-roll decision
    let prevFrame = i ? decodeTurns[i - 1].frame : game.startFrame;
    // session.json "danceWindow": a dance decoded together with the next move happened at its own
    // roll, so the next player's pre-roll window (a cube offer) starts there.
    if (session.danceWindow && i && decodeTurns[i - 1].dance && decodeTurns[i - 1].frame === t.frame && ev?.[i - 1]?.rollFrame)
      prevFrame = ev[i - 1].rollFrame;
    const rollAt = out.rollFrame ?? t.frame;
    for (const e of events) if (!e.player && e.frame > prevFrame && e.frame <= rollAt && e.type === 'offer') e.player = t.player;
    // roll
    let roll = null, source = null;
    if (t.rolls?.length === 1) { roll = t.rolls[0]; source = 'move'; }
    else if (t.rolls?.length > 1 && evidence.rollLogProb) {
      roll = [...t.rolls].sort((a, b) => evidence.rollLogProb[b] - evidence.rollLogProb[a])[0]; source = 'dice';
      const lp = t.rolls.map(r => evidence.rollLogProb[r]).sort((a, b) => b - a);
      out.rollMargin = +(lp[0] - (lp[1] ?? -Infinity)).toFixed(2);
    } else if (t.rolls?.length > 1) { roll = t.rolls[0]; source = 'ambiguous'; }
    out.rollCandidates = t.rolls ?? [];
    out.roll = roll ? roll.split('-').map(Number) : null; out.rollSource = source;
    out.cube = { ...cube };
    // pre-roll cube decision for the roller
    const pre = initialState({ points: t.before.points, bar: t.before.bar, off: t.before.off, turn: s, phase: 'roll', matchLength: 0, cube: { ...cube }, rules: RULES });
    if (canDouble(pre)) {
      const c = evaluator.analyze(pre, PRESET, 'cube');
      out.cubeDecision = { options: c.decisionOptions, best: c.action, equity: c.equity, outcomes: c.outcomes, probabilities: c.probabilities };
    } else {
      const c = evaluator.analyze(pre, PRESET, 'cube');
      out.position = { equity: c.equity, probabilities: c.probabilities };
    }
    // offered cube inside this window
    const offer = (cube.owner === null || cube.owner === s) &&
      events.find(e => e.type === 'offer' && e.player === t.player && e.frame > prevFrame && e.frame <= rollAt);
    if (offer) {
      const reply = events.find(e => e.frame > offer.frame && (e.type === 'take' || e.type === 'pass'));
      offer.value = cube.value * 2;
      out.cubeAction = { offerFrame: offer.frame, replyFrame: reply?.frame ?? null, reply: reply?.type ?? null };
      const offered = initialState({ points: t.before.points, bar: t.before.bar, off: t.before.off, turn: s, phase: 'double', matchLength: 0,
        cube: { ...cube }, pending: { type: 'double', by: s }, rules: RULES });
      try {
        const r = evaluator.analyze(offered, PRESET, 'cube');
        out.cubeAction.responses = r.decisionOptions; out.cubeAction.bestResponse = r.action;
      } catch (err) { out.cubeAction.error = String(err.message || err); }
      if (reply?.type === 'take') { cube = { value: cube.value * 2, owner: 1 - s }; out.cubeAfter = { ...cube }; }
      if (reply?.type === 'pass') {
        result = { winner: t.player, points: cube.value, reason: 'pass', frame: reply.frame };
        out.endedByPass = true; turns.push(out); break;
      }
    }
    // checker play
    if (roll && !t.dance) {
      const play = t.plays.find(p => p.dice.join('-') === roll);
      out.steps = play?.steps ?? null;
      const st = initialState({ points: t.before.points, bar: t.before.bar, off: t.before.off, turn: s, dice: out.roll, phase: 'move', matchLength: 0, cube: { ...cube }, rules: RULES });
      try { out.analysis = await scorer.checker(st, out.steps); }
      catch (err) { out.analysisError = String(err.message || err); }
    }
    turns.push(out);
    process.stdout.write(`game ${g} turn ${i + 1}/${decodeTurns.length}\r`);
  }
  // An offer after the last turn: the next player's pre-roll cube action ends the game.
  const lastTurn = decodeTurns.at(-1);
  const trailing = !result && events.find(e => e.type === 'offer' && !e.player && e.frame > (lastTurn?.frame ?? game.startFrame));
  let nextPlayer = lastTurn ? (lastTurn.player === 'white' ? 'dark' : 'white') : null;
  // A player on the bar against a closed board cannot enter and needs no roll: when the offer can
  // only come from the other player (who then owns the cube), that player is on roll after the dance.
  const closedOut = (pos, s) => pos.bar[s] > 0 && [0, 1, 2, 3, 4, 5].every(k => s === 0 ? pos.points[23 - k] <= -2 : pos.points[k] >= 2);
  if (trailing && nextPlayer && cube.owner !== null && cube.owner !== SIDE[nextPlayer] && closedOut(lastTurn.after, SIDE[nextPlayer])) {
    turns.push({ player: nextPlayer, resultFrame: Math.max(lastTurn.frame, trailing.frame - 1), fromFrame: lastTurn.frame, before: lastTurn.after, after: lastTurn.after,
      inferred: 'closed-out', dance: true, rollFrame: null, pickupFrame: null, roll: null, rollSource: null, cube: { ...cube } });
    nextPlayer = nextPlayer === 'white' ? 'dark' : 'white';
  }
  // Only a player who may double can make an offer; other cube movements are handling.
  if (trailing && (cube.owner === null || cube.owner === SIDE[nextPlayer])) {
    const p = nextPlayer;
    const s = SIDE[p], before = lastTurn.after;
    trailing.player = p; trailing.value = cube.value * 2;
    const reply = events.find(e => e.frame > trailing.frame && (e.type === 'take' || e.type === 'pass'));
    const out = { player: p, before, after: before, cube: { ...cube }, cubeOnly: true, resultFrame: reply?.frame ?? trailing.frame,
      cubeAction: { offerFrame: trailing.frame, replyFrame: reply?.frame ?? null, reply: reply?.type ?? null } };
    const pre = initialState({ points: before.points, bar: before.bar, off: before.off, turn: s, phase: 'roll', matchLength: 0, cube: { ...cube }, rules: RULES });
    const c = evaluator.analyze(pre, PRESET, 'cube');
    out.cubeDecision = { options: c.decisionOptions, best: c.action, equity: c.equity, outcomes: c.outcomes, probabilities: c.probabilities };
    const offered = initialState({ points: before.points, bar: before.bar, off: before.off, turn: s, phase: 'double', matchLength: 0,
      cube: { ...cube }, pending: { type: 'double', by: s }, rules: RULES });
    const r = evaluator.analyze(offered, PRESET, 'cube');
    out.cubeAction.responses = r.decisionOptions; out.cubeAction.bestResponse = r.action;
    turns.push(out);
    if (reply?.type === 'pass') result = { winner: p, points: cube.value, reason: 'pass', frame: reply.frame };
    if (reply?.type === 'take') { cube = { value: cube.value * 2, owner: 1 - s }; out.cubeAfter = { ...cube }; }
  }
  if (!result) {
    const fin = turns.at(-1)?.after ?? game.final;
    for (const p of ['white', 'dark']) if (fin.off[SIDE[p]] === 15) {
      const loser = 1 - SIDE[p]; const level = fin.off[loser] ? 1 : 2;
      result = { winner: p, points: cube.value * level, reason: level === 2 ? 'gammon' : 'bear-off', frame: turns.at(-1).resultFrame };
    }
  }
  let endFrame = game.endFrame;
  if (!result && game.fragment && session.result) {
    const { level = 1, ...r } = session.result;
    result = { ...r, points: cube.value * level }; endFrame = Math.max(endFrame, r.frame);
  }
  const outFile = path.join(outDir, `game-${String(g).padStart(2, '0')}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ game: g, fps: 25, startFrame: game.startFrame, endFrame, ...(game.fragment ? { fragment: true, initialCube } : {}), turns, cubeEvents: events, finalCube: cube, result }, null, 1));
  console.log(`\ngame ${g}: ${turns.length} turns, result ${JSON.stringify(result)}`);
}
