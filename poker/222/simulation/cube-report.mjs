// Generates data/cube-report.json: hidden-information equilibrium play for all
// seven cube variants, plus face-up (tabled) play for the variants without a
// preflop cube as a comparison.
// Usage: node poker/222/simulation/cube-report.mjs [faceUpDeals] [threads] [seed] [boards]
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import os from "node:os";
import { VARIANTS, VARIANT_ORDER, DROP_UNIT, DROP_UNITS, MAX_NET, makeRng, dealTable, settle, runoutStats, finishStats, analyzeDecision, riverAfter, actorOn, holderAfter, chainValues, STREETS } from "../engine.mjs";
import { MAX_CUBE } from "../cube-rules.mjs";
import { solve } from "../solver.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/* ---------- face-up play (variants f, r, fr) ---------- */
// Plays the chain at `street` with both hands open. hist is the distribution of
// the net for the actor. Returns { cube, ended: {winnerSide, points} | null, path }.
function playChainFaceUp(a, actorSide, cube, dropUnit) {
  const path = [];
  let node = a.nodes[0];
  path.push({ k: 0, chooser: actorSide, choice: node.best });
  if (node.best === "noDouble") return { cube: { level: cube.level, owner: holderAfter(actorSide, 0) }, ended: null, path };
  let k = 1;
  while (true) {
    node = a.nodes[k];
    const chooser = k % 2 === 1 ? 1 - actorSide : actorSide;
    path.push({ k, chooser, choice: node.best });
    const prev = node.prevLevel;
    if (node.best === "drop") return { cube, ended: { winner: 1 - chooser, points: dropUnit * prev }, path };
    if (node.best === "take") return { cube: { level: node.offerLevel, owner: chooser }, ended: null, path };
    k++;
    if (!a.nodes[k]) return { cube: { level: node.offerLevel, owner: chooser }, ended: null, path };
  }
}
const emptyFaceUp = () => ({ deals: 0, flop: null, river: null, outcome: { btnSum: 0, absSum: 0, cubeLevels: {}, drops: 0, showdowns: 0 } });
const emptyDecision = () => ({ n: 0, double: 0, tooGood: 0, drop: 0, take: 0, reraise: 0, deeper: 0 });
function addPath(c, a, path) {
  c.n++;
  if (path[0].choice === "double") {
    c.double++;
    const r = path[1];
    if (r) c[r.choice === "reraise" ? "reraise" : r.choice]++;
    if (path.length > 2) c.deeper++;
  } else if (a.tooGood) c.tooGood++;
}
function playDealFaceUp(rep, hands, board, dropUnit) {
  rep.deals++;
  const x = settle(hands, board).net[0];
  const flopStats = finishStats(runoutStats(hands, board.slice(0, 3), { exact: true }), 2);
  for (const id of ["f", "r", "fr"]) {
    const v = VARIANTS[id];
    const out = rep.variants[id];
    let cube = { level: 1, owner: null };
    let ended = null;
    if (v.streets.includes("flop")) {
      const actor = actorOn(v, "flop", 0, cube);
      const a = analyzeDecision({ hist: actor === 0 ? flopStats.hist : flopStats.hist.slice().reverse(), level: cube.level, riverAfter: riverAfter(v, "flop", 0, cube, actor), dropUnit });
      out.flop = out.flop ?? emptyDecision();
      const res = playChainFaceUp(a, actor, cube, dropUnit);
      addPath(out.flop, a, res.path);
      cube = res.cube;
      ended = res.ended;
    }
    if (!ended && v.streets.includes("river")) {
      const actor = actorOn(v, "river", 0, cube);
      if (actor != null) {
        const xa = actor === 0 ? x : -x;
        const hist = new Array(2 * MAX_NET + 1).fill(0);
        hist[xa + MAX_NET] = 1;
        const a = analyzeDecision({ hist, level: cube.level, riverAfter: "none", dropUnit });
        out.river = out.river ?? emptyDecision();
        const res = playChainFaceUp(a, actor, cube, dropUnit);
        addPath(out.river, a, res.path);
        cube = res.cube;
        ended = res.ended;
      }
    }
    const btnNet = ended ? (ended.winner === 0 ? ended.points : -ended.points) : x * cube.level;
    out.outcome.btnSum += btnNet;
    out.outcome.absSum += Math.abs(btnNet);
    out.outcome.cubeLevels[cube.level] = (out.outcome.cubeLevels[cube.level] ?? 0) + 1;
    if (ended) out.outcome.drops++;
    else out.outcome.showdowns++;
  }
}
function runFaceUp(deals, seed, dropUnit) {
  const rng = makeRng(seed);
  const rep = { deals: 0, variants: { f: emptyFaceUp(), r: emptyFaceUp(), fr: emptyFaceUp() } };
  for (let d = 0; d < deals; d++) {
    const { hands, board } = dealTable(2, rng);
    playDealFaceUp(rep, hands, board, dropUnit);
  }
  return rep;
}
function mergeCounts(a, b) {
  for (const k of Object.keys(b)) if (typeof b[k] === "number") a[k] = (a[k] ?? 0) + b[k];
}
function mergeFaceUp(a, b) {
  a.deals += b.deals;
  for (const id of ["f", "r", "fr"]) {
    const x = a.variants[id],
      y = b.variants[id];
    for (const s of ["flop", "river"]) {
      if (!y[s]) continue;
      x[s] = x[s] ?? emptyDecision();
      mergeCounts(x[s], y[s]);
    }
    x.outcome.btnSum += y.outcome.btnSum;
    x.outcome.absSum += y.outcome.absSum;
    x.outcome.drops += y.outcome.drops;
    x.outcome.showdowns += y.outcome.showdowns;
    for (const [l, n] of Object.entries(y.outcome.cubeLevels)) x.outcome.cubeLevels[l] = (x.outcome.cubeLevels[l] ?? 0) + n;
  }
}

