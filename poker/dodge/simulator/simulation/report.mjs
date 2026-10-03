// Generates the precomputed reports shown on the Reports tab.
//
//   node poker/dodge/simulator/simulation/report.mjs cube  [games] [rollouts] [threads]
//   node poker/dodge/simulator/simulation/report.mjs table [games] [threads]
//
// `cube` plays two-player money games with both sides taking every cube
// decision from the solver (1-ply, race-model leaves). `table` runs cubeless
// games for two, three and four players. Both write JSON into ../data/.
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import fs from "node:fs";
import os from "node:os";
import {
  Hand,
  CUBE,
  CATEGORIES,
  RANKS,
  makeRng,
  shuffledDeck,
  remainingDeck,
  firstDrawer,
  analyzeCube,
} from "../engine.mjs";

const hist = (n) => new Array(n).fill(0);
const bump = (arr, i) => {
  while (arr.length <= i) arr.push(0);
  arr[i]++;
};
const merge = (a, b) => {
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === "number") a[k] = (a[k] ?? 0) + v;
    else if (Array.isArray(v)) {
      a[k] ??= [];
      v.forEach((x, i) => {
        if (Array.isArray(x)) {
          a[k][i] ??= [];
          x.forEach((y, j) => (a[k][i][j] = (a[k][i][j] ?? 0) + y));
        } else a[k][i] = (a[k][i] ?? 0) + x;
      });
    } else if (v && typeof v === "object") merge((a[k] ??= {}), v);
  }
  return a;
};

/* ---------------- cube self-play ---------------- */
function cubeWorker({ games, rollouts, seed }) {
  const rng = makeRng(seed);
  const s = {
    games: 0,
    firstWins: 0,
    firstPoints: 0,
    firstPointsSq: 0,
    endedByBust: 0,
    endedByPass: 0,
    cubeTurnedGames: 0,
    redoubleGames: 0,
    finalCube: {},
    pointsDist: {},
    doublesOffered: 0,
    doublesTaken: 0,
    doublesPassed: 0,
    byLevel: {},
    firstDoubleBy: { first: 0, second: 0 },
    firstDoubleAt: [],
    doubleAt: [],
    doublerHand: [],
    responderHand: [],
    doublerP: hist(20),
    takeP: hist(20),
    passP: hist(20),
    noDoubleP: hist(20),
    doubleEligibleDecisions: 0,
    doublerPSum: 0,
    takePSum: 0,
    passPSum: 0,
    minDoubleP: 1,
    maxTakeLossP: 0,
    takenDoublesWonByDoubler: 0,
    takenDoubles: 0,
    gameLength: [],
    winnerCards: [],
    loserCards: [],
    bustCategory: hist(6),
    doublerBustNextSum: 0,
    doublerBustNextHist: hist(20),
  };
  const bin = (p) => Math.min(19, Math.max(0, Math.floor(p * 20)));
  for (let g = 0; g < games; g++) {
    const deck = shuffledDeck(rng);
    const hands = [[deck[0]], [deck[1]]];
    const first = firstDrawer([deck[0], deck[1]]);
    let turn = first;
    let cubeOwner = "center",
      cube = 1,
      takes = 0,
      draws = 0,
      firstDoubleSeen = false,
      lastDoubler = null;
    let winner = null,
      endedBy = null,
      category = -1;
    while (winner == null) {
      const other = 1 - turn;
      const canDouble = cubeOwner === "center" || cubeOwner === turn;
      if (canDouble) {
        const rest = remainingDeck(hands);
        const a = analyzeCube(
          { onTurn: hands[turn], other: hands[other], deck: rest, cube: cubeOwner === "center" ? CUBE.CENTER : CUBE.ON_TURN },
          { rollouts, exactDepth: 2, rng, ply: 1 },
        );
        s.doubleEligibleDecisions++;
        if (a.bestAction === "double") {
          s.doublesOffered++;
          s.byLevel[cube] ??= { offered: 0, taken: 0, passed: 0 };
          s.byLevel[cube].offered++;
          bump(s.doubleAt, draws);
          bump(s.doublerHand, hands[turn].length);
          bump(s.responderHand, hands[other].length);
          s.doublerP[bin(a.winProb)]++;
          s.doublerPSum += a.winProb;
          s.minDoubleP = Math.min(s.minDoubleP, a.winProb);
          s.doublerBustNextSum += a.bustNext;
          s.doublerBustNextHist[bin(a.bustNext)]++;
          if (!firstDoubleSeen) {
            firstDoubleSeen = true;
            s.firstDoubleBy[turn === first ? "first" : "second"]++;
            bump(s.firstDoubleAt, draws);
          }
          const responderP = 1 - a.winProb;
          if (a.responder.best === "take") {
            s.doublesTaken++;
            s.byLevel[cube].taken++;
            s.takeP[bin(responderP)]++;
            s.takePSum += responderP;
            cube *= 2;
            cubeOwner = other;
            takes++;
            lastDoubler = turn;
            s.takenDoubles++;
          } else {
            s.doublesPassed++;
            s.byLevel[cube].passed++;
            s.passP[bin(responderP)]++;
            s.passPSum += responderP;
            s.maxTakeLossP = Math.max(s.maxTakeLossP, responderP);
            winner = turn;
            endedBy = "pass";
            break;
          }
        } else s.noDoubleP[bin(a.winProb)]++;
      }
      // draw
      const rest = remainingDeck(hands);
      const card = rest[Math.floor(rng() * rest.length)];
      hands[turn].push(card);
      draws++;
      category = new Hand(hands[turn]).category();
      if (category >= 0) {
        winner = other;
        endedBy = "bust";
        s.bustCategory[category]++;
        break;
      }
      turn = other;
    }
    s.games++;
    const points = winner === first ? cube : -cube;
    if (winner === first) s.firstWins++;
    s.firstPoints += points;
    s.firstPointsSq += points * points;
    if (endedBy === "bust") s.endedByBust++;
    else s.endedByPass++;
    if (takes > 0) s.cubeTurnedGames++;
    if (takes > 1) s.redoubleGames++;
    s.finalCube[cube] = (s.finalCube[cube] ?? 0) + 1;
    s.pointsDist[points] = (s.pointsDist[points] ?? 0) + 1;
    if (lastDoubler != null && winner === lastDoubler) s.takenDoublesWonByDoubler++;
    bump(s.gameLength, draws);
    bump(s.winnerCards, hands[winner].length);
    bump(s.loserCards, hands[1 - winner].length);
  }
  return s;
}

