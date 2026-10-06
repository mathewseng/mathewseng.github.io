// SPDX-License-Identifier: GPL-3.0-or-later
// GNUBG_BIN=/path/to/gnubg GNUBG_DATA=/path/to/data node ...
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import createModule from "../engine/vendor/gnubg-core-module.js";
import { createEvaluator } from "../engine/evaluate.mjs";
import { ENGINE_VERSION } from "../engine/metadata.mjs";
import { toXGID } from "../core/xgid.mjs";
const binary = process.env.GNUBG_BIN,
  dataDir = process.env.GNUBG_DATA;
if (!binary || !dataDir)
  throw new Error(
    "Set GNUBG_BIN and GNUBG_DATA to a separately built desktop GNUbg and matching data.",
  );
const root = new URL("../engine/vendor/", import.meta.url),
  data = fs.readFileSync(new URL("gnubg-core-module.data", root));
const module = await createModule({
  wasmBinary: fs.readFileSync(new URL("gnubg-core-module.wasm", root)),
  getPreloadedPackage: () =>
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  print: () => {},
  printErr: () => {},
});
const evaluator = createEvaluator(module),
  cases = [];
const fixtures = JSON.parse(
  fs.readFileSync(new URL("../data/exercises.json", import.meta.url)),
).items;
const work = fs.mkdtempSync(path.join(os.tmpdir(), "bg-native-check-"));
const reference = execFileSync(binary, ["-v"], { encoding: "utf8" }).split(
  "\n",
)[0];
try {
  for (const topic of ["opening", "contact", "race", "bearoff"])
    for (const context of ["money", "match", "mirror"])
      for (const preset of ["quick", "deep"]) {
        let s = structuredClone(fixtures.find((f) => f.topic === topic).state);
        if (context === "match")
          s = { ...s, matchLength: 7, scores: [2, 4], crawford: false };
        if (context === "mirror")
          s = {
            ...s,
            points: [...s.points].reverse().map((n) => -n),
            bar: [...s.bar].reverse(),
            off: [...s.off].reverse(),
            turn: 1 - s.turn,
            cube: {
              ...s.cube,
              owner: s.cube.owner === null ? null : 1 - s.cube.owner,
            },
          };
        const answer = evaluator.analyze(s, preset),
          plies = answer.settings.plies;
        const commands = [
          "set sound enable off",
          "set display off",
          "set output digits 6",
          "set output mwc off",
          `set evaluation chequerplay evaluation plies ${plies}`,
          "set evaluation chequerplay evaluation noise 0",
          "set evaluation chequerplay evaluation prune on",
          "set evaluation movefilter 2 0 -1 0 0",
          "set evaluation movefilter 2 1 -1 0 0",
          `set xgid ${toXGID(s, { engine: true })}`,
          "hint 1",
          "quit",
        ];
        const file = path.join(work, "commands");
        fs.writeFileSync(file, commands.join("\n") + "\n");
        const output = execFileSync(
          binary,
          ["-t", "-q", "-r", "-P", dataDir, "-s", work, "-c", file],
          { encoding: "utf8", timeout: 120000 },
        );
        const match = output.match(
          /\b1\.\s+Cube(?:ful|less)\s+(\d+)-ply\s+(.+?)\s+Eq\.:\s+([+\-\d.]+)/,
        );
        if (!match) throw new Error("Unparsed desktop output: " + output);
        if(Number(match[1])!==plies)throw new Error("Desktop used a shallower depth than requested.");
        const equity = Number(match[3]),
          actual = answer.candidates[0].equity;
        cases.push({
          topic,
          context,
          preset,
          xgid: toXGID(s, { engine: true }),
          desktopMove: match[2].trim(),
          webMove: answer.candidates[0].notation,
          desktopEquity: equity,
          webEquity: actual,
          difference: Math.abs(equity - actual),
        });
        console.log(topic, context, preset, cases.at(-1).difference);
      }
  // Real rollouts: same seeded ISAAC trials, 0-ply policy, variance reduction,
  // ordinary cube rules. Run a single-threaded desktop build (nested asynchronous
  // rollout tasks in the CLI's hint command otherwise deadlock on some hosts).
  for(const context of ["money", "match", "mirror"]) {
    let state=structuredClone(fixtures.find(f=>f.topic==="cube").state);
    if(context==="match")state={...state,matchLength:7,scores:[2,4],crawford:false};
    if(context==="mirror")state={...state,points:[...state.points].reverse().map(n=>-n),bar:[...state.bar].reverse(),off:[...state.off].reverse(),turn:1-state.turn};
    const file=path.join(work,"rollout-commands");
    fs.writeFileSync(file,["set sound enable off","set display off","set output digits 6","set output mwc off","set rollout chequerplay plies 0","set rollout cubedecision plies 0","set rollout cubeful on","set rollout quasirandom off","set rollout varredn on","set rollout truncation enable off","set rollout later enable off","set rollout limit enable off","set rollout jsd stop off","set rollout rng isaac","set rollout seed 452","set rollout trials 32",`set xgid ${toXGID(state,{engine:true})}`,"set evaluation cubedecision type rollout","hint","quit"].join("\n")+"\n");
    const output=execFileSync(binary,["-t","-q","-r","-P",dataDir,"-s",work,"-c",file],{encoding:"utf8",timeout:60000});
    const values=[/No double\s+([+\-\d.]+)/,/Double, take\s+([+\-\d.]+)/,/Double, pass\s+([+\-\d.]+)/].map(re=>{const m=output.match(re);if(!m)throw new Error("Cannot parse native rollout: "+output);return Number(m[1]);});
    const web=evaluator.rolloutBatch(state,null,32,452);
    cases.push({topic:"cube",context,preset:"rollout32",xgid:toXGID(state,{engine:true}),seed:452,desktopOutcomes:values,webOutcomes:web.outcomes,webStandardErrors:web.outcomeSE,difference:Math.max(...values.map((v,i)=>Math.abs(v-web.outcomes[i])))});
    console.log("cube rollout",context,cases.at(-1).difference);
  }
  const tolerance = 0.0001,
    maxDifference = Math.max(...cases.map((c) => c.difference));
  const report = {
    schema: 1,
    recordedAt: new Date().toISOString(),
    engine: ENGINE_VERSION,
    reference,
    referenceSource:
      "https://deb.debian.org/debian/pool/main/g/gnubg/gnubg_1.08.003.orig.tar.gz",
    description:
      "Separate desktop GNUbg 1.08.003 executable compared with the browser binding using matching neural weights, bearoff databases and match-equity data. Money, asymmetric match scores and mirrored players at 0 and 2 ply, plus seeded 32-trial cube rollouts. This checks port/context agreement, not independent-engine strength. Desktop built single-threaded as x86_64 under Rosetta; native timings are not used as a speed comparison.",
    tolerance,
    maxDifference,
    cases,
  };
  fs.writeFileSync(
    "backgammon/data/native-validation.json",
    JSON.stringify(report, null, 2),
  );
  if (maxDifference > tolerance)
    throw new Error(
      `Desktop disagreement ${maxDifference} exceeds ${tolerance}`,
    );
} finally {
  evaluator.shutdown();
  fs.rmSync(work, { recursive: true, force: true });
}
