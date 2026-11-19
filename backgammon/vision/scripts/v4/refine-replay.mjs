/** Confirm dice from completed checker transitions and track in-turn point counts. */
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { observedBoard } from './bearoff-board.mjs';
import { footprintPickup } from './roll-timing.mjs';
import { artifactDir, replayDir, solverUrl, visionStateDir } from '../project_paths.mjs';
import { exclusive, loadEvaluator, matchingTurns, rowsFrom, stateFor } from '../v2/solve_games.mjs';

const { boardKey, initialState, legalTurns, legalPaths, applyStep, pipCount, notation } =
  await import(solverUrl('backgammon/core/rules.mjs'));
const { toXGID } = await import(solverUrl('backgammon/core/xgid.mjs'));

const baseline = path.resolve(process.env.OFFICE3_REFINEMENT_SOURCE ?? path.join(artifactDir, 'v4'));
const observations = path.resolve(process.env.OFFICE3_VISION_OBSERVATIONS_DIR ?? baseline);
const vision = path.join(artifactDir, 'v2');
const output = path.join(replayDir, 'context');
const rolls = Array.from({ length: 6 }, (_, i) =>
  Array.from({ length: 6 - i }, (_, j) => [i + 1, i + j + 1])).flat();
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const sameRoll = (a, b) => a?.[0] === b?.[0] && a?.[1] === b?.[1];
const read = (folder, file) => JSON.parse(fs.readFileSync(path.join(folder, file)));

function signed(board) {
  return board.points.map(([white, dark]) => white - dark);
}

function keyFor(board) {
  return boardKey({ points: signed(board), bar: board.bar, off: board.borneOff });
}

function record(position) {
  const state = stateFor(position, 0, [1, 2]);
  return { position, key: keyFor(position), pips: [pipCount(state, 0), pipCount(state, 1)] };
}

function poseFor(turn, pairs) {
  if (turn.centers) return {
    centers: turn.centers,
    end: pairs.find((p) => p.tracks.some((id) => turn.tracks?.includes(id)))?.end ?? turn.end,
    quality: turn.reviewedPose ? 1 : turn.quality ?? 0,
  };
  const candidates = pairs.filter((p) => p.player === turn.player && p.start <= turn.end &&
    p.end >= turn.start && Math.abs(p.start - turn.start) <= 65);
  return candidates.sort((a, b) => Math.abs(a.start - turn.start) - Math.abs(b.start - turn.start))[0] ?? null;
}

function nearHand(reading, [x, y]) {
  return reading.handRegions?.some(([l, t, r, b]) =>
    x >= l - 14 && x <= r + 14 && y >= t - 14 && y <= b + 14);
}

function seesDie(reading, center) {
  return reading.dice?.some((die) => die.locationScore >= .14 && distance(die.center, center) < 13);
}

function pickupFrame(turn, pose, raw, stop) {
  if (!pose || pose.centers.length !== 2) return null;
  let touched = [false, false], clear = 0;
  // Count a pickup only when a hand crosses both tracked dice, followed by
  // clear frames where neither settled die remains. Missing frames are neutral.
  const start = Math.max(turn.start, pose.end - 16);
  for (let f = start; f < stop; f++) {
    const reading = raw[f];
    if (!reading) {
      clear = 0;
      continue;
    }
    const seen = pose.centers.map((c) => seesDie(reading, c));
    const hands = pose.centers.map((c) => nearHand(reading, c));
    touched = touched.map((t, i) => hands[i] || (t && !seen[i]));
    clear = !hands.some(Boolean) && !seen.some(Boolean) ? clear + 1 : 0;
    if (f >= pose.end && touched.every(Boolean) && clear >= 8) return f - clear + 1;
  }
  return null;
}

function stableResults(raw, start, stop) {
  const candidates = [];
  let last = null;
  for (let f = start; f < stop; f++) {
    const position = observedBoard(raw[f]);
    if (!position) continue;
    const key = keyFor(position);
    if (last?.key === key && f - last.last <= 3) {
      last.count++;
      last.last = f;
    } else {
      last = { key, position, first: f, last: f, count: 1 };
      candidates.push(last);
    }
  }
  return candidates.filter(({ count }) => count >= 5);
}

