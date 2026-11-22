#!/usr/bin/env bun
/**
 * Reconstruct legal turns from per-frame checker readings.
 *
 * usage: bun decode.mjs <obs-dir> <out.json> [--from frame] [--to frame]
 *
 * A turn is accepted when a fully confident reading equals one of the legal
 * results of the current position for the player on roll, and the same
 * reading recurs (>= MIN_HITS samples within CONFIRM frames). When nothing
 * matches but a stable reading persists, two-turn results are tried (a missed
 * intermediate position or a dance). The opening position starts a game.
 */
import fs from 'node:fs';
import path from 'node:path';
import { legalTurns, boardKey } from '../../../core/rules.mjs';

const args = process.argv.slice(2);
const obsDir = args[0], outFile = args[1];
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : dflt; };
const FROM = opt('--from', 0), TO = opt('--to', Infinity);
const CONF = 0.9, MIN_HITS = 4, CONFIRM = 125, STABLE = 4;

const rows = fs.readdirSync(obsDir).filter(f => /^clip-\d+\.json$/.test(f)).sort()
  .flatMap(f => JSON.parse(fs.readFileSync(path.join(obsDir, f), 'utf8')))
  .filter(r => r.f >= FROM && r.f <= TO);
for (const r of rows) r.full = r.conf.every(c => c >= CONF);

const START = [-2, 0, 0, 0, 0, 5, 0, 3, 0, 0, 0, -5, 5, 0, 0, 0, -3, 0, -5, 0, 0, 0, 0, 2];
const pkey = points => points.join(',');
const kp = new Map();
const keyPoints = key => { if (!kp.has(key)) kp.set(key, key.split(',').map(Number)); return kp.get(key); };
const START_KEY = pkey(START);
const blank = { points: START, bar: [0, 0], off: [0, 0] };
const PLAYER = ['white', 'dark'];

const rolls = [];
for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) rolls.push([b, a]);

const cache = new Map();
/** Map points-key -> {state, plays:[{dice, steps}]} of every legal result for `turn`. */
function results(s, turn) {
  const ck = `${turn}|${boardKey(s)}`;
  if (cache.has(ck)) return cache.get(ck);
  const out = new Map();
  for (const dice of rolls) {
    const st = { ...blank, points: s.points, bar: s.bar, off: s.off, turn, dice, phase: 'move' };
    for (const t of legalTurns(st)) {
      const k = pkey(t.state.points);
      if (!t.steps.length) continue; // no legal move: only inferred as a dance
      const e = out.get(k) ?? { state: { points: t.state.points, bar: t.state.bar, off: t.state.off }, plays: [] };
      e.plays.push({ dice, steps: t.steps });
      out.set(k, e);
    }
  }
  cache.set(ck, out);
  if (cache.size > 20000) cache.clear();
  return out;
}

const MAX_UNKNOWN = 4;
/** True when every confident point equals `points` and few points are unknown. */
function consistent(r, points, maxUnknown = MAX_UNKNOWN) {
  let unknown = 0;
  for (let i = 0; i < 24; i++) {
    if (r.conf[i] < CONF) { if (++unknown > maxUnknown) return false; continue; }
    if (r.pos[i] !== points[i]) return false;
  }
  return true;
}
function matchesPoints(r, points) {
  let unknown = 0;
  for (let i = 0; i < 24; i++) {
    if (r.conf[i] < CONF) { unknown++; continue; }
    if (r.pos[i] !== points[i]) return false;
  }
  return unknown <= 2;
}

/** First index >= i where readings equal `key` MIN_HITS times within CONFIRM frames. */
function confirmed(i, key) {
  const hits = [];
  for (let j = i; j < rows.length && rows[j].f - rows[i].f <= CONFIRM * 2; j++) {
    if (rows[j].full ? pkey(rows[j].pos) === key : consistent(rows[j], keyPoints(key), 3)) hits.push(rows[j].f);
  }
  return hits.length >= MIN_HITS && hits[MIN_HITS - 1] - hits[0] <= CONFIRM;
}

const games = [];
let game = null, S = null, mover = null, lastSeen = 0;
const log = [];

function startGame(i) {
  if (game) games.push(game);
  game = { startFrame: rows[i].f, turns: [], notes: [] };
  S = { points: START, bar: [0, 0], off: [0, 0] }; mover = null; lastSeen = rows[i].f;
}

function stableAt(i) {
  // A stable fully confident reading: the same key at least STABLE + 4 times in the next 3 s.
  const r = rows[i]; if (!r.full) return false;
  const k = pkey(r.pos); let n = 0;
  for (let j = i; j < rows.length && rows[j].f - r.f <= 75; j++) if (rows[j].full && pkey(rows[j].pos) === k) n++;
  return n >= STABLE + 4;
}

function accept(i, entry, player, extra = {}) {
  const r = rows[i];
  game.turns.push({ player: PLAYER[player], frame: r.f, lastBeforeFrame: lastSeen, before: S, after: entry.state,
    rolls: entry.plays.map(p => p.dice.join('-')).filter((v, k, a) => a.indexOf(v) === k), plays: entry.plays.slice(0, 40), ...extra });
  S = entry.state; mover = 1 - player; lastSeen = r.f;
}

