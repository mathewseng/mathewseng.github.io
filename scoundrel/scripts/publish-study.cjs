// Verify an external completed study before copying its immutable shards and
// atomically replacing the report manifest. Publishing to Git is a separate step.
const fs = require("node:fs"), path = require("node:path");
const D = require("./study-data.cjs"), S = require("../reports/statistics.js"), Native = require("./native-solver.cjs");
const input = path.resolve(process.argv[2] || ""), output = path.resolve(__dirname, "../reports/outcomes.json");
if (!process.argv[2] || input === output) throw Error("Provide the external study manifest");
const data = S.validate(JSON.parse(fs.readFileSync(input, "utf8")));
if (data.version !== 4 || data.policy.revision !== Native.revision) throw Error("The study does not match the current solver");
let verified = 0;
for (const row of D.iterateRows(data, input)) { D.verify(row, data.seedPrefix); verified++; }
if (verified !== data.completedDeals) throw Error("Incomplete replay verification");
fs.mkdirSync(path.join(path.dirname(output), data.histories.directory), { recursive: true });
fs.cpSync(path.join(path.dirname(input), data.histories.directory), path.join(path.dirname(output), data.histories.directory), { recursive: true });
D.atomicJSON(output, data);
console.log(JSON.stringify({ verified, ...S.summarize(S.studyRows(data)), revision: data.policy.revision, iterations: data.policy.iterations, output }, null, 2));