/* ---------------- cubeless tables ---------------- */
function tableWorker({ games, seed }) {
  const rng = makeRng(seed);
  const out = {};
  for (const n of [2, 3, 4]) {
    const s = {
      games: 0,
      deckOut: 0,
      byOrder: hist(n),
      byRank: hist(13),
      rankCount: hist(13),
      bySeatRank: Array.from({ length: n }, () => hist(13)),
      bySeatRankCount: Array.from({ length: n }, () => hist(13)),
      matrix: n === 2 ? Array.from({ length: 13 }, () => hist(13)) : null,
      matrixCount: n === 2 ? Array.from({ length: 13 }, () => hist(13)) : null,
      gameLength: [],
      winnerCards: [],
      maxHand: [],
      bustCategory: hist(6),
      winnerNeverFive: 0,
      totalBusts: 0,
      busts: hist(n),
      bustOrderFirst: hist(n),
    };
    const hands = Array.from({ length: n }, () => new Hand());
    const alive = new Array(n);
    for (let g = 0; g < games; g++) {
      const deck = shuffledDeck(rng);
      for (let i = 0; i < n; i++) {
        hands[i].truncate(0);
        hands[i].add(deck[i]);
        alive[i] = true;
      }
      const first = firstDrawer(deck.slice(0, n));
      let cur = first,
        count = n,
        m = n,
        draws = 0,
        firstBust = -1;
      while (count > 1 && m < 52) {
        while (!alive[cur]) cur = (cur + 1) % n;
        const c = deck[m++];
        draws++;
        const cat = hands[cur].add(c);
        if (cat >= 0) {
          alive[cur] = false;
          count--;
          s.bustCategory[cat]++;
          s.totalBusts++;
          s.busts[cur]++;
          if (firstBust < 0) firstBust = cur;
        }
        cur = (cur + 1) % n;
      }
      s.games++;
      let share = 1 / count;
      if (count > 1) s.deckOut++;
      let maxHand = 0;
      for (let i = 0; i < n; i++) {
        const order = (i - first + n) % n;
        const r = hands[i].cards[0] >> 2;
        s.rankCount[r]++;
        s.bySeatRankCount[order][r]++;
        maxHand = Math.max(maxHand, hands[i].size);
        if (alive[i]) {
          s.byOrder[order] += share;
          s.byRank[r] += share;
          s.bySeatRank[order][r] += share;
          bump(s.winnerCards, hands[i].size);
          if (hands[i].size < 5) s.winnerNeverFive += share;
        }
      }
      if (firstBust >= 0) s.bustOrderFirst[(firstBust - first + n) % n]++;
      if (n === 2) {
        const a = hands[first].cards[0] >> 2,
          b = hands[1 - first].cards[0] >> 2;
        s.matrixCount[a][b]++;
        if (alive[first]) s.matrix[a][b] += share;
      }
      bump(s.gameLength, draws);
      bump(s.maxHand, maxHand);
    }
    out[n] = s;
  }
  return out;
}

