// Cube situation for a two-player table at a given street, and its panel.
import {
  VARIANTS,
  flopActor,
  riverActor,
  riverAfterFlop,
  analyzeDecision,
  positionValue,
  flipHist,
  gradeChoice,
} from "./engine.mjs";
import { el, signed, pct, cubeFace, renderDecisionTable, metric, evColor, pctColor, paint } from "./ui.js";

export function ownerLabel(cube, names) {
  return cube.owner == null ? "centered" : names[cube.owner];
}
// Returns { actor, kind, analysis, value0 } where value0 is the value of the
// remaining game for seat 0 under optimal cube play (points, current cube).
export function cubeSituation({ stats, street, btn, variant, cube }) {
  const v = typeof variant === "string" ? VARIANTS[variant] : variant;
  if (!stats?.hist) return { actor: null, kind: "none", analysis: null, value0: null, variant: v };
  const hist = stats.hist;
  let actor = null,
    riverAfter = "none";
  if (street === 1) {
    actor = flopActor(v, btn, cube);
    riverAfter = riverAfterFlop(v);
  } else if (street === 3) actor = riverActor(v, btn, cube);
  let analysis = null;
  if (actor != null) {
    analysis = analyzeDecision({ hist: actor === 0 ? hist : flipHist(hist), level: cube.level, riverAfter });
  }
  const ra = street >= 3 ? null : riverActor(v, btn, cube);
  const riverAfter0 = ra == null ? "none" : ra === 0 ? "actor" : "opponent";
  let value0;
  if (analysis) value0 = actor === 0 ? analysis.value : -analysis.value;
  else value0 = positionValue({ hist, level: cube.level, riverAfter: riverAfter0 });
  return { actor, kind: analysis ? "decision" : "position", analysis, value0, variant: v, riverAfter };
}
export function renderCubePanel(panel, { faceEl, titleEl, subEl, bodyEl }, situation, { names, cube, street, btn }) {
  faceEl.replaceChildren(cubeFace(cube.level, ownerLabel(cube, names)));
  const s = situation;
  const streetWord = ["Preflop", "Flop", "Turn", "River"][street];
  bodyEl.replaceChildren();
  if (!s.analysis) {
    titleEl.textContent = `${streetWord}: no cube action`;
    const ra = street >= 3 ? null : riverActor(s.variant, btn, cube);
    subEl.textContent =
      s.value0 == null
        ? "Computing…"
        : ra != null
          ? `${names[ra]} can ${cube.owner != null ? "redouble" : "double"} on the river. Value of the game from here under optimal cube play, in points at the current cube.`
          : `${s.variant.name}: no cube action remains. Value of the game from here, in points at the current cube.`;
    if (s.value0 != null) {
      const row = el("div", "cube-stats");
      row.append(
        metric(`${names[0]} value`, signed(s.value0), { heat: evColor(s.value0, 10 * cube.level * 0.5) }),
        metric(`${names[1]} value`, signed(-s.value0), { heat: evColor(-s.value0, 10 * cube.level * 0.5) }),
      );
      bodyEl.append(row);
    }
    return;
  }
  const a = s.analysis;
  const actorName = names[s.actor],
    other = names[1 - s.actor];
  const verb = cube.level > 1 ? "redouble" : "double";
  titleEl.textContent = `${streetWord}: ${actorName} to act — ${a.best === "double" ? `${verb}` : a.tooGood ? `no ${verb} (too good)` : `no ${verb}`}`;
  subEl.textContent = `${s.variant.name}. Equities are for ${actorName} in points at cube ${cube.level}. ${a.best === "double" ? `${other} should ${a.response}${a.response === "beaver" ? `, and ${actorName} should then ${a.beaverReply}` : ""}.` : ""}`;
  const row = el("div", "cube-stats");
  row.append(
    metric("Cubeless EV", signed(a.cubeless), { heat: evColor(a.cubeless, 5) }),
    metric("Wins", pct(a.winProb), { heat: pctColor(a.winProb) }),
    metric("Value with cube", signed(a.value), { heat: evColor(a.value, 5 * cube.level) }),
    metric(`${verb[0].toUpperCase() + verb.slice(1)} gain`, signed(a.gain), { heat: evColor(a.gain, 2 * cube.level) }),
  );
  bodyEl.append(row);
  const wrap = el("div", "cube-tables");
  const d1 = el("div");
  d1.append(el("h3", "", `${actorName}: ${verb} or not`));
  const t1 = el("div");
  renderDecisionTable(t1, a, "double", gradeChoice(a, "double", null), { level: cube.level, preview: true });
  d1.append(t1);
  const d2 = el("div");
  d2.append(el("h3", "", `${other}: reply to a ${verb}`));
  const t2 = el("div");
  renderDecisionTable(t2, a, "response", gradeChoice(a, "response", null), { level: cube.level, preview: true });
  d2.append(t2);
  wrap.append(d1, d2);
  bodyEl.append(wrap);
}
export function fillVariantSelect(select, value = "both") {
  select.replaceChildren();
  for (const v of Object.values(VARIANTS)) {
    const o = el("option", "", v.name);
    o.value = v.id;
    select.append(o);
  }
  select.value = value;
}
export function parseCubeState(value) {
  const [level, owner] = value.split(":");
  return { level: Number(level), owner: owner === "" ? null : Number(owner) };
}
export const paintValue = paint;
