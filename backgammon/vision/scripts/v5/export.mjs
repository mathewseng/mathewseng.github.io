#!/usr/bin/env bun
/**
 * Export the site data for one session page: frame state, Library history and a
 * short vision report per game. Frames are relative to each rendered video.
 *
 * usage: bun export.mjs <analysis-dir> <render-dir> <site-page-dir> <game...>
 */
import fs from 'node:fs';
import path from 'node:path';
import { initialState, transition, positionKey, boardKey, commitTurn } from '../../../core/rules.mjs';

const [analysisDir, renderDir, pageDir, ...games] = process.argv.slice(2);
const SIDE = { white: 0, dark: 1 }, NAME = { white: 'White', dark: 'Black' };
import { RULES } from './scoring.mjs';
const ENGINE = 'gnubg-core/955555c69adebb1d7de23abc1018074158621168+bg10';
const SETTINGS = { name: 'Research', plies: 4, cubeful: true, pruning: true, deterministic: true, noise: 0, finalists: 4, threshold: 0.04 };
// The session comes from the page folder (backgammon/vision/YYYY-MM-DD, or YYYY-MM-DD-pm for a second recording
// that day, shown as "Nov 24 PM"); Nov 21 keeps its published ids and dates.
const SESSION = path.basename(path.resolve(pageDir));
const [YEAR, MONTH, DAY] = SESSION.split('-').map(Number), SUFFIX = SESSION.split('-')[3];
const SHORT = new Date(Date.UTC(YEAR, MONTH - 1, DAY)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) +
  (SUFFIX ? ` ${SUFFIX.toUpperCase()}` : '');
const DATE = `${SHORT}, ${YEAR}`, CREATED = SESSION === '2026-11-21' ? Date.UTC(2026, 10, 22) : Date.UTC(YEAR, MONTH - 1, DAY + 1);
const ITEM = g => `office3-${SESSION.replaceAll('-', '')}-game-${g}`;
for (const dir of ['state', 'history', 'reports']) fs.mkdirSync(path.join(pageDir, dir), { recursive: true });

function checkerResult(source, t) {
  // Opening-book plays keep the book's own result (method, provenance, credits), as the bot stores them.
  if (t.analysis.result) {
    const { requestId, elapsedMs, ...book } = t.analysis.result;
    return { ...book, positionKey: positionKey(source), cached: true };
  }
  // Candidates carry their steps (present_moves.mjs adds them to older analyses).
  const cand = t.analysis.candidates.filter(c => c.steps).map(c => ({ steps: c.steps, notation: c.notation,
    key: boardKey(commitTurn(source, c.steps)), equity: c.equity, probabilities: c.probabilities, cubeless: c.equity }));
  const playedState = commitTurn(source, t.steps);
  const actual = { steps: t.steps, notation: t.analysis.played.notation, key: boardKey(playedState), equity: t.analysis.played.equity,
    probabilities: t.analysis.played.probabilities, cubeless: t.analysis.played.equity };
  if (!cand.some(c => c.key === actual.key)) cand.push(actual);
  return { type: 'checker', status: 'complete', engine: ENGINE, positionKey: positionKey(source), settings: SETTINGS,
    perspective: source.turn, units: 'current-cube-points', candidates: cand, actual, evaluatedCount: t.analysis.legalMoves };
}

function cubeResult(source, cd) {
  return { type: 'cube', status: 'complete', engine: ENGINE, positionKey: positionKey(source), settings: SETTINGS, perspective: source.turn,
    units: 'current-cube-points', probabilities: cd.probabilities, cubeless: cd.equity, equity: cd.equity, outcomes: cd.outcomes,
    decisionOptions: cd.options, action: cd.best };
}