if (!isMainThread) {
  const { mode, ...args } = workerData;
  parentPort.postMessage(mode === "cube" ? cubeWorker(args) : tableWorker(args));
} else {
  const [mode = "cube", ...rest] = process.argv.slice(2);
  const here = new URL(".", import.meta.url);
  const started = Date.now();
  if (mode === "cube") {
    const games = Number(rest[0] ?? 20000);
    const rollouts = Number(rest[1] ?? 1000);
    const threads = Number(rest[2] ?? Math.max(1, os.cpus().length - 2));
    const per = Math.ceil(games / threads);
    const results = await Promise.all(
      Array.from({ length: threads }, (_, i) =>
        new Promise((resolve, reject) => {
          const w = new Worker(new URL(import.meta.url), { workerData: { mode, games: per, rollouts, seed: 1000 + i } });
          w.on("message", resolve);
          w.on("error", reject);
        }),
      ),
    );
    const total = results.reduce((a, b) => merge(a, b), {});
    total.minDoubleP = Math.min(...results.map((r) => r.minDoubleP));
    total.maxTakeLossP = Math.max(...results.map((r) => r.maxTakeLossP));
    const report = {
      schemaVersion: 1,
      generated: new Date().toISOString(),
      policy: `solver 1-ply, ${rollouts} rollouts per child, exact first two draws, ace high, clubs lowest`,
      rollouts,
      seconds: Math.round((Date.now() - started) / 1000),
      ...total,
      categories: CATEGORIES,
    };
    fs.mkdirSync(new URL("../data/", here), { recursive: true });
    fs.writeFileSync(new URL("../data/cube-report.json", here), JSON.stringify(report));
    console.log(`cube report: ${report.games} games in ${report.seconds}s`);
  } else {
    const games = Number(rest[0] ?? 2000000);
    const threads = Number(rest[1] ?? Math.max(1, os.cpus().length - 2));
    const per = Math.ceil(games / threads);
    const results = await Promise.all(
      Array.from({ length: threads }, (_, i) =>
        new Promise((resolve, reject) => {
          const w = new Worker(new URL(import.meta.url), { workerData: { mode, games: per, seed: 5000 + i } });
          w.on("message", resolve);
          w.on("error", reject);
        }),
      ),
    );
    const total = results.reduce((a, b) => merge(a, b), {});
    const report = {
      schemaVersion: 1,
      generated: new Date().toISOString(),
      seconds: Math.round((Date.now() - started) / 1000),
      ranks: RANKS.split(""),
      categories: CATEGORIES,
      players: total,
    };
    fs.mkdirSync(new URL("../data/", here), { recursive: true });
    fs.writeFileSync(new URL("../data/table-report.json", here), JSON.stringify(report));
    console.log(`table report: ${games} games per player count in ${report.seconds}s`);
  }
}