function chooseRoll(turn, pose, raw, next, stop) {
  if (!turn.before || turn.reviewedPose || turn.evidence === 'reviewed-neighboring-frames') return null;
  const before = record(turn.before);
  const player = Number(turn.player === 'dark');
  const at = turn.pickupFrame ?? pose?.end;
  const options = [];
  if (turn.after && turn.resultFrame !== null) {
    options.push({ position: turn.after, first: turn.resultFrame, count: 5 });
  }
  // A completed move can be attributed from late board evidence when a
  // pickup is seen or when the next opposing roll pins down its endpoint.
  if (turn.pickupFrame !== null || (next && next.player !== turn.player && next.start - turn.end <= 125)) {
    const start = Math.max(turn.start + 3, (at ?? turn.end) - 26);
    options.push(...stableResults(raw, start, stop).reverse());
  }
  const seen = new Set();
  for (const result of options) {
    const key = keyFor(result.position);
    if (seen.has(key)) continue;
    seen.add(key);
    let possible;
    try {
      possible = matchingTurns(before, record(result.position), rolls, player);
    } catch {
      continue;
    }
    if (!possible.length) continue;
    const pair = possible.find((p) => sameRoll(p.dice, turn.dice));
    const visual = pose?.dice?.some(Boolean) ? pose.dice :
      turn.dice?.[1] === null ? turn.dice : null;
    const possibleWithVisible = visual
      ? possible.filter((p) => visual.filter(Boolean).every((die) => p.dice.includes(die)))
      : [];
    const measured = pair && (pose?.quality >= .82 || !at ||
      turn.evidence.includes('legal-observed-result'));
    const pick = possible.length === 1 ? possible[0] :
      possibleWithVisible.length === 1 ? possibleWithVisible[0] : measured ? pair : null;
    if (pick) return { dice: pick.dice, result, inferred: !measured || !sameRoll(pick.dice, turn.dice) };
    // The played move can disprove an earlier weak reading without exposing
    // two faces. Report only a die shared by every possible legal roll.
    if (pair) return null;
    const faces = [...new Set(possible[0].dice)].filter((value) =>
      possible.every((p) => p.dice.includes(value)));
    return { dice: [faces[0] ?? null, null], result: null, inferred: true };
  }
  return null;
}

function faceConsensus(turn, pose, raw) {
  if (turn.dice?.every(Number.isInteger) || turn.reviewedPose) return null;
  const side = turn.player === 'dark';
  const clusters = (pose?.centers ?? turn.centers ?? []).map((center) => ({ center, faces: new Map() }));
  const expectedCenters = clusters.length;
  const last = Math.min(turn.end, pose?.end ?? turn.end);
  const first = Math.max(turn.start, last - 180);
  for (let f = first; f <= last; f++) {
    const reading = raw[f];
    if (!reading) continue;
    const used = new Set();
    for (const die of reading.dice ?? []) {
      if (die.score < .65 || die.locationScore < .19 || nearHand(reading, die.center)) continue;
      if (!expectedCenters && (die.center[0] >= 299) !== side) continue;
      let cluster = clusters.find((c) => distance(c.center, die.center) < 10);
      if (!cluster) {
        if (expectedCenters) continue;
        cluster = { center: die.center, faces: new Map() };
        clusters.push(cluster);
      }
      if (used.has(cluster)) continue;
      used.add(cluster);
      const value = die.value ?? die.candidateValue;
      if (value < 1 || value > 6) continue;
      const vote = cluster.faces.get(value) ?? { weight: 0, count: 0, settled: 0 };
      vote.weight += die.score ** 2;
      vote.count++;
      vote.settled += Number(die.value === value);
      cluster.faces.set(value, vote);
    }
  }
  const found = clusters.flatMap(({ faces, center }) => {
    const [best] = [...faces].sort((a, b) => b[1].weight - a[1].weight);
    if (!best) return [];
    const [value, tally] = best;
    const total = [...faces.values()].reduce((sum, v) => sum + v.weight, 0);
    if (tally.count < 10 || tally.weight / total < .83 || tally.settled < 3) return [];
    return [{ value, center }];
  });
  if (found.length !== 2 || distance(found[0].center, found[1].center) < 15) return null;
  const votes = found.map(({ value }) => value).sort((a, b) => a - b);
  if (turn.dice?.some((value) => value && !votes.includes(value))) return null;
  return votes;
}

