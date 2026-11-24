#!/usr/bin/env bun
/**
 * Global turn reconstruction from checker readings (dynamic programming).
 *
 * usage: bun decode2.mjs <obs-dir> <out.json>
 *
 * Stable readings (identical confident readings over consecutive samples)
 * become observations. Within a game, a chain of legal turns must pass through
 * observations; each transition is one turn, or two turns when an
 * intermediate position was never seen (or a player danced). Skipping an
 * observation costs its duration unless it is a partial view of the move in
 * progress. The cheapest chain from the opening position is reported.
 */
import fs from 'node:fs';
import path from 'node:path';
import { legalTurns, boardKey } from '../../../core/rules.mjs';

const [obsDir, outFile] = process.argv.slice(2);
const CONF = 0.9, MIN_RUN = 3, WINDOW = 150, MISS = 12, DANCE = 10;
const minKnown = f => MIN_KNOWN.filter(([from]) => f >= from).at(-1)[1];

// Points that must be read for a stable observation: 21, unless the session's session.json (next
// to the obs dir) lowers it from some frame on, e.g. {"minKnown": [[0, 21], [8530, 19]]} when tall
// stacks and a checker on the bar keep the same few points covered through a bear-off.
// session.json "branchTies": true follows every equally good one-turn result when a reading leaves
// several (a hidden point or a tall stack's lower bound), instead of dropping the reading.
const sessionFile = path.join(path.dirname(path.resolve(obsDir)), 'session.json');
const SESSION = fs.existsSync(sessionFile) ? JSON.parse(fs.readFileSync(sessionFile, 'utf8')) : {};
const MIN_KNOWN = SESSION.minKnown || [[0, 21]];
const KEEP = SESSION.branchTies ? 12 : 4;
// session.json "entered": [[fromFrame, toFrame, "dark"]]: the player was seen leaving the bar then,
// so no dance is decoded for a turn ending in that window.
const ENTERED = SESSION.entered ?? [];
const seenEntering = (p, f) => ENTERED.some(([a, b, who]) => who === PLAYER[p] && f >= a && f <= b);
// session.json "endFrame": readings after it are left out (play that the readings cannot follow);
// "startFrame": readings before it are left out (the board being set up).
const rows = fs.readdirSync(obsDir).filter(f => /^clip-\d+\.json$/.test(f)).sort()
  .flatMap(f => JSON.parse(fs.readFileSync(path.join(obsDir, f), 'utf8'))).filter(r => !(r.f > SESSION.endFrame) && !(r.f < SESSION.startFrame));

const START = [-2, 0, 0, 0, 0, 5, 0, 3, 0, 0, 0, -5, 5, 0, 0, 0, -3, 0, -5, 0, 0, 0, 0, 2];
const pkey = p => p.join(',');
const START_KEY = pkey(START);
const PLAYER = ['white', 'dark'];

// ---- observations -------------------------------------------------------
function observations() {
  const out = []; let cur = null;
  const flush = () => { if (cur && cur.n >= MIN_RUN) out.push(cur); cur = null; };
  for (const r of rows) {
    const known = r.conf.map(c => c >= CONF);
    const nk = known.filter(Boolean).length;
    if (nk < minKnown(r.f)) { if (cur) cur.gap++; if (cur && cur.gap > 3) flush(); continue; }
    const pos = r.pos.map((v, i) => known[i] ? v : null);
    if (cur && pos.every((v, i) => v === null || cur.pos[i] === null || v === cur.pos[i])) {
      for (let i = 0; i < 24; i++) if (cur.pos[i] === null && pos[i] !== null) cur.pos[i] = pos[i];
      cur.n++; cur.f1 = r.f; cur.gap = 0; cur.raw = r.pos; continue;
    }
    flush(); cur = { f0: r.f, f1: r.f, n: 1, gap: 0, pos, raw: r.pos };
  }
  flush();
  for (const o of out) { o.full = o.pos.every(v => v !== null); o.tall = o.pos.some(v => v !== null && Math.abs(v) >= 5); o.key = o.full ? pkey(o.pos) : null; o.w = Math.min(o.n, 60); }
  return out;
}

