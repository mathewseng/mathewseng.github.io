// Generates data/cube-report.json: hidden-information equilibrium play for all
// seven cube variants, plus face-up (tabled) play for the variants without a
// preflop cube as a comparison.
// Usage: node poker/222/simulation/cube-report.mjs [faceUpDeals] [threads] [seed] [boards]
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import os from "node:os";
import { VARIANTS, VARIANT_ORDER, DROP_UNIT, MAX_NET, makeRng, dealTable, settle, runoutStats, finishStats, analyzeDecision, riverAfter, actorOn, chainValues, STREETS } from "../engine.mjs";
import { MAX_CUBE } from "../cube-rules.mjs";
import { solve } from "../solver.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/* ---------- face-up play (variants f, r, fr) ---------- */
// Plays the chain at `street` with both hands open. hist is the distribution of
// the net for the actor. Returns { cube, ended: {winnerSide, points} | null, path }.
function playChainFaceUp(a, actorSide, cube, maxLevel) {
  const path = [];
  let node = a.nodes[0];
  path.push({ k: 0, chooser: actorSide, choice: node.best });
  if (node.best === "noDouble") return { cube, ended: null, path };
  let k = 1;
  let firstResponder = 1 - actorSide;
  while (true) {
    node = a.nodes[k];
    const chooser = k % 2 === 1 ? 1 - actorSide : actorSide;
    path.push({ k, chooser, choice: node.best });
    const prev = node.prevLevel;
    if (node.best === "drop") return { cube, ended: { winner: 1 - chooser, points: DROP_UNIT * prev }, path };
    if (node.best === "take") return { cube: { level: node.offerLevel, owner: firstResponder }, ended: null, path };
    k++;
    if (!a.nodes[k]) return { cube: { level: node.offerLevel, owner: firstResponder }, ended: null, path };
  }
  void maxLevel;
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
function playDealFaceUp(rep, hands, board) {
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
      const a = analyzeDecision({ hist: actor === 0 ? flopStats.hist : flopStats.hist.slice().reverse(), level: cube.level, riverAfter: riverAfter(v, "flop", 0, cube, actor) });
      out.flop = out.flop ?? emptyDecision();
      const res = playChainFaceUp(a, actor, cube, MAX_CUBE);
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
        const a = analyzeDecision({ hist, level: cube.level, riverAfter: "none" });
        out.river = out.river ?? emptyDecision();
        const res = playChainFaceUp(a, actor, cube, MAX_CUBE);
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
function runFaceUp(deals, seed) {
  const rng = makeRng(seed);
  const rep = { deals: 0, variants: { f: emptyFaceUp(), r: emptyFaceUp(), fr: emptyFaceUp() } };
  for (let d = 0; d < deals; d++) {
    const { hands, board } = dealTable(2, rng);
    playDealFaceUp(rep, hands, board);
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
async function runBoards(boards, seed, precision) {
  const rng = makeRng(seed);
  const acc = { f: emptyAcc(), r: emptyAcc(), fr: emptyAcc() };
  for (let b = 0; b < boards; b++) {
    const { board } = dealTable(2, rng);
    accumulateSolve(acc.f, await solve({ variant: "f", board: board.slice(0, 3), precision, seed: (seed + b * 31) >>> 0 }));
    accumulateSolve(acc.fr, await solve({ variant: "fr", board: board.slice(0, 3), precision, seed: (seed + b * 37) >>> 0 }));
    accumulateSolve(acc.r, await solve({ variant: "r", board, precision, seed: (seed + b * 41) >>> 0 }));
  }
  return acc;
}
if (!isMainThread) {
  if (workerData.kind === "faceup") parentPort.postMessage(runFaceUp(workerData.deals, workerData.seed));
  else runBoards(workerData.boards, workerData.seed, workerData.precision).then((acc) => parentPort.postMessage(acc));
} else {
  const deals = Number(process.argv[2] || 50000);
  const threads = Number(process.argv[3] || Math.max(1, os.cpus().length - 1));
  const seed = Number(process.argv[4] || 20261003);
  const boards = Number(process.argv[5] || 240);
  const t0 = Date.now();
  const spawn = (workerData) =>
    new Promise((resolve, reject) => {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData });
      w.on("message", resolve);
      w.on("error", reject);
    });
  // Face-up deals.
  const per = Math.ceil(deals / threads);
  const fuJobs = [];
  for (let i = 0; i < threads; i++) {
    const n = Math.min(per, deals - i * per);
    if (n > 0) fuJobs.push(spawn({ kind: "faceup", deals: n, seed: (seed + i * 104729) >>> 0 }));
  }
  // Board-entry equilibria.
  const perB = Math.ceil(boards / threads);
  const bJobs = [];
  for (let i = 0; i < threads; i++) {
    const n = Math.min(perB, boards - i * perB);
    if (n > 0) bJobs.push(spawn({ kind: "boards", boards: n, seed: (seed + 7 + i * 7919) >>> 0, precision: "standard" }));
  }
  const [fuParts, bParts] = await Promise.all([Promise.all(fuJobs), Promise.all(bJobs)]);
  const fu = fuParts[0];
  for (let i = 1; i < fuParts.length; i++) mergeFaceUp(fu, fuParts[i]);
  const acc = bParts[0];
  for (let i = 1; i < bParts.length; i++) for (const id of ["f", "r", "fr"]) mergeAcc(acc[id], bParts[i][id]);
  console.log(`face-up and board solves done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  // Preflop-entry variants: one game each, solved in-process with larger samples.
  const equilibrium = { precision: "standard", variants: {} };
  for (const id of ["f", "r", "fr"]) equilibrium.variants[id] = { entryStreet: id === "r" ? "river" : "flop", ...finishAcc(acc[id]) };
  for (const id of ["p", "pf", "pr", "pfr"]) {
    const t1 = Date.now();
    const r = await solve({ variant: id, board: [], precision: "standard", seed: (seed + 99) >>> 0, flops: id === "pfr" ? 14 : 24, runouts: id === "pfr" ? 20 : 36, boards: 64, iterations: id === "pfr" ? 320 : 500, debug: false });
    const a = emptyAcc();
    accumulateSolve(a, r);
    equilibrium.variants[id] = { entryStreet: "preflop", ...finishAcc(a), iterations: r.iterations, tolerance: r.tolerance, sampled: r.sampled };
    console.log(`${id}: ${r.iterations} iterations, exploitability ${r.exploitability.toFixed(4)}, value ${r.stage.value.toFixed(3)} in ${((Date.now() - t1) / 1000).toFixed(0)} s`);
  }
  const D = fu.deals;
  const faceUp = { deals: D, variants: {} };
  for (const id of ["f", "r", "fr"]) {
    const v = fu.variants[id];
    faceUp.variants[id] = { flop: v.flop, river: v.river, outcome: { btnMean: v.outcome.btnSum / D, absMean: v.outcome.absSum / D, cubeLevels: v.outcome.cubeLevels, drops: v.outcome.drops, showdowns: v.outcome.showdowns } };
  }
  const out = { meta: { generatedAt: new Date().toISOString(), seed, threads, dropUnit: DROP_UNIT, maxCube: MAX_CUBE, seconds: (Date.now() - t0) / 1000 }, equilibrium, faceUp };
  const path = join(here, "..", "data", "cube-report.json");
  writeFileSync(path, JSON.stringify(out));
  console.log(`Wrote ${path} in ${out.meta.seconds.toFixed(0)} s`);
  for (const id of VARIANT_ORDER) {
    const v = equilibrium.variants[id];
    const n0 = v.entry?.nodes[0];
    console.log(id.padEnd(4), "value", v.value.toFixed(3), "doubles", n0 ? (n0.freq.double * 100).toFixed(1) + "%" : "-", "reply", v.entry?.nodes[1] ? JSON.stringify(v.entry.nodes[1].freq, (k, x) => (typeof x === "number" ? +x.toFixed(3) : x)) : "-");
  }
  void chainValues;
  void STREETS;
}