function makeDecision(turn, previous, cube, correction) {
  if (!turn.before || !turn.dice?.every(Number.isInteger)) return null;
  const centered = cube?.stake === 1 && cube.side === 'centered' ? cube : null;
  if (previous && sameRoll(previous.dice, turn.dice) && !correction &&
      Boolean(centered) === (previous.context === 'money-cube-centered-at-one')) return previous;
  const player = Number(turn.player === 'dark');
  const board = stateFor(turn.before, player, turn.dice, centered);
  const result = turn.after ? keyFor(turn.after) : null;
  const actions = legalTurns(board).map((item) => ({
    key: item.key, notation: notation(item.steps, player), steps: item.steps,
    xgid: toXGID({ ...item.state, phase: 'roll', dice: [] }, { engine: true }),
    isPlayed: item.key === result,
  }));
  return {
    ...previous, player: turn.player, dice: turn.dice,
    startFrame: turn.start, endFrame: turn.end,
    startSeconds: turn.start / 25, endSeconds: turn.end / 25,
    observedResultFrame: turn.resultFrame,
    evidence: turn.evidence, cube: centered,
    context: centered ? 'money-cube-centered-at-one' : 'cubeless-ownership-or-stake-unresolved',
    equityUnits: centered ? 'normalized cube equity' : 'cubeless equity',
    xgid: toXGID(board), actions, legalCandidates: actions.length,
    countedInGameLoss: Boolean(previous?.countedInGameLoss && !correction && actions.some((a) => a.isPlayed)),
  };
}

function legalBoards(turn, player) {
  const board = stateFor(turn.before, player, turn.dice);
  const nodes = new Map();
  function node(state, remaining) {
    const key = boardKey(state) + '|' + remaining.join('');
    if (!nodes.has(key)) nodes.set(key, {
      points: state.points, board: boardKey(state), remaining: remaining.length, links: new Set(),
    });
    return nodes.get(key);
  }
  const dice = turn.dice[0] === turn.dice[1] ? Array(4).fill(turn.dice[0]) : [...turn.dice];
  const root = node(board, dice);
  for (const { steps } of legalPaths(board)) {
    let rolling = board, current = root;
    const remaining = [...dice];
    for (const step of steps) {
      rolling = applyStep(rolling, step, player);
      remaining.splice(remaining.indexOf(step.die), 1);
      const after = node(rolling, remaining);
      current.links.add(after);
      current = after;
    }
  }
  return root;
}

function descendants(root, map) {
  for (const next of root.links) {
    if (!map.has(next.board)) map.set(next.board, new Set());
    const entries = map.get(next.board);
    if (entries.has(next)) continue;
    entries.add(next);
    descendants(next, map);
  }
}

function partialRead(node, board, reading) {
  if (!reading.points) return false;
  let changed = 0;
  for (let i = 0; i < 24; i++) {
    if (node.points[i] === board.points[i]) continue;
    changed++;
    const counts = reading.points[i];
    if (reading.occludedPoints?.includes(i + 1) || !counts || (counts[0] > 0 && counts[1] > 0)) return false;
    const observed = counts[0] - counts[1], expected = node.points[i];
    const saturated = Math.abs(observed) === 5 && Math.abs(expected) >= 5 &&
      Math.sign(observed) === Math.sign(expected);
    if (observed !== expected && !saturated) return false;
  }
  // Require a corresponding source and destination for partial observations.
  return changed >= 2;
}

function pointMotion(turn, raw, rows, boardAt, adjustments) {
  const stop = Math.min(turn.end + 1, turn.resultFrame ?? Infinity, rows.length);
  if (!turn.before || !turn.dice?.every(Number.isInteger) || stop <= turn.start + 2) return 0;
  let current = legalBoards(turn, Number(turn.player === 'dark'));
  const start = current;
  let reachable = new Map(), count = 0;
  let pending = null, since = 0, last = -10;
  const refresh = (nodes) => {
    reachable = new Map();
    for (const node of nodes) descendants(node, reachable);
  };
  refresh([current]);
  for (let f = turn.start; f < stop; f++) {
    const reading = raw[f];
    if (reading && reachable.size) {
      let candidate;
      if (reading.position) {
        candidate = keyFor(reading.position);
      } else {
        const matches = [...current.links].filter((node) => partialRead(node, current, reading));
        if (matches.length && matches.every((node) => node.board === matches[0].board)) candidate = matches[0].board;
      }
      const nodes = reachable.get(candidate);
      if (nodes) {
        if (candidate !== pending || f - last > 2) {
          pending = candidate;
          since = f;
        } else if (f - since >= 1) {
          current = [...nodes][0];
          refresh(nodes);
          count++;
          pending = null;
          for (let fill = since; fill < f; fill++) writePoints(fill);
        }
        last = f;
      } else if (candidate) pending = null;
    }
    writePoints(f);
  }
  return count;

  function writePoints(f) {
    if (current === start) return;
    const position = boardAt(rows[f].position);
    if (position && signed(position).every((value, i) => value === current.points[i])) return;
    adjustments[f] = current.points;
  }
}