// ---- legal results ------------------------------------------------------
const rolls = []; for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) rolls.push([b, a]);
const cache = new Map();
function results(s, turn) {
  const ck = `${turn}|${boardKey(s)}`;
  let out = cache.get(ck);
  if (out) return out;
  out = new Map(); let blocked = false;
  for (const dice of rolls) {
    const st = { points: s.points, bar: s.bar, off: s.off, turn, dice, phase: 'move' };
    for (const t of legalTurns(st)) {
      if (!t.steps.length) { blocked = true; continue; }
      const k = pkey(t.state.points);
      const e = out.get(k) ?? { state: { points: t.state.points, bar: t.state.bar, off: t.state.off }, plays: [] };
      e.plays.push({ dice, steps: t.steps }); out.set(k, e);
    }
  }
  out.blocked = blocked;
  if (cache.size > 60000) cache.clear();
  cache.set(ck, out);
  return out;
}

// A reading of five or more checkers is a lower bound: further checkers overlap the stack.
const same = (v, t) => v === t || (Math.abs(v) >= 5 && Math.sign(v) === Math.sign(t) && Math.abs(t) >= Math.abs(v));
const consistent = (o, points) => o.pos.every((v, i) => v === null || same(v, points[i]));
function find(res, o, all = false) {
  if (o.full) { const exact = res.get(o.key); if (exact || !o.tall) return all ? (exact ? [exact] : []) : exact ?? null; }
  // Several results can fit when points are unknown or a tall stack is a lower
  // bound. Prefer the unique result with the most exactly matching points.
  let best = null, bestScore = -1, tie = false, ties = [];
  for (const e of res.values()) {
    if (!consistent(o, e.state.points)) continue;
    let score = 0;
    for (let i = 0; i < 24; i++) if (o.pos[i] !== null && o.pos[i] === e.state.points[i]) score++;
    if (score > bestScore) { best = e; bestScore = score; tie = false; ties = [e]; } else if (score === bestScore) { tie = true; ties.push(e); }
  }
  if (all) return best ? ties : [];
  return tie ? null : best;
}
/** Checkers of player p (sign) on points agree, except p checkers that may have been hit. */
function sideCompatible(points, o, p) {
  const sg = p === 0 ? 1 : -1; let missing = 0;
  for (let i = 0; i < 24; i++) {
    if (o.pos[i] === null) continue;
    const a = Math.max(0, points[i] * sg), b = Math.max(0, o.pos[i] * sg);
    if (a === b || (b >= 5 && a >= b)) continue;
    if (b === 0 && a === 1) { missing++; continue; } // a blot hit in the following turn
    return false;
  }
  return missing <= 2;
}
/** A skipped reading that only differs from the start or end of the transition on changed points. */
function partialOf(o, a, b) {
  for (let i = 0; i < 24; i++) {
    if (o.pos[i] === null) continue;
    if (!same(o.pos[i], a[i]) && !same(o.pos[i], b[i])) {
      // in-motion readings: a count between the two ends
      const lo = Math.min(a[i], b[i]), hi = Math.max(a[i], b[i]);
      if (!(o.pos[i] >= lo - 1 && o.pos[i] <= hi + 1 && a[i] !== b[i])) return false;
    }
  }
  return true;
}

// ---- dynamic programme per game ----------------------------------------
/** Full state for a mid-game first view: missing checkers are on the bar, or
 * borne off once every remaining checker of that side is home. */
function stateFromObservation(points) {
  const bar = [0, 0], off = [0, 0];
  for (const side of [0, 1]) {
    const sg = side ? -1 : 1;
    const onBoard = points.reduce((n, v) => n + Math.max(0, v * sg), 0);
    const missing = 15 - onBoard;
    const allHome = points.every((v, i) => v * sg <= 0 || (side ? i >= 18 : i <= 5));
    if (allHome) off[side] = missing; else bar[side] = missing;
  }
  return { points, bar, off };
}

