import { SIMPLE_CYCLES } from "./cycles.mjs";
import { scoreRule, fraction } from "./matchups.mjs";
const letters = ["A", "B", "C"];
const pct = (count) => `${((100 * count) / 1296).toFixed(2)}%`;
const label = (id) =>
  scoreRule(id)
    .name.replace(/\bmax\b/gi, "Highest")
    .replace(/\bmin\b/gi, "Lowest");
const searchText = (text) =>
  text
    .toLowerCase()
    .replace(/\b(max|high)\b/g, "highest")
    .replace(/\b(min|low)\b/g, "lowest");

function diagram(cycle) {
  const positions = [
      [100, 55],
      [420, 55],
      [260, 230],
    ],
    labels = [
      [260, 39],
      [407, 170],
      [112, 170],
    ];
  const paths = [
    "M 138 55 L 378 55",
    "M 408 91 Q 399 190 298 226",
    "M 223 226 Q 122 190 110 98",
  ];
  return `<svg class="cycle-diagram" viewBox="0 0 520 280" role="img" aria-label="${cycle.edges.map((e, i) => `${letters[i]} beats ${letters[(i + 1) % 3]}: ${pct(e.wins)} wins, ${pct(e.ties)} ties, ${pct(e.losses)} losses`).join(". ")}">
    <defs><marker id="cycle-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>
    ${paths.map((path, i) => `<g class="cycle-edge" data-diagram-edge="${i}"><path class="cycle-arc" d="${path}" marker-end="url(#cycle-arrow)"/><text class="cycle-percent" x="${labels[i][0]}" y="${labels[i][1]}" text-anchor="middle">${pct(cycle.edges[i].wins)}</text><text class="cycle-edge-caption" x="${labels[i][0]}" y="${labels[i][1] + 17}" text-anchor="middle">${i === 0 ? "" : "wins"}</text></g>`).join("")}
    ${positions.map(([x, y], i) => `<g><circle cx="${x}" cy="${y}" r="30"/><text class="cycle-node-label" x="${x}" y="${y + 8}" text-anchor="middle">${letters[i]}</text></g>`).join("")}
    <text x="260" y="136" text-anchor="middle" class="cycle-center">A → B → C → A</text>
  </svg>`;
}
export function createCycles(root, { onPlay }) {
  let selected = SIMPLE_CYCLES[0];
  root.innerHTML = `<div class="match-section-head"><div><p class="eyebrow eyebrow--plain">Non-transitive scoring</p><h3>Simple three-rule cycles</h3></div><span class="hint">${SIMPLE_CYCLES.length} examples · exact counts, no simulation</span></div>
    <p class="cycle-intro">A beats B, B beats C, C beats A. Each side rolls its own pair, and each rule keeps the same score adjustment against every opponent.</p>
    <div class="cycle-layout">
      <aside class="cycle-browser" aria-label="Choose a cycle">
        <div class="field field--select cycle-mobile-picker"><label for="cycle-mobile-select">Choose a cycle</label><select id="cycle-mobile-select"></select></div>
        <button id="cycle-filter-toggle" class="btn btn--sm" type="button" aria-expanded="false" aria-controls="cycle-filter-fields">Find or filter cycles</button>
        <div id="cycle-filter-fields" class="cycle-filter-fields"><div class="field"><label for="cycle-search">Find a cycle</label><input id="cycle-search" type="search" placeholder="e.g. sum, highest, product" /></div>
        <div class="field field--select"><label for="cycle-filter">Show</label><select id="cycle-filter"><option value="all">All simple cycles</option><option value="no-ties">No ties</option><option value="majority">Every win chance above 50%</option><option value="whole">Whole-number scores</option><option value="both">No first-die-only rules</option></select></div></div>
        <p id="cycle-count" class="hint" role="status"></p>
        <div id="cycle-list" class="cycle-list"></div>
      </aside>
      <article id="cycle-detail" class="cycle-detail" aria-label="Selected cycle"></article>
    </div>`;
  const $ = (id) => root.querySelector(`#${id}`);
  function renderDetail() {
    const c = selected;
    $("cycle-detail").hidden = !c;
    if (!c) return;
    $("cycle-detail").dataset.cycleId = c.id;
    $("cycle-detail").innerHTML =
      `<header class="cycle-detail-heading"><div><h3 id="cycle-title" tabindex="-1">${c.title}</h3><p class="hint">${c.noTies ? "No ties" : c.majority ? "All three win chances exceed 50%" : "Wins exceed losses on all three edges"} · Smallest win/loss edge: <strong>+${((100 * c.smallestEdge) / 1296).toFixed(2)} percentage points</strong></p></div><div class="cycle-paging"><button class="btn btn--icon btn--sm" type="button" data-cycle-step="-1" aria-label="Previous cycle"><svg class="icon" aria-hidden="true"><use href="../../shared/icons.svg#i-chevron-left" /></svg></button><button class="btn btn--icon btn--sm" type="button" data-cycle-step="1" aria-label="Next cycle"><svg class="icon" aria-hidden="true"><use href="../../shared/icons.svg#i-chevron-right" /></svg></button></div></header>
      <div class="cycle-visual"><figure>${diagram(c)}<figcaption>Arrows point from the favored rule to the rule it beats.<br>Arrow labels show wins per roll, including rolls that tie.</figcaption></figure>
        <ol class="cycle-rules">${c.rules.map((id, i) => `<li><span class="cycle-letter">${letters[i]}</span><div><strong>${label(id)}</strong><small>${scoreRule(id).formula}</small></div></li>`).join("")}</ol>
      </div>
      <p class="cycle-note">${c.note || (c.usesFirst ? "The first die is designated before rolling; its partner is ignored for that rule." : "Sum adds both dice; product multiplies them; average is half the sum. Apply each fixed adjustment after scoring.")}</p>
      <div class="cycle-odds" role="region" aria-label="Exact probabilities and play controls"><table><caption>All 1,296 outcomes · percentages rounded, fractions exact</caption><thead><tr><th scope="col">Matchup</th><th scope="col">Win</th><th scope="col">Tie</th><th scope="col">Loss</th><th scope="col"><span class="sr-only">Play</span></th></tr></thead><tbody>
        ${c.edges.map((e, i) => `<tr data-cycle-edge="${i}"><th scope="row">${letters[i]} → ${letters[(i + 1) % 3]}</th>${["wins", "ties", "losses"].map((key) => `<td class="cycle-${key}"><strong>${pct(e[key])}</strong><span class="match-exact">${fraction(e[key], 1296)}</span><small>${e[key]} / 1296</small></td>`).join("")}<td><button class="btn btn--sm" type="button" data-cycle-play="${i}" aria-label="Play ${letters[i]} versus ${letters[(i + 1) % 3]}: ${label(e.a)} versus ${label(e.b)}">Play <span>${letters[i]} vs ${letters[(i + 1) % 3]}</span></button></td></tr>`).join("")}
      </tbody></table></div>
      <p class="cycle-explanation">${c.noTies ? "Every arrow wins more than half of all rolls." : c.majority ? "Every arrow wins more than half of all rolls, even with ties included." : "“Beats” means more wins than losses. A win chance below 50% still gives an advantage when enough rolls tie."} ${c.smallestEdge < 13 ? "Some edges are very small: a short play session can easily favor the other side." : ""}</p>
      <details class="match-details disclosure"><summary>How these cycles were found</summary><p class="cycle-explanation">We searched highest, lowest, sum, average, product, and a designated first die; multipliers up to three; and quarter-point offsets. These are ${SIMPLE_CYCLES.length} readable examples from a finite search, not every possible cycle. Repeated scaled families are omitted except for the explicitly labeled whole-number and half-point versions. A rule’s offset belongs to that rule in every matchup. Every edge is checked against all 36 × 36 independent ordered rolls. The existing 32-rule catalogue has no cycles without handicaps.</p></details>`;
  }
  function visible() {
    const q = searchText($("cycle-search").value.trim()),
      filter = $("cycle-filter").value;
    return SIMPLE_CYCLES.filter(
      (c) =>
        (!q || searchText(c.searchText).includes(q)) &&
        (filter === "all" ||
          (filter === "no-ties" && c.noTies) ||
          (filter === "majority" && c.majority) ||
          (filter === "whole" && c.wholeNumbers) ||
          (filter === "both" && !c.usesFirst)),
    );
  }
  function renderList() {
    const rows = visible();
    if (!rows.includes(selected)) selected = rows[0];
    $("cycle-mobile-select").innerHTML = rows
      .map(
        (c) =>
          `<option value="${c.id}">${c.title} — ${c.rules.map(label).join(" / ")}</option>`,
      )
      .join("");
    $("cycle-mobile-select").disabled = rows.length === 0;
    $("cycle-mobile-select").value = selected?.id || "";
    $("cycle-count").textContent =
      `${rows.length} of ${SIMPLE_CYCLES.length} cycles`;
    $("cycle-list").innerHTML =
      rows
        .map(
          (c) =>
            `<button type="button" data-cycle-id="${c.id}" aria-pressed="${c === selected}"><span>${c.title}</span><small>${c.rules.map(label).join(" → ")}</small><em>${c.noTies ? "No ties" : c.wholeNumbers ? "Whole numbers" : "Ties possible"} · edge +${((100 * c.smallestEdge) / 1296).toFixed(2)} pp</em></button>`,
        )
        .join("") ||
      '<p class="hint">No cycles match. Try a different rule or filter.</p>';
    renderDetail();
  }
  function select(c, focus = false) {
    selected = c;
    renderList();
    if (focus) $("cycle-title")?.focus({ preventScroll: true });
    const button = root.querySelector(`button[data-cycle-id="${c.id}"]`);
    if (button?.getClientRects().length)
      button.scrollIntoView({ block: "nearest" });
  }
  root.addEventListener("click", (event) => {
    const pick = event.target.closest("button[data-cycle-id]");
    if (pick) select(SIMPLE_CYCLES.find((c) => c.id === pick.dataset.cycleId));
    const step = event.target.closest("[data-cycle-step]");
    if (step && selected) {
      const rows = visible();
      select(
        rows[
          (rows.indexOf(selected) +
            Number(step.dataset.cycleStep) +
            rows.length) %
            rows.length
        ],
        true,
      );
    }
    const play = event.target.closest("[data-cycle-play]");
    if (play && selected) onPlay(selected, Number(play.dataset.cyclePlay));
  });
  for (const type of ["pointerover", "focusin"])
    root.addEventListener(type, (event) => {
      const edge = event.target.closest("[data-cycle-edge]");
      $("cycle-detail").dataset.highlight = edge ? edge.dataset.cycleEdge : "";
    });
  root.addEventListener("pointerleave", () => {
    $("cycle-detail").dataset.highlight = "";
  });
  $("cycle-mobile-select").addEventListener("change", () =>
    select(SIMPLE_CYCLES.find((c) => c.id === $("cycle-mobile-select").value)),
  );
  $("cycle-filter-toggle").addEventListener("click", () => {
    const expanded =
      $("cycle-filter-toggle").getAttribute("aria-expanded") !== "true";
    $("cycle-filter-toggle").setAttribute("aria-expanded", String(expanded));
    root.querySelector(".cycle-browser").dataset.expanded = String(expanded);
  });
  $("cycle-search").addEventListener("input", renderList);
  $("cycle-filter").addEventListener("change", renderList);
  renderList();
  return {
    focus: () => {
      if (selected) $("cycle-title").focus({ preventScroll: true });
    },
  };
}