// A turn stays pending while the mover can still rearrange: any later confirmed
// reading that is another legal result of the same roll set replaces it. The
// pending turn commits when the opponent's next result is observed.
let pending = null; // {i, entry, player}
function commitPending() {
  if (!pending) return;
  accept(pending.i, pending.entry, pending.player, pending.revisions ? { revisions: pending.revisions } : {});
  pending = null;
}

/** The unique result in `res` consistent with row i (exact key when full). */
function find(res, i) {
  const r = rows[i];
  if (r.full) { const k = pkey(r.pos); return res.has(k) ? k : null; }
  let found = null;
  for (const k of res.keys()) if (consistent(r, keyPoints(k), 3)) { if (found) return null; found = k; }
  return found;
}

function tryAdvance(i, key) {
  // Returns true if the reading was explained.
  const base = pending ? pending.before : S;
  const players = pending ? [pending.player] : (mover === null ? [0, 1] : [mover]);
  if (pending) {
    const same = results(base, pending.player);
    let k = find(same, i);
    if (k && k !== pkey(pending.entry.state.points) && confirmed(i, k)) {
      pending = { ...pending, i, entry: same.get(k), revisions: (pending.revisions ?? 0) + 1 }; return true;
    }
    const next = results(pending.entry.state, 1 - pending.player);
    k = find(next, i);
    if (k && confirmed(i, k)) {
      commitPending(); pending = { i, entry: next.get(k), player: mover, before: S }; return true;
    }
    return false;
  }
  for (const p of players) {
    const res = results(S, p);
    const k = find(res, i);
    if (k && confirmed(i, k)) { pending = { i, entry: res.get(k), player: p, before: S }; return true; }
  }
  return false;
}

for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  if (r.full && pkey(r.pos) === START_KEY && confirmed(i, START_KEY)) {
    const cur = pending ? pending.entry.state : S;
    if (!game || pkey(cur.points) !== START_KEY) { commitPending(); startGame(i); }
    pending = null; lastSeen = r.f; continue;
  }
  if (!game) continue;
  const cur = pending ? pending.entry.state : S;
  if (cur.off[0] === 15 || cur.off[1] === 15) continue;
  if (!pending && matchesPoints(r, S.points)) { lastSeen = r.f; continue; }
  if (pending && matchesPoints(r, pending.entry.state.points)) { lastSeen = r.f; continue; }
  const known = r.conf.filter(c => c >= CONF).length;
  if (known < 24 - 3) continue;
  const key = pkey(r.pos);
  if (tryAdvance(i, key) || !r.full || !stableAt(i)) continue;
  // Two turns from the start of the current (pending) turn: a missed
  // intermediate position, or a dance. Unexplained readings commit nothing.
  let done = false;
  // Origins: [position, player to move, turns to commit first].
  const origins = pending
    ? [[pending.entry.state, 1 - pending.player, [pending]], [pending.before, pending.player, []]]
    : (mover === null ? [[S, 0, []], [S, 1, []]] : [[S, mover, []]]);
  for (const [base, p, commits] of origins) {
    for (const [, e1] of results(base, p)) {
      const second = results(e1.state, 1 - p);
      if (second.has(key)) {
        pending = null;
        for (const c of commits) accept(c.i, c.entry, c.player);
        S = base;
        accept(i, e1, p, { inferred: 'missed-intermediate' });
        pending = { i, entry: second.get(key), player: 1 - p, before: S };
        done = true; break;
      }
    }
    if (done) break;
    if (base.bar[p]) {
      const res = results(base, 1 - p);
      if (res.has(key)) {
        pending = null;
        for (const c of commits) accept(c.i, c.entry, c.player);
        S = base;
        game.turns.push({ player: PLAYER[p], frame: r.f, before: S, after: S, rolls: [], dance: true, inferred: 'dance' });
        mover = 1 - p; pending = { i, entry: res.get(key), player: 1 - p, before: S }; done = true; break;
      }
    }
  }
  if (!done) log.push({ frame: r.f, t: (r.f / 25 / 60).toFixed(2), stuck: key });
}
commitPending();
if (game) games.push(game);
fs.writeFileSync(outFile, JSON.stringify({ games, stuck: log }, null, 1));
const fmt = f => `${Math.floor(f / 1500)}:${String(Math.floor(f / 25) % 60).padStart(2, '0')}`;
for (const [g, gm] of games.entries()) {
  console.log(`game ${g + 1} start ${fmt(gm.startFrame)} turns ${gm.turns.length}`);
  for (const t of gm.turns) console.log(`  ${fmt(t.frame)} ${t.player.padEnd(5)} ${t.rolls.join('|')} ${t.inferred ?? ''} off ${t.after.off} bar ${t.after.bar}`);
}
const stuckSummary = new Map();
for (const s of log) { const e = stuckSummary.get(s.stuck) ?? { n: 0, first: s.t }; e.n++; stuckSummary.set(s.stuck, e); }
console.log('stuck readings', log.length, [...stuckSummary.values()].filter(e => e.n >= 5).slice(0, 20));
