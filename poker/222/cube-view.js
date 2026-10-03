// Cube panels: the hidden-information equilibrium for a pending decision,
// and the face-up (tabled) analysis.
import { VARIANTS, VARIANT_ORDER, variantOf, actorOn, laterCubeStreets, riverAfter, analyzeDecision, positionValue, flipHist, STREETS } from "./engine.mjs";
import { reraiseName, levelAfter } from "./cube-rules.mjs";
import { el, signed, pct, cubeFace, renderOptionTable, metric, evColor, pctColor } from "./ui.js";
import { nodeOptions, seatOf } from "./table-view.js";

export function ownerLabel(cube, names) {
  return cube.owner == null ? "centered" : names[cube.owner];
}
export function fillVariantSelect(select, value = "fr") {
  select.replaceChildren();
  for (const id of VARIANT_ORDER) {
    const o = el("option", "", VARIANTS[id].name);
    o.value = id;
    select.append(o);
  }
  select.value = VARIANTS[value] ? value : variantOf(value)?.id ?? "fr";
}
export function parseCubeState(value) {
  const [level, owner] = value.split(":");
  return { level: Number(level), owner: owner === "" ? null : Number(owner) };
}
const nodeTitle = (k, names, seat, base) => (k === 0 ? `${names[seat]}: ${base > 1 ? "redouble" : "double"} or not` : `${names[seat]}: reply to the ${k === 1 ? (base > 1 ? "redouble" : "double") : reraiseName(k - 1).toLowerCase()} to ${levelAfter(base, k)}`);