function recoverTurns(game, evidence, raw) {
  const existing = [...game.turns];
  const found = [];
  const available = (start, end) => ![...existing, ...found].some((turn) =>
    start <= turn.end && end >= turn.start);
  const legal = (before, result, player) => {
    try { return matchingTurns(record(before.position), record(result.position), rolls, player); }
    catch { return []; }
  };

  for (const pair of evidence.pairs) {
    if (pair.opening || !available(pair.start, pair.end)) continue;
    if (blockedByCut(pair.start, pair.end, evidence.breaks) !== pair.end) continue;
    const player = Number(pair.player === 'dark');
    const before = stableResults(raw, Math.max(0, pair.start - 80), pair.start + 3).at(-1);
    const limit = Math.min(raw.length, pair.end + 38,
      existing.find((r) => r.start > pair.end)?.start ?? raw.length);
    const after = stableResults(raw, Math.max(pair.start + 4, pair.end - 55), limit).at(-1);
    const possible = before && after ? legal(before, after, player) : [];
    const visualMatch = possible.find((p) => sameRoll(p.dice, pair.dice));
    const preferred = (pair.quality >= .84 && visualMatch) || (possible.length === 1 && possible[0]);
    const faces = preferred ? preferred.dice : pair.dice;
    if (!preferred && (!faces.every(Number.isInteger) || pair.quality < .85)) continue;
    found.push({
      ...pair, dice: faces, before: before?.position ?? null,
      after: preferred ? after.position : null, steps: preferred?.steps,
      resultFrame: preferred && after.first <= pair.end ? after.first : null,
      evidence: preferred && !sameRoll(faces, pair.dice) ? 'roll-inferred-from-moves' : 'recovered-settled-dice',
    });
  }

  const boards = stableResults(raw, 0, raw.length);
  for (let i = 1; i < boards.length; i++) {
    const before = boards[i - 1], after = boards[i];
    if (after.first - before.last > 28 || before.count < 7 || after.count < 9) continue;
    const start = Math.max(before.first, before.last - 12), end = after.first + 10;
    if (!available(start, end) || blockedByCut(start, end, evidence.breaks) !== end) continue;
    const possible = legal(before, after, null);
    if (possible.length !== 1) continue;
    const played = possible[0];
    found.push({
      start, end, player: played.player === 0 ? 'white' : 'dark', dice: played.dice,
      before: before.position, after: after.position, resultFrame: after.first, steps: played.steps,
      evidence: 'roll-inferred-from-moves',
    });
  }
  return found.sort((a, b) => a.start - b.start);
}

function blockedByCut(start, stop, cuts) {
  return cuts.find((f) => f > start && f <= stop) ?? stop;
}

function applyCubeReview(game, rows, raw, review, solver) {
  const { start, end, offerer, response, receiverSide } = review;
  const responder = offerer === 'white' ? 'dark' : 'white';
  const reference = stableResults(raw, Math.max(0, start - 90), start + 90)
    .sort((a, b) => Math.abs(a.last - start) - Math.abs(b.last - start))[0]?.position;
  let evaluation = { options: null, offerEvLoss: null };
  if (reference) {
    try {
      const state = initialState({
        points: signed(reference), bar: reference.bar, off: reference.borneOff,
        turn: Number(offerer === 'dark'), phase: 'roll', matchLength: 0,
        cube: { value: 1, owner: null }, rules: { cube: true, jacoby: false, immediateRedoubles: 0 },
      });
      const result = solver.analyze(state, 'research', 'cube');
      const [noDouble, take, pass] = result.outcomes;
      const offered = Math.min(take, pass);
      evaluation = {
        preset: result.settings, position: reference, options: { noDouble, take, pass },
        recommendation: offered >= noDouble ? 'Double' : 'No double',
        bestReply: take <= pass ? 'Take' : 'Pass', offerEvLoss: Math.max(0, noDouble - offered),
        outcomeProbabilities: exclusive(result.probabilities),
      };
    } catch (error) {
      console.error('Cube evaluation unavailable in game', game.game, error.message);
    }
  }
  for (const row of rows) {
    const evidence = 'reviewed-offer-tracked-across-frames';
    if (row.frame < start) {
      row.cube = { stake: 1, side: 'centered', offered: null, evidence };
    } else if (row.frame < end) {
      row.cube = { stake: 1, side: 'playing-surface', offered: 2, evidence };
      row.roll = row.turn = null;
      row.phase = 'cube-response';
      row.player = responder;
      row.actorEvidence = evidence;
      row.decision = 'cube';
    } else {
      row.cube = { stake: response === 'take' ? 2 : null, face: 2, side: receiverSide,
        offered: null, evidence, response };
      if (row.frame < end + 45 && row.turn === null) {
        row.phase = 'cube-result';
        row.player = responder;
        row.actorEvidence = evidence;
        row.decision = 'cube';
        row.roll = null;
      }
    }
  }
  return {
    ...evaluation, kind: 'cube', startFrame: start, endFrame: end,
    preOfferStake: 1, offeredFace: 2, offerer, responder, reply: response,
  };
}

