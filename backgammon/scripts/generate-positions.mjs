import { writeFileSync } from "node:fs";
import {
  initialState,
  transition,
  legalTurns,
  seededDice,
  clone,
} from "../core/rules.mjs";
import { fromXGID } from "../core/xgid.mjs";
const items = [];
for (let a = 2; a <= 6; a++)
  for (let b = 1; b < a; b++)
    items.push({
      id: `opening-${a}${b}`,
      topic: "opening",
      state: initialState({ phase: "move", dice: [a, b], matchLength: 0 }),
      provenance: { kind: "standard opening roll", dice: [a, b] },
      reviewStatus: "Engine evaluated; not expert annotated",
    });
const quotas = { contact: 6, race: 5, bearoff: 5 };
for (
  let seed = 1;
  seed <= 20 && Object.values(quotas).some((n) => n > 0);
  seed++
) {
  let s = initialState({ matchLength: 0 }),
    events = [],
    dice = seededDice(seed);
  for (let turn = 0; turn < 900 && s.phase !== "over"; turn++) {
    if (s.phase === "move") {
      const ivory = s.points.flatMap((v, i) => (v > 0 ? [i] : [])),
        teal = s.points.flatMap((v, i) => (v < 0 ? [i] : []));
      const race =
          !s.bar.some(Boolean) && Math.max(...ivory) < Math.min(...teal),
        bearoff =
          race && ivory.every((i) => i < 6) && teal.every((i) => i > 17);
      const topic = bearoff ? "bearoff" : race ? "race" : "contact";
      if (
        turn > 8 &&
        quotas[topic] > 0 &&
        legalTurns(s).length > 1 &&
        (turn % 7 === 0 || bearoff)
      ) {
        items.push({
          id: `${topic}-${seed}-${turn}`,
          topic,
          state: clone(s),
          provenance: {
            kind: "legal seeded replay",
            seed,
            events: clone(events),
          },
          reviewStatus: "Engine evaluated; not expert annotated",
        });
        quotas[topic]--;
      }
    }
    const action =
      s.phase === "move"
        ? {
            type: "move",
            steps: legalTurns(s)[(seed + turn) % legalTurns(s).length].steps,
          }
        : { type: s.phase === "opening" ? "opening" : "roll", dice: dice() };
    events.push({ actor: s.turn, action });
    s = transition(s, action);
  }
}
for (const [i, xgid] of [
  "XGID=aa--BBBB----dE---d-e----B-:0:0:1:00:0:0:0:0:10",
  "XGID=aBaB--C-A---dE--ac-e----B-:0:0:1:00:0:0:0:0:10",
  "XGID=aa--BBBB----dE---d-e----B-:0:0:1:D:0:0:0:0:10",
].entries())
  items.push({
    id: `cube-${i}`,
    topic: "cube",
    state: fromXGID(xgid),
    provenance: {
      kind: "upstream public API fixture",
      source:
        "https://github.com/ascottix/gnubg-core/blob/955555c69adebb1d7de23abc1018074158621168/README.md",
    },
    reviewStatus: "Engine evaluated; not expert annotated",
  });
writeFileSync(
  new URL("../data/exercises.json", import.meta.url),
  JSON.stringify({ version: 1, items }),
);
console.log(items.length, "valid positions", quotas);