function decodeGame(obs, g0, g1, fragment = false) {
  // nodes[k] : Map stateKey -> {cost, prev, state, mover, turns}
  const nodes = Array.from({ length: g1 - g0 }, () => new Map());
  const startState = fragment ? stateFromObservation(obs[g0].pos.map((v, i) => v ?? obs[g0].raw[i])) : { points: START, bar: [0, 0], off: [0, 0] };
  nodes[0].set('start', { cost: 0, state: startState, mover: null, turns: [], k: 0 });
  const relax = (k, key, cand) => {
    const cur = nodes[k].get(key);
    if (!cur || cand.cost < cur.cost) nodes[k].set(key, cand);
  };
  for (let k = 0; k < nodes.length; k++) {
    // prune to the best few hypotheses at this observation
    const list = [...nodes[k].values()].sort((a, b) => a.cost - b.cost).slice(0, KEEP);
    for (const node of list) {
      let skipped = 0;
      for (let t = k + 1; t < Math.min(nodes.length, k + 1 + WINDOW); t++) {
        const o = obs[g0 + t];
        const players = node.mover === null ? [0, 1] : [node.mover];
        const S = node.state;
        if (consistent(o, S.points)) {
          // the same position seen again: carry the node forward at no cost
          relax(t, `${node.mover}|${boardKey(S)}`, { ...node, cost: node.cost + skipped, k: t });
          break;
        }
        for (const p of players) {
          const r1 = results(S, p);
          for (const e of SESSION.branchTies ? find(r1, o, true) : [find(r1, o)].filter(Boolean)) {
            const turn = { player: PLAYER[p], fromObs: g0 + node.k, obs: g0 + t, before: S, after: e.state, plays: e.plays };
            relax(t, `${1 - p}|${boardKey(e.state)}`, { cost: node.cost + skippedPartial(obs, g0, node.k, t, S.points, e.state.points, r1),
              state: e.state, mover: 1 - p, turns: [...node.turns, turn], k: t });
          }
          // two turns: p then 1-p (unseen intermediate)
          for (const e1 of r1.values()) {
            if (!sideCompatible(e1.state.points, o, p)) continue;
            const e2 = find(results(e1.state, 1 - p), o);
            if (!e2) continue;
            const t1 = { player: PLAYER[p], fromObs: g0 + node.k, obs: g0 + t, before: S, after: e1.state, plays: e1.plays, inferred: 'unseen' };
            const t2 = { player: PLAYER[1 - p], fromObs: g0 + node.k, obs: g0 + t, before: e1.state, after: e2.state, plays: e2.plays };
            relax(t, `${p}|${boardKey(e2.state)}`, { cost: node.cost + MISS + skippedPartial(obs, g0, node.k, t, S.points, e2.state.points),
              state: e2.state, mover: p, turns: [...node.turns, t1, t2], k: t });
          }
          // dance: p cannot enter, then 1-p moves
          if (S.bar[p] && r1.blocked && !seenEntering(p, o.f0)) {
            const e2 = find(results(S, 1 - p), o);
            if (e2) {
              const t1 = { player: PLAYER[p], fromObs: g0 + node.k, obs: g0 + t, before: S, after: S, plays: [], dance: true };
              const t2 = { player: PLAYER[1 - p], fromObs: g0 + node.k, obs: g0 + t, before: S, after: e2.state, plays: e2.plays };
              relax(t, `${p}|${boardKey(e2.state)}`, { cost: node.cost + DANCE + skippedPartial(obs, g0, node.k, t, S.points, e2.state.points),
                state: e2.state, mover: p, turns: [...node.turns, t1, t2], k: t });
            }
          }
        }
        skipped += o.w;
        // A game over position stops the chain.
        if (S.off[0] === 15 || S.off[1] === 15) break;
      }
    }
  }
  // Best final: minimise cost plus the weight of observations left unexplained after the node.
  const tail = new Array(nodes.length + 1).fill(0);
  for (let k = nodes.length - 1; k >= 0; k--) tail[k] = tail[k + 1] + obs[g0 + k].w;
  let best = null;
  for (let k = 0; k < nodes.length; k++) for (const n of nodes[k].values()) {
    const total = n.cost + tail[k + 1];
    if (!best || total < best.total) best = { ...n, total };
  }
  return best;
}

/** Cost of the readings skipped between two anchors: partial moves and
 * rearrangements within the same turn (other legal results) are cheap. */