// Panel for the hidden-information model.
export function renderHiddenCubePanel(panel, { faceEl, titleEl, subEl, bodyEl }, view, { names, cube, street, btn, hands, liveNode = null }) {
  faceEl.replaceChildren(cubeFace(cube.level, ownerLabel(cube, names)));
  bodyEl.replaceChildren();
  const known = (seat) => !hands || Boolean(hands[seat]);
  const streetWord = STREETS[street][0].toUpperCase() + STREETS[street].slice(1);
  const d = view?.decision;
  if (!d) {
    const v = view?.action?.variant;
    titleEl.textContent = `${streetWord}: hands hidden, no cube action here`;
    const later = v ? laterCubeStreets(v, STREETS[street]) : [];
    subEl.textContent = !view
      ? "Computing…"
      : later.length
        ? `${v.name}. Seat numbers are against the opponent's ${view.stats?.conditioned ? "range after the earlier cube action" : "full range"}. The next cube decision (${later[0]}) is solved when that street is dealt.`
        : `${v?.name ?? ""}. No cube action remains on later streets.`;
    return;
  }
  const stage = d.stage;
  const actorName = names[d.actor];
  const verb = cube.level > 1 ? "redouble" : "double";
  const n0 = stage.nodes[0];
  const mix = n0.options?.[1]?.prob ?? 0;
  titleEl.textContent = known(d.actor) ? `${streetWord}: ${actorName} to act — equilibrium ${verb}s ${pct(mix, 0)} with this hand` : `${streetWord}: ${actorName} to act (hand unknown)`;
  const sol = d.solve;
  subEl.textContent = `Hidden hands. Equities are for each seat's actual hand against the opponent's equilibrium range, in points at cube ${cube.level}. Across the whole range ${actorName} ${verb}s ${pct(n0.freq.double, 0)} of hands; the reply is drop ${pct(stage.nodes[1]?.freq.drop ?? 0, 0)}, take ${pct(stage.nodes[1]?.freq.take ?? 0, 0)}, ${reraiseName(1).toLowerCase()} ${pct(stage.nodes[1]?.freq.reraise ?? 0, 0)}. Solve: ${sol.sampled.pairs.toLocaleString("en-US")} hand pairs${sol.sampled.flops ? `, ${sol.sampled.flops} flops` : ""}, ${sol.iterations} iterations, exploitability bound ${sol.exploitability.toFixed(3)} pts.`;
  const row = el("div", "cube-stats");
  const valueBtn = stage.value;
  row.append(metric(`${names[btn]} value`, signed(valueBtn), { heat: evColor(valueBtn, 5 * cube.level) }));
  if (known(d.actor)) row.append(metric(`${actorName} ${verb}s`, pct(mix, 0), { heat: pctColor(mix) }));
  row.append(metric("Range doubles", pct(n0.freq.double, 0), { heat: pctColor(n0.freq.double) }), metric("Solve tolerance", `±${sol.tolerance.toFixed(2)} pts`, {}));
  bodyEl.append(row);
  const wrap = el("div", "cube-tables");
  stage.nodes.forEach((node, k) => {
    const seat = seatOf(node.side, btn);
    if (!known(seat)) return;
    if (k > 2 && node.reach < 0.002 && liveNode !== k) return;
    const box = el("div");
    box.append(el("h3", "", nodeTitle(k, names, seat, stage.base)));
    const t = el("div");
    const g = nodeOptions(stage, k);
    renderOptionTable(t, g, { preview: true, level: cube.level, chooser: names[seat], note: `Reached ${pct(node.reach, 1)} of the time` });
    box.append(t);
    wrap.append(box);
  });
  if (!known(d.actor) || !known(d.responder)) bodyEl.append(el("p", "muted small", "Tables are shown only for known hands; the unknown seat is represented by its full range."));
  bodyEl.append(wrap);
}
// Face-up situation: value of the game from here (or the pending decision) with both hands open.
export function cubeSituation({ stats, street, btn, variant, cube }) {
  const v = variantOf(variant);
  if (!stats?.hist) return { actor: null, kind: "none", analysis: null, value0: null, variant: v };
  const hist = stats.hist;
  const streetName = STREETS[street];
  const actor = actorOn(v, streetName, btn, cube);
  const after = actor != null ? riverAfter(v, streetName, btn, cube, actor) : "none";
  let analysis = null;
  if (actor != null) analysis = analyzeDecision({ hist: actor === 0 ? hist : flipHist(hist), level: cube.level, riverAfter: after });
  let value0;
  if (analysis) value0 = actor === 0 ? analysis.value : -analysis.value;
  else {
    const later = laterCubeStreets(v, streetName);
    const ra = later.length === 1 && later[0] === "river" ? actorOn(v, "river", btn, cube) : null;
    value0 = positionValue({ hist, level: cube.level, riverAfter: ra == null ? "none" : ra === 0 ? "actor" : "opponent" });
  }
  return { actor, kind: analysis ? "decision" : "position", analysis, value0, variant: v, later: laterCubeStreets(v, streetName) };
}
export function renderCubePanel(panel, { faceEl, titleEl, subEl, bodyEl }, situation, { names, cube, street, btn }) {
  faceEl.replaceChildren(cubeFace(cube.level, ownerLabel(cube, names)));
  const s = situation;
  const streetWord = STREETS[street][0].toUpperCase() + STREETS[street].slice(1);
  bodyEl.replaceChildren();
  const laterNote = s.later?.length > 1 || (s.later?.length === 1 && s.later[0] !== "river") ? ` Later cube streets (${s.later.join(", ")}) are treated as cubeless in this face-up view.` : "";
  if (!s.analysis) {
    titleEl.textContent = `${streetWord}: no cube action`;
    subEl.textContent = s.value0 == null ? "Computing…" : `Tabled hands. Value of the game from here with both hands open, in points at the current cube.${laterNote}`;
    if (s.value0 != null) {
      const row = el("div", "cube-stats");
      row.append(metric(`${names[0]} value`, signed(s.value0), { heat: evColor(s.value0, 10 * cube.level * 0.5) }), metric(`${names[1]} value`, signed(-s.value0), { heat: evColor(-s.value0, 10 * cube.level * 0.5) }));
      bodyEl.append(row);
    }
    return;
  }
  const a = s.analysis;
  const actorName = names[s.actor];
  const verb = cube.level > 1 ? "redouble" : "double";
  titleEl.textContent = `${streetWord}: ${actorName} to act — face up: ${a.best === "double" ? verb : a.tooGood ? `no ${verb} (too good)` : `no ${verb}`}`;
  subEl.textContent = `Both hands open. Equities are for ${actorName} in points at cube ${cube.level}.${laterNote}`;
  const row = el("div", "cube-stats");
  row.append(
    metric("Cubeless EV", signed(a.cubeless), { heat: evColor(a.cubeless, 5) }),
    metric("Wins", pct(a.winProb), { heat: pctColor(a.winProb) }),
    metric("Value with cube", signed(a.value), { heat: evColor(a.value, 5 * cube.level) }),
    metric(`${verb[0].toUpperCase() + verb.slice(1)} gain`, signed(a.gain), { heat: evColor(a.gain, 2 * cube.level) }),
  );
  bodyEl.append(row);
  const wrap = el("div", "cube-tables");
  a.nodes.forEach((node, k) => {
    if (k > 2) return;
    const seat = node.player === "actor" ? s.actor : 1 - s.actor;
    const box = el("div");
    box.append(el("h3", "", nodeTitle(k, names, seat, cube.level)));
    const t = el("div");
    const g = { options: node.options.map((o) => ({ ...o, ev: o.eq })), best: node.best };
    renderOptionTable(t, g, { preview: true, level: cube.level, chooser: names[seat], faceUp: true });
    box.append(t);
    wrap.append(box);
  });
  bodyEl.append(wrap);
}