for (const g of games.map(Number)) {
  const id = String(g).padStart(2, '0');
  const A = JSON.parse(fs.readFileSync(path.join(analysisDir, `game-${id}.json`), 'utf8'));
  const range = JSON.parse(fs.readFileSync(path.join(renderDir, `game-${id}.range.json`), 'utf8'));
  const vf = f => Math.max(0, Math.min(range.frames - 1, f - range.first));
  // ---- Library history -----------------------------------------------------
  let state = initialState({ matchLength: 0, rules: RULES, gameNumber: g });
  if (A.fragment) {
    // A game recorded from the middle starts at its first complete view, before the first decoded roll.
    const b = A.turns[0].before, c = A.initialCube ?? { value: 1, owner: null };
    state = { ...state, points: [...b.points], bar: [...b.bar], off: [...b.off], turn: SIDE[A.turns[0].player], phase: 'roll',
      cube: { value: c.value, owner: c.owner ?? null } };
  }
  let initial = structuredClone(state), events = [], itemId = ITEM(g);
  const timeline = [], rolls = [], actions = [], done = [];
  let cubeOffer = null;
  const loss = { white: { checker: 0, cube: 0 }, dark: { checker: 0, cube: 0 } };
  const notes = [];
  for (const [i, t] of A.turns.entries()) {
    const s = SIDE[t.player], q = t.player === 'white' ? 'dark' : 'white';
    // Same roll timing as the renderer: the tracked dice, else two seconds before the checkers moved.
    const prevEnd = i ? A.turns[i - 1].resultFrame + 50 : range.first;
    const rollRaw = t.rollFrame ?? Math.max(prevEnd + 25, (t.fromFrame ?? t.resultFrame) - 50);
    const rollAt = vf(Math.min(Math.max(rollRaw, prevEnd + 1), t.resultFrame)), resultAt = vf(t.resultFrame);
    if (t.gapBefore) {
      // decode2 resumed after turns it never saw: the history cannot continue as legal play.
      const at = f => `${Math.floor(f / 1500)}:${String(Math.floor(f / 25) % 60).padStart(2, '0')}`;
      notes.push(`Turn ${i + 1} (${NAME[t.player]}): turns between ${at(t.gapBefore.fromFrame)} and ${at(t.fromFrame ?? t.resultFrame)} were not seen, so the history stops here; the replay continues.`);
      break;
    }
    try {
      if (state.phase === 'opening') {
        if (!t.roll || t.roll[0] === t.roll[1]) throw new Error('opening roll unknown');
        const [hi, lo] = [Math.max(...t.roll), Math.min(...t.roll)];
        const dice = s === 0 ? [hi, lo] : [lo, hi];
        events.push({ action: { type: 'opening', dice }, actor: state.turn, videoFrame: rollAt });
        state = transition(state, { type: 'opening', dice });
      } else {
        if (t.cubeAction) {
          const cd = t.cubeDecision;
          const ev = { action: { type: 'double' }, actor: s, videoFrame: vf(t.cubeAction.offerFrame) };
          if (cd) ev.evaluation = { result: cubeResult(state, cd) };
          events.push(ev);
          timeline.push({ frame: vf(t.cubeAction.offerFrame), rollFrame: vf(t.cubeAction.offerFrame), endFrame: vf(t.cubeAction.replyFrame ?? t.cubeAction.offerFrame + 50),
            turn: i + 1, kind: 'cube', checkpoint: false, item: itemId, event: events.length - 1 });
          state = transition(state, { type: 'double' }, s);
          const opts = { take: null, pass: null };
          for (const o of t.cubeAction.responses ?? []) opts[o.action] = o.equity;
          const offered = (t.cube.value) * 2;
          cubeOffer = { start: vf(t.cubeAction.offerFrame), player: t.player, offered, reply: t.cubeAction.reply, responseFrame: vf(t.cubeAction.replyFrame ?? t.cubeAction.offerFrame) };
          const cdo = Object.fromEntries((cd?.options ?? []).map(o => [o.action, o.equity]));
          const dl = cd ? Math.max(0, Math.max(...Object.values(cdo)) - cdo.double) : null;
          if (dl != null) loss[t.player].cube += dl;
          actions.push({ frame: cubeOffer.start, player: t.player, kind: 'cube', label: `doubles to ${offered}`, equity: cdo.double ?? null, loss: dl });
          if (t.cubeAction.reply) {
            const reply = t.cubeAction.reply;
            const best = Math.min(opts.take ?? Infinity, opts.pass ?? Infinity);
            const rl = opts[reply] != null ? Math.max(0, opts[reply] - best) : null;
            if (rl != null) loss[q].cube += rl;
            events.push({ action: { type: reply }, actor: 1 - s, videoFrame: cubeOffer.responseFrame });
            actions.push({ frame: cubeOffer.responseFrame, player: q, kind: `cube-${reply}`, label: `${reply}s`, equity: opts[reply] != null ? -opts[reply] : null, loss: rl });
            state = transition(state, { type: reply }, 1 - s);
            if (reply === 'pass') break;
          }
        } else if (t.cubeDecision && !t.cubeOnly) {
          const cdo = Object.fromEntries(t.cubeDecision.options.map(o => [o.action, o.equity]));
          const l = Math.max(0, Math.max(...Object.values(cdo)) - cdo.roll);
          loss[t.player].cube += l;
          if (l > 0) actions.push({ frame: rollAt, player: t.player, kind: 'cube', label: 'rolls without doubling', equity: cdo.roll, loss: l });
        }
        if (t.cubeOnly) continue;
        if (!t.roll) throw new Error('roll unknown');
        const ev = { action: { type: 'roll', dice: t.roll }, actor: s, videoFrame: rollAt };
        if (t.cubeDecision && !t.cubeAction) ev.evaluation = { result: cubeResult(state, t.cubeDecision) };
        events.push(ev);
        if (t.cubeDecision && !t.cubeAction)
          timeline.push({ frame: rollAt, rollFrame: rollAt, endFrame: resultAt, turn: i + 1, kind: 'cube', checkpoint: false, item: itemId, event: events.length - 1 });
        state = transition(state, { type: 'roll', dice: t.roll }, s);
      }
      rolls.push({ start: rollAt, player: t.player, dice: t.roll, pickup: t.pickupFrame ? vf(t.pickupFrame) : null, resultFrame: resultAt, source: t.rollSource });
      if (t.dance) {
        events.push({ action: { type: 'move', steps: [] }, actor: s, videoFrame: resultAt });
        actions.push({ frame: resultAt, player: t.player, kind: 'checker', label: 'cannot enter', equity: null, loss: null });
        state = transition(state, { type: 'move', steps: [] }, s);
        continue;
      }
      if (t.irregular) {
        // The players moved in a way no roll plays (rechain_turns.mjs "irregular"). The history keeps the roll and shows
        // the move as irregular play; the game continues in a second item from the board as the players left it.
        timeline.push({ frame: resultAt, rollFrame: rollAt, endFrame: resultAt + 50, turn: i + 1, kind: 'irregular', player: t.player,
          dice: t.roll, label: `Irregular play: ${t.irregular.played}`, note: t.irregular.note });
        actions.push({ frame: resultAt, player: t.player, kind: 'irregular', label: `irregular play ${t.irregular.played}`, equity: null, loss: null });
        notes.push(`Turn ${i + 1} (${NAME[t.player]}): irregular play ${t.irregular.played} on ${t.roll.join('-')}; the history continues from the board as left.`);
        done.push({ id: itemId, initial, state, events, note: ` It stops at ${NAME[t.player]}’s irregular play (${t.irregular.played} on ${t.roll.join('-')}); the next part continues from the board as the players left it.` });
        const a = t.after;
        state = { ...state, points: [...a.points], bar: [...a.bar], off: [...a.off], turn: 1 - s, phase: 'roll', dice: [] };
        initial = structuredClone(state); events = []; itemId = `${ITEM(g)}-part-${done.length + 1}`;
        continue;
      }
      if (!t.steps) throw new Error('move unknown');
      const res = t.analysis ? checkerResult(state, t) : null;
      const ev = { action: { type: 'move', steps: t.steps }, actor: s, videoFrame: resultAt };
      if (res) ev.evaluation = { result: res };
      events.push(ev);
      timeline.push({ frame: resultAt, rollFrame: rollAt, endFrame: resultAt + 50, turn: i + 1, kind: 'checker', checkpoint: false, item: itemId, event: events.length - 1,
        ...(t.rollSource === 'ambiguous' ? { note: 'Several rolls fit this move; the dice were not readable.' } : t.inferred ? { note: 'Move inferred between camera views.' } : {}) });
      const graded = ['move', 'dice', 'reviewed'].includes(t.rollSource) && !t.inferred;
      if (t.analysis && graded) loss[t.player].checker += t.analysis.evLoss;
      if (t.analysis) actions.push({ frame: resultAt, player: t.player, kind: 'checker', label: `played ${t.analysis.played.notation}`, equity: t.analysis.played.equity, loss: graded ? t.analysis.evLoss : null });
      state = transition(state, { type: 'move', steps: t.steps }, s);
    } catch (err) {
      notes.push(`Turn ${i + 1} (${NAME[t.player]}): ${err.message}`);
      break;
    }
  }
  const result = A.result;
  const makeItem = (part, k) => ({ version: 1, kind: 'match', id: part.id, title: `Office-3 ${SHORT} · Game ${g}${k ? ` · part ${k + 1}` : ''}`, collection: `Office-3 · ${DATE}`,
    tags: ['office-3', 'video'], createdAt: CREATED, updatedAt: CREATED, notes: `Reconstructed from the ${SHORT} Office-3 recording (orange board).${A.fragment && !k ? ' The recording starts in the middle of this game; earlier moves were not recorded.' : ''}${k ? ' Continued from the board as the players left it after irregular play.' : ''}${part.note ?? ''}`,
    initial: part.initial, state: part.state, events: part.events, names: ['White', 'Black'], gameNumber: g, gameCount: 1, status: part.state.phase === 'over' ? 'game-complete' : 'in-progress' });
  const parts = [...done, { id: itemId, initial, state, events }], items = parts.map(makeItem);
  const lossBreakdown = ['white', 'dark'].map(p => ({ checkerLoss: loss[p].checker, cubeLoss: loss[p].cube }));
  fs.writeFileSync(path.join(pageDir, 'history', `game-${id}.json`), JSON.stringify({ version: 1, format: 'backgammon-library', progress: [], items,
    replay: { game: g, frameData: true, timeline, losses: lossBreakdown.map(l => l.checkerLoss + l.cubeLoss), lossBreakdown } }));
  // ---- frame state ---------------------------------------------------------
  const positions = {}, changes = [];
  const posId = new Map();
  const addPos = (p, onRoll) => {
    const key = JSON.stringify([p.points, p.bar, p.off, onRoll]);
    if (!posId.has(key)) { const n = posId.size + 1; posId.set(key, n); positions[n] = { points: p.points, bar: p.bar, borneOff: p.off, onRoll, source: 'legal-reconstruction', equities: null }; }
    return posId.get(key);
  };
  let cube = A.initialCube ? { value: A.initialCube.value, owner: A.initialCube.owner == null ? null : A.initialCube.owner === 0 ? 'white' : 'dark' } : { value: 1, owner: null };
  let before = A.turns[0].before;
  changes.push({ frame: 0, phase: 'opening', position: addPos(before, null), roll: null, player: null, cube: { ...cube } });
  for (const t of A.turns) {
    if (t.cubeAction?.reply === 'take' && t.cubeAfter) cube = { value: t.cubeAfter.value, owner: t.cubeAfter.owner === 0 ? 'white' : 'dark' };
    if (t.roll) changes.push({ frame: rolls.find(r => r.resultFrame === vf(t.resultFrame))?.start ?? vf(t.rollFrame ?? t.resultFrame), phase: 'checker-turn', position: addPos(t.before, t.player), roll: { player: t.player, dice: t.roll, source: t.rollSource }, player: t.player, cube: { ...cube } });
    if (!t.cubeOnly) changes.push({ frame: vf(t.resultFrame), phase: 'between-turns', position: addPos(t.after, null), roll: null, player: t.player, cube: { ...cube } });
  }
  if (result) changes.push({ frame: vf(result.frame), phase: 'over', position: changes.at(-1).position, roll: null, player: null, cube: { ...cube } });
  changes.sort((a, b) => a.frame - b.frame);
  actions.sort((a, b) => a.frame - b.frame);
  fs.writeFileSync(path.join(pageDir, 'state', `game-${id}.json`), JSON.stringify({ format: 'office-3-replay-frames', version: 1, session: SESSION, game: g, fps: 25,
    frames: range.frames, sourceFirstFrame: range.first, result, players: ['white', 'dark'], rolls, cubeOffer, actions, changes, positions }));
  // ---- report ----------------------------------------------------------------
  const real = A.turns.filter(t => !t.cubeOnly);
  const issues = [];
  for (const t of real) {
    if (t.rollSource === 'ambiguous') issues.push({ kind: 'unknown-face', frame: vf(t.rollFrame ?? t.resultFrame), player: t.player, label: `Roll not resolved: ${t.rollCandidates.join(' or ')} fit the move` });
    if (t.irregular) issues.push({ kind: 'irregular-play', frame: vf(t.resultFrame), player: t.player, label: `Irregular play: ${t.irregular.played} on ${t.roll.join('-')}` });
    if (t.inferred) issues.push({ kind: 'unconfirmed-play', frame: vf(t.resultFrame), player: t.player, label: `Move inferred between camera views (${t.inferred})` });
  }
  const counts = { rolls: real.length, completeRolls: real.filter(t => t.roll && t.rollSource !== 'ambiguous').length,
    missingFaces: real.filter(t => !t.roll || t.rollSource === 'ambiguous').length,
    gradedPlays: real.filter(t => t.analysis).length, legalPlays: real.filter(t => t.analysis).length };
  fs.writeFileSync(path.join(pageDir, 'reports', `game-${id}.json`), JSON.stringify({ game: g, fps: 25, counts, issues, reviewed: [],
    issueNames: { 'unknown-face': 'Roll not resolved', 'unconfirmed-play': 'Inferred move', ...(issues.some(x => x.kind === 'irregular-play') ? { 'irregular-play': 'Irregular play' } : {}) }, confirmedPriorMisreads: 0, notes }));
  console.log(`game ${g}: ${events.length} events, ${rolls.length} rolls, notes ${notes.length ? notes.join('; ') : 'none'}`);
}