/* ---------- equilibrium ---------- */
// Accumulates a solve result: entry-stage node frequencies and later-street aggregates.
const emptyNodeAgg = () => ({ reach: 0, act: {} });
function accumulateSolve(acc, r) {
  acc.count++;
  acc.valueSum += r.stage?.value ?? 0;
  acc.exploitSum += r.exploitability;
  if (r.stage) {
    acc.entry = acc.entry ?? { street: r.entry, nodes: [] };
    r.stage.nodes.forEach((nd, k) => {
      const t = (acc.entry.nodes[k] = acc.entry.nodes[k] ?? emptyNodeAgg());
      t.reach += nd.reach;
      for (const [id, f] of Object.entries(nd.freq)) t.act[id] = (t.act[id] ?? 0) + nd.reach * f;
      t.offerLevel = nd.offerLevel;
      t.side = nd.side;
    });
    if (r.stage.nodes[0]) acc.doubleHist[Math.min(9, Math.floor(r.stage.nodes[0].freq.double * 10))]++;
  }
  for (const [street, states] of Object.entries(r.aggregates ?? {}))
    for (const [key, st] of Object.entries(states)) {
      acc.later[street] = acc.later[street] ?? {};
      const t = (acc.later[street][key] = acc.later[street][key] ?? { level: st.level, owner: st.owner, actorSide: st.actorSide, entry: 0, nodes: [] });
      t.entry += st.entry;
      st.nodes.forEach((nd, k) => {
        const u = (t.nodes[k] = t.nodes[k] ?? emptyNodeAgg());
        u.reach += nd.reach;
        for (const [id, f] of Object.entries(nd.freq)) u.act[id] = (u.act[id] ?? 0) + nd.reach * f;
        u.offerLevel = nd.offerLevel;
        u.side = nd.side;
      });
    }
}
const emptyAcc = () => ({ count: 0, valueSum: 0, exploitSum: 0, entry: null, later: {}, doubleHist: new Array(10).fill(0) });
function finishNodes(nodes, count) {
  return nodes.map((nd, k) => {
    const freq = {};
    for (const [id, v] of Object.entries(nd.act)) freq[id] = nd.reach > 0 ? v / nd.reach : 0;
    return { k, side: nd.side, offerLevel: nd.offerLevel, reach: nd.reach / count, freq };
  });
}
function finishAcc(acc) {
  const c = acc.count || 1;
  const out = { boards: acc.count, value: acc.valueSum / c, exploitability: acc.exploitSum / c, doubleHist: acc.doubleHist.map((x) => x / c), later: {} };
  if (acc.entry) out.entry = { street: acc.entry.street, nodes: finishNodes(acc.entry.nodes, c) };
  for (const [street, states] of Object.entries(acc.later)) {
    out.later[street] = {};
    for (const [key, st] of Object.entries(states)) out.later[street][key] = { level: st.level, owner: st.owner, actorSide: st.actorSide, entry: st.entry / c, nodes: finishNodes(st.nodes, c) };
  }
  return out;
}
function mergeAcc(a, b) {
  a.count += b.count;
  a.valueSum += b.valueSum;
  a.exploitSum += b.exploitSum;
  b.doubleHist.forEach((v, i) => (a.doubleHist[i] += v));
  if (b.entry) {
    a.entry = a.entry ?? { street: b.entry.street, nodes: [] };
    b.entry.nodes.forEach((nd, k) => {
      const t = (a.entry.nodes[k] = a.entry.nodes[k] ?? emptyNodeAgg());
      t.reach += nd.reach;
      for (const [id, v] of Object.entries(nd.act)) t.act[id] = (t.act[id] ?? 0) + v;
      t.offerLevel = nd.offerLevel;
      t.side = nd.side;
    });
  }
  for (const [street, states] of Object.entries(b.later))
    for (const [key, st] of Object.entries(states)) {
      a.later[street] = a.later[street] ?? {};
      const t = (a.later[street][key] = a.later[street][key] ?? { level: st.level, owner: st.owner, actorSide: st.actorSide, entry: 0, nodes: [] });
      t.entry += st.entry;
      st.nodes.forEach((nd, k) => {
        const u = (t.nodes[k] = t.nodes[k] ?? emptyNodeAgg());
        u.reach += nd.reach;
        for (const [id, v] of Object.entries(nd.act)) u.act[id] = (u.act[id] ?? 0) + v;
        u.offerLevel = nd.offerLevel;
        u.side = nd.side;
      });
    }
}
// Board-entry variants (f, r, fr): one solve per random board at the entry street.
async function runBoards(boards, seed, precision, dropUnit) {
  const rng = makeRng(seed);
  const acc = { f: emptyAcc(), r: emptyAcc(), fr: emptyAcc() };
  for (let b = 0; b < boards; b++) {
    const { board } = dealTable(2, rng);
    accumulateSolve(acc.f, await solve({ variant: "f", board: board.slice(0, 3), precision, dropUnit, seed: (seed + b * 31) >>> 0 }));
    accumulateSolve(acc.fr, await solve({ variant: "fr", board: board.slice(0, 3), precision, dropUnit, seed: (seed + b * 37) >>> 0 }));
    accumulateSolve(acc.r, await solve({ variant: "r", board, precision, dropUnit, seed: (seed + b * 41) >>> 0 }));
  }
  return acc;
}
// One preflop-entry variant, solved as a single game over sampled flops and runouts.
async function runPreflop(id, seed, precision, dropUnit, big) {
  const sizes = big ? { flops: id === "pfr" ? 14 : 24, runouts: id === "pfr" ? 20 : 36, boards: 64, iterations: id === "pfr" ? 320 : 500 } : { flops: id === "pfr" ? 8 : 12, runouts: id === "pfr" ? 14 : 24, boards: 48, iterations: id === "pfr" ? 220 : 300 };
  const r = await solve({ variant: id, board: [], precision, dropUnit, seed, ...sizes });
  const a = emptyAcc();
  accumulateSolve(a, r);
  return { entryStreet: "preflop", ...finishAcc(a), iterations: r.iterations, tolerance: r.tolerance, sampled: r.sampled };
}
// Total probability that the hand ends with a drop, over every street and state.
function dropProbability(v) {
  let total = 0;
  const addNodes = (nodes) => nodes.forEach((nd, k) => (k > 0 ? (total += nd.reach * (nd.freq.drop ?? 0)) : 0));
  if (v.entry) addNodes(v.entry.nodes);
  for (const states of Object.values(v.later ?? {})) for (const st of Object.values(states)) addNodes(st.nodes);
  return total;
}
function sweepSummary(v) {
  const n0 = v.entry?.nodes[0],
    n1 = v.entry?.nodes[1];
  return { value: v.value, exploitability: v.exploitability, doubles: n0?.freq.double ?? 0, reply: n1 ? { drop: n1.freq.drop ?? 0, take: n1.freq.take ?? 0, reraise: n1.freq.reraise ?? 0 } : null, endsByDrop: dropProbability(v) };
}
if (!isMainThread) {
  const wd = workerData;
  if (wd.kind === "faceup") parentPort.postMessage(runFaceUp(wd.deals, wd.seed, wd.dropUnit));
  else if (wd.kind === "boards") runBoards(wd.boards, wd.seed, wd.precision, wd.dropUnit).then((acc) => parentPort.postMessage(acc));
  else runPreflop(wd.variant, wd.seed, wd.precision, wd.dropUnit, wd.big).then((res) => parentPort.postMessage(res));
} else {
  const deals = Number(process.argv[2] || 50000);
  const threads = Number(process.argv[3] || Math.max(1, os.cpus().length - 1));
  const seed = Number(process.argv[4] || 20261003);
  const boards = Number(process.argv[5] || 120);
  const sweepBoards = Number(process.argv[6] || 80);
  const defaultDrop = Number(process.argv[7] || DROP_UNIT);
  const t0 = Date.now();
  // A small job runner: at most `threads` worker threads at once.
  const queue = [];
  let running = 0;
  const spawn = (workerData) =>
    new Promise((resolve, reject) => {
      queue.push({ workerData, resolve, reject });
      pump();
    });
  function pump() {
    while (running < threads && queue.length) {
      const job = queue.shift();
      running++;
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: job.workerData });
      w.on("message", (m) => {
        running--;
        job.resolve(m);
        pump();
      });
      w.on("error", (e) => {
        running--;
        job.reject(e);
        pump();
      });
    }
  }
  // Detailed section for the default drop cost (standard precision), face-up deals, and the sweep (fast precision).
  const per = Math.ceil(deals / threads);
  const fuJobs = [];
  for (let i = 0; i < threads; i++) {
    const n = Math.min(per, deals - i * per);
    if (n > 0) fuJobs.push(spawn({ kind: "faceup", deals: n, seed: (seed + i * 104729) >>> 0, dropUnit: defaultDrop }));
  }
  const perB = Math.ceil(boards / threads);
  const bJobs = [];
  for (let i = 0; i < threads; i++) {
    const n = Math.min(perB, boards - i * perB);
    if (n > 0) bJobs.push(spawn({ kind: "boards", boards: n, seed: (seed + 7 + i * 7919) >>> 0, precision: "standard", dropUnit: defaultDrop }));
  }
  const pJobs = {};
  for (const id of ["p", "pf", "pr", "pfr"]) pJobs[id] = spawn({ kind: "preflop", variant: id, seed: (seed + 99) >>> 0, precision: "standard", dropUnit: defaultDrop, big: true });
  const sweepJobs = {};
  for (const d of DROP_UNITS) {
    sweepJobs[d] = { boards: [], preflop: {} };
    const perS = Math.ceil(sweepBoards / Math.max(1, Math.floor(threads / 2)));
    for (let i = 0; i * perS < sweepBoards; i++) {
      const n = Math.min(perS, sweepBoards - i * perS);
      sweepJobs[d].boards.push(spawn({ kind: "boards", boards: n, seed: (seed + 1000 * d + i * 7919) >>> 0, precision: "fast", dropUnit: d }));
    }
    for (const id of ["p", "pf", "pr", "pfr"]) sweepJobs[d].preflop[id] = spawn({ kind: "preflop", variant: id, seed: (seed + 1000 * d + 99) >>> 0, precision: "fast", dropUnit: d, big: false });
  }
  const fuParts = await Promise.all(fuJobs);
  const bParts = await Promise.all(bJobs);
  const fu = fuParts[0];
  for (let i = 1; i < fuParts.length; i++) mergeFaceUp(fu, fuParts[i]);
  const acc = bParts[0];
  for (let i = 1; i < bParts.length; i++) for (const id of ["f", "r", "fr"]) mergeAcc(acc[id], bParts[i][id]);
  const equilibrium = { precision: "standard", dropUnit: defaultDrop, variants: {} };
  for (const id of ["f", "r", "fr"]) equilibrium.variants[id] = { entryStreet: id === "r" ? "river" : "flop", ...finishAcc(acc[id]) };
  for (const id of ["p", "pf", "pr", "pfr"]) equilibrium.variants[id] = await pJobs[id];
  console.log(`detailed section done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const sweep = { dropUnits: DROP_UNITS, precision: "fast", boards: sweepBoards, variants: {} };
  for (const id of VARIANT_ORDER) sweep.variants[id] = {};
  for (const d of DROP_UNITS) {
    const parts = await Promise.all(sweepJobs[d].boards);
    const sacc = parts[0];
    for (let i = 1; i < parts.length; i++) for (const id of ["f", "r", "fr"]) mergeAcc(sacc[id], parts[i][id]);
    for (const id of ["f", "r", "fr"]) sweep.variants[id][d] = sweepSummary(finishAcc(sacc[id]));
    for (const id of ["p", "pf", "pr", "pfr"]) sweep.variants[id][d] = sweepSummary(await sweepJobs[d].preflop[id]);
    console.log(`sweep drop ${d} done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  const D = fu.deals;
  const faceUp = { deals: D, dropUnit: defaultDrop, variants: {} };
  for (const id of ["f", "r", "fr"]) {
    const v = fu.variants[id];
    faceUp.variants[id] = { flop: v.flop, river: v.river, outcome: { btnMean: v.outcome.btnSum / D, absMean: v.outcome.absSum / D, cubeLevels: v.outcome.cubeLevels, drops: v.outcome.drops, showdowns: v.outcome.showdowns } };
  }
  const out = { meta: { generatedAt: new Date().toISOString(), seed, threads, dropUnit: defaultDrop, maxCube: MAX_CUBE, seconds: (Date.now() - t0) / 1000 }, equilibrium, sweep, faceUp };
  const path = join(here, "..", "data", "cube-report.json");
  writeFileSync(path, JSON.stringify(out));
  console.log(`Wrote ${path} in ${out.meta.seconds.toFixed(0)} s`);
  for (const d of DROP_UNITS) console.log(`drop ${d}: ` + VARIANT_ORDER.map((id) => `${id} dbl ${(sweep.variants[id][d].doubles * 100).toFixed(0)}% drop ${((sweep.variants[id][d].reply?.drop ?? 0) * 100).toFixed(0)}% ends ${(sweep.variants[id][d].endsByDrop * 100).toFixed(0)}%`).join(" | "));
  void chainValues;
  void STREETS;
}