function refine(number, solver, reviewedCube, reviewedRolls) {
  const prefix = 'game-' + String(number).padStart(2, '0');
  const game = read(baseline, prefix + '-game.json');
  const evidence = read(observations, prefix + '-observations.json');
  const rows = rowsFrom(path.join(baseline, prefix + '-state.jsonl.gz'));
  const recording = read(vision, 'game-' + number + '-analysis.json');
  const raw = [];
  for (const part of recording.segments) {
    const clip = rowsFrom(path.join(visionStateDir, part.source.replace(/\.mp4$/, '.jsonl.gz')));
    for (const row of clip.slice(part.firstFrame, part.lastExclusive)) raw.push(row.state);
  }
  const source = reviewedCube && recording.segments.findLast((segment) =>
    segment.firstGameFrame <= reviewedCube.start)?.source;
  const matchedCubeReview = source && source === reviewedCube.source;
  const cubeOffer = matchedCubeReview
    ? applyCubeReview(game, rows, raw, reviewedCube, solver)
    : game.decisions.cube;
  const decisions = {};
  const adjustments = {};
  const pickups = [];
  const recovered = recoverTurns(game, evidence, raw);
  let inferredRolls = 0, withheldRolls = 0, opticalRolls = 0, reviewedChanges = 0, fastSteps = 0;
  const ordered = [...game.turns, ...recovered].map((turn, i) => ({ turn, id: i + 1 }))
    .sort((a, b) => a.turn.start - b.turn.start);
  game.turns.push(...recovered);
  for (const [i, { turn, id }] of ordered.entries()) {
    const next = ordered[i + 1]?.turn;
    const pose = poseFor(turn, evidence.pairs);
    const stop = blockedByCut(turn.start,
      Math.min(next?.start ?? rows.length, Math.max(turn.end, pose?.end ?? 0) + 62), evidence.breaks);
    const verifiedPickup = footprintPickup(turn, stop);
    turn.pickupFrame = verifiedPickup ?? pickupFrame(turn, pose, raw, stop);
    if (turn.pickupFrame !== null) pickups.push({ frame: turn.pickupFrame, actor: turn.player });
    if (!turn.before) {
      turn.before = stableResults(raw, Math.max(0, turn.start - 48), turn.start + 2).at(-1)?.position ?? null;
    }
    const review = reviewedRolls.find(({ clip, first }) => rows.slice(turn.start, turn.end + 1)
      .some((row) => row.clip === clip && row.sourceFrame === first));
    const optics = verifiedPickup === null && faceConsensus(turn, pose, raw);
    const update = review ? { dice: review.dice, reviewed: true } :
      verifiedPickup !== null ? null : chooseRoll(turn, pose, raw, next, stop) ??
      (optics ? { dice: optics, result: null, optical: true } : null);
    const changed = update && !sameRoll(update.dice, turn.dice);
    const oldResult = turn.resultFrame;
    if (update?.result && update.result.first >= turn.start && update.result.first <= turn.end) {
      turn.after = update.result.position;
      turn.resultFrame = update.result.first;
    }
    if (changed) {
      turn.dice = update.dice;
      if (update.reviewed && turn.before && turn.after) {
        const result = matchingTurns(record(turn.before), record(turn.after), [turn.dice],
          Number(turn.player === 'dark'))[0];
        if (!result) {
          turn.after = turn.steps = turn.resultFrame = null;
        } else turn.steps = result.steps;
      }
      turn.evidence = update.reviewed ? 'reviewed-neighboring-frames' : update.optical ? 'repeated-die-face-reads' : update.dice.every(Number.isInteger)
        ? 'roll-inferred-from-moves' : 'legal-roll-values-ambiguous';
      if (update.reviewed) reviewedChanges++;
      else if (update.optical) opticalRolls++;
      else if (update.dice.every(Number.isInteger)) inferredRolls++;
      else withheldRolls++;
    }
    const decision = makeDecision(turn, game.decisions[id], rows[turn.start]?.cube,
      Boolean(changed || oldResult !== turn.resultFrame));
    if (decision) decisions[id] = decision;
    fastSteps += pointMotion(turn, raw, rows, (id) => game.positions[id], adjustments);
  }
  for (const turn of recovered) {
    const id = game.turns.indexOf(turn) + 1;
    for (let f = turn.start; f <= turn.end; f++) {
      const row = rows[f];
      if (row.turn !== null || row.phase === 'cube-response' || row.phase === 'game-closed') continue;
      row.turn = id;
      row.roll = { id, player: turn.player, dice: turn.dice, status: 'current', evidence: turn.evidence };
      row.player = turn.player;
      row.actorEvidence = turn.evidence;
      row.phase = 'move';
    }
    // Carry the roll into genuine idle frames until the next roll starts.
    for (let f = turn.end + 1; f < rows.length; f++) {
      const row = rows[f];
      if (row.turn !== null || row.phase === 'cube-response' || row.phase === 'game-closed') break;
      row.roll = { id, player: turn.player, dice: turn.dice, status: 'last', evidence: turn.evidence };
    }
  }
  if (cubeOffer) decisions.cube = cubeOffer;
  if (matchedCubeReview && cubeOffer.offerEvLoss !== null) {
    game.losses = game.losses.filter(({ kind }) => kind !== 'cube');
    game.losses.push({ frame: cubeOffer.startFrame, player: cubeOffer.offerer, loss: cubeOffer.offerEvLoss, kind: 'cube' });
  }
  game.decisions = decisions;
  for (const row of rows) {
    const latest = row.roll ? game.turns[row.roll.id - 1] : null;
    if (latest) {
      row.roll.dice = latest.dice;
      row.roll.evidence = latest.evidence;
    }
    if (row.turn && (row.phase === 'move' || row.phase === 'played')) {
      const turn = game.turns[row.turn - 1];
      row.phase = turn.resultFrame !== null && row.frame >= turn.resultFrame ? 'played' : 'move';
      row.decision = row.roll?.status === 'current' && decisions[row.turn] ? row.turn : null;
    }
    if (row.phase === 'pre-roll') {
      const hasPickup = latest && latest.player !== row.player &&
        latest.pickupFrame !== null && latest.pickupFrame <= row.frame;
      if (!hasPickup) {
        row.phase = 'between-rolls';
        row.player = null;
        row.actorEvidence = null;
      } else row.actorEvidence = 'opponent-dice-picked-up';
    }
    if (adjustments[row.frame]) row.displayPoints = adjustments[row.frame];
  }
  fs.writeFileSync(path.join(output, prefix + '-game.json'), JSON.stringify(game));
  fs.writeFileSync(path.join(output, prefix + '-state.jsonl.gz'),
    gzipSync(rows.map((r) => JSON.stringify(r)).join('\n') + '\n'));
  console.log(JSON.stringify({ game: number, observedPickups: pickups.length, recoveredTurns: recovered.length, inferredRolls, opticalRolls, reviewedChanges, withheldRolls, cubeOffers: Number(Boolean(cubeOffer)),
    fastSteps, adjustedFrames: Object.keys(adjustments).length }));
}

const numbers = process.argv.slice(2).map(Number);
if (numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 5)) throw new Error('Use game numbers 1–5');
fs.mkdirSync(output, { recursive: true });
const solver = await loadEvaluator();
const reviewedCubes = JSON.parse(fs.readFileSync(new URL('./reviewed_cube_offers.json', import.meta.url)));
const reviewedRolls = JSON.parse(fs.readFileSync(new URL('./reviewed_rolls.json', import.meta.url)))
  .filter((item) => item.sourceFrameReview);
for (const number of numbers.length ? numbers : [1, 2, 3, 4, 5]) {
  refine(number, solver, reviewedCubes[number], reviewedRolls);
}
