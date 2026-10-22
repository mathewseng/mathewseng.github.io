const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { createHash } = require("node:crypto"), { spawn, spawnSync } = require("node:child_process"), { createInterface } = require("node:readline");
const E = require("../engine.js"), S = require("../solver.js");
const source = path.resolve(__dirname, "../solver/hidden-policy.cpp");
const revision = createHash("sha256").update(fs.readFileSync(source)).update(fs.readFileSync(path.resolve(__dirname, "../engine.js"))).update(fs.readFileSync(path.resolve(__dirname, "../solver.js"))).digest("hex");
function compile() {
  const binary = path.join(os.tmpdir(), "scoundrel-hidden-" + revision.slice(0, 16));
  if (!fs.existsSync(binary)) {
    const temporary = binary + "." + process.pid + ".tmp";
    const result = spawnSync(process.env.CXX || "c++", ["-O3", "-std=c++17", source, "-o", temporary], { encoding: "utf8" });
    if (result.error || result.status !== 0) throw Error("Cannot compile hidden-deck solver: " + (result.error?.message || result.stderr));
    fs.renameSync(temporary, binary);
  }
  return binary;
}
function createSolver(binary = compile(), { sharedCache = true } = {}) {
  const child = spawn(binary, [], { env: { ...process.env, SCOUNDREL_PLAN_CACHE: sharedCache ? binary + ".rooms" : "" }, stdio: ["pipe", "pipe", "inherit"] }), output = createInterface({ input: child.stdout });
  let pending = null;
  output.on("line", text => {
    const job = pending; pending = null; if (!job) return;
    try {
      const result = JSON.parse(text);
      const results = E.actions(job.observation).map(action => {
        let move = S.actionMove(job.observation, action);
        if (move === 129 && !result.actions.some(a => a.move === 129)) move = 128;
        const row = result.actions.find(a => a.move === move);
        if (!row || !Number.isFinite(row.score)) throw Error("Missing action estimate");
        return { action, score: row.score, samples: row.samples, exact: row.exact, standardError: row.standardError };
      });
      const best = results.slice().sort((a, b) => b.score - a.score)[0];
      job.resolve({ action: best.action, score: best.score, results, elapsed: result.elapsed, heuristicSkips: result.heuristicSkips });
    } catch (error) { job.reject(error); }
  });
  child.on("error", error => { pending?.reject(error); pending = null; });
  child.on("exit", code => { pending?.reject(Error("Hidden-deck solver exited with code " + code)); pending = null; });
  return {
    analyze(observation, { iterations = 2048 } = {}) {
      if (pending) throw Error("Solver already has an active decision");
      const s = S.pack(observation);
      if (!Number.isInteger(iterations) || iterations < 16) throw Error("Use at least 16 simulations");
      return new Promise((resolve, reject) => {
        pending = { observation, resolve, reject };
        child.stdin.write([iterations, S.seedFor(s), s.h, s.w, s.l, s.p, s.f, s.g, s.r.length, ...s.r, s.u.length, ...s.u, s.b.length, ...s.b].join(" ") + "\n");
      });
    },
    close() { child.stdin.end(); },
    abort() { child.kill(); },
  };
}
module.exports = { compile, createSolver, revision };
