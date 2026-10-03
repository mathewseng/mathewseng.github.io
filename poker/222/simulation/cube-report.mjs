// Generates data/cube-report.json: optimal cube actions over random deals in
// all three variants. Usage: node poker/222/simulation/cube-report.mjs [deals] [threads]
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import os from "node:os";
import {
  VARIANTS,
  DROP_UNIT,
  MAX_NET,
  makeRng,
  dealTable,
  settle,
  runoutStats,
  finishStats,
  flipHist,
  deltaHist,
  analyzeDecision,
  riverAfterFlop,
  riverActor,
} from "../engine.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const emptyCounts = () => ({ n: 0, double: 0, noDouble: 0, tooGood: 0, drop: 0, take: 0, beaver: 0, beaverTake: 0, beaverDrop: 0 });
const addDecision = (c, a) => {
  c.n++;
  if (a.best === "double") {
    c.double++;
    c[a.response]++;
    if (a.response === "beaver") c[a.beaverReply === "take" ? "beaverTake" : "beaverDrop"]++;
  } else {
    c.noDouble++;
    if (a.tooGood) c.tooGood++;
  }
};
const flopBins = () => Array.from({ length: 2 * MAX_NET }, (_, i) => ({ lo: i - MAX_NET, hi: i - MAX_NET + 1, label: `${i - MAX_NET}`, ...emptyCounts() }));
const riverBins = () => Array.from({ length: 2 * MAX_NET + 1 }, (_, i) => ({ x: i - MAX_NET, label: `${i - MAX_NET}`, ...emptyCounts() }));
function emptyVariant(id) {
  const v = VARIANTS[id];
  return {
    flop: v.flopActor ? emptyCounts() : null,
    river: v.riverActor ? { ...emptyCounts(), actor: v.riverActor === "btn" ? "button" : "non-button" } : null,
    riverByState: id === "both" ? { centered: { ...emptyCounts(), actor: "non-button" }, owned2: { ...emptyCounts(), actor: "non-button" }, owned4: { ...emptyCounts(), actor: "non-button" } } : null,
    outcome: { btnSum: 0, absSum: 0, cubeLevels: {}, drops: 0, showdowns: 0 },
    flopWindow: v.flopActor ? flopBins() : null,
    riverWindow: v.riverActor ? riverBins() : null,
  };
}
function emptyReport() {
  return { deals: 0, showdown: { hist: new Array(2 * MAX_NET + 1).fill(0), scoop: 0, absSum: 0 }, variants: { flop: emptyVariant("flop"), river: emptyVariant("river"), both: emptyVariant("both") } };
}
function addTo(rep, key, a, bin) {
  addDecision(rep[key], a);
  if (bin) addDecision(bin, a);
}
// Plays one deal (button = seat 0) under optimal play in every variant.
function playDeal(rep, hands, board) {
  rep.deals++;
  const r = settle(hands, board);
  const x = r.net[0];
  rep.showdown.hist[x + MAX_NET]++;
  rep.showdown.absSum += Math.abs(x);
  if (Math.abs(x) === 10) rep.showdown.scoop++;
  const flopStats = finishStats(runoutStats(hands, board.slice(0, 3), { exact: true }), 2);
  const hist = flopStats.hist; // net for seat 0 (button)
  for (const id of ["flop", "river", "both"]) {
    const v = VARIANTS[id];
    const out = rep.variants[id];
    let level = 1,
      owner = null,
      ended = null; // { btnNet }
    if (v.flopActor) {
      const a = analyzeDecision({ hist, level, riverAfter: riverAfterFlop(v) });
      const bin = out.flopWindow[Math.max(0, Math.min(2 * MAX_NET - 1, Math.floor(a.cubeless + MAX_NET)))];
      addTo(out, "flop", a, bin);
      if (a.best === "double") {
        if (a.response === "drop") ended = { btnNet: DROP_UNIT * level, drop: true };
        else if (a.response === "take") {
          level = 2;
          owner = 1;
        } else if (a.beaverReply === "take") {
          level = 4;
          owner = 1;
        } else ended = { btnNet: -2 * DROP_UNIT * level, drop: true };
      }
    }
    if (!ended && v.riverActor) {
      const cube = { level, owner };
      const actor = riverActor(v, 0, cube);
      const xa = actor === 0 ? x : -x;
      const a = analyzeDecision({ hist: deltaHist(xa), level, riverAfter: "none" });
      const bin = out.riverWindow[xa + MAX_NET];
      addTo(out, "river", a, bin);
      if (out.riverByState) addDecision(out.riverByState[owner == null ? "centered" : level === 2 ? "owned2" : "owned4"], a);
      let actorNet;
      if (a.best === "double") {
        if (a.response === "drop") actorNet = { v: DROP_UNIT * level, drop: true };
        else if (a.response === "take") {
          level *= 2;
          actorNet = { v: xa * level };
        } else if (a.beaverReply === "take") {
          level *= 4;
          actorNet = { v: xa * level };
        } else actorNet = { v: -2 * DROP_UNIT * level, drop: true };
      } else actorNet = { v: xa * level };
      ended = { btnNet: actor === 0 ? actorNet.v : -actorNet.v, drop: Boolean(actorNet.drop) };
    }
    if (!ended) ended = { btnNet: x * level, drop: false };
    out.outcome.btnSum += ended.btnNet;
    out.outcome.absSum += Math.abs(ended.btnNet);
    out.outcome.cubeLevels[level] = (out.outcome.cubeLevels[level] ?? 0) + 1;
    if (ended.drop) out.outcome.drops++;
    else out.outcome.showdowns++;
  }
  void flipHist;
}
function mergeCounts(a, b) {
  for (const k of Object.keys(b)) if (typeof b[k] === "number") a[k] += b[k];
}
function merge(a, b) {
  a.deals += b.deals;
  for (let i = 0; i < a.showdown.hist.length; i++) a.showdown.hist[i] += b.showdown.hist[i];
  a.showdown.scoop += b.showdown.scoop;
  a.showdown.absSum += b.showdown.absSum;
  for (const id of ["flop", "river", "both"]) {
    const x = a.variants[id],
      y = b.variants[id];
    if (x.flop) mergeCounts(x.flop, y.flop);
    if (x.river) mergeCounts(x.river, y.river);
    if (x.riverByState) for (const s of Object.keys(x.riverByState)) mergeCounts(x.riverByState[s], y.riverByState[s]);
    x.outcome.btnSum += y.outcome.btnSum;
    x.outcome.absSum += y.outcome.absSum;
    x.outcome.drops += y.outcome.drops;
    x.outcome.showdowns += y.outcome.showdowns;
    for (const [l, n] of Object.entries(y.outcome.cubeLevels)) x.outcome.cubeLevels[l] = (x.outcome.cubeLevels[l] ?? 0) + n;
    if (x.flopWindow) x.flopWindow.forEach((bin, i) => mergeCounts(bin, y.flopWindow[i]));
    if (x.riverWindow) x.riverWindow.forEach((bin, i) => mergeCounts(bin, y.riverWindow[i]));
  }
}
export function runDeals(deals, seed) {
  const rng = makeRng(seed);
  const rep = emptyReport();
  for (let d = 0; d < deals; d++) {
    const { hands, board } = dealTable(2, rng);
    playDeal(rep, hands, board);
  }
  return rep;
}
if (!isMainThread) {
  parentPort.postMessage(runDeals(workerData.deals, workerData.seed));
} else {
  const deals = Number(process.argv[2] || 20000);
  const threads = Number(process.argv[3] || Math.max(1, os.cpus().length - 1));
  const seed = Number(process.argv[4] || 20261003);
  const t0 = Date.now();
  const per = Math.ceil(deals / threads);
  const jobs = [];
  for (let i = 0; i < threads; i++) {
    const n = Math.min(per, deals - i * per);
    if (n <= 0) break;
    jobs.push(
      new Promise((resolve, reject) => {
        const w = new Worker(fileURLToPath(import.meta.url), { workerData: { deals: n, seed: (seed + i * 104729) >>> 0 } });
        w.on("message", resolve);
        w.on("error", reject);
      }),
    );
  }
  const parts = await Promise.all(jobs);
  const rep = parts[0];
  for (let i = 1; i < parts.length; i++) merge(rep, parts[i]);
  const D = rep.deals;
  const out = {
    meta: { deals: D, seed, threads, generatedAt: new Date().toISOString(), dropUnit: DROP_UNIT, seconds: (Date.now() - t0) / 1000 },
    showdown: { hist: rep.showdown.hist.map((n) => n / D), scoop: rep.showdown.scoop / D, meanAbs: rep.showdown.absSum / D },
    variants: {},
  };
  for (const id of ["flop", "river", "both"]) {
    const v = rep.variants[id];
    out.variants[id] = {
      flop: v.flop,
      river: v.river,
      riverByState: v.riverByState,
      outcome: { btnMean: v.outcome.btnSum / D, absMean: v.outcome.absSum / D, cubeLevels: v.outcome.cubeLevels, drops: v.outcome.drops, showdowns: v.outcome.showdowns },
      flopWindow: v.flopWindow,
      riverWindow: v.riverWindow,
    };
  }
  const path = join(here, "..", "data", "cube-report.json");
  writeFileSync(path, JSON.stringify(out));
  console.log(`Wrote ${path}: ${D} deals in ${out.meta.seconds.toFixed(1)} s`);
  for (const id of ["flop", "river", "both"]) {
    const v = out.variants[id];
    console.log(id, "btnEV", v.outcome.btnMean.toFixed(3), "flop double", v.flop ? (v.flop.double / v.flop.n).toFixed(3) : "-", "river double", v.river ? (v.river.double / v.river.n).toFixed(3) : "-", "drops", (v.outcome.drops / D).toFixed(3));
  }
}