function skippedPartial(obs, g0, k, t, a, b, revisions = null) {
  let c = 0;
  for (let i = k + 1; i < t; i++) {
    const o = obs[g0 + i];
    const cheap = partialOf(o, a, b) || (revisions && [...revisions.values()].some(e => consistent(o, e.state.points)));
    c += cheap ? o.w * 0.05 : o.w;
  }
  return c;
}

// ---- games ---------------------------------------------------------------
const obs = observations();
const starts = [];
for (let i = 0; i < obs.length; i++) {
  if (obs[i].key === START_KEY && obs[i].n >= 10 && (!starts.length || obs.slice(starts.at(-1) + 1, i).some(o => o.key !== START_KEY))) starts.push(i);
}
// A recording that begins mid-game: the first long, complete view starts a fragment.
const firstStart = starts.length ? starts[0] : obs.length;
const lead = obs.slice(0, firstStart).findIndex(o => o.n >= 20 && o.pos.filter(v => v === null).length <= 1);
const segments = starts.map(s => ({ s, fragment: false }));
if (lead >= 0) segments.unshift({ s: lead, fragment: true });
// session.json "resume": [frame, ...]: play the readings could not follow (more than two turns unseen)
// before that frame. The game continues from the first long, complete view after it, decoded as a
// fragment and joined to the game in progress; its first turn is marked gapBefore.
for (const f of SESSION.resume ?? []) {
  const i = obs.findIndex(o => o.f0 >= f && o.n >= 10 && o.pos.filter(v => v === null).length <= 1);
  if (i >= 0) segments.push({ s: i, fragment: true, resume: true });
}
segments.sort((a, b) => a.s - b.s);
const games = [];
for (let g = 0; g < segments.length; g++) {
  // a game's observations begin at its last opening view
  let g0 = segments[g].s; const g1 = g + 1 < segments.length ? segments[g + 1].s : obs.length;
  const fragment = segments[g].fragment;
  while (!fragment && g0 + 1 < g1 && obs[g0 + 1].key === START_KEY) g0++;
  const best = decodeGame(obs, g0, g1, fragment);
  const turns = best.turns.map(t => ({ ...t, frame: obs[t.obs].f0, fromFrame: obs[t.fromObs].f1,
    rolls: [...new Set(t.plays.map(p => p.dice.join('-')))], plays: t.plays.slice(0, 60) }));
  const explained = new Set(best.turns.map(t => t.obs));
  if (segments[g].resume && games.length) {
    const prev = games.at(-1);
    if (turns.length) turns[0].gapBefore = { fromFrame: prev.turns.at(-1)?.frame ?? prev.startFrame, position: stateFromObservation(obs[g0].pos.map((v, i) => v ?? obs[g0].raw[i])) };
    prev.turns.push(...turns); prev.endFrame = obs[g1 - 1].f1; prev.final = best.state; prev.cost = +(prev.cost + best.total).toFixed(1);
    prev.resumed = [...(prev.resumed ?? []), obs[g0].f0];
    continue;
  }
  games.push({ startFrame: obs[g0].f0, endFrame: obs[g1 - 1].f1, cost: +best.total.toFixed(1), turns, fragment,
    initial: fragment ? stateFromObservation(obs[g0].pos.map((v, i) => v ?? obs[g0].raw[i])) : null,
    final: best.state, unexplained: obs.slice(g0, g1).filter((o, i) => !explained.has(g0 + i) && o.n >= 25 && !consistent(o, best.state.points)).length });
}
fs.writeFileSync(outFile, JSON.stringify({ observations: obs.length, games }, null, 1));
const fmt = f => `${Math.floor(f / 1500)}:${String(Math.floor(f / 25) % 60).padStart(2, '0')}`;
for (const [g, gm] of games.entries()) {
  console.log(`game ${g + 1} ${fmt(gm.startFrame)}-${fmt(gm.endFrame)} turns ${gm.turns.length} cost ${gm.cost} final off ${gm.final.off} bar ${gm.final.bar}`);
  console.log('   ' + gm.turns.map(t => `${fmt(t.frame)} ${t.player[0]} ${t.rolls.join('|')}${t.inferred ? '*' : ''}${t.dance ? ' dance' : ''}`).join(', '));
}
